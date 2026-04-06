// ============================================================
// 현준의 일정관리 앱 - Google Apps Script 백엔드 코드
// Google Sheets Web App으로 배포하세요
// ============================================================

// ⚠️ 본인의 Google Spreadsheet ID로 교체하세요
// (스프레드시트 URL에서 /d/XXXX/edit 의 XXXX 부분)
const SPREADSHEET_ID = '1uiv-MYcc5bnWR-RNTt31YA8JOas2WOpEmoQW_e9jqbI';

// 사용할 시트 이름 목록
const SHEETS = ['tasks', 'events', 'habits', 'habit_logs', 'goals', 'classes'];

function testClasses() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const data = readSheet(ss, 'classes');
  Logger.log('rows: ' + data.length);
  Logger.log(JSON.stringify(data[0]));
}


// ============================================================
// GET 요청 처리 (데이터 읽기)
// ============================================================
function doGet(e) {
  try {
    const action = e.parameter.action || '';

    if (action === 'getAll') {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const result = {};

      SHEETS.forEach(name => {
        result[name] = readSheet(ss, name);
      });

      return jsonResponse(result);
    }

    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ============================================================
// POST 요청 처리 (데이터 쓰기/삭제)
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, sheet, data, id, field, value, hid, date } = body;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    switch (action) {
      case 'upsert':
        upsertRow(ss, sheet, data);
        break;
      case 'delete':
        deleteRowById(ss, sheet, id);
        break;
      case 'deleteWhere':
        // field 컬럼 값이 value와 일치하는 모든 행 삭제
        deleteRowsByField(ss, sheet, field, value);
        break;
      case 'deleteHabitLog':
        // hid + date 조합으로 습관 로그 삭제
        deleteHabitLog(ss, hid, date);
        break;
      default:
        return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ============================================================
// 헬퍼 함수들
// ============================================================

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 시트에서 전체 데이터 읽기
function readSheet(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const rows = allData.slice(1);

  return rows
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = parseValue(h, row[i]);
      });
      return obj;
    })
    .filter(row => row.id !== '' && row.id !== null && row.id !== undefined);
}

// 값 파싱: Date 객체, JSON 배열/객체, boolean 처리
function parseValue(key, val) {
  if (val === '' || val === null || val === undefined) return val;

  // Date 객체 처리 (날짜 및 시간 포함)
  if (val instanceof Date && !isNaN(val.getTime())) {
    // 1. 시간 형식 (시:분) 처리
    // 스프레드시트 시간 셀은 보통 1899-12-30 또는 1970-01-01 기준임
    const y = val.getFullYear();
    if (y <= 1970) {
      const hh = String(val.getHours()).padStart(2, '0');
      const mm = String(val.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    // 2. 날짜 형식 (년-월-일) 처리
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
// ★ 한국어 시간 형식 처리 (오전/오후 HH:MM:SS → HH:MM)
if (typeof val === 'string') {
  const kr = val.match(/(오전|오후)\s+(\d+):(\d+)/);
  if (kr) {
    let h = +kr[2];
    if (kr[1] === '오후' && h < 12) h += 12;
    if (kr[1] === '오전' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${kr[3].padStart(2,'0')}`;
  }
}
  // 나머지 로직 유지
  if (key === 'id' || key === 'hid') return String(val);
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  
  // JSON 배열/객체 (days, subtasks 등)
  if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
    try { return JSON.parse(val); } catch(e) { return val; }
  }

  return val;
}

// 값을 시트에 저장할 형태로 변환
function serializeValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val); // arrays, objects → JSON string
  return val; // string, number, boolean 그대로
}

// 데이터 upsert (id 기준으로 있으면 업데이트, 없으면 추가)
function upsertRow(ss, sheetName, data) {
  let sheet = ss.getSheetByName(sheetName);

  // 시트가 없으면 새로 생성
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const dataId = String(data.id);

  // 헤더 가져오기 또는 생성
  let headers;
  if (sheet.getLastRow() === 0) {
    headers = Object.keys(data);
    sheet.appendRow(headers);
  } else {
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // 새 컬럼이 있으면 헤더에 추가
    Object.keys(data).forEach(key => {
      if (!headers.includes(key)) {
        headers.push(key);
        sheet.getRange(1, headers.length).setValue(key);
      }
    });
  }

  // 행 데이터 구성
  const rowData = headers.map(h => serializeValue(data[h]));

  // 기존 행 탐색
  if (sheet.getLastRow() > 1) {
    const idColIdx = headers.indexOf('id');
    if (idColIdx >= 0) {
      const existingIds = sheet
        .getRange(2, idColIdx + 1, sheet.getLastRow() - 1, 1)
        .getValues()
        .flat()
        .map(String);

      const rowIdx = existingIds.indexOf(dataId);
      if (rowIdx >= 0) {
        // LearnUS 자동수집 항목(ln_ 접두사)은 사용자가 완료 처리한 경우 done 값을 보존
        if (String(dataId).startsWith('ln_')) {
          const doneColIdx = headers.indexOf('done');
          if (doneColIdx >= 0) {
            const existingDone = sheet.getRange(rowIdx + 2, doneColIdx + 1).getValue();
            if (existingDone === true || existingDone === 'true') {
              rowData[doneColIdx] = true; // 완료 상태 유지
            }
          }
        }
        // 기존 행 업데이트
        sheet.getRange(rowIdx + 2, 1, 1, rowData.length).setValues([rowData]);
        return;
      }
    }
  }

  // 새 행 추가
  sheet.appendRow(rowData);
}

// id로 행 삭제
function deleteRowById(ss, sheetName, id) {
  deleteRowsByField(ss, sheetName, 'id', String(id));
}

// 특정 필드가 특정 값인 모든 행 삭제
function deleteRowsByField(ss, sheetName, field, value) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIdx = headers.indexOf(field);
  if (colIdx < 0) return;

  const lastRow = sheet.getLastRow();
  const colValues = sheet
    .getRange(2, colIdx + 1, lastRow - 1, 1)
    .getValues()
    .flat()
    .map(String);

  // 아래에서 위로 삭제 (인덱스 밀림 방지)
  for (let i = colValues.length - 1; i >= 0; i--) {
    if (colValues[i] === String(value)) {
      sheet.deleteRow(i + 2);
    }
  }
}

// hid + date 조합으로 습관 로그 삭제
function deleteHabitLog(ss, hid, date) {
  const sheet = ss.getSheetByName('habit_logs');
  if (!sheet || sheet.getLastRow() <= 1) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const hidCol = headers.indexOf('hid');
  const dateCol = headers.indexOf('date');
  if (hidCol < 0 || dateCol < 0) return;

  const lastRow = sheet.getLastRow();
  const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  for (let i = allData.length - 1; i >= 0; i--) {
    if (String(allData[i][hidCol]) === String(hid) &&
        String(allData[i][dateCol]) === String(date)) {
      sheet.deleteRow(i + 2);
    }
  }
}
