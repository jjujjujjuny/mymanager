// Google Calendar - GAS 프록시 방식 (클라이언트 OAuth 불필요)
// GAS 스크립트가 계정 권한으로 직접 CalendarApp 호출
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwfsse6tSP254wEX54fWimge4oL_SfuF2qaTVugdCIm-xpa9A-d_l4664S5J1OiQiEOGw/exec';

export function isGcalAuthed() { return true; }
export function initGcal() {}
export function gcalLogin() {}
export function gcalLogout() {}

export async function fetchGcalEvents(startDateStr, endDateStr) {
  const start = new Date(startDateStr + 'T00:00:00').toISOString();
  const end   = new Date(endDateStr   + 'T23:59:59').toISOString();

  try {
    const r = await fetch(`${GAS_URL}?action=calEvents&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
      cache: 'no-store'
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (data.error) { console.error('GCal GAS error:', data.error); return []; }
    return data;
  } catch (e) {
    console.error('GCal fetch error:', e);
    return [];
  }
}
