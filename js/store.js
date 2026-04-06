// 중앙 상태 저장소
// GAS에서 받아온 데이터는 여기에 보관, 설정(cfg)만 localStorage 사용

const _data = {
  tasks: [],
  events: [],
  habits: [],
  habit_logs: [],
  goals: [],
  classes: []
};

export const store = {
  get(k) { return _data[k] ? [..._data[k]] : []; },
  set(k, arr) { _data[k] = arr; },

  // 설정은 기기별로 다르게 → localStorage
  cfg() { try { return JSON.parse(localStorage.getItem('cfg')) ?? {}; } catch { return {}; } },
  saveCfg(v) { localStorage.setItem('cfg', JSON.stringify(v)); }
};
