// PB game module
// Auto-extracted from monolithic index.html

export default (function() {

  // ── Integrated GPU detection ──────────────────────────────────
  // Reads the WebGL renderer string from a throwaway canvas — instant, zero cost.
  // Used only to throttle the game loop and skip expensive per-frame effects on
  // known integrated / mobile GPUs. Discrete GPUs are completely unaffected.
  const _igpu = (() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return false;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return false;
      const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toLowerCase();
      return /intel|hd graphics|uhd graphics|iris|adreno|mali|powervr|videocore/.test(r);
    } catch (_) { return false; }
  })();

  // ── SFX Engine ────────────────────────────────────────────────
  const SFX = (() => {
    let ctx = null;
    function getCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(()=>{});
      return ctx;
    }
    function tone(freq, dur, type='square', vol=0.18, freqEnd=null, delay=0) {
      try {
        const c = getCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.connect(gain); gain.connect(c.destination);
        osc.type = type;
        const t = c.currentTime + delay;
        osc.frequency.setValueAtTime(freq, t);
        if (freqEnd != null) osc.frequency.linearRampToValueAtTime(freqEnd, t + dur);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t); osc.stop(t + dur + 0.01);
      } catch(e) {}
    }
    // Pre-allocated noise buffer — created once, reused for every noise() call
    let _noiseBuf = null;
    function _getNoiseBuf(c) {
      if (!_noiseBuf || _noiseBuf.sampleRate !== c.sampleRate) {
        const maxDur = 0.2;
        _noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * maxDur), c.sampleRate);
        const d = _noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return _noiseBuf;
    }
    function noise(dur, vol=0.12, delay=0) {
      try {
        const c = getCtx();
        const src = c.createBufferSource();
        src.buffer = _getNoiseBuf(c);
        src.loop = false;
        const gain = c.createGain();
        src.connect(gain); gain.connect(c.destination);
        const t = c.currentTime + delay;
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.start(t); src.stop(t + dur + 0.01);
      } catch(e) {}
    }
    return {
      shoot()   { tone(520, 0.07, 'sine', 0.14, 680); },
      bounce()  { tone(300, 0.05, 'sine', 0.10, 240); },
      land()    { tone(180, 0.08, 'sine', 0.10, 160); },
      pop(n)    {
        // n = number of bubbles popped — pitched higher for bigger pops
        const freq = 600 + Math.min(n, 8) * 40;
        tone(freq, 0.06, 'square', 0.13);
        noise(0.06, 0.07);
      },
      floaters(n) {
        // Cascading drops
        for (let i=0; i<Math.min(n,6); i++) tone(400 - i*35, 0.12, 'sine', 0.10, 200-i*20, i*0.04);
      },
      chain(n)  {
        // Ascending fanfare per chain level
        const base = 440;
        for (let i=0; i<Math.min(n,5); i++) tone(base * Math.pow(1.2, i), 0.10, 'square', 0.14, null, i*0.07);
      },
      levelUp() {
        [523,659,784,1047,1319].forEach((f,i) => tone(f, 0.12, 'square', 0.15, null, i*0.09));
        setTimeout(()=>tone(1319, 0.4, 'sine', 0.12, 1047), 500);
      },
      gameOver() {
        [440,370,330,262].forEach((f,i) => tone(f, 0.22, 'sine', 0.14, null, i*0.18));
      },
      resume()  { if (ctx && ctx.state==='suspended') ctx.resume().catch(()=>{}); },
    };
  })();

  // ── Constants ─────────────────────────────────────────────────
  const R          = 13;
  const D          = R * 2;
  const ROW_H      = R * Math.sqrt(3);
  const SHOOT_SPEED = 22;
  const MAX_BOUNCES = 30;

  // Columns are computed dynamically from canvas width in colsForRow()
  // so the grid always fills wall-to-wall inside the pillars
  function colsEven() { return Math.floor((_playW()) / D); }
  function colsOdd()  { return Math.floor((_playW() - R) / D); }
  function _playW()   { return W - Math.max(6, W * 0.045) * 2; }
  const COLORS = ['#ff2d78','#00f5ff','#39ff14','#ffe600','#bf00ff','#ff6a00','#ffffff'];
  const GLOWS  = [
    'rgba(255,45,120,.9)','rgba(0,245,255,.9)','rgba(57,255,20,.9)',
    'rgba(255,230,0,.9)','rgba(191,0,255,.9)','rgba(255,106,0,.9)',
    'rgba(255,255,255,.7)',
  ];

  // ── Pre-rendered bubble sprites (avoids radialGradient per draw call) ─────
  const BUBBLE_SPRITES = [];
  function buildBubbleSprites() {
    const sz = R * 2 + 8; // canvas size with glow padding
    for (let ci = 0; ci < COLORS.length; ci++) {
      const oc = document.createElement('canvas');
      oc.width = oc.height = sz;
      const oc2d = oc.getContext('2d');
      const cx = sz / 2, cy = sz / 2;
      oc2d.shadowColor = GLOWS[ci]; oc2d.shadowBlur = 8;
      const gr = oc2d.createRadialGradient(cx - R*0.32,cy - R*0.36,Math.max(0.01,R*0.04),cx,cy,Math.max(0.01,R));
      gr.addColorStop(0, lighten(COLORS[ci], 0.55));
      gr.addColorStop(0.55, COLORS[ci]);
      gr.addColorStop(1, darken(COLORS[ci], 0.4));
      oc2d.beginPath(); oc2d.arc(cx, cy,Math.max(0,R), 0, Math.PI*2);
      oc2d.fillStyle = gr; oc2d.fill();
      oc2d.shadowBlur = 4; oc2d.strokeStyle = lighten(COLORS[ci], 0.22);
      oc2d.lineWidth = 1.1; oc2d.stroke(); oc2d.shadowBlur = 0;
      // Specular highlight
      oc2d.beginPath(); oc2d.arc(cx - R*0.28, cy - R*0.32,Math.max(0,R*0.2), 0, Math.PI*2);
      oc2d.fillStyle = 'rgba(255,255,255,0.65)'; oc2d.fill();
      BUBBLE_SPRITES[ci] = oc;
    }
  }
  const COLOR_NAMES = ['PINK','CYAN','GREEN','GOLD','VIOLET','ORANGE','WHITE'];

  // Descent timer — grid drops every N seconds
  const DROP_SECS  = 60;  // seconds between grid drops
  const CEILING_PAD = 6;  // px from top

  // Shooter sits near canvas bottom; grid game-over zone is well above it
  const CANNON_PAD  = 30;  // px from canvas bottom to cannon centre
  const CLEAR_ROWS  = 5;   // number of bubble-row heights to keep clear above cannon

  // ── State ──────────────────────────────────────────────────────
  let W = 320, H = 540, canvas, ctx;
  let nextCanvas, nextCtx, holdCanvas, holdCtx;
  let elCharLeft, elCharRight;  // cached character elements
  let grid = [];            // grid[row][col] = {ci} or null
  let ball  = null;         // flying bubble {x,y,vx,vy,ci,bounces}
  let queue = [];           // [current ci, next ci]
  let heldCi = -1;          // held bubble color
  let canSwap = true;       // prevent double-swap
  let cannonAngle = -Math.PI / 2;
  let score = 0, best = 0, level = 1;
  let chain = 0, chainTimer = 0;
  let paused = false, dead = false, won = false;
  let raf = null;
  let dropTimer = DROP_SECS * 1000;
  let lastTs = 0;
  let startTime = 0;
  let elapsedMs = 0;
  let poppedAnim = [];
  let scorePopups = [];
  let bgStars = [];

  // Cached background offscreen canvas — rebuilt on resize only
  let _pbBgCache = null;
  // Cached scanline overlay — rebuilt on resize only
  let _scanlineCache = null;
  // Cached danger gradient — rebuilt when dangerY changes (i.e. on resize)
  let _dangerGradCache = null, _dangerGradY = null;
  // Cached column counts per row — invalidated on resize
  let _colsEvenCache = 0, _colsOddCache = 0;

  // Keyboard aim
  let leftHeld  = false;
  let rightHeld = false;
  const AIM_SPEED = 0.04;

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('pb-canvas');
    ctx    = canvas.getContext('2d');
    nextCanvas = document.getElementById('bam-next-canvas');
    nextCtx    = nextCanvas ? nextCanvas.getContext('2d') : null;
    holdCanvas = document.getElementById('bam-hold-canvas');
    elCharLeft  = elCharLeft;
    elCharRight = elCharRight;
    if (!BUBBLE_SPRITES.length) buildBubbleSprites();
    if (!_cannonBaseSprite) _buildCannonSprites();
    holdCtx    = holdCanvas ? holdCanvas.getContext('2d') : null;

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click',     onCanvasClick);
    canvas.addEventListener('touchmove', onTouchMove, {passive:false});
    canvas.addEventListener('touchend',  onTouchEnd,  {passive:true});
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // Generate bg stars — half as many on iGPU to save per-frame trig cost
    bgStars = Array.from({length: _igpu ? 30 : 60}, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random()*1.2+0.3, a: Math.random()*0.5+0.1,
      tw: Math.random()*Math.PI*2, ts: Math.random()*0.03+0.005,
    }));

    resize();
  }

  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    W = wrap.clientWidth  || 320;
    H = wrap.clientHeight || 540;
    canvas.width  = W;
    canvas.height = H;
    // Rebuild cached col counts
    _colsEvenCache = Math.floor(_playW() / D);
    _colsOddCache  = Math.floor((_playW() - R) / D);
    // Rebuild background cache
    _buildBgCache();
    _scanlineCache = null;   // will be rebuilt on first draw at new size
    _dangerGradCache = null; _dangerGradY = null;
    rebuildGridPositions();
    draw();
  }

  function _buildBgCache() {
    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    const c = oc.getContext('2d');
    // Base fill
    c.fillStyle = '#010510'; c.fillRect(0,0,W,H);
    // Gradient overlay
    const bg = c.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'rgba(20,0,60,0.85)');
    bg.addColorStop(0.5,'rgba(10,0,35,0.6)');
    bg.addColorStop(1,'rgba(0,10,30,0.4)');
    c.fillStyle = bg; c.fillRect(0,0,W,H);
    // Pillars
    const pillarW = Math.max(6, W * 0.045);
    const lgL = c.createLinearGradient(0,0,pillarW*2,0);
    lgL.addColorStop(0,'rgba(0,245,255,0.25)'); lgL.addColorStop(1,'transparent');
    c.fillStyle = lgL; c.fillRect(0,0,pillarW*2,H);
    c.fillStyle='rgba(0,245,255,0.55)'; c.fillRect(0,0,2,H);
    const lgR = c.createLinearGradient(W,0,W-pillarW*2,0);
    lgR.addColorStop(0,'rgba(255,45,120,0.25)'); lgR.addColorStop(1,'transparent');
    c.fillStyle = lgR; c.fillRect(W-pillarW*2,0,pillarW*2,H);
    c.fillStyle='rgba(255,45,120,0.55)'; c.fillRect(W-2,0,2,H);
    // Top bar
    const lgT = c.createLinearGradient(0,0,W,0);
    lgT.addColorStop(0,'rgba(0,245,255,0.4)');
    lgT.addColorStop(0.5,'rgba(191,0,255,0.55)');
    lgT.addColorStop(1,'rgba(255,45,120,0.4)');
    c.fillStyle=lgT; c.fillRect(0,0,W,3);
    // Ceiling bar
    c.fillStyle='rgba(0,245,255,0.08)'; c.fillRect(0,0,W,CEILING_PAD);
    c.strokeStyle='rgba(0,245,255,0.5)'; c.lineWidth=1.5;
    c.beginPath(); c.moveTo(0,CEILING_PAD); c.lineTo(W,CEILING_PAD); c.stroke();
    _pbBgCache = oc;
  }

  // ── Grid geometry ──────────────────────────────────────────────
  function colsForRow(r) { return r % 2 === 0 ? _colsEvenCache : _colsOddCache; }

  function cellXY(row, col) {
    const pillarW = Math.max(6, W * 0.045);
    const xOff = row % 2 === 0 ? 0 : R;
    return {
      x: pillarW + R + xOff + col * D,
      y: gridOffsetY() + row * ROW_H + R,
    };
  }

  function gridOffsetY() { return CEILING_PAD; }

  function rebuildGridPositions() {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < colsForRow(r); c++) {
        if (grid[r] && grid[r][c]) {
          const p = cellXY(r, c);
          grid[r][c].x = p.x;
          grid[r][c].y = p.y;
        }
      }
    }
  }

  // ── Grid generation ────────────────────────────────────────────
  function generateLevel() {
    grid = [];
    const numColors = Math.min(3 + Math.floor(level / 2), COLORS.length - 1); // no white initially
    const pal = Array.from({length: numColors}, (_, i) => i);

    const rows = Math.min(6 + level, 13);
    for (let r = 0; r < rows; r++) {
      const cols = colsForRow(r);
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        const ci = pal[Math.floor(Math.random() * pal.length)];
        const p  = cellXY(r, c);
        grid[r][c] = { ci, x: p.x, y: p.y };
      }
    }
    ensurePlayable(pal);
    _invalidateAim();
  }

  function ensurePlayable(pal) {
    // Each color must appear at least 3 times
    const counts = {};
    for (const row of grid) for (const b of (row||[])) if (b) counts[b.ci] = (counts[b.ci]||0)+1;
    for (const ci of pal) {
      if ((counts[ci]||0) < 3) {
        let placed = 0;
        outer: for (let r = grid.length-1; r >= 0; r--) {
          for (let c = 0; c < (grid[r]||[]).length; c++) {
            if (grid[r][c] && placed < 3) { grid[r][c].ci = ci; placed++; }
            if (placed === 3) break outer;
          }
        }
      }
    }
  }

  function getColorsInGrid() {
    const s = new Set();
    for (const row of grid) for (const b of (row||[])) if (b) s.add(b.ci);
    return [...s];
  }

  function randomValidColor() {
    const c = getColorsInGrid();
    return c.length ? c[Math.floor(Math.random() * c.length)] : 0;
  }

  function countBubbles() {
    let n = 0;
    for (const row of grid) for (const b of (row||[])) if (b) n++;
    return n;
  }

  // ── Queue ──────────────────────────────────────────────────────
  function refillQueue() {
    while (queue.length < 2) queue.push(randomValidColor());
    drawQueuePreviews();
  }

  function consumeQueue() {
    const ci = queue.shift();
    refillQueue();
    return ci;
  }

  function drawQueuePreviews() {
    if (nextCtx && queue.length >= 2) {
      nextCtx.clearRect(0,0,36,36);
      drawBubbleOnCtx(nextCtx, 18, 18, 11, queue[0]);
    }
    if (holdCtx) {
      holdCtx.clearRect(0,0,36,36);
      if (heldCi >= 0) drawBubbleOnCtx(holdCtx, 18, 18, 11, heldCi);
      else {
        holdCtx.fillStyle = 'rgba(0,245,255,0.15)';
        holdCtx.strokeStyle = 'rgba(0,245,255,0.3)';
        holdCtx.lineWidth = 1;
        holdCtx.beginPath(); holdCtx.arc(18,18,11,0,Math.PI*2);
        holdCtx.fill(); holdCtx.stroke();
      }
    }
  }

  // ── Cannon ─────────────────────────────────────────────────────
  function cannonX() { return W / 2; }
  function cannonY() { return H - R - CANNON_PAD; }

  function shoot() {
    if (ball || paused || dead || won || queue.length === 0) return;
    // Clamp angle
    const minA = -Math.PI + 0.15, maxA = -0.15;
    cannonAngle = Math.max(minA, Math.min(maxA, cannonAngle));
    const ci = consumeQueue();
    ball = {
      x: cannonX(), y: cannonY(),
      vx: Math.cos(cannonAngle) * SHOOT_SPEED,
      vy: Math.sin(cannonAngle) * SHOOT_SPEED,
      ci,
      bounces: 0,
      trail: [], // last N positions for motion blur
    };
    canSwap = true;
    SFX.resume(); SFX.shoot();
  }

  function swapHold() {
    if (!canSwap || paused || dead || won || ball) return;
    if (heldCi < 0) {
      heldCi = queue.shift();
      refillQueue();
    } else {
      const tmp = heldCi;
      heldCi = queue.shift();
      queue.unshift(tmp);
    }
    canSwap = false;
    drawQueuePreviews();
  }

  // ── Physics update ─────────────────────────────────────────────
  function update(dt) {
    // Keyboard aim
    if (leftHeld)  cannonAngle = Math.max(-Math.PI + 0.15, cannonAngle - AIM_SPEED);
    if (rightHeld) cannonAngle = Math.min(-0.15,            cannonAngle + AIM_SPEED);

    // Chain timer
    if (chainTimer > 0) {
      chainTimer -= dt;
      if (chainTimer <= 0) { chain = 0; updateUI(); }
    }

    // Drop timer
    if (!dead && !won && !paused) {
      dropTimer -= dt;
      if (dropTimer <= 0) {
        dropTimer = DROP_SECS * 1000;
        addNewTopRow();
        if (gridTooLow()) { doGameOver(); return; }
      }
      elapsedMs += dt;
    }

    // Update ball
    if (ball) {
      // Trail
      ball.trail.push({x: ball.x, y: ball.y});
      if (ball.trail.length > 6) ball.trail.shift();

      const _pw  = Math.max(6, W * 0.045);
      const _wallL = _pw + R, _wallR = W - _pw - R;

      // Sub-step to prevent tunnelling — recalculate step direction each iteration
      const NUM_STEPS = Math.ceil(SHOOT_SPEED / (R * 0.8));
      let placed = false;

      for (let si = 0; si < NUM_STEPS && !placed; si++) {
        // Use current vx/vy each sub-step so wall flips take effect immediately
        ball.x += ball.vx / NUM_STEPS;
        ball.y += ball.vy / NUM_STEPS;

        // Wall bounce
        if (ball.x < _wallL) { ball.x = _wallL; ball.vx =  Math.abs(ball.vx); ball.bounces++; SFX.bounce(); }
        if (ball.x > _wallR) { ball.x = _wallR; ball.vx = -Math.abs(ball.vx); ball.bounces++; SFX.bounce(); }

        // Ceiling — place against top wall
        if (ball.y - R <= gridOffsetY() + ROW_H * 0.5) {
          placeBall(); placed = true; break;
        }

        // Safety: too many wall bounces
        if (ball.bounces > MAX_BOUNCES) { placeBall(); placed = true; break; }

        // Collide with grid bubbles
        outer: for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < colsForRow(r); c++) {
            const b = grid[r] && grid[r][c];
            if (!b) continue;
            const dx = ball.x - b.x, dy = ball.y - b.y;
            if (dx*dx + dy*dy < D * D) {
              placeBall(); placed = true; break outer;
            }
          }
        }
      }

      // Fell off bottom
      if (!placed && ball && ball.y > H + 50) ball = null;
    }

    // Pop animations
    poppedAnim.forEach(p => {
      p.x  += p.vx; p.y += p.vy;
      if (p.isFloater) {
        p.vy += 0.45;   // gravity — fall off screen
        p.vx *= 0.99;
        // Stay fully visible while falling, fade only near bottom
        p.alpha = p.y > H * 0.8 ? Math.max(0, 1 - (p.y - H * 0.8) / (H * 0.25)) : 1;
        p.scale = 1;
      } else {
        p.vy += 0.6;
        p.vx *= 0.97;
        p.alpha -= 0.028;
        p.scale = Math.max(0, p.scale - 0.018);
      }
    });
    poppedAnim = poppedAnim.filter(p => p.alpha > 0 && p.y < H + 80);

    // Score popups
    scorePopups.forEach(p => { p.y -= 1.2; p.alpha -= 0.022; });
    scorePopups = scorePopups.filter(p => p.alpha > 0);
  }

  // ── Snap ball to grid ──────────────────────────────────────────
  function snapToGrid() {
    let bestRow = -1, bestCol = -1, bestDist = Infinity;
    const approxRow = Math.round((ball.y - R - gridOffsetY()) / ROW_H);
    const searchFrom = Math.max(0, approxRow - 2);
    const searchTo   = Math.min(grid.length + 1, approxRow + 2);
    for (let r = searchFrom; r <= searchTo; r++) {
      const cols = colsForRow(r);
      for (let c = 0; c < cols; c++) {
        if (r < grid.length && grid[r] && grid[r][c]) continue;
        const p = cellXY(r, c);
        const dx = ball.x - p.x, dy = ball.y - p.y;
        const dist = dx*dx + dy*dy;
        if (dist < bestDist) { bestDist = dist; bestRow = r; bestCol = c; }
      }
    }
    if (bestRow === -1) return null;
    return {row: bestRow, col: bestCol};
  }

  function placeBall() {
    if (!ball) return;
    const snap = snapToGrid();
    if (!snap) { ball = null; return; }
    const {row, col} = snap;

    // Grow grid
    while (grid.length <= row) grid.push(new Array(colsForRow(grid.length)).fill(null));
    if (col >= (grid[row]||[]).length) {
      while ((grid[row]||[]).length <= col) grid[row].push(null);
    }
    const p = cellXY(row, col);
    grid[row][col] = { ci: ball.ci, x: p.x, y: p.y };
    ball = null;
    _invalidateAim();

    // Match group
    const group = getMatchGroup(row, col);
    if (group.length >= 3) {
      const floaters = getFloating(group);
      const totalPopped = group.length + floaters.length;
      chain++;
      chainTimer = 3000;

      const pts = group.length * group.length * 10 * level * chain
                + floaters.length * 50 * level * chain;
      score += pts;
      if (score > best) best = score;

      // SFX
      SFX.pop(group.length);
      if (floaters.length > 0) setTimeout(() => SFX.floaters(floaters.length), 120);
      if (chain >= 2) setTimeout(() => SFX.chain(chain), 200);

      // Animate popped bubbles
      group.forEach(({r,c}) => {
        const b = grid[r][c];
        if (b) spawnPopAnim(b.x, b.y, b.ci);
        grid[r][c] = null;
      });
      floaters.forEach(({r,c}) => {
        const b = grid[r][c];
        if (b) spawnPopAnim(b.x, b.y, b.ci, true);
        grid[r][c] = null;
      });
      trimEmptyRows();

      // Score popup
      const avgX = group.reduce((s,{r,c})=>s+cellXY(r,c).x,0)/group.length;
      const avgY = group.reduce((s,{r,c})=>s+cellXY(r,c).y,0)/group.length;
      scorePopups.push({
        x: avgX, y: avgY,
        text: chain > 1 ? `CHAIN×${chain}! +${pts}` : `+${pts}`,
        alpha: 1, vy: 1,
        color: chain > 1 ? '#ffe600' : '#ffffff',
        size: chain > 1 ? 14 : 11,
      });

      // FX
      if (window.FX && canvas) {
        const rect = canvas.getBoundingClientRect();
        group.forEach(({r,c}) => {
          const b2 = cellXY(r,c);
          FX.burst(
            rect.left + (b2.x/W)*rect.width,
            rect.top  + (b2.y/H)*rect.height,
            {count:10, colors:[COLORS[group[0] ? grid[row][col]?.ci ?? 0 : 0],'#fff'], speed:4, life:35, size:3, shape:'circle', gravity:0.12}
          );
        });
        if (chain >= 2) { FX.screenFlash(COLORS[group[0]?.ci ?? 0], 0.2); FX.shake(4); }
      }
      updateUI();
    } else {
      chain = 0; chainTimer = 0;
      SFX.land();
      updateUI();
    }

    // Win check
    if (countBubbles() === 0) { setTimeout(nextLevel, 600); return; }

    // Game over check
    if (gridTooLow()) { doGameOver(); return; }
  }

  function spawnPopAnim(x, y, ci, isFloater = false) {
    if (isFloater) {
      // Floaters fall with gravity like the classic arcade
      poppedAnim.push({
        x, y,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(1 + Math.random() * 1.5),  // small upward bounce then fall
        ci, alpha: 1, scale: 1,
        isFloater: true,
      });
    } else {
      const angle = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;
      poppedAnim.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        ci, alpha: 1, scale: 1,
        isFloater: false,
      });
    }
  }

  // ── Flood fill ─────────────────────────────────────────────────
  function getMatchGroup(row, col) {
    if (!grid[row] || !grid[row][col]) return [];
    const ci = grid[row][col].ci;
    const visited = new Set(), result = [], stack = [[row, col]];
    while (stack.length) {
      const [r, c] = stack.pop();
      const key = r + ',' + c;
      if (visited.has(key)) continue;
      if (r < 0 || r >= grid.length) continue;
      if (c < 0 || c >= colsForRow(r)) continue;
      if (!grid[r] || !grid[r][c] || grid[r][c].ci !== ci) continue;
      visited.add(key); result.push({r, c});
      stack.push(...hexNeighbors(r, c));
    }
    return result;
  }

  function getFloating(justPopped) {
    // Mark just-popped as gone temporarily
    const poppedKeys = new Set(justPopped.map(({r,c})=>r+','+c));
    const attached = new Set();
    const queue2 = [];
    // Seed from row 0
    for (let c = 0; c < colsForRow(0); c++) {
      const key = '0,' + c;
      if (poppedKeys.has(key)) continue;
      if (grid[0] && grid[0][c]) { queue2.push([0,c]); attached.add(key); }
    }
    while (queue2.length) {
      const [r, c] = queue2.shift();
      for (const [nr, nc] of hexNeighbors(r, c)) {
        const key = nr+','+nc;
        if (attached.has(key) || poppedKeys.has(key)) continue;
        if (nr < 0 || nr >= grid.length) continue;
        if (nc < 0 || nc >= colsForRow(nr)) continue;
        if (!grid[nr] || !grid[nr][nc]) continue;
        attached.add(key); queue2.push([nr, nc]);
      }
    }
    const floating = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < colsForRow(r); c++) {
        const key = r+','+c;
        if (poppedKeys.has(key)) continue;
        if (grid[r] && grid[r][c] && !attached.has(key)) floating.push({r, c});
      }
    }
    return floating;
  }

  function hexNeighbors(r, c) {
    const even = r % 2 === 0;
    return [
      [r-1, even ? c-1 : c],
      [r-1, even ? c   : c+1],
      [r,   c-1],
      [r,   c+1],
      [r+1, even ? c-1 : c],
      [r+1, even ? c   : c+1],
    ];
  }

  function trimEmptyRows() {
    while (grid.length && (grid[grid.length-1]||[]).every(b => !b)) grid.pop();
  }

  // ── Grid drop ──────────────────────────────────────────────────
  function addNewTopRow() {
    const pal = getColorsInGrid();
    if (!pal.length) return;
    const cols = colsForRow(0);
    const newRow = [];
    for (let c = 0; c < cols; c++) {
      const ci = pal[Math.floor(Math.random() * pal.length)];
      newRow.push({ ci, x: 0, y: 0 });
    }
    grid.unshift(newRow);
    rebuildGridPositions();
    _invalidateAim();
    if (window.FX) FX.screenFlash('#ff2d78', 0.12);
  }

  function gridTooLow() {
    for (let r = 0; r < grid.length; r++) {
      const cols = colsForRow(r);
      for (let c = 0; c < cols; c++) {
        if (grid[r] && grid[r][c]) {
          const p = cellXY(r, c);
          // Game over if any bubble gets within CLEAR_ROWS row-heights of the cannon
          if (p.y + R >= cannonY() - ROW_H * CLEAR_ROWS) return true;
        }
      }
    }
    return false;
  }

  // ── Game flow ──────────────────────────────────────────────────
  function nextLevel() {
    score += 1000 * level;
    if (score > best) best = score;
    level++;
    dropTimer = DROP_SECS * 1000;
    generateLevel();
    heldCi = -1; canSwap = true;
    queue = [];
    refillQueue();
    won = false;
    hideOverlay();
    updateUI();
    SFX.levelUp();
    if (window.FX) {
      FX.confetti(window.innerWidth/2, window.innerHeight*0.3);
      FX.screenFlash('#39ff14', 0.25);
    }
  }

  function doGameOver() {
    dead = true;
    SFX.gameOver();
    if (window.FX) { FX.screenFlash('#ff2d78', 0.5); FX.shake(10); }
    showOverlay('lose', 'GAME OVER', score,
      `Level ${level} — ${Math.floor(elapsedMs/1000)}s`,
      [{label:'🔄 RETRY', fn:'pbNewGame()'},{label:'🕹 ARCADE', fn:'backToGameSelect()'}]
    );
    if (score > 0) setTimeout(()=>HS.promptSubmit('puzzlebobble', score, score.toLocaleString()), 400);
  }

  function newGame() {
    if (!canvas) init();
    score = 0; best = Math.max(parseInt(localStorage.getItem('bam-best')||'0'), parseInt(localStorage.getItem('pb-best-hs')||'0'));
    level = 1; chain = 0; chainTimer = 0;
    paused = false; dead = false; won = false;
    ball = null; poppedAnim = []; scorePopups = [];
    heldCi = -1; canSwap = true; queue = [];
    dropTimer = DROP_SECS * 1000;
    elapsedMs = 0; startTime = Date.now();
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
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    hideOverlay();
  }

  function togglePause() {
    if (dead || won) return;
    paused = !paused;
    const btn = document.getElementById('pb-pause-btn');
    if (btn) btn.textContent = paused ? '▶' : '⏸';
    if (paused) {
      showOverlay('pause','PAUSED', null,'Game paused',[
        {label:'▶ RESUME', fn:'pbTogglePause()'},
        {label:'🆕 NEW',   fn:'pbNewGame()'},
      ]);
    } else { hideOverlay(); }
  }

  // ── UI ─────────────────────────────────────────────────────────
  function updateUI() {
    const s = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    s('pb-score', score.toLocaleString());
    s('pb-best',  Math.max(score, best).toLocaleString());
    s('pb-level', level);
    s('pb-chain', chain > 1 ? `×${chain}` : '×1');
    const secs = Math.floor(elapsedMs/1000);
    s('pb-time', `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`);
    // persist best
    if (score > best) { best = score; localStorage.setItem('bam-best', best); }
  }

  function showOverlay(type, title, sc, msg, btns) {
    const ov = document.getElementById('pb-overlay');
    if (!ov) return;
    ov.classList.add('active');
    const t = document.getElementById('pb-ov-title');
    t.textContent = title; t.className = 'pb-ov-title ' + type;
    const scEl = document.getElementById('pb-ov-score');
    if (scEl) scEl.textContent = sc != null ? sc.toLocaleString() + ' pts' : '';
    const msgEl = document.getElementById('pb-ov-msg');
    if (msgEl) msgEl.textContent = msg || '';
    const bd = document.getElementById('pb-ov-btns');
    if (bd) bd.innerHTML = (btns||[]).map(b=>`<button class="${b.label.includes('ARCADE') ? 'arcade-back-btn' : 'pb-btn'}" onclick="${b.fn}">${b.label}</button>`).join('');
  }

  function hideOverlay() {
    const ov = document.getElementById('pb-overlay');
    if (ov) ov.classList.remove('active');
  }

  // ── Game loop ──────────────────────────────────────────────────
  // iGPU: cap to 30 fps. Discrete GPU: uncapped, exactly as original.
  let _lastFrameTs = 0;
  const _frameBudget = _igpu ? 1000 / 30 : 0;

  function loop(ts = 0) {
    raf = requestAnimationFrame(loop);
    if (_igpu && ts - _lastFrameTs < _frameBudget) return;
    _lastFrameTs = ts;
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;
    if (!paused && !dead) update(dt);
    draw();
    if (!dead) updateUI();
  }

  // ── Drawing ────────────────────────────────────────────────────
  function draw() {
    if (!ctx) return;
    const now = Date.now();
    ctx.clearRect(0, 0, W, H);

    // Background — blit cached offscreen canvas (no per-frame gradients)
    if (_pbBgCache) {
      ctx.drawImage(_pbBgCache, 0, 0);
    } else {
      ctx.fillStyle = '#010510'; ctx.fillRect(0,0,W,H);
    }

    // Stars (twinkle only — positions are stable)
    bgStars.forEach(s => {
      s.tw += s.ts;
      const a = (s.a * (0.5 + 0.5*Math.sin(s.tw)));
      // Build fill string only when alpha changes enough (quantise to 2dp avoids constant churn)
      const aq = (a * 100 | 0) / 100;
      if (s._lastA !== aq) { s._fs = `rgba(180,220,255,${aq})`; s._lastA = aq; }
      ctx.fillStyle = s._fs || 'rgba(180,220,255,0.1)';
      ctx.fillRect(s.x*W - s.r, s.y*H - s.r, s.r*2, s.r*2);
    });

    // Danger line — golden bar showing where bubbles must not reach (like Bust-a-Move)
    const dangerY = cannonY() - ROW_H * CLEAR_ROWS;
    const pulse = 0.4 + 0.4 * Math.sin(now * 0.004);
    // Outer glow band — gradient rebuilt only when dangerY changes (resize)
    if (_dangerGradY !== dangerY) {
      _dangerGradCache = ctx.createLinearGradient(0, dangerY - 4, 0, dangerY + 4);
      _dangerGradCache.addColorStop(0, 'transparent');
      _dangerGradCache.addColorStop(0.5, 'rgba(255,230,0,0.25)');
      _dangerGradCache.addColorStop(1, 'transparent');
      _dangerGradY = dangerY;
    }
    ctx.fillStyle = _dangerGradCache;
    ctx.fillRect(0, dangerY - 4, W, 8);
    // The line itself
    ctx.strokeStyle = `rgba(255,200,0,${0.55 + pulse * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(0, dangerY); ctx.lineTo(W, dangerY); ctx.stroke();
    ctx.setLineDash([]);
    // Skull icons at each end
    ctx.font = '12px serif'; ctx.textAlign = 'left';
    ctx.globalAlpha = 0.6 + pulse * 0.3;
    ctx.fillText('☠', 4, dangerY + 4);
    ctx.textAlign = 'right';
    ctx.fillText('☠', W - 4, dangerY + 4);
    ctx.globalAlpha = 1;

    // Drop timer warning bar
    const dropFrac = dropTimer / (DROP_SECS * 1000);
    const barColor = dropFrac < 0.25 ? '#ff2d78' : dropFrac < 0.5 ? '#ffe600' : '#00f5ff';
    ctx.fillStyle = `rgba(${barColor === '#ff2d78'?'255,45,120':barColor==='#ffe600'?'255,230,0':'0,245,255'},0.15)`;
    ctx.fillRect(0, CEILING_PAD, W * dropFrac, 3);
    ctx.fillStyle = barColor;
    ctx.fillRect(0, CEILING_PAD, W * dropFrac, 2);
    // Pulse when danger
    if (dropFrac < 0.25) {
      ctx.globalAlpha = 0.3 + 0.3*Math.sin(now*0.01);
      ctx.fillStyle = '#ff2d78';
      ctx.fillRect(0, CEILING_PAD, W * dropFrac, 3);
      ctx.globalAlpha = 1;
    }

    // Grid bubbles
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < colsForRow(r); c++) {
        const b = grid[r] && grid[r][c];
        if (b) drawBubble(b.x, b.y, R, b.ci, 1);
      }
    }

    // Popped bubble animations (bouncing fall)
    poppedAnim.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      drawBubble(p.x, p.y, R * p.scale, p.ci, 1);
      ctx.restore();
    });

    // Aim line
    if (!ball && !paused && !dead && !won) drawAimLine();

    // Cannon
    drawCannon(now);

    // Flying ball — squash & stretch along flight direction
    if (ball) {
      // Trail
      ball.trail.forEach((tp, i) => {
        const t = (i+1) / ball.trail.length;
        ctx.save(); ctx.globalAlpha = t * 0.35;
        drawBubble(tp.x, tp.y, R * t * 0.65, ball.ci, 1);
        ctx.restore();
      });
      // Stretch along velocity direction
      const angle = Math.atan2(ball.vy, ball.vx);
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(angle);
      ctx.scale(1.22, 0.78);
      ctx.rotate(-angle);
      ctx.translate(-ball.x, -ball.y);
      drawBubble(ball.x, ball.y, R, ball.ci, 1);
      ctx.restore();
    }

    // Score popups — cheap outline instead of shadowBlur
    scorePopups.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.font = `bold ${p.size||11}px Orbitron, monospace`;
      ctx.textAlign = 'center';
      // Cheap 1px outline for legibility (no shadowBlur cost)
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color || '#ffe600';
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    });

    // Scanlines — blit cached strip instead of 135 fillRect calls per frame
    // On iGPU: skip entirely — saves the drawImage composite cost each frame
    if (!_igpu) {
      if (!_scanlineCache) {
        const sc = document.createElement('canvas');
        sc.width = W; sc.height = H;
        const scc = sc.getContext('2d');
        scc.fillStyle = '#000';
        for (let y = 0; y < H; y += 4) scc.fillRect(0, y, W, 2);
        _scanlineCache = sc;
      }
      ctx.save(); ctx.globalAlpha = 0.035;
      ctx.drawImage(_scanlineCache, 0, 0);
      ctx.restore();
    }
  }

  // Aim line cache — recompute only when angle changes or grid is modified
  let _aimCache = null, _aimLastAngle = null, _aimDirty = true;
  // Flat bubble list for aim sim — rebuilt on grid change, avoids nested loop per sim step
  let _aimBubbleList = [];
  function _invalidateAim() {
    _aimDirty = true;
    _aimBubbleList = [];
    for (let r = 0; r < grid.length; r++) {
      if (!grid[r]) continue;
      for (let c = 0; c < grid[r].length; c++) {
        const b = grid[r][c];
        if (b) _aimBubbleList.push(b);
      }
    }
  }

  function drawAimLine() {
    const cx = cannonX(), cy = cannonY();
    const curCi = queue[0] ?? 0;

    // Only re-simulate if angle changed or grid was modified
    if (_aimDirty || _aimLastAngle !== cannonAngle) {
      let vx = Math.cos(cannonAngle), vy = Math.sin(cannonAngle);
      let x = cx, y = cy;
      const _apw = Math.max(6, W * 0.045);
      const wallL = _apw + R, wallR = W - _apw - R;
      const points = [{x, y}];
      let ghostX = null, ghostY = null;
      const simSteps = Math.ceil(H / SHOOT_SPEED) * 4;
      const hitRadSq = (D * 1.05) * (D * 1.05);

      for (let i = 0; i < simSteps; i++) {
        x += vx * SHOOT_SPEED;
        y += vy * SHOOT_SPEED;
        if (x < wallL) { x = wallL; vx = Math.abs(vx); points.push({x, y}); }
        if (x > wallR) { x = wallR; vx = -Math.abs(vx); points.push({x, y}); }
        if (y < CEILING_PAD + R * 2) {
          ghostX = x; ghostY = CEILING_PAD + R;
          points.push({x, y: ghostY}); break;
        }
        // Flat pre-built list with y-band cull — much cheaper than nested row/col loops
        let hit = false;
        const bubbles = _aimBubbleList;
        for (let bi = 0; bi < bubbles.length; bi++) {
          const b = bubbles[bi];
          const dy = y - b.y;
          if (dy > D * 2 || dy < -D * 2) continue; // skip bubbles far from sim y
          const dx = x - b.x;
          if (dx * dx + dy * dy < hitRadSq) { ghostX = x; ghostY = y; hit = true; break; }
        }
        if (hit) { points.push({x: ghostX, y: ghostY}); break; }
        points.push({x, y});
      }
      _aimCache = { points, ghostX, ghostY };
      _aimLastAngle = cannonAngle;
      _aimDirty = false;
    }

    const { points, ghostX, ghostY } = _aimCache;

    // Draw the full multi-segment dashed path
    ctx.save();
    ctx.setLineDash([6, 10]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    if (!_igpu) { ctx.shadowColor = GLOWS[curCi]; ctx.shadowBlur = 5; }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Ghost bubble ring
    if (ghostX !== null) {
      ctx.save();
      ctx.beginPath(); ctx.arc(ghostX, ghostY,Math.max(0,R), 0, Math.PI*2);
      ctx.strokeStyle = COLORS[curCi]; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      if (!_igpu) { ctx.shadowColor = GLOWS[curCi]; ctx.shadowBlur = 8; }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(ghostX, ghostY,Math.max(0,R), 0, Math.PI*2);
      ctx.fillStyle = COLORS[curCi]; ctx.globalAlpha = 0.12; ctx.fill();
      ctx.restore();
    }
  }

  // Pre-rendered cannon base sprite (static part — rebuilt once)
  let _cannonBaseSprite = null;
  let _cannonBarSprite  = {};  // keyed by ci
  function _buildCannonSprites() {
    // Base disc
    const sz = 60;
    const oc = document.createElement('canvas'); oc.width = oc.height = sz;
    const c = oc.getContext('2d'); const cx = sz/2, cy = sz/2;
    c.shadowColor = '#00f5ff'; c.shadowBlur = 10;
    const base = c.createRadialGradient(cx,cy,2,cx,cy,22);
    base.addColorStop(0,'#1a3a5a'); base.addColorStop(1,'#0a1e30');
    c.fillStyle = base;
    c.beginPath(); c.arc(cx,cy,22,0,Math.PI*2); c.fill();
    c.strokeStyle='#00f5ff'; c.lineWidth=1.5; c.stroke();
    c.shadowBlur=0; c.strokeStyle='rgba(0,245,255,0.3)'; c.lineWidth=1;
    c.beginPath(); c.arc(cx,cy,26,0,Math.PI*2); c.stroke();
    _cannonBaseSprite = oc;
    // Barrel per color
    for (let ci = 0; ci < COLORS.length; ci++) {
      const bo = document.createElement('canvas'); bo.width=22; bo.height=44;
      const bc = bo.getContext('2d');
      bc.shadowColor = GLOWS[ci]; bc.shadowBlur=6;
      const barGrad = bc.createLinearGradient(0,0,22,0);
      barGrad.addColorStop(0,'#c8e8ff'); barGrad.addColorStop(0.5,'#2266aa'); barGrad.addColorStop(1,'#0a1832');
      bc.fillStyle = barGrad;
      if (bc.roundRect) bc.roundRect(2,4,18,30,4); else bc.rect(2,4,18,30);
      bc.fill();
      bc.strokeStyle=COLORS[ci]; bc.lineWidth=1.5; bc.stroke();
      bc.shadowBlur=6; bc.fillStyle=COLORS[ci];
      bc.beginPath(); bc.arc(11,4,6,0,Math.PI*2); bc.fill();
      _cannonBarSprite[ci] = bo;
    }
  }

  function drawCannon(now = 0) {
    if (!_cannonBaseSprite) _buildCannonSprites();
    const cx = cannonX(), cy = cannonY();
    const ci = queue[0] ?? 0;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);

    // Base (static sprite — blit with alpha pulse instead of shadowBlur)
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    ctx.drawImage(_cannonBaseSprite, cx - 30, cy - 30);
    ctx.restore();

    // Barrel (rotated sprite)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cannonAngle + Math.PI/2);
    const bar = _cannonBarSprite[ci];
    if (bar) ctx.drawImage(bar, -11, -44);
    ctx.restore();

    // Bubble in the cannon
    drawBubble(cx, cy, R - 2, ci, 1);

    // NEXT bubble indicator — shown to the right of the cannon base
    if (queue.length > 1) {
      const nextCi = queue[1];
      const nx = cx + 48, ny = cy + 6;
      ctx.save();
      ctx.globalAlpha = 0.85;
      drawBubble(nx, ny, R * 0.65, nextCi, 1);
      ctx.globalAlpha = 0.5;
      ctx.font = `bold 7px 'Share Tech Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('NEXT', nx, ny + R + 6);
      ctx.restore();
    }

    // HOLD bubble indicator — to the left of the cannon base
    if (heldCi >= 0) {
      const hx = cx - 48, hy = cy + 6;
      ctx.save();
      ctx.globalAlpha = 0.85;
      drawBubble(hx, hy, R * 0.65, heldCi, 1);
      ctx.globalAlpha = 0.5;
      ctx.font = `bold 7px 'Share Tech Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('HOLD', hx, hy + R + 6);
      ctx.restore();
    }
  }

  function drawBubble(x, y, r, ci, alpha) {
    if (!ctx || r <= 0) return;
    const spr = BUBBLE_SPRITES[ci];
    if (spr && r === R) {
      // Fast path: blit pre-rendered sprite
      const sz = spr.width;
      const prev = ctx.globalAlpha;
      if (alpha !== 1) ctx.globalAlpha = Math.max(0, alpha);
      ctx.drawImage(spr, x - sz/2, y - sz/2);
      ctx.globalAlpha = prev;
      return;
    }
    // Slow path for non-standard sizes (popped anim scaling)
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const gr = ctx.createRadialGradient(x - r*0.32,y - r*0.36,Math.max(0.01,r*0.04),x,y,Math.max(0.01,r));
    gr.addColorStop(0, lighten(COLORS[ci], 0.55));
    gr.addColorStop(0.55, COLORS[ci]);
    gr.addColorStop(1, darken(COLORS[ci], 0.4));
    ctx.beginPath(); ctx.arc(x, y,Math.max(0,r), 0, Math.PI*2);
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = lighten(COLORS[ci], 0.3);
    ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x - r*0.3, y - r*0.33,Math.max(0,r*0.22), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    ctx.restore();
  }

  function drawBubbleOnCtx(c, x, y, r, ci) {
    c.save();
    c.shadowColor = GLOWS[ci]; c.shadowBlur = 8;
    const gr = c.createRadialGradient(x-r*0.3,y-r*0.33,Math.max(0.01,r*0.04),x,y,Math.max(0.01,r));
    gr.addColorStop(0, lighten(COLORS[ci], 0.55));
    gr.addColorStop(0.55, COLORS[ci]);
    gr.addColorStop(1, darken(COLORS[ci], 0.4));
    c.beginPath(); c.arc(x, y,Math.max(0,r), 0, Math.PI*2);
    c.fillStyle = gr; c.fill();
    c.strokeStyle = lighten(COLORS[ci],0.3); c.lineWidth = 1; c.stroke();
    c.beginPath(); c.arc(x-r*0.3, y-r*0.33,Math.max(0,r*0.2), 0, Math.PI*2);
    c.fillStyle = 'rgba(255,255,255,0.65)'; c.fill();
    c.restore();
  }

  function lighten(hex, a) {
    const [r,g,b] = hr(hex);
    return `rgb(${Math.min(255,r+~~(255*a))},${Math.min(255,g+~~(255*a))},${Math.min(255,b+~~(255*a))})`;
  }
  function darken(hex, a) {
    const [r,g,b] = hr(hex);
    return `rgb(${Math.max(0,r-~~(255*a))},${Math.max(0,g-~~(255*a))},${Math.max(0,b-~~(255*a))})`;
  }
  function hr(h) { const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }

  // ── Side character art ─────────────────────────────────────────
  function drawCharacters() {
    drawCharLeft();
    drawCharRight();
  }

  function drawCharLeft() {
    const c = elCharLeft;
    if (!c) return;
    const x = c.getContext('2d');
    x.clearRect(0,0,110,140);
    // Bub — cyan bubble dragon
    x.save();
    // Body
    x.shadowColor = '#00f5ff'; x.shadowBlur = 8;
    const body = x.createRadialGradient(55,80,5,55,80,38);
    body.addColorStop(0,'#80ffff'); body.addColorStop(1,'#0088cc');
    x.fillStyle = body;
    x.beginPath(); x.ellipse(55,82,34,36,0,0,Math.PI*2); x.fill();
    // Head
    const head = x.createRadialGradient(55,45,4,55,48,26);
    head.addColorStop(0,'#a0ffff'); head.addColorStop(1,'#0099cc');
    x.fillStyle = head;
    x.beginPath(); x.arc(55,48,24,0,Math.PI*2); x.fill();
    // Eyes
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(46,44,7,8,-.2,0,Math.PI*2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(64,44,7,8,.2,0,Math.PI*2); x.fill();
    x.fillStyle = '#0044aa'; x.beginPath(); x.arc(47,45,4,0,Math.PI*2); x.fill();
    x.fillStyle = '#0044aa'; x.beginPath(); x.arc(65,45,4,0,Math.PI*2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(49,43,1.5,0,Math.PI*2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(67,43,1.5,0,Math.PI*2); x.fill();
    // Smile
    x.strokeStyle = '#0044aa'; x.lineWidth = 2.5; x.lineCap = 'round';
    x.beginPath(); x.arc(55,52,8,0.2,Math.PI-0.2); x.stroke();
    // Horns
    x.fillStyle = '#ffee00'; x.shadowColor = '#ffee00'; x.shadowBlur = 6;
    x.beginPath(); x.moveTo(42,28); x.lineTo(36,14); x.lineTo(46,22); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(68,28); x.lineTo(74,14); x.lineTo(64,22); x.closePath(); x.fill();
    // Feet
    x.fillStyle = '#0088cc'; x.shadowColor = '#00f5ff'; x.shadowBlur = 6;
    x.beginPath(); x.ellipse(41,114,14,9,-.3,0,Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(69,114,14,9,.3,0,Math.PI*2); x.fill();
    // Arms
    x.beginPath(); x.ellipse(24,88,9,18,-.5,0,Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(86,88,9,18,.5,0,Math.PI*2); x.fill();
    // Belly
    x.fillStyle = 'rgba(180,255,255,0.35)';
    x.beginPath(); x.ellipse(55,85,18,20,0,0,Math.PI*2); x.fill();
    x.restore();
  }

  function drawCharRight() {
    const c = elCharRight;
    if (!c) return;
    const x = c.getContext('2d');
    x.clearRect(0,0,110,140);
    // Bob — pink bubble dragon
    x.save();
    x.shadowColor = '#ff2d78'; x.shadowBlur = 8;
    const body = x.createRadialGradient(55,80,5,55,80,38);
    body.addColorStop(0,'#ffaacc'); body.addColorStop(1,'#cc0066');
    x.fillStyle = body;
    x.beginPath(); x.ellipse(55,82,34,36,0,0,Math.PI*2); x.fill();
    const head = x.createRadialGradient(55,45,4,55,48,26);
    head.addColorStop(0,'#ffbbdd'); head.addColorStop(1,'#cc0077');
    x.fillStyle = head;
    x.beginPath(); x.arc(55,48,24,0,Math.PI*2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(46,44,7,8,-.2,0,Math.PI*2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(64,44,7,8,.2,0,Math.PI*2); x.fill();
    x.fillStyle = '#880044'; x.beginPath(); x.arc(47,45,4,0,Math.PI*2); x.fill();
    x.fillStyle = '#880044'; x.beginPath(); x.arc(65,45,4,0,Math.PI*2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(49,43,1.5,0,Math.PI*2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(67,43,1.5,0,Math.PI*2); x.fill();
    x.strokeStyle = '#880044'; x.lineWidth = 2.5; x.lineCap = 'round';
    x.beginPath(); x.arc(55,52,8,0.2,Math.PI-0.2); x.stroke();
    // Different horns — rounder
    x.fillStyle = '#bf00ff'; x.shadowColor = '#bf00ff'; x.shadowBlur = 8;
    x.beginPath(); x.ellipse(41,24,8,14,-.5,0,Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(69,24,8,14,.5,0,Math.PI*2); x.fill();
    x.fillStyle = '#cc0066'; x.shadowColor = '#ff2d78'; x.shadowBlur = 6;
    x.beginPath(); x.ellipse(41,114,14,9,-.3,0,Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(69,114,14,9,.3,0,Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(24,88,9,18,-.5,0,Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(86,88,9,18,.5,0,Math.PI*2); x.fill();
    x.fillStyle = 'rgba(255,180,220,0.35)';
    x.beginPath(); x.ellipse(55,85,18,20,0,0,Math.PI*2); x.fill();
    x.restore();
  }

  // ── Input ──────────────────────────────────────────────────────
  function updateAngleFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * (W / rect.width);
    const my = (clientY - rect.top)  * (H / rect.height);
    const dx = mx - cannonX(), dy = my - cannonY();
    const ang = Math.atan2(dy, dx);
    const minA = -Math.PI + 0.12, maxA = -0.12;
    cannonAngle = Math.max(minA, Math.min(maxA, ang));
  }

  function onMouseMove(e) {
    if (paused || dead) return;
    updateAngleFromClient(e.clientX, e.clientY);
  }

  function onCanvasClick(e) {
    if (paused || dead || won) return;
    if (dead || won) return;
    updateAngleFromClient(e.clientX, e.clientY);
    shoot();
  }

  function onTouchMove(e) {
    if (paused || dead) return;
    e.preventDefault();
    const t = e.touches[0];
    updateAngleFromClient(t.clientX, t.clientY);
  }

  function onTouchEnd(e) {
    if (paused || dead || won) return;
    shoot();
  }

  function onKeyDown(e) {
    const scr = document.getElementById('puzzlebobble-screen');
    if (!scr || !scr.classList.contains('active')) return;
    switch(e.key) {
      case 'ArrowLeft':  case 'a': case 'A': leftHeld  = true; e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': rightHeld = true; e.preventDefault(); break;
      case ' ':                              shoot();           e.preventDefault(); break;
      case 'z': case 'Z':                    swapHold();        e.preventDefault(); break;
      case 'p': case 'P':                    togglePause();     break;
    }
  }

  function onKeyUp(e) {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') leftHeld  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightHeld = false;
  }

  return { newGame, destroy, togglePause, getCurrentScore: () => score };
})();
