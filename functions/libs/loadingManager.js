const axios = require('axios');

class LoadingManager {
  constructor(lineClient) {
    this.client = lineClient;
    this.loadingStates = new Map();
    
    // กำหนดระยะเวลา loading ตามประเภทการประมวลผล
    this.loadingDurations = {
      'text': 10,
      'image': 25,
      'audio': 30,
      'video': 45,
      'document': 35,
      'location': 15,
      'multimodal': 50
    };
    
    console.log('LoadingManager initialized with real LINE API support');
  }

  async startProcessing(userId, processingType = 'text') {
    const duration = this.loadingDurations[processingType] || 20;
    
    try {
      console.log(`Starting loading animation for ${userId}, type: ${processingType}, duration: ${duration}s`);
      
      // ใช้ LINE API จริงตาม documentation
      // https://developers.line.biz/en/reference/messaging-api/#display-a-loading-indicator
      const response = await axios.post(
        'https://api.line.me/v2/bot/chat/loading/start',
        {
          chatId: userId,
          loadingSeconds: duration
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.client.config.channelAccessToken}`
          }
        }
      );
      
      // เก็บสถานะ loading
      this.loadingStates.set(userId, {
        startTime: Date.now(),
        duration: duration * 1000,
        type: processingType,
        isActive: true
      });
      
      console.log(`✅ Loading animation started successfully for ${userId}`);
      
    } catch (error) {
      console.error('❌ Failed to start loading animation:', error.message);
      // ไม่ throw error เพื่อไม่ให้กระทบกับการประมวลผลหลัก
      
      // Fallback: บันทึก state แม้ว่า animation จะไม่ทำงาน
      this.loadingStates.set(userId, {
        startTime: Date.now(),
        duration: duration * 1000,
        type: processingType,
        isActive: true,
        fallback: true
      });
    }
  }

  async extendProcessing(userId, additionalSeconds = 20) {
    const currentState = this.loadingStates.get(userId);
    
    if (currentState && currentState.isActive) {
      try {
        console.log(`Extending loading animation for ${userId}, additional: ${additionalSeconds}s`);
        
        const response = await axios.post(
          'https://api.line.me/v2/bot/chat/loading/start',
          {
            chatId: userId,
            loadingSeconds: additionalSeconds
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.client.config.channelAccessToken}`
            }
          }
        );
        
        // อัปเดตสถานะ
        currentState.duration += additionalSeconds * 1000;
        this.loadingStates.set(userId, currentState);
        
        console.log(`✅ Loading animation extended successfully for ${userId}`);
        
      } catch (error) {
        console.error('❌ Failed to extend loading animation:', error.message);
      }
    }
  }

  stopProcessing(userId) {
    const state = this.loadingStates.get(userId);
    if (state) {
      state.isActive = false;
      this.loadingStates.set(userId, state);
      
      // ลบสถานะหลังจาก 5 นาที
      setTimeout(() => {
        this.loadingStates.delete(userId);
      }, 5 * 60 * 1000);
      
      console.log(`✅ Loading stopped for user ${userId}`);
    }
  }

  isProcessing(userId) {
    const state = this.loadingStates.get(userId);
    return state && state.isActive;
  }

  getProcessingInfo(userId) {
    return this.loadingStates.get(userId) || null;
  }

  // ทำความสะอาด states ที่หมดอายุ
  cleanupExpiredStates() {
    const now = Date.now();
    const expiredThreshold = 10 * 60 * 1000; // 10 นาที
    
    for (const [userId, state] of this.loadingStates.entries()) {
      if (now - state.startTime > expiredThreshold) {
        this.loadingStates.delete(userId);
        console.log(`Cleaned up expired loading state for user ${userId}`);
      }
    }
  }
}

module.exports = LoadingManager;
