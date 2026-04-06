import { store } from '../store.js';
import { todayStr, todayDayKey, parseDate, daysLeft, dateStr, esc } from '../utils.js';
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
      ? '<span class="badge badge-red">⚠️ 지남</span>'
      : dl === 0 ? '<span class="badge badge-red">오늘!</span>'
      : dl === 1 ? '<span class="badge badge-orange">내일</span>'
      : `<span class="badge badge-yellow">${dl}일</span>`;
    return `<div class="row">
      <button class="task-check-sm${t.done ? ' chk' : ''}" data-qid="${t.id}">✓</button>
      <div class="row-left">
        <div class="row-title${t.done ? ' crossed' : ''}">${esc(t.title)}</div>
        <div class="row-sub">${esc(t.subject || '과목 미입력')}</div>
      </div>${b}
    </div>`;
  }).join('') : '<div class="empty">곧 마감인 항목이 없어요 👍</div>';

  // 오늘 일정 (수업 + 이벤트)
  const evts = store.get('events').filter(e => dateStr(e.date) === ts);
  const todayDayIdx = new Date().getDay();
  const todayDayKey2 = ['sun','mon','tue','wed','thu','fri','sat'][todayDayIdx];
  const cls = store.get('classes').filter(c => c.day === todayDayKey2);
  const combined = [
    ...cls.map(c => ({ s: c.start || '', html: `<div class="row"><span class="badge" style="background:#6366f1;color:#fff;padding:2px 7px;border-radius:6px;font-size:.7rem;min-width:48px;text-align:center">${c.start || '?'}</span><span style="margin-left:10px;font-size:.85rem;font-weight:600">${esc(c.name)}</span><span style="margin-left:6px;font-size:.72rem;color:#94a3b8">${esc(c.room || '')}</span></div>` })),
    ...evts.map(e => ({ s: e.start || '', html: `<div class="row"><span class="badge badge-indigo" style="min-width:48px;text-align:center">${e.start || '종일'}</span><span style="margin-left:10px;font-size:.85rem">${esc(e.title)}</span></div>` }))
  ].sort((a, b) => a.s > b.s ? 1 : a.s < b.s ? -1 : 0);

  document.getElementById('home-sched').innerHTML = combined.length
    ? combined.map(x => x.html).join('')
    : '<div class="empty">오늘 일정이 없어요</div>';

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
      <button data-qhid="${h.id}" style="font-size:1.3rem;margin-right:10px">${done ? '✅' : '⬜'}</button>
      <span style="font-size:.85rem;${done ? 'text-decoration:line-through;color:#94a3b8' : ''}">${h.icon} ${esc(h.name)}</span>
    </div>`;
  }).join('') : '<div class="empty">오늘 설정된 습관이 없어요</div>';

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
  const tom = new Date(); tom.setDate(tom.getDate() + 1); tom.setHours(23, 59, 59);
  const urgent = tasks.filter(t => parseDate(t.due) <= tom).sort((a, b) => a.due > b.due ? 1 : -1);
  const habits = store.get('habits'), logs = store.get('habit_logs'), dk = todayDayKey();
  const todayH = habits.filter(h => Array.isArray(h.days) && h.days.includes(dk));
  const doneH = todayH.filter(h => logs.some(l => l.hid === h.id && l.date === ts));
  const nm = cfg.name ? cfg.name + '야, ' : '';
  const hi = hr < 12 ? `${nm}좋은 아침~` : hr < 18 ? `${nm}안녕` : hr < 22 ? `${nm}저녁이네` : `${nm}늦었는데`;

  const PICK = arr => arr[Math.floor(Math.random() * arr.length)];
  let msg;
  if (urgent.length) {
    const t = urgent[0], dl = daysLeft(t.due);
    msg = dl < 0 ? `"${t.title}" 마감 지났어. 어떻게 할 거야?`
        : dl === 0 ? `"${t.title}" 오늘 마감이잖아. 빨리.`
        : `"${t.title}" ${dl}일 남았어. 언제 할 거야?`;
  } else if (!tasks.length) {
    msg = PICK(['할 거 다 했어? 진짜?', '아무것도 없네. 넘 좋다.', '오늘 할 건 없네. 쉬어.']);
  } else {
    msg = PICK([`할 거 ${tasks.length}개 있어. 뭐부터 할 거야?`, '언제 할 거야, 나중에? 지금 하자.', `${tasks.length}개 쌓여있는 거 알지?`]);
  }

  document.getElementById('char-greeting').textContent = hi;
  document.getElementById('char-msg').textContent = msg;

  const lines = [msg];
  const leftH = todayH.length - doneH.length;
  if (leftH > 0) lines.push(`습관 ${leftH}개 아직 안 했어.`);
  else if (todayH.length) lines.push('오늘 습관 다 체크했네. 나쁘지 않아.');
  if (hr >= 22) lines.push('늦었잖아. 오늘 꺼 마무리하고 자.');
  document.getElementById('cp-msgs').innerHTML = lines.map(l => `<div class="char-msg">${esc(l)}</div>`).join('');
}
