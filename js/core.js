/* 核心：工具 / 静态数据索引 / 本地存储 / 通用 UI */
(function () {
  const ZJ = window.ZJ || (window.ZJ = {});
  const $ = (id) => document.getElementById(id);
  ZJ.$ = $;

  ZJ.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  let toastTimer = null;
  ZJ.toast = function (msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1900);
  };

  const pad = (n) => (n < 10 ? '0' : '') + n;
  ZJ.pad = pad;
  ZJ.hm = function (t) {
    if (!t) return '—';
    const s = String(t);
    return s.length >= 5 ? s.slice(0, 5) : s;
  };
  ZJ.clock = function (d) {
    const x = d || new Date();
    return pad(x.getHours()) + ':' + pad(x.getMinutes()) + ':' + pad(x.getSeconds());
  };
  ZJ.nowMin = function () {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  ZJ.minHM = function (m) {
    const v = ((Math.round(m) % 1440) + 1440) % 1440;
    return pad(Math.floor(v / 60)) + ':' + pad(v % 60);
  };
  ZJ.distTxt = function (m) {
    if (!(m >= 0)) return '—';
    return m < 1000 ? Math.round(m) + ' 米' : (m / 1000).toFixed(1) + ' 公里';
  };

  /* 球面距离（Haversine，米） */
  ZJ.hav = function (lat1, lng1, lat2, lng2) {
    if (!lat1 || !lng1 || !lat2 || !lng2) return Infinity;
    const R = 6371000, r = Math.PI / 180;
    const p1 = lat1 * r, p2 = lat2 * r;
    const x = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lng2 - lng1) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  };

  /* 本地存储 */
  const Store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  ZJ.Store = Store;

  ZJ.CFG = {
    API_BASE: 'https://zjcx.zhuji.gov.cn:9443',
    API_H: {
      deviceId: 'zjbus_lite_1',
      userToken: 'userToken',
      codeValue: '330681',
      appCode: '330681',
      sourceCodeValue: '330681',
      appVersion: '1.0.0',
      deviceTypeName: 'weixin'
    },
    AVG_SPEED: 240,
    DWELL: 0.35,
    LINE_POLL: 20000,
    STATION_POLL: 30000,
    REMIND_POLL: 15000,
    MAX_FAV: 30
  };

  /* ================= 静态数据索引 ================= */
  const SNAP = window.SNAPSHOT || { names: [], lines: [] };
  const NAMES = SNAP.names || [];
  const lines = [];
  const lineMap = new Map();
  const dirById = new Map();
  const stationMap = new Map();
  let stopCount = 0;

  (SNAP.lines || []).forEach((L) => {
    const dirs = (L.d || []).map((d) => {
      let cum = 0;
      const stops = (d.s || []).map((s, i) => {
        const st = {
          o: i + 1,
          name: NAMES[s[0]] || '',
          lat: (s[2] || 0) / 100000,
          lng: (s[3] || 0) / 100000,
          seg: s[1] || 0,
          cum: cum
        };
        cum += st.seg;
        return st;
      });
      const dir = {
        key: d.k,
        id: d.id,
        first: ZJ.hm(d.f),
        last: ZJ.hm(d.l),
        line: L.n,
        stops: stops,
        total: cum,
        start: stops.length ? stops[0].name : '',
        end: stops.length ? stops[stops.length - 1].name : ''
      };
      stopCount += stops.length;
      dirById.set(dir.id, dir);
      stops.forEach((st) => {
        if (!st.name) return;
        let s = stationMap.get(st.name);
        if (!s) {
          s = { name: st.name, lat: st.lat, lng: st.lng, entries: [] };
          stationMap.set(st.name, s);
        }
        s.entries.push({ line: L.n, dir: dir, order: st.o });
        if (!s.lat && st.lat) { s.lat = st.lat; s.lng = st.lng; }
      });
      return dir;
    });
    const line = { name: L.n, dirs: dirs };
    lines.push(line);
    lineMap.set(line.name, line);
  });

  function lineSortKey(n) {
    const m = String(n).match(/^(\d+)/);
    return m ? [0, +m[1], String(n)] : [1, 0, String(n)];
  }
  lines.sort((a, b) => {
    const x = lineSortKey(a.name), y = lineSortKey(b.name);
    return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'zh');
  });

  const stationList = [...stationMap.values()];

  function rideMeters(dir, fromOrder, toOrder) {
    let m = 0;
    for (let i = fromOrder - 1; i < toOrder - 1; i++) m += dir.stops[i].seg || 0;
    return m || (toOrder - fromOrder) * 500;
  }
  function rideMinutes(dir, fromOrder, toOrder) {
    return Math.max(1, Math.round(rideMeters(dir, fromOrder, toOrder) / ZJ.CFG.AVG_SPEED + (toOrder - fromOrder) * ZJ.CFG.DWELL));
  }

  ZJ.Data = {
    names: NAMES,
    lines: lines,
    lineMap: lineMap,
    dirs: dirById,
    stations: stationList,
    stationMap: stationMap,
    stopCount: stopCount,
    generated: SNAP.generated || '',
    lineOf: (n) => lineMap.get(n) || null,
    stationOf: (n) => stationMap.get(n) || null,
    rideMeters: rideMeters,
    rideMinutes: rideMinutes,
    searchLines(kw, limit) {
      const q = String(kw || '').trim().replace(/\s+/g, '');
      if (!q) return lines.slice(0, limit || 395);
      const hit = lines.filter((l) => l.name.replace(/\s+/g, '').indexOf(q) > -1);
      hit.sort((a, b) => {
        const ax = a.name === q || a.name === q + '路' ? 0 : a.name.indexOf(q) === 0 ? 1 : 2;
        const bx = b.name === q || b.name === q + '路' ? 0 : b.name.indexOf(q) === 0 ? 1 : 2;
        return ax - bx || lineSortKey(a.name)[1] - lineSortKey(b.name)[1] || a.name.localeCompare(b.name, 'zh');
      });
      return limit ? hit.slice(0, limit) : hit;
    },
    searchStations(kw, limit) {
      const q = String(kw || '').trim();
      if (!q) return [];
      const hit = stationList.filter((s) => s.name.indexOf(q) > -1);
      hit.sort((a, b) => {
        const ax = a.name.indexOf(q) === 0 ? 0 : 1;
        const bx = b.name.indexOf(q) === 0 ? 0 : 1;
        return ax - bx || a.name.length - b.name.length || b.entries.length - a.entries.length;
      });
      return limit ? hit.slice(0, limit) : hit;
    },
    nearby(lat, lng, limit) {
      if (!lat || !lng) return [];
      const out = [];
      stationList.forEach((s) => {
        if (!s.lat || !s.lng) return;
        const d = ZJ.hav(lat, lng, s.lat, s.lng);
        if (d < 12000) out.push({ station: s, dist: d });
      });
      out.sort((a, b) => a.dist - b.dist);
      const seen = new Set();
      const uniq = [];
      out.forEach((x) => {
        if (seen.has(x.station.name)) return;
        seen.add(x.station.name);
        uniq.push(x);
      });
      return uniq.slice(0, limit || 6);
    }
  };

  /* ================= 收藏 ================= */
  const FAV_L_KEY = 'zjbus.fav.lines.v1';
  const FAV_S_KEY = 'zjbus.fav.stations.v1';
  const Fav = {
    lines: () => Store.get(FAV_L_KEY, []),
    stations: () => Store.get(FAV_S_KEY, []),
    hasLine(n) { return Fav.lines().indexOf(n) > -1; },
    hasStation(n) { return Fav.stations().indexOf(n) > -1; },
    toggleLine(n) {
      const arr = Fav.lines();
      const i = arr.indexOf(n);
      if (i > -1) arr.splice(i, 1);
      else {
        if (arr.length >= ZJ.CFG.MAX_FAV) { ZJ.toast('收藏线路已达上限'); return Fav.hasLine(n); }
        arr.unshift(n);
      }
      Store.set(FAV_L_KEY, arr);
      return i === -1;
    },
    toggleStation(n) {
      const arr = Fav.stations();
      const i = arr.indexOf(n);
      if (i > -1) arr.splice(i, 1);
      else {
        if (arr.length >= ZJ.CFG.MAX_FAV) { ZJ.toast('收藏站点已达上限'); return Fav.hasStation(n); }
        arr.unshift(n);
      }
      Store.set(FAV_S_KEY, arr);
      return i === -1;
    }
  };
  ZJ.Fav = Fav;

  /* ================= 动作注册（全局事件委托） ================= */
  ZJ.actions = {};
  ZJ.act = function (name, fn) { ZJ.actions[name] = fn; };
  ZJ.run = function (name, el, e) {
    const fn = ZJ.actions[name];
    if (fn) { fn(el, e); return true; }
    return false;
  };

  /* ================= 通用 UI ================= */
  const layers = [];
  let popping = false;

  function showSheet() {
    const mask = $('mask');
    mask.hidden = false;
    requestAnimationFrame(() => mask.classList.add('on'));
    document.body.style.overflow = 'hidden';
  }
  function hideSheetVisual() {
    const mask = $('mask');
    if (!mask || mask.hidden) return;
    mask.classList.remove('on');
    document.body.style.overflow = '';
    setTimeout(() => {
      if (!mask.classList.contains('on')) {
        mask.hidden = true;
        $('sheet').innerHTML = '';
      }
    }, 260);
  }
  function showFull(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function hideFull(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('on');
    document.body.style.overflow = '';
    setTimeout(() => { if (!el.classList.contains('on')) el.scrollTop = 0; }, 340);
  }
  function pushLayer(layer) {
    layers.push(layer);
    try { history.pushState({ zjLayer: layers.length }, ''); } catch (e) {}
  }
  function popHistory() {
    try {
      if (history.state && history.state.zjLayer) { popping = true; history.back(); }
    } catch (e) {}
  }

  const UI = {
    sheet(html) {
      $('sheet').innerHTML = html;
      const mask = $('mask');
      mask.scrollTop = 0;
      showSheet();
      pushLayer({ type: 'sheet' });
    },
    isSheetOpen() {
      const mask = $('mask');
      return !!(mask && !mask.hidden);
    },
    updateSheet(html) {
      const mask = $('mask');
      if (mask && !mask.hidden) $('sheet').innerHTML = html;
    },
    closeSheet() {
      const i = layers.map((l) => l.type).lastIndexOf('sheet');
      if (i > -1) layers.splice(i, 1);
      hideSheetVisual();
      popHistory();
    },
    openFull(id) {
      showFull(id);
      pushLayer({ type: 'full', id: id });
    },
    closeFull(id) {
      const i = layers.findIndex((l) => l.type === 'full' && l.id === id);
      if (i > -1) layers.splice(i, 1);
      hideFull(id);
      popHistory();
    },
    alert(html) {
      $('alertCard').innerHTML = html;
      const mask = $('alertMask');
      mask.hidden = false;
      requestAnimationFrame(() => mask.classList.add('on'));
    },
    closeAlert() {
      const mask = $('alertMask');
      if (!mask || mask.hidden) return;
      mask.classList.remove('on');
      setTimeout(() => { if (!mask.classList.contains('on')) { mask.hidden = true; $('alertCard').innerHTML = ''; } }, 240);
    },
    vibrate(pattern) {
      try {
        if (navigator.vibrate) { navigator.vibrate(pattern || [300, 120, 300]); return true; }
      } catch (e) {}
      return false;
    },
    closeTop() {
      const l = layers[layers.length - 1];
      if (!l) return false;
      if (l.type === 'sheet') hideSheetVisual();
      else hideFull(l.id);
      layers.pop();
      return true;
    }
  };
  ZJ.UI = UI;

  /* Android 返回键 / 浏览器后退：先关弹层，再关详情页 */
  window.addEventListener('popstate', () => {
    if (popping) { popping = false; return; }
    if (layers.length) UI.closeTop();
  });

  /* 全局点击委托 */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (ZJ.run(el.dataset.act, el, e)) {
      if (el.tagName === 'BUTTON' || el.dataset.act !== 'noop') e.preventDefault();
    }
  }, false);

  /* 点遮罩关闭弹层 */
  document.addEventListener('DOMContentLoaded', () => {
    const mask = $('mask');
    if (mask) mask.addEventListener('click', (e) => { if (e.target === mask) UI.closeSheet(); });
  });
})();
