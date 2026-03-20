// ╔══════════════════════════════════════════════════════════════════════╗
// ║  bs3d.js — Three.js 3D Visual Layer for Battleships  v4            ║
// ║                                                                      ║
// ║  Architecture:                                                       ║
// ║  • ONE full-viewport WebGL canvas at z-index:0 (behind everything)  ║
// ║  • HTML grid cells (z-index:1, transparent bg) sit on top           ║
// ║  • Tilted PerspectiveCamera for depth — ships look 3D               ║
// ║  • Ships positioned by raycasting each cell's screen centre onto    ║
// ║    the Y=0 world plane → perfect alignment with HTML cells at       ║
// ║    any camera angle                                                  ║
// ║  • 3D grid lines projected from cell corner screen positions —      ║
// ║    they match HTML borders exactly                                   ║
// ║  • 2D ocean canvas and SVG ship overlays suppressed via CSS         ║
// ╚══════════════════════════════════════════════════════════════════════╝

export default (() => {

  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  let THREE = null, _ready = false;
  const _readyQ = [];
  function onReady(fn) { if (_ready) fn(); else _readyQ.push(fn); }
  function _loadThree() {
    if (window.THREE) { THREE = window.THREE; _ready = true; _readyQ.forEach(f => f()); return; }
    const s = document.createElement('script');
    s.src = THREE_URL;
    s.onload = () => { THREE = window.THREE; _ready = true; _readyQ.forEach(f => f()); };
    document.head.appendChild(s);
  }
  _loadThree();

  // ══════════════════════════════════════════════════════════════
  // CSS — suppress 2D layers, make grid cells truly transparent
  // ══════════════════════════════════════════════════════════════
  const _css = document.createElement('style');
  _css.id = 'bs3d-suppress';
  _css.textContent = `
    /* Full-viewport 3D canvas sits behind everything */
    #bs3d-canvas {
      position: fixed; inset: 0;
      width: 100vw; height: 100vh;
      pointer-events: none;
      z-index: 0;
    }
    /* Kill 2D ocean — 3D water shows through transparent cells */
    #enemy-grid .grid-ocean-canvas,
    #my-grid    .grid-ocean-canvas { display: none !important; }
    /* Kill 2D ship SVG overlays in game-screen ONLY —
       placement-screen drag ghost (also .ship-overlay) must still work */
    #game-screen #enemy-grid .ship-overlay,
    #game-screen #my-grid    .ship-overlay { display: none !important; }
    /* Keep 2D wrecks — shown after 3D sink animation completes */
    #enemy-grid .ship-wreck,
    #my-grid    .ship-wreck  { display: block !important; }
    /* Grid cells: ensure truly transparent so 3D shows through */
    #game-screen .grid-cell:not(.hit):not(.miss):not(.sunk):not(.sunk-ship) {
      background: transparent !important;
    }
    /* Remove green cell borders from player ships — 3D models replace them */
    #game-screen #my-grid .grid-cell.ship-cell {
      border-color: var(--grid-line) !important;
      background: transparent !important;
    }
    /* Hit / miss cells keep their colours but let glow bleed through */
    #game-screen .grid-cell.hit  { background: rgba(30,4,0,0.55) !important; }
    #game-screen .grid-cell.miss { background: rgba(0,10,30,0.35) !important; }
  `;
  document.head.appendChild(_css);

  // ══════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════
  const GRID_N   = 10;
  const LABEL_PX = 22;   // CSS label col/row = 22px

  // Camera — tilted perspective, narrow FOV reduces distortion
  // Sits at (0, H, Z) looking at origin; pitch = atan(Z/H)
  const CAM_H   = 14;    // height above ground — lower = more tilt visible
  const CAM_Z   = 9;     // further back = more pitch angle (~33°)
  const CAM_FOV = 32;    // slightly wider to keep full grid in view

  // Water colour: deep navy
  const WATER_COL = 0x041828;

  // Ship colours — all steel/grey family, no greens
  const SHIP_PAL = {
    carrier:    { hull: 0x2a3a44, deck: 0x1e2e38, acc: 0x3a5060 },
    battleship: { hull: 0x1e2530, deck: 0x18202a, acc: 0x2a3c50 },
    cruiser:    { hull: 0x253030, deck: 0x1a2428, acc: 0x304048 },
    submarine:  { hull: 0x1e2a20, deck: 0x18221a, acc: 0x2a3c2e },
    destroyer:  { hull: 0x202028, deck: 0x181820, acc: 0x2e2e40 },
  };

  // ══════════════════════════════════════════════════════════════
  // SINGLE RENDERER — full viewport
  // ══════════════════════════════════════════════════════════════
  let _renderer = null, _camera = null, _scene = null;
  let _rafId    = null;
  let _oceanMeshes = [];  // [{ mesh, waveBase }] for both grids
  let _oceanTime = 0;
  let _particles = [];
  let _missiles  = [];
  // Per-grid state
  const _grids = {
    'enemy-grid': { shipMeshes: {}, lineMeshes: [] },
    'my-grid':    { shipMeshes: {}, lineMeshes: [] },
  };

  function initRenderer() {
    if (_renderer) { _renderer.dispose(); _renderer = null; }

    const canvas = document.createElement('canvas');
    canvas.id = 'bs3d-canvas';
    document.body.appendChild(canvas);

    _renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(window.innerWidth, window.innerHeight);
    _renderer.setClearColor(0x000000, 0);

    _scene = new THREE.Scene();

    // Camera
    _camera = new THREE.PerspectiveCamera(CAM_FOV, window.innerWidth / window.innerHeight, 0.1, 500);
    _camera.position.set(0, CAM_H, CAM_Z);
    _camera.lookAt(0, 0, 0);

    _buildLights();

    window.addEventListener('resize', _onResize);

    if (!_rafId) _startLoop();
  }

  function _onResize() {
    if (!_renderer) return;
    _renderer.setSize(window.innerWidth, window.innerHeight);
    _camera.aspect = window.innerWidth / window.innerHeight;
    _camera.updateProjectionMatrix();
    // Rebuild grid water + lines since cell positions changed
    _rebuildBothGrids();
  }

  function _buildLights() {
    _scene.add(new THREE.AmbientLight(0x223366, 1.2));
    // Main directional light — from upper-front for ship body shading
    const d = new THREE.DirectionalLight(0xaabbdd, 2.0);
    d.position.set(2, 16, 10);
    _scene.add(d);
    // Back fill — soften harsh shadows
    const b = new THREE.DirectionalLight(0x334466, 0.5);
    b.position.set(-3, 8, -8);
    _scene.add(b);
    // Neon cyan point — arcade glow
    const f = new THREE.PointLight(0x00f5ff, 0.8, 80);
    f.position.set(0, 18, 0);
    _scene.add(f);
  }

  function _startLoop() {
    const tick = () => {
      _rafId = requestAnimationFrame(tick);
      if (document.hidden) return;
      _oceanTime += 0.016;
      _animateOcean();
      _tickParticles();
      _tickMissiles();
      if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
    };
    _rafId = requestAnimationFrame(tick);
  }

  // ══════════════════════════════════════════════════════════════
  // COORDINATE PROJECTION
  // Project a viewport pixel position (px, py) onto the Y=0 world plane
  // using the current camera. Returns THREE.Vector3 or null.
  // ══════════════════════════════════════════════════════════════
  // Lazily created after THREE loads
  let _plane = null;
  let _ray   = null;
  function _ensureRay() {
    if (!_plane) _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (!_ray)   _ray   = new THREE.Raycaster();
  }

  function screenToWorld(px, py) {
    if (!_camera) return null;
    _ensureRay();
    const ndc = new THREE.Vector2(
      (px / window.innerWidth)  * 2 - 1,
      -(py / window.innerHeight) * 2 + 1,
    );
    _ray.setFromCamera(ndc, _camera);
    const hit = new THREE.Vector3();
    if (_ray.ray.intersectPlane(_plane, hit)) return hit;
    return null;
  }

  // Project the centre of a grid cell (by DOM element) to world space
  function cellElToWorld(cellEl) {
    const r = cellEl.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    return screenToWorld(cx, cy);
  }

  // Project all four corners of a cell to world space
  function cellElToWorldCorners(cellEl) {
    const r = cellEl.getBoundingClientRect();
    return [
      screenToWorld(r.left,  r.top),
      screenToWorld(r.right, r.top),
      screenToWorld(r.right, r.bottom),
      screenToWorld(r.left,  r.bottom),
    ];
  }

  // Get the world centre for row r, col c on a given grid
  function cellToWorld(gridId, r, c) {
    const gridEl = document.getElementById(gridId);
    if (!gridEl) return null;
    const cell = gridEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    if (cell) return cellElToWorld(cell);
    // Fallback: interpolate from grid bounding rect
    const full = gridEl.getBoundingClientRect();
    const cellW = (full.width  - LABEL_PX) / GRID_N;
    const cellH = (full.height - LABEL_PX) / GRID_N;
    const px = full.left + LABEL_PX + c * cellW + cellW / 2;
    const py = full.top  + LABEL_PX + r * cellH + cellH / 2;
    return screenToWorld(px, py);
  }

  // ══════════════════════════════════════════════════════════════
  // OCEAN PLANE — one per grid
  // Projects grid corners to find world centre, builds a subdivided
  // PlaneGeometry there for wave displacement.
  // ══════════════════════════════════════════════════════════════
  function buildOceanForGrid(gridId) {
    const gridEl = document.getElementById(gridId);
    if (!gridEl) return;

    // Remove old
    const old = _grids[gridId]._ocean;
    if (old) {
      _scene.remove(old);
      _oceanMeshes = _oceanMeshes.filter(o => o.mesh !== old);
      old.geometry.dispose();
    }

    // Project the four play-area corners to world Y=0
    const full = gridEl.getBoundingClientRect();
    const l = full.left + LABEL_PX, t = full.top + LABEL_PX;
    const r = full.right, b = full.bottom;
    const tl = screenToWorld(l, t), tr = screenToWorld(r, t);
    const br = screenToWorld(r, b), bl = screenToWorld(l, b);
    if (!tl || !tr || !br || !bl) return;

    // World-space bounds + margin
    const xs = [tl.x, tr.x, br.x, bl.x];
    const zs = [tl.z, tr.z, br.z, bl.z];
    const minX = Math.min(...xs) - 1.5, maxX = Math.max(...xs) + 1.5;
    const minZ = Math.min(...zs) - 1.5, maxZ = Math.max(...zs) + 1.5;
    const W = maxX - minX, H = maxZ - minZ;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

    const geo = new THREE.PlaneGeometry(W, H, 28, 28);
    const mat = new THREE.MeshPhongMaterial({
      color:       WATER_COL,
      shininess:   100,
      specular:    new THREE.Color(0x0066cc),
      transparent: true,
      opacity:     0.82,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, -0.02, cz);
    mesh.renderOrder = -1;
    _scene.add(mesh);
    _grids[gridId]._ocean = mesh;

    // Cache base Z for wave animation
    const pos = geo.attributes.position;
    const base = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) base[i] = pos.getZ(i);
    _oceanMeshes.push({ mesh, base, geo });
  }

  function _animateOcean() {
    const t = _oceanTime;
    for (const o of _oceanMeshes) {
      // Keep geometry flat — no vertex displacement.
      // Animate material opacity slightly for a gentle shimmer effect.
      o.mesh.material.opacity = 0.78 + Math.sin(t * 0.6) * 0.04
                                     + Math.sin(t * 1.1) * 0.02;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 3D GRID LINES — projected from actual cell corner screen coords
  // These sit at Y=0.06 (above wave peaks) and match HTML borders exactly
  // ══════════════════════════════════════════════════════════════
  function buildGridLinesForGrid(gridId) {
    const gridEl = document.getElementById(gridId);
    if (!gridEl) return;

    // Remove old lines
    for (const l of (_grids[gridId].lineMeshes || [])) _scene.remove(l);
    _grids[gridId].lineMeshes = [];

    const full = gridEl.getBoundingClientRect();
    const playL = full.left + LABEL_PX;
    const playT = full.top  + LABEL_PX;
    const cellW = (full.width  - LABEL_PX) / GRID_N;
    const cellH = (full.height - LABEL_PX) / GRID_N;
    const LINE_Y = 0.06;

    const mat = new THREE.LineBasicMaterial({ color: 0x1a4060, transparent: true, opacity: 0.7 });

    // Horizontal lines (row separators)
    for (let row = 0; row <= GRID_N; row++) {
      const py = playT + row * cellH;
      const left  = screenToWorld(playL,                py);
      const right = screenToWorld(playL + GRID_N*cellW, py);
      if (!left || !right) continue;
      left.y  = LINE_Y;
      right.y = LINE_Y;
      const geo = new THREE.BufferGeometry().setFromPoints([left, right]);
      const line = new THREE.Line(geo, mat);
      _scene.add(line);
      _grids[gridId].lineMeshes.push(line);
    }

    // Vertical lines (col separators)
    for (let col = 0; col <= GRID_N; col++) {
      const px = playL + col * cellW;
      const top    = screenToWorld(px, playT);
      const bottom = screenToWorld(px, playT + GRID_N*cellH);
      if (!top || !bottom) continue;
      top.y    = LINE_Y;
      bottom.y = LINE_Y;
      const geo = new THREE.BufferGeometry().setFromPoints([top, bottom]);
      const line = new THREE.Line(geo, mat);
      _scene.add(line);
      _grids[gridId].lineMeshes.push(line);
    }
  }

  function _rebuildBothGrids() {
    buildOceanForGrid('enemy-grid');
    buildOceanForGrid('my-grid');
    buildGridLinesForGrid('enemy-grid');
    buildGridLinesForGrid('my-grid');
    // Reposition existing ship meshes
    for (const gridId of ['enemy-grid', 'my-grid']) {
      for (const [key, data] of Object.entries(_grids[gridId].shipMeshes)) {
        _repositionShip(gridId, key, data.cells, data.ori);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SHIP BUILDER — neutral steel/grey palette, no green
  // ══════════════════════════════════════════════════════════════
  function buildShip(key, size, ori, cellW_world, cellH_world) {
    const g   = new THREE.Group();
    const pal = SHIP_PAL[key] || SHIP_PAL.destroyer;
    // Ship length in world units = cells × cell world width
    const L  = size * cellW_world * 0.84;
    const BW = cellH_world * 0.32;
    const D  = 0.14;

    const hm = new THREE.MeshPhongMaterial({ color: pal.hull, shininess: 25 });
    const dm = new THREE.MeshPhongMaterial({ color: pal.deck, shininess: 16 });
    const am = new THREE.MeshPhongMaterial({ color: pal.acc,  shininess: 50 });

    // Hull body
    const hull = new THREE.Mesh(new THREE.BoxGeometry(L, D, BW), hm);
    hull.position.y = D/2; g.add(hull);
    // Bow taper
    const bow = new THREE.Mesh(new THREE.ConeGeometry(BW/2, BW*0.68, 6), hm);
    bow.rotation.z = Math.PI/2; bow.position.set(L/2 + BW*0.3, D/2, 0); g.add(bow);
    // Stern taper
    const stn = new THREE.Mesh(new THREE.ConeGeometry(BW*0.3, BW*0.4, 5), hm);
    stn.rotation.z = -Math.PI/2; stn.position.set(-L/2 - BW*0.17, D/2, 0); g.add(stn);
    // Deck
    const dk = new THREE.Mesh(new THREE.BoxGeometry(L*0.86, 0.032, BW*0.68), dm);
    dk.position.y = D + 0.016; g.add(dk);

    switch (key) {
      case 'carrier': {
        // Flight deck stripe
        const fs = new THREE.Mesh(new THREE.PlaneGeometry(L*0.58, 0.03),
          new THREE.MeshBasicMaterial({ color: 0x556655, transparent: true, opacity: 0.5 }));
        fs.rotation.x = -Math.PI/2; fs.position.set(-L*0.06, D+0.033, 0); g.add(fs);
        // Island superstructure
        const isl = new THREE.Mesh(new THREE.BoxGeometry(L*0.15, 0.22, BW*0.24), am);
        isl.position.set(L*0.20, D+0.13, -BW*0.20); g.add(isl);
        // Mast
        const mp = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.26, 4), am);
        mp.position.set(L*0.20, D+0.36, -BW*0.20); g.add(mp);
        break;
      }
      case 'battleship': {
        for (const [xm, dr] of [[0.24, 1], [-0.24, -1]]) {
          const turr = new THREE.Mesh(new THREE.BoxGeometry(L*0.18, 0.12, BW*0.44), am);
          turr.position.set(L*xm, D+0.08, 0); g.add(turr);
          for (const bz of [-0.06, 0.06]) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, L*0.18, 6),
              new THREE.MeshPhongMaterial({ color: 0x445566 }));
            bar.rotation.z = Math.PI/2; bar.position.set(L*(xm+dr*0.10), D+0.10, bz); g.add(bar);
          }
        }
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*0.12, 0.18, BW*0.42), am);
        br.position.set(0, D+0.15, 0); g.add(br);
        break;
      }
      case 'cruiser': {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(L*0.14, 0.09, BW*0.36), am);
        gun.position.set(L*0.28, D+0.07, 0); g.add(gun);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, L*0.22, 6),
          new THREE.MeshPhongMaterial({ color: 0x445566 }));
        bar.rotation.z = Math.PI/2; bar.position.set(L*0.40, D+0.09, 0); g.add(bar);
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*0.16, 0.15, BW*0.46), am);
        br.position.set(0, D+0.10, 0); g.add(br);
        break;
      }
      case 'submarine': {
        const sail = new THREE.Mesh(new THREE.BoxGeometry(L*0.13, 0.20, BW*0.32), am);
        sail.position.set(0, D+0.11, 0); g.add(sail);
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5),
          new THREE.MeshPhongMaterial({ color: 0x334433 }));
        sc.position.set(0, D+0.32, 0); g.add(sc);
        for (const sx of [-1, 1]) {
          const pl = new THREE.Mesh(new THREE.BoxGeometry(BW*0.58, 0.026, L*0.08), dm);
          pl.position.set(L*0.20, D, sx*BW*0.36); g.add(pl);
        }
        break;
      }
      default: { // destroyer
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*0.10, 0.14, BW*0.48), am);
        br.position.set(L*0.10, D+0.10, 0); g.add(br);
        const gn = new THREE.Mesh(new THREE.BoxGeometry(L*0.10, 0.08, BW*0.32), am);
        gn.position.set(L*0.31, D+0.06, 0); g.add(gn);
      }
    }

    // Wake glow strip at waterline
    const wg = new THREE.Mesh(new THREE.PlaneGeometry(L, BW),
      new THREE.MeshBasicMaterial({ color: 0x004488, transparent: true, opacity: 0.18 }));
    wg.rotation.x = -Math.PI/2; wg.position.y = 0.01; g.add(wg);

    // Orientation: H = along X, V = rotate 90° so along Z
    if (ori === 'V') g.rotation.y = Math.PI / 2;

    return g;
  }

  // Get approximate cell world size for a given grid
  function _cellWorldSize(gridId) {
    const gridEl = document.getElementById(gridId);
    if (!gridEl) return { w: 1, h: 1 };
    const full = gridEl.getBoundingClientRect();
    const cellPxW = (full.width  - LABEL_PX) / GRID_N;
    const cellPxH = (full.height - LABEL_PX) / GRID_N;
    // Project two adjacent corners to measure world distance
    const c0 = screenToWorld(full.left + LABEL_PX,           full.top + LABEL_PX + cellPxH/2);
    const c1 = screenToWorld(full.left + LABEL_PX + cellPxW, full.top + LABEL_PX + cellPxH/2);
    const r0 = screenToWorld(full.left + LABEL_PX + cellPxW/2, full.top + LABEL_PX);
    const r1 = screenToWorld(full.left + LABEL_PX + cellPxW/2, full.top + LABEL_PX + cellPxH);
    const ww = (c0 && c1) ? c0.distanceTo(c1) : 1;
    const wh = (r0 && r1) ? r0.distanceTo(r1) : 1;
    return { w: ww, h: wh };
  }

  function _repositionShip(gridId, key, cells, ori) {
    const data = _grids[gridId].shipMeshes[key];
    if (!data) return;
    const mid = _shipCentreWorld(gridId, cells);
    if (!mid) return;
    data.grp.position.set(mid.x, 0, mid.z);
    // Recompute orientation relative to camera
    data.grp.rotation.y = _shipYRotation(gridId, cells, ori);
  }

  function _shipCentreWorld(gridId, cells) {
    if (!cells?.length) return null;
    const pts = cells.map(({r,c}) => cellToWorld(gridId, r, c)).filter(Boolean);
    if (!pts.length) return null;
    const sum = pts.reduce((a,b) => a.add(b), new THREE.Vector3());
    return sum.divideScalar(pts.length);
  }

  // For a tilted camera the ship must rotate to lie flat on the projected ground plane.
  // Ships always lie on Y=0 so we just need Y-axis rotation.
  function _shipYRotation(gridId, cells, ori) {
    if (ori === 'V') {
      // Ship runs along the Z direction in world space
      // But with perspective, the Z world axis may not be vertical on screen.
      // We use the vector from first to last cell centre in world space.
      if (cells.length >= 2) {
        const p0 = cellToWorld(gridId, cells[0].r, cells[0].c);
        const p1 = cellToWorld(gridId, cells[cells.length-1].r, cells[cells.length-1].c);
        if (p0 && p1) {
          const dx = p1.x - p0.x, dz = p1.z - p0.z;
          // Ship's local axis is X; rotate so it points along (dx, dz)
          return Math.atan2(dx, dz);
        }
      }
      return Math.PI / 2;
    } else {
      // Horizontal: ship runs along X direction in world space
      if (cells.length >= 2) {
        const p0 = cellToWorld(gridId, cells[0].r, cells[0].c);
        const p1 = cellToWorld(gridId, cells[cells.length-1].r, cells[cells.length-1].c);
        if (p0 && p1) {
          const dx = p1.x - p0.x, dz = p1.z - p0.z;
          return Math.atan2(dz, dx);
        }
      }
      return 0;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PLACE / REMOVE SHIPS
  // ══════════════════════════════════════════════════════════════
  function placeShip(gridId, key, cells, ori, revealEnemy) {
    if (!THREE || !cells?.length) return;
    if (gridId === 'enemy-grid' && !revealEnemy) return;
    removeShip(gridId, key);

    const centre = _shipCentreWorld(gridId, cells);
    if (!centre) return;

    const { w: cw, h: ch } = _cellWorldSize(gridId);
    const grp = buildShip(key, cells.length, ori, cw, ch);
    grp.position.set(centre.x, 0, centre.z);
    grp.rotation.y = _shipYRotation(gridId, cells, ori);

    _scene.add(grp);
    _grids[gridId].shipMeshes[key] = { grp, cells, ori };
  }

  function removeShip(gridId, key) {
    const d = _grids[gridId].shipMeshes[key];
    if (!d) return;
    _scene.remove(d.grp);
    delete _grids[gridId].shipMeshes[key];
  }

  // ══════════════════════════════════════════════════════════════
  // PARTICLES
  // ══════════════════════════════════════════════════════════════
  class PS {
    constructor(opts) {
      this.type  = opts.type; this.life = opts.life||65; this.age = 0; this.done = false;
      this.n     = opts.count||45;
      const geo  = new THREE.BufferGeometry();
      const pos  = new Float32Array(this.n*3);
      const col  = new Float32Array(this.n*3);
      this._v    = []; this._a = new Float32Array(this.n); this._ma = new Float32Array(this.n);
      const o    = opts.origin || new THREE.Vector3();
      for (let i=0; i<this.n; i++) {
        pos[i*3]=o.x+(Math.random()-.5)*.07; pos[i*3+1]=o.y; pos[i*3+2]=o.z+(Math.random()-.5)*.07;
        const sp=(opts.speed||.03)*(0.5+Math.random());
        const ang=Math.random()*Math.PI*2;
        const el=opts.type==='splash'?.85+Math.random()*.5:.1+Math.random()*.38;
        this._v.push(new THREE.Vector3(Math.cos(ang)*Math.cos(el)*sp, Math.sin(el)*sp*(opts.type==='fire'?1.9:1), Math.sin(ang)*Math.cos(el)*sp));
        this._a[i]=-(Math.random()*(opts.stagger||0)); this._ma[i]=20+Math.random()*30;
        const c=this._col(i/this.n); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
      geo.setAttribute('color',    new THREE.BufferAttribute(col,3));
      this.pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size:opts.size||.09, vertexColors:true, transparent:true, opacity:.88,
        depthWrite:false, blending:opts.type==='smoke'?THREE.NormalBlending:THREE.AdditiveBlending
      }));
      this._g = opts.type==='splash'?-.0036:0;
      _scene.add(this.pts);
    }
    _col(t) {
      if(this.type==='fire'){return t<.3?new THREE.Color(1,.97,.6):t<.6?new THREE.Color(1,.4,.03):new THREE.Color(.8,.07,0);}
      if(this.type==='smoke'){const g=.28+t*.42;return new THREE.Color(g,g,g+.04);}
      if(this.type==='splash'){return new THREE.Color(.08,.5+Math.random()*.32,1);}
      if(this.type==='explosion'){return t<.2?new THREE.Color(1,1,.94):t<.5?new THREE.Color(1,.46,.04):new THREE.Color(.58,.07,0);}
      return new THREE.Color(1,1,1);
    }
    tick() {
      if(this.done) return;
      const pa=this.pts.geometry.attributes.position; let dead=true;
      for(let i=0;i<this.n;i++){
        this._a[i]++;
        if(this._a[i]<0||this._a[i]>this._ma[i]) continue;
        dead=false; const v=this._v[i]; v.y+=this._g;
        const ix=i*3; pa.array[ix]+=v.x; pa.array[ix+1]+=v.y; pa.array[ix+2]+=v.z;
      }
      pa.needsUpdate=true; this.age++;
      this.pts.material.opacity=Math.max(0,.88*(1-this.age/this.life));
      if(dead||this.age>this.life){_scene.remove(this.pts);this.pts.geometry.dispose();this.pts.material.dispose();this.done=true;}
    }
  }

  function _ps(origin, type, opts) { _particles.push(new PS({ type, origin, ...opts })); }
  function _tickParticles() { for(let i=_particles.length-1;i>=0;i--){_particles[i].tick();if(_particles[i].done)_particles.splice(i,1);} }

  // ══════════════════════════════════════════════════════════════
  // MISSILES
  // ══════════════════════════════════════════════════════════════
  function cbez(p0,p1,p2,p3,t){const m=1-t;return new THREE.Vector3(m*m*m*p0.x+3*m*m*t*p1.x+3*m*t*t*p2.x+t*t*t*p3.x,m*m*m*p0.y+3*m*m*t*p1.y+3*m*t*t*p2.y+t*t*t*p3.y,m*m*m*p0.z+3*m*m*t*p1.z+3*m*t*t*p2.z+t*t*t*p3.z);}

  function _buildMissile(isEnemy) {
    const g=new THREE.Group();
    const bc=isEnemy?0xcc2010:0x00b8d4, fc=isEnemy?0x881008:0x006888;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.44,8),new THREE.MeshPhongMaterial({color:bc,shininess:80})));
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.045,.14,8),new THREE.MeshPhongMaterial({color:0xcccccc,shininess:120}));
    nose.position.y=.29; g.add(nose);
    const fv=new Float32Array([0,-.22,0,0,-.044,0,.1,-.22,0]);
    const fg=new THREE.BufferGeometry(); fg.setAttribute('position',new THREE.BufferAttribute(fv,3));
    const fm=new THREE.MeshPhongMaterial({color:fc,side:THREE.DoubleSide});
    for(let a=0;a<4;a++){const f=new THREE.Mesh(fg,fm);f.rotation.y=(a/4)*Math.PI*2;g.add(f);}
    const gl=new THREE.PointLight(isEnemy?0xff3300:0x00eeff,.8,1.6); gl.position.y=-.24; g.add(gl);
    _scene.add(g); return g;
  }

  function _tickMissiles() {
    for(let i=_missiles.length-1;i>=0;i--){
      const m=_missiles[i]; m.t+=m.dt;
      if(m.t>=1){_scene.remove(m.mesh);_missiles.splice(i,1);m.onLand();continue;}
      const p=cbez(m.p0,m.p1,m.p2,m.p3,m.t), pn=cbez(m.p0,m.p1,m.p2,m.p3,Math.min(1,m.t+.012));
      m.mesh.position.copy(p);
      const dir=pn.clone().sub(p); if(dir.lengthSq()>1e-6) m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
      if(Math.random()<.4) _ps(p.clone(),'smoke',{count:2,speed:.006,size:.044,life:14});
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC VISUAL ACTIONS
  // ══════════════════════════════════════════════════════════════
  function animateHit(cellEl, isSunk) {
    if(!THREE||!cellEl) return;
    const wp = cellElToWorld(cellEl); if(!wp) return;
    wp.y = 0.08;
    _ps(wp.clone(),'explosion',{count:isSunk?72:36,speed:.065,size:.11,life:46});
    _ps(wp.clone(),'fire',{count:isSunk?48:22,speed:.025,size:.08,life:isSunk?40:100});
    _ps(wp.clone().setY(.3),'smoke',{count:isSunk?60:28,speed:.015,size:.12,life:isSunk?72:130});
    const fl=new THREE.PointLight(0xff6600,8,4); fl.position.copy(wp).setY(1); _scene.add(fl);
    let fa=0;const ff=()=>{fa++;fl.intensity=Math.max(0,8*(1-fa/16));if(fa<16)requestAnimationFrame(ff);else _scene.remove(fl);};
    requestAnimationFrame(ff);
    if(isSunk){
      const r=parseInt(cellEl.dataset.r),c=parseInt(cellEl.dataset.c);
      const gid=cellEl.closest('#enemy-grid')?'enemy-grid':'my-grid';
      const key=_atCell(gid,r,c);
      if(key) setTimeout(()=>animateSink(gid,key,_grids[gid].shipMeshes[key]?.cells||[{r,c}]),260);
    }
  }

  function animateMiss(cellEl) {
    if(!THREE||!cellEl) return;
    const wp=cellElToWorld(cellEl); if(!wp) return;
    wp.y=0.04;
    _ps(wp.clone(),'splash',{count:26,speed:.052,size:.07,life:34});
    const rg=new THREE.RingGeometry(.04,.085,32);
    const rm=new THREE.MeshBasicMaterial({color:0x0099ff,side:THREE.DoubleSide,transparent:true,opacity:.6});
    const rng=new THREE.Mesh(rg,rm); rng.rotation.x=-Math.PI/2; rng.position.copy(wp).setY(.04);
    _scene.add(rng);
    let ra=0;const gr=()=>{ra++;const sv=1+ra*.08;rng.scale.set(sv,sv,1);rm.opacity=Math.max(0,.6*(1-ra/28));if(ra<28)requestAnimationFrame(gr);else{_scene.remove(rng);rg.dispose();rm.dispose();}};
    requestAnimationFrame(gr);
    const sl=new THREE.PointLight(0x0088ff,3,3); sl.position.copy(wp).setY(.8); _scene.add(sl);
    let sa=0;const fs=()=>{sa++;sl.intensity=Math.max(0,3*(1-sa/11));if(sa<11)requestAnimationFrame(fs);else _scene.remove(sl);};
    requestAnimationFrame(fs);
  }

  function animateSink(gridId, key, cellArr) {
    if(!THREE) return;
    // Reveal enemy ship if not yet placed
    if(gridId==='enemy-grid' && !_grids[gridId].shipMeshes[key]) {
      const st=window.bsState||window.state;
      const cells=cellArr||(st?.npcShips?.[key])||(st?.enemyPlacedShips?.[key]);
      if(cells?.length) {
        const ori=(cells[1]&&cells[0].r===cells[1].r)?'H':'V';
        const centre=_shipCentreWorld(gridId,cells); if(!centre) return;
        const {w:cw,h:ch}=_cellWorldSize(gridId);
        const grp=buildShip(key,cells.length,ori,cw,ch);
        grp.position.set(centre.x,0,centre.z);
        grp.rotation.y=_shipYRotation(gridId,cells,ori);
        _scene.add(grp);
        _grids[gridId].shipMeshes[key]={grp,cells,ori};
      }
    }
    const d=_grids[gridId].shipMeshes[key]; if(!d) return;
    const {grp}=d; const sy=grp.position.y;
    let age=0;const tot=145;
    const lp=()=>{
      age++;const t=age/tot,e=t*t;
      grp.rotation.z=e*(Math.PI/2.1); grp.position.y=sy-e*2.1;
      grp.traverse(o=>{if(!o.isMesh||!o.material)return;if(!o.material.transparent){o.material=o.material.clone();o.material.transparent=true;}o.material.opacity=Math.max(0,1-e*1.5);});
      if(age%7===0){const p=grp.position.clone().setY(.12);_ps(p,'smoke',{count:5,speed:.014,size:.10,life:25});if(age<tot*.55)_ps(p.clone().setY(.04),'splash',{count:3,speed:.02,size:.048,life:16});}
      if(age<tot) requestAnimationFrame(lp);
      else{_scene.remove(grp);delete _grids[gridId].shipMeshes[key];}
    };
    requestAnimationFrame(lp);
  }

  function launch3DMissile(gridId, r, c, isEnemy, onLand) {
    if(!THREE){setTimeout(onLand,400);return;}
    const tgt=cellToWorld(gridId,r,c); if(!tgt){setTimeout(onLand,300);return;}
    tgt.y=0.08;
    const mesh=_buildMissile(isEnemy);
    const p0=isEnemy ? new THREE.Vector3(tgt.x+(Math.random()-.5)*14,12,tgt.z+(Math.random()-.5)*10)
                     : new THREE.Vector3(tgt.x+(Math.random()-.5)*6,10,tgt.z+8);
    const p3=tgt.clone();
    const mid=p0.clone().lerp(p3,.5);const pk=mid.clone();pk.y=Math.max(p0.y,p3.y)+5;
    const p1=p0.clone().lerp(pk,.55),p2=p3.clone().lerp(pk,.45);
    const dur=Math.max(52,Math.min(105,p0.distanceTo(p3)*7));
    _missiles.push({mesh,p0,p1,p2,p3,t:0,dt:1/dur,isEnemy,onLand});
  }

  function _atCell(gridId,r,c){
    for(const[k,d] of Object.entries(_grids[gridId].shipMeshes))
      if(d.cells?.some(x=>x.r===r&&x.c===c)) return k;
    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // REDRAW SHIPS (my ships always; enemy only if sunk)
  // ══════════════════════════════════════════════════════════════
  function redrawAllShipOverlays() {
    const st=window.bsState||window.state; if(!st) return;
    // My ships
    for(const[key,cells] of Object.entries(st.placedShips||{})){
      if(!cells?.length) continue;
      if(st.sunkMyShips?.has(key)) continue;
      const ori=(cells[1]&&cells[0].r===cells[1].r)?'H':'V';
      placeShip('my-grid',key,cells,ori,true);
    }
    // Enemy: only sunk ships shown
    const npc=st.npcShips||{};
    for(const key of (st.sunkEnemyShips||new Set())){
      const cells=npc[key]||st.enemyPlacedShips?.[key];
      if(!cells?.length) continue;
      const ori=(cells[1]&&cells[0].r===cells[1].r)?'H':'V';
      placeShip('enemy-grid',key,cells,ori,true);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // INIT — called when game-screen becomes active
  // ══════════════════════════════════════════════════════════════
  function initScenes() {
    if(!THREE){onReady(initScenes);return;}
    // Clear old ship meshes
    for(const gid of ['enemy-grid','my-grid']){
      for(const[k,d] of Object.entries(_grids[gid].shipMeshes)) _scene?.remove(d.grp);
      _grids[gid].shipMeshes={};
    }
    if(!_renderer) initRenderer();

    // Wait for grid cells to be in the DOM (buildGameGrids may not have run yet)
    function tryBuild() {
      const eg=document.getElementById('enemy-grid');
      const mg=document.getElementById('my-grid');
      // Need at least one data cell to project
      const hasCell = eg?.querySelector('[data-r="0"][data-c="0"]');
      if(!hasCell){setTimeout(tryBuild,150);return;}
      _rebuildBothGrids();
      setTimeout(redrawAllShipOverlays,500);
    }
    tryBuild();
  }

  // ══════════════════════════════════════════════════════════════
  // WATCH + INSTALL
  // ══════════════════════════════════════════════════════════════
  function _watch(){
    const gs=document.getElementById('game-screen');
    if(!gs){setTimeout(_watch,300);return;}
    new MutationObserver(()=>{
      if(gs.classList.contains('active')) setTimeout(initScenes,60);
    }).observe(gs,{attributes:true,attributeFilter:['class']});
  }

  function install(){
    onReady(()=>{
      window.BSVisuals={animateHit,animateMiss,animateSink,placeShip,removeShip,launch3DMissile,redrawAllShipOverlays};
      window.bsVisuals={
        animateHit, animateMiss,
        launchMissile:(cell,cb)=>{const r=parseInt(cell.dataset.r),c=parseInt(cell.dataset.c);if(!isNaN(r)&&!isNaN(c))launch3DMissile('enemy-grid',r,c,false,cb);else cb();},
        launchEnemyMissile:(cell,cb)=>{if(!cell){cb();return;}const r=parseInt(cell.dataset.r),c=parseInt(cell.dataset.c);if(!isNaN(r)&&!isNaN(c))launch3DMissile('my-grid',r,c,true,cb);else cb();},
      };
      _watch();
    });
  }

  install();
  return{animateHit,animateMiss,animateSink,placeShip,removeShip,launch3DMissile,initScenes,redrawAllShipOverlays};

})();
