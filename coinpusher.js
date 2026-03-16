// ============================================================
//  COIN PUSHER 3D  —  British beach arcade coin pusher
//  Requires in repo root: three_core_min.js + cannon-es_min.js
//  No CDN needed — all local files.
// ============================================================

export default (() => {

  // ── DOM / renderer ────────────────────────────────────────────
  let wrap, renderer, scene, camera, clock, animId;
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
  const SHELF_D    = MD - WT * 2 - 0.1;

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

  async function loadThree(src) {
    // three_core_min.js is an ES module — use dynamic import()
    // Resolve relative to the page URL so it works on GitHub Pages
    const base = document.baseURI || location.href;
    const url = new URL(src, base).href;
    const mod = await import(/* webpackIgnore: true */ url);
    // The module exports everything as named exports; wrap into a THREE namespace
    return mod;
  }

  // ── Build physics world ────────────────────────────────────────
  function buildPhysics() {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 14;

    const defaultMat = new CANNON.Material('default');
    const contact = new CANNON.ContactMaterial(defaultMat, defaultMat, {
      friction: 0.45, restitution: 0.25
    });
    world.addContactMaterial(contact);
    world.defaultContactMaterial = contact;

    // Static walls
    addStaticBox(MW + WT*2, MH, WT,   0, MH/2, -MD/2+WT/2);          // back
    addStaticBox(WT, MH, MD,  -MW/2-WT/2, MH/2, 0);                   // left
    addStaticBox(WT, MH, MD,   MW/2+WT/2, MH/2, 0);                   // right
    addStaticBox(MW, WT, MD,   0, 0, 0);                               // floor
    // Shelf surfaces
    addStaticBox(MW, SHELF_THICK, SHELF_D, 0, UPPER_TOP+SHELF_THICK/2, 0);
    addStaticBox(MW, SHELF_THICK, SHELF_D, 0, LOWER_TOP+SHELF_THICK/2, 0);
    // Tray floor
    addStaticBox(MW, 0.1, SHELF_D, 0, TRAY_FLOOR+0.05, 0);
    // Front lips (stop coins falling straight off front)
    addStaticBox(MW, 0.25, WT,  0, UPPER_TOP+0.12,  SHELF_D/2+WT/2);
    addStaticBox(MW, 0.25, WT,  0, LOWER_TOP+0.12,  SHELF_D/2+WT/2);

    // Pegs (static cylinders in chute)
    const chuteH = CHUTE_TOP - CHUTE_BOT;
    PEG_DEFS.forEach(([xf, yf]) => {
      const body = new CANNON.Body({ mass:0 });
      body.addShape(new CANNON.Cylinder(0.08, 0.08, 0.18, 10));
      body.position.set(xf * MW * 0.44, CHUTE_BOT + yf * chuteH, 0);
      world.addBody(body);
      pegBodies.push(body);
    });

    // Kinematic pusher plates
    const pShape = new CANNON.Box(new CANNON.Vec3(MW/2, PUSH_H/2, SHELF_D/2));

    upperPusherBody = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC });
    upperPusherBody.addShape(pShape);
    upperPusherBody.position.set(0, UPPER_TOP + PUSH_H/2, 0);
    world.addBody(upperPusherBody);

    lowerPusherBody = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC });
    lowerPusherBody.addShape(pShape);
    lowerPusherBody.position.set(0, LOWER_TOP + PUSH_H/2, SHELF_D * 0.15);
    world.addBody(lowerPusherBody);
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

    // Camera — eye-level looking down into machine
    const aspect = wrap.clientWidth / wrap.clientHeight;
    camera = new THREE.PerspectiveCamera(44, aspect, 0.1, 80);
    camera.position.set(0, MH * 0.54, MD * 2.35);
    camera.lookAt(0, MH * 0.40, 0);

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
    // Upper shelf
    addMesh(new THREE.BoxGeometry(MW, SHELF_THICK, SHELF_D), shelfMat,
            0, UPPER_TOP + SHELF_THICK/2, 0);
    addMesh(new THREE.BoxGeometry(MW, 0.25, 0.10), chromeMat,
            0, UPPER_TOP + 0.12, SHELF_D/2 + 0.05);

    // Lower shelf
    addMesh(new THREE.BoxGeometry(MW, SHELF_THICK, SHELF_D), shelfMat,
            0, LOWER_TOP + SHELF_THICK/2, 0);
    addMesh(new THREE.BoxGeometry(MW, 0.25, 0.10), chromeMat,
            0, LOWER_TOP + 0.12, SHELF_D/2 + 0.05);

    // Win tray
    addMesh(new THREE.BoxGeometry(MW, 0.10, SHELF_D), trayMat, 0, TRAY_FLOOR+0.05, 0, false);
    addMesh(new THREE.BoxGeometry(MW, 0.85, 0.10),    trayMat, 0, TRAY_FLOOR+0.42, SHELF_D/2+0.05, false);

    // Tray label
    const trayLabel = makeTextSprite('WIN TRAY', 0.55);
    trayLabel.position.set(0, TRAY_FLOOR + 0.50, SHELF_D/2 + 0.12);
    scene.add(trayLabel);

    // ── Pegs ────────────────────────────────────────────────────
    const pegGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.18, 12);
    const chuteH = CHUTE_TOP - CHUTE_BOT;
    PEG_DEFS.forEach(([xf, yf]) => {
      const m = new THREE.Mesh(pegGeo, pegMat);
      m.position.set(xf * MW * 0.44, CHUTE_BOT + yf * chuteH, 0);
      m.castShadow = true;
      scene.add(m);
    });

    // ── Pusher plates ────────────────────────────────────────────
    const pushGeo = new THREE.BoxGeometry(MW, PUSH_H, SHELF_D);
    upperPusherMesh = new THREE.Mesh(pushGeo, pusherMat);
    scene.add(upperPusherMesh);

    lowerPusherMesh = new THREE.Mesh(pushGeo, pusherMat);
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

  // ── Spawn a coin body + mesh ───────────────────────────────────
  const coinGeo = () => new THREE.CylinderGeometry(CR, CR, CT, 22);

  function spawnCoin(x, y, z, shelf='upper') {
    const mesh = new THREE.Mesh(coinGeo(), coinMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.rotation.x = (Math.random()-0.5)*0.35;
    mesh.rotation.z = (Math.random()-0.5)*0.35;
    scene.add(mesh);

    const body = new CANNON.Body({ mass:0.005, linearDamping:0.42, angularDamping:0.65 });
    body.addShape(new CANNON.Cylinder(CR, CR, CT, 12));
    body.position.set(x, y, z);
    body.velocity.set((Math.random()-0.5)*0.4, 0, (Math.random()-0.5)*0.4);
    world.addBody(body);

    const obj = { mesh, body, type:'coin', value:2, shelf };
    coinBodies.push(obj);
    return obj;
  }

  // ── Spawn a bonus item (emoji sprite) ─────────────────────────
  function spawnBonus(x, y, z) {
    const b   = BONUSES[Math.floor(Math.random()*BONUSES.length)];
    const tex = makeEmojiTexture(b.emoji);
    const mat = new THREE.SpriteMaterial({ map:tex, transparent:true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.65, 0.65, 0.65);
    spr.position.set(x, y, z);
    scene.add(spr);

    const body = new CANNON.Body({ mass:0.003, linearDamping:0.55, angularDamping:0.9 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.22, 0.22, 0.06)));
    body.position.set(x, y, z);
    world.addBody(body);

    const obj = { mesh:spr, body, type:'bonus', value:b.value, label:b.label,
                  emoji:b.emoji, col:b.col, shelf:'upper', bobT:Math.random()*Math.PI*2 };
    coinBodies.push(obj);
  }

  // ── Seed shelves with initial coins ───────────────────────────
  function seedCoins() {
    const hw = MW/2 - CR*1.4;
    const hd = SHELF_D/2 - CR*1.4;

    for (let i=0; i<24; i++) {
      const x = (Math.random()*2-1)*hw;
      const z = (Math.random()*2-1)*hd;
      const y = UPPER_TOP + SHELF_THICK + CT/2 + Math.floor(i/8)*CT*0.6 + Math.random()*0.04;
      spawnCoin(x, y, z, 'upper');
    }
    for (let i=0; i<28; i++) {
      const x = (Math.random()*2-1)*hw;
      const z = (Math.random()*2-1)*hd;
      const y = LOWER_TOP + SHELF_THICK + CT/2 + Math.floor(i/9)*CT*0.6 + Math.random()*0.04;
      spawnCoin(x, y, z, 'lower');
    }
    // A few bonus items
    spawnBonus(-MW*0.22, UPPER_TOP+SHELF_THICK+0.45, -SHELF_D*0.1);
    spawnBonus( MW*0.22, UPPER_TOP+SHELF_THICK+0.45,  SHELF_D*0.1);
    spawnBonus( 0,       LOWER_TOP+SHELF_THICK+0.45,  0);
  }

  // ── Drop a coin from the chute ─────────────────────────────────
  function dropCoin() {
    if (dropLocked || balance < 2 || !world) return;
    try { getAC().resume(); } catch(e){}
    balance -= 2;
    sndDrop();
    dropLocked = true;
    setTimeout(() => { dropLocked = false; }, 700);

    const mesh = new THREE.Mesh(coinGeo(), coinMat);
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({ mass:0.005, linearDamping:0.18, angularDamping:0.40 });
    body.addShape(new CANNON.Cylinder(CR, CR, CT, 12));
    const dropX = (aimFrac - 0.5) * MW * 0.86;
    body.position.set(dropX, CHUTE_TOP - 0.4, (Math.random()-0.5)*0.08);
    body.velocity.set((Math.random()-0.5)*0.6, -1.8, 0);
    body.angularVelocity.set((Math.random()-0.5)*4, 0, (Math.random()-0.5)*4);
    world.addBody(body);

    fallingBody = body;
    fallingMesh = mesh;
    const obj = { mesh, body, type:'coin', value:2, shelf:'falling' };
    coinBodies.push(obj);
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

  // ── Aim guide (arrow sprite above chute) ──────────────────────
  let aimArrow;
  function buildAimArrow() {
    const c = document.createElement('canvas');
    c.width=64; c.height=64;
    const x=c.getContext('2d');
    x.fillStyle='rgba(0,240,200,0.85)';
    x.beginPath(); x.moveTo(32,8); x.lineTo(52,32); x.lineTo(36,32);
    x.lineTo(36,56); x.lineTo(28,56); x.lineTo(28,32); x.lineTo(12,32);
    x.closePath(); x.fill();
    const mat = new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), transparent:true });
    aimArrow = new THREE.Sprite(mat);
    aimArrow.scale.set(0.5,0.5,0.5);
    scene.add(aimArrow);
  }

  // ── Main loop ──────────────────────────────────────────────────
  function animate() {
    if (destroyed) return;
    animId = requestAnimationFrame(animate);
    if (document.hidden) return;

    const dt = Math.min(clock.getDelta(), 0.05);

    // Step physics
    world.step(1/60, dt, 3);

    // Sync meshes → bodies
    coinBodies.forEach(obj => {
      obj.mesh.position.copy(obj.body.position);
      if (obj.type === 'coin') {
        obj.mesh.quaternion.copy(obj.body.quaternion);
      } else {
        // Bonus — bob gently
        obj.bobT = (obj.bobT||0) + dt*2.8;
        obj.mesh.position.y = obj.body.position.y + Math.sin(obj.bobT)*0.06;
      }
    });

    // Move pusher plates (kinematic)
    const maxZ =  SHELF_D/2 - 0.10;
    const minZ = -SHELF_D/2 + 0.10;

    upperPusherBody.position.z += PUSH_SPEED * upperPusherDir * dt;
    if (upperPusherBody.position.z > maxZ) { upperPusherBody.position.z = maxZ; upperPusherDir=-1; }
    if (upperPusherBody.position.z < minZ) { upperPusherBody.position.z = minZ; upperPusherDir= 1; }
    upperPusherMesh.position.copy(upperPusherBody.position);
    upperPusherMesh.position.y = UPPER_TOP + PUSH_H/2;

    lowerPusherBody.position.z += PUSH_SPEED * lowerPusherDir * dt * 0.82;
    if (lowerPusherBody.position.z > maxZ) { lowerPusherBody.position.z = maxZ; lowerPusherDir=-1; }
    if (lowerPusherBody.position.z < minZ) { lowerPusherBody.position.z = minZ; lowerPusherDir= 1; }
    lowerPusherMesh.position.copy(lowerPusherBody.position);
    lowerPusherMesh.position.y = LOWER_TOP + PUSH_H/2;

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

    // Aim arrow
    if (aimArrow) {
      const ax = (aimFrac - 0.5) * MW * 0.86;
      aimArrow.position.set(ax, CHUTE_TOP + 0.35, MD*0.48);
      aimArrow.visible = !dropLocked && balance >= 2;
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  // ── Check coins that have fallen off shelves ───────────────────
  function checkFallen() {
    const toRemove = [];

    coinBodies.forEach((obj, i) => {
      const py = obj.body.position.y;

      // Coin landed from chute onto upper shelf
      if (obj.shelf === 'falling' && py < UPPER_TOP + SHELF_THICK + CT + 0.15) {
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
      if (obj.mesh.material && obj.mesh.material !== coinMat) obj.mesh.material.dispose();
      coinBodies.splice(i, 1);
    });
  }

  // ── Input ──────────────────────────────────────────────────────
  function getAim(clientX) {
    const r = wrap.getBoundingClientRect();
    aimFrac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }
  function onMouseMove(e) { getAim(e.clientX); }
  function onTouchMove(e) { e.preventDefault(); if(e.touches[0]) getAim(e.touches[0].clientX); }
  function onClick()      { try{getAC().resume();}catch(e){} dropCoin(); }
  function onKey(e) {
    if (e.code==='Space'||e.code==='Enter') { e.preventDefault(); try{getAC().resume();}catch(ex){} dropCoin(); }
    if (e.code==='ArrowLeft')  aimFrac = Math.max(0, aimFrac-0.04);
    if (e.code==='ArrowRight') aimFrac = Math.min(1, aimFrac+0.04);
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
          <div id="cp3-hint">AIM WITH MOUSE · CLICK / SPACE TO DROP</div>
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
    el.querySelector('#cp3-back').addEventListener('click', () => window.backToGameSelect?.());
    wrap.addEventListener('mousemove', onMouseMove);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('touchmove', onTouchMove, { passive:false });
    wrap.addEventListener('touchstart', e => { e.preventDefault(); onClick(); }, { passive:false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
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
    // Reset pushers
    upperPusherDir=1; lowerPusherDir=-1;
    upperPusherBody.position.set(0, UPPER_TOP+PUSH_H/2, 0);
    lowerPusherBody.position.set(0, LOWER_TOP+PUSH_H/2, SHELF_D*0.15);
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
      // three_core_min.js is an ES module — load via dynamic import()
      THREE = await loadThree('./three_core_min.js');
      if (!THREE || !THREE.WebGLRenderer) throw new Error('THREE.WebGLRenderer not found — check three_core_min.js');

      setLoadingProgress(55, 'LOADING PHYSICS...');
      // cannon-es_min.js is also an ES module — load via dynamic import()
      CANNON = await loadThree('./cannon-es_min.js');
      if (!CANNON || !CANNON.World) throw new Error('CANNON.World not found — check cannon-es_min.js');

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
              Make sure <b>three_core_min.js</b> and <b>cannon-es_min.js</b><br>
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
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    if (renderer) { renderer.dispose(); renderer=null; }
    const el = document.getElementById('coinpusher-screen');
    if (el) el.innerHTML='';
    coinBodies.length=0;
  }

  return { init, destroy };
})();
