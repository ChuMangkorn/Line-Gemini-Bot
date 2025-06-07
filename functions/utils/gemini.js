const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { getCurrentTime } = require("./time");

let EnhancedWeather;
try {
  EnhancedWeather = require("./weather-enhanced");
  console.log("✅ EnhancedWeather imported successfully");
} catch (error) {
  console.error("❌ Failed to import EnhancedWeather:", error.message);
  EnhancedWeather = null;
}

class Gemini {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    if (EnhancedWeather && typeof EnhancedWeather === 'function') {
      try {
        this.enhancedWeather = new EnhancedWeather();
        console.log("✅ EnhancedWeather instance created successfully");
      } catch (error) {
        console.error("❌ Failed to create EnhancedWeather instance:", error.message);
        this.enhancedWeather = null;
      }
    } else {
      this.enhancedWeather = null;
    }
    
    const tools = [{
      functionDeclarations: [
        {
          name: "getCurrentTime",
          description: "ดึงข้อมูลเวลาปัจจุบัน",
          parameters: {
            type: "OBJECT",
            properties: {
              timezone: { 
                type: "STRING", 
                description: "Timezone เช่น 'Asia/Bangkok', 'Asia/Tokyo'",
                default: "Asia/Bangkok"
              }
            }
          }
        }
      ]
    }];

    // เพิ่ม weather functions ทั้งหมด
    if (this.enhancedWeather) {
      tools[0].functionDeclarations.push(
        {
          name: "getCurrentWeather",
          description: "ดึงข้อมูลสภาพอากาศปัจจุบัน",
          parameters: {
            type: "OBJECT",
            properties: {
              city: { 
                type: "STRING", 
                description: "ชื่อเมือง เช่น 'โอตารุ', 'อุสึโนะมิยะ', 'กรุงเทพ'" 
              }
            },
            required: ["city"]
          }
        },
        {
          name: "get8DayForecast",
          description: "ดึงข้อมูลพยากรณ์อากาศ 8 วันข้างหน้า รวมถึงพรุ่งนี้และสัปดาหน้า",
          parameters: {
            type: "OBJECT",
            properties: {
              city: { 
                type: "STRING", 
                description: "ชื่อเมือง เช่น 'โอตารุ', 'อุสึโนะมิยะ', 'กรุงเทพ'" 
              }
            },
            required: ["city"]
          }
        }
      );
      console.log("✅ Weather function declarations added (current + 8-day forecast)");
    }

    const systemInstruction = `คุณคือ "เล้ง" ผู้ช่วย AI ภาษาไทยอัจฉริยะที่เชี่ยวชาญด้านสภาพอากาศ

# บทบาทหลัก
1. ⏰ **ผู้เชี่ยวชาญเวลา** - ใช้ getCurrentTime สำหรับเวลาปัจจุบัน
${this.enhancedWeather ? `2. 🌦️ **ผู้เชี่ยวชาญสภาพอากาศ** - มีความสามารถ:
   - ใช้ getCurrentWeather สำหรับสภาพอากาศปัจจุบัน
   - ใช้ get8DayForecast สำหรับพยากรณ์อากาศ 8 วันข้างหน้า (รวมพรุ่งนี้)` : '2. 🌦️ ตอบคำถามอากาศด้วยความรู้ทั่วไป'}
3. 🧠 **ผู้ช่วยอัจฉริยะ** - ตอบคำถามทั่วไปได้ทุกเรื่อง

# การใช้งานเครื่องมือ
${this.enhancedWeather ? `- **สำหรับคำถามอากาศปัจจุบัน**: "อากาศโอตารุตอนนี้" → ใช้ getCurrentWeather
- **สำหรับพยากรณ์อากาศ**: "พรุ่งนี้", "สัปดาหน้า", "อากาศโอตารุ 8 วัน" → ใช้ get8DayForecast
- **สำหรับเวลา**: ใช้ getCurrentTime` : '- **สำหรับเวลา**: ใช้ getCurrentTime'}

# กฎการทำงาน
1. เมื่อถูกถามถึงผู้สร้าง → "ฉันชื่อมังกรไงจะใครละ 🐉"
2. เมื่อถูกถามเกี่ยวกับ "พรุ่งนี้", "สัปดาหน้า", "หลายวัน","อาทิตย์หน้า" → ใช้ get8DayForecast
3. เมื่อถูกถามเกี่ยวกับ "ตอนนี้", "วันนี้" → ใช้ getCurrentWeather
4. ใช้ภาษาไทยที่เป็นธรรมชาติและสุภาพเสมอ`;

    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemInstruction,
      tools: tools,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    });
  }

  async multimodal(prompt, history = [], userId = 'unknown') {
    try {
      const startTime = Date.now();
      const chat = this.model.startChat({ history });
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      const functionCalls = response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        
        if (call.name === "getCurrentTime") {
          const timezone = call.args.timezone || 'Asia/Bangkok';
          const timeData = getCurrentTime(timezone);

          const result2 = await chat.sendMessage([{
            functionResponse: {
              name: "getCurrentTime",
              response: timeData
            }
          }]);
          
          const endTime = Date.now();
          this.logUsage(userId, prompt, result2.response.text(), endTime - startTime, result2.response);
          return { text: result2.response.text() };
        }

        if (call.name === "getCurrentWeather" && this.enhancedWeather) {
          const city = call.args.city;
          console.log("🌤️ Calling getCurrentWeather for:", city);
          
          const weatherData = await this.enhancedWeather.getCurrentWeather(city);

          const result2 = await chat.sendMessage([{
            functionResponse: {
              name: "getCurrentWeather",
              response: weatherData
            }
          }]);
          
          const endTime = Date.now();
          this.logUsage(userId, prompt, result2.response.text(), endTime - startTime, result2.response);
          return { text: result2.response.text() };
        }

        // ⭐ เพิ่มการจัดการ 8-day forecast
        if (call.name === "get8DayForecast" && this.enhancedWeather) {
          const city = call.args.city;
          console.log("🌦️ Calling get8DayForecast for:", city);
          
          const forecastData = await this.enhancedWeather.get8DayForecast(city);

          const result2 = await chat.sendMessage([{
            functionResponse: {
              name: "get8DayForecast",
              response: forecastData
            }
          }]);
          
          const endTime = Date.now();
          this.logUsage(userId, prompt, result2.response.text(), endTime - startTime, result2.response);
          
          // ส่งทั้ง text และ rich content
          return { 
            text: result2.response.text(),
            richContent: this.enhancedWeather.create8DayFlexMessage(forecastData)
          };
        }
      }
      
      const endTime = Date.now();
      this.logUsage(userId, prompt, response.text(), endTime - startTime, response);
      return { text: response.text() };
    } catch (error) {
      console.error("❌ GEMINI_ERROR:", error.message);
      throw error;
    }
  }

  logUsage(userId, prompt, responseText, latency, response) {
    const usageData = {
      timestamp: new Date().toISOString(),
      userId: userId,
      model: "gemini-2.0-flash",
      promptLength: prompt.length,
      responseLength: responseText.length,
      latency: latency,
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      responseTokens: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata?.totalTokenCount || 0
    };
    
    console.log("🤖 GEMINI_USAGE:", JSON.stringify(usageData));
  }
}

module.exports = new Gemini();
