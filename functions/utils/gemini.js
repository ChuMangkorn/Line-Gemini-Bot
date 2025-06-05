// /functions/utils/gemini.js

// *** แก้ไขวิธี require: ไม่ใช้ปีกกา {} แต่รับมาทั้งโมดูล ***
const generativeAi = require("@google/generative-ai");

let genAI;

class Gemini {
  _initialize() {
    if (!genAI) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        throw new Error("GEMINI_API_KEY is not set.");
      }
      // *** แก้ไขวิธีเรียกใช้ Constructor ให้เรียกผ่าน property ของโมดูล ***
      genAI = new generativeAi.GoogleGenerativeAI(geminiApiKey);
    }
    return genAI.getGenerativeModel({model: "gemini-2.0-flash"});
  }

  isUrl(str) {
    // eslint-disable-next-line max-len
    return /^(http(s)?:\/\/)?(www\.)?[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/.test(str);
  }

  getMimeType(response) {
    const contentType = response.headers["content-type"];
    return contentType ? contentType.split(";")[0] : "application/octet-stream";
  }

  isAllowedMimes(mimeType) {
    return [
      "application/pdf", "image/jpeg", "image/png",
      "audio/wav", "audio/mp3", "audio/x-m4a",
      "video/mp4", "video/mov",
    ].includes(mimeType);
  }

  async multimodal(promptArray) {
    const model = this._initialize();
    const result = await model.generateContent(promptArray);
    const response = await result.response;
    return response.text();
  }
}

module.exports = new Gemini();