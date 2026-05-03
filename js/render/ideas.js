import { store } from '../store.js';
import { api } from '../api.js';
import { esc } from '../utils.js';
import { openModal, closeModal } from '../main.js';

let editIdeaId = null;
let expandedIdeaId = null;

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

export function renderIdeas() {
  const ideas = [...store.get('ideas')].sort((a, b) =>
    (b.created_at || '') > (a.created_at || '') ? 1 : -1
  );
  const el = document.getElementById('ideas-list');
  if (!ideas.length) {
    el.innerHTML = `<div class="card"><div class="card-body"><div class="empty" style="text-align:center;padding:20px">아직 기록한 아이디어가 없어. 첫 번째를 남겨봐!</div></div></div>`;
    return;
  }
  el.innerHTML = ideas.map(item => {
    const isExp = expandedIdeaId === item.id;
    return `<div class="note-card${isExp ? ' note-expanded' : ''}" data-card-id="${item.id}">
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

document.getElementById('ideas-list').addEventListener('click', e => {
  const editId = e.target.closest('[data-edit]')?.dataset.edit;
  const delId  = e.target.closest('[data-del]')?.dataset.del;
  const cardEl = e.target.closest('[data-card-id]');
  if (editId) { e.stopPropagation(); openEditIdea(editId); return; }
  if (delId)  { e.stopPropagation(); delIdea(delId); return; }
  if (cardEl) {
    expandedIdeaId = expandedIdeaId === cardEl.dataset.cardId ? null : cardEl.dataset.cardId;
    renderIdeas();
  }
});

export function openIdeaModal() {
  editIdeaId = null;
  document.getElementById('m-idea-ttl').textContent = '아이디어 기록';
  document.getElementById('idea-title').value = '';
  document.getElementById('idea-content').value = '';
  openModal('m-idea');
}

function openEditIdea(id) {
  const item = store.get('ideas').find(x => x.id === id);
  if (!item) return;
  editIdeaId = id;
  document.getElementById('m-idea-ttl').textContent = '아이디어 수정';
  document.getElementById('idea-title').value = item.title || '';
  document.getElementById('idea-content').value = item.content || '';
  openModal('m-idea');
}

export function saveIdea() {
  const title   = document.getElementById('idea-title').value.trim();
  const content = document.getElementById('idea-content').value.trim();
  if (!title) { alert('제목은 필수야!'); return; }
  const now = new Date().toISOString();
  const ideas = store.get('ideas');
  let item;
  if (editIdeaId) {
    const i = ideas.findIndex(x => x.id === editIdeaId);
    if (i > -1) { ideas[i] = { ...ideas[i], title, content, updated_at: now }; item = ideas[i]; }
    store.set('ideas', ideas);
  } else {
    item = { id: crypto.randomUUID(), title, content, created_at: now, updated_at: '' };
    store.set('ideas', [...ideas, item]);
  }
  if (item) api.upsert('ideas', item);
  closeModal('m-idea');
  renderIdeas();
}

export function delIdea(id) {
  if (!confirm('삭제할까?')) return;
  if (expandedIdeaId === id) expandedIdeaId = null;
  store.set('ideas', store.get('ideas').filter(x => x.id !== id));
  api.remove('ideas', id);
  renderIdeas();
}
