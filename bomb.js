export default (() => {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────
  const COLS = 15, ROWS = 13;
  const TILE = { EMPTY: 0, WALL: 1, BLOCK: 2, BOMB: 3, FLAME: 4 };
  const P_COLORS = ['#00f5ff', '#ff2d78'];
  const P_DARK   = ['#006070', '#7a0038'];
  const TICK_MS  = 50;

  // ─── State ───────────────────────────────────────────────────────────────────
  let canvas, ctx, animId;
  let grid, players, bombs, flames, powerups;
  let gameRunning = false, gameMode = null;
  let wins = [0, 0];
  let countdownActive = false;
  let cellSize = 36;

  const online = {
    active: false,
    isHost: false,
    myIdx: 0,
    gameCode: null,
    myName: '',
    oppName: '',
    unsubs: [],
    tickInterval: null,
  };

  // ─── Seeded Map generation ───────────────────────────────────────────────────
  function makeGrid(seed) {
    let s = seed || 12345;
    function rng() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 4294967295; }
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      g[r] = [];
      for (let c = 0; c < COLS; c++) {
        if (r % 2 === 0 && c % 2 === 0)                          { g[r][c] = TILE.WALL;  continue; }
        if (r === 0 || r === ROWS-1 || c === 0 || c === COLS-1)  { g[r][c] = TILE.WALL;  continue; }
        const safe = [[1,1],[1,2],[2,1],[1,COLS-2],[1,COLS-3],[2,COLS-2],[ROWS-2,1],[ROWS-3,1],[ROWS-2,2],[ROWS-2,COLS-2],[ROWS-3,COLS-2],[ROWS-2,COLS-3]];
        if (safe.some(([sr,sc]) => sr===r && sc===c))             { g[r][c] = TILE.EMPTY; continue; }
        g[r][c] = rng() < 0.65 ? TILE.BLOCK : TILE.EMPTY;
      }
    }
    return g;
  }

  function makePlayer(id, r, c) {
    return {
      id, r, c,
      x: c * cellSize + cellSize / 2,
      y: r * cellSize + cellSize / 2,
      dx: 0, dy: 0,
      speed: 2.5,
      bombMax: 1, bombCount: 0,
      flameRange: 2,
      alive: true,
      isAI: false,
      aiTimer: 0, aiDir: null, aiDirTimer: 0,
      invincible: 0,
      color: P_COLORS[id],
      dark: P_DARK[id],
    };
  }

  // ─── Powerups ─────────────────────────────────────────────────────────────────
  const PU_TYPES = ['bomb', 'flame', 'speed'];
  function trySpawnPowerup(r, c) {
    if (Math.random() < 0.3) powerups.push({ r, c, type: PU_TYPES[Math.floor(Math.random() * 3)] });
  }

  // ─── Bombs ───────────────────────────────────────────────────────────────────
  function placeBomb(p) {
    if (!p.alive || p.bombCount >= p.bombMax) return;
    const r = Math.round((p.y - cellSize / 2) / cellSize);
    const c = Math.round((p.x - cellSize / 2) / cellSize);
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
    const newFlames = [];

    function addFlame(r, c) {
      grid[r][c] = TILE.FLAME;
      newFlames.push({ r, c, timer: 45 });
      players.forEach(p => {
        if (p.alive && p.invincible <= 0 &&
            Math.round((p.y - cellSize / 2) / cellSize) === r &&
            Math.round((p.x - cellSize / 2) / cellSize) === c) killPlayer(p);
      });
      const chain = bombs.findIndex(b => b.r === r && b.c === c);
      if (chain !== -1) { const cb = bombs.splice(chain, 1)[0]; cb.timer = 1; }
    }

    addFlame(bomb.r, bomb.c);
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      for (let i = 1; i <= bomb.range; i++) {
        const nr = bomb.r + dr*i, nc = bomb.c + dc*i;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
        if (grid[nr][nc] === TILE.WALL) break;
        if (grid[nr][nc] === TILE.BLOCK) { grid[nr][nc] = TILE.EMPTY; trySpawnPowerup(nr, nc); addFlame(nr, nc); break; }
        addFlame(nr, nc);
        if (grid[nr][nc] === TILE.BOMB) break;
      }
    }
    flames.push(...newFlames);
  }

  function killPlayer(p) { p.alive = false; }

  // ─── Smart AI — BFS escape + cautious bombing ─────────────────────────────────
  function buildDangerSet() {
    const d = new Set();
    for (const bomb of bombs) {
      d.add(`${bomb.r},${bomb.c}`);
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        for (let i = 1; i <= bomb.range; i++) {
          const nr = bomb.r + dr*i, nc = bomb.c + dc*i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (grid[nr][nc] === TILE.WALL || grid[nr][nc] === TILE.BLOCK) break;
          d.add(`${nr},${nc}`);
        }
      }
    }
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] === TILE.FLAME) d.add(`${r},${c}`);
    return d;
  }

  function bfsEscape(startR, startC, danger) {
    const visited = new Set([`${startR},${startC}`]);
    const queue = [[startR, startC, null]];
    while (queue.length) {
      const [r, c, firstDir] = queue.shift();
      if (!danger.has(`${r},${c}`)) return firstDir || [0, 0];
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nr = r+dr, nc = c+dc, key = `${nr},${nc}`;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || visited.has(key)) continue;
        const t = grid[nr][nc];
        if (t === TILE.WALL || t === TILE.BLOCK || t === TILE.BOMB) continue;
        visited.add(key);
        queue.push([nr, nc, firstDir || [dr, dc]]);
      }
    }
    return null;
  }

  function canEscapeAfterBomb(r, c, range) {
    const fake = buildDangerSet();
    fake.add(`${r},${c}`);
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      for (let i = 1; i <= range; i++) {
        const nr = r+dr*i, nc = c+dc*i;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
        if (grid[nr][nc] === TILE.WALL || grid[nr][nc] === TILE.BLOCK) break;
        fake.add(`${nr},${nc}`);
      }
    }
    return bfsEscape(r, c, fake) !== null;
  }

  function tickAI(p, dt) {
    if (!p.isAI || !p.alive) return;
    p.aiTimer -= dt;
    p.aiDirTimer -= dt;
    const pr = Math.round((p.y - cellSize / 2) / cellSize);
    const pc = Math.round((p.x - cellSize / 2) / cellSize);
    const danger = buildDangerSet();
    const inDanger = danger.has(`${pr},${pc}`);

    if (inDanger || p.aiDirTimer <= 0) {
      if (inDanger) {
        const esc = bfsEscape(pr, pc, danger);
        p.aiDir = esc || [0, 0];
        p.aiDirTimer = 18;
      } else {
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]].sort(() => Math.random() - 0.5);
        let best = null;
        for (const [dr, dc] of dirs) {
          const nr = pr+dr, nc = pc+dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const t = grid[nr][nc];
          if (t === TILE.WALL || t === TILE.BLOCK || t === TILE.BOMB) continue;
          if (danger.has(`${nr},${nc}`)) continue;
          let adjBlock = false;
          for (const [dr2, dc2] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const br = nr+dr2, bc = nc+dc2;
            if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS && grid[br][bc] === TILE.BLOCK) { adjBlock = true; break; }
          }
          if (!best || adjBlock) best = [dr, dc];
          if (adjBlock) break;
        }
        p.aiDir = best || [0, 0];
        p.aiDirTimer = 28 + Math.random() * 32;
      }
    }

    if (p.aiDir) { p.dx = p.aiDir[1]; p.dy = p.aiDir[0]; }

    if (p.aiTimer <= 0 && !inDanger && p.bombCount < p.bombMax) {
      let worth = false;
      outer: for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        for (let i = 1; i <= p.flameRange; i++) {
          const nr = pr+dr*i, nc = pc+dc*i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (grid[nr][nc] === TILE.WALL) break;
          if (grid[nr][nc] === TILE.BLOCK) { worth = true; break outer; }
          if (players.some(op => op.id !== p.id && op.alive &&
              Math.round((op.y - cellSize/2) / cellSize) === nr &&
              Math.round((op.x - cellSize/2) / cellSize) === nc)) { worth = true; break outer; }
        }
      }
      if (worth && canEscapeAfterBomb(pr, pc, p.flameRange)) {
        placeBomb(p);
        p.aiDirTimer = 0;
        p.aiTimer = 80 + Math.random() * 80;
      } else {
        p.aiTimer = 25 + Math.random() * 35;
      }
    }
  }

  // ─── Input ───────────────────────────────────────────────────────────────────
  const keys = new Set();

  function onKeyDown(e) {
    keys.add(e.code);
    if (!gameRunning || countdownActive) return;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' && players[0]?.alive) {
      if (online.active) onlinePlaceBomb(players[0]);
      else placeBomb(players[0]);
    }
  }
  function onKeyUp(e) { keys.delete(e.code); }

  function readLocalInput() {
    if (!gameRunning || countdownActive) { if (players[0]) { players[0].dx = 0; players[0].dy = 0; } return; }
    const p = players[0];
    if (!p?.alive) return;
    p.dx = keys.has('ArrowRight') ? 1 : keys.has('ArrowLeft') ? -1 : 0;
    p.dy = keys.has('ArrowDown')  ? 1 : keys.has('ArrowUp')   ? -1 : 0;
  }

  // ─── Movement & collision ────────────────────────────────────────────────────
  function movePlayer(p, dt) {
    if (!p.alive) return;
    if (p.invincible > 0) p.invincible--;
    const speed = p.speed * (cellSize / 36);
    const margin = cellSize * 0.28;

    function blocked(x, y) {
      return [[x-margin,y-margin],[x+margin,y-margin],[x-margin,y+margin],[x+margin,y+margin]]
        .some(([cx, cy]) => {
          const c = Math.floor(cx / cellSize), r = Math.floor(cy / cellSize);
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
          const t = grid[r][c];
          return t === TILE.WALL || t === TILE.BLOCK || t === TILE.BOMB;
        });
    }

    const nx = p.x + p.dx * speed, ny = p.y + p.dy * speed;
    if (!blocked(nx, p.y)) p.x = nx;
    else if (!blocked(p.x, ny)) p.y = ny;

    const pr = Math.round((p.y - cellSize/2) / cellSize), pc = Math.round((p.x - cellSize/2) / cellSize);
    const pui = powerups.findIndex(pu => pu.r === pr && pu.c === pc);
    if (pui !== -1) {
      const pu = powerups.splice(pui, 1)[0];
      if (pu.type === 'bomb')  p.bombMax    = Math.min(p.bombMax + 1, 5);
      if (pu.type === 'flame') p.flameRange = Math.min(p.flameRange + 1, 6);
      if (pu.type === 'speed') p.speed      = Math.min(p.speed + 0.5, 5);
    }

    if (p.invincible <= 0) {
      const fr = Math.floor(p.y / cellSize), fc = Math.floor(p.x / cellSize);
      if (fr >= 0 && fr < ROWS && fc >= 0 && fc < COLS && grid[fr][fc] === TILE.FLAME) killPlayer(p);
    }
  }

  // ─── Online Firebase ─────────────────────────────────────────────────────────
  function onlineCleanup() {
    online.unsubs.forEach(u => typeof u === 'function' && u());
    online.unsubs = [];
    if (online.tickInterval) { clearInterval(online.tickInterval); online.tickInterval = null; }
  }

  function onlineStartTick() {
    online.tickInterval = setInterval(() => {
      if (!online.active || !window._firebaseReady) return;
      const p = players[online.myIdx];
      if (!p) return;
      const myRole = online.isHost ? 'host' : 'guest';
      set(ref(db, `bomberman/${online.gameCode}/${myRole}`), {
        x: p.x, y: p.y, dx: p.dx, dy: p.dy, alive: p.alive, t: Date.now(),
      }).catch(() => {});
    }, TICK_MS);
  }

  function onlineListenOpponent() {
    const oppRole = online.isHost ? 'guest' : 'host';
    const oppIdx  = online.isHost ? 1 : 0;
    const unsub = onValue(ref(db, `bomberman/${online.gameCode}/${oppRole}`), snap => {
      if (!snap.exists()) return;
      const d = snap.val();
      const opp = players[oppIdx];
      if (!opp) return;
      if (d.alive === false && opp.alive) killPlayer(opp);
      if (typeof d.x === 'number') {
        opp.x += (d.x - opp.x) * 0.4;
        opp.y += (d.y - opp.y) * 0.4;
        opp.dx = d.dx || 0;
        opp.dy = d.dy || 0;
      }
    });
    online.unsubs.push(unsub);
  }

  function onlineListenBombs() {
    const oppRole = online.isHost ? 'guest' : 'host';
    const oppIdx  = online.isHost ? 1 : 0;
    const unsub = onValue(ref(db, `bomberman/${online.gameCode}/bombs_${oppRole}`), snap => {
      if (!snap.exists()) return;
      Object.values(snap.val() || {}).forEach(b => {
        if (!bombs.find(ex => ex.r === b.r && ex.c === b.c)) {
          if (b.r >= 0 && b.r < ROWS && b.c >= 0 && b.c < COLS && grid[b.r][b.c] === TILE.EMPTY) {
            players[oppIdx].bombCount++;
            grid[b.r][b.c] = TILE.BOMB;
            bombs.push({ r: b.r, c: b.c, timer: 180, range: b.range || 2, owner: oppIdx });
          }
        }
      });
    });
    online.unsubs.push(unsub);
  }

  function onlinePlaceBomb(p) {
    placeBomb(p);
    if (!window._firebaseReady) return;
    const myRole = online.isHost ? 'host' : 'guest';
    const r = Math.round((p.y - cellSize/2) / cellSize);
    const c = Math.round((p.x - cellSize/2) / cellSize);
    set(ref(db, `bomberman/${online.gameCode}/bombs_${myRole}/${r}_${c}_${Date.now()}`),
      { r, c, range: p.flameRange, t: Date.now() }).catch(() => {});
  }

  function onlineListenAbandoned() {
    const unsub = onValue(ref(db, `bomberman/${online.gameCode}/abandoned`), snap => {
      if (snap.exists() && snap.val() === true && !window._iAmLeaving) {
        onlineCleanup();
        gameRunning = false;
        const ov = document.getElementById('bomb-overlay');
        document.getElementById('bomb-ov-title').textContent = 'OPPONENT LEFT';
        document.getElementById('bomb-ov-title').style.color = '#ff2d78';
        document.getElementById('bomb-ov-sub').textContent = 'Your opponent disconnected.';
        document.getElementById('bomb-ov-btns').innerHTML =
          `<button class="arcade-back-btn" onclick="window.BOMB?.destroy();backToGameSelect()">🕹 ARCADE</button>`;
        ov.classList.add('active');
      }
    });
    online.unsubs.push(unsub);
  }

  // Called by index.html confirmLeave for 'bomberman'
  window.BOMB_leaveOnline = function() {
    if (online.active && online.gameCode && window._firebaseReady) {
      window._iAmLeaving = true;
      set(ref(db, `bomberman/${online.gameCode}/abandoned`), true).catch(() => {});
      setTimeout(() => {
        try { remove(ref(db, `bomberman/${online.gameCode}`)); } catch(e) {}
        window._iAmLeaving = false;
      }, 3000);
    }
    onlineCleanup();
    online.active = false;
    gameRunning = false;
  };

  // ─── Round management ────────────────────────────────────────────────────────
  function startRound(seed) {
    const s = seed || Math.floor(Math.random() * 99999);
    grid = makeGrid(s);
    bombs = []; flames = []; powerups = [];

    players = [
      makePlayer(0, 1, 1),
      makePlayer(1, 1, COLS - 2),
    ];
    players[0].x = 1 * cellSize + cellSize / 2;
    players[0].y = 1 * cellSize + cellSize / 2;
    players[1].x = (COLS - 2) * cellSize + cellSize / 2;
    players[1].y = 1 * cellSize + cellSize / 2;

    if (gameMode === 'solo') players[1].isAI = true;

    gameRunning = true;
    startCountdown();
  }

  function startCountdown() {
    countdownActive = true;
    const el = document.getElementById('bomb-countdown');
    if (!el) return;
    el.style.display = 'flex';
    let n = 3;
    const tick = () => {
      el.innerHTML = `<span class="bomb-cd-num">${n > 0 ? n : '<span style="color:#39ff14">GO!</span>'}</span>`;
      if (n <= 0) { setTimeout(() => { el.style.display = 'none'; countdownActive = false; }, 700); return; }
      n--;
      setTimeout(tick, 900);
    };
    tick();
  }

  function checkRoundEnd() {
    const alive = players.filter(p => p.alive);
    if (alive.length > 1) return;
    gameRunning = false;
    const winner = alive[0];
    if (winner) { wins[winner.id]++; updateHUD(); showRoundResult(`P${winner.id+1} WINS!`, winner.color); }
    else showRoundResult('DRAW!', '#aaa');
    const topWins = Math.max(...wins);
    if (topWins >= 3) {
      setTimeout(() => endGame(wins.indexOf(topWins)), 2200);
    } else {
      const seed = Math.floor(Math.random() * 99999);
      setTimeout(() => startRound(seed), 2500);
    }
  }

  function showRoundResult(text, color) {
    document.getElementById('bomb-ov-title').textContent = text;
    document.getElementById('bomb-ov-title').style.color = color;
    document.getElementById('bomb-ov-title').style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
    document.getElementById('bomb-ov-sub').textContent = 'Next round starting...';
    document.getElementById('bomb-ov-btns').innerHTML = '';
    document.getElementById('bomb-overlay').classList.add('active');
    setTimeout(() => document.getElementById('bomb-overlay').classList.remove('active'), 2400);
  }

  function endGame(champIdx) {
    gameRunning = false;
    onlineCleanup();
    const color = P_COLORS[champIdx];
    document.getElementById('bomb-ov-title').textContent = `P${champIdx+1} CHAMPION!`;
    document.getElementById('bomb-ov-title').style.color = color;
    document.getElementById('bomb-ov-title').style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
    document.getElementById('bomb-ov-sub').textContent = `${wins[champIdx]} rounds won`;
    document.getElementById('bomb-ov-btns').innerHTML = `
      <button class="bomb-mode-btn" onclick="window.BOMB?.newGame()">🔁 PLAY AGAIN</button>
      <button class="arcade-back-btn" onclick="window.BOMB?.destroy();backToGameSelect()">🕹 ARCADE</button>`;
    document.getElementById('bomb-overlay').classList.add('active');
    const myIdx = online.active ? online.myIdx : 0;
    if (champIdx === myIdx) window.HS?.promptSubmit('bomberman', wins[champIdx], `${wins[champIdx]} wins`);
  }

  function updateHUD() {
    const e1 = document.getElementById('bomb-p1-wins'), e2 = document.getElementById('bomb-p2-wins');
    if (e1) e1.textContent = wins[0] || 0;
    if (e2) e2.textContent = wins[1] || 0;
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  const PU_ICONS = { bomb: '💣', flame: '🔥', speed: '⚡' };

  function draw() {
    if (!canvas || !ctx) return;
    const cs = cellSize;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#050c1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c*cs, y = r*cs, t = grid[r][c];
        if (t === TILE.WALL) {
          ctx.fillStyle = '#0d2137'; ctx.fillRect(x, y, cs, cs);
          ctx.fillStyle = '#0a1830'; ctx.fillRect(x+1, y+1, cs-2, cs-2);
          ctx.strokeStyle = 'rgba(0,245,255,0.06)'; ctx.lineWidth = 0.5;
          ctx.strokeRect(x+2, y+2, cs-4, cs-4);
        } else if (t === TILE.BLOCK) {
          ctx.fillStyle = '#1a3a5c'; ctx.fillRect(x, y, cs, cs);
          ctx.fillStyle = '#162e4a'; ctx.fillRect(x+2, y+2, cs-4, cs-4);
          ctx.strokeStyle = 'rgba(0,200,255,0.15)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x+5, y+5); ctx.lineTo(x+cs-8, y+cs-10);
          ctx.moveTo(x+cs-10, y+6); ctx.lineTo(x+7, y+cs-8); ctx.stroke();
        } else if (t === TILE.FLAME) {
          ctx.fillStyle = 'rgba(255,100,0,0.3)'; ctx.fillRect(x, y, cs, cs);
          const g = ctx.createRadialGradient(x+cs/2, y+cs/2, 0, x+cs/2, y+cs/2, cs/2);
          g.addColorStop(0, 'rgba(255,255,100,0.9)');
          g.addColorStop(0.5, 'rgba(255,80,0,0.7)');
          g.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(x, y, cs, cs);
        } else {
          ctx.fillStyle = 'rgba(0,30,60,0.4)'; ctx.fillRect(x, y, cs, cs);
          ctx.strokeStyle = 'rgba(0,80,120,0.2)'; ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cs, cs);
        }
      }
    }

    ctx.font = `${Math.floor(cs*0.55)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const pu of powerups) ctx.fillText(PU_ICONS[pu.type], pu.c*cs+cs/2, pu.r*cs+cs/2);

    for (const bomb of bombs) {
      const x = bomb.c*cs+cs/2, y = bomb.r*cs+cs/2;
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 120);
      ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
      ctx.beginPath(); ctx.arc(0, 0, cs*0.35, 0, Math.PI*2);
      ctx.fillStyle = '#111'; ctx.fill();
      ctx.strokeStyle = P_COLORS[bomb.owner]; ctx.lineWidth = 1.5; ctx.stroke();
      const pct = bomb.timer / 180;
      ctx.fillStyle = pct > 0.4 ? '#ffbe00' : '#ff3300';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(cs*0.15, -cs*0.25, cs*0.07, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    for (const p of players) {
      if (!p.alive) continue;
      if (p.invincible > 0 && Math.floor(p.invincible/5) % 2 === 0) continue;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(p.x, p.y+cs*0.36, cs*0.28, cs*0.1, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, cs*0.34, 0, Math.PI*2);
      const grad = ctx.createRadialGradient(p.x-cs*0.1, p.y-cs*0.1, 0, p.x, p.y, cs*0.34);
      grad.addColorStop(0, p.color); grad.addColorStop(1, p.dark);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
      ctx.shadowColor = p.color; ctx.shadowBlur = 10; ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.floor(cs*0.3)}px Orbitron,monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.id + 1, p.x, p.y + 1);
      ctx.restore();
    }
  }

  // ─── Game loop ───────────────────────────────────────────────────────────────
  let lastTime = 0;
  function loop(ts) {
    animId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTime) / 16.67, 3);
    lastTime = ts;
    readLocalInput();
    if (gameRunning && !countdownActive) {
      for (const p of players) { if (p.isAI) tickAI(p, dt); movePlayer(p, dt); }
      for (let i = bombs.length-1; i >= 0; i--) {
        bombs[i].timer -= dt;
        if (bombs[i].timer <= 0) { const b = bombs.splice(i, 1)[0]; explodeBomb(b); }
      }
      for (let i = flames.length-1; i >= 0; i--) {
        flames[i].timer -= dt;
        if (flames[i].timer <= 0) { const f = flames.splice(i, 1)[0]; if (grid[f.r][f.c] === TILE.FLAME) grid[f.r][f.c] = TILE.EMPTY; }
      }
      checkRoundEnd();
    }
    draw();
  }

  // ─── Resize ──────────────────────────────────────────────────────────────────
  let _resizeObs = null;
  function resize() {
    const wrap = document.getElementById('bomb-canvas-wrap');
    if (!wrap || !canvas) return;
    cellSize = Math.max(Math.floor(Math.min(wrap.clientWidth / COLS, wrap.clientHeight / ROWS)), 16);
    canvas.width  = cellSize * COLS;
    canvas.height = cellSize * ROWS;
  }

  // ─── Mobile controls ─────────────────────────────────────────────────────────
  function setupMobileControls() {
    const map = { 'bomb-d-up':[-1,0], 'bomb-d-down':[1,0], 'bomb-d-left':[0,-1], 'bomb-d-right':[0,1] };
    Object.entries(map).forEach(([id, [dy, dx]]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); if (players[0]) { players[0].dx = dx; players[0].dy = dy; } }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); if (players[0]) { players[0].dx = 0;  players[0].dy = 0;  } }, { passive: false });
    });
    const bb = document.getElementById('bomb-d-bomb');
    if (bb) {
      bb.addEventListener('touchstart', e => { e.preventDefault(); dropBombLocal(); }, { passive: false });
      bb.addEventListener('click', dropBombLocal);
    }
  }

  function dropBombLocal() {
    if (!players[0]?.alive) return;
    if (online.active) onlinePlaceBomb(players[0]);
    else placeBomb(players[0]);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  function showMenu() {
    gameRunning = false;
    online.active = false;
    document.getElementById('bomb-ov-title').textContent = '💣 BOMBERMAN';
    document.getElementById('bomb-ov-title').style.color = '#ff2d78';
    document.getElementById('bomb-ov-title').style.textShadow = '0 0 20px #ff2d78, 0 0 40px #ff2d78';
    document.getElementById('bomb-ov-sub').textContent = 'FIRST TO 3 ROUNDS WINS';
    document.getElementById('bomb-ov-btns').innerHTML = `
      <button class="bomb-mode-btn" onclick="window.BOMB?.startSolo()">🤖 VS AI</button>
      <button class="bomb-mode-btn" style="border-color:#ff2d78;color:#ff2d78" onclick="openMultiLobby('bomberman')">🌐 PLAY ONLINE</button>
      <button class="arcade-back-btn" onclick="window.BOMB?.destroy();backToGameSelect()">🕹 ARCADE</button>`;
    document.getElementById('bomb-overlay').classList.add('active');
    const hint = document.getElementById('bomb-keys-hint');
    if (hint) hint.textContent = '↑↓←→ MOVE  ·  SPACE = BOMB';
  }

  // Called by openMultiLobby/slLaunchGame when online match is ready
  function initOnline({ gameCode, isHost, myName, oppName }) {
    gameMode = 'online';
    wins = [0, 0];
    document.getElementById('bomb-overlay').classList.remove('active');
    updateHUD();
    // Update name labels
    const p1l = document.getElementById('bomb-p1-label'), p2l = document.getElementById('bomb-p2-label');
    if (p1l) p1l.textContent = isHost ? myName : oppName;
    if (p2l) p2l.textContent = isHost ? oppName : myName;
    online.active = true;
    online.isHost = isHost;
    online.myIdx  = isHost ? 0 : 1;
    online.gameCode = gameCode;
    online.myName   = myName;
    online.oppName  = oppName;
    online.unsubs   = [];
    startRound();
    onlineStartTick();
    onlineListenOpponent();
    onlineListenBombs();
    onlineListenAbandoned();
  }

  function startSolo() {
    gameMode = 'solo';
    wins = [0, 0];
    online.active = false;
    document.getElementById('bomb-overlay').classList.remove('active');
    updateHUD();
    const p1l = document.getElementById('bomb-p1-label'), p2l = document.getElementById('bomb-p2-label');
    if (p1l) p1l.textContent = 'P1';
    if (p2l) p2l.textContent = 'AI';
    startRound();
  }

  function newGame() {
    onlineCleanup();
    online.active = false;
    wins = [0, 0];
    document.getElementById('bomb-overlay').classList.remove('active');
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
    wins = [0, 0]; bombs = []; flames = []; players = []; powerups = [];
    grid = makeGrid();
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
    showMenu();
  }

  function destroy() {
    gameRunning = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    onlineCleanup();
    online.active = false;
    document.getElementById('bomb-overlay')?.classList.remove('active');
    document.getElementById('bomb-countdown')?.style &&
      (document.getElementById('bomb-countdown').style.display = 'none');
  }

  return { init, destroy, startSolo, initOnline, newGame };
})();
