import { store } from '../store.js';
import { todayStr, todayDayKey, parseDate, daysLeft, dateStr, esc, taskUrgency } from '../utils.js';
import { getTodayIdiom, isIdiomDoneToday, markIdiomDone } from '../idioms.js';
import { toggleHabitLog } from './habits.js';
import { toggleTask } from './tasks.js';
import { renderHabits } from './habits.js';
import { renderTasks } from './tasks.js';

export function renderHome() {
  const tasks = store.get('tasks'), ts = todayStr();
  const pending = tasks.filter(t => !t.done);
  const in3 = new Date(); in3.setDate(in3.getDate() + 3); in3.setHours(23, 59, 59);
  const urgent = pending.filter(t => parseDate(t.due) <= in3).sort((a, b) => a.due > b.due ? 1 : -1);

  document.getElementById('st-tasks').textContent = pending.length;
  document.getElementById('st-urgent').textContent = urgent.length;

  const uel = document.getElementById('home-urgent');
  uel.innerHTML = urgent.length ? urgent.slice(0, 3).map(t => {
    const dl = daysLeft(t.due);
    const b = dl < 0
      ? '<span class="badge badge-red">지남</span>'
      : dl === 0 ? '<span class="badge badge-red">오늘</span>'
      : dl === 1 ? '<span class="badge badge-orange">내일</span>'
      : `<span class="badge badge-yellow">${dl}일</span>`;
    return `<div class="row">
      <button class="task-check-sm${t.done ? ' chk' : ''}" data-qid="${t.id}">✓</button>
      <div class="row-left">
        <div class="row-title${t.done ? ' crossed' : ''}">${esc(t.title)}</div>
        <div class="row-sub">${esc(t.subject || '과목 미입력')}</div>
      </div>${b}
    </div>`;
  }).join('') : '<div class="empty">곧 마감인 항목이 없습니다</div>';

  // 오늘 일정 (수업 + 이벤트)
  const evts = store.get('events').filter(e => dateStr(e.date) === ts);
  const todayDayIdx = new Date().getDay();
  const todayDayKey2 = ['sun','mon','tue','wed','thu','fri','sat'][todayDayIdx];
  const cls = store.get('classes').filter(c => c.day === todayDayKey2);
  const combined = [
    ...cls.map(c => ({ s: c.start || '', html: `<div class="event-item"><span class="event-time cls">${c.start || '?'}</span><span class="event-title">${esc(c.name)}</span><span class="event-room">${esc(c.room || '')}</span></div>` })),
    ...evts.map(e => ({ s: e.start || '', html: `<div class="event-item"><span class="event-time${e.start ? '' : ' allday'}">${e.start || '종일'}</span><span class="event-title">${esc(e.title)}</span></div>` }))
  ].sort((a, b) => a.s > b.s ? 1 : a.s < b.s ? -1 : 0);

  document.getElementById('home-sched').innerHTML = combined.length
    ? combined.map(x => x.html).join('')
    : '<div class="empty">오늘 일정이 없습니다</div>';

  // 오늘 습관
  const habits = store.get('habits'), logs = store.get('habit_logs'), dk = todayDayKey();
  const todayH = habits.filter(h => Array.isArray(h.days) && h.days.includes(dk));
  const doneH = todayH.filter(h => logs.some(l => l.hid === h.id && l.date === ts));
  const pct = todayH.length ? Math.round(doneH.length / todayH.length * 100) : 0;
  document.getElementById('st-habit').textContent = pct + '%';

  const hel = document.getElementById('home-habits');
  hel.innerHTML = todayH.length ? todayH.map(h => {
    const done = logs.some(l => l.hid === h.id && l.date === ts);
    return `<div class="row">
      <button class="habit-check${done ? ' done-chk' : ''}" data-qhid="${h.id}">✓</button>
      <span style="font-size:13px;font-weight:500;${done ? 'text-decoration:line-through;color:#94a3b8' : 'color:#0f172a'}">${esc(h.name)}</span>
    </div>`;
  }).join('') : '<div class="empty">오늘 설정된 습관이 없습니다</div>';

  renderIdiom();
  updateCharMsg();
}

export function renderIdiom() {
  const idiom = getTodayIdiom();
  document.getElementById('idiom-en').textContent = idiom.en;
  document.getElementById('idiom-kr').textContent = idiom.kr;
  document.getElementById('idiom-ex').textContent = '"' + idiom.ex + '"';

  const done = isIdiomDoneToday();
  document.getElementById('idiom-reveal').style.display  = done ? '' : 'none';
  document.getElementById('idiom-show-btn').style.display = done ? 'none' : '';
  document.getElementById('idiom-done-btn').style.display = done ? 'none' : 'none'; // 뜻 보기 후 표시
  document.getElementById('idiom-checked').style.display = done ? '' : 'none';
}

export function idiomReveal() {
  document.getElementById('idiom-reveal').style.display   = '';
  document.getElementById('idiom-show-btn').style.display = 'none';
  document.getElementById('idiom-done-btn').style.display = '';
}

export function idiomDone() {
  markIdiomDone();
  renderIdiom();
  updateCharMsg();
}

// 홈 이벤트 위임 (동적 버튼 처리)
document.getElementById('home-urgent').addEventListener('click', e => {
  const btn = e.target.closest('[data-qid]');
  if (btn) { toggleTask(btn.dataset.qid); }
});
document.getElementById('home-habits').addEventListener('click', async e => {
  const btn = e.target.closest('[data-qhid]');
  if (btn) { await toggleHabitLog(btn.dataset.qhid); renderHabits(); renderHome(); }
});

export function updateCharMsg() {
  const cfg = store.cfg();
  const tasks = store.get('tasks').filter(t => !t.done);
  const now = new Date(), hr = now.getHours();
  const ts = todayStr();
  const habits = store.get('habits'), logs = store.get('habit_logs'), dk = todayDayKey();
  const todayH = habits.filter(h => Array.isArray(h.days) && h.days.includes(dk));
  const doneH = todayH.filter(h => logs.some(l => l.hid === h.id && l.date === ts));
  const nm = cfg.name ? cfg.name + '야, ' : '';
  const hi = hr < 12 ? `${nm}좋은 아침~` : hr < 18 ? `${nm}안녕` : hr < 22 ? `${nm}저녁이네` : `${nm}늦었는데`;

  const PICK = arr => arr[Math.floor(Math.random() * arr.length)];

  // 긴급도별 분류
  const byUrgency = { overdue: [], today: [], warning: [], soon: [], ok: [] };
  tasks.forEach(t => {
    const u = taskUrgency(t, cfg);
    if (byUrgency[u]) byUrgency[u].push(t);
  });
  byUrgency.overdue.sort((a, b) => a.due > b.due ? 1 : -1);
  byUrgency.today.sort((a, b) => a.due > b.due ? 1 : -1);
  byUrgency.warning.sort((a, b) => a.due > b.due ? 1 : -1);
  byUrgency.soon.sort((a, b) => a.due > b.due ? 1 : -1);

  let msg;
  if (byUrgency.overdue.length) {
    const t = byUrgency.overdue[0];
    msg = PICK([`"${t.title}" 마감 지났어. 어떻게 할 거야?`, `"${t.title}" 이미 마감이야. 교수님께 연락해봐.`]);
  } else if (byUrgency.today.length) {
    const t = byUrgency.today[0];
    msg = PICK([`"${t.title}" 오늘 마감이잖아. 지금 당장.`, `"${t.title}" 오늘까지야. 딴 거 하지 마.`]);
  } else if (byUrgency.warning.length) {
    const t = byUrgency.warning[0], dl = daysLeft(t.due);
    msg = PICK([`"${t.title}" ${dl}일 남았어. 오늘 시작해야 해.`, `"${t.title}" 슬슬 손대야 할 때야. ${dl}일밖에 없어.`]);
  } else if (byUrgency.soon.length) {
    const t = byUrgency.soon[0], dl = daysLeft(t.due);
    msg = PICK([`"${t.title}" ${dl}일 남았어. 미리 시작해두면 좋아.`, `"${t.title}" 아직 ${dl}일 있어. 지금 조금씩 하자.`]);
  } else if (!tasks.length) {
    msg = PICK(['할 거 다 했어? 진짜?', '아무것도 없네. 넘 좋다.', '오늘 할 건 없네. 쉬어.']);
  } else {
    msg = PICK([`할 거 ${tasks.length}개 있어. 뭐부터 할 거야?`, '언제 할 거야, 나중에? 지금 하자.', `${tasks.length}개 쌓여있는 거 알지?`]);
  }

  document.getElementById('char-greeting').textContent = hi;
  document.getElementById('char-msg').textContent = msg;

  const lines = [msg];
  // 경고 이상 항목 추가 멘트
  const critCount = byUrgency.overdue.length + byUrgency.today.length + byUrgency.warning.length;
  if (critCount > 1) lines.push(`긴급/경고 항목 ${critCount}개야. 우선순위 확인해.`);
  const leftH = todayH.length - doneH.length;
  if (leftH > 0) lines.push(`습관 ${leftH}개 아직 안 했어.`);
  else if (todayH.length) lines.push('오늘 습관 다 체크했네. 나쁘지 않아.');
  if (hr >= 22) lines.push('늦었잖아. 오늘 꺼 마무리하고 자.');
  document.getElementById('cp-msgs').innerHTML = lines.map(l => `<div class="char-msg">${esc(l)}</div>`).join('');
}
