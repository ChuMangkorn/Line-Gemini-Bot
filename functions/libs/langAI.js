const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const WeatherService = require('./weatherService');
const MultimodalProcessor = require('./multimodal');
const { YoutubeTranscript } = require('youtube-transcript');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const YouTubeService = require('./youtubeService');
const BrowserService = require('./browserService');

class LangAI {
  constructor(adminId, youtubeApiKey) {
    console.log('🤖 เล้ง AI initializing...');
    const tools = [
      {
        functionDeclarations: [
          {
            name: 'Youtube',
            description: 'Searches YouTube for videos based on a user\'s query and returns a list of relevant videos.',
            parameters: {
              type: 'OBJECT',
              properties: {
                query: {
                  type: 'STRING',
                  description: 'The search term for the YouTube video.'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'browseWebsite',
            description: 'Fetches the main text content of a public website from a given URL. Use this tool when a user provides a URL and asks to summarize, analyze, read, or get information from it.',
            parameters: {
              type: 'OBJECT',
              properties: {
                url: { type: 'STRING', description: 'The full URL of the website to browse.' }
              },
              required: ['url']
            }
          }
        ]
      }
    ];
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ];

    try {
      this.genAI = new GoogleGenerativeAI(geminiApiKey.value());
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash', tools: tools, safetySettings: safetySettings });
      console.log('✅ Gemini API connected successfully with custom safety settings.');
    } catch (error) {
      console.error('❌ Gemini API connection failed:', error);
      this.model = null;
    }

    this.db = admin.firestore();
    this.weatherService = new WeatherService();
    this.multimodal = new MultimodalProcessor();
    this.youtubeService = new YouTubeService(youtubeApiKey);
    this.browserService = new BrowserService();
    this.adminId = adminId;

    this.getSystemPrompt = () => {
      const currentTime = moment().tz('Asia/Tokyo').format('YYYY-MM-DD HH:mm:ss JST');
      const currentDate = moment().tz('Asia/Tokyo').format('dddd, MMMM Do YYYY');

      return `You are "Leng," a brilliant, multilingual AI assistant in LINE. Your name is "เล้ง".

      CRITICAL RULE: Language Protocol
      - You MUST ALWAYS respond in the same language as the user's last message.
      - Example 1: User says "Hello" -> You respond in English.
      - Example 2: User says "こんにちは" -> You respond in Japanese.
      - Example 3: User says "สบายดีไหม" -> You respond in Thai.
      - This is your highest priority rule. Do not break it.
      
      Core Persona & Principles
      - **Expert & Trustworthy:** Act as a polite, intelligent, and reliable expert.
      - **Accurate & Factual:** Provide fact-based information. If uncertain, state your limitations.
      - **Structured & Clear:** Format answers for readability using Markdown (headings, lists, bolding).
      - **Proactive & Helpful:** Anticipate user needs. Suggest relevant follow-up questions or additional information after answering.
      - **Purposeful Emojis:** Use emojis like ✅, 💡, ⚠️ to enhance meaning, not for decoration.
      
      Capabilities & Knowledge
      - **Current Date & Time:** ${currentDate}, ${currentTime} (JST).
      - **Contextual Memory:** You can recall previous messages and files in the current conversation to provide seamless and intelligent responses.
      - **Multimodal Analysis:** You are an expert at analyzing and answering questions about text, images, audio, video, and documents.
      - **Youtube:** You can search for YouTube videos when a user asks for a clip or video on a certain topic.
      - **Web Browse:** You can access and summarize content from any public website URL using your browseWebsite tool.
      - **Weather Forecasting:** You can provide detailed, accurate weather forecasts using the One Call API 3.0.
      - **General Knowledge:** You can answer a wide range of questions on various topics.`;
    };
    console.log('✅ เล้ง AI ready!');
  }

  // =================================================================
  //  ✨ Reporting & Usage Logging
  // =================================================================
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
        { type: 'text', text: `👤 ${convo.user} (${convo.time})`, color: '#AEB8C1', size: 'xs' },
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

  // =================================================================
  //  ✅ State, Context & Profile Management
  // =================================================================
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

  // =================================================================
  //  ✅ Main Processing Logic
  // =================================================================

  async processTextMessage(message, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);

    if (userId === this.adminId && message.trim().toLowerCase() === '/report') {
      return this.generateAdminReport();
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = message.match(urlRegex);
    if (urls && urls[0]) {
      const url = urls[0];
      if (message.trim() === url) {
        console.log(`URL detected. Re-framing query for summarization: ${url}`);
        const explicitQuery = `ช่วยสรุปเนื้อหาจากลิงก์นี้ให้หน่อย: ${url}`;
        return this.processGeneralQuery(explicitQuery, userId);
      } else {
        return this.processGeneralQuery(message, userId);
      }
    }

    await this.logUsage('textProcessing');
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
        case 'weekly_weather':
        case 'hourly_weather':
          city = this.weatherService.extractCityFromQuery(message);
          await this.setContextState(userId, { lastMentionedCity: city.name });
          const weatherMethod = {
            'current_weather': this.weatherService.getCurrentWeather,
            'weekly_weather': this.weatherService.getWeeklyForecast,
            'hourly_weather': this.weatherService.getHourlyForecast
          }[queryType].bind(this.weatherService);
          return weatherMethod(message);
        case 'time_query':
          return this.createProfessionalTimeMessage();
        default:
          return this.processGeneralQuery(message, userId);
      }
    } catch (error) {
      console.error('Text processing error:', error.stack || error);
      await this.logError(error, { userId, message, location: 'processTextMessage' });
      return { type: 'text', text: '❌ ขออภัยค่ะ เล้งไม่สามารถประมวลผลข้อความได้ในขณะนี้' };
    }
  }

  async processGeneralQuery(message, userId) {
    try {
      const context = await this.getConversationContext(userId);
      const prompt = `${this.getSystemPrompt()}\n\n## Conversation Context\n${context || 'No previous conversation.'}\n\n## User's Query\n${message}`;

      await this.logUsage('geminiApiHits');
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const functionCalls = response.functionCalls();

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        let functionResponsePayload;

        if (call.name === 'browseWebsite') {
          console.log(`🤖 Gemini wants to browse: ${call.args.url}`);
          const { url } = call.args;
          try {
            const content = await this.browserService.browse(url);
            functionResponsePayload = { results: content };
          } catch (e) {
            functionResponsePayload = { error: e.message };
          }
        }
        else if (call.name === 'Youtube') {
          console.log(`🤖 Gemini wants to search YouTube: ${call.args.query}`);
          const { query } = call.args;
          const searchResults = await this.youtubeService.search(query);
          functionResponsePayload = { results: searchResults };
        }

        if (functionResponsePayload) {
          const result2 = await this.model.generateContent({
            contents: [
              { role: 'user', parts: [{ text: prompt }] },
              { role: 'model', parts: [{ functionCall: call }] },
              {
                role: 'function',
                parts: [{ functionResponse: { name: call.name, response: functionResponsePayload } }]
              }
            ]
          });
          const finalText = result2.response.text();
          await this.saveConversationContext(userId, message, finalText);

          if (call.name === 'Youtube' && functionResponsePayload.results?.length > 0) {
            return this.createYouTubeCarousel(finalText, functionResponsePayload.results);
          }
          return { type: 'text', text: finalText };
        }
      }

      const textResponse = response.text();
      await this.saveConversationContext(userId, message, textResponse);
      return { type: 'text', text: textResponse };

    } catch (error) {
      console.error('General query processing error:', error);
      await this.logError(error, { userId, message, location: 'processGeneralQuery' });
      return { type: 'text', text: '❌ ขออภัยค่ะ เล้งไม่สามารถประมวลผลข้อความได้' };
    }
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

      const prompt = `${this.getSystemPrompt()}\n\nUser pressed a button with data: "${data}". Respond accordingly.`;
      await this.logUsage('geminiApiHits');
      const result = await this.model.generateContent(prompt);
      return { type: 'text', text: result.response.text() };
    } catch (error) {
      console.error('Postback processing error:', error);
      await this.logError(error, { userId, data, location: 'processPostback' });
      return { type: 'text', text: '❌ ขออภัยค่ะ ไม่สามารถประมวลผลการเลือกได้' };
    }
  }

  async processImageMessage(imageBuffer, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('imageProcessing');
    await this.logUsage('geminiApiHits');
    try {
      const context = await this.getConversationContext(userId);
      const imageAnalysisPrompt = `${this.getSystemPrompt()}\n\n## Conversation Context\n${context || 'This is the beginning of the conversation.'}\n\n## User's Request\nThe user has sent an image. Please analyze it carefully, describe what you see, and provide any relevant information or insights.`;
      const result = await this.multimodal.analyzeImage(imageBuffer, userId, imageAnalysisPrompt);
      await this.saveFileContext(userId, 'image', 'User sent an image');
      await this.saveConversationContext(userId, '[User sent an image]', result);
      return { type: 'text', text: result };
    } catch (error) {
      console.error('Image processing error:', error);
      await this.logError(error, { userId, location: 'processImageMessage' });
      return { type: 'text', text: `❌ ขออภัยครับ เล้งไม่สามารถวิเคราะห์รูปภาพได้: ${error.message}` };
    }
  }

  async processAudioMessage(audioBuffer, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('audioProcessing');
    await this.logUsage('geminiApiHits');
    try {
      const context = await this.getConversationContext(userId);
      const audioAnalysisPrompt = `${this.getSystemPrompt()}\n\n## Conversation Context\n${context || 'This is the beginning of the conversation.'}\n\n## User's Request\nThe user has sent an audio clip. Please transcribe it, analyze its content, and provide a summary or answer any questions within it.`;
      const result = await this.multimodal.analyzeAudio(audioBuffer, userId, audioAnalysisPrompt);
      await this.saveFileContext(userId, 'audio', 'User sent an audio file');
      await this.saveConversationContext(userId, '[User sent an audio file]', result);
      return { type: 'text', text: result };
    } catch (error) {
      console.error('Audio processing error:', error);
      await this.logError(error, { userId, location: 'processAudioMessage' });
      return { type: 'text', text: `❌ ขออภัยครับ เล้งไม่สามารถประมวลผลไฟล์เสียงได้: ${error.message}` };
    }
  }

  async processVideoMessage(videoBuffer, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('videoProcessing');
    await this.logUsage('geminiApiHits');
    try {
      const context = await this.getConversationContext(userId);
      const videoAnalysisPrompt = `${this.getSystemPrompt()}\n\n## Conversation Context\n${context || 'This is the beginning of the conversation.'}\n\n## User's Request\nThe user has sent a video. Please analyze it frame by frame, describe the events, and summarize its content.`;
      const result = await this.multimodal.analyzeVideo(videoBuffer, userId, videoAnalysisPrompt);
      await this.saveFileContext(userId, 'video', 'User sent a video');
      await this.saveConversationContext(userId, '[User sent a video]', result);
      return { type: 'text', text: result };
    } catch (error) {
      console.error('Video processing error:', error);
      await this.logError(error, { userId, location: 'processVideoMessage' });
      return { type: 'text', text: `❌ ขออภัยครับ เล้งไม่สามารถวิเคราะห์วิดีโอได้: ${error.message}` };
    }
  }

  async processFileMessage(fileBuffer, fileName, userId, client) {
    await this.logUsage('lineOaEvents');
    await this.updateUserProfile(userId, client);
    await this.logUsage('fileProcessing');
    await this.logUsage('geminiApiHits');
    try {
      const context = await this.getConversationContext(userId);
      const documentAnalysisPrompt = `${this.getSystemPrompt()}\n\n## Conversation Context\n${context || 'This is the beginning of the conversation.'}\n\n## User's Request\nThe user has sent a document named "${fileName}". Please read it, summarize the key points, and answer any questions based on its content.`;
      const result = await this.multimodal.analyzeDocument(fileBuffer, fileName, userId, documentAnalysisPrompt);
      await this.saveFileContext(userId, 'document', `Document: ${fileName}`);
      await this.saveConversationContext(userId, `[User sent a file: ${fileName}]`, result);
      return { type: 'text', text: result };
    } catch (error) {
      console.error('File processing error:', error);
      await this.logError(error, { userId, fileName, location: 'processFileMessage' });
      return { type: 'text', text: `❌ ขออภัยครับ เล้งไม่สามารถอ่านเอกสาร "${fileName}" ได้: ${error.message}` };
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
      const prompt = `${this.getSystemPrompt()}\n\nUser sent a location: ${city.name}\n\nProvide helpful information about this location.`;
      await this.logUsage('geminiApiHits');
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      await this.saveConversationContext(userId, `[User sent a location: ${city.name}]`, responseText);
      return [{ type: 'text', text: `📍 **About Your Location:**\n\n${responseText}` }, weatherResponse];
    } catch (error) {
      console.error('Location processing error:', error);
      await this.logError(error, { userId, location: 'processLocationMessage' });
      return { type: 'text', text: '❌ Sorry, could not process the location.' };
    }
  }

  // =================================================================
  //  ✅ Helper & Utility Functions
  // =================================================================
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

  createYouTubeCarousel(introText, videos) {
    const bubbles = videos.slice(0, 5).map(video => ({
      type: 'bubble',
      size: 'kilo',
      hero: {
        type: 'image',
        url: video.thumbnail,
        size: 'full',
        aspectRatio: '16:9',
        aspectMode: 'cover',
        action: { type: 'uri', label: 'Play', uri: video.url }
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: video.title,
            weight: 'bold',
            size: 'sm',
            wrap: true,
            maxLines: 2
          },
          {
            type: 'box',
            layout: 'baseline',
            margin: 'md',
            contents: [
              { type: 'icon', url: 'https://firebasestorage.googleapis.com/v0/b/ryuestai.appspot.com/o/youtube_icon.png?alt=media&token=c29e6188-f5da-48b4-9c59-d8e78e475e7d', size: 'xs' },
              { type: 'text', text: video.channelTitle, size: 'xs', color: '#8c8c8c', margin: 'sm', maxLines: 1 }
            ]
          }
        ],
        spacing: 'sm',
        paddingAll: '12px'
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: { type: 'uri', label: 'ดูวิดีโอ', uri: video.url },
          style: 'primary',
          color: '#FF0000',
          height: 'sm'
        }]
      }
    }));

    return [
      { type: 'text', text: introText },
      {
        type: 'flex',
        altText: 'ผลการค้นหาวิดีโอจาก YouTube',
        contents: { type: 'carousel', contents: bubbles }
      }
    ];
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
      } else if (Array.isArray(aiResponse) && aiResponse.length > 0) {
        readableAiResponse = aiResponse.map(r => r.altText || r.text || '[Flex Message]').join(', ');
      } else if (typeof aiResponse === 'object') {
        readableAiResponse = aiResponse.text || '[Object Response]';
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

  async processYouTubeLink(url, userId) {
    try {
      console.log(`Processing YouTube link: ${url}`);
      await this.logUsage('youtubeProcessing');
      await this.logUsage('geminiApiHits');

      const transcript = await YoutubeTranscript.fetchTranscript(url, { lang: 'en' }).catch(() => []);

      let prompt;
      const systemPrompt = this.getSystemPrompt();

      if (transcript.length > 0) {
        const transcriptText = transcript.map(t => t.text).join(' ');
        prompt = `${systemPrompt}\n\n## Task: Summarize YouTube Video\n- You are given a transcript from a YouTube video.\n- Your task is to summarize the key points of the video in clear, easy-to-read bullet points.\n- Respond in the user's language (assume Thai unless context suggests otherwise).\n- Start with a confirmation like "✅ เล้งสรุปวิดีโอมาให้แล้วครับ:"\n- Keep it concise and informative.\n\n## Video Transcript\n${transcriptText.substring(0, 15000)}\n\n## User's Request\nSummarize this video.`;
      } else {
        prompt = `${systemPrompt}\n\n## Task: Acknowledge YouTube Link\n- The user has sent a YouTube link for which a transcript could not be found.\n- Inform the user politely that you see the link but cannot summarize it because there's no transcript available.\n- Respond in the user's language.\n\n## User's Request\nSummarize this video: ${url}`;
      }

      const result = await this.model.generateContent(prompt);
      const summary = result.response.text();
      await this.saveConversationContext(userId, `[User sent YouTube link: ${url}]`, summary);

      const flexMessage = {
        type: 'flex',
        altText: 'เกี่ยวกับวิดีโอ YouTube',
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
              { type: 'text', text: 'วิดีโอจาก YouTube', weight: 'bold', size: 'xl' },
              {
                type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                contents: [{
                  type: 'box', layout: 'baseline', spacing: 'sm',
                  contents: [{ type: 'text', text: summary, wrap: true, color: '#666666', size: 'sm', flex: 5 }]
                }]
              }
            ]
          },
          footer: {
            type: 'box', layout: 'vertical', spacing: 'sm',
            contents: [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดวิดีโอ', uri: url } }]
          }
        }
      };

      return flexMessage;

    } catch (error) {
      console.error('YouTube processing error:', error);
      await this.logError(error, { userId, url, location: 'processYouTubeLink' });
      return { type: 'text', text: 'ขออภัยครับ เล้งไม่สามารถประมวลผลลิงก์ YouTube นี้ได้ในขณะนี้' };
    }
  }
}

module.exports = LangAI;