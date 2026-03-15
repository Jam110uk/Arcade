// PLINKO game module
// Auto-extracted from monolithic index.html

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
