// ============================================================
//  STACK IT  —  arcade stacker game
//  export default { init, destroy }
//  Faithful to LAI Games "Stacker" mechanics:
//    Rows 1-3:  3 blocks wide
//    Row  4:    2 blocks wide (auto-reduced)
//    Row 10:    1 block wide (auto-reduced)
//    15 rows total  →  WIN
//    Speed increases every row
//    Overhang trimmed, if width→0 = GAME OVER
// ============================================================

export default (() => {

  // ── Constants ───────────────────────────────────────────────
  const COLS       = 7;          // grid width in cells
  const ROWS       = 15;         // total rows to stack
  const MINOR_ROW  = 11;         // minor prize row (1-indexed from bottom)
  const MAJOR_ROW  = 15;         // win row

  // Speed: ms per cell movement (lower = faster)
  const BASE_SPEED = 420;
  const MIN_SPEED  = 68;

  // Colours per zone (row bands, 1-indexed from bottom)
  const ZONE_COLORS = [
    { from: 1,  to: 5,  cell: '#00e5ff', glow: 'rgba(0,229,255,0.9)',  shadow: 'rgba(0,180,220,0.5)' },
    { from: 6,  to: 9,  cell: '#00ff88', glow: 'rgba(0,255,136,0.9)',  shadow: 'rgba(0,200,100,0.5)' },
    { from: 10, to: 11, cell: '#ffdd00', glow: 'rgba(255,221,0,0.9)',   shadow: 'rgba(200,160,0,0.5)' },
    { from: 12, to: 14, cell: '#ff6a00', glow: 'rgba(255,106,0,0.9)',   shadow: 'rgba(200,80,0,0.5)'  },
    { from: 15, to: 15, cell: '#ff2d78', glow: 'rgba(255,45,120,0.9)',  shadow: 'rgba(200,20,80,0.5)' },
  ];

  function zoneFor(row1) {
    return ZONE_COLORS.find(z => row1 >= z.from && row1 <= z.to) || ZONE_COLORS[0];
  }

  // ── State ────────────────────────────────────────────────────
  let canvas, ctx, wrap;
  let cellW, cellH, padX, padY;
  let gameState;    // 'idle'|'playing'|'minor'|'win'|'lose'
  let stack = [];   // array of {col, width} for each row placed (index 0 = bottom row 1)
  let moverCol   = 0;    // leftmost col of moving block
  let moverWidth = 3;    // current block width
  let moverDir   = 1;    // 1 = right, -1 = left
  let moverRow   = 0;    // which row (0-indexed) we're filling next
  let rafId      = null;
  let lastTick   = 0;
  let tickAcc    = 0;
  let speed      = BASE_SPEED;
  let destroyed  = false;
  let animPhase  = 0;    // for win/lose animations
  let animFrame  = 0;
  let flashCells = [];   // [{col, row}] cells to flash for drop-trim animation
  let flashTimer = 0;
  let perfectStack = 0;  // consecutive perfect stacks
  let score      = 0;
  let bestScore  = 0;

  // ── Audio (Web Audio API) ────────────────────────────────────
  let audioCtx;

  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function beep(freq, type, dur, vol = 0.25, delay = 0) {
    try {
      const a = ac();
      const o = a.createOscillator();
      const g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type      = type;
      o.frequency.setValueAtTime(freq, a.currentTime + delay);
      g.gain.setValueAtTime(0, a.currentTime + delay);
      g.gain.linearRampToValueAtTime(vol, a.currentTime + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + delay + dur);
      o.start(a.currentTime + delay);
      o.stop(a.currentTime + delay + dur + 0.05);
    } catch(e) {}
  }

  function sndPlace(perfect) {
    if (perfect) {
      beep(880, 'sine', 0.12, 0.3);
      beep(1320,'sine', 0.10, 0.25, 0.08);
      beep(1760,'sine', 0.08, 0.2,  0.16);
    } else {
      beep(440, 'sine', 0.1, 0.22);
    }
  }

  function sndTrim(cells) {
    beep(200 - cells*20, 'sawtooth', 0.18, 0.3);
  }

  function sndFail() {
    beep(300, 'sawtooth', 0.12, 0.35);
    beep(200, 'sawtooth', 0.20, 0.35, 0.12);
    beep(120, 'sawtooth', 0.30, 0.35, 0.28);
  }

  function sndWin() {
    const notes = [523,659,784,1047,1319,1568];
    notes.forEach((f,i) => beep(f, 'sine', 0.18, 0.28, i*0.1));
  }

  function sndMinor() {
    const notes = [523,659,784,659,784,1047];
    notes.forEach((f,i) => beep(f, 'sine', 0.15, 0.22, i*0.09));
  }

  function sndMove() {
    // subtle tick
    beep(1200, 'square', 0.025, 0.05);
  }

  // ── Layout ───────────────────────────────────────────────────
  function resize() {
    if (!canvas || !wrap) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;

    // Keep arcade cabinet proportions — tall narrow column
    const aspectW = COLS + 2;          // cells + margins
    const aspectH = ROWS + 3;          // cells + top/bottom margin
    const cw = Math.floor(W / aspectW);
    const ch = Math.floor(H / aspectH);
    cellW = cellH = Math.max(8, Math.min(cw, ch, 52));

    padX = Math.floor((W - cellW * COLS) / 2);
    padY = Math.floor((H - cellH * ROWS) / 2);

    canvas.width  = W;
    canvas.height = H;
    draw();
  }

  // ── Drawing ──────────────────────────────────────────────────
  function cellRect(col, rowFromBottom) {
    // row 0 = bottom, row ROWS-1 = top
    const x = padX + col * cellW;
    const y = padY + (ROWS - 1 - rowFromBottom) * cellH;
    return [x, y, cellW - 2, cellH - 2];
  }

  function drawCell(col, rowFromBottom, color, glowColor, alpha = 1) {
    const [x, y, w, h] = cellRect(col, rowFromBottom);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!window.PERF?.isLowQuality()) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur  = 12;
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    // inner highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 2, y + 2, w - 4, 3);
    ctx.restore();
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(0,180,220,0.07)';
    ctx.lineWidth   = 1;
    for (let c = 0; c <= COLS; c++) {
      const x = padX + c * cellW;
      ctx.beginPath();
      ctx.moveTo(x, padY);
      ctx.lineTo(x, padY + ROWS * cellH);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = padY + r * cellH;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(padX + COLS * cellW, y);
      ctx.stroke();
    }
  }

  function drawRowLabels() {
    ctx.font         = `${Math.max(8, cellH * 0.35)}px 'Share Tech Mono', monospace`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < ROWS; r++) {
      const row1 = r + 1;
      const [,cy] = cellRect(0, r);
      const cy2   = cy + (cellH - 2) / 2;
      const x     = padX - 6;

      if (row1 === MINOR_ROW) {
        ctx.fillStyle = '#ffdd00';
        ctx.fillText('★', x, cy2);
      } else if (row1 === MAJOR_ROW) {
        ctx.fillStyle = '#ff2d78';
        ctx.fillText('★★', x, cy2);
      } else {
        ctx.fillStyle = 'rgba(0,200,230,0.3)';
        ctx.fillText(row1, x, cy2);
      }
    }
    ctx.textAlign = 'left';
  }

  function drawMinorLine() {
    const r = MINOR_ROW - 1;
    const [,y] = cellRect(0, r);
    ctx.save();
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(padX + COLS * cellW, y);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background gradient — deep arcade cabinet feel
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#030810');
    bg.addColorStop(1, '#050c1a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawMinorLine();
    drawRowLabels();

    // Placed stack rows
    for (let r = 0; r < stack.length; r++) {
      const { col, width } = stack[r];
      const zone = zoneFor(r + 1);
      for (let c = col; c < col + width; c++) {
        // Check if it's a flash cell (trim animation)
        const isFlash = flashCells.some(f => f.col === c && f.row === r);
        if (isFlash) continue;
        drawCell(c, r, zone.cell, zone.glow);
      }
    }

    // Flash animation cells (overhang being trimmed)
    if (flashTimer > 0) {
      const alpha = (flashTimer / 8) * 0.9;
      flashCells.forEach(f => {
        const zone = zoneFor(f.row + 1);
        drawCell(f.col, f.row, '#ffffff', 'rgba(255,255,255,0.8)', alpha);
      });
    }

    // Moving block
    if (gameState === 'playing') {
      const zone = zoneFor(moverRow + 1);
      for (let c = moverCol; c < moverCol + moverWidth; c++) {
        drawCell(c, moverRow, zone.cell, zone.glow);
      }
    }

    // HUD
    drawHUD();

    // Overlays
    if (gameState === 'win')   drawWinAnim();
    if (gameState === 'lose')  drawLoseAnim();
    if (gameState === 'minor') drawMinorAnim();
    if (gameState === 'idle')  drawIdleScreen();
  }

  function drawHUD() {
    const hx     = padX + COLS * cellW + 10;
    const hy     = padY;
    const avail  = canvas.width - hx - 6;
    if (avail < 30) return;

    ctx.font         = `${Math.max(8, cellW * 0.55)}px 'Orbitron', sans-serif`;
    ctx.fillStyle    = 'rgba(0,229,255,0.8)';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';

    const fs = Math.max(8, cellW * 0.5);
    ctx.font      = `${fs}px 'Orbitron', sans-serif`;
    ctx.fillStyle = 'rgba(0,140,180,0.6)';
    ctx.fillText('SCORE', hx, hy);
    ctx.fillStyle = '#00e5ff';
    ctx.font      = `${fs * 1.3}px 'Orbitron', sans-serif`;
    ctx.fillText(score, hx, hy + fs + 2);

    ctx.font      = `${fs}px 'Orbitron', sans-serif`;
    ctx.fillStyle = 'rgba(0,140,180,0.6)';
    ctx.fillText('BEST', hx, hy + fs * 3.2);
    ctx.fillStyle = '#ffdd00';
    ctx.font      = `${fs * 1.1}px 'Orbitron', sans-serif`;
    ctx.fillText(bestScore, hx, hy + fs * 4.4);

    if (perfectStack > 0) {
      ctx.font      = `${fs * 0.85}px 'Share Tech Mono', monospace`;
      ctx.fillStyle = '#ff2d78';
      ctx.fillText(`PERFECT ×${perfectStack}`, hx, hy + fs * 6.5);
    }

    // Row indicator
    if (gameState === 'playing') {
      ctx.font      = `${fs * 0.75}px 'Share Tech Mono', monospace`;
      ctx.fillStyle = 'rgba(0,200,230,0.5)';
      ctx.fillText(`ROW ${moverRow + 1}/${ROWS}`, hx, hy + fs * 8.5);
    }
  }

  // ── Win / Lose / Minor animations ────────────────────────────
  function drawWinAnim() {
    const t   = animFrame;
    const W   = canvas.width;
    const H   = canvas.height;

    // Flashing full grid of cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const phase = (r + c + Math.floor(t / 3)) % 6;
        const cols  = ['#ff2d78','#ff6a00','#ffdd00','#00ff88','#00e5ff','#a855f7'];
        const alpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.12 + r * 0.5 + c * 0.3));
        drawCell(c, r, cols[phase], cols[phase], alpha);
      }
    }

    // Centre overlay
    ctx.save();
    ctx.globalAlpha = Math.min(1, t / 15);
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W/2);
    bg.addColorStop(0, 'rgba(0,0,0,0.82)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const pulse      = 1 + 0.06 * Math.sin(t * 0.2);
    ctx.font         = `${Math.min(cellW * 2.5, 64) * pulse}px 'Orbitron', sans-serif`;
    ctx.shadowColor  = '#ff2d78';
    ctx.shadowBlur   = 30 + 10 * Math.sin(t * 0.15);
    ctx.fillStyle    = '#ff2d78';
    ctx.fillText('YOU WIN!', W / 2, H * 0.38);
    ctx.font         = `${Math.min(cellW * 1.1, 28)}px 'Orbitron', sans-serif`;
    ctx.shadowColor  = '#ffdd00';
    ctx.fillStyle    = '#ffdd00';
    ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
    ctx.font         = `${Math.min(cellW * 0.85, 18)}px 'Share Tech Mono', monospace`;
    ctx.shadowBlur   = 6;
    ctx.fillStyle    = 'rgba(200,240,255,0.75)';
    ctx.fillText('TAP / SPACE TO PLAY AGAIN', W / 2, H * 0.62);
    ctx.restore();
  }

  function drawLoseAnim() {
    const t  = animFrame;
    const W  = canvas.width;
    const H  = canvas.height;

    // Shake / cascade the placed blocks down
    const fallOffset = Math.min(t * 3, ROWS * cellH);
    ctx.save();
    ctx.translate(0, fallOffset * 0.6);
    ctx.globalAlpha = Math.max(0, 1 - t / 25);
    for (let r = 0; r < stack.length; r++) {
      const { col, width } = stack[r];
      const zone = zoneFor(r + 1);
      for (let c = col; c < col + width; c++) {
        drawCell(c, r, zone.cell, zone.glow);
      }
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = Math.min(1, t / 12);
    ctx.fillStyle   = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const shake      = t < 20 ? (Math.random() - 0.5) * 4 * (1 - t/20) : 0;
    ctx.font         = `${Math.min(cellW * 2.2, 58)}px 'Orbitron', sans-serif`;
    ctx.shadowColor  = '#ff4400';
    ctx.shadowBlur   = 20;
    ctx.fillStyle    = '#ff4400';
    ctx.fillText('GAME OVER', W / 2 + shake, H * 0.38 + shake);
    ctx.font         = `${Math.min(cellW * 1.0, 26)}px 'Orbitron', sans-serif`;
    ctx.shadowColor  = '#ffdd00';
    ctx.fillStyle    = '#ffdd00';
    ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.5);
    ctx.font         = `${Math.min(cellW * 0.85, 18)}px 'Share Tech Mono', monospace`;
    ctx.shadowBlur   = 4;
    ctx.fillStyle    = 'rgba(200,240,255,0.65)';
    ctx.fillText('TAP / SPACE TO RETRY', W / 2, H * 0.6);
    ctx.restore();
  }

  function drawMinorAnim() {
    const t  = animFrame;
    const W  = canvas.width;
    const H  = canvas.height;

    // Pulse the minor-row cells
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.18));
    const r     = MINOR_ROW - 1;
    for (let c = 0; c < COLS; c++) {
      const inStack = stack[r] && c >= stack[r].col && c < stack[r].col + stack[r].width;
      if (inStack) drawCell(c, r, '#ffdd00', 'rgba(255,221,0,0.9)', pulse);
    }

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const p2 = 1 + 0.04 * Math.sin(t * 0.2);
    ctx.font         = `${Math.min(cellW * 1.8, 46) * p2}px 'Orbitron', sans-serif`;
    ctx.shadowColor  = '#ffdd00';
    ctx.shadowBlur   = 22;
    ctx.fillStyle    = '#ffdd00';
    ctx.fillText('MINOR PRIZE!', W / 2, H * 0.32);
    ctx.font         = `${Math.min(cellW * 0.9, 20)}px 'Share Tech Mono', monospace`;
    ctx.fillStyle    = '#00e5ff';
    ctx.shadowColor  = '#00e5ff';
    ctx.shadowBlur   = 8;
    ctx.fillText('KEEP GOING FOR MAJOR?', W / 2, H * 0.45);
    ctx.font         = `${Math.min(cellW * 0.75, 16)}px 'Share Tech Mono', monospace`;
    ctx.fillStyle    = 'rgba(200,240,255,0.7)';
    ctx.fillText('[TAP / SPACE] CONTINUE', W / 2, H * 0.54);
    ctx.fillStyle    = 'rgba(200,240,255,0.5)';
    ctx.fillText('[Q / BACK]   CLAIM PRIZE', W / 2, H * 0.61);
    ctx.restore();
  }

  function drawIdleScreen() {
    const W = canvas.width;
    const H = canvas.height;
    const t = animFrame;

    // Animate a demo block bouncing
    const demoCol = Math.floor((Math.sin(t * 0.05) * 0.5 + 0.5) * (COLS - 3));
    const zone    = zoneFor(1);
    for (let c = demoCol; c < demoCol + 3; c++) {
      drawCell(c, 0, zone.cell, zone.glow, 0.5 + 0.3 * Math.abs(Math.sin(t * 0.08)));
    }

    ctx.save();
    ctx.globalAlpha = 0.88;
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.7);
    bg.addColorStop(0, 'rgba(0,0,0,0.8)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const pulse = 1 + 0.05 * Math.sin(t * 0.12);
    ctx.font      = `${Math.min(cellW * 2.4, 60) * pulse}px 'Orbitron', sans-serif`;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur  = 24;
    ctx.fillStyle   = '#00e5ff';
    ctx.fillText('STACK IT', W / 2, H * 0.3);

    ctx.font      = `${Math.min(cellW * 0.9, 22)}px 'Share Tech Mono', monospace`;
    ctx.shadowBlur = 6;
    ctx.fillStyle  = 'rgba(200,240,255,0.9)';
    ctx.fillText('STACK 15 ROWS TO WIN', W / 2, H * 0.45);

    ctx.font      = `${Math.min(cellW * 0.8, 18)}px 'Share Tech Mono', monospace`;
    const blink   = Math.floor(t / 25) % 2 === 0;
    ctx.fillStyle = blink ? '#ffdd00' : 'rgba(255,221,0,0.4)';
    ctx.fillText('TAP OR PRESS SPACE', W / 2, H * 0.57);

    if (bestScore > 0) {
      ctx.font      = `${Math.min(cellW * 0.7, 15)}px 'Share Tech Mono', monospace`;
      ctx.fillStyle = 'rgba(0,229,255,0.55)';
      ctx.fillText(`BEST: ${bestScore}`, W / 2, H * 0.67);
    }
    ctx.restore();
  }

  // ── Game logic ───────────────────────────────────────────────
  function widthForRow(row1) {
    if (row1 >= 10) return 1;
    if (row1 >= 4)  return 2;
    return 3;
  }

  function speedForRow(row1) {
    // Exponential ramp: starts at BASE_SPEED, hits MIN_SPEED at row 15
    const t = (row1 - 1) / (ROWS - 1);  // 0→1
    return Math.max(MIN_SPEED, Math.round(BASE_SPEED * Math.pow(MIN_SPEED / BASE_SPEED, t)));
  }

  function newGame() {
    stack      = [];
    moverCol   = 0;
    moverDir   = 1;
    moverRow   = 0;
    moverWidth = widthForRow(1);
    speed      = speedForRow(1);
    score      = 0;
    animFrame  = 0;
    perfectStack = 0;
    flashCells = [];
    flashTimer = 0;
    gameState  = 'playing';
    lastTick   = 0;
    tickAcc    = 0;
    beep(440, 'sine', 0.08, 0.2);
    beep(880, 'sine', 0.08, 0.2, 0.1);
  }

  function place() {
    if (gameState !== 'playing') return;

    if (moverRow === 0) {
      // First row — always lands
      stack.push({ col: moverCol, width: moverWidth });
      scoreRow(moverRow, false);
      advanceRow();
      return;
    }

    const prev     = stack[moverRow - 1];
    const mL       = moverCol;
    const mR       = moverCol + moverWidth;
    const pL       = prev.col;
    const pR       = prev.col + prev.width;

    // Compute overlap
    const overlapL = Math.max(mL, pL);
    const overlapR = Math.min(mR, pR);
    const overlap  = overlapR - overlapL;

    if (overlap <= 0) {
      // Complete miss
      sndFail();
      gameState = 'lose';
      if (score > bestScore) bestScore = score;
      return;
    }

    // Trim overhanging cells (make flash cells)
    flashCells = [];
    for (let c = mL; c < mR; c++) {
      if (c < overlapL || c >= overlapR) {
        flashCells.push({ col: c, row: moverRow });
      }
    }
    flashTimer = 8;

    const perfect = (overlap === moverWidth && overlap === prev.width);

    stack.push({ col: overlapL, width: overlap });
    scoreRow(moverRow, perfect, overlap < moverWidth ? moverWidth - overlap : 0);

    if (perfect) {
      perfectStack++;
    } else {
      perfectStack = 0;
    }

    sndPlace(perfect);
    if (flashCells.length > 0) sndTrim(flashCells.length);

    advanceRow();
  }

  function scoreRow(row0, perfect, trimmed = 0) {
    const row1    = row0 + 1;
    const base    = row1 * 10;
    const perfBonus = perfect ? row1 * 5 : 0;
    const trimPen = trimmed * 3;
    score += Math.max(0, base + perfBonus - trimPen);
    if (score > bestScore) bestScore = score;
  }

  function advanceRow() {
    moverRow++;

    if (moverRow >= ROWS) {
      // WIN!
      gameState  = 'win';
      animFrame  = 0;
      score += 500;
      if (score > bestScore) bestScore = score;
      sndWin();
      return;
    }

    // Check minor prize threshold
    if (moverRow === MINOR_ROW) {
      gameState = 'minor';
      animFrame = 0;
      sndMinor();
      return;
    }

    // Auto-reduce width
    const newWidth = Math.min(widthForRow(moverRow + 1), stack[moverRow - 1].width);
    moverWidth = newWidth;
    speed = speedForRow(moverRow + 1);

    // Start mover centred on the row below's block
    const below  = stack[moverRow - 1];
    const centre = below.col + Math.floor(below.width / 2) - Math.floor(moverWidth / 2);
    moverCol = Math.max(0, Math.min(COLS - moverWidth, centre));
    moverDir = (Math.random() < 0.5) ? 1 : -1;
    tickAcc  = 0;
  }

  // ── Game loop ────────────────────────────────────────────────
  function tick(ts) {
    if (destroyed) return;
    rafId = requestAnimationFrame(tick);

    if (document.hidden) { lastTick = 0; return; }

    const dt = lastTick ? Math.min(ts - lastTick, 100) : 16;
    lastTick  = ts;

    if (gameState === 'playing') {
      tickAcc += dt;
      while (tickAcc >= speed) {
        tickAcc -= speed;
        // Move mover
        moverCol += moverDir;
        if (moverCol + moverWidth > COLS) { moverCol = COLS - moverWidth; moverDir = -1; }
        if (moverCol < 0)                 { moverCol = 0;                 moverDir =  1; }
      }
      if (flashTimer > 0) flashTimer--;
    }

    if (['win','lose','minor','idle'].includes(gameState)) {
      animFrame++;
    }

    draw();
  }

  // ── Input ────────────────────────────────────────────────────
  function handleAction() {
    try { ac().resume(); } catch(e) {}

    if (gameState === 'idle') {
      newGame();
    } else if (gameState === 'playing') {
      place();
    } else if (gameState === 'win' || gameState === 'lose') {
      newGame();
    } else if (gameState === 'minor') {
      // Continue playing
      gameState  = 'playing';
      const newWidth = Math.min(widthForRow(moverRow + 1), stack[moverRow - 1].width);
      moverWidth = newWidth;
      speed      = speedForRow(moverRow + 1);
      const below  = stack[moverRow - 1];
      const centre = below.col + Math.floor(below.width / 2) - Math.floor(moverWidth / 2);
      moverCol   = Math.max(0, Math.min(COLS - moverWidth, centre));
      moverDir   = 1;
      tickAcc    = 0;
      animFrame  = 0;
    }
  }

  function handleBack() {
    if (gameState === 'minor') {
      // Claim minor prize — go back to arcade
      gameState = 'idle';
      window.backToGameSelect?.();
    } else {
      gameState = 'idle';
      animFrame = 0;
    }
  }

  function onKey(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
      e.preventDefault();
      handleAction();
    }
    if (e.code === 'Escape' || e.code === 'KeyQ') {
      e.preventDefault();
      handleBack();
    }
  }

  // ── Build HTML ───────────────────────────────────────────────
  function buildHTML(container) {
    container.innerHTML = `
      <style>
        #stackit-root {
          width: 100%; height: 100%;
          display: flex;
          flex-direction: column;
          background: #030810;
          font-family: 'Share Tech Mono', monospace;
          user-select: none;
        }
        #stackit-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          border-bottom: 1px solid rgba(0,229,255,0.15);
          flex-shrink: 0;
          gap: 8px;
        }
        #stackit-title {
          font-family: 'Orbitron', sans-serif;
          font-size: clamp(0.65rem, 2vw, 1.1rem);
          color: #00e5ff;
          letter-spacing: 0.2em;
          text-shadow: 0 0 12px rgba(0,229,255,0.7);
        }
        #stackit-hint {
          font-size: clamp(0.5rem, 1.2vw, 0.7rem);
          color: rgba(0,180,220,0.55);
          letter-spacing: 0.1em;
        }
        .stackit-btn {
          padding: 4px 10px;
          background: transparent;
          border: 1px solid rgba(0,229,255,0.35);
          color: rgba(0,229,255,0.8);
          font-family: 'Share Tech Mono', monospace;
          font-size: clamp(0.5rem, 1.2vw, 0.7rem);
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .stackit-btn:hover {
          background: rgba(0,229,255,0.1);
          border-color: #00e5ff;
          color: #00e5ff;
        }
        #stackit-wrap {
          flex: 1;
          min-height: 0;
          position: relative;
          cursor: pointer;
          touch-action: manipulation;
        }
        #stackit-canvas {
          display: block;
          width: 100%;
          height: 100%;
        }
      </style>
      <div id="stackit-root">
        <div id="stackit-topbar">
          <div id="stackit-title">STACK IT</div>
          <div id="stackit-hint">SPACE / TAP to place</div>
          <div style="display:flex;gap:6px">
            <button class="stackit-btn" id="stackit-new-btn">▶ NEW</button>
            <button class="arcade-back-btn" id="stackit-back-btn">🕹 ARCADE</button>
          </div>
        </div>
        <div id="stackit-wrap">
          <canvas id="stackit-canvas"></canvas>
        </div>
      </div>
    `;

    canvas = container.querySelector('#stackit-canvas');
    wrap   = container.querySelector('#stackit-wrap');
    ctx    = canvas.getContext('2d');

    container.querySelector('#stackit-new-btn').addEventListener('click', () => {
      newGame();
    });
    container.querySelector('#stackit-back-btn').addEventListener('click', () => {
      window.backToGameSelect?.();
    });

    wrap.addEventListener('click', handleAction);
    wrap.addEventListener('touchstart', e => { e.preventDefault(); handleAction(); }, { passive: false });

    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);

    // Initial layout
    setTimeout(resize, 0);

    // Start loop
    gameState = 'idle';
    animFrame = 0;
    rafId = requestAnimationFrame(tick);
  }

  // ── Public API ───────────────────────────────────────────────
  function init() {
    const screenEl = document.getElementById('stackit-screen');
    if (!screenEl) { console.warn('[stackit] screen element not found'); return; }
    destroyed = false;
    buildHTML(screenEl);
  }

  function destroy() {
    destroyed = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    const screenEl = document.getElementById('stackit-screen');
    if (screenEl) screenEl.innerHTML = '';
  }

  return { init, destroy };
})();
