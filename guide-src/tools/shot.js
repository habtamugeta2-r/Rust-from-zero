// usage: node shot.js <out.png> <hash> [width] [height] [theme] [full] [sandbox] [clickSelector...]
const { chromium } = require('playwright');
(async () => {
  const [out, hash = '', w = '1440', h = '900', theme = 'light', full = '0', sandbox = '0', ...clicks] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: theme });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const file = 'file:///home/user/rust-guide.html';
  if (sandbox === '1') {
    await page.setContent(`<body style="margin:0"><iframe sandbox="allow-scripts" src="${file}${hash ? '#' + hash : ''}" style="border:0;width:100vw;height:100vh"></iframe></body>`);
    await page.waitForTimeout(900);
    const frame = page.frames()[1];
    for (const c of clicks) { await frame.click(c); await page.waitForTimeout(200); }
  } else {
    await page.goto(file + (hash ? '#' + hash : ''));
    await page.waitForTimeout(300);
    for (const c of clicks) {
      if (c.startsWith('scroll:')) { await page.evaluate(s => { const el = document.querySelector(s); if (el) el.scrollIntoView({block:'start'}); window.scrollBy(0, -70); }, c.slice(7)); }
      else if (c.startsWith('type:')) { const [sel, text] = c.slice(5).split('=='); await page.fill(sel, text); }
      else await page.click(c);
      await page.waitForTimeout(250);
    }
  }
  await page.screenshot({ path: out, fullPage: full === '1' });
  if (errors.length) console.log(errors.join('\n')); else console.log('ok, no JS errors');
  await browser.close();
})();
