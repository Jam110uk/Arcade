// ============================================================
// BUST-A-MOVE 3D  —  pb3d.js
// Three.js r128  —  third-person arc view
// Real 3D bubble spheres with lighting, depth layers,
// boss encounters, power-up bubbles.
// Arcade contract: export default { newGame, destroy, togglePause, getCurrentScore }
// ============================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export default (() => {

  // ── SFX ────────────────────────────────────────────────────────
  const SFX = (() => {
    let ctx = null;
    function gc() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    function tone(f, d, type = 'sine', vol = 0.15, fEnd = null, delay = 0) {
      try {
        const c = gc(), o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination); o.type = type;
        const t = c.currentTime + delay;
        o.frequency.setValueAtTime(f, t);
        if (fEnd != null) o.frequency.linearRampToValueAtTime(fEnd, t + d);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.start(t); o.stop(t + d + 0.01);
      } catch (_) {}
    }
    function noise(d, vol = 0.1, delay = 0) {
      try {
        const c = gc(), buf = c.createBuffer(1, c.sampleRate * d, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const s = c.createBufferSource(), g = c.createGain();
        s.buffer = buf; s.connect(g); g.connect(c.destination);
        const t = c.currentTime + delay;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        s.start(t); s.stop(t + d + 0.01);
      } catch (_) {}
    }
    return {
      shoot()    { tone(580, 0.08, 'sine', 0.14, 720); },
      bounce()   { tone(320, 0.06, 'sine', 0.10, 250); },
      land()     { tone(200, 0.10, 'sine', 0.10, 170); noise(0.05, 0.04); },
      pop(n)     { tone(650 + n * 30, 0.07, 'square', 0.13); noise(0.07, 0.07); },
      floaters(n){ for (let i = 0; i < Math.min(n,5); i++) tone(420 - i*30, 0.13, 'sine', 0.10, 210, i*0.05); },
      chain(n)   { for (let i = 0; i < Math.min(n,5); i++) tone(440 * Math.pow(1.22,i), 0.11, 'square', 0.14, null, i*0.07); },
      levelUp()  { [523,659,784,1047,1319].forEach((f,i) => tone(f,0.13,'square',0.14,null,i*0.09)); setTimeout(()=>tone(1319,0.4,'sine',0.12,1047),520); },
      gameOver() { [440,370,330,262].forEach((f,i) => tone(f,0.22,'sine',0.14,null,i*0.19)); },
      powerup()  { [523,659,880].forEach((f,i) => tone(f,0.1,'square',0.14,null,i*0.07)); },
      resume()   { if (ctx && ctx.state==='suspended') ctx.resume().catch(()=>{}); },
    };
  })();

  // ── Palette ────────────────────────────────────────────────────
  const COLORS_HEX = [0xff2d78, 0x00f5ff, 0x39ff14, 0xffe600, 0xbf00ff, 0xff6a00, 0xffffff];
  const COLORS_CSS = ['#ff2d78','#00f5ff','#39ff14','#ffe600','#bf00ff','#ff6a00','#ffffff'];
  const COLOR_COUNT = COLORS_HEX.length - 1; // white = power-up only

  // ── Power-ups ──────────────────────────────────────────────────
  const POWERS = {
    bomb:  { label: '💣 BOMB',  color: '#ff2d78' },
    laser: { label: '🔫 LASER', color: '#00f5ff' },
    wild:  { label: '🌈 WILD',  color: '#ffffff' },
  };
  const POWER_KEYS = Object.keys(POWERS);
  const POWER_CHANCE = 0.08;

  // ── Grid geometry ──────────────────────────────────────────────
  const LAYERS     = 3;
  const BUBBLE_R   = 0.28;
  const HEX_DIAM   = BUBBLE_R * 2;
  const ROW_H      = BUBBLE_R * Math.sqrt(3);
  const COLS_EVEN  = 9;
  const COLS_ODD   = 8;
  const ROWS_INIT  = 4;
  const DROP_SECS  = 55;

  // Layer Z positions: camera at +Z, grid recedes toward -Z
  const LAYER_Z     = [4.5, 2.2, 0.0];
  const LAYER_CEIL_Y = 2.8;
  const GRID_X_SPAN  = COLS_EVEN * HEX_DIAM * 0.92;

  // Cannon
  const CANNON_POS = new THREE.Vector3(0, -2.4, 5.5);
  const BALL_SPEED = 18;

  // ── Three.js state ─────────────────────────────────────────────
  let renderer, scene, camera;
  let animId = null;
  let container = null;
  let _resizeObs = null;

  let cannonGroup = null, cannonBarrel = null;
  let aimLine = null;
  let bossGroup = null, bossEyeMesh = null;

  let bubbleMeshes = []; // { mesh, layer, row, col, ci, power }
  let ball = null;       // { mesh, pos, vel, ci, power, bounces }
  let particles = [];    // { mesh, vx,vy,vz, life, maxLife }
  let scoreSprites = []; // { mesh, life, maxLife }

  // Material cache
  const _matCache = {};
  function getBubbleMat(ci) {
    if (!_matCache[ci]) {
      _matCache[ci] = new THREE.MeshPhongMaterial({
        color: COLORS_HEX[ci], emissive: COLORS_HEX[ci],
        emissiveIntensity: 0.15, shininess: 130, specular: 0xffffff,
      });
    }
    return _matCache[ci];
  }

  let _sphereGeo = null;
  function getSphereGeo() {
    if (!_sphereGeo) _sphereGeo = new THREE.SphereGeometry(BUBBLE_R, 18, 14);
    return _sphereGeo;
  }

  // ── Game state ─────────────────────────────────────────────────
  let grid = [];
  let queue = [], heldSlot = null, canSwap = true;
  let score = 0, best = 0, level = 1;
  let chain = 0, chainTimer = 0;
  let paused = false, dead = false, won = false;
  let dropTimer = DROP_SECS * 1000, elapsedMs = 0, lastTs = 0;
  let activePower = null;
  let bossMode = false, bossHp = 0, bossMaxHp = 0, bossAnim = 0, bossShootTimer = 0;

  // Aim angles
  let aimH = 0;    // horizontal swing  (-π*0.44 … π*0.44)
  let aimV = 0.45; // vertical tilt  (0.12 … 1.15)

  // Keyboard
  let leftHeld=false, rightHeld=false, upHeld=false, downHeld=false;
  const AIM_SPD = 0.03, TILT_SPD = 0.025;

  // ── Helpers ────────────────────────────────────────────────────
  function cellPos(layer, row, col) {
    const isOdd  = row % 2 === 1;
    const cols   = isOdd ? COLS_ODD : COLS_EVEN;
    const totalW = cols * HEX_DIAM + (isOdd ? BUBBLE_R : 0);
    const startX = -totalW / 2 + BUBBLE_R + (isOdd ? BUBBLE_R : 0);
    return new THREE.Vector3(
      startX + col * HEX_DIAM,
      LAYER_CEIL_Y - row * ROW_H - BUBBLE_R,
      LAYER_Z[layer]
    );
  }
  function colsForRow(row) { return row % 2 === 0 ? COLS_EVEN : COLS_ODD; }

  // ── Three.js init ──────────────────────────────────────────────
  function initThree() {
    container = document.getElementById('bam3d-canvas-container');
    if (!container) return;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x010510, 1);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010510, 0.042);

    // Camera sits behind cannon, slightly elevated, looking at grid
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    camera.position.set(0, 0.8, 10.5);
    camera.lookAt(0, 1.5, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0x112244, 0.85));

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(5, 10, 8); dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024); scene.add(dir);

    const rim = new THREE.DirectionalLight(0xff2d78, 0.45);
    rim.position.set(-6, 4, -4); scene.add(rim);

    // Per-layer coloured point lights for depth feel
    const layerColors = [0x00f5ff, 0xbf00ff, 0xff2d78];
    LAYER_Z.forEach((z, i) => {
      const pl = new THREE.PointLight(layerColors[i], 0.55, 14);
      pl.position.set(0, 3, z); scene.add(pl);
    });

    _buildBackground();
    _buildCannon();
    _buildAimLine();

    _resizeObs = new ResizeObserver(() => _resize());
    _resizeObs.observe(container);
    _resize();
  }

  function _resize() {
    if (!renderer || !container) return;
    const w = container.clientWidth  || 480;
    const h = container.clientHeight || 640;
    renderer.setSize(w, h);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }

  // ── Background ─────────────────────────────────────────────────
  function _buildBackground() {
    // Starfield
    const count = 900;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (Math.random()-0.5)*90;
      pos[i*3+1] = (Math.random()-0.5)*70;
      pos[i*3+2] = (Math.random()-0.5)*50 - 5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc8e8ff, size: 0.07, transparent: true, opacity: 0.7 })));

    // Perspective grid at back wall
    const grid = new THREE.GridHelper(30, 30, 0x003355, 0x001122);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(0, 0, -2);
    scene.add(grid);

    // Neon pillars
    [-5.5, 5.5].forEach((x, i) => {
      const pts = [new THREE.Vector3(x,-7,-2), new THREE.Vector3(x,7,9)];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: i===0 ? 0x00f5ff : 0xff2d78 })
      );
      scene.add(line);
    });

    // Frame outlines for each depth layer
    LAYER_Z.forEach((z, i) => {
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(GRID_X_SPAN+1.2, 6.8)),
        new THREE.LineBasicMaterial({ color: [0x00f5ff,0xbf00ff,0xff2d78][i], transparent: true, opacity: 0.14+i*0.06 })
      );
      frame.position.set(0, LAYER_CEIL_Y - 3.2, z);
      scene.add(frame);
    });

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 22),
      new THREE.MeshPhongMaterial({ color: 0x010a20, shininess: 40 })
    );
    floor.rotation.x = -Math.PI/2;
    floor.position.y = -5;
    floor.receiveShadow = true;
    scene.add(floor);
  }

  // ── Cannon ─────────────────────────────────────────────────────
  function _buildCannon() {
    cannonGroup = new THREE.Group();
    cannonGroup.position.copy(CANNON_POS);
    scene.add(cannonGroup);

    // Base disc
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 0.22, 24),
      new THREE.MeshPhongMaterial({ color: 0x0a1e30, emissive: 0x002244, shininess: 80 })
    );
    base.castShadow = true;
    cannonGroup.add(base);

    // Glow ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.03, 8, 32),
      new THREE.MeshPhongMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.6 })
    );
    ring.rotation.x = Math.PI/2; ring.position.y = 0.11;
    cannonGroup.add(ring);

    // Barrel pivot
    cannonBarrel = new THREE.Group();
    cannonBarrel.position.y = 0.11;
    cannonGroup.add(cannonBarrel);

    // Barrel tube
    const barMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.13, 1.1, 12),
      new THREE.MeshPhongMaterial({ color: 0x2266aa, emissive: 0x001133, shininess: 120 })
    );
    barMesh.position.y = 0.55; barMesh.castShadow = true;
    cannonBarrel.add(barMesh);

    // Muzzle ring
    const muzzle = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.025, 8, 18),
      new THREE.MeshPhongMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.9 })
    );
    muzzle.position.y = 1.1;
    cannonBarrel.add(muzzle);

    // Bubble sitting in cannon
    const bubbleInCannon = new THREE.Mesh(getSphereGeo(), getBubbleMat(0).clone());
    bubbleInCannon.name = 'cannonBubble';
    bubbleInCannon.scale.setScalar(0.88);
    cannonGroup.add(bubbleInCannon);
  }

  function _updateCannonBubble() {
    if (!cannonGroup || !queue[0]) return;
    const cb = cannonGroup.getObjectByName('cannonBubble');
    if (cb) cb.material = getBubbleMat(queue[0].ci).clone();
  }

  // ── Aim line ───────────────────────────────────────────────────
  function _buildAimLine() {
    const mat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0.5 });
    aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0)]), mat);
    scene.add(aimLine);
  }

  function _updateAimLine() {
    if (!aimLine) return;
    if (!queue[0] || dead || won || paused || ball) { aimLine.visible = false; return; }
    aimLine.visible = true;

    const dir = _shootDir();
    const pts = [];
    const p = new THREE.Vector3().copy(CANNON_POS).add(new THREE.Vector3(0, 0.65, 0));
    const v = dir.clone();
    const wallX = GRID_X_SPAN / 2 + 0.15;
    pts.push(p.clone());

    for (let i = 0; i < 130; i++) {
      p.addScaledVector(v, 0.16);
      if (p.x < -wallX) { p.x = -wallX; v.x =  Math.abs(v.x); pts.push(p.clone()); }
      if (p.x >  wallX) { p.x =  wallX; v.x = -Math.abs(v.x); pts.push(p.clone()); }
      if (p.y > LAYER_CEIL_Y + 0.4) { pts.push(p.clone()); break; }
      pts.push(p.clone());
      if (i > 10) {
        let hit = false;
        for (const b of bubbleMeshes) {
          if (b.mesh && b.mesh.parent && p.distanceTo(b.mesh.position) < HEX_DIAM * 1.1) { hit = true; break; }
        }
        if (hit) break;
      }
    }

    aimLine.geometry.dispose();
    aimLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    aimLine.computeLineDistances();
    aimLine.material.color.setHex(COLORS_HEX[queue[0].ci]);
  }

  // ── Grid ───────────────────────────────────────────────────────
  function generateLevel() {
    // Clear
    bubbleMeshes.forEach(b => { if (b.mesh) scene.remove(b.mesh); });
    bubbleMeshes = [];
    grid = [];

    const numColors = Math.min(2 + Math.floor(level * 0.7), COLOR_COUNT);
    const pal = Array.from({ length: numColors }, (_, i) => i);
    const rows = Math.min(ROWS_INIT + Math.floor(level / 3), 7);

    for (let l = 0; l < LAYERS; l++) {
      grid[l] = [];
      const layerRows = l === 0 ? Math.ceil(rows * 0.6) : rows;
      for (let r = 0; r < layerRows; r++) {
        grid[l][r] = [];
        const cols = colsForRow(r);
        for (let c = 0; c < cols; c++) {
          if (l === 0 && Math.random() < 0.28) { grid[l][r][c] = null; continue; }
          const ci = pal[Math.floor(Math.random() * pal.length)];
          const power = Math.random() < 0.045 ? POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)] : null;
          const mesh = _makeBubbleMesh(ci, power);
          mesh.position.copy(cellPos(l, r, c));
          scene.add(mesh);
          grid[l][r][c] = { ci, power, mesh };
          bubbleMeshes.push({ mesh, layer: l, row: r, col: c, ci, power });
        }
      }
    }

    // Boss every 3rd level
    if (level % 3 === 0) {
      bossMode = true;
      bossMaxHp = 15 + Math.floor(level / 3) * 8;
      bossHp = bossMaxHp;
      bossShootTimer = 4000;
      _buildBoss();
    } else {
      bossMode = false;
      _removeBoss();
    }
  }

  function _makeBubbleMesh(ci, power) {
    const mat = getBubbleMat(ci).clone();
    if (power) mat.emissiveIntensity = 0.5;
    const mesh = new THREE.Mesh(getSphereGeo(), mat);
    mesh.castShadow = true;
    if (power) {
      // Power-up ring
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(BUBBLE_R + 0.07, 0.022, 6, 22),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 })
      );
      ring.userData.isPowerRing = true;
      mesh.add(ring);
    }
    return mesh;
  }

  function countBubbles() {
    let n = 0;
    for (const l of grid) for (const r of (l||[])) for (const b of (r||[])) if (b) n++;
    return n;
  }

  function getColorsInGrid() {
    const s = new Set();
    for (const l of grid) for (const r of (l||[])) for (const b of (r||[])) if (b && b.ci < COLOR_COUNT) s.add(b.ci);
    return [...s];
  }

  // ── Boss ───────────────────────────────────────────────────────
  function _buildBoss() {
    _removeBoss();
    bossGroup = new THREE.Group();
    bossGroup.position.set(0, LAYER_CEIL_Y + 1.2, LAYER_Z[0] - 0.5);
    scene.add(bossGroup);

    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.9, 1),
      new THREE.MeshPhongMaterial({ color: 0x880033, emissive: 0xff2d78, emissiveIntensity: 0.22, shininess: 80 })
    );
    bossGroup.add(body);

    bossEyeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshPhongMaterial({ color: 0xff0044, emissive: 0xff0044, emissiveIntensity: 0.9, shininess: 200 })
    );
    bossEyeMesh.position.set(0, 0.1, 0.78);
    bossGroup.add(bossEyeMesh);

    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.05, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true, opacity: 0.45 })
    );
    aura.rotation.x = Math.PI/2;
    bossGroup.add(aura);
  }

  function _removeBoss() {
    if (bossGroup) { scene.remove(bossGroup); bossGroup = null; bossEyeMesh = null; }
  }

  // ── Queue ──────────────────────────────────────────────────────
  function makeSlot() {
    const cols = getColorsInGrid();
    const ci = cols.length ? cols[Math.floor(Math.random() * cols.length)] : Math.floor(Math.random() * COLOR_COUNT);
    const power = Math.random() < POWER_CHANCE ? POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)] : null;
    return { ci: power === 'wild' ? 6 : ci, power };
  }

  function refillQueue() {
    while (queue.length < 2) queue.push(makeSlot());
    _updateCannonBubble();
    updateQueueUI();
  }

  function consumeQueue() {
    const slot = queue.shift();
    refillQueue();
    return slot;
  }

  // ── Shoot ──────────────────────────────────────────────────────
  function _shootDir() {
    return new THREE.Vector3(
      Math.sin(aimH) * Math.cos(aimV * 0.9),
      Math.sin(aimV * 0.55),
      -Math.cos(aimH) * Math.cos(aimV * 0.4)
    ).normalize();
  }

  function shoot() {
    if (ball || paused || dead || won || !queue.length) return;
    SFX.resume(); SFX.shoot();
    const slot = consumeQueue();
    canSwap = true;

    const mesh = _makeBubbleMesh(slot.ci, slot.power);
    const startPos = CANNON_POS.clone().add(new THREE.Vector3(0, 0.65, 0));
    mesh.position.copy(startPos);
    scene.add(mesh);

    ball = {
      mesh,
      pos: startPos.clone(),
      vel: _shootDir().multiplyScalar(BALL_SPEED),
      ci: slot.ci, power: slot.power,
      bounces: 0,
    };
  }

  function swapHold() {
    if (!canSwap || paused || dead || won || ball) return;
    if (!heldSlot) { heldSlot = queue.shift(); refillQueue(); }
    else { const tmp = heldSlot; heldSlot = queue.shift(); queue.unshift(tmp); }
    canSwap = false;
    updateQueueUI();
  }

  function usePower() {
    if (!activePower || dead || won || paused || ball) return;
    const type = activePower; activePower = null;
    SFX.powerup();
    let total = 0;

    if (type === 'bomb') {
      const l = LAYERS - 1;
      for (let r = 0; r < (grid[l]||[]).length; r++)
        for (let c = 0; c < colsForRow(r); c++)
          if (grid[l][r] && grid[l][r][c]) { _popBubble(l,r,c); total++; }
      score += total * 30 * level;
      _addScorePopup(0, 1.5, 2.0, `💣 BOMB! +${total*30*level}`);

    } else if (type === 'laser') {
      for (let l = 0; l < LAYERS; l++)
        for (let r = 0; r < (grid[l]||[]).length; r++) {
          const mid = Math.floor(colsForRow(r)/2);
          [-1,0,1].forEach(dc => {
            const c = mid+dc;
            if (c>=0 && c<colsForRow(r) && grid[l][r] && grid[l][r][c]) { _popBubble(l,r,c); total++; }
          });
        }
      score += total * 40 * level;
      _addScorePopup(0, 1.5, 2.0, `🔫 LASER! +${total*40*level}`);

    } else if (type === 'wild') {
      const counts = {};
      for (const la of grid) for (const ro of (la||[])) for (const b of (ro||[])) if (b) counts[b.ci]=(counts[b.ci]||0)+1;
      const topCi = +Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
      for (let l=0;l<LAYERS;l++) for (let r=0;r<(grid[l]||[]).length;r++) for (let c=0;c<colsForRow(r);c++)
        if (grid[l][r] && grid[l][r][c] && grid[l][r][c].ci===topCi) { _popBubble(l,r,c); total++; }
      score += total * 35 * level;
      _addScorePopup(0, 1.5, 2.0, `🌈 WILD! +${total*35*level}`);
    }

    if (score > best) best = score;
    updateUI();
    if (window.FX) { FX.screenFlash('#ffe600', 0.2); FX.shake(5); }
  }

  // ── Physics update ─────────────────────────────────────────────
  function update(dt) {
    // Keyboard aim
    if (leftHeld)  aimH = Math.max(-Math.PI*0.44, aimH - AIM_SPD);
    if (rightHeld) aimH = Math.min( Math.PI*0.44, aimH + AIM_SPD);
    if (upHeld)    aimV = Math.min(1.15, aimV + TILT_SPD);
    if (downHeld)  aimV = Math.max(0.12, aimV - TILT_SPD);

    // Rotate cannon barrel
    if (cannonBarrel) {
      cannonBarrel.rotation.z = -aimH;
      cannonBarrel.rotation.x = aimV * 0.65 - 0.3;
    }

    // Chain timer
    if (chainTimer > 0) { chainTimer -= dt; if (chainTimer <= 0) { chain = 0; updateUI(); } }

    // Drop timer
    if (!dead && !won) {
      dropTimer -= dt;
      if (dropTimer <= 0) {
        dropTimer = DROP_SECS * 1000;
        _addFrontRow();
        if (_gridTooLow()) { doGameOver(); return; }
      }
      elapsedMs += dt;
    }

    // Ball movement — sub-stepped
    if (ball) {
      const steps = 3;
      const stepS = dt / 1000 / steps;
      let placed = false;

      for (let si = 0; si < steps && !placed; si++) {
        ball.pos.addScaledVector(ball.vel, stepS);
        ball.mesh.position.copy(ball.pos);

        const wallX = GRID_X_SPAN / 2 + 0.1;
        if (ball.pos.x < -wallX) { ball.pos.x=-wallX; ball.vel.x= Math.abs(ball.vel.x); ball.bounces++; SFX.bounce(); }
        if (ball.pos.x >  wallX) { ball.pos.x= wallX; ball.vel.x=-Math.abs(ball.vel.x); ball.bounces++; SFX.bounce(); }

        if (ball.pos.y > LAYER_CEIL_Y + 0.25 || ball.pos.z < LAYER_Z[0] - 1.2) { _placeBall(); placed = true; break; }
        if (ball.bounces > 22 || ball.pos.z < -4) { _placeBall(); placed = true; break; }

        for (const b of bubbleMeshes) {
          if (b.mesh && b.mesh.parent && ball.pos.distanceTo(b.mesh.position) < HEX_DIAM * 1.05) {
            _placeBall(); placed = true; break;
          }
        }

        if (!placed && bossMode && bossGroup && ball.pos.distanceTo(bossGroup.position) < 1.3) {
          _hitBoss(); scene.remove(ball.mesh); ball = null; placed = true;
        }
      }

      if (!placed && ball && ball.pos.y < -7) { scene.remove(ball.mesh); ball = null; }
    }

    // Particles
    const dtS = dt / 1000;
    particles.forEach(p => {
      p.mesh.position.x += p.vx * dtS;
      p.mesh.position.y += p.vy * dtS;
      p.mesh.position.z += p.vz * dtS;
      p.vy -= 11 * dtS;
      p.life -= dt;
      const t = Math.max(0, p.life / p.maxLife);
      if (p.mesh.material) p.mesh.material.opacity = t;
      p.mesh.scale.setScalar(t * 0.8 + 0.2);
    });
    particles = particles.filter(p => { if (p.life <= 0) { scene.remove(p.mesh); return false; } return true; });

    // Score sprites
    scoreSprites.forEach(s => {
      s.mesh.position.y += 0.85 * dtS;
      s.life -= dt;
      const t = Math.max(0, s.life / s.maxLife);
      if (s.mesh.material) s.mesh.material.opacity = t;
    });
    scoreSprites = scoreSprites.filter(s => { if (s.life <= 0) { scene.remove(s.mesh); return false; } return true; });

    // Boss
    if (bossMode && bossHp > 0 && bossGroup) {
      bossAnim += dt * 0.002;
      bossGroup.position.x = Math.sin(bossAnim) * 2.5;
      bossGroup.position.y = LAYER_CEIL_Y + 1.2 + Math.sin(bossAnim * 1.7) * 0.2;
      bossGroup.rotation.y += dt * 0.001;
      if (bossEyeMesh) bossEyeMesh.material.emissiveIntensity = 0.7 + 0.3 * Math.sin(bossAnim * 4);
      bossShootTimer -= dt;
      if (bossShootTimer <= 0) {
        bossShootTimer = Math.max(1800, 3500 - level * 120);
        _spawnBossParticle();
      }
    }

    // Rotate power-up rings
    bubbleMeshes.forEach(b => {
      b.mesh && b.mesh.children.forEach(ch => { if (ch.userData.isPowerRing) ch.rotation.z += dt * 0.002; });
    });
  }

  // ── Snap & place ───────────────────────────────────────────────
  function _placeBall() {
    if (!ball) return;

    // Find closest layer by Z
    let targetLayer = 0, minDZ = Infinity;
    LAYER_Z.forEach((z, l) => { const d = Math.abs(ball.pos.z - z); if (d < minDZ) { minDZ = d; targetLayer = l; } });

    // Find nearest free cell
    let bestRow = -1, bestCol = -1, bestDist = Infinity;
    const rows = (grid[targetLayer] || []).length;
    for (let r = 0; r < rows + 2; r++) {
      for (let c = 0; c < colsForRow(r); c++) {
        if (r < rows && grid[targetLayer][r] && grid[targetLayer][r][c]) continue;
        const d = ball.pos.distanceTo(cellPos(targetLayer, r, c));
        if (d < bestDist) { bestDist = d; bestRow = r; bestCol = c; }
      }
    }
    if (bestRow === -1) { scene.remove(ball.mesh); ball = null; return; }

    // Grow grid
    if (!grid[targetLayer]) grid[targetLayer] = [];
    while (grid[targetLayer].length <= bestRow) {
      grid[targetLayer].push(new Array(colsForRow(grid[targetLayer].length)).fill(null));
    }

    // Power-up pickup
    if (ball.power) {
      activePower = ball.power;
      SFX.powerup();
      _addScorePopup(ball.pos.x, ball.pos.y, ball.pos.z, POWERS[ball.power].label);
      scene.remove(ball.mesh); ball = null;
      updateUI(); return;
    }

    // Snap mesh to grid position
    const ci = ball.ci;
    ball.mesh.position.copy(cellPos(targetLayer, bestRow, bestCol));
    grid[targetLayer][bestRow][bestCol] = { ci, power: null, mesh: ball.mesh };
    bubbleMeshes.push({ mesh: ball.mesh, layer: targetLayer, row: bestRow, col: bestCol, ci, power: null });
    ball.mesh = null; ball = null;
    SFX.land();

    // Match check
    const group = _getMatchGroup(targetLayer, bestRow, bestCol);
    if (group.length >= 3) {
      const floaters = _getFloating(targetLayer, group);
      chain++; chainTimer = 3000;
      const pts = group.length * group.length * 12 * level * chain
                + floaters.length * 60 * level * chain;
      score += pts; if (score > best) best = score;

      SFX.pop(group.length);
      if (floaters.length) setTimeout(()=>SFX.floaters(floaters.length), 120);
      if (chain >= 2) setTimeout(()=>SFX.chain(chain), 200);

      const avgP = group.reduce((a,{l,r,c}) => {
        const p=cellPos(l,r,c); a.x+=p.x; a.y+=p.y; a.z+=p.z; return a;
      }, {x:0,y:0,z:0});
      avgP.x/=group.length; avgP.y/=group.length; avgP.z/=group.length;

      group.forEach(({l,r,c}) => _popBubble(l,r,c));
      floaters.forEach(({l,r,c}) => _popBubble(l,r,c,true));
      _addScorePopup(avgP.x, avgP.y+0.4, avgP.z, chain>1 ? `CHAIN×${chain}! +${pts}` : `+${pts}`);

      if (window.FX && chain>=2) { FX.screenFlash(COLORS_CSS[ci], 0.18); FX.shake(4); }
    } else {
      chain = 0; chainTimer = 0;
    }

    updateUI();
    if (countBubbles() === 0) { setTimeout(nextLevel, 700); return; }
    if (_gridTooLow()) { doGameOver(); return; }
  }

  function _popBubble(layer, row, col, isFloater = false) {
    if (!grid[layer] || !grid[layer][row] || !grid[layer][row][col]) return;
    const b = grid[layer][row][col];
    if (b.mesh) { _spawnPopParticles(b.mesh.position, b.ci, isFloater); scene.remove(b.mesh); }
    grid[layer][row][col] = null;
    const idx = bubbleMeshes.findIndex(bm => bm.layer===layer && bm.row===row && bm.col===col);
    if (idx !== -1) bubbleMeshes.splice(idx, 1);
  }

  function _spawnPopParticles(pos, ci, isFloater) {
    const count = isFloater ? 4 : 9;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(BUBBLE_R * 0.3, 6, 5),
        new THREE.MeshBasicMaterial({ color: COLORS_HEX[ci], transparent: true, opacity: 1 })
      );
      mesh.position.copy(pos);
      scene.add(mesh);
      const spd = 3 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI;
      particles.push({
        mesh,
        vx: Math.sin(phi)*Math.cos(theta)*spd,
        vy: Math.cos(phi)*spd*(isFloater?0.4:1),
        vz: Math.sin(phi)*Math.sin(theta)*spd*0.35,
        life: 600+Math.random()*300, maxLife: 900,
      });
    }
  }

  function _addScorePopup(x, y, z, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 280; canvas.height = 64;
    const c = canvas.getContext('2d');
    c.font = 'bold 26px Orbitron, monospace';
    c.textAlign = 'center';
    c.fillStyle = text.includes('!') ? '#ffe600' : '#ffffff';
    c.shadowColor = '#ffe600'; c.shadowBlur = 14;
    c.fillText(text, 140, 44);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1 }));
    sprite.position.set(x, y, z);
    sprite.scale.set(2.6, 0.6, 1);
    scene.add(sprite);
    scoreSprites.push({ mesh: sprite, life: 1400, maxLife: 1400 });
  }

  // ── Flood fill ─────────────────────────────────────────────────
  function _getMatchGroup(layer, row, col) {
    if (!grid[layer]||!grid[layer][row]||!grid[layer][row][col]) return [];
    const ci = grid[layer][row][col].ci;
    if (ci === 6) return [];
    const visited=new Set(), result=[], stack=[[row,col]];
    while (stack.length) {
      const [r,c]=stack.pop(); const key=r+','+c;
      if (visited.has(key)) continue;
      if (r<0||r>=(grid[layer]||[]).length) continue;
      if (c<0||c>=colsForRow(r)) continue;
      if (!grid[layer][r]||!grid[layer][r][c]||grid[layer][r][c].ci!==ci) continue;
      visited.add(key); result.push({l:layer,r,c});
      stack.push(..._hexNeighbors(r,c));
    }
    return result;
  }

  function _getFloating(layer, justPopped) {
    const poppedKeys = new Set(justPopped.map(({r,c})=>r+','+c));
    const attached=new Set(), q=[];
    for (let c=0; c<colsForRow(0); c++) {
      const key='0,'+c;
      if (!poppedKeys.has(key) && grid[layer][0] && grid[layer][0][c]) { q.push([0,c]); attached.add(key); }
    }
    while (q.length) {
      const [r,c]=q.shift();
      for (const [nr,nc] of _hexNeighbors(r,c)) {
        const key=nr+','+nc;
        if (attached.has(key)||poppedKeys.has(key)) continue;
        if (nr<0||nr>=(grid[layer]||[]).length) continue;
        if (nc<0||nc>=colsForRow(nr)) continue;
        if (!grid[layer][nr]||!grid[layer][nr][nc]) continue;
        attached.add(key); q.push([nr,nc]);
      }
    }
    const floating=[];
    for (let r=0;r<(grid[layer]||[]).length;r++) for (let c=0;c<colsForRow(r);c++) {
      const key=r+','+c;
      if (!poppedKeys.has(key) && grid[layer][r] && grid[layer][r][c] && !attached.has(key))
        floating.push({l:layer,r,c});
    }
    return floating;
  }

  function _hexNeighbors(r,c) {
    const e=r%2===0;
    return [[r-1,e?c-1:c],[r-1,e?c:c+1],[r,c-1],[r,c+1],[r+1,e?c-1:c],[r+1,e?c:c+1]];
  }

  function _addFrontRow() {
    const layer = LAYERS-1;
    const cols = getColorsInGrid();
    if (!cols.length) return;
    if (!grid[layer]) grid[layer]=[];
    const newRow = Array.from({length:colsForRow(0)}, () => {
      const ci = cols[Math.floor(Math.random()*cols.length)];
      const mesh = _makeBubbleMesh(ci, null);
      return { ci, power:null, mesh };
    });
    grid[layer].unshift(newRow);
    // Re-sync all mesh positions in this layer + register new row
    for (let r=0; r<grid[layer].length; r++) {
      const row = grid[layer][r]||[];
      for (let c=0; c<row.length; c++) {
        const b=row[c]; if (!b) continue;
        b.mesh.position.copy(cellPos(layer,r,c));
        if (r===0) { scene.add(b.mesh); bubbleMeshes.push({mesh:b.mesh,layer,row:r,col:c,ci:b.ci,power:null}); }
        else { const bm=bubbleMeshes.find(x=>x.mesh===b.mesh); if(bm) bm.row=r; }
      }
    }
    if (window.FX) FX.screenFlash('#ff2d78',0.1);
  }

  function _gridTooLow() {
    const layer=LAYERS-1;
    for (let r=(grid[layer]||[]).length-1; r>=0; r--) for (let c=0;c<colsForRow(r);c++) {
      if (grid[layer][r]&&grid[layer][r][c]) {
        if (cellPos(layer,r,c).y < CANNON_POS.y+1.5) return true;
      }
    }
    return false;
  }

  // ── Boss ───────────────────────────────────────────────────────
  function _hitBoss() {
    bossHp--;
    SFX.pop(3);
    if (window.FX) { FX.shake(6); FX.screenFlash('#ff2d78',0.25); }
    score += 100*level; if (score>best) best=score;
    _addScorePopup(bossGroup.position.x, bossGroup.position.y, bossGroup.position.z, '💥 HIT! +'+(100*level));
    updateUI();
    if (bossHp<=0) {
      SFX.levelUp();
      score += 1500*level; if (score>best) best=score;
      _addScorePopup(0,2,2,'⚡ BOSS DOWN! +'+(1500*level));
      _removeBoss(); bossMode=false;
      if (window.FX) { FX.confetti(window.innerWidth/2,window.innerHeight*0.3); FX.screenFlash('#ffe600',0.4); }
      if (countBubbles()===0) setTimeout(nextLevel,800);
    }
  }

  function _spawnBossParticle() {
    if (!bossGroup) return;
    const ci = Math.floor(Math.random()*COLOR_COUNT);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BUBBLE_R*0.5,6,5),
      new THREE.MeshBasicMaterial({color:COLORS_HEX[ci],transparent:true,opacity:0.9})
    );
    mesh.position.copy(bossGroup.position);
    scene.add(mesh);
    const angle=Math.random()*Math.PI;
    particles.push({mesh, vx:Math.cos(angle)*4, vy:-3, vz:Math.sin(angle)*2, life:1200, maxLife:1200});
  }

  // ── Game flow ──────────────────────────────────────────────────
  function nextLevel() {
    score+=1000*level; level++;
    dropTimer=DROP_SECS*1000; chain=0; chainTimer=0;
    heldSlot=null; canSwap=true; queue=[]; activePower=null;
    generateLevel(); refillQueue(); hideOverlay(); updateUI(); SFX.levelUp();
    if (window.FX) { FX.confetti(window.innerWidth/2,window.innerHeight*0.3); FX.screenFlash('#39ff14',0.25); }
  }

  function doGameOver() {
    dead=true; SFX.gameOver();
    if (window.FX) { FX.screenFlash('#ff2d78',0.5); FX.shake(10); }
    showOverlay('lose','GAME OVER',score,`Level ${level}`,[
      {label:'🔄 RETRY',  fn:'window.BAM3D?.newGame()'},
      {label:'🕹 ARCADE', fn:'backToGameSelect()'},
    ]);
    if (score>0) setTimeout(()=>window.HS?.promptSubmit('bustamove3d',score,score.toLocaleString()),500);
  }

  function newGame() {
    if (!renderer) { initThree(); _bindEvents(); }
    score=0; best=parseInt(localStorage.getItem('bam3d-best')||'0')||0;
    level=1; chain=0; chainTimer=0;
    paused=false; dead=false; won=false;
    dropTimer=DROP_SECS*1000; elapsedMs=0;
    aimH=0; aimV=0.45; activePower=null; heldSlot=null; canSwap=true; queue=[];
    if (ball) { if(ball.mesh) scene.remove(ball.mesh); ball=null; }
    particles.forEach(p=>scene.remove(p.mesh)); particles=[];
    scoreSprites.forEach(s=>scene.remove(s.mesh)); scoreSprites=[];
    generateLevel(); refillQueue(); hideOverlay(); updateUI();
    if (!animId) _loop();
  }

  function destroy() {
    dead=true;
    if (animId) { cancelAnimationFrame(animId); animId=null; }
    _unbindEvents();
    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs=null; }
    if (renderer) { renderer.dispose(); renderer=null; }
    scene=null; camera=null;
    bubbleMeshes=[]; particles=[]; scoreSprites=[];
    if (_sphereGeo) { _sphereGeo.dispose(); _sphereGeo=null; }
  }

  function togglePause() {
    if (dead||won) return;
    paused=!paused;
    const btn=document.getElementById('bam3d-pause-btn');
    if (btn) btn.textContent=paused?'▶':'⏸';
    if (paused) showOverlay('pause','PAUSED',null,'Game paused',[
      {label:'▶ RESUME',fn:'window.BAM3D?.togglePause()'},
      {label:'🆕 NEW',  fn:'window.BAM3D?.newGame()'},
    ]);
    else hideOverlay();
  }

  // ── UI ─────────────────────────────────────────────────────────
  function updateUI() {
    const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    s('bam3d-score',score.toLocaleString());
    s('bam3d-best', Math.max(score,best).toLocaleString());
    s('bam3d-level',level);
    s('bam3d-chain',chain>1?`×${chain}`:'×1');
    const secs=Math.floor(elapsedMs/1000);
    s('bam3d-time',`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`);
    const bar=document.getElementById('bam3d-drop-bar');
    if (bar) { const f=Math.max(0,dropTimer/(DROP_SECS*1000)); bar.style.width=(f*100)+'%'; bar.style.background=f<0.25?'#ff2d78':f<0.5?'#ffe600':'#00f5ff'; }
    const bossWrap=document.getElementById('bam3d-boss-wrap');
    const bossBar=document.getElementById('bam3d-boss-bar');
    if (bossWrap) bossWrap.style.display=bossMode?'block':'none';
    if (bossBar&&bossMode) bossBar.style.width=((bossHp/bossMaxHp)*100)+'%';
    const pwEl=document.getElementById('bam3d-power-slot');
    if (pwEl) {
      if (activePower) { const pw=POWERS[activePower]; pwEl.textContent=pw.label; pwEl.style.color=pw.color; pwEl.style.borderColor=pw.color; pwEl.style.opacity='1'; }
      else { pwEl.textContent='— NO POWER-UP —'; pwEl.style.color='rgba(0,245,255,0.35)'; pwEl.style.borderColor='rgba(0,245,255,0.15)'; pwEl.style.opacity='0.6'; }
    }
    if (score>best) { best=score; localStorage.setItem('bam3d-best',best); }
  }

  function updateQueueUI() {
    _drawMiniPreview('bam3d-next-canvas', queue[0]);
    _drawMiniPreview('bam3d-hold-canvas', heldSlot);
  }

  function _drawMiniPreview(id, slot) {
    const el=document.getElementById(id); if (!el) return;
    const c=el.getContext('2d'); c.clearRect(0,0,el.width,el.height);
    if (!slot) { c.strokeStyle='rgba(0,245,255,0.2)';c.lineWidth=1;c.beginPath();c.arc(el.width/2,el.height/2,el.width/2-4,0,Math.PI*2);c.stroke();return; }
    const cx=el.width/2,cy=el.height/2,r=el.width/2-4;
    const gr=c.createRadialGradient(cx-r*0.3,cy-r*0.35,r*0.05,cx,cy,r);
    const col=COLORS_CSS[slot.ci];
    gr.addColorStop(0,_lighten(col,0.6)); gr.addColorStop(0.6,col); gr.addColorStop(1,_darken(col,0.4));
    c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=gr;c.fill();
    c.beginPath();c.arc(cx-r*0.3,cy-r*0.32,r*0.24,0,Math.PI*2);c.fillStyle='rgba(255,255,255,0.65)';c.fill();
    if (slot.power) { c.font='bold 11px Orbitron,monospace';c.textAlign='center';c.fillStyle='#fff';c.shadowColor='#fff';c.shadowBlur=6;c.fillText(slot.power[0].toUpperCase(),cx,el.height-3);c.shadowBlur=0; }
  }

  function _lighten(hex,a){const[r,g,b]=_hr(hex);return`rgb(${Math.min(255,r+~~(255*a))},${Math.min(255,g+~~(255*a))},${Math.min(255,b+~~(255*a))})`;}
  function _darken(hex,a) {const[r,g,b]=_hr(hex);return`rgb(${Math.max(0,r-~~(255*a))},${Math.max(0,g-~~(255*a))},${Math.max(0,b-~~(255*a))})`;}
  function _hr(h){const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}

  function showOverlay(type,title,sc,msg,btns) {
    const ov=document.getElementById('bam3d-overlay');if(!ov)return;ov.classList.add('active');
    const t=document.getElementById('bam3d-ov-title');if(t){t.textContent=title;t.className='bam3d-ov-title '+type;}
    const scEl=document.getElementById('bam3d-ov-score');if(scEl)scEl.textContent=sc!=null?sc.toLocaleString()+' pts':'';
    const msgEl=document.getElementById('bam3d-ov-msg');if(msgEl)msgEl.textContent=msg||'';
    const bd=document.getElementById('bam3d-ov-btns');
    if(bd)bd.innerHTML=(btns||[]).map(b=>`<button class="${b.label.includes('ARCADE')?'arcade-back-btn':'bam3d-btn'}" onclick="${b.fn}">${b.label}</button>`).join('');
  }

  function hideOverlay(){const ov=document.getElementById('bam3d-overlay');if(ov)ov.classList.remove('active');}

  // ── Render loop ────────────────────────────────────────────────
  function _loop(ts=0) {
    animId=requestAnimationFrame(_loop);
    if (document.hidden) return;
    const dt=Math.min(ts-lastTs,50); lastTs=ts;
    if (!paused&&!dead) update(dt);
    _updateAimLine();
    if (renderer&&scene&&camera) renderer.render(scene,camera);
    if (!dead&&!paused) updateUI();
  }

  // ── Input ──────────────────────────────────────────────────────
  function _onMouseMove(e) {
    if (paused||dead||!container) return;
    const rect=container.getBoundingClientRect();
    const nx=(e.clientX-rect.left)/rect.width*2-1;
    const ny=(e.clientY-rect.top)/rect.height*2-1;
    aimH=nx*Math.PI*0.44;
    aimV=0.12+(1-Math.max(0,Math.min(1,(ny+1)/2)))*1.0;
  }
  function _onClick(e) {
    if (paused||dead||won||!container) return;
    const rect=container.getBoundingClientRect();
    aimH=((e.clientX-rect.left)/rect.width*2-1)*Math.PI*0.44;
    aimV=0.12+(1-Math.max(0,Math.min(1,((e.clientY-rect.top)/rect.height*2-1+1)/2)))*1.0;
    shoot();
  }
  function _onTouch(e) {
    if (paused||dead||!container) return;
    e.preventDefault();
    const t=e.touches[0], rect=container.getBoundingClientRect();
    aimH=((t.clientX-rect.left)/rect.width*2-1)*Math.PI*0.44;
    aimV=0.12+(1-Math.max(0,Math.min(1,((t.clientY-rect.top)/rect.height*2-1+1)/2)))*1.0;
  }
  function _onTouchEnd(){if(!paused&&!dead&&!won)shoot();}
  function _onKeyDown(e) {
    const scr=document.getElementById('bustamove3d-screen');
    if (!scr||!scr.classList.contains('active')) return;
    switch(e.key){
      case 'ArrowLeft': case 'a':case 'A': leftHeld=true;  e.preventDefault();break;
      case 'ArrowRight':case 'd':case 'D': rightHeld=true; e.preventDefault();break;
      case 'ArrowUp':   case 'w':case 'W': upHeld=true;    e.preventDefault();break;
      case 'ArrowDown': case 's':case 'S': downHeld=true;  e.preventDefault();break;
      case ' ':  shoot();       e.preventDefault();break;
      case 'z':case 'Z': swapHold();  e.preventDefault();break;
      case 'x':case 'X': usePower();  e.preventDefault();break;
      case 'p':case 'P': togglePause();break;
    }
  }
  function _onKeyUp(e){
    if(e.key==='ArrowLeft' ||e.key==='a'||e.key==='A') leftHeld=false;
    if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') rightHeld=false;
    if(e.key==='ArrowUp'   ||e.key==='w'||e.key==='W') upHeld=false;
    if(e.key==='ArrowDown' ||e.key==='s'||e.key==='S') downHeld=false;
  }

  function _bindEvents() {
    if (!container) return;
    container.addEventListener('mousemove', _onMouseMove);
    container.addEventListener('click',     _onClick);
    container.addEventListener('touchmove', _onTouch,   {passive:false});
    container.addEventListener('touchend',  _onTouchEnd);
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
  }
  function _unbindEvents() {
    if (container) {
      container.removeEventListener('mousemove', _onMouseMove);
      container.removeEventListener('click',     _onClick);
      container.removeEventListener('touchmove', _onTouch);
      container.removeEventListener('touchend',  _onTouchEnd);
    }
    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup',   _onKeyUp);
  }

  return {
    newGame: () => { if (!renderer) { initThree(); _bindEvents(); } newGame(); },
    destroy,
    togglePause,
    usePower,
    getCurrentScore: () => score,
  };
})();
