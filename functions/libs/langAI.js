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

      return `You are "Leng," a brilliant, multilingual AI assistant in LINE, developed to provide the most accurate and helpful answers.

## Core Identity
- Your name is "เล้ง" (Leng).
- You are an expert assistant, polite, intelligent, and trustworthy.
- Your primary function is to be helpful and accurate.

## Language Rules (CRITICAL)
- **Primary Rule:** You MUST ALWAYS respond in the same language as the user's query.
- **Example 1:** If the user asks "Hello, how are you?", you must respond in English.
- **Example 2:** If the user asks "こんにちは、今日の天気は？", you must respond in Japanese.
- **Example 3:** If the user asks "สบายดีไหม", you must respond in Thai.
- Do NOT switch back to Thai unless the user switches to Thai first. This rule is your highest priority.

## Operational Principles
1.  **Accuracy First:** Always provide fact-based information. If uncertain, state "Based on the available information..."
2.  **Structured Answers:** Format responses for clarity. Use Markdown (headings, lists, bolding) to make answers easy to read.
3.  **Proactive Assistance:** After answering, suggest relevant follow-up questions or additional information the user might find useful.
4.  **Emoji Usage:** Use emojis purposefully to enhance understanding (e.g., ✅, 💡, ⚠️), not for decoration.

## Capabilities
- **Contextual Memory:** Remember previous parts of the conversation and user-submitted files.
- **Multimodal Processing:** Expertly analyze text, images, audio, video, and documents.
- **Weather Forecasts:** Provide accurate weather data using the One Call API 3.0.
- **Current Time:** ${currentDate}, ${currentTime} (JST)`;
    };
    console.log('✅ เล้ง AI ready!');
  }

  // --- State & Context Management ---
  async setContextState(userId, stateData) {
    try {
      const contextRef = this.db.collection('user_states').doc(userId);
      const dataToSet = {
        ...stateData,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };
      await contextRef.set(dataToSet, { merge: true });
      console.log(`Set context state for user ${userId}:`, stateData);
    } catch (error) {
      console.error('Error setting context state:', error);
    }
  }

  async getContextState(userId) {
    try {
      const doc = await this.db.collection('user_states').doc(userId).get();
      if (doc.exists) {
        const state = doc.data();
        const now = moment();
        const stateTime = moment(state.timestamp.toDate());
        if (now.diff(stateTime, 'minutes') > 10) {
          await this.clearContextState(userId);
          return {};
        }
        return state;
      }
      return {};
    } catch (error) {
      console.error('Error getting context state:', error);
      return {};
    }
  }

  async clearContextState(userId) {
    try {
      await this.db.collection('user_states').doc(userId).delete();
      console.log(`Cleared context state for user ${userId}`);
    } catch (error) {
      console.error('Error clearing context state:', error);
    }
  }

  // --- Query Detection & Processing ---
  isContextualWeatherQuery(message) {
    const contextualKeywords = ['พรุ่งนี้', 'มะรืน', 'รายสัปดาห์', 'รายชั่วโมง', 'แล้วพรุ่งนี้', 'แล้วอันนี้', 'แล้ว...', 'tomorrow', 'weekly', 'hourly'];
    const lowerMessage = message.toLowerCase();
    return contextualKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  async processTextMessage(message, userId) {
    console.log(`Processing message: "${message}" for user: ${userId}`);
    const contextState = await this.getContextState(userId);
    const lowerMessage = message.toLowerCase();

    try {
      if (contextState.pendingAction === 'request_city_for_weather') {
        const cityData = this.weatherService.extractCityFromQuery(message);
        if (cityData) {
          await this.setContextState(userId, { pendingAction: null, lastMentionedCity: cityData.name });
          return this.weatherService.getCurrentWeather(message);
        }
        await this.clearContextState(userId);
      }

      if (this.isContextualWeatherQuery(lowerMessage) && contextState.lastMentionedCity) {
        const fullQuery = `${message} ${contextState.lastMentionedCity}`;
        if (lowerMessage.includes('รายสัปดาห์') || lowerMessage.includes('weekly')) return this.weatherService.getWeeklyForecast(fullQuery);
        if (lowerMessage.includes('รายชั่วโมง') || lowerMessage.includes('hourly')) return this.weatherService.getHourlyForecast(fullQuery);
        const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
        return this.weatherService.getDailyDetailForecast(`daily_detail_${tomorrow}_${contextState.lastMentionedCity}`);
      }

      const queryType = this.detectQueryType(message);
      let city;
      switch (queryType) {
        case 'current_weather_no_city':
          await this.setContextState(userId, { pendingAction: 'request_city_for_weather' });
          return { type: 'text', text: 'คุณต้องการทราบสภาพอากาศของเมืองอะไรครับ? (Which city would you like to know the weather for? / どの都市の天気が知りたいですか？)' };

        case 'current_weather':
          city = this.weatherService.extractCityFromQuery(message);
          await this.setContextState(userId, { lastMentionedCity: city.name });
          return this.weatherService.getCurrentWeather(message);

        case 'weekly_weather':
          city = this.weatherService.extractCityFromQuery(message);
          await this.setContextState(userId, { lastMentionedCity: city.name });
          return this.weatherService.getWeeklyForecast(message);

        case 'hourly_weather':
          city = this.weatherService.extractCityFromQuery(message);
          await this.setContextState(userId, { lastMentionedCity: city.name });
          return this.weatherService.getHourlyForecast(message);

        case 'time_query':
          return this.createProfessionalTimeMessage();

        default:
          return this.processGeneralQuery(message, userId);
      }
    } catch (error) {
      console.error('Text processing error:', error.stack || error);
      return { type: 'text', text: '❌ ขออภัยค่ะ เล้งไม่สามารถประมวลผลข้อความได้ในขณะนี้' };
    }
  }

  detectQueryType(message) {
    const lowerMessage = message.toLowerCase();
    if (this.isWeatherQuery(message)) {
      if (this.weatherService.extractCityFromQuery(message)) {
        if (lowerMessage.includes('รายสัปดาห์') || lowerMessage.includes('weekly')) return 'weekly_weather';
        if (lowerMessage.includes('รายชั่วโมง') || lowerMessage.includes('hourly')) return 'hourly_weather';
        return 'current_weather';
      }
      return 'current_weather_no_city';
    }
    if (this.isTimeQuery(message)) return 'time_query';
    return 'general';
  }

  async processPostback(data, userId) {
    console.log(`Processing postback: "${data}" for user: ${userId}`);
    try {
      await this.clearContextState(userId);
      const parts = data.split('_');
      const action = parts[0];
      const type = parts[1];
      const payload = parts.slice(2).join('_');

      if (type === 'forecast') {
        const city = this.weatherService.extractCityFromQuery(payload)
        if (city) await this.setContextState(userId, { lastMentionedCity: city.name });
      } else if (action === 'daily' && type === 'detail') {
        const city = this.weatherService.extractCityFromQuery(payload.split('_').slice(1).join('_'));
        if (city) await this.setContextState(userId, { lastMentionedCity: city.name });
      }

      if (data.startsWith('weekly_forecast_')) return this.weatherService.getWeeklyForecast(data);
      if (data.startsWith('hourly_forecast_')) return this.weatherService.getHourlyForecast(data);
      if (data.startsWith('daily_detail_')) return this.weatherService.getDailyDetailForecast(data);

      const prompt = `${this.getSystemPrompt()}\n\nUser pressed a button with data: "${data}". Respond accordingly.`;
      if (this.model) {
        const result = await this.model.generateContent(prompt);
        return { type: 'text', text: result.response.text() };
      }
    } catch (error) {
      console.error('Postback processing error:', error);
      return { type: 'text', text: '❌ ขออภัยค่ะ ไม่สามารถประมวลผลการเลือกได้' };
    }
  }

  // --- Multimodal Functions ---
  async processImageMessage(imageBuffer, userId) {
    try {
      const result = await this.multimodal.analyzeImage(imageBuffer, userId);
      await this.saveFileContext(userId, 'image', 'User sent an image');
      await this.saveConversationContext(userId, '[User sent an image]', result);
      return { type: 'text', text: `🖼️ **Image Analysis:**\n\n${result}` };
    } catch (error) {
      console.error('Image processing error:', error);
      return { type: 'text', text: `❌ Sorry, Leng could not analyze the image: ${error.message}` };
    }
  }

  async processAudioMessage(audioBuffer, userId) {
    try {
      const result = await this.multimodal.analyzeAudio(audioBuffer, userId);
      await this.saveFileContext(userId, 'audio', 'User sent an audio file');
      await this.saveConversationContext(userId, '[User sent an audio file]', result);
      return { type: 'text', text: `🎵 **Audio Analysis:**\n\n${result}` };
    } catch (error) {
      console.error('Audio processing error:', error);
      return { type: 'text', text: `❌ Sorry, Leng could not process the audio: ${error.message}` };
    }
  }

  async processVideoMessage(videoBuffer, userId) {
    try {
      const result = await this.multimodal.analyzeVideo(videoBuffer, userId);
      await this.saveFileContext(userId, 'video', 'User sent a video');
      await this.saveConversationContext(userId, '[User sent a video]', result);
      return { type: 'text', text: `🎬 **Video Analysis:**\n\n${result}` };
    } catch (error) {
      console.error('Video processing error:', error);
      return { type: 'text', text: `❌ Sorry, Leng could not analyze the video: ${error.message}` };
    }
  }

  async processFileMessage(fileBuffer, fileName, userId) {
    try {
      const result = await this.multimodal.analyzeDocument(fileBuffer, fileName, userId);
      await this.saveFileContext(userId, 'document', `Document: ${fileName}`);
      await this.saveConversationContext(userId, `[User sent a file: ${fileName}]`, result);
      return { type: 'text', text: `📄 **Summary from "${fileName}":**\n\n${result}` };
    } catch (error) {
      console.error('File processing error:', error);
      return { type: 'text', text: `❌ Sorry, Leng could not read the document "${fileName}": ${error.message}` };
    }
  }

  async processLocationMessage(lat, lon, address, userId) {
    try {
      const city = { lat, lon, name: address || 'Specified Location', timezone: 'Asia/Bangkok' };
      const weatherData = await this.weatherService.fetchOneCallApiData(lat, lon);
      const weatherResponse = this.weatherService.formatCurrentWeather(weatherData, city);

      const prompt = `${this.getSystemPrompt()}\n\nUser sent a location: ${city.name}\n\nProvide helpful information about this location.`;
      if (this.model) {
        const result = await this.model.generateContent(prompt);
        const responseText = result.response.text();
        await this.saveConversationContext(userId, `[User sent a location: ${city.name}]`, responseText);
        return [{ type: 'text', text: `📍 **About Your Location:**\n\n${responseText}` }, weatherResponse];
      }
      return weatherResponse;
    } catch (error) {
      console.error('Location processing error:', error);
      return { type: 'text', text: '❌ Sorry, could not process the location.' };
    }
  }

  // --- Helper Functions ---
  isWeatherQuery(message) {
    const weatherKeywords = ['อากาศ', 'สภาพอากาศ', 'ฝน', 'แดด', 'หนาว', 'ร้อน', 'เมฆ', 'ลม', 'อุณหภูมิ', 'พยากรณ์', 'weather', 'forecast', '天気'];
    return weatherKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  isTimeQuery(message) {
    const timeKeywords = ['เวลา', 'วันที่', 'กี่โมง', 'ตอนนี้', 'time', 'date', '時間', '日付'];
    return timeKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

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
          contents: [{ type: 'text', text: '🕐 เวลาปัจจุบัน', weight: 'bold', size: 'xl', color: '#ffffff' }],
          backgroundColor: '#667eea',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'lg',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '🇯🇵', size: '3xl', flex: 0, gravity: 'center' },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'lg',
                  contents: [
                    { type: 'text', text: 'ญี่ปุ่น (JST)', weight: 'bold', size: 'md' },
                    { type: 'text', text: jstTime.format('HH:mm:ss'), size: 'xxl', weight: 'bold', color: '#667eea' },
                    { type: 'text', text: jstTime.format('dddd, DD MMMM YYYY'), size: 'sm', color: '#888888' }
                  ]
                }
              ]
            },
            { type: 'separator' },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '🇹🇭', size: '3xl', flex: 0, gravity: 'center' },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'lg',
                  contents: [
                    { type: 'text', text: 'ไทย (ICT)', weight: 'bold', size: 'md' },
                    { type: 'text', text: thaiTime.format('HH:mm:ss'), size: 'xxl', weight: 'bold', color: '#f093fb' },
                    { type: 'text', text: thaiTime.format('dddd, DD MMMM YYYY'), size: 'sm', color: '#888888' }
                  ]
                }
              ]
            }
          ]
        }
      }
    };
  }

  async processGeneralQuery(message, userId) {
    try {
      const context = await this.getConversationContext(userId);
      let prompt = this.getSystemPrompt() + `\n\n## Conversation Context\n${context ? context : 'No previous conversation.'}\n\n## User's Query\n${message}`;
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      await this.saveConversationContext(userId, message, response);
      return { type: 'text', text: response };
    } catch (error) {
      console.error('General query processing error:', error);
      return { type: 'text', text: '❌ ขออภัยค่ะ ไม่สามารถประมวลผลข้อความได้' };
    }
  }

  async saveConversationContext(userId, userMessage, aiResponse) {
    try {
      const conversationRef = this.db.collection('conversations').doc(userId);
      const doc = await conversationRef.get();
      let conversations = (doc.exists && doc.data().messages) ? doc.data().messages : [];
      const timestamp = new Date().toISOString();

      conversations.push({
        userMessage,
        aiResponse: typeof aiResponse === 'object' ? JSON.stringify(aiResponse) : aiResponse,
        timestamp: timestamp
      });

      if (conversations.length > 20) {
        conversations = conversations.slice(-20);
      }

      await conversationRef.set({ messages: conversations }, { merge: true });
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
          .map(conv => `- User: ${conv.userMessage}\n- Leng: ${conv.aiResponse}`)
          .join('\n\n');
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
