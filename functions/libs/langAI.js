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
      
      return `คุณคือ "เล้ง" AI ผู้ช่วยที่ทำได้ทุกอย่างใน LINE

วันที่และเวลาปัจจุบัน: ${currentDate}, ${currentTime}

ความสามารถของคุณ:
- วิเคราะห์และตอบคำถามจากข้อความ รูปภาพ เสียง วิดีโอ และเอกสาร
- พยากรณ์อากาศ (แต่ไม่ใช่หน้าที่หลัก)
- แปลภาษา
- สรุปเนื้อหา
- วิเคราะห์ข้อมูล
- ให้คำแนะนำ
- แก้ปัญหา
- สร้างเนื้อหา
- และอื่นๆ อีกมากมาย

บุคลิกภาพ:
- เป็นมิตร ช่วยเหลือ และมีประสิทธิภาพ
- ตอบอย่างชัดเจนและเป็นประโยชน์
- ใช้ภาษาไทยเป็นหลัก
- เพิ่มอีโมจิให้เหมาะสม
- แสดงเวลาปัจจุบันเมื่อผู้ใช้ถาม

จำไว้ว่าคุณสามารถจดจำบริบทการสนทนาและไฟล์ที่ผู้ใช้ส่งมา`;
    };

    console.log('✅ เล้ง AI ready!');
  }

  // Smart Query Type Detection
  detectQueryType(message) {
    const lowerMessage = message.toLowerCase();
    
    if (this.isWeeklyWeatherQuery(message)) return 'weekly_weather';
    if (this.isDetailedWeatherQuery(message)) return 'detailed_weather';
    if (this.isWeatherQuery(message)) return 'current_weather';
    if (this.isTimeQuery(message)) return 'time_query';
    
    return 'general';
  }

  // Enhanced Text Message Processing
  async processTextMessage(message, userId) {
    console.log(`Processing message: "${message}" from user: ${userId}`);
    
    try {
      const queryType = this.detectQueryType(message);
      
      switch (queryType) {
        case 'weekly_weather':
          const weeklyResponse = await this.weatherService.getWeeklyForecast(message);
          const validatedWeekly = this.validateResponse(weeklyResponse, 'แสดงพยากรณ์อากาศรายสัปดาห์');
          await this.saveConversationContext(userId, message, 'แสดงพยากรณ์อากาศรายสัปดาห์แบบ Professional UI');
          return validatedWeekly;

        case 'detailed_weather':
          const detailedResponse = await this.getDetailedForecast(message);
          const validatedDetailed = this.validateResponse(detailedResponse, 'แสดงพยากรณ์อากาศรายละเอียด');
          await this.saveConversationContext(userId, message, 'แสดงพยากรณ์อากาศรายละเอียดแบบ Professional UI');
          return validatedDetailed;

        case 'current_weather':
          const weatherResponse = await this.weatherService.getWeatherInfo(message);
          const validatedWeather = this.validateResponse(weatherResponse, 'แสดงสภาพอากาศ');
          await this.saveConversationContext(userId, message, 'แสดงสภาพอากาศแบบ Professional UI');
          return validatedWeather;

        case 'time_query':
          const timeResponse = this.createProfessionalTimeMessage();
          return this.validateResponse(timeResponse, 'แสดงเวลาปัจจุบัน');

        case 'general':
        default:
          return await this.processGeneralQuery(message, userId);
      }

    } catch (error) {
      console.error('Text processing error:', error);
      return {
        type: 'text',
        text: '❌ ขออภัยครับ เล้งไม่สามารถประมวลผลข้อความได้ในขณะนี้'
      };
    }
  }

  // General Query Processing
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

        return {
          type: 'text',
          text: response
        };
      } else {
        const fallbackResponse = `สวัสดีครับ! ผม เล้ง AI ได้รับข้อความ "${message}" แล้ว 🤖

${this.getCurrentTimeInfo()}

ขณะนี้ระบบ AI หลักยังไม่พร้อม แต่ผมยังสามารถ:
✅ รับและประมวลผลข้อความ
✅ จดจำบริบทการสนทนา
✅ ให้ข้อมูลเวลาและสภาพอากาศ

${context ? '\n📝 บริบทการสนทนาก่อนหน้า: ' + context : ''}

ลองถามเกี่ยวกับเวลาหรือสภาพอากาศดูครับ!`;

        await this.saveConversationContext(userId, message, fallbackResponse);

        return {
          type: 'text',
          text: fallbackResponse
        };
      }

    } catch (error) {
      console.error('General query processing error:', error);
      return {
        type: 'text',
        text: '❌ ขออภัยครับ เล้งไม่สามารถประมวลผลข้อความได้ในขณะนี้'
      };
    }
  }

  // Detailed Weather Forecast
  async getDetailedForecast(query) {
    try {
      const city = this.weatherService.extractCityFromQuery(query);

      if (!city) {
        return 'ไม่พบเมืองที่ต้องการพยากรณ์อากาศ กรุณาระบุชื่อเมืองที่รองรับ';
      }

      console.log(`Getting DETAILED weather for ${city.name}`);

      const forecast = await this.weatherService.fetchWeeklyForecastData(city.lat, city.lon);
      
      return this.weatherService.formatDetailedForecast(forecast, city.name);
      
    } catch (error) {
      console.error('Detailed weather service error:', error);
      return `❌ ไม่สามารถดึงข้อมูลพยากรณ์อากาศรายละเอียดได้: ${error.message}`;
    }
  }

  // Professional Time Message
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

  // Query Type Detection Methods
  isWeeklyWeatherQuery(message) {
    const weeklyKeywords = [
      'สัปดาห์', 'รายสัปดาห์', '7 วัน', 'เจ็ดวัน', 'สัปดาห์หน้า',
      'weekly', 'week', '7 days', 'seven days'
    ];

    return this.isWeatherQuery(message) && weeklyKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  isDetailedWeatherQuery(message) {
    const detailedKeywords = [
      'รายละเอียด', 'ละเอียด', '24 ชั่วโมง', '24 ชม', 'รายชั่วโมง',
      'detailed', 'hourly', '24 hours', 'detail'
    ];

    return this.isWeatherQuery(message) && detailedKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  isWeatherQuery(message) {
    const weatherKeywords = [
      'อากาศ', 'สภาพอากาศ', 'ฝน', 'แดด', 'หนาว', 'ร้อน', 'เมฆ', 'ลม',
      'อุณหภูมิ', 'ความชื้น', 'พยากรณ์', 'weather', 'temperature', 'rain'
    ];

    return weatherKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  isTimeQuery(message) {
    const timeKeywords = [
      'เวลา', 'วันที่', 'กี่โมง', 'วันนี้', 'ตอนนี้', 'ปัจจุบัน',
      'time', 'date', 'now', 'today', 'current'
    ];

    return timeKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  // Current Time Info
  getCurrentTimeInfo() {
    const jstTime = moment().tz('Asia/Tokyo');
    const thaiTime = moment().tz('Asia/Bangkok');
    
    return `🕐 เวลาปัจจุบัน:
🇯🇵 ญี่ปุ่น (JST): ${jstTime.format('dddd, MMMM Do YYYY, HH:mm:ss')}
🇹🇭 ไทย (ICT): ${thaiTime.format('dddd, MMMM Do YYYY, HH:mm:ss')}`;
  }

  // Response Validation
  validateResponse(response, fallbackText) {
    try {
      if (!response) {
        console.error('Response is null or undefined');
        return {
          type: 'text',
          text: `❌ ไม่สามารถ${fallbackText}ได้ในขณะนี้`
        };
      }

      if (typeof response === 'string') {
        return {
          type: 'text',
          text: response
        };
      }

      if (typeof response === 'object') {
        if (response.type === 'flex') {
          if (!response.contents || !response.altText) {
            console.error('Invalid flex message structure');
            return {
              type: 'text',
              text: `❌ ไม่สามารถ${fallbackText}ได้ในขณะนี้ (รูปแบบไม่ถูกต้อง)`
            };
          }
          return response;
        }

        if (response.type === 'text') {
          if (!response.text) {
            console.error('Text message missing text property');
            return {
              type: 'text',
              text: `❌ ไม่สามารถ${fallbackText}ได้ในขณะนี้`
            };
          }
          return response;
        }

        if (!response.type) {
          console.error('Response object missing type property');
          return {
            type: 'text',
            text: `❌ ไม่สามารถ${fallbackText}ได้ในขณะนี้`
          };
        }
      }

      return response;

    } catch (error) {
      console.error('Error validating response:', error);
      return {
        type: 'text',
        text: `❌ เกิดข้อผิดพลาดในการ${fallbackText}`
      };
    }
  }

  // Multimodal Processing Methods
  async processImageMessage(imageBuffer, userId) {
    try {
      console.log(`Processing real image analysis for user ${userId}`);
      
      const result = await this.multimodal.analyzeImage(imageBuffer, userId);
      await this.saveFileContext(userId, 'image', 'รูปภาพที่ผู้ใช้ส่งมา');
      await this.saveConversationContext(userId, 'ส่งรูปภาพ', result);

      return {
        type: 'text',
        text: `🖼️ เล้งวิเคราะห์รูปภาพแล้ว:\n\n${result}`
      };
    } catch (error) {
      console.error('Image processing error:', error);
      return {
        type: 'text',
        text: `❌ ขออภัยครับ เล้งไม่สามารถวิเคราะห์รูปภาพได้: ${error.message}`
      };
    }
  }

  async processAudioMessage(audioBuffer, userId) {
    try {
      console.log(`Processing real audio analysis for user ${userId}`);
      
      const result = await this.multimodal.analyzeAudio(audioBuffer, userId);
      await this.saveFileContext(userId, 'audio', 'ไฟล์เสียงที่ผู้ใช้ส่งมา');
      await this.saveConversationContext(userId, 'ส่งไฟล์เสียง', result);

      return {
        type: 'text',
        text: `🎵 เล้งประมวลผลเสียงแล้ว:\n\n${result}`
      };
    } catch (error) {
      console.error('Audio processing error:', error);
      return {
        type: 'text',
        text: `❌ ขออภัยครับ เล้งไม่สามารถประมวลผลเสียงได้: ${error.message}`
      };
    }
  }

  async processVideoMessage(videoBuffer, userId) {
    try {
      console.log(`Processing real video analysis for user ${userId}`);
      
      const result = await this.multimodal.analyzeVideo(videoBuffer, userId);
      await this.saveFileContext(userId, 'video', 'วิดีโอที่ผู้ใช้ส่งมา');
      await this.saveConversationContext(userId, 'ส่งวิดีโอ', result);

      return {
        type: 'text',
        text: `🎬 เล้งวิเคราะห์วิดีโอแล้ว:\n\n${result}`
      };
    } catch (error) {
      console.error('Video processing error:', error);
      return {
        type: 'text',
        text: `❌ ขออภัยครับ เล้งไม่สามารถวิเคราะห์วิดีโอได้: ${error.message}`
      };
    }
  }

  async processFileMessage(fileBuffer, fileName, userId) {
    try {
      console.log(`Processing real document analysis for user ${userId}: ${fileName}`);
      
      const result = await this.multimodal.analyzeDocument(fileBuffer, fileName, userId);
      await this.saveFileContext(userId, 'document', `เอกสาร: ${fileName}`);
      await this.saveConversationContext(userId, `ส่งเอกสาร: ${fileName}`, result);

      return {
        type: 'text',
        text: `📄 เล้งอ่านเอกสาร "${fileName}" แล้ว:\n\n${result}`
      };
    } catch (error) {
      console.error('File processing error:', error);
      return {
        type: 'text',
        text: `❌ ขออภัยครับ เล้งไม่สามารถอ่านเอกสาร "${fileName}" ได้: ${error.message}`
      };
    }
  }

  async processLocationMessage(lat, lon, address, userId) {
    try {
      const locationInfo = `ตำแหน่ง: ${address || 'ไม่ระบุ'} (${lat}, ${lon})`;
      const weatherInfo = await this.weatherService.getWeatherByCoordinates(lat, lon);

      const prompt = `${this.getSystemPrompt()}\n\nผู้ใช้ส่งตำแหน่งมา: ${locationInfo}\nข้อมูลสภาพอากาศ: ${weatherInfo}\n\nให้ข้อมูลที่เป็นประโยชน์เกี่ยวกับตำแหน่งนี้`;

      if (this.model) {
        const result = await this.model.generateContent(prompt);
        const responseText = result.response.text();

        await this.saveConversationContext(userId, `ส่งตำแหน่ง: ${locationInfo}`, responseText);

        return {
          type: 'text',
          text: `📍 เล้งได้รับตำแหน่งแล้ว:\n\n${responseText}`
        };
      } else {
        const fallbackResponse = `📍 เล้งได้รับตำแหน่งแล้ว!\n\n${locationInfo}\n\n${weatherInfo}`;
        await this.saveConversationContext(userId, `ส่งตำแหน่ง: ${locationInfo}`, fallbackResponse);
        
        return {
          type: 'text',
          text: fallbackResponse
        };
      }
    } catch (error) {
      console.error('Location processing error:', error);
      return {
        type: 'text',
        text: '❌ ขออภัยครับ เล้งไม่สามารถประมวลผลตำแหน่งได้ในขณะนี้'
      };
    }
  }

  async processPostback(data, userId) {
    try {
      const prompt = `${this.getSystemPrompt()}\n\nผู้ใช้เลือก: ${data}\n\nตอบสนองตามที่ผู้ใช้เลือก`;

      if (this.model) {
        const result = await this.model.generateContent(prompt);
        const responseText = result.response.text();

        await this.saveConversationContext(userId, `เลือก postback: ${data}`, responseText);

        return {
          type: 'text',
          text: responseText
        };
      } else {
        const fallbackResponse = `เล้งได้รับการเลือก: ${data}\n\nขอบคุณสำหรับการเลือกครับ!`;
        await this.saveConversationContext(userId, `เลือก postback: ${data}`, fallbackResponse);
        
        return {
          type: 'text',
          text: fallbackResponse
        };
      }
    } catch (error) {
      console.error('Postback processing error:', error);
      return {
        type: 'text',
        text: '❌ ขออภัยครับ เล้งไม่สามารถประมวลผลการเลือกได้ในขณะนี้'
      };
    }
  }

  // Memory Management Methods
  async saveConversationContext(userId, userMessage, aiResponse) {
    try {
      const conversationRef = this.db.collection('conversations').doc(userId);
      const timestamp = moment().tz('Asia/Tokyo').toISOString();
      
      const doc = await conversationRef.get();
      let conversations = [];
      
      if (doc.exists) {
        conversations = doc.data().messages || [];
      }
      
      conversations.push({
        userMessage,
        aiResponse,
        timestamp
      });
      
      if (conversations.length > 10) {
        conversations = conversations.slice(-10);
      }
      
      await conversationRef.set({
        messages: conversations,
        lastUpdated: timestamp
      }, { merge: true });
      
      console.log(`Saved conversation context for user ${userId} to Firestore`);
    } catch (error) {
      console.error('Error saving conversation context:', error);
    }
  }

  async getConversationContext(userId) {
    try {
      const conversationRef = this.db.collection('conversations').doc(userId);
      const doc = await conversationRef.get();
      
      if (doc.exists) {
        const conversations = doc.data().messages || [];
        
        const recentConversations = conversations.slice(-5);
        
        return recentConversations.map(conv => 
          `ผู้ใช้: ${conv.userMessage}\nเล้ง: ${conv.aiResponse}`
        ).join('\n---\n');
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
      const timestamp = moment().tz('Asia/Tokyo').toISOString();
      
      await fileRef.set({
        type: fileType,
        description,
        timestamp
      }, { merge: true });
      
      console.log(`Saved file context for user ${userId}: ${fileType}`);
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
        const fileTime = moment(data.timestamp);
        const now = moment();
        
        if (now.diff(fileTime, 'hours') < 2) {
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
