// TRON game module
// Auto-extracted from monolithic index.html

export default (function() {
  'use strict';

  // ── Grid config ───────────────────────────────────────────
  const GCOLS = 80, GROWS = 60;
  const CELL  = 9;  // px per grid cell
  const W = GCOLS * CELL, H = GROWS * CELL;

  // Player colours
  const C1 = '#00ffff';  // P1 cyan
  const C2 = '#ff9500';  // P2 orange

  // Speed: cells per second
  const SPEED_BASE = 14;
  const AI_REACT_INTERVAL = 90; // ms between AI decisions

  // ── State ─────────────────────────────────────────────────
  let canvas, ctx, raf = null;
  let mode = null;      // 'ai' | 'local' | 'online'
  let running = false, paused = false, roundOver = false;
  let grid = null;      // Uint8Array — 0=empty, 1=p1 trail, 2=p2 trail
  let p1, p2;
  let p1Wins = 0, p2Wins = 0;
  let roundNum = 0;
  const MAX_ROUNDS = 10;
  let obstacles = []; // {col, row} Tron-themed wall segments
let _obstacleCanvas = null; // cached obstacle render (rebuilt on round start)
const _bikeCache = {};     // key: "color:dx:dy" -> offscreen canvas sprite
  let lastTime = 0, accumulator = 0;
  let aiTimer = 0;
  let countdownTimeout = null;

  // Online
  let onlineRole = null;  // 'host'|'guest'
  let onlineCode = null;
  let myName = '', oppName = '';
  let fbUnsubs = [];
  let lobbyUnsub = null;
  let _inputSeq = 0;
  let _lastProcessedSeq = 0;
  let onlineGameRef = null;
  let onlineSyncTimer = null;

  // ── Canvas setup ──────────────────────────────────────────
  function resize() {
    if (!canvas) return;
    const wrap = document.querySelector('.tron-canvas-wrap');
    if (!wrap) return;
    const maxW = Math.min(wrap.clientWidth - 4, 900);
    const maxH = (wrap.clientHeight || window.innerHeight * 0.7) - 4;
    const scale = Math.min(maxW / W, maxH / H, 2);
    canvas.style.width  = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
  }

  function initCanvas() {
    canvas = document.getElementById('tron-canvas');
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  // ── Player factory ────────────────────────────────────────
  function makePlayer(col, row, dx, dy, color, num) {
    return { col, row, dx, dy, color, num, alive: true, qx: dx, qy: dy,
             trail: [{col, row}] };  // ordered list of positions for path drawing
  }

  function initPlayers() {
    // Find a clear spawn point near an ideal position.
    // Searches outward in a spiral until a cell has a clear radius of SAFE cells.
    const SAFE = 6; // minimum clear radius around spawn
    function findSpawn(idealCol, idealRow, dx, dy) {
      // Build a quick obstacle lookup from current obstacles array
      const blocked = new Set(obstacles.map(o => o.row * GCOLS + o.col));
      const isClear = (c, r, radius) => {
        for (let dr = -radius; dr <= radius; dr++)
          for (let dc = -radius; dc <= radius; dc++) {
            const nc = c + dc, nr = r + dr;
            if (nc < 1 || nc >= GCOLS-1 || nr < 1 || nr >= GROWS-1) return false;
            if (blocked.has(nr * GCOLS + nc)) return false;
          }
        return true;
      };
      // Spiral outward from ideal position
      if (isClear(idealCol, idealRow, SAFE)) return { col: idealCol, row: idealRow };
      for (let radius = 1; radius < 20; radius++) {
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
            const c = idealCol + dc, r = idealRow + dr;
            if (c < SAFE+1 || c >= GCOLS-SAFE-1 || r < SAFE+1 || r >= GROWS-SAFE-1) continue;
            if (isClear(c, r, SAFE)) return { col: c, row: r };
          }
        }
      }
      // Fallback: scan whole grid for any clear cell
      for (let r = SAFE+1; r < GROWS-SAFE-1; r++)
        for (let c = SAFE+1; c < GCOLS-SAFE-1; c++)
          if (isClear(c, r, 3)) return { col: c, row: r };
      return { col: idealCol, row: idealRow };
    }

    const s1 = findSpawn(Math.floor(GCOLS * 0.25), Math.floor(GROWS * 0.5),  1, 0);
    const s2 = findSpawn(Math.floor(GCOLS * 0.75), Math.floor(GROWS * 0.5), -1, 0);
    p1 = makePlayer(s1.col, s1.row,  1, 0, C1, 1);
    p2 = makePlayer(s2.col, s2.row, -1, 0, C2, 2);
  }

  function initGrid() {
    grid = new Uint8Array(GCOLS * GROWS);
    // Place obstacles first (value 9 = wall)
    for (const ob of obstacles) {
      grid[ob.row * GCOLS + ob.col] = 9;
    }
    // Place starting positions
    grid[p1.row * GCOLS + p1.col] = 1;
    grid[p2.row * GCOLS + p2.col] = 2;
  }

  // ── Arena shapes — one per round (cycles after 10) ─────────
  // Each shape returns an array of {col, row} wall cells.
  // The play area is GCOLS×GROWS (80×60). All shapes leave a
  // safe spawn buffer around p1 (col≈20,row≈30) and p2 (col≈60,row≈30).
  const ARENA_SHAPES = [

    // Round 1 — Open field: just the border walls, no interior obstacles
    (rn) => {
      const walls = [];
      // Outer border (thickened to 2 cells)
      for (let c = 0; c < GCOLS; c++) {
        walls.push({col:c,row:0},{col:c,row:1});
        walls.push({col:c,row:GROWS-1},{col:c,row:GROWS-2});
      }
      for (let r = 0; r < GROWS; r++) {
        walls.push({col:0,row:r},{col:1,row:r});
        walls.push({col:GCOLS-1,row:r},{col:GCOLS-2,row:r});
      }
      return walls;
    },

    // Round 2 — Cross divider: one vertical + one horizontal wall with gaps
    (rn) => {
      const walls = [];
      const mc = Math.floor(GCOLS/2), mr = Math.floor(GROWS/2);
      // Vertical spine with two gaps (for players to pass through)
      for (let r = 2; r < GROWS-2; r++) {
        if ((r >= mr-6 && r <= mr-2) || (r >= mr+2 && r <= mr+6)) continue;
        walls.push({col:mc,row:r},{col:mc+1,row:r});
      }
      // Horizontal bar (top half only) with gap in centre
      for (let c = 6; c < GCOLS-6; c++) {
        if (c >= mc-8 && c <= mc+8) continue;
        walls.push({col:c,row:mr});
      }
      return walls;
    },

    // Round 3 — Four pillars in the corners of each half
    (rn) => {
      const walls = [];
      const pillar = (cc, rr, w=4, h=4) => {
        for (let dr=0; dr<h; dr++) for (let dc=0; dc<w; dc++)
          walls.push({col:cc+dc, row:rr+dr});
      };
      // 4 pillars per side — 8 total
      const cols = [10, 22, GCOLS-23, GCOLS-11];
      const rows = [8, GROWS-12];
      for (const c of cols) for (const r of rows) pillar(c, r, 4, 4);
      // Central divider with 3 gaps
      const mc = Math.floor(GCOLS/2);
      for (let r = 4; r < GROWS-4; r++) {
        if (r >= 16 && r <= 20) continue;
        if (r >= 28 && r <= 32) continue;
        if (r >= 40 && r <= 44) continue;
        walls.push({col:mc,row:r});
      }
      return walls;
    },

    // Round 4 — Maze corridors: 3 horizontal walls with staggered gaps
    (rn) => {
      const walls = [];
      const rows = [Math.floor(GROWS*0.25), Math.floor(GROWS*0.5), Math.floor(GROWS*0.75)];
      rows.forEach((r, i) => {
        // Alternate which side has the gap
        for (let c = 2; c < GCOLS-2; c++) {
          const gapLeft  = c >= 4 && c <= 16;
          const gapRight = c >= GCOLS-17 && c <= GCOLS-5;
          const gapCentre = c >= Math.floor(GCOLS/2)-6 && c <= Math.floor(GCOLS/2)+6;
          if (i === 0 && (gapLeft || gapCentre)) continue;
          if (i === 1 && gapCentre) continue;
          if (i === 2 && (gapRight || gapCentre)) continue;
          walls.push({col:c,row:r},{col:c,row:r+1});
        }
      });
      return walls;
    },

    // Round 5 — Diamond arena: rotated square inner wall
    (rn) => {
      const walls = [];
      const cx = GCOLS/2, cy = GROWS/2, rad = 18;
      const pts = new Set();
      for (let t = 0; t < 200; t++) {
        const angle = (t / 200) * Math.PI * 2;
        // Diamond = L1 circle: |x|+|y| = rad
        const fx = Math.cos(angle), fy = Math.sin(angle);
        const scale = rad / (Math.abs(fx) + Math.abs(fy));
        const c = Math.round(cx + fx * scale);
        const r = Math.round(cy + fy * scale);
        if (c>4&&c<GCOLS-4&&r>4&&r<GROWS-4) pts.add(`${c},${r}`);
      }
      for (const k of pts) {
        const [c,r] = k.split(',').map(Number);
        walls.push({col:c,row:r});
      }
      // Four corner blockades
      [[6,4],[GCOLS-10,4],[6,GROWS-8],[GCOLS-10,GROWS-8]].forEach(([cc,rr]) => {
        for (let dr=0;dr<4;dr++) for (let dc=0;dc<4;dc++)
          walls.push({col:cc+dc,row:rr+dr});
      });
      return walls;
    },

    // Round 6 — Pinwheel / spiral arms
    (rn) => {
      const walls = [];
      const cx = GCOLS/2, cy = GROWS/2;
      // 4 spiral arms radiating from centre, rotated 90° each
      const arm = (startAngle) => {
        for (let step = 0; step < 22; step++) {
          const angle = startAngle + step * 0.18;
          const r2 = 6 + step * 1.1;
          const c = Math.round(cx + Math.cos(angle) * r2);
          const r = Math.round(cy + Math.sin(angle) * r2 * 0.75);
          if (c>4&&c<GCOLS-4&&r>3&&r<GROWS-3) {
            walls.push({col:c,row:r});
            if (c+1<GCOLS-4) walls.push({col:c+1,row:r});
          }
        }
      };
      arm(0); arm(Math.PI/2); arm(Math.PI); arm(Math.PI*3/2);
      return walls;
    },

    // Round 7 — Double ring: two concentric oval walls
    (rn) => {
      const walls = [];
      const cx = GCOLS/2, cy = GROWS/2;
      const addEllipse = (rx, ry) => {
        const pts = new Set();
        for (let t = 0; t < 300; t++) {
          const angle = (t/300)*Math.PI*2;
          const c = Math.round(cx + Math.cos(angle)*rx);
          const r = Math.round(cy + Math.sin(angle)*ry);
          if (c>3&&c<GCOLS-3&&r>3&&r<GROWS-3) pts.add(`${c},${r}`);
        }
        for (const k of pts) {
          const [c,r] = k.split(',').map(Number);
          walls.push({col:c,row:r});
        }
      };
      addEllipse(30, 20); // outer ring
      addEllipse(14, 9);  // inner ring
      // Cut passages at 4 cardinal points on each ring (so bikes can move between zones)
      return walls.filter(w => {
        const dc = w.col - cx, dr = w.row - cy;
        // Remove cells near N/S/E/W axes (±3 cells) to create doorways
        return !(Math.abs(dc) < 4 || Math.abs(dr) < 3);
      });
    },

    // Round 8 — Checkerboard fortresses: alternating 3×3 blocks
    (rn) => {
      const walls = [];
      for (let r = 8; r < GROWS-8; r += 9) {
        for (let c = 8; c < GCOLS-8; c += 10) {
          // Skip blocks near spawn zones
          const nearP1 = c >= 12 && c <= 26 && r >= 22 && r <= 38;
          const nearP2 = c >= 54 && c <= 68 && r >= 22 && r <= 38;
          if (nearP1 || nearP2) continue;
          if (((r/9) + (c/10)) % 2 === 0) {
            for (let dr=0;dr<3;dr++) for (let dc=0;dc<3;dc++)
              walls.push({col:c+dc,row:r+dr});
          }
        }
      }
      return walls;
    },

    // Round 9 — Channel maze: corridors with dead ends
    (rn) => {
      const walls = [];
      // Vertical channels
      const vCols = [16, 32, 48, 64];
      for (const vc of vCols) {
        const gapTop    = vc <= 32 ? [4,14] : [GROWS-15, GROWS-5];
        const gapBottom = vc <= 32 ? [GROWS-15, GROWS-5] : [4,14];
        for (let r = 2; r < GROWS-2; r++) {
          const inGapT = r >= gapTop[0] && r <= gapTop[1];
          const inGapB = r >= gapBottom[0] && r <= gapBottom[1];
          if (!inGapT && !inGapB) walls.push({col:vc,row:r},{col:vc+1,row:r});
        }
      }
      // Horizontal shelves in each channel
      [[8,16,30],[22,32,46],[8,48,62],[22,64,GCOLS-6]].forEach(([r,c1,c2]) => {
        for (let c=c1+2; c<c2-2; c++) walls.push({col:c,row:r},{col:c,row:r+1});
      });
      return walls;
    },

    // Round 10 — Gauntlet: dense obstacle field, two clear lanes
    (rn) => {
      const walls = [];
      // Random-seed based on round to keep it deterministic each game
      let seed = 42 + rn * 137;
      const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
      // Top and bottom dense zones
      for (let attempt = 0; attempt < 120; attempt++) {
        const c = 4 + Math.floor(rand() * (GCOLS-8));
        const r = rand() < 0.5
          ? 4  + Math.floor(rand() * 18)   // top zone
          : GROWS-22 + Math.floor(rand() * 18); // bottom zone
        const len = 3 + Math.floor(rand() * 5);
        const horiz = rand() < 0.5;
        // Skip spawn areas
        const nearP1 = c <= 30 && r >= 20 && r <= 40;
        const nearP2 = c >= 50 && r >= 20 && r <= 40;
        if (nearP1 || nearP2) continue;
        for (let i=0; i<len; i++) {
          const wc = horiz ? c+i : c;
          const wr = horiz ? r   : r+i;
          if (wc>=2&&wc<GCOLS-2&&wr>=2&&wr<GROWS-2)
            walls.push({col:wc,row:wr});
        }
      }
      return walls;
    },
  ];

  function generateObstacles(roundN) {
    obstacles = [];
    // Pick arena shape: cycle through 10 shapes (1-indexed rounds → 0-indexed shapes)
    const shapeIdx = (roundN - 1) % ARENA_SHAPES.length;
    const shapeFn  = ARENA_SHAPES[shapeIdx];
    const cells    = shapeFn(roundN);

    // Deduplicate and store
    const seen = new Set();
    for (const {col, row} of cells) {
      if (col < 0 || col >= GCOLS || row < 0 || row >= GROWS) continue;
      const key = row * GCOLS + col;
      if (!seen.has(key)) { seen.add(key); obstacles.push({col, row}); }
    }
  }


  // ── Draw ──────────────────────────────────────────────────
  function cellCenter(col, row) {
    return { x: col * CELL + CELL * 0.5, y: row * CELL + CELL * 0.5 };
  }

  function drawTrail(player) {
    const t = player.trail;
    if (!t || t.length < 2) return;
    const color = player.color;

    // Build the path through cell centres
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;
    ctx.lineCap = 'square';

    function buildPath() {
      ctx.beginPath();
      const p0 = cellCenter(t[0].col, t[0].row);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < t.length; i++) {
        const p = cellCenter(t[i].col, t[i].row);
        ctx.lineTo(p.x, p.y);
      }
    }

    // Outer glow layers (no shadowBlur — pure alpha overlap is cheaper)
    ctx.shadowBlur = 0;
    buildPath();
    ctx.strokeStyle = color + '28'; ctx.lineWidth = CELL * 1.1; ctx.stroke();
    buildPath();
    ctx.strokeStyle = color + '55'; ctx.lineWidth = CELL * 0.7;  ctx.stroke();

    // Core wall — reduced blur radius (6 vs 8, visually near-identical)
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    buildPath();
    ctx.strokeStyle = color + 'ee'; ctx.lineWidth = CELL * 0.28; ctx.stroke();

    // White-hot centre — minimal blur (2 vs 4)
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 2;
    buildPath();
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = CELL * 0.1; ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';
  }

  function buildObstacleCache() {
    // Pre-render obstacles to offscreen canvas — called once per round, not per frame
    _obstacleCanvas = document.createElement('canvas');
    _obstacleCanvas.width  = GCOLS * CELL;
    _obstacleCanvas.height = GROWS * CELL;
    const oc = _obstacleCanvas.getContext('2d');
    _drawObstaclesDirect(oc);
  }

  function drawObstacles() {
    if (!_obstacleCanvas) return;
    ctx.drawImage(_obstacleCanvas, 0, 0);
  }

  function _drawObstaclesDirect(oc) {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] !== 9) continue;
      const col = i % GCOLS, row = Math.floor(i / GCOLS);
      const x = col * CELL, y = row * CELL;      // Check neighbours for wall direction
      const hasR = col+1 < GCOLS && grid[row*GCOLS+(col+1)] === 9;
      const hasL = col-1 >= 0    && grid[row*GCOLS+(col-1)] === 9;
      const hasD = row+1 < GROWS && grid[(row+1)*GCOLS+col] === 9;
      const hasU = row-1 >= 0    && grid[(row-1)*GCOLS+col] === 9;
      const horiz = (hasL || hasR) && !(hasU || hasD);

      oc.shadowBlur = 14; oc.shadowColor = '#cc00ff';
      oc.fillStyle = 'rgba(180,0,255,0.12)'; oc.fillRect(x, y, CELL, CELL);
      if (horiz) {
        oc.fillStyle = '#aa00ee'; oc.fillRect(x, y+CELL*0.3, CELL, CELL*0.4);
        oc.fillStyle = '#ee66ff'; oc.fillRect(x, y+CELL*0.42, CELL, CELL*0.16);
        oc.fillStyle = '#ffffff'; oc.fillRect(x, y+CELL*0.46, CELL, CELL*0.08);
      } else {
        oc.fillStyle = '#aa00ee'; oc.fillRect(x+CELL*0.3, y, CELL*0.4, CELL);
        oc.fillStyle = '#ee66ff'; oc.fillRect(x+CELL*0.42, y, CELL*0.16, CELL);
        oc.fillStyle = '#ffffff'; oc.fillRect(x+CELL*0.46, y, CELL*0.08, CELL);
      }
      oc.shadowBlur = 0;
    }
  }

  function draw() {
    // Background
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    // Grid lines (very subtle)
    ctx.strokeStyle = 'rgba(0,255,255,0.025)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= GCOLS; c++) {
      ctx.beginPath(); ctx.moveTo(c*CELL, 0); ctx.lineTo(c*CELL, H); ctx.stroke();
    }
    for (let r = 0; r <= GROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r*CELL); ctx.lineTo(W, r*CELL); ctx.stroke();
    }

    // Draw obstacles
    drawObstacles();

    // Draw neon light walls as continuous stroked paths
    drawTrail(p1);
    drawTrail(p2);

    // Draw bikes (head)
    drawBike(p1);
    drawBike(p2);

    // Border glow
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,212,255,0.6)';
    ctx.strokeStyle = 'rgba(0,212,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W-2, H-2);
    ctx.shadowBlur = 0;
  }

  function drawBike(p) {
    if (!p.alive) return;
    // ── Sprite cache: only re-render when direction or cell size changes ──────
    const key = p.color + ':' + p.dx + ':' + p.dy;
    let sprite = _bikeCache[key];
    if (!sprite || sprite._cell !== CELL) {
      // Render bike to offscreen canvas
      const SC = CELL * 2.8;
      const PAD = Math.ceil(SC * 0.6);  // padding for glow bleed
      const SZ = Math.ceil(SC + PAD * 2);
      const oc = document.createElement('canvas');
      oc.width = oc.height = SZ;
      const oc2d = oc.getContext('2d');
      oc2d.translate(SZ / 2, SZ / 2);
      // Render to offscreen using a temporary ctx swap
      const _realCtx = ctx;
      ctx = oc2d;
      _drawBikeCore(p, 0, 0);
      ctx = _realCtx;
      oc._cell = CELL;
      _bikeCache[key] = sprite = oc;
    }
    // Stamp cached sprite at bike position
    const cx = p.col * CELL + CELL * 0.5;
    const cy = p.row * CELL + CELL * 0.5;
    const SZ = sprite.width;
    ctx.drawImage(sprite, cx - SZ/2, cy - SZ/2, SZ, SZ);
  }

  function _drawBikeCore(p, _unused_cx, _unused_cy) {
    if (!p.alive) return;

    // The bike is drawn much larger than one cell — scaled to ~3 cells
    const SC = CELL * 2.8;
    const cx = 0, cy = 0;
    const col = p.color;
    const angle = p.dx === 1 ? 0 : p.dx === -1 ? Math.PI : p.dy === 1 ? Math.PI/2 : -Math.PI/2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // ── TRON LEGACY LIGHT CYCLE SILHOUETTE ──────────────────
    // Viewed from the side, facing right.
    // Key shapes: low wedge body, single large rear disc wheel,
    // smaller front disc wheel, angular fairing, rider hump, light strip

    const bW = SC;        // body length
    const bH = SC * 0.32; // body height

    // === REAR WHEEL (large disc) ===
    const rWx = -bW * 0.28, rWy = bH * 0.18;
    const rWr = SC * 0.24;
    // Tyre
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(rWx, rWy,Math.max(0,rWr), 0, Math.PI*2); ctx.fill();
    // Rim glow ring
    ctx.strokeStyle = col;
    ctx.lineWidth = SC * 0.025;
    ctx.shadowBlur = 10; ctx.shadowColor = col;
    ctx.beginPath(); ctx.arc(rWx, rWy,Math.max(0,rWr * 0.82), 0, Math.PI*2); ctx.stroke();
    // Inner ring
    ctx.strokeStyle = col + '88';
    ctx.lineWidth = SC * 0.012;
    ctx.beginPath(); ctx.arc(rWx, rWy,Math.max(0,rWr * 0.55), 0, Math.PI*2); ctx.stroke();
    // Hub dot
    ctx.shadowBlur = 14; ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(rWx, rWy,Math.max(0,rWr * 0.1), 0, Math.PI*2); ctx.fill();

    // === FRONT WHEEL (smaller disc) ===
    const fWx = bW * 0.35, fWy = bH * 0.2;
    const fWr = SC * 0.16;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(fWx, fWy,Math.max(0,fWr), 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = SC * 0.022;
    ctx.shadowBlur = 8; ctx.shadowColor = col;
    ctx.beginPath(); ctx.arc(fWx, fWy,Math.max(0,fWr * 0.78), 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 14; ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(fWx, fWy,Math.max(0,fWr * 0.1), 0, Math.PI*2); ctx.fill();

    // === MAIN CHASSIS (dark angular body) ===
    // Low angular wedge — front pointed, rear flat-cut
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0d0d0d';
    ctx.beginPath();
    ctx.moveTo( bW*0.48,  bH*0.05);   // nose tip
    ctx.lineTo( bW*0.32, -bH*0.55);   // front top (windscreen base)
    ctx.lineTo(-bW*0.05, -bH*0.70);   // rider hump top
    ctx.lineTo(-bW*0.30, -bH*0.55);   // rear fairing top
    ctx.lineTo(-bW*0.50, -bH*0.15);   // rear top edge
    ctx.lineTo(-bW*0.50,  bH*0.05);   // rear bottom
    ctx.lineTo( bW*0.10,  bH*0.05);   // undertray
    ctx.closePath();
    ctx.fill();

    // === NEON LIGHT STRIPS on body edges ===
    ctx.shadowBlur = 12; ctx.shadowColor = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = SC * 0.025;
    ctx.lineJoin = 'miter';

    // Top edge light strip
    ctx.beginPath();
    ctx.moveTo( bW*0.48,  bH*0.05);
    ctx.lineTo( bW*0.32, -bH*0.55);
    ctx.lineTo(-bW*0.05, -bH*0.70);
    ctx.lineTo(-bW*0.30, -bH*0.55);
    ctx.lineTo(-bW*0.50, -bH*0.15);
    ctx.stroke();

    // Bottom edge light strip
    ctx.beginPath();
    ctx.moveTo( bW*0.48,  bH*0.05);
    ctx.lineTo(-bW*0.50,  bH*0.05);
    ctx.stroke();

    // Rear vertical strip
    ctx.beginPath();
    ctx.moveTo(-bW*0.50, -bH*0.15);
    ctx.lineTo(-bW*0.50,  bH*0.05);
    ctx.stroke();

    // === FRONT FORK / FAIRING ===
    ctx.fillStyle = '#181818';
    ctx.beginPath();
    ctx.moveTo( bW*0.48,  bH*0.05);
    ctx.lineTo( bW*0.32, -bH*0.55);
    ctx.lineTo( bW*0.18, -bH*0.20);
    ctx.lineTo( bW*0.22,  bH*0.05);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 8; ctx.shadowColor = col;
    ctx.strokeStyle = col + 'cc';
    ctx.lineWidth = SC * 0.018;
    ctx.beginPath();
    ctx.moveTo( bW*0.48,  bH*0.05);
    ctx.lineTo( bW*0.32, -bH*0.55);
    ctx.stroke();

    // === WINDSCREEN (tinted glow) ===
    ctx.shadowBlur = 10; ctx.shadowColor = col;
    ctx.fillStyle = col + '33';
    ctx.beginPath();
    ctx.moveTo( bW*0.32, -bH*0.55);
    ctx.lineTo( bW*0.14, -bH*0.55);
    ctx.lineTo(-bW*0.02, -bH*0.68);
    ctx.lineTo(-bW*0.00, -bH*0.70);
    ctx.closePath();
    ctx.fill();
    // Windscreen edge
    ctx.strokeStyle = col + 'bb';
    ctx.lineWidth = SC * 0.018;
    ctx.beginPath();
    ctx.moveTo( bW*0.32, -bH*0.55);
    ctx.lineTo(-bW*0.00, -bH*0.70);
    ctx.stroke();

    // === RIDER SILHOUETTE (hunched) ===
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.ellipse(-bW*0.05, -bH*0.82, bW*0.13, bH*0.18, -0.2, 0, Math.PI*2);
    ctx.fill();
    // Rider helmet glow
    ctx.shadowBlur = 8; ctx.shadowColor = col;
    ctx.strokeStyle = col + '99';
    ctx.lineWidth = SC * 0.018;
    ctx.beginPath();
    ctx.ellipse(-bW*0.05, -bH*0.82, bW*0.13, bH*0.18, -0.2, 0, Math.PI*2);
    ctx.stroke();

    // === NOSE EMITTER (light source at front) ===
    ctx.shadowBlur = 22; ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(bW*0.49, bH*0.02,Math.max(0,SC*0.04), 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 6; ctx.shadowColor = '#fff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(bW*0.49, bH*0.02,Math.max(0,SC*0.018), 0, Math.PI*2); ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Update ────────────────────────────────────────────────
  const STEP_MS = 1000 / SPEED_BASE;

  function step() {
    if (!running || roundOver || paused) return;

    // Apply queued directions (no 180 reversal)
    applyDir(p1);
    if (mode !== 'online') applyDir(p2);

    // Peek next positions to detect head-on / swap collisions before moving
    const n1c = p1.alive ? p1.col + p1.dx : -1;
    const n1r = p1.alive ? p1.row + p1.dy : -1;
    const n2c = p2.alive ? p2.col + p2.dx : -1;
    const n2r = p2.alive ? p2.row + p2.dy : -1;

    // Head-on: both bikes targeting the same cell
    const headOn = p1.alive && p2.alive && n1c === n2c && n1r === n2r;
    // Swap: bikes passing through each other
    const swap   = p1.alive && p2.alive &&
                   n1c === p2.col && n1r === p2.row &&
                   n2c === p1.col && n2r === p1.row;

    if (headOn || swap) {
      p1.alive = false;
      p2.alive = false;
      checkCollisions();
      return;
    }

    // Move
    movePlayer(p1);
    if (mode !== 'online') movePlayer(p2);

    // Collision check
    checkCollisions();
  }

  function applyDir(p) {
    // Prevent 180-degree reversal
    if (p.qx !== 0 && p.qx !== -p.dx) { p.dx = p.qx; p.dy = 0; }
    else if (p.qy !== 0 && p.qy !== -p.dy) { p.dy = p.qy; p.dx = 0; }
  }

  function movePlayer(p) {
    if (!p.alive) return;
    const nc = p.col + p.dx;
    const nr = p.row + p.dy;
    // Wall collision
    if (nc < 0 || nc >= GCOLS || nr < 0 || nr >= GROWS) { p.alive = false; return; }
    // Trail collision
    if (grid[nr * GCOLS + nc] !== 0) { p.alive = false; return; }
    p.col = nc; p.row = nr;
    grid[nr * GCOLS + nc] = p.num;
    p.trail.push({col: nc, row: nr});
  }

  function checkCollisions() {
    if (!p1.alive || !p2.alive) {
      roundOver = true;
      const bothDead = !p1.alive && !p2.alive;
      if (bothDead) {
        // Draw
        onRoundEnd(0);
      } else if (!p1.alive) {
        p2Wins++;
        onRoundEnd(2);
      } else {
        p1Wins++;
        onRoundEnd(1);
      }
    }
  }

  // ── Game loop ─────────────────────────────────────────────
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - lastTime, 100);
    lastTime = now;

    if (!paused && running && !roundOver) {
      // AI decision
      if (mode === 'ai') {
        aiTimer += dt;
        if (aiTimer >= AI_REACT_INTERVAL) {
          aiTimer = 0;
          aiDecide();
        }
      }

      accumulator += dt;
      while (accumulator >= STEP_MS) {
        step();
        accumulator -= STEP_MS;
        if (roundOver) break;
      }
    }

    draw();
  }

  // ── AI ────────────────────────────────────────────────────
  function aiDecide() {
    if (!p2.alive) return;
    const dirs = [
      {dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}
    ].filter(d => !(d.dx === -p2.dx && d.dy === -p2.dy));

    // Score each direction by how much open space it leads to
    let best = null, bestScore = -1;
    for (const d of dirs) {
      const nc = p2.col + d.dx, nr = p2.row + d.dy;
      if (nc < 0 || nc >= GCOLS || nr < 0 || nr >= GROWS) continue;
      if (grid[nr * GCOLS + nc] !== 0) continue;
      const score = floodFill(nc, nr, 20) + (Math.random() * 2); // tiny random to break ties
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (best) { p2.qx = best.dx; p2.qy = best.dy; }
  }

  function floodFill(startC, startR, maxDepth) {
    // BFS to count reachable cells up to maxDepth
    const visited = new Uint8Array(GCOLS * GROWS);
    const queue = [[startC, startR, 0]];
    visited[startR * GCOLS + startC] = 1;
    let count = 0;
    while (queue.length) {
      const [c, r, depth] = queue.shift();
      count++;
      if (depth >= maxDepth) continue;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = c+dc, nr = r+dr;
        if (nc<0||nc>=GCOLS||nr<0||nr>=GROWS) continue;
        const idx = nr*GCOLS+nc;
        if (grid[idx]!==0||visited[idx]) continue;
        visited[idx] = 1;
        queue.push([nc, nr, depth+1]);
      }
    }
    return count;
  }

  // ── Round end ─────────────────────────────────────────────
  function onRoundEnd(winner) {
    roundOver = true;
    updateHUD();
    draw();

    // Online: push result
    if (mode === 'online' && onlineRole === 'host') {
      try {
        update(ref(db, `tron/${onlineCode}`), {
          status: 'roundOver',
          winner,
          p1Wins, p2Wins,
        });
      } catch(e) {}
    }

    const seriesOver = roundNum >= MAX_ROUNDS || p1Wins > MAX_ROUNDS/2 || p2Wins > MAX_ROUNDS/2;

    setTimeout(() => {
      if (mode === 'online') {
        showOverlay(
          winner === 0 ? 'DRAW' : (winner === 1 ? 'YOU WIN!' : 'OPPONENT WINS'),
          `P1: ${p1Wins}  P2: ${p2Wins}  |  ROUND ${roundNum}/${MAX_ROUNDS}`,
          winner === 1 ? '#00ffff' : winner === 2 ? '#ff9500' : '#888',
          [
            { label:'▶ NEXT ROUND', fn:'TRON.onlineNextRound()' },
            { label:'🕹 ARCADE', fn:'TRON.destroy();backToGameSelect()', arcade:true },
          ]
        );
      } else if (seriesOver) {
        const seriesWinner = p1Wins > p2Wins ? 1 : p2Wins > p1Wins ? 2 : 0;
        const seriesTitle = seriesWinner === 0 ? 'SERIES DRAW!'
          : seriesWinner === 1 ? (mode === 'ai' ? '🏆 YOU WIN THE SERIES!' : '🏆 P1 WINS THE SERIES!')
          : (mode === 'ai' ? '💀 AI WINS THE SERIES' : '🏆 P2 WINS THE SERIES!');
        const seriesColor = seriesWinner === 1 ? C1 : seriesWinner === 2 ? C2 : '#888';
        if (mode === 'ai' && window.HS) setTimeout(() => HS.promptSubmit('tron', p1Wins, `${p1Wins} wins / ${MAX_ROUNDS} rounds`), 400);
        showOverlay(seriesTitle,
          `FINAL SCORE — P1: ${p1Wins}  P2: ${p2Wins}  (${MAX_ROUNDS} ROUNDS)`,
          seriesColor,
          [
            { label:'▶ PLAY AGAIN', fn:'TRON.resetScores()' },
            { label:'🕹 ARCADE', fn:'TRON.destroy();backToGameSelect()', arcade:true },
          ]
        );
      } else {
        const title  = winner === 0 ? 'DRAW!' : (winner === 1 ? 'P1 WINS!' : (mode === 'ai' ? 'AI WINS!' : 'P2 WINS!'));
        const color  = winner === 1 ? C1 : winner === 2 ? C2 : '#888';
        showOverlay(title, `P1: ${p1Wins}  P2: ${p2Wins}  |  ROUND ${roundNum}/${MAX_ROUNDS}`, color, [
          { label:'▶ NEXT ROUND', fn:'TRON.nextRound()' },
          { label:'🔄 RESET',     fn:'TRON.resetScores()' },
          { label:'🕹 ARCADE', fn:'TRON.destroy();backToGameSelect()', arcade:true },
        ]);
      }
    }, 600);
  }

  function showOverlay(title, sub, color, buttons) {
    const ov    = document.getElementById('tron-overlay');
    const ttl   = document.getElementById('tron-ov-title');
    const subEl = document.getElementById('tron-ov-sub');
    const scEl  = document.getElementById('tron-ov-score');
    const btns  = document.getElementById('tron-mode-btns');

    ttl.textContent = title;
    ttl.style.color = color;
    ttl.style.textShadow = `0 0 20px ${color}`;
    subEl.textContent = '';
    scEl.textContent = sub || '';
    btns.innerHTML = buttons.map(b =>
      `<button class="tron-mode-btn" style="border-color:${color};color:${color}" onclick="${b.fn}">${b.label}</button>`
    ).join('') + `<button class="arcade-back-btn" onclick="TRON.destroy();backToGameSelect()">🕹 ARCADE</button>`;
    ov.classList.add('active');
  }

  // ── Countdown then start ──────────────────────────────────
  function startCountdown(cb) {
    const el = document.getElementById('tron-countdown');
    el.style.display = 'flex';
    let n = 3;
    function tick() {
      el.innerHTML = `<div class="tron-countdown-num">${n}</div>`;
      n--;
      if (n >= 0) countdownTimeout = setTimeout(tick, 800);
      else {
        el.innerHTML = `<div class="tron-countdown-num" style="color:#39ff14;text-shadow:0 0 30px #39ff14">GO!</div>`;
        countdownTimeout = setTimeout(() => { el.style.display='none'; cb(); }, 700);
      }
    }
    tick();
  }

  // ── Round start ───────────────────────────────────────────
  function launchRound() {
    roundNum++;
    running = false;   // freeze bikes until countdown finishes
    roundOver = false;
    accumulator = 0;
    aiTimer = 0;
    generateObstacles(roundNum);
    initPlayers();
    initGrid();
    _obstacleCanvas = null;
    buildObstacleCache();
    draw();
    updateHUD();

    document.getElementById('tron-overlay').classList.remove('active');

    startCountdown(() => {
      running = true;
      lastTime = performance.now();
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }

  function nextRound() {
    document.getElementById('tron-overlay').classList.remove('active');
    launchRound();
  }

  function resetScores() {
    p1Wins = 0; p2Wins = 0; roundNum = 0;
    obstacles = [];
    updateHUD();
    nextRound();
  }

  // ── Mode starters ──────────────────────────────────────────
  function startSolo() {
    mode = 'ai';
    p1Wins = 0; p2Wins = 0; roundNum = 0; obstacles = [];
    document.getElementById('tron-p2-label').textContent = 'AI WINS';
    document.getElementById('tron-p2-dpad').style.display = 'none';
    document.getElementById('tron-overlay').classList.remove('active');
    launchRound();
  }

  function startLocal() {
    mode = 'local';
    p1Wins = 0; p2Wins = 0; roundNum = 0; obstacles = [];
    document.getElementById('tron-p2-label').textContent = 'P2 WINS';
    document.getElementById('tron-p2-dpad').style.display = '';
    document.getElementById('tron-overlay').classList.remove('active');
    launchRound();
  }

  // ── Online lobby ──────────────────────────────────────────
  function showOnlineMenu() {
    document.getElementById('main-title').textContent = '⚡ TRON';
    document.getElementById('main-subtitle').textContent = 'LIGHT CYCLES — ONLINE';
    showScreen('tron-lobby-screen');
    document.getElementById('tron-lobby-entry').style.display = '';
    document.getElementById('tron-lobby-room').style.display = 'none';
    startOnlineLobbyBrowse();
  }

  function onlineBack() {
    stopOnlineLobbyBrowse();
    if (onlineRole === 'host' && onlineCode) {
      try { remove(ref(db, `tronLobbies/${onlineCode}`)); } catch(e) {}
    }
    onlineCode = null; onlineRole = null;
    document.getElementById('main-title').textContent = '⚡ TRON';
    document.getElementById('main-subtitle').textContent = 'LIGHT CYCLE RACING';
    showScreen('tron-screen');
  }

  function getOnlineName() {
    return (document.getElementById('tron-online-name')?.value.trim().toUpperCase() || 'PLAYER').slice(0,12);
  }

  let _lobbyBrowseUnsub = null;
  function startOnlineLobbyBrowse() {
    const listEl = document.getElementById('tron-online-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="lobby-list-loading">SCANNING—</div>';
    const doScan = () => {
      _lobbyBrowseUnsub = onValue(ref(db, 'tronLobbies'), snap => {
        const el = document.getElementById('tron-online-list');
        if (!el) return;
        if (!snap.exists()) { el.innerHTML = '<div class="lobby-list-loading">NO OPEN GAMES</div>'; return; }
        const rooms = snap.val();
        const open = Object.entries(rooms).filter(([,r]) => r.status === 'waiting' && !r.guest);
        if (!open.length) { el.innerHTML = '<div class="lobby-list-loading">NO OPEN GAMES</div>'; return; }
        el.innerHTML = open.map(([code, r]) =>
          `<div class="lobby-row">
            <div class="lobby-row-info"><div class="lobby-row-host">● ${r.host}</div></div>
            <div class="lobby-row-players">1/2</div>
            <button class="lobby-join-btn" onclick="TRON.onlineJoin('${code}')">JOIN ▶</button>
          </div>`
        ).join('');
      });
    };
    if (window._firebaseReady) doScan();
    else window.addEventListener('firebaseReady', doScan, { once: true });
  }

  function stopOnlineLobbyBrowse() {
    if (_lobbyBrowseUnsub) { _lobbyBrowseUnsub(); _lobbyBrowseUnsub = null; }
  }

  async function onlineHost() {
    if (!window._firebaseReady) await new Promise(r => window.addEventListener('firebaseReady', r, { once: true }));
    myName = getOnlineName();
    onlineRole = 'host';
    onlineCode = Math.random().toString(36).slice(2,8).toUpperCase();
    stopOnlineLobbyBrowse();

    await set(ref(db, `tronLobbies/${onlineCode}`), {
      host: myName, status: 'waiting', guest: null, created: Date.now(),
    });
    onDisconnect(ref(db, `tronLobbies/${onlineCode}`)).remove();

    document.getElementById('tron-lobby-entry').style.display = 'none';
    document.getElementById('tron-lobby-room').style.display = '';
    document.getElementById('tron-room-code-disp').textContent = onlineCode;
    document.getElementById('tron-lobby-status').textContent = 'WAITING FOR OPPONENT...';
    renderLobbyPlayers(myName, null);

    // Listen for guest join
    const unsub = onValue(ref(db, `tronLobbies/${onlineCode}/guest`), snap => {
      if (!snap.exists()) return;
      oppName = snap.val().name;
      renderLobbyPlayers(myName, oppName);
      document.getElementById('tron-lobby-status').textContent = `${oppName} joined! Starting...`;
      unsub();
      setTimeout(() => launchOnlineGame(true), 800);
    });
    fbUnsubs.push(unsub);
  }

  async function onlineJoin(code) {
    if (!window._firebaseReady) await new Promise(r => window.addEventListener('firebaseReady', r, { once: true }));
    myName = getOnlineName();
    onlineRole = 'guest';
    onlineCode = code;
    stopOnlineLobbyBrowse();

    const snap = await get(ref(db, `tronLobbies/${code}`));
    if (!snap.exists()) { alert('Room not found'); return; }
    oppName = snap.val().host;

    await update(ref(db, `tronLobbies/${code}`), { guest: { name: myName }, status: 'launching' });

    document.getElementById('tron-lobby-entry').style.display = 'none';
    document.getElementById('tron-lobby-room').style.display = '';
    document.getElementById('tron-room-code-disp').textContent = code;
    renderLobbyPlayers(oppName, myName);
    document.getElementById('tron-lobby-status').textContent = 'Joined! Starting...';

    setTimeout(() => launchOnlineGame(false), 1000);
  }

  function renderLobbyPlayers(host, guest) {
    const el = document.getElementById('tron-lobby-players');
    if (!el) return;
    el.innerHTML = [
      { n:host,  badge:'<span class="slot-badge host">HOST</span>' },
      { n:guest, badge: guest ? '<span class="slot-badge guest">GUEST</span>' : '<span class="slot-badge waiting">WAITING...</span>' },
    ].map((r,i) => `<div class="lobby-player-row"><span class="slot-num">${i+1}.</span><span class="slot-name">${r.n||'—'}</span>${r.badge}</div>`).join('');
  }

  function launchOnlineGame(isHost) {
    mode = 'online';
    onlineRole = isHost ? 'host' : 'guest';
    p1Wins = 0; p2Wins = 0; roundNum = 0; obstacles = [];

    // P1 = host (cyan), P2 = guest (orange)
    // If I'm guest, my inputs control "p2" server-side but I see as P1 locally
    document.getElementById('tron-p2-label').textContent = oppName + ' WINS';
    document.getElementById('tron-p2-dpad').style.display = 'none';

    showScreen('tron-screen');
    document.getElementById('main-title').textContent = '⚡ TRON';
    document.getElementById('main-subtitle').textContent = isHost ? `VS ${oppName}` : `VS ${oppName}`;
    document.getElementById('header-room-code').textContent = onlineCode;
    document.getElementById('room-code-display').style.display = '';
    showHeaderLeave('tron');

    if (isHost) {
      // Host initialises the game state in Firebase
      set(ref(db, `tron/${onlineCode}`), {
        status: 'countdown',
        round: 1,
        p1Wins: 0, p2Wins: 0,
        p1: { col: Math.floor(GCOLS*0.25), row: Math.floor(GROWS*0.5), dx:1, dy:0 },
        p2: { col: Math.floor(GCOLS*0.75), row: Math.floor(GROWS*0.5), dx:-1, dy:0 },
        grid: null,
        p1Input: null, p2Input: null,
        tick: 0,
      });
      onDisconnect(ref(db, `tron/${onlineCode}`)).remove();
    }

    listenOnlineGame();
    launchRound();
  }

  // ── Online Firebase sync ──────────────────────────────────
  function listenOnlineGame() {
    const gameRef = ref(db, `tron/${onlineCode}`);

    // Listen for opponent direction inputs
    const inputPath = onlineRole === 'host' ? 'p2Input' : 'p1Input';
    const unsub = onValue(ref(db, `tron/${onlineCode}/${inputPath}`), snap => {
      if (!snap.exists()) return;
      const inp = snap.val();
      if (!inp || inp.seq <= _lastProcessedSeq) return;
      _lastProcessedSeq = inp.seq;
      const target = onlineRole === 'host' ? p2 : p1;
      if (target) { target.qx = inp.dx; target.qy = inp.dy; }
    });
    fbUnsubs.push(unsub);

    // Listen for round-over events from host
    if (onlineRole === 'guest') {
      const roundUnsub = onValue(ref(db, `tron/${onlineCode}/status`), snap => {
        if (!snap.exists()) return;
        const status = snap.val();
        if (status === 'roundOver') {
          get(ref(db, `tron/${onlineCode}`)).then(s => {
            if (!s.exists()) return;
            const d = s.val();
            p1Wins = d.p1Wins || 0;
            p2Wins = d.p2Wins || 0;
            updateHUD();
          });
        }
      });
      fbUnsubs.push(roundUnsub);
    }

    // Push my inputs whenever I move
    // (handled in setDir)
  }

  function pushOnlineInput(dx, dy) {
    if (!onlineCode || !running) return;
    _inputSeq++;
    const path = onlineRole === 'host' ? 'p1Input' : 'p2Input';
    try {
      update(ref(db, `tron/${onlineCode}`), {
        [path]: { dx, dy, seq: _inputSeq }
      });
    } catch(e) {}
  }

  function onlineNextRound() {
    document.getElementById('tron-overlay').classList.remove('active');
    if (onlineRole === 'host') {
      update(ref(db, `tron/${onlineCode}`), { status: 'playing', p1Input: null, p2Input: null });
    }
    _inputSeq = 0; _lastProcessedSeq = 0;
    launchRound();
  }

  // ── Input handling ─────────────────────────────────────────
  function setP1Dir(dx, dy) {
    if (!running) return;
    p1.qx = dx; p1.qy = dy;
    if (mode === 'online') pushOnlineInput(dx, dy);
  }

  function setP2Dir(dx, dy) {
    if (!running || mode === 'online') return;
    p2.qx = dx; p2.qy = dy;
  }

  function onKey(e) {
    if (!running && !roundOver) return;
    const map = {
      ArrowUp:{p:1,dx:0,dy:-1}, ArrowDown:{p:1,dx:0,dy:1},
      ArrowLeft:{p:1,dx:-1,dy:0}, ArrowRight:{p:1,dx:1,dy:0},
      w:{p:1,dx:0,dy:-1}, s:{p:1,dx:0,dy:1}, a:{p:1,dx:-1,dy:0}, d:{p:1,dx:1,dy:0},
      W:{p:1,dx:0,dy:-1}, S:{p:1,dx:0,dy:1}, A:{p:1,dx:-1,dy:0}, D:{p:1,dx:1,dy:0},
      i:{p:2,dx:0,dy:-1}, k:{p:2,dx:0,dy:1}, j:{p:2,dx:-1,dy:0}, l:{p:2,dx:1,dy:0},
      I:{p:2,dx:0,dy:-1}, K:{p:2,dx:0,dy:1}, J:{p:2,dx:-1,dy:0}, L:{p:2,dx:1,dy:0},
    };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    if (m.p === 1) setP1Dir(m.dx, m.dy);
    else setP2Dir(m.dx, m.dy);
  }

  function p1Dir(dx, dy) { setP1Dir(dx, dy); }
  function p2Dir(dx, dy) { setP2Dir(dx, dy); }

  // ── Pause ─────────────────────────────────────────────────
  function pause() {
    if (!running || roundOver) return;
    paused = !paused;
  }

  function showMenu() {
    running = false; paused = false;
    const ov = document.getElementById('tron-overlay');
    const ttl = document.getElementById('tron-ov-title');
    const sub = document.getElementById('tron-ov-sub');
    const sc  = document.getElementById('tron-ov-score');
    const btns = document.getElementById('tron-mode-btns');
    ttl.textContent = 'TRON';
    ttl.style.color = C1;
    ttl.style.textShadow = `0 0 20px ${C1}`;
    sub.textContent = 'LIGHT CYCLE RACING';
    sc.textContent = '';
    btns.innerHTML = `
      <button class="tron-mode-btn" onclick="TRON.startSolo()">⚡ VS AI</button>
      <button class="arcade-back-btn" onclick="TRON.destroy();backToGameSelect()">🕹 ARCADE</button>
    `;
    ov.classList.add('active');
  }

  // ── HUD ───────────────────────────────────────────────────
  function updateHUD() {
    const el = id => document.getElementById(id);
    if (el('tron-p1-wins')) el('tron-p1-wins').textContent = p1Wins;
    if (el('tron-p2-wins')) el('tron-p2-wins').textContent = p2Wins;
    if (el('tron-round-display')) el('tron-round-display').textContent = roundNum > 0 ? `ROUND ${roundNum}/${MAX_ROUNDS}` : '';
    const arenaNames = [
      'OPEN GRID', 'SECTOR DIVIDE', 'PILLAR FIELD', 'CORRIDOR MAZE',
      'DIAMOND RING', 'PINWHEEL', 'DUAL ORBIT', 'FORTRESS GRID',
      'CHANNEL RUN', 'GAUNTLET',
    ];
    const aName = roundNum > 0 ? arenaNames[(roundNum - 1) % arenaNames.length] : '';
    if (el('tron-arena-name')) el('tron-arena-name').textContent = aName;
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    initCanvas();
    window.addEventListener('keydown', onKey);
    p1Wins = 0; p2Wins = 0; roundNum = 0;
    updateHUD();
    showMenu();
  }

  // ── Destroy ───────────────────────────────────────────────
  function destroy() {
    running = false; paused = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (countdownTimeout) { clearTimeout(countdownTimeout); countdownTimeout = null; }
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    fbUnsubs.forEach(u => typeof u === 'function' && u());
    fbUnsubs = [];
    stopOnlineLobbyBrowse();
    if (onlineCode) {
      try { remove(ref(db, `tronLobbies/${onlineCode}`)); } catch(e) {}
    }
    onlineCode = null; onlineRole = null;
    document.getElementById('room-code-display').style.display = 'none';
    document.getElementById('header-leave-btn').style.display = 'none';
  }

  return {
    init, destroy, showMenu,
    startSolo, startLocal, nextRound, resetScores,
    showOnlineMenu, onlineHost, onlineJoin, onlineBack, onlineNextRound,
    pause,
    isPaused: () => paused,
    p1Dir, p2Dir,
  };
})();
