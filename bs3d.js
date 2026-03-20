// ╔══════════════════════════════════════════════════════════════════════╗
// ║  bs3d.js — Three.js 3D Visual Layer for Battleships  v2            ║
// ║                                                                      ║
// ║  Key fixes vs v1:                                                    ║
// ║  • Canvas covers ONLY the 10×10 play cell area (skips 22px labels) ║
// ║  • Camera is perfectly top-down orthographic, no Z tilt             ║
// ║  • 3D grid lines removed — HTML grid lines show through (alpha)     ║
// ║  • Ocean plane sized & positioned to exactly fill play cells        ║
// ║  • _reposition() called only on resize, not every frame             ║
// ╚══════════════════════════════════════════════════════════════════════╝

export default (() => {

  // ── Load Three.js from CDN (r128) ─────────────────────────────────────
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  let THREE = null;
  let _ready = false;
  const _readyCallbacks = [];

  function onReady(fn) { if (_ready) fn(); else _readyCallbacks.push(fn); }

  function _loadThree() {
    if (window.THREE) { THREE = window.THREE; _ready = true; _readyCallbacks.forEach(f => f()); return; }
    const s = document.createElement('script');
    s.src = THREE_URL;
    s.onload = () => { THREE = window.THREE; _ready = true; _readyCallbacks.forEach(f => f()); };
    document.head.appendChild(s);
  }
  _loadThree();

  // ══════════════════════════════════════════════════════════════════════
  // CONSTANTS — world space: 10x10 grid, each cell = 1 unit
  // ══════════════════════════════════════════════════════════════════════
  const GRID_N    = 10;
  const CELL_W    = 1.0;
  const TOTAL_W   = GRID_N * CELL_W;   // 10 units
  const HALF      = TOTAL_W / 2;       // 5 units
  const WATER_COL = 0x0a3a5c;
  const LABEL_PX  = 22;               // pixel width of the label row/col in HTML

  const SHIP_COLORS = {
    carrier:    { hull: 0x1a3a1a, deck: 0x243824, accent: 0x3a7a3a },
    battleship: { hull: 0x1a2530, deck: 0x1a2e42, accent: 0x2a4560 },
    cruiser:    { hull: 0x1e2a1e, deck: 0x182a18, accent: 0x2e4e2e },
    submarine:  { hull: 0x1a2a1a, deck: 0x162816, accent: 0x2a4a2a },
    destroyer:  { hull: 0x1a1e2a, deck: 0x141822, accent: 0x242c42 },
  };

  // ══════════════════════════════════════════════════════════════════════
  // HELPER: get the pixel rect of just the 10x10 play area
  // grid-container is 11x11 (22px label col/row + 10 data cols/rows)
  // ══════════════════════════════════════════════════════════════════════
  function getPlayRect(gridEl) {
    const full = gridEl.getBoundingClientRect();
    return {
      left:   full.left   + LABEL_PX,
      top:    full.top    + LABEL_PX,
      width:  full.width  - LABEL_PX,
      height: full.height - LABEL_PX,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // GRID SCENE
  // ══════════════════════════════════════════════════════════════════════
  class GridScene {
    constructor(gridId) {
      this.gridId        = gridId;
      this.gridEl        = null;
      this.canvas        = null;
      this.renderer      = null;
      this.scene         = null;
      this.camera        = null;
      this.rafId         = null;
      this.oceanMesh     = null;
      this.oceanTime     = 0;
      this.shipMeshes    = {};
      this.particles     = [];
      this.missiles      = [];
      this._destroyed    = false;
      this._resizeQueued = false;
    }

    mount() {
      this.gridEl = document.getElementById(this.gridId);
      if (!this.gridEl) return;
      this._buildRenderer();
      this._buildScene();
      this._startLoop();
      window.addEventListener('resize', () => this._scheduleReposition());
      new ResizeObserver(() => this._scheduleReposition()).observe(this.gridEl);
    }

    // ── Renderer: canvas over the 10x10 play area only ────────────────
    _buildRenderer() {
      const pr = getPlayRect(this.gridEl);
      this.canvas = document.createElement('canvas');
      this._applyCanvasStyle(pr);
      document.body.appendChild(this.canvas);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(pr.width, pr.height);
      this.renderer.setClearColor(0x000000, 0);
    }

    _applyCanvasStyle(pr) {
      this.canvas.style.cssText = `
        position: fixed;
        left:     ${pr.left}px;
        top:      ${pr.top}px;
        width:    ${pr.width}px;
        height:   ${pr.height}px;
        pointer-events: none;
        z-index:  4;
      `;
    }

    _scheduleReposition() {
      if (this._resizeQueued) return;
      this._resizeQueued = true;
      requestAnimationFrame(() => {
        this._resizeQueued = false;
        this._reposition();
      });
    }

    _reposition() {
      if (!this.gridEl || !this.canvas || this._destroyed) return;
      const pr = getPlayRect(this.gridEl);
      this._applyCanvasStyle(pr);
      this.renderer.setSize(pr.width, pr.height);
      this._updateCamera(pr);
    }

    // ── Scene ──────────────────────────────────────────────────────────
    _buildScene() {
      this.scene = new THREE.Scene();
      const pr = getPlayRect(this.gridEl);
      this._buildCamera(pr);
      this._buildLights();
      this._buildOcean();
      // No 3D grid lines — HTML grid lines show through the transparent canvas
    }

    // ── Camera: perfectly top-down orthographic ────────────────────────
    // Maps exactly TOTAL_W world units to the play-area canvas.
    // camera.up = Z- so that row 0 = top, row 9 = bottom (matches HTML).
    _buildCamera(pr) {
      const aspect = pr.width / pr.height;
      const halfW  = HALF;
      const halfH  = HALF / aspect;
      this.camera  = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 100);
      this.camera.position.set(0, 20, 0);
      this.camera.up.set(0, 0, -1);   // Z- points "up" on screen = row 0 at top
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
    }

    _updateCamera(pr) {
      const aspect = pr.width / pr.height;
      const halfW  = HALF;
      const halfH  = HALF / aspect;
      this.camera.left   = -halfW;
      this.camera.right  =  halfW;
      this.camera.top    =  halfH;
      this.camera.bottom = -halfH;
      this.camera.updateProjectionMatrix();
    }

    // ── Lights ─────────────────────────────────────────────────────────
    _buildLights() {
      this.scene.add(new THREE.AmbientLight(0x4466aa, 1.3));
      const dir = new THREE.DirectionalLight(0x88aadd, 0.85);
      dir.position.set(3, 12, 5);
      this.scene.add(dir);
      const fill = new THREE.PointLight(0x00f5ff, 0.4, 40);
      fill.position.set(0, 15, 0);
      this.scene.add(fill);
    }

    // ── Ocean: fills exactly TOTAL_W x TOTAL_W ────────────────────────
    _buildOcean() {
      const geo = new THREE.PlaneGeometry(TOTAL_W, TOTAL_W, 40, 40);
      const mat = new THREE.MeshPhongMaterial({
        color:       WATER_COL,
        shininess:   65,
        specular:    new THREE.Color(0x00c8ff),
        transparent: true,
        opacity:     0.80,
        depthWrite:  false,
      });
      this.oceanMesh = new THREE.Mesh(geo, mat);
      this.oceanMesh.rotation.x = -Math.PI / 2;
      this.oceanMesh.position.y = -0.02;
      this.scene.add(this.oceanMesh);

      const pos = geo.attributes.position;
      this._waveBase = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) this._waveBase[i] = pos.getZ(i);
    }

    // ── Cell to world coordinate ───────────────────────────────────────
    // Row 0 = top of grid (Z = -HALF + 0.5), Row 9 = bottom (Z = HALF - 0.5)
    // Col 0 = left (X = -HALF + 0.5), Col 9 = right (X = HALF - 0.5)
    cellToWorld(r, c) {
      const x = -HALF + c * CELL_W + CELL_W / 2;
      const z = -HALF + r * CELL_W + CELL_W / 2;
      return new THREE.Vector3(x, 0, z);
    }

    // ── Render loop ────────────────────────────────────────────────────
    _startLoop() {
      const loop = () => {
        if (this._destroyed) return;
        this.rafId = requestAnimationFrame(loop);
        if (document.hidden) return;
        this.oceanTime += 0.016;
        this._animateOcean();
        this._tickParticles();
        this._tickMissiles();
        this.renderer.render(this.scene, this.camera);
      };
      this.rafId = requestAnimationFrame(loop);
    }

    _animateOcean() {
      const pos = this.oceanMesh.geometry.attributes.position;
      const t   = this.oceanTime;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const w = Math.sin(x * 1.1 + t * 0.8)  * 0.036
                + Math.sin(y * 0.85 + t * 1.05) * 0.024
                + Math.sin((x - y) * 0.5 + t * 0.65) * 0.016;
        pos.setZ(i, this._waveBase[i] + w);
      }
      pos.needsUpdate = true;
      this.oceanMesh.geometry.computeVertexNormals();
    }

    _tickParticles() {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        this.particles[i].tick();
        if (this.particles[i].done) this.particles.splice(i, 1);
      }
    }

    _tickMissiles() {
      for (let i = this.missiles.length - 1; i >= 0; i--) {
        const m = this.missiles[i];
        m.t += m.dt;
        if (m.t >= 1) {
          this.scene.remove(m.mesh);
          this.missiles.splice(i, 1);
          m.onLand();
          continue;
        }
        const pos  = _cubicBez(m.p0, m.p1, m.p2, m.p3, m.t);
        const posN = _cubicBez(m.p0, m.p1, m.p2, m.p3, Math.min(1, m.t + 0.012));
        m.mesh.position.copy(pos);
        const dir = posN.clone().sub(pos);
        if (dir.lengthSq() > 1e-6) {
          m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        }
        if (Math.random() < 0.4) {
          this._spawnPS(pos.clone(), 'smoke', { count: 3, speed: 0.007, size: 0.055, life: 16 });
        }
      }
    }

    _spawnPS(origin, type, opts) {
      this.particles.push(new ParticleSystem(this.scene, { type, origin, ...opts }));
    }

    destroy() {
      this._destroyed = true;
      cancelAnimationFrame(this.rafId);
      if (this.canvas)   this.canvas.remove();
      if (this.renderer) this.renderer.dispose();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PARTICLE SYSTEM
  // ══════════════════════════════════════════════════════════════════════
  class ParticleSystem {
    constructor(scene, opts) {
      this.scene  = scene;
      this.type   = opts.type;
      this.life   = opts.life  || 70;
      this.age    = 0;
      this.done   = false;
      this.count  = opts.count || 50;

      const geo  = new THREE.BufferGeometry();
      const pos  = new Float32Array(this.count * 3);
      const col  = new Float32Array(this.count * 3);
      this._vel  = [];
      this._ages = new Float32Array(this.count);
      this._maxA = new Float32Array(this.count);

      const o = opts.origin || new THREE.Vector3();

      for (let i = 0; i < this.count; i++) {
        pos[i*3]   = o.x + (Math.random() - 0.5) * 0.08;
        pos[i*3+1] = o.y;
        pos[i*3+2] = o.z + (Math.random() - 0.5) * 0.08;

        const spd   = (opts.speed || 0.035) * (0.5 + Math.random());
        const angle = Math.random() * Math.PI * 2;
        const elev  = opts.type === 'splash'
          ? 0.9 + Math.random() * 0.6
          : 0.1 + Math.random() * 0.4;

        this._vel.push(new THREE.Vector3(
          Math.cos(angle) * Math.cos(elev) * spd,
          Math.sin(elev) * spd * (opts.type === 'fire' ? 2.2 : 1.0),
          Math.sin(angle) * Math.cos(elev) * spd,
        ));

        this._ages[i] = -(Math.random() * (opts.stagger || 0));
        this._maxA[i] = 25 + Math.random() * 35;

        const c = this._color(i / this.count);
        col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

      this.points = new THREE.Points(geo, new THREE.PointsMaterial({
        size:         opts.size || 0.10,
        vertexColors: true,
        transparent:  true,
        opacity:      0.9,
        depthWrite:   false,
        blending:     opts.type === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
      }));

      this._gravity = opts.type === 'splash' ? -0.004 : 0.0;
      scene.add(this.points);
    }

    _color(t) {
      switch (this.type) {
        case 'fire':
          if (t < 0.3) return new THREE.Color(1.0, 0.98, 0.65);
          if (t < 0.6) return new THREE.Color(1.0, 0.42, 0.04);
          return new THREE.Color(0.8, 0.08, 0.0);
        case 'smoke': {
          const g = 0.3 + t * 0.45;
          return new THREE.Color(g, g, g + 0.05);
        }
        case 'splash':
          return new THREE.Color(0.1, 0.55 + Math.random() * 0.35, 1.0);
        case 'explosion':
          if (t < 0.2) return new THREE.Color(1.0, 1.0, 0.95);
          if (t < 0.5) return new THREE.Color(1.0, 0.48, 0.05);
          return new THREE.Color(0.6, 0.08, 0.0);
        default:
          return new THREE.Color(1, 1, 1);
      }
    }

    tick() {
      if (this.done) return;
      const posAttr = this.points.geometry.attributes.position;
      let allDead = true;
      for (let i = 0; i < this.count; i++) {
        this._ages[i]++;
        if (this._ages[i] < 0 || this._ages[i] > this._maxA[i]) continue;
        allDead = false;
        const v = this._vel[i];
        v.y += this._gravity;
        const ix = i * 3;
        posAttr.array[ix]   += v.x;
        posAttr.array[ix+1] += v.y;
        posAttr.array[ix+2] += v.z;
      }
      posAttr.needsUpdate = true;
      this.age++;
      this.points.material.opacity = Math.max(0, 0.9 * (1 - this.age / this.life));
      if (allDead || this.age > this.life) {
        this.scene.remove(this.points);
        this.points.geometry.dispose();
        this.points.material.dispose();
        this.done = true;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BEZIER HELPER
  // ══════════════════════════════════════════════════════════════════════
  function _cubicBez(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return new THREE.Vector3(
      mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
      mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
      mt*mt*mt*p0.z + 3*mt*mt*t*p1.z + 3*mt*t*t*p2.z + t*t*t*p3.z,
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // SHIP GEOMETRY BUILDER
  // ══════════════════════════════════════════════════════════════════════
  function buildShipGroup(shipKey, size, orientation) {
    const group  = new THREE.Group();
    const colors = SHIP_COLORS[shipKey] || SHIP_COLORS.destroyer;
    const L      = size * CELL_W * 0.88;
    const BW     = CELL_W * 0.36;
    const D      = 0.16;

    const hullMat = new THREE.MeshPhongMaterial({ color: colors.hull, shininess: 25 });
    const deckMat = new THREE.MeshPhongMaterial({ color: colors.deck, shininess: 18 });
    const accMat  = new THREE.MeshPhongMaterial({ color: colors.accent, shininess: 55 });

    // Hull body
    const hull = new THREE.Mesh(new THREE.BoxGeometry(L, D, BW), hullMat);
    hull.position.y = D / 2;
    hull.castShadow = true;
    group.add(hull);

    // Bow taper
    const bow = new THREE.Mesh(new THREE.ConeGeometry(BW / 2, BW * 0.75, 6), hullMat);
    bow.rotation.z = Math.PI / 2;
    bow.position.set(L / 2 + BW * 0.33, D / 2, 0);
    group.add(bow);

    // Stern taper
    const stern = new THREE.Mesh(new THREE.ConeGeometry(BW * 0.35, BW * 0.45, 5), hullMat);
    stern.rotation.z = -Math.PI / 2;
    stern.position.set(-L / 2 - BW * 0.2, D / 2, 0);
    group.add(stern);

    // Deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.04, BW * 0.72), deckMat);
    deck.position.y = D + 0.02;
    group.add(deck);

    // Per-ship superstructure
    switch (shipKey) {
      case 'carrier': {
        const stripe = new THREE.Mesh(
          new THREE.PlaneGeometry(L * 0.62, 0.04),
          new THREE.MeshBasicMaterial({ color: 0x4aaa4a, transparent: true, opacity: 0.55 })
        );
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(-L * 0.08, D + 0.04, 0);
        group.add(stripe);
        const island = new THREE.Mesh(new THREE.BoxGeometry(L * 0.17, 0.24, BW * 0.28), accMat);
        island.position.set(L * 0.22, D + 0.14, -BW * 0.22);
        island.castShadow = true;
        group.add(island);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 4), accMat);
        mast.position.set(L * 0.22, D + 0.37, -BW * 0.22);
        group.add(mast);
        break;
      }
      case 'battleship': {
        for (const [xMul, dir] of [[0.26, 1], [-0.26, -1]]) {
          const turr = new THREE.Mesh(new THREE.BoxGeometry(L * 0.2, 0.13, BW * 0.48), accMat);
          turr.position.set(L * xMul, D + 0.09, 0);
          turr.castShadow = true;
          group.add(turr);
          for (const bz of [-0.07, 0.07]) {
            const barrel = new THREE.Mesh(
              new THREE.CylinderGeometry(0.02, 0.02, L * 0.2, 6),
              new THREE.MeshPhongMaterial({ color: 0x3a5a7a })
            );
            barrel.rotation.z = Math.PI / 2;
            barrel.position.set(L * (xMul + dir * 0.12), D + 0.11, bz);
            group.add(barrel);
          }
        }
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(L * 0.14, 0.2, BW * 0.44), accMat);
        bridge.position.set(0, D + 0.17, 0);
        bridge.castShadow = true;
        group.add(bridge);
        break;
      }
      case 'cruiser': {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(L * 0.16, 0.1, BW * 0.4), accMat);
        gun.position.set(L * 0.3, D + 0.08, 0);
        group.add(gun);
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, L * 0.26, 6),
          new THREE.MeshPhongMaterial({ color: 0x3a6a3a })
        );
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(L * 0.44, D + 0.1, 0);
        group.add(barrel);
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(L * 0.18, 0.17, BW * 0.5), accMat);
        bridge.position.set(0, D + 0.12, 0);
        group.add(bridge);
        break;
      }
      case 'submarine': {
        const sail = new THREE.Mesh(new THREE.BoxGeometry(L * 0.15, 0.22, BW * 0.36), accMat);
        sail.position.set(0, D + 0.13, 0);
        sail.castShadow = true;
        group.add(sail);
        const scope = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.016, 0.28, 5),
          new THREE.MeshPhongMaterial({ color: 0x2a5a2a })
        );
        scope.position.set(0, D + 0.37, 0);
        group.add(scope);
        for (const sx of [-1, 1]) {
          const plane = new THREE.Mesh(new THREE.BoxGeometry(BW * 0.65, 0.03, L * 0.09), deckMat);
          plane.position.set(L * 0.22, D, sx * BW * 0.4);
          group.add(plane);
        }
        break;
      }
      default: { // destroyer
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(L * 0.12, 0.16, BW * 0.52), accMat);
        bridge.position.set(L * 0.12, D + 0.12, 0);
        bridge.castShadow = true;
        group.add(bridge);
        const gun = new THREE.Mesh(new THREE.BoxGeometry(L * 0.12, 0.09, BW * 0.36), accMat);
        gun.position.set(L * 0.34, D + 0.07, 0);
        group.add(gun);
      }
    }

    // Waterline glow strip
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(L, BW),
      new THREE.MeshBasicMaterial({ color: 0x00c864, transparent: true, opacity: 0.28 })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    group.add(glow);

    // Orientation: H = along X axis (default), V = rotate 90deg along Z axis
    if (orientation === 'V') group.rotation.y = Math.PI / 2;

    return group;
  }

  // ══════════════════════════════════════════════════════════════════════
  // MISSILE MESH
  // ══════════════════════════════════════════════════════════════════════
  function buildMissileMesh(scene, isEnemy) {
    const group   = new THREE.Group();
    const bodyCol = isEnemy ? 0xcc2010 : 0x00b8d4;
    const finCol  = isEnemy ? 0x881008 : 0x006888;

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8),
      new THREE.MeshPhongMaterial({ color: bodyCol, shininess: 80 })
    );
    group.add(body);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.16, 8),
      new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 120 })
    );
    nose.position.y = 0.33;
    group.add(nose);

    // 4 fins
    const fv = new Float32Array([0,-0.25,0,  0,-0.05,0,  0.11,-0.25,0]);
    const finGeo = new THREE.BufferGeometry();
    finGeo.setAttribute('position', new THREE.BufferAttribute(fv, 3));
    const finMat = new THREE.MeshPhongMaterial({ color: finCol, side: THREE.DoubleSide });
    for (let a = 0; a < 4; a++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.rotation.y = (a / 4) * Math.PI * 2;
      group.add(fin);
    }

    const glow = new THREE.PointLight(isEnemy ? 0xff3300 : 0x00eeff, 1.0, 2.0);
    glow.position.y = -0.28;
    group.add(glow);

    scene.add(group);
    return group;
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCENE REGISTRY
  // ══════════════════════════════════════════════════════════════════════
  const scenes = { enemy: null, my: null };
  function _sc(gridId) { return gridId === 'enemy-grid' ? scenes.enemy : scenes.my; }

  function initScenes() {
    if (!THREE) { onReady(initScenes); return; }
    if (scenes.enemy) scenes.enemy.destroy();
    if (scenes.my)    scenes.my.destroy();
    scenes.enemy = new GridScene('enemy-grid');
    scenes.my    = new GridScene('my-grid');
    function tryMount() {
      if (!document.getElementById('enemy-grid') || !document.getElementById('my-grid')) {
        return setTimeout(tryMount, 200);
      }
      scenes.enemy.mount();
      scenes.my.mount();
    }
    tryMount();
  }

  // ══════════════════════════════════════════════════════════════════════
  // PUBLIC VISUAL ACTIONS
  // ══════════════════════════════════════════════════════════════════════

  function placeShip(gridId, shipKey, cells, orientation) {
    if (!THREE || !cells?.length) return;
    const sc = _sc(gridId);
    if (!sc) return;
    removeShip(gridId, shipKey);
    const size  = cells.length;
    const group = buildShipGroup(shipKey, size, orientation);
    const r0    = cells[0].r,               c0 = cells[0].c;
    const rN    = cells[cells.length-1].r,  cN = cells[cells.length-1].c;
    const pos   = sc.cellToWorld((r0 + rN) / 2, (c0 + cN) / 2);
    group.position.copy(pos);
    group.position.y = 0;
    sc.scene.add(group);
    sc.shipMeshes[shipKey] = { group, cells };
  }

  function removeShip(gridId, shipKey) {
    const sc = _sc(gridId);
    if (!sc || !sc.shipMeshes[shipKey]) return;
    sc.scene.remove(sc.shipMeshes[shipKey].group);
    delete sc.shipMeshes[shipKey];
  }

  function animateHit(cellEl, isSunk) {
    if (!THREE || !cellEl) return;
    const r = parseInt(cellEl.dataset.r);
    const c = parseInt(cellEl.dataset.c);
    if (isNaN(r) || isNaN(c)) return;
    const gridId = cellEl.closest('#enemy-grid') ? 'enemy-grid' : 'my-grid';
    const sc     = _sc(gridId);
    if (!sc) return;

    const wp = sc.cellToWorld(r, c).setY(0.1);
    sc._spawnPS(wp.clone(), 'explosion', { count: isSunk ? 80 : 40, speed: 0.075, size: 0.13, life: 50 });
    sc._spawnPS(wp.clone(), 'fire',      { count: isSunk ? 55 : 28, speed: 0.028, size: 0.09, life: isSunk ? 45 : 110 });
    sc._spawnPS(wp.clone().setY(0.4), 'smoke', { count: isSunk ? 70 : 35, speed: 0.018, size: 0.14, life: isSunk ? 80 : 140 });

    const flash = new THREE.PointLight(0xff6600, 9, 5);
    flash.position.copy(wp).setY(1.2);
    sc.scene.add(flash);
    let fa = 0;
    const fadeFlash = () => {
      fa++;
      flash.intensity = Math.max(0, 9 * (1 - fa / 18));
      if (fa < 18) requestAnimationFrame(fadeFlash);
      else sc.scene.remove(flash);
    };
    requestAnimationFrame(fadeFlash);

    if (isSunk) {
      const shipKey = _shipAtCell(gridId, r, c);
      if (shipKey) setTimeout(() => animateSink(gridId, shipKey, sc.shipMeshes[shipKey]?.cells || [{ r, c }]), 250);
    }
  }

  function animateMiss(cellEl) {
    if (!THREE || !cellEl) return;
    const r = parseInt(cellEl.dataset.r);
    const c = parseInt(cellEl.dataset.c);
    if (isNaN(r) || isNaN(c)) return;
    const gridId = cellEl.closest('#enemy-grid') ? 'enemy-grid' : 'my-grid';
    const sc     = _sc(gridId);
    if (!sc) return;

    const wp = sc.cellToWorld(r, c).setY(0.05);
    sc._spawnPS(wp.clone(), 'splash', { count: 30, speed: 0.06, size: 0.08, life: 38 });

    const ringGeo = new THREE.RingGeometry(0.04, 0.09, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const ring    = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(wp).setY(0.04);
    sc.scene.add(ring);
    let ra = 0;
    const growRing = () => {
      ra++;
      const s = 1 + ra * 0.09;
      ring.scale.set(s, s, 1);
      ring.material.opacity = Math.max(0, 0.7 * (1 - ra / 32));
      if (ra < 32) requestAnimationFrame(growRing);
      else { sc.scene.remove(ring); ringGeo.dispose(); ringMat.dispose(); }
    };
    requestAnimationFrame(growRing);

    const sonar = new THREE.PointLight(0x0088ff, 3.5, 3.5);
    sonar.position.copy(wp).setY(1);
    sc.scene.add(sonar);
    let sa = 0;
    const fadeSonar = () => {
      sa++;
      sonar.intensity = Math.max(0, 3.5 * (1 - sa / 12));
      if (sa < 12) requestAnimationFrame(fadeSonar);
      else sc.scene.remove(sonar);
    };
    requestAnimationFrame(fadeSonar);
  }

  function animateSink(gridId, shipKey, cellArr) {
    if (!THREE) return;
    const sc = _sc(gridId);
    if (!sc || !sc.shipMeshes[shipKey]) return;
    const { group } = sc.shipMeshes[shipKey];
    const startY = group.position.y;
    let age = 0;
    const totalF = 150;
    const loop = () => {
      age++;
      const t    = age / totalF;
      const ease = t * t;
      group.rotation.z  = ease * (Math.PI / 2.2);
      group.position.y  = startY - ease * 2.2;
      group.traverse(obj => {
        if (!obj.isMesh || !obj.material) return;
        if (!obj.material.transparent) { obj.material = obj.material.clone(); obj.material.transparent = true; }
        obj.material.opacity = Math.max(0, 1 - ease * 1.5);
      });
      if (age % 7 === 0) {
        const p = group.position.clone().setY(0.15);
        sc._spawnPS(p, 'smoke', { count: 6, speed: 0.016, size: 0.11, life: 28 });
        if (age < totalF * 0.55) sc._spawnPS(p.clone().setY(0.04), 'splash', { count: 3, speed: 0.025, size: 0.055, life: 18 });
      }
      if (age < totalF) requestAnimationFrame(loop);
      else { sc.scene.remove(group); delete sc.shipMeshes[shipKey]; }
    };
    requestAnimationFrame(loop);
  }

  function launch3DMissile(gridId, r, c, isEnemy, onLand) {
    if (!THREE) { setTimeout(onLand, 400); return; }
    const sc = _sc(gridId);
    if (!sc) { setTimeout(onLand, 400); return; }

    const target = sc.cellToWorld(r, c).setY(0.1);
    const mesh   = buildMissileMesh(sc.scene, isEnemy);

    const p0 = isEnemy
      ? new THREE.Vector3((Math.random()-0.5)*7, 10, (Math.random()-0.5)*7)
      : new THREE.Vector3((Math.random()-0.5)*4,  9, HALF + 3);

    const p3   = target.clone();
    const mid  = p0.clone().lerp(p3, 0.5);
    const peak = mid.clone();
    peak.y = Math.max(p0.y, p3.y) + 4.5;

    const p1 = p0.clone().lerp(peak, 0.55);
    const p2 = p3.clone().lerp(peak, 0.45);
    const dur = Math.max(55, Math.min(110, p0.distanceTo(p3) * 7.5));

    sc.missiles.push({ mesh, p0, p1, p2, p3, t: 0, dt: 1 / dur, isEnemy, onLand });
  }

  function _shipAtCell(gridId, r, c) {
    const sc = _sc(gridId);
    if (!sc) return null;
    for (const [key, data] of Object.entries(sc.shipMeshes)) {
      if (data.cells?.some(cell => cell.r === r && cell.c === c)) return key;
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // WATCH GAME SCREEN & INSTALL
  // ══════════════════════════════════════════════════════════════════════
  function redrawAllShipOverlays() {
    const st = window.bsState || window.state;
    if (!st) return;
    if (st.placedShips) {
      for (const [key, cells] of Object.entries(st.placedShips)) {
        if (!cells?.length) continue;
        const ori = (cells[1] && cells[0].r === cells[1].r) ? 'H' : 'V';
        placeShip('my-grid', key, cells, ori);
      }
    }
    if (st.npcShips) {
      for (const [key, cells] of Object.entries(st.npcShips)) {
        if (!cells?.length) continue;
        const ori = (cells[1] && cells[0].r === cells[1].r) ? 'H' : 'V';
        placeShip('enemy-grid', key, cells, ori);
      }
    }
  }

  function _watchGameScreen() {
    const gs = document.getElementById('game-screen');
    if (!gs) { setTimeout(_watchGameScreen, 300); return; }
    new MutationObserver(() => {
      if (gs.classList.contains('active')) setTimeout(initScenes, 60);
    }).observe(gs, { attributes: true, attributeFilter: ['class'] });
  }

  function install() {
    onReady(() => {
      window.BSVisuals = { animateHit, animateMiss, animateSink, placeShip, removeShip, launch3DMissile, redrawAllShipOverlays };
      window.bsVisuals = {
        animateHit,
        animateMiss,
        launchMissile: (targetCell, onLand, _snap) => {
          const r = parseInt(targetCell.dataset.r);
          const c = parseInt(targetCell.dataset.c);
          if (!isNaN(r) && !isNaN(c)) launch3DMissile('enemy-grid', r, c, false, onLand);
          else onLand();
        },
        launchEnemyMissile: (targetCell, onLand) => {
          if (!targetCell) { onLand(); return; }
          const r = parseInt(targetCell.dataset.r);
          const c = parseInt(targetCell.dataset.c);
          if (!isNaN(r) && !isNaN(c)) launch3DMissile('my-grid', r, c, true, onLand);
          else onLand();
        },
      };
      _watchGameScreen();
    });
  }

  install();

  return { animateHit, animateMiss, animateSink, placeShip, removeShip, launch3DMissile, initScenes, redrawAllShipOverlays };

})();
