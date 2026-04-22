import { store } from '../store.js';
import { api } from '../api.js';
import { daysLeft, fmtDate, esc } from '../utils.js';
import { openModal, closeModal } from '../main.js';

let editGoalId = null;

const SVG_EDIT  = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
const SVG_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
const SVG_PLUS  = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>`;

export function renderGoals() {
  const goals = store.get('goals');
  const el = document.getElementById('goals-list');

  el.innerHTML = goals.length ? goals.map(g => {
    const st = g.subtasks || [], done = st.filter(s => s.done).length;
    const pct = st.length ? Math.round(done / st.length * 100) : (g.progress || 0);
    const dl = g.deadline ? daysLeft(g.deadline) : null;
    return `<div class="goal-card"><div class="goal-body">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <div class="goal-title">${esc(g.title)}</div>
          ${g.desc ? `<div class="goal-desc">${esc(g.desc)}</div>` : ''}
          ${g.deadline ? `<div class="goal-date">${fmtDate(g.deadline)}${dl !== null ? ` · ${dl < 0 ? '기간 지남' : dl + '일 남음'}` : ''}</div>` : ''}
        </div>
        <div style="display:flex;gap:2px;flex-shrink:0">
          <button class="act-btn" data-gedit="${g.id}">${SVG_EDIT}</button>
          <button class="act-btn" data-addsub="${g.id}">${SVG_PLUS}</button>
          <button class="act-btn" data-gdel="${g.id}">${SVG_TRASH}</button>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-hdr"><span class="progress-lbl">진행률</span><span class="progress-pct">${pct}%</span></div>
        <div class="progress-bar-bg"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>
      ${st.length ? `<div class="subtasks">${st.map(s => `<div class="subtask-row" style="display:flex;align-items:center;gap:6px">
        <button class="sub-check${s.done ? ' done-sub' : ''}" data-subcheck data-gid="${g.id}" data-sid="${s.id}">✓</button>
        <span class="sub-text${s.done ? ' done' : ''}" style="flex:1;min-width:0">${esc(s.text)}</span>
        <div style="display:flex;gap:2px;flex-shrink:0">
          <button class="act-btn" data-sedit data-gid="${g.id}" data-sid="${s.id}">${SVG_EDIT}</button>
          <button class="act-btn" data-sdel data-gid="${g.id}" data-sid="${s.id}">${SVG_TRASH}</button>
        </div>
      </div>`).join('')}</div>` : ''}
      <button class="add-sub" data-addsub="${g.id}">${SVG_PLUS} 세부 목표 추가</button>
    </div></div>`;
  }).join('') : `<div class="card"><div class="card-body"><div class="empty" style="text-align:center;padding:20px">목표를 추가해보세요</div></div></div>`;
}

// 이벤트 위임
document.getElementById('goals-list').addEventListener('click', e => {
  const gedit  = e.target.closest('[data-gedit]');
  const addBtn = e.target.closest('[data-addsub]');
  const delBtn = e.target.closest('[data-gdel]');
  const subChk = e.target.closest('[data-subcheck]');
  const sedit  = e.target.closest('[data-sedit]');
  const sdel   = e.target.closest('[data-sdel]');

  if (gedit)  openGoalModal(gedit.dataset.gedit);
  if (addBtn) addSubtask(addBtn.dataset.addsub);
  if (delBtn) delGoal(delBtn.dataset.gdel);
  if (subChk) toggleSub(subChk.dataset.gid, subChk.dataset.sid);
  if (sedit)  editSubtask(sedit.dataset.gid, sedit.dataset.sid);
  if (sdel)   delSubtask(sdel.dataset.gid, sdel.dataset.sid);
});

export function openGoalModal(editId) {
  editGoalId = editId || null;
  const ttl = document.getElementById('m-goal-ttl');
  if (editId) {
    const g = store.get('goals').find(x => x.id === editId);
    if (!g) return;
    document.getElementById('g-title').value = g.title;
    document.getElementById('g-desc').value  = g.desc || '';
    document.getElementById('g-dl').value    = g.deadline || '';
    if (ttl) ttl.textContent = '목표 수정';
  } else {
    document.getElementById('g-title').value = '';
    document.getElementById('g-desc').value  = '';
    document.getElementById('g-dl').value    = '';
    if (ttl) ttl.textContent = '목표 추가';
  }
  openModal('m-goal');
}

export function saveGoal() {
  const title = document.getElementById('g-title').value.trim();
  if (!title) { alert('목표를 입력해!'); return; }

  const goals = store.get('goals');
  let item;
  if (editGoalId) {
    const i = goals.findIndex(g => g.id === editGoalId);
    if (i > -1) {
      goals[i] = {
        ...goals[i],
        title,
        desc:     document.getElementById('g-desc').value.trim(),
        deadline: document.getElementById('g-dl').value
      };
      item = goals[i];
    }
    store.set('goals', goals);
  } else {
    item = {
      id:       crypto.randomUUID(),
      title,
      desc:     document.getElementById('g-desc').value.trim(),
      deadline: document.getElementById('g-dl').value,
      progress: 0,
      subtasks: []
    };
    store.set('goals', [...goals, item]);
  }
  if (item) api.upsert('goals', item);
  editGoalId = null;
  closeModal('m-goal');
  renderGoals();
}

function addSubtask(gid) {
  const text = prompt('세부 목표를 입력해:');
  if (!text || !text.trim()) return;
  const goals = store.get('goals');
  const g = goals.find(x => x.id === gid);
  if (g) {
    g.subtasks = g.subtasks || [];
    g.subtasks.push({ id: crypto.randomUUID(), text: text.trim(), done: false });
  }
  store.set('goals', goals);
  if (g) api.upsert('goals', g);
  renderGoals();
}

function editSubtask(gid, sid) {
  const goals = store.get('goals');
  const g = goals.find(x => x.id === gid);
  if (!g) return;
  const s = (g.subtasks || []).find(x => x.id === sid);
  if (!s) return;
  const text = prompt('세부 목표 수정:', s.text);
  if (text === null) return;
  if (!text.trim()) { alert('내용을 입력해!'); return; }
  s.text = text.trim();
  store.set('goals', goals);
  api.upsert('goals', g);
  renderGoals();
}

function delSubtask(gid, sid) {
  if (!confirm('세부 목표를 삭제할까?')) return;
  const goals = store.get('goals');
  const g = goals.find(x => x.id === gid);
  if (g) g.subtasks = (g.subtasks || []).filter(s => s.id !== sid);
  store.set('goals', goals);
  if (g) api.upsert('goals', g);
  renderGoals();
}

function toggleSub(gid, sid) {
  const goals = store.get('goals');
  const g = goals.find(x => x.id === gid);
  if (g) {
    const s = (g.subtasks || []).find(x => x.id === sid);
    if (s) s.done = !s.done;
  }
  store.set('goals', goals);
  if (g) api.upsert('goals', g);
  renderGoals();
}

function delGoal(id) {
  if (!confirm('목표를 삭제할까?')) return;
  store.set('goals', store.get('goals').filter(g => g.id !== id));
  api.remove('goals', id);
  renderGoals();
}
