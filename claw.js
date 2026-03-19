// ============================================================
// CLAW MACHINE — claw.js
// Three.js r128 + Cannon-es physics
// Changes: camera-relative movement, close-on-ball-contact only,
//   cage claw (only lower tips fold in), two-tier floor (play area
//   lower + raised chute shelf), Web Audio sounds
// ============================================================

export default (() => {

  let C = null;
  let audioCtx = null;

  // ── State ──────────────────────────────────────────────────
  let renderer, scene, camera, world;
  let clawGroup, clawWire;
  let clawFingers = [];   // { pivot, lowerGroup }
  let prizes = [], meshBodies = [];
  let animId = null;

  // states: idle | dropping | grabbing | closing | retracting
  //         | delivering | releasing | returning | gameover
  let gameState = 'idle';
  let tries = 20, score = 0;
  let clawOpen = 1.0;        // 1=open, 0=fully closed
  let dropY = 0, dropTimer = 0;
  let grabbed = null;
  let clawX = 0, clawZ = 0;
  let clawBody = null;
  let movingSoundNode = null; // looping movement buzz

  // Two-tier heights
  const PLAY_FLOOR_Y  = -1.2;  // lower tier — balls live here
  const SHELF_Y       = -0.35; // raised shelf — chute lives here
  const SHELF_W       =  1.0;  // shelf width in +X, +Z corner
  const SHELF_D       =  1.0;
  const CHUTE_X       =  (MACHINE_W() / 2) - 0.40; // inside shelf
  const CHUTE_Z       =  (MACHINE_D() / 2) - 0.40;
  const CHUTE_R       =  0.22;

  function MACHINE_W() { return 2.8; }
  function MACHINE_D() { return 2.8; }
  const MACHINE = { w:2.8, h:3.2, d:2.8 };

  const RAIL_Y      =  1.1;
  const CLAW_REST_Y =  RAIL_Y - 0.15;
  // Tips hang ~0.70 below hub; stop tips 0.28 above play floor
  const DROP_BOTTOM =  PLAY_FLOOR_Y + 0.98;
  const GRAB_RADIUS =  0.52;

  // Camera
  let camAngle = 0.3, camDist = 6.4, camPitch = 3.0;
  let mouseDown = false, lastMouseX = 0, lastMouseY = 0;

  let keyMap = {};
  let canvasEl = null, screenEl = null;
  let introAnim = true, introCamAngle = 0;
  let lastTime = 0;
  let wasMoving = false;

  // ── Prize defs ─────────────────────────────────────────────
  const PRIZE_DEFS = [
    { emoji:'🦄', label:'Unicorn Orb',  color:0xdd66ff, pts:100, glow:0xcc00ff, radius:0.21 },
    { emoji:'⭐', label:'Star Orb',     color:0xffdd22, pts: 75, glow:0xffaa00, radius:0.20 },
    { emoji:'🐸', label:'Frog Orb',     color:0x22dd66, pts: 60, glow:0x00bb44, radius:0.21 },
    { emoji:'🔥', label:'Fire Orb',     color:0xff5511, pts: 80, glow:0xff2200, radius:0.20 },
    { emoji:'💎', label:'Diamond Orb',  color:0x44ccff, pts: 90, glow:0x00aaff, radius:0.19 },
    { emoji:'🐙', label:'Octopus Orb',  color:0xaa55ff, pts: 70, glow:0x8800ff, radius:0.22 },
    { emoji:'🌈', label:'Rainbow Orb',  color:0xff77bb, pts: 85, glow:0xff2299, radius:0.20 },
    { emoji:'🐻', label:'Bear Plush',   color:0xbb6633, pts: 50, glow:0x774422, radius:0.24 },
    { emoji:'🐱', label:'Cat Plush',    color:0xffbb66, pts: 40, glow:0xdd7700, radius:0.23 },
    { emoji:'🐶', label:'Dog Plush',    color:0xcc9944, pts: 45, glow:0xaa6622, radius:0.23 },
    { emoji:'🍀', label:'Clover Orb',   color:0x33bb55, pts: 55, glow:0x008833, radius:0.18 },
    { emoji:'🎀', label:'Bow Plush',    color:0xff4499, pts: 35, glow:0xdd0066, radius:0.20 },
  ];

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    screenEl = document.getElementById('claw-screen');
    if (!screenEl) return;
    if (!C) {
      try { C = await import('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js'); }
      catch(e) { C = window.CANNON; }
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
    _stopMoveSound();
    if (animId) cancelAnimationFrame(animId);
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; world = null;
    prizes = []; meshBodies = [];
  }

  // ── Audio (Web Audio API — no external files needed) ───────
  function _getAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
  }

  function _resumeAudio() {
    const ac = _getAudio();
    if (ac && ac.state === 'suspended') ac.resume();
  }

  // Short synth note
  function _playTone(freq, type, duration, vol, attack, decay) {
    const ac = _getAudio(); if (!ac) return;
    const g = ac.createGain();
    const o = ac.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ac.currentTime);
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(vol || 0.3, ac.currentTime + (attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (duration || 0.3));
    o.connect(g); g.connect(ac.destination);
    o.start(ac.currentTime);
    o.stop(ac.currentTime + (duration || 0.3) + 0.05);
  }

  // Mechanical thunk / clunk
  function _playClunk(pitch) {
    const ac = _getAudio(); if (!ac) return;
    const bufSz = Math.floor(ac.sampleRate * 0.12);
    const buf = ac.createBuffer(1, bufSz, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSz; i++) d[i] = (Math.random()*2-1) * Math.exp(-i / (bufSz * 0.08));
    const src = ac.createBufferSource();
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = pitch || 180;
    filt.Q.value = 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.4, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.14);
    src.buffer = buf;
    src.connect(filt); filt.connect(g); g.connect(ac.destination);
    src.start();
  }

  // Win fanfare — ascending arpeggio
  function _playWin() {
    const ac = _getAudio(); if (!ac) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => _playTone(f, 'triangle', 0.22, 0.35, 0.01, 0.2), i * 80);
    });
  }

  // Sad descending tones — missed grab
  function _playMiss() {
    [400, 300, 200].forEach((f, i) => {
      setTimeout(() => _playTone(f, 'sawtooth', 0.18, 0.15, 0.01, 0.15), i * 70);
    });
  }

  // Servo whine loop while claw moves
  function _startMoveSound() {
    const ac = _getAudio(); if (!ac || movingSoundNode) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(620, ac.currentTime);
    g.gain.setValueAtTime(0.04, ac.currentTime);
    o.connect(g); g.connect(ac.destination);
    o.start();
    movingSoundNode = { o, g };
  }

  function _stopMoveSound() {
    if (!movingSoundNode) return;
    try {
      movingSoundNode.g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      movingSoundNode.o.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
    movingSoundNode = null;
  }

  // Drop whir (descending pitch)
  function _playDrop() {
    const ac = _getAudio(); if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(800, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(300, ac.currentTime + 0.5);
    g.gain.setValueAtTime(0.08, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.55);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.6);
  }

  // Claw close click-clack
  function _playClawClose() {
    _playClunk(220);
    setTimeout(() => _playClunk(260), 60);
  }

  // Ball drop thud
  function _playBallDrop() {
    const ac = _getAudio(); if (!ac) return;
    const bufSz = Math.floor(ac.sampleRate * 0.18);
    const buf = ac.createBuffer(1, bufSz, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSz; i++) d[i] = (Math.random()*2-1) * Math.exp(-i / (bufSz*0.12));
    const src = ac.createBufferSource();
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 280;
    const g = ac.createGain(); g.gain.value = 0.6;
    src.buffer = buf;
    src.connect(filt); filt.connect(g); g.connect(ac.destination);
    src.start();
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
        <div class="claw-ctrl-row"><span class="hl">Right-drag</span> <span>Rotate camera</span></div>
        <div class="claw-ctrl-row"><span class="hl">Scroll</span> <span>Zoom</span></div>
      </div>
      <div id="claw-gameover" class="hidden">
        <div class="claw-go-box">
          <div class="claw-go-title">GAME OVER</div>
          <div class="claw-go-score">Final Score: <span id="claw-go-pts">0</span></div>
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
        #claw-screen{position:relative;width:100%;height:100%;background:#080010;overflow:hidden;font-family:'Orbitron',monospace;}
        #claw-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;}
        #claw-canvas.dragging{cursor:grabbing;}
        #claw-hud{position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:28px;z-index:10;pointer-events:none;}
        .claw-stat{background:rgba(0,0,0,0.65);border:1px solid rgba(200,80,255,0.45);border-radius:8px;padding:8px 22px;text-align:center;backdrop-filter:blur(4px);}
        .claw-stat-label{display:block;font-size:9px;letter-spacing:3px;color:#aa55ff;margin-bottom:2px;}
        #claw-score,#claw-tries{font-size:26px;font-weight:900;color:#fff;text-shadow:0 0 14px #cc33ff;}
        #claw-prize-toast{position:absolute;top:88px;left:50%;transform:translateX(-50%);z-index:20;pointer-events:none;}
        .claw-toast{background:rgba(0,0,0,0.85);border:1px solid rgba(255,200,40,0.7);border-radius:10px;padding:10px 26px;color:#ffe040;font-size:15px;font-weight:700;letter-spacing:2px;text-align:center;margin-bottom:6px;animation:ct-in 0.3s ease,ct-out 0.4s ease 1.8s forwards;white-space:nowrap;}
        @keyframes ct-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ct-out{from{opacity:1}to{opacity:0;transform:translateY(-10px)}}
        #claw-controls-panel{position:fixed;bottom:14px;right:14px;background:rgba(0,0,0,0.72);border:1px solid rgba(200,80,255,0.28);border-radius:8px;padding:10px 13px;z-index:9999;pointer-events:none;backdrop-filter:blur(4px);max-width:190px;}
        .claw-ctrl-title{font-size:9px;letter-spacing:2px;color:#cc66ff;margin-bottom:8px;}
        .claw-ctrl-row{font-size:10px;color:#bbb;margin-bottom:5px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
        .hl{color:#cc88ff;font-size:10px;}
        kbd{background:rgba(255,255,255,0.13);border:1px solid rgba(255,255,255,0.3);border-radius:3px;padding:1px 5px;font-size:9px;color:#fff;font-family:inherit;}
        #claw-gameover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:30;background:rgba(0,0,0,0.78);backdrop-filter:blur(7px);}
        #claw-gameover.hidden{display:none;}
        .claw-go-box{background:linear-gradient(135deg,#1a0032,#0c0018);border:1px solid rgba(180,80,255,0.55);border-radius:18px;padding:42px 58px;text-align:center;box-shadow:0 0 70px rgba(140,0,255,0.35);}
        .claw-go-title{font-size:30px;font-weight:900;letter-spacing:5px;color:#fff;text-shadow:0 0 22px #cc33ff;margin-bottom:14px;}
        .claw-go-score{font-size:17px;color:#cc88ff;margin-bottom:28px;letter-spacing:2px;}
        .claw-go-box button{display:block;width:100%;margin-bottom:12px;padding:12px 24px;border:1px solid rgba(200,80,255,0.5);border-radius:8px;background:rgba(200,80,255,0.1);color:#fff;font-family:'Orbitron',monospace;font-size:12px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;}
        .claw-go-box button:hover{background:rgba(200,80,255,0.28);border-color:rgba(200,80,255,0.9);}
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
    setTimeout(() => el.remove(), 2500);
  }

  function _showGameOver() {
    const go  = document.getElementById('claw-gameover');
    const pts = document.getElementById('claw-go-pts');
    if (go) go.classList.remove('hidden');
    if (pts) pts.textContent = score;
    _playTone(220, 'sawtooth', 0.6, 0.2, 0.01, 0.55);
    window._clawSubmitHS = () => {
      if (window.HS) window.HS.promptSubmit('claw', score, `${score} pts`);
    };
  }

  // ── Three.js ───────────────────────────────────────────────
  function _initThree() {
    canvasEl = document.getElementById('claw-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x060010);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080012, 0.046);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
    _setCameraPos();

    scene.add(new THREE.AmbientLight(0x332244, 2.2));
    const spot = new THREE.SpotLight(0xffffff, 5.0, 18, Math.PI / 4, 0.25);
    spot.position.set(0, 7, 0); spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024); scene.add(spot);

    const pL = new THREE.PointLight(0xff55ff, 2.2, 14);
    pL.position.set(-2.5, 1, -2); scene.add(pL);
    const pR = new THREE.PointLight(0x55aaff, 1.8, 14);
    pR.position.set(2.5, 0.8, 2); scene.add(pR);
    // Under-light for play area
    const under = new THREE.PointLight(0xffffff, 1.0, 8);
    under.position.set(0, PLAY_FLOOR_Y + 0.5, 0); scene.add(under);

    const sg = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 900; i++) sp.push((Math.random()-0.5)*80,(Math.random()-0.5)*80,(Math.random()-0.5)*80);
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color:0xffffff, size:0.09, transparent:true, opacity:0.35 })));

    _handleResize();
    window.addEventListener('resize', _handleResize);
  }

  function _setCameraPos() {
    if (!camera) return;
    const cx = Math.sin(camAngle) * camDist;
    const cz = Math.cos(camAngle) * camDist;
    camera.position.set(cx, camPitch, cz);
    camera.lookAt(0, 0.0, 0);
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
    world.solver.iterations = 14;
    world.defaultContactMaterial.friction = 0.38;
    world.defaultContactMaterial.restitution = 0.20;
  }

  // ── Machine ────────────────────────────────────────────────
  function _buildMachine() {
    const hw = MACHINE.w / 2, hd = MACHINE.d / 2;

    const glassMat = new THREE.MeshPhysicalMaterial({
      color:0x8899ff, transparent:true, opacity:0.08,
      roughness:0, metalness:0, transmission:0.95, thickness:0.06,
      side:THREE.DoubleSide, depthWrite:false,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color:0x1a0033, metalness:0.88, roughness:0.18 });
    const edgeMat  = new THREE.MeshStandardMaterial({ color:0xcc33ff, emissive:0xcc33ff, emissiveIntensity:0.8, metalness:0.9, roughness:0.1 });
    const floorMat = new THREE.MeshStandardMaterial({ color:0x0d0022, roughness:0.45, metalness:0.28, emissive:0x180033, emissiveIntensity:0.4 });

    // ── Lower play-area floor ──────────────────────────────
    const playFloor = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w, 0.08, MACHINE.d), floorMat);
    playFloor.position.y = PLAY_FLOOR_Y - 0.04;
    playFloor.receiveShadow = true;
    scene.add(playFloor);

    const floorBody = new C.Body({ mass:0, shape: new C.Plane() });
    floorBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
    floorBody.position.set(0, PLAY_FLOOR_Y, 0);
    world.addBody(floorBody);

    // ── Raised shelf in +X,+Z corner (chute lives on top) ──
    const shelfThick = 0.10;
    const shelfMat = new THREE.MeshStandardMaterial({
      color:0x1a0040, roughness:0.35, metalness:0.45, emissive:0x220055, emissiveIntensity:0.35,
    });
    // shelf top surface
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(SHELF_W, shelfThick, SHELF_D), shelfMat);
    shelf.position.set(hw - SHELF_W/2, SHELF_Y - shelfThick/2, hd - SHELF_D/2);
    scene.add(shelf);

    // shelf physics (static box)
    const shelfBody = new C.Body({ mass:0 });
    shelfBody.addShape(new C.Box(new C.Vec3(SHELF_W/2, shelfThick/2, SHELF_D/2)));
    shelfBody.position.set(hw - SHELF_W/2, SHELF_Y - shelfThick/2, hd - SHELF_D/2);
    world.addBody(shelfBody);

    // Step wall — prevents balls rolling onto shelf
    const stepMat = new THREE.MeshStandardMaterial({ color:0x330066, metalness:0.6, roughness:0.3 });
    const stepH = SHELF_Y - PLAY_FLOOR_Y;
    // front face of shelf (facing -Z)
    const stepA = new THREE.Mesh(new THREE.BoxGeometry(SHELF_W, stepH, 0.06), stepMat);
    stepA.position.set(hw - SHELF_W/2, PLAY_FLOOR_Y + stepH/2, hd - SHELF_D - 0.03);
    scene.add(stepA);
    const stepBodyA = new C.Body({ mass:0 });
    stepBodyA.addShape(new C.Box(new C.Vec3(SHELF_W/2, stepH/2, 0.03)));
    stepBodyA.position.copy(stepA.position);
    world.addBody(stepBodyA);
    // left face of shelf (facing -X)
    const stepB = new THREE.Mesh(new THREE.BoxGeometry(0.06, stepH, SHELF_D), stepMat);
    stepB.position.set(hw - SHELF_W - 0.03, PLAY_FLOOR_Y + stepH/2, hd - SHELF_D/2);
    scene.add(stepB);
    const stepBodyB = new C.Body({ mass:0 });
    stepBodyB.addShape(new C.Box(new C.Vec3(0.03, stepH/2, SHELF_D/2)));
    stepBodyB.position.copy(stepB.position);
    world.addBody(stepBodyB);

    // Chute marker (glowing gold circle on shelf surface)
    const chuteX = hw - 0.38, chuteZ = hd - 0.38;
    const chuteMkr = new THREE.Mesh(
      new THREE.CylinderGeometry(CHUTE_R, CHUTE_R, 0.02, 28),
      new THREE.MeshStandardMaterial({ color:0xffcc00, emissive:0xffcc00, emissiveIntensity:1.2, roughness:0.2 })
    );
    chuteMkr.position.set(chuteX, SHELF_Y + 0.005, chuteZ);
    scene.add(chuteMkr);
    const chuteLight = new THREE.PointLight(0xffcc00, 1.5, 2.5);
    chuteLight.position.set(chuteX, SHELF_Y + 0.3, chuteZ);
    scene.add(chuteLight);

    // Outer walls physics
    const wallDefs = [
      { pos:[0,0, hd+0.01], euler:[0,0,0],          s:[hw*2,2.6,0.04] },
      { pos:[0,0,-hd-0.01], euler:[0,0,0],          s:[hw*2,2.6,0.04] },
      { pos:[hw+0.01,0,0],  euler:[0,Math.PI/2,0],  s:[hd*2,2.6,0.04] },
      { pos:[-hw-0.01,0,0], euler:[0,Math.PI/2,0],  s:[hd*2,2.6,0.04] },
    ];
    wallDefs.forEach(w => {
      const b = new C.Body({ mass:0 });
      b.addShape(new C.Box(new C.Vec3(w.s[0]/2, w.s[1]/2, w.s[2]/2)));
      b.position.set(...w.pos);
      b.quaternion.setFromEuler(...w.euler);
      world.addBody(b);
    });

    // Glass panels
    [[0,0.0,hd],[0,0.0,-hd]].forEach(pos => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w, MACHINE.h, 0.04), glassMat);
      m.position.set(...pos); scene.add(m);
    });
    [[hw,0.0,0],[-hw,0.0,0]].forEach(pos => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, MACHINE.h, MACHINE.d), glassMat);
      m.position.set(...pos); scene.add(m);
    });

    // Frame edges
    [
      [[ hw,0, hd],[0.07,MACHINE.h,0.07]], [[-hw,0, hd],[0.07,MACHINE.h,0.07]],
      [[ hw,0,-hd],[0.07,MACHINE.h,0.07]], [[-hw,0,-hd],[0.07,MACHINE.h,0.07]],
      [[0,MACHINE.h/2, hd],[MACHINE.w,0.07,0.07]], [[0,MACHINE.h/2,-hd],[MACHINE.w,0.07,0.07]],
      [[ hw,MACHINE.h/2,0],[0.07,0.07,MACHINE.d]], [[-hw,MACHINE.h/2,0],[0.07,0.07,MACHINE.d]],
      [[0,-MACHINE.h/2, hd],[MACHINE.w,0.07,0.07]], [[0,-MACHINE.h/2,-hd],[MACHINE.w,0.07,0.07]],
      [[ hw,-MACHINE.h/2,0],[0.07,0.07,MACHINE.d]], [[-hw,-MACHINE.h/2,0],[0.07,0.07,MACHINE.d]],
    ].forEach(([pos,sz]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...sz), edgeMat);
      m.position.set(...pos); scene.add(m);
    });

    // Top cap + rail
    const top = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w+0.1,0.1,MACHINE.d+0.1), frameMat);
    top.position.y = MACHINE.h/2+0.02; scene.add(top);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w-0.14,0.06,0.06),
      new THREE.MeshStandardMaterial({ color:0xdddddd, metalness:0.96, roughness:0.04 }));
    rail.position.set(0, RAIL_Y, 0); scene.add(rail);

    // Neon sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.5,0.33,0.09),
      new THREE.MeshStandardMaterial({ color:0xff33aa, emissive:0xff33aa, emissiveIntensity:2.4, roughness:0.1, metalness:0.6 }));
    sign.position.set(0, MACHINE.h/2+0.40, MACHINE.d/2-0.05); scene.add(sign);
    const sl = new THREE.PointLight(0xff33aa, 2.8, 5);
    sl.position.copy(sign.position); scene.add(sl);

    _buildClaw();
    // Apply initial open pose now that fingers exist
    clawOpen = 1.0;
    _updateClawPose();
  }

  // ── Claw ───────────────────────────────────────────────────
  // Structure: hub → ring → 3 fingers
  // Each finger = pivot at ring edge.
  //   Upper rod: FIXED, always points straight down — acts as the "spine"
  //   Lower rod: hinged at bottom of upper — ONLY the lower section closes in
  //              to form a cage under the ball.
  // Open  (lowerOpen=1): lower rods angle OUT, making a wide bell shape
  // Closed (lowerOpen=0): lower rods fold straight down / slightly inward
  //                       forming a cage around + under a ball
  function _buildClaw() {
    clawGroup = new THREE.Group();
    scene.add(clawGroup);

    const chrome = new THREE.MeshStandardMaterial({ color:0xd8d8e0, metalness:0.97, roughness:0.05 });
    const dark   = new THREE.MeshStandardMaterial({ color:0x555566, metalness:0.92, roughness:0.15 });
    const accent = new THREE.MeshStandardMaterial({ color:0x9933ff, emissive:0x5500cc, emissiveIntensity:0.6, metalness:0.8, roughness:0.22 });

    // Cable
    clawWire = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 8), chrome);
    clawWire.position.y = 0.5;
    clawGroup.add(clawWire);

    // Hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.22, 20), dark);
    hub.position.y = 0;
    clawGroup.add(hub);

    // Accent band
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.05, 20), accent);
    band.position.y = 0.04;
    clawGroup.add(band);

    // Attachment ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 8, 28), chrome);
    ring.rotation.x = Math.PI/2; ring.position.y = -0.12;
    clawGroup.add(ring);

    // 3 fingers
    const UPPER_LEN = 0.36;   // fixed upper arm length
    const LOWER_LEN = 0.32;   // closing lower arm length
    const HUB_RADIUS = 0.12;  // how far out from hub centre each finger attaches

    clawFingers = [];
    for (let i = 0; i < 3; i++) {
      const az = (i / 3) * Math.PI * 2;
      const sx = Math.sin(az), sz = Math.cos(az);

      // Upper arm — FIXED position, hangs straight down from ring
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.015, UPPER_LEN, 8), chrome);
      upper.position.set(sx * HUB_RADIUS, -0.12 - UPPER_LEN/2, sz * HUB_RADIUS);
      clawGroup.add(upper);

      // Knuckle at bottom of upper arm
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), chrome);
      knuckle.position.set(sx * HUB_RADIUS, -0.12 - UPPER_LEN, sz * HUB_RADIUS);
      clawGroup.add(knuckle);

      // Lower arm pivot — pivots at the knuckle
      const pivot = new THREE.Group();
      pivot.position.set(sx * HUB_RADIUS, -0.12 - UPPER_LEN, sz * HUB_RADIUS);
      // store radial direction for rotation axis computation
      pivot.userData.radX = sx;
      pivot.userData.radZ = sz;
      clawGroup.add(pivot);

      // Lower arm mesh inside pivot
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.011, LOWER_LEN, 8), chrome);
      lower.position.y = -LOWER_LEN / 2;
      pivot.add(lower);

      // Tip ball
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), chrome);
      tip.position.y = -LOWER_LEN;
      pivot.add(tip);

      clawFingers.push({ pivot });
    }

    // Physics sphere at hub bottom for grab detection
    clawBody = new C.Body({ mass:0, type: C.Body.KINEMATIC });
    clawBody.addShape(new C.Sphere(0.26));
    world.addBody(clawBody);
  }

  function _resetClaw() {
    clawX = 0; clawZ = 0; dropY = 0;
    clawOpen = 1.0; grabbed = null; dropTimer = 0;
    gameState = 'idle';
    if (clawGroup) _updateClawPose(); // only call if claw already built
  }

  function _updateClawPose() {
    if (!clawGroup) return;

    const hubY = CLAW_REST_Y - dropY;
    clawGroup.position.set(clawX, hubY, clawZ);

    // Cable
    const wireLen = Math.max(0.04, RAIL_Y - hubY);
    clawWire.scale.y = wireLen;
    clawWire.position.y = wireLen / 2;

    // Physics body at hub base
    clawBody.position.set(clawX, hubY - 0.40, clawZ);

    // ── Lower arm animation ────────────────────────────────
    // clawOpen=1 → lower arms angled OUT (wide, ready to scoop)
    // clawOpen=0 → lower arms fold INWARD forming a cage
    //
    // Rotation is around the tangent axis at each finger's azimuth.
    // OPEN: pivot rotated outward by OPEN_ANGLE
    // CLOSED: pivot rotated inward/straight by CLOSED_ANGLE
    // clawOpen=1  → lower arms flare OUTWARD (OPEN_ANGLE > 0)
    // clawOpen=0  → lower arms fold INWARD forming cage (CLOSED_ANGLE < 0)
    const OPEN_ANGLE   =  0.85;   // outward flare when open (wide bell)
    const CLOSED_ANGLE = -0.50;   // inward fold forming cage under ball

    const angle = OPEN_ANGLE + (CLOSED_ANGLE - OPEN_ANGLE) * (1.0 - clawOpen);

    clawFingers.forEach(({ pivot }) => {
      const rX = pivot.userData.radX;
      const rZ = pivot.userData.radZ;
      // Rotate around tangent axis to open/close lower arms
      pivot.rotation.x =  rZ * angle;
      pivot.rotation.z = -rX * angle;
    });
  }

  // ── Prizes ─────────────────────────────────────────────────
  function _spawnPrizes() {
    for (let i = 0; i < 18; i++) _spawnOnePrize(PRIZE_DEFS[i % PRIZE_DEFS.length]);
  }

  function _spawnOnePrize(def) {
    const hw = MACHINE.w/2 - 0.42;
    const hd = MACHINE.d/2 - 0.42;
    // Keep prizes away from the shelf corner
    let x, z;
    do {
      x = (Math.random()-0.5) * hw * 2;
      z = (Math.random()-0.5) * hd * 2;
    } while (x > hw - SHELF_W + 0.3 && z > hd - SHELF_D + 0.3);

    const y = PLAY_FLOOR_Y + def.radius + 0.25 + Math.random() * 1.1;

    // MeshPhongMaterial — reliable color, no GPU white-out
    const mat = new THREE.MeshPhongMaterial({
      color:       def.color,
      emissive:    new THREE.Color(def.glow),
      emissiveIntensity: 0.20,
      transparent: true,
      opacity:     0.58,
      shininess:   130,
      specular:    new THREE.Color(0xffffff),
      side:        THREE.FrontSide,
      depthWrite:  false,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 28, 28), mat);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    scene.add(mesh);

    // Emoji billboard
    const emojiTex = _makeEmojiTexture(def.emoji);
    const emojiPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(def.radius * 1.85, def.radius * 1.85),
      new THREE.MeshBasicMaterial({ map:emojiTex, transparent:true, side:THREE.DoubleSide, depthWrite:false })
    );
    emojiPlane.renderOrder = 3;
    mesh.add(emojiPlane);

    // Glow halo
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius * 1.30, 14, 14),
      new THREE.MeshBasicMaterial({ color:def.glow, transparent:true, opacity:0.10, side:THREE.BackSide, depthWrite:false })
    );
    mesh.add(halo);

    // Physics
    const body = new C.Body({ mass:0.5, linearDamping:0.40, angularDamping:0.52 });
    body.addShape(new C.Sphere(def.radius));
    body.position.set(x, y, z);
    body.velocity.set((Math.random()-0.5)*0.5, 0, (Math.random()-0.5)*0.5);
    world.addBody(body);

    prizes.push({ mesh, body, def, grabbed:false, emojiPlane, scored:false });
    meshBodies.push({ mesh, body });
  }

  function _makeEmojiTexture(emoji) {
    const SZ = 256;
    const cv = document.createElement('canvas');
    cv.width = SZ; cv.height = SZ;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, SZ, SZ);
    ctx.font = `${Math.floor(SZ*0.68)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, SZ/2, SZ/2+4);
    return new THREE.CanvasTexture(cv);
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
    _resumeAudio();
    if (e.button !== 2) return;
    mouseDown = true;
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    canvasEl.classList.add('dragging');
    e.preventDefault();
  }

  function _onMouseMove(e) {
    if (!mouseDown) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    camAngle -= dx * 0.007;                                    // right = rotate right
    camPitch   = Math.max(0.8, Math.min(5.5, camPitch - dy * 0.012));
    _setCameraPos();
  }

  function _onMouseUp()  { mouseDown = false; if (canvasEl) canvasEl.classList.remove('dragging'); }

  function _onWheel(e) {
    e.preventDefault();
    camDist = Math.max(3.0, Math.min(11, camDist + e.deltaY * 0.008));
    _setCameraPos();
  }

  function _onKeyDown(e) {
    _resumeAudio();
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
    _playDrop();
    _playTone(440, 'square', 0.10, 0.12, 0.01, 0.08);
  }

  // ── Game loop ──────────────────────────────────────────────
  function _loop() {
    animId = requestAnimationFrame(_loop);
    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;

    if (introAnim) {
      introCamAngle += dt * 0.38;
      camAngle = introCamAngle;
      _setCameraPos();
      if (introCamAngle > Math.PI * 0.40) introAnim = false;
    }

    _handleMovement(dt);
    _handleDrop(dt);
    _syncPhysics(dt);
    _checkScoringZone();
    _animateScene(now);
    renderer.render(scene, camera);
  }

  function _handleMovement(dt) {
    if (gameState !== 'idle') return;

    const speed = 1.55;
    const hw = MACHINE.w/2 - 0.22;
    const hd = MACHINE.d/2 - 0.22;

    // Camera-relative movement
    // Forward = direction camera looks projected onto XZ plane
    const camFwdX = -Math.sin(camAngle);
    const camFwdZ = -Math.cos(camAngle);
    const camRgtX =  Math.cos(camAngle);
    const camRgtZ = -Math.sin(camAngle);

    let mx = 0, mz = 0;
    if (keyMap['ArrowUp'])    { mx += camFwdX; mz += camFwdZ; }
    if (keyMap['ArrowDown'])  { mx -= camFwdX; mz -= camFwdZ; }
    if (keyMap['ArrowLeft'])  { mx -= camRgtX; mz -= camRgtZ; }
    if (keyMap['ArrowRight']) { mx += camRgtX; mz += camRgtZ; }

    const isMoving = (mx !== 0 || mz !== 0);

    if (isMoving) {
      const len = Math.sqrt(mx*mx + mz*mz);
      clawX += (mx/len) * speed * dt;
      clawZ += (mz/len) * speed * dt;
      clawX = Math.max(-hw, Math.min(hw, clawX));
      clawZ = Math.max(-hd, Math.min(hd, clawZ));
      _updateClawPose();
      if (!wasMoving) _startMoveSound();
    } else {
      if (wasMoving) _stopMoveSound();
    }
    wasMoving = isMoving;
  }

  function _handleDrop(dt) {
    if (gameState === 'dropping') {
      const maxDrop = CLAW_REST_Y - DROP_BOTTOM;
      dropY = Math.min(dropY + dt * 1.8, maxDrop);
      _updateClawPose();
      if (dropY >= maxDrop) {
        // Reached bottom — start searching for a ball
        // Fingers stay open until a ball is detected
        gameState = 'grabbing';
        dropTimer = 0;
      }
    }

    else if (gameState === 'grabbing') {
      dropTimer += dt;
      // clawOpen stays at 1.0 until _tryGrab detects a ball
      // Once grabbed, close around it
      if (!grabbed) {
        grabbed = _tryGrab();
        if (grabbed) {
          // Start closing
          _playClawClose();
        }
      } else {
        // Close fingers around ball
        clawOpen = Math.max(0, clawOpen - dt * 2.8);
      }
      _updateClawPose();
      // After enough time (whether we got one or not), retract
      if (dropTimer >= 0.70) {
        if (!grabbed) {
          // Didn't grab anything — start closing for retraction anyway (looks better)
          clawOpen = 0.0;
          _playMiss();
        }
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
        grabbed.body.velocity.set(0,0,0);
        grabbed.body.angularVelocity.set(0,0,0);
      }
      if (dropY <= 0) {
        if (grabbed) {
          gameState = 'delivering';
          dropTimer = 0;
          _playTone(660, 'triangle', 0.18, 0.2, 0.01, 0.15);
        } else {
          clawOpen = 1.0;
          _updateClawPose();
          gameState = tries <= 0 ? 'gameover' : 'idle';
          if (gameState === 'gameover') setTimeout(_showGameOver, 700);
        }
      }
    }

    else if (gameState === 'delivering') {
      // Slide to chute position (on shelf)
      const tx = MACHINE.w/2 - 0.38, tz = MACHINE.d/2 - 0.38;
      const dx = tx - clawX, dz = tz - clawZ;
      const dist = Math.sqrt(dx*dx + dz*dz);
      const spd = 1.4;
      if (dist > 0.05) {
        clawX += (dx/dist)*spd*dt;
        clawZ += (dz/dist)*spd*dt;
      } else {
        clawX = tx; clawZ = tz;
        gameState = 'releasing';
        dropTimer = 0;
        _playTone(520, 'sine', 0.12, 0.15, 0.01, 0.10);
      }
      _updateClawPose();
      if (grabbed) {
        const tipY = CLAW_REST_Y - 0.42;
        grabbed.mesh.position.set(clawX, tipY, clawZ);
        grabbed.body.position.set(clawX, tipY, clawZ);
        grabbed.body.velocity.set(0,0,0);
        grabbed.body.angularVelocity.set(0,0,0);
      }
    }

    else if (gameState === 'releasing') {
      dropTimer += dt;
      clawOpen = Math.min(1.0, dropTimer * 3.0);
      _updateClawPose();
      if (grabbed && dropTimer > 0.22) {
        // Sync mesh→body one last time before releasing
        const releaseX = clawX;
        const releaseY = CLAW_REST_Y - 0.45;
        const releaseZ = clawZ;
        grabbed.body.position.set(releaseX, releaseY, releaseZ);
        grabbed.mesh.position.set(releaseX, releaseY, releaseZ);
        grabbed.body.type = C.Body.DYNAMIC;
        grabbed.body.velocity.set(0, -2.5, 0);
        grabbed.body.angularVelocity.set(0, 0, 0);
        grabbed.body.wakeUp();
        grabbed.grabbed = false;
        grabbed = null;
        _playBallDrop();
      }
      if (dropTimer >= 0.70) {
        gameState = 'returning';
        dropTimer = 0;
      }
    }

    else if (gameState === 'returning') {
      const dx = -clawX, dz = -clawZ;
      const dist = Math.sqrt(dx*dx + dz*dz);
      const spd = 1.7;
      if (dist > 0.06) {
        clawX += (dx/dist)*spd*dt;
        clawZ += (dz/dist)*spd*dt;
      } else {
        clawX = 0; clawZ = 0;
        clawOpen = 1.0;
        _updateClawPose();
        gameState = tries <= 0 ? 'gameover' : 'idle';
        if (gameState === 'gameover') setTimeout(_showGameOver, 700);
      }
      _updateClawPose();
    }
  }

  function _tryGrab() {
    const tipX = clawX;
    const tipY  = (CLAW_REST_Y - dropY) - 0.42;
    const tipZ  = clawZ;

    let best = null, bestDist = GRAB_RADIUS;
    prizes.forEach(p => {
      if (p.grabbed || p.scored) return;
      const dx = p.mesh.position.x - tipX;
      const dy = p.mesh.position.y - tipY;
      const dz = p.mesh.position.z - tipZ;
      const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (d < bestDist) { bestDist = d; best = p; }
    });

    if (best) {
      best.grabbed = true;
      best.body.type = C.Body.KINEMATIC;
      best.body.velocity.set(0,0,0);
      return best;
    }

    // Nudge nearby balls
    prizes.forEach(p => {
      if (p.grabbed || p.scored) return;
      const dx = p.mesh.position.x - tipX;
      const dz = p.mesh.position.z - tipZ;
      if (Math.sqrt(dx*dx + dz*dz) < 0.85)
        p.body.velocity.set((Math.random()-0.5)*2.2, Math.random()*1.8, (Math.random()-0.5)*2.2);
    });
    return null;
  }

  function _checkScoringZone() {
    const cx = MACHINE.w/2 - 0.38, cz = MACHINE.d/2 - 0.38;
    prizes.forEach(p => {
      if (p.scored || p.grabbed) return;
      const dx = p.mesh.position.x - cx;
      const dz = p.mesh.position.z - cz;
      const dy = p.mesh.position.y - SHELF_Y;
      if (Math.sqrt(dx*dx + dz*dz) < CHUTE_R + p.def.radius * 0.7 && dy < p.def.radius + 0.25 && dy > -0.3) {
        p.scored = true;
        score += p.def.pts;
        _updateUI();
        _showToast(`${p.def.emoji}  +${p.def.pts} pts  —  ${p.def.label}!`);
        _playWin();
        setTimeout(() => {
          scene.remove(p.mesh);
          world.removeBody(p.body);
          prizes     = prizes.filter(x => x !== p);
          meshBodies = meshBodies.filter(x => x.body !== p.body);
        }, 900);
      }
    });
  }

  function _syncPhysics(dt) {
    world.step(1/60, dt, 3);
    meshBodies.forEach(({ mesh, body }) => {
      const p = prizes.find(p => p.mesh === mesh);
      if (p && (p.grabbed || p.scored)) return;
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    });
  }

  function _animateScene(now) {
    prizes.forEach(p => {
      if (p.emojiPlane) p.emojiPlane.lookAt(camera.position);
      if (!p.scored) {
        p.mesh.material.emissive = new THREE.Color(p.def.glow);
        p.mesh.material.emissiveIntensity = 0.16 + 0.13 * Math.sin(now * 0.0017 + p.mesh.position.x * 3.2);
      }
    });
  }

  return { init, destroy };
})();
