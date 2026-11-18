/* 本地到站提醒：只在 App 内弹窗 + 震动，不做推送、不做后台订阅 */
(function () {
  const ZJ = window.ZJ;
  const KEY = 'zjbus.reminders.v1';
  const MODES = {
    arrive: { label: '到站提醒', desc: '车辆到达所选站点时提醒', threshold: 0 },
    one: { label: '下一站提醒', desc: '车辆距站点还有 1 站时提醒', threshold: 1 },
    two: { label: '提前 2 站', desc: '车辆距站点还有 2 站时提醒（可选）', threshold: 2 }
  };

  let items = ZJ.Store.get(KEY, []);
  let timer = null;
  let ticking = false;
  let onChange = null;

  function save() { ZJ.Store.set(KEY, items); }
  function emit() { if (typeof onChange === 'function') onChange(items); }

  const Reminder = {
    MODES: MODES,
    list() { return items.slice(); },
    active() { return items.filter((r) => !r.done); },
    count() { return items.filter((r) => !r.done).length; },
    onChange(fn) { onChange = fn; },
    find(line, dirKey, station) {
      return items.find((r) => r.line === line && r.dirKey === dirKey && r.station === station && !r.done);
    },
    add(opt) {
      const line = opt.line, dirKey = opt.dirKey, station = opt.station, mode = MODES[opt.mode] ? opt.mode : 'arrive';
      const dir = ZJ.Data.lineOf(line) && ZJ.Data.lineOf(line).dirs.find((d) => d.key === dirKey);
      if (!dir) { ZJ.toast('线路信息缺失，无法设置提醒'); return null; }
      const old = Reminder.find(line, dirKey, station);
      if (old) {
        old.mode = mode;
        old.created = Date.now();
        old.done = false;
        old.state = 'pending';
        save(); emit();
        return old;
      }
      if (Reminder.count() >= 10) { ZJ.toast('最多同时设置 10 条提醒'); return null; }
      const rm = {
        id: 'rm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        line: line,
        dirKey: dirKey,
        dirId: dir.id,
        station: station,
        mode: mode,
        created: Date.now(),
        done: false,
        state: 'pending',
        remain: null,
        minutes: null,
        checkedAt: 0,
        error: ''
      };
      items.unshift(rm);
      save(); emit();
      Reminder.tick();
      return rm;
    },
    remove(id) {
      items = items.filter((r) => r.id !== id);
      save(); emit();
    },
    clear() {
      items = [];
      save(); emit();
    },
    /* 轮询一次：按方向合并请求，避免重复调用 */
    async tick() {
      if (ticking) return;
      if (document.visibilityState === 'hidden') return;
      if (ZJ.Api.mode === 'static') return;
      const act = Reminder.active();
      if (!act.length) return;
      ticking = true;
      try {
        const byDir = new Map();
        act.forEach((r) => {
          if (!byDir.has(r.dirId)) byDir.set(r.dirId, []);
          byDir.get(r.dirId).push(r);
        });
        const ids = [...byDir.keys()];
        await ZJ.batch(ids, 3, async (dirId) => {
          let data = null;
          try {
            data = await ZJ.Api.vehicles(dirId);
          } catch (e) {
            byDir.get(dirId).forEach((r) => {
              r.state = 'error';
              r.error = e.message || '网络异常';
              r.checkedAt = Date.now();
            });
            return;
          }
          const dir = ZJ.Data.dirs.get(dirId);
          if (!dir) return;
          const list = ZJ.RT.normalize(dir, data);
          byDir.get(dirId).forEach((r) => {
            r.checkedAt = Date.now();
            r.error = '';
            const target = dir.stops.find((s) => s.name === r.station);
            if (!target) { r.state = 'error'; r.error = '站点不在该线路'; return; }
            const arr = ZJ.RT.arrivalsTo(dir, list, target.o);
            const nearest = arr[0];
            if (!nearest) {
              r.state = list.length ? 'passed' : 'idle';
              r.remain = null;
              r.minutes = null;
              if (list.length && data.startTime) r.nextStart = data.startTime;
              return;
            }
            r.remain = nearest.remain;
            r.minutes = nearest.minutes;
            r.plate = nearest.v.plate;
            r.state = 'tracking';
            const th = MODES[r.mode].threshold;
            if (nearest.remain <= th) {
              r.done = true;
              r.doneAt = Date.now();
              r.state = 'done';
              save();
              Reminder.fire(r, nearest, dir);
            }
          });
        });
        /* 清理 2 小时前的已完成提醒 */
        const now = Date.now();
        const before = items.length;
        items = items.filter((r) => !(r.done && now - (r.doneAt || r.created) > 7200 * 1000));
        if (items.length !== before) save();
        emit();
      } finally {
        ticking = false;
      }
    },
    fire(rm, info, dir) {
      const isArrive = rm.mode === 'arrive';
      const title = isArrive ? '车辆已到站' : '车辆即将到站';
      const sub = isArrive
        ? (info.v.plate || '车辆') + ' 已到达「' + rm.station + '」，请准备下车'
        : (info.v.plate || '车辆') + ' 距「' + rm.station + '」还有 ' + info.remain + ' 站 · 约 ' + info.minutes + ' 分钟';
      const html =
        '<div class="alert-bell"><svg class="ico"><use href="#i-bell"/></svg></div>' +
        '<h3>' + ZJ.esc(title) + '</h3>' +
        '<p class="a-sub">' + ZJ.esc(sub) + '</p>' +
        '<div class="a-line"><svg class="ico"><use href="#i-bus"/></svg>' + ZJ.esc(rm.line) + ' · ' + ZJ.esc(dir.end) + ' 方向</div>' +
        '<div class="alert-btns"><button class="ghost" id="rmGo">知道了</button><button class="primary" id="rmView">查看线路</button></div>';
      ZJ.UI.alert(html);
      ZJ.UI.vibrate([400, 150, 400, 150, 700]);
      const $ = ZJ.$;
      const go = $('rmGo'), view = $('rmView');
      if (go) go.addEventListener('click', () => ZJ.UI.closeAlert());
      if (view) view.addEventListener('click', () => {
        ZJ.UI.closeAlert();
        if (ZJ.Line && ZJ.Line.open) ZJ.Line.open(rm.line, rm.dirKey, rm.station);
      });
      emit();
    },
    start() {
      Reminder.stop();
      timer = setInterval(() => Reminder.tick(), ZJ.CFG.REMIND_POLL);
      Reminder.tick();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };

  ZJ.Reminder = Reminder;
})();
