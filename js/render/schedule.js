import { store } from '../store.js';
import { api } from '../api.js';
import { todayStr, weekStart, dateStr, esc, fmtTime } from '../utils.js';
import { renderHome } from './home.js';
import { openModal, closeModal } from '../main.js';

let selDay = todayStr();
let curWeekDate = weekStart(new Date());

export function renderWeek() {
  const start = new Date(curWeekDate), today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  document.getElementById('week-lbl').textContent = `${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getMonth() + 1}월 ${end.getDate()}일`;

  const events = store.get('events');
  const dn = ['월','화','수','목','금','토','일'];
  document.getElementById('week-grid').innerHTML = dn.map((d, i) => {
    const dt = new Date(start); dt.setDate(dt.getDate() + i);
    const ds = dateStr(dt);
    const isToday = dt.getTime() === today.getTime(), isSel = ds === selDay;
    const cnt = events.filter(e => dateStr(e.date) === ds).length;
    return `<div class="day-col${isSel ? ' sel' : ''}" data-ds="${ds}">
      <span class="day-name">${d}</span>
      <span class="day-num${isToday ? ' today' : isSel ? ' sel-num' : ''}">${dt.getDate()}</span>
      <span class="${cnt ? 'day-dot' : 'day-dot hidden'}"></span>
    </div>`;
  }).join('');
  renderDayEvents();
}

document.getElementById('week-grid').addEventListener('click', e => {
  const col = e.target.closest('[data-ds]');
  if (col) { selDay = col.dataset.ds; renderWeek(); }
});

export function shiftWeek(dir) {
  curWeekDate.setDate(curWeekDate.getDate() + dir * 7);
  renderWeek();
}

function renderDayEvents() {
  const events = store.get('events').filter(e => dateStr(e.date) === selDay).sort((a, b) => fmtTime(a.start) > fmtTime(b.start) ? 1 : -1);
  const d = new Date(selDay + 'T00:00:00');
  const el = document.getElementById('day-events');
  const hdr = `<div style="font-size:.85rem;font-weight:600;color:#475569">${d.getMonth() + 1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]}) 일정</div>`;
  el.innerHTML = hdr + (events.length ? events.map(e => `<div class="task-card">
    <div class="task-body">
      <div style="display:flex;justify-content:space-between">
        <div class="task-title">${esc(e.title)}</div>
        <button class="act-btn" data-edel="${e.id}">🗑️</button>
      </div>
      ${e.start ? `<div class="task-date" style="color:#6366f1">${fmtTime(e.start)}${e.end ? ' - ' + fmtTime(e.end) : ''}</div>` : ''}
      ${e.desc ? `<div class="task-note">${esc(e.desc)}</div>` : ''}
    </div>
  </div>`).join('') : `<div class="card"><div class="card-body"><div class="empty">이 날 일정이 없어요</div></div></div>`);
}

document.getElementById('day-events').addEventListener('click', e => {
  const btn = e.target.closest('[data-edel]');
  if (btn) delEvent(btn.dataset.edel);
});

export function openEventModal() {
  document.getElementById('e-title').value = '';
  document.getElementById('e-date').value = selDay;
  document.getElementById('e-start').value = '';
  document.getElementById('e-end').value = '';
  document.getElementById('e-desc').value = '';
  openModal('m-event');
}

export function saveEvent() {
  const title = document.getElementById('e-title').value.trim();
  const date = document.getElementById('e-date').value;
  if (!title || !date) { alert('제목과 날짜는 필수야!'); return; }
  const item = {
    id: crypto.randomUUID(),
    title, date,
    start: document.getElementById('e-start').value,
    end: document.getElementById('e-end').value,
    desc: document.getElementById('e-desc').value.trim()
  };
  store.set('events', [...store.get('events'), item]);
  api.upsert('events', item);
  closeModal('m-event'); renderWeek(); renderHome();
}

function delEvent(id) {
  if (!confirm('삭제할까?')) return;
  store.set('events', store.get('events').filter(e => e.id !== id));
  api.remove('events', id);
  renderWeek(); renderHome();
}
