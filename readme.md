<p align="center">
  <img src="URL_TO_YOUR_LOGO.png" alt="Leng AI Logo" width="150"/>
</p>

<h1 align="center">เล้ง AI - LINE Bot ผู้ช่วยอัจฉริยะ</h1>

<p align="center">
  <strong>"เล้ง" คือ AI Assistant บนแพลตฟอร์ม LINE ที่สร้างขึ้นด้วยเทคโนโลยีล่าสุดจาก Google Gemini และ Firebase Functions</strong>
  <br />
  มีความสามารถในการประมวลผลและตอบสนองต่อเนื้อหาหลากหลายรูปแบบ (Multimodal) ได้อย่างมืออาชีพ
</p>

<p align="center">
  <a href="https://github.com/ChuMangkorn/Line-Gemini-Bot/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ChuMangkorn/Line-Gemini-Bot?style=for-the-badge" alt="License"></a>
  <img src="https://img.shields.io/badge/Node.js-22-blue?style=for-the-badge&logo=node.js" alt="Node.js Version">
  <img src="https://img.shields.io/badge/Firebase-Functions%20v2-orange?style=for-the-badge&logo=firebase" alt="Firebase Functions">
  <img src="https://img.shields.io/badge/Google%20Gemini-Flash%202.0-blueviolet?style=for-the-badge&logo=google-gemini" alt="Gemini AI">
</p>

---

"เล้ง" ไม่ใช่แค่ Chatbot ธรรมดา แต่เป็นผู้ช่วยที่เข้าใจและโต้ตอบได้อย่างเป็นธรรมชาติ สามารถวิเคราะห์ข้อมูลจากข้อความ รูปภาพ เสียง วิดีโอ และไฟล์เอกสาร พร้อมทั้งให้ข้อมูลเชิงลึกที่เป็นประโยชน์แก่ผู้ใช้งาน

## ✨ คุณสมบัติเด่น (Key Features)

-   **🤖 AI สนทนาอัจฉริยะ:** ขับเคลื่อนด้วยโมเดล `gemini-2.0-flash` สามารถจดจำบริบทการสนทนา ตอบคำถามซับซ้อน และรองรับได้หลายภาษา (Multi-language)
-   **🖼️ วิเคราะห์รูปภาพ (Image Analysis):** อธิบายสิ่งที่อยู่ในภาพ ตอบคำถาม และวิเคราะห์องค์ประกอบต่างๆ
-   **🎵 ประมวลผลเสียง (Audio Processing):** ถอดเสียงเป็นข้อความ สรุปใจความสำคัญจากการสนทนาในไฟล์เสียง
-   **🎬 วิเคราะห์วิดีโอ (Video Analysis):** สรุปเนื้อหาและประเด็นสำคัญจากไฟล์วิดีโอ
-   **📄 อ่านและสรุปเอกสาร (Document Reading):** รองรับไฟล์ PDF, Word (.doc, .docx), และ Text File เพื่อสรุปและตอบคำถามจากเนื้อหา
-   **🔗 สรุปเนื้อหาจากลิงก์ YouTube:** เพียงส่งลิงก์ YouTube มาให้ เล้งสามารถสรุปเนื้อหาสำคัญของวิดีโอให้ได้ทันที
-   **🌤️ พยากรณ์อากาศ (Weather Forecast):** ตรวจสอบสภาพอากาศปัจจุบัน, รายชั่วโมง, และรายสัปดาห์ของเมืองต่างๆ ทั่วโลก โดยใช้ข้อมูลจาก OpenWeather API
-   **📊 แดชบอร์ดสำหรับผู้ดูแล:** มีหน้า Dashboard สำหรับดูสถิติการใช้งาน, จัดการผู้ใช้, และส่งข้อความ Broadcast (สร้างด้วย HTML, TailwindCSS, และ Chart.js)

## 🛠️ เทคโนโลยีที่ใช้ (Technology Stack)

-   **Backend:** Firebase Functions v2 (Node.js 22)
-   **AI Model:** Google Gemini 2.0 Flash (Multimodal)
-   **Database:** Cloud Firestore
-   **Platform:** LINE Messaging API
-   **APIs:**
    -   OpenWeather API (สำหรับข้อมูลสภาพอากาศ)
    -   YouTube Transcript API (สำหรับสรุปคลิป)
    -   YouTube Data API v3 (สำหรับค้นหาวิดีโอ)
-   **Authentication:** Firebase Authentication (สำหรับหน้า Admin)
-   **Hosting:** Firebase Hosting (สำหรับ Webhook และ Dashboard)

## ⚙️ การติดตั้งและตั้งค่า (Installation & Configuration)

### ข้อกำหนดเบื้องต้น

1.  **Node.js** เวอร์ชั่น 22 ขึ้นไป
2.  **Firebase CLI** ([ดูวิธีการติดตั้ง](https://firebase.google.com/docs/cli))
3.  **LINE Developer Account** และสร้าง Provider/Channel สำหรับ Messaging API
4.  **Google AI Studio** เพื่อสร้าง **Gemini API Key**
5.  **OpenWeather API Key**
6.  **YouTube Data API v3 Key**

### ขั้นตอนการติดตั้ง

1.  **Clone a repository:**
    ```bash
    git clone [https://github.com/ChuMangkorn/Line-Gemini-Bot.git](https://github.com/ChuMangkorn/Line-Gemini-Bot.git)
    cd Line-Gemini-Bot
    ```

2.  **ติดตั้ง Dependencies:**
    ```bash
    cd functions
    npm install
    ```

3.  **ตั้งค่า Firebase Project:**
    -   สร้างโปรเจกต์ใหม่บน [Firebase Console](https://console.firebase.google.com/)
    -   เปิดใช้งาน **Firestore**, **Firebase Authentication** (Email/Password), และ **Firebase Functions**
    -   เชื่อมต่อโปรเจกต์ในเครื่องกับโปรเจกต์บน Firebase:
        ```bash
        firebase use YOUR_FIREBASE_PROJECT_ID
        ```

4.  **ตั้งค่า Secret Keys:**
    "เล้ง" ใช้ Secret Manager ของ Firebase Functions เพื่อจัดการกับ API Keys และข้อมูลสำคัญอื่นๆ รันคำสั่งต่อไปนี้เพื่อตั้งค่า:

    ```bash
    firebase functions:secrets:set LINE_CHANNEL_SECRET
    firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
    firebase functions:secrets:set GEMINI_API_KEY
    firebase functions:secrets:set OPENWEATHER_API_KEY
    firebase functions:secrets:set YOUTUBE_API_KEY
    firebase functions:secrets:set ADMIN_USER_ID
    ```
    *หมายเหตุ: `ADMIN_USER_ID` คือ LINE User ID ของคุณ สำหรับรับรายงานสรุป*

5.  **ตั้งค่า Admin Account:**
    -   ไปที่ Firebase Console > Authentication > Users > Add user
    -   สร้างบัญชีผู้ใช้ด้วย Email และ Password ที่จะใช้สำหรับล็อกอินเข้า Dashboard

### การทดสอบบนเครื่อง (Local Emulation)

คุณสามารถทดสอบฟังก์ชันทั้งหมดได้บนเครื่องของคุณโดยใช้ Firebase Emulators

```bash
firebase emulators:start
```

-   **Functions Emulator:** `http://localhost:5001`
-   **Firestore Emulator:** `http://localhost:8080`
-   **Hosting Emulator:** `http://localhost:5000`
-   **Emulator UI:** `http://localhost:4000`

จากนั้นใช้เครื่องมืออย่าง `ngrok` เพื่อสร้าง Webhook URL ชั่วคราวสำหรับ LINE Messaging API: `ngrok http 5001` และนำ URL ที่ได้ไปใส่ใน LINE Developers Console

## 🚀 การนำไปใช้งาน (Deployment)

เมื่อตั้งค่าทุกอย่างเรียบร้อยแล้ว สามารถ Deploy ฟังก์ชันและกฎต่างๆ ขึ้น Firebase ได้ด้วยคำสั่งเดียว:

```bash
firebase deploy
```

คำสั่งนี้จะทำการ Deploy:
-   Cloud Functions ทั้งหมด (`webhook`, `dashboard`, APIs)
-   Firestore rules และ indexes
-   Firebase Hosting สำหรับ rewrite URL ไปยังฟังก์ชัน

## 🤝 การมีส่วนร่วม (Contributing)

เรายินดีต้อนรับทุกการมีส่วนร่วม! ไม่ว่าจะเป็นการแจ้งบั๊ก,เสนอแนวคิด, หรือส่ง Pull Request กรุณาอ่าน [CONTRIBUTING.md](URL_TO_CONTRIBUTING.md) (สร้างไฟล์นี้เพิ่ม) สำหรับรายละเอียดเพิ่มเติม

---
<p align="center">
  พัฒนาโดย ChuMangkorn
</p>
