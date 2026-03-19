// ============================================================
// CLAW MACHINE — claw.js
// 3D claw machine · Three.js r128 + Cannon-es physics
// ============================================================

export default (() => {

  let C = null; // Cannon-es namespace

  // ── State ──────────────────────────────────────────────────
  let renderer, scene, camera, world;
  let clawGroup, clawWire, clawHub, clawFingers = [];
  let prizes = [], meshBodies = [];
  let animId = null;
  let gameState = 'idle'; // idle | dropping | grabbing | retracting | releasing | gameover
  let tries = 20, score = 0;
  let clawOpen = 1.0;
  let dropY = 0, dropTimer = 0;
  let grabbed = null;
  let clawX = 0, clawZ = 0;
  let clawBody = null;

  // Camera
  let camAngle = 0.3, camDist = 6.0, camPitch = 2.8;
  let mouseDown = false, lastMouseX = 0, lastMouseY = 0;

  let keyMap = {};
  let canvasEl = null, screenEl = null;
  let introAnim = true, introCamAngle = 0;
  let lastTime = 0;

  // ── Prize defs ─────────────────────────────────────────────
  const PRIZE_DEFS = [
    { emoji:'🦄', label:'Unicorn Orb',   color:0xff88ff, pts:100, glow:0xff00ff, radius:0.22, type:'orb'   },
    { emoji:'⭐', label:'Star Orb',      color:0xffee44, pts: 75, glow:0xffcc00, radius:0.20, type:'orb'   },
    { emoji:'🐸', label:'Frog Orb',      color:0x44ff88, pts: 60, glow:0x00ff44, radius:0.21, type:'orb'   },
    { emoji:'🔥', label:'Fire Orb',      color:0xff6622, pts: 80, glow:0xff3300, radius:0.21, type:'orb'   },
    { emoji:'💎', label:'Diamond Orb',   color:0x88eeff, pts: 90, glow:0x00eeff, radius:0.19, type:'orb'   },
    { emoji:'🐙', label:'Octopus Orb',   color:0xcc88ff, pts: 70, glow:0xaa00ff, radius:0.23, type:'orb'   },
    { emoji:'🌈', label:'Rainbow Orb',   color:0xff99cc, pts: 85, glow:0xff66aa, radius:0.20, type:'orb'   },
    { emoji:'🐻', label:'Bear Plush',    color:0xcc8855, pts: 50, glow:0x885533, radius:0.25, type:'plush' },
    { emoji:'🐱', label:'Cat Plush',     color:0xffcc88, pts: 40, glow:0xff9944, radius:0.24, type:'plush' },
    { emoji:'🐶', label:'Dog Plush',     color:0xddaa66, pts: 45, glow:0xbb7733, radius:0.24, type:'plush' },
    { emoji:'🍀', label:'Lucky Clover',  color:0x33cc66, pts: 55, glow:0x009933, radius:0.18, type:'orb'   },
    { emoji:'🎀', label:'Pink Bow',      color:0xff66aa, pts: 35, glow:0xff0077, radius:0.20, type:'plush' },
  ];

  const MACHINE     = { w:2.8, h:3.2, d:2.8 };
  const FLOOR_Y     = -1.0;
  const RAIL_Y      =  1.1;
  const CLAW_REST_Y = RAIL_Y - 0.15;
  const DROP_BOTTOM = FLOOR_Y + 0.28;
  const GRAB_RADIUS = 0.55;

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    screenEl = document.getElementById('claw-screen');
    if (!screenEl) return;

    if (!C) {
      try {
        C = await import('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js');
      } catch(e) {
        C = window.CANNON;
      }
    }

    screenEl.innerHTML = '';
    _buildUI();
    _initThree();
    _initPhysics();
    _buildMachine();
    _spawnPrizes();
    _resetClaw();
    _bindEvents();

    gameState = 'idle';
    introAnim = true; introCamAngle = 0;
    tries = 20; score = 0;
    _updateUI();
    lastTime = performance.now();
    _loop();
  }

  function destroy() {
    _unbindEvents();
    if (animId) cancelAnimationFrame(animId);
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; world = null;
    prizes = []; meshBodies = [];
  }

  // ── UI ─────────────────────────────────────────────────────
  function _buildUI() {
    const ui = document.createElement('div');
    ui.id = 'claw-ui';
    ui.innerHTML = `
      <div id="claw-hud">
        <div class="claw-stat"><span class="claw-stat-label">SCORE</span><span id="claw-score">0</span></div>
        <div class="claw-stat"><span class="claw-stat-label">TRIES</span><span id="claw-tries">20</span></div>
      </div>
      <div id="claw-prize-toast"></div>
      <div id="claw-controls-panel">
        <div class="claw-ctrl-title">🎮 CONTROLS</div>
        <div class="claw-ctrl-row"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> <span>Move claw</span></div>
        <div class="claw-ctrl-row"><kbd>SPACE</kbd> <span>Drop &amp; grab</span></div>
        <div class="claw-ctrl-row"><span style="color:#cc88ff">Right-drag</span> <span>Rotate camera</span></div>
        <div class="claw-ctrl-row"><span style="color:#cc88ff">Scroll wheel</span> <span>Zoom</span></div>
      </div>
      <div id="claw-gameover" class="hidden">
        <div class="claw-go-box">
          <div class="claw-go-title">GAME OVER</div>
          <div class="claw-go-score">Score: <span id="claw-go-pts">0</span></div>
          <button onclick="window._clawSubmitHS()">🏆 Submit Score</button>
          <button onclick="window.backToGameSelect()">🏠 Menu</button>
        </div>
      </div>
      <canvas id="claw-canvas"></canvas>
    `;

    if (!document.getElementById('claw-styles')) {
      const s = document.createElement('style');
      s.id = 'claw-styles';
      s.textContent = `
        #claw-screen{position:relative;width:100%;height:100%;background:#0a0015;overflow:hidden;font-family:'Orbitron',monospace;}
        #claw-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;cursor:default;}
        #claw-canvas.dragging{cursor:grabbing;}
        #claw-hud{position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:32px;z-index:10;pointer-events:none;}
        .claw-stat{background:rgba(0,0,0,0.6);border:1px solid rgba(255,100,255,0.4);border-radius:8px;padding:8px 20px;text-align:center;backdrop-filter:blur(4px);}
        .claw-stat-label{display:block;font-size:9px;letter-spacing:3px;color:#aa77ff;margin-bottom:2px;}
        #claw-score,#claw-tries{font-size:26px;font-weight:900;color:#fff;text-shadow:0 0 12px #cc44ff;}
        #claw-prize-toast{position:absolute;top:90px;left:50%;transform:translateX(-50%);z-index:20;pointer-events:none;}
        .claw-toast{background:rgba(0,0,0,0.8);border:1px solid rgba(255,200,50,0.6);border-radius:10px;padding:10px 24px;color:#ffe44a;font-size:15px;font-weight:700;letter-spacing:2px;text-align:center;margin-bottom:6px;animation:claw-tin 0.3s ease,claw-tout 0.4s ease 1.6s forwards;white-space:nowrap;}
        @keyframes claw-tin{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes claw-tout{from{opacity:1}to{opacity:0;transform:translateY(-8px)}}
        #claw-controls-panel{position:absolute;bottom:20px;right:20px;background:rgba(0,0,0,0.65);border:1px solid rgba(255,100,255,0.25);border-radius:10px;padding:14px 18px;z-index:10;pointer-events:none;backdrop-filter:blur(4px);}
        .claw-ctrl-title{font-size:10px;letter-spacing:3px;color:#cc88ff;margin-bottom:10px;}
        .claw-ctrl-row{font-size:11px;color:#ccc;margin-bottom:6px;display:flex;align-items:center;gap:6px;}
        kbd{background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);border-radius:4px;padding:2px 6px;font-size:10px;color:#fff;font-family:inherit;}
        #claw-gameover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:30;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);}
        #claw-gameover.hidden{display:none;}
        .claw-go-box{background:linear-gradient(135deg,#1a0030,#0d001a);border:1px solid rgba(200,100,255,0.5);border-radius:16px;padding:40px 56px;text-align:center;box-shadow:0 0 60px rgba(150,0,255,0.3);}
        .claw-go-title{font-size:32px;font-weight:900;letter-spacing:6px;color:#fff;text-shadow:0 0 20px #cc44ff;margin-bottom:16px;}
        .claw-go-score{font-size:18px;color:#cc88ff;margin-bottom:28px;letter-spacing:2px;}
        .claw-go-box button{display:block;width:100%;margin-bottom:12px;padding:12px 24px;border:1px solid rgba(255,100,255,0.5);border-radius:8px;background:rgba(255,100,255,0.1);color:#fff;font-family:'Orbitron',monospace;font-size:13px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;}
        .claw-go-box button:hover{background:rgba(255,100,255,0.25);border-color:rgba(255,100,255,0.8);}
      `;
      document.head.appendChild(s);
    }

    if (!document.getElementById('orbitron-font')) {
      const lnk = document.createElement('link');
      lnk.id = 'orbitron-font'; lnk.rel = 'stylesheet';
      lnk.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap';
      document.head.appendChild(lnk);
    }

    screenEl.appendChild(ui);
  }

  function _updateUI() {
    const sc = document.getElementById('claw-score');
    const tr = document.getElementById('claw-tries');
    if (sc) sc.textContent = score;
    if (tr) tr.textContent = tries;
  }

  function _showToast(txt) {
    const c = document.getElementById('claw-prize-toast');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'claw-toast';
    el.textContent = txt;
    c.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  }

  function _showGameOver() {
    const go  = document.getElementById('claw-gameover');
    const pts = document.getElementById('claw-go-pts');
    if (go) go.classList.remove('hidden');
    if (pts) pts.textContent = score;
    window._clawSubmitHS = () => { if (window.HS) window.HS.promptSubmit('claw', score, `${score} pts`); };
  }

  // ── Three.js ───────────────────────────────────────────────
  function _initThree() {
    canvasEl = document.getElementById('claw-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x080012);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0018, 0.055);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
    _setCameraPos();

    // Bright enough to illuminate emoji planes
    scene.add(new THREE.AmbientLight(0x554466, 1.4));

    const spot = new THREE.SpotLight(0xffffff, 3.8, 14, Math.PI/4.2, 0.3);
    spot.position.set(0, 6.5, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot);

    const fillL = new THREE.PointLight(0xff66ff, 1.6, 14);
    fillL.position.set(-2.5, 1.5, -2.5);
    scene.add(fillL);

    const fillR = new THREE.PointLight(0x66aaff, 1.3, 14);
    fillR.position.set(2.5, 1, 2.5);
    scene.add(fillR);

    // Extra fill from below to illuminate emoji
    const under = new THREE.PointLight(0xffffff, 0.8, 8);
    under.position.set(0, FLOOR_Y + 0.5, 0);
    scene.add(under);

    // Stars
    const sg = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 1000; i++) sp.push((Math.random()-0.5)*80,(Math.random()-0.5)*80,(Math.random()-0.5)*80);
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color:0xffffff, size:0.09, transparent:true, opacity:0.4 })));

    _handleResize();
    window.addEventListener('resize', _handleResize);
  }

  function _setCameraPos() {
    if (!camera) return;
    const cx = Math.sin(camAngle) * camDist;
    const cz = Math.cos(camAngle) * camDist;
    camera.position.set(cx, camPitch, cz);
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

  // ── Physics ────────────────────────────────────────────────
  function _initPhysics() {
    world = new C.World({ gravity: new C.Vec3(0, -9.82, 0) });
    world.broadphase = new C.NaiveBroadphase();
    world.solver.iterations = 12;
    world.defaultContactMaterial.friction = 0.4;
    world.defaultContactMaterial.restitution = 0.25;
  }

  // ── Machine ────────────────────────────────────────────────
  function _buildMachine() {
    const hw = MACHINE.w/2, hd = MACHINE.d/2;

    const glassMat = new THREE.MeshPhysicalMaterial({
      color:0x88aaff, transparent:true, opacity:0.10,
      roughness:0, metalness:0, transmission:0.92,
      thickness:0.08, side:THREE.DoubleSide, depthWrite:false
    });
    const frameMat = new THREE.MeshStandardMaterial({ color:0x220044, metalness:0.85, roughness:0.2 });
    const edgeMat  = new THREE.MeshStandardMaterial({ color:0xcc44ff, emissive:0xcc44ff, emissiveIntensity:0.7, metalness:0.9, roughness:0.1 });

    // Floor
    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(MACHINE.w, 0.08, MACHINE.d),
      new THREE.MeshStandardMaterial({ color:0x110022, roughness:0.4, metalness:0.3, emissive:0x220033, emissiveIntensity:0.3 })
    );
    floorMesh.position.y = FLOOR_Y - 0.04;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const floorBody = new C.Body({ mass:0, shape: new C.Plane() });
    floorBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
    floorBody.position.set(0, FLOOR_Y, 0);
    world.addBody(floorBody);

    // Walls (physics only)
    const wallDefs = [
      { pos:[0,0, hd+0.01], euler:[0,0,0],         size:[hw*2+0.1,2.2,0.05] },
      { pos:[0,0,-hd-0.01], euler:[0,0,0],         size:[hw*2+0.1,2.2,0.05] },
      { pos:[hw+0.01,0,0],  euler:[0,Math.PI/2,0], size:[hd*2+0.1,2.2,0.05] },
      { pos:[-hw-0.01,0,0], euler:[0,Math.PI/2,0], size:[hd*2+0.1,2.2,0.05] },
    ];
    wallDefs.forEach(w => {
      const b = new C.Body({ mass:0 });
      b.addShape(new C.Box(new C.Vec3(w.size[0]/2, w.size[1]/2, w.size[2]/2)));
      b.position.set(...w.pos);
      b.quaternion.setFromEuler(...w.euler);
      world.addBody(b);
    });

    // Glass panels (visual)
    [[0,0.1,hd],[0,0.1,-hd]].forEach(pos => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w, MACHINE.h, 0.04), glassMat);
      m.position.set(...pos); scene.add(m);
    });
    [[hw,0.1,0],[-hw,0.1,0]].forEach(pos => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, MACHINE.h, MACHINE.d), glassMat);
      m.position.set(...pos); scene.add(m);
    });

    // Glowing frame edges
    const edgeDefs = [
      [[ hw,0, hd],[0.07,MACHINE.h,0.07]], [[-hw,0, hd],[0.07,MACHINE.h,0.07]],
      [[ hw,0,-hd],[0.07,MACHINE.h,0.07]], [[-hw,0,-hd],[0.07,MACHINE.h,0.07]],
      [[0,MACHINE.h/2, hd],[MACHINE.w,0.07,0.07]], [[0,MACHINE.h/2,-hd],[MACHINE.w,0.07,0.07]],
      [[ hw,MACHINE.h/2,0],[0.07,0.07,MACHINE.d]], [[-hw,MACHINE.h/2,0],[0.07,0.07,MACHINE.d]],
      [[0,-MACHINE.h/2, hd],[MACHINE.w,0.07,0.07]], [[0,-MACHINE.h/2,-hd],[MACHINE.w,0.07,0.07]],
      [[ hw,-MACHINE.h/2,0],[0.07,0.07,MACHINE.d]], [[-hw,-MACHINE.h/2,0],[0.07,0.07,MACHINE.d]],
    ];
    edgeDefs.forEach(([pos,size]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), edgeMat);
      m.position.set(...pos); scene.add(m);
    });

    // Top cap + rail
    const top = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w+0.1, 0.1, MACHINE.d+0.1), frameMat);
    top.position.y = MACHINE.h/2 + 0.02; scene.add(top);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w-0.1, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color:0xcccccc, metalness:0.95, roughness:0.05 }));
    rail.position.set(0, RAIL_Y, 0); scene.add(rail);

    // Neon sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.32, 0.1),
      new THREE.MeshStandardMaterial({ color:0xff44aa, emissive:0xff44aa, emissiveIntensity:2.0, roughness:0.1, metalness:0.7 }));
    sign.position.set(0, MACHINE.h/2 + 0.38, MACHINE.d/2 - 0.05);
    scene.add(sign);
    const signLight = new THREE.PointLight(0xff44aa, 2.2, 5);
    signLight.position.copy(sign.position);
    scene.add(signLight);

    _buildClaw();
  }

  // ── Claw ───────────────────────────────────────────────────
  function _buildClaw() {
    clawGroup = new THREE.Group();
    scene.add(clawGroup);

    const metalMat = new THREE.MeshStandardMaterial({ color:0xc0c0c0, metalness:0.95, roughness:0.08 });
    const darkMat  = new THREE.MeshStandardMaterial({ color:0x777777, metalness:0.90, roughness:0.18 });

    // Cable — scales vertically as claw descends
    clawWire = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8), metalMat);
    clawWire.position.y = 0.5;
    clawGroup.add(clawWire);

    // Motor housing (hub)
    clawHub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.10, 0.22, 16), darkMat);
    clawHub.position.y = 0;
    clawGroup.add(clawHub);

    // Decorative ring at base of hub
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 8, 24), metalMat);
    ring.rotation.x = Math.PI/2;
    ring.position.y = -0.115;
    clawGroup.add(ring);

    // 3 fingers
    clawFingers = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.sin(angle) * 0.105, -0.115, Math.cos(angle) * 0.105);
      pivot.userData.baseAngle = angle;
      clawGroup.add(pivot);

      // Upper arm
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.30, 8), metalMat);
      upper.position.y = -0.15;
      pivot.add(upper);

      // Curved tip — angled inward
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.011, 0.28, 8), metalMat);
      lower.position.set(0, -0.33, 0.04);
      lower.rotation.x = 0.6; // curves inward
      pivot.add(lower);

      // Claw tip cap
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), metalMat);
      tip.position.set(0, -0.52, 0.10);
      pivot.add(tip);

      clawFingers.push(pivot);
    }

    // Physics sphere at claw tip
    clawBody = new C.Body({ mass:0, type: C.Body.KINEMATIC });
    clawBody.addShape(new C.Sphere(0.24));
    world.addBody(clawBody);
  }

  function _resetClaw() {
    clawX = 0; clawZ = 0; dropY = 0;
    clawOpen = 1.0; grabbed = null; dropTimer = 0;
    gameState = 'idle';
    _updateClawPose();
  }

  function _updateClawPose() {
    if (!clawGroup) return;

    const hubY = CLAW_REST_Y - dropY;
    clawGroup.position.set(clawX, hubY, clawZ);

    // Stretch cable from rail down to hub
    const wireLen = Math.max(0.05, RAIL_Y - hubY);
    clawWire.scale.y = wireLen;
    clawWire.position.y = wireLen / 2;

    // Physics body at claw tip
    clawBody.position.set(clawX, hubY - 0.40, clawZ);

    // Fingers: 1 = spread open, 0 = closed/curled in
    const spread = clawOpen * 0.65;
    clawFingers.forEach(pivot => {
      const ba = pivot.userData.baseAngle;
      pivot.rotation.x =  Math.cos(ba) * spread;
      pivot.rotation.z = -Math.sin(ba) * spread;
    });
  }

  // ── Prizes ─────────────────────────────────────────────────
  function _spawnPrizes() {
    for (let i = 0; i < 18; i++) _spawnPrize(PRIZE_DEFS[i % PRIZE_DEFS.length]);
  }

  function _spawnPrize(def) {
    const hw = MACHINE.w/2 - 0.38;
    const hd = MACHINE.d/2 - 0.38;
    const x  = (Math.random()-0.5) * hw * 2;
    const z  = (Math.random()-0.5) * hd * 2;
    const y  = FLOOR_Y + def.radius + 0.3 + Math.random() * 1.3;

    // Glass orb shell — reduced opacity so emoji shows through
    let geo, mat;
    if (def.type === 'orb') {
      geo = new THREE.SphereGeometry(def.radius, 24, 24);
      mat = new THREE.MeshPhysicalMaterial({
        color: def.color,
        transparent: true, opacity: 0.50,
        roughness: 0.03, metalness: 0,
        transmission: 0.45, thickness: 0.25,
        emissive: def.glow, emissiveIntensity: 0.28,
        side: THREE.FrontSide, depthWrite: false,
      });
    } else {
      geo = new THREE.SphereGeometry(def.radius, 14, 14);
      mat = new THREE.MeshStandardMaterial({ color:def.color, roughness:0.72, metalness:0.0, emissive:def.glow, emissiveIntensity:0.18 });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    scene.add(mesh);

    // ── Emoji billboard (MeshBasicMaterial — unaffected by scene lighting) ──
    const emojiTex = _makeEmojiTexture(def.emoji);
    const emojiMat = new THREE.MeshBasicMaterial({
      map: emojiTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const planeSz = def.radius * 1.05;
    const emojiPlane = new THREE.Mesh(new THREE.PlaneGeometry(planeSz * 2, planeSz * 2), emojiMat);
    emojiPlane.renderOrder = 2;
    mesh.add(emojiPlane);

    // Outer glow halo
    const haloMat = new THREE.MeshBasicMaterial({ color:def.glow, transparent:true, opacity:0.12, side:THREE.BackSide, depthWrite:false });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(def.radius * 1.30, 12, 12), haloMat);
    mesh.add(halo);

    // Physics
    const body = new C.Body({ mass:0.5, linearDamping:0.42, angularDamping:0.55 });
    body.addShape(new C.Sphere(def.radius));
    body.position.set(x, y, z);
    body.velocity.set((Math.random()-0.5)*0.5, 0, (Math.random()-0.5)*0.5);
    world.addBody(body);

    prizes.push({ mesh, body, def, grabbed:false, emojiPlane });
    meshBodies.push({ mesh, body });
  }

  function _makeEmojiTexture(emoji) {
    const size = 256;
    const cvs  = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx  = cvs.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.font = `${Math.floor(size * 0.70)}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size/2, size/2 + 4);
    return new THREE.CanvasTexture(cvs);
  }

  // ── Events ─────────────────────────────────────────────────
  function _bindEvents() {
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
    if (canvasEl) {
      canvasEl.addEventListener('mousedown',   _onMouseDown);
      canvasEl.addEventListener('mousemove',   _onMouseMove);
      canvasEl.addEventListener('mouseup',     _onMouseUp);
      canvasEl.addEventListener('mouseleave',  _onMouseUp);
      canvasEl.addEventListener('wheel',       _onWheel, { passive:false });
      canvasEl.addEventListener('contextmenu', e => e.preventDefault());
    }
  }

  function _unbindEvents() {
    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup',   _onKeyUp);
    if (canvasEl) {
      canvasEl.removeEventListener('mousedown',  _onMouseDown);
      canvasEl.removeEventListener('mousemove',  _onMouseMove);
      canvasEl.removeEventListener('mouseup',    _onMouseUp);
      canvasEl.removeEventListener('mouseleave', _onMouseUp);
      canvasEl.removeEventListener('wheel',      _onWheel);
    }
  }

  function _onMouseDown(e) {
    if (e.button !== 2) return;
    mouseDown = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvasEl.classList.add('dragging');
    e.preventDefault();
  }

  function _onMouseMove(e) {
    if (!mouseDown) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    camAngle += dx * 0.007;
    camPitch   = Math.max(0.8, Math.min(5.5, camPitch - dy * 0.012));
    _setCameraPos();
  }

  function _onMouseUp() {
    mouseDown = false;
    if (canvasEl) canvasEl.classList.remove('dragging');
  }

  function _onWheel(e) {
    e.preventDefault();
    camDist = Math.max(3.0, Math.min(10, camDist + e.deltaY * 0.008));
    _setCameraPos();
  }

  function _onKeyDown(e) {
    keyMap[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); _triggerDrop(); }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  }

  function _onKeyUp(e) { keyMap[e.code] = false; }

  function _triggerDrop() {
    if (gameState !== 'idle' || tries <= 0) return;
    tries--;
    _updateUI();
    gameState = 'dropping';
    dropY = 0; clawOpen = 1.0; dropTimer = 0;
  }

  // ── Game loop ──────────────────────────────────────────────
  function _loop() {
    animId = requestAnimationFrame(_loop);
    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;

    if (introAnim) {
      introCamAngle += dt * 0.45;
      camAngle = introCamAngle;
      _setCameraPos();
      if (introCamAngle > Math.PI * 0.45) introAnim = false;
    }

    _handleMovement(dt);
    _handleDrop(dt);
    _syncPhysics(dt);
    _animateScene(now);
    renderer.render(scene, camera);
  }

  function _handleMovement(dt) {
    if (gameState !== 'idle') return;
    const speed = 1.5;
    const hw = MACHINE.w/2 - 0.22;
    const hd = MACHINE.d/2 - 0.22;
    if (keyMap['ArrowUp'])    clawZ -= speed * dt;
    if (keyMap['ArrowDown'])  clawZ += speed * dt;
    if (keyMap['ArrowLeft'])  clawX -= speed * dt;
    if (keyMap['ArrowRight']) clawX += speed * dt;
    clawX = Math.max(-hw, Math.min(hw, clawX));
    clawZ = Math.max(-hd, Math.min(hd, clawZ));
    _updateClawPose();
  }

  function _handleDrop(dt) {
    if (gameState === 'dropping') {
      const maxDrop = CLAW_REST_Y - DROP_BOTTOM;
      dropY = Math.min(dropY + dt * 1.8, maxDrop);
      _updateClawPose();
      if (dropY >= maxDrop) {
        gameState = 'grabbing';
        dropTimer = 0;
        clawOpen  = 1.0;
      }
    }
    else if (gameState === 'grabbing') {
      dropTimer += dt;
      clawOpen = Math.max(0, 1.0 - dropTimer * 2.8);
      _updateClawPose();
      if (dropTimer > 0.15 && !grabbed) grabbed = _tryGrab();
      if (dropTimer >= 0.55) {
        gameState = 'retracting';
        dropTimer = 0;
      }
    }
    else if (gameState === 'retracting') {
      dropY = Math.max(0, dropY - dt * 2.0);
      _updateClawPose();
      if (grabbed) {
        const tipY = (CLAW_REST_Y - dropY) - 0.42;
        grabbed.mesh.position.set(clawX, tipY, clawZ);
        grabbed.body.position.set(clawX, tipY, clawZ);
        grabbed.body.velocity.set(0, 0, 0);
        grabbed.body.angularVelocity.set(0, 0, 0);
      }
      if (dropY <= 0) {
        gameState = 'releasing';
        dropTimer = 0;
        if (grabbed) _scoreGrab();
      }
    }
    else if (gameState === 'releasing') {
      dropTimer += dt;
      clawOpen = Math.min(1, dropTimer * 3.5);
      _updateClawPose();
      if (dropTimer >= 0.45) {
        if (grabbed) { grabbed.grabbed = false; grabbed = null; }
        gameState = tries <= 0 ? 'gameover' : 'idle';
        if (gameState === 'gameover') setTimeout(_showGameOver, 600);
      }
    }
  }

  function _tryGrab() {
    const tipX = clawX;
    const tipY  = (CLAW_REST_Y - dropY) - 0.42;
    const tipZ  = clawZ;

    let best = null, bestDist = GRAB_RADIUS;
    prizes.forEach(p => {
      if (p.grabbed) return;
      const dx = p.mesh.position.x - tipX;
      const dy = p.mesh.position.y - tipY;
      const dz = p.mesh.position.z - tipZ;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist < bestDist) { bestDist = dist; best = p; }
    });

    if (best) {
      best.grabbed = true;
      best.body.type = C.Body.KINEMATIC;
      best.body.velocity.set(0, 0, 0);
      return best;
    }

    // Nudge nearby prizes for tactile feel
    prizes.forEach(p => {
      if (p.grabbed) return;
      const dx = p.mesh.position.x - tipX;
      const dz = p.mesh.position.z - tipZ;
      if (Math.sqrt(dx*dx+dz*dz) < 0.9)
        p.body.velocity.set((Math.random()-0.5)*2.5, Math.random()*2, (Math.random()-0.5)*2.5);
    });
    return null;
  }

  function _scoreGrab() {
    if (!grabbed) return;
    score += grabbed.def.pts;
    _updateUI();
    _showToast(`${grabbed.def.emoji}  +${grabbed.def.pts} pts  —  ${grabbed.def.label}!`);
    scene.remove(grabbed.mesh);
    world.removeBody(grabbed.body);
    prizes     = prizes.filter(p => p !== grabbed);
    meshBodies = meshBodies.filter(m => m.body !== grabbed.body);
    if (window.HS) window.HS.promptSubmit('claw', score, `${score} pts`);
  }

  function _syncPhysics(dt) {
    world.step(1/60, dt, 3);
    meshBodies.forEach(({ mesh, body }) => {
      const p = prizes.find(p => p.mesh === mesh);
      if (p && p.grabbed) return;
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    });
  }

  function _animateScene(now) {
    prizes.forEach(p => {
      // Billboard emoji toward camera
      if (p.emojiPlane) p.emojiPlane.lookAt(camera.position);
      // Pulse orb glow
      if (!p.grabbed && p.def.type === 'orb')
        p.mesh.material.emissiveIntensity = 0.20 + 0.15 * Math.sin(now * 0.002 + p.mesh.position.x * 4);
    });
  }

  return { init, destroy };
})();
