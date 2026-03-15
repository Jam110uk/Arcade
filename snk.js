// SNK game module
// Auto-extracted from monolithic index.html

export default (() => {
  const COLS = 20, ROWS = 20;
  const COLORS = {
    bg:      '#020510',
    grid:    'rgba(0,60,120,0.2)',
    head:    '#39ff14',
    body:    '#22c55e',
    tail:    '#0d7a30',
    food:    '#ff2d78',
    foodGlow:'rgba(255,45,120,0.8)',
    wall:    '#0a1828',
    text:    '#c8e8ff',
  };

  let canvas, ctx, CW, CH, cellW, cellH;
  let snake, dir, nextDir, food, score, best, level, running, paused, gameOver;
  let frameId, lastTime, speed;
  let foodPulse = 0;
  let elSnkBest, elSnkScore, elSnkLength, elSnkLevel;  // cached DOM refs
  // In-canvas particles + death flash
  let snkParticles = [];
  let snkDeathFlash = 0;

  function snkSpawnParticles(x, y, color, count, spd, life) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.5 + Math.random() * 0.8);
      snkParticles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - spd*0.4,
        color, life, maxLife: life, r: 1.5 + Math.random()*2.5 });
    }
  }
  function snkUpdateParticles() {
    for (let _i = snkParticles.length - 1; _i >= 0; _i--) {
      if (snkParticles[_i].life <= 0) {
        snkParticles[_i] = snkParticles[snkParticles.length - 1];
        snkParticles.pop();
      }
    }
    snkParticles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.25; p.vx*=0.92; p.life-=16; });
  }
  function snkDrawParticles() {
    snkParticles.forEach(p => {
      const t = Math.max(0, p.life / 255);
      const r = p.r * t;
      ctx.save();
      // Gradient halo instead of shadowBlur
      const grad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.max(0.01,r * 2.5));
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = t * 0.4;
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y,Math.max(0,r * 2.5), 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = t * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y,Math.max(0,r), 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });
  }

  const SPEED_BASE = 180; // ms per tick at level 1
  const SPEED_MIN  = 70;

  function init() {
    canvas = document.getElementById('snk-canvas');
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('keydown', onKey);

    best = parseInt(localStorage.getItem('snk-best') || '0');
    elSnkBest   = document.getElementById('snk-best');
    elSnkScore  = document.getElementById('snk-score');
    elSnkLength = document.getElementById('snk-length');
    elSnkLevel  = document.getElementById('snk-level');
    if (elSnkBest) elSnkBest.textContent = best;

    showOverlay('start', 'SNAKE', '', 'Arrow keys or WASD — eat ? to grow — P to pause');
  }

  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    canvas.width  = W;
    canvas.height = H;
    CW = W; CH = H;
    cellW = Math.floor(W / COLS);
    cellH = Math.floor(H / ROWS);
    if (running && !paused) draw();
  }

  function newGame() {
    hideOverlay();
    const mid = Math.floor(COLS / 2);
    const midR = Math.floor(ROWS / 2);
    snake = [
      {x: mid,   y: midR},
      {x: mid-1, y: midR},
      {x: mid-2, y: midR},
    ];
    dir      = {x: 1, y: 0};
    nextDir  = {x: 1, y: 0};
    score    = 0;
    level    = 1;
    running  = true;
    paused   = false;
    gameOver = false;
    speed    = SPEED_BASE;
    food     = spawnFood();
    updateUI();
    cancelAnimationFrame(frameId);
    lastTime = null;
    frameId  = requestAnimationFrame(loop);
  }

  function spawnFood() {
    const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
    let f;
    do {
      f = {x: Math.floor(Math.random()*COLS), y: Math.floor(Math.random()*ROWS)};
    } while (occupied.has(`${f.x},${f.y}`));
    return f;
  }

  function loop(ts) {
    if (!running) return;
    if (paused) { frameId = requestAnimationFrame(loop); return; }
    if (!lastTime) lastTime = ts;
    const dt = ts - lastTime;

    foodPulse = (foodPulse + 0.06) % (Math.PI * 2);

    if (dt >= speed) {
      lastTime = ts;
      tick();
    }
    draw();
    frameId = requestAnimationFrame(loop);
  }

  function tick() {
    dir = nextDir;
    const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};

    // Wall collision
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      return end();
    }
    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      return end();
    }

    snake.unshift(head);

    // Eat food
    if (head.x === food.x && head.y === food.y) {
      score += level * 10;
      if (score > best) { best = score; localStorage.setItem('snk-best', best); }
      level = Math.floor(snake.length / 5) + 1;
      speed = Math.max(SPEED_MIN, SPEED_BASE - (level - 1) * 15);
      // Food eat particles
      const fx2 = food.x * cellW + cellW/2, fy2 = food.y * cellH + cellH/2;
      snkSpawnParticles(fx2, fy2, '#ff2d78', 14, cellW*0.35, 600);
      snkSpawnParticles(fx2, fy2, '#ffe600', 8,  cellW*0.25, 400);
      food  = spawnFood();
      updateUI();
    } else {
      snake.pop();
    }
  }

  function end() {
    running  = false;
    gameOver = true;
    snkDeathFlash = 1.0;
    // Death explosion — every segment bursts
    snake.forEach((seg, i) => {
      if (i % 2 !== 0) return;
      const sx = seg.x * cellW + cellW/2, sy = seg.y * cellH + cellH/2;
      snkSpawnParticles(sx, sy, '#ff2d78', 6, cellW*0.4, 700);
    });
    if (score > best) { best = score; localStorage.setItem('snk-best', best); }
    if (elSnkBest) elSnkBest.textContent = best;
    showOverlay('over', 'GAME OVER', `SCORE: ${score}`, `Length: ${snake.length} — Level: ${level}`);
    if (score > 0) setTimeout(() => HS.promptSubmit('snake', score, score.toLocaleString()), 300);
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, CW, CH);

    // Background — deep void with subtle gradient
    const bgGrad = ctx.createLinearGradient(0,0,CW,CH);
    bgGrad.addColorStop(0,'#010610'); bgGrad.addColorStop(1,'#020c18');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, CW, CH);

    // Death flash overlay
    if (snkDeathFlash > 0) {
      ctx.save(); ctx.globalAlpha = snkDeathFlash * 0.55;
      ctx.fillStyle = '#ff2d78'; ctx.fillRect(0,0,CW,CH);
      ctx.restore();
      snkDeathFlash *= 0.82;
    }

    // Grid — hex glow dots at intersections
    ctx.strokeStyle = 'rgba(0,80,140,0.18)'; ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x*cellW,0); ctx.lineTo(x*cellW,CH); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0,y*cellH); ctx.lineTo(CW,y*cellH); ctx.stroke(); }

    // Scanlines
    ctx.save(); ctx.globalAlpha = 0.04;
    for (let y=0; y<CH; y+=4) { ctx.fillStyle='#000'; ctx.fillRect(0,y,CW,2); }
    ctx.restore();

    // Food — pulsing ring + core
    const pulse = 0.5 + 0.5 * Math.sin(foodPulse);
    const fCX = food.x * cellW + cellW/2, fCY = food.y * cellH + cellH/2;
    const fR  = cellW * 0.33 + pulse * cellW * 0.05;
    // Outer glow ring
    ctx.save();
    ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 10 + pulse * 5;
    const ringGrad = ctx.createRadialGradient(fCX,fCY,Math.max(0.01,fR*0.4),fCX,fCY,Math.max(0.01,fR));
    ringGrad.addColorStop(0,'#ff2d78'); ringGrad.addColorStop(1,'rgba(255,45,120,0)');
    ctx.fillStyle = ringGrad;
    ctx.beginPath(); ctx.arc(fCX, fCY,Math.max(0,fR*1.6), 0, Math.PI*2); ctx.fill();
    // Core circle
    ctx.beginPath(); ctx.arc(fCX, fCY,Math.max(0,fR), 0, Math.PI*2);
    ctx.fillStyle = '#ff2d78'; ctx.fill();
    // Specular
    ctx.fillStyle = 'rgba(255,200,220,0.7)';
    ctx.beginPath(); ctx.arc(fCX - fR*0.28, fCY - fR*0.28,Math.max(0,fR*0.22), 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Snake
    const len = snake.length;
    snake.forEach((seg, i) => {
      const t = i / Math.max(len,1);
      const sx = seg.x * cellW + 1.5, sy = seg.y * cellH + 1.5;
      const sw = cellW - 3, sh = cellH - 3;
      ctx.save();
      if (i === 0) {
        ctx.shadowColor = '#39ff14'; ctx.shadowBlur = 10;
        const hg = ctx.createLinearGradient(sx,sy,sx+sw,sy+sh);
        hg.addColorStop(0,'#7fff4f'); hg.addColorStop(1,'#39ff14');
        ctx.fillStyle = hg;
      } else {
        const green = Math.round(220 - t*160);
        const blue  = Math.round(15  + t*15);
        ctx.shadowColor = `rgb(0,${green},${blue})`; ctx.shadowBlur = Math.max(0, 10-t*10);
        ctx.fillStyle   = `rgb(0,${green},${blue})`;
      }
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(sx,sy,sw,sh, i===0 ? 4 : 2);
      else ctx.rect(sx,sy,sw,sh);
      ctx.fill();
      // Highlight shine on each segment
      ctx.globalAlpha = 0.35 - t*0.3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx+2, sy+2, sw-4, 2);
      ctx.restore();
      // Head eyes
      if (i === 0) {
        ctx.shadowBlur = 0; ctx.fillStyle = '#001a00';
        const eyeR = Math.max(1.2, cellW*0.1);
        let ex1,ey1,ex2,ey2;
        if      (dir.x === 1)  { ex1=seg.x*cellW+cellW*0.7; ey1=seg.y*cellH+cellH*0.28; ex2=ex1; ey2=seg.y*cellH+cellH*0.72; }
        else if (dir.x ===-1) { ex1=seg.x*cellW+cellW*0.3; ey1=seg.y*cellH+cellH*0.28; ex2=ex1; ey2=seg.y*cellH+cellH*0.72; }
        else if (dir.y === 1) { ex1=seg.x*cellW+cellW*0.28; ey1=seg.y*cellH+cellH*0.7; ex2=seg.x*cellW+cellW*0.72; ey2=ey1; }
        else                  { ex1=seg.x*cellW+cellW*0.28; ey1=seg.y*cellH+cellH*0.3; ex2=seg.x*cellW+cellW*0.72; ey2=ey1; }
        ctx.beginPath(); ctx.arc(ex1,ey1,Math.max(0,eyeR),0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2,ey2,Math.max(0,eyeR),0,Math.PI*2); ctx.fill();
        // Pupil glint
        ctx.fillStyle='rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(ex1-eyeR*0.3,ey1-eyeR*0.3,Math.max(0,eyeR*0.35),0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2-eyeR*0.3,ey2-eyeR*0.3,Math.max(0,eyeR*0.35),0,Math.PI*2); ctx.fill();
      }
    });
    ctx.shadowBlur = 0;

    // In-canvas particles
    snkUpdateParticles();
    snkDrawParticles();
  }

  function updateUI() {
    if (elSnkScore)  elSnkScore.textContent  = score;
    if (elSnkBest)   elSnkBest.textContent   = best;
    if (elSnkLength) elSnkLength.textContent = snake.length;
    if (elSnkLevel)  elSnkLevel.textContent  = level;
  }

  function onKey(e) {
    const screen = document.getElementById('snake-screen');
    if (!screen || !screen.classList.contains('active')) return;
    switch(e.key) {
      case 'ArrowUp':    case 'w': case 'W': setDir(0, -1); e.preventDefault(); break;
      case 'ArrowDown':  case 's': case 'S': setDir(0,  1); e.preventDefault(); break;
      case 'ArrowLeft':  case 'a': case 'A': setDir(-1, 0); e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': setDir(1,  0); e.preventDefault(); break;
      case 'p': case 'P': togglePause(); break;
      case ' ': if (!running && !gameOver) newGame(); break;
    }
  }

  function setDir(dx, dy) {
    if (!running || paused) return;
    // Prevent reversing
    if (dx === -dir.x && dy === -dir.y) return;
    if (dx !== 0 || dy !== 0) nextDir = {x: dx, y: dy};
  }

  function togglePause() {
    if (!running && !gameOver) return;
    paused = !paused;
    const btn = document.getElementById('snk-pause-btn');
    if (paused) {
      if (btn) btn.textContent = '▶ RESUME';
      showOverlay('pause', 'PAUSED', '', 'Press P or click RESUME to continue');
    } else {
      if (btn) btn.textContent = '⏸ PAUSE';
      hideOverlay();
      lastTime = null;
      frameId  = requestAnimationFrame(loop);
    }
  }

  function showOverlay(type, title, score, msg) {
    const ov = document.getElementById('snk-overlay');
    if (!ov) return;
    ov.classList.add('active');
    const t = document.getElementById('snk-ov-title');
    t.textContent = title; t.className = 'snk-ov-title ' + type;
    document.getElementById('snk-ov-score').textContent = score || '';
    document.getElementById('snk-ov-msg').textContent   = msg   || '';
    const btns = document.getElementById('snk-overlay').querySelector('.snk-ov-btns');
    if (type === 'start') {
      btns.innerHTML = `<button class="snk-btn" onclick="snkStart()">▶ START</button><button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    } else if (type === 'over') {
      btns.innerHTML = `<button class="snk-btn" onclick="snkNewGame()">🔄 PLAY AGAIN</button><button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    } else if (type === 'pause') {
      btns.innerHTML = `<button class="snk-btn" onclick="snkTogglePause()">▶ RESUME</button><button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    }
  }

  function hideOverlay() {
    const ov = document.getElementById('snk-overlay');
    if (ov) ov.classList.remove('active');
  }

  function destroy() {
    running = false;
    paused  = false;
    cancelAnimationFrame(frameId);
    window.removeEventListener('resize', resize);
  }

  return { init, newGame, togglePause, setDir, destroy };
})();
