const axios = require("axios");

class Request {
  getHeaders() {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
    };
  }
  
  async reply(replyToken, payload, userId = 'unknown') {
    try {
      const startTime = Date.now();
      const response = await axios({
        method: "post",
        url: "https://api.line.me/v2/bot/message/reply",
        headers: this.getHeaders(),
        data: { replyToken, messages: payload }
      });
      const endTime = Date.now();
      
      // 📊 บันทึก LINE API Usage
      const usageData = {
        timestamp: new Date().toISOString(),
        userId: userId,
        apiType: "reply",
        messageCount: payload.length,
        latency: endTime - startTime,
        status: response.status,
        // คำนวณขนาดข้อความ
        totalCharacters: payload.reduce((sum, msg) => sum + (msg.text?.length || 0), 0)
      };
      
      console.log("📱 LINE_USAGE:", JSON.stringify(usageData));
      
      return response;
    } catch (error) {
      console.error("❌ LINE_ERROR:", error.message);
      throw error;
    }
  }

  async loading(userId) {
    try {
      const startTime = Date.now();
      const response = await axios({
        method: "post",
        url: "https://api.line.me/v2/bot/chat/loading/start",
        headers: this.getHeaders(),
        data: { chatId: userId, loadingSeconds: 5 }
      });
      const endTime = Date.now();
      
      // 📊 บันทึก Loading API Usage
      console.log("⏳ LINE_LOADING:", JSON.stringify({
        timestamp: new Date().toISOString(),
        userId: userId,
        apiType: "loading",
        latency: endTime - startTime
      }));
      
      return response;
    } catch (error) {
      // ไม่ต้องสนใจ Error ของ loading animation
      return null;
    }
  }
}

module.exports = new Request();
