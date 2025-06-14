const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { Client } = require('@line/bot-sdk');
const LangAI = require('./libs/langAI');
const LoadingManager = require('./libs/loadingManager');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { collection, query, where, getDocs, documentId, orderBy, limit } = require('firebase-admin/firestore');

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({
  region: 'asia-southeast1',
  memory: '2GiB',
  timeoutSeconds: 540,
  cpu: 2
});

// --- LINE & AI Secrets ---
const lineChannelSecret = defineSecret('LINE_CHANNEL_SECRET');
const lineChannelAccessToken = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const openWeatherApiKey = defineSecret('OPENWEATHER_API_KEY');
const adminUserId = defineSecret('ADMIN_USER_ID');
const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');

// --- Web App Config Secrets ---
const webApiKey = defineSecret('WEB_API_KEY');
const webAuthDomain = defineSecret('WEB_AUTH_DOMAIN');
const webProjectId = defineSecret('WEB_PROJECT_ID');
const webStorageBucket = defineSecret('WEB_STORAGE_BUCKET');
const webMessagingSenderId = defineSecret('WEB_MESSAGING_SENDER_ID');
const webAppId = defineSecret('WEB_APP_ID');
const webMeasurementId = defineSecret('WEB_MEASUREMENT_ID');


const usedReplyTokens = new Set();
const processedEvents = new Set();

const authenticate = async (req, res, next) => {
  const sessionCookie = req.cookies?.__session || '';
  if (!sessionCookie) return res.redirect(302, '/login');
  try {
    req.user = await admin.auth().verifySessionCookie(sessionCookie, true);
    return next();
  } catch (error) {
    return res.redirect(302, '/login');
  }
};

// =================================================================
//  ✅ Cloud Functions Definitions
// =================================================================

exports.webhook = onRequest({
  concurrency: 80,
  secrets: [lineChannelSecret, lineChannelAccessToken, geminiApiKey, openWeatherApiKey, adminUserId, youtubeApiKey],
}, async (req, res) => {
  const startTime = Date.now();
  try {
    const config = { channelSecret: lineChannelSecret.value(), channelAccessToken: lineChannelAccessToken.value() };
    const client = new Client(config);
    const langAI = new LangAI(adminUserId.value(), youtubeApiKey.value());
    const loadingManager = new LoadingManager(client);
    const events = req.body.events || [];

    await Promise.all(events.map(event => {
      const eventId = `${event.replyToken || event.source.userId}_${event.timestamp}`;
      if (processedEvents.has(eventId)) return Promise.resolve();
      processedEvents.add(eventId);
      setTimeout(() => processedEvents.delete(eventId), 300000);
      if (event.replyToken && usedReplyTokens.has(event.replyToken)) return Promise.resolve();
      if (Date.now() - startTime > 55000) return handleWithPushMessage(event, client, langAI);
      if (event.type === 'message') return handleMessage(event, client, langAI, loadingManager);
      if (event.type === 'postback') return handlePostback(event, client, langAI, loadingManager);
      return Promise.resolve();
    }));
    res.status(200).send('OK');
  } catch (error) {
    console.error('💥 Webhook error:', error.stack || error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

exports.dashboard = onRequest({ secrets: [] }, (req, res) => {
  const handler = (req, res) => {
    try {
      const dashboardPath = path.join(__dirname, 'dashboard.html');
      res.status(200).send(fs.readFileSync(dashboardPath, 'utf8'));
    } catch (error) { res.status(500).send("Error loading dashboard."); }
  };
  cookieParser()(req, res, () => authenticate(req, res, () => handler(req, res)));
});

exports.login = onRequest({ secrets: [] }, (req, res) => {
  try {
    const loginPath = path.join(__dirname, 'login.html');
    res.status(200).send(fs.readFileSync(loginPath, 'utf8'));
  } catch (error) { res.status(500).send("Error loading login page."); }
});

exports.sessionLogin = onRequest({ secrets: [] }, async (req, res) => {
  const idToken = req.body.idToken?.toString();
  if (!idToken) return res.status(400).send('ID token is required.');
  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
  try {
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
    res.cookie('__session', sessionCookie, { maxAge: expiresIn, httpOnly: true, secure: true, sameSite: 'strict' });
    res.status(200).json({ status: 'success' });
  } catch (error) { res.status(401).send('UNAUTHORIZED REQUEST!'); }
});

exports.sessionLogout = onRequest({ secrets: [] }, (req, res) => {
  res.clearCookie('__session');
  res.redirect('/login');
});

exports.getFirebaseConfig = onRequest({
  secrets: [webApiKey, webAuthDomain, webProjectId, webStorageBucket, webMessagingSenderId, webAppId, webMeasurementId]
}, (req, res) => {
  try {
    res.status(200).json({
      apiKey: webApiKey.value(),
      authDomain: webAuthDomain.value(),
      projectId: webProjectId.value(),
      storageBucket: webStorageBucket.value(),
      messagingSenderId: webMessagingSenderId.value(),
      appId: webAppId.value(),
      measurementId: webMeasurementId.value()
    });
  } catch (error) {
    console.error("Error building Firebase config from Secrets:", error);
    res.status(500).send("Error getting app configuration.");
  }
});

exports.getStats = onRequest({ secrets: [] }, (req, res) => {
  const handler = async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate are required.' });

      const q = query(
        db.collection('daily_stats'),
        where(admin.firestore.FieldPath.documentId(), '>=', startDate),
        where(admin.firestore.FieldPath.documentId(), '<=', endDate)
      );
      const snapshot = await q.get();

      const aggregatedStats = {
        totalLineEvents: 0, totalGeminiHits: 0,
        processing: { textProcessing: 0, imageProcessing: 0, audioProcessing: 0, videoProcessing: 0, fileProcessing: 0, locationProcessing: 0, youtubeProcessing: 0, errors: 0 },
        dailyActivity: {}
      };

      snapshot.forEach(doc => {
        const data = doc.data();
        const dateId = doc.id;
        if (!aggregatedStats.dailyActivity[dateId]) {
          aggregatedStats.dailyActivity[dateId] = { lineOaEvents: 0, geminiApiHits: 0 };
        }
        aggregatedStats.dailyActivity[dateId].lineOaEvents += data.lineOaEvents || 0;
        aggregatedStats.dailyActivity[dateId].geminiApiHits += data.geminiApiHits || 0;

        aggregatedStats.totalLineEvents += data.lineOaEvents || 0;
        aggregatedStats.totalGeminiHits += data.geminiApiHits || 0;
        for (const key in aggregatedStats.processing) {
          if (data[key]) aggregatedStats.processing[key] += data[key];
        }
      });
      res.status(200).json(aggregatedStats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: 'Failed to get stats.' });
    }
  };
  cookieParser()(req, res, () => authenticate(req, res, () => handler(req, res)));
});


exports.blockUser = onRequest({ secrets: [] }, (req, res) => {
  const handler = async (req, res) => {
    try {
      const { userId, isBlocked } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const statusRef = db.collection('users').doc(userId).collection('status').doc('block');
      await statusRef.set({ isBlocked: isBlocked, timestamp: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).json({ success: true, message: `User ${userId} status set to blocked: ${isBlocked}` });
    } catch (error) {
      console.error("Error blocking user:", error);
      res.status(500).json({ error: 'Failed to block user.' });
    }
  };
  cookieParser()(req, res, () => authenticate(req, res, () => handler(req, res)));
});


exports.sendBroadcast = onRequest({ secrets: [lineChannelAccessToken] }, (req, res) => {
  const handler = async (req, res) => {
    const { message } = req.body;
    if (!message || message.trim() === '') return res.status(400).json({ error: 'Message cannot be empty.' });

    const client = new Client({ channelAccessToken: lineChannelAccessToken.value() });
    try {
      await client.broadcast([{ type: 'text', text: message }]);
      res.status(200).json({ success: true, message: `Broadcast sent.` });
    } catch (error) {
      console.error("Error sending broadcast:", error.originalError.response.data);
      res.status(500).json({ error: 'Failed to send broadcast.' });
    }
  };
  cookieParser()(req, res, () => authenticate(req, res, () => handler(req, res)));
});

exports.getErrors = onRequest({ secrets: [] }, (req, res) => {
    const handler = async (req, res) => {
        try {
            const errorsQuery = db.collection('errors').orderBy('timestamp', 'desc').limit(50);
            const snapshot = await errorsQuery.get();

            const errors = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, timestamp: doc.data().timestamp.toDate().toISOString() }));
            res.status(200).json(errors);
        } catch (error) {
            console.error("Error fetching errors:", error);
            res.status(500).json({ error: 'Failed to get errors.' });
        }
    };
    cookieParser()(req, res, () => authenticate(req, res, () => handler(req, res)));
});


exports.health = onRequest({ secrets: [] }, (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// =================================================================
//  ✅ Helper Functions
// =================================================================
async function handleMessage(event, client, langAI, loadingManager) {
  const { type: messageType, id: messageId } = event.message;
  const userId = event.source.userId;
  try {
    await loadingManager.startProcessing(userId, messageType);
    let response;
    switch (messageType) {
      case 'text': response = await langAI.processTextMessage(event.message.text, userId, client); break;
      case 'image': response = await langAI.processImageMessage(await streamToBuffer(await client.getMessageContent(messageId)), userId, client); break;
      case 'audio': response = await langAI.processAudioMessage(await streamToBuffer(await client.getMessageContent(messageId)), userId, client); break;
      case 'video': response = await langAI.processVideoMessage(await streamToBuffer(await client.getMessageContent(messageId)), userId, client); break;
      case 'file': response = await langAI.processFileMessage(await streamToBuffer(await client.getMessageContent(messageId)), event.message.fileName, userId, client); break;
      case 'location': response = await langAI.processLocationMessage(event.message.latitude, event.message.longitude, event.message.address, userId, client); break;
      default: response = { type: 'text', text: '🤖 ขออภัยครับ เล้งยังไม่รองรับข้อความประเภทนี้' };
    }
    await sendSafeResponse(event, client, response);
  } catch (error) {
    await handleErrorWithFallback(event, client, userId, error, langAI);
  } finally {
    loadingManager.stopProcessing(userId);
  }
}

async function handlePostback(event, client, langAI, loadingManager) {
  const userId = event.source.userId;
  try {
    await loadingManager.startProcessing(userId, 'text');
    const response = await langAI.processPostback(event.postback.data, userId, client);
    await sendSafeResponse(event, client, response);
  } catch (error) {
    await handleErrorWithFallback(event, client, userId, error, langAI);
  } finally {
    loadingManager.stopProcessing(userId);
  }
}

async function sendSafeResponse(event, client, response) {
  if (!response) {
    console.error("Attempted to send an empty response.");
    return;
  }
  const messages = (Array.isArray(response) ? response : [response]).map(validateAndCleanResponse);
  try {
    if (event.replyToken && !usedReplyTokens.has(event.replyToken)) {
      usedReplyTokens.add(event.replyToken);
      setTimeout(() => usedReplyTokens.delete(event.replyToken), 2 * 60 * 1000);
      await client.replyMessage(event.replyToken, messages);
    } else {
      await client.pushMessage(event.source.userId, messages);
    }
  } catch (error) {
    console.error(`Failed to send message: ${error.message}`);
    if (error.originalError?.response?.data) {
      console.error("LINE API Error:", error.originalError.response.data);
    }
    // Fallback to push message if reply fails for other reasons
    await client.pushMessage(event.source.userId, messages).catch(pushError => {
      console.error(`Fallback push message also failed: ${pushError.message}`);
    });
  }
}

function validateAndCleanResponse(response) {
  if (!response || typeof response !== 'object') return { type: 'text', text: '🔧 เกิดข้อผิดพลาด' };
  if (response.type === 'text' && typeof response.text === 'string') response.text = response.text.substring(0, 4999);
  if (response.type === 'flex' && typeof response.altText === 'string') response.altText = response.altText.substring(0, 399);
  return response;
}

async function handleErrorWithFallback(event, client, userId, originalError, langAI) {
  console.error('Original error:', originalError.message, originalError.stack);
  if (langAI) await langAI.logError(originalError, { userId, event });

  try {
    await sendSafeResponse(event, client, { type: 'text', text: '🔧 ขออภัยครับ เกิดข้อผิดพลาดในการประมวลผล โปรดลองอีกครั้ง' });
  } catch (fallbackError) {
    console.error('Fallback error message failed:', fallbackError.message);
  }
}

async function handleWithPushMessage(event, client, langAI) {
  try {
    const userId = event.source.userId;
    let response;
    if (event.type === 'message' && event.message.type === 'text') {
      response = await langAI.processTextMessage(event.message.text, userId, client);
    } else if (event.type === 'postback') {
      response = await langAI.processPostback(event.postback.data, userId, client);
    } else {
      response = { type: 'text', text: '⏰ การประมวลผลใช้เวลานานเกินไป กรุณาลองอีกครั้ง' };
    }
    await client.pushMessage(userId, Array.isArray(response) ? response.map(validateAndCleanResponse) : [validateAndCleanResponse(response)]);
  } catch (error) {
    console.error('💥 Push message error:', error.stack || error);
    if (langAI) await langAI.logError(error, { location: 'handleWithPushMessage' });
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}