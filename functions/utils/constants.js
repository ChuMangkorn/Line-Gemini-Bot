// ค่าคงที่สำหรับ เล้ง AI
const CONSTANTS = {
  // ข้อจำกัดของระบบ
  LIMITS: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_TEXT_LENGTH: 5000,
    MAX_CACHE_ITEMS: 1000,
    RATE_LIMIT_REQUESTS: 20,
    RATE_LIMIT_WINDOW: 60000, // 1 นาที
    MAX_LOADING_DURATION: 60 // วินาที
  },

  // ประเภทข้อความ
  MESSAGE_TYPES: {
    TEXT: 'text',
    IMAGE: 'image',
    AUDIO: 'audio',
    VIDEO: 'video',
    FILE: 'file',
    LOCATION: 'location',
    STICKER: 'sticker'
  },

  // ประเภทการประมวลผล
  PROCESSING_TYPES: {
    TEXT: 'text',
    IMAGE: 'image',
    AUDIO: 'audio',
    VIDEO: 'video',
    DOCUMENT: 'document',
    LOCATION: 'location',
    MULTIMODAL: 'multimodal'
  },

  // ระยะเวลา Loading Animation
  LOADING_DURATIONS: {
    TEXT: 10,
    IMAGE: 25,
    AUDIO: 30,
    VIDEO: 45,
    DOCUMENT: 35,
    LOCATION: 15,
    MULTIMODAL: 50,
    WEATHER: 20
  },

  // ข้อความตอบกลับมาตรฐาน
  RESPONSES: {
    WELCOME: '🤖 สวัสดีครับ! ผม เล้ง AI ที่ทำได้ทุกอย่างใน LINE\nส่งข้อความ รูปภาพ เสียง วิดีโอ หรือไฟล์มาได้เลยครับ!',
    ERROR_GENERAL: '❌ ขออภัยครับ เล้งพบปัญหาในการประมวลผล กรุณาลองใหม่อีกครั้ง',
    ERROR_FILE_TOO_LARGE: '❌ ขออภัยครับ ไฟล์ใหญ่เกินไป (เกิน 10MB) กรุณาส่งไฟล์ที่เล็กกว่า',
    ERROR_UNSUPPORTED_FILE: '❌ ขออภัยครับ เล้งไม่รองรับไฟล์ประเภทนี้',
    ERROR_RATE_LIMIT: '⏰ คุณใช้งานเร็วเกินไป กรุณารอสักครู่แล้วลองใหม่',
    ERROR_NETWORK: '🌐 มีปัญหาการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
    PROCESSING: '🔄 เล้งกำลังประมวลผล กรุณารอสักครู่...'
  },

  // อีโมจิสำหรับแต่ละประเภท
  EMOJIS: {
    TEXT: '💬',
    IMAGE: '🖼️',
    AUDIO: '🎵',
    VIDEO: '🎬',
    DOCUMENT: '📄',
    LOCATION: '📍',
    WEATHER: '🌤️',
    SUCCESS: '✅',
    ERROR: '❌',
    LOADING: '🔄',
    THINKING: '🤔',
    ROBOT: '🤖'
  },

  // รองรับไฟล์ประเภทต่างๆ
  SUPPORTED_FORMATS: {
    IMAGE: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    AUDIO: ['mp3', 'wav', 'ogg', 'm4a', 'aac'],
    VIDEO: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
    DOCUMENT: ['pdf', 'doc', 'docx', 'txt', 'rtf']
  },

  // MIME Types
  MIME_TYPES: {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'mp4': 'video/mp4',
    'avi': 'video/avi',
    'mov': 'video/quicktime',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'rtf': 'application/rtf'
  },

  // เมืองที่รองรับการพยากรณ์อากาศ
  SUPPORTED_CITIES: {
    'กรุงเทพ': { lat: 13.7563, lon: 100.5018, name: 'Bangkok', timezone: 'Asia/Bangkok' },
    'กรุงเทพฯ': { lat: 13.7563, lon: 100.5018, name: 'Bangkok', timezone: 'Asia/Bangkok' },
    'bangkok': { lat: 13.7563, lon: 100.5018, name: 'Bangkok', timezone: 'Asia/Bangkok' },
    'โอตารุ': { lat: 43.1907, lon: 140.9947, name: 'Otaru', timezone: 'Asia/Tokyo' },
    'otaru': { lat: 43.1907, lon: 140.9947, name: 'Otaru', timezone: 'Asia/Tokyo' },
    'อุสึโนะมิยะ': { lat: 36.5583, lon: 139.8694, name: 'Utsunomiya', timezone: 'Asia/Tokyo' },
    'utsunomiya': { lat: 36.5583, lon: 139.8694, name: 'Utsunomiya', timezone: 'Asia/Tokyo' },
    'โตเกียว': { lat: 35.6762, lon: 139.6503, name: 'Tokyo', timezone: 'Asia/Tokyo' },
    'tokyo': { lat: 35.6762, lon: 139.6503, name: 'Tokyo', timezone: 'Asia/Tokyo' },
    'ซัปโปโร': { lat: 43.0642, lon: 141.3469, name: 'Sapporo', timezone: 'Asia/Tokyo' },
    'sapporo': { lat: 43.0642, lon: 141.3469, name: 'Sapporo', timezone: 'Asia/Tokyo' }
  },

  // คำสำคัญสำหรับการตรวจจับความต้องการ
  KEYWORDS: {
    WEATHER: [
      'อากาศ', 'สภาพอากาศ', 'ฝน', 'แดด', 'หนาว', 'ร้อน', 'เมฆ', 'ลม',
      'อุณหภูมิ', 'ความชื้น', 'พยากรณ์', 'weather', 'temperature', 'rain',
      'sunny', 'cloudy', 'windy', 'humid', 'forecast'
    ],
    GREETING: [
      'สวัสดี', 'หวัดดี', 'ดีครับ', 'ดีค่ะ', 'hello', 'hi', 'hey',
      'good morning', 'good afternoon', 'good evening'
    ],
    HELP: [
      'ช่วย', 'help', 'คำสั่ง', 'command', 'ทำอะไรได้บ้าง', 'ความสามารถ',
      'how to', 'วิธีใช้', 'manual'
    ]
  },

  // การตั้งค่า Cache
  CACHE_SETTINGS: {
    CONVERSATION_TTL: 3600, // 1 ชั่วโมง
    FILE_CONTEXT_TTL: 7200, // 2 ชั่วโมง
    STATS_TTL: 86400, // 24 ชั่วโมง
    RATE_LIMIT_TTL: 60, // 1 นาที
    WEATHER_CACHE_TTL: 600 // 10 นาที
  },

  // การตั้งค่า Firebase
  FIREBASE_REGIONS: {
    PRIMARY: 'asia-southeast1',
    SECONDARY: 'asia-northeast1'
  },

  // การตั้งค่า Functions
  FUNCTION_CONFIG: {
    TIMEOUT_SECONDS: 540,
    MEMORY: '2GB',
    MAX_INSTANCES: 100
  }
};

module.exports = CONSTANTS;
