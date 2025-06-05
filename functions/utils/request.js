// /functions/utils/request.js
const axios = require("axios");
const LINE_HEADER = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
};

class Request {
  loading(userId) {
    return axios({
      method: "post",
      url: "https://api.line.me/v2/bot/chat/loading/start",
      headers: LINE_HEADER,
      data: {chatId: userId, loadingSeconds: 10},
    });
  }

  async curl(url) {
    try {
      return await axios({method: "get", url, responseType: "arraybuffer"});
    } catch (error) {
      throw new Error("Could not fetch from URL.");
    }
  }
}

module.exports = new Request();
