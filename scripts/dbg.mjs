import puppeteer from 'puppeteer-core';
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
page.on('pageerror', e=>console.log('ERR', e.message));
page.on('console', m=>console.log('LOG', m.type(), m.text()));
await page.goto('http://127.0.0.1:8899/index.html',{waitUntil:'networkidle2'});
await sleep(800);
console.log(await page.evaluate(()=>({
  picker: typeof ZJ.Picker, go: typeof ZJ.Go, acts: Object.keys(ZJ.actions).length,
  actList: Object.keys(ZJ.actions)
})));
await page.evaluate(()=>{ ZJ.setTab('go'); document.querySelector('[data-act="pick-from"]').click(); });
await sleep(600);
console.log(await page.evaluate(()=>({
  maskHidden: document.getElementById('mask').hidden,
  sheet: document.getElementById('sheet').innerHTML.slice(0,200),
  hasQ: !!document.getElementById('pkQ')
})));
await browser.close();
