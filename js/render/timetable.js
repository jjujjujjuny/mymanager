import { store } from '../store.js';
import { esc } from '../utils.js';

export function renderTimetable() {
  const el = document.getElementById('timetable-list');
  const classes = store.get('classes');
  if (!classes.length) {
    el.innerHTML = '<div class="card"><div class="card-body"><div class="empty">수업 데이터 없음. 🔄 눌러보거나 GAS 재배포 확인해봐</div></div></div>';
    return;
  }

  const days = ['mon','tue','wed','thu','fri'];
  const dayKR = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금' };
  const COLORS = ['#6366f1','#10b981','#f97316','#ec4899','#8b5cf6','#06b6d4','#f59e0b','#ef4444'];
  const cmap = {}; let ci = 0;
  [...new Set(classes.map(c => c.name))].forEach(n => { cmap[n] = COLORS[ci++ % COLORS.length]; });

  const toMin = t => {
    if (!t) return -1;
    const s = String(t);
    const kr = s.match(/(오전|오후)\s*(\d+):(\d+)/);
    if (kr) { let h = +kr[2]; if (kr[1] === '오후' && h < 12) h += 12; if (kr[1] === '오전' && h === 12) h = 0; return h * 60 + (+kr[3]); }
    const m = s.match(/(\d+):(\d+)/);
    return m ? (+m[1]) * 60 + (+m[2]) : -1;
  };

  const START_H = 8, END_H = 21, SLOT = 30;
  const totalSlots = (END_H - START_H) * 60 / SLOT;
  const todayDay = ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()];

  const blockMap = {};
  days.forEach(d => { blockMap[d] = {}; });
  classes.forEach(c => {
    if (!days.includes(c.day)) return;
    const sMin = toMin(c.start), eMin = toMin(c.end);
    if (sMin < 0) return;
    const startSlot = Math.round((sMin - START_H * 60) / SLOT);
    const span = Math.max(1, Math.round((eMin - sMin) / SLOT));
    if (startSlot < 0 || startSlot >= totalSlots) return;
    blockMap[c.day][startSlot] = { name: c.name, room: c.room || '', color: cmap[c.name] || '#6366f1', span };
  });

  let html = '<div class="tt-wrap"><div class="tt-grid">';
  html += `<div class="tt-head"></div>`;
  days.forEach(d => { html += `<div class="tt-head${d === todayDay ? ' today-col' : ''}">${dayKR[d]}</div>`; });

  for (let slot = 0; slot < totalSlots; slot++) {
    const totalMin = START_H * 60 + slot * SLOT;
    const hh = Math.floor(totalMin / 60), mm = totalMin % 60;
    const isHour = mm === 0;
    html += `<div class="tt-time">${isHour ? String(hh).padStart(2, '0') + ':00' : ''}</div>`;
    days.forEach(d => {
      const blk = blockMap[d][slot];
      const tc = d === todayDay ? ' today-col' : '';
      if (blk) {
        html += `<div class="tt-cell${isHour ? ' hour-line' : ''}${tc}" style="position:relative">`;
        html += `<div class="tt-block" style="background:${blk.color};height:${blk.span * 24 - 2}px" title="${esc(blk.name)} ${esc(blk.room)}">`;
        html += `<div>${esc(blk.name)}</div><div style="font-weight:400;opacity:.85;font-size:.55rem">${esc(blk.room)}</div>`;
        html += `</div></div>`;
      } else {
        html += `<div class="tt-cell${isHour ? ' hour-line' : ''}${tc}"></div>`;
      }
    });
  }
  html += '</div></div>';
  el.innerHTML = html;
}
