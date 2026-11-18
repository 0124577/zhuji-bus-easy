/**
 * 诸暨公交 · 双 Tab 轻量版 E2E 自测
 * 覆盖：基础加载 / Tab 切换 / 定位与附近站点 / 线路搜索 / 线路实时页 / 上下行切换 /
 *      收藏 / 时刻表 / 到站提醒（含震动）/ 站点实时页 / 换乘规划 / 历史 / 边界场景 / 移动端适配
 *
 * 运行：node tests/e2e/app-test.mjs
 * 环境变量：BASE_URL、CHROME_PATH
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8899/index.html';
const ORIGIN = new URL(BASE).origin;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--lang=zh-CN']
});

const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(ORIGIN, ['geolocation']);

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setGeolocation({ latitude: 29.7136, longitude: 120.2362 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const txt = (sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => '');
const cnt = (sel) => page.$$eval(sel, (els) => els.length).catch(() => 0);
const has = (sel) => page.$(sel).then((x) => !!x);
const clickAct = (act) => page.evaluate((a) => {
  const el = document.querySelector('[data-act="' + a + '"]');
  if (!el) throw new Error('no element for act ' + act);
  el.click();
}, act);

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.line-row', { timeout: 8000 });
await sleep(1800);

/* ---------------- 1. 基础加载 ---------------- */
section('基础加载与静态数据');
ok('页面标题正确', (await page.title()).indexOf('诸暨公交') > -1, await page.title());
ok('底部只有 2 个 Tab', (await cnt('.tab')) === 2, 'count=' + (await cnt('.tab')));
const tabTexts = await page.$$eval('.tab', (els) => els.map((e) => e.textContent.trim()));
ok('Tab 为「首页 / 去哪」', tabTexts.join('/') === '首页/去哪', tabTexts.join('/'));
const meta = await page.evaluate(() => ({
  lines: ZJ.Data.lines.length,
  stations: ZJ.Data.stations.length,
  dirs: ZJ.Data.dirs.size,
  stops: ZJ.Data.stopCount,
  generated: ZJ.Data.generated
}));
ok('静态线路数据 395 条', meta.lines === 395, JSON.stringify(meta));
ok('站点数量 > 3000', meta.stations > 3000, String(meta.stations));
ok('线路方向 > 700 个', meta.dirs > 700, String(meta.dirs));
ok('首页默认展示', await page.$eval('#page-home', (el) => el.classList.contains('on')));
ok('线路列表已渲染', (await cnt('.line-row')) > 10, String(await cnt('.line-row')));
ok('无公告 Tab', !tabTexts.some((t) => t.indexOf('公告') > -1));
ok('无我的 Tab', !tabTexts.some((t) => t.indexOf('我的') > -1));

/* ---------------- 2. 定位与附近站点 ---------------- */
section('定位与附近站点');
await page.waitForFunction(() => window.ZJ && ZJ.Geo && ZJ.Geo.state !== 'locating', { timeout: 12000 });
await sleep(600);
const geoState = await page.evaluate(() => ZJ.Geo.state);
ok('定位成功', geoState === 'ok', geoState);
const locChip = await txt('#homeLocTxt');
ok('定位胶囊显示最近站名', locChip && locChip !== '定位中' && locChip !== '定位失败', locChip);
const nearRows = await cnt('.nb-row');
ok('附近站点列表 >= 3 条', nearRows >= 3, String(nearRows));
const nearFirst = await page.$eval('.nb-row', (el) => el.textContent.replace(/\s+/g, ' ').trim());
ok('附近站点显示距离', /(\d+ 米|\d+\.\d 公里)/.test(nearFirst), nearFirst);
const nearAsc = await page.$$eval('.nb-row .nb-dist', (els) => els.map((e) => parseFloat(e.textContent) * (e.textContent.indexOf('公里') > -1 ? 1000 : 1)));
ok('附近站点按距离升序', nearAsc.every((v, i) => i === 0 || v >= nearAsc[i - 1]), nearAsc.join(','));

/* ---------------- 3. 线路搜索 ---------------- */
section('线路搜索');
await page.click('#lineQ');
await page.type('#lineQ', '23');
await sleep(400);
const searchRows = await page.$$eval('.line-row', (els) => els.map((e) => e.dataset.name));
ok('输入 23 命中 23路', searchRows.indexOf('23路') > -1, searchRows.slice(0, 6).join(','));
ok('搜索时显示结果计数', (await txt('#lineCount')).indexOf('匹配') > -1, await txt('#lineCount'));
await page.evaluate(() => { const i = document.getElementById('lineQ'); i.value = 'zzzz'; i.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(350);
ok('无结果时有空态提示', (await txt('#lineList')).indexOf('没有找到') > -1, (await txt('#lineList')).slice(0, 40));
await clickAct('clear-q');
await sleep(300);
ok('清空搜索恢复全部线路', (await cnt('.line-row')) > 20);
ok('清空后隐藏清除按钮', await page.$eval('#lineQClear', (el) => el.hidden));

/* ---------------- 4. 线路实时页 ---------------- */
section('线路实时页（实时车辆 / 剩余站 / 预计到站）');
await page.evaluate(() => {
  const dir = ZJ.Data.lineOf('23路').dirs[0];
  const st = dir.stops[10];
  window.__testStation = st.name;
  window.__mock = { speed: 240, list: [
    { vehicleOrder: 10, distance: 300, isArriveStation: 0, plateNumber: '浙D00001D', gpsTime: '2026-11-18 18:40:00' },
    { vehicleOrder: 30, distance: 60, isArriveStation: 1, plateNumber: '浙D00002D', gpsTime: '2026-11-18 18:40:00' }
  ] };
  ZJ.Api.vehicles = async () => ({ busAverageSpeed: window.__mock.speed, list: window.__mock.list, static: false });
  ZJ.Api.lineDetail = async () => ({ lineName: '23路', up: { totalPrice: 1.0 } });
  ZJ.Api.plan = async () => ['06:20', '07:00', '17:30', '18:00', '19:10'];
  document.querySelector('.line-row[data-name="23路"]').click();
});
await page.waitForFunction(() => document.getElementById('page-line').classList.contains('on'), { timeout: 4000 });
await sleep(1100);
ok('进入线路详情页', await page.$eval('#page-line', (el) => el.classList.contains('on')));
ok('标题为 23路', (await txt('#lnName')) === '23路', await txt('#lnName'));
ok('方向信息包含首末站', (await txt('#lnDir')).indexOf('双福村') > -1, await txt('#lnDir'));
ok('站点序列 38 站', (await cnt('.stop-row')) === 38, String(await cnt('.stop-row')));
ok('横向时间轴 38 个站点', (await cnt('.tl-item')) === 38, String(await cnt('.tl-item')));
ok('时间轴渲染车辆标记', (await cnt('.tl-bus')) === 2, String(await cnt('.tl-bus')));
ok('实时信息卡显示车牌', (await txt('#lineStat')).indexOf('浙D00001D') > -1, (await txt('#lineStat')).slice(0, 80));
ok('信息卡有实时标记', (await txt('#lineStat')).indexOf('实时') > -1);
ok('票价来自接口', (await txt('#lineInfo')).indexOf('票价') > -1, await txt('#lineInfo'));

await page.evaluate(() => {
  const name = window.__testStation;
  document.querySelector('.stop-row[data-station="' + name + '"]').click();
});
await sleep(500);
const statTxt = await txt('#lineStat');
ok('选择等车站后剩余站数为 1', (await page.$eval('.stat-num', (el) => el.textContent.trim())) === '1', statTxt.slice(0, 60));
ok('显示预计到达分钟', /约 \d+ 分钟/.test(statTxt), statTxt.slice(0, 80));
ok('显示剩余距离', /(\d+ 米|\d+\.\d 公里)/.test(statTxt), statTxt.slice(0, 80));
const myStopTxt = await txt('#myStopBar');
ok('等车站条显示所选站', myStopTxt.indexOf(await page.evaluate(() => window.__testStation)) > -1, myStopTxt);
const etaCount = await cnt('.stop-eta.live');
ok('站点列表显示实时倒计时', etaCount > 0, String(etaCount));

/* ---------------- 5. 上下行切换 ---------------- */
section('上下行切换');
const beforeDir = await txt('#lnDir');
await clickAct('line-swap');
await sleep(700);
const afterDir = await txt('#lnDir');
ok('切换方向后文案变化', beforeDir !== afterDir, beforeDir + ' -> ' + afterDir);
ok('切换后站点列表仍完整', (await cnt('.stop-row')) > 30, String(await cnt('.stop-row')));
ok('切换后出现提示', (await txt('#toast')).indexOf('方向') > -1, await txt('#toast'));
await clickAct('line-swap');
await sleep(600);

/* ---------------- 6. 收藏线路 ---------------- */
section('收藏');
await clickAct('line-fav');
await sleep(200);
ok('收藏线路写入本地', await page.evaluate(() => ZJ.Fav.hasLine('23路')));
await clickAct('line-back');
await sleep(600);
const favHtml = await txt('#favBody');
ok('首页收藏区显示 23路', favHtml.indexOf('23路') > -1, favHtml.slice(0, 40));
await page.evaluate(() => document.querySelector('.chip-line[data-name="23路"]').click());
await sleep(700);
ok('点击收藏线路可再次进入详情', (await txt('#lnName')) === '23路');
await clickAct('line-fav');
await sleep(200);
await clickAct('line-back');
await sleep(600);
ok('取消收藏后首页不再显示', (await txt('#favBody')).indexOf('23路') === -1);

/* ---------------- 7. 发车时刻表 ---------------- */
section('发车时刻表');
await page.evaluate(() => document.querySelector('.line-row[data-name="23路"]').click());
await sleep(1200);
await clickAct('open-tt');
await sleep(700);
const sheetTxt = await txt('#sheet');
ok('时刻表弹层打开', sheetTxt.indexOf('发车时刻表') > -1, sheetTxt.slice(0, 40));
ok('时刻表显示班次', sheetTxt.indexOf('06:20') > -1);
ok('时刻表标注班次数', /共 \d+ 班/.test(sheetTxt), sheetTxt.slice(0, 60));
await clickAct('close-sheet');
await sleep(500);

/* ---------------- 8. 到站提醒 ---------------- */
section('本地到站提醒（弹窗 + 震动）');
await page.evaluate(() => {
  window.__vibrate = [];
  navigator.vibrate = (p) => { window.__vibrate.push(p); return true; };
  const name = window.__testStation;
  document.querySelector('.stop-row[data-station="' + name + '"] .bell').click();
});
await sleep(700);
const rmSheet = await txt('#sheet');
ok('提醒弹层包含三种方式', rmSheet.indexOf('到站提醒') > -1 && rmSheet.indexOf('下一站提醒') > -1 && rmSheet.indexOf('提前 2 站') > -1);
ok('提醒弹层说明不做推送', rmSheet.indexOf('不发送系统推送') > -1);
await page.evaluate(() => document.querySelector('.rm-mode[data-mode="one"]').click());
await sleep(200);
ok('可切换到「下一站提醒」', await page.$eval('.rm-mode[data-mode="one"]', (el) => el.classList.contains('on')));
await clickAct('rm-save');
await sleep(900);
ok('提醒已写入本地', await page.evaluate(() => ZJ.Reminder.list().length === 1));
ok('等车站条显示提醒中', (await txt('#myStopBar')).indexOf('提醒中') > -1, await txt('#myStopBar'));
const alertShown = await page.$eval('#alertMask', (el) => !el.hidden);
ok('车辆剩 1 站时触发弹窗', alertShown, 'alert hidden');
if (alertShown) {
  const alertTxt = await txt('#alertCard');
  ok('弹窗说明车辆即将到站', alertTxt.indexOf('即将到站') > -1, alertTxt.slice(0, 60));
  ok('弹窗含车牌与站名', alertTxt.indexOf('浙D00001D') > -1 && alertTxt.indexOf(await page.evaluate(() => window.__testStation)) > -1, alertTxt.slice(0, 80));
  const vib = await page.evaluate(() => window.__vibrate.length);
  ok('触发时调用震动 API', vib > 0, String(vib));
  await page.evaluate(() => document.getElementById('rmGo').click());
  await sleep(400);
  ok('弹窗可关闭', await page.$eval('#alertMask', (el) => el.hidden));
}
ok('提醒完成后标记为已提醒', await page.evaluate(() => ZJ.Reminder.list()[0].done === true));
/* 提醒管理 */
await page.evaluate(() => { ZJ.Line.close(); ZJ.setTab('home'); });
await sleep(700);
ok('首页显示提醒记录卡片', await page.$eval('#remindCard', (el) => !el.hidden));
ok('提醒记录显示已提醒状态', (await txt('#remindBody')).indexOf('已提醒') > -1, await txt('#remindBody'));
await page.evaluate(() => document.querySelector('[data-act="reminder-list"]').click());
await sleep(600);
ok('提醒管理弹层可打开', (await txt('#sheet')).indexOf('到站提醒') > -1, (await txt('#sheet')).slice(0, 40));
ok('管理弹层列出记录', (await cnt('.rm-item')) === 1, String(await cnt('.rm-item')));
await page.evaluate(() => { const b = document.querySelector('.rm-item .r-del'); if (b) b.click(); });
await sleep(500);
ok('可删除提醒记录', await page.evaluate(() => ZJ.Reminder.list().length === 0));
await page.evaluate(() => ZJ.UI.closeSheet());
await sleep(400);

/* ---------------- 9. 站点实时页 ---------------- */
section('站点实时页');
await page.evaluate(() => ZJ.Station.open('火车站'));
await page.waitForFunction(() => document.getElementById('page-station').classList.contains('on'), { timeout: 3000 });
await sleep(3200);
ok('站点页标题正确', (await txt('#stName')) === '火车站', await txt('#stName'));
ok('站点页显示途经方向数', /途经本站/.test(await txt('#stSub')), await txt('#stSub'));
ok('站点页显示距离', /距我/.test(await txt('#stSub')), await txt('#stSub'));
ok('站点页线路卡片 >= 10', (await cnt('.st-line')) >= 10, String(await cnt('.st-line')));
const stSummary = await txt('#stSummary');
ok('汇总显示有车方向数', /方向有车|暂无车辆/.test(stSummary), stSummary);
const busInfo = await page.$eval('.st-line', (el) => el.textContent.replace(/\s+/g, ' '));
ok('线路卡片含预计到站', /(约 \d+ 分|已到站|—)/.test(busInfo), busInfo.slice(0, 60));
await page.evaluate(() => document.getElementById('stFav').click());
await sleep(300);
ok('收藏站点写入本地', await page.evaluate(() => ZJ.Fav.hasStation('火车站')));
const stOverflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
ok('站点页无横向溢出', stOverflow.sw <= stOverflow.iw + 1, JSON.stringify(stOverflow));
await page.evaluate(() => document.querySelector('.st-line').click());
await sleep(900);
ok('从站点页进入线路页', await page.$eval('#page-line', (el) => el.classList.contains('on')));
ok('线路页等车站为所选站点', (await txt('#myStopBar')).indexOf('火车站') > -1, await txt('#myStopBar'));
const lineOverflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
ok('线路页无横向溢出', lineOverflow.sw <= lineOverflow.iw + 1, JSON.stringify(lineOverflow));
await page.evaluate(() => ZJ.Line.close());
await sleep(500);
await page.evaluate(() => ZJ.Station.close());
await sleep(700);
ok('首页收藏区显示收藏站点', (await txt('#favBody')).indexOf('火车站') > -1, (await txt('#favBody')).slice(0, 40));
await page.evaluate(() => document.querySelector('.fav-st[data-name="火车站"]').click());
await sleep(900);
ok('点击收藏站点可进入站点页', (await txt('#stName')) === '火车站');
await page.evaluate(() => ZJ.Station.close());
await sleep(600);

/* ---------------- 10. 去哪 / 换乘 ---------------- */
section('换乘规划与历史');
await page.evaluate(() => ZJ.setTab('go'));
await sleep(500);
ok('切到去哪页', await page.$eval('#page-go', (el) => el.classList.contains('on')));
ok('去哪页显示起终点选择', (await txt('#fromName')).indexOf('起点') > -1, await txt('#fromName'));

await clickAct('pick-from');
await sleep(400);
await page.evaluate(() => document.querySelector('.sheet-tab[data-tab="search"]').click());
await sleep(300);
await page.type('#pkQ', '火车站');
await sleep(450);
ok('站名搜索有结果', (await cnt('#pkList .pick-stop')) > 0, String(await cnt('#pkList .pick-stop')));
await page.evaluate(() => document.querySelector('#pkList .pick-stop').click());
await sleep(600);
ok('起点已选择', (await txt('#fromName')) === '火车站', await txt('#fromName'));

await clickAct('pick-to');
await sleep(400);
await page.evaluate(() => document.querySelector('.sheet-tab[data-tab="search"]').click());
await sleep(300);
await page.type('#pkQ', '草塔停车场');
await sleep(450);
ok('终点候选出现', (await cnt('#pkList .pick-stop')) > 0);
await page.evaluate(() => document.querySelector('#pkList .pick-stop').click());
await sleep(1200);
ok('生成换乘方案', (await cnt('.plan-card')) === 1, 'cards=' + (await cnt('.plan-card')));
const planTabs = await cnt('.plan-tab');
ok('方案切换标签 >= 1', planTabs >= 1, String(planTabs));
const planTxt = await txt('#planResult');
ok('方案含预计耗时', /\d+分钟|\d+ 分钟/.test(planTxt), planTxt.slice(0, 80));
ok('方案含乘车段', planTxt.indexOf('乘') > -1, planTxt.slice(0, 100));
ok('方案含免责说明', planTxt.indexOf('仅供参考') > -1);
ok('历史记录已保存', await page.evaluate(() => (ZJ.Store.get('zjbus.history.v1', []) || []).length === 1));
ok('历史列表已渲染', (await cnt('.hist-row')) === 1, String(await cnt('.hist-row')));

if (planTabs > 1) {
  await page.evaluate(() => document.querySelectorAll('.plan-tab')[1].click());
  await sleep(400);
  ok('可切换方案标签', await page.$eval('.plan-tab:nth-child(2)', (el) => el.classList.contains('on')));
}

await page.evaluate(() => document.querySelector('.hist-row').click());
await sleep(900);
ok('点击历史可重新查询', (await cnt('.plan-card')) === 1);
await page.evaluate(() => document.querySelector('.hist-row .hist-del').click());
await sleep(500);
const histDbg = await page.evaluate(() => ({ store: ZJ.Store.get('zjbus.history.v1', []).length, rows: document.querySelectorAll('.hist-row').length }));
ok('可删除单条历史', histDbg.rows === 0, JSON.stringify(histDbg));

/* 相同起终点 */
await clickAct('pick-to');
await sleep(400);
await page.evaluate(() => document.querySelector('.sheet-tab[data-tab="search"]').click());
await sleep(250);
await page.type('#pkQ', '火车站');
await sleep(400);
await page.evaluate(() => document.querySelector('#pkList .pick-stop').click());
await sleep(800);
ok('起终点相同时给出提示', (await txt('#toast')).indexOf('不能') > -1, await txt('#toast'));

/* 边界：搜索无结果 + 网络异常 + 定位失败，放到新页面执行 */
section('边界场景');

/* 11.1 站点搜索无结果 */
await page.evaluate(() => ZJ.setTab('go'));
await clickAct('pick-from');
await sleep(400);
await page.evaluate(() => document.querySelector('.sheet-tab[data-tab="search"]').click());
await sleep(300);
await page.type('#pkQ', '不存在的地名XYZ');
await sleep(400);
ok('站名搜索无结果有提示', (await txt('#pkList')).indexOf('没有找到') > -1, (await txt('#pkList')).slice(0, 50));
await page.evaluate(() => ZJ.UI.closeSheet());
await sleep(400);

/* 11.2 网络异常：线路页降级为静态数据 */
await page.evaluate(() => {
  ZJ.Api.vehicles = async () => { throw new Error('网络异常，请检查网络'); };
  ZJ.Api.lineDetail = async () => { throw new Error('网络异常'); };
  ZJ.Api.plan = async () => { throw new Error('网络异常'); };
  ZJ.setTab('home');
  document.querySelector('.line-row[data-name="1路"]').click();
});
await sleep(1400);
const errStat = await txt('#lineStat');
ok('网络异常时显示错误卡', errStat.indexOf('实时车辆暂不可用') > -1, errStat.slice(0, 60));
ok('错误卡提供重试按钮', await has('[data-act="line-refresh"]'));
ok('静态站序仍可用', (await cnt('.stop-row')) > 10, String(await cnt('.stop-row')));
ok('页脚说明静态兜底', (await txt('#lineNote')).indexOf('静态') > -1, await txt('#lineNote'));
await page.evaluate(() => ZJ.Line.close());
await sleep(500);

/* 11.3 定位失败：新页面不给定位权限 */
const page2 = await browser.newPage();
await page2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page2.evaluateOnNewDocument(() => {
  navigator.geolocation.getCurrentPosition = (s, e) => setTimeout(() => e({ code: 1, message: 'User denied Geolocation' }), 60);
});
await page2.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(1600);
const failTxt = await page2.$eval('#nearbyList', (el) => el.textContent);
ok('定位失败有提示', failTxt.indexOf('定位失败') > -1, failTxt.replace(/\s+/g, ' ').slice(0, 60));
ok('定位失败提供重试', await page2.$('[data-act="relocate"]').then((x) => !!x));
ok('定位失败胶囊文案', (await page2.$eval('#homeLocTxt', (el) => el.textContent)) === '定位失败');
const failScroll = await page2.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
ok('定位失败页无横向溢出', failScroll.sw <= failScroll.iw + 1, JSON.stringify(failScroll));
await page2.close();

/* ---------------- 12. 移动端适配 & 需求剔除检查 ---------------- */
section('移动端适配与功能边界');
await page.evaluate(() => { ZJ.setTab('home'); });
await sleep(400);
for (const tab of ['home', 'go']) {
  await page.evaluate((t) => ZJ.setTab(t), tab);
  await sleep(350);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
  ok(tab + ' 页无横向溢出', m.sw <= m.iw + 1, JSON.stringify(m));
}
const forbidden = await page.evaluate(() => {
  const html = document.documentElement.innerHTML;
  return {
    mapSdk: /amap|qq\.map|BMap|AMap|mapbox|leaflet/i.test(html),
    mapEl: !!document.querySelector('#map,.map-container,.amap-container'),
    notice: /公告/.test(document.body.innerText),
    mine: /乘车码|意见反馈|消息推送|到站订阅/.test(document.body.innerText),
    mapApi: !!(window.AMap || window.qq || window.TMap || window.BMap)
  };
});
ok('未引入任何地图 SDK', !forbidden.mapSdk && !forbidden.mapApi, JSON.stringify(forbidden));
ok('没有地图容器', !forbidden.mapEl);
ok('页面无公告入口', !forbidden.notice);
ok('无乘车码/反馈/推送/订阅入口', !forbidden.mine, JSON.stringify(forbidden));

section('控制台');
const jsErrors = errors.filter((e) => !/Failed to load resource|net::ERR|ERR_/i.test(e));
ok('运行期无 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

await browser.close();

console.log('\n================================');
console.log('通过 ' + pass + ' 项，失败 ' + fails.length + ' 项');
if (fails.length) {
  console.log('失败明细：');
  fails.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('全部测试通过 ✅');
