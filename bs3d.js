// ╔══════════════════════════════════════════════════════════════════════╗
// ║  bs3d.js — Three.js 3D Visual Layer for Battleships  v3            ║
// ║                                                                      ║
// ║  Fixes vs v2:                                                        ║
// ║  • Suppresses 2D ocean canvas (.grid-ocean-canvas) via CSS          ║
// ║  • Suppresses 2D SVG ship overlays (.ship-overlay, .ship-wreck)     ║
// ║  • Enemy ships never shown in 3D until sunk (matches 2D rules)      ║
// ║  • Slight camera pitch (~18°) for perspective depth on ships,       ║
// ║    while grid lines and cell highlights remain fully visible         ║
// ║  • Darker, deeper ocean colour matching the arcade navy theme        ║
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
  // CSS SUPPRESSION — hide 2D ocean canvas and ship overlays
  // so they don't double-render over the 3D layer
  // ══════════════════════════════════════════════════════════════
  (function injectSuppressCSS() {
    const style = document.createElement('style');
    style.id = 'bs3d-suppress';
    style.textContent = `
      /* Hide 2D animated ocean canvas — replaced by Three.js water */
      #enemy-grid .grid-ocean-canvas,
      #my-grid    .grid-ocean-canvas { opacity: 0 !important; pointer-events: none !important; }

      /* Hide 2D SVG ship overlays — replaced by Three.js ship meshes.
         Ship wrecks ARE shown (they appear after sink + 3D anim finishes). */
      #enemy-grid .ship-overlay,
      #my-grid    .ship-overlay { display: none !important; }

      /* Keep wrecks visible (charred SVG drawn after 3D sink completes) */
      #enemy-grid .ship-wreck,
      #my-grid    .ship-wreck { display: block !important; }
    `;
    document.head.appendChild(style);
  })();

  // ══════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════
  const GRID_N   = 10;
  const CELL_W   = 1.0;
  const TOTAL_W  = GRID_N * CELL_W;
  const HALF     = TOTAL_W / 2;
  const LABEL_PX = 22;   // label col/row width in px (CSS: 22px repeat(10,1fr))

  // Camera tilt: how far back the camera sits, controls perceived pitch
  // 20 units high, 4 units back = atan(4/20) ≈ 11° tilt — subtle but visible
  const CAM_Y  = 22;
  const CAM_Z  = 5.5;   // positive Z = viewer side; tilt toward viewer

  // Water: deep navy to match arcade theme
  const WATER_COL  = 0x041828;
  const WATER_SPEC = 0x0055aa;

  const SHIP_PAL = {
    carrier:    { hull: 0x1a3a1a, deck: 0x243824, acc: 0x3a7a3a },
    battleship: { hull: 0x1a2530, deck: 0x1a2e42, acc: 0x2a4560 },
    cruiser:    { hull: 0x1e2a1e, deck: 0x182a18, acc: 0x2e4e2e },
    submarine:  { hull: 0x1a2a1a, deck: 0x162816, acc: 0x2a4a2a },
    destroyer:  { hull: 0x1a1e2a, deck: 0x141822, acc: 0x242c42 },
  };

  // ══════════════════════════════════════════════════════════════
  // PLAY-AREA RECT HELPER
  // grid-container = 22px label col + 10 data cols
  //                  22px label row + 10 data rows
  // Canvas must cover ONLY the 10×10 data area.
  // ══════════════════════════════════════════════════════════════
  function playRect(gridEl) {
    const f = gridEl.getBoundingClientRect();
    return {
      left:   f.left + LABEL_PX,
      top:    f.top  + LABEL_PX,
      width:  f.width  - LABEL_PX,
      height: f.height - LABEL_PX,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // GRID SCENE
  // ══════════════════════════════════════════════════════════════
  class GridScene {
    constructor(gridId) {
      this.gridId     = gridId;
      this.gridEl     = null;
      this.canvas     = null;
      this.renderer   = null;
      this.scene      = null;
      this.camera     = null;
      this.rafId      = null;
      this.oceanMesh  = null;
      this.oceanTime  = 0;
      this.shipMeshes = {};   // key → { group, cells }
      this.particles  = [];
      this.missiles   = [];
      this._dead      = false;
      this._rqd       = false;  // resize queued
    }

    mount() {
      this.gridEl = document.getElementById(this.gridId);
      if (!this.gridEl) return;
      this._mkRenderer();
      this._mkScene();
      this._loop();
      window.addEventListener('resize', () => this._schedRepos());
      new ResizeObserver(() => this._schedRepos()).observe(this.gridEl);
    }

    // ── Renderer ───────────────────────────────────────────────
    _mkRenderer() {
      const pr = playRect(this.gridEl);
      this.canvas = document.createElement('canvas');
      this._styleCanvas(pr);
      document.body.appendChild(this.canvas);

      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(pr.width, pr.height);
      this.renderer.setClearColor(0x000000, 0);
    }

    _styleCanvas(pr) {
      this.canvas.style.cssText = `
        position:fixed; left:${pr.left}px; top:${pr.top}px;
        width:${pr.width}px; height:${pr.height}px;
        pointer-events:none; z-index:4;
      `;
    }

    _schedRepos() {
      if (this._rqd) return;
      this._rqd = true;
      requestAnimationFrame(() => { this._rqd = false; this._repos(); });
    }

    _repos() {
      if (!this.gridEl || this._dead) return;
      const pr = playRect(this.gridEl);
      this._styleCanvas(pr);
      this.renderer.setSize(pr.width, pr.height);
      this._updateCam(pr);
    }

    // ── Scene ──────────────────────────────────────────────────
    _mkScene() {
      this.scene = new THREE.Scene();
      const pr = playRect(this.gridEl);
      this._mkCam(pr);
      this._mkLights();
      this._mkOcean();
      this._mkGridLines();
    }

    // ── Camera ─────────────────────────────────────────────────
    // PerspectiveCamera pitched slightly back.
    // Camera sits at (0, CAM_Y, CAM_Z) looking at (0, 0, -1.2)
    // so the grid appears slightly angled (ships have 3D depth)
    // while all 10 rows remain clearly visible.
    // FOV is narrow (28°) to reduce perspective distortion on cells.
    _mkCam(pr) {
      const aspect = pr.width / pr.height;
      this.camera = new THREE.PerspectiveCamera(28, aspect, 0.1, 200);
      // Look slightly forward of centre so near rows don't loom large
      this.camera.position.set(0, CAM_Y, CAM_Z);
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(0, 0, -1.2);
    }

    _updateCam(pr) {
      this.camera.aspect = pr.width / pr.height;
      this.camera.updateProjectionMatrix();
    }

    // ── Lights ─────────────────────────────────────────────────
    _mkLights() {
      // Strong ambient — everything visible even from steep top-down angle
      this.scene.add(new THREE.AmbientLight(0x4466aa, 1.5));
      // Directional: slight angle for ship body shading
      const d = new THREE.DirectionalLight(0x99bbdd, 1.1);
      d.position.set(2, 14, 6);
      this.scene.add(d);
      // Neon cyan fill — arcade feel
      const f = new THREE.PointLight(0x00f5ff, 0.5, 45);
      f.position.set(0, 16, 0);
      this.scene.add(f);
    }

    // ── Ocean ──────────────────────────────────────────────────
    // Deep navy, moderate opacity — enough to look like water
    // without washing out the grid lines (which are HTML, not 3D)
    _mkOcean() {
      const geo = new THREE.PlaneGeometry(TOTAL_W, TOTAL_W, 36, 36);
      const mat = new THREE.MeshPhongMaterial({
        color:       WATER_COL,
        shininess:   90,
        specular:    new THREE.Color(WATER_SPEC),
        transparent: true,
        opacity:     0.72,
        depthWrite:  false,
      });
      this.oceanMesh = new THREE.Mesh(geo, mat);
      this.oceanMesh.rotation.x = -Math.PI / 2;
      this.oceanMesh.position.y = -0.02;
      this.scene.add(this.oceanMesh);
      const pos = geo.attributes.position;
      this._wb = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) this._wb[i] = pos.getZ(i);
    }

    // ── Grid lines in 3D ──────────────────────────────────────
    // Drawn at Y=0.08 so they're always above wave peaks (~0.04).
    // Colour matches the CSS --grid-line var (#0a2040) but brighter
    // for visibility through the angled camera.
    _mkGridLines() {
      const mat = new THREE.LineBasicMaterial({ color: 0x1a4060, transparent: true, opacity: 0.65 });
      for (let i = 0; i <= GRID_N; i++) {
        const v = -HALF + i * CELL_W;
        const vg = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(v, 0.08, -HALF),
          new THREE.Vector3(v, 0.08,  HALF),
        ]);
        this.scene.add(new THREE.Line(vg, mat));
        const hg = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-HALF, 0.08, v),
          new THREE.Vector3( HALF, 0.08, v),
        ]);
        this.scene.add(new THREE.Line(hg, mat));
      }
    }

    // ── Cell → world ───────────────────────────────────────────
    cellToWorld(r, c) {
      return new THREE.Vector3(
        -HALF + c * CELL_W + CELL_W / 2,
        0,
        -HALF + r * CELL_W + CELL_W / 2
      );
    }

    // ── Loop ───────────────────────────────────────────────────
    _loop() {
      const tick = () => {
        if (this._dead) return;
        this.rafId = requestAnimationFrame(tick);
        if (document.hidden) return;
        this.oceanTime += 0.016;
        this._waveOcean();
        this._doParticles();
        this._doMissiles();
        this.renderer.render(this.scene, this.camera);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    _waveOcean() {
      const pos = this.oceanMesh.geometry.attributes.position;
      const t   = this.oceanTime;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        pos.setZ(i, this._wb[i]
          + Math.sin(x * 1.05 + t * 0.75) * 0.032
          + Math.sin(y * 0.80 + t * 1.00) * 0.022
          + Math.sin((x - y) * 0.5 + t * 0.6) * 0.014);
      }
      pos.needsUpdate = true;
      this.oceanMesh.geometry.computeVertexNormals();
    }

    _doParticles() {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        this.particles[i].tick();
        if (this.particles[i].done) this.particles.splice(i, 1);
      }
    }

    _doMissiles() {
      for (let i = this.missiles.length - 1; i >= 0; i--) {
        const m = this.missiles[i];
        m.t += m.dt;
        if (m.t >= 1) {
          this.scene.remove(m.mesh);
          this.missiles.splice(i, 1);
          m.onLand();
          continue;
        }
        const p  = cbez(m.p0, m.p1, m.p2, m.p3, m.t);
        const pn = cbez(m.p0, m.p1, m.p2, m.p3, Math.min(1, m.t + 0.012));
        m.mesh.position.copy(p);
        const dir = pn.clone().sub(p);
        if (dir.lengthSq() > 1e-6)
          m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
        if (Math.random() < 0.4)
          this._ps(p.clone(), 'smoke', { count:3, speed:0.007, size:0.05, life:15 });
      }
    }

    _ps(origin, type, opts) {
      this.particles.push(new PS(this.scene, { type, origin, ...opts }));
    }

    destroy() {
      this._dead = true;
      cancelAnimationFrame(this.rafId);
      this.canvas?.remove();
      this.renderer?.dispose();
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PARTICLE SYSTEM
  // ══════════════════════════════════════════════════════════════
  class PS {
    constructor(scene, opts) {
      this.scene = scene; this.type = opts.type;
      this.life  = opts.life || 65; this.age = 0; this.done = false;
      this.n     = opts.count || 45;
      const geo  = new THREE.BufferGeometry();
      const pos  = new Float32Array(this.n * 3);
      const col  = new Float32Array(this.n * 3);
      this._v    = []; this._a = new Float32Array(this.n); this._ma = new Float32Array(this.n);
      const o    = opts.origin || new THREE.Vector3();
      for (let i = 0; i < this.n; i++) {
        pos[i*3]   = o.x + (Math.random()-.5)*.08;
        pos[i*3+1] = o.y;
        pos[i*3+2] = o.z + (Math.random()-.5)*.08;
        const sp  = (opts.speed||.03)*(0.5+Math.random());
        const ang = Math.random()*Math.PI*2;
        const el  = opts.type==='splash' ? .9+Math.random()*.55 : .12+Math.random()*.38;
        this._v.push(new THREE.Vector3(
          Math.cos(ang)*Math.cos(el)*sp,
          Math.sin(el)*sp*(opts.type==='fire'?2.0:1.0),
          Math.sin(ang)*Math.cos(el)*sp));
        this._a[i]  = -(Math.random()*(opts.stagger||0));
        this._ma[i] = 22 + Math.random()*32;
        const c = this._col(i/this.n); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
      geo.setAttribute('color',    new THREE.BufferAttribute(col,3));
      this.pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size:opts.size||.09, vertexColors:true, transparent:true, opacity:.88,
        depthWrite:false, blending:opts.type==='smoke'?THREE.NormalBlending:THREE.AdditiveBlending,
      }));
      this._g = opts.type==='splash' ? -.0038 : 0;
      scene.add(this.pts);
    }
    _col(t) {
      if(this.type==='fire'){
        if(t<.3) return new THREE.Color(1,.97,.6);
        if(t<.6) return new THREE.Color(1,.4,.03);
        return new THREE.Color(.8,.07,0);
      } else if(this.type==='smoke'){
        const g=.28+t*.42; return new THREE.Color(g,g,g+.05);
      } else if(this.type==='splash'){
        return new THREE.Color(.08,.5+Math.random()*.35,1);
      } else if(this.type==='explosion'){
        if(t<.2) return new THREE.Color(1,1,.94);
        if(t<.5) return new THREE.Color(1,.46,.04);
        return new THREE.Color(.58,.07,0);
      }
      return new THREE.Color(1,1,1);
    }
    tick() {
      if(this.done) return;
      const pa = this.pts.geometry.attributes.position;
      let dead = true;
      for(let i=0;i<this.n;i++){
        this._a[i]++;
        if(this._a[i]<0||this._a[i]>this._ma[i]) continue;
        dead = false;
        const v=this._v[i]; v.y+=this._g;
        const ix=i*3; pa.array[ix]+=v.x; pa.array[ix+1]+=v.y; pa.array[ix+2]+=v.z;
      }
      pa.needsUpdate=true; this.age++;
      this.pts.material.opacity=Math.max(0,.88*(1-this.age/this.life));
      if(dead||this.age>this.life){
        this.scene.remove(this.pts);
        this.pts.geometry.dispose(); this.pts.material.dispose(); this.done=true;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // BEZIER
  // ══════════════════════════════════════════════════════════════
  function cbez(p0,p1,p2,p3,t){
    const m=1-t;
    return new THREE.Vector3(
      m*m*m*p0.x+3*m*m*t*p1.x+3*m*t*t*p2.x+t*t*t*p3.x,
      m*m*m*p0.y+3*m*m*t*p1.y+3*m*t*t*p2.y+t*t*t*p3.y,
      m*m*m*p0.z+3*m*m*t*p1.z+3*m*t*t*p2.z+t*t*t*p3.z);
  }

  // ══════════════════════════════════════════════════════════════
  // SHIP BUILDER
  // ══════════════════════════════════════════════════════════════
  function buildShip(key, size, ori) {
    const g    = new THREE.Group();
    const pal  = SHIP_PAL[key] || SHIP_PAL.destroyer;
    const L    = size * CELL_W * 0.88;
    const BW   = CELL_W * 0.34;
    const D    = 0.15;
    const hm   = new THREE.MeshPhongMaterial({color:pal.hull,shininess:22});
    const dm   = new THREE.MeshPhongMaterial({color:pal.deck,shininess:16});
    const am   = new THREE.MeshPhongMaterial({color:pal.acc, shininess:52});

    // Hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(L,D,BW), hm);
    hull.position.y = D/2; hull.castShadow=true; g.add(hull);
    // Bow
    const bow = new THREE.Mesh(new THREE.ConeGeometry(BW/2,BW*.72,6), hm);
    bow.rotation.z = Math.PI/2; bow.position.set(L/2+BW*.31,D/2,0); g.add(bow);
    // Stern
    const stn = new THREE.Mesh(new THREE.ConeGeometry(BW*.32,BW*.42,5), hm);
    stn.rotation.z = -Math.PI/2; stn.position.set(-L/2-BW*.18,D/2,0); g.add(stn);
    // Deck strip
    const dk = new THREE.Mesh(new THREE.BoxGeometry(L*.88,.035,BW*.70), dm);
    dk.position.y = D+.018; g.add(dk);

    switch(key) {
      case 'carrier': {
        // Flight deck stripe
        const fs = new THREE.Mesh(new THREE.PlaneGeometry(L*.6,.035),
          new THREE.MeshBasicMaterial({color:0x4aaa4a,transparent:true,opacity:.5}));
        fs.rotation.x=-Math.PI/2; fs.position.set(-L*.07,D+.04,0); g.add(fs);
        // Island
        const isl = new THREE.Mesh(new THREE.BoxGeometry(L*.16,.26,BW*.26), am);
        isl.position.set(L*.21,D+.15,-BW*.21); isl.castShadow=true; g.add(isl);
        // Radar post
        const mp = new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,.3,4), am);
        mp.position.set(L*.21,D+.40,-BW*.21); g.add(mp);
        break;
      }
      case 'battleship': {
        for(const [xm,dir] of [[.25,1],[-.25,-1]]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(L*.19,.13,BW*.46), am);
          t.position.set(L*xm,D+.09,0); t.castShadow=true; g.add(t);
          for(const bz of [-.065,.065]) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,L*.19,6),
              new THREE.MeshPhongMaterial({color:0x3a5a7a}));
            bar.rotation.z=Math.PI/2; bar.position.set(L*(xm+dir*.11),D+.11,bz); g.add(bar);
          }
        }
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*.13,.19,BW*.43), am);
        br.position.set(0,D+.16,0); br.castShadow=true; g.add(br);
        break;
      }
      case 'cruiser': {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(L*.15,.09,BW*.38), am);
        gun.position.set(L*.29,D+.07,0); g.add(gun);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,L*.25,6),
          new THREE.MeshPhongMaterial({color:0x3a6a3a}));
        bar.rotation.z=Math.PI/2; bar.position.set(L*.43,D+.09,0); g.add(bar);
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*.17,.16,BW*.48), am);
        br.position.set(0,D+.11,0); g.add(br);
        break;
      }
      case 'submarine': {
        const sail = new THREE.Mesh(new THREE.BoxGeometry(L*.14,.21,BW*.34), am);
        sail.position.set(0,D+.12,0); sail.castShadow=true; g.add(sail);
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.27,5),
          new THREE.MeshPhongMaterial({color:0x2a5a2a}));
        sc.position.set(0,D+.36,0); g.add(sc);
        for(const sx of [-1,1]){
          const pl = new THREE.Mesh(new THREE.BoxGeometry(BW*.62,.028,L*.085), dm);
          pl.position.set(L*.21,D,sx*BW*.38); g.add(pl);
        }
        break;
      }
      default: { // destroyer
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*.11,.15,BW*.50), am);
        br.position.set(L*.11,D+.11,0); br.castShadow=true; g.add(br);
        const gn = new THREE.Mesh(new THREE.BoxGeometry(L*.11,.08,BW*.34), am);
        gn.position.set(L*.33,D+.06,0); g.add(gn);
      }
    }

    // Waterline glow
    const wg = new THREE.Mesh(new THREE.PlaneGeometry(L,BW),
      new THREE.MeshBasicMaterial({color:0x00c864,transparent:true,opacity:.22}));
    wg.rotation.x=-Math.PI/2; wg.position.y=.01; g.add(wg);

    if(ori==='V') g.rotation.y=Math.PI/2;
    return g;
  }

  // ══════════════════════════════════════════════════════════════
  // MISSILE MESH
  // ══════════════════════════════════════════════════════════════
  function buildMissile(scene, isEnemy) {
    const g   = new THREE.Group();
    const bc  = isEnemy ? 0xcc2010 : 0x00b8d4;
    const fc  = isEnemy ? 0x881008 : 0x006888;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.048,.048,.48,8),
      new THREE.MeshPhongMaterial({color:bc,shininess:80})));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.048,.15,8),
      new THREE.MeshPhongMaterial({color:0xdddddd,shininess:120}));
    nose.position.y=.315; g.add(nose);
    const fv = new Float32Array([0,-.24,0, 0,-.048,0, .105,-.24,0]);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position',new THREE.BufferAttribute(fv,3));
    const fm = new THREE.MeshPhongMaterial({color:fc,side:THREE.DoubleSide});
    for(let a=0;a<4;a++){const f=new THREE.Mesh(fg,fm);f.rotation.y=(a/4)*Math.PI*2;g.add(f);}
    const gl = new THREE.PointLight(isEnemy?0xff3300:0x00eeff,.9,1.8);
    gl.position.y=-.26; g.add(gl);
    scene.add(g); return g;
  }

  // ══════════════════════════════════════════════════════════════
  // SCENE REGISTRY
  // ══════════════════════════════════════════════════════════════
  const SC = { enemy: null, my: null };
  const sc  = id => id==='enemy-grid' ? SC.enemy : SC.my;

  function initScenes() {
    if(!THREE) { onReady(initScenes); return; }
    SC.enemy?.destroy(); SC.my?.destroy();
    SC.enemy = new GridScene('enemy-grid');
    SC.my    = new GridScene('my-grid');
    (function tryMount(){
      if(!document.getElementById('enemy-grid')||!document.getElementById('my-grid'))
        return setTimeout(tryMount,200);
      SC.enemy.mount(); SC.my.mount();
    })();
  }

  // ══════════════════════════════════════════════════════════════
  // SHIP PLACEMENT — with enemy-hidden rule
  // ══════════════════════════════════════════════════════════════
  function placeShip(gridId, key, cells, ori, revealEnemy) {
    if(!THREE || !cells?.length) return;
    const s = sc(gridId); if(!s) return;

    // Enemy ships are HIDDEN until sunk (revealEnemy flag set by animateSink)
    if(gridId==='enemy-grid' && !revealEnemy) return;

    removeShip(gridId, key);
    const size = cells.length;
    const grp  = buildShip(key, size, ori);
    const r0=cells[0].r, c0=cells[0].c;
    const rN=cells[cells.length-1].r, cN=cells[cells.length-1].c;
    const pos = s.cellToWorld((r0+rN)/2,(c0+cN)/2);
    grp.position.copy(pos); grp.position.y=0;
    s.scene.add(grp);
    s.shipMeshes[key] = {grp, cells};
  }

  function removeShip(gridId, key) {
    const s = sc(gridId); if(!s||!s.shipMeshes[key]) return;
    s.scene.remove(s.shipMeshes[key].grp);
    delete s.shipMeshes[key];
  }

  // ══════════════════════════════════════════════════════════════
  // HIT / MISS / SINK
  // ══════════════════════════════════════════════════════════════
  function animateHit(cellEl, isSunk) {
    if(!THREE||!cellEl) return;
    const r=parseInt(cellEl.dataset.r), c=parseInt(cellEl.dataset.c);
    if(isNaN(r)||isNaN(c)) return;
    const gid = cellEl.closest('#enemy-grid')?'enemy-grid':'my-grid';
    const s   = sc(gid); if(!s) return;
    const wp  = s.cellToWorld(r,c).setY(.1);

    s._ps(wp.clone(),'explosion',{count:isSunk?75:38,speed:.07,size:.12,life:48});
    s._ps(wp.clone(),'fire',     {count:isSunk?50:25,speed:.026,size:.085,life:isSunk?42:105});
    s._ps(wp.clone().setY(.35),'smoke',{count:isSunk?65:30,speed:.016,size:.13,life:isSunk?75:135});

    const fl = new THREE.PointLight(0xff6600,8,4.5);
    fl.position.copy(wp).setY(1.1); s.scene.add(fl);
    let fa=0; const ff=()=>{fa++;fl.intensity=Math.max(0,8*(1-fa/17));if(fa<17)requestAnimationFrame(ff);else s.scene.remove(fl);};
    requestAnimationFrame(ff);

    if(isSunk) {
      const shipKey = _atCell(gid,r,c);
      if(shipKey) setTimeout(()=>animateSink(gid,shipKey,s.shipMeshes[shipKey]?.cells||[{r,c}]),260);
    }
  }

  function animateMiss(cellEl) {
    if(!THREE||!cellEl) return;
    const r=parseInt(cellEl.dataset.r), c=parseInt(cellEl.dataset.c);
    if(isNaN(r)||isNaN(c)) return;
    const gid = cellEl.closest('#enemy-grid')?'enemy-grid':'my-grid';
    const s   = sc(gid); if(!s) return;
    const wp  = s.cellToWorld(r,c).setY(.05);

    s._ps(wp.clone(),'splash',{count:28,speed:.055,size:.075,life:36});

    const rg=new THREE.RingGeometry(.04,.09,32);
    const rm=new THREE.MeshBasicMaterial({color:0x00aaff,side:THREE.DoubleSide,transparent:true,opacity:.65});
    const rng=new THREE.Mesh(rg,rm); rng.rotation.x=-Math.PI/2; rng.position.copy(wp).setY(.04);
    s.scene.add(rng);
    let ra=0; const gr=()=>{ra++;const sv=1+ra*.09;rng.scale.set(sv,sv,1);rm.opacity=Math.max(0,.65*(1-ra/30));if(ra<30)requestAnimationFrame(gr);else{s.scene.remove(rng);rg.dispose();rm.dispose();}};
    requestAnimationFrame(gr);

    const sl=new THREE.PointLight(0x0088ff,3.2,3.2); sl.position.copy(wp).setY(.9); s.scene.add(sl);
    let sa=0; const fs=()=>{sa++;sl.intensity=Math.max(0,3.2*(1-sa/11));if(sa<11)requestAnimationFrame(fs);else s.scene.remove(sl);};
    requestAnimationFrame(fs);
  }

  function animateSink(gridId, key, cellArr) {
    if(!THREE) return;
    const s = sc(gridId); if(!s) return;

    // For enemy grid: place the ship first (it was hidden until now)
    if(gridId==='enemy-grid' && !s.shipMeshes[key]) {
      const st  = window.bsState||window.state;
      const cells = cellArr || (st?.npcShips?.[key]) || (st?.enemyPlacedShips?.[key]);
      if(cells?.length) {
        const ori = (cells[1]&&cells[0].r===cells[1].r)?'H':'V';
        // Pass revealEnemy=true to bypass the hidden rule
        const grp = buildShip(key, cells.length, ori);
        const r0=cells[0].r,c0=cells[0].c,rN=cells[cells.length-1].r,cN=cells[cells.length-1].c;
        const pos = s.cellToWorld((r0+rN)/2,(c0+cN)/2);
        grp.position.copy(pos); grp.position.y=0;
        s.scene.add(grp);
        s.shipMeshes[key]={grp,cells};
      }
    }

    if(!s.shipMeshes[key]) return;
    const {grp} = s.shipMeshes[key];
    const sy=grp.position.y;
    let age=0; const tot=148;
    const lp=()=>{
      age++; const t=age/tot, e=t*t;
      grp.rotation.z=e*(Math.PI/2.1); grp.position.y=sy-e*2.1;
      grp.traverse(o=>{
        if(!o.isMesh||!o.material) return;
        if(!o.material.transparent){o.material=o.material.clone();o.material.transparent=true;}
        o.material.opacity=Math.max(0,1-e*1.5);
      });
      if(age%7===0){
        const p=grp.position.clone().setY(.14);
        s._ps(p,'smoke',{count:5,speed:.015,size:.10,life:26});
        if(age<tot*.55) s._ps(p.clone().setY(.04),'splash',{count:3,speed:.022,size:.05,life:17});
      }
      if(age<tot) requestAnimationFrame(lp);
      else{s.scene.remove(grp);delete s.shipMeshes[key];}
    };
    requestAnimationFrame(lp);
  }

  function launch3DMissile(gridId, r, c, isEnemy, onLand) {
    if(!THREE){setTimeout(onLand,400);return;}
    const s=sc(gridId); if(!s){setTimeout(onLand,400);return;}
    const tgt=s.cellToWorld(r,c).setY(.1);
    const mesh=buildMissile(s.scene,isEnemy);
    const p0=isEnemy
      ? new THREE.Vector3((Math.random()-.5)*7,10,(Math.random()-.5)*7)
      : new THREE.Vector3((Math.random()-.5)*4,9,HALF+3);
    const p3=tgt.clone();
    const mid=p0.clone().lerp(p3,.5); const pk=mid.clone(); pk.y=Math.max(p0.y,p3.y)+4.5;
    const p1=p0.clone().lerp(pk,.55), p2=p3.clone().lerp(pk,.45);
    const dur=Math.max(55,Math.min(110,p0.distanceTo(p3)*7.5));
    s.missiles.push({mesh,p0,p1,p2,p3,t:0,dt:1/dur,isEnemy,onLand});
  }

  function _atCell(gridId,r,c){
    const s=sc(gridId); if(!s) return null;
    for(const[k,d] of Object.entries(s.shipMeshes))
      if(d.cells?.some(x=>x.r===r&&x.c===c)) return k;
    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // REDRAW — only places MY ships (enemy ships stay hidden)
  // ══════════════════════════════════════════════════════════════
  function redrawAllShipOverlays() {
    const st = window.bsState||window.state; if(!st) return;
    // My ships — always show
    for(const[key,cells] of Object.entries(st.placedShips||{})){
      if(!cells?.length) continue;
      if(st.sunkMyShips?.has(key)) continue;  // sunk ships shown by wreck SVG
      const ori=(cells[1]&&cells[0].r===cells[1].r)?'H':'V';
      // Place on my-grid (revealEnemy flag only relevant for enemy-grid)
      const s=SC.my; if(!s) continue;
      removeShip('my-grid',key);
      const grp=buildShip(key,cells.length,ori);
      const r0=cells[0].r,c0=cells[0].c,rN=cells[cells.length-1].r,cN=cells[cells.length-1].c;
      const pos=s.cellToWorld((r0+rN)/2,(c0+cN)/2);
      grp.position.copy(pos); grp.position.y=0;
      s.scene.add(grp); s.shipMeshes[key]={grp,cells};
    }
    // Enemy: only already-sunk ships get placed (rest stay hidden)
    const npc=st.npcShips||{};
    for(const key of (st.sunkEnemyShips||new Set())){
      const cells=npc[key]||st.enemyPlacedShips?.[key];
      if(!cells?.length) continue;
      const ori=(cells[1]&&cells[0].r===cells[1].r)?'H':'V';
      placeShip('enemy-grid',key,cells,ori,true);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // WATCH + INSTALL
  // ══════════════════════════════════════════════════════════════
  function _watch() {
    const gs=document.getElementById('game-screen');
    if(!gs){setTimeout(_watch,300);return;}
    new MutationObserver(()=>{
      if(gs.classList.contains('active')) setTimeout(initScenes,60);
    }).observe(gs,{attributes:true,attributeFilter:['class']});
  }

  function install() {
    onReady(()=>{
      window.BSVisuals = {animateHit,animateMiss,animateSink,placeShip,removeShip,launch3DMissile,redrawAllShipOverlays};
      window.bsVisuals = {
        animateHit, animateMiss,
        launchMissile:(cell,cb)=>{
          const r=parseInt(cell.dataset.r),c=parseInt(cell.dataset.c);
          if(!isNaN(r)&&!isNaN(c)) launch3DMissile('enemy-grid',r,c,false,cb); else cb();
        },
        launchEnemyMissile:(cell,cb)=>{
          if(!cell){cb();return;}
          const r=parseInt(cell.dataset.r),c=parseInt(cell.dataset.c);
          if(!isNaN(r)&&!isNaN(c)) launch3DMissile('my-grid',r,c,true,cb); else cb();
        },
      };
      _watch();
    });
  }

  install();
  return {animateHit,animateMiss,animateSink,placeShip,removeShip,launch3DMissile,initScenes,redrawAllShipOverlays};

})();
