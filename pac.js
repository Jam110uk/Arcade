// PAC game module
// Auto-extracted from monolithic index.html

export default (function() {
  'use strict';

  // ── Maze definition (28×31 tiles) ────────────────────────
  // 0=empty, 1=wall, 2=dot, 3=power pellet, 4=ghost house door, 5=tunnel
  const COLS = 28, ROWS = 31;
  const BASE_MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,3,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,3,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
    [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,4,4,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [0,0,0,0,0,0,2,0,0,0,1,0,0,0,0,0,0,1,0,0,0,2,0,0,0,0,0,0],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,3,2,2,1,1,2,2,2,2,2,2,2,0,0,2,2,2,2,2,2,2,1,1,2,2,3,1],
    [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
    [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
    [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];

  // ── Constants ─────────────────────────────────────────────
  const TILE    = 18;
  const PAC_R   = TILE * 0.42;
  const GHOST_R = TILE * 0.44;
  const GHOST_COLORS = ['#ff0000','#ffb8ff','#00ffff','#ffb852']; // Blinky,Pinky,Inky,Clyde
  const GHOST_NAMES  = ['Blinky','Pinky','Inky','Clyde'];

  const SCARED_DURATION  = 8000;   // ms power pellet active
  const SCARED_FLASH_AT  = 2000;   // ms remaining when ghosts start flashing
  const GHOST_BASE_SPEED = 0.08;   // tiles per ms
  const PAC_BASE_SPEED   = 0.10;
  const DOT_SCORE    = 10;
  const PELLET_SCORE = 50;
  const GHOST_SCORES = [200,400,800,1600];

  // ── State ─────────────────────────────────────────────────
  let canvas, ctx, raf = null;
  let map, score, highScore = 0, level, lives;
  let totalDots, dotsEaten;
  let paused = false, gameRunning = false;
  let ghostEatenCount = 0;
  let flashTimer = null;
  let levelTransition = false;
  // Cached DOM refs
  let elPacOverlay, elPacOvTitle, elPacOvSub, elPacOvScore;
  let elPacScore, elPacHigh, elPacLevel, elPacLives, elPacPauseBtn;

  // Pac-Man
  let pac = {};
  // Ghosts array
  let ghosts = [];
  // Scared timer
  let scaredEnd = 0;

  // ── Resize / scale ────────────────────────────────────────
  function resize() {
    const wrap = document.querySelector('.pac-canvas-wrap');
    if (!canvas || !wrap) return;
    const maxW = Math.min(wrap.clientWidth, 560);
    const maxH = wrap.clientHeight || window.innerHeight * 0.7;
    const scaleX = maxW / (COLS * TILE);
    const scaleY = maxH / (ROWS * TILE);
    const scale  = Math.min(scaleX, scaleY, 1.5);
    canvas.style.width  = (COLS * TILE * scale) + 'px';
    canvas.style.height = (ROWS * TILE * scale) + 'px';
  }

  // ── Map helpers ───────────────────────────────────────────
  function cloneMap() {
    return BASE_MAP.map(r => [...r]);
  }
  function isWall(col, row) {
    if (row < 0 || row >= ROWS) return true;
    const c = ((col % COLS) + COLS) % COLS;
    return map[row][c] === 1;
  }
  function isGhostWall(col, row) {
    if (row < 0 || row >= ROWS) return true;
    const c = ((col % COLS) + COLS) % COLS;
    const v = map[row][c];
    return v === 1;  // ghosts can pass door (4)
  }

  // ── Pac-Man init ──────────────────────────────────────────
  function initPac() {
    pac = {
      x: 14 * TILE,        // pixel centre x
      y: 23 * TILE + TILE/2,
      dx: 0, dy: 0,        // current direction (tiles/frame intent)
      qx: 0, qy: 0,        // queued direction
      mouthAngle: 0,
      mouthDir: 1,
      dead: false,
      deathAnim: 0,
    };
  }

  // ── Ghost init ────────────────────────────────────────────
  function initGhosts() {
    const startPositions = [
      { col: 14, row: 11 },  // Blinky — starts outside
      { col: 13, row: 14 },  // Pinky
      { col: 14, row: 14 },  // Inky
      { col: 15, row: 14 },  // Clyde
    ];
    ghosts = startPositions.map((pos, i) => ({
      id: i,
      x: pos.col * TILE,
      y: pos.row * TILE + TILE/2,
      dx: (i === 0) ? -1 : 0,
      dy: (i === 0) ? 0  : 0,
      color: GHOST_COLORS[i],
      scared: false,
      eaten: false,
      inHouse: i > 0,
      leaveTimer: i * 5000,
      wobble: 0,
      tileCol: pos.col,
      tileRow: pos.row,
      targetCol: (i === 0) ? pos.col - 1 : pos.col,
      targetRow: pos.row,
    }));
  }

  // ── Count dots ────────────────────────────────────────────
  function countDots() {
    totalDots = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (map[r][c] === 2 || map[r][c] === 3) totalDots++;
  }

  // ── New game ──────────────────────────────────────────────
  function newGame() {
    level = 1; score = 0; lives = 3;
    updateHUD();
    startLevel();
  }

  function startLevel() {
    map = cloneMap();
    countDots();
    dotsEaten = 0;
    scaredEnd = 0;
    ghostEatenCount = 0;
    levelTransition = false;
    initPac();
    initGhosts();
    updateHUD();
  }

  // ── Movement helpers ──────────────────────────────────────
  function tileOf(px) { return Math.floor(px / TILE); }
  function centreOf(t) { return t * TILE + TILE / 2; }

  // Snap to axis if close enough to grid centre
  function snapToGrid(val, dir) {
    const t = tileOf(val);
    const centre = centreOf(t);
    const threshold = PAC_BASE_SPEED * TILE * 4;
    if (Math.abs(val - centre) < threshold) return centre;
    return val;
  }

  function canMove(px, py, dx, dy, radius) {
    const speed = TILE * PAC_BASE_SPEED;
    const nx = px + dx * speed;
    const ny = py + dy * speed;
    const r  = radius - 2;
    // Check all 4 corners
    const corners = [
      [nx - r, ny - r], [nx + r, ny - r],
      [nx - r, ny + r], [nx + r, ny + r],
    ];
    for (const [cx, cy] of corners) {
      const col = Math.floor(cx / TILE);
      const row = Math.floor(cy / TILE);
      if (isWall(col, row)) return false;
    }
    return true;
  }

  // ── Update pac ────────────────────────────────────────────
  function updatePac(dt) {
    if (pac.dead) return;
    const speed = TILE * PAC_BASE_SPEED * (dt / 16);

    // Try queued direction first
    if ((pac.qx !== 0 || pac.qy !== 0) && canMove(pac.x, pac.y, pac.qx, pac.qy, PAC_R)) {
      pac.dx = pac.qx; pac.dy = pac.qy;
    }

    if (canMove(pac.x, pac.y, pac.dx, pac.dy, PAC_R)) {
      pac.x += pac.dx * speed;
      pac.y += pac.dy * speed;
    } else {
      // Snap to grid centre to prevent wall clip
      if (pac.dx !== 0) pac.x = centreOf(tileOf(pac.x + pac.dx * 0.5));
      if (pac.dy !== 0) pac.y = centreOf(tileOf(pac.y + pac.dy * 0.5));
    }

    // Tunnel wrap
    if (pac.x < -TILE) pac.x = COLS * TILE;
    if (pac.x > COLS * TILE) pac.x = -TILE;

    // Mouth animation
    if (pac.dx !== 0 || pac.dy !== 0) {
      pac.mouthAngle += pac.mouthDir * 0.12 * (dt / 16);
      if (pac.mouthAngle > 0.35) pac.mouthDir = -1;
      if (pac.mouthAngle < 0.01) pac.mouthDir = 1;
    }

    // Eat dots
    const col = tileOf(pac.x);
    const row = tileOf(pac.y);
    if (row >= 0 && row < ROWS) {
      const c = ((col % COLS) + COLS) % COLS;
      const cell = map[row][c];
      if (cell === 2) {
        map[row][c] = 0;
        score += DOT_SCORE;
        dotsEaten++;
        updateHUD();
      } else if (cell === 3) {
        map[row][c] = 0;
        score += PELLET_SCORE;
        dotsEaten++;
        activatePower();
        updateHUD();
      }
    }

    // Check win
    if (dotsEaten >= totalDots) {
      triggerLevelWin();
    }
  }

  // ── Power pellet ──────────────────────────────────────────
  function activatePower() {
    scaredEnd = performance.now() + SCARED_DURATION;
    ghostEatenCount = 0;
    ghosts.forEach(g => {
      if (!g.eaten) { g.scared = true; g.dx = -g.dx; g.dy = -g.dy; }
    });
  }

  // ── Ghost AI ──────────────────────────────────────────────
  function ghostSpeed(g) {
    if (g.eaten) return GHOST_BASE_SPEED * 1.8;
    if (g.scared) return GHOST_BASE_SPEED * 0.5;
    return GHOST_BASE_SPEED * (1 + (level - 1) * 0.05);
  }

  function updateGhost(g, dt, now) {
    // Leave house timer
    if (g.inHouse) {
      g.leaveTimer -= dt;
      if (g.leaveTimer <= 0) leaveHouse(g);
      else { g.y += Math.sin(now / 400 + g.id) * 0.3; return; }
    }

    const speed = ghostSpeed(g) * TILE * (dt / 16);

    // Tile-based movement: ghost moves toward its target tile centre.
    // Only pick a new direction when it arrives at that centre.
    if (g.targetCol === undefined) {
      // First frame after spawn — pick initial target
      g.targetCol = tileOf(g.x) + g.dx;
      g.targetRow = tileOf(g.y) + g.dy;
    }

    const tx = centreOf(g.targetCol);
    const ty = centreOf(g.targetRow);
    const distX = tx - g.x;
    const distY = ty - g.y;
    const dist  = Math.hypot(distX, distY);

    if (dist <= speed + 0.5) {
      // Arrived — snap to centre, then choose next tile
      g.x = tx; g.y = ty;
      // Update current tile position
      g.tileCol = ((g.targetCol % COLS) + COLS) % COLS;
      g.tileRow = g.targetRow;
      // Pick next direction and target
      chooseGhostDir(g, now);
    } else {
      // Move toward target
      g.x += (distX / dist) * speed;
      g.y += (distY / dist) * speed;
    }

    // Tunnel wrap
    if (g.x < -TILE/2) { g.x += COLS * TILE; if(g.targetCol !== undefined) g.targetCol += COLS; }
    if (g.x > COLS * TILE + TILE/2) { g.x -= COLS * TILE; if(g.targetCol !== undefined) g.targetCol -= COLS; }

    g.wobble += 0.18;
  }

  function leaveHouse(g) {
    g.inHouse = false;
    g.x = 14 * TILE; g.y = 11 * TILE + TILE/2;
    g.dx = -1; g.dy = 0;
    g.tileCol = 14; g.tileRow = 11;
    g.targetCol = 13; g.targetRow = 11;
  }

  function chooseGhostDir(g, now) {
    const col = g.tileCol !== undefined ? g.tileCol : tileOf(g.x);
    const row = g.tileRow !== undefined ? g.tileRow : tileOf(g.y);
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];

    // Build possible moves — can't reverse unless it's the only option
    const notReverse = dirs.filter(d => {
      if (d.dx === -g.dx && d.dy === -g.dy) return false;
      const nc = ((col + d.dx) % COLS + COLS) % COLS;
      const nr = row + d.dy;
      return !isGhostWall(nc, nr);
    });
    const possible = notReverse.length > 0 ? notReverse : dirs.filter(d => {
      const nc = ((col + d.dx) % COLS + COLS) % COLS;
      const nr = row + d.dy;
      return !isGhostWall(nc, nr);
    });

    if (possible.length === 0) return; // fully trapped (shouldn't happen)

    let chosen;
    if (g.scared) {
      chosen = possible[Math.floor(Math.random() * possible.length)];
    } else if (g.eaten) {
      const target = { col: 14, row: 13 };
      chosen = pickTargetDir(col, row, possible, target.col, target.row);
    } else {
      const pt = pacTile();
      let tc = pt.col, tr = pt.row;
      if (g.id === 1) { tc = pt.col + pac.dx * 4; tr = pt.row + pac.dy * 4; }
      else if (g.id === 2) {
        const blinky = ghosts[0];
        const mc = pt.col + pac.dx * 2, mr = pt.row + pac.dy * 2;
        tc = mc * 2 - tileOf(blinky.x); tr = mr * 2 - tileOf(blinky.y);
      } else if (g.id === 3) {
        const dist = Math.hypot(col - pt.col, row - pt.row);
        if (dist < 8) { tc = 0; tr = ROWS - 1; }
      }
      chosen = pickTargetDir(col, row, possible, tc, tr);
    }

    g.dx = chosen.dx; g.dy = chosen.dy;
    g.targetCol = col + chosen.dx;
    g.targetRow = row + chosen.dy;
  }

  function pickTargetDir(col, row, possible, tc, tr) {
    let best = null, bestDist = Infinity;
    for (const d of possible) {
      const nc = col + d.dx, nr = row + d.dy;
      const dist = Math.hypot(nc - tc, nr - tr);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best || possible[0];
  }

  function pacTile() {
    return { col: tileOf(pac.x), row: tileOf(pac.y) };
  }

  // ── Collision ─────────────────────────────────────────────
  function checkCollisions(now) {
    if (pac.dead || levelTransition) return;
    for (const g of ghosts) {
      if (g.eaten) continue;
      const dist = Math.hypot(pac.x - g.x, pac.y - g.y);
      if (dist < PAC_R + GHOST_R - 4) {
        if (g.scared) {
          // Eat ghost
          g.scared = false;
          g.eaten  = true;
          const pts = GHOST_SCORES[Math.min(ghostEatenCount, 3)];
          ghostEatenCount++;
          score += pts;
          updateHUD();
          showFloatingScore(g.x, g.y, pts);
        } else {
          // Pac dies
          pacDie();
          return;
        }
      }
    }
  }

  // ── Pac death ─────────────────────────────────────────────
  function pacDie() {
    if (pac.dead) return;
    pac.dead = true;
    pac.deathAnim = 0;
    paused = false;
    setTimeout(() => {
      lives--;
      updateHUD();
      if (lives <= 0) {
        triggerGameOver();
      } else {
        resetPositions();
      }
    }, 1400);
  }

  function resetPositions() {
    scaredEnd = 0;
    ghostEatenCount = 0;
    initPac();
    initGhosts();
  }

  // ── Level win ─────────────────────────────────────────────
  function triggerLevelWin() {
    if (levelTransition) return;
    levelTransition = true;
    // Flash maze
    let flashes = 0;
    const iv = setInterval(() => {
      flashes++;
      if (flashes >= 6) {
        clearInterval(iv);
        level++;
        startLevel();
      }
    }, 220);
  }

  // ── Game over ─────────────────────────────────────────────
  function triggerGameOver() {
    gameRunning = false;
    if (score > highScore) highScore = score;
    const ovTitle = document.getElementById('pac-ov-title');
    const ovSub   = document.getElementById('pac-ov-sub');
    const ovScore = document.getElementById('pac-ov-score');
    const overlay = document.getElementById('pac-overlay');
    ovTitle.textContent = 'GAME OVER';
    ovTitle.className = 'pac-ov-title gameover';
    ovSub.textContent = 'Better luck next time!';
    ovScore.textContent = `SCORE: ${score}  |  HIGH: ${highScore}`;
    overlay.classList.add('active');
    updateHUD();
    if (score > 0 && window.HS) setTimeout(() => HS.promptSubmit('pacman', score, score.toLocaleString()), 400);
  }

  // ── Floating score ────────────────────────────────────────
  const floaters = [];
  function showFloatingScore(x, y, pts) {
    floaters.push({ x, y, pts, life: 1.0 });
  }

  // ── HUD ───────────────────────────────────────────────────
  function updateHUD() {
    if (elPacScore) elPacScore.textContent = score;
    if (elPacHigh)  elPacHigh.textContent  = highScore;
    if (elPacLevel) elPacLevel.textContent = level;
    if (elPacLives) {
      elPacLives.innerHTML = '';
      for (let i = 0; i < Math.max(0, lives - 1); i++) {
        const s = document.createElement('span');
        s.textContent = '🟡';
        s.style.fontSize = '0.9rem';
        elPacLives.appendChild(s);
      }
    }
  }

  // ── Draw maze ─────────────────────────────────────────────
  function drawMaze(flashLight) {
    const wallColor   = flashLight ? '#ffffff' : '#1a4aff';
    const wallInner   = flashLight ? '#aaaaff' : '#0000cc';
    const dotColor    = '#ffb8ae';
    const pelletColor = '#ffe600';

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = col * TILE, y = row * TILE;
        const cell = map[row][col];

        if (cell === 1) {
          ctx.fillStyle = wallColor;
          ctx.fillRect(x, y, TILE, TILE);
          // Inner highlight
          ctx.fillStyle = wallInner;
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        } else if (cell === 2) {
          ctx.beginPath();
          ctx.arc(x + TILE/2, y + TILE/2, 2, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        } else if (cell === 3) {
          const t = performance.now();
          const pulse = 0.7 + 0.3 * Math.sin(t / 250);
          ctx.beginPath();
          ctx.arc(x + TILE/2, y + TILE/2,Math.max(0,5 * pulse), 0, Math.PI * 2);
          ctx.fillStyle = pelletColor;
          ctx.fill();
          ctx.shadowBlur = 10;
          ctx.shadowColor = pelletColor;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (cell === 4) {
          // Ghost house door
          ctx.fillStyle = '#ffb8ff';
          ctx.fillRect(x + 3, y + TILE/2 - 1, TILE - 6, 3);
        }
      }
    }
  }

  // ── Draw pac ──────────────────────────────────────────────
  function drawPac() {
    if (pac.dead) {
      // Death animation: pac shrinks/closes
      pac.deathAnim = Math.min(pac.deathAnim + 0.03, 1);
      const angle = pac.deathAnim * Math.PI;
      ctx.beginPath();
      ctx.moveTo(pac.x, pac.y);
      ctx.arc(pac.x, pac.y,Math.max(0,PAC_R), angle, Math.PI * 2 - angle);
      ctx.closePath();
      ctx.fillStyle = '#ffe600';
      ctx.fill();
      return;
    }

    // Rotation based on direction
    let rot = 0;
    if (pac.dx === 1)  rot = 0;
    if (pac.dx === -1) rot = Math.PI;
    if (pac.dy === -1) rot = -Math.PI / 2;
    if (pac.dy === 1)  rot = Math.PI / 2;

    const mouth = pac.mouthAngle * Math.PI;
    ctx.save();
    ctx.translate(pac.x, pac.y);
    ctx.rotate(rot);

    // Glow
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ffe600';

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0,Math.max(0,PAC_R), mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fillStyle = '#ffe600';
    ctx.fill();

    // Eye
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(2, -PAC_R * 0.4, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    ctx.restore();
  }

  // ── Draw ghosts ───────────────────────────────────────────
  function drawGhosts(now) {
    const scared  = now < scaredEnd;
    const flashing = scared && (scaredEnd - now) < SCARED_FLASH_AT;

    for (const g of ghosts) {
      if (g.inHouse) {
        // Still draw inside house
      }
      ctx.save();
      ctx.translate(g.x, g.y);

      let color = g.color;
      if (g.eaten) {
        // Just draw eyes
        drawGhostEyes(ctx);
        ctx.restore();
        continue;
      }
      if (g.scared) {
        if (flashing) {
          color = Math.sin(now / 150) > 0 ? '#ffffff' : '#2121de';
        } else {
          color = '#2121de';
        }
      }

      const r = GHOST_R;
      // Body
      ctx.shadowBlur = g.scared ? 0 : 10;
      ctx.shadowColor = color;

      ctx.beginPath();
      ctx.arc(0, -r * 0.1,Math.max(0,r), Math.PI, 0);
      // Wavy bottom
      const waveAmp = 2.5;
      const segments = 3;
      ctx.lineTo(r, r * 0.9);
      for (let i = segments; i >= 0; i--) {
        const wx = r - (r * 2 / segments) * i;
        const wy = r * 0.9 + (i % 2 === 0 ? waveAmp : -waveAmp) * Math.sin(g.wobble);
        ctx.lineTo(wx - r, wy);
      }
      ctx.lineTo(-r, r * 0.9);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!g.scared) {
        drawGhostEyes(ctx);
      } else {
        // Scared face
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(-r*0.35, -r*0.1, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc( r*0.35, -r*0.1, 2.5, 0, Math.PI*2); ctx.fill();
        // Wavy mouth
        ctx.beginPath();
        ctx.moveTo(-r*0.5, r*0.3);
        for (let i = 0; i <= 4; i++) {
          ctx.lineTo(-r*0.5 + i * r*0.25, r*0.3 + (i%2===0?3:-3));
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function drawGhostEyes(ctx) {
    const r = GHOST_R;
    // Whites
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-r*0.35, -r*0.2, r*0.25, r*0.32, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( r*0.35, -r*0.2, r*0.25, r*0.32, 0, 0, Math.PI*2); ctx.fill();
    // Pupils
    ctx.fillStyle = '#2222ff';
    ctx.beginPath(); ctx.arc(-r*0.35, -r*0.2,Math.max(0,r*0.14), 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( r*0.35, -r*0.2,Math.max(0,r*0.14), 0, Math.PI*2); ctx.fill();
  }

  // ── Draw floaters ─────────────────────────────────────────
  function drawFloaters() {
    ctx.font = 'bold 11px Orbitron, monospace';
    ctx.textAlign = 'center';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      ctx.globalAlpha = f.life;
      ctx.fillStyle = '#ffe600';
      ctx.fillText(f.pts, f.x, f.y);
      f.y -= 0.5;
      f.life -= 0.02;
      if (f.life <= 0) { floaters[i] = floaters[floaters.length - 1]; floaters.pop(); }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // ── Power bar ─────────────────────────────────────────────
  function drawPowerBar(now) {
    if (now >= scaredEnd) return;
    const pct = (scaredEnd - now) / SCARED_DURATION;
    const w   = COLS * TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, ROWS * TILE - 4, w, 4);
    ctx.fillStyle = pct < 0.25 ? '#ff4444' : '#ffe600';
    ctx.fillRect(0, ROWS * TILE - 4, w * pct, 4);
  }

  // ── Main loop ─────────────────────────────────────────────
  let lastTime = 0;
  let flashState = false;
  let flashToggle = 0;

  function loop(now) {
    if (!gameRunning) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - lastTime, 40);
    lastTime = now;

    if (paused || levelTransition) {
      render(now);
      return;
    }

    // Update scared state
    if (now >= scaredEnd && scaredEnd > 0) {
      scaredEnd = 0;
      ghosts.forEach(g => { if (!g.eaten) g.scared = false; });
    }
    // Un-eaten reset
    ghosts.forEach(g => {
      if (g.eaten) {
        const dc = Math.abs((g.tileCol || tileOf(g.x)) - 14);
        const dr = Math.abs((g.tileRow || tileOf(g.y)) - 13);
        if (dc + dr < 1) {
          g.eaten = false; g.scared = false;
          g.inHouse = true; g.leaveTimer = 3000;
          g.dx = 0; g.dy = 0;
          g.targetCol = undefined;
        }
      }
    });

    updatePac(dt);
    ghosts.forEach(g => updateGhost(g, dt, now));
    checkCollisions(now);
    render(now);
  }

  function render(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fl = levelTransition && Math.floor(now / 220) % 2 === 0;
    drawMaze(fl);
    drawGhosts(now);
    drawPac();
    drawFloaters();
    drawPowerBar(now);
  }

  // ── Input ─────────────────────────────────────────────────
  function onKey(e) {
    const map2 = {
      ArrowLeft:'L', ArrowRight:'R', ArrowUp:'U', ArrowDown:'D',
      a:'L', d:'R', w:'U', s:'D',
      A:'L', D:'R', W:'U', S:'D',
    };
    const dir = map2[e.key];
    if (!dir) return;
    e.preventDefault();
    if (!gameRunning) { startGame(); return; }
    const dirs2 = { L:{dx:-1,dy:0}, R:{dx:1,dy:0}, U:{dx:0,dy:-1}, D:{dx:0,dy:1} };
    const d = dirs2[dir];
    pac.qx = d.dx; pac.qy = d.dy;
    if (pac.dx === 0 && pac.dy === 0) { pac.dx = d.dx; pac.dy = d.dy; }
  }

  function queueDir(dx, dy) {
    pac.qx = dx; pac.qy = dy;
    if (!gameRunning) startGame();
    else if (pac.dx === 0 && pac.dy === 0) { pac.dx = dx; pac.dy = dy; }
  }

  // ── Init / start / destroy ────────────────────────────────
  function init() {
    canvas = document.getElementById('pac-canvas');
    canvas.width  = COLS * TILE;
    canvas.height = ROWS * TILE;
    ctx = canvas.getContext('2d');
    elPacOverlay = document.getElementById('pac-overlay');
    elPacOvTitle = document.getElementById('pac-ov-title');
    elPacOvSub   = document.getElementById('pac-ov-sub');
    elPacOvScore = document.getElementById('pac-ov-score');
    elPacScore   = document.getElementById('pac-score');
    elPacHigh    = document.getElementById('pac-high');
    elPacLevel   = document.getElementById('pac-level');
    elPacLives   = document.getElementById('pac-lives');
    elPacPauseBtn = document.getElementById('pac-pause-btn');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    newGame();
    updateHUD();
    if(elPacOverlay) elPacOverlay.classList.add('active');
    if(elPacOvTitle) elPacOvTitle.textContent = 'PAC-MAN';
    if(elPacOvTitle) elPacOvTitle.className = 'pac-ov-title';
    if(elPacOvSub) elPacOvSub.textContent = 'Arrow keys / WASD · P to pause';
    if(elPacOvScore) elPacOvScore.textContent = '';
  }

  function startGame() {
    if(elPacOverlay) elPacOverlay.classList.remove('active');
    newGame();
    gameRunning = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
    if (elPacPauseBtn) elPacPauseBtn.textContent = '⏸ PAUSE';
  }

  function togglePause() {
    if (!gameRunning) return;
    paused = !paused;
    if (elPacPauseBtn) elPacPauseBtn.textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
    if (!paused) { lastTime = performance.now(); raf = requestAnimationFrame(loop); }
  }

  function destroy() {
    gameRunning = false;
    paused = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
  }

  return { init, startGame, newGame, togglePause, destroy, queueDir };
})();
