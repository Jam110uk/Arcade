// RC game module
// Auto-extracted from monolithic index.html

export default (() => {
  // Constants
  const LANES     = 5;
  const MAX_LIVES = 3;
  const ROAD_COLOR = '#0a1628';
  const LINE_COLOR = 'rgba(255,255,255,0.18)';
  const ENEMY_COLORS = ['#f43f5e','#3b82f6','#a855f7','#22c55e','#f59e0b','#06b6d4','#ec4899'];

  // State
  let canvas, ctx, W, H, LANE_W, CAR_W, CAR_H;
  let running, paused, gameOver;
  let score, best, level, lives;
  let playerX, playerLane, playerSlide, slideTimer; // slide = drift offset when on slick
  let enemies, warnings, particles, pickups, roadOffset;
  let speed, spawnTimer, spawnInterval;
  let raf, lastTs;
  let keysHeld, touchLeft, touchRight;

  // New mechanics
  let fuel, fuelDrainRate;         // fuel gauge (0-100)
  let nitroActive, nitroTimer;     // nitro boost
  let shieldActive, shieldTimer;   // shield
  let combo, comboTimer;           // near-miss combo
  let nearMissTimer;               // cooldown after a near-miss scored
  // Cached DOM refs (set in init, avoids per-frame querySelector)
  let elRcCombo, elRcScore, elRcBest, elRcLevel, elRcLives, elRcFuelBar, elRcPowerupBar;
  let rushTimer, inRush;           // rush hour burst spawning
  let roadEvent, roadEventTimer;   // tunnel / wet road / chicane
  let wetRoad;                     // wet road drift flag
  let chicaneLanes;                // blocked lanes during chicane
  let tunnelAlpha;                 // tunnel darkness target

  // Pickup types: fuel | nitro | shield | multiplier
  const PICKUP_DEFS = [
    { type:'fuel',       color:'#22c55e', glow:'rgba(34,197,94,0.7)',   label:'⛽', weight:35 },
    { type:'nitro',      color:'#f97316', glow:'rgba(249,115,22,0.7)',  label:'🔥', weight:20 },
    { type:'shield',     color:'#00d4ff', glow:'rgba(0,212,255,0.7)',   label:'🛡', weight:20 },
    { type:'multiplier', color:'#fcd34d', glow:'rgba(252,211,77,0.7)',  label:'✦', weight:25 },
  ];

  function init() {
    canvas = document.getElementById('rc-canvas');
    elRcCombo      = document.getElementById('rc-combo');
    elRcScore      = document.getElementById('rc-score');
    elRcBest       = document.getElementById('rc-best');
    elRcLevel      = document.getElementById('rc-level');
    elRcLives      = document.getElementById('rc-lives');
    elRcFuelBar    = document.getElementById('rc-fuel-bar');
    elRcPowerupBar = document.getElementById('rc-powerup-bar');
    ctx    = canvas.getContext('2d');
    best   = parseInt(localStorage.getItem('rc-best') || '0');
    if(elRcBest) elRcBest.textContent = best;
    keysHeld   = { left: false, right: false, nitro: false };
    touchLeft  = false;
    touchRight = false;

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    const lb = document.getElementById('rc-left-btn');
    const rb = document.getElementById('rc-right-btn');
    if (lb) {
      lb.addEventListener('pointerdown', () => { touchLeft = true;  lb.classList.add('held'); });
      lb.addEventListener('pointerup',   () => { touchLeft = false; lb.classList.remove('held'); });
      lb.addEventListener('pointerleave',() => { touchLeft = false; lb.classList.remove('held'); });
    }
    if (rb) {
      rb.addEventListener('pointerdown', () => { touchRight = true;  rb.classList.add('held'); });
      rb.addEventListener('pointerup',   () => { touchRight = false; rb.classList.remove('held'); });
      rb.addEventListener('pointerleave',() => { touchRight = false; rb.classList.remove('held'); });
    }

    showOverlay('start');
  }

  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    canvas.width  = W;
    canvas.height = H;
    LANE_W = W / LANES;
    CAR_W  = LANE_W * 0.62;
    CAR_H  = CAR_W  * 1.9;
    if (running && !paused) draw();
  }

  // ── Game loop ───────────────────────────────────────────────
  function newGame() {
    hideOverlay();
    score      = 0;  level = 1;  lives = MAX_LIVES;
    speed      = H * 0.0022;
    spawnInterval = 2800;  spawnTimer = 0;
    roadOffset = 0;
    enemies    = [];  warnings = [];  particles = [];  pickups = [];
    playerLane = Math.floor(LANES / 2);
    playerX    = laneCenter(playerLane);
    playerSlide = 0;  slideTimer = 0;
    running = true;  paused = false;  gameOver = false;

    // New state
    fuel          = 100;
    fuelDrainRate = 2.5;    // %/s at level 1
    nitroActive   = false;  nitroTimer  = 0;
    shieldActive  = false;  shieldTimer = 0;
    combo         = 1;      comboTimer  = 0;
    nearMissTimer = 0;
    rushTimer     = 0;      inRush = false;
    roadEvent     = null;   roadEventTimer = 0;
    wetRoad       = false;  chicaneLanes = [];
    tunnelAlpha   = 0;

    updateUI();
    updateFuelBar();
    updatePowerupBar();
    if(elRcCombo) elRcCombo.textContent = 'x1';
    cancelAnimationFrame(raf);
    lastTs = null;
    raf = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;
    if (!paused) { update(dt); draw(); }
    raf = requestAnimationFrame(loop);
  }

  function update(dt) {
    const dtS = dt / 1000; // seconds

    // ── Road scroll ─────────────────────────────────────────
    roadOffset = (roadOffset + speed * dt) % (H * 0.15);

    // ── Fuel drain ──────────────────────────────────────────
    fuel = Math.max(0, fuel - fuelDrainRate * dtS);
    updateFuelBar();
    if (fuel <= 0) { endGame(); return; }

    // ── Score (with combo multiplier) ───────────────────────
    score += Math.floor(dt * level * 0.06 * combo);

    // ── Level up ────────────────────────────────────────────
    const newLevel = Math.floor(score / 3000) + 1;
    if (newLevel > level) {
      level = newLevel;
      speed         = H * 0.0022 * (1 + (level - 1) * 0.22);
      spawnInterval = Math.max(700, 2800 - (level - 1) * 220);
      fuelDrainRate = 2.5 + (level - 1) * 0.4; // drains faster at higher levels
    }

    // ── Player steering ─────────────────────────────────────
    let effectiveMoveSpeed = LANE_W * dt * 0.008;
    if (nitroActive) effectiveMoveSpeed *= 1.5;  // faster steering with nitro

    // Wet road: apply drift
    if (wetRoad && slideTimer > 0) {
      slideTimer -= dt;
      playerX += playerSlide * dt * 0.003;
      playerX = Math.max(LANE_W * 0.5, Math.min(W - LANE_W * 0.5, playerX));
    }

    if ((keysHeld.left || touchLeft) && playerX > LANE_W * 0.5) {
      playerX = Math.max(LANE_W * 0.5, playerX - effectiveMoveSpeed);
    }
    if ((keysHeld.right || touchRight) && playerX < W - LANE_W * 0.5) {
      playerX = Math.min(W - LANE_W * 0.5, playerX + effectiveMoveSpeed);
    }

    // Nitro: boost score, shrink hitbox visually (handled in draw)
    if (nitroActive) {
      nitroTimer -= dt;
      score += Math.floor(dt * level * 0.12); // bonus score
      if (nitroTimer <= 0) { nitroActive = false; updatePowerupBar(); }
    }

    if (shieldActive) {
      shieldTimer -= dt;
      if (shieldTimer <= 0) { shieldActive = false; updatePowerupBar(); }
    }

    // ── Combo decay ─────────────────────────────────────────
    if (combo > 1) {
      comboTimer -= dt;
      if (comboTimer <= 0) { combo = 1; if(elRcCombo) elRcCombo.textContent = 'x1'; }
    }
    if (nearMissTimer > 0) nearMissTimer -= dt;

    // ── Rush hour ───────────────────────────────────────────
    rushTimer += dt;
    if (!inRush && rushTimer > 18000) {   // every 18s
      inRush = true; rushTimer = 0;
      showRushNotice();
    }
    if (inRush) {
      spawnTimer += dt * 1.8; // double spawn rate during rush
    } else {
      spawnTimer += dt;
    }
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      queueEnemy();
      if (inRush) queueEnemy(); // extra car during rush
      if (rushTimer > 6000) inRush = false; // rush lasts 6s
    }

    // ── Road events ─────────────────────────────────────────
    if (roadEvent === null && Math.random() < 0.0002 * dt) triggerRoadEvent();
    if (roadEventTimer > 0) {
      roadEventTimer -= dt;
      if (roadEventTimer <= 0) clearRoadEvent();
    }

    // Tunnel: fade darkness
    const tunnelTarget = roadEvent === 'tunnel' ? 0.82 : 0;
    tunnelAlpha += (tunnelTarget - tunnelAlpha) * 0.04;

    // ── Spawn warnings ──────────────────────────────────────
    const warningTime = Math.max(350, 1100 - (level - 1) * 60); // less warning at high levels
    for (let i = warnings.length - 1; i >= 0; i--) {
      const w = warnings[i];
      w.timer -= dt;
      w.flash = Math.floor(w.timer / 180) % 2 === 0;
      if (w.timer <= 0) {
        spawnEnemyFromWarning(w);
        warnings.splice(i, 1);
      }
    }

    // ── Move enemies ────────────────────────────────────────
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.y += speed * dt * (0.8 + e.speedMult * 0.4);

      if (!e.hit) {
        if (checkCollision(e)) {
          e.hit = true;
          if (shieldActive) {
            // Shield absorbs hit
            shieldActive = false; shieldTimer = 0;
            explode(e.x, e.y, '#00d4ff');
            updatePowerupBar();
            enemies.splice(i, 1);
            continue;
          }
          explode(e.x, e.y, e.color);
          if (window.FX) {
            const rect = canvas.getBoundingClientRect();
            const ex2 = rect.left + (e.x/W)*rect.width;
            const ey2 = rect.top  + (e.y/H)*rect.height;
            FX.explosion(ex2, ey2, [e.color||'#ff6a00','#ff2d78','#ffe600','#ffffff']);
            FX.screenFlash('#ff2d78', 0.4);
          }
          lives--;
          combo = 1; comboTimer = 0;
          if(elRcCombo) elRcCombo.textContent = 'x1';
          updateUI();
          if (lives <= 0) { endGame(); return; }
          enemies.splice(i, 1);
          continue;
        }

        // Near-miss detection
        if (nearMissTimer <= 0) {
          const py = H - CAR_H * 1.1;
          const dx = Math.abs(playerX - e.x);
          const dy = Math.abs(py - e.y);
          const nearW = CAR_W * 1.1, nearH = CAR_H * 1.1;
          const hitW  = CAR_W * 0.38, hitH = CAR_H * 0.44;
          if (dx < nearW && dy < nearH && !(dx < hitW * 2 && dy < hitH * 2)) {
            // Near miss!
            nearMissTimer = 800;
            combo = Math.min(8, combo + 1);
            comboTimer = 4000;
            score += 50 * combo;
            if(elRcCombo) elRcCombo.textContent = 'x' + combo;
            spawnFloatText(playerX, H - CAR_H * 1.5, `NEAR MISS! x${combo}`, '#a78bfa');
          }
        }
      }

      if (e.y > H + CAR_H) enemies.splice(i, 1);
    }

    // ── Pickups ─────────────────────────────────────────────
    // Occasionally spawn a pickup
    if (Math.random() < 0.0004 * dt) spawnPickup();

    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.y += speed * dt * 0.5;   // pickups fall slower
      pk.pulse = (pk.pulse || 0) + dt * 0.005;

      // Collect check
      const py = H - CAR_H * 1.1;
      if (Math.abs(playerX - pk.x) < CAR_W * 0.8 && Math.abs(py - pk.y) < CAR_H * 0.8) {
        collectPickup(pk);
        pickups.splice(i, 1);
        continue;
      }
      if (pk.y > H + 40) pickups.splice(i, 1);
    }

    // ── Float texts ─────────────────────────────────────────
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.isText) {
        p.y -= dt * 0.04;
        p.life -= dt;
        if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
        continue;
      }
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vy += 0.0004 * dt;
      p.life -= dt;
      if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
    }

    if (score > best) {
      best = score;
      localStorage.setItem('rc-best', best);
      if(elRcBest) elRcBest.textContent = best;
    }
    updateScoreDisplay();
  }

  // ── Enemy spawning ───────────────────────────────────────────
  function queueEnemy() {
    // Block chicane lanes
    const blocked = chicaneLanes || [];
    const available = [];
    for (let i = 0; i < LANES; i++) {
      if (!blocked.includes(i)) available.push(i);
    }
    if (!available.length) return;

    const warningTime = Math.max(350, 1100 - (level - 1) * 60);

    // Convoy: at level 5+ chance of spawning 2-3 in a row
    const isConvoy = level >= 5 && Math.random() < 0.25;
    const lane = available[Math.floor(Math.random() * available.length)];

    if (isConvoy) {
      const count = 2 + (Math.random() < 0.4 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        warnings.push({ lane, timer: warningTime + k * 300, flash: true, isConvoy: true });
      }
    } else {
      warnings.push({ lane, timer: warningTime, flash: true });
    }

    // Multi-lane spawn at high levels
    if (level >= 4 && Math.random() < 0.3 && available.length >= 2) {
      const lane2 = available.filter(l => Math.abs(l - lane) >= 2)[Math.floor(Math.random() * available.filter(l => Math.abs(l - lane) >= 2).length)];
      if (lane2 !== undefined) warnings.push({ lane: lane2, timer: warningTime, flash: true });
    }
  }

  function spawnEnemyFromWarning(w) {
    // Determine enemy type
    const roll = Math.random();
    let type = 'car';
    if (level >= 3 && roll < 0.15) type = 'truck';
    else if (level >= 4 && roll < 0.28) type = 'moto';
    else if (Math.random() < 0.12 && level >= 2) type = 'slick';

    const isTruck = type === 'truck';
    const isMoto  = type === 'moto';
    const isSlick = type === 'slick';

    enemies.push({
      lane:      w.lane,
      x:         laneCenter(w.lane),
      y:         -CAR_H * 1.2,
      type,
      color:     isSlick ? '#1e3a4a' : ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
      speedMult: isTruck ? 0.1 + Math.random() * 0.2   // trucks: slow
               : isMoto  ? 0.7 + Math.random() * 0.6   // motos: fast
               : 0.3 + Math.random() * 0.5,
      isSlick,
      isTruck,
      isMoto,
      weavePhase: Math.random() * Math.PI * 2, // for moto weave
      hit: false,
    });
  }

  // ── Pickups ─────────────────────────────────────────────────
  function spawnPickup() {
    // Weighted random
    const total = PICKUP_DEFS.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * total;
    let def = PICKUP_DEFS[PICKUP_DEFS.length - 1];
    for (const d of PICKUP_DEFS) { r -= d.weight; if (r <= 0) { def = d; break; } }
    const lane = Math.floor(Math.random() * LANES);
    pickups.push({ ...def, x: laneCenter(lane), y: -30, pulse: 0 });
  }

  function collectPickup(pk) {
    explodePickup(pk.x, pk.y, pk.color);
    switch(pk.type) {
      case 'fuel':
        fuel = Math.min(100, fuel + 35);
        updateFuelBar();
        spawnFloatText(pk.x, pk.y, '+FUEL', pk.color);
        break;
      case 'nitro':
        nitroActive = true; nitroTimer = 3000;
        updatePowerupBar();
        spawnFloatText(pk.x, pk.y, 'NITRO!', pk.color);
        break;
      case 'shield':
        shieldActive = true; shieldTimer = 6000;
        updatePowerupBar();
        spawnFloatText(pk.x, pk.y, 'SHIELD!', pk.color);
        break;
      case 'multiplier':
        combo = Math.min(8, combo + 2); comboTimer = 6000;
        if(elRcCombo) elRcCombo.textContent = 'x' + combo;
        spawnFloatText(pk.x, pk.y, `x${combo} COMBO!`, pk.color);
        break;
    }
  }

  // ── Road events ──────────────────────────────────────────────
  function triggerRoadEvent() {
    const events = ['tunnel', 'wet', 'chicane'];
    roadEvent = events[Math.floor(Math.random() * events.length)];
    roadEventTimer = 6000 + Math.random() * 4000;

    if (roadEvent === 'wet') {
      wetRoad = true;
      spawnFloatText(W / 2, H * 0.3, '⚠ WET ROAD', '#60a5fa');
    } else if (roadEvent === 'tunnel') {
      spawnFloatText(W / 2, H * 0.3, '⚠ TUNNEL', '#94a3b8');
    } else if (roadEvent === 'chicane') {
      // Block 1-2 random lanes
      const blocked = new Set();
      blocked.add(Math.floor(Math.random() * LANES));
      if (Math.random() < 0.4) blocked.add((Math.floor(Math.random() * LANES)));
      chicaneLanes = [...blocked];
      spawnFloatText(W / 2, H * 0.3, '⚠ ROADWORKS', '#fbbf24');
    }
  }

  function clearRoadEvent() {
    roadEvent = null;
    wetRoad = false;
    chicaneLanes = [];
  }

  // ── Collision ─────────────────────────────────────────────────
  function checkCollision(e) {
    const px = playerX, py = H - CAR_H * 1.1;
    const ex = e.x,     ey = e.y;
    // Nitro: slightly smaller hitbox (player is boosting past)
    const scale = nitroActive ? 0.6 : 1;
    const hw = (e.isTruck ? CAR_W * 0.55 : CAR_W * 0.38) * scale;
    const hh = (e.isMoto  ? CAR_H * 0.28 : e.isSlick ? CAR_H * 0.18 : CAR_H * 0.44) * scale;
    return Math.abs(px - ex) < (hw + CAR_W * 0.38) && Math.abs(py - ey) < (hh + CAR_H * 0.22);
  }

  // ── Draw ─────────────────────────────────────────────────────
  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawRoad();
    drawChicaneCones();
    drawWarnings();
    drawPickups();
    drawEnemies();
    drawPlayerCar();
    drawParticles();
    if (tunnelAlpha > 0.02) drawTunnel();
    if (wetRoad) drawRainEffect();
  }

  function drawRoad() {
    const now = Date.now();
    // Sky — top 25% of screen
    const skyH = H * 0.22;
    const skyGrad = ctx.createLinearGradient(0,0,0,skyH);
    skyGrad.addColorStop(0, '#000510');
    skyGrad.addColorStop(0.6, '#030a1e');
    skyGrad.addColorStop(1, wetRoad ? '#04122a' : '#050a18');
    ctx.fillStyle = skyGrad; ctx.fillRect(0,0,W,skyH);

    // Stars in sky
    ctx.save(); ctx.globalAlpha = 0.7;
    for (let i=0; i<18; i++) {
      const sx = ((i * 137 + 23) % W);
      const sy = ((i * 79 + 11) % skyH);
      const st = 0.4 + 0.6*Math.sin(now*0.002 + i*0.9);
      ctx.fillStyle = `rgba(200,220,255,${st * 0.8})`;
      ctx.beginPath(); ctx.arc(sx,sy,0.8,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // Horizon glow
    const horizGrad = ctx.createLinearGradient(0, skyH*0.7, 0, skyH+6);
    horizGrad.addColorStop(0,'transparent');
    horizGrad.addColorStop(0.5, wetRoad ? 'rgba(0,100,200,0.18)' : 'rgba(255,100,0,0.15)');
    horizGrad.addColorStop(1,'transparent');
    ctx.fillStyle = horizGrad; ctx.fillRect(0,skyH*0.7,W,skyH*0.3+6);

    // Neon road base
    const roadGrad = ctx.createLinearGradient(0, skyH, 0, H);
    if (wetRoad) {
      roadGrad.addColorStop(0, '#050e1a');
      roadGrad.addColorStop(0.5,'#071220');
      roadGrad.addColorStop(1, '#091828');
    } else {
      roadGrad.addColorStop(0, '#080c14');
      roadGrad.addColorStop(0.5,'#0a0f1c');
      roadGrad.addColorStop(1, '#0c1020');
    }
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, skyH, W, H - skyH);

    // Speed lines radiating from vanishing point at horizon (high speed effect)
    if (speed > 2) {
      const vpx = W/2, vpy = skyH;
      const numLines = 8;
      const alpha = Math.min(0.35, (speed - 2) * 0.08);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.strokeStyle = wetRoad ? 'rgba(0,150,255,0.5)' : 'rgba(255,200,0,0.5)';
      ctx.lineWidth = 1;
      for (let i=0; i<numLines; i++) {
        const angle = (i / numLines) * Math.PI - Math.PI*0.2;
        if (angle < -0.15 || angle > Math.PI+0.15) continue;
        const endX = vpx + Math.cos(angle) * W * 0.8;
        const endY = vpy + Math.abs(Math.sin(angle)) * (H - skyH) * 0.9;
        const off = (roadOffset * 3) % 60 / 60;
        // Draw dashed speed line
        ctx.setLineDash([H*0.06, H*0.04]);
        ctx.lineDashOffset = -off * H * 0.1;
        ctx.beginPath(); ctx.moveTo(vpx, vpy); ctx.lineTo(endX, endY); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.restore();
    }

    // Neon edge barriers
    const barrierGrad1 = ctx.createLinearGradient(0,0,W*0.06,0);
    barrierGrad1.addColorStop(0,'#ff6a00'); barrierGrad1.addColorStop(1,'transparent');
    ctx.fillStyle = barrierGrad1;
    ctx.fillRect(0, 0, W * 0.04, H);
    ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff6a00';
    ctx.fillRect(W * 0.04 - 2, 0, 2, H);
    ctx.shadowBlur = 0;

    const barrierGrad2 = ctx.createLinearGradient(W,0,W*0.94,0);
    barrierGrad2.addColorStop(0,'#ff6a00'); barrierGrad2.addColorStop(1,'transparent');
    ctx.fillStyle = barrierGrad2;
    ctx.fillRect(W * 0.96, 0, W * 0.04, H);
    ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff6a00';
    ctx.fillRect(W * 0.96, 0, 2, H);
    ctx.shadowBlur = 0;

    // Neon lane lines
    ctx.shadowColor = wetRoad ? 'rgba(100,180,255,0.8)' : 'rgba(255,230,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = wetRoad ? 'rgba(100,180,255,0.5)' : '#ffe600';
    ctx.lineWidth   = 2;
    ctx.setLineDash([H * 0.08, H * 0.06]);
    ctx.lineDashOffset = -roadOffset;
    for (let i = 1; i < LANES; i++) {
      const x = i * LANE_W;
      ctx.beginPath(); ctx.moveTo(x, skyH); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    if (level >= 3) {
      const alpha = Math.min(0.4, (level - 2) * 0.1);
      ctx.strokeStyle = `rgba(251,146,60,${alpha})`;
      ctx.lineWidth = 1;
      const lineSpacing = H * 0.12;
      const offset2 = roadOffset * 2.5 % lineSpacing;
      for (let y = -lineSpacing + offset2; y < H + lineSpacing; y += lineSpacing) {
        ctx.beginPath(); ctx.moveTo(W*0.04,y); ctx.lineTo(W*0.02,y+H*0.04); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W*0.96,y); ctx.lineTo(W*0.98,y+H*0.04); ctx.stroke();
      }
    }
  }

  function drawChicaneCones() {
    if (!chicaneLanes.length) return;
    chicaneLanes.forEach(lane => {
      const cx = laneCenter(lane);
      // Draw traffic cones down the lane
      for (let y = 40; y < H - 40; y += H * 0.12) {
        const yy = ((y + roadOffset * 2) % H);
        ctx.save();
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(cx, yy - 14); ctx.lineTo(cx - 8, yy + 8); ctx.lineTo(cx + 8, yy + 8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillRect(cx - 8, yy + 4, 16, 4);
        ctx.restore();
      }
    });
  }

  function drawTunnel() {
    // Dark vignette — covers most of screen except centre strip
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0,   `rgba(0,0,0,${tunnelAlpha})`);
    g.addColorStop(0.3, `rgba(0,0,0,${tunnelAlpha * 0.2})`);
    g.addColorStop(0.7, `rgba(0,0,0,${tunnelAlpha * 0.2})`);
    g.addColorStop(1,   `rgba(0,0,0,${tunnelAlpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Top + bottom darkness
    const topG = ctx.createLinearGradient(0, 0, 0, H * 0.35);
    topG.addColorStop(0, `rgba(0,0,0,${tunnelAlpha})`);
    topG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topG;
    ctx.fillRect(0, 0, W, H * 0.35);
    // Tunnel wall stripe indicators
    ctx.strokeStyle = `rgba(255,200,80,${tunnelAlpha * 0.6})`;
    ctx.lineWidth = 3;
    const spacing = H * 0.18;
    const off = (roadOffset * 1.5) % spacing;
    for (let y = -spacing + off; y < H + spacing; y += spacing) {
      ctx.beginPath(); ctx.moveTo(W * 0.02, y); ctx.lineTo(W * 0.02, y + spacing * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W * 0.98, y); ctx.lineTo(W * 0.98, y + spacing * 0.4); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRainEffect() {
    ctx.save();
    ctx.strokeStyle = 'rgba(150,200,255,0.18)';
    ctx.lineWidth = 1;
    const drop = H * 0.07;
    const spacing = 22;
    const off = (roadOffset * 3) % spacing;
    for (let x = 0; x < W; x += spacing) {
      for (let y = -drop + off; y < H; y += spacing) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + drop); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPickups() {
    pickups.forEach(pk => {
      const pulse = 0.8 + 0.2 * Math.sin(pk.pulse);
      const r = LANE_W * 0.22 * pulse;
      ctx.save();
      ctx.shadowColor = pk.glow;
      ctx.shadowBlur  = 14;
      ctx.fillStyle   = pk.color;
      ctx.beginPath(); ctx.arc(pk.x, pk.y,Math.max(0,r), 0, Math.PI * 2); ctx.fill();
      // Label
      ctx.font = `${Math.round(r * 1.2)}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur   = 0;
      ctx.fillStyle    = '#fff';
      ctx.fillText(pk.label, pk.x, pk.y);
      ctx.restore();
    });
  }

  function drawPlayerCar() {
    const py = H - CAR_H * 1.25;
    if (shieldActive) {
      // Shield bubble
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
      ctx.strokeStyle = `rgba(0,212,255,${0.5 + pulse * 0.4})`;
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur  = 16 + pulse * 8;
      ctx.beginPath();
      ctx.arc(playerX, py + CAR_H / 2,Math.max(0,CAR_W * 0.75), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (nitroActive) {
      // Nitro flame trail
      for (let i = 0; i < 6; i++) {
        const fy = py + CAR_H + i * 10;
        const fw = CAR_W * (0.4 - i * 0.055);
        ctx.save();
        ctx.globalAlpha = 0.7 - i * 0.1;
        ctx.fillStyle = i < 2 ? '#fcd34d' : i < 4 ? '#f97316' : '#ef4444';
        ctx.shadowColor = '#f97316'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.ellipse(playerX, fy, fw, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    drawCar(playerX, py + CAR_H / 2, '#00d4ff', '#0ea5e9', true);
  }

  function drawWarnings() {
    if (!warnings.length) return;
    // In tunnel, suppress warnings (that's the point!)
    if (roadEvent === 'tunnel' && tunnelAlpha > 0.5) return;
    warnings.forEach(w => {
      if (!w.flash) return;
      const cx = laneCenter(w.lane);
      const cy = CAR_H * 0.82;
      const size = Math.min(LANE_W * 0.62, CAR_H * 0.7);
      ctx.save();
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.56);
      ctx.lineTo(cx + size * 0.5, cy + size * 0.35);
      ctx.lineTo(cx - size * 0.5, cy + size * 0.35);
      ctx.closePath();
      ctx.fillStyle = '#fbbf24'; ctx.fill();
      ctx.lineWidth = size * 0.07; ctx.strokeStyle = '#92400e'; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1c1917';
      ctx.font = `bold ${Math.round(size * 0.42)}px Orbitron, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', cx, cy + size * 0.05);
      ctx.restore();
    });
  }

  function drawEnemies() {
    enemies.forEach(e => {
      if (e.isSlick) {
        ctx.save(); ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#0a2a3a'; ctx.strokeStyle = '#1e4a6a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, CAR_W * 0.8, CAR_H * 0.35, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        const grad = ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,Math.max(0.01,CAR_W * 0.7));
        grad.addColorStop(0, 'rgba(168,85,247,0.3)'); grad.addColorStop(0.4,'rgba(59,130,246,0.2)');
        grad.addColorStop(0.8,'rgba(34,197,94,0.15)'); grad.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, CAR_W * 0.8, CAR_H * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Trigger a slide on the player if they drive over it
        const py = H - CAR_H * 1.1;
        if (Math.abs(playerX - e.x) < CAR_W * 1.2 && Math.abs(py - e.y) < CAR_H * 0.6 && wetRoad) {
          playerSlide = (playerX > e.x ? 1 : -1) * (2 + Math.random() * 3);
          slideTimer = 600;
        }
      } else {
        // Moto: draw thinner, draw weave
        if (e.isMoto) {
          e.weavePhase += 0.003;
          e.x = laneCenter(e.lane) + Math.sin(e.weavePhase) * LANE_W * 0.35;
        }
        const dark = shadeColor(e.color, -40);
        const scaleW = e.isTruck ? 1.55 : e.isMoto ? 0.42 : 1;
        const scaleH = e.isTruck ? 1.6  : e.isMoto ? 0.65 : 1;
        drawCar(e.x, e.y, e.color, dark, false, scaleW, scaleH);
      }
    });
  }

  function drawCar(cx, cy, bodyColor, roofColor, isPlayer, scaleW = 1, scaleH = 1) {
    const bw = CAR_W * scaleW, bh = CAR_H * scaleH;
    const x  = cx - bw / 2, y = cy - bh / 2;
    const r  = bw * 0.15;
    ctx.save();
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur  = isPlayer ? 18 : 8;
    ctx.fillStyle = bodyColor;
    roundRect(x, y, bw, bh, r); ctx.fill();
    const rw = bw * 0.7, rh = bh * 0.38;
    const rx = cx - rw/2, ry = isPlayer ? y + bh*0.18 : y + bh*0.25;
    ctx.fillStyle = roofColor;
    roundRect(rx, ry, rw, rh, r*0.8); ctx.fill();
    ctx.shadowBlur = 0;
    const ww = bw*0.55, wh = bh*0.13, wx = cx-ww/2;
    const wy = isPlayer ? ry+rh*0.12 : ry+rh*0.08;
    ctx.fillStyle = isPlayer ? 'rgba(0,212,255,0.35)' : 'rgba(200,220,255,0.22)';
    roundRect(wx, wy, ww, wh, 3); ctx.fill();
    const lightY   = isPlayer ? y+bh*0.06 : y+bh*0.88;
    const lightCol = isPlayer ? '#fcd34d' : '#f43f5e';
    ctx.fillStyle = lightCol; ctx.shadowColor = lightCol; ctx.shadowBlur = 6;
    [[cx-bw*0.28,lightY],[cx+bw*0.28,lightY]].forEach(([lx,ly])=>{
      ctx.beginPath(); ctx.ellipse(lx,ly,bw*0.1,bh*0.04,0,0,Math.PI*2); ctx.fill();
    });
    ctx.shadowBlur = 0; ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
    const wxOff = bw*0.04;
    [[x-wxOff,y+bh*0.2],[x+bw-bw*0.12+wxOff,y+bh*0.2],
     [x-wxOff,y+bh*0.68],[x+bw-bw*0.12+wxOff,y+bh*0.68]].forEach(([wx,wy])=>{
      ctx.beginPath(); ctx.roundRect(wx,wy,bw*0.18,bh*0.18,3); ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(p => {
      if (p.isText) {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // Soft halo via oversized semi-transparent draw instead of shadowBlur
        ctx.globalAlpha = alpha * 0.28;
        ctx.font = `bold ${(p.size || 11) + 4}px "Share Tech Mono", monospace`;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${p.size || 11}px "Share Tech Mono", monospace`;
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
        return;
      }
      const alpha = Math.max(0, p.life / p.maxLife);
      const r = p.r * alpha;
      ctx.save();
      // Radial gradient halo instead of shadowBlur
      const grad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.max(0.01,r * 2.5));
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y,Math.max(0,r * 2.5), 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y,Math.max(0,r), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  function laneCenter(lane) { return (lane + 0.5) * LANE_W; }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
    ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
    ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
    ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
  }

  function shadeColor(hex, amt) {
    const n = parseInt(hex.replace('#',''),16);
    const r = Math.min(255,Math.max(0,(n>>16)+amt));
    const g = Math.min(255,Math.max(0,((n>>8)&0xff)+amt));
    const b = Math.min(255,Math.max(0,(n&0xff)+amt));
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }

  function explode(x, y, color) {
    for (let i = 0; i < 28; i++) {
      const angle = (Math.PI*2*i)/28 + Math.random()*0.3;
      const spd   = 0.06 + Math.random()*0.22;
      particles.push({ x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd-0.12,
        color: Math.random()<0.5 ? color : '#fcd34d', r: 2+Math.random()*4,
        life: 400+Math.random()*300, maxLife: 700 });
    }
  }

  function explodePickup(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI*2*i)/12;
      particles.push({ x, y, vx: Math.cos(angle)*0.08, vy: Math.sin(angle)*0.08-0.05,
        color, r: 3+Math.random()*3, life: 350, maxLife: 350 });
    }
  }

  function spawnFloatText(x, y, text, color) {
    particles.push({ isText: true, x, y, text, color, size: 12,
      life: 1200, maxLife: 1200 });
  }

  function showRushNotice() {
    spawnFloatText(W/2, H*0.25, '⚠ RUSH HOUR!', '#f43f5e');
  }

  // ── UI ────────────────────────────────────────────────────────
  function updateUI() {
    if(elRcLevel) elRcLevel.textContent = level;
    const el = elRcLives;
    if (el) el.textContent = '❤️'.repeat(Math.max(0, lives));
  }

  function updateFuelBar() {
    const bar = elRcFuelBar;
    if (!bar) return;
    const pct = Math.max(0, fuel);
    bar.style.width = pct + '%';
    bar.style.background = pct > 50 ? 'linear-gradient(90deg,#22c55e,#86efac)'
      : pct > 25 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)'
      : 'linear-gradient(90deg,#ef4444,#f87171)';
  }

  function updatePowerupBar() {
    const bar = elRcPowerupBar;
    if (!bar) return;
    const items = [];
    if (nitroActive)  items.push('🔥 NITRO');
    if (shieldActive) items.push('🛡 SHIELD');
    bar.textContent = items.join('  ');
    bar.style.display = items.length ? 'flex' : 'none';
  }

  function updateScoreDisplay() {
    if(elRcScore) elRcScore.textContent = score;
    if(elRcBest) elRcBest.textContent = best;
  }

  // ── End game ─────────────────────────────────────────────────
  function endGame() {
    running = false; gameOver = true;
    if (score > best) { best = score; localStorage.setItem('rc-best', best); }
    explode(playerX, H - CAR_H, '#fb923c');
    draw();
    setTimeout(() => {
      showOverlay('over');
      HS.promptSubmit('racer', score, score.toLocaleString());
    }, 600);
  }

  // ── Overlay ───────────────────────────────────────────────────
  function showOverlay(type) {
    const ov = document.getElementById('rc-overlay'); if (!ov) return;
    ov.classList.add('active');
    const title   = document.getElementById('rc-ov-title');
    const scoreEl = document.getElementById('rc-ov-score');
    const bestEl  = document.getElementById('rc-ov-best');
    const msg     = document.getElementById('rc-ov-msg');
    const btns    = document.getElementById('rc-ov-btns') || ov.querySelector('.rc-ov-btns');

    if (type === 'start') {
      title.textContent = 'ROAD RAGE'; title.className = 'rc-ov-title';
      scoreEl.textContent = ''; bestEl.textContent = best > 0 ? `BEST: ${best}` : '';
      msg.innerHTML = 'Dodge traffic — collect pickups — survive!<br><br>← → Arrow keys &nbsp;—&nbsp; A D &nbsp;—&nbsp; Touch buttons<br><span style="font-size:0.6rem;color:#a78bfa">⛽ Fuel &nbsp;🔥 Nitro &nbsp;🛡 Shield &nbsp;✦ Combo</span>';
      btns.innerHTML = `<button class="rc-btn" style="padding:8px 22px;font-size:0.75rem" onclick="rcNewGame()">▶ START</button><button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    } else if (type === 'pause') {
      title.textContent = 'PAUSED'; title.className = 'rc-ov-title';
      scoreEl.textContent = ''; bestEl.textContent = ''; msg.textContent = '';
      btns.innerHTML = `<button class="rc-btn" style="padding:8px 22px;font-size:0.75rem" onclick="rcTogglePause()">▶ RESUME</button><button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    } else if (type === 'over') {
      title.textContent = 'GAME OVER'; title.className = 'rc-ov-title over';
      scoreEl.textContent = score.toLocaleString();
      bestEl.textContent  = score >= best ? '🏆 NEW BEST!' : `BEST: ${best.toLocaleString()}`;
      msg.textContent     = `Level ${level} — Combo x${combo}`;
      btns.innerHTML = `<button class="rc-btn" style="padding:8px 22px;font-size:0.75rem" onclick="rcNewGame()">🔄 PLAY AGAIN</button><button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    }
  }

  function hideOverlay() {
    const ov = document.getElementById('rc-overlay');
    if (ov) ov.classList.remove('active');
  }

  // ── Input ─────────────────────────────────────────────────────
  function onKeyDown(e) {
    const screen = document.getElementById('racer-screen');
    if (!screen || !screen.classList.contains('active')) return;
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') { keysHeld.left  = true; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keysHeld.right = true; e.preventDefault(); }
    if (e.key === 'p' || e.key === 'P') rcTogglePause();
  }

  function onKeyUp(e) {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keysHeld.left  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysHeld.right = false;
  }

  // ── Pause / destroy ───────────────────────────────────────────
  function togglePause() {
    if (gameOver || !running) return;
    paused = !paused;
    const btn = document.getElementById('rc-pause-btn');
    if (paused) {
      if (btn) btn.textContent = '▶';
      showOverlay('pause');
    } else {
      if (btn) btn.textContent = '⏸';
      hideOverlay();
      lastTs = null;
      raf = requestAnimationFrame(loop);
    }
  }

  function destroy() {
    running = false; paused = false; gameOver = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
  }

  return { init, newGame, togglePause, destroy };
})();
