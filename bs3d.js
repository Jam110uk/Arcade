// bs3d.js v5 — top-down orthographic, working ocean, ships occlude grid lines

export default (() => {

  // ── Three.js loader ───────────────────────────────────────────
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

  // ── CSS suppression ───────────────────────────────────────────
  const _css = document.createElement('style');
  _css.textContent = `
    #bs3d-canvas {
      position: fixed; inset: 0; width: 100vw; height: 100vh;
      pointer-events: none; z-index: 0;
    }
    /* Hide 2D ocean canvases */
    #enemy-grid .grid-ocean-canvas,
    #my-grid    .grid-ocean-canvas { display: none !important; }
    /* Hide 2D ship overlays only inside the active game screen */
    #game-screen #enemy-grid .ship-overlay,
    #game-screen #my-grid    .ship-overlay { display: none !important; }
    /* Keep sunk wrecks (2D charred SVG shown after 3D sink) */
    #enemy-grid .ship-wreck,
    #my-grid    .ship-wreck { display: block !important; }
    /* Transparent game cells so 3D shows through */
    #game-screen .grid-cell:not(.hit):not(.miss):not(.sunk):not(.sunk-ship) {
      background: transparent !important;
    }
    /* Remove green ship-cell borders — 3D models replace them */
    #game-screen #my-grid .grid-cell.ship-cell {
      border-color: var(--grid-line) !important;
    }
    #game-screen .grid-cell.hit  { background: rgba(30,4,0,0.55) !important; }
    #game-screen .grid-cell.miss { background: rgba(0,10,30,0.35) !important; }
  `;
  document.head.appendChild(_css);

  // ── Constants ─────────────────────────────────────────────────
  const GRID_N   = 10;
  const LABEL_PX = 22;   // label row/col = 22px in CSS
  const WATER    = 0x041828;

  // Ship palette — steel blues/greys, no greens
  const PAL = {
    carrier:    { hull: 0x2a3a44, deck: 0x1e2e38, acc: 0x3a5060 },
    battleship: { hull: 0x1e2530, deck: 0x18202a, acc: 0x2a3c50 },
    cruiser:    { hull: 0x253035, deck: 0x1a2428, acc: 0x304448 },
    submarine:  { hull: 0x1e2820, deck: 0x18221a, acc: 0x2a3830 },
    destroyer:  { hull: 0x202030, deck: 0x181828, acc: 0x2e2e44 },
  };

  // ── Per-grid state ────────────────────────────────────────────
  const GS = {
    'enemy-grid': { ships: {}, ocean: null, lines: [] },
    'my-grid':    { ships: {}, ocean: null, lines: [] },
  };

  // ── Renderer (single full-viewport canvas) ────────────────────
  let _R = null, _cam = null, _scene = null, _raf = null;
  let _oceanTime = 0, _oceanMeshes = [];
  let _particles = [], _missiles = [];

  function _initRenderer() {
    if (_R) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'bs3d-canvas';
    document.body.appendChild(canvas);

    _R = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    _R.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _R.setSize(window.innerWidth, window.innerHeight);
    _R.setClearColor(0, 0);
    _R.sortObjects = true;

    _scene = new THREE.Scene();

    // Top-down orthographic camera
    // We'll set frustum in _buildCamera() once we know grid positions
    _cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    _buildLights();
    _startLoop();
    window.addEventListener('resize', _onResize);
  }

  // ── Camera: pure top-down ortho, frustum fits both grids ──────
  // Called after grids are in DOM so we can measure them
  function _buildCamera() {
    const eg = document.getElementById('enemy-grid');
    const mg = document.getElementById('my-grid');
    if (!eg || !mg) return;

    // Union bounding rect of both grids
    const er = eg.getBoundingClientRect();
    const mr = mg.getBoundingClientRect();
    const left   = Math.min(er.left,  mr.left)  - 10;
    const right  = Math.max(er.right, mr.right)  + 10;
    const top    = Math.min(er.top,   mr.top)   - 10;
    const bottom = Math.max(er.bottom,mr.bottom) + 10;

    // Map pixel rect to world space. We define 1 world unit = 1 pixel for simplicity,
    // then centre the camera on the midpoint of the two grids.
    const cx = (left + right)  / 2;
    const cy = (top  + bottom) / 2;
    const hw = (right - left)  / 2;
    const hh = (bottom - top)  / 2;

    _cam.left   = -hw; _cam.right  = hw;
    _cam.top    =  hh; _cam.bottom = -hh;
    _cam.near   = 0.1; _cam.far    = 200;
    _cam.position.set(cx, 100, cy);
    _cam.up.set(0, 0, 1);
    _cam.lookAt(cx, 0, cy);
    _cam.updateProjectionMatrix();

    // Store mapping so we can convert pixel pos → world pos
    _camCX = cx; _camCY = cy;
  }

  let _camCX = 0, _camCY = 0;

  // Convert screen pixel (px, py) to world XZ on Y=0 plane
  // In our 1px=1unit ortho world: world.x = px, world.z = py
  function _px2w(px, py) {
    return new THREE.Vector3(px, 0, py);
  }

  // Centre of a grid cell in world space
  function _cellW(gridId, r, c) {
    const gridEl = document.getElementById(gridId);
    if (!gridEl) return new THREE.Vector3();
    const full = gridEl.getBoundingClientRect();
    const cellW = (full.width  - LABEL_PX) / GRID_N;
    const cellH = (full.height - LABEL_PX) / GRID_N;
    const px = full.left + LABEL_PX + c * cellW + cellW / 2;
    const py = full.top  + LABEL_PX + r * cellH + cellH / 2;
    return _px2w(px, py);
  }

  // Cell size in world units
  function _cellSize(gridId) {
    const gridEl = document.getElementById(gridId);
    if (!gridEl) return { w: 30, h: 30 };
    const full = gridEl.getBoundingClientRect();
    return {
      w: (full.width  - LABEL_PX) / GRID_N,
      h: (full.height - LABEL_PX) / GRID_N,
    };
  }

  function _onResize() {
    if (!_R) return;
    _R.setSize(window.innerWidth, window.innerHeight);
    _buildCamera();
    _rebuildBoth();
  }

  // ── Lights ─────────────────────────────────────────────────────
  function _buildLights() {
    _scene.add(new THREE.AmbientLight(0x334466, 2.2));
    const d = new THREE.DirectionalLight(0xaabbdd, 2.5);
    d.position.set(0, 100, -50);   // slightly from top-front
    _scene.add(d);
    const f = new THREE.PointLight(0x00f5ff, 0.6, 2000);
    f.position.set(0, 80, 0);
    _scene.add(f);
  }

  // ── Render loop ────────────────────────────────────────────────
  function _startLoop() {
    const tick = () => {
      _raf = requestAnimationFrame(tick);
      if (document.hidden || !_R) return;
      _oceanTime += 0.016;
      _shimmerOcean();
      _doParticles();
      _doMissiles();
      _R.render(_scene, _cam);
    };
    _raf = requestAnimationFrame(tick);
  }

  // ── Ocean: flat plane behind each grid, gentle opacity shimmer ─
  function _buildOcean(gridId) {
    const old = GS[gridId].ocean;
    if (old) { _scene.remove(old); _oceanMeshes = _oceanMeshes.filter(o => o !== old); old.geometry.dispose(); }

    const gridEl = document.getElementById(gridId);
    if (!gridEl) return;
    const full = gridEl.getBoundingClientRect();
    const l = full.left + LABEL_PX, t = full.top  + LABEL_PX;
    const r = full.right, b = full.bottom;
    const W = r - l, H = b - t;
    const cx = l + W / 2, cy = t + H / 2;

    // PlaneGeometry in XZ world space (1px=1unit)
    const geo = new THREE.PlaneGeometry(W, H, 1, 1);
    const mat = new THREE.MeshPhongMaterial({
      color: WATER, shininess: 120,
      specular: new THREE.Color(0x0066bb),
      transparent: true, opacity: 0.82,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, -1, cy);   // Y=-1 so ships at Y=0 are above water
    mesh.renderOrder = 0;
    _scene.add(mesh);
    GS[gridId].ocean = mesh;
    _oceanMeshes.push(mesh);
  }

  function _shimmerOcean() {
    const t = _oceanTime;
    for (const m of _oceanMeshes) {
      m.material.opacity = 0.78 + Math.sin(t * 0.55) * 0.04 + Math.sin(t * 1.2) * 0.02;
    }
  }

  // ── Grid lines at Y=1 (above ocean, below ships) ──────────────
  function _buildGridLines(gridId) {
    for (const l of GS[gridId].lines) _scene.remove(l);
    GS[gridId].lines = [];

    const gridEl = document.getElementById(gridId);
    if (!gridEl) return;
    const full = gridEl.getBoundingClientRect();
    const l0 = full.left + LABEL_PX, t0 = full.top + LABEL_PX;
    const cellW = (full.width  - LABEL_PX) / GRID_N;
    const cellH = (full.height - LABEL_PX) / GRID_N;
    const mat = new THREE.LineBasicMaterial({ color: 0x1a4060, transparent: true, opacity: 0.6 });

    for (let i = 0; i <= GRID_N; i++) {
      // Vertical
      const x = l0 + i * cellW;
      const vg = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 1, t0),
        new THREE.Vector3(x, 1, t0 + GRID_N * cellH),
      ]);
      const vl = new THREE.Line(vg, mat);
      vl.renderOrder = 1;
      _scene.add(vl); GS[gridId].lines.push(vl);
      // Horizontal
      const y = t0 + i * cellH;
      const hg = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(l0,                y, y),    // wrong — fix below
        new THREE.Vector3(l0 + GRID_N*cellW, y, y),
      ]);
      // Actually grid lines are in XZ plane: x varies for vertical, z varies for horizontal
      const hg2 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(l0,               1, t0 + i * cellH),
        new THREE.Vector3(l0 + GRID_N*cellW,1, t0 + i * cellH),
      ]);
      const hl = new THREE.Line(hg2, mat);
      hl.renderOrder = 1;
      _scene.add(hl); GS[gridId].lines.push(hl);
    }
  }

  function _rebuildBoth() {
    _buildOcean('enemy-grid'); _buildOcean('my-grid');
    _buildGridLines('enemy-grid'); _buildGridLines('my-grid');
  }

  // ── Ship geometry ─────────────────────────────────────────────
  function _buildShip(key, cells, gridId) {
    const pal = PAL[key] || PAL.destroyer;
    const cs  = _cellSize(gridId);

    const sorted = [...cells].sort((a, b) => a.r === b.r ? a.c - b.c : a.r - b.r);
    const isH    = sorted[0].r === sorted[sorted.length - 1].r;
    const n      = sorted.length;

    // Length along ship axis, width across
    const L  = (isH ? cs.w : cs.h) * n * 0.84;
    const BW = (isH ? cs.h : cs.w) * 0.34;
    const D  = cs.w * 0.12;   // hull height in world units

    const hm = new THREE.MeshPhongMaterial({ color: pal.hull, shininess: 30 });
    const dm = new THREE.MeshPhongMaterial({ color: pal.deck, shininess: 18 });
    const am = new THREE.MeshPhongMaterial({ color: pal.acc,  shininess: 55 });

    const g = new THREE.Group();

    // Hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(L, D, BW), hm);
    hull.position.y = D / 2; g.add(hull);
    // Bow
    const bow = new THREE.Mesh(new THREE.ConeGeometry(BW / 2, BW * 0.7, 6), hm);
    bow.rotation.z = Math.PI / 2; bow.position.set(L/2 + BW*0.3, D/2, 0); g.add(bow);
    // Stern
    const stn = new THREE.Mesh(new THREE.ConeGeometry(BW * 0.3, BW * 0.4, 5), hm);
    stn.rotation.z = -Math.PI / 2; stn.position.set(-L/2 - BW*0.17, D/2, 0); g.add(stn);
    // Deck
    const dk = new THREE.Mesh(new THREE.BoxGeometry(L * 0.86, D * 0.22, BW * 0.68), dm);
    dk.position.y = D + D * 0.11; g.add(dk);

    const SH = D * 1.1;  // superstructure height unit

    switch (key) {
      case 'carrier': {
        const isl = new THREE.Mesh(new THREE.BoxGeometry(L*0.14, SH*2.0, BW*0.22), am);
        isl.position.set(L*0.18, D + SH, -BW*0.18); g.add(isl);
        const mp = new THREE.Mesh(new THREE.CylinderGeometry(D*0.08, D*0.08, SH*1.8, 4), am);
        mp.position.set(L*0.18, D + SH*3, -BW*0.18); g.add(mp);
        break;
      }
      case 'battleship': {
        for (const [xm, dr] of [[0.22, 1], [-0.22, -1]]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(L*0.16, SH*1.1, BW*0.42), am);
          t.position.set(L*xm, D + SH*0.55, 0); g.add(t);
          for (const bz of [-BW*0.06, BW*0.06]) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(D*0.07, D*0.07, L*0.16, 5),
              new THREE.MeshPhongMaterial({ color: 0x445566 }));
            bar.rotation.z = Math.PI/2; bar.position.set(L*(xm+dr*0.09), D+SH*0.7, bz); g.add(bar);
          }
        }
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*0.12, SH*1.6, BW*0.40), am);
        br.position.set(0, D + SH*0.8, 0); g.add(br);
        break;
      }
      case 'cruiser': {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(L*0.13, SH*0.85, BW*0.36), am);
        gun.position.set(L*0.26, D + SH*0.42, 0); g.add(gun);
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*0.15, SH*1.4, BW*0.44), am);
        br.position.set(0, D + SH*0.7, 0); g.add(br);
        break;
      }
      case 'submarine': {
        const sail = new THREE.Mesh(new THREE.BoxGeometry(L*0.12, SH*1.8, BW*0.30), am);
        sail.position.set(0, D + SH*0.9, 0); g.add(sail);
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(D*0.06, D*0.06, SH*2, 5), am);
        sc.position.set(0, D + SH*2.8, 0); g.add(sc);
        break;
      }
      default: { // destroyer
        const br = new THREE.Mesh(new THREE.BoxGeometry(L*0.10, SH*1.3, BW*0.46), am);
        br.position.set(L*0.09, D + SH*0.65, 0); g.add(br);
        const gn = new THREE.Mesh(new THREE.BoxGeometry(L*0.09, SH*0.75, BW*0.30), am);
        gn.position.set(L*0.28, D + SH*0.37, 0); g.add(gn);
      }
    }

    // Ships render above grid lines — renderOrder=2
    g.traverse(o => { if (o.isMesh) o.renderOrder = 2; });

    // Orient: ships run along X by default; vertical = rotate 90° around Y
    if (!isH) g.rotation.y = Math.PI / 2;

    return g;
  }

  // ── Place / remove ────────────────────────────────────────────
  function placeShip(gridId, key, cells, _ori, revealEnemy) {
    if (!THREE || !cells?.length) return;
    if (gridId === 'enemy-grid' && !revealEnemy) return;
    removeShip(gridId, key);

    const sorted = [...cells].sort((a, b) => a.r === b.r ? a.c - b.c : a.r - b.r);
    const r0 = sorted[0].r, c0 = sorted[0].c;
    const rN = sorted[sorted.length-1].r, cN = sorted[sorted.length-1].c;
    const centre = _cellW(gridId, (r0+rN)/2, (c0+cN)/2);

    const grp = _buildShip(key, sorted, gridId);
    grp.position.set(centre.x, 0, centre.z);
    _scene.add(grp);
    GS[gridId].ships[key] = { grp, cells: sorted };
  }

  function removeShip(gridId, key) {
    const d = GS[gridId].ships[key];
    if (!d) return;
    _scene.remove(d.grp); delete GS[gridId].ships[key];
  }

  // ── Particles ─────────────────────────────────────────────────
  class PS {
    constructor(o) {
      this.type=o.type; this.life=o.life||65; this.age=0; this.done=false; this.n=o.count||40;
      const geo=new THREE.BufferGeometry();
      const pos=new Float32Array(this.n*3), col=new Float32Array(this.n*3);
      this._v=[]; this._a=new Float32Array(this.n); this._ma=new Float32Array(this.n);
      const or=o.origin||new THREE.Vector3();
      for(let i=0;i<this.n;i++){
        pos[i*3]=or.x+(Math.random()-.5)*4; pos[i*3+1]=or.y; pos[i*3+2]=or.z+(Math.random()-.5)*4;
        const sp=(o.speed||1.5)*(0.5+Math.random());
        const ang=Math.random()*Math.PI*2, el=o.type==='splash'?.8+Math.random()*.5:.1+Math.random()*.4;
        this._v.push(new THREE.Vector3(Math.cos(ang)*Math.cos(el)*sp, Math.sin(el)*sp*(o.type==='fire'?2:1), Math.sin(ang)*Math.cos(el)*sp));
        this._a[i]=-(Math.random()*(o.stagger||0)); this._ma[i]=20+Math.random()*28;
        const c=this._col(i/this.n); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
      }
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));
      this.pts=new THREE.Points(geo,new THREE.PointsMaterial({size:o.size||3,vertexColors:true,transparent:true,opacity:.88,depthWrite:false,blending:o.type==='smoke'?THREE.NormalBlending:THREE.AdditiveBlending}));
      this.pts.renderOrder=3;
      this._g=o.type==='splash'?-.12:0;
      _scene.add(this.pts);
    }
    _col(t){
      if(this.type==='fire') return t<.3?new THREE.Color(1,.97,.6):t<.6?new THREE.Color(1,.4,.03):new THREE.Color(.8,.07,0);
      if(this.type==='smoke'){const g=.28+t*.42;return new THREE.Color(g,g,g+.04);}
      if(this.type==='splash') return new THREE.Color(.08,.5+Math.random()*.35,1);
      if(this.type==='explosion') return t<.2?new THREE.Color(1,1,.94):t<.5?new THREE.Color(1,.46,.04):new THREE.Color(.58,.07,0);
      return new THREE.Color(1,1,1);
    }
    tick(){
      if(this.done)return;
      const pa=this.pts.geometry.attributes.position; let dead=true;
      for(let i=0;i<this.n;i++){
        this._a[i]++;
        if(this._a[i]<0||this._a[i]>this._ma[i])continue;
        dead=false; const v=this._v[i]; v.y+=this._g;
        const ix=i*3; pa.array[ix]+=v.x; pa.array[ix+1]+=v.y; pa.array[ix+2]+=v.z;
      }
      pa.needsUpdate=true; this.age++;
      this.pts.material.opacity=Math.max(0,.88*(1-this.age/this.life));
      if(dead||this.age>this.life){_scene.remove(this.pts);this.pts.geometry.dispose();this.pts.material.dispose();this.done=true;}
    }
  }
  function _ps(origin,type,opts){_particles.push(new PS({type,origin,...opts}));}
  function _doParticles(){for(let i=_particles.length-1;i>=0;i--){_particles[i].tick();if(_particles[i].done)_particles.splice(i,1);}}

  // ── Missiles ──────────────────────────────────────────────────
  function _cbez(p0,p1,p2,p3,t){const m=1-t;return new THREE.Vector3(m*m*m*p0.x+3*m*m*t*p1.x+3*m*t*t*p2.x+t*t*t*p3.x,m*m*m*p0.y+3*m*m*t*p1.y+3*m*t*t*p2.y+t*t*t*p3.y,m*m*m*p0.z+3*m*m*t*p1.z+3*m*t*t*p2.z+t*t*t*p3.z);}
  function _mkMissile(isEnemy){
    const g=new THREE.Group();
    const bc=isEnemy?0xcc2010:0x00b8d4,fc=isEnemy?0x881008:0x006888;
    const body=new THREE.Mesh(new THREE.CylinderGeometry(3,3,22,8),new THREE.MeshPhongMaterial({color:bc,shininess:80}));
    g.add(body);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(3,8,8),new THREE.MeshPhongMaterial({color:0xcccccc,shininess:120}));
    nose.position.y=15; g.add(nose);
    const fv=new Float32Array([0,-11,0,0,-3,0,7,-11,0]);
    const fg=new THREE.BufferGeometry(); fg.setAttribute('position',new THREE.BufferAttribute(fv,3));
    const fm=new THREE.MeshPhongMaterial({color:fc,side:THREE.DoubleSide});
    for(let a=0;a<4;a++){const f=new THREE.Mesh(fg,fm);f.rotation.y=(a/4)*Math.PI*2;g.add(f);}
    g.traverse(o=>{if(o.isMesh)o.renderOrder=4;});
    _scene.add(g); return g;
  }
  function _doMissiles(){
    for(let i=_missiles.length-1;i>=0;i--){
      const m=_missiles[i]; m.t+=m.dt;
      if(m.t>=1){_scene.remove(m.mesh);_missiles.splice(i,1);m.onLand();continue;}
      const p=_cbez(m.p0,m.p1,m.p2,m.p3,m.t),pn=_cbez(m.p0,m.p1,m.p2,m.p3,Math.min(1,m.t+.012));
      m.mesh.position.copy(p);
      const dir=pn.clone().sub(p);if(dir.lengthSq()>1e-6)m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
      if(Math.random()<.4)_ps(p.clone(),'smoke',{count:2,speed:.5,size:2,life:14});
    }
  }

  // ── Hit / miss / sink ─────────────────────────────────────────
  function animateHit(cellEl, isSunk) {
    if(!THREE||!cellEl)return;
    const r=parseInt(cellEl.dataset.r),c=parseInt(cellEl.dataset.c);
    if(isNaN(r)||isNaN(c))return;
    const gid=cellEl.closest('#enemy-grid')?'enemy-grid':'my-grid';
    const wp=_cellW(gid,r,c); wp.y=2;
    _ps(wp.clone(),'explosion',{count:isSunk?70:35,speed:2.5,size:4,life:46});
    _ps(wp.clone(),'fire',{count:isSunk?50:22,speed:1.2,size:3.5,life:isSunk?40:100});
    _ps(wp.clone().setY(8),'smoke',{count:isSunk?60:28,speed:.8,size:5,life:isSunk?72:130});
    const fl=new THREE.PointLight(0xff6600,8,200); fl.position.copy(wp).setY(40); _scene.add(fl);
    let fa=0;const ff=()=>{fa++;fl.intensity=Math.max(0,8*(1-fa/16));if(fa<16)requestAnimationFrame(ff);else _scene.remove(fl);};
    requestAnimationFrame(ff);
    if(isSunk){
      const key=_atCell(gid,r,c);
      if(key)setTimeout(()=>animateSink(gid,key,GS[gid].ships[key]?.cells||[{r,c}]),260);
    }
  }

  function animateMiss(cellEl){
    if(!THREE||!cellEl)return;
    const r=parseInt(cellEl.dataset.r),c=parseInt(cellEl.dataset.c);
    if(isNaN(r)||isNaN(c))return;
    const gid=cellEl.closest('#enemy-grid')?'enemy-grid':'my-grid';
    const wp=_cellW(gid,r,c); wp.y=2;
    _ps(wp.clone(),'splash',{count:25,speed:2.2,size:3,life:34});
    const rg=new THREE.RingGeometry(2,5,32);
    const rm=new THREE.MeshBasicMaterial({color:0x0099ff,side:THREE.DoubleSide,transparent:true,opacity:.6});
    const rng=new THREE.Mesh(rg,rm); rng.rotation.x=-Math.PI/2; rng.position.copy(wp).setY(1); rng.renderOrder=3;
    _scene.add(rng);
    let ra=0;const gr=()=>{ra++;const sv=1+ra*.12;rng.scale.set(sv,sv,1);rm.opacity=Math.max(0,.6*(1-ra/28));if(ra<28)requestAnimationFrame(gr);else{_scene.remove(rng);rg.dispose();rm.dispose();}};
    requestAnimationFrame(gr);
  }

  function animateSink(gridId,key,cellArr){
    if(!THREE)return;
    if(gridId==='enemy-grid'&&!GS[gridId].ships[key]){
      const st=window.bsState||window.state;
      const cells=cellArr||(st?.npcShips?.[key])||(st?.enemyPlacedShips?.[key]);
      if(cells?.length){placeShip(gridId,key,cells,'H',true);}
    }
    const d=GS[gridId].ships[key]; if(!d)return;
    const {grp}=d; let age=0; const tot=145;
    const lp=()=>{
      age++; const t=age/tot, e=t*t;
      grp.rotation.z=e*(Math.PI/2.1); grp.position.y=-e*60;
      grp.traverse(o=>{if(!o.isMesh||!o.material)return;if(!o.material.transparent){o.material=o.material.clone();o.material.transparent=true;}o.material.opacity=Math.max(0,1-e*1.5);});
      if(age%7===0){const p=grp.position.clone().setY(5);_ps(p,'smoke',{count:5,speed:.7,size:4,life:25});if(age<tot*.55)_ps(p.clone().setY(2),'splash',{count:3,speed:.9,size:2.5,life:16});}
      if(age<tot)requestAnimationFrame(lp);
      else{_scene.remove(grp);delete GS[gridId].ships[key];}
    };
    requestAnimationFrame(lp);
  }

  function launch3DMissile(gridId,r,c,isEnemy,onLand){
    if(!THREE){setTimeout(onLand,400);return;}
    const tgt=_cellW(gridId,r,c); tgt.y=2;
    const mesh=_mkMissile(isEnemy);
    const p0=isEnemy ? new THREE.Vector3(tgt.x+(Math.random()-.5)*300,500,tgt.z+(Math.random()-.5)*200)
                     : new THREE.Vector3(tgt.x+(Math.random()-.5)*150,450,tgt.z+250);
    const p3=tgt.clone();
    const mid=p0.clone().lerp(p3,.5); const pk=mid.clone(); pk.y=Math.max(p0.y,p3.y)+200;
    const p1=p0.clone().lerp(pk,.55), p2=p3.clone().lerp(pk,.45);
    const dur=Math.max(52,Math.min(105,p0.distanceTo(p3)*.35));
    _missiles.push({mesh,p0,p1,p2,p3,t:0,dt:1/dur,isEnemy,onLand});
  }

  function _atCell(gid,r,c){
    for(const[k,d] of Object.entries(GS[gid].ships))
      if(d.cells?.some(x=>x.r===r&&x.c===c))return k;
    return null;
  }

  // ── Redraw ships ──────────────────────────────────────────────
  function redrawAllShipOverlays(){
    const st=window.bsState||window.state; if(!st)return;
    for(const[key,cells] of Object.entries(st.placedShips||{})){
      if(!cells?.length)continue;
      if(st.sunkMyShips?.has(key))continue;
      const ori=(cells[1]&&cells[0].r===cells[1].r)?'H':'V';
      placeShip('my-grid',key,cells,ori,true);
    }
    const npc=st.npcShips||{};
    for(const key of (st.sunkEnemyShips||new Set())){
      const cells=npc[key]||st.enemyPlacedShips?.[key];
      if(!cells?.length)continue;
      const ori=(cells[1]&&cells[0].r===cells[1].r)?'H':'V';
      placeShip('enemy-grid',key,cells,ori,true);
    }
  }

  // ── Init ──────────────────────────────────────────────────────
  function initScenes(){
    if(!THREE){onReady(initScenes);return;}
    for(const gid of ['enemy-grid','my-grid']){
      for(const[,d] of Object.entries(GS[gid].ships)) _scene?.remove(d.grp);
      GS[gid].ships={};
    }
    _initRenderer();
    function tryBuild(){
      const hasCell=document.querySelector('#enemy-grid [data-r="0"][data-c="0"]');
      if(!hasCell){setTimeout(tryBuild,150);return;}
      _buildCamera();
      _rebuildBoth();
      setTimeout(redrawAllShipOverlays,500);
    }
    tryBuild();
  }

  // ── Watch & install ───────────────────────────────────────────
  function _watch(){
    const gs=document.getElementById('game-screen');
    if(!gs){setTimeout(_watch,300);return;}
    new MutationObserver(()=>{
      if(gs.classList.contains('active'))setTimeout(initScenes,60);
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
