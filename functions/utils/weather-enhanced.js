const axios = require("axios");
const moment = require('moment-timezone');

class EnhancedWeather {
  constructor() {
    console.log("🌤️ EnhancedWeather constructor called");
    this.apiKey = process.env.OPENWEATHER_API_KEY;
    this.baseUrl = "https://api.openweathermap.org/data/2.5";
    this.oneCallUrl = "https://api.openweathermap.org/data/3.0/onecall";
    
    this.cities = {
      'โอตารุ': { name: 'Otaru', lat: 43.1907, lon: 140.9947, timezone: 'Asia/Tokyo' },
      'อุสึโนะมิยะ': { name: 'Utsunomiya', lat: 36.5658, lon: 139.8836, timezone: 'Asia/Tokyo' },
      'ซัปโปโร': { name: 'Sapporo', lat: 43.0642, lon: 141.3469, timezone: 'Asia/Tokyo' },
      'โตเกียว': { name: 'Tokyo', lat: 35.6762, lon: 139.6503, timezone: 'Asia/Tokyo' },
      'กรุงเทพ': { name: 'Bangkok', lat: 13.7563, lon: 100.5018, timezone: 'Asia/Bangkok' },
      'เชียงใหม่': { name: 'Chiang Mai', lat: 18.7883, lon: 98.9853, timezone: 'Asia/Bangkok' }
    };
    
    // ตรวจสอบว่า methods ถูกสร้างหรือไม่
    console.log("🔧 Available methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(this)));
  }

  findCityInfo(cityName) {
    const normalizedName = cityName.toLowerCase().trim();
    
    for (const [key, value] of Object.entries(this.cities)) {
      if (key.toLowerCase().includes(normalizedName) || 
          value.name.toLowerCase().includes(normalizedName)) {
        return value;
      }
    }
    
    return null;
  }

  async getCurrentWeather(city) {
    console.log("🌤️ getCurrentWeather called for:", city);
    
    try {
      if (!this.apiKey) {
        console.error("❌ OPENWEATHER_API_KEY not found");
        return { error: "ไม่พบ API Key สำหรับบริการพยากรณ์อากาศ" };
      }

      const cityInfo = this.findCityInfo(city);
      let url;
      
      if (cityInfo) {
        url = `${this.baseUrl}/weather?lat=${cityInfo.lat}&lon=${cityInfo.lon}&appid=${this.apiKey}&units=metric&lang=th`;
      } else {
        url = `${this.baseUrl}/weather?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=metric&lang=th`;
      }

      console.log("🌤️ Calling OpenWeather API:", url.replace(this.apiKey, 'API_KEY_HIDDEN'));
      
      const response = await axios.get(url);
      const data = response.data;

      return {
        city: data.name,
        country: data.sys.country,
        temp: Math.round(data.main.temp),
        feels_like: Math.round(data.main.feels_like),
        temp_min: Math.round(data.main.temp_min),
        temp_max: Math.round(data.main.temp_max),
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        wind_speed: Math.round(data.wind.speed * 3.6),
        visibility: Math.round(data.visibility / 1000),
        sunrise: moment.unix(data.sys.sunrise).tz(cityInfo?.timezone || 'Asia/Bangkok').format('HH:mm'),
        sunset: moment.unix(data.sys.sunset).tz(cityInfo?.timezone || 'Asia/Bangkok').format('HH:mm'),
        timezone: cityInfo?.timezone || 'Asia/Bangkok'
      };
    } catch (error) {
      console.error("❌ Current weather error:", error.response?.status, error.response?.data || error.message);
      return { error: `ไม่สามารถดึงข้อมูลอากาศของ ${city} ได้ในขณะนี้` };
    }
  }

  async get8DayForecast(city) {
    console.log("🌦️ get8DayForecast called for:", city);
    
    try {
      if (!this.apiKey) {
        return { error: "ไม่พบ API Key สำหรับบริการพยากรณ์อากาศ" };
      }

      const cityInfo = this.findCityInfo(city);
      if (!cityInfo) {
        return { error: `ไม่พบข้อมูลเมือง ${city}` };
      }

      const url = `${this.oneCallUrl}?lat=${cityInfo.lat}&lon=${cityInfo.lon}&appid=${this.apiKey}&units=metric&lang=th`;
      
      console.log("🌦️ Calling 8-day forecast API 3.0:", url.replace(this.apiKey, 'API_KEY_HIDDEN'));
      
      const response = await axios.get(url);
      const data = response.data;

      const forecast = data.daily.slice(0, 8).map(day => ({
        date: moment.unix(day.dt).tz(cityInfo.timezone).format('dddd, DD MMM'),
        temp_min: Math.round(day.temp.min),
        temp_max: Math.round(day.temp.max),
        description: day.weather[0].description,
        icon: day.weather[0].icon,
        humidity: day.humidity,
        wind_speed: Math.round(day.wind_speed * 3.6),
        pop: Math.round(day.pop * 100),
        uvi: Math.round(day.uvi)
      }));

      return {
        city: cityInfo.name,
        timezone: cityInfo.timezone,
        forecast: forecast
      };
    } catch (error) {
      console.error("❌ 8-day forecast error:", error.response?.status, error.response?.data || error.message);
      return { error: `ไม่สามารถดึงข้อมูลพยากรณ์อากาศ 8 วันของ ${city} ได้` };
    }
  }

  async getWeatherOverview(city) {
    console.log("🤖 getWeatherOverview called for:", city);
    return { error: "Weather Overview ยังไม่พร้อมใช้งาน" };
  }

  async getMinuteForecast(city) {
    console.log("⏱️ getMinuteForecast called for:", city);
    return { error: "Minute Forecast ยังไม่พร้อมใช้งาน" };
  }

  create8DayFlexMessage(forecastData) {
    if (forecastData.error) {
      return { type: "text", text: forecastData.error };
    }

    return {
      type: "flex",
      altText: `พยากรณ์อากาศ 8 วัน ${forecastData.city}`,
      contents: {
        type: "carousel",
        contents: forecastData.forecast.slice(0, 5).map(day => ({
          type: "bubble",
          size: "micro",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: day.date,
                weight: "bold",
                size: "sm"
              },
              {
                type: "text",
                text: `${day.temp_max}°/${day.temp_min}°`,
                size: "lg",
                weight: "bold"
              },
              {
                type: "text",
                text: day.description,
                size: "xs",
                wrap: true
              }
            ]
          }
        }))
      }
    };
  }
}

// ✅ การ export ที่ถูกต้อง
module.exports = EnhancedWeather;
