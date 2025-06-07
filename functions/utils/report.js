const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

class UsageReport {
  constructor() {
    this.db = admin.firestore();
  }

  // ดึงข้อมูลการใช้งานรายวัน
  async getDailyUsage(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      const usageSnapshot = await this.db.collection('usage_stats')
        .where('date', '==', targetDate)
        .get();

      let totalGemini = 0;
      let totalLine = 0;
      let userCount = 0;
      let totalTokens = 0;
      let totalLatency = 0;
      const userDetails = [];

      usageSnapshot.forEach(doc => {
        const data = doc.data();
        totalGemini += data.geminiCalls || 0;
        totalLine += data.lineCalls || 0;
        totalTokens += data.totalTokens || 0;
        totalLatency += data.avgLatency || 0;
        userCount++;
        
        userDetails.push({
          userId: data.userId,
          geminiCalls: data.geminiCalls || 0,
          lineCalls: data.lineCalls || 0,
          tokens: data.totalTokens || 0
        });
      });

      return {
        date: targetDate,
        summary: {
          totalUsers: userCount,
          totalGeminiCalls: totalGemini,
          totalLineCalls: totalLine,
          totalTokens: totalTokens,
          avgLatency: userCount > 0 ? Math.round(totalLatency / userCount) : 0
        },
        userDetails: userDetails
      };
    } catch (error) {
      console.error('Get daily usage error:', error);
      return null;
    }
  }

  // ดึงข้อมูลการใช้งานรายสัปดาห์
  async getWeeklyUsage() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const weeklyData = [];
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const dayData = await this.getDailyUsage(dateStr);
      weeklyData.push(dayData);
    }

    return weeklyData;
  }

  // สร้าง HTML Dashboard
  async generateHTMLReport(data) {
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>เล้ง AI Usage Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { font-size: 1.2em; opacity: 0.9; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            padding: 30px;
        }
        .stat-card {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 25px;
            text-align: center;
            border-left: 5px solid #667eea;
            transition: transform 0.3s ease;
        }
        .stat-card:hover { transform: translateY(-5px); }
        .stat-number {
            font-size: 2.5em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }
        .stat-label {
            font-size: 1.1em;
            color: #6c757d;
            font-weight: 500;
        }
        .details-section {
            padding: 30px;
            background: #f8f9fa;
        }
        .details-title {
            font-size: 1.5em;
            margin-bottom: 20px;
            color: #495057;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .user-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .user-table th {
            background: #667eea;
            color: white;
            padding: 15px;
            text-align: left;
        }
        .user-table td {
            padding: 12px 15px;
            border-bottom: 1px solid #dee2e6;
        }
        .user-table tr:hover {
            background: #f8f9fa;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #6c757d;
            font-size: 0.9em;
        }
        .emoji { font-size: 1.2em; margin-right: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 เล้ง AI Usage Report</h1>
            <p>รายงานการใช้งาน API วันที่ ${data.date}</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${data.summary.totalUsers}</div>
                <div class="stat-label"><span class="emoji">👥</span>ผู้ใช้งานทั้งหมด</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.summary.totalGeminiCalls}</div>
                <div class="stat-label"><span class="emoji">🧠</span>Gemini API Calls</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.summary.totalLineCalls}</div>
                <div class="stat-label"><span class="emoji">💬</span>LINE API Calls</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.summary.totalTokens.toLocaleString()}</div>
                <div class="stat-label"><span class="emoji">🔤</span>Total Tokens</div>
            </div>
        </div>
        
        <div class="details-section">
            <h2 class="details-title">📊 รายละเอียดการใช้งานรายผู้ใช้</h2>
            <table class="user-table">
                <thead>
                    <tr>
                        <th>User ID</th>
                        <th>Gemini Calls</th>
                        <th>LINE Calls</th>
                        <th>Tokens Used</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.userDetails.map(user => `
                        <tr>
                            <td>${user.userId.substring(0, 8)}...</td>
                            <td>${user.geminiCalls}</td>
                            <td>${user.lineCalls}</td>
                            <td>${user.tokens.toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="footer">
            <p>Generated on ${new Date().toLocaleString('th-TH')} | เล้ง AI Bot by มังกร 🐉</p>
        </div>
    </div>
</body>
</html>`;

    return htmlTemplate;
  }

  // สร้างรายงานแบบ Text
  generateTextReport(data) {
    let report = `
╔══════════════════════════════════════════════════════════════╗
║                    🤖 เล้ง AI Usage Report                   ║
╠══════════════════════════════════════════════════════════════╣
║ วันที่: ${data.date}                                         ║
╠══════════════════════════════════════════════════════════════╣
║ 📊 สรุปการใช้งาน                                            ║
║ • ผู้ใช้งานทั้งหมด: ${data.summary.totalUsers.toString().padStart(8)} คน      ║
║ • Gemini API Calls: ${data.summary.totalGeminiCalls.toString().padStart(6)} ครั้ง    ║
║ • LINE API Calls: ${data.summary.totalLineCalls.toString().padStart(8)} ครั้ง    ║
║ • Total Tokens: ${data.summary.totalTokens.toLocaleString().padStart(10)}        ║
║ • Avg Latency: ${data.summary.avgLatency.toString().padStart(9)} ms       ║
╠══════════════════════════════════════════════════════════════╣
║ 👥 รายละเอียดผู้ใช้                                          ║
╚══════════════════════════════════════════════════════════════╝

`;

    data.userDetails.forEach((user, index) => {
      report += `${(index + 1).toString().padStart(2)}. User: ${user.userId.substring(0, 12)}... | `;
      report += `Gemini: ${user.geminiCalls.toString().padStart(3)} | `;
      report += `LINE: ${user.lineCalls.toString().padStart(3)} | `;
      report += `Tokens: ${user.tokens.toLocaleString().padStart(6)}\n`;
    });

    report += `\n🕒 Generated: ${new Date().toLocaleString('th-TH')}\n`;
    report += `🐉 เล้ง AI Bot by มังกร\n`;

    return report;
  }

  // บันทึกรายงานเป็นไฟล์
  async saveReport(data, format = 'html') {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      let content, filename, filePath;

      if (format === 'html') {
        content = await this.generateHTMLReport(data);
        filename = `usage_report_${timestamp}.html`;
        filePath = path.join('/tmp', filename);
      } else {
        content = this.generateTextReport(data);
        filename = `usage_report_${timestamp}.txt`;
        filePath = path.join('/tmp', filename);
      }

      fs.writeFileSync(filePath, content, 'utf8');
      return { filePath, filename };
    } catch (error) {
      console.error('Save report error:', error);
      return null;
    }
  }
}

module.exports = UsageReport;
