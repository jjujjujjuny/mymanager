import { store } from './store.js';
import { dateStr } from './utils.js';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwWJ563ydzFxdtXS2L99AwlixvWrFek7NYhRv6EJWgZdaRBJwhG0HpuAnFwEMSoCZXhEw/exec';

export function showSync(state, detail) {
  const el = document.getElementById('sync-bar');
  const cfg = {
    loading: { text: '☁️ 동기화 중...', bg: '#6366f1', dur: 0 },
    ok:      { text: '✅ 동기화 완료',   bg: '#10b981', dur: 1500 },
    err:     { text: '⚠️ ' + (detail || '연결 실패'), bg: '#ef4444', dur: 5000 }
  }[state];
  if (!cfg) return;
  el.textContent = cfg.text;
  el.style.background = cfg.bg;
  el.style.display = 'block';
  if (cfg.dur) setTimeout(() => el.style.display = 'none', cfg.dur);
}

export async function loadAll() {
  showSync('loading');
  try {
    const r = await fetch(GAS_URL + '?action=getAll', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    const prevLogs = store.get('habit_logs');
    ['tasks','events','habits','habit_logs','goals','classes'].forEach(k => {
      store.set(k, Array.isArray(d[k]) ? d[k] : []);
    });
    // 로컬에서 아직 GAS에 반영 안 된 로그 보존
    const gasLogIds = new Set(store.get('habit_logs').map(l => String(l.id)));
    const merged = store.get('habit_logs');
    prevLogs.filter(l => !gasLogIds.has(String(l.id))).forEach(l => merged.push(l));
    store.set('habit_logs', merged);

    showSync('ok');
    // main.js의 renderAll을 순환 참조 없이 호출 (CustomEvent 방식)
    window.dispatchEvent(new CustomEvent('gas-loaded'));
  } catch (e) {
    console.error('동기화 실패:', e);
    showSync('err', e.message);
  }
}

async function post(payload) {
  try {
    const r = await fetch(GAS_URL, {
      method: 'POST',
      mode: 'cors',
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text || 'HTTP ' + r.status);
    try { return text ? JSON.parse(text) : {}; }
    catch { return { raw: text }; }
  } catch (e) {
    console.error('저장 실패:', e);
    showSync('err', '저장 실패');
    throw e;
  }
}

export const api = {
  upsert: (sheet, data) => post({ action: 'upsert', sheet, data }),
  remove: (sheet, id) => post({ action: 'delete', sheet, id }),
  removeWhere: (sheet, field, value) => post({ action: 'deleteWhere', sheet, field, value }),
  removeHabitLog: (hid, date) => post({ action: 'deleteHabitLog', hid, date })
};
