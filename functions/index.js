const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { Client } = require('@line/bot-sdk');
const LangAI = require('./libs/langAI');
const LoadingManager = require('./libs/loadingManager');

admin.initializeApp();

setGlobalOptions({ 
  region: 'asia-southeast1',
  memory: '2GiB',
  timeoutSeconds: 30 // เพิ่ม timeout เล็กน้อยเผื่อ API response ช้า
});

const lineChannelSecret = defineSecret('LINE_CHANNEL_SECRET');
const lineChannelAccessToken = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const openWeatherApiKey = defineSecret('OPENWEATHER_API_KEY');

const usedReplyTokens = new Set();
const processedEvents = new Set();

exports.webhook = onRequest({
  concurrency: 80,
  secrets: [lineChannelSecret, lineChannelAccessToken, geminiApiKey, openWeatherApiKey],
  timeoutSeconds: 30
}, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const config = {
      channelSecret: lineChannelSecret.value(),
      channelAccessToken: lineChannelAccessToken.value()
    };

    const client = new Client(config);
    const langAI = new LangAI();
    const loadingManager = new LoadingManager(client);

    const events = req.body.events || [];
    
    // ใช้ Promise.all เพื่อประมวลผล event พร้อมกัน
    await Promise.all(events.map(event => {
      const eventId = `${event.replyToken || event.source.userId}_${event.timestamp}`;
      
      if (processedEvents.has(eventId)) {
        console.log(`⚠️ Duplicate event detected, skipping: ${eventId}`);
        return Promise.resolve();
      }
      processedEvents.add(eventId);
      setTimeout(() => processedEvents.delete(eventId), 5 * 60 * 1000); // clear after 5 mins

      if (event.replyToken && usedReplyTokens.has(event.replyToken)) {
        console.log(`⚠️ Reply token already used, skipping: ${event.replyToken}`);
        return Promise.resolve();
      }
      
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > 25000) { // ลดเวลาเช็ค push message
        console.log('⏰ Timeout approaching, using push message');
        return handleWithPushMessage(event, client, langAI);
      }
      
      if (event.type === 'message') {
        return handleMessage(event, client, langAI, loadingManager, startTime);
      } else if (event.type === 'postback') {
        // [FIX] แก้ไข: ส่ง loadingManager ไปยัง handlePostback
        return handlePostback(event, client, langAI, loadingManager, startTime);
      }
      return Promise.resolve();
    }));
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('💥 Webhook error:', error.stack || error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleMessage(event, client, langAI, loadingManager, startTime) {
  const messageType = event.message.type;
  const userId = event.source.userId;
  
  try {
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > 23000) { // ลดเวลาเช็ค
      return handleWithPushMessage(event, client, langAI);
    }
    
    // เริ่ม loading animation
    await loadingManager.startProcessing(userId, messageType);

    let response;
    switch (messageType) {
      case 'text':
        response = await langAI.processTextMessage(event.message.text, userId);
        break;
      case 'image':
        const imgBuffer = await streamToBuffer(await client.getMessageContent(event.message.id));
        response = await langAI.processImageMessage(imgBuffer, userId);
        break;
      case 'audio':
        const audioBuffer = await streamToBuffer(await client.getMessageContent(event.message.id));
        response = await langAI.processAudioMessage(audioBuffer, userId);
        break;
      case 'video':
         const videoBuffer = await streamToBuffer(await client.getMessageContent(event.message.id));
         response = await langAI.processVideoMessage(videoBuffer, userId);
         break;
      case 'file':
        const fileBuffer = await streamToBuffer(await client.getMessageContent(event.message.id));
        response = await langAI.processFileMessage(fileBuffer, event.message.fileName, userId);
        break;
      case 'location':
        const { latitude, longitude, address } = event.message;
        response = await langAI.processLocationMessage(latitude, longitude, address, userId);
        break;
      default:
        response = { type: 'text', text: '🤖 ขออภัยครับ เล้งยังไม่รองรับข้อความประเภทนี้' };
    }

    await sendSafeResponse(event, client, response);

  } catch (error) {
    console.error(`💥 Error handling ${messageType}:`, error.stack || error);
    await handleErrorWithFallback(event, client, userId, error);
  } finally {
    // หยุด loading animation
    loadingManager.stopProcessing(userId);
  }
}


// [FIX] แก้ไข: เพิ่ม loadingManager ในพารามิเตอร์
async function handlePostback(event, client, langAI, loadingManager, startTime) {
  const userId = event.source.userId;
  const postbackData = event.postback.data;
  
  try {
    console.log(`🔄 Postback: ${postbackData} from ${userId}`);
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > 23000) {
      return handleWithPushMessage(event, client, langAI);
    }
    
    await loadingManager.startProcessing(userId, 'text'); // show loading for postback
    
    const response = await langAI.processPostback(postbackData, userId);
    await sendSafeResponse(event, client, response);

  } catch (error) {
    console.error('💥 Postback error:', error.stack || error);
    await handleErrorWithFallback(event, client, userId, error);
  } finally {
      loadingManager.stopProcessing(userId);
  }
}

async function sendSafeResponse(event, client, response) {
  try {
    if (event.replyToken) {
      if (usedReplyTokens.has(event.replyToken)) {
        console.log(`⚠️ Reply token ${event.replyToken} already used, sending push message instead.`);
        const messages = Array.isArray(response) ? response : [response];
        await client.pushMessage(event.source.userId, messages.map(msg => validateAndCleanResponse(msg)));
        return;
      }
      usedReplyTokens.add(event.replyToken);
      setTimeout(() => usedReplyTokens.delete(event.replyToken), 2 * 60 * 1000); // 2 minutes
    }
    
    const messages = Array.isArray(response) ? response : [response];
    const validatedMessages = messages.map(msg => validateAndCleanResponse(msg));
    
    await client.replyMessage(event.replyToken, validatedMessages);
    
  } catch (error) {
    console.error('💥 Error sending response:', error.response ? error.response.data : error);
    if (error.response?.data?.message.includes('Invalid reply token')) {
       console.log('Reply token invalid, attempting push message.');
       const messages = Array.isArray(response) ? response : [response];
       await client.pushMessage(event.source.userId, messages.map(msg => validateAndCleanResponse(msg)));
    }
  }
}

function validateAndCleanResponse(response) {
  if (!response || typeof response !== 'object') {
    return { type: 'text', text: '🔧 ขออภัยครับ เกิดข้อผิดพลาด' };
  }
  // Sanitize text messages
  if (response.type === 'text' && response.text) {
    response.text = response.text.substring(0, 4999);
  }
  // Validate flex messages
  if (response.type === 'flex') {
    if(!response.altText) response.altText = 'ข้อมูล Flex Message';
    response.altText = response.altText.substring(0, 399);
  }
  return response;
}

async function handleErrorWithFallback(event, client, userId, originalError) {
  console.error('Original error:', originalError.message);
  const errorMessage = { type: 'text', text: '🔧 ขออภัยครับ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' };
  try {
    await sendSafeResponse(event, client, errorMessage);
  } catch (fallbackError) {
    console.error('💥 Fallback reply failed:', fallbackError.message);
    try {
        await client.pushMessage(userId, errorMessage);
    } catch (pushError) {
        console.error('💥 All fallback methods failed:', pushError.message);
    }
  }
}

async function handleWithPushMessage(event, client, langAI) {
  try {
    const userId = event.source.userId;
    let response;
    // Process only text message on timeout push for simplicity
    if (event.type === 'message' && event.message.type === 'text') {
      response = await langAI.processTextMessage(event.message.text, userId);
    } else if (event.type === 'postback') {
      response = await langAI.processPostback(event.postback.data, userId);
    }
    else {
      response = { type: 'text', text: '⏰ การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง' };
    }
    
    const messages = Array.isArray(response) ? response : [response];
    await client.pushMessage(userId, messages.map(msg => validateAndCleanResponse(msg)));
    
  } catch (error) {
    console.error('💥 Push message error:', error.stack || error);
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    setTimeout(() => reject(new Error('Stream timeout after 30 seconds')), 30000);
  });
}

// Health check endpoint
exports.health = onRequest((req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});
