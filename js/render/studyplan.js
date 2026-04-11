import { store } from '../store.js';
import { api } from '../api.js';
import { todayStr, fmtDate, esc } from '../utils.js';
import { openModal, closeModal } from '../main.js';

let editPlanId = null;

const WD = ['일','월','화','수','목','금','토'];

function dateLabelFull(ds) {
  const today = todayStr();
  const d = new Date(ds + 'T00:00:00');
  const base = `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`;
  if (ds === today) return `오늘 · ${base}`;
  const diff = Math.round((new Date(ds + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5);
  if (diff === 1) return `내일 · ${base}`;
  if (diff > 1)   return `D-${diff} · ${base}`;
  return `${Math.abs(diff)}일 전 · ${base}`;
}

export function renderStudyPlan() {
  const el = document.getElementById('studyplan-list');
  const plans = store.get('study_plans');
  const today = todayStr();

  if (!plans.length) {
    el.innerHTML = `<div class="card"><div class="card-body"><div class="empty" style="text-align:center;padding:20px">아직 공부 플랜이 없어. 추가해봐!</div></div></div>`;
    return;
  }

  // 날짜별 그룹핑
  const groups = {};
  plans.forEach(p => {
    const d = String(p.date).slice(0, 10);
    if (!groups[d]) groups[d] = [];
    groups[d].push(p);
  });

  // 오늘 이전 날짜도 포함해 정렬 (과거는 dim 처리)
  const dates = Object.keys(groups).sort();

  el.innerHTML = dates.map(date => {
    const isPast = date < today;
    const isToday = date === today;
    const items = groups[date];

    const itemsHtml = items.map(p => `
      <div class="study-item${p.done ? ' done' : ''}">
        <div class="study-item-main">
          <div class="study-item-info">
            <span class="study-subject">${esc(p.subject)}</span>
            ${p.duration ? `<span class="study-duration">⏱ ${esc(p.duration)}</span>` : ''}
          </div>
          <div class="study-item-actions">
            <button class="study-check${p.done ? ' chk' : ''}" data-spid="${p.id}" title="${p.done ? '완료 취소' : '완료'}">✓</button>
            <button class="act-btn" data-spedit="${p.id}">✏️</button>
            <button class="act-btn" data-spdel="${p.id}">🗑️</button>
          </div>
        </div>
        ${p.content ? `<div class="study-content">${esc(p.content)}</div>` : ''}
        ${p.done ? `<div class="study-done-badge">✅ 완료</div>` : ''}
      </div>
    `).join('');

    return `
      <div class="study-day-block${isPast ? ' past' : ''}">
        <div class="study-day-header${isToday ? ' today' : ''}">
          ${dateLabelFull(date)}
        </div>
        <div class="study-day-items">${itemsHtml}</div>
      </div>
    `;
  }).join('');

  // 이벤트 위임
  el.querySelectorAll('[data-spid]').forEach(btn =>
    btn.addEventListener('click', () => toggleStudyDone(btn.dataset.spid))
  );
  el.querySelectorAll('[data-spdel]').forEach(btn =>
    btn.addEventListener('click', () => deleteStudyPlan(btn.dataset.spdel))
  );
  el.querySelectorAll('[data-spedit]').forEach(btn =>
    btn.addEventListener('click', () => openStudyPlanModal(null, btn.dataset.spedit))
  );
}

export function openStudyPlanModal(date, editId) {
  editPlanId = editId || null;
  const plan = editId ? store.get('study_plans').find(p => p.id === editId) : null;

  document.getElementById('sp-date').value    = plan ? String(plan.date).slice(0, 10) : (date || todayStr());
  document.getElementById('sp-subject').value = plan ? (plan.subject || '') : '';
  document.getElementById('sp-content').value = plan ? (plan.content || '') : '';
  document.getElementById('sp-duration').value = plan ? (plan.duration || '') : '';
  document.getElementById('m-studyplan-ttl').textContent = plan ? '공부 플랜 수정' : '공부 플랜 추가';
  openModal('m-studyplan');
}

export function saveStudyPlan() {
  const date    = document.getElementById('sp-date').value;
  const subject = document.getElementById('sp-subject').value.trim();
  if (!date || !subject) { alert('날짜와 과목은 필수야!'); return; }

  const plan = {
    id:       editPlanId || crypto.randomUUID(),
    date,
    subject,
    content:  document.getElementById('sp-content').value.trim(),
    duration: document.getElementById('sp-duration').value.trim(),
    done:     false
  };

  if (editPlanId) {
    const existing = store.get('study_plans').find(p => p.id === editPlanId);
    if (existing) plan.done = existing.done;
  }

  const all = store.get('study_plans').filter(p => p.id !== plan.id);
  store.set('study_plans', [...all, plan]);
  api.upsert('study_plans', plan);

  editPlanId = null;
  closeModal('m-studyplan');
  renderStudyPlan();
}

export function toggleStudyDone(id) {
  const plans = store.get('study_plans');
  const plan = plans.find(p => p.id === id);
  if (!plan) return;
  plan.done = !plan.done;
  store.set('study_plans', plans);
  api.upsert('study_plans', plan);
  renderStudyPlan();
}

export function deleteStudyPlan(id) {
  if (!confirm('이 공부 플랜을 삭제할까?')) return;
  store.set('study_plans', store.get('study_plans').filter(p => p.id !== id));
  api.remove('study_plans', id);
  renderStudyPlan();
}
