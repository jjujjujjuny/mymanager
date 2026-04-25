// ============================================================
//  스네이크 이스터에그
// ============================================================

const GRID = 32;
const COLS = 10;
const ROWS = 10;
const W = COLS * GRID;   // 320
const H = ROWS * GRID;   // 320
const SPEED = 9;         // 프레임 당 틱 (낮을수록 빠름)

let rafId = null;
let frameCount = 0;
let gameRunning = false;
let score = 0;

const snake = { x: 160, y: 160, dx: GRID, dy: 0, cells: [], maxCells: 4 };
let apple = { x: 192, y: 192 };

function rnd() { return Math.floor(Math.random() * COLS); }

// ── 공개 함수 ────────────────────────────────────────────────
export function openSnakeGame() {
  document.getElementById('snake-score').textContent = 0;
  document.getElementById('snake-hi').textContent = localStorage.getItem('snakeHi') || 0;
  document.getElementById('snake-overlay').style.display = 'none';
  document.getElementById('m-snake').classList.add('open');
  startSnake();
}

export function closeSnakeGame() {
  document.getElementById('m-snake').classList.remove('open');
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  gameRunning = false;
}

export function startSnake() {
  score = 0;
  snake.x = 160; snake.y = 160;
  snake.dx = GRID; snake.dy = 0;
  snake.cells = []; snake.maxCells = 4;
  apple.x = rnd() * GRID; apple.y = rnd() * GRID;
  frameCount = 0; gameRunning = true;
  document.getElementById('snake-score').textContent = 0;
  document.getElementById('snake-hi').textContent = localStorage.getItem('snakeHi') || 0;
  document.getElementById('snake-overlay').style.display = 'none';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

export function snakeMove(dir) {
  if (!gameRunning) return;
  if (dir === 'left'  && snake.dx === 0) { snake.dx = -GRID; snake.dy = 0; }
  if (dir === 'right' && snake.dx === 0) { snake.dx =  GRID; snake.dy = 0; }
  if (dir === 'up'    && snake.dy === 0) { snake.dy = -GRID; snake.dx = 0; }
  if (dir === 'down'  && snake.dy === 0) { snake.dy =  GRID; snake.dx = 0; }
}

// ── 게임 루프 ────────────────────────────────────────────────
function loop() {
  rafId = requestAnimationFrame(loop);
  if (++frameCount < SPEED) return;
  frameCount = 0;
  if (gameRunning) tick();
}

function tick() {
  const canvas = document.getElementById('snake-canvas');
  const ctx = canvas.getContext('2d');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';

  // 배경
  ctx.fillStyle = dark ? '#1c1409' : '#fdf6ee';
  ctx.fillRect(0, 0, W, H);

  // 격자
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= W; x += GRID) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y <= H; y += GRID) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // 뱀 이동
  snake.x += snake.dx;
  snake.y += snake.dy;
  if (snake.x < 0)   snake.x = W - GRID;
  else if (snake.x >= W) snake.x = 0;
  if (snake.y < 0)   snake.y = H - GRID;
  else if (snake.y >= H) snake.y = 0;

  snake.cells.unshift({ x: snake.x, y: snake.y });
  if (snake.cells.length > snake.maxCells) snake.cells.pop();

  // 사과
  ctx.fillStyle = '#c76332';
  rrect(ctx, apple.x + 2, apple.y + 2, GRID - 4, GRID - 4, 4);

  // 뱀 그리기
  let collided = false;
  snake.cells.forEach((cell, i) => {
    const alpha = 1 - (i / (snake.maxCells + 2)) * 0.55;
    ctx.fillStyle = dark
      ? `rgba(110,185,95,${alpha})`
      : `rgba(55,125,40,${alpha})`;
    rrect(ctx, cell.x + 1, cell.y + 1, GRID - 2, GRID - 2, i === 0 ? 5 : 3);

    // 사과 먹기
    if (cell.x === apple.x && cell.y === apple.y) {
      score++;
      snake.maxCells++;
      document.getElementById('snake-score').textContent = score;
      apple.x = rnd() * GRID; apple.y = rnd() * GRID;
    }

    // 자기 충돌
    if (!collided) {
      for (let j = i + 1; j < snake.cells.length; j++) {
        if (cell.x === snake.cells[j].x && cell.y === snake.cells[j].y) {
          collided = true;
        }
      }
    }
  });

  if (collided) doGameOver();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function doGameOver() {
  gameRunning = false;
  const prev = parseInt(localStorage.getItem('snakeHi') || 0);
  const hi = Math.max(score, prev);
  if (score > prev) localStorage.setItem('snakeHi', hi);
  document.getElementById('snake-hi').textContent = hi;
  document.getElementById('snake-final').textContent = score;
  document.getElementById('snake-over-hi').textContent = hi;
  document.getElementById('snake-overlay').style.display = 'flex';
}

// ── 키보드 ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!gameRunning) return;
  const map = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down' };
  if (map[e.key]) { e.preventDefault(); snakeMove(map[e.key]); }
});

// ── 터치 스와이프 ─────────────────────────────────────────────
let _tx = null, _ty = null;
document.addEventListener('touchstart', e => {
  if (!document.getElementById('m-snake').classList.contains('open')) return;
  _tx = e.touches[0].clientX; _ty = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (_tx === null || !gameRunning) return;
  const dx = e.changedTouches[0].clientX - _tx;
  const dy = e.changedTouches[0].clientY - _ty;
  _tx = _ty = null;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return; // 탭(버튼 클릭) 무시
  if (Math.abs(dx) > Math.abs(dy)) snakeMove(dx > 0 ? 'right' : 'left');
  else snakeMove(dy > 0 ? 'down' : 'up');
}, { passive: true });

// 모달 백드롭 클릭 시 게임 정리
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('m-snake').addEventListener('click', e => {
    if (e.target === document.getElementById('m-snake')) closeSnakeGame();
  });
});
