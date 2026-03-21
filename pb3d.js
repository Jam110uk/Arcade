// ============================================================
// BUST-A-MOVE 3D  —  pb3d.js
// Third-person arc view: camera sits behind the cannon,
// bubbles fly into depth across Z-layered planes.
// Follows the arcade module contract:
//   export default { newGame, destroy, togglePause, getCurrentScore }
// ============================================================

export default (function () {

  // ── SFX ──────────────────────────────────────────────────────────
  const SFX = (() => {
    let ctx = null;
    function gc() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    function tone(f, d, type = 'sine', vol = 0.15, fEnd = null, delay = 0) {
      try {
        const c = gc(), o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = type;
        const t = c.currentTime + delay;
        o.frequency.setValueAtTime(f, t);
        if (fEnd != null) o.frequency.linearRampToValueAtTime(fEnd, t + d);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.start(t); o.stop(t + d + 0.01);
      } catch (_) {}
    }
    function noise(d, vol = 0.1, delay = 0) {
      try {
        const c = gc(), buf = c.createBuffer(1, c.sampleRate * d, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const s = c.createBufferSource(), g = c.createGain();
        s.buffer = buf; s.connect(g); g.connect(c.destination);
        const t = c.currentTime + delay;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        s.start(t); s.stop(t + d + 0.01);
      } catch (_) {}
    }
    return {
      shoot()   { tone(580, 0.08, 'sine', 0.14, 720); tone(400, 0.06, 'square', 0.05, 300, 0.02); },
      bounce()  { tone(320, 0.06, 'sine', 0.10, 250); },
      land()    { tone(200, 0.1, 'sine', 0.10, 170); noise(0.05, 0.04); },
      pop(n)    { tone(650 + n * 30, 0.07, 'square', 0.13); noise(0.07, 0.07); },
      floaters(n) { for (let i = 0; i < Math.min(n, 5); i++) tone(420 - i * 30, 0.13, 'sine', 0.10, 210, i * 0.05); },
      chain(n)  { for (let i = 0; i < Math.min(n, 5); i++) tone(440 * Math.pow(1.22, i), 0.11, 'square', 0.14, null, i * 0.07); },
      levelUp() { [523,659,784,1047,1319].forEach((f,i) => tone(f, 0.13, 'square', 0.14, null, i*0.09)); setTimeout(() => tone(1319, 0.4, 'sine', 0.12, 1047), 520); },
      gameOver(){ [440,370,330,262].forEach((f,i) => tone(f, 0.22, 'sine', 0.14, null, i*0.19)); },
      boss()    { [200,220,196,185].forEach((f,i) => tone(f, 0.3, 'sawtooth', 0.16, null, i*0.15)); },
      powerup() { [523,659,880].forEach((f,i) => tone(f, 0.1, 'square', 0.14, null, i*0.07)); },
      resume()  { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    };
  })();

  // ── Constants ─────────────────────────────────────────────────────
  const R           = 14;           // bubble radius (screen space)
  const D           = R * 2;
  const COLORS      = ['#ff2d78','#00f5ff','#39ff14','#ffe600','#bf00ff','#ff6a00','#ffffff'];
  const GLOWS       = ['rgba(255,45,120,.9)','rgba(0,245,255,.9)','rgba(57,255,20,.9)',
                       'rgba(255,230,0,.9)','rgba(191,0,255,.9)','rgba(255,106,0,.9)',
                       'rgba(255,255,255,.7)'];
  const COLOR_COUNT = COLORS.length - 1; // exclude white (power-up only)

  // Z-depth layers: bubbles exist on 3 depth planes.
  // Z=0 is farthest (top of screen), Z=2 is nearest (low on screen).
  const LAYERS      = 3;
  const LAYER_Y_SPACING = 0.28;     // fraction of playH between layers
  const LAYER_SCALE     = [0.72, 0.88, 1.0]; // perspective scale per layer
  const LAYER_ALPHA     = [0.82, 0.92, 1.0];

  const SHOOT_SPEED = 20;
  const LAYER_TRAVEL_MS = 320;      // ms for ball to pass through one depth layer

  // Rows per layer
  const ROWS_PER_LAYER = 4;
  const COLS_BASE      = 8;

  // Boss HP (scales with level)
  const BOSS_BASE_HP   = 15;

  // Drop timer
  const DROP_SECS = 55;

  // Power-up chance per shot (0–1)
  const POWER_CHANCE = 0.08;

  // ── Power-up types ────────────────────────────────────────────────
  const POWERS = {
    bomb:    { label: '💣 BOMB',   color: '#ff2d78', glow: 'rgba(255,45,120,1)' },
    laser:   { label: '🔫 LASER',  color: '#00f5ff', glow: 'rgba(0,245,255,1)'  },
    wild:    { label: '🌈 WILD',   color: '#ffffff', glow: 'rgba(255,255,255,1)' },
  };
  const POWER_KEYS = Object.keys(POWERS);

  // ── State ─────────────────────────────────────────────────────────
  let W = 480, H = 640, canvas, ctx;
  let grid = [];       // grid[layer][row][col] = { ci, power } | null
  let ball  = null;    // { x, y, z (0-1 depth), vx, vy, vz, ci, power, bounces, trail[] }
  let queue = [];      // [current {ci,power}, next {ci,power}]
  let heldSlot = null; // { ci, power } | null
  let canSwap = true;
  let cannonAngle = 0; // horizontal aim in radians  (0 = straight ahead)
  let cannonTilt  = -0.55; // vertical tilt (negative = up = farther depth)
  let score = 0, best = 0, level = 1;
  let chain = 0, chainTimer = 0;
  let paused = false, dead = false, won = false;
  let raf = null, lastTs = 0;
  let dropTimer = DROP_SECS * 1000;
  let elapsedMs = 0;
  let poppedAnim = [];
  let scorePopups = [];
  let bgStars = [];
  let bossMode = false;
  let bossHp = 0, bossMaxHp = 0;
  let bossX = 0, bossY = 0, bossAnim = 0;
  let bossShootTimer = 0;
  let bossDropping = []; // falling boss debris
  let activePower = null; // power-up bubble type ready to fire
  let parallaxX = 0, parallaxY = 0; // camera parallax offsets

  // Pre-rendered sprites
  const BUBBLE_SPRITES = [];
  let _bgCache = null;
  let _resizeObs = null;

  // ── Projection helpers ────────────────────────────────────────────
  // Map a [0,1] z-depth to a y-band on canvas (0=top/far, 1=bottom/near)
  function playTop()    { return H * 0.08; }
  function playBottom() { return H * 0.72; }
  function playH()      { return playBottom() - playTop(); }
  function playW()      { return W * 0.88; }
  function playLeft()   { return (W - playW()) / 2; }

  function depthToY(z) { return playTop() + z * playH(); }
  function depthScale(z) { return 0.5 + 0.5 * z; }

  // Per-layer base Y (top of that layer's row block)
  function layerBaseY(layer) {
    return playTop() + (layer / (LAYERS - 1)) * playH() * 0.75;
  }

  // Cell screen position within a layer
  function cellXY(layer, row, col) {
    const scale = LAYER_SCALE[layer];
    const r = R * scale;
    const d = D * scale;
    const rowH = r * Math.sqrt(3);
    const isOdd = row % 2 === 1;
    const cols = colsForRow(layer, row);
    const totalW = cols * d + (isOdd ? r : 0);
    const startX = W / 2 - totalW / 2 + r + (isOdd ? r : 0);
    const baseY  = layerBaseY(layer);
    const parallaxOffX = parallaxX * (1 - layer * 0.25);
    const parallaxOffY = parallaxY * (1 - layer * 0.25);
    return {
      x: startX + col * d + parallaxOffX,
      y: baseY + row * rowH + r + parallaxOffY,
      r, scale,
    };
  }

  function colsForRow(layer, row) {
    return row % 2 === 0 ? COLS_BASE : COLS_BASE - 1;
  }

  // ── Bubble sprite builder ─────────────────────────────────────────
  function buildBubbleSprites() {
    if (BUBBLE_SPRITES.length) return;
    const sz = R * 2 + 12;
    for (let ci = 0; ci < COLORS.length; ci++) {
      const oc = document.createElement('canvas');
      oc.width = oc.height = sz;
      const c = oc.getContext('2d');
      const cx = sz / 2, cy = sz / 2;
      // 3D lighting: two-tone radial gradient with strong specular
      c.shadowColor = GLOWS[ci]; c.shadowBlur = 10;
      const gr = c.createRadialGradient(cx - R * 0.38, cy - R * 0.4, R * 0.05, cx, cy, R);
      gr.addColorStop(0,    lighten(COLORS[ci], 0.65));
      gr.addColorStop(0.35, lighten(COLORS[ci], 0.25));
      gr.addColorStop(0.7,  COLORS[ci]);
      gr.addColorStop(1,    darken(COLORS[ci], 0.45));
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2);
      c.fillStyle = gr; c.fill();
      // Rim highlight
      c.shadowBlur = 0; c.strokeStyle = lighten(COLORS[ci], 0.3); c.lineWidth = 1.4; c.stroke();
      // Primary specular blob
      c.beginPath(); c.arc(cx - R * 0.3, cy - R * 0.35, R * 0.25, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.72)'; c.fill();
      // Secondary small specular
      c.beginPath(); c.arc(cx - R * 0.12, cy - R * 0.52, R * 0.09, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
      // Bottom reflection
      c.beginPath(); c.arc(cx + R * 0.2, cy + R * 0.45, R * 0.18, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
      BUBBLE_SPRITES[ci] = oc;
    }
  }

  // ── Background ────────────────────────────────────────────────────
  function buildBgCache() {
    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    const c = oc.getContext('2d');

    // Deep space base
    c.fillStyle = '#010510'; c.fillRect(0, 0, W, H);

    // Radial nebula glow
    const nb = c.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.7);
    nb.addColorStop(0, 'rgba(30,0,70,0.55)');
    nb.addColorStop(0.5, 'rgba(10,0,35,0.3)');
    nb.addColorStop(1, 'transparent');
    c.fillStyle = nb; c.fillRect(0, 0, W, H);

    // Horizon glow (perspective vanishing point)
    const hz = c.createRadialGradient(W / 2, playTop(), 0, W / 2, playTop(), W * 0.6);
    hz.addColorStop(0, 'rgba(0,245,255,0.12)');
    hz.addColorStop(0.5, 'rgba(191,0,255,0.06)');
    hz.addColorStop(1, 'transparent');
    c.fillStyle = hz; c.fillRect(0, 0, W, H);

    // Perspective grid lines (converge to vanishing point)
    const vp = { x: W / 2, y: playTop() };
    c.strokeStyle = 'rgba(0,245,255,0.06)';
    c.lineWidth = 1;
    const numLines = 10;
    for (let i = 0; i <= numLines; i++) {
      const bx = playLeft() + (i / numLines) * playW();
      c.beginPath(); c.moveTo(vp.x, vp.y); c.lineTo(bx, playBottom() + 20); c.stroke();
    }
    // Horizontal depth rings
    for (let l = 0; l < LAYERS; l++) {
      const y = layerBaseY(l);
      const scale = LAYER_SCALE[l];
      const lw = playW() * scale;
      const lx = W / 2 - lw / 2;
      c.strokeStyle = `rgba(0,245,255,${0.06 + l * 0.03})`;
      c.lineWidth = 1;
      c.strokeRect(lx, y, lw, playH() * 0.28);
    }

    // Neon side pillars
    const pilW = W * 0.045;
    const lgL = c.createLinearGradient(0, 0, pilW * 2.5, 0);
    lgL.addColorStop(0, 'rgba(0,245,255,0.28)'); lgL.addColorStop(1, 'transparent');
    c.fillStyle = lgL; c.fillRect(0, 0, pilW * 2.5, H);
    c.fillStyle = 'rgba(0,245,255,0.6)'; c.fillRect(0, 0, 2, H);

    const lgR = c.createLinearGradient(W, 0, W - pilW * 2.5, 0);
    lgR.addColorStop(0, 'rgba(255,45,120,0.28)'); lgR.addColorStop(1, 'transparent');
    c.fillStyle = lgR; c.fillRect(W - pilW * 2.5, 0, pilW * 2.5, H);
    c.fillStyle = 'rgba(255,45,120,0.6)'; c.fillRect(W - 2, 0, 2, H);

    // Top rainbow bar
    const lgT = c.createLinearGradient(0, 0, W, 0);
    lgT.addColorStop(0, 'rgba(0,245,255,0.5)');
    lgT.addColorStop(0.5, 'rgba(191,0,255,0.65)');
    lgT.addColorStop(1, 'rgba(255,45,120,0.5)');
    c.fillStyle = lgT; c.fillRect(0, 0, W, 3);

    _bgCache = oc;
  }

  // ── Grid generation ───────────────────────────────────────────────
  function generateLevel() {
    grid = [];
    const numColors = Math.min(2 + Math.floor(level * 0.7), COLOR_COUNT);
    const pal = Array.from({ length: numColors }, (_, i) => i);
    const rowsPerLayer = Math.min(ROWS_PER_LAYER + Math.floor(level / 3), 6);

    for (let layer = 0; layer < LAYERS; layer++) {
      grid[layer] = [];
      // Back layers are denser
      const rows = layer === 0 ? Math.ceil(rowsPerLayer * 0.6) : rowsPerLayer;
      for (let r = 0; r < rows; r++) {
        grid[layer][r] = [];
        const cols = colsForRow(layer, r);
        for (let c = 0; c < cols; c++) {
          // Sparse near back
          if (layer === 0 && Math.random() < 0.25) { grid[layer][r][c] = null; continue; }
          const ci = pal[Math.floor(Math.random() * pal.length)];
          const power = Math.random() < 0.05 ? POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)] : null;
          grid[layer][r][c] = { ci, power };
        }
      }
    }

    // Boss every 3 levels
    if (level % 3 === 0) {
      bossMode = true;
      bossMaxHp = BOSS_BASE_HP + (level / 3) * 8;
      bossHp = bossMaxHp;
      bossX = W / 2;
      bossY = playTop() - 10;
      bossShootTimer = 4000;
    } else {
      bossMode = false;
      bossHp = 0;
    }
  }

  function countBubbles() {
    let n = 0;
    for (const layer of grid) for (const row of (layer || [])) for (const b of (row || [])) if (b) n++;
    return n;
  }

  // ── Queue ─────────────────────────────────────────────────────────
  function makeSlot() {
    const colorsInGrid = getColorsInGrid();
    const ci = colorsInGrid.length
      ? colorsInGrid[Math.floor(Math.random() * colorsInGrid.length)]
      : Math.floor(Math.random() * COLOR_COUNT);
    const isPower = Math.random() < POWER_CHANCE;
    const power = isPower ? POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)] : null;
    return { ci: power === 'wild' ? 6 : ci, power };
  }

  function refillQueue() {
    while (queue.length < 2) queue.push(makeSlot());
    updateQueueUI();
  }

  function consumeQueue() {
    const slot = queue.shift();
    refillQueue();
    return slot;
  }

  function getColorsInGrid() {
    const s = new Set();
    for (const layer of grid) for (const row of (layer || [])) for (const b of (row || [])) if (b && b.ci < COLOR_COUNT) s.add(b.ci);
    return [...s];
  }

  // ── UI helpers ────────────────────────────────────────────────────
  function updateQueueUI() {
    drawMiniPreview('bam3d-next-canvas', queue[0]);
    drawMiniPreview('bam3d-hold-canvas', heldSlot);
  }

  function drawMiniPreview(id, slot) {
    const el = document.getElementById(id);
    if (!el) return;
    const c = el.getContext('2d');
    c.clearRect(0, 0, el.width, el.height);
    if (!slot) {
      c.strokeStyle = 'rgba(0,245,255,0.2)'; c.lineWidth = 1;
      c.beginPath(); c.arc(el.width/2, el.height/2, el.width/2-4, 0, Math.PI*2); c.stroke();
      return;
    }
    const spr = BUBBLE_SPRITES[slot.ci];
    if (spr) {
      const s = el.width - 8;
      c.drawImage(spr, 4, 4, s, s);
    }
    if (slot.power) {
      const pw = POWERS[slot.power];
      c.font = 'bold 11px Orbitron, monospace';
      c.textAlign = 'center';
      c.fillStyle = pw.color;
      c.shadowColor = pw.glow; c.shadowBlur = 6;
      c.fillText(slot.power[0].toUpperCase(), el.width/2, el.height - 3);
      c.shadowBlur = 0;
    }
  }

  function updateUI() {
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    s('bam3d-score', score.toLocaleString());
    s('bam3d-best', Math.max(score, best).toLocaleString());
    s('bam3d-level', level);
    s('bam3d-chain', chain > 1 ? `×${chain}` : '×1');
    const secs = Math.floor(elapsedMs / 1000);
    s('bam3d-time', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);

    // Drop bar
    const bar = document.getElementById('bam3d-drop-bar');
    if (bar) {
      const frac = Math.max(0, dropTimer / (DROP_SECS * 1000));
      bar.style.width = (frac * 100) + '%';
      bar.style.background = frac < 0.25 ? '#ff2d78' : frac < 0.5 ? '#ffe600' : '#00f5ff';
    }

    // Boss HP
    const bossBar = document.getElementById('bam3d-boss-bar');
    const bossWrap = document.getElementById('bam3d-boss-wrap');
    if (bossBar && bossWrap) {
      bossWrap.style.display = bossMode ? 'block' : 'none';
      if (bossMode) {
        bossBar.style.width = ((bossHp / bossMaxHp) * 100) + '%';
      }
    }

    // Power-up slot display
    const pwEl = document.getElementById('bam3d-power-slot');
    if (pwEl) {
      if (activePower) {
        const pw = POWERS[activePower];
        pwEl.textContent = pw.label;
        pwEl.style.color = pw.color;
        pwEl.style.borderColor = pw.color;
        pwEl.style.opacity = '1';
      } else {
        pwEl.textContent = '— NO POWER-UP —';
        pwEl.style.color = 'rgba(0,245,255,0.35)';
        pwEl.style.borderColor = 'rgba(0,245,255,0.15)';
        pwEl.style.opacity = '0.6';
      }
    }

    if (score > best) { best = score; localStorage.setItem('bam3d-best', best); }
  }

  // ── Shoot ─────────────────────────────────────────────────────────
  function shoot() {
    if (ball || paused || dead || won || queue.length === 0) return;
    const slot = consumeQueue();
    canSwap = true;
    SFX.resume(); SFX.shoot();

    // Z velocity: tilt drives depth travel
    const vz = Math.sin(-cannonTilt) * 0.012;   // positive = moves away
    const vx = Math.sin(cannonAngle) * SHOOT_SPEED;
    const baseVy = Math.cos(cannonTilt) * -SHOOT_SPEED * 0.6;

    ball = {
      x: W / 2,
      y: H * 0.88,
      z: 1.0,          // starts near (bottom of depth range)
      vx, vy: baseVy, vz,
      ci: slot.ci,
      power: slot.power,
      bounces: 0,
      trail: [],
      layersPassed: 0,
      targetLayer: Math.max(0, Math.min(LAYERS - 1, Math.round(vz > 0 ? LAYERS - 1 - Math.round(vz * 80) : LAYERS - 1))),
    };

    // Determine which layer the ball is heading toward based on tilt
    const tiltNorm = Math.max(0, Math.min(1, (-cannonTilt - 0.2) / 0.9));
    ball.targetLayer = Math.round(tiltNorm * (LAYERS - 1));
  }

  function swapHold() {
    if (!canSwap || paused || dead || won || ball) return;
    if (!heldSlot) {
      heldSlot = queue.shift();
      refillQueue();
    } else {
      const tmp = heldSlot;
      heldSlot = queue.shift();
      queue.unshift(tmp);
    }
    canSwap = false;
    updateQueueUI();
  }

  function usePower() {
    if (!activePower || dead || won || paused || ball) return;
    const type = activePower;
    activePower = null;
    SFX.powerup();

    if (type === 'bomb') {
      // Destroy 3×3 neighbourhood in the nearest layer
      const layer = LAYERS - 1;
      let total = 0;
      for (let r = 0; r < (grid[layer]||[]).length; r++) {
        for (let c = 0; c < colsForRow(layer, r); c++) {
          if (grid[layer][r][c]) {
            spawnPopAnim3D(layer, r, c);
            grid[layer][r][c] = null;
            total++;
          }
        }
      }
      addScore(total * 30 * level, W / 2, H * 0.5, '💣 BOMB!');
    } else if (type === 'laser') {
      // Destroy entire centre column across all layers
      let total = 0;
      for (let layer = 0; layer < LAYERS; layer++) {
        for (let r = 0; r < (grid[layer]||[]).length; r++) {
          const midC = Math.floor(colsForRow(layer, r) / 2);
          [-1, 0, 1].forEach(dc => {
            const c = midC + dc;
            if (c >= 0 && c < colsForRow(layer, r) && grid[layer][r] && grid[layer][r][c]) {
              spawnPopAnim3D(layer, r, c);
              grid[layer][r][c] = null;
              total++;
            }
          });
        }
      }
      addScore(total * 40 * level, W / 2, H * 0.4, '🔫 LASER!');
    } else if (type === 'wild') {
      // Clear all bubbles of the most common colour in any layer
      const counts = {};
      for (let l = 0; l < LAYERS; l++) for (const row of (grid[l]||[])) for (const b of (row||[])) if (b) counts[b.ci] = (counts[b.ci] || 0) + 1;
      const topCi = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
      let total = 0;
      if (topCi != null) {
        for (let l = 0; l < LAYERS; l++) {
          for (let r = 0; r < (grid[l]||[]).length; r++) {
            for (let c = 0; c < colsForRow(l, r); c++) {
              if (grid[l][r] && grid[l][r][c] && grid[l][r][c].ci === +topCi) {
                spawnPopAnim3D(l, r, c);
                grid[l][r][c] = null;
                total++;
              }
            }
          }
        }
      }
      addScore(total * 35 * level, W / 2, H * 0.4, '🌈 WILD!');
    }
    updateUI();
    if (window.FX) { FX.screenFlash('#ffe600', 0.2); FX.shake(5); }
  }

  // ── Physics update ────────────────────────────────────────────────
  function update(dt) {
    // Smooth parallax toward aim
    const targetPX = Math.sin(cannonAngle) * W * 0.03;
    const targetPY = Math.sin(-cannonTilt - 0.4) * H * 0.02;
    parallaxX += (targetPX - parallaxX) * 0.08;
    parallaxY += (targetPY - parallaxY) * 0.08;

    // Chain timer
    if (chainTimer > 0) { chainTimer -= dt; if (chainTimer <= 0) { chain = 0; updateUI(); } }

    // Drop timer
    if (!dead && !won) {
      dropTimer -= dt;
      if (dropTimer <= 0) {
        dropTimer = DROP_SECS * 1000;
        addNewFrontRow();
        if (gridTooLow()) { doGameOver(); return; }
      }
      elapsedMs += dt;
    }

    // Ball movement
    if (ball) {
      ball.trail.push({ x: ball.x, y: ball.y, z: ball.z });
      if (ball.trail.length > 8) ball.trail.shift();

      // Move ball
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.z += ball.vz;

      // Wall bounce
      const wallL = W * 0.06;
      const wallR = W * 0.94;
      if (ball.x < wallL) { ball.x = wallL; ball.vx = Math.abs(ball.vx); ball.bounces++; SFX.bounce(); }
      if (ball.x > wallR) { ball.x = wallR; ball.vx = -Math.abs(ball.vx); ball.bounces++; SFX.bounce(); }

      // Determine active layer from z (clamp)
      ball.z = Math.max(0, Math.min(1, ball.z));
      const activeLayer = Math.round((1 - ball.z) * (LAYERS - 1));

      // Collision with grid bubbles in the target layer
      let placed = false;
      const checkLayer = Math.max(0, Math.min(LAYERS - 1, activeLayer));
      for (let r = 0; r < (grid[checkLayer] || []).length && !placed; r++) {
        for (let c = 0; c < colsForRow(checkLayer, r) && !placed; c++) {
          const b = grid[checkLayer][r] && grid[checkLayer][r][c];
          if (!b) continue;
          const pos = cellXY(checkLayer, r, c);
          const dx = ball.x - pos.x, dy = ball.y - pos.y;
          const hitR = (R * pos.scale + R * LAYER_SCALE[checkLayer]) * 1.05;
          if (dx * dx + dy * dy < hitR * hitR) {
            placeBall(checkLayer);
            placed = true;
          }
        }
      }

      // Hit the back wall / ceiling of the farthest layer
      if (!placed && ball.z <= 0.01) {
        placeBall(0);
        placed = true;
      }

      // Fell off bottom or sides (missed)
      if (!placed && ball.y > H + 80) ball = null;
      if (!placed && ball.bounces > 25) { ball = null; }

      // Boss collision
      if (!placed && bossMode && ball) {
        const bdx = ball.x - bossX, bdy = ball.y - bossY;
        if (bdx * bdx + bdy * bdy < 50 * 50) {
          hitBoss();
          ball = null;
        }
      }
    }

    // Pop animations
    poppedAnim.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += p.isFloater ? 0.5 : 0.65;
      p.vx *= 0.97;
      p.alpha -= p.isFloater ? 0.018 : 0.027;
      p.scale = Math.max(0, p.scale - 0.016);
    });
    poppedAnim = poppedAnim.filter(p => p.alpha > 0 && p.y < H + 100);

    scorePopups.forEach(p => { p.y -= 1.4; p.alpha -= 0.020; });
    scorePopups = scorePopups.filter(p => p.alpha > 0);

    // Boss animations
    if (bossMode && bossHp > 0) {
      bossAnim += dt * 0.002;
      bossX = W / 2 + Math.sin(bossAnim) * W * 0.22;
      bossY = playTop() * 0.55 + Math.sin(bossAnim * 1.7) * 8;

      bossShootTimer -= dt;
      if (bossShootTimer <= 0) {
        bossShootTimer = 3500 - level * 120;
        spawnBossDebris();
      }
    }

    // Boss debris
    bossDropping.forEach(d => { d.y += d.vy; d.vy += 0.15; d.x += d.vx; d.alpha -= 0.008; });
    bossDropping = bossDropping.filter(d => d.alpha > 0 && d.y < H + 60);
  }

  // ── Snap & place ─────────────────────────────────────────────────
  function placeBall(layer) {
    if (!ball) return;
    // Find nearest free cell in this layer
    let bestRow = -1, bestCol = -1, bestDist = Infinity;
    const rows = (grid[layer] || []).length;
    const searchRows = rows + 2;
    for (let r = 0; r < searchRows; r++) {
      const cols = colsForRow(layer, r);
      for (let c = 0; c < cols; c++) {
        if (r < rows && grid[layer][r] && grid[layer][r][c]) continue;
        const pos = cellXY(layer, r, c);
        const dx = ball.x - pos.x, dy = ball.y - pos.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; bestRow = r; bestCol = c; }
      }
    }
    if (bestRow === -1) { ball = null; return; }

    // Ensure grid rows exist
    while ((grid[layer] || []).length <= bestRow) {
      if (!grid[layer]) grid[layer] = [];
      grid[layer].push(new Array(colsForRow(layer, grid[layer].length)).fill(null));
    }
    if (!grid[layer][bestRow]) grid[layer][bestRow] = [];

    // Activate power-up if bubble has one
    if (ball.power) {
      activePower = ball.power;
      SFX.powerup();
      addScore(0, ball.x, ball.y, POWERS[ball.power].label);
      ball = null;
      updateUI();
      return;
    }

    grid[layer][bestRow][bestCol] = { ci: ball.ci, power: null };
    SFX.land();

    const ci = ball.ci;
    ball = null;

    // Match
    const group = getMatchGroup(layer, bestRow, bestCol);
    if (group.length >= 3) {
      const floaters = getFloating(layer, group);
      const total = group.length + floaters.length;
      chain++;
      chainTimer = 3000;

      const pts = group.length * group.length * 12 * level * chain
                + floaters.length * 60 * level * chain;

      SFX.pop(group.length);
      if (floaters.length) setTimeout(() => SFX.floaters(floaters.length), 120);
      if (chain >= 2) setTimeout(() => SFX.chain(chain), 200);

      const avgPos = group.reduce((acc, {r,c}) => {
        const p = cellXY(layer, r, c); acc.x += p.x; acc.y += p.y; return acc;
      }, { x: 0, y: 0 });
      avgPos.x /= group.length; avgPos.y /= group.length;

      group.forEach(({r,c}) => { spawnPopAnim3D(layer, r, c); grid[layer][r][c] = null; });
      floaters.forEach(({r,c}) => { spawnPopAnim3D(layer, r, c, true); grid[layer][r][c] = null; });
      trimEmptyRows(layer);
      addScore(pts, avgPos.x, avgPos.y, chain > 1 ? `CHAIN×${chain}!` : null);

      if (window.FX) {
        group.forEach(({r,c}) => {
          const pos = cellXY(layer, r, c);
          const rect = canvas.getBoundingClientRect();
          FX.burst(
            rect.left + (pos.x / W) * rect.width,
            rect.top  + (pos.y / H) * rect.height,
            { count: 12, colors: [COLORS[ci], '#fff'], speed: 4, life: 35, size: 3, shape: 'circle', gravity: 0.12 }
          );
        });
        if (chain >= 2) { FX.screenFlash(COLORS[ci], 0.18); FX.shake(4); }
      }
    } else {
      chain = 0; chainTimer = 0;
    }

    if (countBubbles() === 0) { setTimeout(nextLevel, 700); return; }
    if (gridTooLow()) { doGameOver(); return; }
    updateUI();
  }

  function addScore(pts, x, y, label) {
    score += pts;
    if (pts > 0 || label) {
      scorePopups.push({
        x, y,
        text: label ? (pts > 0 ? `${label} +${pts}` : label) : `+${pts}`,
        alpha: 1,
        color: label ? '#ffe600' : '#ffffff',
        size: label ? 14 : 11,
      });
    }
    if (score > best) best = score;
    updateUI();
  }

  function spawnPopAnim3D(layer, r, c, isFloater = false) {
    const pos = cellXY(layer, r, c);
    const b = grid[layer] && grid[layer][r] && grid[layer][r][c];
    if (!b) return;
    const angle = Math.random() * Math.PI * 2;
    const spd = isFloater ? 1.5 + Math.random() * 2 : 3 + Math.random() * 4;
    poppedAnim.push({
      x: pos.x, y: pos.y,
      vx: Math.cos(angle) * spd * (isFloater ? 0.5 : 1),
      vy: Math.sin(angle) * spd - (isFloater ? 1.5 : 0),
      ci: b.ci,
      alpha: 1, scale: pos.scale,
      isFloater,
    });
  }

  // ── Flood fill ────────────────────────────────────────────────────
  function getMatchGroup(layer, row, col) {
    if (!grid[layer] || !grid[layer][row] || !grid[layer][row][col]) return [];
    const ci = grid[layer][row][col].ci;
    if (ci === 6) return []; // white never matches by colour
    const visited = new Set(), result = [], stack = [[row, col]];
    while (stack.length) {
      const [r, c] = stack.pop();
      const key = r + ',' + c;
      if (visited.has(key)) continue;
      if (r < 0 || r >= (grid[layer] || []).length) continue;
      if (c < 0 || c >= colsForRow(layer, r)) continue;
      if (!grid[layer][r] || !grid[layer][r][c] || grid[layer][r][c].ci !== ci) continue;
      visited.add(key); result.push({ r, c });
      stack.push(...hexNeighbors(r, c));
    }
    return result;
  }

  function getFloating(layer, justPopped) {
    const poppedKeys = new Set(justPopped.map(({ r, c }) => r + ',' + c));
    const attached = new Set();
    const q = [];
    const rows = (grid[layer] || []).length;
    for (let c = 0; c < colsForRow(layer, 0); c++) {
      const key = '0,' + c;
      if (!poppedKeys.has(key) && grid[layer][0] && grid[layer][0][c]) {
        q.push([0, c]); attached.add(key);
      }
    }
    while (q.length) {
      const [r, c] = q.shift();
      for (const [nr, nc] of hexNeighbors(r, c)) {
        const key = nr + ',' + nc;
        if (attached.has(key) || poppedKeys.has(key)) continue;
        if (nr < 0 || nr >= rows) continue;
        if (nc < 0 || nc >= colsForRow(layer, nr)) continue;
        if (!grid[layer][nr] || !grid[layer][nr][nc]) continue;
        attached.add(key); q.push([nr, nc]);
      }
    }
    const floating = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < colsForRow(layer, r); c++) {
        const key = r + ',' + c;
        if (!poppedKeys.has(key) && grid[layer][r] && grid[layer][r][c] && !attached.has(key))
          floating.push({ r, c });
      }
    }
    return floating;
  }

  function hexNeighbors(r, c) {
    const even = r % 2 === 0;
    return [
      [r - 1, even ? c - 1 : c],
      [r - 1, even ? c : c + 1],
      [r, c - 1],
      [r, c + 1],
      [r + 1, even ? c - 1 : c],
      [r + 1, even ? c : c + 1],
    ];
  }

  function trimEmptyRows(layer) {
    while ((grid[layer] || []).length && (grid[layer][grid[layer].length - 1] || []).every(b => !b))
      grid[layer].pop();
  }

  function addNewFrontRow() {
    // Adds a new row to the front (nearest) layer
    const layer = LAYERS - 1;
    const colorsInGrid = getColorsInGrid();
    if (!colorsInGrid.length) return;
    const r = 0;
    const cols = colsForRow(layer, r);
    const newRow = Array.from({ length: cols }, () => {
      const ci = colorsInGrid[Math.floor(Math.random() * colorsInGrid.length)];
      return { ci, power: null };
    });
    if (!grid[layer]) grid[layer] = [];
    grid[layer].unshift(newRow);
    if (window.FX) FX.screenFlash('#ff2d78', 0.1);
  }

  function gridTooLow() {
    const layer = LAYERS - 1;
    const rows = (grid[layer] || []).length;
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < colsForRow(layer, r); c++) {
        if (grid[layer][r] && grid[layer][r][c]) {
          const pos = cellXY(layer, r, c);
          if (pos.y + pos.r > H * 0.76) return true;
        }
      }
    }
    return false;
  }

  // ── Boss ──────────────────────────────────────────────────────────
  function hitBoss() {
    bossHp--;
    SFX.pop(3);
    if (window.FX) { FX.shake(6); FX.screenFlash('#ff2d78', 0.25); }
    addScore(100 * level, bossX, bossY, '💥 HIT!');
    spawnBossDebrisAt(bossX, bossY, 4);
    updateUI();
    if (bossHp <= 0) {
      bossMode = false;
      SFX.levelUp();
      addScore(1500 * level, W / 2, H * 0.3, '⚡ BOSS DOWN!');
      if (window.FX) { FX.confetti(W / 2, H * 0.3); FX.screenFlash('#ffe600', 0.4); }
      setTimeout(() => {
        if (countBubbles() === 0) nextLevel();
      }, 800);
    }
  }

  function spawnBossDebris() {
    spawnBossDebrisAt(bossX, bossY, 2);
  }

  function spawnBossDebrisAt(x, y, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI;
      const spd = 3 + Math.random() * 3;
      bossDropping.push({
        x, y,
        vx: Math.cos(angle + Math.PI / 2) * spd * (Math.random() > 0.5 ? 1 : -1),
        vy: Math.sin(angle) * spd * 0.5 + 1,
        ci: Math.floor(Math.random() * COLOR_COUNT),
        alpha: 1, r: R * 0.75,
      });
    }
  }

  // ── Game flow ─────────────────────────────────────────────────────
  function nextLevel() {
    score += 1000 * level;
    level++;
    dropTimer = DROP_SECS * 1000;
    chain = 0; chainTimer = 0;
    heldSlot = null; canSwap = true; queue = [];
    activePower = null;
    bossDropping = [];
    generateLevel();
    refillQueue();
    won = false;
    hideOverlay();
    updateUI();
    SFX.levelUp();
    if (window.FX) { FX.confetti(W / 2, H * 0.3); FX.screenFlash('#39ff14', 0.25); }
  }

  function doGameOver() {
    dead = true;
    SFX.gameOver();
    if (window.FX) { FX.screenFlash('#ff2d78', 0.5); FX.shake(10); }
    showOverlay('lose', 'GAME OVER', score, `Level ${level}`, [
      { label: '🔄 RETRY', fn: 'window.BAM3D?.newGame()' },
      { label: '🕹 ARCADE', fn: 'backToGameSelect()' },
    ]);
    if (score > 0) setTimeout(() => window.HS?.promptSubmit('bustamove3d', score, score.toLocaleString()), 500);
  }

  function newGame() {
    if (!canvas) init();
    score = 0;
    best = parseInt(localStorage.getItem('bam3d-best') || '0') || 0;
    level = 1; chain = 0; chainTimer = 0;
    paused = false; dead = false; won = false;
    ball = null; poppedAnim = []; scorePopups = []; bossDropping = [];
    heldSlot = null; canSwap = true; queue = [];
    activePower = null;
    dropTimer = DROP_SECS * 1000;
    elapsedMs = 0;
    cannonAngle = 0; cannonTilt = -0.55;
    parallaxX = 0; parallaxY = 0;
    generateLevel();
    refillQueue();
    hideOverlay();
    updateUI();
    resize();
    if (!raf) loop();
  }

  function destroy() {
    dead = true;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
    if (canvas) {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  }

  function togglePause() {
    if (dead || won) return;
    paused = !paused;
    const btn = document.getElementById('bam3d-pause-btn');
    if (btn) btn.textContent = paused ? '▶' : '⏸';
    if (paused) showOverlay('pause', 'PAUSED', null, 'Game paused', [
      { label: '▶ RESUME', fn: 'window.BAM3D?.togglePause()' },
      { label: '🆕 NEW', fn: 'window.BAM3D?.newGame()' },
    ]);
    else hideOverlay();
  }

  // ── Overlay ───────────────────────────────────────────────────────
  function showOverlay(type, title, sc, msg, btns) {
    const ov = document.getElementById('bam3d-overlay');
    if (!ov) return;
    ov.classList.add('active');
    const t = document.getElementById('bam3d-ov-title');
    if (t) { t.textContent = title; t.className = 'bam3d-ov-title ' + type; }
    const scEl = document.getElementById('bam3d-ov-score');
    if (scEl) scEl.textContent = sc != null ? sc.toLocaleString() + ' pts' : '';
    const msgEl = document.getElementById('bam3d-ov-msg');
    if (msgEl) msgEl.textContent = msg || '';
    const bd = document.getElementById('bam3d-ov-btns');
    if (bd) bd.innerHTML = (btns || []).map(b =>
      `<button class="${b.label.includes('ARCADE') ? 'arcade-back-btn' : 'bam3d-btn'}" onclick="${b.fn}">${b.label}</button>`
    ).join('');
  }

  function hideOverlay() {
    const ov = document.getElementById('bam3d-overlay');
    if (ov) ov.classList.remove('active');
  }

  // ── Draw ──────────────────────────────────────────────────────────
  function draw() {
    if (!ctx) return;
    const now = Date.now();
    ctx.clearRect(0, 0, W, H);

    // Background
    if (_bgCache) ctx.drawImage(_bgCache, 0, 0);
    else { ctx.fillStyle = '#010510'; ctx.fillRect(0, 0, W, H); }

    // Twinkling stars
    bgStars.forEach(s => {
      s.tw += s.ts;
      const a = s.a * (0.5 + 0.5 * Math.sin(s.tw));
      ctx.fillStyle = `rgba(180,220,255,${a.toFixed(2)})`;
      ctx.fillRect(s.x * W - s.r, s.y * H - s.r, s.r * 2, s.r * 2);
    });

    // Depth layer labels (faint, in the grid area)
    const layerLabels = ['FAR', 'MID', 'NEAR'];
    ctx.font = 'bold 9px Orbitron, monospace';
    ctx.textAlign = 'left';
    for (let l = 0; l < LAYERS; l++) {
      const y = layerBaseY(l) + 8;
      ctx.fillStyle = `rgba(0,245,255,${0.10 + l * 0.06})`;
      ctx.fillText(layerLabels[l], W * 0.055, y);
    }

    // Draw grid bubbles back-to-front (far layer first)
    for (let l = 0; l < LAYERS; l++) {
      drawLayer(l, now);
    }

    // Boss
    if (bossMode && bossHp > 0) drawBoss(now);

    // Boss debris
    bossDropping.forEach(d => {
      if (d.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = d.alpha;
      drawBubble3D(ctx, d.x, d.y, d.r, d.ci);
      ctx.restore();
    });

    // Flying ball
    if (ball) drawBall(now);

    // Aim guide
    if (!ball && !paused && !dead && !won) drawAimGuide();

    // Cannon
    drawCannon(now);

    // Pop animations
    poppedAnim.forEach(p => {
      if (p.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      drawBubble3D(ctx, p.x, p.y, R * p.scale, p.ci);
      ctx.restore();
    });

    // Score popups
    scorePopups.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.font = `bold ${p.size || 12}px Orbitron, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color || '#ffe600';
      ctx.shadowColor = p.color || '#ffe600'; ctx.shadowBlur = 10;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    });

    // Danger zone dashed line at front layer boundary
    const dangerY = H * 0.75;
    const pulse = 0.45 + 0.4 * Math.sin(now * 0.004);
    ctx.save();
    ctx.strokeStyle = `rgba(255,210,0,${0.5 + pulse * 0.35})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(0, dangerY); ctx.lineTo(W, dangerY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,200,0,${0.55 + pulse * 0.3})`;
    ctx.font = '12px serif'; ctx.textAlign = 'left';
    ctx.globalAlpha = 0.6 + pulse * 0.3;
    ctx.fillText('☠', 4, dangerY + 4);
    ctx.textAlign = 'right';
    ctx.fillText('☠', W - 4, dangerY + 4);
    ctx.restore();

    // Drop bar top strip
    const dropFrac = Math.max(0, dropTimer / (DROP_SECS * 1000));
    const barColor = dropFrac < 0.25 ? '#ff2d78' : dropFrac < 0.5 ? '#ffe600' : '#00f5ff';
    ctx.fillStyle = barColor;
    ctx.fillRect(0, 0, W * dropFrac, 3);

    // Scanlines
    ctx.save(); ctx.globalAlpha = 0.03;
    for (let y = 0; y < H; y += 4) { ctx.fillStyle = '#000'; ctx.fillRect(0, y, W, 2); }
    ctx.restore();
  }

  function drawLayer(l, now) {
    const rows = (grid[l] || []).length;
    for (let r = rows - 1; r >= 0; r--) { // draw bottom rows first for correct overlap
      const cols = colsForRow(l, r);
      for (let c = 0; c < cols; c++) {
        const b = grid[l][r] && grid[l][r][c];
        if (!b) continue;
        const pos = cellXY(l, r, c);
        ctx.save();
        ctx.globalAlpha = LAYER_ALPHA[l];
        drawBubble3D(ctx, pos.x, pos.y, pos.r, b.ci);
        // Power-up indicator
        if (b.power) {
          const pw = POWERS[b.power];
          ctx.shadowColor = pw.glow; ctx.shadowBlur = 8;
          ctx.font = `bold ${Math.round(pos.r * 0.9)}px serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(b.power === 'bomb' ? '💣' : b.power === 'laser' ? '🔫' : '🌈', pos.x, pos.y);
          ctx.textBaseline = 'alphabetic';
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }
  }

  function drawBubble3D(c, x, y, r, ci) {
    const spr = BUBBLE_SPRITES[ci];
    if (spr && Math.abs(r - R) < 0.5) {
      const sz = spr.width;
      c.drawImage(spr, x - sz / 2, y - sz / 2);
      return;
    }
    // Scaled path
    c.save();
    const gr = c.createRadialGradient(x - r * 0.38, y - r * 0.4, r * 0.04, x, y, r);
    gr.addColorStop(0, lighten(COLORS[ci], 0.65));
    gr.addColorStop(0.35, lighten(COLORS[ci], 0.25));
    gr.addColorStop(0.7, COLORS[ci]);
    gr.addColorStop(1, darken(COLORS[ci], 0.45));
    c.shadowColor = GLOWS[ci]; c.shadowBlur = r * 0.6;
    c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
    c.fillStyle = gr; c.fill();
    c.shadowBlur = 0; c.strokeStyle = lighten(COLORS[ci], 0.25); c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.26, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.72)'; c.fill();
    c.restore();
  }

  function drawBall(now) {
    if (!ball) return;
    // Trail
    ball.trail.forEach((tp, i) => {
      const t = (i + 1) / ball.trail.length;
      // Scale and alpha based on z depth
      const zScale = depthScale(tp.z ?? 0.5);
      ctx.save(); ctx.globalAlpha = t * 0.3;
      drawBubble3D(ctx, tp.x, tp.y, R * zScale * t * 0.7, ball.ci);
      ctx.restore();
    });
    // Ball itself — squash-stretch along velocity direction
    const zScale = depthScale(ball.z);
    const angle = Math.atan2(ball.vy, ball.vx);
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(angle);
    ctx.scale(1.2, 0.82);
    ctx.rotate(-angle);
    ctx.translate(-ball.x, -ball.y);
    ctx.globalAlpha = 0.9 + 0.1 * zScale;
    drawBubble3D(ctx, ball.x, ball.y, R * zScale, ball.ci);
    if (ball.power) {
      const pw = POWERS[ball.power];
      ctx.font = `bold ${Math.round(R * zScale * 0.85)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = pw.glow; ctx.shadowBlur = 8;
      ctx.fillText(ball.power === 'bomb' ? '💣' : ball.power === 'laser' ? '🔫' : '🌈', ball.x, ball.y);
      ctx.textBaseline = 'alphabetic'; ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawCannon(now) {
    const cx = W / 2;
    const cy = H * 0.895;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
    const ci = queue[0]?.ci ?? 0;

    // Platform / base
    ctx.save();
    ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 10 * pulse;
    const base = ctx.createRadialGradient(cx, cy, 4, cx, cy, 26);
    base.addColorStop(0, '#1a3a5a'); base.addColorStop(1, '#0a1e30');
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,245,255,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Barrel (rotates with horizontal + tilt)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cannonAngle);
    // Tilt baked into barrel length visual
    const tiltFactor = Math.abs(cannonTilt) / 1.2;
    const barrelLen = 34 + tiltFactor * 10;
    const barrelW  = 9;
    ctx.shadowColor = GLOWS[ci]; ctx.shadowBlur = 6;
    const barGrad = ctx.createLinearGradient(-barrelW, 0, barrelW, 0);
    barGrad.addColorStop(0, '#c8e8ff'); barGrad.addColorStop(0.5, '#2266aa'); barGrad.addColorStop(1, '#0a1832');
    ctx.fillStyle = barGrad;
    if (ctx.roundRect) ctx.roundRect(-barrelW/2, -barrelLen, barrelW, barrelLen, 4);
    else ctx.rect(-barrelW/2, -barrelLen, barrelW, barrelLen);
    ctx.fill();
    ctx.strokeStyle = COLORS[ci]; ctx.lineWidth = 1.5; ctx.stroke();
    // Muzzle glow ring
    ctx.shadowBlur = 8; ctx.fillStyle = COLORS[ci];
    ctx.beginPath(); ctx.arc(0, -barrelLen, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Active bubble in cannon
    ctx.save();
    ctx.shadowColor = GLOWS[ci]; ctx.shadowBlur = 8 * pulse;
    drawBubble3D(ctx, cx, cy, R - 3, ci);
    ctx.restore();

    // NEXT bubble (right of cannon)
    if (queue.length > 1) {
      const nx = cx + 54, ny = cy + 4;
      ctx.save(); ctx.globalAlpha = 0.85;
      drawBubble3D(ctx, nx, ny, R * 0.6, queue[1].ci);
      ctx.globalAlpha = 0.5;
      ctx.font = 'bold 7px Share Tech Mono, monospace';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('NEXT', nx, ny + R * 0.6 + 7);
      ctx.restore();
    }

    // HOLD bubble (left of cannon)
    if (heldSlot) {
      const hx = cx - 54, hy = cy + 4;
      ctx.save(); ctx.globalAlpha = 0.85;
      drawBubble3D(ctx, hx, hy, R * 0.6, heldSlot.ci);
      ctx.globalAlpha = 0.5;
      ctx.font = 'bold 7px Share Tech Mono, monospace';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('HOLD', hx, hy + R * 0.6 + 7);
      ctx.restore();
    }

    // Tilt indicator (small arc showing depth aim)
    const tiltArcR = 38;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(0,245,255,0.22)'; ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, tiltArcR, -Math.PI * 0.9, -Math.PI * 0.1);
    ctx.stroke();
    ctx.setLineDash([]);
    // Tilt dot
    const tiltNorm = Math.max(0, Math.min(1, (-cannonTilt - 0.2) / 0.9));
    const tiltA    = -Math.PI * 0.9 + tiltNorm * Math.PI * 0.8;
    ctx.fillStyle = '#00f5ff'; ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(Math.cos(tiltA) * tiltArcR, Math.sin(tiltA) * tiltArcR, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawAimGuide() {
    const cx = W / 2;
    const cy = H * 0.895;
    const ci = queue[0]?.ci ?? 0;

    // Horizontal aim ray
    let x = cx, y = cy;
    const vx = Math.sin(cannonAngle) * SHOOT_SPEED;
    const vy = -Math.abs(Math.cos(cannonTilt)) * SHOOT_SPEED;
    const wallL = W * 0.06, wallR = W * 0.94;
    const points = [{ x, y }];

    for (let i = 0; i < 80; i++) {
      x += vx; y += vy;
      if (x < wallL) { x = wallL; points.push({ x, y }); }
      if (x > wallR) { x = wallR; points.push({ x, y }); }
      if (y < playTop()) { points.push({ x, y: playTop() }); break; }
      points.push({ x, y });
    }

    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,0.45)`;
    ctx.lineWidth = 1.8; ctx.setLineDash([6, 10]);
    ctx.shadowColor = GLOWS[ci]; ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Depth layer indicator — pulse on the layer the ball will land in
    const tiltNorm = Math.max(0, Math.min(1, (-cannonTilt - 0.2) / 0.9));
    const targetL = Math.round(tiltNorm * (LAYERS - 1));
    const ly = layerBaseY(targetL);
    ctx.strokeStyle = `rgba(0,245,255,0.45)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(W * 0.06, ly); ctx.lineTo(W * 0.94, ly); ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  function drawBoss(now) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
    const hpFrac = bossHp / bossMaxHp;
    const bossR = 40 + Math.sin(bossAnim * 2) * 3;

    ctx.save();

    // Boss outer glow ring
    ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 20 * pulse;
    const bossGlow = ctx.createRadialGradient(bossX, bossY, bossR * 0.4, bossX, bossY, bossR);
    bossGlow.addColorStop(0, 'rgba(255,45,120,0.22)');
    bossGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = bossGlow;
    ctx.beginPath(); ctx.arc(bossX, bossY, bossR * 1.5, 0, Math.PI * 2); ctx.fill();

    // Boss body — polygon shape
    ctx.beginPath();
    const sides = 6;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 + bossAnim * 0.5;
      const r2 = bossR * (0.88 + 0.12 * Math.sin(bossAnim * 3 + i));
      const px = bossX + Math.cos(a) * r2;
      const py = bossY + Math.sin(a) * r2;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    const bossBodyGrad = ctx.createRadialGradient(bossX - 10, bossY - 10, 5, bossX, bossY, bossR);
    bossBodyGrad.addColorStop(0, '#ff6aaa');
    bossBodyGrad.addColorStop(0.5, '#cc0055');
    bossBodyGrad.addColorStop(1, '#550022');
    ctx.fillStyle = bossBodyGrad;
    ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 15;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,45,120,${0.6 + pulse * 0.4})`; ctx.lineWidth = 2; ctx.stroke();

    // Boss eye
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(bossX, bossY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff0044';
    const eyeX = bossX + Math.sin(bossAnim * 1.2) * 4;
    const eyeY = bossY + Math.cos(bossAnim * 0.8) * 4;
    ctx.beginPath(); ctx.arc(eyeX, eyeY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(eyeX + 2, eyeY - 2, 3, 0, Math.PI * 2); ctx.fill();

    // Boss HP bar
    const barW = bossR * 2.5;
    const barH = 7;
    const barX = bossX - barW / 2;
    const barY = bossY + bossR + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    const hpColor = hpFrac > 0.5 ? '#39ff14' : hpFrac > 0.25 ? '#ffe600' : '#ff2d78';
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor; ctx.shadowBlur = 6;
    ctx.fillRect(barX, barY, barW * hpFrac, barH);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // Boss label
    ctx.font = 'bold 10px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff2d78'; ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 8;
    ctx.fillText('⚡ BOSS', bossX, barY + barH + 12);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ── Input ─────────────────────────────────────────────────────────
  let leftHeld = false, rightHeld = false, upHeld = false, downHeld = false;
  const AIM_SPEED = 0.035;
  const TILT_SPEED = 0.025;

  function updateAimFromClient(clientX, clientY) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * (W / rect.width);
    const my = (clientY - rect.top)  * (H / rect.height);
    const cx = W / 2, cy = H * 0.895;
    const dx = mx - cx, dy = my - cy;
    // Horizontal angle from horizontal drag
    cannonAngle = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, Math.atan2(dx, -dy) * 0.7));
    // Vertical tilt from vertical position
    const normY = 1 - Math.max(0, Math.min(1, (cy - my) / (cy - playTop())));
    cannonTilt = -0.2 - normY * 0.85;
  }

  function onMouseMove(e) { if (!paused && !dead) updateAimFromClient(e.clientX, e.clientY); }
  function onCanvasClick(e) {
    if (paused || dead || won) return;
    updateAimFromClient(e.clientX, e.clientY);
    shoot();
  }
  function onTouchMove(e) {
    if (paused || dead) return;
    e.preventDefault();
    const t = e.touches[0];
    updateAimFromClient(t.clientX, t.clientY);
  }
  function onTouchEnd(e) { if (!paused && !dead && !won) shoot(); }

  function onKeyDown(e) {
    const scr = document.getElementById('bustamove3d-screen');
    if (!scr || !scr.classList.contains('active')) return;
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A': leftHeld  = true; e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': rightHeld = true; e.preventDefault(); break;
      case 'ArrowUp':    case 'w': case 'W': upHeld    = true; e.preventDefault(); break;
      case 'ArrowDown':  case 's': case 'S': downHeld  = true; e.preventDefault(); break;
      case ' ':                              shoot();            e.preventDefault(); break;
      case 'z': case 'Z':                    swapHold();         e.preventDefault(); break;
      case 'x': case 'X':                    usePower();         e.preventDefault(); break;
      case 'p': case 'P':                    togglePause();      break;
    }
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') leftHeld  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightHeld = false;
    if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') upHeld    = false;
    if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') downHeld  = false;
  }

  // ── Init & resize ─────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('bam3d-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    buildBubbleSprites();
    bgStars = Array.from({ length: 70 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.3 + 0.3,
      a: Math.random() * 0.5 + 0.1,
      tw: Math.random() * Math.PI * 2,
      ts: Math.random() * 0.03 + 0.005,
    }));

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    _resizeObs = new ResizeObserver(() => resize());
    _resizeObs.observe(canvas.parentElement || canvas);

    resize();
  }

  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    W = (wrap ? wrap.clientWidth : 480) || 480;
    H = (wrap ? wrap.clientHeight : 640) || 640;
    canvas.width = W;
    canvas.height = H;
    buildBgCache();
    if (!raf) draw();
  }

  // ── Game loop ─────────────────────────────────────────────────────
  function loop(ts = 0) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;
    if (leftHeld)  cannonAngle = Math.max(-Math.PI * 0.45, cannonAngle - AIM_SPEED);
    if (rightHeld) cannonAngle = Math.min( Math.PI * 0.45, cannonAngle + AIM_SPEED);
    if (upHeld)    cannonTilt  = Math.max(-1.1, cannonTilt - TILT_SPEED);
    if (downHeld)  cannonTilt  = Math.min(-0.2, cannonTilt + TILT_SPEED);
    if (!paused && !dead) update(dt);
    draw();
    if (!dead && !paused) updateUI();
  }

  // ── Colour helpers ────────────────────────────────────────────────
  function lighten(hex, a) {
    const [r, g, b] = hr(hex);
    return `rgb(${Math.min(255, r + ~~(255 * a))},${Math.min(255, g + ~~(255 * a))},${Math.min(255, b + ~~(255 * a))})`;
  }
  function darken(hex, a) {
    const [r, g, b] = hr(hex);
    return `rgb(${Math.max(0, r - ~~(255 * a))},${Math.max(0, g - ~~(255 * a))},${Math.max(0, b - ~~(255 * a))})`;
  }
  function hr(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  return { newGame, destroy, togglePause, getCurrentScore: () => score };
})();
