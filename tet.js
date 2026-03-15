// TET game module
// Auto-extracted from monolithic index.html

export default (function() {
  const COLS = 10, ROWS = 20;
  const CELL = 28; // internal px per cell

  // Tetromino definitions [shape][rotation] as flat arrays of [col,row] offsets
  const PIECES = [
    // I
    { color:'#00f5ff', glow:'rgba(0,245,255,0.8)',
      rots:[[[0,1],[1,1],[2,1],[3,1]],[[2,0],[2,1],[2,2],[2,3]],[[0,2],[1,2],[2,2],[3,2]],[[1,0],[1,1],[1,2],[1,3]]] },
    // O
    { color:'#ffe600', glow:'rgba(255,230,0,0.8)',
      rots:[[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]]] },
    // T
    { color:'#bf00ff', glow:'rgba(191,0,255,0.8)',
      rots:[[[1,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[2,1],[1,2]],[[1,0],[0,1],[1,1],[1,2]]] },
    // S
    { color:'#39ff14', glow:'rgba(57,255,20,0.8)',
      rots:[[[1,0],[2,0],[0,1],[1,1]],[[1,0],[1,1],[2,1],[2,2]],[[1,0],[2,0],[0,1],[1,1]],[[1,0],[1,1],[2,1],[2,2]]] },
    // Z
    { color:'#ff2d78', glow:'rgba(255,45,120,0.8)',
      rots:[[[0,0],[1,0],[1,1],[2,1]],[[2,0],[1,1],[2,1],[1,2]],[[0,0],[1,0],[1,1],[2,1]],[[2,0],[1,1],[2,1],[1,2]]] },
    // J
    { color:'#4169ff', glow:'rgba(65,105,255,0.8)',
      rots:[[[0,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[0,2],[1,2]]] },
    // L
    { color:'#ff6a00', glow:'rgba(255,106,0,0.8)',
      rots:[[[2,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,1],[0,2]],[[0,0],[1,0],[1,1],[1,2]]] },
  ];

  let board, canvas, ctx, nextCanvas, nextCtx;
  let piece, nextPiece, score, best, level, lines;
  let dropTimer, dropInterval;
  let running, paused, raf;
  let lastTime = 0, dropAcc = 0;
  let _lockTimer = null, _lockDelay = false;  // lock delay state
  // Cached DOM refs
  let elTetScore, elTetBest, elTetLevel, elTetLines, elTetOverlay;

  // Touch support
  let touchStartX, touchStartY;

  function init() {
    canvas     = document.getElementById('tet-canvas');
    ctx        = canvas.getContext('2d');
    nextCanvas = document.getElementById('tet-next');
    nextCtx    = nextCanvas.getContext('2d');
    elTetScore   = document.getElementById('tet-score');
    elTetBest    = document.getElementById('tet-best');
    elTetLevel   = document.getElementById('tet-level');
    elTetLines   = document.getElementById('tet-lines');
    elTetOverlay = document.getElementById('tet-overlay');
    canvas.width  = COLS * CELL;
    canvas.height = ROWS * CELL;
    best = 0;
    running = false; paused = false;
    document.addEventListener('keydown', onKey);
    canvas.addEventListener('touchstart', onTouchStart, {passive:true});
    canvas.addEventListener('touchend',   onTouchEnd,   {passive:true});
    showStartOverlay();
  }

  function destroy() {
    running = false; paused = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    document.removeEventListener('keydown', onKey);
    hideOverlay();
  }

  function showStartOverlay() {
    showOverlay('start', 'TETRIS', null, 'Arrow keys to move — ?/Z rotate — Space hard drop — P pause', [
      {label:'▶ START',  fn:'tetStart()'},
      {label:'🕹 ARCADE', fn:'backToGameSelect()'},
    ]);
  }

  // ?? Game state ??????????????????????????????????????????????
  function start() {
    board    = Array.from({length: ROWS}, () => new Array(COLS).fill(null));
    score    = 0; level = 1; lines = 0;
    running  = true; paused = false;
    _pieceBag = [];
    _lockTimer = null; _lockDelay = false;
    dropAcc  = 0; lastTime = 0;  // 0 = sentinel: will be set on first frame
    dropInterval = levelInterval(level);
    piece    = spawnPiece();
    nextPiece = randomPiece();
    hideOverlay();
    updateUI();
    document.getElementById('tet-pause-btn').textContent = '⏸ PAUSE';
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function levelInterval(lv) {
    // ms per drop — gets faster each level, min 80ms
    return Math.max(80, 700 - (lv - 1) * 55);
  }

  let _pieceBag = [];
  function randomPiece() {
    if (_pieceBag.length === 0) {
      _pieceBag = [0,1,2,3,4,5,6];
      for (let i = _pieceBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [_pieceBag[i], _pieceBag[j]] = [_pieceBag[j], _pieceBag[i]];
      }
    }
    return { pidx: _pieceBag.pop(), rot: 0, x: 3, y: 0 };
  }

  function spawnPiece() {
    const p = nextPiece || randomPiece();
    nextPiece = randomPiece();
    drawNext();
    return p;
  }

  function cells(p) {
    return PIECES[p.pidx].rots[p.rot].map(([dc,dr]) => ({c: p.x+dc, r: p.y+dr}));
  }

  function valid(p) {
    return cells(p).every(({c,r}) => c>=0 && c<COLS && r<ROWS && (r<0||!board[r][c]));
  }

  // ?? Loop ????????????????????????????????????????????????????
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (paused) { draw(); return; }
    if (lastTime === 0) { lastTime = ts; draw(); return; }
    const dt = Math.min(ts - lastTime, dropInterval);
    lastTime = ts;

    // Only accumulate drop timer when not in lock delay
    if (!_lockDelay) {
      dropAcc += dt;
      while (dropAcc >= dropInterval) {
        dropAcc -= dropInterval;
        if (!moveDown()) {
          // Piece touched down — start lock delay
          _lockDelay = true;
          if (_lockTimer) clearTimeout(_lockTimer);
          _lockTimer = setTimeout(() => {
            if (!running || paused) return;
            _lockDelay = false; _lockTimer = null;
            lockPiece();
          }, 500);
          break;
        }
      }
    }
    draw();
  }

  // ?? Movement ????????????????????????????????????????????????
  function moveDown() {
    const moved = {...piece, y: piece.y + 1};
    if (valid(moved)) { piece = moved; return true; }
    return false;
  }

  function moveLeft()  {
    const t={...piece,x:piece.x-1};
    if(valid(t)) { piece=t; _resetLockDelay(); }
  }
  function moveRight() {
    const t={...piece,x:piece.x+1};
    if(valid(t)) { piece=t; _resetLockDelay(); }
  }

  function _resetLockDelay() {
    // If in lock delay and piece can still move down, reset the timer
    if (_lockDelay && valid({...piece, y: piece.y+1})) {
      _lockDelay = false;
      if (_lockTimer) { clearTimeout(_lockTimer); _lockTimer = null; }
      dropAcc = 0;
    } else if (_lockDelay) {
      // Can't move down — still touching, reset the 500ms window
      if (_lockTimer) clearTimeout(_lockTimer);
      _lockTimer = setTimeout(() => {
        if (!running || paused) return;
        _lockDelay = false; _lockTimer = null;
        lockPiece();
      }, 500);
    }
  }

  function rotate() {
    const t = {...piece, rot: (piece.rot+1)%4};
    for (const off of [0,-1,1,-2,2]) {
      const kicked = {...t, x: t.x+off};
      if (valid(kicked)) { piece = kicked; _resetLockDelay(); return; }
    }
  }

  function hardDrop() {
    if (_lockTimer) { clearTimeout(_lockTimer); _lockTimer = null; }
    _lockDelay = false;
    let dropped = 0;
    while (true) {
      const t = {...piece, y: piece.y+1};
      if (valid(t)) { piece = t; dropped++; } else break;
    }
    score += dropped * 2;
    lockPiece();
  }

  function ghostRow() {
    let g = {...piece};
    while (valid({...g, y: g.y+1})) g.y++;
    return g.y;
  }

  function lockPiece() {
    cells(piece).forEach(({c,r}) => {
      if (r < 0) { gameOver(); return; }
      board[r][c] = PIECES[piece.pidx].color;
    });
    clearLines();
    piece = spawnPiece();
    if (!valid(piece)) gameOver();
  }

  function clearLines() {
    const full = [];
    for (let r = ROWS-1; r >= 0; r--) {
      if (board[r].every(c => c !== null)) full.push(r);
    }
    if (full.length === 0) return;

    const pts = [0, 100, 300, 500, 800][full.length] * level;
    score += pts;
    if (score > best) best = score;
    lines += full.length;
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel > level) {
      level = newLevel; dropInterval = levelInterval(level);
      if (window.FX) {
        const rect = canvas.getBoundingClientRect();
        for (let i=0; i<5; i++) setTimeout(() => {
          FX.burst(rect.left + Math.random()*rect.width, rect.top + rect.height*0.5,
            {count:20, colors:['#ffe600','#ff2d78','#39ff14','#00f5ff'], speed:7, life:60, size:4, shape:'star', gravity:0.2});
        }, i*150);
        FX.screenFlash('#ffe600', 0.3);
        FX.shake(7);
      }
    }

    // Flash cleared rows white, then remove after 180ms
    full.forEach(r => {
      for (let c = 0; c < COLS; c++) if (board[r][c]) board[r][c] = '#ffffff';
    });
    draw(); // show the flash frame

    if (window.FX) {
      const rect = canvas.getBoundingClientRect();
      full.forEach(r => {
        const rowY = rect.top + (r / ROWS) * rect.height + rect.height/(ROWS*2);
        for (let ci=0; ci<5; ci++) {
          const colX = rect.left + (ci/4)*rect.width;
          const clr = full.length >= 4
            ? ['#ffe600','#ff2d78','#00f5ff','#39ff14','#bf00ff']
            : ['#00f5ff','#ffe600','#ffffff'];
          FX.burst(colX, rowY, {count:8, colors:clr, speed:5, life:45, size:3, shape:'square', gravity:0.18});
        }
      });
      if (full.length >= 4) { FX.screenFlash('#00f5ff', 0.35); FX.shake(9); }
      else if (full.length >= 2) { FX.screenFlash('#4169ff', 0.15); FX.shake(4); }
    }

    // After flash delay, remove all cleared rows at once
    setTimeout(() => {
      const fullSet = new Set(full);
      board = board.filter((_, r) => !fullSet.has(r));
      while (board.length < ROWS) board.unshift(new Array(COLS).fill(null));
      updateUI();
    }, 180);
  }

  function gameOver() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    draw();
    setTimeout(() => {
      showOverlay('over', 'GAME OVER', score, level > 1 ? `Level ${level} — ${lines} lines cleared` : 'No lines cleared', [
        {label:'🔄 RETRY',   fn:'tetStart()'},
        {label:'🕹 ARCADE',  fn:'backToGameSelect()'},
      ]);
      if (score > 0) HS.promptSubmit('tetris', score, score.toLocaleString());
    }, 400);
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    document.getElementById('tet-pause-btn').textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
    if (paused) {
      showOverlay('pause','PAUSED', null, 'Game is paused', [
        {label:'▶ RESUME', fn:'tetTogglePause()'},
        {label:'🆕 NEW',    fn:'tetStart()'},
      ]);
    } else {
      hideOverlay();
      lastTime = 0;  // reset so first resumed frame re-initialises cleanly
      dropAcc  = 0;
    }
  }

  // ?? Drawing ?????????????????????????????????????????????????
  function shadeColor(hex, amt) {
    try {
      const num = parseInt(hex.replace('#',''), 16);
      const r = Math.max(0,Math.min(255,((num>>16)&0xff)+amt));
      const g = Math.max(0,Math.min(255,((num>>8)&0xff)+amt));
      const b = Math.max(0,Math.min(255,(num&0xff)+amt));
      return 'rgb('+r+','+g+','+b+')';
    } catch(e){ return hex; }
  }
  function lightenColor(hex, amt) { return shadeColor(hex, amt); }

  let _tetBgCache = null;
  function _buildTetBg() {
    const W = COLS * CELL, H = ROWS * CELL;
    const oc = document.createElement('canvas'); oc.width=W; oc.height=H;
    const c = oc.getContext('2d');
    c.fillStyle='#010510'; c.fillRect(0,0,W,H);
    // Static radial glow (center only — no pulse in cache)
    const bg = c.createRadialGradient(W/2,H*0.4,0,W/2,H*0.5,Math.max(0.01,H*0.8));
    bg.addColorStop(0,'rgba(20,40,150,0.10)'); bg.addColorStop(1,'transparent');
    c.fillStyle=bg; c.fillRect(0,0,W,H);
    // Grid lines
    c.strokeStyle='rgba(0,80,180,0.2)'; c.lineWidth=0.5;
    c.beginPath();
    for (let r=0;r<=ROWS;r++){c.moveTo(0,r*CELL);c.lineTo(W,r*CELL);}
    for (let col=0;col<=COLS;col++){c.moveTo(col*CELL,0);c.lineTo(col*CELL,H);}
    c.stroke();
    // Scanlines baked in
    c.globalAlpha=0.05;
    for (let y=0;y<H;y+=4){c.fillStyle='#000';c.fillRect(0,y,W,2);}
    c.globalAlpha=1;
    // Side vignette
    const lvgL=c.createLinearGradient(0,0,W*0.12,0);
    lvgL.addColorStop(0,'rgba(0,0,10,0.5)'); lvgL.addColorStop(1,'transparent');
    const lvgR=c.createLinearGradient(W,0,W*0.88,0);
    lvgR.addColorStop(0,'rgba(0,0,10,0.5)'); lvgR.addColorStop(1,'transparent');
    c.fillStyle=lvgL; c.fillRect(0,0,W*0.12,H);
    c.fillStyle=lvgR; c.fillRect(W*0.88,0,W*0.12,H);
    _tetBgCache = oc;
  }

  function draw() {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;

    // Background — cached blit
    if (!_tetBgCache) _buildTetBg();
    ctx.drawImage(_tetBgCache, 0, 0);

    // Board — batch by color to minimize shadow state changes
    if (!board) return;
    // First pass: draw all fills with shadow (group by color to reduce state thrash)
    const colorGroups = {};
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
      const col = board[r][c]; if (!col) continue;
      if (!colorGroups[col]) colorGroups[col] = [];
      colorGroups[col].push({c, r});
    }
    Object.entries(colorGroups).forEach(([color, cells_]) => {
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      cells_.forEach(({c,r}) => ctx.fillRect(c*CELL+1, r*CELL+1, CELL-2, CELL-2));
      ctx.shadowBlur = 0;
      const {shade, light} = getTetColors(color);
      // Shading overlays (no shadow needed)
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      cells_.forEach(({c,r}) => {
        ctx.fillRect(c*CELL+CELL*0.5, r*CELL+1, CELL*0.5-1, CELL-2);
        ctx.fillRect(c*CELL+1, r*CELL+CELL*0.55, CELL-2, CELL*0.45-1);
      });
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      cells_.forEach(({c,r}) => {
        ctx.fillRect(c*CELL+1, r*CELL+1, CELL-2, 2);
        ctx.fillRect(c*CELL+1, r*CELL+1, 2, CELL-2);
      });
      ctx.strokeStyle = light; ctx.lineWidth = 0.5;
      cells_.forEach(({c,r}) => ctx.strokeRect(c*CELL+0.5, r*CELL+0.5, CELL-1, CELL-1));
      ctx.restore();
    });

    if (piece && running && !paused) {
      // Ghost
      const gy = ghostRow();
      cells(piece).forEach(({c,r})=>{
        const gr = gy + (r - piece.y);
        drawGhostCell(ctx, c, gr, PIECES[piece.pidx].color);
      });
      // Active piece — extra bright glow
      ctx.save();
      ctx.shadowColor = PIECES[piece.pidx].color;
      ctx.shadowBlur = 20;
      cells(piece).forEach(({c,r})=>{ if(r>=0) drawCell(ctx, c, r, PIECES[piece.pidx].color, 1); });
      ctx.restore();
    }
  }

  // Pre-shaded colors cache - avoids per-cell gradient/shadeColor allocations
  const _tetColorCache = {};
  function getTetColors(color) {
    if (_tetColorCache[color]) return _tetColorCache[color];
    _tetColorCache[color] = { shade: shadeColor(color, -40), light: lightenColor(color, 50) };
    return _tetColorCache[color];
  }

  function drawCell(ctx, c, r, color, alpha) {
    const x = c*CELL, y = r*CELL, s = CELL;
    ctx.save();
    ctx.globalAlpha = alpha;
    const { shade, light } = getTetColors(color);
    // Solid neon fill (skip gradient allocation — 7 colors, not worth per-cell GC)
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fillRect(x+1, y+1, s-2, s-2);
    ctx.shadowBlur = 0;
    // Bottom/right shadow overlay (simulates diagonal gradient cheaply)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + s*0.5, y+1, s*0.5-1, s-2);
    ctx.fillRect(x+1, y + s*0.55, s-2, s*0.45-1);
    // Top-left highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x+1, y+1, s-2, 2);
    ctx.fillRect(x+1, y+1, 2, s-2);
    // Neon border
    ctx.strokeStyle = light;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x+0.5, y+0.5, s-1, s-1);
    ctx.restore();
  }

  function drawGhostCell(ctx, c, r, color) {
    if (r < 0) return;
    const x = c*CELL, y = r*CELL, s = CELL;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x+2, y+2, s-4, s-4);
    ctx.restore();
  }

  function drawNext() {
    if (!nextCtx) return;
    nextCtx.fillStyle = '#020510';
    nextCtx.fillRect(0,0,80,80);
    if (!nextPiece) return;
    const p = PIECES[nextPiece.pidx];
    const cs = p.rots[0];
    const minC = Math.min(...cs.map(([c])=>c)), maxC = Math.max(...cs.map(([c])=>c));
    const minR = Math.min(...cs.map(([,r])=>r)), maxR = Math.max(...cs.map(([,r])=>r));
    const cellW = 16, offX = (80-(maxC-minC+1)*cellW)/2, offY = (80-(maxR-minR+1)*cellW)/2;
    cs.forEach(([dc,dr]) => {
      const x = offX+(dc-minC)*cellW, y = offY+(dr-minR)*cellW;
      nextCtx.shadowColor = p.color; nextCtx.shadowBlur = 8;
      const g = nextCtx.createLinearGradient(x,y,x+cellW,y+cellW);
      g.addColorStop(0,p.color); g.addColorStop(1,shadeColor(p.color,-40));
      nextCtx.fillStyle = g;
      nextCtx.fillRect(x+1,y+1,cellW-2,cellW-2);
      nextCtx.shadowBlur = 0;
      nextCtx.fillStyle='rgba(255,255,255,0.4)';
      nextCtx.fillRect(x+1,y+1,cellW-2,2);
    });
  }

  // ?? UI ??????????????????????????????????????????????????????
  function updateUI() {
    if(elTetScore) elTetScore.textContent = score.toLocaleString();
    if(elTetBest) elTetBest.textContent = best.toLocaleString();
    if(elTetLevel) elTetLevel.textContent = level;
    if(elTetLines) elTetLines.textContent = lines;
  }

  // ?? Overlay ?????????????????????????????????????????????????
  function showOverlay(type, title, sc, msg, btns) {
    const ov = elTetOverlay;
    ov.classList.add('active');
    const t = document.getElementById('tet-ov-title');
    t.textContent = title; t.className = 'tet-ov-title ' + type;
    document.getElementById('tet-ov-score').textContent = sc !== null && sc !== undefined ? sc.toLocaleString() + ' pts' : '';
    document.getElementById('tet-ov-msg').textContent = msg;
    const bd = document.getElementById('tet-ov-btns');
    bd.innerHTML = btns.map(b => `<button class="${b.label.includes('ARCADE') ? 'arcade-back-btn' : 'tet-btn'}" onclick="${b.fn}">${b.label}</button>`).join('');
  }

  function hideOverlay() {
    const ov = elTetOverlay;
    if (ov) ov.classList.remove('active');
  }

  // ?? Input ????????????????????????????????????????????????????
  function onKey(e) {
    if (!running) return;
    switch(e.key) {
      case 'ArrowLeft':  e.preventDefault(); moveLeft();  break;
      case 'ArrowRight': e.preventDefault(); moveRight(); break;
      case 'ArrowDown':  e.preventDefault(); if(moveDown()) { score++; updateUI(); } break;
      case 'ArrowUp': case 'z': case 'Z': e.preventDefault(); rotate(); break;
      case ' ':          e.preventDefault(); hardDrop(); break;
      case 'p': case 'P': togglePause(); break;
    }
  }

  function onTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    if (!running || paused) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 10 && ady < 10) { rotate(); return; }
    if (adx > ady) { dx > 0 ? moveRight() : moveLeft(); }
    else { dy > 0 ? hardDrop() : rotate(); }
  }

  return { init, start, destroy, togglePause };
})();
