const axios = require('axios');
const moment = require('moment-timezone');
const { SUPPORTED_CITIES } = require('../utils/constants');

class WeatherService {
  constructor() {
    // ดึง API Key จาก environment variables ที่ตั้งค่าใน Firebase Secrets
    this.apiKey = process.env.OPENWEATHER_API_KEY;
    this.oneCallBaseUrl = 'https://api.openweathermap.org/data/3.0/onecall';
    
    // ตรวจสอบว่า API Key ถูกตั้งค่าเรียบร้อยแล้ว
    if (!this.apiKey) {
      console.error('❌ OpenWeatherMap API key is missing. Please set OPENWEATHER_API_KEY secret.');
    }
    console.log('✅ WeatherService initialized for One Call API 3.0');
  }

  /**
   * ดึงข้อมูลพยากรณ์อากาศจาก One Call API 3.0
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<object>} ข้อมูลพยากรณ์อากาศ
   */
  async fetchOneCallApiData(lat, lon) {
    if (!this.apiKey) {
      throw new Error('OpenWeatherMap API key not configured.');
    }

    const params = {
      lat,
      lon,
      appid: this.apiKey,
      units: 'metric',
      lang: 'th',
      exclude: 'minutely,alerts' // ไม่เอาข้อมูลรายนาทีและประกาศเตือน
    };

    try {
      console.log(`Fetching One Call API data for lat: ${lat}, lon: ${lon}`);
      const response = await axios.get(this.oneCallBaseUrl, { params });
      console.log('✅ Successfully fetched data from One Call API.');
      return response.data;
    } catch (error) {
      console.error('💥 Error fetching One Call API data:', error.response ? error.response.data : error.message);
      throw new Error('Could not retrieve weather data from the provider.');
    }
  }

  /**
   * ค้นหาข้อมูลเมืองจากชื่อ
   * @param {string} query - ชื่อเมืองที่ต้องการค้นหา
   * @returns {object|null} ข้อมูลเมือง หรือ null ถ้าไม่พบ
   */
  extractCityFromQuery(query) {
    const lowerQuery = query.toLowerCase();
    for (const keyword in SUPPORTED_CITIES) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        console.log(`Found city: ${keyword} -> ${SUPPORTED_CITIES[keyword].name}`);
        return SUPPORTED_CITIES[keyword];
      }
    }
    return null;
  }
  
  /**
   * สร้าง Flex Message สำหรับสภาพอากาศปัจจุบัน
   * @param {string} query - ข้อความจากผู้ใช้
   * @returns {Promise<object>} Flex Message object
   */
  async getCurrentWeather(query) {
    const city = this.extractCityFromQuery(query);
    if (!city) {
      return { type: 'text', text: 'ขออภัยครับ ไม่พบเมืองที่ต้องการ กรุณาระบุชื่อเมืองที่รองรับ' };
    }

    const weatherData = await this.fetchOneCallApiData(city.lat, city.lon);
    return this.formatCurrentWeather(weatherData, city);
  }

  /**
   * สร้าง Flex Message สำหรับพยากรณ์อากาศรายสัปดาห์ (8 วัน)
   * @param {string} queryOrPostback - ข้อความจากผู้ใช้ หรือข้อมูล postback
   * @returns {Promise<object>} Flex Message object
   */
  async getWeeklyForecast(queryOrPostback) {
      const cityName = queryOrPostback.replace('weekly_forecast_', '');
      const city = this.extractCityFromQuery(cityName);
      if (!city) {
          return { type: 'text', text: 'ขออภัยครับ ไม่พบเมืองที่ต้องการ' };
      }

      const weatherData = await this.fetchOneCallApiData(city.lat, city.lon);
      return this.formatWeeklyForecast(weatherData, city);
  }

  /**
   * สร้าง Flex Message สำหรับพยากรณ์อากาศรายชั่วโมง (12 ชั่วโมง)
   * @param {string} queryOrPostback - ข้อความจากผู้ใช้ หรือข้อมูล postback
   * @returns {Promise<object>} Flex Message object
   */
  async getHourlyForecast(queryOrPostback) {
      const cityName = queryOrPostback.replace('hourly_forecast_', '');
      const city = this.extractCityFromQuery(cityName);
      if (!city) {
          return { type: 'text', text: 'ขออภัยครับ ไม่พบเมืองที่ต้องการ' };
      }

      const weatherData = await this.fetchOneCallApiData(city.lat, city.lon);
      return this.formatHourlyForecast(weatherData, city);
  }

  /**
   * สร้าง Flex Message สำหรับรายละเอียดของวันเดียว
   * @param {string} postbackData - ข้อมูล postback 'daily_detail_YYYY-MM-DD_CityName'
   * @returns {Promise<object>} Flex Message object
   */
  async getDailyDetailForecast(postbackData) {
      const parts = postbackData.split('_');
      const date = parts[2];
      const cityName = parts.slice(3).join('_');

      const city = this.extractCityFromQuery(cityName);
      if (!city) {
          return { type: 'text', text: 'ขออภัยครับ ไม่พบเมืองที่ต้องการ' };
      }

      const weatherData = await this.fetchOneCallApiData(city.lat, city.lon);
      const targetDay = weatherData.daily.find(day => moment.unix(day.dt).tz(city.timezone).format('YYYY-MM-DD') === date);

      if (!targetDay) {
          return { type: 'text', text: `ขออภัยครับ ไม่พบข้อมูลพยากรณ์สำหรับวันที่ ${date}` };
      }

      return this.formatDailyDetail(targetDay, city);
  }
  
  // --- Formatting Functions ---

  formatCurrentWeather(data, city) {
    const { current } = data;
    const today = data.daily[0];
    const weatherGradient = this.getWeatherGradient(current.weather[0].main);

    return {
      type: 'flex',
      altText: `สภาพอากาศ ${city.name}`,
      contents: {
        type: 'bubble',
        size: 'giga',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: city.name, color: '#ffffff', size: 'xl', weight: 'bold' },
            { type: 'text', text: moment().tz(city.timezone).format('dddd, DD MMMM'), color: '#ffffffcc', size: 'sm' }
          ],
          paddingAll: '20px',
          backgroundColor: weatherGradient.primary,
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: `${Math.round(current.temp)}°`,
                  size: '5xl',
                  color: weatherGradient.primary,
                  weight: 'bold',
                  flex: 2,
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    { type: 'text', text: this.getWeatherIcon(current.weather[0].main), align: 'center', size: '3xl' },
                    { type: 'text', text: current.weather[0].description, align: 'center', size: 'sm', color: '#555555', wrap: true }
                  ],
                  flex: 1,
                  alignItems: 'center'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'lg',
              contents: [
                { type: 'text', text: `สูงสุด: ${Math.round(today.temp.max)}°`, size: 'sm', color: '#555555' },
                { type: 'text', text: `ต่ำสุด: ${Math.round(today.temp.min)}°`, size: 'sm', color: '#555555', align: 'end' }
              ]
            },
            { type: 'separator', margin: 'xl' },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'xl',
              contents: [
                this.createInfoBox('ความชื้น', `${current.humidity}%`, '💧'),
                this.createInfoBox('ความเร็วลม', `${current.wind_speed.toFixed(1)} m/s`, '💨'),
                this.createInfoBox('UV Index', `${today.uvi.toFixed(1)}`, '☀️')
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              action: { type: 'postback', label: 'รายชั่วโมง', data: `hourly_forecast_${city.name}` },
              style: 'primary', color: weatherGradient.secondary, height: 'sm'
            },
            {
              type: 'button',
              action: { type: 'postback', label: 'รายสัปดาห์', data: `weekly_forecast_${city.name}` },
              style: 'primary', color: weatherGradient.primary, height: 'sm'
            }
          ]
        }
      }
    };
  }
  
  formatWeeklyForecast(data, city) {
    const bubbles = data.daily.map(day => {
        const date = moment.unix(day.dt).tz(city.timezone);
        const weatherGradient = this.getWeatherGradient(day.weather[0].main);

        return {
            type: 'bubble',
            size: 'micro',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: date.format('ddd'), weight: 'bold', align: 'center', color: '#555555' },
                    { type: 'text', text: date.format('DD/MM'), size: 'xs', align: 'center', color: '#aaaaaa' },
                    { type: 'text', text: this.getWeatherIcon(day.weather[0].main), size: 'xxl', align: 'center', margin: 'md' },
                    { type: 'text', text: `${Math.round(day.temp.max)}°/${Math.round(day.temp.min)}°`, size: 'md', align: 'center', margin: 'md', weight: 'bold' },
                    { type: 'text', text: day.weather[0].description, size: 'xs', color: '#888888', align: 'center', wrap: true },
                ],
                paddingAll: '12px'
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    action: { type: 'postback', label: 'รายละเอียด', data: `daily_detail_${date.format('YYYY-MM-DD')}_${city.name}` },
                    height: 'sm',
                    style: 'primary',
                    color: weatherGradient.primary,
                }],
                paddingAll: '8px'
            }
        };
    });

    return {
        type: 'flex',
        altText: `พยากรณ์อากาศรายสัปดาห์ ${city.name}`,
        contents: { type: 'carousel', contents: bubbles }
    };
  }

  formatHourlyForecast(data, city) {
    const bubbles = data.hourly.slice(0, 12).map(hour => {
        const date = moment.unix(hour.dt).tz(city.timezone);
        const weatherGradient = this.getWeatherGradient(hour.weather[0].main);
        return {
            type: 'bubble',
            size: 'micro',
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '12px',
                backgroundColor: weatherGradient.primary + '20', // Add some transparency to the background
                cornerRadius: 'md',
                contents: [
                    { type: 'text', text: date.format('HH:00'), weight: 'bold', align: 'center' },
                    { type: 'text', text: this.getWeatherIcon(hour.weather[0].main), size: 'xxl', align: 'center', margin: 'md' },
                    { type: 'text', text: `${Math.round(hour.temp)}°C`, size: 'lg', align: 'center', margin: 'md', weight: 'bold' },
                    { type: 'text', text: hour.weather[0].description, size: 'xs', color: '#888888', align: 'center', wrap: true },
                ]
            }
        };
    });
    return {
        type: 'flex',
        altText: `พยากรณ์อากาศรายชั่วโมง ${city.name}`,
        contents: { type: 'carousel', contents: bubbles }
    };
  }
  
  formatDailyDetail(day, city) {
    const date = moment.unix(day.dt).tz(city.timezone);
    const weatherGradient = this.getWeatherGradient(day.weather[0].main);

    const bodyContents = [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          this.createInfoBox('เช้า', `${Math.round(day.temp.morn)}°`, '🌅', 'md'),
          this.createInfoBox('กลางวัน', `${Math.round(day.temp.day)}°`, '☀️', 'md'),
        ],
        spacing: 'md'
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'md',
        contents: [
          this.createInfoBox('เย็น', `${Math.round(day.temp.eve)}°`, '🌇', 'md'),
          this.createInfoBox('กลางคืน', `${Math.round(day.temp.night)}°`, '🌙', 'md'),
        ],
        spacing: 'md'
      },
      { type: 'separator', margin: 'xl' },
      {
        type: 'box',
        layout: 'vertical',
        margin: 'lg',
        spacing: 'sm',
        contents: [
          this.createDetailRow('💧 โอกาสเกิดฝน:', `${Math.round(day.pop * 100)}%`),
          this.createDetailRow('💨 ความเร็วลม:', `${day.wind_speed.toFixed(1)} m/s`),
          this.createDetailRow('☁️ เมฆ:', `${day.clouds}%`),
          this.createDetailRow('☀️ UV Index:', `${day.uvi.toFixed(1)} (${this.getUviDescription(day.uvi)})`),
          this.createDetailRow('🌅 พระอาทิตย์ขึ้น:', moment.unix(day.sunrise).tz(city.timezone).format('HH:mm')),
          this.createDetailRow('🌇 พระอาทิตย์ตก:', moment.unix(day.sunset).tz(city.timezone).format('HH:mm')),
        ]
      }
    ];

    return {
      type: 'flex',
      altText: `รายละเอียดสภาพอากาศ ${city.name}`,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: weatherGradient.primary,
          paddingAll: '20px',
          contents: [
            { type: 'text', text: date.format('dddd, DD MMMM'), color: '#ffffff', weight: 'bold', size: 'lg' },
            { type: 'text', text: `${day.weather[0].description} (${Math.round(day.temp.max)}°/${Math.round(day.temp.min)}°)`, color: '#ffffffcc', size: 'sm' },
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: bodyContents
        }
      }
    };
  }

  // --- Helper Functions for Formatting ---

  createDetailRow(label, value) {
    return {
      type: 'box', layout: 'horizontal',
      contents: [
        { type: 'text', text: label, size: 'sm', color: '#555555', flex: 1 },
        { type: 'text', text: value, size: 'sm', color: '#111111', align: 'end' }
      ]
    };
  }
  
  createInfoBox(label, value, icon, size = 'sm') {
    return {
      type: 'box', layout: 'vertical', flex: 1,
      contents: [
        { type: 'text', text: icon, align: 'center', size: 'xl' },
        { type: 'text', text: label, align: 'center', size: 'xs', color: '#aaaaaa' },
        { type: 'text', text: value, align: 'center', weight: 'bold', size: size, margin: 'sm' },
      ]
    };
  }
  
  getWeatherIcon(condition) {
    const icons = { 'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️', 'Drizzle': '🌦️', 'Thunderstorm': '⛈️', 'Snow': '❄️', 'Mist': '🌫️', 'Fog': '🌫️', 'Haze': '🌫️' };
    return icons[condition] || '🌤️';
  }

  getWeatherGradient(condition) {
    const gradients = {
      'Clear': { primary: '#FF8C00', secondary: '#FFA500' },
      'Clouds': { primary: '#6A89CC', secondary: '#82A0D8' },
      'Rain': { primary: '#4A90E2', secondary: '#5DADE2' },
      'Drizzle': { primary: '#85C1E9', secondary: '#AED6F1' },
      'Thunderstorm': { primary: '#5D4E75', secondary: '#8E44AD' },
      'Snow': { primary: '#A9CCE3', secondary: '#D4E6F1' },
      'Mist': { primary: '#B2BABB', secondary: '#D5DBDB' },
      'Fog': { primary: '#B2BABB', secondary: '#D5DBDB' },
      'Haze': { primary: '#F39C12', secondary: '#E67E22' }
    };
    return gradients[condition] || { primary: '#6A89CC', secondary: '#82A0D8' };
  }
  
  getUviDescription(uvi) {
      if (uvi < 3) return 'ต่ำ';
      if (uvi < 6) return 'ปานกลาง';
      if (uvi < 8) return 'สูง';
      if (uvi < 11) return 'สูงมาก';
      return 'อันตราย';
  }
}

module.exports = WeatherService;
