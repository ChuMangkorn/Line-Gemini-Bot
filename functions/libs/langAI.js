// [FINAL & STABLE VERSION] functions/libs/langAI.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const WeatherService = require('./weatherService');
const MultimodalProcessor = require('./multimodal');
const { YoutubeTranscript } = require('youtube-transcript');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const YouTubeService = require('./youtubeService');

class LangAI {
  constructor(adminId, youtubeApiKey) {
    console.log('🤖 เล้ง AI initializing...');

    // [FIX] กำหนด tools ให้กับ instance ของคลาสด้วย 'this.tools'
    this.tools = [{
      functionDeclarations: [
        {
          name: 'Youtube',
          description: 'Searches YouTube for videos based on a user\'s query and returns a list of relevant videos.',
          parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'The search term for the YouTube video.' } }, required: ['query'] }
        }
      ]
    }];

    try {
      this.genAI = new GoogleGenerativeAI(geminiApiKey.value());
      // [FIX 2] ไม่ต้องสร้าง this.model ที่นี่แล้ว เราจะไปสร้างในแต่ละฟังก์ชันที่เรียกใช้แทน
      console.log('✅ Gemini API Initialized');
    } catch (error) {
      console.error('❌ Gemini API connection failed:', error);
      this.genAI = null;
    }

    this.db = admin.firestore();
    this.weatherService = new WeatherService();
    this.multimodal = new MultimodalProcessor();
    this.youtubeService = new YouTubeService(youtubeApiKey);
    this.adminId = adminId;

    this.getSystemPrompt = () => {
      const currentTime = moment().tz('Asia/Tokyo').format('YYYY-MM-DD HH:mm:ss JST');
      const currentDate = moment().tz('Asia/Tokyo').format('dddd, MMMM Do YYYY');
      return `You are "Leng," a brilliant, multilingual AI assistant in LINE. Your name is "เล้ง".
        CRITICAL RULE: Language Protocol
        - You MUST ALWAYS respond in the same language as the user's last message.
        Core Persona & Principles
        - **Expert & Trustworthy:** Act as a polite, intelligent, and reliable expert.
        - **Accurate & Factual:** Provide fact-based information.
        - **Structured & Clear:** Format answers for readability using Markdown.
        - **Proactive & Helpful:** Anticipate user needs. Suggest relevant follow-up questions.
        Capabilities & Knowledge
        - **Current Date & Time:** ${currentDate}, ${currentTime} (JST).
        - **Contextual Memory:** You can recall previous messages in the current conversation.
        - **Multimodal Analysis:** Expert at analyzing text, images, audio, video, and documents.
        - **Youtube:** You can search for YouTube videos.
        - **Weather Forecasting:** You can provide detailed weather forecasts.
        - **General Knowledge:** You can answer a wide range of questions.`;
    };
    console.log('✅ เล้ง AI ready!');
  }

  // ... All helper functions like logUsage, logError, generateAdminReport, etc. remain the same ...
  async logUsage(statType, count = 1) {
    const today = moment().tz('Asia/Bangkok').format('YYYY-MM-DD');
    const statRef = this.db.collection('daily_stats').doc(today);
    const statUpdate = {
      [statType]: admin.firestore.FieldValue.increment(count),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    try {
      await statRef.set(statUpdate, { merge: true });
    } catch (error) {
      console.error(`Error logging usage for ${statType}:`, error);
    }
  }

  async logError(error, context = {}) {
    try {
      const errorLog = {
        message: error.message,
        stack: error.stack,
        context: context,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };
      await this.db.collection('errors').add(errorLog);
      await this.logUsage('errors');
    } catch (e) {
      console.error("Failed to log error to Firestore:", e);
    }
  }

  async generateAdminReport() {
    // This function is correct and does not need changes.
    const today = moment().tz('Asia/Bangkok').format('YYYY-MM-DD');
    const statDoc = await this.db.collection('daily_stats').doc(today).get();
    const stats = statDoc.exists ? statDoc.data() : {};
    const conversationsQuery = this.db.collection('conversations').orderBy('lastUpdated', 'desc').limit(3);
    const conversationsSnapshot = await conversationsQuery.get();
    const recentConversations = [];
    conversationsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.messages && data.messages.length > 0) {
        const lastMessage = data.messages[data.messages.length - 1];
        recentConversations.push({
          user: `...${doc.id.slice(-6)}`,
          userMsg: lastMessage.userMessage.substring(0, 35) + (lastMessage.userMessage.length > 35 ? '…' : ''),
          aiMsg: lastMessage.aiResponse.substring(0, 40) + (lastMessage.aiResponse.length > 40 ? '…' : ''),
          time: moment(data.lastUpdated.toDate()).fromNow()
        });
      }
    });
    const createStatRow = (label, value, icon) => ({
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: icon, flex: 0, margin: 'none', size: 'sm', gravity: 'center' },
        { type: 'text', text: label, size: 'sm', color: '#AEB8C1', flex: 2, margin: 'md' },
        { type: 'text', text: `${value || 0}`, size: 'sm', color: '#FFFFFF', align: 'end', weight: 'bold' }
      ]
    });
    const createConversationRow = (convo) => ({
      type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
      contents: [
        { type: 'text', text: `👤 <span class="math-inline">\{convo\.user\} \(</span>{convo.time})`, color: '#AEB8C1', size: 'xs' },
        { type: 'text', text: `> ${convo.userMsg}`, style: 'italic', color: '#FFFFFF', size: 'sm' },
        { type: 'text', text: `< ${convo.aiMsg}`, style: 'italic', color: '#D3D3D3', size: 'sm' },
      ]
    });
    return {
      type: 'flex',
      altText: `รายงานสรุปการใช้งานวันที่ ${today}`,
      contents: {
        type: 'bubble', size: 'giga',
        styles: { body: { backgroundColor: '#1A202C' } },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'xl',
          contents: [
            {
              type: 'box', layout: 'vertical',
              contents: [
                { type: 'text', text: '📊  ADMIN USAGE REPORT', color: '#FFFFFF', size: 'lg', weight: 'bold' },
                { type: 'text', text: `ข้อมูล ณ วันที่ ${today}`, color: '#718096', size: 'xs' }
              ]
            },
            {
              type: 'box', layout: 'vertical', cornerRadius: 'md',
              paddingAll: '12px', backgroundColor: '#2D3748',
              contents: [
                { type: 'text', text: 'ภาพรวม (Today)', weight: 'bold', color: '#A0AEC0', size: 'sm', margin: 'none' },
                createStatRow('LINE OA Requests', stats.lineOaEvents, '📥'),
                createStatRow('Gemini API Calls', stats.geminiApiHits, '✨'),
              ]
            },
            {
              type: 'box', layout: 'vertical', cornerRadius: 'md',
              paddingAll: '12px', backgroundColor: '#2D3748',
              contents: [
                { type: 'text', text: 'ประเภทการประมวลผล', weight: 'bold', color: '#A0AEC0', size: 'sm', margin: 'none' },
                createStatRow('ข้อความ (Text)', stats.textProcessing, '💬'),
                createStatRow('รูปภาพ (Image)', stats.imageProcessing, '🖼️'),
                createStatRow('เสียง (Audio)', stats.audioProcessing, '🎵'),
                createStatRow('วิดีโอ (Video)', stats.videoProcessing, '🎬'),
                createStatRow('ยูทูป (YouTube)', stats.youtubeProcessing, '▶️'),
                createStatRow('ไฟล์ (File)', stats.fileProcessing, '📄'),
                createStatRow('ตำแหน่ง (Location)', stats.locationProcessing, '📍'),
              ]
            },
            {
              type: 'box', layout: 'vertical', cornerRadius: 'md',
              paddingAll: '12px', backgroundColor: '#2D3748',
              contents: [
                { type: 'text', text: 'บทสนทนาล่าสุด', weight: 'bold', color: '#A0AEC0', size: 'sm', margin: 'none' },
                ...(recentConversations.length > 0 ? recentConversations.map(createConversationRow) : [{ type: 'text', text: 'ยังไม่มีข้อมูล', margin: 'md', size: 'sm', color: '#718096' }])
              ]
            }
          ]
        }
      }
    };
  }

  async updateUserProfile(userId, client) {
    const userRef = this.db.collection('users').doc(userId).collection('profile').doc('info');
    const doc = await userRef.get();

    if (!doc.exists || moment().diff(moment(doc.data().lastFetched?.toDate()), 'hours') > 24) {
      try {
        const profile = await client.getProfile(userId);
        await userRef.set({
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
          statusMessage: profile.statusMessage,
          lastFetched: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`Updated profile for user: ${profile.displayName}`);
      } catch (error) {
        console.error(`Failed to get profile for user ${userId}:`, error.message);
        if (!doc.exists) {
          await userRef.set({
            displayName: `User (${userId.slice(-6)})`,
            pictureUrl: '',
            lastFetched: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }
  }

  async setContextState(userId, stateData) {
    try {
      const contextRef = this.db.collection('user_states').doc(userId);
      await contextRef.set({ ...stateData, timestamp: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error('Error setting context state:', error);
    }
  }

  async getContextState(userId) {
    try {
      const doc = await this.db.collection('user_states').doc(userId).get();
      if (doc.exists) {
        const state = doc.data();
        if (moment().diff(moment(state.timestamp.toDate()), 'minutes') > 10) {
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
    } catch (error) {
      console.error('Error clearing context state:', error);
    }
  }

  async getConversationHistory(userId) {
    const conversationRef = this.db.collection('conversations').doc(userId);
    const doc = await conversationRef.get();
    if (!doc.exists || !doc.data().messages) {
      return [];
    }
    const messages = doc.data().messages.slice(-10);
    const history = [];
    messages.forEach(conv => {
      if (conv.userMessage) {
        history.push({ role: "user", parts: [{ text: conv.userMessage }] });
      }
      if (conv.aiResponse) {
        history.push({ role: "model", parts: [{ text: conv.aiResponse }] });
      }
    });
    return history;
  }

  async handleWeatherQuery(message, userId) {
    const lowerMessage = message.toLowerCase();
    const contextState = await this.getContextState(userId);

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
        return { type: 'text', text: 'คุณต้องการทราบสภาพอากาศของเมืองอะไรครับ?' };
      case 'current_weather':
      case 'weekly_weather':
      case 'hourly_weather':
        city = this.weatherService.extractCityFromQuery(message);
        await this.setContextState(userId, { lastMentionedCity: city.name });
        if (queryType === 'weekly_weather') return this.weatherService.getWeeklyForecast(message);
        if (queryType === 'hourly_weather') return this.weatherService.getHourlyForecast(message);
        return this.weatherService.getCurrentWeather(message);
      default:
        return null;
    }
  }

  async processTextMessage(message, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);

    if (userId === this.adminId && message.trim().toLowerCase() === '/report') {
      return this.generateAdminReport();
    }

    const urlRegex = /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+|https?:\/\/youtu\.be\/[\w-]+)/g;
    const urls = message.match(urlRegex);
    if (urls && urls[0]) {
      return this.processYouTubeLink(urls[0], userId);
    }

    await this.logUsage('textProcessing');

    try {
      const contextState = await this.getContextState(userId);
      if (contextState.pendingAction === 'request_city_for_weather') {
        await this.clearContextState(userId);
        const cityData = this.weatherService.extractCityFromQuery(message);
        if (cityData) {
          return this.weatherService.getCurrentWeather(message);
        }
      }

      const weatherResponse = await this.handleWeatherQuery(message, userId);
      if (weatherResponse) {
        return weatherResponse;
      }

      if (this.isTimeQuery(message)) {
        return this.createProfessionalTimeMessage();
      }

      return this.processGeneralQuery(message, userId);

    } catch (error) {
      console.error('Text processing error:', error.stack || error);
      await this.logError(error, { userId, message, location: 'processTextMessage' });
      return { type: 'text', text: '❌ ขออภัยค่ะ เล้งไม่สามารถประมวลผลข้อความได้ในขณะนี้' };
    }
  }

  // [REFACTORED] Switched back to a more stable, stateless two-call pattern for tool use.
  async processGeneralQuery(message, userId) {
    if (!this.genAI) {
      return { type: 'text', text: '❌ ขออภัยครับ ขณะนี้ระบบ AI ขัดข้องชั่วคราว' };
    }

    try {
      const history = await this.getConversationHistory(userId);
      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        tools: this.tools,
        systemInstruction: this.getSystemPrompt(),
      });

      await this.logUsage('geminiApiHits');

      // Build the request with history
      const contents = [...history, { role: 'user', parts: [{ text: message }] }];
      const result = await model.generateContent({ contents });

      const response = result.response;
      if (!response) {
        throw new Error("Received no response from Gemini API.");
      }

      const functionCalls = response.functionCalls();

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        console.log(`🤖 Gemini wants to call a tool: ${call.name}`);

        if (call.name === 'Youtube') {
          await this.logUsage('youtubeProcessing');
          const { query } = call.args;
          const searchResults = await this.youtubeService.search(query);

          // Send the function response back to the model
          const result2 = await model.generateContent({
            contents: [
              ...contents, // Send original history and user message again
              { role: 'model', parts: [{ functionCall: call }] }, // Include the model's first turn
              { // Add the function response
                role: 'function',
                parts: [{
                  functionResponse: {
                    name: 'Youtube',
                    response: { results: searchResults },
                  },
                }],
              },
            ],
          });

          const finalText = result2.response.text();
          await this.saveConversationContext(userId, message, finalText);

          if (searchResults && searchResults.length > 0) {
            return this.createYouTubeCarousel(finalText, searchResults);
          }
          return { type: 'text', text: finalText };
        }
      }

      const text = response.text();
      if (text) {
        await this.saveConversationContext(userId, message, text);
        return { type: 'text', text: text };
      }

      throw new Error("Gemini response was empty or unhandled.");

    } catch (error) {
      console.error('General query processing error:', error);
      await this.logError(error, { userId, message, location: 'processGeneralQuery' });
      return { type: 'text', text: '❌ ขออภัยครับ เล้งพบปัญหาในการประมวลผล กรุณาลองใหม่อีกครั้ง' };
    }
  }

  // ... rest of the file (createYouTubeCarousel, processPostback, etc.) is correct and does not need changes ...
  createYouTubeCarousel(introText, videos) {
    const bubbles = videos.slice(0, 8).map(video => ({
      type: 'bubble',
      size: 'kilo',
      styles: { footer: { separator: true } },
      hero: { type: 'image', url: video.thumbnail, size: 'full', aspectRatio: '16:9', aspectMode: 'cover', action: { type: 'uri', label: 'Play Video', uri: video.url } },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md',
        contents: [
          { type: 'text', text: video.title, weight: 'bold', size: 'md', wrap: true, maxLines: 2, color: '#FFFFFF' },
          {
            type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md',
            contents: [
              { type: 'icon', url: 'https://i.imgur.com/bA15iIz.png', size: 'sm' },
              { type: 'text', text: video.channelTitle, color: '#d1d5db', size: 'sm', maxLines: 1, flex: 5 }
            ]
          },
          { type: 'text', text: video.description || 'No description available.', wrap: true, size: 'xs', color: '#9ca3af', maxLines: 3, margin: 'md' }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'button', action: { type: 'uri', label: 'ดูวิดีโอ (Watch)', uri: video.url }, style: 'primary', color: '#ff0000', height: 'sm', margin: 'none' }
        ]
      }
    }));
    return [{ type: 'text', text: introText }, { type: 'flex', altText: 'ผลการค้นหาวิดีโอจาก YouTube', contents: { type: 'carousel', contents: bubbles } }];
  }
  async processPostback(data, userId) {
    await this.logUsage('lineOaEvents');
    try {
      await this.clearContextState(userId);
      const parts = data.split('_');
      const cityPayload = parts.slice(parts.length > 2 ? 2 : 1).join('_');
      const city = this.weatherService.extractCityFromQuery(cityPayload);
      if (city) await this.setContextState(userId, { lastMentionedCity: city.name });
      if (data.startsWith('weekly_forecast_')) return this.weatherService.getWeeklyForecast(data);
      if (data.startsWith('hourly_forecast_')) return this.weatherService.getHourlyForecast(data);
      if (data.startsWith('daily_detail_')) return this.weatherService.getDailyDetailForecast(data);
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: this.getSystemPrompt() });
      const prompt = `User pressed a button with data: "${data}". Respond accordingly.`;
      await this.logUsage('geminiApiHits');
      const result = await model.generateContent(prompt);
      return { type: 'text', text: result.response.text() };
    } catch (error) {
      console.error('Postback processing error:', error);
      return { type: 'text', text: '❌ ขออภัยค่ะ ไม่สามารถประมวลผลการเลือกได้' };
    }
  }
  async processImageMessage(imageBuffer, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('imageProcessing');
    await this.logUsage('geminiApiHits');
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
  async processAudioMessage(audioBuffer, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('audioProcessing');
    await this.logUsage('geminiApiHits');
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
  async processVideoMessage(videoBuffer, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('videoProcessing');
    await this.logUsage('geminiApiHits');
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
  async processFileMessage(fileBuffer, fileName, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('fileProcessing');
    await this.logUsage('geminiApiHits');
    try {
      const result = await this.multimodal.analyzeDocument(fileBuffer, fileName, userId);
      await this.saveFileContext(userId, 'document', `Document: ${fileName}`);
      await this.saveConversationContext(userId, `[User sent a file: ${fileName}]`, result);
      return { type: 'text', text: `📄 **Summary from "<span class="math-inline">\{fileName\}"\:\*\*\\n\\n</span>{result}` };
    } catch (error) {
      console.error('File processing error:', error);
      return { type: 'text', text: `❌ Sorry, Leng could not read the document "${fileName}": ${error.message}` };
    }
  }
  async processLocationMessage(lat, lon, address, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('locationProcessing');
    try {
      const city = { lat, lon, name: address || 'Specified Location', timezone: 'Asia/Bangkok' };
      const weatherData = await this.weatherService.fetchOneCallApiData(lat, lon);
      const weatherResponse = this.weatherService.formatCurrentWeather(weatherData, city);
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: this.getSystemPrompt() });
      const prompt = `User sent a location: ${city.name}\n\nProvide helpful information about this location.`;
      await this.logUsage('geminiApiHits');
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      await this.saveConversationContext(userId, `[User sent a location: ${city.name}]`, responseText);
      return [{ type: 'text', text: `📍 **About Your Location:**\n\n${responseText}` }, weatherResponse];
    } catch (error) {
      console.error('Location processing error:', error);
      return { type: 'text', text: '❌ Sorry, could not process the location.' };
    }
  }
  isContextualWeatherQuery(message) {
    const contextualKeywords = ['พรุ่งนี้', 'มะรืน', 'รายสัปดาห์', 'รายชั่วโมง', 'แล้วพรุ่งนี้', 'แล้วอันนี้', 'แล้ว...', 'tomorrow', 'weekly', 'hourly'];
    const lowerMessage = message.toLowerCase();
    return contextualKeywords.some(keyword => lowerMessage.includes(keyword));
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
  async saveConversationContext(userId, userMessage, aiResponse) {
    try {
      const conversationRef = this.db.collection('conversations').doc(userId);
      const doc = await conversationRef.get();
      let conversations = (doc.exists && doc.data().messages) ? doc.data().messages : [];
      const timestamp = new Date().toISOString();
      let readableAiResponse;
      if (typeof aiResponse === 'object' && aiResponse.type === 'flex') {
        readableAiResponse = aiResponse.altText || '[Flex Message]';
      } else if (Array.isArray(aiResponse)) {
        readableAiResponse = aiResponse.map(r => (typeof r === 'object' && r.altText) ? r.altText : '[Complex Response]').join(', ');
      } else if (typeof aiResponse === 'object') {
        readableAiResponse = '[Object Response]';
      } else {
        readableAiResponse = aiResponse;
      }
      conversations.push({
        userMessage: userMessage,
        aiResponse: readableAiResponse,
        timestamp: timestamp,
      });
      if (conversations.length > 20) {
        conversations = conversations.slice(-20);
      }
      await conversationRef.set({ messages: conversations, lastUpdated: new Date() }, { merge: true });
    } catch (error) {
      console.error('Error saving conversation context:', error);
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
  async processYouTubeLink(url, userId) {
    try {
      console.log(`Processing YouTube link: ${url}`);
      await this.logUsage('youtubeProcessing');
      await this.logUsage('geminiApiHits');
      const transcript = await YoutubeTranscript.fetchTranscript(url, { lang: 'en' });
      const transcriptText = transcript.map(t => t.text).join(' ');
      if (!transcriptText) {
        return { type: 'text', text: '✅ เล้งเห็นลิงก์ YouTube แล้ว แต่ไม่พบบทบรรยายในวิดีโอนี้ครับ เลยสรุปให้ไม่ได้' };
      }
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: this.getSystemPrompt() });
      const prompt = `## Task: Summarize YouTube Video
      - You are given a transcript from a YouTube video.
      - Your task is to summarize the key points of the video in clear, easy-to-read bullet points.
      - Respond in the user's language (assume Thai unless context suggests otherwise).
      - Start with a confirmation like "✅ เล้งสรุปวิดีโอมาให้แล้วครับ:"
      - Keep it concise and informative.
      ## Video Transcript
      ${transcriptText.substring(0, 15000)}
      ## User's Request
      Summarize this video.`;
      const result = await model.generateContent(prompt);
      const summary = result.response.text();
      const flexMessage = {
        type: 'flex',
        altText: 'สรุปเนื้อหาวิดีโอจาก YouTube',
        contents: {
          type: 'bubble',
          hero: {
            type: 'image',
            url: 'https://firebasestorage.googleapis.com/v0/b/ryuestai.appspot.com/o/youtube_summary_banner.png?alt=media&token=c2306fc6-d188-4e89-9a7c-6196b29f79bd',
            size: 'full',
            aspectRatio: '20:13',
            aspectMode: 'cover',
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              { type: 'text', text: 'สรุปวิดีโอ YouTube', weight: 'bold', size: 'xl' },
              {
                type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                contents: [
                  {
                    type: 'box', layout: 'baseline', spacing: 'sm',
                    contents: [
                      { type: 'text', text: summary, wrap: true, color: '#666666', size: 'sm', flex: 5 }
                    ]
                  }
                ]
              }
            ]
          },
          footer: {
            type: 'box', layout: 'vertical', spacing: 'sm',
            contents: [
              {
                type: 'button', style: 'link', height: 'sm',
                action: { type: 'uri', label: 'เปิดวิดีโอ', uri: url }
              }
            ]
          }
        }
      };
      await this.saveConversationContext(userId, `[User sent YouTube link: ${url}]`, summary);
      return flexMessage;
    } catch (error) {
      console.error('YouTube processing error:', error);
      await this.logError(error, { userId, url, location: 'processYouTubeLink' });
      const errorMessage = {
        type: 'flex',
        altText: 'ไม่สามารถประมวลผลวิดีโอได้',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: 'เกิดข้อผิดพลาด', weight: 'bold', size: 'lg', color: '#FF0000' },
              { type: 'text', text: 'ขออภัยครับ เล้งไม่สามารถสรุปเนื้อหาจากวิดีโอนี้ได้ อาจเป็นเพราะวิดีโอไม่มีบทบรรยายหรือเป็นวิดีโอส่วนตัวครับ', wrap: true, margin: 'md' }
            ]
          },
          footer: {
            type: 'box', layout: 'vertical',
            contents: [{
              type: 'button',
              action: { type: 'uri', label: 'ลองเปิดวิดีโอด้วยตัวเอง', uri: url },
              style: 'primary',
              height: 'sm'
            }]
          }
        }
      };
      return errorMessage;
    }
  }
}

module.exports = LangAI;