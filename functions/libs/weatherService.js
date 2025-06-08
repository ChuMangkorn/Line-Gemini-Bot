const axios = require('axios');

class WeatherService {
  constructor() {
    this.apiKey = process.env.OPENWEATHER_API_KEY;
    this.baseUrl = 'https://api.openweathermap.org/data/2.5';
    
    console.log('WeatherService initialized with API key:', this.apiKey ? 'Available' : 'Missing');
    
    this.supportedCities = {
      'กรุงเทพ': { lat: 13.7563, lon: 100.5018, name: 'Bangkok' },
      'กรุงเทพฯ': { lat: 13.7563, lon: 100.5018, name: 'Bangkok' },
      'bangkok': { lat: 13.7563, lon: 100.5018, name: 'Bangkok' },
      'โอตารุ': { lat: 43.1907, lon: 140.9947, name: 'Otaru' },
      'otaru': { lat: 43.1907, lon: 140.9947, name: 'Otaru' },
      'อุสึโนะมิยะ': { lat: 36.5583, lon: 139.8694, name: 'Utsunomiya' },
      'utsunomiya': { lat: 36.5583, lon: 139.8694, name: 'Utsunomiya' },
      'โตเกียว': { lat: 35.6762, lon: 139.6503, name: 'Tokyo' },
      'tokyo': { lat: 35.6762, lon: 139.6503, name: 'Tokyo' },
      'ซัปโปโร': { lat: 43.0642, lon: 141.3469, name: 'Sapporo' },
      'sapporo': { lat: 43.0642, lon: 141.3469, name: 'Sapporo' }
    };
  }

  async getWeatherInfo(query) {
    try {
      const city = this.extractCityFromQuery(query);

      if (!city) {
        return {
          type: 'text',
          text: 'ไม่พบเมืองที่ต้องการพยากรณ์อากาศ กรุณาระบุชื่อเมืองที่รองรับ: ' + Object.keys(this.supportedCities).join(', ')
        };
      }

      console.log(`Getting REAL weather for ${city.name} (${city.lat}, ${city.lon})`);

      const weatherData = await this.fetchWeatherData(city.lat, city.lon);
      const forecast = await this.fetchForecastData(city.lat, city.lon);
      
      return this.formatWeatherResponse(weatherData, forecast, city.name);
      
    } catch (error) {
      console.error('Weather service error:', error);
      return {
        type: 'text',
        text: `❌ ไม่สามารถดึงข้อมูลสภาพอากาศได้: ${error.message}`
      };
    }
  }

  async fetchWeatherData(lat, lon) {
    if (!this.apiKey) {
      throw new Error('OpenWeatherMap API key not configured');
    }

    const url = `${this.baseUrl}/weather`;
    const params = {
      lat: lat,
      lon: lon,
      appid: this.apiKey,
      units: 'metric',
      lang: 'th'
    };

    console.log('Fetching REAL weather data from OpenWeatherMap...');
    const response = await axios.get(url, { params });
    console.log('✅ Real weather data received successfully');
    return response.data;
  }

  async fetchForecastData(lat, lon) {
    if (!this.apiKey) {
      throw new Error('OpenWeatherMap API key not configured');
    }

    const url = `${this.baseUrl}/forecast`;
    const params = {
      lat: lat,
      lon: lon,
      appid: this.apiKey,
      units: 'metric',
      lang: 'th',
      cnt: 8
    };

    console.log('Fetching REAL forecast data from OpenWeatherMap...');
    const response = await axios.get(url, { params });
    console.log('✅ Real forecast data received successfully');
    return response.data;
  }

  async fetchWeeklyForecastData(lat, lon) {
    if (!this.apiKey) {
      throw new Error('OpenWeatherMap API key not configured');
    }

    const url = `${this.baseUrl}/forecast`;
    const params = {
      lat: lat,
      lon: lon,
      appid: this.apiKey,
      units: 'metric',
      lang: 'th',
      cnt: 40
    };

    console.log('Fetching REAL weekly forecast data from OpenWeatherMap...');
    const response = await axios.get(url, { params });
    console.log('✅ Real weekly forecast data received successfully');
    return response.data;
  }

  formatWeatherResponse(current, forecast, cityName) {
    try {
      const fullResponse = this.formatWeatherResponseFull(current, forecast, cityName);
      
      const responseSize = JSON.stringify(fullResponse).length;
      
      if (responseSize > 3000) {
        console.log('Using compact weather response due to size limit');
        return this.formatWeatherResponseCompact(current, forecast, cityName);
      }
      
      return fullResponse;
      
    } catch (error) {
      console.error('Error in formatWeatherResponse:', error);
      return this.formatWeatherTextFallback(current, forecast, cityName);
    }
  }

  formatWeatherResponseFull(current, forecast, cityName) {
    try {
      const currentTime = new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      if (!current || !current.main || !current.weather || !current.weather[0]) {
        throw new Error('Invalid weather data received');
      }

      const weatherGradient = this.getWeatherGradient(current.weather[0].main);
      
      return {
        type: 'flex',
        altText: `สภาพอากาศ ${cityName} - ${Math.round(current.main.temp)}°C`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: `🌤️ ${cityName}`,
                weight: 'bold',
                size: 'xl',
                color: '#ffffff'
              },
              {
                type: 'text',
                text: currentTime,
                size: 'sm',
                color: '#ffffff'
              }
            ],
            backgroundColor: weatherGradient.primary,
            paddingAll: '20px'
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
                    text: `${Math.round(current.main.temp)}°C`,
                    size: '4xl',
                    weight: 'bold',
                    color: weatherGradient.primary,
                    flex: 1
                  },
                  {
                    type: 'text',
                    text: this.getWeatherIcon(current.weather[0].main),
                    size: '4xl',
                    align: 'end',
                    flex: 0
                  }
                ]
              },
              {
                type: 'text',
                text: current.weather[0].description,
                size: 'lg',
                color: '#333333',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  {
                    type: 'text',
                    text: `💧 ${current.main.humidity}%`,
                    size: 'sm',
                    color: '#666666',
                    flex: 1
                  },
                  {
                    type: 'text',
                    text: `💨 ${current.wind?.speed || 0} ม./วิ`,
                    size: 'sm',
                    color: '#666666',
                    flex: 1
                  }
                ],
                margin: 'lg'
              }
            ],
            paddingAll: '20px'
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '📊 รายละเอียด',
                  data: `detailed_forecast_${cityName}`
                },
                style: 'primary',
                color: weatherGradient.primary
              }
            ],
            paddingAll: '10px'
          }
        }
      };

    } catch (error) {
      console.error('Error creating full weather UI:', error);
      return this.formatWeatherTextFallback(current, forecast, cityName);
    }
  }

  formatWeatherResponseCompact(current, forecast, cityName) {
    try {
      const currentTime = new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        type: 'flex',
        altText: `สภาพอากาศ ${cityName} - ${Math.round(current.main.temp)}°C`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: `🌤️ ${cityName}`,
                weight: 'bold',
                size: 'xl',
                color: '#ffffff'
              },
              {
                type: 'text',
                text: currentTime,
                size: 'sm',
                color: '#ffffff'
              }
            ],
            backgroundColor: '#4A90E2',
            paddingAll: '20px'
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
                    text: `${Math.round(current.main.temp)}°C`,
                    size: '4xl',
                    weight: 'bold',
                    color: '#4A90E2',
                    flex: 1
                  },
                  {
                    type: 'text',
                    text: this.getWeatherIcon(current.weather[0].main),
                    size: '4xl',
                    align: 'end',
                    flex: 0
                  }
                ]
              },
              {
                type: 'text',
                text: current.weather[0].description,
                size: 'lg',
                color: '#333333',
                margin: 'md'
              }
            ],
            paddingAll: '20px'
          }
        }
      };

    } catch (error) {
      console.error('Error creating compact weather UI:', error);
      return this.formatWeatherTextFallback(current, forecast, cityName);
    }
  }

  formatWeatherTextFallback(current, forecast, cityName) {
    try {
      const currentTime = new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const temp = current?.main?.temp ? Math.round(current.main.temp) : 'N/A';
      const feelsLike = current?.main?.feels_like ? Math.round(current.main.feels_like) : 'N/A';
      const description = current?.weather?.[0]?.description || 'ไม่ระบุ';
      const humidity = current?.main?.humidity || 'N/A';
      const windSpeed = current?.wind?.speed || 'N/A';

      return `🌤️ สภาพอากาศ ${cityName} (ข้อมูลจริงจาก OpenWeatherMap)
📅 ${currentTime}

🌡️ อุณหภูมิ: ${temp}°C (รู้สึกเหมือน ${feelsLike}°C)
☁️ สภาพอากาศ: ${description}
💧 ความชื้น: ${humidity}%
💨 ลม: ${windSpeed} ม./วิ

💡 ข้อมูลสภาพอากาศปัจจุบัน`;

    } catch (error) {
      console.error('Error creating fallback text:', error);
      return `❌ ไม่สามารถแสดงข้อมูลสภาพอากาศ ${cityName} ได้ในขณะนี้`;
    }
  }

  // Weather Gradient Methods
  getWeatherGradient(condition) {
    const gradients = {
      'Clear': { primary: '#FF6B35', secondary: '#F7931E' },
      'Clouds': { primary: '#4A90E2', secondary: '#7B68EE' },
      'Rain': { primary: '#4A90E2', secondary: '#5DADE2' },
      'Drizzle': { primary: '#85C1E9', secondary: '#AED6F1' },
      'Thunderstorm': { primary: '#5D4E75', secondary: '#8E44AD' },
      'Snow': { primary: '#85C1E9', secondary: '#D5DBDB' },
      'Mist': { primary: '#95A5A6', secondary: '#BDC3C7' },
      'Fog': { primary: '#95A5A6', secondary: '#BDC3C7' },
      'Haze': { primary: '#F39C12', secondary: '#E67E22' }
    };
    
    return gradients[condition] || { primary: '#4A90E2', secondary: '#7B68EE' };
  }

  getWeatherIcon(condition) {
    const icons = {
      'Clear': '☀️',
      'Clouds': '☁️',
      'Rain': '🌧️',
      'Drizzle': '🌦️',
      'Thunderstorm': '⛈️',
      'Snow': '❄️',
      'Mist': '🌫️',
      'Fog': '🌫️',
      'Haze': '🌫️'
    };
    
    return icons[condition] || '🌤️';
  }

  getDetailedWeatherIcon(condition) {
    const detailedIcons = {
      'Clear': '☀️',
      'Clouds': '☁️',
      'Rain': '🌧️',
      'Drizzle': '🌦️',
      'Thunderstorm': '⛈️',
      'Snow': '❄️',
      'Mist': '🌫️',
      'Fog': '🌫️',
      'Haze': '🌫️'
    };
    
    return detailedIcons[condition] || '🌤️';
  }

  // Weekly Forecast Methods
  async getWeeklyForecast(query) {
    try {
      const city = this.extractCityFromQuery(query);

      if (!city) {
        return 'ไม่พบเมืองที่ต้องการพยากรณ์อากาศ กรุณาระบุชื่อเมืองที่รองรับ';
      }

      console.log(`Getting WEEKLY weather for ${city.name}`);

      const forecast = await this.fetchWeeklyForecastData(city.lat, city.lon);
      
      return this.formatWeeklyForecastCarousel(forecast, city.name);
      
    } catch (error) {
      console.error('Weekly weather service error:', error);
      return `❌ ไม่สามารถดึงข้อมูลพยากรณ์อากาศรายสัปดาห์ได้: ${error.message}`;
    }
  }

  formatWeeklyForecastCarousel(forecast, cityName) {
    const dailyForecasts = this.groupForecastByDay(forecast.list);
    
    const bubbles = dailyForecasts.slice(0, 7).map((dayData, index) => {
      const date = new Date(dayData.dt * 1000);
      const dayName = date.toLocaleDateString('th-TH', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });

      const isToday = index === 0;
      const weatherGradient = this.getWeatherGradient(dayData.weather[0].main);

      return {
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: isToday ? 'วันนี้' : dayName,
              weight: 'bold',
              size: 'md',
              align: 'center',
              color: '#ffffff'
            }
          ],
          backgroundColor: isToday ? '#FF6B35' : weatherGradient.primary,
          paddingAll: '16px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: this.getDetailedWeatherIcon(dayData.weather[0].main),
              size: '4xl',
              align: 'center'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: `${Math.round(dayData.temp_max)}°`,
                  weight: 'bold',
                  size: 'xl',
                  color: '#FF6B35',
                  flex: 1,
                  align: 'center'
                },
                {
                  type: 'text',
                  text: `${Math.round(dayData.temp_min)}°`,
                  size: 'lg',
                  color: '#4A90E2',
                  flex: 1,
                  align: 'center'
                }
              ],
              margin: 'md'
            },
            {
              type: 'text',
              text: dayData.weather[0].description,
              size: 'xs',
              align: 'center',
              color: '#666666',
              wrap: true,
              margin: 'sm'
            }
          ],
          paddingAll: '20px'
        }
      };
    });

    return {
      type: 'flex',
      altText: `พยากรณ์อากาศ ${cityName} รายสัปดาห์`,
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    };
  }

  // Detailed Forecast Methods
  async getDetailedForecast(query) {
    try {
      const city = this.extractCityFromQuery(query);

      if (!city) {
        return 'ไม่พบเมืองที่ต้องการพยากรณ์อากาศ กรุณาระบุชื่อเมืองที่รองรับ';
      }

      console.log(`Getting DETAILED forecast for ${city.name}`);

      const forecast = await this.fetchWeeklyForecastData(city.lat, city.lon);
      
      return this.formatDetailedForecast(forecast, city.name);
      
    } catch (error) {
      console.error('Detailed forecast service error:', error);
      return `❌ ไม่สามารถดึงข้อมูลพยากรณ์อากาศรายละเอียดได้: ${error.message}`;
    }
  }

  formatDetailedForecast(forecast, cityName) {
    try {
      const bubbles = forecast.list.slice(0, 8).map((item, index) => {
        const date = new Date(item.dt * 1000);
        const time = date.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const day = date.toLocaleDateString('th-TH', {
          weekday: 'short'
        });

        const weatherGradient = this.getWeatherGradient(item.weather[0].main);

        return {
          type: 'bubble',
          size: 'micro',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: day,
                weight: 'bold',
                size: 'sm',
                align: 'center',
                color: '#ffffff'
              },
              {
                type: 'text',
                text: time,
                size: 'xs',
                align: 'center',
                color: '#ffffff',
                margin: 'xs'
              }
            ],
            backgroundColor: weatherGradient.primary,
            paddingAll: '12px'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: this.getDetailedWeatherIcon(item.weather[0].main),
                size: '3xl',
                align: 'center'
              },
              {
                type: 'text',
                text: `${Math.round(item.main.temp)}°C`,
                weight: 'bold',
                size: 'lg',
                align: 'center',
                color: weatherGradient.primary,
                margin: 'sm'
              },
              {
                type: 'text',
                text: item.weather[0].description,
                size: 'xs',
                align: 'center',
                color: '#666666',
                wrap: true,
                margin: 'xs'
              }
            ],
            paddingAll: '16px'
          }
        };
      });

      return {
        type: 'flex',
        altText: `พยากรณ์อากาศ ${cityName} 24 ชั่วโมง`,
        contents: {
          type: 'carousel',
          contents: bubbles
        }
      };

    } catch (error) {
      console.error('Error formatting detailed forecast:', error);
      return `❌ ไม่สามารถแสดงพยากรณ์อากาศรายละเอียดสำหรับ ${cityName} ได้`;
    }
  }

  // Helper Methods
  groupForecastByDay(forecastList) {
    const dailyData = {};
    
    forecastList.forEach(item => {
      const date = new Date(item.dt * 1000);
      const dateKey = date.toDateString();
      
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          dt: item.dt,
          temp_max: item.main.temp,
          temp_min: item.main.temp,
          weather: item.weather,
          humidity: item.main.humidity,
          temps: [item.main.temp]
        };
      } else {
        dailyData[dateKey].temp_max = Math.max(dailyData[dateKey].temp_max, item.main.temp);
        dailyData[dateKey].temp_min = Math.min(dailyData[dateKey].temp_min, item.main.temp);
        dailyData[dateKey].temps.push(item.main.temp);
        
        if (item.dt > dailyData[dateKey].dt) {
          dailyData[dateKey].weather = item.weather;
          dailyData[dateKey].humidity = item.main.humidity;
        }
      }
    });
    
    return Object.values(dailyData);
  }

  extractCityFromQuery(query) {
    const lowerQuery = query.toLowerCase();

    for (const [keyword, cityInfo] of Object.entries(this.supportedCities)) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        console.log(`Found city: ${keyword} -> ${cityInfo.name}`);
        return cityInfo;
      }
    }

    return null;
  }

  async getWeatherByCoordinates(lat, lon) {
    try {
      const weatherData = await this.fetchWeatherData(lat, lon);
      const forecast = await this.fetchForecastData(lat, lon);

      return this.formatWeatherResponse(weatherData, forecast, 'ตำแหน่งที่ระบุ');

    } catch (error) {
      console.error('Weather by coordinates error:', error);
      return `❌ ไม่สามารถดึงข้อมูลสภาพอากาศได้: ${error.message}`;
    }
  }
}

module.exports = WeatherService;
