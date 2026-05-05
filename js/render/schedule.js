import { store } from '../store.js';
import { api } from '../api.js';
import { todayStr, weekStart, dateStr, esc, fmtTime } from '../utils.js';
import { renderHome } from './home.js';
import { openModal, closeModal } from '../main.js';
import { fetchGcalEvents } from '../gcal.js';

let selDay = todayStr();
let curWeekDate = weekStart(new Date());

// 구글 캘린더 이벤트 캐시
let gcalCache = [];
let gcalFetchedWeekKey = null;

export function renderWeek() {
  const start = new Date(curWeekDate), today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  document.getElementById('week-lbl').textContent = `${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getMonth() + 1}월 ${end.getDate()}일`;

  const startStr = dateStr(start);
  const endStr   = dateStr(end);
  const weekKey  = startStr + '_' + endStr;

  updateGcalBtn();

  const events = store.get('events');
  const dn = ['월','화','수','목','금','토','일'];
  document.getElementById('week-grid').innerHTML = dn.map((d, i) => {
    const dt = new Date(start); dt.setDate(dt.getDate() + i);
    const ds = dateStr(dt);
    const isToday = dt.getTime() === today.getTime(), isSel = ds === selDay;
    const localCnt = events.filter(e => dateStr(e.date) === ds).length;
    const gcalCnt  = gcalCache.filter(e => e.date === ds).length;
    const cnt = localCnt + gcalCnt;
    return `<div class="day-col${isSel ? ' sel' : ''}" data-ds="${ds}">
      <span class="day-name">${d}</span>
      <span class="day-num${isToday ? ' today' : isSel ? ' sel-num' : ''}">${dt.getDate()}</span>
      <span class="${cnt ? 'day-dot' : 'day-dot hidden'}"></span>
    </div>`;
  }).join('');

  renderDayEvents();

  // 구글 캘린더 이벤트 비동기 로드 (주가 바뀌었을 때만)
  if (gcalFetchedWeekKey !== weekKey) {
    gcalFetchedWeekKey = weekKey;
    fetchGcalEvents(startStr, endStr).then(events => {
      gcalCache = events;
      renderWeek();
    });
  }
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
  const localEvents = store.get('events').filter(e => dateStr(e.date) === selDay);
  const gcalEvents  = gcalCache.filter(e => e.date === selDay);
  const all = [...localEvents, ...gcalEvents].sort((a, b) => {
    const ta = fmtTime(a.start) || '00:00';
    const tb = fmtTime(b.start) || '00:00';
    return ta > tb ? 1 : -1;
  });

  const d = new Date(selDay + 'T00:00:00');
  const el = document.getElementById('day-events');
  const hdr = `<div style="font-size:.85rem;font-weight:600;color:#475569">${d.getMonth() + 1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]}) 일정</div>`;
  el.innerHTML = hdr + (all.length ? all.map(e => {
    const isGcal = e.isGcal;
    return `<div class="task-card${isGcal ? ' gcal-event' : ''}">
      <div class="task-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            ${isGcal ? '<span class="gcal-badge">G</span>' : ''}
            <div class="task-title">${esc(e.title)}</div>
          </div>
          ${!isGcal ? `<button class="act-btn" data-edel="${e.id}">🗑️</button>` : ''}
        </div>
        ${e.start ? `<div class="task-date" style="color:#6366f1">${fmtTime(e.start)}${e.end ? ' - ' + fmtTime(e.end) : ''}</div>` : ''}
        ${e.desc ? `<div class="task-note">${esc(e.desc)}</div>` : ''}
      </div>
    </div>`;
  }).join('') : `<div class="card"><div class="card-body"><div class="empty">이 날 일정이 없어요</div></div></div>`);
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

export function syncGcalWeek() {
  const start = new Date(curWeekDate);
  const end   = new Date(start); end.setDate(end.getDate() + 6);
  const startStr = dateStr(start);
  const endStr   = dateStr(end);
  const weekKey  = startStr + '_' + endStr;

  gcalFetchedWeekKey = null; // 강제 새로고침
  gcalCache = [];
  gcalFetchedWeekKey = weekKey;

  fetchGcalEvents(startStr, endStr).then(events => {
    if (events === null) return;
    gcalCache = events;
    renderWeek();
  });
}

function updateGcalBtn() {
  const btn = document.getElementById('gcal-sync-btn');
  if (!btn) return;
  btn.textContent = '🔄 캘린더';
  btn.title = '구글 캘린더 새로고침';
  btn.onclick = syncGcalWeek;
}
