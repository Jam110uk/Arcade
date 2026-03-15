// PLINKO game module
// Auto-extracted from monolithic index.html

  </div>
</div>

<script>
export default (() => {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────────
  const GRAVITY    = 0.14;
  const BOUNCE     = 0.58;
  const FRICTION   = 0.991;
  const PEG_RADIUS = 4.5;
  const BALL_RADIUS = 22;
  const DROP_DELAY  = 140; // ms between auto-drops

  // Multiplier tables keyed by row count (outer → inner)
  const MULT_TABLES = {
    8:  [10, 3, 1.5, 1, 0.5, 1, 1.5, 3, 10],
    12: [15, 5, 3, 2, 1.5, 1, 0.5, 1, 1.5, 2, 3, 5, 15],
    16: [50, 10, 5, 3, 2, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 2, 3, 5, 10, 50],
  };

  // Slot colours: dark→bright by multiplier magnitude
  function slotColor(mult) {
    if (mult >= 20)  return { bg:'#7c1d1d', text:'#ff4d4d', glow:'rgba(255,77,77,0.7)' };
    if (mult >= 10)  return { bg:'#7c3d1d', text:'#ff8c42', glow:'rgba(255,140,66,0.7)' };
    if (mult >= 5)   return { bg:'#6b4c0e', text:'#fbbf24', glow:'rgba(251,191,36,0.7)' };
    if (mult >= 2)   return { bg:'#1a4d1a', text:'#4ade80', glow:'rgba(74,222,128,0.7)' };
    if (mult >= 1)   return { bg:'#1e3a5f', text:'#60a5fa', glow:'rgba(96,165,250,0.7)' };
    return              { bg:'#2d1d5e', text:'#a78bfa', glow:'rgba(167,139,250,0.5)' };
  }

  // ── STATE ───────────────────────────────────────────────────────────
  let canvas, ctx, W, H;
  let pegs      = [];
  let balls     = [];
  let slots     = [];
  let rowCount  = 12;
  let bet       = 10;
  let score     = 1000;
  let best      = 1000;
  let animId    = null;
  let autoMode  = false;
  let autoTimer = null;
  let dropping  = false;
  let slotH     = 0;

  // ── DOM HELPERS ─────────────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  function updateHUD() {
    $('plinko-score').textContent     = score.toLocaleString();
    $('plinko-best').textContent      = best.toLocaleString();
    $('plinko-chips-left').textContent = Math.floor(score / bet);
  }

  // ── GEOMETRY ────────────────────────────────────────────────────────
  // Board boundaries (set in buildLayout, used in physics + draw)
  let boardLeft = 0, boardRight = 0, boardTop = 0, boardBottom = 0;

  function buildLayout() {
    pegs  = [];
    slots = [];

    const mults     = MULT_TABLES[rowCount];
    const slotCount = mults.length;
    const wallW     = 6;   // visual wall thickness
    const padX      = wallW + 2;
    const topY      = 28;
    slotH = Math.min(48, H * 0.09);
    const boardH    = H - topY - slotH - 4;

    // Board inner boundaries
    boardLeft   = padX;
    boardRight  = W - padX;
    boardTop    = topY;
    boardBottom = topY + boardH;

    const colSpacing = (boardRight - boardLeft) / (slotCount - 1);
    const rowSpacing = boardH / (rowCount + 1);

    // Rectangular grid: every row has the same number of pegs (slotCount - 1),
    // alternating rows are offset by half a column for the classic staggered look
    for (let row = 0; row < rowCount; row++) {
      const stagger = (row % 2 === 0) ? 0 : colSpacing / 2;
      const pegCount = (row % 2 === 0) ? slotCount - 1 : slotCount - 2;
      for (let col = 0; col < pegCount; col++) {
        pegs.push({
          x: boardLeft + colSpacing / 2 + stagger + col * colSpacing,
          y: boardTop + (row + 1) * rowSpacing,
        });
      }
    }

    const slotY = boardTop + boardH + 4;
    for (let i = 0; i < slotCount; i++) {
      slots.push({
        x: boardLeft + i * colSpacing - colSpacing / 2,
        y: slotY,
        w: colSpacing,
        h: slotH,
        mult: mults[i],
        flash: 0,
      });
    }
  }

  // ── BALL PHYSICS ────────────────────────────────────────────────────
  function ballRadius() {
    const mults = MULT_TABLES[rowCount];
    const slotCount = mults.length;
    const colSpacing = (boardRight - boardLeft) / (slotCount - 1);
    // Large and visible, but fits between pegs
    return Math.max(10, Math.min(BALL_RADIUS, colSpacing * 0.46));
  }

  function spawnBall() {
    const mults = MULT_TABLES[rowCount];
    const slotCount = mults.length;
    const colSpacing = (boardRight - boardLeft) / (slotCount - 1);
    const jitter = (Math.random() - 0.5) * colSpacing * 0.18;
    balls.push({
      x:  W / 2 + jitter,
      y:  boardTop + 4,
      vx: (Math.random() - 0.5) * 0.2,
      vy: 0.8,
      r:  ballRadius(),
      trail: [],
      landed: false,
    });
  }

  function stepPhysics(dt = 1) {
    for (const b of balls) {
      if (b.landed) continue;

      // Save trail
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.shift();

      // Gravity + friction — scaled by dt
      b.vy += GRAVITY * dt;
      b.vx *= Math.pow(FRICTION, dt);
      b.x  += b.vx * dt;
      b.y  += b.vy * dt;

      // Wall bounce — constrain to board boundaries
      if (b.x - b.r < boardLeft)  { b.x = boardLeft  + b.r; b.vx =  Math.abs(b.vx) * BOUNCE; }
      if (b.x + b.r > boardRight) { b.x = boardRight - b.r; b.vx = -Math.abs(b.vx) * BOUNCE; }
      if (b.y - b.r < boardTop)   { b.y = boardTop   + b.r; b.vy =  Math.abs(b.vy) * BOUNCE; }

      // Peg collision
      for (const p of pegs) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minD = b.r + PEG_RADIUS;
        if (dist < minD && dist > 0.01) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = minD - dist;
          b.x += nx * overlap * 1.1;
          b.y += ny * overlap * 1.1;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx = (b.vx - 2 * dot * nx) * BOUNCE + (Math.random() - 0.5) * 1.8;
            b.vy = (b.vy - 2 * dot * ny) * BOUNCE;
            if (b.vy < -4) b.vy = -4;
          }
        }
      }

      // Minimum downward nudge — prevents ball floating horizontally forever
      if (b.vy < 0.5) b.vy += 0.08 * dt;

      // Anti-stuck: if ball barely moving, kick it hard downward
      if (!b.stuckFrames) b.stuckFrames = 0;
      if (!b.age) b.age = 0;
      b.age += dt;
      if (Math.abs(b.vx) < 1.2 && Math.abs(b.vy) < 1.2) {
        b.stuckFrames += dt;
        if (b.stuckFrames > 12) {
          b.vy += 3.5;
          b.vx  = (Math.random() - 0.5) * 2.5;
          b.stuckFrames = 0;
        }
      } else {
        b.stuckFrames = 0;
      }
      // Hard timeout: if ball has been alive 20 seconds (1200 equivalent frames) force-land it
      if (b.age > 1200) {
        b.landed = true;
      }

      // Slot detection — only trigger when ball center enters slot from above
      if (!b.landed) {
        for (const sl of slots) {
          if (
            b.vy > 0 &&
            b.y >= sl.y &&
            b.y <= sl.y + sl.h &&
            b.x >= sl.x &&
            b.x <= sl.x + sl.w
          ) {
            b.landed = true;
            b.x = sl.x + sl.w / 2;
            b.y = sl.y + sl.h / 2;
            // Award
            const win = Math.round(bet * sl.mult);
            score += win;
            if (score > best) {
              best = score;
              if (window.HS) setTimeout(() => HS.promptSubmit('plinko', best, best.toLocaleString()), 400);
            }
            $('plinko-last-val').textContent = `+${win}`;
            // Flash
            showWinFlash(`+${win} (×${sl.mult})`);
            sl.flash = 1.0;
            updateHUD();
            break;
          }
        }
      }

      // Off-screen fallthrough safety
      if (b.y > H + 40) {
        b.landed = true;
      }
    }

    // Decay slot flash
    for (const sl of slots) {
      if (sl.flash > 0) sl.flash = Math.max(0, sl.flash - 0.025);
    }

    // Fade out and fully remove landed balls — no permanent trail ghosts
    for (const b of balls) {
      if (!b.landed) continue;
      if (b.fadeAlpha === undefined) b.fadeAlpha = 0.55;
      b.fadeAlpha -= 0.02;
      b.trail = []; // clear trail the moment ball lands
    }
    balls = balls.filter(b => !b.landed || b.fadeAlpha > 0);
  }

  // ── RENDERING ───────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#050c1a';
    ctx.fillRect(0, 0, W, H);

    // Board walls
    const wallW = 6;
    ctx.save();
    // Left wall
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(boardLeft - wallW, boardTop, wallW, boardBottom - boardTop);
    // Right wall
    ctx.fillRect(boardRight, boardTop, wallW, boardBottom - boardTop);
    // Top bar
    ctx.fillRect(boardLeft - wallW, boardTop - wallW, (boardRight - boardLeft) + wallW * 2, wallW);
    // Neon edge glow
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(96,165,250,0.7)';
    ctx.shadowBlur = 8;
    ctx.strokeRect(boardLeft - wallW + 0.75, boardTop - wallW + 0.75, (boardRight - boardLeft) + wallW * 2 - 1.5, boardBottom - boardTop + wallW - 1.5);
    ctx.restore();

    // Slot labels top (row count indicator)
    ctx.fillStyle = 'rgba(245,158,11,0.15)';
    ctx.font = `bold 11px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center';

    // Draw slots
    for (const sl of slots) {
      const c = slotColor(sl.mult);
      const flashAlpha = sl.flash;

      // Slot background
      ctx.fillStyle = c.bg;
      ctx.fillRect(sl.x, sl.y, sl.w - 1, sl.h);

      // Flash overlay
      if (flashAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = flashAlpha * 0.85;
        ctx.fillStyle = c.text;
        ctx.fillRect(sl.x, sl.y, sl.w - 1, sl.h);
        ctx.restore();

        // Glow
        ctx.save();
        ctx.shadowColor = c.glow;
        ctx.shadowBlur  = 18 * flashAlpha;
        ctx.strokeStyle = c.text;
        ctx.lineWidth   = 2;
        ctx.strokeRect(sl.x + 1, sl.y + 1, sl.w - 3, sl.h - 2);
        ctx.restore();
      }

      // Multiplier text
      ctx.save();
      ctx.fillStyle = flashAlpha > 0.5 ? '#fff' : c.text;
      ctx.font = `bold ${Math.min(11, sl.w * 0.38)}px 'Orbitron', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = c.glow;
      ctx.shadowBlur  = 6;
      const label = sl.mult >= 1 ? `×${sl.mult}` : `×${sl.mult}`;
      ctx.fillText(label, sl.x + sl.w / 2, sl.y + sl.h / 2);
      ctx.restore();

      // Slot divider
      ctx.strokeStyle = 'rgba(245,158,11,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sl.x, sl.y);
      ctx.lineTo(sl.x, sl.y + sl.h);
      ctx.stroke();
    }

    // Draw pegs
    for (const p of pegs) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y,Math.max(0,PEG_RADIUS), 0, Math.PI * 2);
      ctx.fillStyle = '#1e3a5f';
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = 'rgba(96,165,250,0.7)';
      ctx.shadowBlur = 5;
      ctx.stroke();
      // Specular
      ctx.beginPath();
      ctx.arc(p.x - 1.2, p.y - 1.2,Math.max(0,PEG_RADIUS * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.shadowBlur = 0;
      ctx.fill();
      ctx.restore();
    }

    // Draw balls
    for (const b of balls) {
      // Trail
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const alpha = (i / b.trail.length) * 0.25;
        ctx.beginPath();
        ctx.arc(t.x, t.y,Math.max(0,b.r * 0.55), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,158,11,${alpha})`;
        ctx.fill();
      }

      if (b.landed) {
        // Faded landed chip
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(b.x, b.y,Math.max(0,b.r), 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.restore();
        continue;
      }

      // Main ball
      const r = Math.max(1, b.r);
      const grad = ctx.createRadialGradient(b.x - 2,b.y - 2,1,b.x,b.y,Math.max(0.01,r));
      grad.addColorStop(0, '#ffe78a');
      grad.addColorStop(0.5, '#f59e0b');
      grad.addColorStop(1, '#92400e');
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y,Math.max(0,r), 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(245,158,11,0.9)';
      ctx.shadowBlur = 12;
      ctx.fill();
      // Coin shine
      ctx.beginPath();
      ctx.arc(b.x - 2.5, b.y - 2.5,Math.max(0,b.r * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.shadowBlur = 0;
      ctx.fill();
      ctx.restore();
    }
  }

  let _plinkLastTs = 0;
  function loop(ts) {
    if (document.hidden) { animId = requestAnimationFrame(loop); return; }
    const dt = Math.min((ts - (_plinkLastTs || ts)) / (1000/60), 3);
    _plinkLastTs = ts;
    stepPhysics(dt);
    draw();
    animId = requestAnimationFrame(loop);
  }

  // ── WIN FLASH ────────────────────────────────────────────────────────
  let flashTimeout = null;
  function showWinFlash(text) {
    const el = $('plinko-last-win');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => el.classList.remove('show'), 1400);
  }

  // ── RESIZE ───────────────────────────────────────────────────────────
  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    W = wrap.clientWidth  || 400;
    H = wrap.clientHeight || 600;
    canvas.width  = W;
    canvas.height = H;
    buildLayout();
  }

  let _resizeObs = null;
  function startResizeWatch() {
    stopResizeWatch();
    _resizeObs = new ResizeObserver(() => resize());
    _resizeObs.observe(canvas.parentElement);
  }
  function stopResizeWatch() {
    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
  }

  // ── BET / ROWS BUTTONS ───────────────────────────────────────────────
  function bindControls() {
    $('plinko-bet-btns').querySelectorAll('.plinko-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bet = parseInt(btn.dataset.bet);
        $('plinko-bet-btns').querySelectorAll('.plinko-chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateHUD();
      });
    });

    $('plinko-rows-btns').querySelectorAll('.plinko-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        rowCount = parseInt(btn.dataset.rows);
        $('plinko-rows-btns').querySelectorAll('.plinko-chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        balls = [];
        buildLayout();
      });
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────
  function init() {
    canvas = $('plinko-canvas');
    ctx    = canvas.getContext('2d');
    score  = 100;
    best   = 100;
    bet    = 1;
    rowCount = 12;
    balls  = [];
    autoMode = false;

    // Reset bet/row buttons
    $('plinko-bet-btns').querySelectorAll('.plinko-chip-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.bet === '1');
    });
    $('plinko-rows-btns').querySelectorAll('.plinko-chip-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.rows === '12');
    });
    $('plinko-auto-btn').style.color = 'rgba(245,158,11,0.7)';

    bindControls();
    resize();
    startResizeWatch();
    updateHUD();

    if (animId) cancelAnimationFrame(animId);
    loop();
  }

  function destroy() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    stopResizeWatch();
    clearTimeout(flashTimeout);
    clearInterval(autoTimer);
    autoMode = false;
    balls = [];
  }

  const MAX_BALLS = 3;

  function drop() {
    if (score < bet) {
      showWinFlash('BROKE!');
      return;
    }
    const inFlight = balls.filter(b => !b.landed).length;
    if (inFlight >= MAX_BALLS) return;
    score -= bet;
    updateHUD();
    spawnBall();
  }

  function toggleAuto() {
    autoMode = !autoMode;
    const btn = $('plinko-auto-btn');
    if (autoMode) {
      btn.style.color = '#f59e0b';
      btn.style.borderColor = '#f59e0b';
      btn.style.boxShadow = '0 0 10px rgba(245,158,11,0.5)';
      // Auto-fire loop
      autoTimer = setInterval(() => {
        if (!autoMode) { clearInterval(autoTimer); return; }
        if (score >= bet) drop();
        else { toggleAuto(); }
      }, DROP_DELAY);
    } else {
      btn.style.color = 'rgba(245,158,11,0.7)';
      btn.style.borderColor = 'rgba(245,158,11,0.45)';
      btn.style.boxShadow = '';
      clearInterval(autoTimer);
    }
  }

  function newGame() {
    clearInterval(autoTimer);
    autoMode = false;
    $('plinko-auto-btn').style.color = 'rgba(245,158,11,0.7)';
    $('plinko-auto-btn').style.borderColor = 'rgba(245,158,11,0.45)';
    $('plinko-auto-btn').style.boxShadow = '';
    balls    = [];
    score    = 100;
    updateHUD();
    $('plinko-last-val').textContent = '—';
  }

  return { init, destroy, drop, toggleAuto, newGame };
})();
</script>

<!-- ============================================================
     ORBIT
     ============================================================ -->
<style>
  #orbit-screen {
    background: #050c1a;
    position: relative;
    overflow: hidden;
  }
  #orbit-screen.active { display: flex; flex-direction: column; padding: 0; }

  .orbit-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .orbit-main-row {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 0;
  }

  /* ── POWERUP BAR ── */
  .orbit-power-bar {
    flex-shrink: 0;
    height: clamp(72px, 12vh, 100px);
    background: rgba(3,8,18,0.95);
    border-top: 1px solid rgba(0,245,255,0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    gap: 12px;
  }

  #orbit-power-btn {
    flex: 1;
    max-width: 520px;
    height: 100%;
    padding: 8px 20px;
    background: rgba(0,0,0,0.4);
    border: 2px solid rgba(245,158,11,0.6);
    border-radius: 4px;
    color: #f59e0b;
    font-family: 'Share Tech Mono', monospace;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: all 0.18s;
    text-align: left;
    position: relative;
    overflow: hidden;
  }
  #orbit-power-btn:hover:not(:disabled) {
    background: rgba(245,158,11,0.12);
    border-color: #f59e0b;
    box-shadow: 0 0 20px rgba(245,158,11,0.4);
  }
  #orbit-power-btn:disabled {
    border-color: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.2);
    cursor: default;
  }
  #orbit-power-btn.active-pw {
    border-color: #00f5ff;
    color: #00f5ff;
    background: rgba(0,245,255,0.1);
    box-shadow: 0 0 20px rgba(0,245,255,0.3);
  }
  .orbit-pw-icon {
    font-size: clamp(1.6rem, 4vw, 2.4rem);
    flex-shrink: 0;
    line-height: 1;
  }
  .orbit-pw-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .orbit-pw-name {
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(0.6rem, 1.4vw, 0.85rem);
    letter-spacing: 0.15em;
    white-space: nowrap;
  }
  .orbit-pw-desc {
    font-size: clamp(0.5rem, 1vw, 0.65rem);
    color: rgba(255,255,255,0.45);
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #orbit-power-btn:disabled .orbit-pw-desc { color: rgba(255,255,255,0.15); }
  .orbit-pw-empty {
    font-size: clamp(0.55rem, 1.1vw, 0.7rem);
    color: rgba(255,255,255,0.2);
    letter-spacing: 0.12em;
    text-align: center;
    width: 100%;
  }

  /* ── SIDE PANELS ── */
  .orbit-side {
    width: clamp(80px, 12vw, 130px);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 6px;
    background: rgba(5,12,26,0.85);
    border-right: 1px solid rgba(0,245,255,0.12);
  }
  .orbit-side.right {
    border-right: none;
    border-left: 1px solid rgba(0,245,255,0.12);
  }
  .orbit-panel {
    background: rgba(0,245,255,0.04);
    border: 1px solid rgba(0,245,255,0.15);
    border-radius: 3px;
    padding: 6px 4px;
    text-align: center;
  }
  .orbit-panel-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: clamp(0.45rem, 0.9vw, 0.6rem);
    color: rgba(0,245,255,0.5);
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  .orbit-panel-value {
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(0.7rem, 1.4vw, 1rem);
    color: #00f5ff;
    letter-spacing: 0.05em;
    margin-top: 2px;
  }
  .orbit-panel-value.gold { color: #f59e0b; }
  .orbit-panel-value.green { color: #4ade80; }

  /* ── CANVAS ── */
  .orbit-canvas-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    min-width: 0;
    height: 100%;
  }
  #orbit-canvas { display: block; }

  /* ── CONTROLS ── */
  .orbit-btn {
    display: block;
    width: 100%;
    padding: 7px 4px;
    background: transparent;
    border: 1px solid rgba(0,245,255,0.4);
    color: #00f5ff;
    font-family: 'Share Tech Mono', monospace;
    font-size: clamp(0.45rem, 0.9vw, 0.62rem);
    letter-spacing: 0.1em;
    cursor: pointer;
    text-transform: uppercase;
    transition: all 0.18s;
    text-align: center;
    border-radius: 2px;
  }
  .orbit-btn:hover { background: rgba(0,245,255,0.1); box-shadow: 0 0 8px rgba(0,245,255,0.4); }
  .orbit-btn.special {
    border-color: rgba(168,85,247,0.6);
    color: #a855f7;
  }
  .orbit-btn.special:hover { background: rgba(168,85,247,0.1); box-shadow: 0 0 8px rgba(168,85,247,0.5); }
  .orbit-btn.danger-c {
    border-color: rgba(255,45,120,0.5);
    color: #ff2d78;
  }
  .orbit-btn:disabled { opacity: 0.35; cursor: default; }

  .orbit-power-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: clamp(0.4rem, 0.8vw, 0.55rem);
    color: rgba(0,245,255,0.4);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: center;
    margin-top: 6px;
    margin-bottom: 2px;
  }
  .orbit-power-pips {
    display: flex;
    justify-content: center;
    gap: 3px;
    flex-wrap: wrap;
  }
  .orbit-pip {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: rgba(0,245,255,0.15);
    border: 1px solid rgba(0,245,255,0.3);
    transition: background 0.2s;
  }
  .orbit-pip.filled { background: #00f5ff; box-shadow: 0 0 5px rgba(0,245,255,0.7); }
  .orbit-pip.bomb-pip.filled { background: #ff2d78; box-shadow: 0 0 5px rgba(255,45,120,0.7); border-color: #ff2d78; }

  /* ── OVERLAY ── */
  #orbit-overlay {
    position: absolute;
    inset: 0;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(5,12,26,0.88);
    z-index: 20;
    gap: 14px;
  }
  #orbit-overlay.show { display: flex; }
  #orbit-overlay-title {
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(1.2rem, 3vw, 2.2rem);
    color: #00f5ff;
    text-shadow: 0 0 24px rgba(0,245,255,0.8);
    letter-spacing: 0.2em;
  }
  #orbit-overlay-sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: clamp(0.7rem, 1.4vw, 1rem);
    color: rgba(0,245,255,0.6);
    letter-spacing: 0.12em;
  }
  #orbit-overlay-btn {
    margin-top: 8px;
    padding: 10px 32px;
    background: transparent;
    border: 1px solid #00f5ff;
    color: #00f5ff;
    font-family: 'Share Tech Mono', monospace;
    font-size: clamp(0.7rem, 1.4vw, 0.9rem);
    letter-spacing: 0.2em;
    cursor: pointer;
    text-transform: uppercase;
    transition: all 0.18s;
  }
  #orbit-overlay-btn:hover { background: rgba(0,245,255,0.12); box-shadow: 0 0 14px rgba(0,245,255,0.5); }

  /* ── NEXT GEM PREVIEW ── */
  #orbit-next-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: clamp(0.4rem, 0.8vw, 0.55rem);
    color: rgba(0,245,255,0.4);
    letter-spacing: 0.12em;
    text-align: center;
    text-transform: uppercase;
    margin-top: 4px;
    margin-bottom: 2px;
  }
  #orbit-next-canvas { display: block; margin: 0 auto; }

  #cr-danger-wrap { padding: 4px 2px; }
  #cr-danger-track {
    width: 100%; height: 10px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    overflow: hidden;
  }
  #cr-danger-bar {
    height: 100%; width: 0%;
    background: #4ade80;
    border-radius: 3px;
    transition: width 0.3s, background 0.3s;
  }
  #cr-danger-bar.warn   { background: #f59e0b; }
  #cr-danger-bar.danger { background: #ff2d78; box-shadow: 0 0 8px rgba(255,45,120,0.8); }
  #cr-planets-panel { transition: border-color 0.3s; }
  #cr-planets-panel.warn   { border-color: rgba(245,158,11,0.6); }
  #cr-planets-panel.danger { border-color: rgba(255,45,120,0.8); }
  #cr-planets.warn   { color: #f59e0b; }
  #cr-planets.danger { color: #ff2d78; }
</style>

<div class="screen" id="orbit-screen">
  <div class="orbit-root">
    <div class="orbit-main-row">

      <!-- LEFT PANEL -->
      <div class="orbit-side">
        <div class="orbit-panel">
          <div class="orbit-panel-label">SCORE</div>
          <div class="orbit-panel-value" id="cr-score">0</div>
        </div>
        <div class="orbit-panel">
          <div class="orbit-panel-label">BEST</div>
          <div class="orbit-panel-value gold" id="cr-best">0</div>
        </div>
        <div class="orbit-panel">
          <div class="orbit-panel-label">LEVEL</div>
          <div class="orbit-panel-value green" id="cr-level">1</div>
        </div>
        <div class="orbit-panel">
          <div class="orbit-panel-label">ORBITS</div>
          <div class="orbit-panel-value" id="cr-rings">2</div>
        </div>
        <div class="orbit-panel" id="cr-planets-panel">
          <div class="orbit-panel-label">PLANETS</div>
          <div class="orbit-panel-value" id="cr-planets">0</div>
        </div>
        <div id="cr-danger-wrap">
          <div class="orbit-panel-label" style="text-align:center;margin-bottom:3px" id="cr-danger-label">DANGER</div>
          <div id="cr-danger-track">
            <div id="cr-danger-bar"></div>
          </div>
        </div>
        <div style="margin-top:auto">
          <div class="orbit-next-label">NEXT</div>
          <canvas id="orbit-next-canvas" width="50" height="50"></canvas>
        </div>
      </div>

      <!-- CANVAS -->
      <div class="orbit-canvas-wrap">
        <canvas id="orbit-canvas"></canvas>
        <div id="orbit-overlay">
          <div id="orbit-overlay-title">ORBIT</div>
          <div id="orbit-overlay-sub">CLEAR ALL ORBITS TO ADVANCE</div>
          <button id="orbit-overlay-btn" onclick="ORBIT.start()">▶ PLAY</button>
        </div>
      </div>

      <!-- RIGHT PANEL -->
      <div class="orbit-side right">
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:5px;">
          <button class="orbit-btn" onclick="ORBIT.newGame()">🆕 RESET</button>
          <button class="orbit-btn danger-c" onclick="orbitExitToArcade()">🕹 ARCADE</button>
        </div>
      </div>

    </div>

    <!-- POWERUP BAR -->
    <div class="orbit-power-bar">
      <button id="orbit-power-btn" onclick="ORBIT.usePower()" disabled>
        <span class="orbit-pw-empty">— SHOOT A POWER-UP ITEM TO COLLECT —</span>
      </button>
    </div>

  </div>
