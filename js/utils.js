export function todayStr() {
  return new Date().toISOString().split('T')[0];
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
