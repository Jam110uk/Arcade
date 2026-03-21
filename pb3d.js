// ============================================================
// BUST-A-MOVE 3D  —  pb3d.js
// Identical gameplay to pb.js. Three.js r128 replaces the
// canvas 2D renderer — same orthographic front view, same
// grid, same cannon, same physics. Bubbles are real 3D lit
// spheres instead of canvas circles.
// ============================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export default (() => {

  // ── SFX (identical to pb.js) ──────────────────────────────────
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
      shoot()    { tone(520, 0.07, 'sine', 0.14, 680); },
      bounce()   { tone(300, 0.05, 'sine', 0.10, 240); },
      land()     { tone(180, 0.08, 'sine', 0.10, 160); },
      pop(n)     { tone(600 + Math.min(n,8)*40, 0.06, 'square', 0.13); noise(0.06, 0.07); },
      floaters(n){ for (let i=0;i<Math.min(n,6);i++) tone(400-i*35,0.12,'sine',0.10,200-i*20,i*0.04); },
      chain(n)   { const b=440; for (let i=0;i<Math.min(n,5);i++) tone(b*Math.pow(1.2,i),0.10,'square',0.14,null,i*0.07); },
      levelUp()  { [523,659,784,1047,1319].forEach((f,i)=>tone(f,0.12,'square',0.15,null,i*0.09)); setTimeout(()=>tone(1319,0.4,'sine',0.12,1047),500); },
      gameOver() { [440,370,330,262].forEach((f,i)=>tone(f,0.22,'sine',0.14,null,i*0.18)); },
      resume()   { if (ctx&&ctx.state==='suspended') ctx.resume().catch(()=>{}); },
    };
  })();

  // ── Constants (identical to pb.js) ───────────────────────────
  const R           = 13;
  const D           = R * 2;
  const ROW_H       = R * Math.sqrt(3);
  const SHOOT_SPEED = 22;
  const MAX_BOUNCES = 30;
  const DROP_SECS   = 60;
  const CEILING_PAD = 6;
  const CANNON_PAD  = 30;
  const CLEAR_ROWS  = 5;

  const COLORS_HEX = [0xff2d78, 0x00f5ff, 0x39ff14, 0xffe600, 0xbf00ff, 0xff6a00, 0xffffff];
  const COLORS_CSS = ['#ff2d78','#00f5ff','#39ff14','#ffe600','#bf00ff','#ff6a00','#ffffff'];

  // ── Grid helpers (identical to pb.js) ────────────────────────
  let W = 320, H = 540;

  function _playW()     { return W - Math.max(6, W * 0.045) * 2; }
  function colsEven()   { return Math.floor(_playW() / D); }
  function colsOdd()    { return Math.floor((_playW() - R) / D); }
  function colsForRow(r){ return r % 2 === 0 ? colsEven() : colsOdd(); }

  // Canvas-space XY (Y=0 at top) — same formula as pb.js cellXY()
  function cellXY(row, col) {
    const pillarW = Math.max(6, W * 0.045);
    const xOff = row % 2 === 0 ? 0 : R;
    return {
      x: pillarW + R + xOff + col * D,
      y: CEILING_PAD + row * ROW_H + R,
    };
  }

  function gridOffsetY() { return CEILING_PAD; }
  function cannonX()     { return W / 2; }
  function cannonCanvasY(){ return H - CANNON_PAD - R; }

  // Convert canvas coords to Three.js world coords.
  // Orthographic camera: left=0 right=W bottom=0 top=H
  // Canvas Y=0 is top → world Y=H; canvas Y=H is bottom → world Y=0
  function toWorld(cx, cy) {
    return new THREE.Vector3(cx, H - cy, 0);
  }

  // ── Three.js state ────────────────────────────────────────────
  let renderer, scene, camera;
  let animId   = null;
  let container = null;
  let _resizeObs = null;

  // Scene objects
  let cannonGroup  = null;
  let cannonBarrel = null;
  let aimLineMesh  = null;
  let bgObjects    = [];

  // Per-bubble mesh tracking
  let gridMeshes   = []; // { mesh, row, col, ci }
  let ballMesh     = null;
  let trailMeshes  = [];
  let popMeshes    = []; // { mesh, vx, vy, alpha, scale, isFloater }
  let scoreSprites = []; // { mesh, vy, life, maxLife }

  // Geometry + material cache
  const _geoCache = {};
  function sphereGeo(r) {
    const k = Math.round(r * 10);
    if (!_geoCache[k]) _geoCache[k] = new THREE.SphereGeometry(r, 20, 14);
    return _geoCache[k];
  }

  const _matCache = {};
  function bubbleMat(ci) {
    if (!_matCache[ci]) {
      _matCache[ci] = new THREE.MeshPhongMaterial({
        color:             COLORS_HEX[ci],
        emissive:          COLORS_HEX[ci],
        emissiveIntensity: 0.15,
        shininess:         140,
        specular:          0xffffff,
      });
    }
    return _matCache[ci];
  }

  // ── Game state (identical names to pb.js) ─────────────────────
  let grid        = [];
  let ball        = null; // { x, y, vx, vy, ci, bounces, trail:[] }
  let queue       = [];   // [ci, ci]
  let heldCi      = -1;
  let canSwap     = true;
  let cannonAngle = -Math.PI / 2;
  let score = 0, best = 0, level = 1;
  let chain = 0, chainTimer = 0;
  let paused = false, dead = false, won = false;
  let dropTimer   = DROP_SECS * 1000;
  let lastTs      = 0;
  let elapsedMs   = 0;

  let leftHeld  = false;
  let rightHeld = false;
  const AIM_SPEED = 0.04;

  // Aim line cache (same logic as pb.js)
  let _aimDirty = true;
  let _aimLastAngle = null;
  let _aimCache = null;
  function _invalidateAim() { _aimDirty = true; }

  // ── Three.js init ─────────────────────────────────────────────
  function initThree() {
    container = document.getElementById('bam3d-canvas-container');
    if (!container) return;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x010510, 1);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    // Orthographic camera — world units = pixels, Y-up.
    // Near/far bracketed around Z=0 where all action happens.
    camera = new THREE.OrthographicCamera(0, W, H, 0, -100, 100);
    camera.position.z = 50;

    // Lighting
    // Ambient fills shadows softly
    scene.add(new THREE.AmbientLight(0x223355, 1.0));

    // Main key light slightly top-left to give spheres a lit look
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(W * 0.25, H * 0.75, 80);
    scene.add(key);

    // Soft right fill
    const fill = new THREE.DirectionalLight(0x4466aa, 0.35);
    fill.position.set(W * 0.8, H * 0.4, 60);
    scene.add(fill);

    // Subtle pink rim from behind/below
    const rim = new THREE.DirectionalLight(0xff2d78, 0.18);
    rim.position.set(W * 0.5, 0, -20);
    scene.add(rim);

    _buildBackground();
    _buildCannon();
    _buildAimLine();

    _resizeObs = new ResizeObserver(() => _resize());
    _resizeObs.observe(container);
    _resize();
  }

  function _resize() {
    if (!renderer || !container) return;
    W = container.clientWidth  || 320;
    H = container.clientHeight || 540;
    renderer.setSize(W, H);
    if (camera) {
      camera.left = 0; camera.right  = W;
      camera.top  = H; camera.bottom = 0;
      camera.updateProjectionMatrix();
    }
    _rebuildBackground();
    _repositionCannon();
    _rebuildGridMeshPositions();
    _invalidateAim();
  }

  // ── Background (matches pb.js visual style) ───────────────────
  function _buildBackground()  { _rebuildBackground(); }
  function _rebuildBackground() {
    bgObjects.forEach(o => scene.remove(o));
    bgObjects = [];

    function add(o) { scene.add(o); bgObjects.push(o); }

    // Deep background plane
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ color: 0x010510 })
    );
    bg.position.set(W/2, H/2, -50);
    add(bg);

    // Stars
    const starCount = 60;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      sp[i*3] = Math.random()*W; sp[i*3+1] = Math.random()*H; sp[i*3+2] = -20;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xc8e8ff, size: 1.5, transparent: true, opacity: 0.5 })));

    const pillarW = Math.max(6, W * 0.045);

    // Left pillar glow
    const plL = new THREE.Mesh(
      new THREE.PlaneGeometry(pillarW * 2.5, H),
      new THREE.MeshBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.10 })
    );
    plL.position.set(pillarW * 1.25, H/2, -2);
    add(plL);

    // Right pillar glow
    const plR = new THREE.Mesh(
      new THREE.PlaneGeometry(pillarW * 2.5, H),
      new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true, opacity: 0.10 })
    );
    plR.position.set(W - pillarW * 1.25, H/2, -2);
    add(plR);

    // Left edge line
    add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(2, 0, 1), new THREE.Vector3(2, H, 1)]),
      new THREE.LineBasicMaterial({ color: 0x00f5ff })
    ));

    // Right edge line
    add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(W-2, 0, 1), new THREE.Vector3(W-2, H, 1)]),
      new THREE.LineBasicMaterial({ color: 0xff2d78 })
    ));

    // Top rainbow bar
    add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, H-2, 1), new THREE.Vector3(W, H-2, 1)]),
      new THREE.LineBasicMaterial({ color: 0xbf00ff })
    ));

    // Ceiling line
    const ceilWorldY = H - CEILING_PAD;
    add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, ceilWorldY, 1), new THREE.Vector3(W, ceilWorldY, 1)]),
      new THREE.LineBasicMaterial({ color: 0x00f5ff })
    ));

    // Danger line (same position as pb.js dangerY)
    const dangerWorldY = H - (cannonCanvasY() - ROW_H * CLEAR_ROWS);
    add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, dangerWorldY, 1), new THREE.Vector3(W, dangerWorldY, 1)]),
      new THREE.LineBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.55 })
    ));
  }

  // ── Cannon ────────────────────────────────────────────────────
  function _buildCannon() {
    cannonGroup = new THREE.Group();
    scene.add(cannonGroup);

    // Base disc (flat cylinder facing camera)
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(22, 26, 8, 24),
      new THREE.MeshPhongMaterial({ color: 0x0a1e30, emissive: 0x002244, shininess: 80 })
    );
    base.rotation.x = Math.PI / 2;
    cannonGroup.add(base);

    // Cyan glow ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(24, 1.5, 8, 32),
      new THREE.MeshPhongMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.7 })
    );
    cannonGroup.add(ring);

    // Barrel pivot group — rotated to match cannonAngle
    cannonBarrel = new THREE.Group();
    cannonGroup.add(cannonBarrel);

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 5.5, 44, 12),
      new THREE.MeshPhongMaterial({ color: 0x2266aa, emissive: 0x001133, shininess: 120 })
    );
    bar.position.y = 22;
    cannonBarrel.add(bar);

    // Muzzle ring
    const muzzle = new THREE.Mesh(
      new THREE.TorusGeometry(5, 1.2, 8, 16),
      new THREE.MeshPhongMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.9 })
    );
    muzzle.position.y = 44;
    cannonBarrel.add(muzzle);

    _repositionCannon();
  }

  function _repositionCannon() {
    if (!cannonGroup) return;
    cannonGroup.position.set(cannonX(), H - cannonCanvasY(), 2);
  }

  function _updateBarrel() {
    if (!cannonBarrel) return;
    // pb.js cannonAngle: -π/2 = straight up.
    // Three.js: barrel points along +Y when rotation.z=0.
    // cannonAngle + π/2 converts pb.js angle to barrel rotation.
    cannonBarrel.rotation.z = cannonAngle + Math.PI / 2;
  }

  // ── Aim line ──────────────────────────────────────────────────
  function _buildAimLine() {
    aimLineMesh = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0)]),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 5, gapSize: 8, transparent: true, opacity: 0.55 })
    );
    scene.add(aimLineMesh);
  }

  function _updateAimLine() {
    if (!aimLineMesh) return;
    if (!queue.length || dead || won || paused || ball) { aimLineMesh.visible = false; return; }
    aimLineMesh.visible = true;

    if (_aimDirty || _aimLastAngle !== cannonAngle) {
      // Simulate in canvas space — same as pb.js drawAimLine
      let vx = Math.cos(cannonAngle);
      let vy = Math.sin(cannonAngle);
      let x = cannonX(), y = cannonCanvasY();
      const pillarW = Math.max(6, W * 0.045);
      const wallL = pillarW + R, wallR = W - pillarW - R;
      const pts = [];
      for (let i = 0; i < Math.ceil(H / SHOOT_SPEED) * 5; i++) {
        x += vx * SHOOT_SPEED; y += vy * SHOOT_SPEED;
        if (x < wallL) { x = wallL; vx =  Math.abs(vx); pts.push(toWorld(x, y)); }
        if (x > wallR) { x = wallR; vx = -Math.abs(vx); pts.push(toWorld(x, y)); }
        if (y < CEILING_PAD + R * 2) { pts.push(toWorld(x, CEILING_PAD + R)); break; }
        pts.push(toWorld(x, y));
        // Hit check
        let hit = false;
        for (let r = 0; r < grid.length && !hit; r++) {
          for (let c = 0; c < colsForRow(r) && !hit; c++) {
            const b = grid[r] && grid[r][c];
            if (!b) continue;
            const cv = cellXY(r, c);
            const dx = x - cv.x, dy = y - cv.y;
            if (dx*dx + dy*dy < (D*1.05)*(D*1.05)) { pts.push(toWorld(x, y)); hit = true; }
          }
        }
        if (hit) break;
      }
      _aimCache = pts.length ? pts : [toWorld(cannonX(), cannonCanvasY())];
      _aimLastAngle = cannonAngle;
      _aimDirty = false;
    }

    aimLineMesh.geometry.dispose();
    aimLineMesh.geometry = new THREE.BufferGeometry().setFromPoints(_aimCache);
    aimLineMesh.computeLineDistances();
    aimLineMesh.material.color.setHex(COLORS_HEX[queue[0] ?? 0]);
  }

  // ── Grid ──────────────────────────────────────────────────────
  function _makeBubbleMesh(ci) {
    const mesh = new THREE.Mesh(sphereGeo(R), bubbleMat(ci).clone());
    return mesh;
  }

  function _placeMesh(mesh, row, col) {
    const cv = cellXY(row, col);
    mesh.position.copy(toWorld(cv.x, cv.y));
    mesh.position.z = 0;
  }

  function _rebuildGridMeshPositions() {
    for (const bm of gridMeshes) {
      _placeMesh(bm.mesh, bm.row, bm.col);
    }
  }

  function generateLevel() {
    // Remove existing meshes
    gridMeshes.forEach(bm => scene.remove(bm.mesh));
    gridMeshes = [];
    grid = [];

    const numColors = Math.min(3 + Math.floor(level / 2), COLORS_HEX.length - 1);
    const pal = Array.from({ length: numColors }, (_, i) => i);
    const rows = Math.min(6 + level, 13);

    for (let r = 0; r < rows; r++) {
      const cols = colsForRow(r);
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        const ci = pal[Math.floor(Math.random() * pal.length)];
        const mesh = _makeBubbleMesh(ci);
        _placeMesh(mesh, r, c);
        scene.add(mesh);
        grid[r][c] = { ci };
        gridMeshes.push({ mesh, row: r, col: c, ci });
      }
    }
    _ensurePlayable(pal);
    _invalidateAim();
  }

  function _ensurePlayable(pal) {
    const counts = {};
    for (const row of grid) for (const b of (row||[])) if (b) counts[b.ci] = (counts[b.ci]||0) + 1;
    for (const ci of pal) {
      if ((counts[ci]||0) >= 3) continue;
      let placed = 0;
      outer: for (let r = grid.length-1; r >= 0; r--) {
        for (let c = 0; c < (grid[r]||[]).length; c++) {
          if (grid[r][c] && placed < 3) {
            grid[r][c].ci = ci;
            const bm = gridMeshes.find(x => x.row === r && x.col === c);
            if (bm) { bm.ci = ci; bm.mesh.material = bubbleMat(ci).clone(); }
            placed++;
          }
          if (placed === 3) break outer;
        }
      }
    }
  }

  function _getColorsInGrid() {
    const s = new Set();
    for (const row of grid) for (const b of (row||[])) if (b) s.add(b.ci);
    return [...s];
  }

  function _countBubbles() {
    let n = 0;
    for (const row of grid) for (const b of (row||[])) if (b) n++;
    return n;
  }

  // ── Queue (same as pb.js) ─────────────────────────────────────
  function _randomValidColor() {
    const c = _getColorsInGrid();
    return c.length ? c[Math.floor(Math.random() * c.length)] : 0;
  }

  function refillQueue() {
    while (queue.length < 2) queue.push(_randomValidColor());
    _updateQueueUI();
    _syncCannonBubble();
  }

  function consumeQueue() {
    const ci = queue.shift();
    refillQueue();
    return ci;
  }

  function _syncCannonBubble() {
    const cb = cannonGroup && cannonGroup.getObjectByName('cannonBubble');
    if (cb && queue.length) cb.material = bubbleMat(queue[0]).clone();
  }

  function _ensureCannonBubble() {
    if (!cannonGroup || cannonGroup.getObjectByName('cannonBubble')) return;
    const cb = new THREE.Mesh(sphereGeo(R - 2), bubbleMat(0).clone());
    cb.name = 'cannonBubble';
    cb.position.set(0, 0, 3);
    cannonGroup.add(cb);
  }

  function _updateQueueUI() {
    _drawPreview('bam3d-next-canvas', queue[0] ?? -1);
    _drawPreview('bam3d-hold-canvas', heldCi);
  }

  function _drawPreview(id, ci) {
    const el = document.getElementById(id); if (!el) return;
    const c = el.getContext('2d'); const w = el.width, h = el.height;
    c.clearRect(0, 0, w, h);
    if (ci < 0) {
      c.strokeStyle = 'rgba(0,245,255,0.2)'; c.lineWidth = 1;
      c.beginPath(); c.arc(w/2, h/2, w/2-4, 0, Math.PI*2); c.stroke();
      return;
    }
    const cx = w/2, cy = h/2, r = w/2 - 4;
    const col = COLORS_CSS[ci];
    const gr = c.createRadialGradient(cx-r*0.3, cy-r*0.35, r*0.05, cx, cy, r);
    gr.addColorStop(0, _lighten(col, 0.6));
    gr.addColorStop(0.6, col);
    gr.addColorStop(1, _darken(col, 0.4));
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI*2); c.fillStyle = gr; c.fill();
    c.beginPath(); c.arc(cx-r*0.3, cy-r*0.32, r*0.24, 0, Math.PI*2);
    c.fillStyle = 'rgba(255,255,255,0.65)'; c.fill();
  }

  function _lighten(hex, a) { const [r,g,b]=_hr(hex); return `rgb(${Math.min(255,r+~~(255*a))},${Math.min(255,g+~~(255*a))},${Math.min(255,b+~~(255*a))})`; }
  function _darken(hex, a)  { const [r,g,b]=_hr(hex); return `rgb(${Math.max(0,r-~~(255*a))},${Math.max(0,g-~~(255*a))},${Math.max(0,b-~~(255*a))})`; }
  function _hr(h) { const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }

  // ── Shoot (identical logic to pb.js) ─────────────────────────
  function shoot() {
    if (ball || paused || dead || won || !queue.length) return;
    const minA = -Math.PI + 0.15, maxA = -0.15;
    cannonAngle = Math.max(minA, Math.min(maxA, cannonAngle));
    const ci = consumeQueue();
    const mesh = _makeBubbleMesh(ci);
    const cv = { x: cannonX(), y: cannonCanvasY() };
    mesh.position.copy(toWorld(cv.x, cv.y));
    mesh.position.z = 3;
    scene.add(mesh);
    ball = {
      mesh, ci,
      x: cv.x, y: cv.y,
      vx: Math.cos(cannonAngle) * SHOOT_SPEED,
      vy: Math.sin(cannonAngle) * SHOOT_SPEED,
      bounces: 0,
      trail: [],
    };
    canSwap = true;
    SFX.resume(); SFX.shoot();
  }

  function swapHold() {
    if (!canSwap || paused || dead || won || ball) return;
    if (heldCi < 0) {
      heldCi = queue.shift();
      refillQueue();
    } else {
      const tmp = heldCi;
      heldCi = queue.shift();
      queue.unshift(tmp);
    }
    canSwap = false;
    _updateQueueUI();
  }

  // ── Update (identical physics to pb.js) ──────────────────────
  function update(dt) {
    if (leftHeld)  cannonAngle = Math.max(-Math.PI+0.15, cannonAngle - AIM_SPEED);
    if (rightHeld) cannonAngle = Math.min(-0.15,          cannonAngle + AIM_SPEED);
    _updateBarrel();

    if (chainTimer > 0) { chainTimer -= dt; if (chainTimer <= 0) { chain = 0; updateUI(); } }

    if (!dead && !won) {
      dropTimer -= dt;
      if (dropTimer <= 0) {
        dropTimer = DROP_SECS * 1000;
        _addNewTopRow();
        if (_gridTooLow()) { doGameOver(); return; }
      }
      elapsedMs += dt;
    }

    if (ball) {
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 6) ball.trail.shift();

      const pillarW = Math.max(6, W * 0.045);
      const wallL = pillarW + R, wallR = W - pillarW - R;
      const NUM_STEPS = Math.ceil(SHOOT_SPEED / (R * 0.8));
      let placed = false;

      for (let si = 0; si < NUM_STEPS && !placed; si++) {
        ball.x += ball.vx / NUM_STEPS;
        ball.y += ball.vy / NUM_STEPS;

        if (ball.x < wallL) { ball.x = wallL; ball.vx =  Math.abs(ball.vx); ball.bounces++; SFX.bounce(); }
        if (ball.x > wallR) { ball.x = wallR; ball.vx = -Math.abs(ball.vx); ball.bounces++; SFX.bounce(); }

        if (ball.y < CEILING_PAD + ROW_H * 0.5) { _placeBall(); placed = true; break; }
        if (ball.bounces > MAX_BOUNCES)           { _placeBall(); placed = true; break; }

        outer: for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < colsForRow(r); c++) {
            if (!grid[r] || !grid[r][c]) continue;
            const cv = cellXY(r, c);
            const dx = ball.x - cv.x, dy = ball.y - cv.y;
            if (dx*dx + dy*dy < D * D) { _placeBall(); placed = true; break outer; }
          }
        }
      }

      if (!placed && ball) {
        ball.mesh.position.copy(toWorld(ball.x, ball.y));
        ball.mesh.position.z = 3;
      }
      if (!placed && ball && ball.y > H + 50) { scene.remove(ball.mesh); ball = null; }
    }

    // Trail
    trailMeshes.forEach(m => scene.remove(m)); trailMeshes = [];
    if (ball && ball.trail.length) {
      ball.trail.forEach((tp, i) => {
        const t = (i+1) / ball.trail.length;
        const r = Math.round(R * t * 0.65);
        if (r < 2) return;
        const m = new THREE.Mesh(sphereGeo(r),
          new THREE.MeshBasicMaterial({ color: COLORS_HEX[ball.ci], transparent: true, opacity: t * 0.35 })
        );
        m.position.copy(toWorld(tp.x, tp.y)); m.position.z = 2.5;
        scene.add(m); trailMeshes.push(m);
      });
    }

    // Pop animations
    popMeshes.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.isFloater) {
        p.vy += 0.45; p.vx *= 0.99;
        p.alpha = p.y > H * 0.8 ? Math.max(0, 1 - (p.y - H*0.8)/(H*0.25)) : 1;
        p.scale = 1;
      } else {
        p.vy += 0.6; p.vx *= 0.97;
        p.alpha -= 0.028; p.scale = Math.max(0, p.scale - 0.018);
      }
      if (p.mesh) {
        p.mesh.position.copy(toWorld(p.x, p.y));
        p.mesh.position.z = 4;
        p.mesh.scale.setScalar(p.scale);
        p.mesh.material.opacity = Math.max(0, p.alpha);
      }
    });
    popMeshes = popMeshes.filter(p => {
      if (p.alpha <= 0 || p.y > H + 80) { if (p.mesh) scene.remove(p.mesh); return false; }
      return true;
    });

    // Score sprites
    scoreSprites.forEach(s => {
      s.mesh.position.y += 1.2;
      s.life -= dt;
      const t = Math.max(0, s.life / s.maxLife);
      if (s.mesh.material) s.mesh.material.opacity = t;
    });
    scoreSprites = scoreSprites.filter(s => {
      if (s.life <= 0) { scene.remove(s.mesh); return false; } return true;
    });
  }

  // ── Snap to grid (identical to pb.js) ────────────────────────
  function _snapToGrid() {
    let bestRow = -1, bestCol = -1, bestDist = Infinity;
    const approxRow = Math.round((ball.y - R - gridOffsetY()) / ROW_H);
    const from = Math.max(0, approxRow - 2);
    const to   = Math.min(grid.length + 1, approxRow + 2);
    for (let r = from; r <= to; r++) {
      const cols = colsForRow(r);
      for (let c = 0; c < cols; c++) {
        if (r < grid.length && grid[r] && grid[r][c]) continue;
        const cv = cellXY(r, c);
        const dx = ball.x - cv.x, dy = ball.y - cv.y;
        const dist = dx*dx + dy*dy;
        if (dist < bestDist) { bestDist = dist; bestRow = r; bestCol = c; }
      }
    }
    return bestRow === -1 ? null : { row: bestRow, col: bestCol };
  }

  function _placeBall() {
    if (!ball) return;
    const snap = _snapToGrid();
    if (!snap) { scene.remove(ball.mesh); ball = null; return; }
    const { row, col } = snap;

    while (grid.length <= row) grid.push(new Array(colsForRow(grid.length)).fill(null));
    if ((grid[row]||[]).length <= col) {
      while ((grid[row]||[]).length <= col) grid[row].push(null);
    }

    _placeMesh(ball.mesh, row, col);
    ball.mesh.position.z = 0;
    grid[row][col] = { ci: ball.ci };
    gridMeshes.push({ mesh: ball.mesh, row, col, ci: ball.ci });
    const ci = ball.ci;
    ball.mesh = null; ball = null;
    _invalidateAim();
    SFX.land();

    const group = _getMatchGroup(row, col);
    if (group.length >= 3) {
      const floaters = _getFloating(group);
      chain++; chainTimer = 3000;
      const pts = group.length * group.length * 10 * level * chain
                + floaters.length * 50 * level * chain;
      score += pts; if (score > best) best = score;

      SFX.pop(group.length);
      if (floaters.length) setTimeout(() => SFX.floaters(floaters.length), 120);
      if (chain >= 2)      setTimeout(() => SFX.chain(chain), 200);

      const avgCv = group.reduce((a,{r,c}) => { const cv=cellXY(r,c); a.x+=cv.x; a.y+=cv.y; return a; }, {x:0,y:0});
      avgCv.x /= group.length; avgCv.y /= group.length;

      group.forEach(({r,c})   => _popCell(r, c, false));
      floaters.forEach(({r,c})=> _popCell(r, c, true));
      _trimEmptyRows();
      _addScoreSprite(avgCv.x, avgCv.y - 20, chain > 1 ? `CHAIN×${chain}! +${pts}` : `+${pts}`);

      if (window.FX) {
        const rect = container.getBoundingClientRect();
        group.forEach(({r,c}) => {
          const cv = cellXY(r,c);
          FX.burst(
            rect.left + (cv.x/W)*rect.width,
            rect.top  + (cv.y/H)*rect.height,
            { count:10, colors:[COLORS_CSS[ci],'#fff'], speed:4, life:35, size:3, shape:'circle', gravity:0.12 }
          );
        });
        if (chain >= 2) { FX.screenFlash(COLORS_CSS[ci], 0.2); FX.shake(4); }
      }
      updateUI();
    } else {
      chain = 0; chainTimer = 0;
      SFX.land();
      updateUI();
    }

    if (_countBubbles() === 0) { setTimeout(nextLevel, 600); return; }
    if (_gridTooLow())          { doGameOver(); return; }
  }

  function _popCell(row, col, isFloater) {
    if (!grid[row] || !grid[row][col]) return;
    const ci = grid[row][col].ci;
    const cv = cellXY(row, col);
    const idx = gridMeshes.findIndex(bm => bm.row === row && bm.col === col);
    if (idx !== -1) { scene.remove(gridMeshes[idx].mesh); gridMeshes.splice(idx, 1); }
    grid[row][col] = null;

    // Spawn pop particle
    const angle = Math.random() * Math.PI * 2;
    const spd = isFloater ? 1 + Math.random() * 2 : 3 + Math.random() * 4;
    const mesh = new THREE.Mesh(
      sphereGeo(R),
      new THREE.MeshBasicMaterial({ color: COLORS_HEX[ci], transparent: true, opacity: 1 })
    );
    mesh.position.copy(toWorld(cv.x, cv.y)); mesh.position.z = 4;
    scene.add(mesh);
    popMeshes.push({
      mesh, ci,
      x: cv.x, y: cv.y,
      vx: Math.cos(angle) * spd,
      vy: isFloater ? -(1 + Math.random()*1.5) : Math.sin(angle) * spd,
      alpha: 1, scale: 1, isFloater,
    });
  }

  function _addScoreSprite(cx, cy, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 220; canvas.height = 48;
    const c = canvas.getContext('2d');
    c.font = 'bold 20px Orbitron,monospace';
    c.textAlign = 'center';
    c.fillStyle = text.includes('CHAIN') ? '#ffe600' : '#ffffff';
    c.shadowColor = '#ffe600'; c.shadowBlur = 10;
    c.fillText(text, 110, 34);
    const tex = new THREE.CanvasTexture(canvas);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1 }));
    sp.position.copy(toWorld(cx, cy)); sp.position.z = 5;
    sp.scale.set(130, 28, 1);
    scene.add(sp);
    scoreSprites.push({ mesh: sp, life: 1200, maxLife: 1200 });
  }

  // ── Flood fill (identical to pb.js) ──────────────────────────
  function _getMatchGroup(row, col) {
    if (!grid[row] || !grid[row][col]) return [];
    const ci = grid[row][col].ci;
    const visited = new Set(), result = [], stack = [[row, col]];
    while (stack.length) {
      const [r, c] = stack.pop(); const key = r+','+c;
      if (visited.has(key)) continue;
      if (r < 0 || r >= grid.length) continue;
      if (c < 0 || c >= colsForRow(r)) continue;
      if (!grid[r] || !grid[r][c] || grid[r][c].ci !== ci) continue;
      visited.add(key); result.push({r, c});
      stack.push(..._hexNeighbors(r, c));
    }
    return result;
  }

  function _getFloating(justPopped) {
    const poppedKeys = new Set(justPopped.map(({r,c}) => r+','+c));
    const attached = new Set(), q = [];
    for (let c = 0; c < colsForRow(0); c++) {
      const key = '0,'+c;
      if (!poppedKeys.has(key) && grid[0] && grid[0][c]) { q.push([0,c]); attached.add(key); }
    }
    while (q.length) {
      const [r, c] = q.shift();
      for (const [nr, nc] of _hexNeighbors(r, c)) {
        const key = nr+','+nc;
        if (attached.has(key) || poppedKeys.has(key)) continue;
        if (nr < 0 || nr >= grid.length) continue;
        if (nc < 0 || nc >= colsForRow(nr)) continue;
        if (!grid[nr] || !grid[nr][nc]) continue;
        attached.add(key); q.push([nr, nc]);
      }
    }
    const floating = [];
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < colsForRow(r); c++) {
      const key = r+','+c;
      if (!poppedKeys.has(key) && grid[r] && grid[r][c] && !attached.has(key))
        floating.push({r, c});
    }
    return floating;
  }

  function _hexNeighbors(r, c) {
    const e = r % 2 === 0;
    return [[r-1,e?c-1:c],[r-1,e?c:c+1],[r,c-1],[r,c+1],[r+1,e?c-1:c],[r+1,e?c:c+1]];
  }

  function _trimEmptyRows() {
    while (grid.length && (grid[grid.length-1]||[]).every(b => !b)) grid.pop();
  }

  function _addNewTopRow() {
    const pal = _getColorsInGrid();
    if (!pal.length) return;
    const cols = colsForRow(0);
    const newRow = [];
    for (let c = 0; c < cols; c++) {
      const ci = pal[Math.floor(Math.random() * pal.length)];
      const mesh = _makeBubbleMesh(ci);
      newRow.push({ ci });
      // Existing rows shift down — rebuild all positions
      grid.unshift(newRow);
      // Reposition existing meshes
      gridMeshes.forEach(bm => {
        bm.row++;
        _placeMesh(bm.mesh, bm.row, bm.col);
      });
      // Add new row meshes
      for (let c2 = 0; c2 < cols; c2++) {
        if (!newRow[c2]) continue;
        const m = _makeBubbleMesh(newRow[c2].ci);
        _placeMesh(m, 0, c2);
        scene.add(m);
        gridMeshes.push({ mesh: m, row: 0, col: c2, ci: newRow[c2].ci });
      }
      _invalidateAim();
      if (window.FX) FX.screenFlash('#ff2d78', 0.12);
      return; // done — the loop above handles the shift
    }
  }

  function _gridTooLow() {
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < colsForRow(r); c++) {
      if (grid[r] && grid[r][c]) {
        const cv = cellXY(r, c);
        if (cv.y + R >= cannonCanvasY() - ROW_H * CLEAR_ROWS) return true;
      }
    }
    return false;
  }

  // ── Game flow ─────────────────────────────────────────────────
  function nextLevel() {
    score += 1000 * level; if (score > best) best = score;
    level++;
    dropTimer = DROP_SECS * 1000;
    heldCi = -1; canSwap = true; queue = [];
    generateLevel(); refillQueue(); hideOverlay(); updateUI(); SFX.levelUp();
    if (window.FX) { FX.confetti(window.innerWidth/2, window.innerHeight*0.3); FX.screenFlash('#39ff14', 0.25); }
  }

  function doGameOver() {
    dead = true; SFX.gameOver();
    if (window.FX) { FX.screenFlash('#ff2d78', 0.5); FX.shake(10); }
    showOverlay('lose', 'GAME OVER', score,
      `Level ${level} — ${Math.floor(elapsedMs/1000)}s`,
      [{ label:'🔄 RETRY', fn:'window.BAM3D?.newGame()' }, { label:'🕹 ARCADE', fn:'backToGameSelect()' }]
    );
    if (score > 0) setTimeout(() => window.HS?.promptSubmit('bustamove3d', score, score.toLocaleString()), 400);
  }

  function newGame() {
    if (!renderer) { initThree(); _bindEvents(); }
    score = 0; best = parseInt(localStorage.getItem('bam3d-best')||'0')||0;
    level = 1; chain = 0; chainTimer = 0;
    paused = false; dead = false; won = false;
    heldCi = -1; canSwap = true; queue = [];
    dropTimer = DROP_SECS * 1000; elapsedMs = 0;
    cannonAngle = -Math.PI / 2;
    if (ball) { if (ball.mesh) scene.remove(ball.mesh); ball = null; }
    trailMeshes.forEach(m => scene.remove(m)); trailMeshes = [];
    popMeshes.forEach(p => p.mesh && scene.remove(p.mesh)); popMeshes = [];
    scoreSprites.forEach(s => scene.remove(s.mesh)); scoreSprites = [];
    generateLevel(); refillQueue();
    _ensureCannonBubble(); _syncCannonBubble();
    hideOverlay(); updateUI();
    if (!animId) _loop();
  }

  function destroy() {
    dead = true;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    _unbindEvents();
    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; camera = null;
    gridMeshes = []; trailMeshes = []; popMeshes = []; scoreSprites = [];
  }

  function togglePause() {
    if (dead || won) return;
    paused = !paused;
    const btn = document.getElementById('bam3d-pause-btn');
    if (btn) btn.textContent = paused ? '▶' : '⏸';
    if (paused) showOverlay('pause', 'PAUSED', null, 'Game paused', [
      { label:'▶ RESUME', fn:'window.BAM3D?.togglePause()' },
      { label:'🆕 NEW',   fn:'window.BAM3D?.newGame()' },
    ]);
    else hideOverlay();
  }

  // ── UI ────────────────────────────────────────────────────────
  function updateUI() {
    const s = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    s('bam3d-score', score.toLocaleString());
    s('bam3d-best',  Math.max(score,best).toLocaleString());
    s('bam3d-level', level);
    s('bam3d-chain', chain > 1 ? `×${chain}` : '×1');
    const secs = Math.floor(elapsedMs/1000);
    s('bam3d-time', `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`);
    const bar = document.getElementById('bam3d-drop-bar');
    if (bar) {
      const f = Math.max(0, dropTimer/(DROP_SECS*1000));
      bar.style.width = (f*100)+'%';
      bar.style.background = f<0.25 ? '#ff2d78' : f<0.5 ? '#ffe600' : '#00f5ff';
    }
    if (score > best) { best = score; localStorage.setItem('bam3d-best', best); }
  }

  function showOverlay(type, title, sc, msg, btns) {
    const ov = document.getElementById('bam3d-overlay'); if (!ov) return;
    ov.classList.add('active');
    const t = document.getElementById('bam3d-ov-title');
    if (t) { t.textContent = title; t.className = 'bam3d-ov-title '+type; }
    const scEl = document.getElementById('bam3d-ov-score'); if (scEl) scEl.textContent = sc!=null ? sc.toLocaleString()+' pts' : '';
    const msgEl = document.getElementById('bam3d-ov-msg'); if (msgEl) msgEl.textContent = msg||'';
    const bd = document.getElementById('bam3d-ov-btns');
    if (bd) bd.innerHTML = (btns||[]).map(b =>
      `<button class="${b.label.includes('ARCADE')?'arcade-back-btn':'bam3d-btn'}" onclick="${b.fn}">${b.label}</button>`
    ).join('');
  }
  function hideOverlay() { const ov=document.getElementById('bam3d-overlay'); if(ov) ov.classList.remove('active'); }

  // ── Render loop ───────────────────────────────────────────────
  function _loop(ts = 0) {
    animId = requestAnimationFrame(_loop);
    if (document.hidden) return;
    const dt = Math.min(ts - lastTs, 50); lastTs = ts;
    if (!paused && !dead) update(dt);
    _updateAimLine();
    if (renderer && scene && camera) renderer.render(scene, camera);
    if (!dead && !paused) updateUI();
  }

  // ── Input (identical to pb.js) ────────────────────────────────
  function _aimFromClient(clientX, clientY) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = (clientX - rect.left) * (W / rect.width);
    const my = (clientY - rect.top)  * (H / rect.height);
    const dx = mx - cannonX(), dy = my - cannonCanvasY();
    const ang = Math.atan2(dy, dx);
    cannonAngle = Math.max(-Math.PI+0.12, Math.min(-0.12, ang));
    _updateBarrel();
    _invalidateAim();
  }

  function _onMouseMove(e) { if (!paused && !dead) _aimFromClient(e.clientX, e.clientY); }
  function _onClick(e)     { if (paused||dead||won) return; _aimFromClient(e.clientX,e.clientY); shoot(); }
  function _onTouch(e)     { if (paused||dead) return; e.preventDefault(); const t=e.touches[0]; _aimFromClient(t.clientX,t.clientY); }
  function _onTouchEnd()   { if (!paused&&!dead&&!won) shoot(); }

  function _onKeyDown(e) {
    const scr = document.getElementById('bustamove3d-screen');
    if (!scr || !scr.classList.contains('active')) return;
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': leftHeld  = true; e.preventDefault(); break;
      case 'ArrowRight':case 'd': case 'D': rightHeld = true; e.preventDefault(); break;
      case ' ':   shoot();       e.preventDefault(); break;
      case 'z': case 'Z': swapHold();    e.preventDefault(); break;
      case 'p': case 'P': togglePause(); break;
    }
  }
  function _onKeyUp(e) {
    if (e.key==='ArrowLeft' ||e.key==='a'||e.key==='A') leftHeld  = false;
    if (e.key==='ArrowRight'||e.key==='d'||e.key==='D') rightHeld = false;
  }

  function _bindEvents() {
    if (!container) return;
    container.addEventListener('mousemove',  _onMouseMove);
    container.addEventListener('click',      _onClick);
    container.addEventListener('touchmove',  _onTouch, { passive: false });
    container.addEventListener('touchend',   _onTouchEnd);
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
  }
  function _unbindEvents() {
    if (container) {
      container.removeEventListener('mousemove',  _onMouseMove);
      container.removeEventListener('click',      _onClick);
      container.removeEventListener('touchmove',  _onTouch);
      container.removeEventListener('touchend',   _onTouchEnd);
    }
    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup',   _onKeyUp);
  }

  return {
    newGame:         () => { if (!renderer) { initThree(); _bindEvents(); } newGame(); },
    destroy,
    togglePause,
    getCurrentScore: () => score,
  };
})();
