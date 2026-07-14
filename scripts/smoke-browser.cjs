'use strict';

const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');

async function readPage(name) {
  const [html, css] = await Promise.all([
    fs.readFile(path.join(projectRoot, 'public', `${name}.html`), 'utf8'),
    fs.readFile(path.join(projectRoot, 'public', 'styles.css'), 'utf8'),
  ]);
  return html
    .replace(/<link rel="stylesheet" href="\/styles\.css" \/>/, `<style>${css}</style>`)
    .replace(/<link rel="icon"[^>]+>/, '')
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
    .replace(/<script[^>]+src="\/[^"]+"[^>]*><\/script>/g, '');
}

async function bundle(entry) {
  const result = await esbuild.build({
    entryPoints: [path.join(projectRoot, 'public', entry)],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: ['chrome120'],
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

(async () => {
  let browser;
  const xvfb = spawn('/usr/bin/Xvfb', [':99', '-screen', '0', '1280x720x24', '-ac'], { stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const [campaignHtml, level1Html, level2Html, level3Html, level1Bundle, level2Bundle, level3Bundle] = await Promise.all([
      readPage('game'),
      readPage('level1'),
      readPage('level2'),
      readPage('level3'),
      bundle('level1.js'),
      bundle('level2.js'),
      bundle('level3.js'),
    ]);
    const campaignJs = await fs.readFile(path.join(projectRoot, 'public', 'campaign.js'), 'utf8');

    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: false,
      env: { ...process.env, DISPLAY: ':99', HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '*' },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--no-proxy-server',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=swiftshader-webgl',
        '--disable-dev-shm-usage',
      ],
    });

    async function openWithErrors(html, script, assertion) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        window.fetch = async () => ({
          ok: true,
          json: async () => ({
            user: { name: 'Browser Test', givenName: 'Browser', email: 'browser@example.test', picture: '' },
          }),
        });
      });
      await page.addScriptTag({ content: script });
      await assertion(page);
      await new Promise((resolve) => setTimeout(resolve, 700));
      const meaningfulErrors = errors.filter((message) => !message.includes('WebGL: INVALID_OPERATION'));
      if (meaningfulErrors.length) throw new Error(meaningfulErrors.join('\n'));
      await page.close();
    }

    await openWithErrors(campaignHtml, campaignJs, async (page) => {
      await page.click('#show-levels-button');
      await page.waitForFunction(() => !document.querySelector('#level-select').classList.contains('hidden'));
      const cardCount = await page.$$eval('.level-card', (cards) => cards.length);
      if (cardCount !== 3) throw new Error(`Expected 3 campaign cards, found ${cardCount}`);
    });

    for (const [html, script, marker] of [
      [level1Html, level1Bundle, 'LEVEL 1'],
      [level2Html, level2Bundle, 'LEVEL 2'],
      [level3Html, level3Bundle, 'LEVEL 3'],
    ]) {
      await openWithErrors(html, script, async (page) => {
        await page.waitForSelector('#game-root canvas', { timeout: 20000 });
        const text = await page.$eval('#start-overlay', (element) => element.textContent);
        if (!text.includes(marker)) throw new Error(`Missing ${marker} marker`);
      });
    }

    console.log('CAMPAIGN_BROWSER_SMOKE_TEST_OK');
  } finally {
    if (browser) await browser.close();
    xvfb.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
