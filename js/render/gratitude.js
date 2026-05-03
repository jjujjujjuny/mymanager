import { store } from '../store.js';
import { api } from '../api.js';
import { esc } from '../utils.js';
import { openModal, closeModal } from '../main.js';

let editGratId = null;
let expandedGratId = null;

const SVG_EDIT  = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
const SVG_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${yy}.${mm}.${dd} ${hh}:${mn}`;
}

export function renderGratitude() {
  const items = [...store.get('gratitude')].sort((a, b) =>
    (b.created_at || '') > (a.created_at || '') ? 1 : -1
  );
  const el = document.getElementById('gratitude-list');
  if (!items.length) {
    el.innerHTML = `<div class="card"><div class="card-body"><div class="empty" style="text-align:center;padding:20px">아직 기록이 없어. 오늘의 감사함을 남겨봐!</div></div></div>`;
    return;
  }
  el.innerHTML = items.map(item => {
    const isExp = expandedGratId === item.id;
    return `<div class="note-card note-card--grat${isExp ? ' note-expanded' : ''}" data-card-id="${item.id}">
      <div class="note-header">
        <div class="note-title">${esc(item.title)}</div>
        <div class="task-actions">
          <button class="act-btn" data-edit="${item.id}">${SVG_EDIT}</button>
          <button class="act-btn" data-del="${item.id}">${SVG_TRASH}</button>
        </div>
      </div>
      <div class="note-date">${fmtTs(item.created_at)}</div>
      ${isExp ? `<div class="note-detail">
        <div class="note-content">${esc(item.content || '').replace(/\n/g, '<br>')}</div>
        ${item.updated_at ? `<div class="note-updated">수정됨: ${fmtTs(item.updated_at)}</div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
}

document.getElementById('gratitude-list').addEventListener('click', e => {
  const editId = e.target.closest('[data-edit]')?.dataset.edit;
  const delId  = e.target.closest('[data-del]')?.dataset.del;
  const cardEl = e.target.closest('[data-card-id]');
  if (editId) { e.stopPropagation(); openEditGrat(editId); return; }
  if (delId)  { e.stopPropagation(); delGrat(delId); return; }
  if (cardEl) {
    expandedGratId = expandedGratId === cardEl.dataset.cardId ? null : cardEl.dataset.cardId;
    renderGratitude();
  }
});

export function openGratitudeModal() {
  editGratId = null;
  const now = new Date();
  const yy = now.getFullYear(), mm = String(now.getMonth()+1).padStart(2,'0'), dd = String(now.getDate()).padStart(2,'0');
  document.getElementById('m-grat-ttl').textContent = '마음수양 기록';
  document.getElementById('grat-title').value = `${yy}-${mm}-${dd} 기록`;
  document.getElementById('grat-content').value = '';
  openModal('m-grat');
}

function openEditGrat(id) {
  const item = store.get('gratitude').find(x => x.id === id);
  if (!item) return;
  editGratId = id;
  document.getElementById('m-grat-ttl').textContent = '마음수양 수정';
  document.getElementById('grat-title').value = item.title || '';
  document.getElementById('grat-content').value = item.content || '';
  openModal('m-grat');
}

export function saveGratitude() {
  const title   = document.getElementById('grat-title').value.trim();
  const content = document.getElementById('grat-content').value.trim();
  if (!title) { alert('제목은 필수야!'); return; }
  const now = new Date().toISOString();
  const items = store.get('gratitude');
  let item;
  if (editGratId) {
    const i = items.findIndex(x => x.id === editGratId);
    if (i > -1) { items[i] = { ...items[i], title, content, updated_at: now }; item = items[i]; }
    store.set('gratitude', items);
  } else {
    item = { id: crypto.randomUUID(), title, content, created_at: now, updated_at: '' };
    store.set('gratitude', [...items, item]);
  }
  if (item) api.upsert('gratitude', item);
  closeModal('m-grat');
  renderGratitude();
}

export function delGrat(id) {
  if (!confirm('삭제할까?')) return;
  if (expandedGratId === id) expandedGratId = null;
  store.set('gratitude', store.get('gratitude').filter(x => x.id !== id));
  api.remove('gratitude', id);
  renderGratitude();
}
