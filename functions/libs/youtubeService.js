const axios = require('axios');

class YouTubeService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3/search';
    if (!this.apiKey) {
      console.error('❌ YouTube API key is missing.');
    }
  }

  /**
   * ค้นหาวิดีโอใน YouTube
   * @param {string} query - คำค้นหา
   * @returns {Promise<Array<object>>} รายการวิดีโอ
   */
  async search(query) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    const params = {
      part: 'snippet',
      q: query,
      key: this.apiKey,
      type: 'video',
      maxResults: 5, // ค้นหามา 5 รายการ เผื่อเลือก
      order: 'relevance' // เรียงตามความเกี่ยวข้อง
    };

    try {
      console.log(`Searching YouTube for: "${query}"`);
      const response = await axios.get(this.baseUrl, { params });

      const results = response.data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high.url,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`
      }));

      console.log(`✅ Found ${results.length} videos from YouTube.`);
      return results;
    } catch (error) {
      console.error('💥 Error fetching from YouTube API:', error.response ? error.response.data : error.message);
      throw new Error('Could not retrieve video data from YouTube.');
    }
  }
  // ในไฟล์ functions/libs/youtubeService.js

  async search(query) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    const params = {
      part: 'snippet',
      q: query,
      key: this.apiKey,
      type: 'video',
      maxResults: 5,
      order: 'relevance'
    };

    try {
      console.log(`Searching YouTube for: "${query}"`);
      const response = await axios.get(this.baseUrl, { params });

      const results = response.data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high.url,
        channelTitle: item.snippet.channelTitle, // <-- เพิ่มข้อมูลชื่อช่อง
        url: `https://www.youtube.com/watch?v=${item.id.videoId}` // <-- [แก้ไข] เปลี่ยนเป็น URL ที่ถูกต้อง
      }));

      console.log(`✅ Found ${results.length} videos from YouTube.`);
      return results;
    } catch (error) {
      console.error('💥 Error fetching from YouTube API:', error.response ? error.response.data : error.message);
      throw new Error('Could not retrieve video data from YouTube.');
    }
  }
}

module.exports = YouTubeService;