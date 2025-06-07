const moment = require('moment-timezone');

const getCurrentTime = (timezone = 'Asia/Bangkok') => {
  const now = moment().tz(timezone);
  const formattedTime = now.format('HH:mm');
  const formattedDate = now.format('dddd, D MMMM YYYY');
  
  return {
    time: formattedTime,
    date: formattedDate,
    timezone: timezone,
    formatted: `ตอนนี้เวลา ${formattedTime} น. วัน${formattedDate}`
  };
};

module.exports = { getCurrentTime };
