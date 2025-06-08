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
  timeoutSeconds: 25
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
  timeoutSeconds: 25
}, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🔥 Webhook received at:', new Date().toISOString());

    const config = {
      channelSecret: lineChannelSecret.value(),
      channelAccessToken: lineChannelAccessToken.value()
    };

    const client = new Client(config);
    const langAI = new LangAI();
    const loadingManager = new LoadingManager(client);

    const events = req.body.events || [];
    
    for (const event of events) {
      const eventId = `${event.replyToken}_${event.timestamp}`;
      
      if (processedEvents.has(eventId)) {
        console.log('⚠️ Duplicate event detected, skipping');
        continue;
      }
      
      processedEvents.add(eventId);
      setTimeout(() => processedEvents.delete(eventId), 5 * 60 * 1000);
      
      if (event.replyToken && usedReplyTokens.has(event.replyToken)) {
        console.log('⚠️ Reply token already used, skipping');
        continue;
      }
      
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > 20000) {
        console.log('⏰ Timeout approaching, using push message');
        await handleWithPushMessage(event, client, langAI);
        break;
      }
      
      if (event.type === 'message') {
        await handleMessage(event, client, langAI, loadingManager, startTime);
      } else if (event.type === 'postback') {
        await handlePostback(event, client, langAI, startTime);
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('💥 Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleMessage(event, client, langAI, loadingManager, startTime) {
  const messageType = event.message.type;
  const userId = event.source.userId;
  
  try {
    console.log(`📨 Processing ${messageType} from ${userId}`);
    
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > 18000) {
      await handleWithPushMessage(event, client, langAI);
      return;
    }
    
    switch (messageType) {
      case 'text':
        await handleTextMessage(event, client, langAI, loadingManager);
        break;
      case 'image':
        await handleImageMessage(event, client, langAI, loadingManager);
        break;
      case 'audio':
        await handleAudioMessage(event, client, langAI, loadingManager);
        break;
      case 'video':
        await handleVideoMessage(event, client, langAI, loadingManager);
        break;
      case 'file':
        await handleFileMessage(event, client, langAI, loadingManager);
        break;
      case 'location':
        await handleLocationMessage(event, client, langAI, loadingManager);
        break;
      default:
        await sendSafeResponse(event, client, {
          type: 'text',
          text: '🤖 ขออภัยครับ เล้งยังไม่รองรับข้อความประเภทนี้'
        });
    }
  } catch (error) {
    console.error(`💥 Error handling ${messageType}:`, error);
    await handleErrorWithFallback(event, client, userId, error);
  }
}

async function handleTextMessage(event, client, langAI, loadingManager) {
  const userId = event.source.userId;
  const userMessage = event.message.text;
  
  try {
    await loadingManager.startProcessing(userId, 'text');
    
    const response = await langAI.processTextMessage(userMessage, userId);
    
    await sendSafeResponse(event, client, response);
    loadingManager.stopProcessing(userId);
    
  } catch (error) {
    loadingManager.stopProcessing(userId);
    console.error('💥 Text processing error:', error);
    await handleErrorWithFallback(event, client, userId, error);
  }
}

async function handleImageMessage(event, client, langAI, loadingManager) {
  const userId = event.source.userId;
  
  try {
    await loadingManager.startProcessing(userId, 'image');
    
    const messageContent = await client.getMessageContent(event.message.id);
    const buffer = await streamToBuffer(messageContent);
    
    const response = await langAI.processImageMessage(buffer, userId);
    
    await sendSafeResponse(event, client, response);
    loadingManager.stopProcessing(userId);
    
  } catch (error) {
    loadingManager.stopProcessing(userId);
    await sendSafeResponse(event, client, {
      type: 'text',
      text: `🖼️ ขออภัยครับ เล้งไม่สามารถวิเคราะห์รูปภาพได้: ${error.message}`
    });
  }
}

async function handleAudioMessage(event, client, langAI, loadingManager) {
  const userId = event.source.userId;
  
  try {
    await loadingManager.startProcessing(userId, 'audio');
    
    const messageContent = await client.getMessageContent(event.message.id);
    const buffer = await streamToBuffer(messageContent);
    
    const response = await langAI.processAudioMessage(buffer, userId);
    
    await sendSafeResponse(event, client, response);
    loadingManager.stopProcessing(userId);
    
  } catch (error) {
    loadingManager.stopProcessing(userId);
    await sendSafeResponse(event, client, {
      type: 'text',
      text: `🎵 ขออภัยครับ เล้งไม่สามารถประมวลผลเสียงได้: ${error.message}`
    });
  }
}

async function handleVideoMessage(event, client, langAI, loadingManager) {
  const userId = event.source.userId;
  
  try {
    await loadingManager.startProcessing(userId, 'video');
    
    const messageContent = await client.getMessageContent(event.message.id);
    const buffer = await streamToBuffer(messageContent);
    
    const response = await langAI.processVideoMessage(buffer, userId);
    
    await sendSafeResponse(event, client, response);
    loadingManager.stopProcessing(userId);
    
  } catch (error) {
    loadingManager.stopProcessing(userId);
    await sendSafeResponse(event, client, {
      type: 'text',
      text: `🎬 ขออภัยครับ เล้งไม่สามารถวิเคราะห์วิดีโอได้: ${error.message}`
    });
  }
}

async function handleFileMessage(event, client, langAI, loadingManager) {
  const userId = event.source.userId;
  
  try {
    await loadingManager.startProcessing(userId, 'document');
    
    const messageContent = await client.getMessageContent(event.message.id);
    const buffer = await streamToBuffer(messageContent);
    
    const response = await langAI.processFileMessage(buffer, event.message.fileName, userId);
    
    await sendSafeResponse(event, client, response);
    loadingManager.stopProcessing(userId);
    
  } catch (error) {
    loadingManager.stopProcessing(userId);
    await sendSafeResponse(event, client, {
      type: 'text',
      text: `📄 ขออภัยครับ เล้งไม่สามารถประมวลผลไฟล์ได้: ${error.message}`
    });
  }
}

async function handleLocationMessage(event, client, langAI, loadingManager) {
  const userId = event.source.userId;
  const { latitude, longitude, address } = event.message;
  
  try {
    await loadingManager.startProcessing(userId, 'location');
    
    const response = await langAI.processLocationMessage(latitude, longitude, address, userId);
    
    await sendSafeResponse(event, client, response);
    loadingManager.stopProcessing(userId);
    
  } catch (error) {
    loadingManager.stopProcessing(userId);
    await handleErrorWithFallback(event, client, userId, error);
  }
}

async function handlePostback(event, client, langAI, startTime) {
  const userId = event.source.userId;
  const postbackData = event.postback.data;
  
  try {
    console.log(`🔄 Postback: ${postbackData} from ${userId}`);
    
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > 18000) {
      await handleWithPushMessage(event, client, langAI);
      return;
    }
    
    if (postbackData.startsWith('weekly_')) {
      const cityName = postbackData.replace('weekly_', '');
      const weeklyResponse = await langAI.weatherService.getWeeklyForecast(`รายสัปดาห์ ${cityName}`);
      await sendSafeResponse(event, client, weeklyResponse);
      
    } else if (postbackData.startsWith('detailed_forecast_')) {
      const cityName = postbackData.replace('detailed_forecast_', '');
      const detailedResponse = await langAI.weatherService.getDetailedForecast(`รายละเอียด ${cityName}`);
      await sendSafeResponse(event, client, detailedResponse);
      
    } else if (postbackData.startsWith('refresh_')) {
      const cityName = postbackData.replace('refresh_', '');
      const refreshedWeather = await langAI.weatherService.getWeatherInfo(`อากาศ ${cityName}`);
      await sendSafeResponse(event, client, refreshedWeather);
      
    } else {
      const response = await langAI.processPostback(postbackData, userId);
      await sendSafeResponse(event, client, response);
    }
  } catch (error) {
    console.error('💥 Postback error:', error);
    await handleErrorWithFallback(event, client, userId, error);
  }
}

async function sendSafeResponse(event, client, response) {
  try {
    if (event.replyToken) {
      usedReplyTokens.add(event.replyToken);
      setTimeout(() => usedReplyTokens.delete(event.replyToken), 5 * 60 * 1000);
    }
    
    const validatedResponse = validateAndCleanResponse(response);
    const messageSize = JSON.stringify(validatedResponse).length;
    
    if (messageSize > 2800) {
      console.log(`📏 Message too large (${messageSize} bytes), using fallback`);
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: response.altText || 'ข้อมูลมีขนาดใหญ่เกินไป กรุณาลองใหม่อีกครั้ง'
      });
      return;
    }
    
    await client.replyMessage(event.replyToken, validatedResponse);
    
  } catch (error) {
    console.error('💥 Error sending response:', error);
    throw error;
  }
}

async function handleErrorWithFallback(event, client, userId, originalError) {
  try {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '🔧 ขออภัยครับ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
    });
  } catch (replyError) {
    try {
      await client.pushMessage(userId, {
        type: 'text',
        text: '🔧 ขออภัยครับ เกิดข้อผิดพลาด'
      });
    } catch (pushError) {
      console.error('💥 All fallback methods failed:', originalError.message);
    }
  }
}

async function handleWithPushMessage(event, client, langAI) {
  try {
    const userId = event.source.userId;
    
    let response;
    if (event.message && event.message.type === 'text') {
      response = await langAI.processTextMessage(event.message.text, userId);
    } else {
      response = {
        type: 'text',
        text: '⏰ การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง'
      };
    }
    
    const validatedResponse = validateAndCleanResponse(response);
    await client.pushMessage(userId, validatedResponse);
    
  } catch (error) {
    console.error('💥 Push message error:', error);
  }
}

function validateAndCleanResponse(response) {
  if (!response || typeof response !== 'object') {
    return { type: 'text', text: '🔧 ขออภัยครับ เกิดข้อผิดพลาด' };
  }

  if (response.type === 'text') {
    return { type: 'text', text: sanitizeText(response.text) };
  }

  if (response.type === 'flex') {
    try {
      const cleanedFlex = cleanFlexMessage(response);
      const flexSize = JSON.stringify(cleanedFlex).length;
      
      if (flexSize > 2500) {
        return { type: 'text', text: response.altText || 'ข้อมูลมีขนาดใหญ่เกินไป' };
      }
      
      return cleanedFlex;
    } catch (error) {
      return { type: 'text', text: response.altText || 'เกิดข้อผิดพลาดในการแสดงผล' };
    }
  }

  return response;
}

function cleanFlexMessage(flexMessage) {
  const jsonString = JSON.stringify(flexMessage, (key, value) => {
    if (value === undefined) return null;
    return value;
  });
  return JSON.parse(jsonString);
}

function sanitizeText(text) {
  if (!text || typeof text !== 'string') {
    return '🔧 ขออภัยครับ เกิดข้อผิดพลาด';
  }

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, 1500);
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    
    setTimeout(() => reject(new Error('Stream timeout')), 30000);
  });
}

exports.health = onRequest((req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'เล้ง AI Bot v2.1',
    region: 'asia-southeast1'
  });
});

exports.status = onRequest((req, res) => {
  res.status(200).json({
    bot: 'เล้ง AI',
    version: '2.1.0',
    features: ['Text', 'Image', 'Audio', 'Video', 'Document', 'Weather', 'Location'],
    cities: ['กรุงเทพฯ', 'โอตารุ', 'อุสึโนะมิยะ', 'โตเกียว', 'ซัปโปโร'],
    updated: new Date().toISOString()
  });
});
