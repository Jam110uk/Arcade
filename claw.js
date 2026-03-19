// ============================================================
// CLAW MACHINE — claw.js
// 3D claw machine with Three.js + Cannon-es physics
// Export pattern matches arcade architecture
// ============================================================

export default (() => {

  // ── Cannon-es (loaded once via dynamic import) ──────────
  let C = null; // CANNON namespace

  // ── State ───────────────────────────────────────────────
  let renderer, scene, camera, world;
  let claw, clawArm, clawGroup;
  let prizes = [], droppedPrizes = [];
  let animId = null;
  let controls = { left:false, right:false, forward:false, back:false, drop:false, camLeft:false, camRight:false };
  let gameState = 'idle'; // idle | moving | dropping | grabbing | retracting | releasing | gameover
  let tries = 20;
  let score = 0;
  let clawOpen = 1.0;
  let dropY = 0;
  let grabbed = null;
  let camAngle = 0;
  let camDist = 5.5;
  let keyMap = {};
  let canvasEl = null;
  let uiEl = null;
  let screenEl = null;
  let dropPhase = 0; // 0=lowering 1=closing 2=lifting 3=checking
  let dropTimer = 0;
  let clawX = 0, clawZ = 0;
  let retractCb = null;
  let introAnim = true;
  let introCamAngle = 0;
  let lastTime = 0;
  let meshBodies = []; // { mesh, body }
  let grabJoint = null;
  let clawBody = null;
  let scorePopups = [];

  // ── Prize definitions ───────────────────────────────────
  const PRIZE_DEFS = [
    { emoji:'🦄', label:'Unicorn Orb',     color:0xff88ff, pts:100, glow:0xff00ff, radius:0.22, type:'orb'    },
    { emoji:'⭐', label:'Star Orb',        color:0xffee44, pts: 75, glow:0xffcc00, radius:0.20, type:'orb'    },
    { emoji:'🐸', label:'Frog Orb',        color:0x44ff88, pts: 60, glow:0x00ff44, radius:0.21, type:'orb'    },
    { emoji:'🔥', label:'Fire Orb',        color:0xff6622, pts: 80, glow:0xff3300, radius:0.21, type:'orb'    },
    { emoji:'💎', label:'Diamond Orb',     color:0x88eeff, pts: 90, glow:0x00eeff, radius:0.19, type:'orb'    },
    { emoji:'🐙', label:'Octopus Orb',     color:0xcc88ff, pts: 70, glow:0xaa00ff, radius:0.23, type:'orb'    },
    { emoji:'🌈', label:'Rainbow Orb',     color:0xff99cc, pts: 85, glow:0xff66aa, radius:0.20, type:'orb'    },
    { emoji:'🐻', label:'Bear Plush',      color:0xcc8855, pts: 50, glow:0x885533, radius:0.25, type:'plush'  },
    { emoji:'🐱', label:'Cat Plush',       color:0xffcc88, pts: 40, glow:0xff9944, radius:0.24, type:'plush'  },
    { emoji:'🐶', label:'Dog Plush',       color:0xddaa66, pts: 45, glow:0xbb7733, radius:0.24, type:'plush'  },
    { emoji:'🍀', label:'Lucky Clover',    color:0x33cc66, pts: 55, glow:0x009933, radius:0.18, type:'orb'    },
    { emoji:'🎀', label:'Pink Bow',        color:0xff66aa, pts: 35, glow:0xff0077, radius:0.20, type:'plush'  },
  ];

  const MACHINE = { w:2.8, h:3.2, d:2.8 };
  const FLOOR_Y = -1.0;
  const RAIL_Y  =  1.1;
  const CLAW_REST_Y = RAIL_Y - 0.15;
  const DROP_BOTTOM = FLOOR_Y + 0.35;

  // ── Init ────────────────────────────────────────────────
  async function init() {
    screenEl = document.getElementById('claw-screen');
    if (!screenEl) { console.error('[claw] No #claw-screen'); return; }

    // Load cannon-es as a proper ES module (it has no UMD/global build)
    if (!C) {
      C = await import('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js');
    }

    screenEl.innerHTML = '';
    _buildUI();
    _initThree();
    _initPhysics();
    _buildMachine();
    _spawnPrizes();
    _resetClaw();
    _bindKeys();
    gameState = 'idle';
    introAnim = true;
    introCamAngle = 0;
    tries = 20;
    score = 0;
    _updateUI();
    lastTime = performance.now();
    _loop();
  }

  function destroy() {
    _unbindKeys();
    if (animId) cancelAnimationFrame(animId);
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; world = null;
    prizes = []; droppedPrizes = []; meshBodies = [];
  }

  // ── UI ──────────────────────────────────────────────────
  function _buildUI() {
    uiEl = document.createElement('div');
    uiEl.id = 'claw-ui';
    uiEl.innerHTML = `
      <div id="claw-hud">
        <div class="claw-stat"><span class="claw-stat-label">SCORE</span><span id="claw-score">0</span></div>
        <div class="claw-stat"><span class="claw-stat-label">TRIES</span><span id="claw-tries">20</span></div>
      </div>
      <div id="claw-prize-toast"></div>
      <div id="claw-controls-panel">
        <div class="claw-ctrl-title">🎮 CONTROLS</div>
        <div class="claw-ctrl-row"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> <span>Move claw</span></div>
        <div class="claw-ctrl-row"><kbd>SPACE</kbd> <span>Drop &amp; grab</span></div>
        <div class="claw-ctrl-row"><kbd>Q</kbd><kbd>E</kbd> <span>Rotate camera</span></div>
        <div class="claw-ctrl-row"><kbd>[</kbd><kbd>]</kbd> <span>Zoom camera</span></div>
      </div>
      <div id="claw-gameover" class="hidden">
        <div class="claw-go-box">
          <div class="claw-go-title">GAME OVER</div>
          <div class="claw-go-score">Score: <span id="claw-go-pts">0</span></div>
          <button id="claw-go-hs" onclick="window._clawSubmitHS()">🏆 Submit Score</button>
          <button id="claw-go-back" onclick="window.backToGameSelect()">🏠 Menu</button>
        </div>
      </div>
      <canvas id="claw-canvas"></canvas>
    `;
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #claw-screen { position:relative; width:100%; height:100%; background:#0a0015; overflow:hidden; font-family:'Orbitron',monospace; }
      #claw-canvas  { position:absolute; inset:0; width:100%!important; height:100%!important; display:block; }
      #claw-hud     { position:absolute; top:16px; left:50%; transform:translateX(-50%); display:flex; gap:32px; z-index:10; pointer-events:none; }
      .claw-stat    { background:rgba(0,0,0,0.6); border:1px solid rgba(255,100,255,0.4); border-radius:8px; padding:8px 20px; text-align:center; backdrop-filter:blur(4px); }
      .claw-stat-label { display:block; font-size:9px; letter-spacing:3px; color:#aa77ff; margin-bottom:2px; }
      #claw-score, #claw-tries { font-size:26px; font-weight:900; color:#fff; text-shadow:0 0 12px #cc44ff; }
      #claw-prize-toast { position:absolute; top:90px; left:50%; transform:translateX(-50%); z-index:20; pointer-events:none; }
      .claw-toast { background:rgba(0,0,0,0.8); border:1px solid rgba(255,200,50,0.6); border-radius:10px; padding:10px 24px; color:#ffe44a; font-size:15px; font-weight:700; letter-spacing:2px; text-align:center; margin-bottom:6px; animation:claw-toast-in 0.3s ease, claw-toast-out 0.4s ease 1.6s forwards; white-space:nowrap; }
      @keyframes claw-toast-in  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes claw-toast-out { from{opacity:1} to{opacity:0;transform:translateY(-8px)} }
      #claw-controls-panel { position:absolute; bottom:20px; right:20px; background:rgba(0,0,0,0.65); border:1px solid rgba(255,100,255,0.25); border-radius:10px; padding:14px 18px; z-index:10; pointer-events:none; backdrop-filter:blur(4px); }
      .claw-ctrl-title { font-size:10px; letter-spacing:3px; color:#cc88ff; margin-bottom:10px; }
      .claw-ctrl-row   { font-size:11px; color:#ccc; margin-bottom:6px; display:flex; align-items:center; gap:6px; }
      kbd { background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.3); border-radius:4px; padding:2px 6px; font-size:10px; color:#fff; font-family:inherit; }
      #claw-gameover { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:30; background:rgba(0,0,0,0.75); backdrop-filter:blur(6px); }
      #claw-gameover.hidden { display:none; }
      .claw-go-box { background:linear-gradient(135deg,#1a0030,#0d001a); border:1px solid rgba(200,100,255,0.5); border-radius:16px; padding:40px 56px; text-align:center; box-shadow:0 0 60px rgba(150,0,255,0.3); }
      .claw-go-title { font-size:32px; font-weight:900; letter-spacing:6px; color:#fff; text-shadow:0 0 20px #cc44ff; margin-bottom:16px; }
      .claw-go-score { font-size:18px; color:#cc88ff; margin-bottom:28px; letter-spacing:2px; }
      .claw-go-box button { display:block; width:100%; margin-bottom:12px; padding:12px 24px; border:1px solid rgba(255,100,255,0.5); border-radius:8px; background:rgba(255,100,255,0.1); color:#fff; font-family:'Orbitron',monospace; font-size:13px; letter-spacing:2px; cursor:pointer; transition:all 0.2s; }
      .claw-go-box button:hover { background:rgba(255,100,255,0.25); border-color:rgba(255,100,255,0.8); }
    `;
    document.head.appendChild(style);

    // Load Orbitron font if not present
    if (!document.getElementById('orbitron-font')) {
      const lnk = document.createElement('link');
      lnk.id = 'orbitron-font';
      lnk.rel = 'stylesheet';
      lnk.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap';
      document.head.appendChild(lnk);
    }

    screenEl.appendChild(uiEl);
  }

  function _updateUI() {
    const sc = document.getElementById('claw-score');
    const tr = document.getElementById('claw-tries');
    if (sc) sc.textContent = score;
    if (tr) tr.textContent = tries;
  }

  function _showToast(txt) {
    const container = document.getElementById('claw-prize-toast');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'claw-toast';
    el.textContent = txt;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  }

  function _showGameOver() {
    const go = document.getElementById('claw-gameover');
    const pts = document.getElementById('claw-go-pts');
    if (go)  go.classList.remove('hidden');
    if (pts) pts.textContent = score;

    window._clawSubmitHS = () => {
      if (window.HS) window.HS.promptSubmit('claw', score, `${score} pts`);
    };
  }

  // ── Three.js ────────────────────────────────────────────
  function _initThree() {
    canvasEl = document.getElementById('claw-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x080012);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0018, 0.08);

    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
    _setCameraPos();

    // Lights
    const ambient = new THREE.AmbientLight(0x220033, 0.8);
    scene.add(ambient);

    const spot = new THREE.SpotLight(0xffffff, 2.5, 12, Math.PI/5, 0.4);
    spot.position.set(0, 5, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot);

    const fillL = new THREE.PointLight(0xff44ff, 1.2, 10);
    fillL.position.set(-3, 2, -3);
    scene.add(fillL);

    const fillR = new THREE.PointLight(0x4488ff, 0.8, 10);
    fillR.position.set(3, 1, 3);
    scene.add(fillR);

    // Background stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 1200; i++) {
      starPos.push((Math.random()-0.5)*80, (Math.random()-0.5)*80, (Math.random()-0.5)*80);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color:0xffffff, size:0.08, transparent:true, opacity:0.5 });
    scene.add(new THREE.Points(starGeo, starMat));

    _handleResize();
    window.addEventListener('resize', _handleResize);
  }

  function _setCameraPos() {
    if (!camera) return;
    const cx = Math.sin(camAngle) * camDist;
    const cz = Math.cos(camAngle) * camDist;
    camera.position.set(cx, 2.8, cz);
    camera.lookAt(0, 0.2, 0);
  }

  function _handleResize() {
    if (!canvasEl || !renderer || !camera) return;
    const w = screenEl.clientWidth  || window.innerWidth;
    const h = screenEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ── Physics ─────────────────────────────────────────────
  function _initPhysics() {
    world = new C.World({ gravity: new C.Vec3(0, -9.82, 0) });
    world.broadphase = new C.NaiveBroadphase();
    world.solver.iterations = 10;
    world.defaultContactMaterial.friction = 0.4;
    world.defaultContactMaterial.restitution = 0.3;
  }

  // ── Machine geometry ─────────────────────────────────────
  function _buildMachine() {
    const hw = MACHINE.w/2, hd = MACHINE.d/2;

    // Glass material
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88aaff, transparent:true, opacity:0.13,
      roughness:0, metalness:0, transmission:0.9,
      thickness:0.1, side:THREE.DoubleSide, depthWrite:false
    });

    // Frame material
    const frameMat = new THREE.MeshStandardMaterial({ color:0x220044, metalness:0.8, roughness:0.2 });

    const edgeMat = new THREE.MeshStandardMaterial({
      color:0xcc44ff, emissive:0xcc44ff, emissiveIntensity:0.6,
      metalness:0.9, roughness:0.1
    });

    // Floor
    const floorGeo = new THREE.BoxGeometry(MACHINE.w, 0.08, MACHINE.d);
    const floorMat = new THREE.MeshStandardMaterial({
      color:0x110022, roughness:0.4, metalness:0.3,
      emissive:0x220033, emissiveIntensity:0.3
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = FLOOR_Y - 0.04;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Physics floor
    const floorBody = new C.Body({ mass:0, shape: new C.Plane() });
    floorBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
    floorBody.position.set(0, FLOOR_Y, 0);
    world.addBody(floorBody);

    // Walls (physics)
    const wallMat2 = new C.Material();
    const wallDefs = [
      { pos:[0,0, hd+0.01], euler:[0,0,0]   , size:[hw*2+0.1, 2.2, 0.05] },
      { pos:[0,0,-hd-0.01], euler:[0,0,0]   , size:[hw*2+0.1, 2.2, 0.05] },
      { pos:[hw+0.01,0,0],  euler:[0,Math.PI/2,0], size:[hd*2+0.1,2.2,0.05] },
      { pos:[-hw-0.01,0,0], euler:[0,Math.PI/2,0], size:[hd*2+0.1,2.2,0.05] },
    ];
    wallDefs.forEach(w => {
      const b = new C.Body({ mass:0, material: wallMat2 });
      b.addShape(new C.Box(new C.Vec3(w.size[0]/2, w.size[1]/2, w.size[2]/2)));
      b.position.set(...w.pos);
      b.quaternion.setFromEuler(...w.euler);
      world.addBody(b);
    });

    // Glass panels
    const panels = [
      { pos:[0, 0.1,  hd], rot:[0,0,0],      s:[MACHINE.w, MACHINE.h, 0.04] },
      { pos:[0, 0.1, -hd], rot:[0,0,0],      s:[MACHINE.w, MACHINE.h, 0.04] },
      { pos:[ hw, 0.1, 0], rot:[0,Math.PI/2,0], s:[MACHINE.d, MACHINE.h, 0.04] },
      { pos:[-hw, 0.1, 0], rot:[0,Math.PI/2,0], s:[MACHINE.d, MACHINE.h, 0.04] },
    ];
    panels.forEach(p => {
      const g = new THREE.BoxGeometry(...p.s);
      const m = new THREE.Mesh(g, glassMat);
      m.position.set(...p.pos);
      m.rotation.set(...p.rot);
      scene.add(m);
    });

    // Frame edges (glowing)
    const edgeDefs = [
      // vertical corners
      [[ hw,0, hd],[0.06,MACHINE.h,0.06]],
      [[-hw,0, hd],[0.06,MACHINE.h,0.06]],
      [[ hw,0,-hd],[0.06,MACHINE.h,0.06]],
      [[-hw,0,-hd],[0.06,MACHINE.h,0.06]],
      // top ring
      [[0,MACHINE.h/2, hd],[MACHINE.w,0.06,0.06]],
      [[0,MACHINE.h/2,-hd],[MACHINE.w,0.06,0.06]],
      [[ hw,MACHINE.h/2,0],[0.06,0.06,MACHINE.d]],
      [[-hw,MACHINE.h/2,0],[0.06,0.06,MACHINE.d]],
      // bottom ring
      [[0,-MACHINE.h/2, hd],[MACHINE.w,0.06,0.06]],
      [[0,-MACHINE.h/2,-hd],[MACHINE.w,0.06,0.06]],
      [[ hw,-MACHINE.h/2,0],[0.06,0.06,MACHINE.d]],
      [[-hw,-MACHINE.h/2,0],[0.06,0.06,MACHINE.d]],
    ];
    edgeDefs.forEach(([pos,size]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), edgeMat);
      m.position.set(...pos);
      scene.add(m);
    });

    // Top solid panel
    const topMesh = new THREE.Mesh(
      new THREE.BoxGeometry(MACHINE.w+0.1, 0.1, MACHINE.d+0.1), frameMat
    );
    topMesh.position.y = MACHINE.h/2 + 0.02;
    scene.add(topMesh);

    // Rail
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(MACHINE.w-0.1, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color:0xaaaaaa, metalness:0.9, roughness:0.1 })
    );
    rail.position.set(0, RAIL_Y, 0);
    scene.add(rail);

    // Prize chute opening (front right)
    const chuteMat = new THREE.MeshStandardMaterial({ color:0x440066, metalness:0.5, roughness:0.4 });
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), chuteMat);
    chute.position.set(hw-0.35, FLOOR_Y+0.2, hd);
    scene.add(chute);

    // Neon sign on top
    _buildSign();

    // Build claw
    _buildClaw();
  }

  function _buildSign() {
    // Simple glowing bar sign above machine
    const signGeo = new THREE.BoxGeometry(2.2, 0.3, 0.1);
    const signMat = new THREE.MeshStandardMaterial({
      color:0xff44aa, emissive:0xff44aa, emissiveIntensity:1.5,
      roughness:0.1, metalness:0.8
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, MACHINE.h/2 + 0.35, MACHINE.d/2 - 0.05);
    scene.add(sign);

    // Point light inside sign
    const signLight = new THREE.PointLight(0xff44aa, 1.5, 4);
    signLight.position.set(0, MACHINE.h/2 + 0.35, MACHINE.d/2);
    scene.add(signLight);
  }

  // ── Claw ─────────────────────────────────────────────────
  function _buildClaw() {
    clawGroup = new THREE.Group();

    // Arm (wire from top)
    const armMat = new THREE.MeshStandardMaterial({ color:0xcccccc, metalness:0.9, roughness:0.1 });
    clawArm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.5, 8), armMat);
    clawArm.position.y = 1.25;
    clawGroup.add(clawArm);

    // Hub
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.08, 0.18, 12),
      new THREE.MeshStandardMaterial({ color:0x888888, metalness:0.95, roughness:0.1 })
    );
    clawGroup.add(hub);

    // Fingers (3)
    claw = new THREE.Group();
    const fingerMat = new THREE.MeshStandardMaterial({ color:0xaaaaaa, metalness:0.9, roughness:0.15 });
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const finger = new THREE.Group();
      // Upper segment
      const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.28, 8), fingerMat);
      seg1.position.y = -0.14;
      // Lower segment (curves in)
      const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.28, 8), fingerMat);
      seg2.position.y = -0.42;
      seg2.rotation.z = 0.45;
      finger.add(seg1, seg2);
      finger.position.x = Math.sin(angle) * 0.12;
      finger.position.z = Math.cos(angle) * 0.12;
      finger.userData.baseAngle = angle;
      finger.userData.openAngle = 0.6;
      claw.add(finger);
    }
    claw.position.y = -0.09;
    clawGroup.add(claw);

    scene.add(clawGroup);

    // Physics body for claw (kinematic)
    clawBody = new C.Body({ mass: 0, type: C.Body.KINEMATIC });
    clawBody.addShape(new C.Sphere(0.28));
    world.addBody(clawBody);
  }

  function _resetClaw() {
    clawX = 0; clawZ = 0;
    dropY = 0;
    clawOpen = 1.0;
    grabbed = null;
    dropPhase = 0;
    gameState = 'idle';
    _updateClawPose();
  }

  function _updateClawPose() {
    if (!clawGroup) return;
    const worldY = CLAW_REST_Y - dropY;
    clawGroup.position.set(clawX, worldY, clawZ);
    clawBody.position.set(clawX, worldY - 0.4, clawZ);

    // Arm length
    const armLen = 2.5 - dropY * 0.0;
    clawArm.scale.y = 1 + dropY / 1.2;
    clawArm.position.y = 1.25 + dropY * 0.5;

    // Fingers open/close
    claw.children.forEach(finger => {
      const ba = finger.userData.baseAngle;
      const oa = finger.userData.openAngle * clawOpen;
      finger.rotation.x = Math.cos(ba) * oa;
      finger.rotation.z = -Math.sin(ba) * oa;
    });
  }

  // ── Prizes ───────────────────────────────────────────────
  function _spawnPrizes() {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const def = PRIZE_DEFS[i % PRIZE_DEFS.length];
      _spawnPrize(def, null, null);
    }
    // Let them settle
  }

  function _spawnPrize(def, forcedX, forcedZ) {
    const hw = MACHINE.w/2 - 0.35;
    const hd = MACHINE.d/2 - 0.35;
    const x = forcedX !== null ? forcedX : (Math.random()-0.5) * hw * 2;
    const z = forcedZ !== null ? forcedZ : (Math.random()-0.5) * hd * 2;
    const y = FLOOR_Y + def.radius + 0.5 + Math.random() * 1.2;

    // Three.js mesh
    let geo, mat;
    if (def.type === 'orb') {
      geo = new THREE.SphereGeometry(def.radius, 20, 20);
      mat = new THREE.MeshPhysicalMaterial({
        color: def.color,
        transparent: true, opacity: 0.78,
        roughness: 0.05, metalness: 0,
        transmission: 0.6, thickness: 0.5,
        emissive: def.glow, emissiveIntensity: 0.25
      });
    } else {
      geo = new THREE.SphereGeometry(def.radius, 12, 12);
      mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8, metalness: 0.0, emissive: def.glow, emissiveIntensity:0.1 });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    mesh.userData.prizeDef = def;
    scene.add(mesh);

    // Emoji sprite
    const sprite = _makeEmojiSprite(def.emoji, def.radius);
    sprite.position.set(0, 0, 0);
    mesh.add(sprite);

    // Glow halo
    const haloGeo = new THREE.SphereGeometry(def.radius * 1.25, 12, 12);
    const haloMat = new THREE.MeshBasicMaterial({ color:def.glow, transparent:true, opacity:0.08, side:THREE.BackSide });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    mesh.add(halo);

    // Physics
    const body = new C.Body({
      mass: 0.5,
      shape: new C.Sphere(def.radius),
      linearDamping: 0.4,
      angularDamping: 0.5
    });
    body.position.set(x, y, z);
    body.velocity.set((Math.random()-0.5)*0.5, 0, (Math.random()-0.5)*0.5);
    world.addBody(body);

    prizes.push({ mesh, body, def, grabbed: false });
    meshBodies.push({ mesh, body });
  }

  function _makeEmojiSprite(emoji, size) {
    const cvs = document.createElement('canvas');
    cvs.width = 128; cvs.height = 128;
    const ctx = cvs.getContext('2d');
    ctx.font = '80px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 64);
    const tex = new THREE.CanvasTexture(cvs);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size * 1.6, size * 1.6, 1);
    return sprite;
  }

  // ── Keys ─────────────────────────────────────────────────
  function _bindKeys() {
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
  }
  function _unbindKeys() {
    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup',   _onKeyUp);
  }

  function _onKeyDown(e) {
    keyMap[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); _triggerDrop(); }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'BracketLeft')  { camDist = Math.max(3.5, camDist - 0.3); _setCameraPos(); }
    if (e.code === 'BracketRight') { camDist = Math.min(9,   camDist + 0.3); _setCameraPos(); }
  }
  function _onKeyUp(e)   { keyMap[e.code] = false; }

  function _triggerDrop() {
    if (gameState !== 'idle') return;
    if (tries <= 0) return;
    tries--;
    _updateUI();
    gameState = 'dropping';
    dropPhase = 0;
    dropY = 0;
    clawOpen = 1.0;
  }

  // ── Game loop ─────────────────────────────────────────────
  function _loop(ts) {
    animId = requestAnimationFrame(_loop);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (introAnim) {
      introCamAngle += dt * 0.5;
      camAngle = introCamAngle;
      _setCameraPos();
      if (introCamAngle > Math.PI * 0.4) introAnim = false;
    }

    _handleMovement(dt);
    _handleDrop(dt);
    _syncPhysics(dt);
    _animatePrizes(now);
    _handleCamKeys();
    renderer.render(scene, camera);
  }

  function _handleCamKeys() {
    let changed = false;
    if (keyMap['KeyQ']) { camAngle -= 0.025; changed = true; }
    if (keyMap['KeyE']) { camAngle += 0.025; changed = true; }
    if (changed) _setCameraPos();
  }

  function _handleMovement(dt) {
    if (gameState !== 'idle') return;
    const speed = 1.4;
    const hw = MACHINE.w/2 - 0.2;
    const hd = MACHINE.d/2 - 0.2;

    let dx = 0, dz = 0;
    if (keyMap['ArrowUp'])    { dz -= speed * dt; }
    if (keyMap['ArrowDown'])  { dz += speed * dt; }
    if (keyMap['ArrowLeft'])  { dx -= speed * dt; }
    if (keyMap['ArrowRight']) { dx += speed * dt; }

    clawX = Math.max(-hw, Math.min(hw, clawX + dx));
    clawZ = Math.max(-hd, Math.min(hd, clawZ + dz));
    _updateClawPose();
  }

  function _handleDrop(dt) {
    if (gameState === 'dropping') {
      // Phase 0: lower
      const bottomY = DROP_BOTTOM;
      const maxDrop = CLAW_REST_Y - bottomY;
      dropY += dt * 1.6;
      if (dropY >= maxDrop) {
        dropY = maxDrop;
        gameState = 'grabbing';
        dropTimer = 0;
        clawOpen = 1.0;
      }
      _updateClawPose();
    }
    else if (gameState === 'grabbing') {
      dropTimer += dt;
      clawOpen = Math.max(0, 1.0 - dropTimer * 2.5);
      _updateClawPose();
      // Try to grab nearby prize
      if (dropTimer > 0.1 && !grabbed) {
        grabbed = _tryGrab();
      }
      if (dropTimer >= 0.5) {
        gameState = 'retracting';
        dropTimer = 0;
      }
    }
    else if (gameState === 'retracting') {
      dropY -= dt * 1.8;
      if (grabbed) {
        grabbed.mesh.position.set(clawX, CLAW_REST_Y - dropY - 0.3, clawZ);
        grabbed.body.position.copy(grabbed.mesh.position);
        grabbed.body.velocity.set(0,0,0);
      }
      if (dropY <= 0) {
        dropY = 0;
        gameState = 'releasing';
        dropTimer = 0;
        _updateClawPose();
        if (grabbed) _scoreGrab();
      }
    }
    else if (gameState === 'releasing') {
      dropTimer += dt;
      clawOpen = Math.min(1, dropTimer * 3);
      _updateClawPose();
      if (dropTimer >= 0.5) {
        if (grabbed) {
          grabbed.grabbed = false;
          grabbed = null;
        }
        gameState = tries <= 0 ? 'gameover' : 'idle';
        if (gameState === 'gameover') {
          setTimeout(_showGameOver, 600);
        }
      }
    }
  }

  function _tryGrab() {
    const clawWorldY = CLAW_REST_Y - dropY;
    const cx = clawX, cy = clawWorldY - 0.4, cz = clawZ;
    let best = null, bestDist = 0.45;

    prizes.forEach(p => {
      if (p.grabbed) return;
      const dx = p.mesh.position.x - cx;
      const dy = p.mesh.position.y - cy;
      const dz = p.mesh.position.z - cz;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist < bestDist) { bestDist = dist; best = p; }
    });

    if (best) {
      best.grabbed = true;
      best.body.type = C.Body.KINEMATIC;
      return best;
    }

    // Partial grab chance based on proximity
    const closestDist = prizes.reduce((acc, p) => {
      if (p.grabbed) return acc;
      const dx = p.mesh.position.x - cx;
      const dy = p.mesh.position.y - cy;
      const dz = p.mesh.position.z - cz;
      return Math.min(acc, Math.sqrt(dx*dx+dy*dy+dz*dz));
    }, 99);

    // Slip chance: if close but not grabbed, slight nudge
    if (closestDist < 0.7) {
      prizes.forEach(p => {
        if (p.grabbed) return;
        const dx = p.mesh.position.x - cx;
        const dz2 = p.mesh.position.z - cz;
        const d = Math.sqrt(dx*dx+dz2*dz2);
        if (d < 0.7) p.body.velocity.set((Math.random()-0.5)*2,(Math.random())*1.5,(Math.random()-0.5)*2);
      });
    }
    return null;
  }

  function _scoreGrab() {
    if (!grabbed) return;
    const def = grabbed.def;
    score += def.pts;
    _updateUI();
    _showToast(`${def.emoji}  +${def.pts} pts  —  ${def.label}!`);

    // Remove from prizes array and scene
    scene.remove(grabbed.mesh);
    world.removeBody(grabbed.body);
    prizes = prizes.filter(p => p !== grabbed);
    meshBodies = meshBodies.filter(mb => mb.body !== grabbed.body);

    // Submit to HS if new best
    if (window.HS) window.HS.promptSubmit('claw', score, `${score} pts`);
  }

  function _syncPhysics(dt) {
    world.step(1/60, dt, 3);
    meshBodies.forEach(({ mesh, body }) => {
      if (!prizes.find(p => p.mesh === mesh && p.grabbed)) {
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
      }
    });
  }

  function _animatePrizes(now) {
    prizes.forEach(p => {
      if (!p.grabbed && p.def.type === 'orb') {
        const h = p.mesh.children.find(c => c.isMesh);
        if (h) h.material.emissiveIntensity = 0.2 + 0.15 * Math.sin(now * 0.002 + p.mesh.position.x * 5);
      }
    });
    // Always face sprites toward camera
    prizes.forEach(p => {
      p.mesh.children.forEach(c => {
        if (c.isSprite) c.rotation.set(0, 0, 0);
      });
    });
  }

  return { init, destroy };
})();
