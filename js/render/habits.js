import { store } from '../store.js';
import { api } from '../api.js';
import { todayStr, todayDayKey, dateStr, esc, DAYS, DKR, ICONS } from '../utils.js';
import { renderHome } from './home.js';
import { openModal, closeModal } from '../main.js';

let selIcon = '📚';
let selDays = ['mon','tue','wed','thu','fri'];

export function renderHabits() {
  const habits = store.get('habits'), logs = store.get('habit_logs');
  const ts = todayStr(), dk = todayDayKey();
  const todayH = habits.filter(h => Array.isArray(h.days) && h.days.includes(dk));

  const SVG_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
  const tel = document.getElementById('habits-today');
  tel.innerHTML = todayH.length ? todayH.map(h => {
    const done = logs.some(l => l.hid === h.id && l.date === ts);
    return `<div class="habit-row">
      <button class="habit-check${done ? ' done-chk' : ''}" data-hid="${h.id}">✓</button>
      <div style="flex:1;min-width:0">
        <div class="habit-name${done ? ' done' : ''}">${esc(h.name)}</div>
        <div class="habit-days">${(h.days || []).map(d => DKR[d]).join(' ')}</div>
      </div>
      <button class="act-btn" data-hdel="${h.id}">${SVG_TRASH}</button>
    </div>`;
  }).join('') : '<div class="empty">오늘 설정된 습관이 없습니다</div>';

  const others = habits.filter(h => !Array.isArray(h.days) || !h.days.includes(dk));
  const ael = document.getElementById('habits-all');
  ael.innerHTML = others.length ? `<div class="card"><div class="card-hdr"><h3>다른 날 습관</h3></div><div class="card-body">${
    others.map(h => `<div class="row">
      <span style="font-size:13px;font-weight:500;color:#0f172a">${esc(h.name)}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:#94a3b8">${(h.days || []).map(d => DKR[d]).join(' ')}</span>
        <button class="act-btn" data-hdel="${h.id}">${SVG_TRASH}</button>
      </div>
    </div>`).join('')
  }</div></div>` : '';
}

// 이벤트 위임
document.getElementById('habits-today').addEventListener('click', async e => {
  const hid = e.target.closest('[data-hid]')?.dataset.hid;
  const did = e.target.closest('[data-hdel]')?.dataset.hdel;
  if (hid) { await toggleHabitLog(hid); renderHabits(); renderHome(); }
  if (did) delHabit(did);
});
document.getElementById('habits-all').addEventListener('click', e => {
  const did = e.target.closest('[data-hdel]')?.dataset.hdel;
  if (did) delHabit(did);
});

export async function toggleHabitLog(id) {
  const logs = store.get('habit_logs'), ts = todayStr();
  const i = logs.findIndex(l => l.hid === id && dateStr(l.date) === ts);
  if (i > -1) {
    const removed = logs.splice(i, 1)[0];
    store.set('habit_logs', logs);
    if (removed.id) await api.remove('habit_logs', removed.id);
    else await api.removeHabitLog(id, ts);
  } else {
    const item = { id: crypto.randomUUID(), hid: id, date: ts };
    store.set('habit_logs', [...logs, item]);
    await api.upsert('habit_logs', item);
  }
}

export function openHabitModal() {
  selIcon = '📚'; selDays = ['mon','tue','wed','thu','fri'];
  document.getElementById('h-name').value = '';
  buildIconGrid(); buildDayGrid();
  openModal('m-habit');
}

function buildIconGrid() {
  document.getElementById('icon-grid').innerHTML = ICONS.map(ic =>
    `<button type="button" class="pick-btn${ic === selIcon ? ' sel' : ''}" data-icon="${ic}">${ic}</button>`
  ).join('');
}
function buildDayGrid() {
  document.getElementById('day-grid').innerHTML = DAYS.map(d =>
    `<button type="button" class="dp-btn ${selDays.includes(d) ? 'on' : 'off'}" data-day="${d}">${DKR[d]}</button>`
  ).join('');
}

document.getElementById('icon-grid').addEventListener('click', e => {
  const btn = e.target.closest('[data-icon]');
  if (!btn) return;
  selIcon = btn.dataset.icon;
  document.querySelectorAll('#icon-grid .pick-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
});
document.getElementById('day-grid').addEventListener('click', e => {
  const btn = e.target.closest('[data-day]');
  if (!btn) return;
  const d = btn.dataset.day;
  if (selDays.includes(d)) selDays = selDays.filter(x => x !== d); else selDays.push(d);
  btn.className = `dp-btn ${selDays.includes(d) ? 'on' : 'off'}`;
});

export function saveHabit() {
  const name = document.getElementById('h-name').value.trim();
  if (!name) { alert('습관 이름을 입력해!'); return; }
  if (!selDays.length) { alert('최소 하루는 골라야 해!'); return; }
  const item = { id: crypto.randomUUID(), name, icon: selIcon, days: [...selDays] };
  store.set('habits', [...store.get('habits'), item]);
  api.upsert('habits', item);
  closeModal('m-habit'); renderHabits(); renderHome();
}

function delHabit(id) {
  if (!confirm('삭제할까?')) return;
  store.set('habits', store.get('habits').filter(h => h.id !== id));
  store.set('habit_logs', store.get('habit_logs').filter(l => l.hid !== id));
  api.remove('habits', id);
  api.removeWhere('habit_logs', 'hid', id);
  renderHabits(); renderHome();
}
