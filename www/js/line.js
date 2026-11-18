/* 线路实时页：车辆位置 / 剩余站 / 预计到站 / 本地到站提醒 */
(function () {
  const ZJ = window.ZJ;
  const $ = ZJ.$;
  const Data = ZJ.Data;

  const S = {
    line: null,
    dirIndex: 0,
    dir: null,
    station: '',
    vehicles: [],
    speed: ZJ.CFG.AVG_SPEED,
    at: 0,
    err: '',
    loading: false,
    req: 0,
    timer: null,
    detail: null,
    plans: null,
    plansFor: ''
  };
  let sheetMode = 'one';

  function lineFavIcon() {
    const on = ZJ.Fav.hasLine(S.line.name);
    const btn = $('lnFav');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-label', on ? '取消收藏' : '收藏线路');
  }

  function findStopIndex(name) {
    if (!S.dir) return 0;
    const i = S.dir.stops.findIndex((s) => s.name === name);
    return i < 0 ? 0 : i;
  }

  function pickDefaultStation() {
    const dir = S.dir;
    if (!dir || !dir.stops.length) return '';
    if (ZJ.Geo && ZJ.Geo.state === 'ok') {
      let best = null;
      dir.stops.forEach((s) => {
        if (!s.lat) return;
        const d = ZJ.hav(ZJ.Geo.lat, ZJ.Geo.lng, s.lat, s.lng);
        if (!best || d < best.d) best = { name: s.name, d: d };
      });
      if (best && best.d < 1500) return best.name;
    }
    return dir.stops[0].name;
  }

  function renderHeader() {
    $('lnName').textContent = S.line.name;
    $('lnDir').textContent = S.dir.start + ' → ' + S.dir.end + ' · 共 ' + S.dir.stops.length + ' 站';
    lineFavIcon();
  }

  function renderInfo() {
    const d = S.dir;
    const price = S.detail && S.detail.up && Number(S.detail.up.totalPrice || 0) > 0 ? Number(S.detail.up.totalPrice) : 0;
    const tags = [
      '<span class="tag"><svg class="ico"><use href="#i-clock"/></svg>首班 <b>' + ZJ.esc(d.first) + '</b></span>',
      '<span class="tag"><svg class="ico"><use href="#i-clock"/></svg>末班 <b>' + ZJ.esc(d.last) + '</b></span>',
      price ? '<span class="tag pink">票价 <b>¥' + price.toFixed(price % 1 ? 2 : 0) + '</b></span>' : '',
      '<span class="tag" data-act="open-tt"><svg class="ico"><use href="#i-bus"/></svg>发车时刻表</span>'
    ].filter(Boolean).join('');
    $('lineInfo').innerHTML =
      '<div class="li-route"><span>' + ZJ.esc(d.start) + '</span><span class="arrow">→</span><span>' + ZJ.esc(d.end) + '</span></div>' +
      '<div class="li-sub">' + d.stops.length + ' 站 · 全程约 ' + (d.total / 1000).toFixed(1) + ' 公里 · ' + (d.key === 'up' ? '上行' : '下行') + ' 方向</div>' +
      '<div class="li-tags">' + tags + '</div>';
  }

  function statusLine() {
    if (S.err) return S.err;
    if (!S.at) return '正在获取实时车辆…';
    return '更新于 ' + ZJ.clock(new Date(S.at)) + ' · 点此刷新';
  }

  function isInService(d) {
    const now = ZJ.nowMin();
    const toMin = (t) => {
      const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
      return m ? +m[1] * 60 + +m[2] : 0;
    };
    const f = toMin(d.first), l = toMin(d.last);
    if (!f && !l) return true;
    if (l < f) return now >= f || now <= l;
    return now >= f - 10 && now <= l + 45;
  }

  function nextPlanned(targetOrder) {
    if (!S.plans || !S.plans.length) return null;
    const now = ZJ.nowMin();
    const ride = Math.round(ZJ.Data.rideMeters(S.dir, 1, targetOrder) / ZJ.CFG.AVG_SPEED + (targetOrder - 1) * ZJ.CFG.DWELL);
    for (let i = 0; i < S.plans.length; i++) {
      const t = S.plans[i];
      const m = String(t).match(/(\d{1,2}):(\d{2})/);
      if (!m) continue;
      const dep = +m[1] * 60 + +m[2];
      if (dep >= now - 1) return { dep: t, eta: ZJ.minHM(dep + ride) };
    }
    return null;
  }

  function renderStat() {
    const box = $('lineStat');
    const d = S.dir;
    if (S.err) {
      box.innerHTML =
        '<div class="stat-empty"><b>实时车辆暂不可用</b>' +
        '<p>' + ZJ.esc(S.err) + '<br>已切换为静态数据，站点与首末班照常可用</p>' +
        '<button class="retry" data-act="line-refresh">重新获取</button></div>';
      return;
    }
    if (!S.at) {
      box.innerHTML = '<div class="stat-empty"><b>正在获取车辆位置…</b><p>' + ZJ.esc(d.first) + ' – ' + ZJ.esc(d.last) + ' 运营</p></div>';
      return;
    }
    const order = findStopIndex(S.station) + 1;
    const arr = ZJ.RT.arrivalsTo(d, S.vehicles, order);
    if (!arr.length) {
      const inService = isInService(d);
      const next = nextPlanned(order);
      if (ZJ.Api.mode === 'static') {
        box.innerHTML =
          '<div class="stat-empty"><b>静态数据模式</b>' +
          '<p>当前仅展示站点、首末班与里程<br>车辆位置需要实时接口（地址栏去掉 ?mode=static 可恢复）</p></div>';
        return;
      }
      let extra;
      if (!inService) extra = '当前时段已收班（' + d.first + ' – ' + d.last + '）';
      else if (next) extra = '下一班计划 ' + next.dep + ' 从起点发车 · 约 ' + next.eta + ' 到本站';
      else extra = '暂时没有车辆开往本站，稍后自动刷新';
      box.innerHTML =
        '<div class="stat-empty"><b>' + (inService ? '此刻暂无在线车辆' : '已收班') + '</b>' +
        '<p>' + ZJ.esc(extra) + '</p>' +
        '<p style="font-size:10.5px;margin-top:6px">' + (next ? '静态时刻表估算，仅供参考' : '数据每 20 秒自动刷新') + '</p></div>';
      return;
    }
    const first = arr[0];
    box.innerHTML =
      '<div class="stat-top"><span class="stat-num">' + first.remain + '</span><span class="stat-unit">站</span></div>' +
      '<div class="stat-sub">' + (first.atStation ? '车辆已在本站停靠' : '约 ' + first.minutes + ' 分钟 · ' + ZJ.distTxt(first.meters)) + '</div>' +
      '<div class="stat-plate"><span class="live"><i></i>实时</span><span>' + ZJ.esc(first.v.plate || '车辆') + '</span></div>' +
      '<div class="stat-sub" style="margin-top:6px;font-size:11px">' + ZJ.esc(ZJ.RT.positionText(d, first.v)) + '</div>' +
      '<div class="stat-sub" style="margin-top:6px;font-size:10.5px;color:#C08CA0" data-act="line-refresh">' + ZJ.esc(statusLine()) + '</div>';
  }

  function renderTimeline() {
    const d = S.dir;
    const selIdx = findStopIndex(S.station);
    const step = 72, pad = 24;
    const width = (d.stops.length - 1) * step + pad * 2;
    const fillPct = d.stops.length > 1 ? (selIdx / (d.stops.length - 1)) * 100 : 0;
    let html = '<div class="tl-bar"><div class="tl-fill" style="width:' + fillPct.toFixed(2) + '%"></div><div class="tl-chev"></div></div>';
    d.stops.forEach((s, i) => {
      const cls = i === selIdx ? 'sel' : i < selIdx ? 'passed' : '';
      const nm = s.name.length > 9 ? s.name.slice(0, 8) + '…' : s.name;
      html += '<div class="tl-item ' + cls + '" style="left:' + (pad + i * step) + 'px">' +
        '<span class="tl-no">' + s.o + '</span><span class="tl-dot"></span>' +
        '<span class="tl-nm">' + ZJ.esc(nm) + '</span></div>';
    });
    if (S.vehicles.length) {
      S.vehicles.slice(0, 8).forEach((v) => {
        const left = pad + Math.max(0, Math.min(d.stops.length - 1, v.pos)) * step;
        html += '<div class="tl-bus" style="left:' + left.toFixed(1) + 'px" data-act="bus-tip" data-plate="' + ZJ.esc(v.plate) + '">' +
          '<span class="bub"><svg class="ico"><use href="#i-bus"/></svg></span><span class="pin"></span></div>';
      });
    } else {
      html += '<div class="tl-empty">' + (S.err ? '实时位置不可用，仅显示站点序列' : S.loading ? '正在定位车辆…' : '当前无在线车辆') + '</div>';
    }
    const tl = $('tl');
    tl.style.width = width + 'px';
    tl.innerHTML = html;
    $('tlLegend').innerHTML = '<i><span class="b-dot"></span>已过</i><i><span class="g-dot"></span>前方</i>';
    const sc = $('tlScroll');
    const target = pad + selIdx * step - sc.clientWidth / 2;
    requestAnimationFrame(() => { sc.scrollLeft = Math.max(0, target); });
  }

  function renderMyStop() {
    const idx = findStopIndex(S.station);
    const rm = ZJ.Reminder.find(S.line.name, S.dir.key, S.station);
    const rmLabel = rm ? (rm.done ? '已提醒' : '提醒中') : '到站提醒';
    $('myStopBar').innerHTML =
      '<div class="ms-ico"><svg class="ico"><use href="#i-pin"/></svg></div>' +
      '<div class="ms-txt"><span>我的等车站 · 第 ' + (idx + 1) + ' 站</span><b>' + ZJ.esc(S.station) + '</b></div>' +
      '<button class="ms-btn ghost" data-act="line-pick">换站</button>' +
      '<button class="ms-btn ' + (rm ? 'ghost' : 'solid') + '" data-act="line-remind">' +
      '<svg class="ico"><use href="#i-bell"/></svg>' + rmLabel + '</button>';
  }

  function renderStops() {
    const d = S.dir;
    const selIdx = findStopIndex(S.station);
    const hasLive = S.vehicles.length > 0;
    const rows = d.stops.map((s, i) => {
      const arr = hasLive ? ZJ.RT.arrivalsTo(d, S.vehicles, s.o) : [];
      const best = arr[0];
      let eta = '<span class="stop-eta">—</span>';
      if (best) {
        eta = '<span class="stop-eta live"><svg class="ico mini-bus"><use href="#i-bus"/></svg>' +
          (best.atStation ? '已到站' : '约 ' + best.minutes + ' 分') + '</span>' +
          (best.remain ? '<span class="stop-tag pink">' + best.remain + ' 站</span>' : '<span class="stop-tag green">到站</span>');
      } else if (hasLive) {
        const anyBefore = S.vehicles.some((v) => v.order > s.o || (v.order === s.o && !v.arrived));
        if (anyBefore) eta = '<span class="stop-tag">已过</span>';
      }
      const isSel = i === selIdx;
      const rm = ZJ.Reminder.find(S.line.name, S.dir.key, s.name);
      return '<div class="stop-row ' + (isSel ? 'sel' : i < selIdx ? 'passed' : '') + '" data-act="set-stop" data-station="' + ZJ.esc(s.name) + '">' +
        '<span class="stop-idx"><i></i><s></s></span>' +
        '<span class="stop-main"><b>' + ZJ.esc(s.name) + '</b>' + eta +
        '<span class="bell ' + (rm ? 'on' : '') + '" data-act="stop-remind" data-station="' + ZJ.esc(s.name) + '"><svg class="ico"><use href="#i-bell"/></svg></span>' +
        '</span></div>';
    }).join('');
    $('stopList').innerHTML = rows;
    $('stopHint').textContent = hasLive ? '实时倒计时 · 点站点设为等车站' : '静态站序 · 点站点设为等车站';
  }

  function renderAll() {
    renderHeader();
    renderInfo();
    renderStat();
    renderTimeline();
    renderMyStop();
    renderStops();
    $('lineNote').textContent = S.err
      ? '实时接口暂不可用，当前显示静态站点数据（首末班 / 站序），仅供参考'
      : '车辆位置与到站时间为实时接口估算，计划班次为静态数据，仅供参考，受路况影响';
  }

  async function loadDetail() {
    const dirId = S.dir.id;
    try {
      const data = await ZJ.Api.lineDetail(dirId);
      if (!S.dir || S.dir.id !== dirId) return;
      if (data && data.up) { S.detail = data; renderInfo(); }
    } catch (e) { /* 票价非核心信息，失败不打断 */ }
  }

  async function loadPlans() {
    const dirId = S.dir.id;
    S.plansFor = dirId;
    try {
      const list = await ZJ.Api.plan(dirId);
      if (S.dir && S.dir.id === dirId) {
        S.plans = list || [];
        if (!S.vehicles.length) renderStat();
      }
    } catch (e) { S.plans = []; }
  }

  async function loadVehicles() {
    if (!S.dir) return;
    const rid = ++S.req;
    S.err = '';
    try {
      const data = await ZJ.Api.vehicles(S.dir.id);
      if (rid !== S.req) return;
      S.speed = data.busAverageSpeed || ZJ.CFG.AVG_SPEED;
      S.vehicles = ZJ.RT.normalize(S.dir, data);
      S.at = Date.now();
      S.loading = false;
      if (S.plansFor !== S.dir.id) loadPlans();
      renderAll();
    } catch (e) {
      if (rid !== S.req) return;
      S.loading = false;
      S.at = Date.now();
      S.err = e.message || '网络异常';
      S.vehicles = [];
      renderAll();
    }
  }

  function startPoll() {
    stopPoll();
    S.timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadVehicles();
    }, ZJ.CFG.LINE_POLL);
  }
  function stopPoll() {
    if (S.timer) clearInterval(S.timer);
    S.timer = null;
  }

  const Line = {
    open(name, dirKey, station) {
      const line = Data.lineOf(name);
      if (!line) { ZJ.toast('未找到该线路'); return; }
      S.line = line;
      let di = dirKey ? line.dirs.findIndex((d) => d.key === dirKey) : 0;
      if (di < 0) di = 0;
      S.dirIndex = di;
      S.dir = line.dirs[di];
      S.vehicles = [];
      S.at = 0;
      S.err = '';
      S.loading = true;
      S.detail = null;
      S.plans = null;
      S.plansFor = '';
      S.station = (station && S.dir.stops.some((s) => s.name === station)) ? station : pickDefaultStation();
      ZJ.UI.openFull('page-line');
      renderAll();
      loadDetail();
      loadVehicles();
      startPoll();
    },
    close() {
      stopPoll();
      S.req++;
      ZJ.UI.closeFull('page-line');
    },
    switchDir() {
      if (!S.line || S.line.dirs.length < 2) { ZJ.toast('该线路只有一个方向'); return; }
      S.dirIndex = (S.dirIndex + 1) % S.line.dirs.length;
      S.dir = S.line.dirs[S.dirIndex];
      S.vehicles = [];
      S.at = 0;
      S.err = '';
      S.loading = true;
      S.plans = null;
      if (!S.dir.stops.some((s) => s.name === S.station)) S.station = S.dir.stops[0].name;
      renderAll();
      loadVehicles();
      ZJ.toast('已切换为「' + S.dir.end + '」方向');
    },
    refresh() { loadVehicles(); },
    state() { return S; }
  };
  ZJ.Line = Line;

  /* ---------------- 提醒设置 ---------------- */
  function openReminderSheet(station) {
    const rm = ZJ.Reminder.find(S.line.name, S.dir.key, station);
    sheetMode = rm ? rm.mode : 'one';
    const modes = Object.keys(ZJ.Reminder.MODES).map((k) => {
      const m = ZJ.Reminder.MODES[k];
      return '<button class="rm-mode ' + (k === sheetMode ? 'on' : '') + '" data-act="rm-mode" data-mode="' + k + '">' +
        '<span class="r-ico"><svg class="ico"><use href="#i-bell"/></svg></span>' +
        '<span class="r-t"><b>' + m.label + '</b><span>' + m.desc + '</span></span>' +
        '<span class="r-chk"></span></button>';
    }).join('');
    ZJ.UI.sheet(
      '<div class="sheet-h"><b>到站提醒</b><button class="sheet-x" data-act="close-sheet"><svg class="ico"><use href="#i-close"/></svg></button></div>' +
      '<div class="sheet-body">' +
      '<div class="st-summary" style="margin-bottom:12px"><b>' + ZJ.esc(S.line.name) + '</b><span>往 ' + ZJ.esc(S.dir.end) + '</span><span class="upd">' + ZJ.esc(station) + '</span></div>' +
      '<div class="rm-modes">' + modes + '</div>' +
      '<p class="sheet-note">提醒只在 App 打开时通过本地弹窗 + 震动触发，不发送系统推送、不在后台驻留。实时数据中断时提醒会暂停。</p>' +
      '<button class="sheet-primary" data-act="rm-save" data-station="' + ZJ.esc(station) + '">开启提醒</button>' +
      (rm ? '<button class="mini" style="width:100%;margin-top:10px;height:38px" data-act="rm-cancel" data-station="' + ZJ.esc(station) + '">取消该站提醒</button>' : '') +
      '</div>'
    );
  }

  function openTimetable() {
    if (ZJ.Api.mode === 'static') { ZJ.toast('静态模式下不查询时刻表'); return; }
    if (!S.plans || !S.plans.length) {
      ZJ.toast('时刻表获取中，请稍候');
      loadPlans().then(() => { if (S.plans && S.plans.length) openTimetable(); else ZJ.toast('该线路暂无时刻表数据'); });
      return;
    }
    const now = ZJ.nowMin();
    const list = S.plans.map((t) => {
      const m = String(t).match(/(\d{1,2}):(\d{2})/);
      const dep = m ? +m[1] * 60 + +m[2] : -1;
      const next = dep >= now;
      return '<span class="tag ' + (next ? 'pink' : '') + '" style="font-size:12px;padding:6px 10px">' + ZJ.esc(t) + '</span>';
    }).join('');
    ZJ.UI.sheet(
      '<div class="sheet-h"><b>发车时刻表</b><button class="sheet-x" data-act="close-sheet"><svg class="ico"><use href="#i-close"/></svg></button></div>' +
      '<div class="sheet-body">' +
      '<p class="sheet-note" style="margin-top:0">' + ZJ.esc(S.line.name) + ' · 往 ' + ZJ.esc(S.dir.end) + ' · 起点站发车时间（共 ' + S.plans.length + ' 班）</p>' +
      '<div class="chips" style="gap:8px">' + list + '</div>' +
      '<p class="sheet-note" style="margin-top:14px">粉色为今日尚未发出的班次；数据来自官方接口，属计划班次，实际发车受路况影响。</p>' +
      '</div>'
    );
  }

  /* ---------------- 动作 ---------------- */
  ZJ.act('line-back', () => Line.close());
  ZJ.act('line-fav', () => {
    const on = ZJ.Fav.toggleLine(S.line.name);
    lineFavIcon();
    ZJ.toast(on ? '已收藏 ' + S.line.name : '已取消收藏');
    if (ZJ.Home) ZJ.Home.renderFav();
  });
  ZJ.act('line-swap', () => Line.switchDir());
  ZJ.act('line-refresh', () => loadVehicles());
  ZJ.act('set-stop', (el) => {
    S.station = el.dataset.station;
    renderAll();
    ZJ.toast('等车站已设为「' + S.station + '」');
  });
  ZJ.act('stop-remind', (el) => {
    S.station = el.dataset.station;
    renderAll();
    openReminderSheet(el.dataset.station);
  });
  ZJ.act('line-remind', () => openReminderSheet(S.station));
  ZJ.act('line-pick', () => {
    ZJ.Picker.open('选择等车站', { line: S.line.name, dirKey: S.dir.key }, (name) => {
      S.station = name;
      renderAll();
    });
  });
  ZJ.act('rm-mode', (el) => {
    sheetMode = el.dataset.mode;
    const wrap = el.parentNode;
    if (wrap) wrap.querySelectorAll('.rm-mode').forEach((n) => n.classList.toggle('on', n === el));
  });
  ZJ.act('rm-save', (el) => {
    const rm = ZJ.Reminder.add({ line: S.line.name, dirKey: S.dir.key, station: el.dataset.station, mode: sheetMode });
    ZJ.UI.closeSheet();
    renderAll();
    if (rm) ZJ.toast('已开启：' + ZJ.Reminder.MODES[rm.mode].label);
  });
  ZJ.act('rm-cancel', (el) => {
    const rm = ZJ.Reminder.find(S.line.name, S.dir.key, el.dataset.station);
    if (rm) ZJ.Reminder.remove(rm.id);
    ZJ.UI.closeSheet();
    renderAll();
    ZJ.toast('已取消该站提醒');
  });
  ZJ.act('open-tt', () => openTimetable());
  ZJ.act('bus-tip', (el) => ZJ.toast(el.dataset.plate ? '车辆 ' + el.dataset.plate : '实时车辆位置'));

  ZJ.LineUI = { openReminderSheet: openReminderSheet, openTimetable: openTimetable };
})();
