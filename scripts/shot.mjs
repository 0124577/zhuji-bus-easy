import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8899/index.html';
const OUT = process.env.SHOT_DIR || 'C:/work/bus/_tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--lang=zh-CN'] });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions('http://127.0.0.1:8899', ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setGeolocation({ latitude: 29.7136, longitude: 120.2362 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2200);
await page.screenshot({ path: `${OUT}/01-home.png` });

// 模拟实时车辆（等车站为第 11 站，最近车辆在第 10 站，剩 1 站）
await page.evaluate(() => {
  const dir = ZJ.Data.lineOf('23路').dirs[0];
  const st = dir.stops[10];
  window.__st = st.name;
  const v = (order, distance, arrived, plate) => ({ vehicleOrder: order, distance, isArriveStation: arrived ? 1 : 0, plateNumber: plate, gpsTime: '2026-11-18 18:46:20', lat: dir.stops[order - 1].lat, lng: dir.stops[order - 1].lng });
  ZJ.Api.vehicles = async () => ({ busAverageSpeed: 240, list: [v(10, 380, 0, '浙D08578D'), v(24, 60, 1, '浙D06666D')], startTime: '', static: false });
  ZJ.Api.lineDetail = async () => ({ lineName: '23路', up: { totalPrice: 1.0 } });
  ZJ.Api.plan = async () => ['06:20', '06:37', '07:00', '07:25', '08:05', '17:30', '18:00'];
  window.__vibrate = [];
  navigator.vibrate = (p) => { window.__vibrate.push(p); return true; };
  ZJ.Line.open('23路', 'up', st.name);
});
await sleep(1300);
await page.screenshot({ path: `${OUT}/02-line-live.png` });

await page.evaluate(() => { document.querySelector('#page-line').scrollTop = 330; });
await sleep(500);
await page.screenshot({ path: `${OUT}/03-line-stops.png` });

await page.evaluate(() => document.querySelector('[data-act="line-remind"]').click());
await sleep(700);
await page.screenshot({ path: `${OUT}/04-remind-sheet.png` });
await page.evaluate(() => document.querySelector('.rm-mode[data-mode="one"]').click());
await sleep(200);
await page.evaluate(() => document.querySelector('[data-act="rm-save"]').click());
await sleep(1300);
await page.screenshot({ path: `${OUT}/05-remind-alert.png` });
await page.evaluate(() => { document.getElementById('rmGo').click(); });

// 站点页（真实接口）
await page.evaluate(() => { ZJ.Line.close(); });
await page.waitForFunction(() => !document.querySelector('.fullpage.on'));
await sleep(300);
await page.evaluate(() => ZJ.Station.open('火车站'));
await sleep(3600);
await page.screenshot({ path: `${OUT}/06-station.png` });

// 去哪：真实交互选站
await page.evaluate(() => { ZJ.Station.close(); ZJ.setTab('go'); });
await page.waitForFunction(() => !document.querySelector('.fullpage.on'));
await sleep(400);
await page.evaluate(() => document.querySelector('[data-act="pick-from"]').click());
await sleep(400);
await page.evaluate(() => document.querySelector('.sheet-tab[data-tab="search"]').click());
await sleep(300);
await page.type('#pkQ', '火车站');
await sleep(450);
await page.screenshot({ path: `${OUT}/07-picker.png` });
await page.evaluate(() => document.querySelector('#pkList .pick-stop').click());
await sleep(600);
await page.evaluate(() => document.querySelector('[data-act="pick-to"]').click());
await sleep(400);
await page.evaluate(() => document.querySelector('.sheet-tab[data-tab="search"]').click());
await sleep(300);
await page.type('#pkQ', '草塔停车场');
await sleep(450);
await page.evaluate(() => document.querySelector('#pkList .pick-stop').click());
await sleep(1200);
await page.screenshot({ path: `${OUT}/08-go-plans.png` });
await page.evaluate(() => window.scrollTo(0, 480));
await sleep(400);
await page.screenshot({ path: `${OUT}/09-go-history.png` });

// 首页提醒卡片
await page.evaluate(() => ZJ.setTab('home'));
await sleep(600);
await page.screenshot({ path: `${OUT}/10-home-remind.png` });

console.log('shots done', await page.evaluate(() => window.__vibrate));
await browser.close();
