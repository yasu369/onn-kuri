const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const viewports = {
    desktop: { width: 1440, height: 1200 },
    mobile: { width: 390, height: 1200 },
  };
  const results = [];

  for (const [name, viewport] of Object.entries(viewports)) {
    const page = await browser.newPage({ viewport });
    await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
    await page.screenshot({ path: `${name}-preview.png`, fullPage: true });
    const metrics = await page.evaluate(() => ({
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      imageLoaded: Boolean(document.querySelector(".hero-visual img")?.complete),
      menuButtonVisible: getComputedStyle(document.querySelector(".menu-button")).display !== "none",
    }));
    results.push({
      name,
      ...metrics,
      overflow: metrics.scrollWidth > metrics.clientWidth,
    });
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();
