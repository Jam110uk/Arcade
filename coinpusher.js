// ============================================================
//  COIN PUSHER 3D  —  British beach arcade coin pusher
//  Requires in repo root: three_module_min.js + cannon-es_min.js
//  No CDN needed — all local files.
// ============================================================

export default (() => {

  // ── DOM / renderer ────────────────────────────────────────────
  let wrap, renderer, scene, camera, clock, animId;
  let aimArrow, ghostCoin;
  let destroyed = false;
  let THREE = null, CANNON = null;

  // ── Game state ─────────────────────────────────────────────────
  let balance  = 100;   // pence  (£1.00)
  let winnings = 0;
  let aimFrac  = 0.5;   // 0..1 across machine width

  // ── Machine dimensions (Three.js units) ───────────────────────
  const MW         = 7.0;    // machine width
  const MD         = 3.5;    // machine depth
  const MH         = 9.5;    // machine total height
  const WT         = 0.15;   // wall thickness
  const SHELF_D    = MD - WT * 2 - 0.1;   // upper shelf depth (back half)
  const LOWER_D    = MD - WT * 2 - 0.1;   // lower shelf depth — full machine depth

  // Derived shelf layout — computed once, shared across physics/visuals/seed/animate
  const UPPER_SHELF_D = SHELF_D * 0.55;
  const UPPER_SHELF_Z = -MD/2 + UPPER_SHELF_D/2 + WT;
  const LOWER_SHELF_D = LOWER_D;
  const LOWER_SHELF_Z = -MD/2 + LOWER_SHELF_D/2 + WT;
  const TRAY_DEPTH    = MD * 0.55;
  const TRAY_FRONT_Z  = LOWER_SHELF_Z + LOWER_SHELF_D/2 + WT;
  const TRAY_Z        = TRAY_FRONT_Z + TRAY_DEPTH/2 + WT/2;
  // Pusher geometry: full shelf depth + overhang past back wall so no gap ever
  // The pusher's BACK EDGE is always at/behind the back wall.
  // Only the front edge moves — from back-of-shelf to front-lip.
  const PUSHER_OVERHANG = 0.5;   // how far pusher extends behind the back wall
  const U_PUSH_FULLD  = UPPER_SHELF_D + PUSHER_OVERHANG;   // total pusher depth
  const U_PUSH_BACK   = UPPER_SHELF_Z - UPPER_SHELF_D/2 - PUSHER_OVERHANG/2; // resting Z (back)
  const U_PUSH_FRONT  = UPPER_SHELF_Z + UPPER_SHELF_D/2 - U_PUSH_FULLD/2 - 0.08; // fwd limit
  const L_PUSH_FULLD  = LOWER_SHELF_D + PUSHER_OVERHANG;
  const L_PUSH_BACK   = LOWER_SHELF_Z - LOWER_SHELF_D/2 - PUSHER_OVERHANG/2;
  const L_PUSH_FRONT  = LOWER_SHELF_Z + LOWER_SHELF_D/2 - L_PUSH_FULLD/2 - 0.08;
  // Keep old names as aliases for physics shape half-depths
  const U_PUSH_HD     = U_PUSH_FULLD / 2;
  const L_PUSH_HD     = L_PUSH_FULLD / 2;

  // Vertical layout (Y from machine bottom = 0)
  const TRAY_FLOOR  = 0.08;
  const LOWER_TOP   = 1.30;
  const UPPER_TOP   = 4.20;
  const SHELF_THICK = 0.22;
  const CHUTE_BOT   = UPPER_TOP + SHELF_THICK + 0.08;
  const CHUTE_TOP   = MH - 0.4;

  // Coin geometry
  const CR = 0.26;    // radius
  const CT = 0.06;    // thickness (height of cylinder)

  // Peg positions [x fraction of MW, y fraction of chute height]
  const PEG_DEFS = [
    [-0.28, 0.22], [ 0.00, 0.16], [ 0.28, 0.22],
    [-0.14, 0.42], [ 0.14, 0.38],
    [-0.30, 0.60], [ 0.00, 0.65], [ 0.30, 0.58],
  ];

  // Bonus items
  const BONUSES = [
    { emoji:'⭐', value:10,  label:'+10p', col:0xffdd00 },
    { emoji:'🍀', value:20,  label:'+20p', col:0x00cc44 },
    { emoji:'💎', value:50,  label:'+50p', col:0x44aaff },
    { emoji:'🎰', value:100, label:'+£1!', col:0xff4488 },
    { emoji:'🌈', value:30,  label:'+30p', col:0xff88ff },
    { emoji:'🍭', value:5,   label:'+5p',  col:0xff8844 },
    { emoji:'🎁', value:25,  label:'+25p', col:0xff4444 },
    { emoji:'🦄', value:40,  label:'+40p', col:0xcc44ff },
  ];

  // ── Physics world ──────────────────────────────────────────────
  let world;
  const coinBodies  = [];   // { body, mesh, type, value, label, col, shelf }
  const pegBodies   = [];
  let upperPusherBody, lowerPusherBody;
  let upperPusherMesh, lowerPusherMesh;
  let upperPusherDir = 1, lowerPusherDir = -1;
  const PUSH_SPEED   = 1.5;  // units/sec
  const PUSH_H       = 0.55; // pusher plate height — tall enough to contact coins lying flat

  let fallingBody    = null;
  let fallingMesh    = null;
  let dropLocked     = false;
  let bonusTimer     = 5;
  const popups       = [];   // DOM floaters

  // ── Shared materials (created after THREE loads) ──────────────
  let coinMat, pusherMat, shelfMat, cabinetMat, chromeMat,
      trayMat, glassMat, neonMat, pegMat;

  // ── Audio ──────────────────────────────────────────────────────
  let aCtx;
  function getAC() {
    if (!aCtx) aCtx = new (window.AudioContext || window.webkitAudioContext)();
    return aCtx;
  }
  function beep(freq, dur, vol=0.07, delay=0, type='sine') {
    try {
      const a=getAC(), o=a.createOscillator(), g=a.createGain(),
            f=a.createBiquadFilter();
      f.type='lowpass'; f.frequency.value=Math.min(freq*2.5,2200); f.Q.value=0.4;
      o.connect(f); f.connect(g); g.connect(a.destination);
      o.type=type; o.frequency.setValueAtTime(freq, a.currentTime+delay);
      g.gain.setValueAtTime(0, a.currentTime+delay);
      g.gain.linearRampToValueAtTime(vol, a.currentTime+delay+0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime+delay+dur);
      o.start(a.currentTime+delay); o.stop(a.currentTime+delay+dur+0.05);
    } catch(e){}
  }
  function sndClink() { beep(650+Math.random()*300,0.07,0.07,0,'triangle'); }
  function sndLand()  { beep(480,0.10,0.08); beep(320,0.09,0.06,0.06); }
  function sndWin(v)  {
    const f=v>=50?784:v>=20?659:523;
    beep(f,0.15,0.09); beep(f*1.25,0.12,0.07,0.10);
    if(v>=50) beep(f*1.5,0.10,0.06,0.20);
  }
  function sndBonus() { beep(1047,0.10,0.08);beep(1319,0.09,0.07,0.09);beep(1568,0.08,0.06,0.18); }
  function sndDrop()  { beep(880,0.05,0.06); }

  // ── Module loader (handles both ES modules and UMD/global scripts) ───────
  function loadScript(src) {
    // Legacy UMD fallback — only used for CANNON which sets window.CANNON
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = () => rej(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function loadESModule(src) {
    const base = document.baseURI || location.href;
    const url = src.startsWith('http') ? src : new URL(src, base).href;
    return await import(/* webpackIgnore: true */ url);
  }

  async function loadTHREE() {
    // Try common path variations before falling back to CDN
    const paths = [
      './three_module_min.js',
      '/Arcade/three_module_min.js',
      `${location.origin}/Arcade/three_module_min.js`,
    ];
    for (const p of paths) {
      try {
        const mod = await loadESModule(p);
        if (mod && mod.WebGLRenderer) {
          console.log('[coinpusher3d] THREE loaded from', p);
          return mod;
        }
      } catch(e) {}
    }
    const CDN = 'https://unpkg.com/three@0.128.0/build/three.module.js';
    console.log('[coinpusher3d] Loading THREE from CDN');
    return await loadESModule(CDN);
  }

  async function loadCANNON() {
    const paths = [
      './cannon-es_min.js',
      '/Arcade/cannon-es_min.js',
      `${location.origin}/Arcade/cannon-es_min.js`,
    ];
    for (const p of paths) {
      try {
        const mod = await loadESModule(p);
        if (mod && mod.World) {
          console.log('[coinpusher3d] CANNON loaded from', p);
          return mod;
        }
      } catch(e) {}
    }
    const CDN = 'https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js';
    console.log('[coinpusher3d] Loading CANNON from CDN');
    return await loadESModule(CDN);
  }

  // ── Build physics world ────────────────────────────────────────
  function buildPhysics() {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
    world.allowSleep = true;

    const defaultMat = new CANNON.Material('default');
    const contact = new CANNON.ContactMaterial(defaultMat, defaultMat, {
      friction: 0.30, restitution: 0.08
    });
    world.addContactMaterial(contact);
    world.defaultContactMaterial = contact;

    // Static walls
    addStaticBox(MW + WT*2, MH, WT,   0, MH/2, -MD/2+WT/2);          // back
    addStaticBox(WT, MH, MD,  -MW/2-WT/2, MH/2, 0);                   // left
    addStaticBox(WT, MH, MD,   MW/2+WT/2, MH/2, 0);                   // right
    addStaticBox(MW, WT, MD,   0, 0, 0);                               // floor

    // Upper shelf — sits at back half of machine
    addStaticBox(MW, SHELF_THICK, UPPER_SHELF_D, 0, UPPER_TOP+SHELF_THICK/2, UPPER_SHELF_Z);
    // Front lip on upper shelf
    addStaticBox(MW, 0.25, WT, 0, UPPER_TOP+0.12, UPPER_SHELF_Z + UPPER_SHELF_D/2 + WT/2);

    // Lower shelf — extends much further forward so upper coins land on it
    addStaticBox(MW, SHELF_THICK, LOWER_SHELF_D, 0, LOWER_TOP+SHELF_THICK/2, LOWER_SHELF_Z);
    // Front lip on lower shelf (short — coins push over it into tray)
    addStaticBox(MW, 0.20, WT, 0, LOWER_TOP+0.10, LOWER_SHELF_Z + LOWER_SHELF_D/2 + WT/2);

    // Win tray — sits just in front of lower shelf front lip
    addStaticBox(MW, 0.1,  TRAY_DEPTH, 0, TRAY_FLOOR+0.05, TRAY_Z);
    addStaticBox(MW, 0.85, WT,        0, TRAY_FLOOR+0.42, TRAY_Z + TRAY_DEPTH/2 + WT/2);

    // Pegs — full width grid across back wall chute area
    const chuteH = CHUTE_TOP - CHUTE_BOT;
    const pegRowsP = [0.15, 0.30, 0.47, 0.62, 0.78];
    const pegColsP = [-0.42, -0.26, -0.10, 0.10, 0.26, 0.42];
    pegRowsP.forEach((yf, ri) => {
      pegColsP.forEach(xf => {
        const xOff = (ri % 2 === 0) ? 0 : (MW * 0.085);
        const body = new CANNON.Body({ mass:0 });
        body.addShape(new CANNON.Cylinder(0.08, 0.08, MD*0.09, 10));
        body.position.set(xf * MW + xOff, CHUTE_BOT + yf * chuteH, -MD/2 + WT + MD*0.045);
        body.quaternion.setFromEuler(Math.PI/2, 0, 0);
        world.addBody(body);
        pegBodies.push(body);
      });
    });

    // Pusher positions tracked in JS — no Cannon body needed (kinematic bodies
    // don't generate collision responses with dynamic bodies in Cannon-ES).
    // We track front-face Z directly and push coins manually each frame.
    upperPusherBody = { position: { z: U_PUSH_BACK } };
    lowerPusherBody = { position: { z: L_PUSH_BACK } };
  }

  function addStaticBox(w,h,d,x,y,z) {
    const body = new CANNON.Body({ mass:0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)));
    body.position.set(x,y,z);
    world.addBody(body);
    return body;
  }

  // ── Build Three.js scene ───────────────────────────────────────
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080315);
    scene.fog = new THREE.FogExp2(0x080315, 0.038);

    clock = new THREE.Clock();

    // Camera — orbit controlled, initial position
    const aspect = wrap.clientWidth / wrap.clientHeight;
    camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 80);
    updateCamera();  // sets position from camTheta/camPhi/camDist

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    wrap.appendChild(renderer.domElement);

    // ── Materials ───────────────────────────────────────────────
    chromeMat  = new THREE.MeshStandardMaterial({ color:0x99aabb, metalness:0.95, roughness:0.10 });
    cabinetMat = new THREE.MeshStandardMaterial({ color:0x180840, metalness:0.05, roughness:0.85 });
    shelfMat   = new THREE.MeshStandardMaterial({ color:0x2a1058, metalness:0.15, roughness:0.70 });
    glassMat   = new THREE.MeshStandardMaterial({ color:0x8899cc, transparent:true, opacity:0.07,
                   metalness:0.05, roughness:0.0, side:THREE.DoubleSide });
    pusherMat  = new THREE.MeshStandardMaterial({ color:0xddccff, metalness:0.65, roughness:0.28,
                   transparent:true, opacity:0.80 });
    trayMat    = new THREE.MeshStandardMaterial({ color:0x3a1878, metalness:0.12, roughness:0.75 });
    neonMat    = new THREE.MeshStandardMaterial({ color:0xcc88ff, emissive:0xaa44ff,
                   emissiveIntensity:1.4, roughness:0.5 });
    pegMat     = new THREE.MeshStandardMaterial({ color:0xf0c040, metalness:0.92, roughness:0.18 });

    // Coin material with canvas texture
    const coinTex = makeCoinTexture();
    coinMat = new THREE.MeshStandardMaterial({
      map: coinTex, color:0xc07818, metalness:0.90, roughness:0.20
    });

    // ── Lighting ────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x221044, 0.9));

    const sun = new THREE.DirectionalLight(0xfff0dd, 1.1);
    sun.position.set(3, 14, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-7; sun.shadow.camera.right=7;
    sun.shadow.camera.top=11; sun.shadow.camera.bottom=-2;
    scene.add(sun);

    // Warm tube lights inside cabinet ceiling
    [ [-2.5, 0], [0, 0], [2.5, 0] ].forEach(([x,z], i) => {
      const c = [0xffe0a0, 0xe8d0ff, 0xa8d8ff][i];
      const pl = new THREE.PointLight(c, 1.6, 9);
      pl.position.set(x, MH * 0.80, z);
      scene.add(pl);
    });

    // Shelf accent lights
    const uLight = new THREE.PointLight(0xc080ff, 1.1, 5.5);
    uLight.position.set(0, UPPER_TOP + 1.2, MD * 0.35);
    scene.add(uLight);
    const lLight = new THREE.PointLight(0x8844ff, 0.9, 4.5);
    lLight.position.set(0, LOWER_TOP + 0.8, MD * 0.35);
    scene.add(lLight);

    // ── Cabinet geometry ────────────────────────────────────────
    const addMesh = (geo, mat, x,y,z, castShadow=true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x,y,z);
      m.castShadow = castShadow;
      m.receiveShadow = true;
      scene.add(m); return m;
    };

    // Walls
    addMesh(new THREE.BoxGeometry(MW+WT*2, MH, WT),   cabinetMat, 0, MH/2, -MD/2);
    addMesh(new THREE.BoxGeometry(WT, MH, MD),        cabinetMat, -MW/2-WT/2, MH/2, 0);
    addMesh(new THREE.BoxGeometry(WT, MH, MD),        cabinetMat,  MW/2+WT/2, MH/2, 0);
    addMesh(new THREE.BoxGeometry(MW+WT*2, WT, MD+WT*2), chromeMat, 0, MH, 0, false);
    addMesh(new THREE.BoxGeometry(MW+WT*2, WT, MD+WT*2), chromeMat, 0, 0,  0, false);

    // Chrome corner strips
    [-1,1].forEach(sx => {
      addMesh(new THREE.BoxGeometry(0.07,MH,0.07), chromeMat, sx*(MW/2+WT*0.5), MH/2, MD/2);
    });

    // Neon trim strips along top
    [-0.35,0,0.35].forEach(fx => {
      addMesh(new THREE.BoxGeometry(MW*0.22,0.07,0.07), neonMat, fx*MW, MH+0.07, MD/2-0.06, false);
    });

    // Front glass panel
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(MW, CHUTE_TOP - LOWER_TOP), glassMat);
    glass.position.set(0, LOWER_TOP + (CHUTE_TOP-LOWER_TOP)/2, MD/2);
    scene.add(glass);

    // ── Shelves ─────────────────────────────────────────────────

    // Upper shelf — shorter, sits at back
    addMesh(new THREE.BoxGeometry(MW, SHELF_THICK, UPPER_SHELF_D), shelfMat,
            0, UPPER_TOP + SHELF_THICK/2, UPPER_SHELF_Z);
    addMesh(new THREE.BoxGeometry(MW, 0.25, 0.10), chromeMat,
            0, UPPER_TOP + 0.12, UPPER_SHELF_Z + UPPER_SHELF_D/2 + 0.05);

    // Lower shelf — full machine depth, extends far forward so coins from upper shelf land here
    addMesh(new THREE.BoxGeometry(MW, SHELF_THICK, LOWER_SHELF_D), shelfMat,
            0, LOWER_TOP + SHELF_THICK/2, LOWER_SHELF_Z);
    addMesh(new THREE.BoxGeometry(MW, 0.20, 0.10), chromeMat,
            0, LOWER_TOP + 0.10, LOWER_SHELF_Z + LOWER_SHELF_D/2 + 0.05);

    // Win tray — sits just in front of lower shelf front lip
    addMesh(new THREE.BoxGeometry(MW, 0.10, TRAY_DEPTH), trayMat, 0, TRAY_FLOOR+0.05, TRAY_Z, false);
    addMesh(new THREE.BoxGeometry(MW, 0.85, 0.10),       trayMat, 0, TRAY_FLOOR+0.42, TRAY_Z + TRAY_DEPTH/2 + 0.05, false);

    // Tray label
    const trayLabel = makeTextSprite('WIN TRAY', 0.55);
    trayLabel.position.set(0, TRAY_FLOOR + 0.50, TRAY_Z + TRAY_DEPTH/2 + 0.12);
    scene.add(trayLabel);

    // ── Pegs — short studs on back wall ─────────────────────────
    const PEG_LEN = MD * 0.09;   // 1/10th of original length — short studs
    const pegGeo = new THREE.CylinderGeometry(0.08, 0.08, PEG_LEN, 12);
    pegGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI/2));
    const chuteH = CHUTE_TOP - CHUTE_BOT;
    // Back wall inner face is at -MD/2 + WT. Peg sticks out from it into the chute.
    const pegZ = -MD/2 + WT + PEG_LEN/2;
    const pegRows = [0.15, 0.30, 0.47, 0.62, 0.78];
    const pegCols = [-0.42, -0.26, -0.10, 0.10, 0.26, 0.42];
    pegRows.forEach((yf, ri) => {
      pegCols.forEach(xf => {
        const xOff = (ri % 2 === 0) ? 0 : (MW * 0.085);
        const m = new THREE.Mesh(pegGeo, pegMat);
        m.position.set(xf * MW + xOff, CHUTE_BOT + yf * chuteH, pegZ);
        m.castShadow = true;
        scene.add(m);
      });
    });

    // ── Pusher plates — full shelf depth + overhang, no back gap ─
    const upperPushGeo = new THREE.BoxGeometry(MW, PUSH_H, U_PUSH_FULLD);
    upperPusherMesh = new THREE.Mesh(upperPushGeo, pusherMat);
    scene.add(upperPusherMesh);

    const lowerPushGeo = new THREE.BoxGeometry(MW, PUSH_H, L_PUSH_FULLD);
    lowerPusherMesh = new THREE.Mesh(lowerPushGeo, pusherMat);
    scene.add(lowerPusherMesh);

    // ── Seed coins ───────────────────────────────────────────────
    seedCoins();
  }

  // ── Coin texture ───────────────────────────────────────────────
  function makeCoinTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    // Bronze radial gradient
    const g = x.createRadialGradient(size*0.38,size*0.35,size*0.06, size/2,size/2,size*0.5);
    g.addColorStop(0, '#f2c860');
    g.addColorStop(0.5,'#c48218');
    g.addColorStop(1, '#7a4a08');
    x.beginPath(); x.arc(size/2,size/2,size*0.48,0,Math.PI*2);
    x.fillStyle = g; x.fill();
    // Rim
    x.beginPath(); x.arc(size/2,size/2,size*0.44,0,Math.PI*2);
    x.strokeStyle='rgba(255,200,80,0.55)'; x.lineWidth=4; x.stroke();
    // Inner ring
    x.beginPath(); x.arc(size/2,size/2,size*0.30,0,Math.PI*2);
    x.strokeStyle='rgba(160,100,20,0.45)'; x.lineWidth=3; x.stroke();
    // Shine
    x.beginPath(); x.ellipse(size*0.35,size*0.34,size*0.13,size*0.08,-0.4,0,Math.PI*2);
    x.fillStyle='rgba(255,240,160,0.5)'; x.fill();
    // "2p" text
    x.font=`bold ${size*0.26}px Arial`;
    x.fillStyle='rgba(255,255,220,0.88)';
    x.textAlign='center'; x.textBaseline='middle';
    x.strokeStyle='rgba(60,30,0,0.55)'; x.lineWidth=3;
    x.strokeText('2p',size/2,size/2); x.fillText('2p',size/2,size/2);
    return new THREE.CanvasTexture(c);
  }

  // ── Emoji sprite texture ───────────────────────────────────────
  function makeEmojiTexture(emoji) {
    const s = 96;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.font = `${s*0.75}px serif`;
    x.textAlign='center'; x.textBaseline='middle';
    x.fillText(emoji, s/2, s/2);
    return new THREE.CanvasTexture(c);
  }

  // ── Text sprite ────────────────────────────────────────────────
  function makeTextSprite(text, scale=1) {
    const c = document.createElement('canvas');
    c.width=256; c.height=64;
    const x = c.getContext('2d');
    x.font='bold 28px Orbitron, monospace';
    x.fillStyle='rgba(180,120,255,0.5)';
    x.textAlign='center'; x.textBaseline='middle';
    x.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map:tex, transparent:true });
    const sp  = new THREE.Sprite(mat);
    sp.scale.set(scale*2, scale*0.5, 1);
    return sp;
  }

  // ── Spawn a coin body + mesh (shelf coins — lying flat, axis Y) ──
  const coinGeo = () => new THREE.CylinderGeometry(CR, CR, CT, 22);

  function spawnCoin(x, y, z, shelf='upper') {
    const mesh = new THREE.Mesh(coinGeo(), coinMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    // Small random tilt so shelf coins don't stack perfectly
    mesh.rotation.x = (Math.random()-0.5)*0.3;
    mesh.rotation.z = (Math.random()-0.5)*0.3;
    scene.add(mesh);

    const body = new CANNON.Body({ mass:0.18, linearDamping:0.55, angularDamping:0.72 });
    // Cylinder axis = Y by default → coin lies flat on shelf
    body.addShape(new CANNON.Cylinder(CR, CR, CT, 12));
    body.position.set(x, y, z);
    body.velocity.set(0, 0, 0);  // start still — caller can set velocity if needed
    world.addBody(body);

    const obj = { mesh, body, type:'coin', value:2, shelf };
    coinBodies.push(obj);
    return obj;
  }

  // ── Spawn a bonus item — 3D token with emoji face, full physics ──
  const BONUS_W = 0.52;   // token width/height
  const BONUS_D = 0.14;   // token depth (thin slab)
  function spawnBonus(x, y, z, bonusIdx) {
    const b = bonusIdx !== undefined
      ? BONUSES[bonusIdx % BONUSES.length]
      : BONUSES[Math.floor(Math.random()*BONUSES.length)];

    // Face texture — emoji on coloured background
    const faceSize = 256;
    const fc = document.createElement('canvas');
    fc.width = fc.height = faceSize;
    const ctx = fc.getContext('2d');
    // Rounded-rect coloured background
    ctx.fillStyle = '#' + b.col.toString(16).padStart(6,'0');
    ctx.beginPath();
    ctx.roundRect(8, 8, faceSize-16, faceSize-16, 28);
    ctx.fill();
    // White border
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 10;
    ctx.stroke();
    // Emoji
    ctx.font = `${faceSize * 0.52}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.emoji, faceSize/2, faceSize/2);
    const faceTex = new THREE.CanvasTexture(fc);

    // Side texture — label text
    const sc = document.createElement('canvas');
    sc.width = 256; sc.height = 64;
    const sx = sc.getContext('2d');
    sx.fillStyle = '#' + b.col.toString(16).padStart(6,'0');
    sx.fillRect(0,0,256,64);
    sx.fillStyle = '#fff';
    sx.font = 'bold 28px Arial';
    sx.textAlign = 'center';
    sx.textBaseline = 'middle';
    sx.fillText(b.label, 128, 32);
    const sideTex = new THREE.CanvasTexture(sc);

    // 6-face material: front/back = emoji, sides = label colour
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness:0.4, metalness:0.3 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness:0.3, metalness:0.2 });
    const mats = [ sideMat, sideMat, sideMat, sideMat, faceMat, faceMat ];

    const geo  = new THREE.BoxGeometry(BONUS_W, BONUS_W, BONUS_D);
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Dynamic sleeping body — wakes when hit
    const body = new CANNON.Body({ mass: 0.25, linearDamping: 0.60, angularDamping: 0.80 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(BONUS_W/2, BONUS_W/2, BONUS_D/2)));
    body.position.set(x, y, z);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.15;
    body.sleepTimeLimit  = 0.25;
    body.sleep();
    world.addBody(body);
    const obj = { mesh, body, type:'bonus', value:b.value, label:b.label,
                  emoji:b.emoji, col:b.col, shelf:'upper' };
    coinBodies.push(obj);
    return obj;
  }

  // ── Seed shelves ───────────────────────────────────────────────
  // Coins sit on the shelf surface near the FRONT of each shelf.
  // The pusher starts at the BACK and only reaches them once enough
  // player coins have piled up and been pushed forward into them.
  function seedCoins() {
    const hw    = MW/2 - CR * 1.8;
    const stepX = CR * 2.25;
    const stepZ = CR * 2.25;

    // Shelf surface Y (top of shelf slab)
    const uSurfY = UPPER_TOP + SHELF_THICK + CT/2 + 0.003;
    const lSurfY = LOWER_TOP + SHELF_THICK + CT/2 + 0.003;

    // Lip Z (front edge of shelf)
    const uLipZ = UPPER_SHELF_Z + UPPER_SHELF_D/2;
    const lLipZ = LOWER_SHELF_Z + LOWER_SHELF_D/2;

    // Pusher front face at its RESTING (back) position — seed coins go AHEAD of this
    const uPusherRestFront = U_PUSH_BACK + U_PUSH_HD;  // = -0.748
    const lPusherRestFront = L_PUSH_BACK + L_PUSH_HD;  // = -0.050

    // Seed coin Z range: from just ahead of pusher rest front, to just behind lip
    const uZ0 = uPusherRestFront + CR * 2.5;
    const uZ1 = uLipZ - CR * 1.5;
    const lZ0 = lPusherRestFront + CR * 2.5;
    const lZ1 = lLipZ - CR * 1.5;

    const uCols = Math.floor((hw * 2) / stepX);
    const uRows = Math.max(1, Math.floor((uZ1 - uZ0) / stepZ));
    for (let c = 0; c < uCols; c++) {
      for (let r = 0; r < uRows; r++) {
        const x = -hw + CR + c * stepX + (Math.random()-0.5)*CR*0.15;
        const z = uZ0 + r * stepZ      + (Math.random()-0.5)*CR*0.15;
        spawnShelfCoin(x, uSurfY, z, 'upper');
      }
    }
    // Sparse second layer
    for (let c = 0; c < uCols-1; c++) {
      for (let r = 0; r < Math.floor(uRows * 0.4); r++) {
        const x = -hw + CR + c*stepX + stepX*0.5 + (Math.random()-0.5)*CR*0.10;
        const z = uZ0  + r*stepZ                 + (Math.random()-0.5)*CR*0.10;
        spawnShelfCoin(x, uSurfY + CT*1.05, z, 'upper');
      }
    }

    const lCols = Math.floor((hw * 2) / stepX);
    const lRows = Math.max(1, Math.floor((lZ1 - lZ0) / stepZ));
    for (let c = 0; c < lCols; c++) {
      for (let r = 0; r < lRows; r++) {
        const x = -hw + CR + c * stepX + (Math.random()-0.5)*CR*0.15;
        const z = lZ0 + r * stepZ      + (Math.random()-0.5)*CR*0.15;
        spawnShelfCoin(x, lSurfY, z, 'lower');
      }
    }
    for (let c = 0; c < lCols-1; c++) {
      for (let r = 0; r < Math.floor(lRows * 0.4); r++) {
        const x = -hw + CR + c*stepX + stepX*0.5 + (Math.random()-0.5)*CR*0.10;
        const z = lZ0  + r*stepZ                 + (Math.random()-0.5)*CR*0.10;
        spawnShelfCoin(x, lSurfY + CT*1.05, z, 'lower');
      }
    }

    // Bonus tokens near front of each shelf
    const uBY = uSurfY + BONUS_W*0.5 + 0.01;
    const lBY = lSurfY + BONUS_W*0.5 + 0.01;
    const b0 = spawnBonus(-MW*0.28, uBY, uZ0+(uZ1-uZ0)*0.30, 0); b0.shelf='upper';
    const b1 = spawnBonus( MW*0.28, uBY, uZ0+(uZ1-uZ0)*0.70, 1); b1.shelf='upper';
    const b2 = spawnBonus(-MW*0.22, lBY, lZ0+(lZ1-lZ0)*0.25, 2); b2.shelf='lower';
    const b3 = spawnBonus( MW*0.22, lBY, lZ0+(lZ1-lZ0)*0.55, 3); b3.shelf='lower';
    const b4 = spawnBonus( 0,       lBY, lZ0+(lZ1-lZ0)*0.80, 4); b4.shelf='lower';
  }

  // Static coin sitting on shelf surface — sleeps immediately, wakes when hit
  function spawnShelfCoin(x, y, z, shelf) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(CR, CR, CT, 16), coinMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    scene.add(mesh);

    const body = new CANNON.Body({ mass: 0.18, linearDamping: 0.55, angularDamping: 0.75 });
    body.addShape(new CANNON.Cylinder(CR, CR, CT, 12));
    body.position.set(x, y, z);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.15;
    body.sleepTimeLimit  = 0.25;
    body.sleep();
    world.addBody(body);

    coinBodies.push({ mesh, body, type:'coin', value:2, shelf });
    return coinBodies[coinBodies.length-1];
  }

  // ── Drop a coin from the chute ─────────────────────────────────
  function dropCoin() {
    if (dropLocked || balance < 2 || !world) return;
    try { getAC().resume(); } catch(e){}
    balance -= 2;
    sndDrop();
    dropLocked = true;
    setTimeout(() => { dropLocked = false; }, 700);

    const dropX = (aimFrac - 0.5) * MW * 0.86;
    const dropZ = -MD/2 + WT + MD * 0.18;  // inside chute, clear of pegs

    // Spawn exactly like a shelf coin (lying flat) — simplest possible approach
    const obj = spawnCoin(dropX, CHUTE_TOP, dropZ, 'falling');
    // Override velocity: fall downward fast
    obj.body.velocity.set((Math.random()-0.5)*0.3, -3.0, 0);
    obj.body.angularVelocity.set((Math.random()-0.5)*4, 0, (Math.random()-0.5)*4);
    obj.body.linearDamping  = 0.35;
    obj.body.angularDamping = 0.55;

    fallingBody = obj.body;
    fallingMesh = obj.mesh;
  }

  // ── Collect a coin/bonus that fell into tray ───────────────────
  function collectItem(obj) {
    balance  += obj.value;
    winnings += obj.value;
    if (obj.type==='bonus') sndBonus(); else sndWin(obj.value);
    showPopup(
      obj.type==='bonus' ? `${obj.emoji} ${obj.label}` : `+2p`,
      obj.type==='bonus' ? obj.col : 0x00ff88
    );
  }

  // ── DOM popup floater ──────────────────────────────────────────
  function showPopup(text, col) {
    const hex = '#' + col.toString(16).padStart(6,'0');
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      position:absolute;pointer-events:none;z-index:100;
      font-family:'Orbitron',sans-serif;font-size:clamp(12px,2.5vw,18px);
      font-weight:bold;color:${hex};text-shadow:0 0 8px ${hex};
      left:50%;transform:translateX(-50%);bottom:10%;white-space:nowrap;
      animation:cp3popup 1.6s ease-out forwards;
    `;
    wrap.appendChild(el);
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 1700);
  }

  // ── HUD ────────────────────────────────────────────────────────
  let hudBalEl, hudCoinsEl, hudWinEl;

  function buildHUD() {
    const style = document.createElement('style');
    style.textContent = `
      .cp3-hud{position:absolute;top:0;left:0;right:0;display:flex;
        justify-content:space-between;align-items:stretch;
        padding:5px 14px;background:rgba(6,2,18,0.90);
        border-bottom:1px solid rgba(160,90,240,0.3);
        font-family:'Share Tech Mono',monospace;pointer-events:none;gap:10px;z-index:10;}
      .cp3-stat{display:flex;flex-direction:column;justify-content:center;min-width:80px}
      .cp3-lbl{font-size:clamp(0.4rem,1vw,0.58rem);letter-spacing:0.18em;
        color:rgba(160,110,240,0.55);margin-bottom:2px}
      .cp3-val{font-family:'Orbitron',sans-serif;font-size:clamp(0.7rem,2vw,1rem);
        font-weight:bold;letter-spacing:0.08em}
      @keyframes cp3popup{0%{opacity:1;transform:translateX(-50%) translateY(0)}
        100%{opacity:0;transform:translateX(-50%) translateY(-65px)}}
    `;
    wrap.appendChild(style);

    const hud = document.createElement('div');
    hud.className = 'cp3-hud';
    hud.innerHTML = `
      <div class="cp3-stat">
        <div class="cp3-lbl">BALANCE</div>
        <div class="cp3-val" id="cp3-bal" style="color:#00ff88">£1.00</div>
      </div>
      <div class="cp3-stat" style="text-align:center">
        <div class="cp3-lbl">COINS LEFT</div>
        <div class="cp3-val" id="cp3-coins" style="color:#00e5ff">50 × 2p</div>
      </div>
      <div class="cp3-stat" style="text-align:right">
        <div class="cp3-lbl">WINNINGS</div>
        <div class="cp3-val" id="cp3-win" style="color:#ffdd00">£0.00</div>
      </div>`;
    wrap.appendChild(hud);

    hudBalEl   = wrap.querySelector('#cp3-bal');
    hudCoinsEl = wrap.querySelector('#cp3-coins');
    hudWinEl   = wrap.querySelector('#cp3-win');
  }

  function updateHUD() {
    if (hudBalEl) {
      hudBalEl.textContent = `£${(balance/100).toFixed(2)}`;
      hudBalEl.style.color = balance < 20 ? '#ff5555' : '#00ff88';
    }
    if (hudCoinsEl) hudCoinsEl.textContent = `${Math.floor(balance/2)} × 2p`;
    if (hudWinEl)   hudWinEl.textContent   = `£${(winnings/100).toFixed(2)}`;
  }

  // ── Ghost coin drop indicator ──────────────────────────────────
  function buildAimArrow() {
    const geo = new THREE.CylinderGeometry(CR, CR, CT, 22);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.45, metalness: 0.3, roughness: 0.4
    });
    ghostCoin = new THREE.Mesh(geo, mat);
    // Lay flat like a real coin
    ghostCoin.rotation.x = Math.PI / 2;
    scene.add(ghostCoin);
    // Reuse aimArrow variable so existing code doesn't break
    aimArrow = ghostCoin;
  }

  // ── Main loop ──────────────────────────────────────────────────
  let gamePaused = false;
  function animate() {
    if (destroyed) return;
    animId = requestAnimationFrame(animate);
    if (document.hidden || gamePaused) return;

    const dt = Math.min(clock.getDelta(), 0.05);

    // Move pusher plates
    const uDeltaZ = PUSH_SPEED * upperPusherDir * dt;
    upperPusherBody.position.z += uDeltaZ;
    if (upperPusherBody.position.z > U_PUSH_FRONT) { upperPusherBody.position.z = U_PUSH_FRONT; upperPusherDir=-1; }
    if (upperPusherBody.position.z < U_PUSH_BACK)  { upperPusherBody.position.z = U_PUSH_BACK;  upperPusherDir= 1; }
    upperPusherMesh.position.z = upperPusherBody.position.z;
    upperPusherMesh.position.y = UPPER_TOP + PUSH_H/2;

    const lDeltaZ = PUSH_SPEED * lowerPusherDir * dt * 0.82;
    lowerPusherBody.position.z += lDeltaZ;
    if (lowerPusherBody.position.z > L_PUSH_FRONT) { lowerPusherBody.position.z = L_PUSH_FRONT; lowerPusherDir=-1; }
    if (lowerPusherBody.position.z < L_PUSH_BACK)  { lowerPusherBody.position.z = L_PUSH_BACK;  lowerPusherDir= 1; }
    lowerPusherMesh.position.z = lowerPusherBody.position.z;
    lowerPusherMesh.position.y = LOWER_TOP + PUSH_H/2;

    // Manually push any coin the pusher front face is overlapping
    rideWithPusher(uDeltaZ, lDeltaZ);

    // Step physics (coins now have corrected positions/velocities from above)
    world.step(1/60, dt, 3);

    // Sync meshes → bodies
    coinBodies.forEach(obj => {
      obj.mesh.position.copy(obj.body.position);
      obj.mesh.quaternion.copy(obj.body.quaternion);
    });

    // Check fallen coins
    checkFallen();

    // Bonus spawn
    bonusTimer -= dt;
    if (bonusTimer <= 0) {
      bonusTimer = 8 + Math.random()*10;
      spawnBonus(
        (Math.random()-0.5)*(MW-1.0),
        UPPER_TOP + SHELF_THICK + 0.55,
        (Math.random()-0.5)*(SHELF_D-0.8)
      );
    }

    // Ghost coin — matches exact drop position and orientation
    if (aimArrow) {
      const ax = (aimFrac - 0.5) * MW * 0.86;
      const dropZ = -MD/2 + WT + MD * 0.18;
      aimArrow.position.set(ax, CHUTE_TOP + 0.1, dropZ);
      if (!aimArrow._offsetSet) { aimArrow.rotation.x = 0; aimArrow._offsetSet = true; }
      aimArrow.visible = !dropLocked && balance >= 2;
      if (aimArrow.material) {
        aimArrow.material.opacity = 0.35 + 0.2 * Math.sin(clock.elapsedTime * 4);
      }
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  // ── Manual pusher collision ────────────────────────────────────
  // Since Cannon kinematic bodies don't push dynamic ones, we do it ourselves.
  // Each frame, for every coin whose back edge (z - CR) is behind the pusher
  // front face, we push it forward so it no longer overlaps, and wake it.
  function applyPusherToCoin(obj, pusherFrontZ, pusherTopY, pusherBotY, deltaZ) {
    const p  = obj.body.position;
    // Only coins on this shelf level (within pusher height band)
    if (p.y > pusherTopY + CR || p.y < pusherBotY - CR) return;
    // Only when pusher is moving forward
    if (deltaZ <= 0) return;
    // Coin back edge overlaps pusher front face?
    const coinBack = p.z - CR;
    const penetration = pusherFrontZ - coinBack;
    if (penetration <= 0) return;
    // Resolve: push coin forward by penetration + tiny separation
    obj.body.position.z += penetration + 0.001;
    // Give it the pusher's velocity so it doesn't just snap
    if (obj.body.velocity.z < deltaZ * 55) obj.body.velocity.z = deltaZ * 55;
    // Wake sleeping coins
    if (obj.body.sleepState === CANNON.Body.SLEEPING) obj.body.wakeUp();
  }

  function rideWithPusher(uDeltaZ, lDeltaZ) {
    const uFrontZ  = upperPusherBody.position.z + U_PUSH_HD;
    const uTopY    = UPPER_TOP + PUSH_H;
    const uBotY    = UPPER_TOP;
    const lFrontZ  = lowerPusherBody.position.z + L_PUSH_HD;
    const lTopY    = LOWER_TOP + PUSH_H;
    const lBotY    = LOWER_TOP;

    coinBodies.forEach(obj => {
      applyPusherToCoin(obj, uFrontZ, uTopY, uBotY, uDeltaZ);
      applyPusherToCoin(obj, lFrontZ, lTopY, lBotY, lDeltaZ);
    });
  }

  // ── Check coins that have fallen off shelves ───────────────────
  function checkFallen() {
    const toRemove = [];

    coinBodies.forEach((obj, i) => {
      const py  = obj.body.position.y;
      const vy  = obj.body.velocity.y;

      // Coin landed from chute onto upper shelf
      if (obj.shelf === 'falling' && py < UPPER_TOP + PUSH_H + CT + 0.4) {
        obj.shelf = 'upper';
        if (fallingBody === obj.body) { fallingBody=null; fallingMesh=null; }
        sndLand();
        return;
      }

      // Fell off upper shelf → move to lower shelf area
      if (obj.shelf === 'upper' && py < UPPER_TOP - 0.5) {
        obj.body.position.y = LOWER_TOP + SHELF_THICK + CT/2 + 0.4;
        obj.body.velocity.set(obj.body.velocity.x*0.4, -1, obj.body.velocity.z*0.4);
        obj.shelf = 'lower';
        sndClink();
        return;
      }

      // Fell off lower shelf → WIN
      if (obj.shelf === 'lower' && py < LOWER_TOP - 0.4) {
        collectItem(obj);
        toRemove.push(i);
        return;
      }

      // Fell into tray → WIN
      if (obj.shelf === 'lower' && py < TRAY_FLOOR + 0.3 && py > TRAY_FLOOR - 0.1) {
        obj.shelf = 'tray';
      }
      if (obj.shelf === 'tray' && py < TRAY_FLOOR - 0.2) {
        collectItem(obj);
        toRemove.push(i);
        return;
      }

      // Escaped machine — just remove
      if (py < -2 || Math.abs(obj.body.position.x) > MW) toRemove.push(i);
    });

    toRemove.slice().reverse().forEach(i => {
      const obj = coinBodies[i];
      scene.remove(obj.mesh);
      world.removeBody(obj.body);
      // material can be a single material or an array (bonus tokens use array)
      if (obj.mesh.material && obj.mesh.material !== coinMat) {
        if (Array.isArray(obj.mesh.material)) {
          obj.mesh.material.forEach(m => m && m.dispose && m.dispose());
        } else {
          obj.mesh.material.dispose();
        }
      }
      coinBodies.splice(i, 1);
    });
  }

  // ── Camera orbit state ─────────────────────────────────────────
  let camTheta = 0;          // horizontal angle (radians)
  let camPhi   = 0.38;       // vertical angle (radians, 0=side, Pi/2=top)
  let camDist  = MD * 3.2;   // distance from target
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragTheta = 0, dragPhi = 0;
  const CAM_TARGET_Y = MH * 0.38;
  const CAM_PHI_MIN  = 0.15;   // ~8° from straight down — looking steeply down from above
  const CAM_PHI_MAX  = 1.45;   // ~83° — nearly side-on but never below the machine
  const CAM_DIST_MIN = 4;
  const CAM_DIST_MAX = 22;

  function updateCamera() {
    if (!camera) return;
    const x = camDist * Math.sin(camPhi) * Math.sin(camTheta);
    const y = CAM_TARGET_Y + camDist * Math.cos(camPhi);
    const z = camDist * Math.sin(camPhi) * Math.cos(camTheta);
    camera.position.set(x, y, z);
    camera.lookAt(0, CAM_TARGET_Y, 0);
  }

  // ── Input ──────────────────────────────────────────────────────
  function getAim(clientX) {
    const r = wrap.getBoundingClientRect();
    aimFrac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }

  function onMouseDown(e) {
    if (e.button === 2 || e.button === 1) {
      // Right/middle drag = orbit
      isDragging = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      dragTheta = camTheta; dragPhi = camPhi;
      e.preventDefault();
    }
  }
  function onMouseMove(e) {
    if (isDragging) {
      const dx = (e.clientX - dragStartX) / wrap.clientWidth;
      const dy = (e.clientY - dragStartY) / wrap.clientHeight;
      camTheta = dragTheta - dx * Math.PI * 2;
      camPhi   = Math.max(CAM_PHI_MIN, Math.min(CAM_PHI_MAX, dragPhi - dy * Math.PI));
      updateCamera();
    } else {
      getAim(e.clientX);
    }
  }
  function onMouseUp(e) { if (e.button === 2 || e.button === 1) isDragging = false; }
  function onContextMenu(e) { e.preventDefault(); }
  function onWheel(e) {
    e.preventDefault();
    camDist = Math.max(CAM_DIST_MIN, Math.min(CAM_DIST_MAX, camDist + e.deltaY * 0.02));
    updateCamera();
  }
  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) getAim(e.touches[0].clientX);
  }
  function onClick(e) {
    if (isDragging) return;
    try{getAC().resume();}catch(ex){}
    dropCoin();
  }
  function onKey(e) {
    if (e.code==='Space'||e.code==='Enter') { e.preventDefault(); try{getAC().resume();}catch(ex){} dropCoin(); }
    if (e.code==='ArrowLeft')  aimFrac = Math.max(0, aimFrac-0.04);
    if (e.code==='ArrowRight') aimFrac = Math.min(1, aimFrac+0.04);
  }
  function onVisibilityChange() {
    // Pause physics when tab hidden or window blurred — handled in animate() via document.hidden
    // Also reset clock so dt doesn't spike on resume
    if (document.hidden && clock) clock.getDelta();
  }
  function onBlur() {
    // Window lost focus — stop clock accumulation
    if (clock) clock.getDelta();
  }

  // ── Resize ─────────────────────────────────────────────────────
  function onResize() {
    if (!renderer||!camera||!wrap) return;
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  }

  // ── Build DOM shell ────────────────────────────────────────────
  function buildHTML(el) {
    el.innerHTML = `
      <style>
        #cp3-root{width:100%;height:100%;display:flex;flex-direction:column;
          background:#080315;user-select:none;}
        #cp3-topbar{display:flex;align-items:center;justify-content:space-between;
          padding:5px 12px;border-bottom:1px solid rgba(160,90,240,0.25);
          flex-shrink:0;gap:8px;font-family:'Share Tech Mono',monospace;}
        #cp3-title{font-family:'Orbitron',sans-serif;font-size:clamp(0.6rem,2vw,1rem);
          color:#c084fc;letter-spacing:0.2em;text-shadow:0 0 10px rgba(192,132,252,0.6);}
        #cp3-hint{font-size:clamp(0.44rem,1vw,0.62rem);color:rgba(160,90,240,0.45);
          letter-spacing:0.07em;}
        #cp3-wrap{flex:1;min-height:0;position:relative;cursor:crosshair;
          touch-action:none;overflow:hidden;}
        .cp3-btn{padding:3px 10px;background:transparent;
          border:1px solid rgba(160,90,240,0.35);color:rgba(180,110,255,0.8);
          font-family:'Share Tech Mono',monospace;font-size:clamp(0.46rem,1.1vw,0.65rem);
          letter-spacing:0.1em;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
        .cp3-btn:hover{background:rgba(160,90,240,0.1);border-color:#c084fc;color:#c084fc;}
        #cp3-loading{position:absolute;inset:0;display:flex;align-items:center;
          justify-content:center;flex-direction:column;gap:12px;
          background:#080315;z-index:50;}
        #cp3-loading-title{font-family:'Orbitron',sans-serif;color:#c084fc;
          font-size:clamp(0.8rem,2vw,1.2rem);letter-spacing:0.2em;}
        #cp3-loading-bar-wrap{width:200px;height:6px;background:rgba(160,90,240,0.2);
          border-radius:3px;overflow:hidden;}
        #cp3-loading-bar{height:100%;width:0%;background:#c084fc;
          border-radius:3px;transition:width 0.3s;}
        #cp3-loading-msg{font-family:'Share Tech Mono',monospace;color:rgba(160,90,240,0.6);
          font-size:clamp(0.5rem,1vw,0.65rem);letter-spacing:0.1em;}
      </style>
      <div id="cp3-root">
        <div id="cp3-topbar">
          <div id="cp3-title">🪙 COIN PUSHER 3D</div>
          <div id="cp3-hint">CLICK TO DROP · RIGHT-DRAG ORBIT · SCROLL ZOOM</div>
          <div style="display:flex;gap:6px">
            <button class="cp3-btn" id="cp3-new">▶ NEW GAME</button>
            <button class="arcade-back-btn" id="cp3-back">🕹 ARCADE</button>
          </div>
        </div>
        <div id="cp3-wrap">
          <div id="cp3-loading">
            <div id="cp3-loading-title">COIN PUSHER 3D</div>
            <div id="cp3-loading-bar-wrap"><div id="cp3-loading-bar"></div></div>
            <div id="cp3-loading-msg">LOADING 3D ENGINE...</div>
          </div>
        </div>
      </div>`;

    wrap = el.querySelector('#cp3-wrap');
    el.querySelector('#cp3-new').addEventListener('click', restartGame);
    el.querySelector('#cp3-back').addEventListener('click', () => { destroy(); window.backToGameSelect?.(); });
    wrap.addEventListener('mousemove',   onMouseMove);
    wrap.addEventListener('mousedown',   onMouseDown);
    wrap.addEventListener('mouseup',     onMouseUp);
    wrap.addEventListener('click',       onClick);
    wrap.addEventListener('contextmenu', onContextMenu);
    wrap.addEventListener('wheel',       onWheel, { passive:false });
    wrap.addEventListener('touchmove',   onTouchMove, { passive:false });
    wrap.addEventListener('touchstart', e => { e.preventDefault(); onClick(); }, { passive:false });
    window.addEventListener('keydown',          onKey);
    window.addEventListener('resize',           onResize);
    window.addEventListener('blur',             onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  function setLoadingProgress(pct, msg) {
    const bar = document.getElementById('cp3-loading-bar');
    const txt = document.getElementById('cp3-loading-msg');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = msg;
  }

  function hideLoading() {
    const el = document.getElementById('cp3-loading');
    if (el) el.style.display = 'none';
  }

  // ── Restart ────────────────────────────────────────────────────
  function restartGame() {
    balance=100; winnings=0; aimFrac=0.5;
    bonusTimer=5; dropLocked=false;
    fallingBody=null; fallingMesh=null;
    // Clear all coin bodies/meshes
    coinBodies.forEach(obj => {
      scene.remove(obj.mesh);
      world.removeBody(obj.body);
    });
    coinBodies.length = 0;
    upperPusherDir=1; lowerPusherDir=-1;
    upperPusherBody.position.z = U_PUSH_BACK;
    lowerPusherBody.position.z = L_PUSH_BACK;
    seedCoins();
    updateHUD();
  }

  // ── Init ───────────────────────────────────────────────────────
  async function init() {
    const el = document.getElementById('coinpusher-screen');
    if (!el) { console.warn('[coinpusher3d] screen not found'); return; }
    destroyed = false;
    buildHTML(el);

    try {
      setLoadingProgress(10, 'LOADING THREE.JS...');
      THREE = await loadTHREE();
      if (!THREE || !THREE.WebGLRenderer) throw new Error('THREE.WebGLRenderer still not found after CDN fallback');

      setLoadingProgress(55, 'LOADING PHYSICS...');
      CANNON = await loadCANNON();
      if (!CANNON || !CANNON.World) throw new Error('CANNON.World still not found after CDN fallback');

      setLoadingProgress(80, 'BUILDING SCENE...');
      buildPhysics();
      buildScene();
      buildHUD();
      buildAimArrow();

      setLoadingProgress(100, 'READY!');
      setTimeout(() => {
        hideLoading();
        animate();
      }, 300);

    } catch(e) {
      console.error('[coinpusher3d]', e);
      const loadEl = document.getElementById('cp3-loading');
      if (loadEl) {
        loadEl.innerHTML = `
          <div style="color:#ff4444;font-family:monospace;padding:20px;text-align:center;line-height:1.8">
            Failed to load 3D engine.<br>
            <span style="font-size:0.8em;color:rgba(255,100,100,0.7)">
              ${e.message}<br><br>
              Make sure <b>three_module_min.js</b> and <b>cannon-es_min.js</b><br>
              are in your repo root.
            </span>
          </div>`;
      }
    }
  }

  // ── Destroy ────────────────────────────────────────────────────
  function destroy() {
    destroyed = true;
    if (animId) { cancelAnimationFrame(animId); animId=null; }
    if (aCtx) { try { aCtx.close(); } catch(e){} aCtx=null; }
    window.removeEventListener('keydown',           onKey);
    window.removeEventListener('resize',            onResize);
    window.removeEventListener('blur',              onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (renderer) { renderer.dispose(); renderer=null; }
    const el = document.getElementById('coinpusher-screen');
    if (el) el.innerHTML='';
    coinBodies.length=0;
  }

  return { init, destroy };
})();
