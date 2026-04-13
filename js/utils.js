export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const wd = x.getDay();
  x.setDate(x.getDate() - (wd === 0 ? 6 : wd - 1));
  return x;
}

export function parseDate(ds) {
  if (!ds) return new Date('invalid');
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(ds))) return new Date(ds + 'T00:00:00');
  const d = new Date(ds);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dateStr(ds) {
  if (!ds) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(ds))) return String(ds).slice(0, 10);
  const d = new Date(ds);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysLeft(ds) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const due = parseDate(ds); due.setHours(0, 0, 0, 0);
  return Math.round((due - t) / 864e5);
}

export function fmtDate(ds) {
  const d = parseDate(ds);
  return `${d.getMonth() + 1}/${d.getDate()} (${['일','월','화','수','목','금','토'][d.getDay()]})`;
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

export function todayDayKey() {
  const d = new Date().getDay();
  return ['sun','mon','tue','wed','thu','fri','sat'][d];
}

export const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
export const DKR = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
export const ICONS = ['📚','🏃','💧','😴','🧘','✍️','🎵','💪','🍎','☕','📖','🎯','🖥️','🎨','🐾','🌱'];
export const AVATARS = ['🐱','🐶','🦊','🐧','🦁','🐻','🐼','🐨','🦋','⭐','🌸','🔮','🐸','🐯','🦄','🌙'];

// ── 마감 알림 기본 시작 권장일 (유형별) ──────────────────────────────
export const DEFAULT_LEAD = { video: 2, assignment: 4, exam: 7 };

/**
 * 과제 긴급도 계산
 * @returns 'overdue' | 'today' | 'warning' | 'soon' | 'ok' | 'done'
 *   overdue: 마감 지남    💀
 *   today:   오늘 마감    🔴
 *   warning: 시작해야 함  🟠  (남은 일수 ≤ lead/2)
 *   soon:    슬슬 시작    🟡  (남은 일수 ≤ lead)
 *   ok:      여유 있음    🟢
 */
export function taskUrgency(task, cfg) {
  if (task.done) return 'done';
  const dl = daysLeft(task.due);
  const lead = ((cfg && cfg.leadDays) || {})[task.type] ?? DEFAULT_LEAD[task.type] ?? 4;
  if (dl < 0)                      return 'overdue';
  if (dl === 0)                    return 'today';
  if (dl <= Math.ceil(lead / 2))   return 'warning';
  if (dl <= lead)                  return 'soon';
  return 'ok';
}
