const axios = require("axios");

const getWeatherForecast = async (city) => {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=th`;
    
    const response = await axios.get(url);
    const data = response.data;

    return {
      city: data.name,
      country: data.sys.country,
      temp: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      description: data.weather[0].description,
      wind_speed: Math.round(data.wind.speed * 3.6)
    };
  } catch (error) {
    console.error("Weather API Error:", error.message);
    return { error: `ไม่สามารถดึงข้อมูลอากาศของ ${city} ได้ในขณะนี้` };
  }
};

module.exports = { getWeatherForecast };
