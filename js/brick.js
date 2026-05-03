// ============================================================
//  벽돌깨기 이스터에그 (Ballz 스타일)
// ============================================================

const CW = 360, CH = 500;
const COLS = 7;
const ROWS = 9;
const BW = CW / COLS;          // ~51.4
const BH = (CH - 55) / ROWS;   // ~49.4
const LAUNCH_Y = CH - 28;
const BALL_R = 7;
const BALL_SPEED = 11;
const LAUNCH_INTERVAL = 65; // ms between consecutive ball launches

let rafId = null;
let gameState = 'idle'; // 'aim' | 'shooting' | 'gameover'
let round = 1;
let ballCount = 1;
let balls = [];
let tolaunch = 0;
let launchX = CW / 2;
let nextLaunchX = CW / 2;
let launchAngle = null;  // radians: 0=straight up, +right, -left
let pointerActive = false;
let ballsLanded = 0;
let firstBallLanded = false;
let launchAccum = 0;
let lastTs = 0;
let grid = []; // grid[row][col]: hp>0=brick | -1=bonus | 0=empty

// ── 그리드 ───────────────────────────────────────────────────
function initGrid() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function addNewRow() {
  for (let r = ROWS - 1; r > 0; r--) grid[r] = [...grid[r - 1]];
  const row = Array(COLS).fill(0);
  let hasBrick = false;
  for (let c = 0; c < COLS; c++) {
    const rnd = Math.random();
    if (rnd < 0.55) {
      row[c] = Math.max(1, Math.round(round * (0.6 + Math.random() * 0.9)));
      hasBrick = true;
    } else if (rnd < 0.70) {
      row[c] = -1; // bonus ball
    }
  }
  if (!hasBrick) row[Math.floor(Math.random() * COLS)] = round;
  grid[0] = row;
}

// ── 공 ───────────────────────────────────────────────────────
function startShooting() {
  balls = [];
  tolaunch = ballCount;
  ballsLanded = 0;
  firstBallLanded = false;
  launchAccum = 0;
}

function spawnBall() {
  balls.push({
    x: launchX,
    y: LAUNCH_Y - BALL_R,
    vx: Math.sin(launchAngle) * BALL_SPEED,
    vy: -Math.cos(launchAngle) * BALL_SPEED,
    alive: true
  });
  tolaunch--;
}

// ── 충돌 ─────────────────────────────────────────────────────
function checkBricks(b) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const hp = grid[r][c];
      if (hp === 0) continue;
      const bx = c * BW, by = r * BH;
      const clampX = Math.max(bx, Math.min(b.x, bx + BW));
      const clampY = Math.max(by, Math.min(b.y, by + BH));
      const dx = b.x - clampX, dy = b.y - clampY;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > BALL_R * BALL_R) continue;

      if (hp === -1) {
        grid[r][c] = 0;
        ballCount++;
        document.getElementById('brick-balls').textContent = ballCount;
        continue;
      }

      grid[r][c]--;

      // 반사: 이전 위치 기준으로 어떤 면에 충돌했는지 판단
      const prevX = b.x - b.vx, prevY = b.y - b.vy;
      const pClampX = Math.max(bx, Math.min(prevX, bx + BW));
      const pClampY = Math.max(by, Math.min(prevY, by + BH));
      const prevDx = prevX - pClampX, prevDy = prevY - pClampY;
      if (Math.abs(prevDx) > Math.abs(prevDy)) b.vx = -b.vx;
      else b.vy = -b.vy;

      // 침투 해소
      const dist = Math.sqrt(dist2) || 1;
      b.x += (dx / dist) * (BALL_R - dist + 1);
      b.y += (dy / dist) * (BALL_R - dist + 1);
      return; // 프레임당 벽돌 1개
    }
  }
}

// ── 게임 루프 ────────────────────────────────────────────────
function loop(ts) {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(ts - lastTs, 50);
  lastTs = ts;

  if (gameState === 'shooting') {
    // 예약된 공 발사
    if (tolaunch > 0) {
      launchAccum += dt;
      while (launchAccum >= LAUNCH_INTERVAL && tolaunch > 0) {
        launchAccum -= LAUNCH_INTERVAL;
        spawnBall();
      }
    }

    // 공 이동
    for (const b of balls) {
      if (!b.alive) continue;
      b.x += b.vx;
      b.y += b.vy;
      if (b.x - BALL_R < 0)  { b.x = BALL_R;      b.vx =  Math.abs(b.vx); }
      if (b.x + BALL_R > CW) { b.x = CW - BALL_R; b.vx = -Math.abs(b.vx); }
      if (b.y - BALL_R < 0)  { b.y = BALL_R;      b.vy =  Math.abs(b.vy); }
      if (b.y + BALL_R >= LAUNCH_Y) {
        b.y = LAUNCH_Y - BALL_R;
        b.alive = false;
        ballsLanded++;
        if (!firstBallLanded) { firstBallLanded = true; nextLaunchX = Math.round(b.x); }
        continue;
      }
      checkBricks(b);
    }

    // 모든 공 착지 & 발사 완료
    if (tolaunch === 0 && balls.every(b => !b.alive)) endTurn();
  }

  draw();
}

function endTurn() {
  launchX = Math.max(BALL_R + 4, Math.min(CW - BALL_R - 4, nextLaunchX));
  addNewRow();
  round++;
  document.getElementById('brick-score').textContent = round;
  if (grid[ROWS - 1].some(v => v > 0)) { doGameOver(); return; }
  launchAngle = null;
  gameState = 'aim';
}

function doGameOver() {
  gameState = 'gameover';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  const prev = parseInt(localStorage.getItem('brickHi') || '0');
  const hi = Math.max(round, prev);
  if (round > prev) localStorage.setItem('brickHi', String(hi));
  document.getElementById('brick-hi').textContent = hi;
  document.getElementById('brick-final').textContent = round;
  document.getElementById('brick-overlay').style.display = 'flex';
}

// ── 그리기 ───────────────────────────────────────────────────
function brickColor(hp) {
  const r = hp / Math.max(1, round);
  if (r > 1.4) return '#7c3aed';
  if (r > 0.9) return '#dc2626';
  if (r > 0.6) return '#ea580c';
  if (r > 0.3) return '#ca8a04';
  return '#16a34a';
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath(); ctx.fill();
}

function draw() {
  const canvas = document.getElementById('brick-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';

  // 배경
  ctx.fillStyle = dark ? '#1c1409' : '#fdf6ee';
  ctx.fillRect(0, 0, CW, CH);

  // 발사 기준선
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';
  ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(0, LAUNCH_Y); ctx.lineTo(CW, LAUNCH_Y); ctx.stroke();
  ctx.restore();

  // 벽돌
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const hp = grid[r][c];
      if (hp === 0) continue;
      const cx = c * BW + BW / 2, cy = r * BH + BH / 2;

      if (hp === -1) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath(); ctx.arc(cx, cy, BALL_R + 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial';
        ctx.fillText('+1', cx, cy);
        continue;
      }

      ctx.fillStyle = brickColor(hp);
      rrect(ctx, c * BW + 2, r * BH + 2, BW - 4, BH - 4, 5);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = `bold ${BW > 44 ? 11 : 9}px Arial`;
      ctx.fillText(hp > 9999 ? '∞' : String(hp), cx, cy);
    }
  }

  // 조준선
  if (gameState === 'aim' && launchAngle !== null) {
    ctx.save();
    ctx.strokeStyle = 'rgba(199,99,50,.55)';
    ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(launchX, LAUNCH_Y);
    ctx.lineTo(launchX + Math.sin(launchAngle) * 110, LAUNCH_Y - Math.cos(launchAngle) * 110);
    ctx.stroke(); ctx.restore();
  }

  // 발사 지점 표시
  if (gameState === 'aim' || gameState === 'idle') {
    ctx.fillStyle = '#c76332';
    ctx.beginPath(); ctx.arc(launchX, LAUNCH_Y, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark ? 'rgba(255,255,255,.65)' : 'rgba(0,0,0,.45)';
    ctx.font = '11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`×${ballCount}`, launchX, LAUNCH_Y + BALL_R + 3);
  }

  // 비행 중인 공
  ctx.fillStyle = '#c76332';
  for (const b of balls) {
    if (!b.alive) continue;
    ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
  }
}

// ── 입력 ─────────────────────────────────────────────────────
function calcAngle(cx, cy) {
  if (cy >= LAUNCH_Y - 15) return null; // 아래 방향 무시
  const angle = Math.atan2(cx - launchX, LAUNCH_Y - cy);
  const MAX = Math.PI * 0.43; // ~77° 이내
  return Math.max(-MAX, Math.min(MAX, angle));
}

let _canvasSetup = false;
function setupCanvas() {
  if (_canvasSetup) return;
  _canvasSetup = true;
  const canvas = document.getElementById('brick-canvas');

  function toCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CW / rect.width),
      y: (e.clientY - rect.top)  * (CH / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', e => {
    if (gameState !== 'aim') return;
    e.preventDefault();
    pointerActive = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = toCanvas(e);
    launchAngle = calcAngle(x, y);
  }, { passive: false });

  canvas.addEventListener('pointermove', e => {
    if (!pointerActive || gameState !== 'aim') return;
    const { x, y } = toCanvas(e);
    const a = calcAngle(x, y);
    if (a !== null) launchAngle = a;
  });

  canvas.addEventListener('pointerup', () => {
    if (!pointerActive || gameState !== 'aim' || launchAngle === null) {
      pointerActive = false; return;
    }
    pointerActive = false;
    gameState = 'shooting';
    startShooting();
  });

  canvas.addEventListener('pointercancel', () => { pointerActive = false; });
}

// ── 공개 API ─────────────────────────────────────────────────
export function openBrickGame() {
  document.getElementById('brick-overlay').style.display = 'none';
  document.getElementById('m-brick').classList.add('open');
  startBrickGame();
}

export function closeBrickGame() {
  document.getElementById('m-brick').classList.remove('open');
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  gameState = 'idle';
}

export function startBrickGame() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  round = 1; ballCount = 1;
  launchX = CW / 2; nextLaunchX = CW / 2;
  launchAngle = null; pointerActive = false;
  balls = []; tolaunch = 0; ballsLanded = 0;
  initGrid();
  addNewRow(); addNewRow(); // 시작 시 2행
  document.getElementById('brick-score').textContent = '1';
  document.getElementById('brick-balls').textContent = '1';
  document.getElementById('brick-hi').textContent = localStorage.getItem('brickHi') || '0';
  document.getElementById('brick-overlay').style.display = 'none';
  gameState = 'aim';
  setupCanvas();
  lastTs = performance.now();
  rafId = requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('m-brick');
  if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeBrickGame(); });
});
