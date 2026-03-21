// ============================================================
// BUST-A-MOVE 3D  —  pb3d.js
// Three.js r128 — orthographic front-on camera (same view as pb.js)
// Real 3D lit spheres instead of canvas circles.
// 3 depth layers rendered at offset Z — visually stacked.
// Same gameplay as pb.js: aim cannon at bottom, shoot up, match 3.
// Extra: power-up bubbles, boss every 3rd level.
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
      floaters(n){ for (let i=0;i<Math.min(n,5);i++) tone(420-i*30,0.13,'sine',0.10,210,i*0.05); },
      chain(n)   { for (let i=0;i<Math.min(n,5);i++) tone(440*Math.pow(1.22,i),0.11,'square',0.14,null,i*0.07); },
      levelUp()  { [523,659,784,1047,1319].forEach((f,i)=>tone(f,0.13,'square',0.14,null,i*0.09)); setTimeout(()=>tone(1319,0.4,'sine',0.12,1047),520); },
      gameOver() { [440,370,330,262].forEach((f,i)=>tone(f,0.22,'sine',0.14,null,i*0.19)); },
      powerup()  { [523,659,880].forEach((f,i)=>tone(f,0.1,'square',0.14,null,i*0.07)); },
      resume()   { if (ctx&&ctx.state==='suspended') ctx.resume().catch(()=>{}); },
    };
  })();

  // ── Palette ────────────────────────────────────────────────────
  const COLORS_HEX = [0xff2d78, 0x00f5ff, 0x39ff14, 0xffe600, 0xbf00ff, 0xff6a00, 0xffffff];
  const COLORS_CSS = ['#ff2d78','#00f5ff','#39ff14','#ffe600','#bf00ff','#ff6a00','#ffffff'];
  const GLOWS_CSS  = ['rgba(255,45,120,.9)','rgba(0,245,255,.9)','rgba(57,255,20,.9)',
                      'rgba(255,230,0,.9)','rgba(191,0,255,.9)','rgba(255,106,0,.9)','rgba(255,255,255,.7)'];
  const COLOR_COUNT = COLORS_HEX.length - 1; // white = power-up only

  // ── Power-ups ──────────────────────────────────────────────────
  const POWERS = {
    bomb:  { label: '💣 BOMB',  color: '#ff2d78' },
    laser: { label: '🔫 LASER', color: '#00f5ff' },
    wild:  { label: '🌈 WILD',  color: '#ffffff' },
  };
  const POWER_KEYS  = Object.keys(POWERS);
  const POWER_CHANCE = 0.07;

  // ── World units ────────────────────────────────────────────────
  // We work in "world units" that map 1:1 to CSS pixels via the orthographic
  // camera. The camera frustum is set to exactly [0,W] x [0,H] so all
  // existing grid/cannon maths from pb.js work unchanged.

  const R           = 13;       // bubble radius in world units (pixels)
  const D           = R * 2;
  const ROW_H       = R * Math.sqrt(3);
  const SHOOT_SPEED = 22;
  const MAX_BOUNCES = 30;
  const DROP_SECS   = 60;
  const CEILING_PAD = 6;
  const CANNON_PAD  = 30;
  const CLEAR_ROWS  = 5;

  // ── 3D layer Z offsets ─────────────────────────────────────────
  // Layer 0 = active play layer (Z = 0).
  // Each additional layer sits behind by LAYER_Z_STEP units.
  // The orthographic camera sees all layers at once — back layers appear
  // slightly dimmer and smaller to convey depth.
  const LAYERS         = 3;
  const LAYER_Z_STEP   = 28;   // world units between layers (Z offset)
  const LAYER_SCALE    = [1.0, 0.82, 0.66]; // perspective-feel scaling
  const LAYER_OPACITY  = [1.0, 0.78, 0.58]; // dimmer = farther
  const LAYER_NAMES    = ['NEAR','MID','FAR'];

  // ── Three.js state ─────────────────────────────────────────────
  let renderer, scene, camera;
  let animId = null;
  let container = null;
  let _resizeObs = null;
  let W = 320, H = 540;   // updated on resize, mirrors canvas px dimensions

  // Scene objects
  let cannonGroup    = null;
  let cannonBarrel   = null;
  let aimLineMesh    = null;
  let bossGroup      = null;
  let bossEyeMesh    = null;

  // Bubble tracking
  let bubbleMeshes   = []; // { mesh, layer, row, col, ci, power }
  let ball           = null; // { mesh, x, y, vx, vy, ci, power, bounces, trail:[] }
  let trailMeshes    = [];
  let particles      = []; // pop explosion spheres
  let scoreSprites   = [];

  // ── Material / geometry cache ──────────────────────────────────
  const _matCache = {};
  function getBubbleMat(ci, emissiveBoost = 0) {
    const key = ci + '_' + emissiveBoost;
    if (!_matCache[key]) {
      _matCache[key] = new THREE.MeshPhongMaterial({
        color:              COLORS_HEX[ci],
        emissive:           COLORS_HEX[ci],
        emissiveIntensity:  0.18 + emissiveBoost,
        shininess:          140,
        specular:           0xffffff,
        transparent:        emissiveBoost > 0,
        opacity:            1.0,
      });
    }
    return _matCache[key];
  }

  // One sphere geometry per radius — shared across all bubbles at that size
  const _geoCache = {};
  function getSphereGeo(r) {
    if (!_geoCache[r]) _geoCache[r] = new THREE.SphereGeometry(r, 20, 14);
    return _geoCache[r];
  }

  // ── Game state ─────────────────────────────────────────────────
  let grid        = [];   // grid[layer][row][col] = {ci,power,mesh} | null
  let queue       = [];   // [{ci,power}, {ci,power}]
  let heldSlot    = null;
  let canSwap     = true;
  let cannonAngle = -Math.PI / 2;
  let score = 0, best = 0, level = 1;
  let chain = 0, chainTimer = 0;
  let paused = false, dead = false, won = false;
  let dropTimer   = DROP_SECS * 1000;
  let lastTs      = 0;
  let elapsedMs   = 0;
  let activePower = null;
  let bossMode    = false, bossHp = 0, bossMaxHp = 0, bossAnim = 0, bossShootTimer = 0;

  // Keyboard
  let leftHeld = false, rightHeld = false;
  const AIM_SPEED = 0.04;

  // Active layer — which layer the cannon is currently targeting (0 = nearest)
  let activeLayer = 0;

  // ── World-space helpers ────────────────────────────────────────
  // In our orthographic setup:
  //   camera left=0, right=W, bottom=0, top=H  (Y up)
  // So canvas Y (where Y=0 is top) maps to world Y = H - canvasY.
  // All pb.js coords use canvas convention (Y=0 at top).
  // We convert on the way into Three.js and back.

  function canvasToWorld(cx, cy) {
    return new THREE.Vector3(cx, H - cy, 0);
  }

  function _playW() { return W - Math.max(6, W * 0.045) * 2; }
  function colsEven() { return Math.floor(_playW() / D); }
  function colsOdd()  { return Math.floor((_playW() - R) / D); }
  function colsForRow(r) { return r % 2 === 0 ? colsEven() : colsOdd(); }

  // Canvas-space X/Y for a grid cell (same formula as pb.js)
  function cellCanvasXY(row, col, layer = 0) {
    const pillarW = Math.max(6, W * 0.045);
    const xOff = row % 2 === 0 ? 0 : R;
    return {
      x: pillarW + R + xOff + col * D,
      y: CEILING_PAD + row * ROW_H + R,
    };
  }

  // World-space position for a grid cell (includes layer Z offset + scale)
  function cellWorldPos(layer, row, col) {
    const cv = cellCanvasXY(row, col, layer);
    const scale = LAYER_SCALE[layer];
    // Scale the grid around the centre of the play area
    const cx = W / 2, cy = H / 2;
    const wx = cx + (cv.x - cx) * scale;
    const wy = cy + (cv.y - cy) * scale;  // canvas Y relative to centre
    return new THREE.Vector3(wx, H - wy, -layer * LAYER_Z_STEP);
  }

  function cannonWorldX() { return W / 2; }
  function cannonWorldY() { return H - (H - CANNON_PAD - R); }  // world Y = H - canvasY

  // ── Three.js init ──────────────────────────────────────────────
  function initThree() {
    container = document.getElementById('bam3d-canvas-container');
    if (!container) return;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x010510, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    // Orthographic camera — frustum exactly matches the canvas in world units.
    // Near/far wide enough to see all 3 layers plus a bit of room.
    camera = new THREE.OrthographicCamera(0, W, H, 0, -200, 200);
    camera.position.z = 100;

    // Lighting — front-facing key light mimics the radial gradient on pb.js bubbles
    scene.add(new THREE.AmbientLight(0x223355, 1.1));

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(W * 0.3, H * 0.7, 120);
    key.castShadow = true;
    scene.add(key);

    // Coloured rim lights to give each layer a distinct tint
    const layerLightColors = [0xff2d78, 0xbf00ff, 0x00f5ff];
    LAYER_Z_STEP && [0, 1, 2].forEach(l => {
      const pl = new THREE.PointLight(layerLightColors[l], 0.5, W * 2);
      pl.position.set(W / 2, H * 0.5, -l * LAYER_Z_STEP + 60);
      scene.add(pl);
    });

    // Right fill
    const fill = new THREE.DirectionalLight(0x4466aa, 0.35);
    fill.position.set(-W * 0.4, H * 0.3, 80);
    scene.add(fill);

    _buildBackground();
    _buildCannon();
    _buildAimLine();

    _resizeObs = new ResizeObserver(() => _resize());
    _resizeObs.observe(container);
    _resize();
  }

  function _resize() {
    if (!renderer || !container) return;
    const w = container.clientWidth  || 320;
    const h = container.clientHeight || 540;
    W = w; H = h;
    renderer.setSize(w, h);
    if (camera) {
      camera.left   = 0;  camera.right  = W;
      camera.top    = H;  camera.bottom = 0;
      camera.updateProjectionMatrix();
    }
    // Rebuild bg / cannon to match new W/H
    if (scene) {
      _rebuildBackground();
      _repositionCannon();
    }
  }

  // ── Background ─────────────────────────────────────────────────
  let _bgObjects = [];

  function _buildBackground() { _rebuildBackground(); }

  function _rebuildBackground() {
    _bgObjects.forEach(o => scene.remove(o));
    _bgObjects = [];

    // Deep fill plane — furthest back
    const bgGeo = new THREE.PlaneGeometry(W * 2, H * 2);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x010510 });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.position.set(W/2, H/2, -LAYER_Z_STEP * LAYERS - 50);
    scene.add(bg); _bgObjects.push(bg);

    // Stars (Points)
    const starCount = 70;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i*3]   = Math.random() * W;
      starPos[i*3+1] = Math.random() * H;
      starPos[i*3+2] = -LAYER_Z_STEP * 2 - 10;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc8e8ff, size: 1.5, transparent: true, opacity: 0.55 }));
    scene.add(stars); _bgObjects.push(stars);

    const pillarW = Math.max(6, W * 0.045);

    // Left neon pillar
    const pillarGeo = new THREE.PlaneGeometry(pillarW * 2.5, H);
    const pillarMatL = new THREE.MeshBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.12 });
    const pillarL = new THREE.Mesh(pillarGeo, pillarMatL);
    pillarL.position.set(pillarW * 1.25, H/2, -5);
    scene.add(pillarL); _bgObjects.push(pillarL);

    // Right neon pillar
    const pillarMatR = new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true, opacity: 0.12 });
    const pillarR = new THREE.Mesh(pillarGeo.clone(), pillarMatR);
    pillarR.position.set(W - pillarW * 1.25, H/2, -5);
    scene.add(pillarR); _bgObjects.push(pillarR);

    // Left edge line
    const lineMatL = new THREE.LineBasicMaterial({ color: 0x00f5ff });
    const lineL = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(2, 0, 1), new THREE.Vector3(2, H, 1),
    ]), lineMatL);
    scene.add(lineL); _bgObjects.push(lineL);

    // Right edge line
    const lineMatR = new THREE.LineBasicMaterial({ color: 0xff2d78 });
    const lineR = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(W-2, 0, 1), new THREE.Vector3(W-2, H, 1),
    ]), lineMatR);
    scene.add(lineR); _bgObjects.push(lineR);

    // Top colour bar
    const topPts = [new THREE.Vector3(0,H-1,1), new THREE.Vector3(W,H-1,1)];
    const topLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(topPts),
      new THREE.LineBasicMaterial({ color: 0xbf00ff }));
    scene.add(topLine); _bgObjects.push(topLine);

    // Ceiling line
    const ceilY = H - CEILING_PAD;
    const ceilLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, ceilY, 1), new THREE.Vector3(W, ceilY, 1),
    ]), new THREE.LineBasicMaterial({ color: 0x00f5ff, linewidth: 1 }));
    scene.add(ceilLine); _bgObjects.push(ceilLine);

    // Layer depth-cue lines — faint horizontal bands separating layers
    for (let l = 1; l < LAYERS; l++) {
      const ly = H * (0.25 + l * 0.2);
      const layerLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pillarW*2, ly, -l * LAYER_Z_STEP + 5),
        new THREE.Vector3(W - pillarW*2, ly, -l * LAYER_Z_STEP + 5),
      ]), new THREE.LineBasicMaterial({ color: [0xff2d78,0xbf00ff][l-1], transparent: true, opacity: 0.18 }));
      scene.add(layerLine); _bgObjects.push(layerLine);

      // Layer label sprite
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 80; labelCanvas.height = 24;
      const lc = labelCanvas.getContext('2d');
      lc.font = 'bold 13px Orbitron,monospace';
      lc.fillStyle = ['#ff2d78','#bf00ff'][l-1];
      lc.textAlign = 'left';
      lc.fillText(LAYER_NAMES[l], 2, 17);
      const tex = new THREE.CanvasTexture(labelCanvas);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.45 }));
      label.position.set(pillarW*2 + 6, ly + 6, -l * LAYER_Z_STEP + 6);
      label.scale.set(48, 14, 1);
      scene.add(label); _bgObjects.push(label);
    }
  }

  // ── Cannon ─────────────────────────────────────────────────────
  function _buildCannon() {
    cannonGroup = new THREE.Group();
    scene.add(cannonGroup);

    // Base disc
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(22, 26, 9, 24),
      new THREE.MeshPhongMaterial({ color: 0x0a1e30, emissive: 0x002244, shininess: 80 })
    );
    base.rotation.x = Math.PI / 2;
    cannonGroup.add(base);

    // Glow ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(24, 1.5, 8, 32),
      new THREE.MeshPhongMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.7 })
    );
    cannonGroup.add(ring);

    // Barrel pivot
    cannonBarrel = new THREE.Group();
    cannonGroup.add(cannonBarrel);

    // Barrel tube
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 5.5, 44, 12),
      new THREE.MeshPhongMaterial({ color: 0x2266aa, emissive: 0x001133, shininess: 120 })
    );
    bar.position.y = 22;
    cannonBarrel.add(bar);

    // Muzzle
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
    cannonGroup.position.set(cannonWorldX(), cannonWorldY(), 10);
  }

  function _updateCannonAngle() {
    if (!cannonBarrel) return;
    // cannonAngle is in pb.js convention: -π/2 = straight up.
    // In Three.js world (Y up), straight up = rotation.z = 0.
    // cannonAngle=-π/2 → bar points up → rotation.z=0.
    cannonBarrel.rotation.z = cannonAngle + Math.PI / 2;
  }

  // ── Aim line ───────────────────────────────────────────────────
  function _buildAimLine() {
    const mat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 5, gapSize: 8, transparent: true, opacity: 0.5 });
    aimLineMesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0)]), mat);
    scene.add(aimLineMesh);
  }

  function _updateAimLine() {
    if (!aimLineMesh) return;
    if (!queue[0] || dead || won || paused || ball) { aimLineMesh.visible = false; return; }
    aimLineMesh.visible = true;

    // Simulate trajectory in canvas space (same as pb.js drawAimLine)
    let vx = Math.cos(cannonAngle) * SHOOT_SPEED;
    let vy = Math.sin(cannonAngle) * SHOOT_SPEED;
    const pillarW = Math.max(6, W * 0.045);
    const wallL = pillarW + R, wallR = W - pillarW - R;
    let cx = cannonWorldX(), cy = H - cannonWorldY(); // canvas Y
    const pts3 = [new THREE.Vector3(cx, H - cy, 2)];

    for (let i = 0; i < 200; i++) {
      cx += vx; cy += vy;
      if (cx < wallL) { cx = wallL; vx = Math.abs(vx); pts3.push(new THREE.Vector3(cx, H-cy, 2)); }
      if (cx > wallR) { cx = wallR; vx = -Math.abs(vx); pts3.push(new THREE.Vector3(cx, H-cy, 2)); }
      if (cy < CEILING_PAD + R) { pts3.push(new THREE.Vector3(cx, H-cy, 2)); break; }
      pts3.push(new THREE.Vector3(cx, H-cy, 2));

      let hit = false;
      const layer = activeLayer;
      for (let r=0; r<(grid[layer]||[]).length&&!hit; r++) {
        for (let c=0; c<colsForRow(r)&&!hit; c++) {
          const b=grid[layer][r]&&grid[layer][r][c];
          if (!b) continue;
          const cv = cellCanvasXY(r,c,layer);
          const dx=cx-cv.x, dy=cy-cv.y;
          if (dx*dx+dy*dy < (D*1.05)*(D*1.05)) { pts3.push(new THREE.Vector3(cx,H-cy,2)); hit=true; }
        }
      }
      if (hit) break;
    }

    aimLineMesh.geometry.dispose();
    aimLineMesh.geometry = new THREE.BufferGeometry().setFromPoints(pts3);
    aimLineMesh.computeLineDistances();
    aimLineMesh.material.color.setHex(COLORS_HEX[queue[0].ci]);
  }

  // ── Grid ───────────────────────────────────────────────────────
  function generateLevel() {
    bubbleMeshes.forEach(b => b.mesh && scene.remove(b.mesh));
    bubbleMeshes = [];
    grid = [];

    const numColors = Math.min(2 + Math.floor(level * 0.7), COLOR_COUNT);
    const pal = Array.from({ length: numColors }, (_, i) => i);
    const baseRows = Math.min(4 + Math.floor(level / 2), 9);

    for (let l = 0; l < LAYERS; l++) {
      grid[l] = [];
      // Farther layers have fewer rows so they don't overwhelm the screen
      const rows = l === 0 ? baseRows : Math.max(2, Math.ceil(baseRows * (0.65 - l * 0.12)));
      for (let r = 0; r < rows; r++) {
        grid[l][r] = [];
        const cols = colsForRow(r);
        for (let c = 0; c < cols; c++) {
          // Farther layers are sparser
          if (l > 0 && Math.random() < 0.25 + l * 0.1) { grid[l][r][c] = null; continue; }
          const ci = pal[Math.floor(Math.random() * pal.length)];
          const power = Math.random() < POWER_CHANCE ? POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)] : null;
          const mesh = _makeBubbleMesh(ci, power, l);
          mesh.position.copy(cellWorldPos(l, r, c));
          scene.add(mesh);
          grid[l][r][c] = { ci, power, mesh };
          bubbleMeshes.push({ mesh, layer: l, row: r, col: c, ci, power });
        }
      }
    }

    // Boss every 3rd level
    if (level % 3 === 0) {
      bossMode = true; bossMaxHp = 12 + Math.floor(level/3) * 8; bossHp = bossMaxHp; bossShootTimer = 4000;
      _buildBoss();
    } else { bossMode = false; _removeBoss(); }

    // Ensure each colour appears ≥3 times in layer 0 (playable guarantee)
    _ensurePlayable(pal);
  }

  function _ensurePlayable(pal) {
    const counts = {};
    const l = 0;
    for (const row of (grid[l]||[])) for (const b of (row||[])) if (b) counts[b.ci]=(counts[b.ci]||0)+1;
    for (const ci of pal) {
      if ((counts[ci]||0) >= 3) continue;
      // Force a few cells to this colour
      let placed = 0;
      outer: for (let r=(grid[l]||[]).length-1; r>=0; r--) {
        for (let c=0; c<colsForRow(r); c++) {
          if (grid[l][r] && grid[l][r][c] && placed < 3) {
            const old = grid[l][r][c];
            old.ci = ci;
            old.mesh.material = getBubbleMat(ci, old.power ? 0.35 : 0).clone();
            placed++;
          }
          if (placed === 3) break outer;
        }
      }
    }
  }

  function _makeBubbleMesh(ci, power, layer = 0) {
    const scale = LAYER_SCALE[layer];
    const r = R * scale;
    const mat = getBubbleMat(ci, power ? 0.35 : 0).clone();
    mat.opacity = LAYER_OPACITY[layer];
    mat.transparent = layer > 0 || power != null;
    const mesh = new THREE.Mesh(getSphereGeo(r), mat);
    mesh.castShadow = true;
    if (power) {
      // Spinning ring to flag power-up bubbles
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r + 2.5, 1.2, 6, 22),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
      );
      ring.userData.isPowerRing = true;
      mesh.add(ring);
    }
    return mesh;
  }

  function countBubbles() {
    let n=0;
    for (const l of grid) for (const r of (l||[])) for (const b of (r||[])) if (b) n++;
    return n;
  }

  function getColorsInGrid(layer = 0) {
    const s = new Set();
    for (const r of (grid[layer]||[])) for (const b of (r||[])) if (b && b.ci < COLOR_COUNT) s.add(b.ci);
    return [...s];
  }

  // ── Boss ───────────────────────────────────────────────────────
  function _buildBoss() {
    _removeBoss();
    bossGroup = new THREE.Group();
    // Sits at the top centre, in layer 0's Z
    bossGroup.position.set(W/2, H - CEILING_PAD - 28, 5);
    scene.add(bossGroup);

    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(20, 1),
      new THREE.MeshPhongMaterial({ color: 0x880033, emissive: 0xff2d78, emissiveIntensity: 0.25, shininess: 80 })
    );
    bossGroup.add(body);

    bossEyeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(7, 12, 10),
      new THREE.MeshPhongMaterial({ color: 0xff0044, emissive: 0xff0044, emissiveIntensity: 0.9, shininess: 200 })
    );
    bossEyeMesh.position.set(0, 3, 18);
    bossGroup.add(bossEyeMesh);

    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(24, 1.5, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true, opacity: 0.5 })
    );
    aura.rotation.x = Math.PI / 2;
    bossGroup.add(aura);
  }
  function _removeBoss() { if (bossGroup) { scene.remove(bossGroup); bossGroup=null; bossEyeMesh=null; } }

  // ── Queue ──────────────────────────────────────────────────────
  function makeSlot() {
    const cols = getColorsInGrid(activeLayer);
    const ci = cols.length ? cols[Math.floor(Math.random()*cols.length)] : Math.floor(Math.random()*COLOR_COUNT);
    const power = Math.random() < POWER_CHANCE ? POWER_KEYS[Math.floor(Math.random()*POWER_KEYS.length)] : null;
    return { ci: power==='wild'?6:ci, power };
  }

  function refillQueue() {
    while (queue.length < 2) queue.push(makeSlot());
    updateQueueUI();
    _syncCannonBubble();
  }

  function consumeQueue() { const s=queue.shift(); refillQueue(); return s; }

  function _syncCannonBubble() {
    // Update the sphere sitting in the cannon to match the queued colour
    const cb = cannonGroup && cannonGroup.getObjectByName('cannonBubble');
    if (cb && queue[0]) {
      cb.material = getBubbleMat(queue[0].ci, 0).clone();
    }
  }

  function _addCannonBubble() {
    if (!cannonGroup || cannonGroup.getObjectByName('cannonBubble')) return;
    const cb = new THREE.Mesh(getSphereGeo(R * 0.88), getBubbleMat(0).clone());
    cb.name = 'cannonBubble';
    scene.add(cb); // added to scene, positioned separately
    cannonGroup.userData.cannonBubble = cb;
  }

  // ── Shoot ──────────────────────────────────────────────────────
  function shoot() {
    if (ball || paused || dead || won || !queue.length) return;
    SFX.resume(); SFX.shoot();
    const slot = consumeQueue();
    canSwap = true;

    // Create flying bubble mesh (layer 0 size, at z=2 so it renders in front)
    const mesh = _makeBubbleMesh(slot.ci, slot.power, 0);
    const startX = cannonWorldX();
    const startY = cannonWorldY();
    mesh.position.set(startX, startY, 2);
    scene.add(mesh);

    ball = {
      mesh,
      x: cannonWorldX(),
      y: H - cannonWorldY(), // canvas Y
      vx: Math.cos(cannonAngle) * SHOOT_SPEED,
      vy: Math.sin(cannonAngle) * SHOOT_SPEED,
      ci: slot.ci,
      power: slot.power,
      bounces: 0,
      trail: [],
    };
  }

  function swapHold() {
    if (!canSwap||paused||dead||won||ball) return;
    if (!heldSlot) { heldSlot=queue.shift(); refillQueue(); }
    else { const tmp=heldSlot; heldSlot=queue.shift(); queue.unshift(tmp); }
    canSwap=false; updateQueueUI();
  }

  function usePower() {
    if (!activePower||dead||won||paused||ball) return;
    const type=activePower; activePower=null; SFX.powerup();
    let total=0, pts=0;
    const l=activeLayer;

    if (type==='bomb') {
      for (let r=0;r<(grid[l]||[]).length;r++) for (let c=0;c<colsForRow(r);c++)
        if (grid[l][r]&&grid[l][r][c]) { _popBubble(l,r,c); total++; }
      pts=total*30*level; score+=pts;
      _addScoreSprite(W/2, H*0.55, `💣 BOMB! +${pts}`);
    } else if (type==='laser') {
      for (let r=0;r<(grid[l]||[]).length;r++) {
        const mid=Math.floor(colsForRow(r)/2);
        [-1,0,1].forEach(dc=>{
          const c=mid+dc;
          if (c>=0&&c<colsForRow(r)&&grid[l][r]&&grid[l][r][c]) { _popBubble(l,r,c); total++; }
        });
      }
      pts=total*40*level; score+=pts;
      _addScoreSprite(W/2, H*0.55, `🔫 LASER! +${pts}`);
    } else if (type==='wild') {
      const counts={};
      for (const ro of (grid[l]||[])) for (const b of (ro||[])) if (b) counts[b.ci]=(counts[b.ci]||0)+1;
      const topCi=+Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
      for (let r=0;r<(grid[l]||[]).length;r++) for (let c=0;c<colsForRow(r);c++)
        if (grid[l][r]&&grid[l][r][c]&&grid[l][r][c].ci===topCi) { _popBubble(l,r,c); total++; }
      pts=total*35*level; score+=pts;
      _addScoreSprite(W/2, H*0.55, `🌈 WILD! +${pts}`);
    }
    if (score>best) best=score;
    updateUI();
    if (window.FX) { FX.screenFlash('#ffe600',0.2); FX.shake(5); }
  }

  // ── Physics update ─────────────────────────────────────────────
  function update(dt) {
    if (leftHeld)  cannonAngle = Math.max(-Math.PI+0.15, cannonAngle-AIM_SPEED);
    if (rightHeld) cannonAngle = Math.min(-0.15,          cannonAngle+AIM_SPEED);
    _updateCannonAngle();

    if (chainTimer>0) { chainTimer-=dt; if (chainTimer<=0) { chain=0; updateUI(); } }

    if (!dead&&!won) {
      dropTimer-=dt;
      if (dropTimer<=0) {
        dropTimer=DROP_SECS*1000;
        _addNewTopRow();
        if (_gridTooLow()) { doGameOver(); return; }
      }
      elapsedMs+=dt;
    }

    // Ball movement — same sub-step logic as pb.js
    if (ball) {
      ball.trail.push({x:ball.x, y:ball.y});
      if (ball.trail.length>6) ball.trail.shift();

      const pillarW = Math.max(6,W*0.045);
      const wallL=pillarW+R, wallR=W-pillarW-R;
      const NUM_STEPS=Math.ceil(SHOOT_SPEED/(R*0.8));
      let placed=false;

      for (let si=0;si<NUM_STEPS&&!placed;si++) {
        ball.x+=ball.vx/NUM_STEPS;
        ball.y+=ball.vy/NUM_STEPS;

        if (ball.x<wallL) { ball.x=wallL; ball.vx=Math.abs(ball.vx); ball.bounces++; SFX.bounce(); }
        if (ball.x>wallR) { ball.x=wallR; ball.vx=-Math.abs(ball.vx); ball.bounces++; SFX.bounce(); }

        // Ceiling
        if (ball.y<CEILING_PAD+ROW_H*0.5) { _placeBall(); placed=true; break; }
        if (ball.bounces>MAX_BOUNCES) { _placeBall(); placed=true; break; }

        // Grid collision — check active layer
        const l=activeLayer;
        outer: for (let r=0;r<(grid[l]||[]).length;r++) {
          for (let c=0;c<colsForRow(r);c++) {
            const b=grid[l][r]&&grid[l][r][c];
            if (!b) continue;
            const cv=cellCanvasXY(r,c,l);
            const dx=ball.x-cv.x, dy=ball.y-cv.y;
            if (dx*dx+dy*dy < D*D) { _placeBall(); placed=true; break outer; }
          }
        }

        // Boss collision
        if (!placed&&bossMode&&bossGroup) {
          const bx=W/2, by=H-(H-CEILING_PAD-28);
          const dx=ball.x-bx, dy=ball.y-(CEILING_PAD+28);
          if (dx*dx+dy*dy<20*20) { _hitBoss(); scene.remove(ball.mesh); ball=null; placed=true; }
        }
      }

      // Sync mesh position
      if (ball && ball.mesh) {
        ball.mesh.position.set(ball.x, H-ball.y, 2);
      }
      if (!placed && ball && ball.y>H+50) { scene.remove(ball.mesh); ball=null; }
    }

    // Update trail meshes
    _updateTrail();

    // Particles
    const dtS=dt/1000;
    particles.forEach(p=>{
      p.mesh.position.x+=p.vx*dtS; p.mesh.position.y+=p.vy*dtS;
      p.vy-=180*dtS;
      p.life-=dt;
      const t=Math.max(0,p.life/p.maxLife);
      if (p.mesh.material) p.mesh.material.opacity=t;
      p.mesh.scale.setScalar(t*0.85+0.15);
    });
    particles=particles.filter(p=>{ if(p.life<=0){scene.remove(p.mesh);return false;} return true; });

    // Score sprites
    scoreSprites.forEach(s=>{ s.mesh.position.y+=60*dtS; s.life-=dt; const t=Math.max(0,s.life/s.maxLife); if(s.mesh.material) s.mesh.material.opacity=t; });
    scoreSprites=scoreSprites.filter(s=>{ if(s.life<=0){scene.remove(s.mesh);return false;} return true; });

    // Boss
    if (bossMode&&bossHp>0&&bossGroup) {
      bossAnim+=dt*0.002;
      bossGroup.position.x=W/2+Math.sin(bossAnim)*W*0.18;
      bossGroup.rotation.y+=dt*0.001;
      if (bossEyeMesh) bossEyeMesh.material.emissiveIntensity=0.7+0.3*Math.sin(bossAnim*4);
      bossShootTimer-=dt;
      if (bossShootTimer<=0) { bossShootTimer=Math.max(1800,3500-level*120); _spawnBossParticle(); }
    }

    // Rotate power-up rings
    bubbleMeshes.forEach(b=>{
      b.mesh&&b.mesh.children.forEach(ch=>{ if(ch.userData.isPowerRing) ch.rotation.z+=dt*0.003; });
    });
  }

  function _updateTrail() {
    trailMeshes.forEach(m=>scene.remove(m));
    trailMeshes=[];
    if (!ball||!ball.trail.length) return;
    ball.trail.forEach((tp,i)=>{
      const t=(i+1)/ball.trail.length;
      const r=R*t*0.6;
      if (r<1) return;
      const m=new THREE.Mesh(
        getSphereGeo(Math.round(r)),
        new THREE.MeshBasicMaterial({color:COLORS_HEX[ball.ci],transparent:true,opacity:t*0.3})
      );
      m.position.set(tp.x, H-tp.y, 1.5);
      scene.add(m); trailMeshes.push(m);
    });
  }

  // ── Snap & place ───────────────────────────────────────────────
  function _snapToGrid(l) {
    let bestRow=-1, bestCol=-1, bestDist=Infinity;
    const approxRow=Math.round((ball.y-R-CEILING_PAD)/ROW_H);
    const from=Math.max(0,approxRow-2), to=Math.min((grid[l]||[]).length+1, approxRow+2);
    for (let r=from;r<=to;r++) {
      const cols=colsForRow(r);
      for (let c=0;c<cols;c++) {
        if (r<(grid[l]||[]).length&&grid[l][r]&&grid[l][r][c]) continue;
        const cv=cellCanvasXY(r,c,l);
        const dx=ball.x-cv.x, dy=ball.y-cv.y;
        const dist=dx*dx+dy*dy;
        if (dist<bestDist) { bestDist=dist; bestRow=r; bestCol=c; }
      }
    }
    return bestRow===-1 ? null : {row:bestRow,col:bestCol};
  }

  function _placeBall() {
    if (!ball) return;
    const l=activeLayer;
    const snap=_snapToGrid(l);
    if (!snap) { if(ball.mesh) scene.remove(ball.mesh); ball=null; return; }
    const {row,col}=snap;

    if (!grid[l]) grid[l]=[];
    while (grid[l].length<=row) grid[l].push(new Array(colsForRow(grid[l].length)).fill(null));

    // Power-up pickup
    if (ball.power) {
      activePower=ball.power; SFX.powerup();
      _addScoreSprite(ball.x, H-ball.y, POWERS[ball.power].label);
      scene.remove(ball.mesh); ball=null; updateUI(); return;
    }

    const ci=ball.ci;
    // Snap the mesh to grid position
    const worldPos=cellWorldPos(l,row,col);
    ball.mesh.position.copy(worldPos);
    grid[l][row][col]={ci,power:null,mesh:ball.mesh};
    bubbleMeshes.push({mesh:ball.mesh,layer:l,row,col,ci,power:null});
    ball.mesh=null; ball=null;
    SFX.land();

    const group=_getMatchGroup(l,row,col);
    if (group.length>=3) {
      const floaters=_getFloating(l,group);
      chain++; chainTimer=3000;
      const pts=group.length*group.length*10*level*chain + floaters.length*50*level*chain;
      score+=pts; if (score>best) best=score;

      SFX.pop(group.length);
      if (floaters.length) setTimeout(()=>SFX.floaters(floaters.length),120);
      if (chain>=2) setTimeout(()=>SFX.chain(chain),200);

      const avgCv=group.reduce((a,{r,c})=>{const cv=cellCanvasXY(r,c,l);a.x+=cv.x;a.y+=cv.y;return a;},{x:0,y:0});
      avgCv.x/=group.length; avgCv.y/=group.length;

      group.forEach(({r,c})=>_popBubble(l,r,c));
      floaters.forEach(({r,c})=>_popBubble(l,r,c,true));
      _addScoreSprite(avgCv.x, H-avgCv.y+20, chain>1?`CHAIN×${chain}! +${pts}`:`+${pts}`);

      if (window.FX&&chain>=2) { FX.screenFlash(COLORS_CSS[ci],0.18); FX.shake(4); }
    } else {
      chain=0; chainTimer=0;
    }

    updateUI();
    if (countBubbles()===0) { setTimeout(nextLevel,700); return; }
    if (_gridTooLow()) { doGameOver(); return; }
  }

  function _popBubble(layer,row,col,isFloater=false) {
    if (!grid[layer]||!grid[layer][row]||!grid[layer][row][col]) return;
    const b=grid[layer][row][col];
    if (b.mesh) {
      const cv=cellCanvasXY(row,col,layer);
      _spawnPopParticles(cv.x, H-cv.y, b.ci, isFloater, layer);
      scene.remove(b.mesh);
    }
    grid[layer][row][col]=null;
    const idx=bubbleMeshes.findIndex(bm=>bm.layer===layer&&bm.row===row&&bm.col===col);
    if (idx!==-1) bubbleMeshes.splice(idx,1);
  }

  function _spawnPopParticles(wx, wy, ci, isFloater, layer=0) {
    const scale=LAYER_SCALE[layer];
    const count=isFloater?4:9;
    for (let i=0;i<count;i++) {
      const r=R*scale*0.32;
      const mesh=new THREE.Mesh(
        getSphereGeo(Math.max(1,Math.round(r))),
        new THREE.MeshBasicMaterial({color:COLORS_HEX[ci],transparent:true,opacity:1})
      );
      mesh.position.set(wx,wy,-layer*LAYER_Z_STEP+3);
      scene.add(mesh);
      const spd=(isFloater?60:120)+Math.random()*120;
      const angle=Math.random()*Math.PI*2;
      const upBias=isFloater?-60:0;
      particles.push({mesh, vx:Math.cos(angle)*spd, vy:Math.sin(angle)*spd+upBias, life:600+Math.random()*300, maxLife:900});
    }
  }

  function _addScoreSprite(cx,wy,text) {
    const canvas=document.createElement('canvas');
    canvas.width=240; canvas.height=52;
    const c=canvas.getContext('2d');
    c.font='bold 22px Orbitron,monospace';
    c.textAlign='center';
    c.fillStyle=text.includes('!')? '#ffe600':'#ffffff';
    c.shadowColor='#ffe600'; c.shadowBlur=10;
    c.fillText(text,120,36);
    const tex=new THREE.CanvasTexture(canvas);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:1}));
    sprite.position.set(cx,wy,3);
    sprite.scale.set(140,30,1);
    scene.add(sprite);
    scoreSprites.push({mesh:sprite,life:1300,maxLife:1300});
  }

  // ── Flood fill ─────────────────────────────────────────────────
  function _getMatchGroup(layer,row,col) {
    if (!grid[layer]||!grid[layer][row]||!grid[layer][row][col]) return [];
    const ci=grid[layer][row][col].ci;
    if (ci===6) return [];
    const visited=new Set(),result=[],stack=[[row,col]];
    while (stack.length) {
      const [r,c]=stack.pop(); const key=r+','+c;
      if (visited.has(key)) continue;
      if (r<0||r>=(grid[layer]||[]).length) continue;
      if (c<0||c>=colsForRow(r)) continue;
      if (!grid[layer][r]||!grid[layer][r][c]||grid[layer][r][c].ci!==ci) continue;
      visited.add(key); result.push({r,c});
      stack.push(..._hexNeighbors(r,c));
    }
    return result;
  }

  function _getFloating(layer,justPopped) {
    const poppedKeys=new Set(justPopped.map(({r,c})=>r+','+c));
    const attached=new Set(),q=[];
    for (let c=0;c<colsForRow(0);c++) {
      const key='0,'+c;
      if (!poppedKeys.has(key)&&grid[layer][0]&&grid[layer][0][c]) { q.push([0,c]); attached.add(key); }
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
      if (!poppedKeys.has(key)&&grid[layer][r]&&grid[layer][r][c]&&!attached.has(key))
        floating.push({r,c});
    }
    return floating;
  }

  function _hexNeighbors(r,c) {
    const e=r%2===0;
    return [[r-1,e?c-1:c],[r-1,e?c:c+1],[r,c-1],[r,c+1],[r+1,e?c-1:c],[r+1,e?c:c+1]];
  }

  function _addNewTopRow() {
    const l=activeLayer;
    const cols=getColorsInGrid(l);
    if (!cols.length) return;
    const newRow=Array.from({length:colsForRow(0)},()=>{
      const ci=cols[Math.floor(Math.random()*cols.length)];
      const mesh=_makeBubbleMesh(ci,null,l);
      return {ci,power:null,mesh};
    });
    if (!grid[l]) grid[l]=[];
    grid[l].unshift(newRow);
    for (let r=0;r<grid[l].length;r++) {
      const row=grid[l][r]||[];
      for (let c=0;c<row.length;c++) {
        const b=row[c]; if (!b) continue;
        b.mesh.position.copy(cellWorldPos(l,r,c));
        if (r===0) { scene.add(b.mesh); bubbleMeshes.push({mesh:b.mesh,layer:l,row:r,col:c,ci:b.ci,power:null}); }
        else { const bm=bubbleMeshes.find(x=>x.mesh===b.mesh); if(bm) bm.row=r; }
      }
    }
    if (window.FX) FX.screenFlash('#ff2d78',0.1);
  }

  function _gridTooLow() {
    const l=activeLayer;
    for (let r=(grid[l]||[]).length-1;r>=0;r--) for (let c=0;c<colsForRow(r);c++) {
      if (grid[l][r]&&grid[l][r][c]) {
        const cv=cellCanvasXY(r,c,l);
        // Danger zone: same as pb.js — CLEAR_ROWS above cannon
        const cannonCanvasY=H-CANNON_PAD-R;
        if (cv.y+R >= cannonCanvasY - ROW_H*CLEAR_ROWS) return true;
      }
    }
    return false;
  }

  // ── Boss ───────────────────────────────────────────────────────
  function _hitBoss() {
    bossHp--;
    SFX.pop(3);
    if (window.FX){FX.shake(6);FX.screenFlash('#ff2d78',0.25);}
    score+=100*level; if(score>best)best=score;
    _addScoreSprite(W/2,H-CEILING_PAD-60,'💥 HIT! +'+(100*level));
    updateUI();
    if (bossHp<=0) {
      SFX.levelUp();
      score+=1500*level; if(score>best)best=score;
      _addScoreSprite(W/2,H*0.45,'⚡ BOSS DOWN! +'+(1500*level));
      _removeBoss(); bossMode=false;
      if(window.FX){FX.confetti(window.innerWidth/2,window.innerHeight*0.3);FX.screenFlash('#ffe600',0.4);}
      if(countBubbles()===0) setTimeout(nextLevel,800);
    }
  }

  function _spawnBossParticle() {
    if (!bossGroup) return;
    const ci=Math.floor(Math.random()*COLOR_COUNT);
    const mesh=new THREE.Mesh(getSphereGeo(R*0.5),new THREE.MeshBasicMaterial({color:COLORS_HEX[ci],transparent:true,opacity:0.9}));
    mesh.position.set(W/2,H-CEILING_PAD-28,3);
    scene.add(mesh);
    particles.push({mesh,vx:(Math.random()-0.5)*200,vy:-80,life:1000,maxLife:1000});
  }

  // ── Game flow ──────────────────────────────────────────────────
  function nextLevel() {
    score+=1000*level; level++;
    dropTimer=DROP_SECS*1000; chain=0; chainTimer=0;
    heldSlot=null; canSwap=true; queue=[]; activePower=null;
    generateLevel(); refillQueue(); hideOverlay(); updateUI(); SFX.levelUp();
    if(window.FX){FX.confetti(window.innerWidth/2,window.innerHeight*0.3);FX.screenFlash('#39ff14',0.25);}
  }

  function doGameOver() {
    dead=true; SFX.gameOver();
    if(window.FX){FX.screenFlash('#ff2d78',0.5);FX.shake(10);}
    showOverlay('lose','GAME OVER',score,`Level ${level}`,[
      {label:'🔄 RETRY',  fn:'window.BAM3D?.newGame()'},
      {label:'🕹 ARCADE', fn:'backToGameSelect()'},
    ]);
    if(score>0) setTimeout(()=>window.HS?.promptSubmit('bustamove3d',score,score.toLocaleString()),500);
  }

  function newGame() {
    if (!renderer) { initThree(); _bindEvents(); }
    score=0; best=parseInt(localStorage.getItem('bam3d-best')||'0')||0;
    level=1; chain=0; chainTimer=0; paused=false; dead=false; won=false;
    dropTimer=DROP_SECS*1000; elapsedMs=0; cannonAngle=-Math.PI/2;
    activePower=null; heldSlot=null; canSwap=true; queue=[]; activeLayer=0;
    if (ball){if(ball.mesh)scene.remove(ball.mesh);ball=null;}
    trailMeshes.forEach(m=>scene.remove(m)); trailMeshes=[];
    particles.forEach(p=>scene.remove(p.mesh)); particles=[];
    scoreSprites.forEach(s=>scene.remove(s.mesh)); scoreSprites=[];
    generateLevel(); refillQueue(); hideOverlay(); updateUI();
    if (!animId) _loop();
  }

  function destroy() {
    dead=true;
    if (animId){cancelAnimationFrame(animId);animId=null;}
    _unbindEvents();
    if (_resizeObs){_resizeObs.disconnect();_resizeObs=null;}
    if (renderer){renderer.dispose();renderer=null;}
    scene=null; camera=null;
    bubbleMeshes=[]; particles=[]; scoreSprites=[]; trailMeshes=[];
    Object.values(_geoCache).forEach(g=>g.dispose());
    Object.values(_matCache).forEach(m=>m.dispose());
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
    if (bar){const f=Math.max(0,dropTimer/(DROP_SECS*1000));bar.style.width=(f*100)+'%';bar.style.background=f<0.25?'#ff2d78':f<0.5?'#ffe600':'#00f5ff';}
    const bossWrap=document.getElementById('bam3d-boss-wrap');
    const bossBar=document.getElementById('bam3d-boss-bar');
    if(bossWrap) bossWrap.style.display=bossMode?'block':'none';
    if(bossBar&&bossMode) bossBar.style.width=((bossHp/bossMaxHp)*100)+'%';
    const pwEl=document.getElementById('bam3d-power-slot');
    if(pwEl){
      if(activePower){const pw=POWERS[activePower];pwEl.textContent=pw.label;pwEl.style.color=pw.color;pwEl.style.borderColor=pw.color;pwEl.style.opacity='1';}
      else{pwEl.textContent='— NO POWER-UP —';pwEl.style.color='rgba(0,245,255,0.35)';pwEl.style.borderColor='rgba(0,245,255,0.15)';pwEl.style.opacity='0.6';}
    }
    // Layer selector
    for (let l=0;l<LAYERS;l++) {
      const btn=document.getElementById(`bam3d-layer-${l}`);
      if(btn) btn.classList.toggle('active',l===activeLayer);
    }
    if (score>best){best=score;localStorage.setItem('bam3d-best',best);}
  }

  function updateQueueUI() {
    _drawMiniPreview('bam3d-next-canvas', queue[0]);
    _drawMiniPreview('bam3d-hold-canvas', heldSlot);
  }

  function _drawMiniPreview(id,slot) {
    const el=document.getElementById(id); if(!el) return;
    const c=el.getContext('2d'); c.clearRect(0,0,el.width,el.height);
    if(!slot){c.strokeStyle='rgba(0,245,255,0.2)';c.lineWidth=1;c.beginPath();c.arc(el.width/2,el.height/2,el.width/2-4,0,Math.PI*2);c.stroke();return;}
    const cx=el.width/2,cy=el.height/2,r=el.width/2-4;
    const gr=c.createRadialGradient(cx-r*0.3,cy-r*0.35,r*0.05,cx,cy,r);
    const col=COLORS_CSS[slot.ci];
    gr.addColorStop(0,_lighten(col,0.6));gr.addColorStop(0.6,col);gr.addColorStop(1,_darken(col,0.4));
    c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=gr;c.fill();
    c.beginPath();c.arc(cx-r*0.3,cy-r*0.32,r*0.24,0,Math.PI*2);c.fillStyle='rgba(255,255,255,0.65)';c.fill();
    if(slot.power){c.font='bold 11px Orbitron,monospace';c.textAlign='center';c.fillStyle='#fff';c.shadowColor='#fff';c.shadowBlur=6;c.fillText(slot.power[0].toUpperCase(),cx,el.height-3);c.shadowBlur=0;}
  }

  function _lighten(hex,a){const[r,g,b]=_hr(hex);return`rgb(${Math.min(255,r+~~(255*a))},${Math.min(255,g+~~(255*a))},${Math.min(255,b+~~(255*a))})`;}
  function _darken(hex,a) {const[r,g,b]=_hr(hex);return`rgb(${Math.max(0,r-~~(255*a))},${Math.max(0,g-~~(255*a))},${Math.max(0,b-~~(255*a))})`;}
  function _hr(h){const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}

  function showOverlay(type,title,sc,msg,btns){
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
  function _aimFromClient(clientX,clientY) {
    if (!container) return;
    const rect=container.getBoundingClientRect();
    const mx=(clientX-rect.left)*(W/rect.width);
    const my=(clientY-rect.top)*(H/rect.height);
    const dx=mx-cannonWorldX(), dy=my-(H-cannonWorldY());
    const ang=Math.atan2(dy,dx);
    cannonAngle=Math.max(-Math.PI+0.12,Math.min(-0.12,ang));
    _updateCannonAngle();
  }

  function _onMouseMove(e){if(!paused&&!dead) _aimFromClient(e.clientX,e.clientY);}
  function _onClick(e){if(paused||dead||won)return; _aimFromClient(e.clientX,e.clientY); shoot();}
  function _onTouch(e){if(paused||dead)return;e.preventDefault();const t=e.touches[0];_aimFromClient(t.clientX,t.clientY);}
  function _onTouchEnd(){if(!paused&&!dead&&!won)shoot();}
  function _onKeyDown(e){
    const scr=document.getElementById('bustamove3d-screen');
    if(!scr||!scr.classList.contains('active'))return;
    switch(e.key){
      case 'ArrowLeft': case 'a':case 'A': leftHeld=true;  e.preventDefault();break;
      case 'ArrowRight':case 'd':case 'D': rightHeld=true; e.preventDefault();break;
      case ' ':  shoot();       e.preventDefault();break;
      case 'z':case 'Z': swapHold();  e.preventDefault();break;
      case 'x':case 'X': usePower();  e.preventDefault();break;
      case 'p':case 'P': togglePause();break;
      // Tab between layers
      case 'Tab': e.preventDefault(); activeLayer=(activeLayer+1)%LAYERS; updateUI(); break;
      case '1': activeLayer=0; updateUI(); break;
      case '2': activeLayer=1; updateUI(); break;
      case '3': activeLayer=2; updateUI(); break;
    }
  }
  function _onKeyUp(e){
    if(e.key==='ArrowLeft' ||e.key==='a'||e.key==='A') leftHeld=false;
    if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') rightHeld=false;
  }

  function _bindEvents(){
    if(!container)return;
    container.addEventListener('mousemove',_onMouseMove);
    container.addEventListener('click',    _onClick);
    container.addEventListener('touchmove',_onTouch,{passive:false});
    container.addEventListener('touchend', _onTouchEnd);
    document.addEventListener('keydown',_onKeyDown);
    document.addEventListener('keyup',  _onKeyUp);
  }
  function _unbindEvents(){
    if(container){
      container.removeEventListener('mousemove',_onMouseMove);
      container.removeEventListener('click',    _onClick);
      container.removeEventListener('touchmove',_onTouch);
      container.removeEventListener('touchend', _onTouchEnd);
    }
    document.removeEventListener('keydown',_onKeyDown);
    document.removeEventListener('keyup',  _onKeyUp);
  }

  return {
    newGame:  ()=>{ if(!renderer){initThree();_bindEvents();} newGame(); },
    destroy,
    togglePause,
    usePower,
    setLayer: (l)=>{ activeLayer=Math.max(0,Math.min(LAYERS-1,l)); updateUI(); },
    getCurrentScore: ()=>score,
  };
})();
