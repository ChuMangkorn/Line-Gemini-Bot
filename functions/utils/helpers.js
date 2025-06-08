const moment = require('moment-timezone');

class Helpers {
  // จัดรูปแบบเวลาสำหรับ timezone ต่างๆ
  static formatTime(timezone = 'Asia/Bangkok') {
    return moment().tz(timezone).format('YYYY-MM-DD HH:mm:ss');
  }

  // แปลงเวลาสำหรับเมืองญี่ปุ่น
  static formatJapanTime() {
    return moment().tz('Asia/Tokyo').format('YYYY年MM月DD日 HH:mm:ss JST');
  }

  // ตรวจสอบและทำความสะอาดข้อความ
  static sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';

    return text
      .replace(/[<>]/g, '') // ลบ HTML tags พื้นฐาน
      .replace(/\s+/g, ' ') // ลบช่องว่างเกิน
      .trim()
      .substring(0, 5000); // จำกัดความยาว
  }

  // ตรวจสอบว่าเป็น URL หรือไม่
  static isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false; // ลบ _error parameter ออกเลย
    }
  }

  // สร้าง unique ID สำหรับ session
  static generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // แปลงขนาดไฟล์เป็นรูปแบบที่อ่านง่าย
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ตรวจสอบประเภทไฟล์จากชื่อไฟล์
  static getFileType(fileName) {
    if (!fileName) return 'unknown';

    const extension = fileName.toLowerCase().split('.').pop();

    const fileTypes = {
      // รูปภาพ
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
      // เสียง
      'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'm4a': 'audio', 'aac': 'audio',
      // วิดีโอ
      'mp4': 'video', 'avi': 'video', 'mov': 'video', 'wmv': 'video', 'flv': 'video',
      // เอกสาร
      'pdf': 'document', 'doc': 'document', 'docx': 'document', 'txt': 'document', 'rtf': 'document',
      // อื่นๆ
      'zip': 'archive', 'rar': 'archive', '7z': 'archive'
    };

    return fileTypes[extension] || 'unknown';
  }

  // สร้าง Quick Reply สำหรับตัวเลือกต่างๆ
  static createQuickReply(options) {
    return {
      type: 'text',
      text: options.text || 'กรุณาเลือก:',
      quickReply: {
        items: options.items.map(item => ({
          type: 'action',
          action: {
            type: 'message',
            label: item.label,
            text: item.text || item.label
          }
        }))
      }
    };
  }

  // สร้าง Flex Message พื้นฐาน
  static createFlexMessage(title, content) {
    return {
      type: 'flex',
      altText: title,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: title,
              weight: 'bold',
              size: 'lg',
              color: '#1DB446'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: content
        }
      }
    };
  }

  // ตรวจสอบข้อผิดพลาดและส่งคืนข้อความที่เหมาะสม
  static handleError(error, context = '') {
    console.error(`Error in ${context}:`, error);

    // ข้อผิดพลาดที่พบบ่อย
    if (error.message.includes('quota')) {
      return 'ขออภัยครับ เล้งใช้งานหนักเกินไป กรุณาลองใหม่ในอีกสักครู่';
    }

    if (error.message.includes('network') || error.message.includes('timeout')) {
      return 'ขออภัยครับ มีปัญหาการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง';
    }

    if (error.message.includes('file too large')) {
      return 'ขออภัยครับ ไฟล์ใหญ่เกินไป กรุณาส่งไฟล์ที่เล็กกว่า 10MB';
    }

    return 'ขออภัยครับ เล้งพบปัญหาในการประมวลผล กรุณาลองใหม่อีกครั้ง';
  }

  // ตรวจสอบและจำกัดอัตราการใช้งาน (Rate Limiting)
  static checkRateLimit(userId, cache, maxRequests = 10, timeWindow = 60000) {
    const now = Date.now();
    const userRequests = cache.get(`rate_${userId}`) || [];

    // ลบคำขอที่เก่าเกินไป
    const validRequests = userRequests.filter(time => now - time < timeWindow);

    if (validRequests.length >= maxRequests) {
      return false; // เกินขด
    }

    // เพิ่มคำขอใหม่
    validRequests.push(now);
    cache.set(`rate_${userId}`, validRequests, timeWindow / 1000);

    return true;
  }

  // สร้างข้อความสถิติการใช้งาน
  static generateUsageStats(cache, userId) {
    const stats = cache.get(`stats_${userId}`) || {
      textMessages: 0,
      imageAnalysis: 0,
      audioProcessing: 0,
      videoAnalysis: 0,
      documentReading: 0,
      weatherQueries: 0,
      totalInteractions: 0
    };

    return `📊 สถิติการใช้งานของคุณ:
💬 ข้อความ: ${stats.textMessages}
🖼️ วิเคราะห์รูปภาพ: ${stats.imageAnalysis}
🎵 ประมวลผลเสียง: ${stats.audioProcessing}
🎬 วิเคราะห์วิดีโอ: ${stats.videoAnalysis}
📄 อ่านเอกสาร: ${stats.documentReading}
🌤️ สอบถามสภาพอากาศ: ${stats.weatherQueries}
🔢 รวมทั้งหมด: ${stats.totalInteractions} ครั้ง`;
  }

  // อัปเดตสถิติการใช้งาน
  static updateUsageStats(cache, userId, action) {
    const stats = cache.get(`stats_${userId}`) || {
      textMessages: 0,
      imageAnalysis: 0,
      audioProcessing: 0,
      videoAnalysis: 0,
      documentReading: 0,
      weatherQueries: 0,
      totalInteractions: 0
    };

    if (stats[action] !== undefined) {
      stats[action]++;
    }
    stats.totalInteractions++;

    cache.set(`stats_${userId}`, stats, 86400); // เก็บ 24 ชั่วโมง
  }

  // ตรวจสอบความปลอดภัยของเนื้อหา
  static isSafeContent(text) {
    const unsafePatterns = [
      /\b(password|รหัสผ่าน)\b/i,
      /\b(credit card|เครดิตการ์ด)\b/i,
      /\b(ssn|เลขประจำตัว)\b/i,
      /\b(bank account|บัญชีธนาคาร)\b/i
    ];

    return !unsafePatterns.some(pattern => pattern.test(text));
  }

  // สร้างข้อความต้อนรับสำหรับผู้ใช้ใหม่
  static createWelcomeMessage() {
    return {
      type: 'flex',
      altText: 'ยินดีต้อนรับสู่ เล้ง AI',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🤖 สวัสดีครับ!',
              weight: 'bold',
              size: 'xl',
              color: '#1DB446'
            },
            {
              type: 'text',
              text: 'ผม เล้ง AI ที่ทำได้ทุกอย่างใน LINE',
              size: 'md',
              color: '#666666'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'ความสามารถของผม:',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: '🖼️ วิเคราะห์รูปภาพ\n🎵 ประมวลผลเสียง\n🎬 วิเคราะห์วิดีโอ\n📄 อ่านเอกสาร\n🌤️ พยากรณ์อากาศ\n💬 สนทนาธรรมดา\n🌍 แปลภาษา\nและอื่นๆ อีกมากมาย!',
              wrap: true,
              margin: 'sm'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'message',
                label: 'เริ่มใช้งาน',
                text: 'สวัสดี เล้ง'
              },
              style: 'primary'
            }
          ]
        }
      }
    };
  }
}

module.exports = Helpers;
