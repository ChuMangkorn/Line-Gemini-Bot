const { GoogleGenerativeAI } = require('@google/generative-ai');
const { defineSecret } = require('firebase-functions/params');

const geminiApiKey = defineSecret('GEMINI_API_KEY');

class MultimodalProcessor {
  constructor() {
    console.log('MultimodalProcessor initializing...');
    
    try {
      this.genAI = new GoogleGenerativeAI(geminiApiKey.value());
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      console.log('✅ Gemini multimodal API connected successfully');
    } catch (error) {
      console.error('❌ Gemini multimodal API connection failed:', error);
      this.model = null;
    }
    
    this.prompts = {
      image: `คุณคือ "เล้ง" AI ที่เชี่ยวชาญการวิเคราะห์รูปภาพ
วิเคราะห์รูปภาพนี้อย่างละเอียดและให้ข้อมูลที่เป็นประโยชน์
- บอกสิ่งที่เห็นในรูป
- วิเคราะห์สี บรรยากาศ และรายละเอียด
- ให้คำแนะนำหรือข้อมูลเพิ่มเติมที่เกี่ยวข้อง
ตอบเป็นภาษาที่คุยและใช้อีโมจิให้เหมาะสม`,

      audio: `คุณคือ "เล้ง" AI ที่เชี่ยวชาญการประมวลผลเสียง
ฟังและวิเคราะห์เนื้อหาเสียงนี้ แล้วสรุปหรือตอบคำถามที่เกี่ยวข้อง
- แปลงเสียงเป็นข้อความ
- วิเคราะห์เนื้อหาและความหมาย
- สรุปประเด็นสำคัญ
ตอบเป็นภาษาที่คุยและให้ข้อมูลที่ครบถ้วน`,

      video: `คุณคือ "เล้ง" AI ที่เชี่ยวชาญการวิเคราะห์วิดีโอ
ดูและวิเคราะห์เนื้อหาวิดีโอนี้ สรุปประเด็นสำคัญและให้ข้อมูลที่เป็นประโยชน์
- สรุปเนื้อหาหลักของวิดีโอ
- วิเคราะห์ภาพและเสียง
- ให้ข้อมูลที่น่าสนใจ
ตอบเป็นภาษาที่คุยและจัดรูปแบบให้อ่านง่าย`,

      document: `คุณคือ "เล้ง" AI ที่เชี่ยวชาญการอ่านและวิเคราะห์เอกสาร
อ่านเอกสารนี้อย่างละเอียดและสรุปเนื้อหาสำคัญ
- สรุปประเด็นหลัก
- จัดหมวดหมู่ข้อมูล
- ตอบคำถามจากเนื้อหา
ตอบเป็นภาษาที่คุยและจัดหมวดหมู่ข้อมูลให้เป็นระเบียบ`
    };
  }

  async analyzeImage(imageBuffer, userId, customPrompt = null) {
    try {
      console.log(`Analyzing image for user ${userId}, buffer size: ${imageBuffer.length} bytes`);
      
      if (!this.model) {
        throw new Error('Gemini API not available');
      }

      const imagePart = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: this.detectImageMimeType(imageBuffer)
        }
      };

      const prompt = customPrompt || this.prompts.image;
      console.log('Sending image to Gemini API...');
      
      const result = await this.model.generateContent([prompt, imagePart]);
      const response = result.response.text();
      
      console.log('Image analysis completed successfully');
      return this.formatResponse(response, 'image');
      
    } catch (error) {
      console.error('Image analysis error:', error);
      throw new Error(`ไม่สามารถวิเคราะห์รูปภาพได้: ${error.message}`);
    }
  }

  async analyzeAudio(audioBuffer, userId, customPrompt = null) {
    try {
      console.log(`Analyzing audio for user ${userId}, buffer size: ${audioBuffer.length} bytes`);
      
      if (!this.model) {
        throw new Error('Gemini API not available');
      }

      const audioPart = {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType: this.detectAudioMimeType(audioBuffer)
        }
      };

      const prompt = customPrompt || this.prompts.audio;
      console.log('Sending audio to Gemini API...');
      
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = result.response.text();
      
      console.log('Audio analysis completed successfully');
      return this.formatResponse(response, 'audio');
      
    } catch (error) {
      console.error('Audio analysis error:', error);
      throw new Error(`ไม่สามารถประมวลผลเสียงได้: ${error.message}`);
    }
  }

  async analyzeVideo(videoBuffer, userId, customPrompt = null) {
    try {
      console.log(`Analyzing video for user ${userId}, buffer size: ${videoBuffer.length} bytes`);
      
      if (!this.model) {
        throw new Error('Gemini API not available');
      }

      const videoPart = {
        inlineData: {
          data: videoBuffer.toString('base64'),
          mimeType: this.detectVideoMimeType(videoBuffer)
        }
      };

      const prompt = customPrompt || this.prompts.video;
      console.log('Sending video to Gemini API...');
      
      const result = await this.model.generateContent([prompt, videoPart]);
      const response = result.response.text();
      
      console.log('Video analysis completed successfully');
      return this.formatResponse(response, 'video');
      
    } catch (error) {
      console.error('Video analysis error:', error);
      throw new Error(`ไม่สามารถวิเคราะห์วิดีโอได้: ${error.message}`);
    }
  }

  async analyzeDocument(fileBuffer, fileName, userId, customPrompt = null) {
    try {
      console.log(`Analyzing document for user ${userId}: ${fileName}, buffer size: ${fileBuffer.length} bytes`);
      
      const mimeType = this.detectDocumentMimeType(fileName);
      
      if (!this.isSupportedDocumentType(mimeType)) {
        throw new Error(`ไม่รองรับไฟล์ประเภท ${mimeType}`);
      }

      if (!this.model) {
        throw new Error('Gemini API not available');
      }

      const documentPart = {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType: mimeType
        }
      };

      const prompt = customPrompt || `${this.prompts.document}\n\nชื่อไฟล์: ${fileName}`;
      console.log('Sending document to Gemini API...');
      
      const result = await this.model.generateContent([prompt, documentPart]);
      const response = result.response.text();
      
      console.log('Document analysis completed successfully');
      return this.formatResponse(response, 'document');
      
    } catch (error) {
      console.error('Document analysis error:', error);
      throw new Error(`ไม่สามารถอ่านเอกสาร ${fileName} ได้: ${error.message}`);
    }
  }

  // File Type Detection Methods
  detectImageMimeType(buffer) {
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
      'image/webp': [0x52, 0x49, 0x46, 0x46]
    };

    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (this.checkSignature(buffer, signature)) {
        console.log(`Detected image type: ${mimeType}`);
        return mimeType;
      }
    }

    console.log('Using default image type: image/jpeg');
    return 'image/jpeg';
  }

  detectAudioMimeType(buffer) {
    const signatures = {
      'audio/mpeg': [0xFF, 0xFB],
      'audio/wav': [0x52, 0x49, 0x46, 0x46],
      'audio/ogg': [0x4F, 0x67, 0x67, 0x53],
      'audio/mp4': [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]
    };

    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (this.checkSignature(buffer, signature)) {
        console.log(`Detected audio type: ${mimeType}`);
        return mimeType;
      }
    }

    console.log('Using default audio type: audio/mpeg');
    return 'audio/mpeg';
  }

  detectVideoMimeType(buffer) {
    const signatures = {
      'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
      'video/avi': [0x52, 0x49, 0x46, 0x46],
      'video/quicktime': [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74]
    };

    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (this.checkSignature(buffer, signature)) {
        console.log(`Detected video type: ${mimeType}`);
        return mimeType;
      }
    }

    console.log('Using default video type: video/mp4');
    return 'video/mp4';
  }

  detectDocumentMimeType(fileName) {
    const extension = fileName.toLowerCase().split('.').pop();
    
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'rtf': 'application/rtf'
    };

    const mimeType = mimeTypes[extension] || 'application/octet-stream';
    console.log(`Detected document type: ${mimeType} for file: ${fileName}`);
    return mimeType;
  }

  isSupportedDocumentType(mimeType) {
    const supportedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf'
    ];

    return supportedTypes.includes(mimeType);
  }

  checkSignature(buffer, signature) {
    if (buffer.length < signature.length) return false;
    
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) return false;
    }
    
    return true;
  }

  formatResponse(text, type) {
    const icons = {
      'image': '🖼️',
      'audio': '🎵',
      'video': '🎬',
      'document': '📄'
    };

    const icon = icons[type] || '🤖';
    
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .trim();

    return `${icon} ${cleanText}`;
  }
}

module.exports = MultimodalProcessor;
