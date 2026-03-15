// ORBIT game module
// Auto-extracted from monolithic index.html


export default (() => {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────────
  const COLORS = [
    { name:'cyan',   fill:'#00f5ff', glow:'rgba(0,245,255,0.8)',   dark:'#004d55' },
    { name:'pink',   fill:'#ff2d78', glow:'rgba(255,45,120,0.8)',  dark:'#55001e' },
    { name:'gold',   fill:'#f59e0b', glow:'rgba(245,158,11,0.8)',  dark:'#4d3200' },
    { name:'green',  fill:'#4ade80', glow:'rgba(74,222,128,0.8)',  dark:'#0d4020' },
    { name:'purple', fill:'#a855f7', glow:'rgba(168,85,247,0.8)',  dark:'#2d0055' },
    { name:'white',  fill:'#e2e8f0', glow:'rgba(226,232,240,0.7)', dark:'#1e2a3a' },
  ];
  const GEM_RADIUS  = 12;
  const MATCH_COUNT = 3;
  const BASE_RINGS  = 2;
  const MAX_RINGS   = 5;
  const REVERSE_MAX = 3;
  const BOMB_MAX    = 2;
  // Ring speeds in radians/frame (positive = clockwise)
  const RING_SPEEDS = [0.008, -0.006, 0.005, -0.004, 0.003];

  // ── POWER-UP CONFIG ─────────────────────────────────────────────────
  const POWERS = {
    wave:    { label: 'GRAVITY WAVE',   icon: '🌊', desc: 'Sorts all planets on the targeted ring so same colours cluster together' },
    nova:    { label: 'SUPERNOVA',      icon: '⭐', desc: 'Next shot explodes on impact, destroying all planets within 2 slots' },
    hole:    { label: 'BLACK HOLE',     icon: '🌀', desc: 'Spawns a black hole that slowly eats planets as it orbits the ring' },
    freeze:  { label: 'DEEP FREEZE',    icon: '❄️', desc: 'Stops all rings rotating for 5 seconds — plan your shots carefully' },
    chain:   { label: 'CHAIN LIGHTNING',icon: '⚡', desc: 'Next shot chains through up to 3 adjacent same-colour planets' },
    worm:    { label: 'WORMHOLE',       icon: '🔀', desc: 'Teleports a cluster of planets between the inner and outer ring' },
    dilate:  { label: 'TIME DILATION',  icon: '⏳', desc: 'Slows all ring rotation by 50% for 8 seconds — easier targeting' },
  };

  // ── STATE ───────────────────────────────────────────────────────────
  let canvas, ctx, W, H, CX, CY;
  let nextCanvas, nextCtx;
  let animId     = null;
  let rings      = [];
  let shooter    = { angle: -Math.PI / 2, gem: null, nextGem: null };
  let projectile = null;
  let particles  = [];
  let score      = 0;
  let best       = 0;
  let level      = 1;
  let numRings   = BASE_RINGS;
  let gameRunning    = false;
  let mouseAngle     = -Math.PI / 2;
  // Single power-up slot
  let heldPower    = null;  // key of currently held power, or null
  let activePower  = null;  // currently armed (toggled on)
  let freezeTimer  = 0;
  let dilateTimer  = 0;
  let blackHoles   = [];
  let wormholes    = [];
  
  let novaMode     = false;
  let bombMode     = false;
  let initialPlanetCount = 0;  // planets at level start
  const PLANET_OVERFLOW = 20;  // game over threshold

  // ── DOM ─────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  function updateHUD() {
    if (score > best) { best = score; localStorage.setItem('orbit-best', best); }
    $('cr-score').textContent = score.toLocaleString();
    $('cr-best').textContent  = best.toLocaleString();
    $('cr-level').textContent = level;
    $('cr-rings').textContent = rings.length;

    // Planet count + danger meter
    const total = rings.reduce((s, r) => s + r.gems.length, 0);
    const added = Math.max(0, total - initialPlanetCount);
    const dangerPct = Math.min(1, added / PLANET_OVERFLOW);
    const isWarn   = dangerPct >= 0.5;
    const isDanger = dangerPct >= 0.8;

    const planetEl  = $('cr-planets');
    const panelEl   = $('cr-planets-panel');
    const barEl     = $('cr-danger-bar');
    const labelEl   = $('cr-danger-label');
    if (planetEl) {
      planetEl.textContent = total;
      planetEl.className = isDanger ? 'orbit-panel-value danger' : isWarn ? 'orbit-panel-value warn' : 'orbit-panel-value';
    }
    if (panelEl) {
      panelEl.className = 'orbit-panel' + (isDanger ? ' danger' : isWarn ? ' warn' : '');
    }
    if (barEl) {
      barEl.style.width = (dangerPct * 100) + '%';
      barEl.className = isDanger ? 'danger' : isWarn ? 'warn' : '';
    }
    if (labelEl) {
      labelEl.textContent = isDanger ? '⚠ CRITICAL' : isWarn ? '⚠ WARNING' : 'DANGER';
      labelEl.style.color = isDanger ? '#ff2d78' : isWarn ? '#f59e0b' : 'rgba(0,245,255,0.4)';
    }

    updatePowerBar();
  }

  function updatePowerBar() {
    const btn = $('orbit-power-btn');
    if (!btn) return;
    if (!heldPower) {
      btn.disabled = true;
      btn.classList.remove('active-pw');
      btn.innerHTML = '<span class="orbit-pw-empty">— SHOOT A POWER-UP ITEM TO COLLECT —</span>';
      return;
    }
    const pw = POWERS[heldPower];
    const isArmed = activePower === heldPower;
    btn.disabled = !gameRunning;
    btn.classList.toggle('active-pw', isArmed);
    btn.innerHTML = `
      <span class="orbit-pw-icon">${pw.icon}</span>
      <span class="orbit-pw-text">
        <span class="orbit-pw-name">${isArmed ? '▶ ARMED — CLICK TO CANCEL' : pw.label}</span>
        <span class="orbit-pw-desc">${pw.desc}</span>
      </span>
    `;
  }

  // ── GEOMETRY ─────────────────────────────────────────────────────────
  function ringRadius(i) {
    // Innermost ring → smallest, each ring further out is larger
    const minR = Math.min(W, H) * 0.14;
    const step = Math.min(W, H) * 0.115;
    return minR + i * step;
  }

  function gemsPerRing(i) {
    // More gems as ring grows
    const r = ringRadius(i);
    const circ = 2 * Math.PI * r;
    return Math.max(6, Math.floor(circ / (GEM_RADIUS * 2.8)));
  }

  // ── RING BUILDING ───────────────────────────────────────────────────
  function buildRing(ringIdx, colorCount) {
    const count = gemsPerRing(ringIdx);
    const gems  = [];
    // Fill with random colors, ensuring no immediate 3-in-a-row
    for (let i = 0; i < count; i++) {
      let col;
      do {
        col = Math.floor(Math.random() * colorCount);
      } while (
        i >= 2 &&
        gems[i-1].color === col &&
        gems[i-2].color === col
      );
      gems.push({ color: col, angle: (i / count) * Math.PI * 2, scale: 1, alpha: 1 });
    }

    // Sprinkle 1-2 powerup items at random positions (not adjacent to each other)
    const pwKeys = Object.keys(POWERS);
    const numPowerups = 1 + (Math.random() < 0.5 ? 1 : 0);
    const usedSlots = new Set();
    for (let p = 0; p < numPowerups; p++) {
      let slot;
      let tries = 0;
      do { slot = Math.floor(Math.random() * count); tries++; }
      while ((usedSlots.has(slot) || usedSlots.has(slot-1) || usedSlots.has(slot+1)) && tries < 20);
      usedSlots.add(slot);
      gems[slot].powerup = pwKeys[Math.floor(Math.random() * pwKeys.length)];
    }

    return {
      idx:      ringIdx,
      gems,
      speed:    RING_SPEEDS[ringIdx % RING_SPEEDS.length],
      rotation: 0,
      cleared:  false,
    };
  }

  function buildLevel() {
    rings = [];
    const colorCount = Math.min(COLORS.length, 3 + Math.floor(level / 2));
    for (let i = 0; i < numRings; i++) {
      rings.push(buildRing(i, colorCount));
    }
    initialPlanetCount = rings.reduce((s, r) => s + r.gems.length, 0);
  }

  // ── GEM POSITIONS ───────────────────────────────────────────────────
  function gemPos(ring, gemIdx) {
    const r = ringRadius(ring.idx);
    const gem = ring.gems[gemIdx];
    const a = gem.angle + ring.rotation;
    return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
  }

  // ── MATCHING ────────────────────────────────────────────────────────
  function findMatches(ring, insertIdx) {
    const n = ring.gems.length;
    const col = ring.gems[insertIdx].color;
    // Walk left and right from insertIdx counting same-color neighbors
    let left = 0, right = 0;
    for (let d = 1; d < n; d++) {
      const li = (insertIdx - d + n) % n;
      if (ring.gems[li].color !== col) break;
      left++;
    }
    for (let d = 1; d < n; d++) {
      const ri = (insertIdx + d) % n;
      if (ring.gems[ri].color !== col) break;
      right++;
    }
    const total = 1 + left + right;
    if (total < MATCH_COUNT) return [];
    const indices = [];
    for (let d = left; d >= 0; d--) indices.push((insertIdx - d + n) % n);
    for (let d = 1; d <= right; d++) indices.push((insertIdx + d) % n);
    return indices;
  }

  function removeGems(ring, indices) {
    // Spawn particles and collect any powerups
    for (const i of indices) {
      const gem = ring.gems[i];
      const pos = gemPos(ring, i);
      spawnParticles(pos.x, pos.y, COLORS[gem.color]);
      if (gem.powerup) collectPowerup(gem.powerup, pos.x, pos.y);
    }
    // Remove highest-index first to preserve lower indices
    const sorted = [...indices].sort((a, b) => b - a);
    for (const i of sorted) ring.gems.splice(i, 1);
    // Re-space angles evenly
    respaceGems(ring);
    // Check cleared
    if (ring.gems.length === 0) ring.cleared = true;
  }

  function collectPowerup(key, px, py) {
    heldPower = key;  // replaces any existing power
    activePower = null; novaMode = false;
    // Burst of golden particles
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;
      particles.push({ x: px, y: py, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
        alpha: 1, color: '#f59e0b', glow: 'rgba(245,158,11,0.9)', r: 2 + Math.random()*3 });
    }
    updateHUD();
  }

  function respaceGems(ring) {
    const n = ring.gems.length;
    for (let i = 0; i < n; i++) {
      ring.gems[i].angle = (i / n) * Math.PI * 2;
    }
  }

  // ── PARTICLES ───────────────────────────────────────────────────────
  function spawnParticles(x, y, col) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        alpha: 1,
        color: col.fill,
        glow:  col.glow,
        r: 2 + Math.random() * 3,
      });
    }
  }

  // ── SHOOTER ─────────────────────────────────────────────────────────
  function randomGem() {
    const colorCount = Math.min(COLORS.length, 3 + Math.floor(level / 2));
    return { color: Math.floor(Math.random() * colorCount) };
  }

  function advanceShooter() {
    shooter.gem     = shooter.nextGem || randomGem();
    shooter.nextGem = randomGem();
    drawNextGem();
  }

  function drawNextGem() {
    if (!nextCtx) return;
    nextCtx.clearRect(0, 0, 50, 50);
    if (!shooter.nextGem) return;
    nextCtx.fillStyle = '#00010a';
    nextCtx.fillRect(0, 0, 50, 50);
    const col = COLORS[shooter.nextGem.color];
    const ps  = PLANET_STYLES[shooter.nextGem.color] || PLANET_STYLES[0];
    const px = 25, py = 25, r = GEM_RADIUS;
    // Atmosphere
    const atmo = nextCtx.createRadialGradient(px, py, r * 0.7, px, py, r * 1.55);
    atmo.addColorStop(0, ps.atmo); atmo.addColorStop(1, 'transparent');
    nextCtx.beginPath(); nextCtx.arc(px, py, r * 1.55, 0, Math.PI * 2);
    nextCtx.fillStyle = atmo; nextCtx.fill();
    // Sphere
    const sg = nextCtx.createRadialGradient(px - r*0.3, py - r*0.3, r*0.05, px, py, r);
    sg.addColorStop(0, col.fill); sg.addColorStop(0.45, ps.base); sg.addColorStop(1, '#000510');
    nextCtx.beginPath(); nextCtx.arc(px, py, r, 0, Math.PI * 2);
    nextCtx.fillStyle = sg; nextCtx.shadowColor = col.glow; nextCtx.shadowBlur = 10; nextCtx.fill();
    nextCtx.shadowBlur = 0;
    // Specular
    nextCtx.beginPath(); nextCtx.arc(px - r*0.32, py - r*0.32, r*0.28, 0, Math.PI * 2);
    const shine = nextCtx.createRadialGradient(px-r*0.32, py-r*0.32, 0, px-r*0.32, py-r*0.32, r*0.28);
    shine.addColorStop(0, ps.spot); shine.addColorStop(1, 'transparent');
    nextCtx.fillStyle = shine; nextCtx.fill();
  }

  // ── FIRE ────────────────────────────────────────────────────────────
  function fire() {
    if (!gameRunning || projectile) return;
    if (!shooter.gem) return;
    const spd = 12;

    let targetRingIdx = rings.length > 0 ? rings[rings.length - 1].idx : 0;
    if (shooter.aimDist !== undefined) {
      let minDiff = Infinity;
      for (const ring of rings) {
        const diff = Math.abs(ringRadius(ring.idx) - shooter.aimDist);
        if (diff < minDiff) { minDiff = diff; targetRingIdx = ring.idx; }
      }
    }

    // Capture armed power BEFORE clearing — used to stamp projectile flags
    const firedPower = (activePower && ['nova','chain'].includes(activePower)) ? activePower : null;
    if (firedPower) {
      heldPower  = null;
      activePower = null;
      if (firedPower !== 'nova') novaMode = false; // keep novaMode for nova shots
    }

    const makeProj = (angleOffset = 0) => ({
      x: CX, y: CY,
      vx: Math.cos(shooter.angle + angleOffset) * spd,
      vy: Math.sin(shooter.angle + angleOffset) * spd,
      color: shooter.gem.color,
      r: GEM_RADIUS,
      prevDist: 0,
      targetRingIdx,
      chainMode: firedPower === 'chain',
    });

    projectile = makeProj();

    advanceShooter();
    updateHUD();
  }

  // ── LEGACY BOMB (kept for safety) ───────────────────────────────────
  function fireBomb() {}

  // ── INSERT GEM INTO RING ─────────────────────────────────────────────
  function insertIntoRing(ring, px, py) {
    const r = ringRadius(ring.idx);
    // Find angle of impact
    const a = Math.atan2(py - CY, px - CX);
    // Normalize to ring rotation
    const localA = ((a - ring.rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const n = ring.gems.length;
    // Find nearest gap
    let insertIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i <= n; i++) {
      const gA = (i / n) * Math.PI * 2;
      const diff = Math.abs(localA - gA);
      const d = Math.min(diff, Math.PI * 2 - diff);
      if (d < minDist) { minDist = d; insertIdx = i % n; }
    }
    ring.gems.splice(insertIdx, 0, {
      color: projectile.color,
      angle: localA,
      scale: 1,
      alpha: 1,
    });
    respaceGems(ring);
    return insertIdx;
  }

  // ── LAND PROJECTILE ON A RING ────────────────────────────────────────
  function landProjectile(proj, rng, snapX, snapY) {
    if (novaMode) {
      novaMode = false;
      const insertIdx = insertIntoRing(rng, snapX, snapY);
      const n = rng.gems.length;
      const toDestroy = new Set();
      for (let d = -2; d <= 2; d++) toDestroy.add((insertIdx + d + n) % n);
      const sortedIdx = [...toDestroy].sort((a,b) => b-a);
      for (const i of sortedIdx) spawnParticles(gemPos(rng,i).x, gemPos(rng,i).y, COLORS[rng.gems[i].color]);
      spawnParticles(snapX, snapY, { fill:'#ffffff', glow:'rgba(255,255,255,0.9)' });
      score += sortedIdx.length * 15 * level;
      if (score > best) best = score;
      rng.gems = rng.gems.filter((_,i) => !toDestroy.has(i));
      respaceGems(rng);
    } else if (proj.chainMode) {
      const insertIdx = insertIntoRing(rng, snapX, snapY);
      const col = proj.color;
      const n = rng.gems.length;
      const toDestroy = new Set([insertIdx]);
      for (let d = 1; d <= n && toDestroy.size < 4; d++) {
        const ri = (insertIdx + d) % n;
        if (rng.gems[ri]?.color === col) toDestroy.add(ri); else break;
      }
      for (let d = 1; d <= n && toDestroy.size < 4; d++) {
        const li = (insertIdx - d + n) % n;
        if (rng.gems[li]?.color === col) toDestroy.add(li); else break;
      }
      const sortedIdx = [...toDestroy].sort((a,b)=>b-a);
      for (const i of sortedIdx) if (rng.gems[i]) spawnParticles(gemPos(rng,i).x, gemPos(rng,i).y, COLORS[rng.gems[i].color]);
      score += sortedIdx.length * 12 * level;
      if (score > best) best = score;
      rng.gems = rng.gems.filter((_,i) => !toDestroy.has(i));
      respaceGems(rng);
    } else {
      const insertIdx = insertIntoRing(rng, snapX, snapY);

      // Direct hit on a powerup — collect it
      const n = rng.gems.length;
      for (let d = -1; d <= 1; d++) {
        const ni = (insertIdx + d + n) % n;
        if (rng.gems[ni]?.powerup && ni !== insertIdx) {
          const pos = gemPos(rng, ni);
          collectPowerup(rng.gems[ni].powerup, pos.x, pos.y);
          rng.gems[ni].powerup = null;
        }
      }

      const matches = findMatches(rng, insertIdx);
      if (matches.length >= MATCH_COUNT) {
        score += matches.length * 10 * level;
        if (score > best) best = score;
        removeGems(rng, matches);
        if (rng.gems.length > 0) {
          const newIdx = Math.min(insertIdx, rng.gems.length - 1);
          const newMatches = findMatches(rng, newIdx);
          if (newMatches.length >= MATCH_COUNT) {
            score += newMatches.length * 20 * level;
            if (score > best) best = score;
            removeGems(rng, newMatches);
          }
        }
      }
    }
    updateHUD();
    checkOverflow();
    checkLevelComplete();
  }

  function getTotalPlanets() {
    return rings.reduce((s, r) => s + r.gems.length, 0);
  }

  function checkOverflow() {
    if (!gameRunning) return;
    const added = getTotalPlanets() - initialPlanetCount;
    if (added >= PLANET_OVERFLOW) triggerGameOver();
  }

  function triggerGameOver() {
    gameRunning = false;
    // Check high score
    const isHigh = score > 0 && window.HS;
    setTimeout(() => {
      $('orbit-overlay-title').textContent = '💀 GAME OVER';
      $('orbit-overlay-sub').textContent   = `SCORE: ${score.toLocaleString()} — TOO MANY PLANETS!`;
      $('orbit-overlay-btn').textContent   = '🔄 TRY AGAIN';
      $('orbit-overlay').classList.add('show');
      if (isHigh) setTimeout(() => HS.promptSubmit('orbit', score, score.toLocaleString()), 400);
    }, 400);
  }

  // ── STEP ─────────────────────────────────────────────────────────────
  function step(dt = 1) {
    // Freeze/dilate timers — only call updateHUD when value changes
    if (freezeTimer > 0) { freezeTimer -= dt; if (Math.floor(freezeTimer) % 10 === 0) updateHUD(); }
    if (dilateTimer > 0) { dilateTimer -= dt; if (Math.floor(dilateTimer) % 10 === 0) updateHUD(); }

    // Rotate rings (skipped while frozen)
    for (const ring of rings) {
      if (freezeTimer <= 0) {
        const baseSpeed = RING_SPEEDS[ring.idx % RING_SPEEDS.length] * (1 + (level - 1) * 0.12);
        const speedMult = dilateTimer > 0 ? 0.5 : 1;
        ring.speed    = baseSpeed * speedMult;
        ring.rotation += ring.speed * dt;
      }
    }

    // Black holes eat planets
    for (const bh of blackHoles) {
      bh.angle += bh.speed * dt;
      bh.life -= dt;
      bh.eatTimer = (bh.eatTimer ?? 90) - dt;
      const ring = rings.find(r => r.idx === bh.ringIdx);
      if (ring && bh.eatTimer <= 0 && ring.gems.length > 0) {
        bh.eatTimer = 90;
        // Find nearest gem to black hole angle
        const bhLocal = ((bh.angle - ring.rotation) % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
        let nearest = 0, minD = Infinity;
        ring.gems.forEach((g, i) => {
          const d = Math.abs(g.angle - bhLocal);
          const wrapped = Math.min(d, Math.PI*2 - d);
          if (wrapped < minD) { minD = wrapped; nearest = i; }
        });
        const pos = gemPos(ring, nearest);
        spawnParticles(pos.x, pos.y, { fill:'#a855f7', glow:'rgba(168,85,247,0.8)' });
        ring.gems.splice(nearest, 1);
        respaceGems(ring);
        score += 5 * level;
        if (score > best) best = score;
        updateHUD();
        checkLevelComplete();
      }
    }
    blackHoles = blackHoles.filter(bh => bh.life > 0);

    // Wormholes eat planets that pass through them
    for (const wh of wormholes) {
      wh.life -= dt;
      wh.spin += 0.08 * dt;
      // Update position to follow the ring as it rotates
      const ring = rings.find(r => r.idx === wh.ringIdx);
      if (ring) {
        const rR = ringRadius(ring.idx);
        // wh.angle is the local angle on the ring; add ring rotation for world pos
        const worldAngle = wh.angle + ring.rotation;
        wh.x = CX + Math.cos(worldAngle) * rR;
        wh.y = CY + Math.sin(worldAngle) * rR;
        // Check each planet on this ring for overlap with wormhole
        const toEat = [];
        for (let gi = ring.gems.length - 1; gi >= 0; gi--) {
          const pos = gemPos(ring, gi);
          if (Math.hypot(pos.x - wh.x, pos.y - wh.y) < wh.radius * 0.85) {
            toEat.push(gi);
          }
        }
        if (toEat.length > 0) {
          for (const gi of toEat) {
            const pos = gemPos(ring, gi);
            if (ring.gems[gi]?.powerup) collectPowerup(ring.gems[gi].powerup, pos.x, pos.y);
            // Spiral-in particles
            for (let p = 0; p < 6; p++) {
              const a = Math.random() * Math.PI * 2;
              particles.push({ x: pos.x, y: pos.y,
                vx: (wh.x - pos.x) * 0.1 + Math.cos(a),
                vy: (wh.y - pos.y) * 0.1 + Math.sin(a),
                alpha: 0.9, color: '#a855f7', glow: 'rgba(168,85,247,0.9)', r: 2 + Math.random()*2 });
            }
          }
          for (const gi of toEat) ring.gems.splice(gi, 1);
          respaceGems(ring);
          score += toEat.length * 8 * level;
          if (score > best) best = score;
          updateHUD();
          checkLevelComplete();
        }
      }
    }
    wormholes = wormholes.filter(wh => wh.life > 0);

    // Move projectile(s)
    const projs = projectile ? [projectile, ...(projectile.siblings||[])].filter(p=>!p._done) : [];
    for (const proj of projs) {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      if (proj.x < proj.r || proj.x > W - proj.r) { proj.vx *= -1; proj.x = Math.max(proj.r, Math.min(W - proj.r, proj.x)); }
      if (proj.y < proj.r) { proj.vy *= -1; proj.y = proj.r; }

      const dist = Math.hypot(proj.x - CX, proj.y - CY);
      const prevDist = proj.prevDist ?? 0;
      proj.prevDist = dist;

      if (proj.targetRingIdx !== undefined) {
        const rng = rings.find(r => r.idx === proj.targetRingIdx);
        if (rng) {
          const targetR = ringRadius(rng.idx);
          if (prevDist < targetR && dist >= targetR) {
            const angle = Math.atan2(proj.y - CY, proj.x - CX);
            const snapX = CX + Math.cos(angle) * targetR;
            const snapY = CY + Math.sin(angle) * targetR;
            landProjectile(proj, rng, snapX, snapY);
            proj._done = true;
          }
        }
      }
      if (!proj._done && (proj.x < -50 || proj.x > W+50 || proj.y < -50 || proj.y > H+50)) proj._done = true;
    }

    // Clean up done projectiles
    if (projectile) {
      const allDone = [projectile, ...(projectile.siblings||[])].every(p => p._done);
      if (allDone) projectile = null;
    }

    // Particles
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 0.08 * dt; p.alpha -= 0.028 * dt; p.vx *= Math.pow(0.97, dt); p.vy *= Math.pow(0.97, dt);
    }
    particles = particles.filter(p => p.alpha > 0);
  }

  // ── POWER-UP IMPLEMENTATIONS ─────────────────────────────────────────
  function usePower(key) {
    // key is optional — if called from button it's undefined, use heldPower
    const k = key || heldPower;
    if (!k || !gameRunning) return;

    // Toggle powers arm on first press, fire on shot
    if (['nova','chain'].includes(k)) {
      if (activePower === k) {
        activePower = null; novaMode = false;
      } else {
        activePower = k;
        novaMode = k === 'nova';
        // Armed feedback — burst from sun
        const armColor = k === 'nova' ? '#ff6a00' : '#ffe600';
        const armGlow  = k === 'nova' ? 'rgba(255,106,0,0.9)' : 'rgba(255,230,0,0.9)';
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const spd = 2 + Math.random() * 4;
          particles.push({ x: CX, y: CY, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
            alpha: 1, color: armColor, glow: armGlow, r: 2 + Math.random()*3 });
        }
        screenFlashOrbit(armColor, 0.1);
      }
      updateHUD();
      return;
    }

    // Instant powers — consume and clear slot
    heldPower   = null;
    activePower = null;

    switch (k) {
      case 'wave': {
        const tRing = getTargetRing();
        if (!tRing) break;
        tRing.gems.sort((a,b) => a.color - b.color);
        respaceGems(tRing);
        spawnRingBurst(tRing, '#00f5ff');
        // Extra outward wave particles
        const rWave = ringRadius(tRing.idx);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const px = CX + Math.cos(a) * rWave, py = CY + Math.sin(a) * rWave;
          particles.push({ x: px, y: py,
            vx: Math.cos(a)*2.5, vy: Math.sin(a)*2.5,
            alpha: 1, color: '#00f5ff', glow: 'rgba(0,245,255,0.9)', r: 3 + Math.random()*2 });
        }
        screenFlashOrbit('#00f5ff', 0.14);
        break;
      }
      case 'hole': {
        const tRing = getTargetRing();
        if (!tRing) break;
        blackHoles.push({ ringIdx: tRing.idx, angle: 0, speed: 0.04, life: 600 });
        // Implosion burst at ring centre
        const r = ringRadius(tRing.idx);
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2;
          const dist = r * (0.5 + Math.random() * 0.5);
          const px = CX + Math.cos(a) * dist, py = CY + Math.sin(a) * dist;
          // Particles fly inward toward ring entry point
          particles.push({ x: px, y: py,
            vx: (CX - px) * 0.04, vy: (CY - py) * 0.04,
            alpha: 0.9, color: '#a855f7', glow: 'rgba(168,85,247,0.9)', r: 2 + Math.random()*3 });
        }
        screenFlashOrbit('#a855f7', 0.12);
        break;
      }
      case 'freeze': {
        freezeTimer = 300;
        // Ice burst on every ring
        for (const r of rings) spawnRingBurst(r, '#00f5ff');
        // Extra ice crystals radiating from centre
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          const spd = 2 + Math.random() * 5;
          const dist = Math.random() * Math.min(W, H) * 0.4;
          particles.push({ x: CX + Math.cos(a)*dist*0.1, y: CY + Math.sin(a)*dist*0.1,
            vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
            alpha: 1, color: '#a8e6ff', glow: 'rgba(0,245,255,0.9)', r: 2 + Math.random()*3 });
        }
        screenFlashOrbit('#00f5ff', 0.18);
        break;
      }
      case 'dilate': {
        dilateTimer = 480; // 8 seconds at 60fps
        // Time-warp spiral burst
        for (const r of rings) spawnRingBurst(r, '#f59e0b');
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const spd = 1.5 + Math.random() * 3;
          particles.push({ x: CX, y: CY,
            vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
            alpha: 1, color: '#ffe600', glow: 'rgba(245,158,11,0.9)', r: 2 + Math.random()*2 });
        }
        screenFlashOrbit('#f59e0b', 0.15);
        break;
      }
      case 'worm': {
        // Place wormhole at the aim position on the targeted ring
        const tRing = getTargetRing();
        if (!tRing) break;
        const rR = ringRadius(tRing.idx);
        const wx = CX + Math.cos(shooter.angle) * rR;
        const wy = CY + Math.sin(shooter.angle) * rR;
        // Store LOCAL angle so step() can track: worldAngle = localAngle + ring.rotation
        const localAngle = shooter.angle - tRing.rotation;
        wormholes.push({
          x: wx, y: wy,
          ringIdx: tRing.idx,
          angle: localAngle,      // local position on ring
          life: 180,              // 3 seconds at 60fps
          spin: 0,                // animation rotation
          radius: GEM_RADIUS * 2.2,
        });
        break;
      }
    }
    updateHUD();
  }

  function getTargetRing() {
    if (rings.length === 0) return null;
    if (shooter.aimDist === undefined) return rings[rings.length-1];
    let best = rings[0], minD = Infinity;
    for (const r of rings) {
      const d = Math.abs(ringRadius(r.idx) - shooter.aimDist);
      if (d < minD) { minD = d; best = r; }
    }
    return best;
  }

  function spawnRingBurst(ring, color) {
    const r = ringRadius(ring.idx);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = CX + Math.cos(a) * r, py = CY + Math.sin(a) * r;
      particles.push({ x: px, y: py, vx: Math.cos(a)*1.5, vy: Math.sin(a)*1.5, alpha: 0.9, color, glow: color, r: 3 });
    }
  }

  // Transient screen flash — fades over ~40 frames via a dedicated overlay alpha
  let _flashColor = null, _flashAlpha = 0;
  function screenFlashOrbit(color, strength = 0.2) {
    _flashColor = color;
    _flashAlpha = strength;
  }

  // ── LEVEL CHECK ───────────────────────────────────────────────────────
  function checkLevelComplete() {
    if (rings.length === 0) return;
    const allCleared = rings.every(r => r.gems.length === 0);
    if (!allCleared) return;
    gameRunning = false;
    score += 200 * level;
    if (score > best) {
      best = score;
      if (window.HS) setTimeout(() => HS.promptSubmit('orbit', best, best.toLocaleString()), 400);
    }
    level++;
    numRings = Math.min(MAX_RINGS, BASE_RINGS + Math.floor((level - 1) / 2));
    updateHUD();
    setTimeout(() => {
      $('orbit-overlay-title').textContent = `✨ LEVEL ${level - 1} CLEAR!`;
      $('orbit-overlay-sub').textContent   = `+${200 * (level-1)} BONUS — READY FOR LEVEL ${level}?`;
      $('orbit-overlay-btn').textContent   = '▶ NEXT LEVEL';
      $('orbit-overlay').classList.add('show');
    }, 600);
  }

  // ── DRAW ──────────────────────────────────────────────────────────────
  // ── STAR FIELD (generated once, reused every frame) ──────────────────
  let stars = [];
  function buildStars() {
    stars = [];
    const count = 180;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.4 + 0.2,
        alpha: Math.random() * 0.7 + 0.2,
        twinkle: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.005,
      });
    }
  }

  // Planet texture config per colour index
  const PLANET_STYLES = [
    // cyan — ice world
    { base:'#0a3a4a', band:'#00f5ff', atmo:'rgba(0,245,255,0.25)', spot:'rgba(180,255,255,0.6)' },
    // pink — lava world
    { base:'#4a0a1a', band:'#ff2d78', atmo:'rgba(255,45,120,0.25)', spot:'rgba(255,180,200,0.6)' },
    // gold — desert world
    { base:'#4a2d00', band:'#f59e0b', atmo:'rgba(245,158,11,0.25)', spot:'rgba(255,230,120,0.6)' },
    // green — jungle world
    { base:'#0a2d12', band:'#4ade80', atmo:'rgba(74,222,128,0.25)', spot:'rgba(180,255,200,0.6)' },
    // purple — gas giant
    { base:'#1a0a3a', band:'#a855f7', atmo:'rgba(168,85,247,0.25)', spot:'rgba(220,180,255,0.6)' },
    // white — moon/ice
    { base:'#1a2030', band:'#e2e8f0', atmo:'rgba(226,232,240,0.2)', spot:'rgba(255,255,255,0.7)' },
  ];

  // ── OFFSCREEN CACHES ─────────────────────────────────────────────────
  let bgCanvas    = null;   // pre-rendered static background
  let planetCache = {};     // colorIdx → offscreen canvas sprite

  function buildBgCache() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width  = W; bgCanvas.height = H;
    const bc = bgCanvas.getContext('2d');
    bc.fillStyle = '#00010a'; bc.fillRect(0, 0, W, H);
    const nebDefs = [
      { cx:CX*0.4, cy:CY*0.6, r:Math.min(W,H)*0.55, stops:[['rgba(30,0,60,0.55)',0],['rgba(10,0,40,0.28)',0.5],['transparent',1]] },
      { cx:CX*1.6, cy:CY*1.3, r:Math.min(W,H)*0.5,  stops:[['rgba(0,20,60,0.5)',0],['rgba(0,10,30,0.22)',0.5],['transparent',1]] },
      { cx:CX*0.8, cy:CY*1.7, r:Math.min(W,H)*0.4,  stops:[['rgba(0,40,30,0.35)',0],['transparent',1]] },
    ];
    for (const n of nebDefs) {
      const g = bc.createRadialGradient(n.cx,n.cy,0,n.cx,n.cy,n.r);
      for (const [col,pos] of n.stops) g.addColorStop(pos,col);
      bc.fillStyle = g; bc.fillRect(0,0,W,H);
    }
    bc.fillStyle = '#ffffff';
    for (const s of stars) {
      bc.globalAlpha = s.alpha;
      bc.beginPath(); bc.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2); bc.fill();
    }
    bc.globalAlpha = 1;
  }

  function buildPlanetCache() {
    planetCache = {};
    const size = Math.ceil((GEM_RADIUS * 1.6) * 2 + 4);
    const half = size / 2;
    for (let ci = 0; ci < COLORS.length; ci++) {
      const oc = document.createElement('canvas');
      oc.width = oc.height = size;
      const c = oc.getContext('2d');
      const ps = PLANET_STYLES[ci], col = COLORS[ci];
      const px = half, py = half, r = GEM_RADIUS;
      // Atmosphere
      const ag = c.createRadialGradient(px,py,r*0.7,px,py,r*1.55);
      ag.addColorStop(0,ps.atmo); ag.addColorStop(1,'transparent');
      c.beginPath(); c.arc(px,py,r*1.55,0,Math.PI*2); c.fillStyle=ag; c.fill();
      // Sphere
      const sg = c.createRadialGradient(px-r*0.3,py-r*0.3,r*0.05,px,py,r);
      sg.addColorStop(0,col.fill); sg.addColorStop(0.45,ps.base); sg.addColorStop(1,'#000510');
      c.beginPath(); c.arc(px,py,r,0,Math.PI*2);
      c.fillStyle=sg; c.shadowColor=col.glow; c.shadowBlur=10; c.fill(); c.shadowBlur=0;
      // Bands
      c.save(); c.beginPath(); c.arc(px,py,r,0,Math.PI*2); c.clip(); c.globalAlpha=0.35;
      for (let b=-1;b<=1;b++){c.beginPath();c.ellipse(px,py+b*r*0.38,r,r*0.14,0,0,Math.PI*2);c.fillStyle=ps.band;c.fill();}
      c.restore();
      // Specular
      c.beginPath(); c.arc(px-r*0.32,py-r*0.32,r*0.28,0,Math.PI*2);
      const sh = c.createRadialGradient(px-r*0.32,py-r*0.32,0,px-r*0.32,py-r*0.32,r*0.28);
      sh.addColorStop(0,ps.spot); sh.addColorStop(1,'transparent');
      c.fillStyle=sh; c.fill();
      planetCache[ci] = { canvas:oc, half };
    }
  }

  function drawPlanet(px, py, radius, colorIdx, alpha) {
    const cached = planetCache[colorIdx];
    if (!cached) return;
    const scale    = radius / GEM_RADIUS;
    const drawSize = cached.canvas.width * scale;
    const half     = drawSize / 2;
    if (alpha !== undefined && alpha !== 1) {
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.drawImage(cached.canvas, px-half, py-half, drawSize, drawSize);
      ctx.restore();
    } else {
      ctx.drawImage(cached.canvas, px-half, py-half, drawSize, drawSize);
    }
  }

  // Cache sun gradient — rebuilt only when shooter color changes
  let _sunCache = { colorIdx: -1, core: null, corona: null };

  function draw(frameCount = 0) {
    ctx.clearRect(0, 0, W, H);

    // ── STATIC BACKGROUND (single blit) ──
    if (bgCanvas) {
      ctx.drawImage(bgCanvas, 0, 0);
      // Sparse twinkle — only update every 2 frames to halve cost
      if (frameCount % 2 === 0) {
        const t = performance.now() * 0.001;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < stars.length; i += 3) {
          const s = stars[i];
          const tw = Math.sin(t * s.speed * 10 + s.twinkle) * 0.35;
          if (tw > 0.05) {
            ctx.globalAlpha = s.alpha * tw;
            ctx.beginPath();
            ctx.arc(s.x * W, s.y * H, s.r * 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.fillStyle = '#00010a';
      ctx.fillRect(0, 0, W, H);
    }

    // ── RING TRACKS ──
    let targetRingIdx = -1;
    if (projectile) {
      targetRingIdx = projectile.targetRingIdx;
    } else if (shooter.aimDist !== undefined && rings.length > 0) {
      let minDiff = Infinity;
      for (const ring of rings) {
        const d = Math.abs(ringRadius(ring.idx) - shooter.aimDist);
        if (d < minDiff) { minDiff = d; targetRingIdx = ring.idx; }
      }
    }
    const shooterCol = shooter.gem ? COLORS[shooter.gem.color] : COLORS[0];

    for (let i = 0; i < rings.length; i++) {
      const r = ringRadius(i);
      const isTarget = rings[i].idx === targetRingIdx;
      ctx.save();
      if (isTarget) {
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.strokeStyle = shooterCol.fill;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = GEM_RADIUS * 2 + 4;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.strokeStyle = shooterCol.fill;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7;
        ctx.shadowColor = shooterCol.glow;
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100,140,200,0.06)';
        ctx.lineWidth = GEM_RADIUS * 2 + 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100,160,255,0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // ── PLANETS ON RINGS ──
    const _t = performance.now() * 0.001;
    for (const ring of rings) {
      for (let gi = 0; gi < ring.gems.length; gi++) {
        const pos = gemPos(ring, gi);
        const gem = ring.gems[gi];
        if (gem.powerup) {
          const pw = POWERS[gem.powerup];
          const pulse = 0.85 + Math.sin(_t * 4 + gi) * 0.15;
          ctx.save();
          // Outer aura — reuse gradient per frame but without extra save/restore overhead
          const aura = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, GEM_RADIUS * 1.8 * pulse);
          aura.addColorStop(0, 'rgba(245,158,11,0.4)');
          aura.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, GEM_RADIUS * 1.8 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = aura;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, GEM_RADIUS * pulse, 0, Math.PI * 2);
          ctx.fillStyle = '#2d1a00';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, GEM_RADIUS * pulse, 0, Math.PI * 2);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = 'rgba(245,158,11,1)';
          ctx.shadowBlur = 18;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.font = `${Math.round(GEM_RADIUS * 1.1)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pw.icon, pos.x, pos.y);
          ctx.restore();
        } else {
          drawPlanet(pos.x, pos.y, GEM_RADIUS * (gem.scale || 1), gem.color, gem.alpha);
        }
      }
    }

    // ── BLACK HOLES ──
    for (const bh of blackHoles) {
      const r = ringRadius(rings.find(rng => rng.idx === bh.ringIdx)?.idx ?? 0);
      const bx = CX + Math.cos(bh.angle) * r;
      const by = CY + Math.sin(bh.angle) * r;
      const lifeAlpha = Math.min(1, bh.life / 60);
      ctx.save();
      ctx.globalAlpha = lifeAlpha;
      const bhGrad = ctx.createRadialGradient(bx, by, 0, bx, by, GEM_RADIUS * 1.4);
      bhGrad.addColorStop(0,   '#000000');
      bhGrad.addColorStop(0.5, 'rgba(80,0,120,0.8)');
      bhGrad.addColorStop(1,   'transparent');
      ctx.beginPath();
      ctx.arc(bx, by, GEM_RADIUS * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = bhGrad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, GEM_RADIUS * 1.2, 0, Math.PI * 2);
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(168,85,247,0.9)';
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.restore();
    }

    // ── WORMHOLES ──
    for (const wh of wormholes) {
      const lifeAlpha = Math.min(1, wh.life / 30);
      ctx.save();
      ctx.globalAlpha = lifeAlpha;
      ctx.translate(wh.x, wh.y);
      for (let ring = 3; ring >= 1; ring--) {
        const rr = wh.radius * (ring / 3);
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(168,85,247,${0.12 * ring})`;
        ctx.lineWidth = 6 - ring;
        ctx.stroke();
      }
      ctx.rotate(wh.spin);
      // Batch all 4 spiral arms in one path with shadowBlur set once
      ctx.shadowColor = 'rgba(168,85,247,0.8)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      for (let arm = 0; arm < 4; arm++) {
        ctx.save();
        ctx.rotate((arm / 4) * Math.PI * 2);
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const frac = i / 40;
          const spiralR = wh.radius * frac;
          const spiralA = frac * Math.PI * 3;
          const sx = Math.cos(spiralA) * spiralR;
          const sy = Math.sin(spiralA) * spiralR;
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = `rgba(200,100,255,${0.5 - arm * 0.1})`;
        ctx.stroke();
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      const voidGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, wh.radius * 0.45);
      voidGrad.addColorStop(0, '#000000');
      voidGrad.addColorStop(0.6, 'rgba(30,0,60,0.95)');
      voidGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(0, 0, wh.radius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = voidGrad;
      ctx.fill();
      const pulse = 0.8 + Math.sin(_t * 6) * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, wh.radius * 0.45 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(192,132,252,1)';
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;
      const lifeFrac = wh.life / 180;
      ctx.beginPath();
      ctx.arc(0, 0, wh.radius * 0.9, -Math.PI/2, -Math.PI/2 + lifeFrac * Math.PI * 2);
      ctx.strokeStyle = 'rgba(245,158,11,0.7)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(245,158,11,0.8)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();
    }

    // ── ACTIVE POWER OVERLAYS ──
    // Persistent freeze tint (ice blue vignette while frozen)
    if (freezeTimer > 0) {
      const ft = Math.min(1, freezeTimer / 60);
      const pulse = 0.5 + Math.sin(performance.now() * 0.003) * 0.08;
      ctx.save();
      const fg = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
      fg.addColorStop(0, 'transparent');
      fg.addColorStop(1, `rgba(0,200,255,${ft * pulse * 0.22})`);
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, W, H);
      // Frost border
      ctx.strokeStyle = `rgba(0,245,255,${ft * 0.35})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.restore();
    }
    // Persistent dilate tint (amber shimmer while slowed)
    if (dilateTimer > 0) {
      const dt2 = Math.min(1, dilateTimer / 80);
      const pulse = 0.5 + Math.sin(performance.now() * 0.002) * 0.1;
      ctx.save();
      const dg = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
      dg.addColorStop(0, 'transparent');
      dg.addColorStop(1, `rgba(245,158,11,${dt2 * pulse * 0.18})`);
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // Nova armed — red glow around sun
    if (novaMode) {
      const pulse = 0.6 + Math.sin(performance.now() * 0.008) * 0.4;
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, 28 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,80,0,${0.18 * pulse})`;
      ctx.shadowColor = '#ff6a00';
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    // Chain armed — yellow arc around sun
    if (activePower === 'chain') {
      const pulse = 0.6 + Math.sin(performance.now() * 0.01) * 0.4;
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, 28 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,230,0,${0.18 * pulse})`;
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    // Transient screen flash (activation burst)
    if (_flashAlpha > 0.005) {
      ctx.save();
      ctx.globalAlpha = _flashAlpha;
      ctx.fillStyle = _flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      _flashAlpha *= 0.82; // decay each frame
    }

    // ── PARTICLES — batched, no save/restore per particle ──
    if (particles.length > 0) {
      // Group by glow color to minimise shadowColor changes
      ctx.shadowBlur = 6;
      let lastGlow = null;
      for (const p of particles) {
        if (p.glow !== lastGlow) { ctx.shadowColor = p.glow; lastGlow = p.glow; }
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // ── PROJECTILE (planet in flight) ──
    const allProjs = projectile
      ? [projectile, ...(projectile.siblings || [])].filter(p => !p._done)
      : [];
    for (const proj of allProjs) {
      drawPlanet(proj.x, proj.y, GEM_RADIUS, proj.color, 1);
      // Motion trail
      ctx.save();
      const trailCol = COLORS[proj.color];
      ctx.strokeStyle = trailCol.fill;
      ctx.lineWidth = 2;
      ctx.shadowColor = trailCol.glow;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(proj.x, proj.y);
      ctx.lineTo(proj.x - proj.vx * 5, proj.y - proj.vy * 5);
      ctx.stroke();
      ctx.restore();
    }

    // ── LAUNCHER (sun at centre) ──
    if (gameRunning) {
      const col = shooter.gem ? COLORS[shooter.gem.color] : COLORS[0];

      // Aim line
      ctx.save();
      ctx.setLineDash([3, 9]);
      ctx.strokeStyle = col.fill;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 1;
      ctx.shadowColor = col.glow;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      const aimLen = ringRadius(rings.length > 0 ? rings.length - 1 : 0) + GEM_RADIUS * 3;
      ctx.lineTo(
        CX + Math.cos(shooter.angle) * aimLen,
        CY + Math.sin(shooter.angle) * aimLen
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Loaded planet orbiting the sun
      if (shooter.gem && !projectile) {
        drawPlanet(CX, CY, GEM_RADIUS + 2, shooter.gem.color, 1);
      }

      // Central sun — cache gradient, only rebuild when colour changes
      const sunColorIdx = shooter.gem ? shooter.gem.color : 0;
      if (_sunCache.colorIdx !== sunColorIdx) {
        const sunR = 10;
        const sunCol = COLORS[sunColorIdx];
        const core = ctx.createRadialGradient(CX, CY, 0, CX, CY, sunR);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.35, sunCol.fill);
        core.addColorStop(1, sunCol.fill);
        _sunCache = { colorIdx: sunColorIdx, core, fill: sunCol.fill, glow: sunCol.glow };
      }
      ctx.save();
      const sunR = 10;
      ctx.beginPath();
      ctx.arc(CX, CY, sunR, 0, Math.PI * 2);
      ctx.fillStyle = _sunCache.core;
      ctx.shadowColor = _sunCache.fill;
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(CX, CY, sunR * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = _sunCache.fill;
      ctx.globalAlpha = 0.15;
      ctx.shadowColor = _sunCache.fill;
      ctx.shadowBlur = 40;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  let _lastTs = 0;
  let _frameCount = 0;
  function loop(ts) {
    if (document.hidden) { animId = requestAnimationFrame(loop); return; }
    // Delta-time: cap at 100ms so a tab-switch doesn't cause a huge jump
    const dt = Math.min((ts - (_lastTs || ts)) / (1000 / 60), 2.5);
    _lastTs = ts;
    _frameCount++;
    if (gameRunning) step(dt);
    draw(_frameCount);
    animId = requestAnimationFrame(loop);
  }

  // ── RESIZE ────────────────────────────────────────────────────────────
  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    // Try wrap first, then the orbit-screen container, then window as last resort
    const screen = document.getElementById('orbit-screen');
    const refEl  = (wrap.clientWidth && wrap.clientHeight) ? wrap
                 : (screen && screen.clientWidth && screen.clientHeight) ? screen
                 : null;
    W = refEl ? refEl.clientWidth  : (window.innerWidth  * 0.65) | 0;
    H = refEl ? refEl.clientHeight : (window.innerHeight - 64)   | 0;
    // Clamp to sensible minimums
    if (W < 200) W = 500;
    if (H < 200) H = 600;
    canvas.width  = W;
    canvas.height = H;
    CX = W / 2;
    CY = H / 2;
    _sunCache = { colorIdx: -1, core: null };
    // Rebuild caches for new dimensions
    if (stars.length) { buildBgCache(); buildPlanetCache(); }
  }

  let _resizeObs = null;
  function startResizeWatch() {
    if (_resizeObs) { _resizeObs.disconnect(); }
    _resizeObs = new ResizeObserver(() => resize());
    _resizeObs.observe(canvas.parentElement);
  }

  // ── INPUT ─────────────────────────────────────────────────────────────
  function onMouseMove(e) {
    if (!gameRunning) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    const my = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
    shooter.angle    = Math.atan2(my - CY, mx - CX);
    shooter.aimDist  = Math.hypot(mx - CX, my - CY);
  }

  function onClick(e) {
    if (!gameRunning) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX ?? e.touches?.[0]?.clientX ?? CX) - rect.left;
    const my = (e.clientY ?? e.touches?.[0]?.clientY ?? CY) - rect.top;
    shooter.angle   = Math.atan2(my - CY, mx - CX);
    shooter.aimDist = Math.hypot(mx - CX, my - CY);
    if (!projectile) fire();
  }

  function bindInput() {
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('touchmove', e => { e.preventDefault(); onMouseMove(e); }, { passive: false });
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchend', e => { e.preventDefault(); onClick(e); }, { passive: false });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────
  function init() {
    canvas     = $('orbit-canvas');
    ctx        = canvas.getContext('2d');
    nextCanvas = $('orbit-next-canvas');
    nextCtx    = nextCanvas.getContext('2d');

    // If neither the wrap nor the screen element has size yet, retry after a frame
    const wrap   = canvas.parentElement;
    const screen = document.getElementById('orbit-screen');
    const hasSize = (wrap.clientWidth && wrap.clientHeight)
                 || (screen && screen.clientWidth && screen.clientHeight);
    if (!hasSize) {
      setTimeout(() => init(), 60);
      return;
    }

    score = 0; best = parseInt(localStorage.getItem('orbit-best') || '0'); level = 1; numRings = BASE_RINGS;
    heldPower = null; activePower = null;
    freezeTimer = 0; dilateTimer = 0; blackHoles = []; wormholes = [];
    novaMode = false; bombMode = false; initialPlanetCount = 0;
    particles  = []; projectile = null; gameRunning = false;

    resize();
    buildStars();
    buildBgCache();
    buildPlanetCache();
    startResizeWatch();
    bindInput();
    $('orbit-overlay-sub').textContent   = 'LAUNCH PLANETS INTO ORBIT — MATCH 3 TO DESTROY';
    $('orbit-overlay-btn').textContent   = '▶ PLAY';
    $('orbit-overlay').classList.add('show');

    updateHUD();
    if (animId) cancelAnimationFrame(animId);
    loop();
  }

  function start() {
    $('orbit-overlay').classList.remove('show');
    buildLevel();
    advanceShooter();
    gameRunning = true;
    updateHUD();
  }

  function destroy() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
    if (canvas) {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
    }
    gameRunning = false;
  }

  function newGame() {
    score = 0; best = parseInt(localStorage.getItem('orbit-best') || '0'); level = 1; numRings = BASE_RINGS;
    heldPower = null; activePower = null;
    freezeTimer = 0; dilateTimer = 0; blackHoles = []; wormholes = [];
    novaMode = false; bombMode = false; initialPlanetCount = 0;
    particles  = []; projectile = null; gameRunning = false;
    $('orbit-overlay-title').textContent = '🪐 ORBIT';
    $('orbit-overlay-sub').textContent   = 'LAUNCH PLANETS INTO ORBIT — MATCH 3 TO DESTROY';
    $('orbit-overlay-btn').textContent   = '▶ PLAY';
    $('orbit-overlay').classList.add('show');
    updateHUD();
  }

  function useReverse() { usePower('wave'); } // legacy compat
  function useBomb()    { usePower('nova'); } // legacy compat

  return { init, destroy, start, newGame, usePower, useReverse, useBomb, getCurrentScore: () => score };
})();
