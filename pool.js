// POOL ENGINE — extracted from index.html
// Loaded lazily when game is first selected

// ============================================================
// POOL GAME ENGINE
// ============================================================
const POOL = {
  // Table dimensions (logical units)
  TW: 700, TH: 350,
  POCKET_R: 18,
  BALL_R: 8.8,
  // Physics uses constant-deceleration model (like real felt):
  //   sliding decel = MU_SLIDE * G  (strong, ~0.2 in SI units)
  //   rolling decel = MU_ROLL  * G  (weak,  ~0.016 in SI units)
  // Scaled to table units where 1 unit ≈ 3.6mm, 60fps
  MU_SLIDE: 0.032,         // sliding friction decel per frame (px/frame²)
  MU_ROLL:  0.00045,        // rolling friction decel per frame (px/frame²)
  MIN_SPEED: 0.018,         // stop threshold
  CUSHION_RESTITUTION: 0.80, // energy retained on cushion bounce

  canvas: null,
  ctx: null,
  balls: [],
  cueBall: null,
  roomCode: null,
  playerNum: null,
  playerName: '',
  myTurn: false,
  unsubs: [],
  animFrame: null,
  isMoving: false,
  aimAngle: 0,
  mouseX: 0,
  mouseY: 0,
  shotState: 'aiming',   // 'aiming' | 'locked' | 'shooting'
  lockedAngle: 0,
  lockMouseDist: 0,      // distance from cue ball when locked
  pullback: 0,           // 0..1 power derived from mouse movement after lock

  myBallType: null,   // 'red' | 'yellow' | null
  opponentBallType: null,
  isBot: false,
  botDifficulty: 'medium',
  firstBallHitId: null,   // id of first ball cue ball contacts this shot
  shotFoul: false,        // was this shot a foul?
  potted: [],
  tube: [],       // all potted balls in single tube
  tubeAnims: [], // rolling animations in progress
  myPotted: 0,
  oppPotted: 0,
  eightBallPotted: false,
  lastShotResult: null,
  shotSeq: 0,
  _lastObservedSeq: 0,
  oppCue: null,           // opponent's live cue aim { angle, state, pullback, p }
  _lastCueBroadcast: 0,
  _sparks: [],            // collision spark particles
  twoShotsOwed: false,   // true when this player has two shots from a foul
  scaleFactor: 1,
  offsetX: 0,
  offsetY: 0,

  POCKETS: [],
  BALL_COLORS: [],
};

function poolInit() {
  const pr = POOL.POCKET_R;
  const tw = POOL.TW, th = POOL.TH;
  // Corner pockets: at corners. Middle pockets: ON the cushion edge (y=pr top, y=th-pr bottom)
  POOL.POCKETS = [
    {x: pr,       y: pr,       type:'corner'},
    {x: tw/2,     y: pr,       type:'mid'},    // top middle - ON the top cushion line
    {x: tw-pr,    y: pr,       type:'corner'},
    {x: pr,       y: th-pr,    type:'corner'},
    {x: tw/2,     y: th-pr,    type:'mid'},    // bottom middle - ON the bottom cushion line
    {x: tw-pr,    y: th-pr,    type:'corner'},
  ];
  // Gap half-width cut in cushion at each middle pocket
  POOL.MID_GAP = pr + 4;   // half-width of the opening in the cushion

  // Balls 1-7 = red, 8 = black, 9-15 = yellow (UK/EU style)
  POOL.BALL_COLORS = [
    null,          // 0 = cue ball (white)
    '#cc1111',     // 1 red
    '#cc1111',     // 2 red
    '#cc1111',     // 3 red
    '#cc1111',     // 4 red
    '#cc1111',     // 5 red
    '#cc1111',     // 6 red
    '#cc1111',     // 7 red
    '#111111',     // 8 black
    '#e8c010',     // 9 yellow
    '#e8c010',     // 10 yellow
    '#e8c010',     // 11 yellow
    '#e8c010',     // 12 yellow
    '#e8c010',     // 13 yellow
    '#e8c010',     // 14 yellow
    '#e8c010',     // 15 yellow
  ];

  // Pre-render ball sprites to avoid per-frame radialGradient calls
  const r = POOL.BALL_R, sz = r * 2 + 4;
  POOL._ballSprites = [];
  for (let id = 0; id <= 15; id++) {
    const oc = document.createElement('canvas'); oc.width = oc.height = sz;
    const c = oc.getContext('2d'); const cx = sz/2, cy = sz/2;
    const color = POOL.BALL_COLORS[id];
    const isStripe = id >= 9 && id <= 15;
    c.beginPath(); c.arc(cx, cy,Math.max(0,r), 0, Math.PI*2); c.clip();
    if (id === 0) {
      const g = c.createRadialGradient(cx-r*0.28,cy-r*0.32,Math.max(0.01,r*0.04),cx+r*0.05,cy+r*0.05,Math.max(0.01,r*1.05));
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.6,'#d8d8d8'); g.addColorStop(1,'#aaaaaa');
      c.fillStyle=g; c.beginPath(); c.arc(cx,cy,Math.max(0,r),0,Math.PI*2); c.fill();
    } else if (isStripe) {
      c.fillStyle='#eeeeee'; c.beginPath(); c.arc(cx,cy,Math.max(0,r),0,Math.PI*2); c.fill();
      const bandH = r*0.80; c.fillStyle=color; c.fillRect(cx-r,cy-bandH*0.5,r*2,bandH);
    } else {
      const g = c.createRadialGradient(cx-r*0.3,cy-r*0.3,Math.max(0.01,r*0.04),cx+r*0.1,cy+r*0.1,Math.max(0.01,r*1.05));
      g.addColorStop(0,'rgba(255,255,255,0.5)'); g.addColorStop(0.3,color); g.addColorStop(1,'rgba(0,0,0,0.85)');
      c.fillStyle=g; c.beginPath(); c.arc(cx,cy,Math.max(0,r),0,Math.PI*2); c.fill();
    }
    if (id > 0) {
      c.fillStyle='rgba(255,255,255,0.95)'; c.beginPath(); c.arc(cx,cy,Math.max(0,r*0.42),0,Math.PI*2); c.fill();
      c.fillStyle='#111'; c.font=`bold ${r*(id>=10?0.56:0.68)}px Arial,sans-serif`;
      c.textAlign='center'; c.textBaseline='middle'; c.fillText(id,cx,cy+r*0.03);
    }
    // Specular
    c.restore && c.restore(); // end clip
    c.save(); c.beginPath(); c.arc(cx-r*0.28,cy-r*0.28,Math.max(0,r*0.22),0,Math.PI*2); c.fillStyle='rgba(255,255,255,0.55)'; c.fill(); c.restore();
    POOL._ballSprites[id] = oc;
  }
}

// ============================================================
// POOL SOUND ENGINE — fully synthesised via Web Audio API
// All sounds are procedurally generated; no external files needed.
//
// Public API (called from physics / shot hooks):
//   POOL_SFX.cueHit(power)          — cue strikes cue ball  (power 0-1)
//   POOL_SFX.ballHit(imp)           — ball-ball collision    (imp = impulse magnitude)
//   POOL_SFX.cushion(imp)           — ball hits cushion      (imp = speed component)
//   POOL_SFX.pocket()               — ball drops into pocket
//   POOL_SFX.roll(speed)            — called every frame for rolling rumble (poolDraw)
// ============================================================
const POOL_SFX = (() => {
  let ctx = null;
  let masterGain = null;
  let rollNode = null, rollGain = null, rollFilter = null;

  function _ctx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.80;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function envelope(gainNode, ac, attackT, decayT, peakVal, now) {
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(peakVal, now + attackT);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + attackT + decayT);
  }

  function noiseBuffer(ac, durationSec) {
    const len = Math.ceil(ac.sampleRate * durationSec);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // CUE HIT — woody thwack + pitched transient + low thud on hard shots
  function cueHit(power) {
    const ac = _ctx();
    const now = ac.currentTime;
    const p = Math.max(0.05, Math.min(1, power));

    const nBuf = noiseBuffer(ac, 0.12);
    const nSrc = ac.createBufferSource();
    nSrc.buffer = nBuf;
    const nBP = ac.createBiquadFilter();
    nBP.type = 'bandpass';
    nBP.frequency.value = 2200 + p * 900;
    nBP.Q.value = 2.5;
    const nGain = ac.createGain();
    envelope(nGain, ac, 0.001, 0.06 + p * 0.04, 0.55 * p, now);
    nSrc.connect(nBP); nBP.connect(nGain); nGain.connect(masterGain);
    nSrc.start(now); nSrc.stop(now + 0.15);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900 + p * 400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
    const oGain = ac.createGain();
    envelope(oGain, ac, 0.001, 0.07 + p * 0.05, 0.35 * p, now);
    osc.connect(oGain); oGain.connect(masterGain);
    osc.start(now); osc.stop(now + 0.15);

    if (p > 0.35) {
      const thud = ac.createOscillator();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(65 + p * 30, now);
      thud.frequency.exponentialRampToValueAtTime(28, now + 0.12);
      const tGain = ac.createGain();
      envelope(tGain, ac, 0.001, 0.10 + p * 0.06, 0.50 * (p - 0.35), now);
      thud.connect(tGain); tGain.connect(masterGain);
      thud.start(now); thud.stop(now + 0.20);
    }
  }

  // BALL–BALL — crisp ivory clack with harmonic resonance
  function ballHit(imp) {
    const ac = _ctx();
    const now = ac.currentTime;
    const norm = Math.max(0.05, Math.min(1, imp / 10));

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400 + norm * 600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.055);
    const oGain = ac.createGain();
    envelope(oGain, ac, 0.0005, 0.045 + norm * 0.035, 0.45 * norm, now);
    osc.connect(oGain); oGain.connect(masterGain);
    osc.start(now); osc.stop(now + 0.10);

    const osc2 = ac.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2700 + norm * 800, now);
    osc2.frequency.exponentialRampToValueAtTime(500, now + 0.04);
    const oGain2 = ac.createGain();
    envelope(oGain2, ac, 0.0005, 0.035, 0.22 * norm, now);
    osc2.connect(oGain2); oGain2.connect(masterGain);
    osc2.start(now); osc2.stop(now + 0.08);

    const nBuf = noiseBuffer(ac, 0.04);
    const nSrc = ac.createBufferSource();
    nSrc.buffer = nBuf;
    const nHP = ac.createBiquadFilter();
    nHP.type = 'highpass';
    nHP.frequency.value = 3500;
    const nGain = ac.createGain();
    envelope(nGain, ac, 0.0005, 0.025, 0.30 * norm, now);
    nSrc.connect(nHP); nHP.connect(nGain); nGain.connect(masterGain);
    nSrc.start(now); nSrc.stop(now + 0.05);
  }

  // CUSHION — rubbery thud + wooden frame knock
  function cushion(speed) {
    const ac = _ctx();
    const now = ac.currentTime;
    const norm = Math.max(0.05, Math.min(1, speed / 8));

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160 + norm * 120, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.12 + norm * 0.05);
    const oGain = ac.createGain();
    envelope(oGain, ac, 0.001, 0.10 + norm * 0.08, 0.55 * norm, now);
    osc.connect(oGain); oGain.connect(masterGain);
    osc.start(now); osc.stop(now + 0.25);

    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(380 + norm * 200, now);
    osc2.frequency.exponentialRampToValueAtTime(100, now + 0.08);
    const oGain2 = ac.createGain();
    envelope(oGain2, ac, 0.001, 0.065, 0.28 * norm, now);
    osc2.connect(oGain2); oGain2.connect(masterGain);
    osc2.start(now); osc2.stop(now + 0.12);

    const nBuf = noiseBuffer(ac, 0.08);
    const nSrc = ac.createBufferSource();
    nSrc.buffer = nBuf;
    const nLP = ac.createBiquadFilter();
    nLP.type = 'lowpass';
    nLP.frequency.value = 600 + norm * 400;
    const nGain = ac.createGain();
    envelope(nGain, ac, 0.001, 0.06, 0.20 * norm, now);
    nSrc.connect(nLP); nLP.connect(nGain); nGain.connect(masterGain);
    nSrc.start(now); nSrc.stop(now + 0.09);
  }

  // POCKET — hollow thunk + rattle as ball drops into leather pocket
  function pocket() {
    const ac = _ctx();
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    const oGain = ac.createGain();
    envelope(oGain, ac, 0.001, 0.16, 0.80, now);
    osc.connect(oGain); oGain.connect(masterGain);
    osc.start(now); osc.stop(now + 0.22);

    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(420, now);
    osc2.frequency.exponentialRampToValueAtTime(85, now + 0.10);
    const oGain2 = ac.createGain();
    envelope(oGain2, ac, 0.001, 0.08, 0.40, now);
    osc2.connect(oGain2); oGain2.connect(masterGain);
    osc2.start(now); osc2.stop(now + 0.14);

    const nBuf = noiseBuffer(ac, 0.18);
    const nSrc = ac.createBufferSource();
    nSrc.buffer = nBuf;
    const nBP = ac.createBiquadFilter();
    nBP.type = 'bandpass';
    nBP.frequency.value = 320;
    nBP.Q.value = 1.8;
    const nGain = ac.createGain();
    nGain.gain.setValueAtTime(0, now + 0.02);
    nGain.gain.linearRampToValueAtTime(0.35, now + 0.04);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    nSrc.connect(nBP); nBP.connect(nGain); nGain.connect(masterGain);
    nSrc.start(now); nSrc.stop(now + 0.24);

    const sub = ac.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(55, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 0.14);
    const sGain = ac.createGain();
    envelope(sGain, ac, 0.001, 0.12, 0.60, now);
    sub.connect(sGain); sGain.connect(masterGain);
    sub.start(now); sub.stop(now + 0.18);
  }

  // ROLLING RUMBLE — persistent looping noise, modulated by speed
  let _rollTarget = 0;

  function _ensureRollNode(ac) {
    if (rollNode) return;
    const buf = noiseBuffer(ac, 2.0);
    rollNode = ac.createBufferSource();
    rollNode.buffer = buf;
    rollNode.loop = true;
    rollFilter = ac.createBiquadFilter();
    rollFilter.type = 'bandpass';
    rollFilter.frequency.value = 180;
    rollFilter.Q.value = 0.8;
    rollGain = ac.createGain();
    rollGain.gain.value = 0;
    rollNode.connect(rollFilter);
    rollFilter.connect(rollGain);
    rollGain.connect(masterGain);
    rollNode.start();
  }

  function roll(speed) {
    if (!speed || speed < 0.05) {
      _rollTarget = 0;
    } else {
      const norm = Math.min(1, speed / 10);
      _rollTarget = norm * 0.08;
      try {
        const ac = _ctx();
        _ensureRollNode(ac);
        rollFilter.frequency.setTargetAtTime(140 + norm * 200, ac.currentTime, 0.1);
      } catch(e) {}
    }
    if (rollGain) {
      const cur = rollGain.gain.value;
      rollGain.gain.value = cur + (_rollTarget - cur) * 0.12;
    }
  }

  return { cueHit, ballHit, cushion, pocket, roll };
})();

function poolSetupBalls() {
  POOL.balls = [];
  POOL.twoShotsOwed = false;
  POOL._botTwoShots = 0;
  POOL.oppCue = null;
  POOL._sparks = [];
  // Cue ball
  POOL.balls.push({ id: 0, x: POOL.TW * 0.25, y: POOL.TH / 2, vx: 0, vy: 0, potted: false, angle: 0, spin: 0, sliding: false });

  // Rack: triangle at 3/4 mark
  const rx = POOL.TW * 0.65;
  const ry = POOL.TH / 2;
  const br = POOL.BALL_R * 2 + 1;
  const rows = [[8],[1,9],[2,8,10],[3,4,11,12],[5,6,7,13,14,15]]; // 8 in center of 3rd row -> fixed
  // Standard rack order with 8 in middle
  const order = [1,9,2,8,10,3,4,11,12,5,6,7,13,14,15];
  let idx2 = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const bx = rx + row * br * 0.866;
      const by = ry + (col - row/2) * br;
      POOL.balls.push({ id: order[idx2++], x: bx, y: by, vx: 0, vy: 0, potted: false, angle: 0, spin: 0, sliding: false });
    }
  }
  POOL.cueBall = POOL.balls[0];
}

function poolGetCanvas() {
  // Keep the 2D canvas for mouse coordinate mapping (poolGetMousePos uses getBoundingClientRect)
  POOL.canvas = document.getElementById('pool-canvas');
  POOL.canvas.width  = POOL.TW;
  POOL.canvas.height = POOL.TH;
  // Make it invisible but keep it in layout so rect calculations still work
  POOL.canvas.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:100%;height:100%;';
  POOL.ctx = POOL.canvas.getContext('2d'); // kept alive so nothing else breaks

  // Attach input listeners to document (same as before)
  document.addEventListener('mousemove',  poolMouseMove);
  document.addEventListener('click',      poolMouseClick);
  document.addEventListener('touchmove',  poolTouchMove, {passive:false});
  document.addEventListener('touchend',   poolTouchEnd);
  POOL._docListeners = true;

  // Boot the Three.js renderer
  pool3DInit();
}

// ── THREE.JS POOL RENDERER ─────────────────────────────────────────────────
// All game logic stays in POOL.* untouched.
// This section owns: scene, camera, renderer, ball meshes, table, cue mesh.
// poolDraw() (below) syncs meshes from POOL.balls[] and renders each frame.

const P3 = {
  scene: null, camera: null, renderer: null,
  ballMeshes: [],      // indexed by ball.id (0-15)
  cueMesh: null,
  aimLineMesh: null,
  tableGroup: null,
  THREE: null,
  ready: false,
  container: null,
};

async function pool3DInit() {
  async function loadMod(src) {
    const base = document.baseURI || location.href;
    const url = src.startsWith('http') ? src : new URL(src, base).href;
    return await import(/* webpackIgnore: true */ url);
  }

  async function loadThreeMod() {
    const paths = [
      './three_module_min.js',
      '/Arcade/three_module_min.js',
      `${location.origin}/Arcade/three_module_min.js`,
    ];
    for (const p of paths) {
      try {
        const mod = await loadMod(p);
        if (mod && mod.WebGLRenderer) return mod;
      } catch(e) {}
    }
    return await loadMod('https://unpkg.com/three@0.128.0/build/three.module.js');
  }

  let THREE;
  try { THREE = await loadThreeMod(); } catch(e) {}
  if (!THREE) THREE = await loadMod('https://unpkg.com/three@0.128.0/build/three.module.js');
  P3.THREE = THREE;

  // Scale factor: map 2D px coords → 3D units (table becomes ~14 × 7 units)
  const SCALE = 1 / 50;
  P3.SCALE = SCALE;
  const tw3 = POOL.TW * SCALE;   // ~14
  const th3 = POOL.TH * SCALE;   // ~7

  // Container — attach to the canvas element itself, sized to match it
  // We replace the canvas visually by overlaying the WebGL canvas on top
  const canvasEl = POOL.canvas;
  canvasEl.style.cssText = 'display:block;width:100%;height:100%;visibility:hidden;';
  const canvasParent = canvasEl.parentElement;
  canvasParent.style.position = 'relative';

  const container = document.createElement('div');
  container.id = 'pool-3d-container';
  container.style.cssText = [
    'position:absolute',
    'top:0','left:0','right:0','bottom:0',
    'z-index:1',   // below UI elements (power bar etc. are siblings, not children)
    'overflow:hidden',
  ].join(';');
  canvasParent.appendChild(container);
  P3.container = container;

  // Camera orbit state
  P3.camTheta  = 0;             // horizontal orbit angle
  P3.camPhi    = 0.75;          // vertical tilt — angled view of table
  P3.camDist   = tw3 * 1.2;    // distance from table centre
  P3.camTarget = null;          // set after cx3/cz3 known
  P3.isDragging = false;
  P3.dragStartX = 0; P3.dragStartY = 0;
  P3.dragTheta  = 0; P3.dragPhi    = 0;

  // Renderer — sized to fill the container
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
  container.appendChild(renderer.domElement);
  P3.renderer = renderer;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d18);
  P3.scene = scene;

  // Camera — orbit-controlled, initially looking from above at a slight angle
  const cx3 = tw3 * 0.5, cz3 = th3 * 0.5;
  P3.camTarget = { x: cx3, y: 0, z: cz3 };

  const aspect = 2;
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
  P3.camera = camera;
  P3.SCALE = SCALE;

  function pool3DUpdateCamera() {
    const { camTheta, camPhi, camDist, camTarget } = P3;
    const phi = Math.max(0.12, Math.min(1.48, camPhi));
    const x = camTarget.x + camDist * Math.sin(phi) * Math.sin(camTheta);
    const y = camTarget.y + camDist * Math.cos(phi);
    const z = camTarget.z + camDist * Math.sin(phi) * Math.cos(camTheta);
    P3.camera.position.set(x, y, z);
    P3.camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
  }
  P3.pool3DUpdateCamera = pool3DUpdateCamera;
  pool3DUpdateCamera();

  // Lighting
  scene.add(new THREE.AmbientLight(0xfff0e0, 0.6));

  const sun = new THREE.DirectionalLight(0xfffae8, 1.2);
  sun.position.set(cx3, tw3 * 0.9, -th3 * 0.5);
  sun.target.position.set(cx3, 0, cz3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 1024);
  sun.shadow.camera.left   = -tw3 * 0.65;
  sun.shadow.camera.right  =  tw3 * 0.65;
  sun.shadow.camera.top    =  th3 * 0.8;
  sun.shadow.camera.bottom = -th3 * 0.8;
  scene.add(sun); scene.add(sun.target);

  [0.2, 0.5, 0.8].forEach((t, i) => {
    const pl = new THREE.PointLight([0xffe8b0, 0xe8f0ff, 0xffe8b0][i], 0.5, tw3 * 0.9);
    pl.position.set(tw3 * t, tw3 * 0.4, cz3);
    scene.add(pl);
  });

  pool3DBuildTable(THREE, scene, tw3, th3);
  pool3DBuildBalls(THREE, scene, tw3, th3);
  pool3DBuildCue(THREE, scene);
  pool3DBuildAimLine(THREE, scene);

  P3.ready = true;

  function onResize() {
    if (!P3.renderer || !P3.camera) return;
    const rect = container.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    renderer.setSize(rect.width, rect.height, false);
    P3.camera.aspect = rect.width / rect.height;
    P3.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  setTimeout(onResize, 50);
  setTimeout(onResize, 300);
  setTimeout(onResize, 800);

  // ── Camera orbit & zoom ────────────────────────────────────────
  function onCamMouseDown(e) {
    if (e.button !== 2 && e.button !== 1) return;
    P3.isDragging = true;
    P3.dragStartX = e.clientX; P3.dragStartY = e.clientY;
    P3.dragTheta  = P3.camTheta; P3.dragPhi = P3.camPhi;
    e.preventDefault();
  }
  function onCamMouseMove(e) {
    if (!P3.isDragging) return;
    const dx = (e.clientX - P3.dragStartX) / container.clientWidth;
    const dy = (e.clientY - P3.dragStartY) / container.clientHeight;
    P3.camTheta = P3.dragTheta - dx * Math.PI * 2;
    P3.camPhi   = Math.max(0.12, Math.min(1.48, P3.dragPhi - dy * Math.PI));
    pool3DUpdateCamera();
    poolDraw();
  }
  function onCamMouseUp(e) {
    if (e.button === 2 || e.button === 1) P3.isDragging = false;
  }
  function onCamWheel(e) {
    e.preventDefault();
    const tw3l = POOL.TW * P3.SCALE;
    P3.camDist = Math.max(tw3l * 0.3, Math.min(tw3l * 2.0, P3.camDist + e.deltaY * 0.003));
    pool3DUpdateCamera();
    poolDraw();
  }
  function onCamContextMenu(e) { e.preventDefault(); }

  container.addEventListener('mousedown',   onCamMouseDown);
  container.addEventListener('mousemove',   onCamMouseMove);
  container.addEventListener('mouseup',     onCamMouseUp);
  container.addEventListener('wheel',       onCamWheel, { passive: false });
  container.addEventListener('contextmenu', onCamContextMenu);

  poolDraw();
}

function pool3DBuildTable(THREE, scene, tw3, th3) {
  // GLB URL — hosted in repo root alongside other game files
  const GLB_URL = './Pool Table.glb';

  // ── Invisible felt plane at Y=0 — physics reference surface ─────
  // Balls sit at Y = ballRadius, felt is Y=0. The GLB table surface
  // must align with this plane after scaling.
  const feltCanvas = document.createElement('canvas');
  feltCanvas.width=512; feltCanvas.height=256;
  const fc=feltCanvas.getContext('2d');
  const fg=fc.createRadialGradient(256,128,0,256,128,280);
  fg.addColorStop(0,'#1e7a3c');fg.addColorStop(0.5,'#196832');fg.addColorStop(1,'#124d25');
  fc.fillStyle=fg;fc.fillRect(0,0,512,256);
  for(let i=0;i<4000;i++){
    fc.fillStyle=Math.random()>.5?`rgba(0,200,80,${(Math.random()*.04).toFixed(3)})`:`rgba(0,0,0,${(Math.random()*.06).toFixed(3)})`;
    fc.fillRect(Math.random()*512,Math.random()*256,1,1);
  }
  const bxPx=.20*512;
  fc.strokeStyle='rgba(255,255,255,0.18)';fc.lineWidth=1.5;
  fc.beginPath();fc.moveTo(bxPx,0);fc.lineTo(bxPx,256);fc.stroke();
  fc.beginPath();fc.arc(bxPx,128,256*.28,-Math.PI/2,Math.PI/2);fc.stroke();
  const feltMat=new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(feltCanvas),roughness:.92,metalness:0});
  const feltMesh=new THREE.Mesh(new THREE.PlaneGeometry(tw3-POOL.POCKET_R*P3.SCALE*2,th3-POOL.POCKET_R*P3.SCALE*2),feltMat);
  feltMesh.rotation.x=-Math.PI/2;
  feltMesh.position.set(tw3/2,0.001,th3/2);
  feltMesh.receiveShadow=true;
  scene.add(feltMesh);

  // ── Load GLB ──────────────────────────────────────────────────────
  // Load GLTFLoader by fetching the jsm source and rewriting the 'three'
  // import to point at the full module URL we already use.
  async function loadGLTFLoader() {
    const THREE_URL = 'https://unpkg.com/three@0.128.0/build/three.module.js';
    const SRCS = [
      'https://unpkg.com/three@0.128.0/examples/jsm/loaders/GLTFLoader.js',
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js',
    ];
    for (const src_url of SRCS) {
      try {
        const res = await fetch(src_url);
        if (!res.ok) continue;
        let txt = await res.text();
        txt = txt
          .replace(/from\s+['"]three['"]/g, `from '${THREE_URL}'`)
          .replace(/from\s+['"][./]*three\.module(\.min)?\.js['"]/g, `from '${THREE_URL}'`)
          .replace(/from\s+['"]\.\.\/([\w/.]+)['"]/g,
            (_, p) => `from 'https://unpkg.com/three@0.128.0/examples/jsm/${p}'`);
        const blobURL = URL.createObjectURL(new Blob([txt], { type: 'application/javascript' }));
        try {
          const mod = await import(/* webpackIgnore: true */ blobURL);
          URL.revokeObjectURL(blobURL);
          if (mod.GLTFLoader) { console.log('[pool3d] GLTFLoader ready'); return mod.GLTFLoader; }
        } catch(ie) { URL.revokeObjectURL(blobURL); }
      } catch(fe) { console.warn('[pool3d] GLTFLoader fetch failed:', fe.message); }
    }
    // Fallback: script-tag injection (bypasses blob CSP)
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.type = 'module';
      s.textContent = `import{GLTFLoader}from'https://unpkg.com/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';window._p3GL=GLTFLoader;window.dispatchEvent(new Event('_p3GLReady'));`;
      const done = () => { window.removeEventListener('_p3GLReady', done); resolve(window._p3GL||null); };
      window.addEventListener('_p3GLReady', done);
      setTimeout(() => { window.removeEventListener('_p3GLReady', done); resolve(window._p3GL||null); }, 10000);
      document.head.appendChild(s);
    });
  }

  // Ball mesh name patterns to strip from GLB
  // Ball name patterns — only match on the mesh's OWN name (not parent group).
  // /solid/ and /stripe/ removed — they matched table frame groups in this GLB.
  const BALL_PATTERNS = [
    /ball/i,
    /sphere/i,
    /^mesh\d+_group\d+_model/i,  // exact names in Pool Table.glb: Mesh47_Group1_Model_1 etc.
  ];
  function looksLikeBall(name) {
    return BALL_PATTERNS.some(p => p.test(name));
  }

  loadGLTFLoader().then(GLTFLoader => {
    if (!GLTFLoader) {
      console.warn('[pool3d] GLTFLoader not available — using procedural table');
      return;
    }

    const loader = new GLTFLoader();
    // Try repo-relative path, then fallback paths
    const paths = [
      GLB_URL,
      '/Arcade/Pool Table.glb',
      `${location.origin}/Arcade/Pool Table.glb`,
    ];

    function tryLoad(i) {
      if (i >= paths.length) {
        console.warn('[pool3d] Could not load Pool Table.glb from any path');
        return;
      }
      loader.load(paths[i], gltf => {
        const model = gltf.scene;

        // ── Remove ball meshes (own name only, with size guard) ──────
        const _obb = new THREE.Box3().setFromObject(model);
        const _obs = new THREE.Vector3(); _obb.getSize(_obs);
        const _span = Math.max(_obs.x, _obs.z);
        const toRemove = [];
        model.traverse(node => {
          if (!node.isMesh) return;
          const name = (node.name || '').toLowerCase();
          if (!looksLikeBall(name)) return;   // check OWN name only — not parent
          // Size guard: skip anything larger than 15% of table span (can't be a ball)
          node.geometry.computeBoundingBox();
          const bb = node.geometry.boundingBox;
          if (bb) {
            const bs = new THREE.Vector3(); bb.getSize(bs);
            if (Math.max(bs.x, bs.y, bs.z) > _span * 0.15) return;
          }
          toRemove.push(node);
        });
        toRemove.forEach(n => {
          if (n.parent) n.parent.remove(n);
          if (n.geometry) n.geometry.dispose();
          (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m && m.dispose());
        });
        console.log('[pool3d] Removed', toRemove.length, 'ball meshes from GLB');

        // ── Scale and position model to fit 2D physics coords ─────
        // Compute bounding box of the table model
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Scale so the model's longest horizontal dimension matches tw3
        // Most pool table GLBs have the playing surface as the XZ plane
        const modelW = Math.max(size.x, size.z);
        const modelH = Math.min(size.x, size.z);
        const scaleX = tw3 / modelW;
        const scaleZ = th3 / modelH;
        const scale  = Math.min(scaleX, scaleZ); // uniform scale

        model.scale.setScalar(scale);

        // After scaling, recompute center and align felt surface to Y=0
        const box2 = new THREE.Box3().setFromObject(model);
        const center2 = new THREE.Vector3();
        box2.getCenter(center2);
        // box2.min is a direct Vector3 property in Three r128 (no getMin method)
        model.position.set(
          tw3/2 - center2.x,
          -box2.min.y,       // lift so legs sit at Y=0
          th3/2 - center2.z
        );

        // Enable shadows on all meshes
        model.traverse(node => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        // ── Store table surface Y ─────────────────────────────────
        // Legs are at Y=0 after the -box2.min.y lift.
        // Playing surface = top of model minus rail height (~8% of total height).
        const _fb = new THREE.Box3().setFromObject(model);
        const _fh = _fb.max.y - _fb.min.y;
        P3.tableY = _fb.max.y - _fh * 0.08;

        // ── Recolour: replace any non-dark material with green felt ──
        // Pink/bright materials = felt & cushion tops. Dark = frame/legs (keep).
        // We identify "pink" as r>0.5 AND b>0.3 AND g<r (magenta-ish).
        // Anything else that's bright but not dark wood also gets greened.
        const _greenFelt = new THREE.MeshStandardMaterial({ map: feltMat.map, roughness: 0.92, metalness: 0 });
        model.traverse(nd => {
          if (!nd.isMesh) return;
          const applyGreen = (m, idx) => {
            if (!m || !m.color) return;
            const r = m.color.r, g = m.color.g, b = m.color.b;
            // Dark materials (frame, legs): brightness < 0.5 — leave alone
            if (r + g + b < 0.5) return;
            // Pink/magenta felt: high r, high b, low g
            if (r > 0.4 && b > 0.2 && g < r * 0.7) {
              if (Array.isArray(nd.material)) nd.material[idx] = _greenFelt;
              else nd.material = _greenFelt;
            }
          };
          if (Array.isArray(nd.material)) nd.material.forEach(applyGreen);
          else applyGreen(nd.material, 0);
        });

        // ── Store interior play-area bounds for ball XZ remapping ──
        // Use the overall model XZ box, inset by ~9% each side for cushions.
        const _mb = new THREE.Box3().setFromObject(model);
        const _insetX = (_mb.max.x - _mb.min.x) * 0.09;
        const _insetZ = (_mb.max.z - _mb.min.z) * 0.09;
        P3.feltMinX = _mb.min.x + _insetX;
        P3.feltMaxX = _mb.max.x - _insetX;
        P3.feltMinZ = _mb.min.z + _insetZ;
        P3.feltMaxZ = _mb.max.z - _insetZ;
        P3.tableRailY = _mb.max.y;
        console.log('[pool3d] playX:', P3.feltMinX.toFixed(3), '→', P3.feltMaxX.toFixed(3));

        // ── Update camera to look at the playing surface ──────────
        P3.camTarget = { x: tw3 * 0.5, y: P3.tableY, z: th3 * 0.5 };
        if (P3.pool3DUpdateCamera) P3.pool3DUpdateCamera();

        // Remove the procedural felt now that we have the GLB
        scene.remove(feltMesh);
        scene.add(model);
        P3.tableModel = model;

        // ── UK Pool table markings overlay ───────────────────────
        // Transparent plane exactly covering the play area.
        // depthTest:false ensures it is always visible regardless of camera angle.
        (function() {
          const pW = P3.feltMaxX - P3.feltMinX;
          const pD = P3.feltMaxZ - P3.feltMinZ;
          const tY = (P3.tableY !== undefined ? P3.tableY : 0);

          const mc  = document.createElement('canvas');
          mc.width  = 2048; mc.height = 1024;
          const ctx = mc.getContext('2d');
          const MW  = 2048, MH = 1024;

          ctx.clearRect(0, 0, MW, MH);

          // All markings: white
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.fillStyle   = 'rgba(255,255,255,0.92)';
          ctx.lineCap = 'round';

          // ── Proportions from WEPF / image reference ──────────────
          // Physics: TW=700, cue ball at TW*0.25=175, rack at TW*0.65=455
          // Baulk line: 25% from baulk end (matches cue ball start zone)
          // D: opens toward baulk end (LEFT in canvas), radius ~20% of table half-width
          // Spots along centre line: baulk(25%), pyramid(50%), black(62.5%), pink(75%)

          const bx  = MW * 0.25;   // baulk line X
          const cy  = MH * 0.5;    // vertical centre
          const dR  = MH * 0.18;   // D radius — ~18% of table width (WEPF standard)

          // Baulk line — full width of table
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, MH); ctx.stroke();

          // D semicircle — opens toward baulk end (LEFT, negative X direction)
          // Arc from +90° to +270° (left-opening semicircle)
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(bx, cy, dR, Math.PI / 2, (3 * Math.PI) / 2);
          ctx.stroke();

          // Spots along centre line (filled circles, 10px radius in 2048-wide canvas)
          const sp = 10;
          // Baulk spot — centre of D (on the baulk line)
          ctx.beginPath(); ctx.arc(bx, cy, sp, 0, Math.PI * 2); ctx.fill();
          // Pyramid spot — 50% (centre of table)
          ctx.beginPath(); ctx.arc(MW * 0.50, cy, sp, 0, Math.PI * 2); ctx.fill();
          // Black spot — 62.5%
          ctx.beginPath(); ctx.arc(MW * 0.625, cy, sp, 0, Math.PI * 2); ctx.fill();
          // Pink spot — 75%
          ctx.beginPath(); ctx.arc(MW * 0.75, cy, sp, 0, Math.PI * 2); ctx.fill();

          const geo = new THREE.PlaneGeometry(pW, pD);
          const mat = new THREE.MeshBasicMaterial({
            map:         new THREE.CanvasTexture(mc),
            transparent: true,
            depthWrite:  false,
            depthTest:   true,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.x = -Math.PI / 2;
          // Lifted 0.003 units above tableY — well above the felt (avoids z-fighting)
          // but far below ball centres (r3 = BALL_R/50 = 0.176), so balls still
          // correctly occlude the markings and the markings never poke through balls.
          mesh.position.set(
            (P3.feltMinX + P3.feltMaxX) * 0.5,
            tY + 0.17,
            (P3.feltMinZ + P3.feltMaxZ) * 0.5
          );
          scene.add(mesh);
          P3.markingsMesh = mesh;
        })();

        console.log('[pool3d] Pool Table.glb loaded — scale:', scale.toFixed(3), 'tableY:', P3.tableY.toFixed(3), 'markings at Y:', (P3.tableY + 0.02).toFixed(3), 'balls at Y:', (P3.tableY + POOL.BALL_R * P3.SCALE).toFixed(3));
        poolDraw();
      },
      undefined,
      () => tryLoad(i + 1)
      );
    }
    tryLoad(0);
  });
}

function pool3DBuildBalls(THREE, scene, tw3, th3) {
  const r3 = POOL.BALL_R * P3.SCALE;
  P3.ballMeshes = [];

  // UK pool colours — pure solid colours, NO canvas texture.
  // A texture map bakes lighting into the UV and creates visible dark patches
  // as the sphere rotates. Using plain MeshStandardMaterial with color only
  // means Three.js scene lighting handles all shading dynamically — no artefacts.
  const BALL_COLORS = [
    0xf5f5f0,  // 0  cue  — off-white
    0xcc1111,  // 1  red
    0xcc1111,  // 2  red
    0xcc1111,  // 3  red
    0xcc1111,  // 4  red
    0xcc1111,  // 5  red
    0xcc1111,  // 6  red
    0xcc1111,  // 7  red
    0x111111,  // 8  black
    0xe8c010,  // 9  yellow
    0xe8c010,  // 10 yellow
    0xe8c010,  // 11 yellow
    0xe8c010,  // 12 yellow
    0xe8c010,  // 13 yellow
    0xe8c010,  // 14 yellow
    0xe8c010,  // 15 yellow
  ];

  for (let id = 0; id <= 15; id++) {
    const geo = new THREE.SphereGeometry(r3, 48, 36);
    const mat = new THREE.MeshStandardMaterial({
      color:     BALL_COLORS[id],
      roughness: id === 0 ? 0.10 : 0.12,   // cue ball slightly glossier
      metalness: 0.0,
      envMapIntensity: 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = false;
    mesh.position.set(0, r3, 0);
    mesh.visible = false;
    scene.add(mesh);
    P3.ballMeshes[id] = mesh;
  }
}

function pool3DBuildCue(THREE, scene) {
  const S = P3.SCALE;
  const CUE_LEN = 320 * S;
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(new THREE.Vector2((1.5 + t * 2.5) * S, t * CUE_LEN));
  }
  const cueGeo = new THREE.LatheGeometry(pts, 12);
  const cueTex = document.createElement('canvas');
  cueTex.width = 4; cueTex.height = 256;
  const ct = cueTex.getContext('2d');
  const cg = ct.createLinearGradient(0,0,4,256);
  cg.addColorStop(0,   '#e8d5a0');
  cg.addColorStop(0.25,'#c8a060');
  cg.addColorStop(1,   '#6b3a1f');
  ct.fillStyle = cg; ct.fillRect(0,0,4,256);
  const cueMat = new THREE.MeshStandardMaterial({
    map: new THREE.CanvasTexture(cueTex), roughness: 0.35, metalness: 0.05
  });
  const cueMesh = new THREE.Mesh(cueGeo, cueMat);
  cueMesh.castShadow = true;
  cueMesh.visible = false;
  scene.add(cueMesh);
  P3.cueMesh = cueMesh;

  // Tip sphere
  const tipGeo = new THREE.SphereGeometry(2 * P3.SCALE, 10, 8);
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.4 });
  const tipMesh = new THREE.Mesh(tipGeo, tipMat);
  tipMesh.visible = false;
  scene.add(tipMesh);
  P3.cueTipMesh = tipMesh;
  P3.aimLineMesh = null; // unused — replaced by aimDashes
}

function pool3DBuildAimLine(THREE, scene) {
  const S = P3.SCALE;
  P3.aimDashes = [];
  // Each dash gets its own material so we can colour individually
  for (let i = 0; i < 32; i++) {
    const mat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.55, depthWrite:false });
    const dg  = new THREE.BoxGeometry(POOL.BALL_R * S * 0.5, S * 0.4, S * 4.5);
    const dm  = new THREE.Mesh(dg, mat);
    dm.visible = false;
    scene.add(dm);
    P3.aimDashes.push(dm);
  }
  // Ghost ball showing predicted end-of-aim position
  const ghostGeo = new THREE.SphereGeometry(POOL.BALL_R * S, 18, 12);
  const ghostMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.22, depthWrite:false });
  const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
  ghostMesh.visible = false;
  scene.add(ghostMesh);
  P3.aimGhost = ghostMesh;
}

function poolGetScale() {
  const rect = POOL.canvas.getBoundingClientRect();
  POOL.scaleFactor = POOL.canvas.width / rect.width;
}

function poolGetMousePos(e) {
  const rect = POOL.canvas.getBoundingClientRect();
  POOL.scaleFactor = POOL.canvas.width / rect.width;
  return {
    // Canvas-relative coords (for aiming angle calculation)
    x: (e.clientX - rect.left) * POOL.scaleFactor,
    y: (e.clientY - rect.top) * POOL.scaleFactor,
    // Raw screen coords (for power pullback - works anywhere on screen)
    screenX: e.clientX,
    screenY: e.clientY,
  };
}

function poolHandleMove(mx, my, screenX, screenY) {
  if (POOL.isMoving || !POOL.myTurn || !POOL.cueBall || POOL.cueBall.potted) return;
  if (!POOL._screenEl) POOL._screenEl = document.getElementById('pool-screen');
  if (!POOL._screenEl.classList.contains('active')) return;
  // In locked (pullback) state we always continue regardless of mouse position —
  // player needs to drag freely outside the canvas to set power
  POOL.mouseX = mx;
  POOL.mouseY = my;

  if (POOL.shotState === 'aiming') {
    // ── 3D raycast: find where mouse points on the felt plane (y=0) ──
    // This makes aiming always match the camera view regardless of rotation.
    if (P3.ready && P3.camera && P3.container) {
      const rect   = P3.container.getBoundingClientRect();
      const ndcX   = ((screenX - rect.left) / rect.width)  * 2 - 1;
      const ndcY   = -((screenY - rect.top)  / rect.height) * 2 + 1;
      const THREE  = P3.THREE;
      const ray    = new THREE.Raycaster();
      const mouse  = new THREE.Vector2(ndcX, ndcY);
      ray.setFromCamera(mouse, P3.camera);
      // Intersect with y=0 plane (the felt surface)
      const plane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, target)) {
        const S   = P3.SCALE;
        // Convert 3D hit back to 2D physics coords
        const hitX2d = target.x / S;
        const hitZ2d = target.z / S;
        // Cue sits on the OPPOSITE side of the ball from the mouse.
        // Angle points FROM mouse TOWARD ball so cue is behind ball, tip at ball.
        const dx = hitX2d - POOL.cueBall.x;
        const dy = hitZ2d - POOL.cueBall.y;
        POOL.aimAngle = Math.atan2(dy, dx);
      }
    } else {
      // Fallback: plain 2D canvas coords — angle FROM mouse TOWARD ball
      const dx = mx - POOL.cueBall.x;
      const dy = my - POOL.cueBall.y;
      POOL.aimAngle = Math.atan2(dy, dx);
    }

  } else if (POOL.shotState === 'locked') {
    // Pull-back mode: use raw screen coords projected onto locked axis
    // This works anywhere on screen, not just over the canvas
    // Use screen-space cue direction (computed at lock time via camera projection)
    // so power tracks correctly regardless of camera angle / perspective
    const sx = (screenX !== undefined ? screenX : mx);
    const sy = (screenY !== undefined ? screenY : my);
    const dx = sx - POOL.lockScreenX;
    const dy = sy - POOL.lockScreenY;
    const sdx = POOL.lockScreenDirX || Math.cos(POOL.lockedAngle);
    const sdy = POOL.lockScreenDirY || Math.sin(POOL.lockedAngle);
    const proj = dx * sdx + dy * sdy;
    // Positive projection = mouse moved toward cue butt = more power
    const pullDist = proj;
    POOL.pullback = Math.max(0, Math.min(1, pullDist / 250));

    // Update power bar UI
    const pct = Math.round(POOL.pullback * 100);
    if (!POOL._powerFill) POOL._powerFill = document.getElementById('pool-power-fill');
    if (!POOL._powerLabel) POOL._powerLabel = document.getElementById('pool-power-pct');
    if (POOL._powerFill) {
      POOL._powerFill.style.width = pct + '%';
      POOL._powerFill.style.background = pct > 70
        ? 'linear-gradient(90deg,#ff6b00,#ff0000)'
        : 'linear-gradient(90deg,#00d4ff,#ff6b00)';
    }
    if (POOL._powerLabel) POOL._powerLabel.textContent = pct + '%';
  }

  // Broadcast cue position to opponent (throttled to ~20fps, only when it's our turn)
  if (!POOL.isBot && POOL.roomCode && POOL.myTurn) {
    const now = Date.now();
    if (!POOL._lastCueBroadcast || now - POOL._lastCueBroadcast > 50) {
      POOL._lastCueBroadcast = now;
      const angle = POOL.shotState === 'locked' ? POOL.lockedAngle : POOL.aimAngle;
      update(ref(db, `pool/${POOL.roomCode}/cueAim`), {
        angle,
        state: POOL.shotState,
        pullback: POOL.shotState === 'locked' ? POOL.pullback : 0,
        p: POOL.playerNum,
      }).catch(() => {});
    }
  }

  poolDraw();
}

function poolHandleClick(e) {
  // Only fire when pool screen is active
  if (!POOL._screenEl) POOL._screenEl = document.getElementById('pool-screen');
  if (!POOL._screenEl.classList.contains('active')) return;
  // Ignore clicks on interactive UI elements (buttons etc.)
  if (e && e.target) {
    const tag = e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A' || tag === 'SELECT') return;
  }
  if (POOL.isMoving || !POOL.myTurn || !POOL.cueBall || POOL.cueBall.potted) return;

  if (POOL.shotState === 'aiming') {
    // Lock the angle, switch to pull-back mode
    POOL.shotState = 'locked';
    POOL.lockedAngle = POOL.aimAngle;
    // Store raw screen position at lock moment for pullback measurement
    POOL.lockScreenX = POOL._lastScreenX || POOL.mouseX;
    POOL.lockScreenY = POOL._lastScreenY || POOL.mouseY;
    POOL.pullback = 0;
    // Compute screen-space direction of the cue axis at lock moment.
    // Projecting via camera gives the true on-screen cue direction in pixels,
    // so pullback works correctly regardless of camera angle / perspective.
    (function() {
      if (!P3.ready || !P3.camera || !P3.container) {
        POOL.lockScreenDirX = Math.cos(POOL.lockedAngle);
        POOL.lockScreenDirY = Math.sin(POOL.lockedAngle);
        return;
      }
      const S   = P3.SCALE;
      const cb  = POOL.cueBall;
      const cbx3 = (P3.feltMinX !== undefined)
        ? P3.feltMinX + (cb.x / POOL.TW) * (P3.feltMaxX - P3.feltMinX) : cb.x * S;
      const cbz3 = (P3.feltMinZ !== undefined)
        ? P3.feltMinZ + (cb.y / POOL.TH) * (P3.feltMaxZ - P3.feltMinZ) : cb.y * S;
      const THREE = P3.THREE;
      const rect  = P3.container.getBoundingClientRect();
      const ballVec = new THREE.Vector3(cbx3, POOL.BALL_R * S, cbz3);
      ballVec.project(P3.camera);
      const ballSX = (ballVec.x * 0.5 + 0.5) * rect.width  + rect.left;
      const ballSY = (-ballVec.y * 0.5 + 0.5) * rect.height + rect.top;
      // Point along the aim direction (away from mouse = direction cue butt extends)
      const fwdX = cbx3 - Math.cos(POOL.lockedAngle) * 50 * S;
      const fwdZ = cbz3 - Math.sin(POOL.lockedAngle) * 50 * S;
      const fwdVec = new THREE.Vector3(fwdX, POOL.BALL_R * S, fwdZ);
      fwdVec.project(P3.camera);
      const fwdSX = (fwdVec.x * 0.5 + 0.5) * rect.width  + rect.left;
      const fwdSY = (-fwdVec.y * 0.5 + 0.5) * rect.height + rect.top;
      const ddx = fwdSX - ballSX;
      const ddy = fwdSY - ballSY;
      const len = Math.sqrt(ddx*ddx + ddy*ddy) || 1;
      POOL.lockScreenDirX = ddx / len;
      POOL.lockScreenDirY = ddy / len;
    })();
    // Show power bar, update hint
    const pb = document.getElementById('pool-power-bar');
    const hint = document.getElementById('pool-hint');
    if (pb) pb.style.display = 'flex';
    if (hint) hint.style.display = 'none';
    poolDraw();

  } else if (POOL.shotState === 'locked') {
    // Fire!
    if (POOL.pullback < 0.02) {
      // Didn't pull back enough — cancel lock
      POOL.shotState = 'aiming';
      const pb = document.getElementById('pool-power-bar');
      const hint = document.getElementById('pool-hint');
      if (pb) pb.style.display = 'none';
      if (hint) hint.style.display = '';
      poolDraw();
      return;
    }
    poolFireShot();
  }
}

function poolMouseMove(e) {
  // During pullback (locked state) always track mouse even outside canvas / during drag
  if (P3.isDragging && POOL.shotState !== 'locked') return;
  const p = poolGetMousePos(e);
  POOL._lastScreenX = p.screenX;
  POOL._lastScreenY = p.screenY;
  poolHandleMove(p.x, p.y, p.screenX, p.screenY);
}

function poolMouseClick(e) {
  poolHandleClick(e);
}

function poolTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  // Always pass raw screen coords — pullback and 3D raycast both use screenX/Y
  // so touch works correctly even when finger moves outside the canvas boundary
  const rect = POOL.canvas ? POOL.canvas.getBoundingClientRect() : { left:0, top:0, width:1, height:1 };
  POOL.scaleFactor = POOL.canvas ? POOL.canvas.width / rect.width : 1;
  poolHandleMove(
    (touch.clientX - rect.left) * POOL.scaleFactor,
    (touch.clientY - rect.top)  * POOL.scaleFactor,
    touch.clientX,
    touch.clientY
  );
}

function poolTouchEnd(e) {
  poolHandleClick(e);
}

function poolDraw() {
  if (!P3.ready || !P3.renderer) return;
  const S   = P3.SCALE;
  const r3  = POOL.BALL_R * S;

  // ── Sync ball meshes from 2D physics positions ───────────────
  POOL.balls.forEach(ball => {
    const mesh = P3.ballMeshes[ball.id];
    if (!mesh) return;
    if (ball.potted) { mesh.visible = false; return; }
    mesh.visible = true;
    // 2D: x→X, y→Z  (Y = ball radius off the felt)
    const _tY = (P3.tableY !== undefined) ? P3.tableY : 0;
    const _bx3 = (P3.feltMinX !== undefined)
      ? P3.feltMinX + (ball.x / POOL.TW) * (P3.feltMaxX - P3.feltMinX)
      : ball.x * S;
    const _bz3 = (P3.feltMinZ !== undefined)
      ? P3.feltMinZ + (ball.y / POOL.TH) * (P3.feltMaxZ - P3.feltMinZ)
      : ball.y * S;
    mesh.position.set(_bx3, _tY + r3, _bz3);
    if (ball._rollAcc) {
      const dir = Math.atan2(ball.vy || 0, ball.vx || 0);
      mesh.rotation.z =  Math.cos(dir) * ball._rollAcc;
      mesh.rotation.x = -Math.sin(dir) * ball._rollAcc;
    }
  });

  // ── Cue stick ─────────────────────────────────────────────────
  const showMyCue  = !POOL.isMoving && POOL.myTurn  && POOL.cueBall && !POOL.cueBall.potted;
  const showOppCue = !POOL.isMoving && !POOL.myTurn && POOL.oppCue  && POOL.cueBall && !POOL.cueBall.potted;

  if (P3.cueMesh) {
    if (showMyCue || showOppCue) {
      const cb     = POOL.cueBall;
      const angle  = showMyCue
        ? (POOL.shotState === 'locked' ? POOL.lockedAngle : POOL.aimAngle)
        : POOL.oppCue.angle;
      const locked = showMyCue ? POOL.shotState === 'locked' : POOL.oppCue?.state === 'locked';
      const pullback = showMyCue
        ? (locked ? POOL.pullback : 0)
        : (locked ? (POOL.oppCue?.pullback || 0) : 0);

      const TIP_GAP     = (POOL.BALL_R + 2) * S;
      const CUE_LEN     = 320 * S;
      const PULLBACK_MAX = 50 * S;
      const pullDist    = pullback * PULLBACK_MAX;
      const tipDist     = TIP_GAP + pullDist;

      const cbx3 = (P3.feltMinX !== undefined)
        ? P3.feltMinX + (cb.x / POOL.TW) * (P3.feltMaxX - P3.feltMinX) : cb.x * S;
      const cbz3 = (P3.feltMinZ !== undefined)
        ? P3.feltMinZ + (cb.y / POOL.TH) * (P3.feltMaxZ - P3.feltMinZ) : cb.y * S;
      const tipX3 = cbx3 - Math.cos(angle) * tipDist;
      const tipZ3 = cbz3 - Math.sin(angle) * tipDist;
      const buttX3 = tipX3 - Math.cos(angle) * CUE_LEN;
      const buttZ3 = tipZ3 - Math.sin(angle) * CUE_LEN;

      const THREE = P3.THREE;

      // Cue angle behaviour:
      // - At 0 pullback: tip near ball, cue nearly flat with slight natural rise
      // - As pullback grows: butt rises quickly until it clears the rail top
      // - Once past rail height: cue levels out and runs flat ABOVE the rail,
      //   with a slight downward tilt toward the ball at the tip end
      // Cue stays nearly flat on the felt, butt rises to clear rail on pullback
      const _tYc    = (P3.tableY    !== undefined) ? P3.tableY    : 0;
      const _railY  = (P3.tableRailY !== undefined) ? P3.tableRailY : _tYc + r3 * 4;
      // Tip sits just above the ball equator; butt always above felt even at rest
      const finalTipY  = _tYc + r3 * 1.15;
      const risePhase  = Math.min(1, pullback / 0.6);
      // At rest (risePhase=0) butt is slightly raised to avoid clipping the rail/felt
      const minButtLift = r3 * 2.5;
      const finalButtY = finalTipY + minButtLift + (_railY - _tYc + r3 * 0.5) * risePhase;

      const buttDir = new THREE.Vector3(
        buttX3 - tipX3,
        finalButtY - finalTipY,
        buttZ3 - tipZ3
      ).normalize();
      const up   = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, buttDir);

      P3.cueMesh.position.set(tipX3, finalTipY, tipZ3);
      P3.cueMesh.quaternion.copy(quat);
      P3.cueMesh.visible = true;

      if (P3.cueTipMesh) {
        P3.cueTipMesh.position.set(tipX3, finalTipY, tipZ3);
        P3.cueTipMesh.visible = true;
      }

      // Aim dashes — length and colour show power
      if (P3.aimDashes) {
        const power    = locked ? pullback : 0;
        // Full shot aim length, dashes only shown up to power fraction when locked
        const maxLen   = (60 + 140) * S;  // max possible
        const aimLen   = locked ? (60 + power * 140) * S : (60 + 0.3 * 140) * S;
        const nd       = P3.aimDashes.length;
        const spc      = maxLen / nd;

        // Power colour: white → orange → red
        const r3c = Math.min(1, power * 2);
        const g3c = Math.max(0, 1 - power * 1.8);
        const THREE = P3.THREE;

        P3.aimDashes.forEach((d, i) => {
          const t     = (i + 0.5) * spc;
          const inRange = t <= aimLen;
          if (!inRange) { d.visible = false; return; }
          const _tYd = (P3.tableY !== undefined) ? P3.tableY : 0;
          d.position.set(cbx3 + Math.cos(angle)*t, _tYd + 0.05, cbz3 + Math.sin(angle)*t);
          d.rotation.y = -angle;
          // Fade toward end of line, brighter at start
          const fade  = 1 - (t / aimLen) * 0.55;
          d.material.color.setRGB(1, g3c, 0);
          d.material.opacity = (locked ? 0.75 : 0.4) * fade;
          d.visible = true;
        });

        // Ghost ball at aim end point
        if (P3.aimGhost) {
          const endX = cbx3 + Math.cos(angle) * aimLen;
          const endZ = cbz3 + Math.sin(angle) * aimLen;
          const _tYg = (P3.tableY !== undefined) ? P3.tableY : 0;
          P3.aimGhost.position.set(endX, _tYg + POOL.BALL_R * S, endZ);
          const ghostOpacity = locked ? 0.15 + power * 0.35 : 0.12;
          P3.aimGhost.material.opacity  = ghostOpacity;
          P3.aimGhost.material.color.setRGB(1, g3c, 0);
          P3.aimGhost.visible = true;
        }
      }
    } else {
      P3.cueMesh.visible = false;
      if (P3.cueTipMesh) P3.cueTipMesh.visible = false;
      if (P3.aimDashes)  P3.aimDashes.forEach(d => d.visible = false);
      if (P3.aimGhost)   P3.aimGhost.visible = false;
    }
  }

  // Rolling rumble — modulated by fastest moving ball
  if (POOL.isMoving) {
    let maxSpd = 0;
    POOL.balls.forEach(b => {
      if (!b.potted) {
        const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (spd > maxSpd) maxSpd = spd;
      }
    });
    try { POOL_SFX.roll(maxSpd); } catch(e) {}
  } else {
    try { POOL_SFX.roll(0); } catch(e) {}
  }

  P3.renderer.render(P3.scene, P3.camera);
}

function poolPhysicsSubStep(balls, r, tw, th, pr, gap, cushionY, cushionX, midTopX, midBotX) {
  // Constant-deceleration model matching real billiard physics:
  //   Sliding: strong decel (μ_slide * g), spin BUILDS from 0 toward v/r
  //   Rolling: weak decel  (μ_roll  * g), smooth glide to stop
  //   Transition: when spin reaches v/r naturally (no lerp hack)
  const MU_S = POOL.MU_SLIDE;
  const MU_R = POOL.MU_ROLL;

  balls.forEach(b => {
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (speed < POOL.MIN_SPEED) {
      b.vx = 0; b.vy = 0; b.spin = 0; b.sliding = false;
      return;
    }

    const ux = b.vx / speed; // unit vector of motion
    const uy = b.vy / speed;

    if (b.sliding) {
      // ── SLIDING: constant decel, spin builds via friction torque ──────
      // Decelerate linearly (subtract fixed amount, not multiply)
      const decel = MU_S;
      const newSpeed = Math.max(0, speed - decel);
      b.vx = ux * newSpeed;
      b.vy = uy * newSpeed;

      // Spin builds: torque = μ_s * m * g * R → α = 5/2 * μ_s * g / R
      // In scaled units: Δspin = 5/2 * MU_S / r each frame
      const spinAccel = (5 / 2) * MU_S / r;
      b.spin = (b.spin || 0) + spinAccel;

      // Transition to rolling when ω * r >= v  (spin caught up)
      if (b.spin * r >= newSpeed) {
        b.sliding = false;
        b.spin = newSpeed / r;
      }
    } else {
      // ── ROLLING: slow constant decel, spin tracks velocity ────────────
      const newSpeed = Math.max(0, speed - MU_R);
      b.vx = ux * newSpeed;
      b.vy = uy * newSpeed;
      b.spin = newSpeed / r;
    }

    // Accumulate roll angle for visual stripe rotation
    b._rollAcc = ((b._rollAcc || 0) + speed / r) % (Math.PI * 2);

    b.x += b.vx;
    b.y += b.vy;

    // ── CUSHION COLLISIONS ─────────────────────────────────────────────
    // TOP
    if (b.y < cushionY) {
      const nearMidTop = Math.abs(b.x - midTopX) < gap;
      const nearCornerTL = b.x < pr + gap;
      const nearCornerTR = b.x > tw - pr - gap;
      if (!nearMidTop && !nearCornerTL && !nearCornerTR) {
        b.y = cushionY;
        try { POOL_SFX.cushion(Math.abs(b.vy)); } catch(e) {}
        b.vy = Math.abs(b.vy) * POOL.CUSHION_RESTITUTION;
        b.vx *= POOL.CUSHION_RESTITUTION;
        b.sliding = true; b.spin = 0;
      }
    }
    // BOTTOM
    if (b.y > th - cushionY) {
      const nearMidBot = Math.abs(b.x - midTopX) < gap;
      const nearCornerBL = b.x < pr + gap;
      const nearCornerBR = b.x > tw - pr - gap;
      if (!nearMidBot && !nearCornerBL && !nearCornerBR) {
        b.y = th - cushionY;
        try { POOL_SFX.cushion(Math.abs(b.vy)); } catch(e) {}
        b.vy = -Math.abs(b.vy) * POOL.CUSHION_RESTITUTION;
        b.vx *= POOL.CUSHION_RESTITUTION;
        b.sliding = true; b.spin = 0;
      }
    }
    // LEFT
    if (b.x < cushionX) {
      const nearCornerTop = b.y < pr + gap;
      const nearCornerBot = b.y > th - pr - gap;
      if (!nearCornerTop && !nearCornerBot) {
        b.x = cushionX;
        try { POOL_SFX.cushion(Math.abs(b.vx)); } catch(e) {}
        b.vx = Math.abs(b.vx) * POOL.CUSHION_RESTITUTION;
        b.vy *= POOL.CUSHION_RESTITUTION;
        b.sliding = true; b.spin = 0;
      }
    }
    // RIGHT
    if (b.x > tw - cushionX) {
      const nearCornerTop = b.y < pr + gap;
      const nearCornerBot = b.y > th - pr - gap;
      if (!nearCornerTop && !nearCornerBot) {
        b.x = tw - cushionX;
        try { POOL_SFX.cushion(Math.abs(b.vx)); } catch(e) {}
        b.vx = -Math.abs(b.vx) * POOL.CUSHION_RESTITUTION;
        b.vy *= POOL.CUSHION_RESTITUTION;
        b.sliding = true; b.spin = 0;
      }
    }

    // Hard boundary clamp
    if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
    if (b.x > tw) { b.x = tw; b.vx = -Math.abs(b.vx); }
    if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
    if (b.y > th) { b.y = th; b.vy = -Math.abs(b.vy); }
  });
}

// Main physics step — runs sub-steps for accuracy at high speeds
function poolPhysicsStep() {
  const pr = POOL.POCKET_R;
  const r = POOL.BALL_R;
  const tw = POOL.TW, th = POOL.TH;
  const gap = POOL.MID_GAP;
  const cushionY = pr + r;
  const cushionX = pr + r;
  const midTopX  = tw / 2;
  const midBotX  = tw / 2;
  const SUB = 3; // sub-steps per frame
  const newlyPotted = [];

  for (let s = 0; s < SUB; s++) {
    const balls = POOL.balls.filter(b => !b.potted);
    poolPhysicsSubStep(balls, r, tw, th, pr, gap, cushionY, cushionX, midTopX, midBotX);

    // Ball-ball collisions inside sub-step
    const minDist = r * 2;
    const minDistSq = minDist * minDist;
    for (let i = 0; i < balls.length; i++) {
      for (let j = i+1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distSq = dx*dx + dy*dy;
        if (distSq >= minDistSq || distSq < 0.000001) continue;
        const dist = Math.sqrt(distSq);
        if (POOL.firstBallHitId === null) {
          if (a.id === 0 && b.id !== 0) POOL.firstBallHitId = b.id;
          else if (b.id === 0 && a.id !== 0) POOL.firstBallHitId = a.id;
        }
        const overlap = (minDist - dist) / 2;
        const nx = dx/dist, ny = dy/dist;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;

        const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
        const dot = dvx*nx + dvy*ny;
        if (dot > 0) {
          // Fully elastic equal-mass collision: exchange velocity components along normal
          // This is the billiard "stun" effect — cue ball transfers momentum cleanly
          const restitution = 0.97;
          const imp = dot * restitution;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
          try { POOL_SFX.ballHit(imp); } catch(e) {}

          // Both balls enter sliding state after impact (spin disrupted)
          a.spin = 0; a.sliding = true;
          b.spin = 0; b.sliding = true;

          // Collision sparks on hard impacts
          if (imp > 1.2) {
            const sx = a.x + nx * r;
            const sy = a.y + ny * r;
            const numSparks = Math.min(8, Math.floor(imp * 2));
            for (let _s2 = 0; _s2 < numSparks; _s2++) {
              const sparkAngle = Math.random() * Math.PI * 2;
              const sparkSpeed = 0.6 + Math.random() * 2.0;
              POOL._sparks.push({
                x: sx, y: sy,
                vx: Math.cos(sparkAngle) * sparkSpeed,
                vy: Math.sin(sparkAngle) * sparkSpeed,
                life: 1.0,
                r: 1 + Math.random() * 1.5,
                isCue: (a.id === 0 || b.id === 0),
              });
            }
          }
        }
      }
    }

    // Pocket detection
    const pocketThreshSq = (pr * 1.1) * (pr * 1.1);
    POOL.balls.forEach(ball => {
      if (ball.potted) return;
      POOL.POCKETS.forEach(p => {
        const dx2 = ball.x - p.x, dy2 = ball.y - p.y;
        if (dx2*dx2 + dy2*dy2 < pocketThreshSq) {
          ball.potted = true;
          ball.vx = 0; ball.vy = 0; ball.spin = 0;
          try { POOL_SFX.pocket(); } catch(e) {}
          newlyPotted.push(ball.id);
        }
      });
    });
  }

  return newlyPotted;
}

function poolAllStopped() {
  const ms = POOL.MIN_SPEED;
  return POOL.balls.every(b => b.potted || (Math.abs(b.vx) < ms && Math.abs(b.vy) < ms));
}

function poolAnimate(onDone) {
  POOL.isMoving = true;
  POOL.oppCue = null; // hide opponent's ghost cue once balls are moving
  const allPotted = [];
  let _streamThrottle = 0;

  function step() {
    const potted = poolPhysicsStep();
    allPotted.push(...potted);
    poolDraw();

    // Shooter streams live ball positions every ~33ms so observer mirrors in real-time
    // Use _isShooting flag — NOT myTurn — because myTurn is false for both players mid-shot
    if (POOL._isShooting && !POOL.isBot && POOL.roomCode) {
      const now = Date.now();
      if (now - _streamThrottle > 33) {
        _streamThrottle = now;
        update(ref(db, `pool/${POOL.roomCode}/liveBalls`), { balls: poolBallsToData(), ts: now }).catch(() => {});
      }
    }

    if (!poolAllStopped()) {
      POOL.animFrame = requestAnimationFrame(step);
    } else {
      POOL.isMoving = false;
      POOL.animFrame = null;
      POOL._isShooting = false;  // shot animation complete
      // Clear live stream so observer knows shot is done
      if (!POOL.isBot && POOL.roomCode) {
        update(ref(db, `pool/${POOL.roomCode}/liveBalls`), { balls: null, ts: 0 }).catch(() => {});
      }
      onDone(allPotted);
    }
  }
  POOL.animFrame = requestAnimationFrame(step);
}

function poolLog(msg, type='system') {
  const log = document.getElementById('pool-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = '> ' + msg;
  log.prepend(entry);
}

function poolUpdateScores() {
  const el = document.getElementById('pool-scores');
  if (!el) return;
  const p1Name = POOL.playerName;
  const p2Name = POOL.opponentName || 'OPPONENT';
  const myType = POOL.myBallType || '?';
  const oppType = POOL.opponentBallType || '?';
  el.innerHTML = `
    <div class="info-row"><span>${p1Name}</span><span class="val">${myType === 'red' ? '🔴' : myType === 'yellow' ? '🟡' : '⚪'} ${POOL.myPotted}/7</span></div>
    <div class="info-row"><span>${p2Name}</span><span class="val">${oppType === 'red' ? '🔴' : oppType === 'yellow' ? '🟡' : '⚪'} ${POOL.oppPotted}/7</span></div>
  `;
}

function poolUpdateTurnIndicator() {
  const ti = document.getElementById('pool-turn-indicator');
  if (!ti) return;
  if (POOL.myTurn) {
    const myLabel = POOL.myBallType ? (POOL.myBallType === 'red' ? '🔴 REDS' : '🟡 YELLOWS') : '? unassigned';
    const myRemaining = POOL.myBallType ? POOL.balls.filter(b => !b.potted && b.id !== 0 && b.id !== 8 &&
      (POOL.myBallType === 'red' ? b.id <= 7 : b.id >= 9)).length : '?';
    const needsEight = POOL.myBallType && myRemaining === 0;
    const target = needsEight ? '🎱 Pot the 8-ball!' : `${myLabel} — ${myRemaining} left`;
    const twoShotBadge = POOL.twoShotsOwed ? ' 🎯 FREE TABLE (2 shots)' : '';
    ti.textContent = `🎱 YOUR SHOT — ${target}${twoShotBadge}`;
    ti.className = `turn-indicator your-turn${POOL.twoShotsOwed ? ' two-shots' : ''}`;
  } else {
    const oppLabel = POOL.opponentBallType ? (POOL.opponentBallType === 'red' ? '🔴' : '🟡') : '';
    ti.textContent = `⏳ OPPONENT'S SHOT ${oppLabel}`;
    ti.className = 'turn-indicator their-turn';
  }
}

// ---- POOL FIREBASE ----
function poolSetLobbyStatus(msg, type='') {
  const el = document.getElementById('pool-lobby-status');
  el.style.display = '';
  el.className = 'status-bar ' + type;
  el.textContent = msg;
}

window.poolCreateRoom = async function() {
  if (!window._firebaseReady) { poolSetLobbyStatus('CONNECTING...',''); await new Promise(r => window.addEventListener('firebaseReady', r, {once:true})); }
  const name = document.getElementById('pool-player-name').value.trim().toUpperCase() || 'PLAYER1';
  POOL.playerName = name;
  POOL.playerNum = 1;
  const code = Math.random().toString(36).substring(2,8).toUpperCase();
  POOL.roomCode = code;

  await set(ref(db, `pool/${code}`), {
    status: 'waiting',
    player1: { name, ready: false },
    player2: null,
    turn: 1,
    balls: null,
    lastShot: null,
    winner: null,
    ballTypes: null,
  });

  document.getElementById('header-room-code').textContent = code;
  document.getElementById('room-code-display').style.display = '';
  poolSetLobbyStatus(`TABLE CREATED: ${code} — Share with opponent`, 'success');

  const unsub = onValue(ref(db, `pool/${code}/player2`), snap => {
    if (snap.exists() && snap.val()) {
      unsub();
      POOL.opponentName = snap.val().name;
      poolStartGame();
    }
  });
  POOL.unsubs.push(unsub);
};

window.poolJoinRoom = async function() {
  if (!window._firebaseReady) { poolSetLobbyStatus('CONNECTING...',''); await new Promise(r => window.addEventListener('firebaseReady', r, {once:true})); }
  const codeEl = document.getElementById('pool-join-code') || document.getElementById('shared-lobby-join-code');
  const code = codeEl ? codeEl.value.trim().toUpperCase() : (codeParam || '');
  const name = document.getElementById('pool-player-name').value.trim().toUpperCase() || 'PLAYER2';
  if (!code) { poolSetLobbyStatus('ENTER A ROOM CODE', 'error'); return; }

  poolSetLobbyStatus('CONNECTING...', '');
  const snap = await get(ref(db, `pool/${code}`));
  if (!snap.exists()) { poolSetLobbyStatus('TABLE NOT FOUND', 'error'); return; }
  const room = snap.val();
  if (room.status !== 'waiting') { poolSetLobbyStatus('GAME IN PROGRESS', 'error'); return; }

  POOL.playerName = name;
  POOL.playerNum = 2;
  POOL.roomCode = code;
  POOL.opponentName = room.player1.name;

  await update(ref(db, `pool/${code}`), {
    player2: { name, ready: true },
    status: 'playing',
  });

  document.getElementById('header-room-code').textContent = code;
  document.getElementById('room-code-display').style.display = '';
  poolStartGame();
};

function poolStartGame() {
  // Only run poolInit if balls not already set up (host sets up before Firebase write)
  if (!POOL.balls || !POOL.balls.length) poolInit();
  POOL.myTurn = POOL.playerNum === 1;
  POOL.myBallType = null;
  POOL.opponentBallType = null;
  POOL.myPotted = 0;
  POOL.oppPotted = 0;
  POOL.potted = [];
  POOL.tube = [];
  POOL.tubeAnims = [];
  poolTubeDraw();
  POOL.shotSeq = 0;
  POOL._lastObservedSeq = 0;
  POOL._observingShot = 0;

  showScreen('pool-screen');

  if (!document.getElementById('pool-no-scanlines')) {
    const s = document.createElement('style');
    s.id = 'pool-no-scanlines';
    s.textContent = 'body::before { display: none !important; }';
    document.head.appendChild(s);
  }

  if (POOL.playerNum === 1) {
    // Host: balls already set up and written to Firebase before poolStartGame called
    setTimeout(() => {
      poolGetCanvas();
      poolDraw();
      poolUpdateTurnIndicator();
      poolUpdateScores();
    }, 50);
  } else {
    // Guest: wait 400ms to ensure host ball data is in Firebase
    setTimeout(async () => {
      poolGetCanvas();
      const snap = await get(ref(db, `pool/${POOL.roomCode}/balls`));
      if (snap.exists()) poolBallsFromData(snap.val());
      else poolSetupBalls();
      poolDraw();
      poolUpdateTurnIndicator();
      poolUpdateScores();
    }, 400);
  }

  poolListenToGame();
}

function poolBallsToData() {
  return POOL.balls.map(b => ({ id: b.id, x: Math.round(b.x*10)/10, y: Math.round(b.y*10)/10, vx: 0, vy: 0, potted: b.potted, angle: b.angle||0, spin: 0, sliding: false }));
}

function poolBallsFromData(data) {
  // Direct snap — used for both observer live updates and final positions.
  // The observer render loop runs at 60fps; Firebase streams at ~30fps.
  // Simple direct position updates look smooth enough without lerp complexity.
  const existing = {};
  if (POOL.balls) POOL.balls.forEach(b => { existing[b.id] = b; });
  POOL.balls = data.map(b => ({
    id: b.id,
    x: b.x, y: b.y,
    vx: 0, vy: 0,
    potted: b.potted,
    angle: b.angle || 0,
    spin: 0, sliding: false,
  }));
  POOL.cueBall = POOL.balls.find(b => b.id === 0);
}

async function poolSyncBallsToFirebase() {
  if (!POOL.roomCode) return;
  await update(ref(db, `pool/${POOL.roomCode}`), { balls: poolBallsToData() });
}

// Internal fire function - called from new click handler and bot
async function poolFireShot() {
  if (!POOL.myTurn || POOL.isMoving) return;
  if (POOL.cueBall.potted) { poolLog('CUE BALL IN POCKET — PLACE IT', 'system'); return; }

  const angle = POOL.lockedAngle !== undefined && POOL.shotState === 'locked'
    ? POOL.lockedAngle : POOL.aimAngle;
  const power = POOL.shotState === 'locked' ? POOL.pullback * 100 : 50;
  // Power 0-100 maps to 0-14 px/frame initial speed (matches MU_SLIDE decel)
  // At max power ball travels ~full table length before stopping — feels right
  const speed = power * 0.13;

  // Reset shot state
  POOL.shotState = 'aiming';
  const pb = document.getElementById('pool-power-bar');
  const hint = document.getElementById('pool-hint');
  if (pb) pb.style.display = 'none';
  if (hint) hint.style.display = '';

  // Capture pre-shot ball positions (before cue velocity applied)
  const preShotBalls = poolBallsToData();
  const hadTwoShots = POOL.twoShotsOwed; // snapshot before shot fires

  // Apply velocity to cue ball locally
  // The aim line points FROM the mouse TOWARD the cue ball, so the shot direction
  // is angle + PI. The spin is determined by how far off-centre the cue tip is.
  // We approximate by the perpendicular component of the mouse offset from the cue ball.
  const cb = POOL.cueBall;
  const dx = POOL.mouseX - cb.x;
  const dy = POOL.mouseY - cb.y;
  // perpendicular offset of aim line to ball centre (side-spin source)
  const perpOffset = (-Math.sin(angle) * dx + Math.cos(angle) * dy);
  const sideSpin = (perpOffset / (POOL.BALL_R * 2)) * speed * 1.2; // scaled spin
  try { POOL_SFX.cueHit(power / 100); } catch(e) {}
  cb.vx = Math.cos(angle) * speed;
  cb.vy = Math.sin(angle) * speed;
  cb.spin = 0;        // ball starts with NO spin — pure sliding skid on hit
  cb.sliding = true;  // transitions to rolling once spin catches up to velocity
  POOL.firstBallHitId = null;
  POOL.shotFoul = false;
  POOL.myTurn = false;
  POOL._isShooting = true;  // flag so poolAnimate knows THIS client is the shooter
  poolUpdateTurnIndicator();

  // Broadcast full shot to Firebase so observer can replay the same physics
  if (!POOL.isBot && POOL.roomCode) {
    POOL.shotSeq = (POOL.shotSeq || 0) + 1;
    const shot = {
      angle,
      power,
      speed,
      playerNum: POOL.playerNum,
      balls: preShotBalls,
      seq: POOL.shotSeq,
      timestamp: Date.now(),
      hadTwoShots,
    };
    // Note: do NOT set `turn` here — observer uses shotSettled+turn together
    // to hand off the turn after animation. Setting turn early creates a race
    // where the listener fires with turn=opponent but no shotSettled to match.
    await update(ref(db, `pool/${POOL.roomCode}`), {
      lastShot: shot,
      shotSeq: POOL.shotSeq,
      cueAim: null,   // clear ghost cue so observer hides it the moment shot fires
    });
  }

  poolAnimate(async (pottedIds) => {
    // Consume one of the two shots
    const usedFirstOfTwo = hadTwoShots && POOL.twoShotsOwed;
    if (usedFirstOfTwo) POOL.twoShotsOwed = false;

    const result = poolHandlePotted(pottedIds, true, hadTwoShots);

    // Win / Lose
    if (result.winShot) { poolEndGame(true); return; }
    if (result.lose)    { poolEndGame(false); return; }

    // Foul feedback
    if (result.foul) {
      const twoShotMsg = result.twoShots ? ' — opponent gets 2 shots' : '';
      poolLog(`⚠️ ${result.foulReason}${twoShotMsg}`, 'miss');
    } else if (usedFirstOfTwo && !result.continueTurn) {
      // Used first of two shots, didn't pot — second shot is still theirs
      poolLog('🎱 2nd shot — play again', 'hit');
    }

    if (POOL.isBot) {
      // Two shots: keep turn if first-of-two was used and no foul
      if (usedFirstOfTwo && !result.foul && !result.continueTurn) {
        POOL.myTurn = true;
        poolUpdateTurnIndicator();
      } else if (!result.foul && result.continueTurn) {
        POOL.myTurn = true;
        poolUpdateTurnIndicator();
      } else {
        POOL.myTurn = false;
        POOL._botTwoShots = result.twoShots ? 2 : 0;
        poolUpdateTurnIndicator();
        setTimeout(doBotTurn, 600);
      }
    } else {
      // Multiplayer: keep turn if potted own ball, used first-of-two (no foul), or continueTurn
      const keepTurn = (!result.foul && result.continueTurn) || (usedFirstOfTwo && !result.foul);
      const nextTurn = keepTurn ? POOL.playerNum : (POOL.playerNum === 1 ? 2 : 1);
      const oppGainsTwoShots = result.twoShots;
      const ballTypesUpdate = POOL.myBallType ? {
        p1: POOL.playerNum === 1 ? POOL.myBallType : POOL.opponentBallType,
        p2: POOL.playerNum === 1 ? POOL.opponentBallType : POOL.myBallType,
      } : null;
      // Write potted counts and ball ids so observer can sync score + tube display
      const pottedCounts = {
        p1: POOL.playerNum === 1 ? POOL.myPotted : POOL.oppPotted,
        p2: POOL.playerNum === 1 ? POOL.oppPotted : POOL.myPotted,
      };
      await update(ref(db, `pool/${POOL.roomCode}`), {
        balls: poolBallsToData(),
        turn: nextTurn,
        ballTypes: ballTypesUpdate,
        pottedCounts,
        shotSettled: POOL.shotSeq,
        twoShots: oppGainsTwoShots ? (POOL.playerNum === 1 ? 2 : 1) : null,
        lastFoul: result.foul ? result.foulReason + (result.twoShots ? ' — opponent gets 2 shots' : '') : null,
      });
      if (nextTurn === POOL.playerNum) {
        POOL.myTurn = true;
        poolUpdateTurnIndicator();
      }
    }
  });
}

// Keep backward-compat alias (used nowhere now but safe to keep)
window.poolShoot = poolFireShot;

// ?? PROPER 8-BALL POOL RULES ENGINE ??????????????????????????????????????
// Returns { foul, foulReason, continueTurn, twoShots, winShot, lose }
// freeBall = true when player has two shots (first shot is free table — can hit anything)
function poolEvaluateShot(pottedIds, isMyShot, freeBall) {
  const myType  = isMyShot ? POOL.myBallType : POOL.opponentBallType;
  const typesAssigned = !!myType;

  const scratch      = pottedIds.includes(0);
  const pottedEight  = pottedIds.includes(8);
  const pottedBalls  = pottedIds.filter(id => id !== 0 && id !== 8);
  const pottedOwn    = pottedBalls.filter(id => myType ? (myType === 'red' ? id <= 7 : id >= 9) : false);

  // First ball hit this shot
  const firstHit = POOL.firstBallHitId;
  const firstHitIsOwn   = typesAssigned && firstHit !== null && firstHit !== undefined &&
    (myType === 'red' ? (firstHit >= 1 && firstHit <= 7) : (firstHit >= 9 && firstHit <= 15));
  const firstHitIsEight = firstHit === 8;

  // How many of my balls remain on the table AFTER this shot
  const myRemaining = POOL.balls.filter(b => !b.potted && b.id !== 0 && b.id !== 8 &&
    (myType === 'red' ? b.id <= 7 : b.id >= 9)).length;
  // "all cleared" means none left AND none potted this shot (already counted as potted)
  const allMyBallsCleared = typesAssigned && myRemaining === 0 && pottedOwn.length === 0;

  // ?? FOULS ??????????????????????????????????????????????????????????????
  let foul = false;
  let foulReason = '';

  if (scratch) {
    foul = true;
    foulReason = 'SCRATCH — cue ball potted';
  } else if (firstHit === null || firstHit === undefined || firstHit === -1) {
    foul = true;
    foulReason = 'FOUL — cue ball missed everything';
  } else if (!typesAssigned) {
    // Types not yet assigned — any coloured ball hit is fine, no foul
  } else if (freeBall) {
    // Free table (first of two shots) — can hit any ball, no first-hit foul
  } else if (allMyBallsCleared) {
    // Must hit the 8-ball when all your balls are gone
    if (!firstHitIsEight) {
      foul = true;
      foulReason = 'FOUL — must hit the 8-ball when all your balls are potted';
    }
  } else {
    // Types assigned, still have balls — must hit own ball first
    if (!firstHitIsOwn) {
      const hitWhat = firstHitIsEight ? '8-ball' : (firstHit <= 7 ? '🔴' : '🟡');
      foul = true;
      foulReason = `FOUL — must hit your own ball first (hit ${hitWhat})`;
    }
  }

  // ?? 8-BALL POTTED ??????????????????????????????????????????????????????
  if (pottedEight) {
    if (foul || !allMyBallsCleared) {
      // Potted 8-ball illegally = lose
      return { foul: true, foulReason: foul ? foulReason : 'FOUL — potted 8-ball too early', continueTurn: false, twoShots: false, winShot: false, lose: true };
    } else {
      // Legal 8-ball pot = win (unless scratch on same shot)
      if (scratch) {
        return { foul: true, foulReason: 'SCRATCH on 8-ball', continueTurn: false, twoShots: false, winShot: false, lose: true };
      }
      return { foul: false, foulReason: '', continueTurn: false, twoShots: false, winShot: true, lose: false };
    }
  }

  // ?? TWO SHOTS on foul ??????????????????????????????????????????????????
  // Opponent gets two shots: their first shot is a free table (can hit any ball)
  // and if they pot on it, they get the second shot as normal
  const twoShots = foul;

  // ?? CONTINUE TURN: potted own ball(s), no foul ????????????????????????
  const continueTurn = !foul && pottedOwn.length > 0;

  return { foul, foulReason, continueTurn, twoShots, winShot: false, lose: false };
}


// ── POOL BALL TUBE ────────────────────────────────────────────────────────────
// Single shared tube — all potted balls roll in from the right
(function() {
  const TUBE_H = 28;
  const BALL_R_TUBE = 11;
  const SPACING = 2;

  function getTubeCanvas() {
    return document.getElementById('pool-tube');
  }

  function drawTube() {
    const canvas = getTubeCanvas();
    if (!canvas) return;
    const W = canvas.offsetWidth || canvas.parentElement.offsetWidth || 400;
    if (canvas.width !== W) canvas.width = W;
    const ctx = canvas.getContext('2d');
    const balls = POOL.tube || [];
    const anims = POOL.tubeAnims || [];
    const cy = TUBE_H / 2;
    const rr = TUBE_H / 2;

    ctx.clearRect(0, 0, W, TUBE_H);

    // Tube background
    const bg = ctx.createLinearGradient(0, 0, 0, TUBE_H);
    bg.addColorStop(0, 'rgba(30,30,40,0.9)');
    bg.addColorStop(0.5, 'rgba(15,15,22,0.95)');
    bg.addColorStop(1, 'rgba(30,30,40,0.9)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, TUBE_H, rr);
    ctx.fill();

    // Glass rim
    ctx.strokeStyle = 'rgba(0,212,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, W-1, TUBE_H-1, rr);
    ctx.stroke();

    // Settled balls packed left-to-right from left end
    const ballDiam = BALL_R_TUBE * 2 + SPACING;
    balls.forEach((id, i) => {
      const bx = rr + BALL_R_TUBE + i * ballDiam;
      drawTubeBall(ctx, bx, cy, BALL_R_TUBE, id);
    });

    // Animating balls
    anims.forEach(a => {
      drawTubeBall(ctx, a.x, cy, BALL_R_TUBE, a.id);
    });

    // Right-end fade
    const endGrad = ctx.createLinearGradient(W - 30, 0, W, 0);
    endGrad.addColorStop(0, 'rgba(0,0,0,0)');
    endGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = endGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, TUBE_H, rr);
    ctx.fill();
  }

  function drawTubeBall(ctx, bx, by, r, id) {
    const colors = POOL.BALL_COLORS;
    if (!colors || id === 0) return;
    const color = colors[id] || '#888';
    const isStripe = id >= 9 && id <= 15;

    ctx.save();
    ctx.beginPath(); ctx.arc(bx, by,Math.max(0,r), 0, Math.PI*2); ctx.clip();

    if (isStripe) {
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath(); ctx.arc(bx, by,Math.max(0,r), 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(bx - r, by - r*0.40, r*2, r*0.80);
    } else {
      const g = ctx.createRadialGradient(bx-r*0.3,by-r*0.3,Math.max(0.01,r*0.04),bx+r*0.1,by+r*0.1,Math.max(0.01,r*1.05));
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.3, color);
      g.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by,Math.max(0,r), 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(bx, by,Math.max(0,r*0.40), 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = `bold ${r*(id>=10?0.54:0.66)}px Arial,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(id, bx, by+r*0.03);
    ctx.restore();
    ctx.beginPath(); ctx.arc(bx-r*0.25, by-r*0.25,Math.max(0,r*0.2), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by,Math.max(0,r), 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6; ctx.stroke();
  }

  function startRollAnim(ballId) {
    const canvas = getTubeCanvas();
    if (!canvas) return;
    const W = canvas.offsetWidth || 400;
    const rr = TUBE_H / 2;
    const ballDiam = BALL_R_TUBE * 2 + SPACING;
    const settled = (POOL.tube || []).length;
    const inFlight = (POOL.tubeAnims || []).length;
    const targetX = rr + BALL_R_TUBE + (settled + inFlight) * ballDiam;
    const startX = W + BALL_R_TUBE + 10;
    const anim = { id: ballId, x: startX, targetX, done: false };
    POOL.tubeAnims.push(anim);

    let lastTime = null;
    function step(ts) {
      if (!lastTime) lastTime = ts;
      const dt = Math.min((ts - lastTime) / 16, 3);
      lastTime = ts;
      const dist = anim.x - anim.targetX;
      if (dist > 1) {
        anim.x -= Math.max(1.2, dist * 0.18) * dt;
        if (anim.x <= anim.targetX) { anim.x = anim.targetX; anim.done = true; }
      } else {
        anim.x = anim.targetX;
        anim.done = true;
      }
      drawTube();
      if (!anim.done) {
        requestAnimationFrame(step);
      } else {
        POOL.tube.push(ballId);
        POOL.tubeAnims = POOL.tubeAnims.filter(a => a !== anim);
        drawTube();
      }
    }
    requestAnimationFrame(step);
  }

  window.poolTubeDraw = function() { drawTube(); };
  window.poolTubeAddBall = function(which, ballId) { startRollAnim(ballId); };

  window.addEventListener('resize', drawTube);

  // Rebuild tube from authoritative ball list — idempotent, replaces current tube state
  window.poolTubeRebuild = function(ballData) {
    const pottedIds = ballData
      .filter(b => b.potted && b.id !== 0)
      .map(b => b.id)
      .sort((a, b) => a - b);
    // Only rebuild if the set of potted balls has changed
    const currentStr = (POOL.tube || []).slice().sort((a,b)=>a-b).join(',');
    const newStr = pottedIds.join(',');
    if (currentStr === newStr) return; // nothing changed
    POOL.tube = pottedIds;
    POOL.tubeAnims = [];
    drawTube();
  };
})();

function poolHandlePotted(pottedIds, isMyShot, freeBall) {
  const actorType  = isMyShot ? POOL.myBallType : POOL.opponentBallType;
  const pottedBalls = pottedIds.filter(id => id !== 0 && id !== 8);

  // ?? Assign ball types if not yet assigned (first coloured ball potted) ??
  if (!POOL.myBallType && pottedBalls.length > 0) {
    const firstId = pottedBalls[0];
    const firstIsRed = firstId <= 7;
    if (isMyShot) {
      POOL.myBallType       = firstIsRed ? 'red' : 'yellow';
      POOL.opponentBallType = firstIsRed ? 'yellow' : 'red';
    } else {
      POOL.opponentBallType = firstIsRed ? 'red' : 'yellow';
      POOL.myBallType       = firstIsRed ? 'yellow' : 'red';
    }
    const myLabel = POOL.myBallType === 'red' ? '🔴 REDS' : '🟡 YELLOWS';
    poolLog(`You are ${myLabel}`, 'system');
    if (POOL.roomCode) update(ref(db, `pool/${POOL.roomCode}`), {
      ballTypes: {
        p1: POOL.playerNum === 1 ? POOL.myBallType : POOL.opponentBallType,
        p2: POOL.playerNum === 1 ? POOL.opponentBallType : POOL.myBallType
      }
    });
  }

  // ?? Count potted balls ?????????????????????????????????????????????????
  pottedBalls.forEach(id => {
    const isRed = id <= 7;
    const label = isRed ? '🔴' : '🟡';
    if (isMyShot) {
      if (POOL.myBallType === (isRed ? 'red' : 'yellow')) {
        POOL.myPotted++;
        poolLog(`${label} potted`, 'hit');
        setTimeout(() => { if (window.poolTubeAddBall) poolTubeAddBall('any', id); }, 200);
      } else {
        POOL.oppPotted++;
        poolLog(`${label} potted (opponent's)`, 'miss');
        setTimeout(() => { if (window.poolTubeAddBall) poolTubeAddBall('any', id); }, 200);
      }
    } else {
      if (POOL.opponentBallType === (isRed ? 'red' : 'yellow')) {
        POOL.oppPotted++;
        setTimeout(() => { if (window.poolTubeAddBall) poolTubeAddBall('any', id); }, 200);
      } else {
        POOL.myPotted++;
        poolLog(`Opponent potted your ${label}`, 'hit');
        setTimeout(() => { if (window.poolTubeAddBall) poolTubeAddBall('any', id); }, 200);
      }
    }
  });

  // ?? Handle scratch (cue ball in pocket) ???????????????????????????????
  if (pottedIds.includes(0)) {
    setTimeout(() => {
      if (POOL.cueBall) {
        POOL.cueBall.potted = false;
        POOL.cueBall.x = POOL.TW * 0.25;
        POOL.cueBall.y = POOL.TH / 2;
        POOL.cueBall.vx = 0; POOL.cueBall.vy = 0;
        poolDraw();
        if (POOL.roomCode) poolSyncBallsToFirebase();
      }
    }, 600);
  }

  poolUpdateScores();

  // Return evaluation for turn control
  return poolEvaluateShot(pottedIds, isMyShot, freeBall);
}

function poolEndGame(iWon) {
  _stopObserverRender();
  if (POOL.roomCode) update(ref(db, `pool/${POOL.roomCode}`), { winner: POOL.playerNum === 1 ? (iWon ? 1 : 2) : (iWon ? 2 : 1), status: 'done' });
  const overlay = document.getElementById('pool-end-overlay');
  const title = document.getElementById('pool-end-title');
  const msg = document.getElementById('pool-end-msg');
  title.textContent = iWon ? 'VICTORY!' : 'DEFEATED';
  title.className = iWon ? 'win' : 'lose';
  msg.textContent = iWon ? `${POOL.playerName} sinks the 8-ball. Game over!` : 'Opponent wins this frame.';
  overlay.classList.add('active');
}

// Observer render loop — runs while opponent is shooting so canvas redraws
// at 60fps. Ball positions are updated directly by poolBallsFromData each time
// a liveBalls snapshot arrives (~30fps). No lerp needed — direct snap is smooth.
function _poolObserverRenderLoop() {
  if (!POOL._observerRendering) return;
  if (!document.hidden) poolDraw();
  POOL._observerRaf = requestAnimationFrame(_poolObserverRenderLoop);
}
function _startObserverRender() {
  if (POOL._observerRendering) return;
  POOL._observerRendering = true;
  _poolObserverRenderLoop();
}
function _stopObserverRender() {
  POOL._observerRendering = false;
  if (POOL._observerRaf) { cancelAnimationFrame(POOL._observerRaf); POOL._observerRaf = null; }
}

function poolListenToGame() {
  // Track which shot sequence we have already started animating (observer side)
  POOL._lastObservedSeq = POOL._lastObservedSeq || 0;

  const unsub = onValue(ref(db, `pool/${POOL.roomCode}`), snap => {
    if (!snap.exists()) return;
    const room = snap.val();

    // Game over
    if (room.winner && !POOL.isMoving) {
      poolEndGame(room.winner === POOL.playerNum);
      return;
    }

    // ── OBSERVER SHOT TRACKING ───────────────────────────────────────────────
    const shot = room.lastShot;
    const incomingSeq = room.shotSeq || 0;
    const isOpponentShot = shot && shot.playerNum !== POOL.playerNum;
    const isNewShot = isOpponentShot && incomingSeq > (POOL._lastObservedSeq || 0);

    if (isNewShot) {
      // New opponent shot detected — start observer render loop
      POOL._lastObservedSeq = incomingSeq;
      POOL._observingShot = incomingSeq; // track which shot we are observing
      POOL.myTurn = false;
      POOL.isMoving = true;
      POOL.oppCue = null;
      poolUpdateTurnIndicator();
      _startObserverRender();
    }

    // Ghost cue: only show while idle (no shot in flight)
    if (room.cueAim && room.cueAim.p !== POOL.playerNum && !POOL.isMoving && !isNewShot) {
      POOL.oppCue = room.cueAim;
      if (!POOL.myTurn) poolDraw();
    } else if (POOL.isMoving || isNewShot || !room.cueAim) {
      POOL.oppCue = null;
    }

    // NOTE: liveBalls updates are handled by a dedicated sub-path listener below.
    // The parent listener only handles shot start detection, cue aim, and settlement.

    // ?? SHOT SETTLED: opponent's shot finished — apply final positions and hand off turn ??
    // The shooter's onDone callback handles their own turn logic; they must NOT process this.
    const shotWasMine = room.lastShot && room.lastShot.playerNum === POOL.playerNum;
    if (room.shotSettled === incomingSeq && !shotWasMine) {
      POOL.isMoving = false;
      _stopObserverRender();
      // Apply the shooter's authoritative final ball positions
      if (room.balls) { poolBallsFromData(room.balls); }
      if (room.ballTypes) {
        const myKey = `p${POOL.playerNum}`;
        POOL.myBallType = room.ballTypes[myKey];
        POOL.opponentBallType = room.ballTypes[`p${POOL.playerNum === 1 ? 2 : 1}`];
      }
      // Sync potted ball counts from shooter's authoritative state
      if (room.pottedCounts) {
        const myKey = `p${POOL.playerNum}`;
        const oppKey = `p${POOL.playerNum === 1 ? 2 : 1}`;
        POOL.myPotted  = room.pottedCounts[myKey]  || 0;
        POOL.oppPotted = room.pottedCounts[oppKey] || 0;
      }
      // Rebuild the tube from authoritative potted ball list (balls with potted:true)
      // This is idempotent — safe to call multiple times, never duplicates.
      if (room.balls && window.poolTubeRebuild) {
        poolTubeRebuild(room.balls);
      }
      // Show foul log if applicable
      if (room.lastFoul) { poolLog(`⚠️ ${room.lastFoul}`, 'miss'); }
      if (room.turn === POOL.playerNum) {
        POOL.twoShotsOwed = !!(room.twoShots && room.twoShots === POOL.playerNum);
        if (POOL.twoShotsOwed) poolLog('🎱 2 SHOTS — free table on first shot', 'hit');
        POOL.myTurn = true;
        poolUpdateTurnIndicator();
      }
      poolUpdateScores();
      poolDraw();
    }
  });
  POOL.unsubs.push(unsub);

  // ── Dedicated liveBalls listener ─────────────────────────────────────────
  // Separate listener on the subpath so every 33ms position write fires
  // immediately, without being coalesced into the heavier parent snapshot.
  const liveBallsUnsub = onValue(ref(db, `pool/${POOL.roomCode}/liveBalls`), snap => {
    // Only the observer (not the shooter) processes live ball positions
    if (POOL._isShooting) return;
    if (!snap.exists()) return;
    const data = snap.val();
    if (data && data.balls) {
      // Apply positions immediately — start observer render loop if not already running.
      // No gate on _observingShot here: the parent listener may not have fired yet (race),
      // and dropping frames here is exactly what causes the "balls teleport" bug.
      poolBallsFromData(data.balls);
      POOL.isMoving = true;
      if (!POOL._observingShot) POOL._observingShot = -1;
      if (!POOL._observerRendering) _startObserverRender();
    } else {
      // balls:null — shooter's animation finished, stop observer loop
      POOL._observingShot = 0;
      POOL.isMoving = false;
      _stopObserverRender();
    }
  });
  POOL.unsubs.push(liveBallsUnsub);

  // Watch for opponent leaving
  if (!POOL.isBot) {
    const abandonUnsub = watchForAbandoned(`pool/${POOL.roomCode}`, () => {
      showAbandonedNotice(() => poolBackToLobby());
    });
    POOL.unsubs.push(abandonUnsub);
    chatInit('pool', `chat/pool_${POOL.roomCode}`, POOL.playerName);
    showHeaderLeave('pool');
  }
}

window.poolPlayAgain = async function() {
  document.getElementById('pool-end-overlay').classList.remove('active');
  POOL.unsubs.forEach(u => typeof u === 'function' && u());
  POOL.unsubs = [];
  poolInit();
  POOL.myTurn = POOL.playerNum === 1;
  POOL.myBallType = null;
  POOL.opponentBallType = null;
  POOL.myPotted = 0;
  POOL.oppPotted = 0;
  POOL.shotState = 'aiming';
  POOL.pullback = 0;
  POOL.shotSeq = 0;
  POOL._lastObservedSeq = 0;
  POOL._observingShot = 0;

  if (POOL.isBot) {
    poolSetupBalls();
    poolGetCanvas();
    poolDraw();
    poolUpdateTurnIndicator();
    poolUpdateScores();
    return;
  }

  if (POOL.playerNum === 1) {
    poolSetupBalls();
    await update(ref(db, `pool/${POOL.roomCode}`), {
      status: 'playing', winner: null, turn: 1,
      balls: poolBallsToData(), lastShot: null, ballTypes: null
    });
    poolGetCanvas();
    poolDraw();
    poolUpdateTurnIndicator();
    poolUpdateScores();
  } else {
    // Guest: fetch fresh ball positions from Firebase
    const snap = await get(ref(db, `pool/${POOL.roomCode}/balls`));
    if (snap.exists()) poolBallsFromData(snap.val());
    else poolSetupBalls();
    poolGetCanvas();
    poolDraw();
    poolUpdateTurnIndicator();
    poolUpdateScores();
  }
  poolListenToGame();
};

window.poolBackToLobby = function() {
  POOL.unsubs.forEach(u => typeof u === 'function' && u());
  POOL.unsubs = [];
  chatDestroy('pool');
  hideHeaderLeave();
  document.getElementById('pool-end-overlay').classList.remove('active');
  document.getElementById('room-code-display').style.display = 'none';
  POOL.roomCode = null;
  POOL.isBot = false;
  if (POOL._docListeners) {
    document.removeEventListener('mousemove', poolMouseMove);
    document.removeEventListener('click', poolMouseClick);
    document.removeEventListener('touchmove', poolTouchMove);
    document.removeEventListener('touchend', poolTouchEnd);
    POOL._docListeners = false;
  }
  // Restore global scanline overlay
  const noScan = document.getElementById('pool-no-scanlines');
  if (noScan) noScan.remove();

  backToGameSelect();
};


// ---- POOL BOT ----
window.poolShowBotOptions = function() {
  const el = document.getElementById('pool-bot-difficulty');
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

window.poolStartBot = function(difficulty) {
  const name = document.getElementById('pool-player-name').value.trim().toUpperCase() || 'PLAYER';
  POOL.playerName = name;
  POOL.playerNum = 1;
  POOL.isBot = true;
  POOL.botDifficulty = difficulty;
  POOL.opponentName = difficulty === 'easy' ? 'BOT (EASY)' : difficulty === 'medium' ? 'BOT (MED)' : 'BOT (HARD)';
  POOL.roomCode = null;
  const botDiffEl = document.getElementById('pool-bot-difficulty');
  if (botDiffEl) botDiffEl.style.display = 'none';
  const lobbyStatusEl = document.getElementById('pool-lobby-status');
  if (lobbyStatusEl) lobbyStatusEl.style.display = 'none';
  poolInit();
  poolSetupBalls();
  POOL.myTurn = true;
  POOL.myBallType = null;
  POOL.opponentBallType = null;
  POOL.myPotted = 0;
  POOL.oppPotted = 0;
  POOL.shotState = 'aiming';
  POOL.pullback = 0;
  showScreen('pool-screen');
  setTimeout(() => {
    poolGetCanvas();
    poolDraw();
    poolUpdateTurnIndicator();
    poolUpdateScores();
  }, 50);
};

function poolBotPickShot() {
  const diff = POOL.botDifficulty;
  const cue = POOL.cueBall;
  if (!cue || cue.potted) return null;

  // Find bot's target balls
  const botType = POOL.opponentBallType;
  let targets = POOL.balls.filter(b => !b.potted && b.id !== 0 && b.id !== 8);
  if (botType) {
    const botBalls = targets.filter(b => (botType === 'red' ? b.id <= 7 : b.id >= 9));
    if (botBalls.length === 0) {
      // All bot balls potted - target 8 ball
      targets = POOL.balls.filter(b => !b.potted && b.id === 8);
    } else {
      targets = botBalls;
    }
  }
  if (targets.length === 0) targets = POOL.balls.filter(b => !b.potted && b.id !== 0);
  if (targets.length === 0) return null;

  // Pick a random target ball
  const targetBall = targets[Math.floor(Math.random() * targets.length)];

  // Aim from cue ball through target ball
  const dx = targetBall.x - cue.x;
  const dy = targetBall.y - cue.y;
  const angle = Math.atan2(dy, dx);

  // Add inaccuracy based on difficulty
  const spread = diff === 'easy' ? 0.45 : diff === 'medium' ? 0.18 : 0.04;
  const finalAngle = angle + (Math.random() - 0.5) * spread;

  // Power: easy=random, medium=medium, hard=calculated
  let power;
  if (diff === 'easy') power = 20 + Math.random() * 50;
  else if (diff === 'medium') power = 35 + Math.random() * 35;
  else power = 45 + Math.random() * 30;

  return { angle: finalAngle, power };
}

async function doBotTurn() {
  const delay = POOL.botDifficulty === 'easy' ? 1400 : POOL.botDifficulty === 'medium' ? 1000 : 700;
  await new Promise(res => setTimeout(res, delay));

  const hasTwoShots = POOL._botTwoShots > 0;
  const shot = poolBotPickShot(hasTwoShots);
  if (!shot || POOL.cueBall.potted) {
    // Bot can't shoot - give turn back
    POOL.myTurn = true;
    poolUpdateTurnIndicator();
    return;
  }

  // ── Animate bot cue: sweep in, aim, pull back, then fire ──────
  const BOT_AIM_MS = POOL.botDifficulty === 'easy' ? 900 : POOL.botDifficulty === 'medium' ? 650 : 420;
  const BOT_PULL_MS = 350;

  // Phase 1: sweep angle toward shot angle over BOT_AIM_MS
  const startAngle = shot.angle + (Math.random() > 0.5 ? 1.2 : -1.2); // start offset
  const aimStart = Date.now();
  await new Promise(res => {
    function aimFrame() {
      if (!POOL.myTurn === false && POOL.isMoving) { res(); return; } // abort if state changed
      const t = Math.min(1, (Date.now() - aimStart) / BOT_AIM_MS);
      const eased = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      POOL.oppCue = { angle: startAngle + (shot.angle - startAngle) * eased, state: 'aiming', pullback: 0, p: 2 };
      poolDraw();
      if (t < 1) requestAnimationFrame(aimFrame);
      else res();
    }
    requestAnimationFrame(aimFrame);
  });

  // Phase 2: pull back over BOT_PULL_MS
  const pullStart = Date.now();
  const targetPullback = (shot.power / 75);
  await new Promise(res => {
    function pullFrame() {
      const t = Math.min(1, (Date.now() - pullStart) / BOT_PULL_MS);
      POOL.oppCue = { angle: shot.angle, state: 'locked', pullback: t * targetPullback, p: 2 };
      poolDraw();
      if (t < 1) requestAnimationFrame(pullFrame);
      else res();
    }
    requestAnimationFrame(pullFrame);
  });

  // Phase 3: fire — clear bot cue and shoot
  POOL.oppCue = null;

  if (hasTwoShots) POOL._botTwoShots--;

  POOL.cueBall.vx = Math.cos(shot.angle) * shot.power * 0.13;
  POOL.cueBall.vy = Math.sin(shot.angle) * shot.power * 0.13;
  POOL.firstBallHitId = null;
  POOL.shotFoul = false;

  poolAnimate((pottedIds) => {
    const result = poolHandlePotted(pottedIds, false, hasTwoShots);
    poolDraw();

    if (result.winShot) { poolEndGame(false); return; }  // bot wins = player loses
    if (result.lose)    { poolEndGame(true);  return; }  // bot fouls 8-ball = player wins

    if (result.foul) {
      const twoMsg = result.twoShots ? ' — you get 2 shots!' : '';
      poolLog(`⚠️ BOT FOUL: ${result.foulReason}${twoMsg}`, 'miss');
      if (result.twoShots) {
        POOL.twoShotsOwed = true;
        poolLog('🎱 2 SHOTS — free table on first shot', 'hit');
      }
      POOL.myTurn = true;
      poolUpdateTurnIndicator();
    } else if (!result.continueTurn && hasTwoShots && POOL._botTwoShots > 0) {
      // Bot used first of two, didn't pot, gets second shot
      poolLog('Bot plays 2nd shot', 'system');
      poolUpdateTurnIndicator();
      setTimeout(doBotTurn, 700);
    } else if (!result.foul && result.continueTurn) {
      // Bot keeps turn (potted)
      poolUpdateTurnIndicator();
      setTimeout(doBotTurn, 700);
    } else {
      POOL.myTurn = true;
      poolUpdateTurnIndicator();
    }
  });
}





// ============================================================
