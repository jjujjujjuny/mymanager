import { store } from './store.js';
import { loadAll } from './api.js';
import { todayStr, AVATARS, esc } from './utils.js';
import { renderHome, updateCharMsg, idiomReveal, idiomDone } from './render/home.js';
import { renderTasks, setFilter, openTaskModal, saveTask } from './render/tasks.js';
import { renderWeek, shiftWeek, openEventModal, saveEvent } from './render/schedule.js';
import { renderHabits, openHabitModal, saveHabit } from './render/habits.js';
import { renderGoals, openGoalModal, saveGoal } from './render/goals.js';
import { renderTimetable } from './render/timetable.js';
import { renderStudyPlan, openStudyPlanModal, saveStudyPlan, toggleStudyDone, deleteStudyPlan } from './render/studyplan.js';

// ===== 전역 노출 (HTML onclick 속성에서 호출) =====
window.switchTab      = switchTab;
window.shiftWeek      = shiftWeek;
window.openTaskModal  = openTaskModal;
window.saveTask       = saveTask;
window.setFilter      = setFilter;
window.openEventModal = openEventModal;
window.saveEvent      = saveEvent;
window.openHabitModal = openHabitModal;
window.saveHabit      = saveHabit;
window.openGoalModal  = openGoalModal;
window.saveGoal       = saveGoal;
window.closeModal         = closeModal;
window.openStudyPlanModal = openStudyPlanModal;
window.saveStudyPlan      = saveStudyPlan;
window.toggleStudyDone    = toggleStudyDone;
window.deleteStudyPlan    = deleteStudyPlan;
window.idiomReveal    = idiomReveal;
window.idiomDone      = idiomDone;
window.openSettings   = openSettings;
window.saveSettings   = saveSettings;
window.openImport     = openImport;
window.doImport       = doImport;
window.doExport       = doExport;
window.toggleChar     = toggleChar;
window.closeChar      = closeChar;
window.loadAll        = loadAll;

// ===== 렌더 전체 =====
export function renderAll() {
  renderHome(); renderTasks(); renderWeek(); renderHabits(); renderGoals(); renderTimetable(); renderStudyPlan();
}

// ===== 탭 전환 =====
function switchTab(tab) {
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('show'));
  document.getElementById('page-' + tab).classList.add('show');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'schedule') renderWeek();
  if (tab === 'timetable') renderTimetable();
}

// ===== 모달 =====
export function openModal(id) { document.getElementById(id).classList.add('open'); }
export function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-bg').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); })
);

// ===== 설정 =====
let selAvatar = '🐱';

function openSettings() {
  const cfg = store.cfg();
  document.getElementById('s-name').value = cfg.name || '';
  document.getElementById('s-char').value = cfg.charName || '';
  selAvatar = cfg.avatar || '🐱';
  const lead = cfg.leadDays || {};
  document.getElementById('s-lead-video').value  = lead.video      ?? 2;
  document.getElementById('s-lead-assign').value = lead.assignment ?? 4;
  document.getElementById('s-lead-exam').value   = lead.exam       ?? 7;
  buildAvatarGrid();
  openModal('m-settings');
}

function buildAvatarGrid() {
  document.getElementById('avatar-grid').innerHTML = AVATARS.map(a =>
    `<button type="button" class="pick-btn${a === selAvatar ? ' sel' : ''}" data-av="${a}">${a}</button>`
  ).join('');
}

document.getElementById('avatar-grid').addEventListener('click', e => {
  const btn = e.target.closest('[data-av]');
  if (!btn) return;
  selAvatar = btn.dataset.av;
  document.querySelectorAll('#avatar-grid .pick-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
});

function saveSettings() {
  const cfg = {
    name: document.getElementById('s-name').value.trim(),
    charName: document.getElementById('s-char').value.trim() || '비서',
    avatar: selAvatar,
    leadDays: {
      video:      Math.max(1, parseInt(document.getElementById('s-lead-video').value)  || 2),
      assignment: Math.max(1, parseInt(document.getElementById('s-lead-assign').value) || 4),
      exam:       Math.max(1, parseInt(document.getElementById('s-lead-exam').value)   || 7),
    }
  };
  store.saveCfg(cfg);
  applySettings(cfg);
  closeModal('m-settings');
  updateCharMsg();
}

function applySettings(cfg) {
  const av = cfg.avatar || '🐱', nm = cfg.charName || '비서';
  ['hdr-av','char-av','char-fab','cp-av'].forEach(id => document.getElementById(id).textContent = av);
  document.getElementById('cp-name').textContent = nm;
}

// ===== 가져오기/내보내기 =====
function openImport() {
  document.getElementById('import-json').value = '';
  document.getElementById('import-msg').style.display = 'none';
  document.getElementById('export-ok').style.display = 'none';
  openModal('m-import');
}

function doImport() {
  const raw = document.getElementById('import-json').value.trim();
  if (!raw) { showIM('아무것도 없는데?', '#dc2626'); return; }
  let data;
  try { data = JSON.parse(raw); } catch { showIM('JSON 형식이 잘못됐어.', '#dc2626'); return; }

  const { api } = window._api || {};
  let added = 0;
  ['tasks','events','habits','habit_logs','goals','classes','study_plans'].forEach(k => {
    if (!Array.isArray(data[k])) return;
    const ex = store.get(k), ids = new Set(ex.map(x => x.id));
    const nw = data[k].filter(x => !ids.has(x.id));
    nw.forEach(item => { if (!item.id) item.id = crypto.randomUUID(); });
    added += nw.length;
    store.set(k, [...ex, ...nw]);
    // 동적 import로 api 사용
    import('./api.js').then(({ api }) => nw.forEach(item => api.upsert(k, item)));
  });
  if (data.cfg) { store.saveCfg({ ...store.cfg(), ...data.cfg }); applySettings(store.cfg()); }
  renderAll();
  showIM(`완료! ${added}개 추가됐어 ✅`, '#10b981');
  setTimeout(() => closeModal('m-import'), 1800);
}

function showIM(txt, color) {
  const el = document.getElementById('import-msg');
  el.textContent = txt; el.style.color = color; el.style.display = 'block';
}

function doExport() {
  const data = {
    tasks: store.get('tasks'), events: store.get('events'),
    habits: store.get('habits'), habit_logs: store.get('habit_logs'),
    goals: store.get('goals'), classes: store.get('classes'),
    study_plans: store.get('study_plans')
  };
  const json = JSON.stringify(data, null, 2);
  navigator.clipboard.writeText(json).catch(() => {
    const ta = document.getElementById('import-json');
    ta.value = json; ta.select(); document.execCommand('copy');
  });
  document.getElementById('export-ok').style.display = 'block';
  setTimeout(() => document.getElementById('export-ok').style.display = 'none', 2500);
}

// ===== 캐릭터 =====
let charOpen = false;

function toggleChar() { charOpen ? closeChar() : openChar(); }
function openChar() {
  charOpen = true;
  updateCharMsg();
  document.getElementById('char-panel').style.display = 'block';
}
function closeChar() {
  charOpen = false;
  document.getElementById('char-panel').style.display = 'none';
}

// ===== 초기화 =====
function init() {
  const now = new Date();
  const wkn = ['일','월','화','수','목','금','토'];
  document.getElementById('hdr-date').textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${wkn[now.getDay()]})`;
  document.getElementById('habit-today-date').textContent = `${now.getMonth() + 1}월 ${now.getDate()}일`;
  document.getElementById('t-due').value = todayStr();
  document.getElementById('e-date').value = todayStr();

  const cfg = store.cfg();
  selAvatar = cfg.avatar || '🐱';
  applySettings(cfg);

  renderAll();
  // GAS 로드 완료 시 renderAll (api.js → main.js 순환 참조 방지)
  window.addEventListener('gas-loaded', renderAll);
  loadAll();
  setInterval(loadAll, 180000); // 3분마다 자동 동기화
}

init();
