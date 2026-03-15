// BB game module
// Auto-extracted from monolithic index.html

export default (function() {
  // ── Constants ─────────────────────────────────────────────
  const COLS = 12, ROWS = 14;
  const CELL = 38;
  const COLORS = ['#ff2d78','#00f5ff','#39ff14','#ff6a00','#bf00ff','#ffe600'];
  const GLOWS  = ['rgba(255,45,120,0.8)','rgba(0,245,255,0.8)','rgba(57,255,20,0.8)','rgba(255,106,0,0.8)','rgba(191,0,255,0.8)','rgba(255,230,0,0.8)'];

  // ── Physics bubble state ───────────────────────────────────
  // Each physics bubble: { x, y, vx, vy, r, color, colorIdx, sc, sr, settled }
  // sc/sr = logical grid slot (for group-matching when settled)
  // settled = snapped to slot (for click logic)

  let balls = [];          // all active balls with physics
  let shape = [];          // 2D boolean mask [row][col] — which slots are part of the level
  let wallSegs = [];       // precomputed wall line segments [{x1,y1,x2,y2}]
  let score = 0, best = 0, level = 1;
  let paused = false, gameOver = false;
  let canvas, ctx;
  let rafId = null;
  let lastTs = 0;
  let popAnims = [];       // {x,y,color,life,particles[]}
  let _ballMap = null;     // Map<'sc,sr', ball> — rebuilt on demand

  function getBallMap() {
    if (!_ballMap) {
      _ballMap = new Map();
      for (const b of balls) _ballMap.set(`${b.sc},${b.sr}`, b);
    }
    return _ballMap;
  }
  function invalidateBallMap() { _ballMap = null; }
  let hoveredGroup = null;
  let falling = false;     // true while any ball is mid-air (dropping in)

  // ── Neon wall colours ────────────────────────────────────
  const WALL_COLORS = ['#00f5ff','#ff2d78','#39ff14','#ffe600','#bf00ff','#ff6a00'];
  let wallColorIdx = 0;
  let wallColor = WALL_COLORS[0];

  // ── Build wall segments from shape boundary ──────────────
  function buildWalls() {
    wallSegs = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!shape[r][c]) continue;
        const x0 = c * CELL, y0 = r * CELL;
        const x1 = x0 + CELL, y1 = y0 + CELL;
        // Check each of the 4 edges — add segment if neighbour is outside shape
        if (!shape[r-1]?.[c])   wallSegs.push({x1:x0, y1:y0, x2:x1, y2:y0}); // top
        if (!shape[r+1]?.[c])   wallSegs.push({x1:x0, y1:y1, x2:x1, y2:y1}); // bottom
        if (!shape[r]?.[c-1])   wallSegs.push({x1:x0, y1:y0, x2:x0, y2:y1}); // left
        if (!shape[r]?.[c+1])   wallSegs.push({x1:x1, y1:y0, x2:x1, y2:y1}); // right
      }
    }
  }

  // ── Compute interior bounding box for shape ───────────────
  function shapeBounds() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (shape[r][c]) {
          minX = Math.min(minX, c*CELL); maxX = Math.max(maxX, (c+1)*CELL);
          minY = Math.min(minY, r*CELL); maxY = Math.max(maxY, (r+1)*CELL);
        }
    return {minX, maxX, minY, maxY};
  }

  // ── Level shapes ─────────────────────────────────────────
  // Each returns a 2D boolean mask [ROWS][COLS]
  const LEVEL_SHAPES = [
    () => makeFunnel(),
  ];

  // Wide at top, narrows to a point at the bottom centre.
  // Each row removes one cell from each side, so balls always
  // roll inward and never get stranded in isolated corners.
  function makeFunnel() {
    const m = blank();
    for (let r = 0; r < ROWS; r++) {
      // At row 0 (top): full width. At last row: just the centre 2 cols.
      const narrow = Math.floor(r * (COLS / 2 - 1) / (ROWS - 1));
      const c0 = narrow;
      const c1 = COLS - narrow;
      for (let c = c0; c < c1; c++) m[r][c] = true;
    }
    return m;
  }

  function makeRect(c0, r0, c1, r1) {
    return make(() => true, c0, r0, c1, r1);
  }
  function make(fn, c0=0, r0=0, c1=COLS, r1=ROWS) {
    const m = blank();
    for (let r = r0; r < r1; r++)
      for (let c = c0; c < c1; c++)
        if (fn(r, c)) m[r][c] = true;
    return m;
  }
  function blank() { return Array.from({length:ROWS}, ()=>new Array(COLS).fill(false)); }

  function makePyramid() {
    const m = blank(), mid = COLS/2;
    for (let r = 1; r < ROWS-1; r++) {
      const half = Math.floor(r * (COLS/2-1) / (ROWS-2));
      const c0 = Math.max(0, Math.floor(mid - half));
      const c1 = Math.min(COLS, Math.ceil(mid + half));
      for (let c = c0; c < c1; c++) m[r][c] = true;
    }
    return m;
  }

  function makeDiamond() {
    const m = blank(), midR = ROWS/2, midC = COLS/2;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const dr = Math.abs(r - midR) / (ROWS/2);
        const dc = Math.abs(c - midC) / (COLS/2);
        if (dr + dc < 0.95) m[r][c] = true;
      }
    return m;
  }

  function makeHourglass() {
    const m = blank(), mid = ROWS/2, midC = COLS/2;
    for (let r = 1; r < ROWS-1; r++) {
      const dist = Math.abs(r - mid);
      const half = 1 + Math.floor(dist / mid * (midC - 1));
      for (let c = Math.floor(midC-half); c <= Math.floor(midC+half); c++)
        if (c >= 0 && c < COLS) m[r][c] = true;
    }
    return m;
  }

  function makeCross() {
    const m = blank();
    const midC = Math.floor(COLS/2), midR = Math.floor(ROWS/2);
    for (let r = 1; r < ROWS-1; r++) for (let c = midC-2; c <= midC+2; c++) if(c>=0&&c<COLS) m[r][c] = true;
    for (let c = 1; c < COLS-1; c++) for (let r = midR-2; r <= midR+2; r++) if(r>=0&&r<ROWS) m[r][c] = true;
    return m;
  }

  function makeZigzag() {
    const m = blank();
    const bandW = 3; // width of each diagonal band
    for (let r = 1; r < ROWS - 1; r++)
      for (let c = 1; c < COLS - 1; c++) {
        const diag = Math.floor((r + c) / bandW);
        if (diag % 2 === 0) m[r][c] = true;
      }
    return m;
  }

  function makeHeart() {
    const m = blank();
    const pts = [
      [1,3],[1,4],[1,8],[1,9],
      [2,2],[2,3],[2,4],[2,5],[2,7],[2,8],[2,9],[2,10],
      [3,1],[3,2],[3,3],[3,4],[3,5],[3,6],[3,7],[3,8],[3,9],[3,10],[3,11],
      [4,1],[4,2],[4,3],[4,4],[4,5],[4,6],[4,7],[4,8],[4,9],[4,10],[4,11],
      [5,1],[5,2],[5,3],[5,4],[5,5],[5,6],[5,7],[5,8],[5,9],[5,10],[5,11],
      [6,2],[6,3],[6,4],[6,5],[6,6],[6,7],[6,8],[6,9],[6,10],
      [7,2],[7,3],[7,4],[7,5],[7,6],[7,7],[7,8],[7,9],[7,10],
      [8,3],[8,4],[8,5],[8,6],[8,7],[8,8],[8,9],
      [9,4],[9,5],[9,6],[9,7],[9,8],
      [10,5],[10,6],[10,7],
      [11,6],
    ];
    pts.forEach(([r,c]) => { if(r<ROWS&&c<COLS) m[r][c] = true; });
    return m;
  }

  function makeArrow() {
    const m = blank(), midC = Math.floor(COLS/2);
    // Arrow head (upper triangle)
    for (let r = 1; r <= 5; r++) {
      const half = r;
      for (let c = midC - half; c <= midC + half; c++) if(c>=0&&c<COLS) m[r][c] = true;
    }
    // Shaft
    for (let r = 6; r < ROWS-1; r++) for (let c = midC-2; c <= midC+2; c++) if(c>=0&&c<COLS) m[r][c] = true;
    return m;
  }

  function makeStaircase() {
    const m = blank();
    const stepH = 2, stepW = Math.floor(COLS/4);
    for (let step = 0; step < 4; step++) {
      const c0 = step * stepW;
      const r0 = step * stepH + 1;
      for (let r = r0; r < ROWS-1; r++)
        for (let c = c0; c < Math.min(COLS-1, c0 + (4-step)*stepW); c++)
          m[r][c] = true;
    }
    return m;
  }

  function makeRings() {
    const m = blank(), midR = ROWS/2, midC = COLS/2;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const dr = (r - midR) / (ROWS/2);
        const dc = (c - midC) / (COLS/2);
        const d = Math.sqrt(dr*dr + dc*dc);
        if (d < 0.95 && d > 0.35) m[r][c] = true;
      }
    return m;
  }

  // ── Get the target (slot) position for a shape cell (pixel centre) ──
  function slotXY(sc, sr) {
    return {
      x: sc * CELL + CELL/2,
      y: sr * CELL + CELL/2,
    };
  }

  // ── Check if a point is inside the shape ──────────────────
  function inShape(px, py) {
    const c = Math.floor(px / CELL);
    const r = Math.floor(py / CELL);
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && !!shape[r]?.[c];
  }

  const BALL_R = CELL / 2;
  const FALL_SPEED = 16;
  const LERP_H = 0.18;

  function buildBalls() {
    const numColors = Math.min(2 + Math.floor((level-1) / 2), COLORS.length);
    balls = [];

    const slots = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (shape[r][c]) slots.push({sc: c, sr: r});

    // Build colour array with runs then shuffle — retry until at least one
    // adjacent pair of the same colour exists (guarantees a valid first move).
    let colours;
    let attempts = 0;
    do {
      colours = [];
      let i = 0;
      while (i < slots.length) {
        const ci = Math.floor(Math.random() * numColors);
        const run = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < run && i < slots.length; j++, i++) colours.push(ci);
      }
      // Fisher-Yates shuffle
      for (let k = colours.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k+1));
        [colours[k], colours[j]] = [colours[j], colours[k]];
      }
      attempts++;
      // Check solvability: any slot with an orthogonal neighbour of the same colour?
      const colourMap = {};
      slots.forEach(({sc,sr}, idx) => { colourMap[`${sc},${sr}`] = colours[idx % colours.length]; });
      const solvable = slots.some(({sc,sr}) => {
        const c = colourMap[`${sc},${sr}`];
        return [[sc-1,sr],[sc+1,sr],[sc,sr-1],[sc,sr+1]].some(([nc,nr]) => colourMap[`${nc},${nr}`] === c);
      });
      if (solvable) break;
    } while (attempts < 20); // cap retries — on failure force a fix below

    // If still unsolvable after retries (extremely unlikely), force one adjacent pair
    if (attempts >= 20) {
      const colourMap = {};
      slots.forEach(({sc,sr}, idx) => { colourMap[`${sc},${sr}`] = colours[idx % colours.length]; });
      outer: for (let i = 0; i < slots.length; i++) {
        const {sc, sr} = slots[i];
        for (const [nc, nr] of [[sc+1,sr],[sc,sr+1]]) {
          const ni = slots.findIndex(s => s.sc===nc && s.sr===nr);
          if (ni !== -1) { colours[ni] = colours[i % colours.length]; break outer; }
        }
      }
    }

    slots.forEach(({sc, sr}, idx) => {
      const tx = sc * CELL + CELL/2;
      const ty = sr * CELL + CELL/2;
      const rowDelay = (ROWS - 1 - sr) * CELL * 0.6;
      const ball = {
        sc, sr,
        x: tx,
        y: -CELL - rowDelay,
        r: BALL_R,
        color: COLORS[colours[idx % colours.length]],
        settled: false,
        targetX: tx,
        targetY: ty,
      };
      assignPowerup(ball);
      balls.push(ball);
    });

    // Add stone obstacles (they start settled, no drop animation)
    addStoneBalls();
    invalidateBallMap();

    falling = true;
  }

  function physicsTick(dt) {
    let anyMoving = false;
    balls.forEach(b => {
      if (b.settled) return;

      // X: smooth horizontal roll
      const dx = b.targetX - b.x;
      if (Math.abs(dx) > 0.5) b.x += dx * 0.22;
      else b.x = b.targetX;

      // Y: fast gravity-style fall
      const dy = b.targetY - b.y;
      if (Math.abs(dy) > 0.5) {
        b.y += Math.min(Math.abs(dy), Math.max(FALL_SPEED, Math.abs(dy) * 0.3)) * Math.sign(dy);
      } else {
        b.y = b.targetY;
      }

      if (Math.abs(b.x - b.targetX) < 1.0 && Math.abs(b.y - b.targetY) < 1.0) {
        b.x = b.targetX; b.y = b.targetY;
        b.settled = true;
        return;
      }
      anyMoving = true;
    });
    return anyMoving;
  }

  function resettleBalls(removedSlots) {
    const removed = new Set(removedSlots.map(({sc,sr})=>`${sc},${sr}`));
    balls = balls.filter(b => !removed.has(`${b.sc},${b.sr}`));
    invalidateBallMap();

    // ── Pure gravity settlement ───────────────────────────────
    // Simulate like real marbles: each ball falls straight down until
    // blocked, then rolls off to whichever side lets it continue falling.
    // Process top-to-bottom repeatedly until nothing moves.

    let changed = true;
    while (changed) {
      changed = false;

      // Build fresh occupancy each pass
      const occ = new Set(balls.map(b => `${b.sc},${b.sr}`));

      // Process top→bottom so balls above don't block balls below
      const sorted = [...balls].sort((a, b) => a.sr - b.sr);

      for (const ball of sorted) {
        const { sc, sr } = ball;

        // Can fall straight down?
        if (shape[sr+1]?.[sc] && !occ.has(`${sc},${sr+1}`)) {
          occ.delete(`${sc},${sr}`);
          ball.sr = sr + 1;
          occ.add(`${sc},${ball.sr}`);
          changed = true;
          continue;
        }

        // Blocked below — can we roll? Only roll if the destination is
        // inside the shape AND has a drop available below it (so the ball
        // actually continues falling, not just slides sideways forever).
        // Try left first, then right. Prefer whichever has a deeper drop.
        const leftOpen  = shape[sr]?.[sc-1] && !occ.has(`${sc-1},${sr}`) && shape[sr+1]?.[sc-1] && !occ.has(`${sc-1},${sr+1}`);
        const rightOpen = shape[sr]?.[sc+1] && !occ.has(`${sc+1},${sr}`) && shape[sr+1]?.[sc+1] && !occ.has(`${sc+1},${sr+1}`);

        if (leftOpen || rightOpen) {
          // Pick the side with the longer drop (more open cells below)
          const dropDepth = (c) => {
            let depth = 0;
            for (let r = sr + 1; r < ROWS; r++) {
              if (shape[r]?.[c] && !occ.has(`${c},${r}`)) depth++;
              else break;
            }
            return depth;
          };
          const goLeft = leftOpen && (!rightOpen || dropDepth(sc-1) >= dropDepth(sc+1));
          const nc = goLeft ? sc - 1 : sc + 1;
          occ.delete(`${sc},${sr}`);
          ball.sc = nc;
          occ.add(`${nc},${sr}`);
          changed = true;
        }
      }
    }

    // Assign animation targets from settled positions
    for (const ball of balls) {
      const tx = ball.sc * CELL + CELL / 2;
      const ty = ball.sr * CELL + CELL / 2;
      if (Math.abs(ball.targetX - tx) > 1 || Math.abs(ball.targetY - ty) > 1) {
        ball.targetX = tx;
        ball.targetY = ty;
        ball.settled = false;
      }
    }

    falling = true;
    if (!rafId) schedLoop();
  }

  // ── RAF loop ──────────────────────────────────────────────
  function schedLoop() {
    rafId = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (!ts) ts = performance.now();
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    if (!paused && !gameOver) {
      // Frenzy countdown
      if (_frenzyActive) {
        _frenzyTimer -= dt * 1000;
        if (_frenzyTimer <= 0) {
          _frenzyActive = false; _frenzyTimer = 0;
          document.getElementById('bb-hint').textContent = '⏱ Frenzy over!';
        } else {
          const secs = Math.ceil(_frenzyTimer/1000);
          document.getElementById('bb-hint').textContent = `⚡ FRENZY! ${secs}s — pop anything!`;
        }
      }
      const stillMoving = physicsTick(dt);
      // Update pop animations
      for (let i = popAnims.length - 1; i >= 0; i--) {
        const pa = popAnims[i];
        pa.life -= dt * 60;
        pa.particles.forEach(p => {
          if (!p.ring) {
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.13; p.vx *= 0.97;
          }
          p.life--;
        });
        pa.particles = pa.particles.filter(p => p.life > 0);
        if (pa.life <= 0 && !pa.particles.length) popAnims.splice(i, 1);
      }

      if (!stillMoving && falling) {
        falling = false;
        hoveredGroup = null;
        checkLevelComplete();
      }
    }

    draw();
    const keepGoing = popAnims.length > 0 || balls.some(b => !b.settled) || true; // always animate for neon walls
    if (keepGoing) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
      if (!falling) draw(); // final settle draw
    }
  }

  // ── Group finding (iterative BFS — prevents stack overflows on large grids) ───
  function getGroup(sc, sr) {
    const bmap = getBallMap();
    const targetBall = bmap.get(`${sc},${sr}`);
    if (!targetBall || !targetBall.settled || targetBall.powerup === 'stone') return [];
    const baseColor = targetBall.color;
    const isRainbow = targetBall.powerup === 'rainbow';
    const visited = new Set();
    const group = [];
    // BFS queue holds {c, r, matchColor} — matchColor null means "accept any" (rainbow mode)
    const queue = [{c: sc, r: sr, matchColor: isRainbow ? null : baseColor}];
    visited.add(`${sc},${sr}`);
    while (queue.length > 0) {
      const {c, r, matchColor} = queue.shift(); // shift = true FIFO queue for BFS
      const ball = bmap.get(`${c},${r}`);
      if (!ball || !ball.settled || ball.powerup === 'stone') continue;
      const matches = matchColor === null || ball.powerup === 'rainbow' || ball.color === matchColor;
      if (!matches) continue;
      group.push(ball);
      const nextColor = ball.powerup === 'rainbow' ? null : ball.color;
      const neighbors = [
        {c: c-1, r}, {c: c+1, r}, {c, r: r-1}, {c, r: r+1}
      ];
      for (const n of neighbors) {
        const key = `${n.c},${n.r}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({c: n.c, r: n.r, matchColor: nextColor});
        }
      }
    }
    return group;
  }

  // ── Pop ───────────────────────────────────────────────────
  function pop(group) {
    if (falling) return;
    if (group.length < 1) return;
    if (group.length < 2 && !_frenzyActive) return;
    const n = group.length;
    const pts = (n*n + (n>=10?50:n>=6?20:0)) * level;
    score += pts; if (score > best) best = score;

    // FX
    if (window.FX && canvas) {
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width / canvas.width, sy = rect.height / canvas.height;
      group.forEach(b => {
        FX.burst(rect.left + b.x*sx, rect.top + b.y*sy, {
          count: n>=6?14:8, colors:[b.color,'#ffffff',b.color],
          speed: n>=10?6:4, life:45, size:3, shape:'circle', gravity:0.15,
        });
      });
      if (n>=10) { FX.screenFlash(group[0].color,0.25); FX.shake(6); }
      else if (n>=6) FX.screenFlash(group[0].color,0.12);
    }

    // Local pop particles — bubble shards, droplets, and an expanding ring
    // Cap particles per bubble based on group size to avoid frame spikes
    const particlesPerBall = n >= 12 ? 6 : n >= 6 ? 10 : 14;
    const highlightsPerBall = n >= 12 ? 2 : n >= 6 ? 3 : 5;
    group.forEach(b => {
      const hex = b.color.replace('#','');
      const ri = parseInt(hex.slice(0,2),16), gi2 = parseInt(hex.slice(2,4),16), bi2 = parseInt(hex.slice(4,6),16);
      // Droplet shards
      const parts = Array.from({length: particlesPerBall}, (_, i) => {
        const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 2.5 + Math.random() * 4.5;
        return {
          x: b.x, y: b.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          life: 22 + Math.random() * 16,
          maxLife: 38,
          color: b.color,
          ri, gi: gi2, bi: bi2,
          r: 2.5 + Math.random() * 3,
          isDroplet: true,
        };
      });
      // Expanding ring
      parts.push({ x: b.x, y: b.y, ring: true, ringR: BALL_R * 0.6, ringMaxR: BALL_R * 2.2,
                   life: 18, maxLife: 18, color: b.color, ri, gi: gi2, bi: bi2 });
      // Tiny highlight shards
      for (let i = 0; i < highlightsPerBall; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        parts.push({ x: b.x - BALL_R*0.25, y: b.y - BALL_R*0.3,
                     vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 2,
                     life: 12+Math.random()*8, maxLife: 20,
                     color: '#ffffff', ri:255, gi:255, bi:255, r: 1.5, isDroplet: true });
      }
      popAnims.push({ life: 38, particles: parts });
    });

    // SFX
    BBSFX.resume();
    if (n >= 10) BBSFX.bigPop(n);
    else BBSFX.pop(n);

    // ── Power-up effects ─────────────────────────────────────
    let extraRemoved = [];
    let hintOverride = null;

    // BOMB: clears 2-cell radius
    const bombBalls = group.filter(b => b.powerup === 'bomb');
    if (bombBalls.length) {
      const removedKeys = new Set(group.map(b => `${b.sc},${b.sr}`));
      bombBalls.forEach(eb => {
        balls.forEach(b => {
          if (b.powerup === 'stone') return; // stone survives normal bomb? No — bomb destroys stone too
          const key = `${b.sc},${b.sr}`;
          if (removedKeys.has(key)) return;
          if (Math.abs(b.sc-eb.sc)<=2 && Math.abs(b.sr-eb.sr)<=2) { removedKeys.add(key); extraRemoved.push(b); }
        });
        // Blast FX
        const hex=eb.color.replace('#','');
        const ri=parseInt(hex.slice(0,2),16),gi2=parseInt(hex.slice(2,4),16),bi2=parseInt(hex.slice(4,6),16);
        popAnims.push({life:30,particles:[
          {x:eb.x,y:eb.y,ring:true,ringR:BALL_R,ringMaxR:BALL_R*5,life:28,maxLife:28,color:'#ff6a00',ri:255,gi:106,bi:0},
          {x:eb.x,y:eb.y,ring:true,ringR:BALL_R*0.4,ringMaxR:BALL_R*3,life:20,maxLife:20,color:'#ffe600',ri:255,gi:230,bi:0},
        ]});
        const bparts=Array.from({length:20},(_, i)=>{const a=(i/20)*Math.PI*2,s=3+Math.random()*6;
          return{x:eb.x,y:eb.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2,life:25+Math.random()*15,maxLife:40,
            color:i%2?'#ff6a00':'#ffe600',ri:255,gi:i%2?106:230,bi:0,r:2+Math.random()*3,isDroplet:true};});
        popAnims.push({life:40,particles:bparts});
        if(window.FX&&canvas){const rect=canvas.getBoundingClientRect(),sx=rect.width/canvas.width,sy=rect.height/canvas.height;
          FX.burst(rect.left+eb.x*sx,rect.top+eb.y*sy,{count:20,colors:['#ff6a00','#ffe600','#fff'],speed:7,life:50,size:4,shape:'circle',gravity:0.2});
          FX.screenFlash('#ff6a00',0.25); FX.shake(7);}
        setTimeout(()=>{BBSFX.resume();BBSFX.bigPop(extraRemoved.length+1);},60);
      });
      const bpts = extraRemoved.length * 12 * level;
      score += bpts; if(score>best) best=score;
      hintOverride = `💣 BOOM! +${pts+bpts} pts`;
    }

    // LIGHTNING: clears entire row
    const lightBalls = group.filter(b => b.powerup === 'lightning');
    if (lightBalls.length) {
      const removedKeys = new Set([...group,...extraRemoved].map(b=>`${b.sc},${b.sr}`));
      lightBalls.forEach(lb => {
        const row = lb.sr;
        balls.forEach(b => {
          const key=`${b.sc},${b.sr}`;
          if(removedKeys.has(key)||b.powerup==='stone') return;
          if(b.sr===row){removedKeys.add(key); extraRemoved.push(b);}
        });
        // Lightning FX — horizontal bolt
        if(canvas){
          const W=canvas.width;
          for(let c=0;c<COLS;c++){
            const bx=c*CELL+CELL/2,by=row*CELL+CELL/2;
            popAnims.push({life:20,particles:[
              {x:bx,y:by,ring:true,ringR:0,ringMaxR:BALL_R*1.5,life:15,maxLife:15,color:'#ffe600',ri:255,gi:230,bi:0}
            ]});
          }
          if(window.FX){const rect=canvas.getBoundingClientRect(),sy=rect.height/canvas.height;
            FX.screenFlash('#ffe600',0.2); FX.shake(4);}
        }
        setTimeout(()=>{BBSFX.resume();BBSFX.bigPop(COLS);},40);
      });
      const lpts = extraRemoved.length * 10 * level;
      score += lpts; if(score>best) best=score;
      hintOverride = `⚡ LIGHTNING ROW! +${pts+lpts} pts`;
    }

    // SNIPER: removes all same-colour balls anywhere
    const sniperBalls = group.filter(b => b.powerup === 'sniper');
    if (sniperBalls.length) {
      const removedKeys = new Set([...group,...extraRemoved].map(b=>`${b.sc},${b.sr}`));
      sniperBalls.forEach(sb => {
        const targetColor = sb.color;
        balls.forEach(b => {
          const key=`${b.sc},${b.sr}`;
          if(removedKeys.has(key)||b.powerup==='stone') return;
          if(b.color===targetColor){removedKeys.add(key); extraRemoved.push(b);}
        });
        if(window.FX&&canvas){FX.screenFlash('#ff2d78',0.2);}
        setTimeout(()=>{BBSFX.resume();BBSFX.bigPop(extraRemoved.length);},80);
      });
      const spts = extraRemoved.length * 20 * level;
      score += spts; if(score>best) best=score;
      hintOverride = `🎯 SNIPER! All ${group[0].color === sniperBalls[0]?.color ? 'that colour' : ''} gone! +${pts+spts} pts`;
    }

    // FRENZY: start 5-second frenzy mode
    const frenzyBalls = group.filter(b => b.powerup === 'frenzy');
    if (frenzyBalls.length) {
      _frenzyActive = true;
      _frenzyTimer = 5000;
      if(window.FX){FX.screenFlash('#bf00ff',0.3);}
      BBSFX.resume(); BBSFX.bigPop(6);
      hintOverride = '⏱ FRENZY! 5 seconds — pop ANYTHING!';
    }

    const allRemoved = [...group, ...extraRemoved].map(b => ({sc:b.sc,sr:b.sr}));
    document.getElementById('bb-hint').textContent =
      hintOverride ? hintOverride :
      n>=10 ? `💥 MEGA POP! +${pts} pts` : n>=6 ? `🎉 BIG POP! +${pts} pts` : `+${pts} pts`;
    hoveredGroup = null; hovered = null;
    resetIdleHint();
    resettleBalls(allRemoved);
    updateUI();
    if (!rafId) schedLoop();
  }

  // ── Level complete ─────────────────────────────────────────
  function checkLevelComplete() {
    if (balls.length === 0) {
      score += 1000 * level; if (score > best) best = score; level++;
      BBSFX.resume(); BBSFX.levelUp();
      setTimeout(() => {
        document.getElementById('bb-hint').textContent = `⬆ LEVEL ${level}!`;
        // Check if this level has a new power-up tutorial first
        checkTutorial(() => { startLevel(); updateUI(); draw(); });
      }, 500);
      return;
    }
    if (!hasValidMoves()) setTimeout(endGame, 300);
  }

  // ── Fast game-over detection (single O(n) pass — checks only right & bottom neighbors) ──
  function hasValidMoves() {
    const map = getBallMap();
    for (const b of balls) {
      if (!b.settled) continue;
      if (b.powerup === 'stone') continue;
      // Power-up bubbles (bomb/lightning/sniper/frenzy/rainbow) always constitute a valid move
      // if they have any settled non-stone neighbor
      if (b.powerup === 'bomb' || b.powerup === 'lightning' || b.powerup === 'sniper' || b.powerup === 'frenzy' || b.powerup === 'rainbow') {
        const neighbors = [
          map.get(`${b.sc+1},${b.sr}`),
          map.get(`${b.sc-1},${b.sr}`),
          map.get(`${b.sc},${b.sr+1}`),
          map.get(`${b.sc},${b.sr-1}`),
        ];
        if (neighbors.some(n => n && n.settled && n.powerup !== 'stone')) return true;
        continue;
      }
      // For normal bubbles — only check right and bottom to avoid double-counting
      const right = map.get(`${b.sc+1},${b.sr}`);
      if (right && right.settled && right.powerup !== 'stone' && (right.color === b.color || right.powerup === 'rainbow')) return true;
      const bottom = map.get(`${b.sc},${b.sr+1}`);
      if (bottom && bottom.settled && bottom.powerup !== 'stone' && (bottom.color === b.color || bottom.powerup === 'rainbow')) return true;
    }
    return false;
  }

  // ── Smart hint: find the largest available group ──────────
  function getBestAvailableMove() {
    const map = getBallMap();
    const visited = new Set();
    let bestGroup = [];
    for (const b of balls) {
      if (!b.settled || b.powerup === 'stone') continue;
      const key = `${b.sc},${b.sr}`;
      if (visited.has(key)) continue;
      const group = getGroup(b.sc, b.sr);
      group.forEach(m => visited.add(`${m.sc},${m.sr}`));
      if (group.length > bestGroup.length) bestGroup = group;
    }
    return bestGroup;
  }

  // Idle hint: after 3s of no mouse movement, pulse the best move
  let _idleHintTimer = null;
  let _hintGroup = null;
  function resetIdleHint() {
    if (_idleHintTimer) clearTimeout(_idleHintTimer);
    _hintGroup = null;
    _idleHintTimer = setTimeout(() => {
      if (paused || gameOver || falling || hoveredGroup) return;
      _hintGroup = getBestAvailableMove();
      if (_hintGroup.length >= 2) {
        const n = _hintGroup.length;
        const pts = (n*n + (n>=10?50:n>=6?20:0)) * level;
        document.getElementById('bb-hint').textContent = `💡 Hint: ${n} bubble${n!==1?'s':''} available (+${pts} pts)`;
        if (!rafId) draw();
      }
      _hintGroup = null; // only flash once
    }, 3000);
  }

  // ── Draw ──────────────────────────────────────────────────
  const hovColor = new Set();
  // ── Cached draw assets (rebuilt when level changes) ──────
  let _bgGrad = null, _bgGradW = 0, _bgGradH = 0;
  let _wallPath = null;
  let _wallJoints = null; // [{x,y}]
  let _shapePath = null;

  function rebuildDrawCache() {
    const W = canvas.width, H = canvas.height;
    _bgGrad = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.7);
    _bgGrad.addColorStop(0,'rgba(30,0,80,0.15)');
    _bgGrad.addColorStop(1,'rgba(0,0,30,0.4)');
    _bgGradW = W; _bgGradH = H;

    // Wall path (single Path2D)
    _wallPath = new Path2D();
    for (const seg of wallSegs) {
      _wallPath.moveTo(seg.x1, seg.y1);
      _wallPath.lineTo(seg.x2, seg.y2);
    }

    // Joint dots
    const jmap = new Map();
    for (const seg of wallSegs) {
      for (const k of [`${seg.x1},${seg.y1}`,`${seg.x2},${seg.y2}`]) {
        jmap.set(k, (jmap.get(k)||0)+1);
      }
    }
    _wallJoints = [];
    jmap.forEach((_, key) => {
      const [jx,jy] = key.split(',').map(Number);
      _wallJoints.push({x:jx,y:jy});
    });

    // Shape fill path
    _shapePath = new Path2D();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (shape[r][c]) _shapePath.rect(c*CELL+1, r*CELL+1, CELL-2, CELL-2);
  }

  function draw() {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background — solid + cached gradient
    ctx.fillStyle = '#020510'; ctx.fillRect(0, 0, W, H);
    if (_bgGrad) { ctx.fillStyle = _bgGrad; ctx.fillRect(0, 0, W, H); }

    // ── Shape interior fill (cached Path2D) ─────────────────
    if (_shapePath) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,20,60,0.55)';
      ctx.fill(_shapePath);
      ctx.restore();
    }

    // ── Draw NEON WALLS (cached paths) ──────────────────────
    if (_wallPath) {
      ctx.save();
      const now = performance.now();
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.003);
      const wc = wallColor;

      // Three glow passes using same Path2D
      const glowPasses = [[18, 0.07], [10, 0.18], [5, 0.4]];
      for (const [gw, baseAlpha] of glowPasses) {
        ctx.strokeStyle = wc;
        ctx.lineWidth = gw;
        ctx.globalAlpha = pulse * baseAlpha;
        ctx.shadowColor = wc;
        ctx.shadowBlur = gw * 2;
        ctx.stroke(_wallPath);
      }

      // Core bright line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.95;
      ctx.shadowColor = wc;
      ctx.shadowBlur = 8;
      ctx.stroke(_wallPath);

      // Joint dots
      ctx.shadowBlur = 8;
      ctx.fillStyle = wc;
      ctx.globalAlpha = 1;
      for (const j of (_wallJoints||[])) {
        ctx.beginPath();
        ctx.arc(j.x, j.y, 3, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.restore();
    }

    // ── Hover highlight slots ───────────────────────────────
    const hovSlots = new Set(hoveredGroup ? hoveredGroup.map(b=>`${b.sc},${b.sr}`) : []);

    // ── Draw balls ──────────────────────────────────────────
    // Two-pass ball rendering: glow pass (shadow) then body pass (no shadow)
    // This avoids setting/clearing shadowBlur for every ball individually.
    ctx.save();
    // Pass 1: glow halos only
    for (const b of balls) {
      const r = b.r || BALL_R;
      if (b.powerup === 'stone') continue; // stone has its own look
      const isHov = hovSlots.has(`${b.sc},${b.sr}`);
      ctx.shadowBlur = isHov ? 28 : 14;
      if (b.powerup === 'bomb') ctx.shadowColor = '#ff6a00';
      else if (b.powerup === 'lightning') ctx.shadowColor = '#ffe600';
      else if (b.powerup === 'sniper') ctx.shadowColor = '#ff2d78';
      else if (b.powerup === 'frenzy') ctx.shadowColor = '#bf00ff';
      else ctx.shadowColor = b.color;
      ctx.globalAlpha = b.settled ? 0.35 : 0.25;
      ctx.beginPath(); ctx.arc(b.x, b.y,Math.max(0,r * 1.1), 0, Math.PI*2);
      ctx.fillStyle = ctx.shadowColor;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
    // Pass 2: ball bodies (no shadow)
    balls.forEach(b => drawBall(b, hovSlots.has(`${b.sc},${b.sr}`)));

    // ── Pop particles (batched by type — no per-particle save/restore/gradient) ──
    if (popAnims.length) {
      // Split into rings and droplets for batched rendering
      const rings = [], drops = [];
      for (const pa of popAnims)
        for (const p of pa.particles)
          (p.ring ? rings : drops).push(p);

      // Rings — no shadow, just stroked arcs batched by colour
      ctx.save();
      ctx.shadowBlur = 0;
      for (const p of rings) {
        const t = Math.max(0, p.life / p.maxLife);
        const progress = 1 - t;
        const ringR = p.ringMinR !== undefined
          ? p.ringMinR + (p.ringMaxR - p.ringMinR) * progress
          : BALL_R * 0.6 + BALL_R * 1.6 * progress;
        ctx.globalAlpha = t * 0.7;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.5, 2.5 * t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, ringR), 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();

      // Droplets — solid fill, batched, no gradients, no shadow
      ctx.save();
      ctx.shadowBlur = 0;
      for (const p of drops) {
        const t = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = t * 0.88;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.r * t * 0.5 + p.r * 0.5), 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── BB SFX Engine ─────────────────────────────────────────
  const BBSFX = (() => {
    let ctx = null;
    function getCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(()=>{});
      return ctx;
    }
    function tone(freq, dur, type='sine', vol=0.15, freqEnd=null, delay=0) {
      try {
        const c = getCtx();
        const osc = c.createOscillator(); const gain = c.createGain();
        osc.connect(gain); gain.connect(c.destination);
        osc.type = type;
        const t = c.currentTime + delay;
        osc.frequency.setValueAtTime(freq, t);
        if (freqEnd != null) osc.frequency.linearRampToValueAtTime(freqEnd, t + dur);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t); osc.stop(t + dur + 0.02);
      } catch(e) {}
    }
    function noise(dur, vol=0.10, delay=0) {
      try {
        const c = getCtx();
        const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random()*2-1;
        const src = c.createBufferSource(); src.buffer = buf;
        const gain = c.createGain();
        src.connect(gain); gain.connect(c.destination);
        const t = c.currentTime + delay;
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.start(t); src.stop(t + dur + 0.02);
      } catch(e) {}
    }
    return {
      pop(n) {
        // Bubbly pop: short high sine + noise burst, pitch rises with group size
        const freq = 700 + Math.min(n, 10) * 55;
        tone(freq, 0.07, 'sine', 0.18, freq * 1.4);
        noise(0.05, 0.08 + Math.min(n,8)*0.01);
        if (n >= 6) tone(freq * 1.5, 0.1, 'sine', 0.12, freq * 2, 0.04);
      },
      hover() { tone(520, 0.04, 'sine', 0.06, 600); },
      bigPop(n) {
        // Chain of pops for mega groups
        for (let i = 0; i < Math.min(n, 6); i++) {
          tone(800 + i*80, 0.08, 'sine', 0.14, 1200+i*60, i*0.035);
          noise(0.06, 0.06, i*0.035);
        }
      },
      levelUp() {
        [523,659,784,1047,1319].forEach((f,i) => tone(f, 0.13, 'sine', 0.14, null, i*0.09));
        setTimeout(() => tone(1319, 0.45, 'sine', 0.11, 1047), 520);
      },
      gameOver() {
        [440,370,330,262].forEach((f,i) => tone(f, 0.22, 'sine', 0.13, null, i*0.19));
      },
      resume() { if (ctx && ctx.state==='suspended') ctx.resume().catch(()=>{}); },
    };
  })();


  // ══════════════════════════════════════════════════════════
  // ── POWER-UP SYSTEM ──────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  // Milestones: level → power-up type introduced
  const POWERUP_MILESTONES = {
    2:  'rainbow',
    4:  'bomb',
    6:  'lightning',
    8:  'stone',
    10: 'sniper',
    12: 'frenzy',
  };

  const POWERUP_INFO = {
    rainbow: {
      name: '🌈 RAINBOW BUBBLE',
      desc: 'Joins ANY colour group — use it to complete clusters that are one bubble short. Match it with any 1+ neighbours to pop the whole group.',
      color: '#ffffff',
      chance: 0.04,
    },
    bomb: {
      name: '💣 BOMB BUBBLE',
      desc: 'A normal colour bubble with a hidden blast. When its group pops, it also destroys all bubbles within 2 cells — any colour, no exceptions.',
      color: '#ff6a00',
      chance: 0.04,
    },
    lightning: {
      name: '⚡ LIGHTNING BUBBLE',
      desc: 'Match it like normal, then BOOM — the entire row it sits in gets wiped out instantly. Perfect for clearing stranded bottom-row bubbles.',
      color: '#ffe600',
      chance: 0.03,
    },
    stone: {
      name: '🪨 STONE BUBBLE',
      desc: 'Unbreakable by normal matching — it blocks gravity flow and group connections. Destroy it only with an adjacent Bomb or Lightning blast.',
      color: '#888888',
      chance: 0.05,
    },
    sniper: {
      name: '🎯 SNIPER BUBBLE',
      desc: 'Match it with same-colour neighbours, then every single bubble of that colour on the entire board vanishes — even isolated ones.',
      color: '#ff2d78',
      chance: 0.03,
    },
    frenzy: {
      name: '⏱ FRENZY BUBBLE',
      desc: 'Match it to trigger 5 seconds of FRENZY — every group you click pops instantly, no minimum size. Singles, pairs, everything goes!',
      color: '#bf00ff',
      chance: 0.025,
    },
  };

  let _seenTutorials = new Set();
  let _tutAnimRaf = null;
  let _frenzyTimer = 0;    // ms remaining
  let _frenzyActive = false;

  // ── Which power-ups are active this level ──────────────────
  function activePowerups() {
    const active = [];
    for (const [lvl, type] of Object.entries(POWERUP_MILESTONES)) {
      if (level >= parseInt(lvl)) active.push(type);
    }
    return active;
  }

  // ── Assign power-up type to a ball ────────────────────────
  function assignPowerup(ball) {
    const active = activePowerups().filter(t => t !== 'stone'); // stone handled separately
    if (!active.length) return;
    for (const type of active) {
      if (Math.random() < POWERUP_INFO[type].chance) {
        ball.powerup = type;
        if (type === 'rainbow') ball.color = _rainbowDisplayColor();
        else if (type === 'bomb') ball.bombColor = ball.color; // keep colour, add bomb
        else if (type === 'lightning') ball.lightningColor = ball.color;
        else if (type === 'sniper') ball.sniperColor = ball.color;
        else if (type === 'frenzy') ball.frenzyColor = ball.color;
        return; // only one powerup per ball
      }
    }
  }

  // ── Stone balls (separate — no colour group, obstacles) ───
  function addStoneBalls() {
    if (level < 8) return;
    const stoneCount = Math.min(1 + Math.floor((level - 8) / 3), 4);
    // Pick random settled slots that aren't already occupied
    const occupied = new Set(balls.map(b => `${b.sc},${b.sr}`));
    const freeSlots = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (shape[r]?.[c] && !occupied.has(`${c},${r}`)) freeSlots.push({sc:c, sr:r});
    // Shuffle and pick
    for (let k = freeSlots.length-1; k > 0; k--) {
      const j = Math.floor(Math.random()*(k+1));
      [freeSlots[k],freeSlots[j]]=[freeSlots[j],freeSlots[k]];
    }
    for (let i = 0; i < Math.min(stoneCount, freeSlots.length); i++) {
      const {sc, sr} = freeSlots[i];
      const tx = sc*CELL+CELL/2, ty = sr*CELL+CELL/2;
      balls.push({ sc, sr, x:tx, y:ty, r:BALL_R, color:'#6a7080',
        powerup:'stone', settled:true, targetX:tx, targetY:ty });
    }
  }

  // ── Rainbow display colour cycles ──────────────────────────
  function _rainbowDisplayColor() { return '#ffffff'; }

  // ── Check if tutorial needed before level starts ──────────
  function checkTutorial(onDone) {
    const milestone = POWERUP_MILESTONES[level];
    if (!milestone || _seenTutorials.has(milestone)) { onDone(); return; }
    _seenTutorials.add(milestone);
    showTutorial(milestone, onDone);
  }

  // ── Show tutorial overlay with animated canvas ────────────
  function showTutorial(type, onDone) {
    const info = POWERUP_INFO[type];
    const overlay = document.getElementById('bb-tutorial-overlay');
    document.getElementById('bb-tut-name').textContent = info.name;
    document.getElementById('bb-tut-desc').textContent = info.desc;
    overlay.style.display = 'flex';
    overlay.classList.add('active');

    // Store callback
    overlay._onDone = onDone;

    // Start animation
    if (_tutAnimRaf) cancelAnimationFrame(_tutAnimRaf);
    const tc = document.getElementById('bb-tut-canvas');
    const tx = tc.getContext('2d');
    let t = 0;
    function animTut() {
      t += 0.04;
      tx.clearRect(0,0,160,160);
      tx.fillStyle='#020510'; tx.fillRect(0,0,160,160);
      drawTutAnimation(tx, type, t, 160);
      _tutAnimRaf = requestAnimationFrame(animTut);
    }
    animTut();
  }

  // ── Tutorial dismiss ──────────────────────────────────────
  function tutDismiss() {
    const overlay = document.getElementById('bb-tutorial-overlay');
    overlay.style.display = 'none';
    overlay.classList.remove('active');
    if (_tutAnimRaf) { cancelAnimationFrame(_tutAnimRaf); _tutAnimRaf = null; }
    if (overlay._onDone) { const cb = overlay._onDone; overlay._onDone = null; cb(); }
  }

  // ── Draw tutorial animations ──────────────────────────────
  function drawTutAnimation(tx, type, t, size) {
    const cx = size/2, cy = size/2, r = 18;

    function drawBubbleTut(x, y, color, label, pulse, special) {
      tx.save();
      const hex = color.replace('#','');
      const ri = parseInt(hex.slice(0,2)||'ff',16);
      const gi = parseInt(hex.slice(2,4)||'ff',16);
      const bi = parseInt(hex.slice(4,6)||'ff',16);
      // Glow
      tx.shadowColor = color; tx.shadowBlur = pulse ? 14+Math.sin(t*3)*6 : 10;
      // Body
      const g = tx.createRadialGradient(x-r*0.3,y-r*0.35,1,x,y,Math.max(0.01,r));
      g.addColorStop(0, `rgba(${ri},${gi},${bi},0.18)`);
      g.addColorStop(0.7,`rgba(${ri},${gi},${bi},0.55)`);
      g.addColorStop(1,  `rgba(${ri},${gi},${bi},0.88)`);
      tx.beginPath(); tx.arc(x,y,Math.max(0,r),0,Math.PI*2);
      tx.fillStyle=g; tx.globalAlpha=1; tx.fill();
      // Rim
      tx.shadowBlur=0; tx.beginPath(); tx.arc(x,y,Math.max(0,r),0,Math.PI*2);
      tx.strokeStyle=color; tx.lineWidth=1.8; tx.stroke();
      // Glint
      tx.beginPath(); tx.arc(x-r*0.28,y-r*0.3,Math.max(0,r*0.32),0,Math.PI*2);
      tx.fillStyle='rgba(255,255,255,0.85)'; tx.fill();
      // Label
      if (label) {
        tx.font=`${Math.round(r*0.9)}px sans-serif`;
        tx.textAlign='center'; tx.textBaseline='middle';
        tx.fillStyle='#fff'; tx.shadowBlur=4; tx.shadowColor='#000';
        tx.fillText(label, x, y+r*0.08);
        tx.shadowBlur=0;
      }
      tx.restore();
    }

    function drawRing(x, y, rad, color, alpha) {
      tx.save(); tx.globalAlpha = alpha;
      tx.beginPath(); tx.arc(x,y,Math.max(0,rad),0,Math.PI*2);
      tx.strokeStyle=color; tx.lineWidth=2;
      tx.shadowColor=color; tx.shadowBlur=8;
      tx.stroke(); tx.restore();
    }

    if (type === 'rainbow') {
      // Row of coloured bubbles, rainbow in middle joins them all
      const colors = ['#ff2d78','#ffffff','#00f5ff'];
      const xs = [cx-44, cx, cx+44];
      const phase = Math.floor(t/2) % 3; // cycle through demos
      // Draw normal bubbles
      drawBubbleTut(xs[0], cy, colors[0], null, false);
      drawBubbleTut(xs[2], cy, colors[2], null, false);
      // Rainbow bubble pulses with rainbow gradient
      tx.save();
      const rg = tx.createLinearGradient(xs[1]-r,cy-r,xs[1]+r,cy+r);
      rg.addColorStop(0,'#ff2d78'); rg.addColorStop(0.25,'#ffe600');
      rg.addColorStop(0.5,'#39ff14'); rg.addColorStop(0.75,'#00f5ff');
      rg.addColorStop(1,'#bf00ff');
      tx.shadowColor='#fff'; tx.shadowBlur=12+Math.sin(t*2)*4;
      tx.beginPath(); tx.arc(xs[1],cy,Math.max(0,r+Math.sin(t*2))*2,0,Math.PI*2);
      tx.fillStyle=rg; tx.fill();
      tx.strokeStyle='#fff'; tx.lineWidth=2; tx.stroke();
      tx.beginPath(); tx.arc(xs[1]-r*0.28,cy-r*0.3,Math.max(0,r*0.32),0,Math.PI*2);
      tx.fillStyle='rgba(255,255,255,0.85)'; tx.fill();
      tx.restore();
      // Connection lines pulse
      const lp = 0.5+0.5*Math.sin(t*2);
      tx.save(); tx.globalAlpha=lp*0.7;
      tx.strokeStyle='#fff'; tx.lineWidth=2; tx.setLineDash([4,3]);
      tx.beginPath(); tx.moveTo(xs[0]+r,cy); tx.lineTo(xs[1]-r,cy); tx.stroke();
      tx.beginPath(); tx.moveTo(xs[1]+r,cy); tx.lineTo(xs[2]-r,cy); tx.stroke();
      tx.restore();
      tx.save(); tx.fillStyle='#c8e8ff'; tx.font='11px monospace';
      tx.textAlign='center'; tx.fillText('matches any colour!', cx, cy+r+18);
      tx.restore();

    } else if (type === 'bomb') {
      const phase = t % 4;
      if (phase < 2) {
        // Show bomb bubble in a group
        drawBubbleTut(cx-22, cy, '#39ff14', null, false);
        drawBubbleTut(cx+22, cy, '#39ff14', null, false);
        // Bomb bubble (same colour, bomb icon)
        drawBubbleTut(cx, cy, '#39ff14', null, true);
        tx.save(); tx.font=`${Math.round(r*0.8)}px sans-serif`;
        tx.textAlign='center'; tx.textBaseline='middle';
        tx.fillStyle='#fff'; tx.fillText('💣', cx, cy+r*0.08); tx.restore();
        tx.save(); tx.fillStyle='#ffe600'; tx.font='11px monospace';
        tx.textAlign='center'; tx.fillText('click the group...', cx, cy+r+18); tx.restore();
      } else {
        // Explosion
        const ep = (phase-2)/2;
        const blastR = ep * r * 3.5;
        drawRing(cx, cy, blastR, '#ff6a00', 1-ep*0.8);
        drawRing(cx, cy, blastR*0.6, '#ffe600', (1-ep)*0.7);
        // Debris
        for (let i=0;i<8;i++) {
          const a=(i/8)*Math.PI*2; const d=ep*r*3;
          tx.save(); tx.globalAlpha=(1-ep)*0.9;
          tx.fillStyle=i%2?'#ff6a00':'#ffe600';
          tx.beginPath(); tx.arc(cx+Math.cos(a)*d, cy+Math.sin(a)*d, 3,0,Math.PI*2);
          tx.fill(); tx.restore();
        }
        tx.save(); tx.fillStyle='#ff6a00'; tx.font='11px monospace';
        tx.textAlign='center'; tx.fillText('...BOOM! clears 2-cell radius', cx, cy+r*3.5+8); tx.restore();
      }

    } else if (type === 'lightning') {
      // Show bubble in row, then row wipes
      const phase = t % 3;
      const DEMO_COLS = 5;
      const spacing = (size-20) / DEMO_COLS;
      const startX = 10 + spacing/2;
      const ry = cy;
      const lp = Math.min(1, Math.max(0, (phase-1.5)/0.5));
      for (let i=0;i<DEMO_COLS;i++) {
        const bx = startX + i*spacing;
        const isLightning = i===2;
        const fadeOut = lp > 0;
        tx.save(); tx.globalAlpha = fadeOut ? 1-lp : 1;
        drawBubbleTut(bx, ry, isLightning ? '#ffe600' : '#00f5ff', isLightning?'⚡':null, isLightning);
        tx.restore();
      }
      if (lp > 0) {
        // Lightning bolt across row
        tx.save(); tx.globalAlpha=lp;
        tx.strokeStyle='#ffe600'; tx.lineWidth=3+lp*3;
        tx.shadowColor='#ffe600'; tx.shadowBlur=15;
        tx.beginPath(); tx.moveTo(10,ry); tx.lineTo(size-10,ry); tx.stroke();
        tx.restore();
      }
      tx.save(); tx.fillStyle='#ffe600'; tx.font='11px monospace';
      tx.textAlign='center'; tx.fillText('wipes the entire row!', cx, ry+r+18); tx.restore();

    } else if (type === 'stone') {
      // Stone blocking path, bomb destroys it
      const phase = t % 4;
      // Draw stone
      const sx = cx, sy = cy;
      tx.save();
      tx.shadowColor='#888'; tx.shadowBlur=6;
      tx.beginPath(); tx.arc(sx,sy,Math.max(0,r),0,Math.PI*2);
      const sg = tx.createRadialGradient(sx-r*0.2,sy-r*0.2,2,sx,sy,Math.max(0.01,r));
      sg.addColorStop(0,'#aab'); sg.addColorStop(0.6,'#778'); sg.addColorStop(1,'#445');
      tx.fillStyle=sg; tx.fill();
      tx.strokeStyle='#9ab'; tx.lineWidth=1.5; tx.stroke();
      // Crack lines
      tx.strokeStyle='rgba(0,0,0,0.5)'; tx.lineWidth=1;
      tx.beginPath(); tx.moveTo(sx-5,sy-8); tx.lineTo(sx+3,sy+2); tx.lineTo(sx+6,sy+7); tx.stroke();
      tx.beginPath(); tx.moveTo(sx-8,sy+3); tx.lineTo(sx+4,sy-3); tx.stroke();
      tx.restore();
      if (phase < 2) {
        tx.save(); tx.fillStyle='#aabbcc'; tx.font='11px monospace';
        tx.textAlign='center'; tx.fillText('cannot be matched...', cx, sy+r+18); tx.restore();
        // Show normal bubbles bouncing off
        const bp = (phase%1);
        drawBubbleTut(cx-r*2.5-bp*4, cy, '#ff2d78', null, false);
      } else {
        // Bomb destroys it
        const ep = (phase-2)/2;
        drawRing(sx,sy,ep*r*2.5,'#ff6a00',1-ep);
        tx.save(); tx.globalAlpha=1-ep;
        tx.shadowColor='#888'; tx.shadowBlur=6;
        tx.beginPath(); tx.arc(sx,sy,Math.max(0,r*(1-ep*0.5)),0,Math.PI*2);
        const sg2 = tx.createRadialGradient(sx,sy,0,sx,sy,Math.max(0.01,r));
        sg2.addColorStop(0,'#aab'); sg2.addColorStop(1,'#445');
        tx.fillStyle=sg2; tx.fill(); tx.restore();
        tx.save(); tx.fillStyle='#ff6a00'; tx.font='11px monospace';
        tx.textAlign='center'; tx.fillText('...only bombs destroy it!', cx, sy+r+18); tx.restore();
      }

    } else if (type === 'sniper') {
      // Grid of same-colour scattered, sniper wipes all
      const phase = t % 3;
      const targets = [{x:cx-40,y:cy-30},{x:cx+10,y:cy-20},{x:cx-15,y:cy+25},{x:cx+38,y:cy+10},{x:cx-38,y:cy+10}];
      const lp = Math.min(1,Math.max(0,(phase-1.5)/0.8));
      targets.forEach((pos,i) => {
        tx.save(); tx.globalAlpha=1-lp;
        drawBubbleTut(pos.x,pos.y,'#ff2d78',null,false);
        tx.restore();
        if (lp > 0) {
          // Crosshair
          tx.save(); tx.globalAlpha=lp*0.9;
          tx.strokeStyle='#ff2d78'; tx.lineWidth=1.5;
          tx.shadowColor='#ff2d78'; tx.shadowBlur=6;
          const cr=10+lp*4;
          tx.beginPath(); tx.arc(pos.x,pos.y,Math.max(0,cr),0,Math.PI*2); tx.stroke();
          tx.beginPath(); tx.moveTo(pos.x-cr-4,pos.y); tx.lineTo(pos.x+cr+4,pos.y); tx.stroke();
          tx.beginPath(); tx.moveTo(pos.x,pos.y-cr-4); tx.lineTo(pos.x,pos.y+cr+4); tx.stroke();
          tx.restore();
        }
      });
      // The sniper bubble
      drawBubbleTut(cx+5, cy-5, '#ff2d78', '🎯', true);
      tx.save(); tx.fillStyle='#ff2d78'; tx.font='11px monospace';
      tx.textAlign='center'; tx.fillText('wipes ALL of that colour!', cx, cy+r+38); tx.restore();

    } else if (type === 'frenzy') {
      // Timer counting down, singles popping
      const phase = t % 3;
      const timeLeft = Math.max(0, 5 - (t % 5));
      const fp = phase < 1.5;
      // Show frenzy bubble + timer
      drawBubbleTut(cx, cy-15, '#bf00ff', '⏱', true);
      // Timer arc
      const timerA = (timeLeft/5) * Math.PI*2;
      tx.save();
      tx.strokeStyle='#bf00ff'; tx.lineWidth=4; tx.lineCap='round';
      tx.shadowColor='#bf00ff'; tx.shadowBlur=10;
      tx.beginPath(); tx.arc(cx,cy-15,Math.max(0,r+8),-Math.PI/2,-Math.PI/2+timerA); tx.stroke();
      tx.restore();
      // Solo bubbles popping during frenzy
      const singles = [{x:cx-35,y:cy+28,c:'#ff2d78'},{x:cx,y:cy+28,c:'#00f5ff'},{x:cx+35,y:cy+28,c:'#39ff14'}];
      singles.forEach((s,i) => {
        const popPhase = (t*1.5 + i*0.8) % 3;
        if (popPhase < 1.5) {
          drawBubbleTut(s.x, s.y, s.c, null, true);
        } else {
          const ep=(popPhase-1.5)/1.5;
          drawRing(s.x,s.y,ep*r*1.8,s.c,(1-ep)*0.8);
        }
      });
      tx.save(); tx.fillStyle='#bf00ff'; tx.font='11px monospace';
      tx.textAlign='center'; tx.fillText('5 sec: pop anything — even singles!', cx, cy+r+48); tx.restore();
    }
  }

  // ══════════════════════════════════════════════════════════

  function drawBall(b, highlighted) {
    const r = b.r || BALL_R;
    const alpha = b.settled ? 1 : 0.88;
    const color = b.color;
    const now = performance.now();
    const pu = b.powerup;
    ctx.save();
    ctx.globalAlpha = alpha;

    // ── Stone bubble: totally different look ──────────────────
    if (pu === 'stone') {
      ctx.beginPath(); ctx.arc(b.x, b.y,Math.max(0,r), 0, Math.PI*2);
      const sg = ctx.createRadialGradient(b.x-r*0.2,b.y-r*0.2,2,b.x,b.y,Math.max(0.01,r));
      sg.addColorStop(0,'#aabbcc'); sg.addColorStop(0.6,'#778899'); sg.addColorStop(1,'#334455');
      ctx.fillStyle = sg; ctx.globalAlpha = alpha; ctx.fill();
      ctx.strokeStyle='#99aabb'; ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r),0,Math.PI*2); ctx.stroke();
      // Crack lines
      ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(b.x-5,b.y-8); ctx.lineTo(b.x+3,b.y+2); ctx.lineTo(b.x+6,b.y+7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x-8,b.y+3); ctx.lineTo(b.x+4,b.y-3); ctx.stroke();
      // 🪨 icon
      ctx.font=`${Math.round(r*0.82)}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.globalAlpha=alpha*0.9; ctx.fillStyle='#fff';
      ctx.fillText('🪨',b.x,b.y+r*0.06);
      ctx.restore(); return;
    }

    const hex = color.replace('#','');
    const ri = parseInt(hex.slice(0,2)||'ff',16), gi2 = parseInt(hex.slice(2,4)||'ff',16), bi2 = parseInt(hex.slice(4,6)||'ff',16);

    // ── Power-up outer aura (animated rings only — glow handled by pre-pass) ─
    if (pu === 'rainbow') {
      const pulse = 0.5+0.5*Math.sin(now*0.004);
      // Spinning rainbow ring
      ctx.save();
      for(let i=0;i<12;i++){
        const a=(i/12)*Math.PI*2+(now*0.002);
        const hue=Math.round((i/12)*360);
        ctx.strokeStyle=`hsl(${hue},100%,65%)`;
        ctx.lineWidth=2.5; ctx.globalAlpha=0.6+pulse*0.3;
        ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r+3+pulse*2),a,a+0.6); ctx.stroke();
      }
      ctx.restore();
    } else if (pu === 'bomb') {
      const pulse=0.5+0.5*Math.sin(now*0.006+b.sc);
      ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r+2+pulse*2),0,Math.PI*2);
      ctx.strokeStyle=`rgba(255,${Math.floor(80+pulse*100)},0,${0.5+pulse*0.4})`;
      ctx.lineWidth=2.5; ctx.stroke();
    } else if (pu === 'lightning') {
      const pulse=0.5+0.5*Math.sin(now*0.008+b.sr);
      ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r+2),0,Math.PI*2);
      ctx.strokeStyle=`rgba(255,230,0,${0.5+pulse*0.45})`; ctx.lineWidth=2.5; ctx.stroke();
    } else if (pu === 'sniper') {
      const pulse=0.5+0.5*Math.sin(now*0.005+b.sc*1.5);
      // Crosshair ring
      ctx.save();
      ctx.strokeStyle=`rgba(255,45,120,${0.55+pulse*0.4})`; ctx.lineWidth=2;
      ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r+4+pulse*2),0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    } else if (pu === 'frenzy') {
      const pulse=0.5+0.5*Math.sin(now*0.01+b.sc);
      ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r+2+pulse*3),0,Math.PI*2);
      ctx.strokeStyle=`rgba(191,0,255,${0.5+pulse*0.45})`; ctx.lineWidth=2.5; ctx.stroke();
    } else {
      // glow handled by pre-pass
    }

    // ── Rainbow body: gradient fill ───────────────────────────
    let bodyFill;
    if (pu === 'rainbow') {
      const rg = ctx.createLinearGradient(b.x-r,b.y-r,b.x+r,b.y+r);
      const shift=(now*0.0005)%1;
      rg.addColorStop(0,`hsl(${Math.round(shift*360)},100%,65%)`);
      rg.addColorStop(0.33,`hsl(${Math.round((shift+0.33)*360)%360},100%,65%)`);
      rg.addColorStop(0.66,`hsl(${Math.round((shift+0.66)*360)%360},100%,65%)`);
      rg.addColorStop(1,`hsl(${Math.round((shift+1)*360)%360},100%,65%)`);
      bodyFill = rg;
    } else {
      const g = ctx.createRadialGradient(b.x-r*0.32,b.y-r*0.38,Math.max(0.01,r*0.04),b.x,b.y,Math.max(0.01,r));
      g.addColorStop(0,  `rgba(${ri},${gi2},${bi2},0.18)`);
      g.addColorStop(0.45,`rgba(${ri},${gi2},${bi2},0.28)`);
      g.addColorStop(0.78,`rgba(${ri},${gi2},${bi2},0.55)`);
      g.addColorStop(1,  `rgba(${ri},${gi2},${bi2},0.85)`);
      bodyFill = g;
    }

    ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r),0,Math.PI*2);
    ctx.fillStyle=bodyFill; ctx.globalAlpha=alpha; ctx.fill();

    // ── Rim ──────────────────────────────────────────────────
    ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r),0,Math.PI*2);
    ctx.strokeStyle = pu==='rainbow'?'#fff' : highlighted?'#ffffff':color;
    ctx.lineWidth = highlighted ? 2.5 : 1.8;
    ctx.globalAlpha = alpha*(highlighted?1:0.85); ctx.stroke();

    // ── Primary specular glint ───────────────────────────────
    const sg = ctx.createRadialGradient(b.x-r*0.3,b.y-r*0.35,0,b.x-r*0.25,b.y-r*0.3,Math.max(0.01,r*0.38));
    sg.addColorStop(0,'rgba(255,255,255,0.90)');
    sg.addColorStop(0.5,'rgba(255,255,255,0.30)');
    sg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(b.x-r*0.25,b.y-r*0.3,Math.max(0,r*0.38),0,Math.PI*2);
    ctx.fillStyle=sg; ctx.globalAlpha=alpha; ctx.fill();

    // ── Secondary glint ──────────────────────────────────────
    const sg2=ctx.createRadialGradient(b.x+r*0.35,b.y+r*0.32,0,b.x+r*0.35,b.y+r*0.32,Math.max(0.01,r*0.18));
    sg2.addColorStop(0,'rgba(255,255,255,0.35)'); sg2.addColorStop(1,'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(b.x+r*0.35,b.y+r*0.32,Math.max(0,r*0.18),0,Math.PI*2);
    ctx.fillStyle=sg2; ctx.globalAlpha=alpha*0.7; ctx.fill();

    // ── Power-up icons ───────────────────────────────────────
    const ICONS = {bomb:'💣',lightning:'⚡',sniper:'🎯',frenzy:'⏱',rainbow:'🌈'};
    if (ICONS[pu]) {
      const pulse3=0.78+0.22*Math.sin(now*0.007+b.sc*2);
      ctx.globalAlpha=alpha*pulse3;
      ctx.font=`bold ${Math.round(r*0.78)}px sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='#fff';
      ctx.fillText(ICONS[pu],b.x,b.y+r*0.06);
    }

    // ── Hover ring ───────────────────────────────────────────
    if (highlighted) {
      ctx.globalAlpha=0.45;
      ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(0,r*1.2),0,Math.PI*2);
      ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  function lighten(hex, a) { const [r,g,b]=hr(hex); return `rgb(${Math.min(255,r+~~(255*a))},${Math.min(255,g+~~(255*a))},${Math.min(255,b+~~(255*a))})`; }
  function darken(hex, a)  { const [r,g,b]=hr(hex); return `rgb(${Math.max(0,r-~~(255*a))},${Math.max(0,g-~~(255*a))},${Math.max(0,b-~~(255*a))})`; }
  function hr(h) { const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }

  // ── Level start ───────────────────────────────────────────
  function startLevel() {
    const shapeFn = LEVEL_SHAPES[Math.floor(Math.random() * LEVEL_SHAPES.length)];
    shape = shapeFn();
    buildWalls();
    wallColorIdx = (wallColorIdx + 1) % WALL_COLORS.length;
    wallColor = WALL_COLORS[wallColorIdx];
    buildBalls();
    falling = true;
    hoveredGroup = null;
    if (canvas && ctx) rebuildDrawCache();
    if (!rafId) schedLoop();
  }

  // ── Public interface ──────────────────────────────────────
  function init() {
    canvas = document.getElementById('bb-canvas');
    ctx = canvas.getContext('2d');
    canvas.width  = COLS * CELL;
    canvas.height = ROWS * CELL;
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', () => { hoveredGroup = null; if (!falling) draw(); });
  }

  function newGame() {
    if (!canvas) init();
    score = 0; level = 1; paused = false; gameOver = false;
    balls = []; popAnims = []; falling = false; hoveredGroup = null;
    _hintGroup = null; if (_idleHintTimer) clearTimeout(_idleHintTimer);
    _seenTutorials = new Set();
    _frenzyActive = false; _frenzyTimer = 0;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    document.getElementById('bb-pause-overlay').classList.remove('active');
    document.getElementById('bb-end-overlay').classList.remove('active');
    document.getElementById('bb-pause-btn').textContent = '⏸ PAUSE';
    updateUI();
    startLevel();
  }

  function updateUI() {
    const remaining = balls.filter(b=>b.settled).length;
    document.getElementById('bb-score').textContent     = score.toLocaleString();
    document.getElementById('bb-best').textContent      = best.toLocaleString();
    document.getElementById('bb-level').textContent     = level;
    document.getElementById('bb-remaining').textContent = remaining;
  }

  function endGame() {
    gameOver = true;
    BBSFX.resume(); BBSFX.gameOver();
    document.getElementById('bb-end-score').textContent = score.toLocaleString();
    document.getElementById('bb-end-msg').textContent = score >= best ? '🏆 NEW HIGH SCORE!' : score >= 2000 ? '🎉 Great game!' : 'No more moves.';
    document.getElementById('bb-end-overlay').classList.add('active');
    updateUI();
    if (score > 0) setTimeout(() => HS.promptSubmit('bubblebreaker', score, score.toLocaleString()), 400);
  }

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    document.getElementById('bb-pause-btn').textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
    document.getElementById('bb-pause-overlay').classList.toggle('active', paused);
    if (!paused) { if (!rafId) schedLoop(); }
  }

  // ── Input ─────────────────────────────────────────────────
  function ballFromEvent(e) {
    if (falling) return null;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width  * canvas.width;
    const py = (e.clientY - rect.top)  / rect.height * canvas.height;
    const r2 = (BALL_R * 1.3)**2;
    // Quick spatial lookup: convert pixel→grid cell, check map
    const sc = Math.floor(px / CELL), sr = Math.floor(py / CELL);
    const b = getBallMap().get(`${sc},${sr}`);
    return (b && b.settled && (b.x-px)**2 + (b.y-py)**2 < r2) ? b : null;
  }

  function onMouseMove(e) {
    resetIdleHint(); // reset idle hint timer on every mouse move
    if (paused || gameOver || falling) return;
    const b = ballFromEvent(e);
    if (!b) { hoveredGroup = null; canvas.style.cursor = 'default'; if (!rafId) draw(); return; }
    const g = getGroup(b.sc, b.sr);
    const prevKey = hoveredGroup ? hoveredGroup[0].sc+','+hoveredGroup[0].sr : null;
    // Explosive bubbles are always clickable solo
    hoveredGroup = g.length >= 2 ? g : null;
    canvas.style.cursor = hoveredGroup ? 'pointer' : 'default';
    if (hoveredGroup) {
      const newKey = hoveredGroup[0].sc+','+hoveredGroup[0].sr;
      if (newKey !== prevKey) { BBSFX.resume(); BBSFX.hover(); }
      const n = hoveredGroup.length;
      const pts = (n*n + (n>=10?50:n>=6?20:0)) * level;
      document.getElementById('bb-hint').textContent = `${n} bubble${n!==1?'s':''} — click to pop (+${pts} pts)`;
    }
    if (!rafId) draw();
  }

  function onCanvasClick(e) {
    if (paused || gameOver || falling) return;
    const b = ballFromEvent(e);
    if (!b || b.powerup==='stone') { 
      if (b?.powerup==='stone') document.getElementById('bb-hint').textContent = '🪨 Stone! Use a Bomb or Lightning to destroy it.';
      return; 
    }
    const g = getGroup(b.sc, b.sr);
    if (_frenzyActive) { if(g.length>=1) pop(g); return; }
    if (g.length < 2) { document.getElementById('bb-hint').textContent = 'Need 2+ connected bubbles!'; return; }
    pop(g);
  }

  return {
    newGame, togglePause, tutDismiss,
    get paused()   { return paused; },   set paused(v)   { paused = v; },
    get gameOver() { return gameOver; }, set gameOver(v) { gameOver = v; },
  };
})();
