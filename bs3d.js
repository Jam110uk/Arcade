// ╔══════════════════════════════════════════════════════════════════════╗
// ║  bs3d.js — Three.js 3D Visual Layer for Battleships                ║
// ║                                                                      ║
// ║  Drop-in replacement for the 2D SVG/canvas visual engine.           ║
// ║  Hooks into window.BSVisuals (same API surface) and intercepts      ║
// ║  the same MutationObserver events to drive 3D animations.           ║
// ║                                                                      ║
// ║  Architecture:                                                       ║
// ║  • One Three.js renderer per grid (enemy-grid, my-grid)             ║
// ║  • Each renderer sits as a fixed canvas overlay aligned to its grid ║
// ║  • 3D top-down orthographic camera matches grid perspective          ║
// ║  • Ships: procedural Three.js geometry (BufferGeometry meshes)       ║
// ║  • Missiles: 3D CylinderGeometry + fins, arc-interpolated per frame ║
// ║  • Particles: custom point clouds for fire, smoke, water splash      ║
// ║  • Ocean: animated plane with vertex displacement                    ║
// ╚══════════════════════════════════════════════════════════════════════╝

export default (() => {

  // ── Load Three.js from CDN (r128 — same version used by other games) ──
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  let THREE = null;
  let _ready = false;
  const _readyCallbacks = [];

  function onReady(fn) {
    if (_ready) fn();
    else _readyCallbacks.push(fn);
  }

  function _loadThree() {
    if (window.THREE) { THREE = window.THREE; _ready = true; _readyCallbacks.forEach(f => f()); return; }
    const s = document.createElement('script');
    s.src = THREE_URL;
    s.onload = () => {
      THREE = window.THREE;
      _ready = true;
      _readyCallbacks.forEach(f => f());
    };
    document.head.appendChild(s);
  }
  _loadThree();

  // ══════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════
  const GRID_SIZE   = 10;      // 10×10 cells
  const CELL_W      = 1.0;     // world-space width per cell
  const HALF        = (GRID_SIZE * CELL_W) / 2;  // 5.0
  const OCEAN_COLOR = 0x041a2e;
  const WATER_COLOR = 0x0a3a5c;
  const GRID_LINE   = 0x0a2040;

  // Ship palette colours (military greens / steel greys)
  const SHIP_COLORS = {
    carrier:    { hull: 0x1a3a1a, deck: 0x243824, accent: 0x3a7a3a },
    battleship: { hull: 0x1a2530, deck: 0x1a2e42, accent: 0x2a4560 },
    cruiser:    { hull: 0x1e2a1e, deck: 0x182a18, accent: 0x2e4e2e },
    submarine:  { hull: 0x1a2a1a, deck: 0x162816, accent: 0x2a4a2a },
    destroyer:  { hull: 0x1a1e2a, deck: 0x141822, accent: 0x242c42 },
  };

  // ══════════════════════════════════════════════════════════════════
  // SCENE MANAGER — one per grid element
  // ══════════════════════════════════════════════════════════════════
  class GridScene {
    constructor(gridId) {
      this.gridId    = gridId;
      this.gridEl    = null;   // set once DOM is ready
      this.canvas    = null;
      this.renderer  = null;
      this.scene     = null;
      this.camera    = null;
      this.rafId     = null;

      this.oceanMesh    = null;
      this.oceanTime    = 0;
      this.shipMeshes   = {};  // key → { group, cells }
      this.wreckMeshes  = {};  // key → group
      this.fireParticles = []; // active particle systems
      this.missParticles = []; // splash particles
      this.missiles      = []; // active missile objects

      this._destroyed = false;
    }

    // ── Bootstrap ──────────────────────────────────────────────────
    mount() {
      this.gridEl = document.getElementById(this.gridId);
      if (!this.gridEl) return;

      this._buildRenderer();
      this._buildScene();
      this._startLoop();
    }

    _buildRenderer() {
      const el = this.gridEl;
      const rect = el.getBoundingClientRect();

      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = `
        position:fixed;
        left:${rect.left}px;
        top:${rect.top}px;
        width:${rect.width}px;
        height:${rect.height}px;
        pointer-events:none;
        z-index:5;
      `;
      document.body.appendChild(this.canvas);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(rect.width, rect.height);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Track grid position on resize
      window.addEventListener('resize', () => this._reposition());
    }

    _reposition() {
      if (!this.gridEl || !this.canvas) return;
      const rect = this.gridEl.getBoundingClientRect();
      this.canvas.style.left   = `${rect.left}px`;
      this.canvas.style.top    = `${rect.top}px`;
      this.canvas.style.width  = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
      this.renderer.setSize(rect.width, rect.height);
      this._updateCamera(rect);
    }

    _buildScene() {
      this.scene  = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0x020d1f, 0.045);

      const rect = this.gridEl.getBoundingClientRect();
      this._buildCamera(rect);
      this._buildLights();
      this._buildOcean();
      this._buildGridLines();
    }

    _buildCamera(rect) {
      const aspect = rect.width / rect.height;
      // Orthographic top-down with slight perspective tilt (10°)
      const viewH  = GRID_SIZE * CELL_W * 0.62;
      const viewW  = viewH * aspect;
      this.camera  = new THREE.OrthographicCamera(-viewW, viewW, viewH, -viewH, 0.1, 200);
      this.camera.position.set(0, 18, 3.5);
      this.camera.lookAt(0, 0, 0);
    }

    _updateCamera(rect) {
      const aspect = rect.width / rect.height;
      const viewH  = GRID_SIZE * CELL_W * 0.62;
      const viewW  = viewH * aspect;
      this.camera.left   = -viewW;
      this.camera.right  =  viewW;
      this.camera.top    =  viewH;
      this.camera.bottom = -viewH;
      this.camera.updateProjectionMatrix();
    }

    _buildLights() {
      // Ambient
      const amb = new THREE.AmbientLight(0x112244, 0.8);
      this.scene.add(amb);

      // Moon directional
      const dir = new THREE.DirectionalLight(0x88aacc, 1.2);
      dir.position.set(-5, 15, 8);
      dir.castShadow = true;
      dir.shadow.mapSize.width  = 512;
      dir.shadow.mapSize.height = 512;
      dir.shadow.camera.near    = 0.5;
      dir.shadow.camera.far     = 40;
      dir.shadow.camera.left    = -8;
      dir.shadow.camera.right   =  8;
      dir.shadow.camera.top     =  8;
      dir.shadow.camera.bottom  = -8;
      this.scene.add(dir);

      // Cyan accent fill (radar glow feel)
      const fill = new THREE.PointLight(0x00f5ff, 0.35, 30);
      fill.position.set(0, 10, 0);
      this.scene.add(fill);
    }

    _buildOcean() {
      // Animated water plane using vertex displacement
      const geo = new THREE.PlaneGeometry(
        GRID_SIZE * CELL_W, GRID_SIZE * CELL_W,
        32, 32
      );
      const mat = new THREE.MeshPhongMaterial({
        color:     WATER_COLOR,
        shininess: 80,
        specular:  new THREE.Color(0x00a0c0),
        transparent: true,
        opacity:   0.88,
      });
      this.oceanMesh = new THREE.Mesh(geo, mat);
      this.oceanMesh.rotation.x = -Math.PI / 2;
      this.oceanMesh.receiveShadow = true;
      this.scene.add(this.oceanMesh);

      // Store original vertex Y positions for wave animation
      const pos = geo.attributes.position;
      this._waveBaseY = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) this._waveBaseY[i] = pos.getZ(i);
    }

    _buildGridLines() {
      // Draw grid lines as line segments
      const mat = new THREE.LineBasicMaterial({ color: GRID_LINE, transparent: true, opacity: 0.45 });
      for (let i = 0; i <= GRID_SIZE; i++) {
        const x = -HALF + i * CELL_W;
        // Vertical
        const vg = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, 0.02, -HALF),
          new THREE.Vector3(x, 0.02,  HALF),
        ]);
        this.scene.add(new THREE.Line(vg, mat));
        // Horizontal
        const hg = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-HALF, 0.02, x),
          new THREE.Vector3( HALF, 0.02, x),
        ]);
        this.scene.add(new THREE.Line(hg, mat));
      }
    }

    // ── Cell coordinate helpers ────────────────────────────────────
    cellToWorld(r, c) {
      // r=0 is top row → z = -HALF + 0.5
      const x = -HALF + c * CELL_W + CELL_W / 2;
      const z = -HALF + r * CELL_W + CELL_W / 2;
      return new THREE.Vector3(x, 0, z);
    }

    // ── Render loop ────────────────────────────────────────────────
    _startLoop() {
      const loop = () => {
        if (this._destroyed) return;
        this.rafId = requestAnimationFrame(loop);
        if (document.hidden) return;
        this._tick();
        this.renderer.render(this.scene, this.camera);
      };
      loop();
    }

    _tick() {
      this.oceanTime += 0.016;
      this._animateOcean();
      this._tickParticles();
      this._tickMissiles();
      this._reposition(); // keep aligned to grid
    }

    _animateOcean() {
      const pos = this.oceanMesh.geometry.attributes.position;
      const t   = this.oceanTime;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        // Two-wave superposition for natural look
        const w = Math.sin(x * 1.2 + t * 0.9) * 0.045
                + Math.sin(y * 0.9 + t * 1.1) * 0.03
                + Math.sin((x + y) * 0.6 + t * 0.7) * 0.025;
        pos.setZ(i, this._waveBaseY[i] + w);
      }
      pos.needsUpdate = true;
      this.oceanMesh.geometry.computeVertexNormals();
    }

    // ── Destroy ────────────────────────────────────────────────────
    destroy() {
      this._destroyed = true;
      cancelAnimationFrame(this.rafId);
      if (this.canvas) this.canvas.remove();
      if (this.renderer) this.renderer.dispose();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // SHIP BUILDER — procedural 3D ship geometry
  // ══════════════════════════════════════════════════════════════════
  function buildShipGroup(shipKey, size, orientation) {
    const group = new THREE.Group();
    const colors = SHIP_COLORS[shipKey] || SHIP_COLORS.destroyer;

    const hullMat  = new THREE.MeshPhongMaterial({ color: colors.hull, shininess: 30 });
    const deckMat  = new THREE.MeshPhongMaterial({ color: colors.deck, shininess: 20 });
    const accMat   = new THREE.MeshPhongMaterial({ color: colors.accent, shininess: 60 });

    const L  = size * CELL_W * 0.90;  // total ship length
    const BW = CELL_W * 0.38;         // beam (width)
    const D  = 0.18;                  // draught

    // ── Hull ──
    const hullGeo = new THREE.BoxGeometry(L, D, BW);
    // Taper the bow and stern using shape morphs is complex; instead use
    // a CylinderGeometry with flat top for the tapered look
    const hullMesh = new THREE.Mesh(hullGeo, hullMat);
    hullMesh.position.y = D / 2;
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    group.add(hullMesh);

    // Bow taper (pyramid-like nose)
    const bowGeo = new THREE.ConeGeometry(BW / 2, BW * 0.8, 6);
    bowGeo.rotateZ(Math.PI / 2);
    const bowMesh = new THREE.Mesh(bowGeo, hullMat);
    bowMesh.position.set(L / 2 + BW * 0.35, D / 2, 0);
    bowMesh.castShadow = true;
    group.add(bowMesh);

    // Stern taper
    const sternGeo = new THREE.ConeGeometry(BW / 2 * 0.7, BW * 0.5, 5);
    sternGeo.rotateZ(-Math.PI / 2);
    const sternMesh = new THREE.Mesh(sternGeo, hullMat);
    sternMesh.position.set(-L / 2 - BW * 0.22, D / 2, 0);
    sternMesh.castShadow = true;
    group.add(sternMesh);

    // ── Main deck ──
    const deckGeo = new THREE.BoxGeometry(L * 0.92, 0.04, BW * 0.75);
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.y = D + 0.02;
    group.add(deckMesh);

    // ── Superstructure ──
    if (shipKey === 'carrier') {
      // Island
      const islandGeo = new THREE.BoxGeometry(L * 0.18, 0.22, BW * 0.3);
      const island = new THREE.Mesh(islandGeo, accMat);
      island.position.set(L * 0.22, D + 0.13, -BW * 0.2);
      island.castShadow = true;
      group.add(island);
      // Radar dish
      const radarGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 4);
      const radar = new THREE.Mesh(radarGeo, accMat);
      radar.position.set(L * 0.22, D + 0.35, -BW * 0.2);
      group.add(radar);
      // Landing stripe
      const stripeGeo = new THREE.PlaneGeometry(L * 0.6, 0.04);
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0x4aaa4a, transparent: true, opacity: 0.6 });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(-L * 0.1, D + 0.05, 0);
      group.add(stripe);

    } else if (shipKey === 'battleship') {
      // Two gun turrets
      const turrGeo = new THREE.BoxGeometry(L * 0.22, 0.14, BW * 0.5);
      const turrFront = new THREE.Mesh(turrGeo, accMat);
      turrFront.position.set(L * 0.28, D + 0.1, 0);
      turrFront.castShadow = true;
      group.add(turrFront);
      const turrRear = new THREE.Mesh(turrGeo, accMat);
      turrRear.position.set(-L * 0.28, D + 0.1, 0);
      turrRear.castShadow = true;
      group.add(turrRear);
      // Gun barrels (front)
      for (let b = -1; b <= 1; b += 2) {
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, L * 0.22, 6),
          new THREE.MeshPhongMaterial({ color: 0x3a5a7a })
        );
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(L * 0.39, D + 0.12, b * 0.08);
        group.add(barrel);
        const barrelR = barrel.clone();
        barrelR.position.set(-L * 0.39, D + 0.12, b * 0.08);
        group.add(barrelR);
      }
      // Bridge
      const bridgeGeo = new THREE.BoxGeometry(L * 0.15, 0.2, BW * 0.45);
      const bridge = new THREE.Mesh(bridgeGeo, accMat);
      bridge.position.set(0, D + 0.18, 0);
      bridge.castShadow = true;
      group.add(bridge);
      // Mast
      const mastGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.35, 5);
      const mast = new THREE.Mesh(mastGeo, new THREE.MeshPhongMaterial({ color: 0x3a6a8a }));
      mast.position.set(0, D + 0.38, 0);
      group.add(mast);

    } else if (shipKey === 'cruiser') {
      // Single gun + bridge
      const gunGeo = new THREE.BoxGeometry(L * 0.18, 0.1, BW * 0.4);
      const gun = new THREE.Mesh(gunGeo, accMat);
      gun.position.set(L * 0.3, D + 0.08, 0);
      group.add(gun);
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, L * 0.28, 6),
        new THREE.MeshPhongMaterial({ color: 0x3a6a3a })
      );
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(L * 0.44, D + 0.1, 0);
      group.add(barrel);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(L * 0.2, 0.18, BW * 0.5), accMat);
      bridge.position.set(0, D + 0.13, 0);
      group.add(bridge);

    } else if (shipKey === 'submarine') {
      // Conning tower
      const sailGeo = new THREE.BoxGeometry(L * 0.16, 0.22, BW * 0.38);
      const sail = new THREE.Mesh(sailGeo, accMat);
      sail.position.set(0, D + 0.13, 0);
      sail.castShadow = true;
      group.add(sail);
      // Periscope
      const pScope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.3, 5),
        new THREE.MeshPhongMaterial({ color: 0x2a5a2a })
      );
      pScope.position.set(0, D + 0.38, 0);
      group.add(pScope);
      // Dive planes
      const planeGeo = new THREE.BoxGeometry(BW * 0.7, 0.04, L * 0.1);
      for (let s of [-1, 1]) {
        const plane = new THREE.Mesh(planeGeo, deckMat);
        plane.position.set(L * 0.22, D, s * BW * 0.42);
        group.add(plane);
      }

    } else {
      // destroyer — sleek profile
      const bridgeGeo = new THREE.BoxGeometry(L * 0.12, 0.16, BW * 0.55);
      const bridge = new THREE.Mesh(bridgeGeo, accMat);
      bridge.position.set(L * 0.12, D + 0.12, 0);
      bridge.castShadow = true;
      group.add(bridge);
      const gunGeo = new THREE.BoxGeometry(L * 0.13, 0.09, BW * 0.38);
      const gun = new THREE.Mesh(gunGeo, accMat);
      gun.position.set(L * 0.35, D + 0.07, 0);
      group.add(gun);
    }

    // ── Waterline glow strip ──
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00c864, transparent: true, opacity: 0.3 });
    const glowGeo = new THREE.PlaneGeometry(L, BW);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    group.add(glow);

    // ── Orientation ──
    if (orientation === 'V') group.rotation.y = Math.PI / 2;

    return group;
  }

  // ══════════════════════════════════════════════════════════════════
  // PARTICLE SYSTEM
  // ══════════════════════════════════════════════════════════════════
  class ParticleSystem {
    constructor(scene, opts) {
      this.scene    = scene;
      this.type     = opts.type; // 'fire' | 'smoke' | 'splash' | 'explosion'
      this.origin   = opts.origin.clone(); // THREE.Vector3
      this.life     = opts.life || 80;
      this.age      = 0;
      this.done     = false;

      this.count    = opts.count || 60;
      const geo  = new THREE.BufferGeometry();
      const pos  = new Float32Array(this.count * 3);
      const vel  = [];
      const ages = new Float32Array(this.count);
      const maxAge = new Float32Array(this.count);

      for (let i = 0; i < this.count; i++) {
        // Start at origin with random offset
        pos[i*3]   = this.origin.x + (Math.random() - 0.5) * 0.1;
        pos[i*3+1] = this.origin.y;
        pos[i*3+2] = this.origin.z + (Math.random() - 0.5) * 0.1;

        const speed = (opts.speed || 0.04) * (0.5 + Math.random());
        const angle = Math.random() * Math.PI * 2;
        const elev  = opts.type === 'splash'
          ? Math.PI / 3 + Math.random() * Math.PI / 4  // upward arc
          : Math.random() * Math.PI / 4;

        vel.push(new THREE.Vector3(
          Math.cos(angle) * Math.cos(elev) * speed,
          Math.sin(elev) * speed * (opts.type === 'fire' ? 1.8 : 1.0),
          Math.sin(angle) * Math.cos(elev) * speed,
        ));

        ages[i]   = Math.random() * (opts.stagger ? opts.stagger : 0);
        maxAge[i] = 30 + Math.random() * 40;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(pos,  3));

      // Color by type
      const colors = new Float32Array(this.count * 3);
      for (let i = 0; i < this.count; i++) {
        const c = this._getColor(i / this.count);
        colors[i*3]   = c.r;
        colors[i*3+1] = c.g;
        colors[i*3+2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size:          opts.size || 0.12,
        vertexColors:  true,
        transparent:   true,
        opacity:       0.85,
        depthWrite:    false,
        blending:      opts.type === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
      });

      this.points   = new THREE.Points(geo, mat);
      this.vel      = vel;
      this.ages     = ages;
      this.maxAge   = maxAge;
      this._gravity = opts.gravity ?? (opts.type === 'splash' ? -0.003 : 0.0);

      scene.add(this.points);
    }

    _getColor(t) {
      switch (this.type) {
        case 'fire':
          // White core → orange → red → dark
          if (t < 0.3) return new THREE.Color(1.0, 0.95, 0.6);
          if (t < 0.6) return new THREE.Color(1.0, 0.45, 0.05);
          return new THREE.Color(0.8, 0.1, 0.0);
        case 'smoke':
          const g = 0.35 + t * 0.4;
          return new THREE.Color(g, g, g);
        case 'splash':
          return new THREE.Color(0.0, 0.65 + Math.random() * 0.3, 1.0);
        case 'explosion':
          if (t < 0.25) return new THREE.Color(1.0, 1.0, 0.9);
          if (t < 0.55) return new THREE.Color(1.0, 0.5, 0.05);
          return new THREE.Color(0.55, 0.1, 0.0);
        default:
          return new THREE.Color(1, 1, 1);
      }
    }

    tick() {
      if (this.done) return;
      const pos   = this.points.geometry.attributes.position;
      const allDead = this._tickParticles(pos);
      pos.needsUpdate = true;
      this.age++;
      if (allDead || this.age > this.life) {
        this.scene.remove(this.points);
        this.points.geometry.dispose();
        this.points.material.dispose();
        this.done = true;
      }

      // Fade out overall opacity
      this.points.material.opacity = Math.max(0, 0.85 * (1 - this.age / this.life));
    }

    _tickParticles(posAttr) {
      let allDead = true;
      for (let i = 0; i < this.count; i++) {
        this.ages[i]++;
        if (this.ages[i] < 0) continue;   // staggered start
        if (this.ages[i] > this.maxAge[i]) continue; // dead
        allDead = false;

        const v  = this.vel[i];
        v.y += this._gravity;
        const ix = i * 3;
        posAttr.array[ix]   += v.x;
        posAttr.array[ix+1] += v.y;
        posAttr.array[ix+2] += v.z;
      }
      return allDead;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 3D MISSILE
  // ══════════════════════════════════════════════════════════════════
  function build3DMissile(scene, isEnemy) {
    const group = new THREE.Group();

    const bodyColor = isEnemy ? 0xcc2010 : 0x00b8d4;
    const finColor  = isEnemy ? 0x881008 : 0x006888;

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.55, 8);
    const bodyMat = new THREE.MeshPhongMaterial({ color: bodyColor, shininess: 80 });
    const body    = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Nose cone
    const noseGeo = new THREE.ConeGeometry(0.055, 0.18, 8);
    const nose    = new THREE.Mesh(noseGeo, new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 120 }));
    nose.position.y = 0.365;
    group.add(nose);

    // Fins (4×)
    const finGeo = new THREE.BufferGeometry();
    const finVerts = new Float32Array([
      0, -0.275, 0,
      0, -0.055,  0,
      0.12, -0.275, 0,
    ]);
    finGeo.setAttribute('position', new THREE.BufferAttribute(finVerts, 3));
    const finMat = new THREE.MeshPhongMaterial({ color: finColor, side: THREE.DoubleSide });
    for (let a = 0; a < 4; a++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.rotation.y = (a / 4) * Math.PI * 2;
      group.add(fin);
    }

    // Engine glow point light
    const glow = new THREE.PointLight(isEnemy ? 0xff3300 : 0x00eeff, 1.2, 2.5);
    glow.position.y = -0.3;
    group.add(glow);

    scene.add(group);
    return group;
  }

  // Bezier helper
  function cubicBezierVec3(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return new THREE.Vector3(
      mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
      mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
      mt*mt*mt*p0.z + 3*mt*mt*t*p1.z + 3*mt*t*t*p2.z + t*t*t*p3.z,
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // MAIN CONTROLLER
  // ══════════════════════════════════════════════════════════════════
  const scenes = {
    enemy: null,
    my:    null,
  };

  // Persistent smoke/fire emitters per sunk ship
  const _persistentFX = {};

  // ── Init scenes ────────────────────────────────────────────────
  function initScenes() {
    if (!THREE) { onReady(initScenes); return; }

    // Destroy old if re-initing
    if (scenes.enemy) scenes.enemy.destroy();
    if (scenes.my)    scenes.my.destroy();

    scenes.enemy = new GridScene('enemy-grid');
    scenes.my    = new GridScene('my-grid');

    // Defer until grid elements exist
    function tryMount() {
      const eg = document.getElementById('enemy-grid');
      const mg = document.getElementById('my-grid');
      if (!eg || !mg) { setTimeout(tryMount, 200); return; }
      scenes.enemy.mount();
      scenes.my.mount();
    }
    tryMount();
  }

  // ── Place a ship in a scene ────────────────────────────────────
  function placeShip(gridId, shipKey, cells, orientation) {
    if (!THREE) return;
    const sc = gridId === 'enemy-grid' ? scenes.enemy : scenes.my;
    if (!sc) return;

    // Remove previous if any
    removeShip(gridId, shipKey);

    const size = cells.length;
    const group = buildShipGroup(shipKey, size, orientation);

    // Centre the ship over its cells
    const r0 = cells[0].r, c0 = cells[0].c;
    const rN = cells[cells.length-1].r, cN = cells[cells.length-1].c;
    const midR = (r0 + rN) / 2, midC = (c0 + cN) / 2;
    const pos  = sc.cellToWorld(midR, midC);
    group.position.copy(pos);
    group.position.y = 0;

    sc.scene.add(group);
    sc.shipMeshes[shipKey] = { group, cells };
  }

  function removeShip(gridId, shipKey) {
    const sc = gridId === 'enemy-grid' ? scenes.enemy : scenes.my;
    if (!sc || !sc.shipMeshes[shipKey]) return;
    sc.scene.remove(sc.shipMeshes[shipKey].group);
    delete sc.shipMeshes[shipKey];
  }

  // ── Particle helpers ──────────────────────────────────────────
  function _spawnParticles(sc, worldPos, type, opts) {
    if (!sc) return;
    sc.fireParticles.push(new ParticleSystem(sc.scene, {
      type,
      origin: worldPos,
      ...opts,
    }));
  }

  // Tick particles in a scene (called from _tick)
  GridScene.prototype._tickParticles = function() {
    for (let i = this.fireParticles.length - 1; i >= 0; i--) {
      this.fireParticles[i].tick();
      if (this.fireParticles[i].done) this.fireParticles.splice(i, 1);
    }
  };

  // Tick missiles in a scene
  GridScene.prototype._tickMissiles = function() {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t += m.dt;
      if (m.t >= 1) {
        m.t = 1;
        const pos = cubicBezierVec3(m.p0, m.p1, m.p2, m.p3, 1);
        m.mesh.position.copy(pos);
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
        m.onLand(pos);
        continue;
      }
      const pos  = cubicBezierVec3(m.p0, m.p1, m.p2, m.p3, m.t);
      const posN = cubicBezierVec3(m.p0, m.p1, m.p2, m.p3, Math.min(1, m.t + 0.01));
      m.mesh.position.copy(pos);

      // Orient missile nose toward direction of travel
      const dir = posN.clone().sub(pos).normalize();
      if (dir.lengthSq() > 0.0001) {
        m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      }

      // Spawn trail smoke
      if (Math.random() < 0.5) {
        _spawnParticles(this, pos.clone(), 'smoke', {
          count: 4, speed: 0.008, size: 0.06, life: 18, gravity: 0.0
        });
      }
    }
  };

  // ── Launch a 3D missile ────────────────────────────────────────
  function launch3DMissile(gridId, targetR, targetC, isEnemy, onLandCb) {
    if (!THREE) { setTimeout(onLandCb, 400); return; }
    const sc = gridId === 'enemy-grid' ? scenes.enemy : scenes.my;
    if (!sc) { setTimeout(onLandCb, 400); return; }

    const target = sc.cellToWorld(targetR, targetC);
    const mesh   = build3DMissile(sc.scene, isEnemy);

    // Launch from high above (slightly offset) → arc → target
    const launchOffset = isEnemy
      ? new THREE.Vector3((Math.random()-0.5)*6, 12, (Math.random()-0.5)*6)
      : new THREE.Vector3((Math.random()-0.5)*4, 10, HALF + 3);

    const p0 = launchOffset;
    const p3 = target.clone().setY(0.1);

    // Control points: steep rise then steep dive
    const mid  = p0.clone().lerp(p3, 0.5);
    const peak = mid.clone();
    peak.y = Math.max(p0.y, p3.y) + 5;

    const p1 = p0.clone().lerp(peak, 0.6);
    const p2 = p3.clone().lerp(peak, 0.5);

    const dist = p0.distanceTo(p3);
    const dur  = Math.max(60, Math.min(120, dist * 8)); // frames

    sc.missiles.push({
      mesh, p0, p1, p2, p3,
      t: 0, dt: 1 / dur,
      isEnemy,
      onLand: (finalPos) => {
        onLandCb(finalPos);
      },
    });
  }

  // ── animateHit — called when a cell gets 'hit' class ────────────
  function animateHit(cellEl, isSunk) {
    if (!THREE || !cellEl) return;
    const r = parseInt(cellEl.dataset.r);
    const c = parseInt(cellEl.dataset.c);
    if (isNaN(r) || isNaN(c)) return;

    // Determine which grid this cell belongs to
    const inEnemy = !!cellEl.closest('#enemy-grid');
    const gridId  = inEnemy ? 'enemy-grid' : 'my-grid';
    const sc      = inEnemy ? scenes.enemy : scenes.my;
    if (!sc) return;

    const worldPos = sc.cellToWorld(r, c);
    worldPos.y = 0.1;

    // Explosion burst
    _spawnParticles(sc, worldPos.clone(), 'explosion', {
      count: isSunk ? 90 : 45, speed: 0.08, size: 0.14, life: 55, gravity: -0.003,
    });

    // Fire (persistent if hit but not sunk, finite if sunk)
    const fireLife = isSunk ? 40 : 120;
    _spawnParticles(sc, worldPos.clone(), 'fire', {
      count: isSunk ? 60 : 30, speed: 0.03, size: 0.10, life: fireLife, gravity: 0.0,
    });

    // Smoke column
    _spawnParticles(sc, worldPos.clone().setY(0.5), 'smoke', {
      count: isSunk ? 80 : 40, speed: 0.02, size: 0.16, life: isSunk ? 90 : 150,
      gravity: 0.0,
    });

    // Point light flash
    const flash = new THREE.PointLight(0xff6600, 8, 5);
    flash.position.copy(worldPos).setY(1);
    sc.scene.add(flash);
    let fAge = 0;
    const fadeFlash = () => {
      fAge++;
      flash.intensity = Math.max(0, 8 * (1 - fAge / 20));
      if (fAge < 20) requestAnimationFrame(fadeFlash);
      else sc.scene.remove(flash);
    };
    requestAnimationFrame(fadeFlash);

    if (isSunk) {
      // Tilt ship model over time → sink
      const shipKey = _findShipKeyAtCell(gridId, r, c);
      if (shipKey) {
        setTimeout(() => animateSink(gridId, shipKey,
          sc.shipMeshes[shipKey]?.cells || [{ r, c }]), 200);
      }
    }
  }

  function _findShipKeyAtCell(gridId, r, c) {
    const sc = gridId === 'enemy-grid' ? scenes.enemy : scenes.my;
    if (!sc) return null;
    for (const [key, data] of Object.entries(sc.shipMeshes)) {
      if (data.cells.some(cell => cell.r === r && cell.c === c)) return key;
    }
    return null;
  }

  // ── animateMiss — water splash ──────────────────────────────────
  function animateMiss(cellEl) {
    if (!THREE || !cellEl) return;
    const r = parseInt(cellEl.dataset.r);
    const c = parseInt(cellEl.dataset.c);
    if (isNaN(r) || isNaN(c)) return;

    const inEnemy = !!cellEl.closest('#enemy-grid');
    const sc      = inEnemy ? scenes.enemy : scenes.my;
    if (!sc) return;

    const worldPos = sc.cellToWorld(r, c);
    worldPos.y = 0.05;

    // Water columns
    _spawnParticles(sc, worldPos.clone(), 'splash', {
      count: 35, speed: 0.065, size: 0.09, life: 40, gravity: -0.005,
    });

    // Ring ripple (thin torus that expands)
    const ringGeo = new THREE.RingGeometry(0.05, 0.1, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff, side: THREE.DoubleSide, transparent: true, opacity: 0.7,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(worldPos).setY(0.05);
    sc.scene.add(ring);

    let rAge = 0;
    const growRing = () => {
      rAge++;
      const s = 1 + rAge * 0.08;
      ring.scale.set(s, s, 1);
      ring.material.opacity = Math.max(0, 0.7 * (1 - rAge / 35));
      if (rAge < 35) requestAnimationFrame(growRing);
      else { sc.scene.remove(ring); ringGeo.dispose(); ringMat.dispose(); }
    };
    requestAnimationFrame(growRing);

    // Sonar point flash
    const sonar = new THREE.PointLight(0x0088ff, 3.5, 3);
    sonar.position.copy(worldPos).setY(1);
    sc.scene.add(sonar);
    let sAge = 0;
    const fadeSonar = () => {
      sAge++;
      sonar.intensity = Math.max(0, 3.5 * (1 - sAge / 14));
      if (sAge < 14) requestAnimationFrame(fadeSonar);
      else sc.scene.remove(sonar);
    };
    requestAnimationFrame(fadeSonar);
  }

  // ── animateSink — 3D ship tilts and sinks ──────────────────────
  function animateSink(gridId, shipKey, cellArr) {
    if (!THREE) return;
    const sc = gridId === 'enemy-grid' ? scenes.enemy : scenes.my;
    if (!sc || !sc.shipMeshes[shipKey]) return;

    const { group } = sc.shipMeshes[shipKey];
    const startY = group.position.y;

    let age = 0;
    const totalFrames = 160; // ~2.7s @ 60fps

    const sinkLoop = () => {
      age++;
      const t = age / totalFrames;
      const ease = t * t; // ease in

      // Tilt (roll toward stern)
      group.rotation.z = ease * (Math.PI / 2.5);
      // Sink below waterline
      group.position.y = startY - ease * 2.5;
      // Fade out
      group.traverse(obj => {
        if (obj.isMesh && obj.material) {
          if (!obj.material.transparent) {
            obj.material = obj.material.clone();
            obj.material.transparent = true;
          }
          obj.material.opacity = Math.max(0, 1 - ease * 1.4);
        }
      });

      // Ongoing smoke/bubbles while sinking
      if (age % 6 === 0) {
        const pos = group.position.clone().setY(0.2);
        _spawnParticles(sc, pos, 'smoke', {
          count: 8, speed: 0.018, size: 0.12, life: 30, gravity: 0.0,
        });
        if (age < totalFrames * 0.6) {
          _spawnParticles(sc, pos.clone().setY(0.05), 'splash', {
            count: 4, speed: 0.03, size: 0.06, life: 20, gravity: -0.003,
          });
        }
      }

      if (age < totalFrames) {
        requestAnimationFrame(sinkLoop);
      } else {
        sc.scene.remove(group);
        delete sc.shipMeshes[shipKey];
      }
    };

    requestAnimationFrame(sinkLoop);
  }

  // ── Watch game screen activation ──────────────────────────────
  function _watchGameScreen() {
    const gs = document.getElementById('game-screen');
    if (!gs) { setTimeout(_watchGameScreen, 300); return; }

    const obs = new MutationObserver(() => {
      if (gs.classList.contains('active')) {
        // Small delay to let the grid cells render
        setTimeout(initScenes, 80);
      }
    });
    obs.observe(gs, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Override window.BSVisuals ──────────────────────────────────
  function install() {
    onReady(() => {
      window.BSVisuals = {
        animateHit,
        animateMiss,
        animateSink,
        placeShip,
        removeShip,
        launch3DMissile,
        redrawAllShipOverlays: () => {
          // Re-read ship state and place all ships from current bsState
          // (called after grid rebuild)
          const st = window.bsState || window.state;
          if (!st) return;
          if (st.placedShips) {
            Object.entries(st.placedShips).forEach(([key, cells]) => {
              if (!cells || !cells.length) return;
              const orientation = cells[0].r === cells[1]?.r ? 'H' : 'V';
              placeShip('my-grid', key, cells, orientation);
            });
          }
          if (st.npcShips) {
            Object.entries(st.npcShips).forEach(([key, cells]) => {
              if (!cells || !cells.length) return;
              const orientation = cells[0].r === cells[1]?.r ? 'H' : 'V';
              placeShip('enemy-grid', key, cells, orientation);
            });
          }
        },
      };

      // Patch window.bsVisuals (used by the MutationObserver hooks in index.html)
      window.bsVisuals = {
        animateHit,
        animateMiss,
        launchMissile: (targetCell, onLand, snapRect) => {
          const r = parseInt(targetCell.dataset.r);
          const c = parseInt(targetCell.dataset.c);
          launch3DMissile('enemy-grid', r, c, false, () => onLand());
        },
        launchEnemyMissile: (targetCell, onLand) => {
          if (!targetCell) { onLand(); return; }
          const r = parseInt(targetCell.dataset.r);
          const c = parseInt(targetCell.dataset.c);
          launch3DMissile('my-grid', r, c, true, () => onLand());
        },
      };

      _watchGameScreen();
    });
  }

  install();

  // ── Public API ─────────────────────────────────────────────────
  return {
    animateHit,
    animateMiss,
    animateSink,
    placeShip,
    removeShip,
    launch3DMissile,
    initScenes,
  };

})();
