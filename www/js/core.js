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

  /* ================= 运营时段判断 ================= */
  ZJ.isInService = function (dir) {
    if (!dir) return true;
    const toMin = (t) => {
      const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
      return m ? +m[1] * 60 + +m[2] : 0;
    };
    const f = toMin(dir.first), l = toMin(dir.last);
    if (!f && !l) return true;
    const now = ZJ.nowMin();
    if (l < f) return now >= f || now <= l;
    return now >= f - 10 && now <= l + 45;
  };

  /* ================= 横向站点时间轴（竖屏 · 竖排站名 · 左右滚动） =================
     html(dir, opt) 返回 .tl 内部 HTML；mount(dir, opt) 负责挂载、设宽并滚动到焦点站。
     opt: { el, selected, board, alight, vehicles, step, pad, focus, hint }
     序号一律使用 1 基站序（与静态数据 st.o 一致）
  */
  const Timeline = {
    width(dir, opt) {
      const step = (opt && opt.step) || 72;
      const pad = (opt && opt.pad) || 24;
      return (dir.stops.length - 1) * step + pad * 2;
    },
    html(dir, opt) {
      opt = opt || {};
      const step = opt.step || 72;
      const pad = opt.pad || 24;
      const sel = opt.selected || 0;
      const board = opt.board || 0;
      const alight = opt.alight || 0;
      const vehicles = opt.vehicles || [];
      let html = '<div class="tl-bar"><div class="tl-chev"></div></div>';
      dir.stops.forEach((s, i) => {
        const o = s.o;
        let cls = '';
        if (board && o === board) cls = 'sel';
        else if (alight && o === alight) cls = 'alight';
        else if (sel && o === sel) cls = 'sel';
        else if ((board && o < board) || (!board && sel && o < sel)) cls = 'passed';
        const nm = s.name.length > 9 ? s.name.slice(0, 8) + '…' : s.name;
        html += '<div class="tl-item ' + cls + '" style="left:' + (pad + i * step) + 'px" data-act="' +
          (opt.stopAct || 'noop') + '" data-station="' + ZJ.esc(s.name) + '" data-order="' + o + '">' +
          '<span class="tl-no">' + o + '</span><span class="tl-dot"></span>' +
          '<span class="tl-nm">' + ZJ.esc(nm) + '</span></div>';
      });
      if (vehicles.length) {
        vehicles.slice(0, 8).forEach((v) => {
          const left = pad + Math.max(0, Math.min(dir.stops.length - 1, v.pos)) * step;
          html += '<div class="tl-bus" style="left:' + left.toFixed(1) + 'px" data-act="bus-tip" data-plate="' + ZJ.esc(v.plate) + '">' +
            '<span class="bub"><svg class="ico"><use href="#i-bus"/></svg></span><span class="pin"></span></div>';
        });
      }
      return html;
    },
    /* 挂载并滚动到焦点站（1 基序号），opt.el 为 .tl 容器
       opt.restore 传入已有 scrollLeft 时保持用户当前横向位置（轮询刷新不跳动） */
    mount(dir, opt) {
      opt = opt || {};
      const el = opt.el;
      if (!el) return;
      const step = opt.step || 72;
      const pad = opt.pad || 24;
      el.style.width = Timeline.width(dir, opt) + 'px';
      el.innerHTML = Timeline.html(dir, opt);
      const focus = opt.focus || opt.selected || opt.board || 1;
      const sc = el.parentNode;
      if (!sc) return;
      if (opt.restore != null && opt.restore > 0) {
        sc.scrollLeft = opt.restore;
        return;
      }
      const target = pad + (focus - 1) * step - sc.clientWidth / 2;
      requestAnimationFrame(() => { sc.scrollLeft = Math.max(0, target); });
    },
    /* 把某站滚动到视野中央 */
    center(scroller, order, opt) {
      if (!scroller) return;
      const step = (opt && opt.step) || 72;
      const pad = (opt && opt.pad) || 24;
      scroller.scrollTo({ left: Math.max(0, pad + (order - 1) * step - scroller.clientWidth / 2), behavior: 'smooth' });
    },
    /* 左右滑动提示：是否还有更多内容 */
    edges(scroller) {
      if (!scroller) return { left: false, right: false };
      return {
        left: scroller.scrollLeft > 4,
        right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4
      };
    },
    /* 绑定滚动提示：滚动到两端时更新提示文字 */
    bindHint(scroller, hintEl) {
      if (!scroller || !hintEl || scroller.dataset.hintBound) return;
      scroller.dataset.hintBound = '1';
      const total = hintEl.dataset.total || '';
      const upd = () => {
        const e = Timeline.edges(scroller);
        if (!e.left && !e.right) hintEl.textContent = total ? '共 ' + total + ' 站 · 已显示全程' : '已显示全程';
        else if (!e.left) hintEl.textContent = (total ? '共 ' + total + ' 站 · ' : '') + '向右滑动查看后续 →';
        else if (!e.right) hintEl.textContent = '← 向左滑动回看前序站点';
        else hintEl.textContent = (total ? '共 ' + total + ' 站 · ' : '') + '← 左右滑动浏览全程 →';
      };
      scroller.addEventListener('scroll', upd, { passive: true });
      requestAnimationFrame(upd);
    }
  };
  ZJ.Timeline = Timeline;

  /* ================= 竖向时间轴（大字版 · 老年友好） =================
     与横向时间轴内容一致，但站名更大、行高更高、提醒按钮更大，便于长者阅读点按。
     opt: { selected, board, alight, vehicles, err, range:[from,to], line, dirKey,
            bellAct, bellClass, staticEta(order), hintAct }
  */
  const VTimeline = {
    html(dir, opt) {
      opt = opt || {};
      const vehicles = opt.vehicles || [];
      const sel = opt.selected || 0;
      const board = opt.board || 0;
      const alight = opt.alight || 0;
      const bellAct = opt.bellAct || 'stop-remind';
      const hasLive = vehicles.length > 0 && !opt.err;
      const from = opt.range ? opt.range[0] : 1;
      const to = opt.range ? opt.range[1] : dir.stops.length;
      const rows = [];
      dir.stops.forEach((s) => {
        const o = s.o;
        if (o < from || o > to) return;
        let cls = '';
        if (board && o === board) cls += ' board';
        if (alight && o === alight) cls += ' alight';
        if (sel && o === sel && !board) cls += ' sel';
        if (board && o < board) cls += ' passed';

        let tag = '';
        if (board && o === board) tag = '<i class="vt-tag">上车站</i>';
        else if (alight && o === alight) tag = '<i class="vt-tag green">下车站</i>';

        /* 车辆标记：该站有车停靠 / 正在驶向下一站 */
        let bus = '';
        const here = vehicles.filter((v) => v.order === o);
        if (here.length) {
          const v = here[0];
          bus = '<span class="vt-bus"><svg class="ico"><use href="#i-bus"/></svg>' +
            (v.arrived ? '车辆停靠本站' : '车辆正在本站 → 下一站') + (here.length > 1 ? ' ×' + here.length : '') + '</span>';
        }

        /* 预计到站：本站已有车辆时只显示车辆徽标，避免重复 */
        let eta = '';
        if (hasLive && here.length) {
          eta = '';
        } else if (hasLive) {
          const arr = ZJ.RT.arrivalsTo(dir, vehicles, o);
          const b = arr[0];
          if (b) eta = '<span class="vt-eta live">' + (b.atStation ? '车辆已到站' : '还有 ' + b.remain + ' 站 · 约 ' + b.minutes + ' 分钟') + '</span>';
          else {
            const ahead = vehicles.some((v) => v.order > o || (v.order === o && !v.arrived));
            eta = '<span class="vt-eta' + (ahead ? ' dim' : '') + '">' + (ahead ? '车辆已过站' : '—') + '</span>';
          }
        } else if (typeof opt.staticEta === 'function') {
          eta = '<span class="vt-eta">' + ZJ.esc(opt.staticEta(o)) + '</span>';
        } else {
          eta = '<span class="vt-eta">约 ' + ZJ.Data.rideMinutes(dir, from, o) + ' 分钟（静态）</span>';
        }

        const rm = opt.line && opt.dirKey ? ZJ.Reminder.find(opt.line, opt.dirKey, s.name) : null;
        const bell = opt.bell === false ? '' :
          '<button class="' + (opt.bellClass || 'vt-bell') + (rm ? ' on' : '') + '" data-act="' + bellAct +
          '" data-station="' + ZJ.esc(s.name) + '" data-order="' + o +
          '"' + (opt.line ? ' data-line="' + ZJ.esc(opt.line) + '"' : '') + (opt.dirKey ? ' data-dir="' + ZJ.esc(opt.dirKey) + '"' : '') +
          ' aria-label="到站提醒"><svg class="ico"><use href="#i-bell"/></svg></button>';

        rows.push('<div class="vt-row' + cls + '" data-act="' + (opt.rowAct || 'stop') + '" data-station="' + ZJ.esc(s.name) + '" data-order="' + o + '">' +
          '<span class="vt-axis"><i class="vt-dot"></i></span>' +
          '<div class="vt-body"><div class="vt-top"><b class="vt-name">' + ZJ.esc(s.name) + '</b>' + tag + '</div>' +
          '<div class="vt-meta"><span class="vt-no">第 ' + o + ' 站</span>' + eta + bus + '</div></div>' +
          bell + '</div>');
      });
      return rows.join('');
    }
  };
  ZJ.VTimeline = VTimeline;

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
