export default (() => {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────
  const COLS = 15, ROWS = 13;
  const CELL = 36; // px per cell (resized dynamically)
  const TILE = { EMPTY: 0, WALL: 1, BLOCK: 2, BOMB: 3, FLAME: 4 };
  const P_COLORS = ['#00f5ff', '#ff2d78', '#39ff14', '#ffbe00'];
  const P_DARK   = ['#006070', '#7a0038', '#1a7a09', '#7a5a00'];

  // ─── State ───────────────────────────────────────────────────────────────────
  let canvas, ctx, animId;
  let grid, players, bombs, flames, powerups;
  let gameRunning = false, gameMode = null; // 'solo' | 'local2' | 'local4'
  let wins = [0, 0, 0, 0];
  let roundTimer = 0, roundInterval = null;
  let countdownActive = false;
  let cellSize = CELL;

  // ─── Map generation ──────────────────────────────────────────────────────────
  function makeGrid() {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      g[r] = [];
      for (let c = 0; c < COLS; c++) {
        // Solid walls at even rows and even cols (classic pattern)
        if (r % 2 === 0 && c % 2 === 0) { g[r][c] = TILE.WALL; continue; }
        // Border walls
        if (r === 0 || r === ROWS-1 || c === 0 || c === COLS-1) { g[r][c] = TILE.WALL; continue; }
        // Safe zones around player spawns (top-left, top-right, bot-left, bot-right)
        const safe = [
          [1,1],[1,2],[2,1],
          [1,COLS-2],[1,COLS-3],[2,COLS-2],
          [ROWS-2,1],[ROWS-3,1],[ROWS-2,2],
          [ROWS-2,COLS-2],[ROWS-3,COLS-2],[ROWS-2,COLS-3],
        ];
        if (safe.some(([sr,sc]) => sr===r && sc===c)) { g[r][c] = TILE.EMPTY; continue; }
        // Random destructible blocks (~65%)
        g[r][c] = Math.random() < 0.65 ? TILE.BLOCK : TILE.EMPTY;
      }
    }
    return g;
  }

  function spawnPositions(count) {
    const all = [
      {r:1,c:1}, {r:1,c:COLS-2}, {r:ROWS-2,c:1}, {r:ROWS-2,c:COLS-2}
    ];
    return all.slice(0, count);
  }

  function makePlayer(id, r, c) {
    return {
      id, r, c,
      x: c * cellSize + cellSize/2,
      y: r * cellSize + cellSize/2,
      dx: 0, dy: 0,
      speed: 2.5,
      bombMax: 1, bombCount: 0,
      flameRange: 2,
      alive: true,
      isAI: false,
      aiTimer: 0, aiDir: null, aiDirTimer: 0,
      invincible: 0, // frames of invincibility after hit
      color: P_COLORS[id],
      dark: P_DARK[id],
    };
  }

  // ─── Powerup ─────────────────────────────────────────────────────────────────
  const PU_TYPES = ['bomb','flame','speed'];
  function trySpawnPowerup(r, c) {
    if (Math.random() < 0.3) {
      powerups.push({ r, c, type: PU_TYPES[Math.floor(Math.random()*3)] });
    }
  }

  // ─── Bomb ────────────────────────────────────────────────────────────────────
  function placeBomb(p) {
    if (!p.alive || p.bombCount >= p.bombMax) return;
    const r = Math.round((p.y - cellSize/2) / cellSize);
    const c = Math.round((p.x - cellSize/2) / cellSize);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    if (grid[r][c] !== TILE.EMPTY) return;
    if (bombs.find(b => b.r === r && b.c === c)) return;
    p.bombCount++;
    grid[r][c] = TILE.BOMB;
    bombs.push({ r, c, timer: 180, range: p.flameRange, owner: p.id });
  }

  function explodeBomb(bomb) {
    grid[bomb.r][bomb.c] = TILE.EMPTY;
    const owner = players[bomb.owner];
    if (owner) owner.bombCount = Math.max(0, owner.bombCount - 1);

    const dirs = [[0,0],[1,0],[-1,0],[0,1],[0,-1]];
    const newFlames = [];

    function addFlame(r, c) {
      grid[r][c] = TILE.FLAME;
      newFlames.push({ r, c, timer: 45 });
      // kill players in flame
      players.forEach(p => {
        if (p.alive && p.invincible <= 0 && Math.round((p.y - cellSize/2)/cellSize) === r && Math.round((p.x - cellSize/2)/cellSize) === c) {
          killPlayer(p);
        }
      });
      // chain explosion
      const chain = bombs.findIndex(b => b.r === r && b.c === c);
      if (chain !== -1) {
        const cb = bombs.splice(chain, 1)[0];
        cb.timer = 1;
      }
    }

    addFlame(bomb.r, bomb.c);

    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      for (let i = 1; i <= bomb.range; i++) {
        const nr = bomb.r + dr*i, nc = bomb.c + dc*i;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
        if (grid[nr][nc] === TILE.WALL) break;
        if (grid[nr][nc] === TILE.BLOCK) {
          grid[nr][nc] = TILE.EMPTY;
          trySpawnPowerup(nr, nc);
          addFlame(nr, nc);
          break;
        }
        addFlame(nr, nc);
        if (grid[nr][nc] === TILE.BOMB) break; // chain handled above
      }
    }

    flames.push(...newFlames);
  }

  function killPlayer(p) {
    p.alive = false;
    p.invincible = 120;
  }

  // ─── AI ──────────────────────────────────────────────────────────────────────
  function tickAI(p, dt) {
    if (!p.isAI || !p.alive) return;
    p.aiTimer -= dt;
    p.aiDirTimer -= dt;

    // Check for danger (nearby bombs)
    const pr = Math.round((p.y - cellSize/2) / cellSize);
    const pc = Math.round((p.x - cellSize/2) / cellSize);
    const nearBomb = bombs.some(b => Math.abs(b.r-pr) + Math.abs(b.c-pc) <= b.range);

    if (nearBomb || p.aiDirTimer <= 0) {
      // Choose a random valid direction to move
      const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
      const shuffled = dirs.sort(() => Math.random()-0.5);
      let picked = null;
      for (const [dr, dc] of shuffled) {
        const nr = pr+dr, nc = pc+dc;
        if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS && (grid[nr][nc]===TILE.EMPTY||grid[nr][nc]===TILE.FLAME)) {
          // Prefer escaping from bombs
          if (nearBomb) {
            const saferFromBomb = !bombs.some(b => Math.abs(b.r-nr)+Math.abs(b.c-nc) <= b.range);
            if (saferFromBomb) { picked = [dr, dc]; break; }
          } else {
            picked = [dr, dc];
          }
        }
      }
      if (!picked) picked = shuffled[0] || [0, 0];
      p.aiDir = picked;
      p.aiDirTimer = 30 + Math.random()*40;
    }

    if (p.aiDir) {
      p.dx = p.aiDir[1];
      p.dy = p.aiDir[0];
    }

    // Occasionally place a bomb
    if (p.aiTimer <= 0 && !nearBomb) {
      placeBomb(p);
      p.aiTimer = 80 + Math.random()*120;
    }
  }

  // ─── Movement & collision ────────────────────────────────────────────────────
  function movePlayer(p, dt) {
    if (!p.alive) return;
    if (p.invincible > 0) p.invincible--;

    const speed = p.speed * (cellSize / 36);
    let nx = p.x + p.dx * speed;
    let ny = p.y + p.dy * speed;

    // Grid collision — check corners of player hitbox (shrunk by 4px)
    const margin = cellSize * 0.28;
    function blocked(x, y) {
      const corners = [
        [x - margin, y - margin],
        [x + margin, y - margin],
        [x - margin, y + margin],
        [x + margin, y + margin],
      ];
      return corners.some(([cx, cy]) => {
        const c = Math.floor(cx / cellSize);
        const r = Math.floor(cy / cellSize);
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
        const t = grid[r][c];
        return t === TILE.WALL || t === TILE.BLOCK || t === TILE.BOMB;
      });
    }

    if (!blocked(nx, p.y)) p.x = nx;
    else if (!blocked(p.x, ny)) p.y = ny;

    // Collect powerups
    const pr = Math.round((p.y - cellSize/2) / cellSize);
    const pc = Math.round((p.x - cellSize/2) / cellSize);
    const pui = powerups.findIndex(pu => pu.r === pr && pu.c === pc);
    if (pui !== -1) {
      const pu = powerups.splice(pui, 1)[0];
      if (pu.type === 'bomb') p.bombMax = Math.min(p.bombMax+1, 5);
      if (pu.type === 'flame') p.flameRange = Math.min(p.flameRange+1, 6);
      if (pu.type === 'speed') p.speed = Math.min(p.speed+0.5, 5);
    }

    // Check flame damage
    if (p.invincible <= 0) {
      const fr = Math.floor(p.y / cellSize);
      const fc = Math.floor(p.x / cellSize);
      if (fr >= 0 && fr < ROWS && fc >= 0 && fc < COLS && grid[fr][fc] === TILE.FLAME) {
        killPlayer(p);
      }
    }
  }

  // ─── Input ───────────────────────────────────────────────────────────────────
  const keys = new Set();
  function onKeyDown(e) {
    keys.add(e.code);
    // P1 bomb: Space, P2 bomb: Enter, P3: Numpad0, P4: Backslash
    if (!gameRunning || countdownActive) return;
    if (e.code === 'Space' && players[0]?.alive) { e.preventDefault(); placeBomb(players[0]); }
    if (e.code === 'Enter' && gameMode !== 'solo' && players[1]?.alive) { e.preventDefault(); placeBomb(players[1]); }
    if (e.code === 'Numpad0' && gameMode === 'local4' && players[2]?.alive) placeBomb(players[2]);
    if (e.code === 'Backslash' && gameMode === 'local4' && players[3]?.alive) placeBomb(players[3]);
  }
  function onKeyUp(e) { keys.delete(e.code); }

  function readInput() {
    if (!gameRunning || countdownActive) { players.forEach(p => { p.dx = 0; p.dy = 0; }); return; }

    // P1: WASD
    const p1 = players[0];
    if (p1?.alive) {
      p1.dx = (keys.has('KeyD')||keys.has('ArrowRight')) ? 1 : (keys.has('KeyA')||keys.has('ArrowLeft')) ? -1 : 0;
      p1.dy = (keys.has('KeyS')||keys.has('ArrowDown')) ? 1 : (keys.has('KeyW')||keys.has('ArrowUp')) ? -1 : 0;
    }

    // P2: Arrow keys (non-AI only)
    if (gameMode !== 'solo') {
      const p2 = players[1];
      if (p2?.alive && !p2.isAI) {
        p2.dx = keys.has('ArrowRight') ? 1 : keys.has('ArrowLeft') ? -1 : 0;
        p2.dy = keys.has('ArrowDown')  ? 1 : keys.has('ArrowUp')   ? -1 : 0;
      }
    }

    // P3: IJKL, P4: Numpad
    if (gameMode === 'local4') {
      const p3 = players[2];
      if (p3?.alive && !p3.isAI) {
        p3.dx = keys.has('KeyL') ? 1 : keys.has('KeyJ') ? -1 : 0;
        p3.dy = keys.has('KeyK') ? 1 : keys.has('KeyI') ? -1 : 0;
      }
      const p4 = players[3];
      if (p4?.alive && !p4.isAI) {
        p4.dx = keys.has('Numpad6') ? 1 : keys.has('Numpad4') ? -1 : 0;
        p4.dy = keys.has('Numpad2') ? 1 : keys.has('Numpad8') ? -1 : 0;
      }
    }
  }

  // ─── Round management ────────────────────────────────────────────────────────
  function startRound() {
    grid = makeGrid();
    bombs = []; flames = []; powerups = [];
    const mode = gameMode;
    const count = mode === 'solo' ? 2 : mode === 'local2' ? 2 : 4;
    const spawns = spawnPositions(count);

    players = spawns.map((sp, i) => {
      const p = makePlayer(i, sp.r, sp.c);
      p.x = sp.c * cellSize + cellSize/2;
      p.y = sp.r * cellSize + cellSize/2;
      if (mode === 'solo' && i > 0) p.isAI = true;
      if (mode === 'local4' && i > 1) p.isAI = true; // optional: 2v2 vs AI
      return p;
    });

    gameRunning = true;
    roundTimer = 120; // seconds
    startCountdown(() => {});
    updateHUD();
  }

  function startCountdown(cb) {
    countdownActive = true;
    const el = document.getElementById('bomb-countdown');
    el.style.display = 'flex';
    let n = 3;
    const tick = () => {
      el.innerHTML = `<span class="bomb-cd-num">${n}</span>`;
      if (n <= 0) {
        el.innerHTML = `<span class="bomb-cd-num" style="color:#39ff14">GO!</span>`;
        setTimeout(() => { el.style.display = 'none'; countdownActive = false; cb(); }, 700);
        return;
      }
      n--;
      setTimeout(tick, 900);
    };
    tick();
  }

  function checkRoundEnd() {
    const alive = players.filter(p => p.alive);
    if (alive.length <= 1) {
      gameRunning = false;
      clearInterval(roundInterval);
      const winner = alive[0];
      if (winner) {
        wins[winner.id]++;
        updateHUD();
        showRoundResult(`P${winner.id+1} WINS!`, winner.color);
      } else {
        showRoundResult('DRAW!', '#aaa');
      }
      // Check if someone has won enough rounds (best of 5)
      const topWins = Math.max(...wins.slice(0, players.length));
      if (topWins >= 3) {
        const champ = wins.indexOf(topWins);
        setTimeout(() => endGame(champ), 2000);
      } else {
        setTimeout(() => startRound(), 2500);
      }
    }
  }

  function showRoundResult(text, color) {
    const ov = document.getElementById('bomb-overlay');
    const title = document.getElementById('bomb-ov-title');
    const sub = document.getElementById('bomb-ov-sub');
    const btns = document.getElementById('bomb-ov-btns');
    title.textContent = text;
    title.style.color = color;
    title.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
    sub.textContent = 'Next round starting...';
    btns.innerHTML = '';
    ov.classList.add('active');
    setTimeout(() => ov.classList.remove('active'), 2400);
  }

  function endGame(champIdx) {
    gameRunning = false;
    const ov = document.getElementById('bomb-overlay');
    const title = document.getElementById('bomb-ov-title');
    const sub = document.getElementById('bomb-ov-sub');
    const btns = document.getElementById('bomb-ov-btns');
    const color = P_COLORS[champIdx];
    title.textContent = `P${champIdx+1} CHAMPION!`;
    title.style.color = color;
    title.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
    sub.textContent = `${wins[champIdx]} rounds won`;
    btns.innerHTML = `
      <button class="bomb-mode-btn" onclick="window.BOMB?.newGame()">🔁 PLAY AGAIN</button>
      <button class="arcade-back-btn" onclick="window.BOMB?.destroy();backToGameSelect()">🕹 ARCADE</button>
    `;
    ov.classList.add('active');

    // Submit high score (wins for the human player P1)
    if (champIdx === 0) {
      window.HS?.promptSubmit('bomberman', wins[0], `${wins[0]} wins`);
    }
  }

  function updateHUD() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`bomb-p${i+1}-wins`);
      if (el) el.textContent = wins[i] || 0;
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  const POWERUP_ICONS = { bomb: '💣', flame: '🔥', speed: '⚡' };

  function draw() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cs = cellSize;

    // Background tint
    ctx.fillStyle = '#050c1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * cs, y = r * cs;
        const t = grid[r][c];

        if (t === TILE.WALL) {
          // Solid wall
          ctx.fillStyle = '#0d2137';
          ctx.fillRect(x, y, cs, cs);
          ctx.fillStyle = '#0a1830';
          ctx.fillRect(x+1, y+1, cs-2, cs-2);
          // Grid pattern on walls
          ctx.strokeStyle = 'rgba(0,245,255,0.06)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x+2, y+2, cs-4, cs-4);
        } else if (t === TILE.BLOCK) {
          // Destructible block
          ctx.fillStyle = '#1a3a5c';
          ctx.fillRect(x, y, cs, cs);
          ctx.fillStyle = '#162e4a';
          ctx.fillRect(x+2, y+2, cs-4, cs-4);
          // Cracks
          ctx.strokeStyle = 'rgba(0,200,255,0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x+5, y+5); ctx.lineTo(x+cs-8, y+cs-10);
          ctx.moveTo(x+cs-10, y+6); ctx.lineTo(x+7, y+cs-8);
          ctx.stroke();
        } else if (t === TILE.FLAME) {
          // Flame
          ctx.fillStyle = 'rgba(255,100,0,0.3)';
          ctx.fillRect(x, y, cs, cs);
          const grad = ctx.createRadialGradient(x+cs/2, y+cs/2, 0, x+cs/2, y+cs/2, cs/2);
          grad.addColorStop(0, 'rgba(255,255,100,0.9)');
          grad.addColorStop(0.5, 'rgba(255,80,0,0.7)');
          grad.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, cs, cs);
        } else {
          // Empty — subtle grid
          ctx.fillStyle = 'rgba(0,30,60,0.4)';
          ctx.fillRect(x, y, cs, cs);
          ctx.strokeStyle = 'rgba(0,80,120,0.2)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cs, cs);
        }
      }
    }

    // Powerups
    ctx.font = `${Math.floor(cs * 0.55)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pu of powerups) {
      ctx.fillText(POWERUP_ICONS[pu.type], pu.c*cs + cs/2, pu.r*cs + cs/2);
    }

    // Bombs
    for (const bomb of bombs) {
      const x = bomb.c * cs + cs/2, y = bomb.r * cs + cs/2;
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 120);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pulse, pulse);
      // Bomb body
      ctx.beginPath();
      ctx.arc(0, 0, cs * 0.35, 0, Math.PI*2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.strokeStyle = P_COLORS[bomb.owner];
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Fuse glow
      const pct = bomb.timer / 180;
      ctx.fillStyle = pct > 0.4 ? '#ffbe00' : '#ff3300';
      ctx.shadowColor = pct > 0.4 ? '#ffbe00' : '#ff3300';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cs*0.15, -cs*0.25, cs*0.07, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Players
    for (const p of players) {
      if (!p.alive) continue;
      const x = p.x, y = p.y;
      const blink = p.invincible > 0 && Math.floor(p.invincible / 5) % 2 === 0;
      if (blink) continue;

      ctx.save();
      // Shadow
      ctx.beginPath();
      ctx.ellipse(x, y + cs*0.36, cs*0.28, cs*0.1, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.arc(x, y, cs * 0.34, 0, Math.PI*2);
      const grad = ctx.createRadialGradient(x - cs*0.1, y - cs*0.1, 0, x, y, cs*0.34);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, p.dark);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.stroke();

      // Player number
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.floor(cs * 0.3)}px Orbitron, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.id + 1, x, y + 1);

      ctx.restore();
    }
  }

  // ─── Game loop ───────────────────────────────────────────────────────────────
  let lastTime = 0;
  function loop(ts) {
    animId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTime) / 16.67, 3);
    lastTime = ts;

    readInput();

    if (gameRunning && !countdownActive) {
      // Move players
      for (const p of players) {
        if (p.isAI) tickAI(p, dt);
        movePlayer(p, dt);
      }

      // Tick bombs
      for (let i = bombs.length - 1; i >= 0; i--) {
        bombs[i].timer -= dt;
        if (bombs[i].timer <= 0) {
          const b = bombs.splice(i, 1)[0];
          explodeBomb(b);
        }
      }

      // Tick flames
      for (let i = flames.length - 1; i >= 0; i--) {
        flames[i].timer -= dt;
        if (flames[i].timer <= 0) {
          const f = flames.splice(i, 1)[0];
          if (grid[f.r][f.c] === TILE.FLAME) grid[f.r][f.c] = TILE.EMPTY;
        }
      }

      checkRoundEnd();
    }

    draw();
  }

  // ─── Resize ──────────────────────────────────────────────────────────────────
  function resize() {
    const screen = document.getElementById('bomb-screen');
    if (!screen || !canvas) return;
    const wrap = document.getElementById('bomb-canvas-wrap');
    if (!wrap) return;
    const hw = wrap.clientWidth, hh = wrap.clientHeight;
    const cs = Math.floor(Math.min(hw / COLS, hh / ROWS));
    cellSize = Math.max(cs, 20);
    canvas.width  = cellSize * COLS;
    canvas.height = cellSize * ROWS;
    // Reposition players on resize
    if (players) {
      players.forEach(p => {
        const r = Math.round((p.y - (cellSize/2)) / cellSize);
        const c = Math.round((p.x - (cellSize/2)) / cellSize);
        // approximate: just keep relative tile
      });
    }
  }

  let _resizeObs = null;

  // ─── Mobile controls ─────────────────────────────────────────────────────────
  function setupMobileControls() {
    // P1 dpad
    const dirs = { 'bomb-d-up':[-1,0],'bomb-d-down':[1,0],'bomb-d-left':[0,-1],'bomb-d-right':[0,1] };
    Object.entries(dirs).forEach(([id, [dy, dx]]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); if (players[0]) { players[0].dx = dx; players[0].dy = dy; } }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); if (players[0]) { players[0].dx = 0;  players[0].dy = 0;  } }, { passive: false });
    });
    const bombBtn = document.getElementById('bomb-d-bomb');
    if (bombBtn) {
      bombBtn.addEventListener('touchstart', e => { e.preventDefault(); placeBomb(players[0]); }, { passive: false });
      bombBtn.addEventListener('click', () => placeBomb(players[0]));
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  function showMenu() {
    const ov = document.getElementById('bomb-overlay');
    const title = document.getElementById('bomb-ov-title');
    const sub = document.getElementById('bomb-ov-sub');
    const btns = document.getElementById('bomb-ov-btns');
    gameRunning = false;
    title.textContent = '💣 BOMBERMAN';
    title.style.color = '#ff2d78';
    title.style.textShadow = '0 0 20px #ff2d78, 0 0 40px #ff2d78';
    sub.textContent = 'FIRST TO 3 ROUNDS WINS';
    btns.innerHTML = `
      <button class="bomb-mode-btn" onclick="window.BOMB?.startMode('solo')">🤖 VS AI</button>
      <button class="bomb-mode-btn" style="border-color:#ff2d78;color:#ff2d78" onclick="window.BOMB?.startMode('local2')">👥 2 PLAYERS</button>
      <button class="bomb-mode-btn" style="border-color:#39ff14;color:#39ff14" onclick="window.BOMB?.startMode('local4')">👥 4 PLAYERS</button>
      <button class="arcade-back-btn" onclick="window.BOMB?.destroy();backToGameSelect()">🕹 ARCADE</button>
    `;
    ov.classList.add('active');
  }

  function startMode(mode) {
    gameMode = mode;
    wins = [0, 0, 0, 0];
    document.getElementById('bomb-overlay').classList.remove('active');
    // Show/hide win blocks
    const p3 = document.getElementById('bomb-p3-block');
    const p4 = document.getElementById('bomb-p4-block');
    if (p3) p3.style.display = mode === 'local4' ? 'block' : 'none';
    if (p4) p4.style.display = mode === 'local4' ? 'block' : 'none';
    updateHUD();
    startRound();
  }

  function newGame() {
    document.getElementById('bomb-overlay').classList.remove('active');
    wins = [0, 0, 0, 0];
    updateHUD();
    startRound();
  }

  function init() {
    canvas = document.getElementById('bomb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resize();
    _resizeObs = new ResizeObserver(resize);
    _resizeObs.observe(document.getElementById('bomb-canvas-wrap'));

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    setupMobileControls();

    wins = [0, 0, 0, 0];
    bombs = []; flames = []; players = []; powerups = [];
    grid = makeGrid();
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);

    showMenu();
  }

  function destroy() {
    gameRunning = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
    if (roundInterval) { clearInterval(roundInterval); roundInterval = null; }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.getElementById('bomb-overlay')?.classList.remove('active');
    document.getElementById('bomb-countdown')?.style && (document.getElementById('bomb-countdown').style.display = 'none');
  }

  return { init, destroy, startMode, newGame };
})();
