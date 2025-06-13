const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
class BrowserService {
  constructor() {
    console.log('✅ BrowserService initialized with @sparticuz/chromium.');
  }

  /**
   * เปิดหน้าเว็บและดึงเนื้อหาข้อความออกมา
   * @param {string} url - URL ของเว็บไซต์ที่ต้องการเปิด
   * @returns {Promise<string>} เนื้อหาข้อความจากหน้าเว็บ
   */
  async browse(url) {
    let browser = null;
    console.log(`🚀 Starting browser to browse: ${url}`);

    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(), 
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });

      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const content = await page.evaluate(() => {
        document.querySelectorAll('nav, footer, script, style, aside').forEach(el => el.remove());
        return document.body.innerText;
      });

      console.log(`✅ Successfully scraped content from ${url}. Length: ${content.length}`);

      return content.trim().substring(0, 25000);

    } catch (error) {
      console.error(`💥 Error Browse website ${url}:`, error.message);
      throw new Error(`Could not retrieve content from the website. It might be down or blocking access.`);
    } finally {
      if (browser !== null) {
        await browser.close();
        console.log('🚪 Browser closed.');
      }
    }
  }
}

module.exports = BrowserService;