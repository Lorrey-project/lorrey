const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:5173/account-details', { waitUntil: 'networkidle2' });
    
    // Wait for the red div to appear
    await page.waitForSelector('div[style*="color: red"]', { timeout: 10000 });
    
    const text = await page.evaluate(() => {
      const div = document.querySelector('div[style*="color: red"]');
      return div ? div.innerText : 'Not found';
    });
    
    console.log("RED DIV TEXT:", text);
    
    await browser.close();
  } catch (err) {
    console.error("Puppeteer Error:", err);
    process.exit(1);
  }
})();
