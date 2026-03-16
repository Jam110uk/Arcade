// ============================================================
//  STACK IT  —  endless arcade stacker
//  export default { init, destroy }
//
//  Rules:
//    - Blocks always start at 3 wide
//    - Width only shrinks when overhang is trimmed off
//    - If trimming reduces width to 0 → GAME OVER
//    - Endless — stack climbs forever, viewport scrolls up
//    - Speed ramps up gradually with height
//    - Score based on height + perfect bonuses
// ============================================================

export default (() => {

  // ── Constants ───────────────────────────────────────────────
  const COLS         = 7;    // grid width in cells
  const VISIBLE_ROWS = 15;   // rows shown on screen at once
  const START_WIDTH  = 3;    // always start with 3 blocks

  // Speed: ms per cell movement (lower = faster)
  const BASE_SPEED   = 400;
  const MIN_SPEED    = 55;
  const SPEED_ROWS   = 60;   // rows to reach minimum speed

  // Colour zones — cycle every 5 rows as you go higher
  const ZONE_COLORS = [
    { cell: '#00e5ff', glow: 'rgba(0,229,255,0.85)'  },
    { cell: '#00ff88', glow: 'rgba(0,255,136,0.85)'  },
    { cell: '#ffe600', glow: 'rgba(255,230,0,0.85)'  },
    { cell: '#ff6a00', glow: 'rgba(255,106,0,0.85)'  },
    { cell: '#ff2d78', glow: 'rgba(255,45,120,0.85)' },
    { cell: '#a855f7', glow: 'rgba(168,85,247,0.85)' },
  ];

  function zoneFor(row1) {
    const idx = Math.floor((row1 - 1) / 5) % ZONE_COLORS.length;
    return ZONE_COLORS[idx];
  }

  // ── State ────────────────────────────────────────────────────
  let canvas, ctx, wrap;
  let cellW, cellH, padX;
  let gameState     = 'idle'; // 'idle'|'playing'|'lose'
  let stack         = [];     // [{col, width}] index 0 = row 1 (bottom)
  let moverCol      = 0;
  let moverWidth    = START_WIDTH;
  let moverDir      = 1;
  let moverRow      = 0;      // next row index to fill (0-based)
  let rafId         = null;
  let lastTick      = 0;
  let tickAcc       = 0;
  let speed         = BASE_SPEED;
  let destroyed     = false;
  let animFrame     = 0;
  let flashCells    = [];     // [{col, row}] overhang trim animation
  let flashTimer    = 0;
  let perfectStreak = 0;
  let score         = 0;
  let bestScore     = 0;
  let scrollBase    = 0;      // row index shown at bottom of viewport

  // ── Audio — soft, warm, low-volume tones ─────────────────────
  let audioCtx;

  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // Soft filtered tone — low-pass removes harshness, gentle volumes
  function tone(freq, dur, vol = 0.06, delay = 0, type = 'sine') {
    try {
      const a   = ac();
      const osc = a.createOscillator();
      const env = a.createGain();
      const lpf = a.createBiquadFilter();
      lpf.type            = 'lowpass';
      lpf.frequency.value = Math.min(freq * 2.2, 1800);
      lpf.Q.value         = 0.4;
      osc.connect(lpf); lpf.connect(env); env.connect(a.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, a.currentTime + delay);
      env.gain.setValueAtTime(0, a.currentTime + delay);
      env.gain.linearRampToValueAtTime(vol, a.currentTime + delay + 0.025);
      env.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + dur);
      osc.start(a.currentTime + delay);
      osc.stop(a.currentTime + delay + dur + 0.06);
    } catch(e) {}
  }

  function sndPlace(perfect) {
    if (perfect) {
      // Warm ascending chime — quiet and pleasant
      tone(392, 0.20, 0.07);
      tone(523, 0.18, 0.06, 0.10);
      tone(659, 0.16, 0.055, 0.20);
    } else {
      // Single soft thud
      tone(294, 0.15, 0.07, 0, 'triangle');
    }
  }

  function sndTrim() {
    // Very soft descending blip
    tone(260, 0.12, 0.05, 0,    'triangle');
    tone(196, 0.10, 0.04, 0.08, 'triangle');
  }

  function sndFail() {
    // Gentle falling tone — not sharp at all
    tone(220, 0.22, 0.08, 0,    'triangle');
    tone(175, 0.24, 0.07, 0.18, 'triangle');
    tone(130, 0.30, 0.06, 0.38, 'triangle');
  }

  function sndMilestone() {
    // Soft ascending arpeggio every 10 rows
    tone(392, 0.18, 0.065);
    tone(494, 0.16, 0.06,  0.12);
    tone(587, 0.14, 0.055, 0.24);
  }

  function sndStart() {
    tone(330, 0.14, 0.06);
    tone(440, 0.12, 0.055, 0.14);
  }

  // ── Layout ───────────────────────────────────────────────────
  function resize() {
    if (!canvas || !wrap) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;

    const cw = Math.floor(W / (COLS + 2.5));
    const ch = Math.floor(H / (VISIBLE_ROWS + 2));
    cellW = cellH = Math.max(8, Math.min(cw, ch, 54));

    padX = Math.floor((W - cellW * COLS) / 2);

    canvas.width  = W;
    canvas.height = H;
    draw();
  }

  // Convert stack row index → canvas Y, accounting for scrollBase
  function rowToY(rowIndex) {
    const H       = canvas.height;
    const totalH  = cellH * VISIBLE_ROWS;
    const bottomY = H - Math.floor((H - totalH) / 2);
    const relRow  = rowIndex - scrollBase;
    return bottomY - (relRow + 1) * cellH;
  }

  function cellRect(col, rowIndex) {
    return [padX + col * cellW, rowToY(rowIndex), cellW - 2, cellH - 2];
  }

  function drawCell(col, rowIndex, color, glowColor, alpha = 1) {
    const [x, y, w, h] = cellRect(col, rowIndex);
    if (y + h < -4 || y > canvas.height + 4) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!window.PERF?.isLowQuality()) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur  = 9;
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    // Inner highlight sheen
    ctx.fillStyle  = 'rgba(255,255,255,0.13)';
    ctx.fillRect(x + 2, y + 2, w - 4, 3);
    ctx.restore();
  }

  function drawGrid() {
    const H = canvas.height;
    ctx.strokeStyle = 'rgba(0,180,220,0.055)';
    ctx.lineWidth   = 1;
    for (let c = 0; c <= COLS; c++) {
      const x = padX + c * cellW;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let r = -1; r <= VISIBLE_ROWS + 1; r++) {
      const y = rowToY(scrollBase + r);
      ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(padX + COLS * cellW, y); ctx.stroke();
    }
  }

  function drawMilestoneLines() {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    const first = Math.floor(scrollBase / 10) * 10 + 9;
    for (let r = first; r <= scrollBase + VISIBLE_ROWS + 2; r += 10) {
      const y = rowToY(r);
      if (y < -10 || y > canvas.height + 10) continue;
      ctx.strokeStyle = 'rgba(255,221,0,0.28)';
      ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(padX + COLS * cellW, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRowNumbers() {
    if (cellH < 12) return;
    const fs = Math.max(7, cellH * 0.3);
    ctx.font         = `${fs}px 'Share Tech Mono', monospace`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    for (let r = scrollBase - 1; r <= scrollBase + VISIBLE_ROWS + 1; r++) {
      if (r < 0) continue;
      const y    = rowToY(r) + cellH / 2;
      if (y < -cellH || y > canvas.height + cellH) continue;
      const row1 = r + 1;
      if (row1 % 10 === 0) {
        ctx.fillStyle = '#ffdd00';
        ctx.fillText(`${row1} ★`, padX - 5, y);
      } else if (row1 % 5 === 0) {
        ctx.fillStyle = 'rgba(0,229,255,0.35)';
        ctx.fillText(row1, padX - 5, y);
      } else {
        ctx.fillStyle = 'rgba(0,200,230,0.18)';
        ctx.fillText(row1, padX - 5, y);
      }
    }
    ctx.textAlign = 'left';
  }

  function drawHUD() {
    const hx = padX + COLS * cellW + 10;
    const hy = 14;
    if (canvas.width - hx < 28) return;

    const fs = Math.max(8, Math.min(cellW * 0.52, 17));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    ctx.font      = `${fs * 0.68}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = 'rgba(0,140,180,0.5)';
    ctx.fillText('SCORE', hx, hy);
    ctx.font      = `${fs * 1.2}px 'Orbitron', sans-serif`;
    ctx.fillStyle = '#00e5ff';
    if (!window.PERF?.isLowQuality()) { ctx.shadowColor = 'rgba(0,229,255,0.4)'; ctx.shadowBlur = 7; }
    ctx.fillText(score, hx, hy + fs * 0.75);
    ctx.shadowBlur = 0;

    ctx.font      = `${fs * 0.68}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = 'rgba(0,140,180,0.5)';
    ctx.fillText('BEST', hx, hy + fs * 2.8);
    ctx.font      = `${fs}px 'Orbitron', sans-serif`;
    ctx.fillStyle = '#ffdd00';
    ctx.fillText(bestScore, hx, hy + fs * 3.6);

    ctx.font      = `${fs * 0.68}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = 'rgba(0,140,180,0.5)';
    ctx.fillText('ROW', hx, hy + fs * 5.4);
    ctx.font      = `${fs}px 'Orbitron', sans-serif`;
    ctx.fillStyle = '#00ff88';
    ctx.fillText(moverRow + 1, hx, hy + fs * 6.2);

    if (perfectStreak >= 2) {
      ctx.font      = `${fs * 0.62}px 'Share Tech Mono', monospace`;
      ctx.fillStyle = '#ff2d78';
      if (!window.PERF?.isLowQuality()) { ctx.shadowColor = 'rgba(255,45,120,0.5)'; ctx.shadowBlur = 5; }
      ctx.fillText('PERFECT', hx, hy + fs * 8.2);
      ctx.fillText(`×${perfectStreak}`, hx, hy + fs * 9.1);
      ctx.shadowBlur = 0;
    }
  }

  function drawLoseOverlay() {
    const t = animFrame;
    const W = canvas.width, H = canvas.height;

    ctx.save();
    ctx.globalAlpha = Math.min(0.80, t / 18);
    ctx.fillStyle   = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const shake = t < 12 ? (Math.random() - 0.5) * 3.5 * (1 - t / 12) : 0;

    ctx.font        = `${Math.min(cellW * 2.1, 54)}px 'Orbitron', sans-serif`;
    ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 16;
    ctx.fillStyle   = '#ff4400';
    ctx.fillText('GAME OVER', W / 2 + shake, H * 0.34);

    ctx.font        = `${Math.min(cellW * 1.05, 26)}px 'Orbitron', sans-serif`;
    ctx.shadowColor = '#ffdd00'; ctx.shadowBlur = 7;
    ctx.fillStyle   = '#ffdd00';
    ctx.fillText(`SCORE  ${score}`, W / 2, H * 0.46);

    ctx.font        = `${Math.min(cellW * 0.9, 20)}px 'Orbitron', sans-serif`;
    ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 5;
    ctx.fillStyle   = '#00ff88';
    ctx.fillText(`ROWS  ${moverRow}`, W / 2, H * 0.55);

    ctx.font        = `${Math.min(cellW * 0.72, 15)}px 'Share Tech Mono', monospace`;
    ctx.shadowBlur  = 0;
    const blink     = Math.floor(t / 22) % 2 === 0;
    ctx.fillStyle   = blink ? 'rgba(200,240,255,0.8)' : 'rgba(200,240,255,0.25)';
    ctx.fillText('TAP · SPACE · ENTER  to retry', W / 2, H * 0.67);
    ctx.restore();
  }

  function drawIdleOverlay() {
    const t = animFrame;
    const W = canvas.width, H = canvas.height;

    // Animated demo block
    const demoCol = Math.round(((Math.sin(t * 0.04) + 1) / 2) * (COLS - 3));
    const zone    = zoneFor(1);
    for (let c = demoCol; c < demoCol + 3; c++) {
      drawCell(c, scrollBase, zone.cell, zone.glow, 0.3 + 0.18 * Math.abs(Math.sin(t * 0.07)));
    }

    ctx.save();
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.65);
    bg.addColorStop(0, 'rgba(0,0,0,0.88)');
    bg.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    const pulse = 1 + 0.04 * Math.sin(t * 0.1);
    ctx.font        = `${Math.min(cellW * 2.1, 56) * pulse}px 'Orbitron', sans-serif`;
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 20;
    ctx.fillStyle   = '#00e5ff';
    ctx.fillText('STACK IT', W / 2, H * 0.27);

    ctx.font        = `${Math.min(cellW * 0.82, 17)}px 'Share Tech Mono', monospace`;
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(200,240,255,0.68)';
    ctx.fillText('STACK AS HIGH AS YOU CAN', W / 2, H * 0.41);
    ctx.fillText('OVERHANGS ARE TRIMMED AWAY', W / 2, H * 0.48);
    ctx.fillText('ZERO BLOCKS LEFT = GAME OVER', W / 2, H * 0.55);

    const blink   = Math.floor(t / 24) % 2 === 0;
    ctx.font      = `${Math.min(cellW * 0.72, 15)}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = blink ? '#ffdd00' : 'rgba(255,221,0,0.28)';
    ctx.fillText('TAP · SPACE · ENTER  to start', W / 2, H * 0.66);

    if (bestScore > 0) {
      ctx.font      = `${Math.min(cellW * 0.65, 13)}px 'Share Tech Mono', monospace`;
      ctx.fillStyle = 'rgba(0,229,255,0.4)';
      ctx.fillText(`BEST: ${bestScore}`, W / 2, H * 0.75);
    }
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#020710');
    bg.addColorStop(1, '#040b18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawGrid();
    drawMilestoneLines();
    drawRowNumbers();

    // Placed stack — cull to visible range only
    const visStart = scrollBase - 2;
    const visEnd   = scrollBase + VISIBLE_ROWS + 2;
    for (let r = Math.max(0, visStart); r < Math.min(stack.length, visEnd); r++) {
      const { col, width } = stack[r];
      const zone = zoneFor(r + 1);
      for (let c = col; c < col + width; c++) {
        if (flashCells.some(f => f.col === c && f.row === r)) continue;
        drawCell(c, r, zone.cell, zone.glow);
      }
    }

    // Flash overhang cells (white fade-out)
    if (flashTimer > 0) {
      const alpha = (flashTimer / 10) * 0.82;
      flashCells.forEach(f => drawCell(f.col, f.row, '#ffffff', 'rgba(255,255,255,0.65)', alpha));
    }

    // Moving block
    if (gameState === 'playing') {
      const zone = zoneFor(moverRow + 1);
      for (let c = moverCol; c < moverCol + moverWidth; c++) {
        drawCell(c, moverRow, zone.cell, zone.glow);
      }
    }

    drawHUD();
    if (gameState === 'lose') drawLoseOverlay();
    if (gameState === 'idle') drawIdleOverlay();
  }

  // ── Game logic ───────────────────────────────────────────────
  function speedForRow(row1) {
    const t = Math.min(1, (row1 - 1) / SPEED_ROWS);
    return Math.round(BASE_SPEED * Math.pow(MIN_SPEED / BASE_SPEED, t));
  }

  // ── High Score prompt ────────────────────────────────────────
  function triggerHSPrompt() {
    if (!window.HS || score <= 0) return;
    // Inject the rows extra-stat into the shared modal
    const extraEl  = document.getElementById('hs-extra-stat');
    const extraVal = document.getElementById('hs-extra-val');
    const extraLbl = document.getElementById('hs-extra-label');
    if (extraEl && extraVal && extraLbl) {
      extraVal.textContent = moverRow;
      extraLbl.textContent = 'ROWS';
      extraEl.classList.add('visible');
    }
    window.HS.promptSubmitOnExit('stackit', score, score.toLocaleString(), () => {
      if (extraEl) extraEl.classList.remove('visible');
      // After prompt closes, stay on game-over screen — player can tap to retry
    });
  }

  function newGame() {
    stack         = [];
    moverCol      = Math.floor((COLS - START_WIDTH) / 2);
    moverDir      = 1;
    moverRow      = 0;
    moverWidth    = START_WIDTH;
    speed         = speedForRow(1);
    score         = 0;
    animFrame     = 0;
    perfectStreak = 0;
    flashCells    = [];
    flashTimer    = 0;
    scrollBase    = 0;
    gameState     = 'playing';
    lastTick      = 0;
    tickAcc       = 0;
    sndStart();
  }

  function place() {
    if (gameState !== 'playing') return;

    if (moverRow === 0) {
      // First row — always full placement
      stack.push({ col: moverCol, width: moverWidth });
      scoreRow(moverRow, false, 0);
      advanceRow();
      sndPlace(false);
      return;
    }

    const prev = stack[moverRow - 1];
    const mL   = moverCol,           mR = moverCol + moverWidth;
    const pL   = prev.col,           pR = prev.col + prev.width;

    const overlapL = Math.max(mL, pL);
    const overlapR = Math.min(mR, pR);
    const overlap  = overlapR - overlapL;

    if (overlap <= 0) {
      // Complete miss
      sndFail();
      if (score > bestScore) bestScore = score;
      gameState = 'lose';
      // Show HS prompt after the game-over animation has had a moment to show
      if (score > 0) setTimeout(() => triggerHSPrompt(), 2000);
      return;
    }

    // Mark overhang cells for flash animation
    flashCells = [];
    for (let c = mL; c < mR; c++) {
      if (c < overlapL || c >= overlapR) flashCells.push({ col: c, row: moverRow });
    }
    flashTimer = 10;

    const perfect = overlap === moverWidth && overlap === prev.width;

    stack.push({ col: overlapL, width: overlap });
    scoreRow(moverRow, perfect, moverWidth - overlap);

    perfectStreak = perfect ? perfectStreak + 1 : 0;

    sndPlace(perfect);
    if (flashCells.length > 0) sndTrim();

    advanceRow();
  }

  function scoreRow(row0, perfect, trimmed) {
    const row1      = row0 + 1;
    const base      = 10 + Math.floor(row1 / 5);
    const perfBonus = perfect ? 15 + perfectStreak * 5 : 0;
    score += Math.max(0, base + perfBonus - trimmed * 2);
    if (score > bestScore) bestScore = score;
  }

  function advanceRow() {
    moverRow++;

    // Milestone sound every 10 rows
    if (moverRow > 0 && moverRow % 10 === 0) sndMilestone();

    // Width carries forward from what survived trimming — NO automatic reduction
    const below  = stack[moverRow - 1];
    moverWidth   = below.width;
    speed        = speedForRow(moverRow + 1);

    // Centre new block over the row below
    const centre = below.col + Math.floor(below.width / 2) - Math.floor(moverWidth / 2);
    moverCol     = Math.max(0, Math.min(COLS - moverWidth, centre));
    moverDir     = Math.random() < 0.5 ? 1 : -1;
    tickAcc      = 0;

    // Scroll viewport up so the active row stays in the lower third
    const threshold = scrollBase + Math.floor(VISIBLE_ROWS * 0.62);
    if (moverRow > threshold) {
      scrollBase = moverRow - Math.floor(VISIBLE_ROWS * 0.62);
    }
  }

  // ── Game loop ────────────────────────────────────────────────
  function tick(ts) {
    if (destroyed) return;
    rafId = requestAnimationFrame(tick);
    if (document.hidden) { lastTick = 0; return; }

    const dt  = lastTick ? Math.min(ts - lastTick, 100) : 16;
    lastTick  = ts;

    if (gameState === 'playing') {
      tickAcc += dt;
      while (tickAcc >= speed) {
        tickAcc -= speed;
        moverCol += moverDir;
        if (moverCol + moverWidth > COLS) { moverCol = COLS - moverWidth; moverDir = -1; }
        if (moverCol < 0)                 { moverCol = 0;                 moverDir =  1; }
      }
      if (flashTimer > 0) flashTimer--;
    }

    if (gameState === 'lose' || gameState === 'idle') animFrame++;

    draw();
  }

  // ── Input ────────────────────────────────────────────────────
  function handleAction() {
    try { ac().resume(); } catch(e) {}
    if      (gameState === 'idle')    newGame();
    else if (gameState === 'playing') place();
    else if (gameState === 'lose')    newGame();
  }

  function handleBack() {
    gameState = 'idle';
    animFrame = 0;
  }

  function onKey(e) {
    if (['Space','ArrowUp','Enter'].includes(e.code)) { e.preventDefault(); handleAction(); }
    if (['Escape','KeyQ'].includes(e.code))           { e.preventDefault(); handleBack(); }
  }

  // ── Build DOM ────────────────────────────────────────────────
  function buildHTML(container) {
    container.innerHTML = `
      <style>
        #stackit-root {
          width: 100%; height: 100%;
          display: flex; flex-direction: column;
          background: #020710;
          font-family: 'Share Tech Mono', monospace;
          user-select: none;
        }
        #stackit-topbar {
          display: flex; align-items: center;
          justify-content: space-between;
          padding: 5px 12px;
          border-bottom: 1px solid rgba(0,229,255,0.1);
          flex-shrink: 0; gap: 8px;
        }
        #stackit-title {
          font-family: 'Orbitron', sans-serif;
          font-size: clamp(0.6rem, 2vw, 1rem);
          color: #00e5ff; letter-spacing: 0.2em;
          text-shadow: 0 0 10px rgba(0,229,255,0.55);
        }
        #stackit-hint {
          font-size: clamp(0.46rem, 1.1vw, 0.63rem);
          color: rgba(0,180,220,0.4); letter-spacing: 0.07em;
        }
        .stackit-btn {
          padding: 3px 10px; background: transparent;
          border: 1px solid rgba(0,229,255,0.28);
          color: rgba(0,229,255,0.7);
          font-family: 'Share Tech Mono', monospace;
          font-size: clamp(0.46rem, 1.1vw, 0.63rem);
          letter-spacing: 0.1em; cursor: pointer;
          transition: all 0.15s; white-space: nowrap;
        }
        .stackit-btn:hover {
          background: rgba(0,229,255,0.07);
          border-color: #00e5ff; color: #00e5ff;
        }
        #stackit-wrap {
          flex: 1; min-height: 0; position: relative;
          cursor: pointer; touch-action: manipulation;
        }
        #stackit-canvas { display: block; width: 100%; height: 100%; }
      </style>
      <div id="stackit-root">
        <div id="stackit-topbar">
          <div id="stackit-title">STACK IT</div>
          <div id="stackit-hint">SPACE / TAP to place · endless</div>
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

    container.querySelector('#stackit-new-btn').addEventListener('click',  () => { try { ac().resume(); } catch(e){} newGame(); });
    container.querySelector('#stackit-back-btn').addEventListener('click', () => { window.backToGameSelect?.(); });

    wrap.addEventListener('click',      handleAction);
    wrap.addEventListener('touchstart', e => { e.preventDefault(); handleAction(); }, { passive: false });

    window.addEventListener('keydown', onKey);
    window.addEventListener('resize',  resize);

    setTimeout(resize, 0);
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
    window.removeEventListener('resize',  resize);
    const screenEl = document.getElementById('stackit-screen');
    if (screenEl) screenEl.innerHTML = '';
  }

  return { init, destroy, getEndData: () => ({ score, rows: moverRow }) };
})();
