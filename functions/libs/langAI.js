const { GoogleGenerativeAI } = require('@google/generative-ai');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const WeatherService = require('./weatherService');
const MultimodalProcessor = require('./multimodal');

const geminiApiKey = defineSecret('GEMINI_API_KEY');

class LangAI {
  constructor() {
    console.log('🤖 เล้ง AI initializing...');

    try {
      this.genAI = new GoogleGenerativeAI(geminiApiKey.value());
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      console.log('✅ Gemini API connected successfully');
    } catch (error) {
      console.error('❌ Gemini API connection failed:', error);
      this.model = null;
    }

    this.db = admin.firestore();
    this.weatherService = new WeatherService();
    this.multimodal = new MultimodalProcessor();

    this.getSystemPrompt = () => {
      const currentTime = moment().tz('Asia/Tokyo').format('YYYY-MM-DD HH:mm:ss JST');
      const currentDate = moment().tz('Asia/Tokyo').format('dddd, MMMM Do YYYY');

      return `คุณคือ "เล้ง" AI ผู้ช่วยที่ทำได้ทุกอย่างใน LINE... (System prompt content is the same)`;
    };

    console.log('✅ เล้ง AI ready!');
  }

  // --- State Management ---
  async setPendingAction(userId, action) {
    try {
      const contextRef = this.db.collection('conversations').doc(userId);
      await contextRef.set({
        pendingAction: {
          action: action,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });
      console.log(`Set pending action '${action}' for user ${userId}`);
    } catch (error) {
      console.error('Error setting pending action:', error);
    }
  }

  async getPendingAction(userId) {
    try {
      const doc = await this.db.collection('conversations').doc(userId).get();
      if (doc.exists && doc.data().pendingAction) {
        const pending = doc.data().pendingAction;
        // Timeout pending action after 5 minutes
        const now = moment();
        const actionTime = moment(pending.timestamp.toDate());
        if (now.diff(actionTime, 'minutes') > 5) {
          await this.clearPendingAction(userId);
          return null;
        }
        return pending.action;
      }
      return null;
    } catch (error) {
      console.error('Error getting pending action:', error);
      return null;
    }
  }

  async clearPendingAction(userId) {
    try {
      const contextRef = this.db.collection('conversations').doc(userId);
      await contextRef.update({
        pendingAction: admin.firestore.FieldValue.delete()
      });
      console.log(`Cleared pending action for user ${userId}`);
    } catch (error) {
      if (error.code !== 5) { // Ignore 'NOT_FOUND' errors
        console.error('Error clearing pending action:', error);
      }
    }
  }

  // --- Query Detection ---
  detectQueryType(message) {
    const lowerMessage = message.toLowerCase();

    // Check for explicit weather keywords
    if (this.isWeatherQuery(message) && this.weatherService.extractCityFromQuery(message)) {
      if (lowerMessage.includes('รายสัปดาห์') || lowerMessage.includes('weekly')) return 'weekly_weather';
      if (lowerMessage.includes('รายชั่วโมง') || lowerMessage.includes('hourly')) return 'hourly_weather';
      return 'current_weather';
    }

    // Looser check for weather queries without explicit city names
    if (this.isWeatherQuery(message)) {
      return 'current_weather_no_city';
    }

    if (this.isTimeQuery(message)) return 'time_query';

    return 'general';
  }

  // --- Message Processing ---
  async processTextMessage(message, userId) {
    console.log(`Processing message: "${message}" from user: ${userId}`);

    try {
      // 1. Check for a pending action first
      const pendingAction = await this.getPendingAction(userId);
      if (pendingAction === 'request_city_for_weather') {
        console.log(`Handling pending action with message: "${message}"`);
        const weatherResponse = await this.weatherService.getCurrentWeather(message);

        if (weatherResponse && weatherResponse.type === 'flex') {
          await this.clearPendingAction(userId);
          await this.saveConversationContext(userId, message, 'แสดงสภาพอากาศปัจจุบัน');
          return weatherResponse;
        }
        // If user typed something else, clear the action and process normally
        await this.clearPendingAction(userId);
      }

      // 2. If no pending action, detect query type normally
      const queryType = this.detectQueryType(message);

      switch (queryType) {
        case 'current_weather_no_city':
          await this.setPendingAction(userId, 'request_city_for_weather');
          await this.saveConversationContext(userId, message, 'ถามชื่อเมืองสำหรับพยากรณ์อากาศ');
          return { type: 'text', text: 'คุณต้องการทราบสภาพอากาศของเมืองอะไรครับ? 🏙️' };

        case 'current_weather':
        case 'weekly_weather':
        case 'hourly_weather':
          const weatherFunctionMap = {
            'current_weather': this.weatherService.getCurrentWeather,
            'weekly_weather': this.weatherService.getWeeklyForecast,
            'hourly_weather': this.weatherService.getHourlyForecast,
          };
          const weatherMethod = weatherFunctionMap[queryType].bind(this.weatherService);
          const response = await weatherMethod(message);
          await this.saveConversationContext(userId, message, 'แสดงข้อมูลสภาพอากาศ');
          return response;

        case 'time_query':
          return this.createProfessionalTimeMessage();

        case 'general':
        default:
          return await this.processGeneralQuery(message, userId);
      }

    } catch (error) {
      console.error('Text processing error:', error.stack || error);
      return { type: 'text', text: '❌ ขออภัยครับ เล้งไม่สามารถประมวลผลข้อความได้ในขณะนี้' };
    }
  }

  // --- Postback Processing ---
  async processPostback(data, userId) {
    console.log(`Processing postback: "${data}" from user: ${userId}`);
    try {
      await this.clearPendingAction(userId); // Clear any pending actions when a button is pressed

      if (data.startsWith('weekly_forecast_')) {
        return await this.weatherService.getWeeklyForecast(data);
      }
      if (data.startsWith('hourly_forecast_')) {
        return await this.weatherService.getHourlyForecast(data);
      }
      if (data.startsWith('daily_detail_')) {
        return await this.weatherService.getDailyDetailForecast(data);
      }

      const prompt = `${this.getSystemPrompt()}\n\nผู้ใช้กดปุ่ม: ${data}\n\nตอบสนองตามที่ผู้ใช้เลือก`;
      if (this.model) {
        const result = await this.model.generateContent(prompt);
        const responseText = result.response.text();
        await this.saveConversationContext(userId, `กดปุ่ม: ${data}`, responseText);
        return { type: 'text', text: responseText };
      }
    } catch (error) {
      console.error('Postback processing error:', error);
      return { type: 'text', text: '❌ ขออภัยครับ เล้งไม่สามารถประมวลผลการเลือกได้' };
    }
  }

  isWeatherQuery(message) {
    const weatherKeywords = ['อากาศ', 'สภาพอากาศ', 'ฝน', 'แดด', 'หนาว', 'ร้อน', 'เมฆ', 'ลม', 'อุณหภูมิ', 'พยากรณ์', 'weather', 'forecast'];
    return weatherKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  isTimeQuery(message) {
    const timeKeywords = ['เวลา', 'วันที่', 'กี่โมง', 'ตอนนี้', 'time', 'date'];
    return timeKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  // --- (The rest of the functions: createProfessionalTimeMessage, processGeneralQuery, multimodal methods, and memory management methods can remain the same) ---

  createProfessionalTimeMessage() {
    const jstTime = moment().tz('Asia/Tokyo');
    const thaiTime = moment().tz('Asia/Bangkok');

    return {
      type: 'flex',
      altText: 'เวลาปัจจุบัน',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🕐 เวลาปัจจุบัน',
              weight: 'bold',
              size: '2xl',
              color: '#ffffff'
            }
          ],
          backgroundColor: '#667eea',
          paddingAll: '24px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '🇯🇵',
                  size: '3xl',
                  flex: 0
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: 'ญี่ปุ่น (JST)',
                      weight: 'bold',
                      size: 'lg',
                      color: '#333333'
                    },
                    {
                      type: 'text',
                      text: jstTime.format('HH:mm:ss'),
                      size: '4xl',
                      weight: 'bold',
                      color: '#667eea'
                    },
                    {
                      type: 'text',
                      text: jstTime.format('dddd, MMMM Do YYYY'),
                      size: 'md',
                      color: '#666666'
                    }
                  ],
                  margin: 'lg'
                }
              ],
              paddingAll: '20px'
            },
            {
              type: 'separator',
              color: '#E0E0E0',
              margin: 'xl'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '🇹🇭',
                  size: '3xl',
                  flex: 0
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: 'ไทย (ICT)',
                      weight: 'bold',
                      size: 'lg',
                      color: '#333333'
                    },
                    {
                      type: 'text',
                      text: thaiTime.format('HH:mm:ss'),
                      size: '4xl',
                      weight: 'bold',
                      color: '#f093fb'
                    },
                    {
                      type: 'text',
                      text: thaiTime.format('dddd, MMMM Do YYYY'),
                      size: 'md',
                      color: '#666666'
                    }
                  ],
                  margin: 'lg'
                }
              ],
              paddingAll: '20px'
            }
          ]
        }
      }
    };
  }

  async processGeneralQuery(message, userId) {
    try {
      const context = await this.getConversationContext(userId);
      const fileContext = await this.getFileContext(userId);

      let prompt = this.getSystemPrompt() + `\n\nข้อความจากผู้ใช้: ${message}`;

      if (context) {
        prompt += `\n\nบริบทการสนทนาก่อนหน้า (5 ข้อความล่าสุด): ${context}`;
      }

      if (fileContext) {
        prompt += `\n\nไฟล์ที่เกี่ยวข้อง: ${fileContext.description}`;
      }

      if (this.model) {
        const result = await this.model.generateContent(prompt);
        const response = result.response.text();

        await this.saveConversationContext(userId, message, response);

        return { type: 'text', text: response };
      }
    } catch (error) {
      console.error('General query processing error:', error);
      return { type: 'text', text: '❌ ขออภัยครับ เล้งไม่สามารถประมวลผลข้อความได้ในขณะนี้' };
    }
  }

  async processImageMessage(imageBuffer, userId) {
    try {
      const result = await this.multimodal.analyzeImage(imageBuffer, userId);
      await this.saveFileContext(userId, 'image', 'รูปภาพที่ผู้ใช้ส่งมา');
      await this.saveConversationContext(userId, 'ส่งรูปภาพ', result);
      return { type: 'text', text: `🖼️ เล้งวิเคราะห์รูปภาพแล้ว:\n\n${result}` };
    } catch (error) {
      console.error('Image processing error:', error);
      return { type: 'text', text: `❌ ขออภัยครับ เล้งไม่สามารถวิเคราะห์รูปภาพได้: ${error.message}` };
    }
  }

  async processAudioMessage(audioBuffer, userId) {
    try {
      const result = await this.multimodal.analyzeAudio(audioBuffer, userId);
      await this.saveFileContext(userId, 'audio', 'ไฟล์เสียงที่ผู้ใช้ส่งมา');
      await this.saveConversationContext(userId, 'ส่งไฟล์เสียง', result);
      return { type: 'text', text: `🎵 เล้งประมวลผลเสียงแล้ว:\n\n${result}` };
    } catch (error) {
      console.error('Audio processing error:', error);
      return { type: 'text', text: `❌ ขออภัยครับ เล้งไม่สามารถประมวลผลเสียงได้: ${error.message}` };
    }
  }

  async processVideoMessage(videoBuffer, userId) {
    try {
      const result = await this.multimodal.analyzeVideo(videoBuffer, userId);
      await this.saveFileContext(userId, 'video', 'วิดีโอที่ผู้ใช้ส่งมา');
      await this.saveConversationContext(userId, 'ส่งวิดีโอ', result);
      return { type: 'text', text: `🎬 เล้งวิเคราะห์วิดีโอแล้ว:\n\n${result}` };
    } catch (error) {
      console.error('Video processing error:', error);
      return { type: 'text', text: `❌ ขออภัยครับ เล้งไม่สามารถวิเคราะห์วิดีโอได้: ${error.message}` };
    }
  }

  async processFileMessage(fileBuffer, fileName, userId) {
    try {
      const result = await this.multimodal.analyzeDocument(fileBuffer, fileName, userId);
      await this.saveFileContext(userId, 'document', `เอกสาร: ${fileName}`);
      await this.saveConversationContext(userId, `ส่งเอกสาร: ${fileName}`, result);
      return { type: 'text', text: `📄 เล้งอ่านเอกสาร "${fileName}" แล้ว:\n\n${result}` };
    } catch (error) {
      console.error('File processing error:', error);
      return { type: 'text', text: `❌ ขออภัยครับ เล้งไม่สามารถอ่านเอกสาร "${fileName}" ได้: ${error.message}` };
    }
  }

  async processLocationMessage(lat, lon, address, userId) {
    try {
      const city = { lat, lon, name: address || 'ตำแหน่งที่ระบุ', timezone: 'Asia/Bangkok' }; // Assume Bangkok timezone for unknown locations
      const weatherData = await this.weatherService.fetchOneCallApiData(lat, lon);
      const weatherResponse = this.weatherService.formatCurrentWeather(weatherData, city);

      const prompt = `${this.getSystemPrompt()}\n\nผู้ใช้ส่งตำแหน่งมา: ${city.name}\n\nให้ข้อมูลที่เป็นประโยชน์เกี่ยวกับตำแหน่งนี้`;
      if (this.model) {
        const result = await this.model.generateContent(prompt);
        const responseText = result.response.text();
        await this.saveConversationContext(userId, `ส่งตำแหน่ง: ${city.name}`, responseText);
        return [{ type: 'text', text: `📍 เล้งได้รับตำแหน่งแล้ว:\n\n${responseText}` }, weatherResponse];
      }
      return weatherResponse;
    } catch (error) {
      console.error('Location processing error:', error);
      return { type: 'text', text: '❌ ขออภัยครับ เล้งไม่สามารถประมวลผลตำแหน่งได้' };
    }
  }

  async saveConversationContext(userId, userMessage, aiResponse) {
    try {
      const conversationRef = this.db.collection('conversations').doc(userId);
      const doc = await conversationRef.get();
      let conversations = (doc.exists && doc.data().messages) ? doc.data().messages : [];

      conversations.push({
        userMessage,
        aiResponse: typeof aiResponse === 'object' ? JSON.stringify(aiResponse) : aiResponse,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      if (conversations.length > 10) {
        conversations = conversations.slice(-10);
      }

      const dataToSet = { messages: conversations };
      if (doc.exists && doc.data().pendingAction) {
        dataToSet.pendingAction = doc.data().pendingAction;
      }

      await conversationRef.set(dataToSet, { merge: true });

    } catch (error) {
      console.error('Error saving conversation context:', error);
    }
  }

  async getConversationContext(userId) {
    try {
      const conversationRef = this.db.collection('conversations').doc(userId);
      const doc = await conversationRef.get();

      if (doc.exists && doc.data().messages) {
        return doc.data().messages
          .slice(-5)
          .map(conv => `ผู้ใช้: ${conv.userMessage}\nเล้ง: ${conv.aiResponse}`)
          .join('\n---\n');
      }
      return null;
    } catch (error) {
      console.error('Error getting conversation context:', error);
      return null;
    }
  }

  async saveFileContext(userId, fileType, description) {
    try {
      const fileRef = this.db.collection('file_contexts').doc(userId);
      await fileRef.set({
        type: fileType,
        description,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving file context:', error);
    }
  }

  async getFileContext(userId) {
    try {
      const fileRef = this.db.collection('file_contexts').doc(userId);
      const doc = await fileRef.get();

      if (doc.exists) {
        const data = doc.data();
        const fileTime = moment(data.timestamp.toDate());
        if (moment().diff(fileTime, 'hours') < 2) {
          return data;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting file context:', error);
      return null;
    }
  }
}

module.exports = LangAI;

