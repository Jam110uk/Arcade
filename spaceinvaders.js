// ============================================================
//  SPACE INVADERS  —  Three.js arcade shooter
//  export default { init, destroy }
//
//  Features:
//    - Three.js WebGL renderer with neon glow post-processing
//    - 5 enemy types with unique behaviours and appearances
//    - 6 power-up types (shield, rapid, spread, laser, nuke, slow)
//    - Particle explosions, warp trails, screen flash effects
//    - Scrolling star-field parallax background
//    - Wave system with escalating difficulty
//    - Persistent best score via localStorage
//    - Full keyboard + touch controls
//    - Soft arcade audio matching the office arcade palette
// ============================================================

export default (() => {

  // ── Three.js CDN version must match what's available ────────
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  // ── Constants ────────────────────────────────────────────────
  const W = 20;          // world width units
  const H = 14;          // world height units
  const PLAYER_Y = -5.8;
  const ENEMY_TOP_Y = 4.8;
  const BULLET_SPEED = 18;
  const ENEMY_BULLET_SPEED = 7;
  const PLAYER_SPEED = 10;
  const MAX_PLAYER_BULLETS = 6;
  const COLORS = {
    player:   0x00e5ff,
    bullet:   0x00e5ff,
    shield:   0x00ff88,
    enemy0:   0xff2d78,  // grunt — pink
    enemy1:   0xff6a00,  // speeder — orange
    enemy2:   0xa855f7,  // tank — purple
    enemy3:   0xffe600,  // zigzag — yellow
    enemy4:   0x00ff88,  // bomber — green
    boss:     0xff0044,
    pwShield: 0x00ff88,
    pwRapid:  0x00e5ff,
    pwSpread: 0xffe600,
    pwLaser:  0xff6a00,
    pwNuke:   0xff2d78,
    pwSlow:   0xa855f7,
  };

  // ── State ────────────────────────────────────────────────────
  let renderer, scene, camera;
  let screenEl, animId, destroyed = false;
  let resizeOb;

  // game objects
  let player, playerGroup;
  let enemies       = [];
  let playerBullets = [];
  let enemyBullets  = [];
  let particles     = [];
  let powerUps      = [];
  let stars         = [];
  let laserBeam     = null;
  let shieldMesh    = null;
  let nukeRing      = null;

  // player state
  let px = 0;
  let health = 3, score = 0, bestScore = 0, wave = 0;
  let gameState = 'idle'; // idle | playing | dead | win
  let keys = {};
  let touchDir = 0;
  let fireHeld = false, fireCooldown = 0;
  let rapidTimer = 0, spreadTimer = 0, laserTimer = 0, slowTimer = 0;
  let shieldHP   = 0;
  let invincible = 0;    // invincibility frames after hit
  let flashTimer = 0;    // red screen flash
  let waveDelay  = 0;    // pause between waves
  let enemyDir   = 1;
  let enemyStepTimer = 0;
  let enemyStepInterval = 1.2;
  let enemyDescend = false;
  let nukeActive = false;

  // ── Audio ─────────────────────────────────────────────────────
  let audioCtx;
  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function tone(freq, dur, vol = 0.06, delay = 0, type = 'sine', detune = 0) {
    try {
      const a = ac();
      const osc = a.createOscillator();
      const env = a.createGain();
      const lpf = a.createBiquadFilter();
      lpf.type = 'lowpass'; lpf.frequency.value = Math.min(freq * 3, 2200); lpf.Q.value = 0.5;
      osc.connect(lpf); lpf.connect(env); env.connect(a.destination);
      osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
      env.gain.setValueAtTime(0, a.currentTime + delay);
      env.gain.linearRampToValueAtTime(vol, a.currentTime + delay + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + dur);
      osc.start(a.currentTime + delay);
      osc.stop(a.currentTime + delay + dur + 0.05);
    } catch(e) {}
  }
  function sndShoot()    { tone(520, 0.08, 0.055, 0, 'square'); tone(380, 0.06, 0.03, 0.04, 'square'); }
  function sndSpread()   { [480, 560, 640].forEach((f,i) => tone(f, 0.09, 0.04, i*0.03, 'square')); }
  function sndLaser()    { tone(800, 0.4, 0.07, 0, 'sawtooth'); tone(600, 0.4, 0.05, 0, 'sawtooth', -1200); }
  function sndEnemyHit() { tone(180, 0.14, 0.06, 0, 'triangle'); tone(130, 0.18, 0.05, 0.06, 'triangle'); }
  function sndPlayerHit(){ tone(150, 0.25, 0.09, 0, 'triangle'); tone(100, 0.30, 0.07, 0.12, 'triangle'); }
  function sndExplosion() { tone(80, 0.4, 0.10, 0, 'sawtooth'); tone(55, 0.5, 0.08, 0.1, 'triangle'); }
  function sndPowerUp()  { [330,440,550,660].forEach((f,i) => tone(f, 0.14, 0.06, i*0.07)); }
  function sndNuke()     { tone(60, 0.8, 0.12, 0, 'sawtooth'); tone(40, 1.0, 0.10, 0.2, 'triangle'); tone(500, 0.3, 0.05, 0.1); }
  function sndWaveClear(){ [392,494,587,784].forEach((f,i) => tone(f, 0.18, 0.07, i*0.12)); }
  function sndShield()   { tone(440, 0.15, 0.07); tone(660, 0.12, 0.06, 0.1); }
  function sndGameOver() { [300,240,180,120].forEach((f,i) => tone(f, 0.3, 0.08, i*0.18, 'triangle')); }

  // ── Three.js helpers ─────────────────────────────────────────
  function makeGlow(geo, color, emissiveIntensity = 1.5) {
    return new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity,
      metalness: 0.2, roughness: 0.4,
    });
  }

  function makeWireframe(geo, color) {
    return new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color, linewidth: 1 })
    );
  }

  // ── Star field ────────────────────────────────────────────────
  function buildStars() {
    const geo = new THREE.BufferGeometry();
    const count = 320;
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (Math.random() - 0.5) * W * 2.2;
      pos[i*3+1] = (Math.random() - 0.5) * H * 2.2;
      pos[i*3+2] = -8 - Math.random() * 12;
      sizes[i]   = 0.5 + Math.random() * 2.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xaaddff, size: 0.08, sizeAttenuation: true,
      transparent: true, opacity: 0.7,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    stars.push(pts);

    // Mid-layer stars (slightly different colour/speed)
    const geo2 = new THREE.BufferGeometry();
    const pos2 = new Float32Array(120 * 3);
    for (let i = 0; i < 120; i++) {
      pos2[i*3]   = (Math.random() - 0.5) * W * 2.2;
      pos2[i*3+1] = (Math.random() - 0.5) * H * 2.2;
      pos2[i*3+2] = -4 - Math.random() * 4;
    }
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    const mat2 = new THREE.PointsMaterial({ color: 0x6699ff, size: 0.12, transparent: true, opacity: 0.5 });
    const pts2 = new THREE.Points(geo2, mat2);
    scene.add(pts2);
    stars.push(pts2);
  }

  function scrollStars(dt) {
    stars[0].position.y -= dt * 0.6;
    stars[1].position.y -= dt * 1.2;
    if (stars[0].position.y < -H * 1.1) stars[0].position.y = H * 1.1;
    if (stars[1].position.y < -H * 1.1) stars[1].position.y = H * 1.1;
  }

  // ── Player ────────────────────────────────────────────────────
  function buildPlayer() {
    playerGroup = new THREE.Group();

    // ── Main fuselage ──
    const bodyGeo = new THREE.CylinderGeometry(0.16, 0.30, 0.62, 10);
    const bodyMat = makeGlow(bodyGeo, COLORS.player, 1.1);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.04;
    playerGroup.add(body);
    const bodyWF = makeWireframe(new THREE.CylinderGeometry(0.165, 0.305, 0.63, 10), COLORS.player);
    bodyWF.position.y = 0.04;
    playerGroup.add(bodyWF);

    // ── Nose cone ──
    const noseGeo = new THREE.ConeGeometry(0.16, 0.36, 10);
    const nose = new THREE.Mesh(noseGeo, makeGlow(noseGeo, COLORS.player, 2.2));
    nose.position.y = 0.49;
    playerGroup.add(nose);
    const noseWF = makeWireframe(new THREE.ConeGeometry(0.163, 0.37, 10), 0x00ffff);
    noseWF.position.y = 0.49;
    playerGroup.add(noseWF);

    // ── Gun barrel ──
    const gunGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6);
    const gun = new THREE.Mesh(gunGeo, new THREE.MeshStandardMaterial({ color: 0x88ddff, emissive: 0x00aaff, emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.2 }));
    gun.position.y = 0.81;
    playerGroup.add(gun);
    const tipGeo = new THREE.SphereGeometry(0.055, 6, 6);
    const tip = new THREE.Mesh(tipGeo, makeGlow(tipGeo, 0x00ffff, 3.5));
    tip.position.y = 0.96;
    playerGroup.add(tip);

    // ── Swept wings ──
    [-1, 1].forEach(sign => {
      const wGeo = new THREE.BufferGeometry();
      const v = new Float32Array([
        sign * 0.14,  0.14, 0,
        sign * 1.15, -0.26, 0,
        sign * 0.95, -0.42, 0,
        sign * 0.28, -0.44, 0,
        sign * 0.14, -0.06, 0,
      ]);
      const idx = sign > 0
        ? new Uint16Array([0,1,4, 1,3,4, 1,2,3])
        : new Uint16Array([0,4,1, 1,4,3, 1,3,2]);
      wGeo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      wGeo.setIndex(new THREE.BufferAttribute(idx, 1));
      wGeo.computeVertexNormals();
      playerGroup.add(new THREE.Mesh(wGeo, makeGlow(wGeo, COLORS.player, 0.85)));

      const edgePts = [
        new THREE.Vector3(sign * 0.14,  0.14, 0),
        new THREE.Vector3(sign * 1.15, -0.26, 0),
        new THREE.Vector3(sign * 0.95, -0.42, 0),
        new THREE.Vector3(sign * 0.28, -0.44, 0),
      ];
      playerGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(edgePts),
        new THREE.LineBasicMaterial({ color: 0x00ffff })
      ));

      // Nav lights
      const navGeo = new THREE.SphereGeometry(0.055, 6, 6);
      const nav = new THREE.Mesh(navGeo, makeGlow(navGeo, sign < 0 ? 0xff3333 : 0x33ff66, 4.0));
      nav.position.set(sign * 1.15, -0.26, 0);
      playerGroup.add(nav);
    });

    // ── Cockpit dome ──
    const cockpitGeo = new THREE.SphereGeometry(0.13, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const cockpit = new THREE.Mesh(cockpitGeo, new THREE.MeshStandardMaterial({
      color: 0xaaddff, emissive: 0x2255ff, emissiveIntensity: 1.8,
      transparent: true, opacity: 0.72, metalness: 0.3, roughness: 0.1,
    }));
    cockpit.position.y = 0.30;
    playerGroup.add(cockpit);

    // ── Twin engine pods + exhausts ──
    [-0.22, 0.22].forEach((xOff, i) => {
      const pod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.22, 8),
        new THREE.MeshStandardMaterial({ color: COLORS.player, emissive: COLORS.player, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 })
      );
      pod.position.set(xOff, -0.38, 0);
      playerGroup.add(pod);

      const engGeo = new THREE.SphereGeometry(0.10, 8, 8);
      const engMat = makeGlow(engGeo, 0xff5500, 5.0);
      const eng = new THREE.Mesh(engGeo, engMat);
      eng.position.set(xOff, -0.53, 0);
      playerGroup.add(eng);
      if (i === 1) playerGroup._engineMat = engMat;

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), makeGlow(null, 0xffdd88, 8.0));
      core.position.set(xOff, -0.53, 0);
      playerGroup.add(core);
    });

    // ── Rear stabiliser fins ──
    [-1, 1].forEach(sign => {
      const fv = new Float32Array([
        sign * 0.28, -0.30, 0,
        sign * 0.60, -0.44, 0,
        sign * 0.28, -0.50, 0,
      ]);
      const finGeo = new THREE.BufferGeometry();
      finGeo.setAttribute('position', new THREE.BufferAttribute(fv, 3));
      finGeo.setIndex(new THREE.BufferAttribute(new Uint16Array(sign > 0 ? [0,1,2] : [0,2,1]), 1));
      finGeo.computeVertexNormals();
      playerGroup.add(new THREE.Mesh(finGeo, makeGlow(finGeo, COLORS.player, 1.0)));
      const fp = [new THREE.Vector3(sign*0.28,-0.30,0), new THREE.Vector3(sign*0.60,-0.44,0), new THREE.Vector3(sign*0.28,-0.50,0)];
      playerGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fp), new THREE.LineBasicMaterial({ color: 0x00ffff })));
    });

    playerGroup.position.set(0, PLAYER_Y, 0);
    scene.add(playerGroup);
    player = playerGroup;
  }

  // ── Enemy types ───────────────────────────────────────────────
  // type 0: Grunt — standard grid marcher
  // type 1: Speeder — fast, small, weaves
  // type 2: Tank — slow, large, takes 3 hits, fires heavy shots
  // type 3: Zigzag — erratic path, fires at angles
  // type 4: Bomber — drops bombs that explode on impact, rare

  function buildEnemyMesh(type) {
    const g = new THREE.Group();
    let color = COLORS[`enemy${type}`];

    if (type === 0) {
      // Grunt — classic saucer shape
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
        makeGlow(null, color, 1.4));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6),
        makeGlow(null, 0xffffff, 0.6));
      dome.position.y = 0.1;
      g.add(body, dome);
      g.add(makeWireframe(new THREE.SphereGeometry(0.39, 8, 6), color));
    } else if (type === 1) {
      // Speeder — diamond/arrowhead
      const geo = new THREE.OctahedronGeometry(0.32, 0);
      geo.scale(1.2, 0.5, 0.8);
      g.add(new THREE.Mesh(geo, makeGlow(geo, color, 1.8)));
      g.add(makeWireframe(geo, color));
    } else if (type === 2) {
      // Tank — boxy fortress
      const geo = new THREE.BoxGeometry(0.8, 0.55, 0.5);
      g.add(new THREE.Mesh(geo, makeGlow(geo, color, 1.0)));
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.3, 8),
        makeGlow(null, color, 2.0));
      turret.position.y = -0.35;
      g.add(turret);
      g.add(makeWireframe(geo, color));
    } else if (type === 3) {
      // Zigzag — spiky star
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? 0.38 : 0.18;
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      const shape = new THREE.Shape(pts);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
      geo.center();
      g.add(new THREE.Mesh(geo, makeGlow(geo, color, 1.6)));
    } else if (type === 4) {
      // Bomber — crab claw shape
      const body = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.12, 8, 12),
        makeGlow(null, color, 1.4));
      g.add(body);
      [-1, 1].forEach(sign => {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 6),
          makeGlow(null, color, 1.2));
        claw.position.set(sign * 0.36, -0.22, 0);
        claw.rotation.z = sign * 0.5;
        g.add(claw);
      });
    }

    return g;
  }

  function spawnWave() {
    wave++;
    enemies = [];
    enemyDir = 1;
    enemyStepTimer = 0;
    enemyStepInterval = Math.max(0.35, 1.2 - wave * 0.08);
    enemyDescend = false;

    const cols = Math.min(9, 6 + Math.floor(wave / 2));
    const rows = Math.min(5, 3 + Math.floor(wave / 3));

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Assign type by row, with occasional specials in later waves
        let type = 0;
        if (row === 0 && wave >= 2) type = Math.random() < 0.4 ? 1 : 0;
        if (row === rows - 1 && wave >= 3) type = 2;
        if (wave >= 4 && Math.random() < 0.08) type = 3;
        if (wave >= 5 && Math.random() < 0.05) type = 4;

        const mesh = buildEnemyMesh(type);
        const xSpacing = Math.min(1.9, (W - 2) / cols);
        const x = -((cols - 1) * xSpacing) / 2 + col * xSpacing;
        const y = ENEMY_TOP_Y - row * 1.5;
        mesh.position.set(x, y, 0);

        scene.add(mesh);

        const hp = type === 2 ? 3 : type === 4 ? 2 : 1;
        enemies.push({
          mesh, type, x, y, hp, maxHp: hp,
          fireTimer: 3.5 + Math.random() * 4,
          zigTimer: 0, zigDir: 1,
          dead: false,
        });
      }
    }
  }

  // ── Bullets ───────────────────────────────────────────────────
  function spawnPlayerBullet(ox = 0, vy = BULLET_SPEED) {
    if (playerBullets.length >= MAX_PLAYER_BULLETS) return;
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.bullet, emissive: COLORS.bullet, emissiveIntensity: 3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(player.position.x + ox, player.position.y + 0.8, 0);
    scene.add(mesh);
    playerBullets.push({ mesh, vx: ox * 2, vy });
  }

  function firePrimary() {
    if (rapidTimer > 0) {
      sndShoot();
      spawnPlayerBullet(0, BULLET_SPEED * 1.5);
    } else if (spreadTimer > 0) {
      sndSpread();
      spawnPlayerBullet(-0.25, BULLET_SPEED);
      spawnPlayerBullet(0, BULLET_SPEED);
      spawnPlayerBullet(0.25, BULLET_SPEED);
    } else if (laserTimer > 0) {
      // Laser is handled separately
    } else {
      sndShoot();
      spawnPlayerBullet();
    }
  }

  function spawnEnemyBullet(enemy) {
    const geo = new THREE.SphereGeometry(0.09, 6, 6);
    let col = enemy.type === 2 ? 0xff4444 : enemy.type === 4 ? 0x88ff44 : 0xff8844;
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(enemy.mesh.position.x, enemy.mesh.position.y - 0.5, 0);

    // Zigzag enemy fires at player
    let vx = 0, vy = -ENEMY_BULLET_SPEED;
    if (enemy.type === 3) {
      const dx = player.position.x - enemy.mesh.position.x;
      const dy = player.position.y - enemy.mesh.position.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      vx = (dx / len) * ENEMY_BULLET_SPEED;
      vy = (dy / len) * ENEMY_BULLET_SPEED;
    }

    scene.add(mesh);
    enemyBullets.push({ mesh, vx, vy, isBomb: enemy.type === 4 });
  }

  // ── Power-ups ─────────────────────────────────────────────────
  const PW_TYPES = ['shield', 'rapid', 'spread', 'laser', 'nuke', 'slow'];
  const PW_COLORS = {
    shield: COLORS.pwShield, rapid: COLORS.pwRapid, spread: COLORS.pwSpread,
    laser: COLORS.pwLaser,   nuke: COLORS.pwNuke,   slow: COLORS.pwSlow,
  };
  const PW_LABELS = { shield:'⛨', rapid:'⚡', spread:'✦', laser:'▌', nuke:'☢', slow:'❄' };

  function spawnPowerUp(x, y) {
    if (Math.random() > 0.22) return; // 22% drop chance
    const type = PW_TYPES[Math.floor(Math.random() * PW_TYPES.length)];
    const color = PW_COLORS[type];

    const geo = new THREE.OctahedronGeometry(0.28, 0);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 0);

    // Wireframe shell
    const wf = makeWireframe(new THREE.OctahedronGeometry(0.30, 0), color);
    mesh.add(wf);

    scene.add(mesh);
    powerUps.push({ mesh, type, vy: -2.5 });
  }

  function applyPowerUp(type) {
    sndPowerUp();
    if (type === 'shield') {
      shieldHP = 3;
      buildShield();
    } else if (type === 'rapid') {
      rapidTimer = 8;
    } else if (type === 'spread') {
      spreadTimer = 8;
    } else if (type === 'laser') {
      laserTimer = 5;
      buildLaser();
      sndLaser();
    } else if (type === 'nuke') {
      triggerNuke();
    } else if (type === 'slow') {
      slowTimer = 6;
    }
  }

  function buildShield() {
    if (shieldMesh) { scene.remove(shieldMesh); shieldMesh = null; }
    const geo = new THREE.SphereGeometry(0.9, 16, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.shield, emissive: COLORS.shield, emissiveIntensity: 1.5,
      transparent: true, opacity: 0.28, wireframe: false, side: THREE.DoubleSide,
    });
    shieldMesh = new THREE.Mesh(geo, mat);
    player.add(shieldMesh);
    sndShield();
  }

  function buildLaser() {
    if (laserBeam) { scene.remove(laserBeam); laserBeam = null; }
    const geo = new THREE.CylinderGeometry(0.06, 0.06, H * 2, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.pwLaser, emissive: COLORS.pwLaser, emissiveIntensity: 4,
      transparent: true, opacity: 0.85,
    });
    laserBeam = new THREE.Mesh(geo, mat);
    laserBeam.rotation.z = 0;
    scene.add(laserBeam);
  }

  function triggerNuke() {
    sndNuke();
    nukeActive = true;
    // Kill all enemies
    enemies.forEach(e => {
      if (!e.dead) {
        e.dead = true;
        spawnExplosion(e.mesh.position.x, e.mesh.position.y, COLORS[`enemy${e.type}`], 16);
        score += 50;
        scene.remove(e.mesh);
      }
    });
    enemies = [];

    // Nuke ring visual
    const geo = new THREE.RingGeometry(0.1, 0.5, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.pwNuke, emissive: COLORS.pwNuke, emissiveIntensity: 3,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    nukeRing = new THREE.Mesh(geo, mat);
    nukeRing.position.set(player.position.x, player.position.y, 0);
    nukeRing._scale = 0.1;
    nukeRing._life = 1.0;
    scene.add(nukeRing);
    flashTimer = 0.25;

    setTimeout(() => { nukeActive = false; }, 1200);
  }

  // ── Particles ─────────────────────────────────────────────────
  function spawnExplosion(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.045 + Math.random() * 0.07, 4, 4);
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 2.5,
        transparent: true, opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const spd = 2 + Math.random() * 5;
      scene.add(mesh);
      particles.push({
        mesh, mat,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1.0,
        drag: 0.88,
      });
    }
  }

  function spawnHitSpark(x, y, color) {
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      const angle = Math.random() * Math.PI * 2;
      scene.add(mesh);
      particles.push({ mesh, mat, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3, life: 0.5, drag: 0.82 });
    }
  }

  // ── Collision ─────────────────────────────────────────────────
  function dist2D(a, b) {
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function hitEnemy(enemy, x, y) {
    enemy.hp--;
    spawnHitSpark(x, y, COLORS[`enemy${enemy.type}`]);
    sndEnemyHit();
    // Flash the enemy
    enemy.mesh.children.forEach(c => {
      if (c.material) { c.material.emissiveIntensity = 6; setTimeout(() => { if (c.material) c.material.emissiveIntensity = 1.4; }, 80); }
    });
    if (enemy.hp <= 0) {
      enemy.dead = true;
      const pts = (enemy.type + 1) * 10 * wave;
      score += pts;
      spawnExplosion(enemy.mesh.position.x, enemy.mesh.position.y, COLORS[`enemy${enemy.type}`], 18);
      sndExplosion();
      spawnPowerUp(enemy.mesh.position.x, enemy.mesh.position.y);
      scene.remove(enemy.mesh);
      showFloatingScore(pts, enemy.mesh.position.x, enemy.mesh.position.y);
    }
  }

  // ── Floating score text (canvas sprite) ──────────────────────
  const _floatSprites = [];
  function showFloatingScore(pts, x, y) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 48;
    const cx = canvas.getContext('2d');
    cx.font = 'bold 28px "Orbitron", monospace';
    cx.fillStyle = '#ffdd00';
    cx.textAlign = 'center';
    cx.fillText(`+${pts}`, 64, 34);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4, 0.52, 1);
    sprite.position.set(x, y + 0.4, 0.1);
    scene.add(sprite);
    _floatSprites.push({ sprite, mat, life: 1.0, vy: 1.8 });
  }

  // ── HUD overlay (canvas 2D) ───────────────────────────────────
  let hudCanvas, hudCtx, hudTex, hudSprite;

  function buildHUD() {
    hudCanvas = document.createElement('canvas');
    hudCanvas.width = 512; hudCanvas.height = 128;
    hudCtx = hudCanvas.getContext('2d');
    const tex = new THREE.CanvasTexture(hudCanvas);
    hudTex = tex;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    hudSprite = new THREE.Sprite(mat);
    // Scale to cover full world width; position near top but well inside frustum
    hudSprite.scale.set(W * 0.96, W * 0.96 * (128 / 512), 1);
    hudSprite.position.set(0, H / 2 - 1.4, 0.5);
    scene.add(hudSprite);
  }

  function renderHUD() {
    if (!hudCtx) return;
    const c = hudCtx, W2 = hudCanvas.width, H2 = hudCanvas.height;
    c.clearRect(0, 0, W2, H2);

    // Score
    c.font = 'bold 28px "Orbitron", monospace';
    c.fillStyle = '#00e5ff';
    c.textAlign = 'left';
    c.shadowColor = '#00e5ff'; c.shadowBlur = 12;
    c.fillText(`${score}`, 14, 38);

    // Best
    c.font = '16px "Share Tech Mono", monospace';
    c.fillStyle = 'rgba(0,200,255,0.55)';
    c.shadowBlur = 0;
    c.fillText(`BEST ${bestScore}`, 14, 60);

    // Wave
    c.font = 'bold 20px "Orbitron", monospace';
    c.fillStyle = '#ffe600';
    c.textAlign = 'center';
    c.shadowColor = '#ffe600'; c.shadowBlur = 8;
    c.fillText(`WAVE ${wave}`, W2 / 2, 38);

    // Health hearts
    c.textAlign = 'right';
    c.font = '24px serif';
    c.shadowBlur = 0;
    for (let i = 0; i < 3; i++) {
      c.globalAlpha = i < health ? 1.0 : 0.2;
      c.fillText('♥', W2 - 14 - i * 32, 40);
    }
    c.globalAlpha = 1;

    // Active power-up indicators
    let pwX = 14;
    c.font = '13px "Share Tech Mono", monospace';
    const activePws = [
      rapidTimer  > 0 && { label: '⚡RAPID',  color: '#00e5ff', t: rapidTimer  },
      spreadTimer > 0 && { label: '✦SPREAD', color: '#ffe600', t: spreadTimer },
      laserTimer  > 0 && { label: '▌LASER',  color: '#ff6a00', t: laserTimer  },
      slowTimer   > 0 && { label: '❄SLOW',   color: '#a855f7', t: slowTimer   },
      shieldHP    > 0 && { label: `⛨×${shieldHP}`, color: '#00ff88', t: null },
    ].filter(Boolean);
    activePws.forEach(pw => {
      c.fillStyle = pw.color;
      c.textAlign = 'left';
      c.fillText(pw.t ? `${pw.label} ${pw.t.toFixed(1)}s` : pw.label, pwX, 90);
      pwX += c.measureText(pw.t ? `${pw.label} ${pw.t.toFixed(1)}s` : pw.label).width + 18;
    });

    hudTex.needsUpdate = true;
  }

  // ── Overlay (idle / game over / wave clear) ───────────────────
  let overlayEl;

  function showOverlay(html) {
    if (!overlayEl) return;
    overlayEl.innerHTML = html;
    overlayEl.style.display = 'flex';
  }
  function hideOverlay() {
    if (overlayEl) overlayEl.style.display = 'none';
  }

  // ── Main game loop ────────────────────────────────────────────
  let lastT = 0;

  function loop(t) {
    if (destroyed) return;
    animId = requestAnimationFrame(loop);

    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;

    scrollStars(dt);
    animFrame(dt);
    updateFloatSprites(dt);

    if (gameState === 'playing') {
      updatePlayer(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updatePowerUps(dt);
      updateParticles(dt);
      updateLaser(dt);
      updateNukeRing(dt);
      checkCollisions();
      updateTimers(dt);
    }

    renderHUD();
    renderer.render(scene, camera);
  }

  let _animRot = 0;
  function animFrame(dt) {
    _animRot += dt;
    // Pulse enemy glow
    enemies.forEach((e, i) => {
      if (e.dead) return;
      const pulse = 1.2 + Math.sin(_animRot * 2.5 + i) * 0.4;
      e.mesh.children.forEach(c => {
        if (c.material && c.material.emissiveIntensity !== undefined) {
          if (c.material.emissiveIntensity > 2.0) return; // skip flash
          c.material.emissiveIntensity = pulse;
        }
      });
      // Rotate type 1 and 3 slightly
      if (e.type === 1) e.mesh.rotation.z += dt * 1.5;
      if (e.type === 3) e.mesh.rotation.z += dt * 2.0;
    });

    // Power-up spin
    powerUps.forEach(p => { p.mesh.rotation.y += dt * 2.2; p.mesh.rotation.x += dt * 1.1; });

    // Player engine flicker
    if (player && player._engineMat) {
      player._engineMat.emissiveIntensity = 2.5 + Math.sin(_animRot * 8) * 0.5;
    }

    // Shield pulse
    if (shieldMesh) {
      shieldMesh.material.opacity = 0.22 + Math.sin(_animRot * 4) * 0.08;
      shieldMesh.rotation.y += dt * 1.0;
    }

    // Screen flash
    if (flashTimer > 0) {
      flashTimer -= dt;
      renderer.setClearColor(0x220010, Math.min(1, flashTimer * 8));
    } else {
      renderer.setClearColor(0x020710, 1);
    }
  }

  function updatePlayer(dt) {
    const spd = PLAYER_SPEED;
    let dx = 0;
    if (keys['ArrowLeft']  || keys['KeyA']) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
    if (touchDir !== 0) dx = touchDir;

    px += dx * spd * dt;
    px = Math.max(-(W / 2 - 0.8), Math.min(W / 2 - 0.8, px));
    player.position.x = px;

    // Tilt on movement
    player.rotation.z = -dx * 0.22;

    // Fire
    const fireKey = keys['Space'] || keys['KeyZ'] || fireHeld;
    if (fireKey && gameState === 'playing') {
      const cooldown = rapidTimer > 0 ? 0.1 : spreadTimer > 0 ? 0.22 : 0.25;
      fireCooldown -= dt;
      if (fireCooldown <= 0) {
        fireCooldown = cooldown;
        if (laserTimer <= 0) firePrimary();
      }
    }

    // Laser position tracking
    if (laserBeam) {
      laserBeam.position.set(player.position.x, player.position.y + H / 2, 0);
    }
  }

  function updateEnemies(dt) {
    if (enemies.length === 0) {
      waveDelay -= dt;
      if (waveDelay <= 0) {
        sndWaveClear();
        spawnWave();
      }
      return;
    }

    const slow = slowTimer > 0 ? 0.4 : 1.0;

    // Marching step
    enemyStepTimer -= dt * slow;
    if (enemyStepTimer <= 0) {
      enemyStepTimer = enemyStepInterval;
      const stepX = 0.4 * enemyDir;

      // Check boundary
      let needFlip = false;
      enemies.forEach(e => {
        if (e.dead) return;
        const nx = e.mesh.position.x + stepX;
        if (Math.abs(nx) > W / 2 - 0.6) needFlip = true;
      });

      if (needFlip) {
        enemyDir *= -1;
        // Descend
        enemies.forEach(e => { if (!e.dead) e.mesh.position.y -= 0.55; });
      } else {
        enemies.forEach(e => { if (!e.dead) e.mesh.position.x += stepX; });
      }

      // Check if reached player line
      enemies.forEach(e => {
        if (!e.dead && e.mesh.position.y < PLAYER_Y + 0.5) {
          killPlayer();
        }
      });
    }

    // Zigzag behaviour (type 3) — extra lateral drift
    enemies.forEach(e => {
      if (e.dead || e.type !== 3) return;
      e.zigTimer += dt * slow;
      if (e.zigTimer > 0.6) {
        e.zigTimer = 0;
        e.zigDir *= -1;
        e.mesh.position.x += e.zigDir * 0.7;
      }
    });

    // Enemy fire
    enemies.forEach(e => {
      if (e.dead) return;
      e.fireTimer -= dt * slow;
      if (e.fireTimer <= 0) {
        const rateBoost = Math.min(wave * 0.06, 0.4);
        e.fireTimer = Math.max(2.0, 3.5 - rateBoost) + Math.random() * 3;
        spawnEnemyBullet(e);
      }
    });
  }

  function updateBullets(dt) {
    // Player bullets
    playerBullets = playerBullets.filter(b => {
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      if (b.mesh.position.y > H) { scene.remove(b.mesh); return false; }
      return true;
    });

    // Enemy bullets
    enemyBullets = enemyBullets.filter(b => {
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.x += b.vx * dt;
      if (b.mesh.position.y < -H) { scene.remove(b.mesh); return false; }
      return true;
    });
  }

  function updatePowerUps(dt) {
    powerUps = powerUps.filter(p => {
      p.mesh.position.y += p.vy * dt;
      if (p.mesh.position.y < -H) { scene.remove(p.mesh); return false; }
      // Collect
      if (dist2D(p.mesh, player) < 0.85) {
        applyPowerUp(p.type);
        spawnHitSpark(p.mesh.position.x, p.mesh.position.y, PW_COLORS[p.type]);
        scene.remove(p.mesh);
        return false;
      }
      return true;
    });
  }

  function updateParticles(dt) {
    particles = particles.filter(p => {
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.life -= dt * 1.6;
      p.mat.opacity = Math.max(0, p.life);
      if (p.life <= 0) { scene.remove(p.mesh); return false; }
      return true;
    });
  }

  function updateFloatSprites(dt) {
    for (let i = _floatSprites.length - 1; i >= 0; i--) {
      const f = _floatSprites[i];
      f.sprite.position.y += f.vy * dt;
      f.life -= dt * 1.4;
      f.mat.opacity = Math.max(0, f.life);
      if (f.life <= 0) { scene.remove(f.sprite); _floatSprites.splice(i, 1); }
    }
  }

  function updateLaser(dt) {
    if (laserTimer <= 0) {
      if (laserBeam) { scene.remove(laserBeam); laserBeam = null; }
      return;
    }
    laserTimer -= dt;
    if (!laserBeam) buildLaser();
    // Laser hits all enemies in column
    enemies.forEach(e => {
      if (e.dead) return;
      if (Math.abs(e.mesh.position.x - player.position.x) < 0.45) {
        e.hp = 0; // instant kill
        hitEnemy(e, e.mesh.position.x, e.mesh.position.y);
      }
    });
    // Pulse opacity
    if (laserBeam) laserBeam.material.opacity = 0.65 + Math.sin(_animRot * 20) * 0.25;
  }

  function updateNukeRing(dt) {
    if (!nukeRing) return;
    nukeRing._scale += dt * 22;
    nukeRing._life  -= dt * 1.8;
    nukeRing.scale.setScalar(nukeRing._scale);
    nukeRing.material.opacity = Math.max(0, nukeRing._life * 0.8);
    if (nukeRing._life <= 0) { scene.remove(nukeRing); nukeRing = null; }
  }

  function updateTimers(dt) {
    if (rapidTimer  > 0) rapidTimer  -= dt;
    if (spreadTimer > 0) spreadTimer -= dt;
    if (slowTimer   > 0) slowTimer   -= dt;
    if (invincible  > 0) invincible  -= dt;
    if (rapidTimer  < 0) rapidTimer  = 0;
    if (spreadTimer < 0) spreadTimer = 0;
    if (slowTimer   < 0) slowTimer   = 0;
    if (invincible  < 0) invincible  = 0;

    // Player blink while invincible
    if (player) player.visible = invincible <= 0 || Math.floor(invincible * 10) % 2 === 0;
  }

  function checkCollisions() {
    // Player bullets vs enemies
    for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
      const b = playerBullets[bi];
      let hit = false;
      for (let ei = 0; ei < enemies.length; ei++) {
        const e = enemies[ei];
        if (e.dead) continue;
        const r = e.type === 2 ? 0.6 : 0.45;
        if (dist2D(b.mesh, e.mesh) < r) {
          scene.remove(b.mesh);
          playerBullets.splice(bi, 1);
          hitEnemy(e, b.mesh.position.x, b.mesh.position.y);
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }

    // Enemy bullets vs player
    if (invincible <= 0) {
      for (let bi = enemyBullets.length - 1; bi >= 0; bi--) {
        const b = enemyBullets[bi];
        if (dist2D(b.mesh, player) < 0.7) {
          scene.remove(b.mesh);
          enemyBullets.splice(bi, 1);
          if (shieldHP > 0) {
            shieldHP--;
            sndShield();
            spawnHitSpark(b.mesh.position.x, b.mesh.position.y, COLORS.shield);
            if (shieldHP === 0 && shieldMesh) { player.remove(shieldMesh); shieldMesh = null; }
          } else {
            takeDamage();
          }
        }
      }
    }

    // Clean dead enemies
    enemies = enemies.filter(e => !e.dead);

    // Check wave clear
    if (enemies.length === 0) {
      waveDelay = 2.5;
      showOverlay(`
        <div class="si-ov-title" style="color:#ffe600;text-shadow:0 0 24px #ffe600">WAVE ${wave} CLEAR!</div>
        <div class="si-ov-sub">Next wave incoming…</div>
      `);
      setTimeout(hideOverlay, 2200);
    }
  }

  function takeDamage() {
    health--;
    sndPlayerHit();
    flashTimer = 0.35;
    invincible = 2.2;
    spawnExplosion(player.position.x, player.position.y, 0xff2222, 14);
    if (health <= 0) killPlayer();
  }

  function killPlayer() {
    if (gameState !== 'playing') return;
    gameState = 'dead';
    sndGameOver();
    spawnExplosion(player.position.x, player.position.y, COLORS.player, 28);
    player.visible = false;

    if (score > bestScore) {
      bestScore = score;
      try { localStorage.setItem('si-best', bestScore); } catch(e) {}
      // Submit to arcade leaderboard
      if (window.HS) window.HS.promptSubmit('spaceinvaders', score, score.toLocaleString());
    }

    setTimeout(() => {
      showOverlay(`
        <div class="si-ov-title" style="color:#ff2d78;text-shadow:0 0 30px rgba(255,45,120,0.9)">GAME OVER</div>
        <div class="si-ov-score">${score.toLocaleString()}</div>
        <div class="si-ov-sub">WAVE ${wave} · BEST ${bestScore.toLocaleString()}</div>
        <button class="si-ov-btn" id="si-restart-btn">▶ PLAY AGAIN</button>
        <button class="si-ov-btn si-ov-btn-dim" id="si-exit-btn">🕹 ARCADE</button>
      `);
      document.getElementById('si-restart-btn')?.addEventListener('click', startGame);
      document.getElementById('si-exit-btn')?.addEventListener('click',   () => window.backToGameSelect?.());
    }, 1800);
  }

  // ── Resize ────────────────────────────────────────────────────
  function onResize() {
    if (!screenEl || !renderer) return;
    const w = screenEl.clientWidth;
    const h = screenEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // Adjust camera distance so world fits with some padding for HUD
    const aspect = w / h;
    const fovRad = camera.fov * Math.PI / 180;
    const fitH = (H + 2.5) / (2 * Math.tan(fovRad / 2));
    const fitW = ((W + 1) / aspect) / (2 * Math.tan(fovRad / 2));
    camera.position.z = Math.max(fitH, fitW) + 1;
  }

  // ── Input ─────────────────────────────────────────────────────
  function onKey(e) {
    const down = e.type === 'keydown';
    keys[e.code] = down;
    if (e.code === 'Space' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
    }
    if (down) {
      if ((e.code === 'Space' || e.code === 'Enter') && gameState === 'idle') startGame();
      if (e.code === 'Escape') window.backToGameSelect?.();
    }
  }

  // Touch controls
  let _touchStartX = 0;
  function onTouchStart(e) {
    _touchStartX = e.touches[0].clientX;
    try { ac().resume(); } catch(err) {}
    if (gameState === 'idle') startGame();
    fireHeld = true;
  }
  function onTouchMove(e) {
    const dx = e.touches[0].clientX - _touchStartX;
    touchDir = dx > 8 ? 1 : dx < -8 ? -1 : 0;
  }
  function onTouchEnd() { touchDir = 0; fireHeld = false; }

  // ── Start / reset ─────────────────────────────────────────────
  function startGame() {
    try { ac().resume(); } catch(e) {}
    hideOverlay();

    // Clear scene objects
    [...enemies, ...playerBullets, ...enemyBullets, ...powerUps, ...particles].forEach(o => scene.remove(o.mesh));
    _floatSprites.forEach(f => scene.remove(f.sprite));
    _floatSprites.length = 0;
    if (laserBeam) { scene.remove(laserBeam); laserBeam = null; }
    if (shieldMesh) { player.remove(shieldMesh); shieldMesh = null; }
    if (nukeRing)   { scene.remove(nukeRing); nukeRing = null; }

    enemies = []; playerBullets = []; enemyBullets = []; powerUps = []; particles = [];

    // Reset state
    health = 3; score = 0; wave = 0;
    px = 0; player.position.x = 0; player.visible = true;
    rapidTimer = 0; spreadTimer = 0; laserTimer = 0; slowTimer = 0;
    shieldHP = 0; invincible = 0; fireCooldown = -1; flashTimer = 0;
    waveDelay = 0; enemyDir = 1;

    gameState = 'playing';
    spawnWave();
  }

  // ── Build DOM ─────────────────────────────────────────────────
  function buildDOM(container) {
    container.innerHTML = `
      <style>
        #si-root {
          width: 100%; height: 100%;
          position: relative;
          background: #020710;
          font-family: 'Share Tech Mono', monospace;
          overflow: hidden;
        }
        #si-canvas-wrap {
          width: 100%; height: 100%;
          position: absolute; inset: 0;
          cursor: crosshair;
        }
        #si-overlay {
          display: none;
          position: absolute; inset: 0;
          background: rgba(2,7,16,0.78);
          flex-direction: column;
          align-items: center; justify-content: center;
          gap: 14px; z-index: 20;
          pointer-events: none;
        }
        #si-overlay button, #si-overlay a {
          pointer-events: all;
        }
        .si-ov-title {
          font-family: 'Orbitron', sans-serif;
          font-size: clamp(1.6rem, 5vw, 3rem);
          font-weight: 900;
          letter-spacing: 0.18em;
          text-align: center;
        }
        .si-ov-score {
          font-family: 'Orbitron', sans-serif;
          font-size: clamp(1rem, 3vw, 1.8rem);
          color: #ffe600;
          text-shadow: 0 0 14px rgba(255,230,0,0.7);
        }
        .si-ov-sub {
          font-size: clamp(0.65rem, 1.6vw, 0.9rem);
          color: rgba(0,200,255,0.6);
          letter-spacing: 0.14em;
          text-align: center;
        }
        .si-ov-btn {
          padding: 10px 28px;
          background: transparent;
          border: 1px solid #00e5ff;
          color: #00e5ff;
          font-family: 'Share Tech Mono', monospace;
          font-size: clamp(0.7rem, 1.8vw, 1rem);
          letter-spacing: 0.15em;
          cursor: pointer;
          text-transform: uppercase;
          transition: all 0.18s;
        }
        .si-ov-btn:hover { background: rgba(0,229,255,0.12); box-shadow: 0 0 14px rgba(0,229,255,0.4); }
        .si-ov-btn.si-ov-btn-dim { border-color: rgba(0,229,255,0.3); color: rgba(0,229,255,0.5); }
        .si-ov-controls {
          font-size: clamp(0.52rem, 1.2vw, 0.7rem);
          color: rgba(0,180,220,0.38);
          letter-spacing: 0.1em;
          text-align: center;
          line-height: 1.8;
          margin-top: 4px;
        }
        #si-back-btn {
          position: absolute;
          top: 10px; right: 12px;
          z-index: 30;
          padding: 4px 12px;
          background: transparent;
          border: 1px solid rgba(0,229,255,0.28);
          color: rgba(0,229,255,0.65);
          font-family: 'Share Tech Mono', monospace;
          font-size: clamp(0.5rem, 1.2vw, 0.68rem);
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.15s;
        }
        #si-back-btn:hover { background: rgba(0,229,255,0.08); border-color: #00e5ff; color: #00e5ff; }
      </style>
      <div id="si-root">
        <div id="si-canvas-wrap"></div>
        <div id="si-overlay"></div>
        <button id="si-back-btn" class="arcade-back-btn">🕹 ARCADE</button>
      </div>
    `;

    overlayEl = container.querySelector('#si-overlay');
    const canvasWrap = container.querySelector('#si-canvas-wrap');
    document.getElementById('si-back-btn')?.addEventListener('click', () => window.backToGameSelect?.());

    // Set up Three.js
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x020710, 1);
    canvasWrap.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

    // Lighting
    const ambient = new THREE.AmbientLight(0x112244, 0.8);
    scene.add(ambient);
    const point = new THREE.PointLight(0x00e5ff, 1.5, 30);
    point.position.set(0, 0, 8);
    scene.add(point);
    const point2 = new THREE.PointLight(0xff2d78, 0.8, 20);
    point2.position.set(0, -4, 6);
    scene.add(point2);

    buildStars();
    buildPlayer();
    buildHUD();

    onResize();
    resizeOb = new ResizeObserver(onResize);
    resizeOb.observe(container);

    // Input — mousedown/up on window so nothing can block it
    canvasWrap.tabIndex = 0;
    canvasWrap.style.outline = 'none';
    window.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      try { ac().resume(); } catch(err) {}
      if (gameState === 'playing') fireHeld = true;
    }, true);
    window.addEventListener('mouseup', e => {
      if (e.button === 0) fireHeld = false;
    }, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup',   onKey, true);
    canvasWrap.addEventListener('touchstart', onTouchStart, { passive: false });
    canvasWrap.addEventListener('touchmove',  onTouchMove,  { passive: true });
    canvasWrap.addEventListener('touchend',   onTouchEnd);

    // Idle screen
    gameState = 'idle';
    showOverlay(`
      <div class="si-ov-title" style="color:#00e5ff;text-shadow:0 0 30px rgba(0,229,255,0.9),0 0 60px rgba(0,229,255,0.4)">SPACE INVADERS</div>
      <div class="si-ov-sub">Power-ups · 5 enemy types · endless waves</div>
      <button class="si-ov-btn" id="si-start-btn">▶ START GAME</button>
      <div class="si-ov-controls">
        ← → / A D &nbsp;MOVE &nbsp;·&nbsp; LEFT CLICK &nbsp;FIRE &nbsp;·&nbsp; ESC &nbsp;EXIT<br>
        Power-ups: ⛨ SHIELD &nbsp;⚡ RAPID &nbsp;✦ SPREAD &nbsp;▌ LASER &nbsp;☢ NUKE &nbsp;❄ SLOW
      </div>
    `);
    document.getElementById('si-start-btn')?.addEventListener('click', startGame);

    animId = requestAnimationFrame(loop);
  }

  // ── Public API ────────────────────────────────────────────────
  function init() {
    const screenEl2 = document.getElementById('spaceinvaders-screen');
    if (!screenEl2) { console.warn('[spaceinvaders] screen element not found'); return; }
    screenEl = screenEl2;
    destroyed = false;
    bestScore = parseInt(localStorage.getItem('si-best') || '0', 10);

    // Load Three.js then build
    if (window.THREE) {
      buildDOM(screenEl);
    } else {
      const s = document.createElement('script');
      s.src = THREE_URL;
      s.onload = () => buildDOM(screenEl);
      s.onerror = () => console.error('[spaceinvaders] Failed to load Three.js');
      document.head.appendChild(s);
    }
  }

  function destroy() {
    destroyed = true;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup',   onKey, true);
    const cw = document.querySelector('#si-canvas-wrap');
    if (cw) { cw.removeEventListener('keydown', onKey); cw.removeEventListener('keyup', onKey); }
    if (resizeOb) { resizeOb.disconnect(); resizeOb = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; camera = null;
    enemies = []; playerBullets = []; enemyBullets = []; powerUps = []; particles = [];
    const el = document.getElementById('spaceinvaders-screen');
    if (el) el.innerHTML = '';
  }

  return { init, destroy };
})();
