'use strict';

const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const esbuild = require('esbuild');

(async () => {
  let browser;
  const xvfb = spawn('/usr/bin/Xvfb', [':99', '-screen', '0', '1280x720x24', '-ac'], { stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const [html, css, build] = await Promise.all([
      fs.readFile(path.join(projectRoot, 'public', 'game.html'), 'utf8'),
      fs.readFile(path.join(projectRoot, 'public', 'styles.css'), 'utf8'),
      esbuild.build({
        entryPoints: [path.join(projectRoot, 'public', 'game.js')],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        target: ['chrome120'],
        logLevel: 'silent',
      }),
    ]);

    const sanitizedHtml = html
      .replace(/<link rel="stylesheet" href="\/styles\.css" \/>/, `<style>${css}</style>`)
      .replace(/<link rel="icon"[^>]+>/, '')
      .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
      .replace(/<script type="module" src="\/game\.js"><\/script>/, '');

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

    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });

    await page.setContent(sanitizedHtml, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      window.fetch = async () => ({
        ok: true,
        json: async () => ({
          user: {
            name: 'Browser Test',
            givenName: 'Browser',
            email: 'browser-test@verity.invalid',
            picture: '',
          },
        }),
      });
    });
    await page.addScriptTag({ content: build.outputFiles[0].text });
    await page.waitForSelector('#game-root canvas', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#stamina-seconds')?.textContent === '10.0s');
    await new Promise((resolve) => setTimeout(resolve, 1800));

    const result = await page.evaluate(() => ({
      title: document.title,
      canvasCount: document.querySelectorAll('#game-root canvas').length,
      startVisible: document.querySelector('#start-overlay')?.classList.contains('visible'),
      objective: document.querySelector('#objective-text')?.textContent,
      user: document.querySelector('#user-badge')?.textContent,
    }));

    const meaningfulErrors = errors.filter((message) => !message.includes('WebGL: INVALID_OPERATION'));
    if (meaningfulErrors.length > 0) throw new Error(meaningfulErrors.join('\n'));
    if (!result.startVisible || result.canvasCount !== 1 || !result.user.includes('Browser')) {
      throw new Error(`Unexpected page state: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify(result));
    console.log('BROWSER_SMOKE_TEST_OK');
  } finally {
    if (browser) await browser.close();
    xvfb.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
