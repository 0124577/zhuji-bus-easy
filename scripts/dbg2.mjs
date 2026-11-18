import puppeteer from 'puppeteer-core';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
p.on('pageerror',e=>console.log('ERR',e.message));
p.on('console',m=>{if(m.type()==='error')console.log('LOG',m.text())});
await p.goto('http://127.0.0.1:8899/index.html',{waitUntil:'networkidle2'});
await p.evaluate(()=>{ localStorage.setItem('zjbus.history.v1', JSON.stringify([{from:'火车站',to:'草塔停车场',ts:Date.now()}])); ZJ.setTab('go'); });
await sleep(600);
console.log('rows', await p.$$eval('.hist-row',e=>e.length));
await p.evaluate(()=>{ document.querySelector('.hist-del').click(); });
await sleep(500);
console.log(await p.evaluate(()=>({
  store: ZJ.Store.get('zjbus.history.v1',[]),
  rows: document.querySelectorAll('.hist-row').length,
  toast: document.getElementById('toast').textContent,
  acts: Object.keys(ZJ.actions).filter(k=>k.indexOf('hist')>-1)
})));
await b.close();
