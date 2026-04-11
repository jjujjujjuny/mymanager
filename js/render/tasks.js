import { store } from '../store.js';
import { api } from '../api.js';
import { todayStr, daysLeft, fmtDate, esc, taskUrgency } from '../utils.js';
import { renderHome } from './home.js';
import { openModal, closeModal } from '../main.js';

let curFilter = 'all';
let editTaskId = null;

const TL = { assignment:'과제', exam:'시험', project:'프로젝트', video:'강의영상', other:'기타' };
const TC = { assignment:'type-assign', exam:'type-exam', project:'type-proj', video:'type-video', other:'type-other' };
const PRD = { high:'prio-dot prio-high', medium:'prio-dot prio-med', low:'prio-dot prio-low' };
const PRL = { high:'높음', medium:'보통', low:'낮음' };

const SVG_EDIT = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
const SVG_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

export function setFilter(btn, f) {
  curFilter = f;
  document.querySelectorAll('.filt').forEach(b => { b.classList.remove('on'); b.classList.add('off'); });
  btn.classList.add('on'); btn.classList.remove('off');
  renderTasks();
}

export function renderTasks() {
  let tasks = store.get('tasks');
  if (curFilter === 'done')     tasks = tasks.filter(t => t.done);
  else if (curFilter !== 'all') tasks = tasks.filter(t => t.type === curFilter);
  tasks.sort((a, b) => { if (a.done !== b.done) return a.done ? 1 : -1; return a.due > b.due ? 1 : -1; });

  const el = document.getElementById('tasks-list');
  if (!tasks.length) {
    el.innerHTML = `<div class="card"><div class="card-body"><div class="empty" style="text-align:center;padding:20px">${curFilter === 'done' ? '완료된 항목 없음' : '아직 아무것도 없어. 추가해봐!'}</div></div></div>`;
    return;
  }
  const cfg = store.cfg();
  el.innerHTML = tasks.map(t => {
    const dl = daysLeft(t.due);
    const urgency = taskUrgency(t, cfg);
    const URG_BADGE = {
      overdue: `<span class="badge badge-red">마감 지남</span>`,
      today:   `<span class="badge badge-red">오늘 마감</span>`,
      warning: `<span class="badge badge-orange">${dl}일 남음</span>`,
      soon:    `<span class="badge badge-yellow">${dl}일 남음</span>`,
      ok:      `<span class="badge badge-green">${dl}일 남음</span>`,
    };
    const urg = t.done ? '' : (URG_BADGE[urgency] || '');
    return `<div class="task-card${t.done ? ' done' : ''}">
      <button class="task-check${t.done ? ' chk' : ''}" data-tid="${t.id}">✓</button>
      <div class="task-body">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <div class="task-title${t.done ? ' crossed' : ''}">${esc(t.title)}</div>
          <div class="task-actions">
            <button class="act-btn" data-edit="${t.id}">${SVG_EDIT}</button>
            <button class="act-btn" data-del="${t.id}">${SVG_TRASH}</button>
          </div>
        </div>
        <div class="task-meta">
          <span class="type-pill ${TC[t.type] || 'type-other'}">${TL[t.type] || t.type}</span>
          ${t.subject ? `<span style="font-size:11px;color:#94a3b8">${esc(t.subject)}</span>` : ''}
          <span class="${PRD[t.priority] || 'prio-dot'}">${PRL[t.priority] || t.priority}</span>
          ${urg}
        </div>
        <div class="task-date">${fmtDate(t.due)}</div>
        ${t.notes ? `<div class="task-note">${esc(t.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// 이벤트 위임
document.getElementById('tasks-list').addEventListener('click', e => {
  const tid = e.target.closest('[data-tid]')?.dataset.tid;
  const eid = e.target.closest('[data-edit]')?.dataset.edit;
  const did = e.target.closest('[data-del]')?.dataset.del;
  if (tid) toggleTask(tid);
  if (eid) openEditTask(eid);
  if (did) delTask(did);
});

export function openTaskModal() {
  editTaskId = null;
  document.getElementById('m-task-ttl').textContent = '과제 / 시험 추가';
  ['t-title','t-subj','t-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('t-type').value = 'assignment';
  document.getElementById('t-prio').value = 'medium';
  document.getElementById('t-due').value = todayStr();
  openModal('m-task');
}

export function openEditTask(id) {
  const t = store.get('tasks').find(x => x.id === id);
  if (!t) return;
  editTaskId = id;
  document.getElementById('m-task-ttl').textContent = '과제 / 시험 수정';
  document.getElementById('t-title').value = t.title;
  document.getElementById('t-subj').value = t.subject || '';
  document.getElementById('t-type').value = t.type;
  document.getElementById('t-prio').value = t.priority;
  document.getElementById('t-due').value = t.due;
  document.getElementById('t-notes').value = t.notes || '';
  openModal('m-task');
}

export function saveTask() {
  const title = document.getElementById('t-title').value.trim();
  const due = document.getElementById('t-due').value;
  if (!title || !due) { alert('제목과 마감일은 필수야!'); return; }

  const fields = {
    title,
    subject: document.getElementById('t-subj').value.trim(),
    type: document.getElementById('t-type').value,
    priority: document.getElementById('t-prio').value,
    due,
    notes: document.getElementById('t-notes').value.trim(),
    done: false
  };

  const tasks = store.get('tasks');
  let item;
  if (editTaskId) {
    const i = tasks.findIndex(t => t.id === editTaskId);
    if (i > -1) { tasks[i] = { ...tasks[i], ...fields }; item = tasks[i]; }
    store.set('tasks', tasks);
  } else {
    item = { id: crypto.randomUUID(), ...fields, created: new Date().toISOString() };
    store.set('tasks', [...tasks, item]);
  }
  if (item) api.upsert('tasks', item);
  closeModal('m-task'); renderTasks(); renderHome();
}

export function toggleTask(id) {
  const tasks = store.get('tasks');
  const t = tasks.find(x => x.id === id);
  if (t) t.done = !t.done;
  store.set('tasks', tasks);
  if (t) api.upsert('tasks', t);
  renderTasks(); renderHome();
}

export function delTask(id) {
  if (!confirm('삭제할까?')) return;
  store.set('tasks', store.get('tasks').filter(t => t.id !== id));
  api.remove('tasks', id);
  renderTasks(); renderHome();
}
