const {onRequest} = require("firebase-functions/v2/https");
const express = require("express");
const line = require("@line/bot-sdk");
const NodeCache = require("node-cache");

const gemini = require("./utils/gemini");
const customRequest = require("./utils/request");

const app = express();
const cache = new NodeCache();

// *** โค้ดส่วนนี้ถูกปรับโครงสร้างใหม่ทั้งหมด ***
app.post("/webhook", (req, res) => {
  // สร้าง Middleware ของ LINE ขึ้นมาตอนมี Request เข้ามาจริงๆ
  // ซึ่งในตอนนั้น process.env จะมีค่าที่ถูกต้องแล้ว
  const middleware = line.middleware({
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  });

  // เรียกใช้ middleware แล้วส่งต่อไปยัง logic หลักของเรา
  middleware(req, res, async () => {
    try {
      const events = req.body.events;
      const results = await Promise.all(events.map(handleEvent));
      res.json(results);
    } catch (err) {
      console.error("Webhook Error:", err);
      res.status(500).end();
    }
  });
});

const handleEvent = async (event) => {
  const lineClient = new line.Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  if (event.type !== "message") {
    return null;
  }

  const userId = event.source.userId;
  const replyToken = event.replyToken;

  try {
    if (event.message.type === "text") {
      const userText = event.message.text.trim();
      if (gemini.isUrl(userText)) {
        try {
          const response = await customRequest.curl(userText);
          return await getReady(response, userId, replyToken, lineClient);
        } catch (error) {
          return reply(replyToken, "ขออภัย ฉันไม่สามารถเปิด URL นี้ได้ครับ", lineClient);
        }
      }
      const cachedData = cache.get(userId);
      if (cachedData) {
        await customRequest.loading(userId);
        const prompt = [
          "ตอบคำถามผู้ใช้เฉพาะเนื้อหาที่อยู่ในไฟล์เท่านั้น",
          {inlineData: cachedData},
          userText,
        ];
        const resultText = await gemini.multimodal(prompt);
        cache.del(userId);
        return reply(replyToken, resultText, lineClient);
      } else {
        const resultText = await gemini.multimodal([userText]);
        return reply(replyToken, resultText, lineClient);
      }
    }

    if (["image", "video", "audio"].includes(event.message.type)) {
      const messageId = event.message.id;
      const imageStream = await lineClient.getMessageContent(messageId);
      const responseData = {
        data: await streamToBuffer(imageStream),
        headers: {"content-type": imageStream.headers["content-type"]},
      };
      return await getReady(responseData, userId, replyToken, lineClient);
    }
  } catch (error) {
    console.error("Handle Event Error:", error);
    return reply(replyToken, "เกิดข้อผิดพลาดบางอย่าง ขออภัยครับ", lineClient);
  }
  return null;
};

const getReady = async (response, userId, replyToken, lineClient) => {
  const mimeType = gemini.getMimeType(response);
  if (gemini.isAllowedMimes(mimeType)) {
    const base64 = Buffer.from(response.data).toString("base64");
    cache.set(userId, {data: base64, mimeType}, 300);
    return reply(replyToken, "ได้รับไฟล์แล้ว คุณอยากรู้อะไรเกี่ยวกับไฟล์นี้ครับ?", lineClient);
  }
  const unsupportedMessage =
    "ขออภัย ปัจจุบันฉันรองรับไฟล์ PDF, JPEG, PNG, WAV, MP3, " +
    "M4A, MP4, และ MOV เท่านั้นครับ";
  return reply(replyToken, unsupportedMessage, lineClient);
};

const reply = (replyToken, text, lineClient) => {
  return lineClient.replyMessage(replyToken, {
    type: "text",
    text: text.trim(),
  });
};

const streamToBuffer = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
};

exports.linebot = onRequest(
    {
      region: "asia-southeast1",
      secrets: [
        "LINE_CHANNEL_ACCESS_TOKEN",
        "LINE_CHANNEL_SECRET",
        "GEMINI_API_KEY",
      ],
    },
    app,
);