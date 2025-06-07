const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const admin = require("firebase-admin");
const express = require("express");
const request = require("./utils/request");
const gemini = require("./utils/gemini");
const UsageReport = require('./utils/report');

admin.initializeApp();
const db = admin.firestore();
console.log("🚀 Starting LINE Bot...");
console.log("📝 Environment check:");
console.log("- GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "✅ Found" : "❌ Missing");
console.log("- OPENWEATHER_API_KEY:", process.env.OPENWEATHER_API_KEY ? "✅ Found" : "❌ Missing");
console.log("- CHANNEL_ACCESS_TOKEN:", process.env.CHANNEL_ACCESS_TOKEN ? "✅ Found" : "❌ Missing");


setGlobalOptions({ 
  region: "asia-southeast1", 
  secrets: ["CHANNEL_ACCESS_TOKEN", "GEMINI_API_KEY", "OPENWEATHER_API_KEY"] 
});

const app = express();

// ฟังก์ชันสำหรับทำความสะอาด History
const sanitizeHistory = (history) => {
  if (!history || !Array.isArray(history)) return [];
  
  const filtered = history.filter(item => 
    item.role === 'user' || item.role === 'model'
  );
  
  while (filtered.length > 0 && filtered[0].role !== 'user') {
    filtered.shift();
  }
  
  return filtered.filter(item => 
    item.parts && 
    Array.isArray(item.parts) && 
    item.parts.length > 0 &&
    item.parts.every(part => part.text)
  );
};

const getHistory = async (userId) => {
  try {
    const sessionRef = db.collection('chat_sessions').doc(userId);
    const doc = await sessionRef.get();
    const rawHistory = doc.exists ? doc.data().history || [] : [];
    return sanitizeHistory(rawHistory);
  } catch (error) {
    console.error("Get history error:", error);
    return [];
  }
};

const saveHistory = async (userId, history) => {
  try {
    const sessionRef = db.collection('chat_sessions').doc(userId);
    const cleanHistory = sanitizeHistory(history);
    await sessionRef.set({ history: cleanHistory.slice(-10) }, { merge: true });
  } catch (error) {
    console.error("Save history error:", error);
  }
};

const saveDailyUsage = async (userId, geminiData, lineData) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const usageRef = db.collection('usage_stats').doc(`${today}_${userId}`);
    
    const existingData = await usageRef.get();
    const current = existingData.exists ? existingData.data() : {
      geminiCalls: 0,
      lineCalls: 0,
      totalTokens: 0,
      totalLatency: 0,
      callCount: 0
    };

    await usageRef.set({
      date: today,
      userId: userId,
      geminiCalls: current.geminiCalls + (geminiData?.calls || 0),
      lineCalls: current.lineCalls + (lineData?.calls || 0),
      totalTokens: current.totalTokens + (geminiData?.tokens || 0),
      totalLatency: current.totalLatency + (geminiData?.latency || 0),
      callCount: current.callCount + 1,
      avgLatency: Math.round((current.totalLatency + (geminiData?.latency || 0)) / (current.callCount + 1)),
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error("Save usage error:", error);
  }
};

app.post("/webhook", async (req, res) => {
  console.log("📨 Webhook received:", req.body?.events?.length || 0, "events");
  
  if (!req.body || !req.body.events || req.body.events.length === 0) {
    return res.status(200).send("OK");
  }

  try {
    for (const event of req.body.events) {
      console.log("🔄 Processing event:", event.type, event.message?.type);
      
      if (event.type !== "message" || event.message.type !== "text") continue;

      const userId = event.source.userId;
      const prompt = event.message.text;
      
      console.log("👤 User:", userId.substring(0, 8) + "...", "Message:", prompt);
      
      await request.loading(userId);

      const history = await getHistory(userId);
      console.log("📚 History loaded:", history.length, "items");
      
      const { text, richContent } = await gemini.multimodal(prompt, history, userId);
      console.log("🤖 Gemini response length:", text.length);
      
      const newHistory = [
        ...history, 
        { role: "user", parts: [{ text: prompt }] }, 
        { role: "model", parts: [{ text }] }
      ];
      await saveHistory(userId, newHistory);

      const messages = [{ type: "text", text }];
      if (richContent) {
        messages.push(richContent);
        console.log("🎨 Rich content added");
      }

      await request.reply(event.replyToken, messages, userId);
      console.log("✅ Reply sent successfully");
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook Error Details:");
    console.error("- Message:", error.message);
    console.error("- Stack:", error.stack);
    console.error("- Name:", error.name);
    
    const lastEvent = req.body.events[req.body.events.length - 1];
    if (lastEvent && lastEvent.replyToken) {
      try {
        await request.reply(lastEvent.replyToken, [{ 
          type: "text", 
          text: "ขออภัยค่ะ มีข้อผิดพลาดในระบบ กรุณาลองใหม่ในอีกสักครู่" 
        }], lastEvent.source.userId);
      } catch (replyError) {
        console.error("❌ Reply error:", replyError);
      }
    }
    res.status(500).send("Internal Server Error");
  }
});

// Report endpoints
app.get("/report", async (req, res) => {
  try {
    const report = new UsageReport();
    const data = await report.getDailyUsage();
    
    if (!data) {
      return res.status(404).send('ไม่พบข้อมูลการใช้งาน');
    }

    const htmlReport = await report.generateHTMLReport(data);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlReport);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/report/json", async (req, res) => {
  try {
    const report = new UsageReport();
    const date = req.query.date;
    const data = await report.getDailyUsage(date);
    
    if (!data) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลการใช้งาน' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.lineBot = onRequest(app);
