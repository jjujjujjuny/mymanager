// Google Calendar API integration via Google Identity Services (GIS)
const GCAL_CLIENT_ID = '329064543871-mgc2uhh8aeu9da186l661a4lv7lqnvf3.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let everAuthed = false; // 한 번이라도 동의한 적 있는지

function loadStoredToken() {
  try {
    const s = localStorage.getItem('gcal_token');
    if (!s) return;
    const { token, expiry } = JSON.parse(s);
    if (Date.now() < expiry) {
      accessToken = token;
      tokenExpiry = expiry;
    }
    everAuthed = true; // 저장된 토큰이 있으면 과거에 동의한 것
  } catch { /* ignore */ }
}

export function isGcalAuthed() {
  return !!accessToken && Date.now() < tokenExpiry;
}

export function initGcal() {
  loadStoredToken();
  if (tryInitTokenClient()) {
    // 이전에 동의했고 토큰이 만료됐으면 자동 silent re-auth 시도
    if (everAuthed && !isGcalAuthed()) {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  } else {
    // GIS 라이브러리가 아직 안 로드됐으면 로드 완료 후 재시도
    window.addEventListener('google-identity-loaded', () => {
      if (tryInitTokenClient() && everAuthed && !isGcalAuthed()) {
        tokenClient.requestAccessToken({ prompt: '' });
      }
    }, { once: true });
  }
}

function tryInitTokenClient() {
  if (!window.google?.accounts?.oauth2) return false;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GCAL_CLIENT_ID,
    scope: SCOPES,
    callback: handleToken
  });
  return true;
}

function handleToken(resp) {
  if (resp.error) { console.error('GCal auth error:', resp.error); return; }
  accessToken = resp.access_token;
  tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
  localStorage.setItem('gcal_token', JSON.stringify({ token: accessToken, expiry: tokenExpiry }));
  window.dispatchEvent(new CustomEvent('gcal-authed'));
}

export function gcalLogin() {
  if (!window.google?.accounts?.oauth2) {
    alert('Google 라이브러리가 아직 로드되지 않았어요. 잠시 후 다시 시도해주세요.');
    return;
  }
  if (!tokenClient) {
    if (!tryInitTokenClient()) return;
  }
  tokenClient.requestAccessToken({ prompt: isGcalAuthed() ? '' : 'consent' });
}

export function gcalLogout() {
  if (accessToken && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  tokenExpiry = 0;
  localStorage.removeItem('gcal_token');
  window.dispatchEvent(new CustomEvent('gcal-authed'));
}

export async function fetchGcalEvents(startDateStr, endDateStr) {
  if (!isGcalAuthed()) return null; // null = not authed

  const timeMin = new Date(startDateStr + 'T00:00:00').toISOString();
  const timeMax = new Date(endDateStr + 'T23:59:59').toISOString();

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '100');

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (r.status === 401) {
      accessToken = null;
      tokenExpiry = 0;
      localStorage.removeItem('gcal_token');
      // 이전에 동의한 적 있으면 silent re-auth 시도
      if (everAuthed && tokenClient) {
        tokenClient.requestAccessToken({ prompt: '' });
      } else {
        window.dispatchEvent(new CustomEvent('gcal-authed'));
      }
      return null;
    }

    if (!r.ok) return [];

    const data = await r.json();
    return (data.items || []).map(item => {
      const startRaw = item.start.dateTime || item.start.date || '';
      const endRaw   = item.end?.dateTime  || item.end?.date  || '';
      return {
        id:     'gcal_' + item.id,
        title:  item.summary || '(제목 없음)',
        date:   startRaw.substring(0, 10),
        start:  item.start.dateTime ? startRaw.substring(11, 16) : '',
        end:    item.end?.dateTime  ? endRaw.substring(11, 16)   : '',
        desc:   item.description || '',
        isGcal: true
      };
    });
  } catch (e) {
    console.error('GCal fetch error:', e);
    return [];
  }
}
