import { store } from '../store.js';
import { api } from '../api.js';
import { daysLeft, fmtDate, esc } from '../utils.js';
import { openModal, closeModal } from '../main.js';

export function renderGoals() {
  const goals = store.get('goals');
  const el = document.getElementById('goals-list');
  el.innerHTML = goals.length ? goals.map(g => {
    const st = g.subtasks || [], done = st.filter(s => s.done).length;
    const pct = st.length ? Math.round(done / st.length * 100) : (g.progress || 0);
    const dl = g.deadline ? daysLeft(g.deadline) : null;
    return `<div class="goal-card"><div class="goal-body">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <div>
          <div class="goal-title">${esc(g.title)}</div>
          ${g.desc ? `<div class="goal-desc">${esc(g.desc)}</div>` : ''}
          ${g.deadline ? `<div class="goal-date">📅 ${fmtDate(g.deadline)} ${dl !== null ? `(${dl < 0 ? '지남' : dl + '일 남음'})` : ''}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="act-btn" data-addsub="${g.id}">➕</button>
          <button class="act-btn" data-gdel="${g.id}">🗑️</button>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-hdr"><span class="progress-lbl">진행률</span><span class="progress-pct">${pct}%</span></div>
        <div class="progress-bar-bg"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>
      ${st.length ? `<div class="subtasks">${st.map(s => `<div class="subtask-row">
        <button class="sub-check" data-gid="${g.id}" data-sid="${s.id}">${s.done ? '✅' : '⬜'}</button>
        <span class="sub-text${s.done ? ' done' : ''}">${esc(s.text)}</span>
      </div>`).join('')}</div>` : ''}
      <button class="add-sub" data-addsub="${g.id}">+ 세부 목표 추가</button>
    </div></div>`;
  }).join('') : `<div class="card"><div class="card-body"><div class="empty" style="text-align:center;padding:20px">🎯 목표를 추가해보세요!</div></div></div>`;
}

// 이벤트 위임
document.getElementById('goals-list').addEventListener('click', e => {
  const addBtn = e.target.closest('[data-addsub]');
  const delBtn = e.target.closest('[data-gdel]');
  const subBtn = e.target.closest('[data-gid][data-sid]');
  if (addBtn) addSubtask(addBtn.dataset.addsub);
  if (delBtn) delGoal(delBtn.dataset.gdel);
  if (subBtn) toggleSub(subBtn.dataset.gid, subBtn.dataset.sid);
});

export function openGoalModal() {
  document.getElementById('g-title').value = '';
  document.getElementById('g-desc').value = '';
  document.getElementById('g-dl').value = '';
  openModal('m-goal');
}

export function saveGoal() {
  const title = document.getElementById('g-title').value.trim();
  if (!title) { alert('목표를 입력해!'); return; }
  const item = {
    id: crypto.randomUUID(),
    title,
    desc: document.getElementById('g-desc').value.trim(),
    deadline: document.getElementById('g-dl').value,
    progress: 0,
    subtasks: []
  };
  store.set('goals', [...store.get('goals'), item]);
  api.upsert('goals', item);
  closeModal('m-goal'); renderGoals();
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
