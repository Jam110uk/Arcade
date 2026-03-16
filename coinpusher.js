// ============================================================
//  COIN PUSHER 3D  —  British beach arcade coin pusher
//  Three.js r128 + cannon-es physics
//
//  Loads THREE and CANNON from CDN, builds a full 3D scene:
//    - Perspective camera angled down at ~35°
//    - Two shelves with sliding pusher plates (kinematic bodies)
//    - 2p coins as CylinderGeometry with metallic PBR material
//    - Proper coin-on-coin stacking via Cannon rigid bodies
//    - Warm cabinet lighting (neon tubes + point lights)
//    - Bonus emoji items as canvas-texture sprites
//    - Win tray at the bottom
// ============================================================

export default (() => {

  // ── DOM references ────────────────────────────────────────────
  let wrap, renderer, animId, destroyed = false;

  // ── Three.js core ─────────────────────────────────────────────
  let THREE, scene, camera, clock;

  // ── Cannon physics ────────────────────────────────────────────
  let CANNON, world;

  // ── Game state ────────────────────────────────────────────────
  let balance  = 100;   // pence
  let winnings = 0;
  let aimX     = 0;     // -1..+1 across machine width

  // ── Scene objects ─────────────────────────────────────────────
  let upperPusherMesh, lowerPusherMesh;
  let upperPusherBody, lowerPusherBody;
  let upperPusherDir = 1, lowerPusherDir = -1;
  const PUSHER_SPEED = 1.8;   // units/sec

  let fallingCoin = null;     // { mesh, body } currently dropping
  let droppingLocked = false;

  // Coin + bonus pools
  const coins    = [];  // { mesh, body, type, value, label, bonusTimer }
  const popups   = [];  // { el, t }  DOM floaters
  let   bonusSpawnTimer = 5;

  // ── Machine dimensions (Three.js units) ───────────────────────
  const MW  = 6.0;   // machine width
  const MD  = 3.2;   // machine depth
  const MH  = 9.0;   // machine total height
  const WALL_T = 0.18;

  // Shelf layout (Y positions, measured from machine bottom = 0)
  const TRAY_Y       = 0.0;
  const TRAY_H       = 1.0;
  const LOWER_SHELF_Y = TRAY_H + 0.05;        // top of lower shelf surface
  const LOWER_SHELF_H = 0.18;
  const SHELF_DEPTH   = MD - WALL_T*2;        // usable depth
  const UPPER_SHELF_Y = LOWER_SHELF_Y + 2.6;
  const UPPER_SHELF_H = 0.18;
  const CHUTE_BOTTOM  = UPPER_SHELF_Y + UPPER_SHELF_H + 0.05;
  const CHUTE_TOP     = MH - 0.3;

  const COIN_R  = 0.28;
  const COIN_H  = 0.06;

  // Pegs inside the chute
  const PEG_POSITIONS = [
    [-1.8, 0.38], [-0.6, 0.28], [0.6,  0.32], [1.8,  0.40],
    [-1.2, 0.60], [0.0,  0.65], [1.2,  0.58],
    [-1.8, 0.82], [0.0,  0.88], [1.8,  0.80],
  ]; // [x_frac * MW/2, y_frac of chute height]

  // ── Bonus items ────────────────────────────────────────────────
  const BONUSES = [
    { emoji:'⭐', value:10,  label:'+10p', color:'#ffcc00' },
    { emoji:'🍀', value:20,  label:'+20p', color:'#00cc44' },
    { emoji:'💎', value:50,  label:'+50p', color:'#44aaff' },
    { emoji:'🎰', value:100, label:'+£1!', color:'#ff4488' },
    { emoji:'🌈', value:30,  label:'+30p', color:'#ff88ff' },
    { emoji:'🍭', value:5,   label:'+5p',  color:'#ff8844' },
    { emoji:'🎁', value:25,  label:'+25p', color:'#ff4444' },
    { emoji:'🦄', value:40,  label:'+40p', color:'#cc44ff' },
  ];

  // ── Audio ──────────────────────────────────────────────────────
  let aCtx;
  function getAC() {
    if (!aCtx) aCtx = new (window.AudioContext||window.webkitAudioContext)();
    return aCtx;
  }
  function beep(freq,dur,vol=0.07,delay=0,type='sine') {
    try {
      const a=getAC(),o=a.createOscillator(),g=a.createGain(),f=a.createBiquadFilter();
      f.type='lowpass';f.frequency.value=Math.min(freq*2.5,2200);f.Q.value=0.4;
      o.connect(f);f.connect(g);g.connect(a.destination);
      o.type=type;o.frequency.setValueAtTime(freq,a.currentTime+delay);
      g.gain.setValueAtTime(0,a.currentTime+delay);
      g.gain.linearRampToValueAtTime(vol,a.currentTime+delay+0.018);
      g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+delay+dur);
      o.start(a.currentTime+delay);o.stop(a.currentTime+delay+dur+0.05);
    } catch(e){}
  }
  function sndClink()  { beep(700+Math.random()*300,0.07,0.08,0,'triangle'); }
  function sndLand()   { beep(480,0.10,0.08);beep(320,0.09,0.06,0.06); }
  function sndWin(v)   { const f=v>=50?784:v>=20?659:523; beep(f,0.15,0.09);beep(f*1.25,0.12,0.07,0.10);if(v>=50)beep(f*1.5,0.10,0.06,0.20); }
  function sndBonus()  { beep(1047,0.10,0.08);beep(1319,0.09,0.07,0.09);beep(1568,0.08,0.06,0.18); }
  function sndDrop()   { beep(900,0.05,0.06); }

  // ── Load scripts from CDN ──────────────────────────────────────
  function loadScript(url) {
    return new Promise((res,rej) => {
      if (document.querySelector(`script[src="${url}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = url;
      s.onload = res;
      s.onerror = () => rej(new Error(`Failed: ${url}`));
      document.head.appendChild(s);
    });
  }

  // ── Coin material ──────────────────────────────────────────────
  function makeCoinMaterial(isBonus=false) {
    // Canvas texture with "2p" text for regular coins
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');

    if (!isBonus) {
      // Bronze gradient
      const grd = x.createRadialGradient(size*0.38,size*0.35,size*0.05, size/2,size/2,size*0.5);
      grd.addColorStop(0,'#f2c860');
      grd.addColorStop(0.5,'#c48218');
      grd.addColorStop(1,'#7a4a08');
      x.beginPath();x.arc(size/2,size/2,size*0.48,0,Math.PI*2);
      x.fillStyle=grd;x.fill();
      // Rim
      x.beginPath();x.arc(size/2,size/2,size*0.44,0,Math.PI*2);
      x.strokeStyle='rgba(255,200,80,0.5)';x.lineWidth=4;x.stroke();
      // Inner ring
      x.beginPath();x.arc(size/2,size/2,size*0.32,0,Math.PI*2);
      x.strokeStyle='rgba(160,100,20,0.5)';x.lineWidth=3;x.stroke();
      // Shine
      x.beginPath();x.ellipse(size*0.36,size*0.34,size*0.14,size*0.09,-0.4,0,Math.PI*2);
      x.fillStyle='rgba(255,240,160,0.5)';x.fill();
      // Text
      x.font=`bold ${size*0.26}px Arial`;
      x.fillStyle='rgba(255,255,220,0.85)';
      x.textAlign='center';x.textBaseline='middle';
      x.strokeStyle='rgba(60,30,0,0.6)';x.lineWidth=3;
      x.strokeText('2p',size/2,size/2);
      x.fillText('2p',size/2,size/2);
    }

    const tex = new THREE.CanvasTexture(c);
    return new THREE.MeshStandardMaterial({
      map: isBonus ? null : tex,
      color: isBonus ? 0xffd700 : 0xc87820,
      metalness: 0.88,
      roughness: 0.22,
      envMapIntensity: 1.2,
    });
  }

  // ── Build emoji sprite texture ─────────────────────────────────
  function makeEmojiTexture(emoji) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.clearRect(0,0,size,size);
    x.font = `${size*0.72}px serif`;
    x.textAlign='center';x.textBaseline='middle';
    x.fillText(emoji,size/2,size/2);
    return new THREE.CanvasTexture(c);
  }

  // ── Build scene ────────────────────────────────────────────────
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0520);
    scene.fog = new THREE.Fog(0x0a0520, 18, 35);

    clock = new THREE.Clock();

    // ── Camera ─────────────────────────────────────────────────
    const aspect = wrap.clientWidth / wrap.clientHeight;
    camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    // Position: front and slightly above, looking down into machine
    camera.position.set(0, MH*0.52, MD*2.1);
    camera.lookAt(0, MH*0.38, 0);

    // ── Renderer ───────────────────────────────────────────────
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    wrap.appendChild(renderer.domElement);

    // ── Lighting ───────────────────────────────────────────────
    // Ambient
    scene.add(new THREE.AmbientLight(0x220a44, 0.8));

    // Main warm fill from above
    const fill = new THREE.DirectionalLight(0xffeedd, 1.0);
    fill.position.set(2, 14, 6);
    fill.castShadow = true;
    fill.shadow.mapSize.set(1024,1024);
    fill.shadow.camera.near = 0.5;
    fill.shadow.camera.far = 40;
    fill.shadow.camera.left = -6; fill.shadow.camera.right = 6;
    fill.shadow.camera.top = 10; fill.shadow.camera.bottom = -2;
    scene.add(fill);

    // Neon tube lights inside cabinet (warm fluorescent)
    const tubeColors = [0xffe0a0, 0xe0c0ff, 0xa0d0ff];
    tubeColors.forEach((col, i) => {
      const pl = new THREE.PointLight(col, 1.4, 8);
      pl.position.set(-MW*0.3 + i*MW*0.3, MH*0.72, -MD*0.1);
      scene.add(pl);
    });

    // Under-shelf accent lights
    const accentU = new THREE.PointLight(0xc080ff, 1.0, 5);
    accentU.position.set(0, UPPER_SHELF_Y + 0.8, MD*0.3);
    scene.add(accentU);
    const accentL = new THREE.PointLight(0x8040ff, 0.8, 4);
    accentL.position.set(0, LOWER_SHELF_Y + 0.5, MD*0.3);
    scene.add(accentL);

    // ── Materials ──────────────────────────────────────────────
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x888899, metalness: 0.95, roughness: 0.12
    });
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x1a0840, metalness: 0.1, roughness: 0.8
    });
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x2a1055, metalness: 0.2, roughness: 0.65
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x8888cc, transparent: true, opacity: 0.08,
      metalness: 0.1, roughness: 0.0, side: THREE.DoubleSide
    });
    const pusherMat = new THREE.MeshStandardMaterial({
      color: 0xddccff, metalness: 0.7, roughness: 0.25,
      transparent: true, opacity: 0.82
    });
    const neonMat = new THREE.MeshStandardMaterial({
      color: 0xcc88ff, emissive: 0xcc44ff, emissiveIntensity: 1.2,
      roughness: 0.4, metalness: 0.0
    });
    const trayMat = new THREE.MeshStandardMaterial({
      color: 0x3a1870, metalness: 0.15, roughness: 0.7
    });

    // ── Cabinet frame ──────────────────────────────────────────
    // Back wall
    addBox(MW+WALL_T*2, MH, WALL_T, 0, MH/2-0.0, -MD/2, cabinetMat, false);
    // Side walls
    addBox(WALL_T, MH, MD, -MW/2-WALL_T/2, MH/2, 0, cabinetMat, false);
    addBox(WALL_T, MH, MD,  MW/2+WALL_T/2, MH/2, 0, cabinetMat, false);
    // Top cap
    addBox(MW+WALL_T*2, WALL_T, MD+WALL_T*2, 0, MH, 0, chromeMat, false);
    // Bottom
    addBox(MW+WALL_T*2, WALL_T, MD+WALL_T*2, 0, 0, 0, chromeMat, false);

    // Front glass panel (top half above shelves)
    const glassFront = new THREE.Mesh(
      new THREE.PlaneGeometry(MW, CHUTE_TOP - LOWER_SHELF_Y),
      glassMat
    );
    glassFront.position.set(0, LOWER_SHELF_Y + (CHUTE_TOP-LOWER_SHELF_Y)/2, MD/2);
    scene.add(glassFront);

    // Chrome corner strips
    for (const sx of [-1,1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, MH, 0.06), chromeMat);
      strip.position.set(sx*(MW/2+WALL_T*0.5), MH/2, MD/2);
      scene.add(strip);
    }

    // Neon trim strips across top of machine
    for (const frac of [0.25,0.5,0.75]) {
      const neon = new THREE.Mesh(new THREE.BoxGeometry(MW*0.18, 0.06, 0.06), neonMat);
      neon.position.set(-MW/2 + MW*frac*1.1, MH+0.06, MD/2-0.05);
      scene.add(neon);
    }

    // ── Shelves ────────────────────────────────────────────────
    // Upper shelf surface
    addBox(MW, UPPER_SHELF_H, SHELF_DEPTH, 0, UPPER_SHELF_Y + UPPER_SHELF_H/2, 0, shelfMat, true);
    // Upper shelf front lip
    addBox(MW, 0.22, 0.1, 0, UPPER_SHELF_Y + 0.11, SHELF_DEPTH/2+0.05, chromeMat, false);

    // Lower shelf surface
    addBox(MW, LOWER_SHELF_H, SHELF_DEPTH, 0, LOWER_SHELF_Y + LOWER_SHELF_H/2, 0, shelfMat, true);
    // Lower shelf front lip
    addBox(MW, 0.22, 0.1, 0, LOWER_SHELF_Y + 0.11, SHELF_DEPTH/2+0.05, chromeMat, false);

    // ── Win tray ────────────────────────────────────────────────
    // Tray floor
    addBox(MW, 0.12, SHELF_DEPTH, 0, TRAY_Y + 0.06, 0, trayMat, false);
    // Tray front
    addBox(MW, TRAY_H, 0.12, 0, TRAY_H/2, SHELF_DEPTH/2+0.06, trayMat, false);

    // ── Chute divider pegs ─────────────────────────────────────
    const pegMat = new THREE.MeshStandardMaterial({
      color: 0xf0c040, metalness: 0.9, roughness: 0.2
    });
    const chuteH = CHUTE_TOP - CHUTE_BOTTOM;
    PEG_POSITIONS.forEach(([xFrac, yFrac]) => {
      const pegMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.12, 12),
        pegMat
      );
      pegMesh.position.set(
        xFrac,
        CHUTE_BOTTOM + yFrac * chuteH,
        0
      );
      pegMesh.castShadow = true;
      scene.add(pegMesh);

      // Physics body for peg (static)
      const pegShape = new CANNON.Cylinder(0.09, 0.09, 0.12, 12);
      const pegBody  = new CANNON.Body({ mass: 0 });
      pegBody.addShape(pegShape);
      pegBody.position.set(
        xFrac,
        CHUTE_BOTTOM + yFrac * chuteH,
        0
      );
      world.addBody(pegBody);
    });

    // ── Pusher plates ──────────────────────────────────────────
    upperPusherMesh = new THREE.Mesh(
      new THREE.BoxGeometry(MW, 0.22, SHELF_DEPTH),
      pusherMat
    );
    upperPusherMesh.castShadow = false;
    scene.add(upperPusherMesh);

    lowerPusherMesh = new THREE.Mesh(
      new THREE.BoxGeometry(MW, 0.22, SHELF_DEPTH),
      pusherMat
    );
    lowerPusherMesh.castShadow = false;
    scene.add(lowerPusherMesh);

    // Physics bodies for pushers (kinematic)
    const pusherShape = new CANNON.Box(new CANNON.Vec3(MW/2, 0.11, SHELF_DEPTH/2));

    upperPusherBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    upperPusherBody.addShape(pusherShape);
    upperPusherBody.position.set(0, UPPER_SHELF_Y + 0.13, 0);
    world.addBody(upperPusherBody);

    lowerPusherBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    lowerPusherBody.addShape(pusherShape);
    lowerPusherBody.position.set(0, LOWER_SHELF_Y + 0.13, SHELF_DEPTH*0.15);
    world.addBody(lowerPusherBody);

    // ── Physics walls (invisible) ──────────────────────────────
    // Side walls
    addPhysicsBox(WALL_T, MH, MD, -MW/2-WALL_T/2, MH/2, 0);
    addPhysicsBox(WALL_T, MH, MD,  MW/2+WALL_T/2, MH/2, 0);
    // Back wall
    addPhysicsBox(MW, MH, WALL_T, 0, MH/2, -MD/2+WALL_T/2);
    // Shelf surfaces
    addPhysicsBox(MW, UPPER_SHELF_H, SHELF_DEPTH, 0, UPPER_SHELF_Y+UPPER_SHELF_H/2, 0);
    addPhysicsBox(MW, LOWER_SHELF_H, SHELF_DEPTH, 0, LOWER_SHELF_Y+LOWER_SHELF_H/2, 0);
    // Tray floor
    addPhysicsBox(MW, 0.12, SHELF_DEPTH, 0, TRAY_Y+0.06, 0);
    // Front walls below upper shelf (to stop coins falling off front)
    addPhysicsBox(MW, 0.2, WALL_T, 0, UPPER_SHELF_Y+0.1, SHELF_DEPTH/2+WALL_T/2);
    addPhysicsBox(MW, 0.2, WALL_T, 0, LOWER_SHELF_Y+0.1, SHELF_DEPTH/2+WALL_T/2);

    // ── Seed initial coins ─────────────────────────────────────
    seedCoins();
  }

  // Helper: add a visual + physics box
  function addBox(w,h,d,x,y,z,mat,castShadow=true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  function addPhysicsBox(w,h,d,x,y,z) {
    const body = new CANNON.Body({ mass:0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)));
    body.position.set(x,y,z);
    world.addBody(body);
    return body;
  }

  // ── Seed initial coins on both shelves ────────────────────────
  function seedCoins() {
    // Upper shelf
    for (let i=0; i<22; i++) {
      const x = (Math.random()-0.5)*(MW-COIN_R*3);
      const z = (Math.random()-0.5)*(SHELF_DEPTH-COIN_R*3);
      const y = UPPER_SHELF_Y + UPPER_SHELF_H + COIN_H/2 + i*COIN_H*0.3 + Math.random()*0.05;
      spawnCoin(x, y, z, 'upper');
    }
    // Lower shelf
    for (let i=0; i<28; i++) {
      const x = (Math.random()-0.5)*(MW-COIN_R*3);
      const z = (Math.random()-0.5)*(SHELF_DEPTH-COIN_R*3);
      const y = LOWER_SHELF_Y + LOWER_SHELF_H + COIN_H/2 + i*COIN_H*0.3 + Math.random()*0.05;
      spawnCoin(x, y, z, 'lower');
    }
    // A few bonus items
    spawnBonus(-MW*0.25, UPPER_SHELF_Y+UPPER_SHELF_H+COIN_H, -SHELF_DEPTH*0.15);
    spawnBonus( MW*0.25, UPPER_SHELF_Y+UPPER_SHELF_H+COIN_H, -SHELF_DEPTH*0.15);
    spawnBonus( 0,       LOWER_SHELF_Y+LOWER_SHELF_H+COIN_H,  SHELF_DEPTH*0.05);
  }

  // ── Spawn a 2p coin ───────────────────────────────────────────
  let _coinMat = null;
  function spawnCoin(x,y,z, shelf='upper') {
    if (!_coinMat) _coinMat = makeCoinMaterial(false);

    // Three mesh — flat cylinder (coin shape)
    const geo  = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 24);
    const mesh = new THREE.Mesh(geo, _coinMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Tilt slightly to look more natural
    mesh.rotation.x = (Math.random()-0.5)*0.3;
    mesh.rotation.z = (Math.random()-0.5)*0.3;
    scene.add(mesh);

    // Cannon body
    const body = new CANNON.Body({ mass: 0.004, linearDamping: 0.4, angularDamping: 0.6 });
    const shape = new CANNON.Cylinder(COIN_R, COIN_R, COIN_H, 12);
    body.addShape(shape);
    body.position.set(x,y,z);
    body.velocity.set((Math.random()-0.5)*0.3, 0, (Math.random()-0.5)*0.3);
    body.material = new CANNON.Material({ restitution:0.25, friction:0.5 });
    world.addBody(body);

    coins.push({ mesh, body, type:'coin', value:2, shelf });
  }

  // ── Spawn a bonus item ────────────────────────────────────────
  function spawnBonus(x,y,z) {
    const b    = BONUSES[Math.floor(Math.random()*BONUSES.length)];
    const tex  = makeEmojiTexture(b.emoji);
    const mat  = new THREE.SpriteMaterial({ map:tex, transparent:true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.7, 0.7, 0.7);
    sprite.position.set(x,y,z);
    scene.add(sprite);

    // Physics: small box body
    const body = new CANNON.Body({ mass:0.002, linearDamping:0.5, angularDamping:0.8 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.25,0.25,0.05)));
    body.position.set(x,y,z);
    world.addBody(body);

    coins.push({ mesh:sprite, body, type:'bonus', value:b.value, label:b.label,
                 emoji:b.emoji, color:b.color, bobOffset:Math.random()*Math.PI*2 });
  }

  // ── Drop a coin from the chute ────────────────────────────────
  function dropCoin() {
    if (droppingLocked || balance < 2 || !world) return;
    try { getAC().resume(); } catch(e){}
    balance -= 2;
    sndDrop();
    droppingLocked = true;
    setTimeout(()=>{ droppingLocked=false; }, 600);

    if (!_coinMat) _coinMat = makeCoinMaterial(false);

    const geo  = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 24);
    const mesh = new THREE.Mesh(geo, _coinMat);
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({ mass:0.004, linearDamping:0.22, angularDamping:0.45 });
    body.addShape(new CANNON.Cylinder(COIN_R, COIN_R, COIN_H, 12));
    // Drop from aim position, near top of chute
    const dropXWorld = aimX * (MW*0.44);
    body.position.set(dropXWorld, CHUTE_TOP - 0.3, (Math.random()-0.5)*0.1);
    body.velocity.set((Math.random()-0.5)*0.5, -1.5, 0);
    body.angularVelocity.set((Math.random()-0.5)*3, 0, (Math.random()-0.5)*3);
    body.material = new CANNON.Material({ restitution:0.3, friction:0.45 });
    world.addBody(body);

    const coinObj = { mesh, body, type:'coin', value:2, shelf:'falling' };
    coins.push(coinObj);
    fallingCoin = coinObj;
  }

  // ── Physics world setup ───────────────────────────────────────
  function buildPhysics() {
    world = new CANNON.World();
    world.gravity.set(0, -18, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 12;

    // Global contact material
    const defaultMat = new CANNON.Material('default');
    const contact = new CANNON.ContactMaterial(defaultMat, defaultMat, {
      friction: 0.5, restitution: 0.28
    });
    world.addContactMaterial(contact);
    world.defaultContactMaterial = contact;
  }

  // ── Check for coins fallen off edges ─────────────────────────
  function checkFallenCoins() {
    const toRemove = [];

    coins.forEach((c,i) => {
      const py = c.body.position.y;
      const pz = c.body.position.z;

      // Fell off upper shelf front edge → transfer to lower shelf area
      if (c.shelf === 'upper' && py < UPPER_SHELF_Y - 0.4) {
        // Teleport to just above lower shelf
        c.body.position.y = LOWER_SHELF_Y + LOWER_SHELF_H + COIN_H + 0.3;
        c.body.velocity.set(c.body.velocity.x*0.5, -1, c.body.velocity.z*0.5);
        c.shelf = 'lower';
        sndClink();
        return;
      }

      // Fell off lower shelf front edge → WIN
      if (c.shelf === 'lower' && py < LOWER_SHELF_Y - 0.3) {
        collectCoin(c);
        toRemove.push(i);
        return;
      }

      // Also collect anything that reaches the tray floor
      if (py < TRAY_Y + 0.15 && c.shelf !== 'tray') {
        c.shelf = 'tray';
      }
      if (c.shelf === 'tray' && py < TRAY_Y - 0.3) {
        collectCoin(c);
        toRemove.push(i);
        return;
      }

      // Remove coins that escape the machine entirely
      if (py < -2 || Math.abs(c.body.position.x) > MW) {
        toRemove.push(i);
      }
    });

    // Remove in reverse order
    toRemove.slice().reverse().forEach(i => {
      const c = coins[i];
      scene.remove(c.mesh);
      world.removeBody(c.body);
      coins.splice(i,1);
    });
  }

  function collectCoin(c) {
    balance  += c.value;
    winnings += c.value;
    if (c.type==='bonus') { sndBonus(); } else { sndWin(c.value); }
    const label = c.type==='bonus' ? `${c.emoji} ${c.label}` : `+2p`;
    const color = c.type==='bonus' ? (c.color||'#ffdd00') : '#00ff88';
    showPopup(label, color, c.body.position.x);
  }

  // ── DOM popup floater ─────────────────────────────────────────
  function showPopup(text, color, worldX) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      position:absolute; pointer-events:none; z-index:100;
      font-family:'Orbitron',sans-serif; font-size:clamp(11px,2.2vw,16px);
      font-weight:bold; color:${color}; text-shadow:0 0 8px ${color};
      left:50%; transform:translateX(-50%); bottom:8%; white-space:nowrap;
      animation: cpPopup 1.6s ease-out forwards;
    `;
    wrap.appendChild(el);
    setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); },1700);
  }

  // ── Main loop ─────────────────────────────────────────────────
  function animate() {
    if (destroyed) return;
    animId = requestAnimationFrame(animate);
    if (document.hidden) return;

    const dt = Math.min(clock.getDelta(), 0.05);

    // Step physics
    world.step(1/60, dt, 3);

    // Sync meshes to physics bodies
    coins.forEach(c => {
      c.mesh.position.copy(c.body.position);
      if (c.type !== 'bonus') {
        c.mesh.quaternion.copy(c.body.quaternion);
      } else {
        // Bonus sprites bob up and down
        c.bobOffset = (c.bobOffset||0) + dt*2.5;
        c.mesh.position.y = c.body.position.y + Math.sin(c.bobOffset)*0.06;
      }
    });

    // Move pusher plates (kinematic)
    const maxZ =  SHELF_DEPTH/2 - 0.12;
    const minZ = -SHELF_DEPTH/2 + 0.12;

    upperPusherBody.position.z += PUSHER_SPEED * upperPusherDir * dt;
    if (upperPusherBody.position.z > maxZ) { upperPusherBody.position.z = maxZ; upperPusherDir = -1; }
    if (upperPusherBody.position.z < minZ) { upperPusherBody.position.z = minZ; upperPusherDir =  1; }
    upperPusherMesh.position.copy(upperPusherBody.position);
    upperPusherMesh.position.y = UPPER_SHELF_Y + 0.13;

    lowerPusherBody.position.z += PUSHER_SPEED * lowerPusherDir * dt * 0.85;
    if (lowerPusherBody.position.z > maxZ) { lowerPusherBody.position.z = maxZ; lowerPusherDir = -1; }
    if (lowerPusherBody.position.z < minZ) { lowerPusherBody.position.z = minZ; lowerPusherDir =  1; }
    lowerPusherMesh.position.copy(lowerPusherBody.position);
    lowerPusherMesh.position.y = LOWER_SHELF_Y + 0.13;

    // Check fallen coins
    checkFallenCoins();

    // Bonus spawn
    bonusSpawnTimer -= dt;
    if (bonusSpawnTimer <= 0) {
      bonusSpawnTimer = 8 + Math.random()*10;
      spawnBonus(
        (Math.random()-0.5)*(MW-0.8),
        UPPER_SHELF_Y + UPPER_SHELF_H + 0.5,
        (Math.random()-0.5)*(SHELF_DEPTH-0.6)
      );
    }

    // Update HUD
    updateHUD();

    renderer.render(scene, camera);
  }

  // ── HUD elements ──────────────────────────────────────────────
  let hudEl;
  function buildHUD() {
    hudEl = document.createElement('div');
    hudEl.style.cssText = `
      position:absolute; top:0; left:0; right:0;
      display:flex; justify-content:space-between; align-items:stretch;
      padding:6px 14px; background:rgba(8,3,22,0.88);
      border-bottom:1px solid rgba(160,90,240,0.3);
      font-family:'Share Tech Mono',monospace; pointer-events:none;
      gap:10px; z-index:10;
    `;
    hudEl.innerHTML = `
      <div class="cp3-stat" id="cp3-balance">
        <div class="cp3-label">BALANCE</div>
        <div class="cp3-val" id="cp3-bal-val" style="color:#00ff88">£1.00</div>
      </div>
      <div class="cp3-stat" style="text-align:center">
        <div class="cp3-label">COINS LEFT</div>
        <div class="cp3-val" id="cp3-coins-val" style="color:#00e5ff">50 × 2p</div>
      </div>
      <div class="cp3-stat" style="text-align:right">
        <div class="cp3-label">WINNINGS</div>
        <div class="cp3-val" id="cp3-win-val" style="color:#ffdd00">£0.00</div>
      </div>
    `;
    // Inject style
    const style = document.createElement('style');
    style.textContent = `
      .cp3-stat{display:flex;flex-direction:column;justify-content:center;min-width:80px}
      .cp3-label{font-size:clamp(0.42rem,1vw,0.6rem);letter-spacing:0.18em;
        color:rgba(160,110,240,0.55);margin-bottom:2px}
      .cp3-val{font-family:'Orbitron',sans-serif;font-size:clamp(0.7rem,2vw,1rem);
        font-weight:bold;letter-spacing:0.08em}
      @keyframes cpPopup{0%{opacity:1;transform:translateX(-50%) translateY(0)}
        100%{opacity:0;transform:translateX(-50%) translateY(-60px)}}
    `;
    wrap.appendChild(style);
    wrap.appendChild(hudEl);
  }

  function updateHUD() {
    const bEl = document.getElementById('cp3-bal-val');
    const cEl = document.getElementById('cp3-coins-val');
    const wEl = document.getElementById('cp3-win-val');
    if (bEl) { bEl.textContent=`£${(balance/100).toFixed(2)}`; bEl.style.color=balance<20?'#ff5555':'#00ff88'; }
    if (cEl) cEl.textContent=`${Math.floor(balance/2)} × 2p`;
    if (wEl) wEl.textContent=`£${(winnings/100).toFixed(2)}`;
  }

  // ── Input ─────────────────────────────────────────────────────
  function getAimFromEvent(clientX) {
    const rect = wrap.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    aimX = (frac - 0.5) * 2;  // -1 .. +1
  }
  function onMouseMove(e)  { getAimFromEvent(e.clientX); }
  function onTouchMove(e)  { e.preventDefault(); if(e.touches[0]) getAimFromEvent(e.touches[0].clientX); }
  function onClick()       { try{getAC().resume();}catch(ex){} dropCoin(); }
  function onKey(e) {
    if (e.code==='Space'||e.code==='Enter') { e.preventDefault(); try{getAC().resume();}catch(ex){} dropCoin(); }
    if (e.code==='ArrowLeft')  aimX = Math.max(-1, aimX-0.08);
    if (e.code==='ArrowRight') aimX = Math.min( 1, aimX+0.08);
  }

  // ── Resize ────────────────────────────────────────────────────
  function onResize() {
    if (!renderer || !camera || !wrap) return;
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  }

  // ── Build / destroy DOM ───────────────────────────────────────
  function buildHTML(el) {
    el.innerHTML = `
      <style>
        #cp3-root{width:100%;height:100%;display:flex;flex-direction:column;
          background:#080318;user-select:none;}
        #cp3-topbar{display:flex;align-items:center;justify-content:space-between;
          padding:5px 12px;border-bottom:1px solid rgba(160,90,240,0.25);
          flex-shrink:0;gap:8px;font-family:'Share Tech Mono',monospace;}
        #cp3-title{font-family:'Orbitron',sans-serif;font-size:clamp(0.6rem,2vw,1rem);
          color:#c084fc;letter-spacing:0.2em;text-shadow:0 0 10px rgba(192,132,252,0.6);}
        #cp3-hint{font-size:clamp(0.44rem,1vw,0.62rem);color:rgba(160,90,240,0.45);
          letter-spacing:0.07em;}
        #cp3-wrap{flex:1;min-height:0;position:relative;cursor:crosshair;touch-action:none;
          overflow:hidden;}
        .cp3-btn{padding:3px 10px;background:transparent;
          border:1px solid rgba(160,90,240,0.35);color:rgba(180,110,255,0.8);
          font-family:'Share Tech Mono',monospace;font-size:clamp(0.46rem,1.1vw,0.65rem);
          letter-spacing:0.1em;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
        .cp3-btn:hover{background:rgba(160,90,240,0.1);border-color:#c084fc;color:#c084fc;}
      </style>
      <div id="cp3-root">
        <div id="cp3-topbar">
          <div id="cp3-title">🪙 COIN PUSHER 3D</div>
          <div id="cp3-hint">AIM WITH MOUSE · CLICK / SPACE TO DROP</div>
          <div style="display:flex;gap:6px">
            <button class="cp3-btn" id="cp3-new-btn">▶ NEW GAME</button>
            <button class="arcade-back-btn" id="cp3-back-btn">🕹 ARCADE</button>
          </div>
        </div>
        <div id="cp3-wrap"></div>
      </div>`;

    wrap = el.querySelector('#cp3-wrap');
    el.querySelector('#cp3-new-btn').addEventListener('click', restartGame);
    el.querySelector('#cp3-back-btn').addEventListener('click', ()=>window.backToGameSelect?.());
    wrap.addEventListener('mousemove', onMouseMove);
    wrap.addEventListener('click',     onClick);
    wrap.addEventListener('touchmove', onTouchMove, {passive:false});
    wrap.addEventListener('touchstart', e=>{e.preventDefault();onClick();},{passive:false});
    window.addEventListener('keydown',  onKey);
    window.addEventListener('resize',   onResize);
  }

  function restartGame() {
    balance=100; winnings=0; aimX=0;
    // Clear all coins
    coins.forEach(c=>{ scene.remove(c.mesh); world.removeBody(c.body); });
    coins.length=0;
    bonusSpawnTimer=5;
    seedCoins();
    updateHUD();
  }

  // ── Init ──────────────────────────────────────────────────────
  async function init() {
    const el = document.getElementById('coinpusher-screen');
    if (!el) { console.warn('[coinpusher3d] screen not found'); return; }
    destroyed = false;

    buildHTML(el);

    // Load Three.js and cannon-es from CDN
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
      THREE = window.THREE;
      await loadScript('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.umd.js');
      CANNON = window.CANNON;
    } catch(e) {
      console.error('[coinpusher3d] Failed to load 3D libraries:', e);
      el.innerHTML += '<div style="color:#ff4444;padding:20px;font-family:monospace">Failed to load 3D engine. Check network connection.</div>';
      return;
    }

    buildPhysics();
    buildScene();
    buildHUD();
    animate();
  }

  function destroy() {
    destroyed = true;
    if (animId) { cancelAnimationFrame(animId); animId=null; }
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize',  onResize);
    if (renderer) { renderer.dispose(); renderer=null; }
    const el = document.getElementById('coinpusher-screen');
    if (el) el.innerHTML='';
    coins.length=0;
  }

  return { init, destroy };
})();
