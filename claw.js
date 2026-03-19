// ============================================================
// CLAW MACHINE — claw.js
// Three.js r128 + Cannon-es physics
// ============================================================

// Import Three.js as ES module from jsdelivr (same CDN used for cannon-es)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export default (() => {

  let C = null;
  let audioCtx = null;

  // Load cannon-es immediately when the module is first imported
  const _cannonReady = import('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js')
    .then(mod => { C = mod; })
    .catch(() => { C = window.CANNON; });

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

  // ── Sway / momentum state ──────────────────────────────────
  // The claw+cable sway like a pendulum when moving or dropping
  let swayAngleX = 0;    // current sway angle around Z axis (XY plane)
  let swayAngleZ = 0;    // current sway angle around X axis (ZY plane)
  let swayVelX   = 0;    // angular velocity X
  let swayVelZ   = 0;    // angular velocity Z
  const SWAY_DAMPING = 0.92;   // per-frame damping (< 1 = decay)
  const SWAY_SPRING  = 14.0;   // spring constant (softer = slower settle)
  const SWAY_DRIVE   = 1.8;    // how hard movement kicks the sway

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
    // High value orbs
    { emoji:'🦄', label:'Unicorn Orb',  color:0xdd66ff, pts:100, glow:0xcc00ff, radius:0.21 },
    { emoji:'💎', label:'Diamond Orb',  color:0x44ccff, pts: 90, glow:0x00aaff, radius:0.19 },
    { emoji:'🌈', label:'Rainbow Orb',  color:0xff77bb, pts: 85, glow:0xff2299, radius:0.20 },
    { emoji:'🔥', label:'Fire Orb',     color:0xff5511, pts: 80, glow:0xff2200, radius:0.20 },
    { emoji:'⭐', label:'Star Orb',     color:0xffdd22, pts: 75, glow:0xffaa00, radius:0.20 },
    { emoji:'🐙', label:'Octopus Orb',  color:0xaa55ff, pts: 70, glow:0x8800ff, radius:0.22 },
    { emoji:'🐸', label:'Frog Orb',     color:0x22dd66, pts: 60, glow:0x00bb44, radius:0.21 },
    { emoji:'🍀', label:'Clover Orb',   color:0x33bb55, pts: 55, glow:0x008833, radius:0.18 },
    // Mid value plush
    { emoji:'🐻', label:'Bear Plush',   color:0xbb6633, pts: 50, glow:0x774422, radius:0.24 },
    { emoji:'🐶', label:'Dog Plush',    color:0xcc9944, pts: 45, glow:0xaa6622, radius:0.23 },
    { emoji:'🐱', label:'Cat Plush',    color:0xffbb66, pts: 40, glow:0xdd7700, radius:0.23 },
    { emoji:'🎀', label:'Bow Plush',    color:0xff4499, pts: 35, glow:0xdd0066, radius:0.20 },
    // Low value cheap toys
    { emoji:'🐧', label:'Penguin Toy',  color:0x88bbff, pts: 25, glow:0x4488ff, radius:0.20 },
    { emoji:'🦆', label:'Rubber Duck',  color:0xffee44, pts: 20, glow:0xddcc00, radius:0.20 },
    { emoji:'🐮', label:'Cow Toy',      color:0xddddaa, pts: 18, glow:0xaaaaaa, radius:0.22 },
    { emoji:'🐷', label:'Piggy Toy',    color:0xffaaaa, pts: 15, glow:0xff7788, radius:0.21 },
    { emoji:'🎾', label:'Tennis Ball',  color:0xaaee44, pts: 12, glow:0x88cc22, radius:0.18 },
    { emoji:'🔮', label:'Crystal Ball', color:0xaaddff, pts: 10, glow:0x66aaff, radius:0.17 },
    { emoji:'🍭', label:'Lollipop',     color:0xff88cc, pts:  8, glow:0xff44aa, radius:0.17 },
    { emoji:'🎲', label:'Lucky Dice',   color:0xffffff, pts:  5, glow:0xcccccc, radius:0.17 },
  ];

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    screenEl = document.getElementById('claw-screen');
    if (!screenEl) return;
    // Close any HS modal left open from a previous game
    if (window.HS && window.HS.submitClose) window.HS.submitClose();
    // Wait for cannon-es (download started at module load time, usually already done)
    await _cannonReady;
    if (!C) C = window.CANNON; // last-resort fallback
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

  // Mechanical thunk / clunk — soft
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
    g.gain.setValueAtTime(0.10, ac.currentTime);
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

  // Soft descending whistle — slipped off / dropped it / so close
  function _playMiss() {
    [520, 400, 300].forEach((f, i) => {
      setTimeout(() => _playTone(f, 'triangle', 0.3, 0.05, 0.02, 0.28), i * 90);
    });
  }

  // Servo whine loop while claw moves — very soft
  function _startMoveSound() {
    const ac = _getAudio(); if (!ac || movingSoundNode) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, ac.currentTime);
    g.gain.setValueAtTime(0.006, ac.currentTime);
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

  // Drop whir (descending pitch) — softened
  function _playDrop() {
    const ac = _getAudio(); if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(320, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.5);
    g.gain.setValueAtTime(0.07, ac.currentTime);
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

  // Per-prize chute jingle — each prize has a unique soft 3-note melody
  // Notes are [freq, delay_ms, duration_s, waveType]
  const PRIZE_JINGLES = {
    '🦄': [[523,0,0.35,'sine'],[659,180,0.35,'sine'],[784,360,0.5,'sine'],[1047,580,0.7,'sine']],        // Unicorn — bright rising fanfare
    '💎': [[880,0,0.25,'sine'],[1108,150,0.25,'sine'],[1320,300,0.45,'sine'],[1047,500,0.6,'triangle']], // Diamond — crystalline high
    '🌈': [[523,0,0.3,'triangle'],[659,140,0.3,'triangle'],[784,280,0.3,'triangle'],[1047,420,0.55,'triangle'],[784,580,0.4,'triangle']], // Rainbow — bouncy cascade
    '🔥': [[220,0,0.2,'sawtooth'],[330,130,0.2,'sawtooth'],[440,260,0.3,'sawtooth'],[660,420,0.5,'triangle']], // Fire — punchy rock riff
    '⭐': [[784,0,0.2,'sine'],[988,120,0.2,'sine'],[1175,240,0.4,'sine'],[988,420,0.2,'sine'],[1175,560,0.5,'sine']], // Star — twinkly
    '🐙': [[311,0,0.3,'sine'],[370,160,0.3,'sine'],[440,320,0.5,'sine'],[370,520,0.6,'sine']],           // Octopus — wobbly minor
    '🐸': [[330,0,0.18,'square'],[440,140,0.18,'square'],[330,280,0.18,'square'],[523,400,0.4,'sine']],  // Frog — ribbit-like staccato
    '🍀': [[523,0,0.25,'sine'],[622,150,0.25,'sine'],[698,300,0.4,'sine'],[784,480,0.5,'sine']],         // Clover — gentle Irish lilt
    '🐻': [[262,0,0.3,'triangle'],[330,180,0.3,'triangle'],[392,360,0.5,'triangle'],[330,560,0.6,'triangle']], // Bear — warm low tones
    '🐶': [[392,0,0.2,'sine'],[494,140,0.2,'sine'],[587,280,0.35,'sine'],[494,460,0.5,'sine']],          // Dog — happy wag
    '🐱': [[523,0,0.22,'sine'],[659,140,0.22,'sine'],[523,280,0.22,'sine'],[784,440,0.45,'sine']],       // Cat — curious little melody
    '🎀': [[659,0,0.2,'sine'],[784,130,0.2,'sine'],[880,260,0.3,'sine'],[988,400,0.5,'sine']],           // Bow — pretty ascending
    '🐧': [[440,0,0.18,'square'],[370,130,0.18,'square'],[440,260,0.18,'square'],[494,390,0.4,'sine']],  // Penguin — waddle march
    '🦆': [[370,0,0.2,'sawtooth'],[440,130,0.15,'sawtooth'],[370,260,0.2,'sawtooth'],[523,400,0.4,'sine']], // Duck — quacky
    '🐮': [[220,0,0.3,'triangle'],[277,200,0.3,'triangle'],[330,400,0.45,'triangle']],                   // Cow — moo-like low
    '🐷': [[330,0,0.18,'sine'],[415,130,0.18,'sine'],[370,260,0.18,'sine'],[330,390,0.35,'sine']],       // Piggy — oink squeak
    '🎾': [[587,0,0.15,'square'],[740,100,0.15,'square'],[587,200,0.15,'square'],[880,320,0.35,'sine']], // Tennis — springy bounce
    '🔮': [[494,0,0.3,'sine'],[587,180,0.3,'sine'],[740,360,0.5,'sine']],                               // Crystal — mystical shimmer
    '🍭': [[784,0,0.18,'sine'],[880,110,0.18,'sine'],[988,220,0.18,'sine'],[1047,330,0.4,'sine']],       // Lollipop — sweet ascending
    '🎲': [[440,0,0.15,'square'],[330,110,0.15,'square'],[440,220,0.15,'square'],[523,340,0.35,'sine']], // Dice — punchy random
  };

  function _playPrizeJingle(emoji) {
    const ac = _getAudio(); if (!ac) return;
    const notes = PRIZE_JINGLES[emoji] || [[523,0,0.3,'sine'],[659,200,0.3,'sine'],[784,400,0.5,'sine']];
    notes.forEach(([freq, delayMs, dur, type]) => {
      setTimeout(() => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, ac.currentTime);
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime);
        o.stop(ac.currentTime + dur + 0.05);
      }, delayMs);
    });
  }

  // ── UI ─────────────────────────────────────────────────────
  function _buildUI() {
    const ui = document.createElement('div');
    ui.id = 'claw-ui';
    ui.innerHTML = `
      <div id="claw-hud">
        <div class="claw-stat"><span class="claw-stat-label">SCORE</span><span id="claw-score">0</span></div>
        <div class="claw-stat"><span class="claw-stat-label">TRIES</span><span id="claw-tries">20</span></div>
        <button id="claw-back-btn" onclick="window.backToGameSelect()">🏠 ARCADE</button>
      </div>
      <div id="claw-prize-chart">
        <div class="claw-chart-title">🏆 PRIZE LIST</div>
        <div id="claw-chart-rows"></div>
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
          <button onclick="window._clawPlayAgain()">🔄 Play Again</button>
          <button onclick="window.backToGameSelect()">🏠 Back to Arcade</button>
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
        #claw-hud{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:16px;align-items:center;z-index:10;pointer-events:none;}
        #claw-back-btn{pointer-events:all;background:rgba(0,0,0,0.65);border:1px solid rgba(200,80,255,0.45);border-radius:8px;padding:8px 14px;color:#cc88ff;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;backdrop-filter:blur(4px);}
        #claw-back-btn:hover{background:rgba(200,80,255,0.22);border-color:rgba(200,80,255,0.9);color:#fff;}
        .claw-stat{background:rgba(0,0,0,0.65);border:1px solid rgba(200,80,255,0.45);border-radius:8px;padding:8px 22px;text-align:center;backdrop-filter:blur(4px);}
        .claw-stat-label{display:block;font-size:9px;letter-spacing:3px;color:#aa55ff;margin-bottom:2px;}
        #claw-score,#claw-tries{display:block;font-size:28px;font-weight:900;color:#fff;text-shadow:0 0 14px #cc33ff;line-height:1.1;min-width:48px;}
        #claw-prize-chart{position:fixed;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.82);border:1px solid rgba(200,80,255,0.35);border-radius:12px;padding:16px 18px;z-index:9999;pointer-events:none;backdrop-filter:blur(5px);width:340px;max-height:92vh;overflow:hidden;}
        .claw-chart-title{font-size:14px;letter-spacing:3px;color:#cc66ff;margin-bottom:12px;text-align:center;}
        .claw-chart-row{display:flex;align-items:center;gap:10px;margin-bottom:7px;font-size:14px;color:#ddd;}
        .claw-chart-emoji{font-size:22px;width:28px;text-align:center;}
        .claw-chart-label{flex:1;font-size:12px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .claw-chart-pts{font-size:14px;font-weight:700;color:#ffdd44;min-width:42px;text-align:right;}
        .claw-chart-bar{height:6px;background:rgba(255,200,50,0.20);border-radius:3px;margin-top:2px;}
        .claw-chart-bar-fill{height:6px;border-radius:3px;background:linear-gradient(90deg,#cc33ff,#ffdd44);}
        #claw-prize-toast{position:absolute;top:80px;left:50%;transform:translateX(-50%);z-index:20;pointer-events:none;text-align:center;white-space:nowrap;}
        .claw-toast{background:none;border:none;border-radius:0;padding:4px 0;color:#ffe040;font-size:30px;font-weight:900;letter-spacing:3px;text-align:center;text-shadow:0 0 20px #ffaa00,0 0 40px rgba(255,160,0,0.6);margin-bottom:4px;animation:ct-in 0.25s ease,ct-out 0.4s ease 1.8s forwards;white-space:nowrap;}
        @keyframes ct-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ct-out{from{opacity:1}to{opacity:0;transform:translateY(-10px)}}
        #claw-controls-panel{position:fixed;bottom:14px;right:14px;background:rgba(0,0,0,0.80);border:1px solid rgba(200,80,255,0.35);border-radius:10px;padding:18px 22px;z-index:9999;pointer-events:none;backdrop-filter:blur(4px);min-width:220px;}
        .claw-ctrl-title{font-size:13px;letter-spacing:3px;color:#cc66ff;margin-bottom:12px;}
        .claw-ctrl-row{font-size:13px;color:#ccc;margin-bottom:9px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
        .hl{color:#cc88ff;font-size:13px;}
        kbd{background:rgba(255,255,255,0.13);border:1px solid rgba(255,255,255,0.3);border-radius:4px;padding:3px 8px;font-size:12px;color:#fff;font-family:inherit;}
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
    _buildPrizeChart();
  }

  function _buildPrizeChart() {
    const container = document.getElementById('claw-chart-rows');
    if (!container) return;
    const maxPts = Math.max(...PRIZE_DEFS.map(d => d.pts));
    const sorted = [...PRIZE_DEFS].sort((a,b) => b.pts - a.pts);
    container.innerHTML = sorted.map(d => `
      <div class="claw-chart-row">
        <span class="claw-chart-emoji">${d.emoji}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:4px;">
            <span class="claw-chart-label">${d.label}</span>
            <span class="claw-chart-pts">${d.pts}</span>
          </div>
          <div class="claw-chart-bar">
            <div class="claw-chart-bar-fill" style="width:${Math.round(d.pts/maxPts*100)}%"></div>
          </div>
        </div>
      </div>
    `).join('');
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
    // Stop the render loop — no need to keep rendering behind the modal
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    const go  = document.getElementById('claw-gameover');
    const pts = document.getElementById('claw-go-pts');
    if (go) go.classList.remove('hidden');
    if (pts) pts.textContent = score;
    _playTone(220, 'sawtooth', 0.6, 0.2, 0.01, 0.55);
    window._clawSubmitHS = () => {
      if (!window.HS) return;
      // Clear stored PB so promptSubmit always shows (it gates on new personal best)
      localStorage.removeItem('hs-pb-claw');
      window.HS.promptSubmit('claw', score, `${score} pts`);
    };
    window._clawPlayAgain = () => {
      // Tear down and reinitialise in place
      _unbindEvents();
      _stopMoveSound();
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      if (renderer) { renderer.dispose(); renderer = null; }
      scene = null; world = null;
      prizes = []; meshBodies = [];
      clawGroup = null; clawWire = null; clawFingers = [];
      grabbed = null; clawBody = null; movingSoundNode = null;
      tries = 20; score = 0; gameState = 'idle';
      swayAngleX = 0; swayAngleZ = 0; swayVelX = 0; swayVelZ = 0;
      init();
    };
  }

  // ── Three.js ───────────────────────────────────────────────
  function _initThree() {
    canvasEl = document.getElementById('claw-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x060010);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080012, 0.046);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
    _setCameraPos();

    scene.add(new THREE.AmbientLight(0x332244, 2.2));
    const spot = new THREE.SpotLight(0xffffff, 5.0, 18, Math.PI / 4, 0.25);
    spot.position.set(0, 7, 0); scene.add(spot);

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
    world.solver.iterations = 8;
    world.defaultContactMaterial.friction = 0.38;
    world.defaultContactMaterial.restitution = 0.20;
  }

  // ── Machine ────────────────────────────────────────────────
  function _buildMachine() {
    const hw = MACHINE.w / 2, hd = MACHINE.d / 2;

    const glassMat = new THREE.MeshStandardMaterial({
      color:0x8899ff, transparent:true, opacity:0.08,
      roughness:0, metalness:0.1,
      side:THREE.DoubleSide, depthWrite:false,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color:0x1a0033, metalness:0.88, roughness:0.18 });
    const edgeMat  = new THREE.MeshStandardMaterial({ color:0xcc33ff, emissive:0xcc33ff, emissiveIntensity:0.8, metalness:0.9, roughness:0.1 });
    const floorMat = new THREE.MeshStandardMaterial({ color:0x0d0022, roughness:0.45, metalness:0.28, emissive:0x180033, emissiveIntensity:0.4 });

    // ── Lower play-area floor ──────────────────────────────
    const playFloor = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w, 0.08, MACHINE.d), floorMat);
    playFloor.position.y = PLAY_FLOOR_Y - 0.04;
    scene.add(playFloor);

    const floorBody = new C.Body({ mass:0, shape: new C.Plane() });
    floorBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
    floorBody.position.set(0, PLAY_FLOOR_Y, 0);
    world.addBody(floorBody);

    // ── Base side panels — solid walls from bottom of machine up to play floor ──
    // These fill the gap below the glass panels on all 4 sides
    const baseMat = new THREE.MeshStandardMaterial({ color:0x1a0033, metalness:0.85, roughness:0.2, emissive:0x0a0018, emissiveIntensity:0.3 });
    const baseH = PLAY_FLOOR_Y - (-MACHINE.h/2); // height from machine bottom to play floor
    const baseY = (-MACHINE.h/2) + baseH/2;
    // Front and back base panels
    [[0, baseY, hd],[0, baseY, -hd]].forEach(pos => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w, baseH, 0.06), baseMat);
      m.position.set(...pos); scene.add(m);
    });
    // Left and right base panels
    [[hw, baseY, 0],[-hw, baseY, 0]].forEach(pos => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, baseH, MACHINE.d), baseMat);
      m.position.set(...pos); scene.add(m);
    });
    // Base neon edge strips along the bottom
    const baseEdgeMat = new THREE.MeshStandardMaterial({ color:0xcc33ff, emissive:0xcc33ff, emissiveIntensity:0.6, metalness:0.9, roughness:0.1 });
    [[0,-MACHINE.h/2,hd],[0,-MACHINE.h/2,-hd]].forEach(pos => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.w, 0.06, 0.07), baseEdgeMat);
      m.position.set(...pos); scene.add(m);
    });
    [[hw,-MACHINE.h/2,0],[-hw,-MACHINE.h/2,0]].forEach(pos => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, MACHINE.d), baseEdgeMat);
      m.position.set(...pos); scene.add(m);
    });

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

    // ── Shelf side walls — solid panels on the open sides of the chute shelf ──
    // These rise from PLAY_FLOOR_Y up to SHELF_Y, enclosing the shelf pocket
    const shelfSideMat = new THREE.MeshStandardMaterial({ color:0x1a0033, metalness:0.85, roughness:0.2, emissive:0x0a0018, emissiveIntensity:0.3 });
    const shelfWallH = SHELF_Y - PLAY_FLOOR_Y;
    const shelfWallY = PLAY_FLOOR_Y + shelfWallH / 2;
    // Back wall of shelf pocket (at +Z outer wall, full shelf width)
    const shelfWallBack = new THREE.Mesh(new THREE.BoxGeometry(SHELF_W, shelfWallH, 0.06), shelfSideMat);
    shelfWallBack.position.set(hw - SHELF_W/2, shelfWallY, hd);
    scene.add(shelfWallBack);
    // Right wall of shelf pocket (at +X outer wall, full shelf depth)
    const shelfWallRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, shelfWallH, SHELF_D), shelfSideMat);
    shelfWallRight.position.set(hw, shelfWallY, hd - SHELF_D/2);
    scene.add(shelfWallRight);

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

    // Chute hole — pitch black circle flush with shelf surface (looks like a real hole)
    const chuteX = hw - 0.38, chuteZ = hd - 0.38;
    const chuteMkr = new THREE.Mesh(
      new THREE.CylinderGeometry(CHUTE_R, CHUTE_R, 0.04, 32),
      new THREE.MeshStandardMaterial({ color:0x000000, emissive:0x000000, roughness:1.0, metalness:0.0 })
    );
    chuteMkr.position.set(chuteX, SHELF_Y + 0.001, chuteZ);
    chuteMkr.renderOrder = 1;
    scene.add(chuteMkr);
    // Subtle rim light so the hole is findable in the dark
    const chuteLight = new THREE.PointLight(0xffcc00, 0.4, 1.2);
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

    // ── Neon sign with "THE CLAW" text on front face ──────────
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024; signCanvas.height = 128;
    const signCtx = signCanvas.getContext('2d');
    signCtx.fillStyle = '#ff33aa';
    signCtx.fillRect(0, 0, 1024, 128);
    // Glow pass
    signCtx.shadowColor = '#ffffff';
    signCtx.shadowBlur = 22;
    signCtx.fillStyle = '#ffffff';
    signCtx.font = 'bold 82px "Arial Black", Impact, sans-serif';
    signCtx.textAlign = 'center';
    signCtx.textBaseline = 'middle';
    signCtx.fillText('THE CLAW', 512, 66);
    // Crisp pass
    signCtx.shadowBlur = 0;
    signCtx.fillStyle = '#fff0ff';
    signCtx.fillText('THE CLAW', 512, 66);
    const signTex = new THREE.CanvasTexture(signCanvas);

    const signBodyMat = new THREE.MeshStandardMaterial({ color:0xff33aa, emissive:0xff33aa, emissiveIntensity:2.4, roughness:0.1, metalness:0.6 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.33, 0.09), signBodyMat);
    sign.position.set(0, MACHINE.h/2+0.40, MACHINE.d/2-0.05);
    scene.add(sign);
    const signFaceMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: false });
    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.33), signFaceMat);
    signFace.position.set(0, MACHINE.h/2+0.40, MACHINE.d/2-0.05 + 0.051);
    scene.add(signFace);
    const sl = new THREE.PointLight(0xff33aa, 2.8, 5);
    sl.position.set(0, MACHINE.h/2+0.40, MACHINE.d/2-0.05);
    scene.add(sl);

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
    swayAngleX = 0; swayAngleZ = 0; swayVelX = 0; swayVelZ = 0;
    gameState = 'idle';
    if (clawGroup) _updateClawPose();
  }

  function _updateClawPose() {
    if (!clawGroup) return;

    const hubY = CLAW_REST_Y - dropY;
    clawGroup.position.set(clawX, hubY, clawZ);

    // Apply pendulum sway as a rotation of the whole clawGroup
    // Sway rotates around the rail attachment point (top of cable)
    // We tilt the group: positive swayAngleX tilts in +X, positive swayAngleZ tilts in +Z
    clawGroup.rotation.x = swayAngleZ;   // Z sway tilts around X axis
    clawGroup.rotation.z = -swayAngleX;  // X sway tilts around Z axis

    // Cable stretches from rail to hub (with sway the visual length stays constant)
    const wireLen = Math.max(0.04, RAIL_Y - hubY);
    clawWire.scale.y = wireLen;
    clawWire.position.y = wireLen / 2;

    // Physics body tracks hub (no sway on physics body — keep collision clean)
    clawBody.position.set(clawX, hubY - 0.40, clawZ);

    const OPEN_ANGLE   =  0.85;
    const CLOSED_ANGLE = -0.50;
    const angle = OPEN_ANGLE + (CLOSED_ANGLE - OPEN_ANGLE) * (1.0 - clawOpen);

    clawFingers.forEach(({ pivot }) => {
      const rX = pivot.userData.radX;
      const rZ = pivot.userData.radZ;
      pivot.rotation.x =  rZ * angle;
      pivot.rotation.z = -rX * angle;
    });
  }

  // ── Prizes ─────────────────────────────────────────────────
  function _spawnPrizes() {
    for (let i = 0; i < 46; i++) _spawnOnePrize(PRIZE_DEFS[i % PRIZE_DEFS.length]);
  }

  function _spawnOnePrize(def) {
    const hw = MACHINE.w/2 - 0.42;
    const hd = MACHINE.d/2 - 0.42;
    // Keep prizes fully clear of the shelf + chute area (+X,+Z corner)
    // Shelf occupies x > hw-SHELF_W and z > hd-SHELF_D
    let x, z, attempts = 0;
    do {
      x = (Math.random()-0.5) * hw * 2;
      z = (Math.random()-0.5) * hd * 2;
      attempts++;
    } while (attempts < 50 && (x > hw - SHELF_W - 0.1 && z > hd - SHELF_D - 0.1));

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

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 14, 14), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    // Emoji billboard — child of mesh, faces camera each frame via lookAt in _animateScene
    const emojiTex = _makeEmojiTexture(def.emoji);
    const emojiPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(def.radius * 1.85, def.radius * 1.85),
      new THREE.MeshBasicMaterial({ map:emojiTex, transparent:true, side:THREE.DoubleSide, depthWrite:false })
    );
    emojiPlane.renderOrder = 3;
    mesh.add(emojiPlane);

    // Glow halo
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius * 1.30, 8, 8),
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
    _dropChanceChecked = false;
    _grabAttempted = false;
    _deliveryDropRoll = false;
    _deliveryDropFired = false;
    // Roll instant-miss (20%) — claw opens immediately on contact, no grab
    _instantMissRoll = (Math.random() < 0.20);
    // Randomise the height at which a grabbed ball is dropped (5%–95% of retraction)
    _dropChanceThreshold = 0.05 + Math.random() * 0.90;
    // Give the cable a little downward-kick sway when dropping
    swayVelX += (Math.random() - 0.5) * 0.18;
    swayVelZ += (Math.random() - 0.5) * 0.18;
    _playDrop();
    _playTone(440, 'square', 0.10, 0.04, 0.01, 0.08);
  }

  // ── Game loop ──────────────────────────────────────────────
  function _loop() {
    animId = requestAnimationFrame(_loop);
    if (!renderer || !scene || !camera) return;
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
    _updateSway(dt);
    _handleDrop(dt);
    _syncPhysics(dt);
    _checkScoringZone();
    _animateScene(now);
    renderer.render(scene, camera);
  }

  // ── Pendulum sway physics ──────────────────────────────────
  function _updateSway(dt) {
    // Spring-damper pendulum
    // The cable hangs from the rail; sway angle is the displacement from vertical.
    // Spring pulls back toward zero, damping bleeds energy each frame.
    swayVelX += -SWAY_SPRING * swayAngleX * dt;
    swayVelZ += -SWAY_SPRING * swayAngleZ * dt;
    swayVelX *= Math.pow(SWAY_DAMPING, dt * 60);
    swayVelZ *= Math.pow(SWAY_DAMPING, dt * 60);
    swayAngleX += swayVelX * dt;
    swayAngleZ += swayVelZ * dt;
    // Clamp to avoid wild oscillations
    const MAX_SWAY = 0.38;
    swayAngleX = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, swayAngleX));
    swayAngleZ = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, swayAngleZ));
    // When idle just moving the claw, keep calling _updateClawPose so sway is visible
    _updateClawPose();
  }

  let _lastMoveX = 0, _lastMoveZ = 0; // track previous movement direction

  function _handleMovement(dt) {
    if (gameState !== 'idle' && gameState !== 'swaying') return;
    if (gameState === 'swaying') return; // sway state handles itself

    const speed = 1.55;
    const hw = MACHINE.w/2 - 0.22;
    const hd = MACHINE.d/2 - 0.22;

    // Camera-relative movement
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
      const vx = (mx/len) * speed;
      const vz = (mz/len) * speed;
      clawX += vx * dt;
      clawZ += vz * dt;
      clawX = Math.max(-hw, Math.min(hw, clawX));
      clawZ = Math.max(-hd, Math.min(hd, clawZ));
      // Direction change detection — big sway kick when reversing
      const dot = _lastMoveX * (mx/len) + _lastMoveZ * (mz/len);
      if (wasMoving && dot < -0.3) {
        // Sharp direction reversal — extra impulse
        swayVelX -= vx * 2.2 * dt;
        swayVelZ -= vz * 2.2 * dt;
      }
      // Normal movement trailing sway
      swayVelX -= vx * SWAY_DRIVE * dt;
      swayVelZ -= vz * SWAY_DRIVE * dt;
      _lastMoveX = mx/len; _lastMoveZ = mz/len;
      if (!wasMoving) _startMoveSound();
    } else {
      if (wasMoving) _stopMoveSound();
      _lastMoveX = 0; _lastMoveZ = 0;
    }
    wasMoving = isMoving;
  }

  function _handleDrop(dt) {
    if (gameState === 'dropping') {
      const maxDrop = CLAW_REST_Y - DROP_BOTTOM;
      dropY = Math.min(dropY + dt * 1.8, maxDrop);
      _updateClawPose();
      if (dropY >= maxDrop) {
        gameState = 'grabbing';
        dropTimer = 0;
        // Kick sway slightly on impact
        swayVelX += (Math.random() - 0.5) * 0.12;
        swayVelZ += (Math.random() - 0.5) * 0.12;
      }
    }

    else if (gameState === 'grabbing') {
      dropTimer += dt;

      if (!grabbed && !_grabAttempted) {
        _grabAttempted = true;
        grabbed = _tryGrab();
        if (grabbed) {
          if (_instantMissRoll) {
            // 40% instant miss — claw touches but doesn't hold
            grabbed.body.velocity.set((Math.random()-0.5)*2.0, Math.random()*1.5, (Math.random()-0.5)*2.0);
            grabbed.body.type = C.Body.DYNAMIC;
            grabbed.body.wakeUp();
            grabbed.grabbed = false;
            grabbed = null;
            clawOpen = 0.0;   // closes briefly then reopens during retract
            _showToast('😬 Slipped off!');
            _playMiss();
            // kick sway
            swayVelX += (Math.random() - 0.5) * 0.20;
            swayVelZ += (Math.random() - 0.5) * 0.20;
          } else {
            _playClawClose();
          }
        }
      } else {
        clawOpen = Math.max(0, clawOpen - dt * 2.8);
      }
      _updateClawPose();

      if (dropTimer >= 0.70) {
        if (!grabbed) {
          clawOpen = 0.0;
          if (!_instantMissRoll) _playMiss();
        }
        gameState = 'retracting';
        dropTimer = 0;
      }
    }

    else if (gameState === 'retracting') {
      dropY = Math.max(0, dropY - dt * 2.0);
      _updateClawPose();

      if (grabbed) {
        const maxDrop = CLAW_REST_Y - DROP_BOTTOM;
        // 70% chance to drop — checked once when retraction passes the random threshold
        if (!_dropChanceChecked && dropY < maxDrop * _dropChanceThreshold) {
          _dropChanceChecked = true;
          if (Math.random() < 0.40) {
            grabbed.body.type = C.Body.DYNAMIC;
            grabbed.body.velocity.set((Math.random()-0.5)*2.0, -1.5 - Math.random(), (Math.random()-0.5)*2.0);
            grabbed.body.wakeUp();
            grabbed.grabbed = false;
            grabbed = null;
            clawOpen = 1.0;
            _showToast('💨 Dropped it!');
            _playMiss();
            // sway from the sudden release
            swayVelX += (Math.random() - 0.5) * 0.25;
            swayVelZ += (Math.random() - 0.5) * 0.25;
          }
        }

        if (grabbed) {
          const hubY = CLAW_REST_Y - dropY;
          const tipY = hubY - 0.68;
          // Ball swings with claw sway — offset by sway angles scaled by wire length
          const swayOffX = swayAngleX * (RAIL_Y - hubY);
          const swayOffZ = swayAngleZ * (RAIL_Y - hubY);
          grabbed.mesh.position.set(clawX + swayOffX, tipY, clawZ + swayOffZ);
          grabbed.body.position.set(clawX + swayOffX, tipY, clawZ + swayOffZ);
          grabbed.body.velocity.set(0,0,0);
          grabbed.body.angularVelocity.set(0,0,0);
        }
      }

      if (dropY <= 0) {
        _dropChanceChecked = false;
        if (grabbed) {
          // Reached top with ball — enter dramatic sway pause before delivering
          gameState = 'swaying';
          dropTimer = 0;
          // Big sway kick to simulate the inertia of the ball swinging
          swayVelX += (Math.random() - 0.5) * 0.9;
          swayVelZ += (Math.random() - 0.5) * 0.9;
          _playTone(660, 'triangle', 0.18, 0.15, 0.01, 0.15);
        } else {
          clawOpen = 1.0;
          _updateClawPose();
          // Return to centre after miss or drop
          gameState = 'returning';
          dropTimer = 0;
        }
      }
    }

    else if (gameState === 'swaying') {
      dropTimer += dt;
      // Ball swings with claw sway during the pause
      if (grabbed) {
        const hubY = CLAW_REST_Y;
        const tipY = hubY - 0.68;
        const swayOffX = swayAngleX * (RAIL_Y - hubY);
        const swayOffZ = swayAngleZ * (RAIL_Y - hubY);
        grabbed.mesh.position.set(clawX + swayOffX, tipY, clawZ + swayOffZ);
        grabbed.body.position.set(clawX + swayOffX, tipY, clawZ + swayOffZ);
        grabbed.body.velocity.set(0,0,0);
        grabbed.body.angularVelocity.set(0,0,0);
      }
      // Add extra sway pumps at 0.6s and 1.2s for that pendulum drama
      if (dropTimer > 0.58 && dropTimer < 0.62) {
        swayVelX += (Math.random() - 0.5) * 0.5;
        swayVelZ += (Math.random() - 0.5) * 0.5;
      }
      if (dropTimer > 1.18 && dropTimer < 1.22) {
        swayVelX += (Math.random() - 0.5) * 0.3;
        swayVelZ += (Math.random() - 0.5) * 0.3;
      }
      // After 2 seconds, move to delivering
      if (dropTimer >= 2.0) {
        gameState = 'delivering';
        dropTimer = 0;
        // Record start position so we can find the halfway point during delivery
        _deliverStartX = clawX;
        _deliverStartZ = clawZ;
        // Roll 30% chance to drop at the halfway point during delivery
        _deliveryDropRoll = (Math.random() < 0.30);
        _deliveryDropFired = false;
      }
    }

    else if (gameState === 'delivering') {
      const tx = MACHINE.w/2 - 0.38, tz = MACHINE.d/2 - 0.38;
      const dx = tx - clawX, dz = tz - clawZ;
      const dist = Math.sqrt(dx*dx + dz*dz);
      const spd = 1.4;

      // 30% chance to drop ball at the halfway point between pickup and chute
      if (_deliveryDropRoll && !_deliveryDropFired && grabbed) {
        const totalDX = tx - _deliverStartX, totalDZ = tz - _deliverStartZ;
        const totalDist = Math.sqrt(totalDX*totalDX + totalDZ*totalDZ);
        const travelledDX = clawX - _deliverStartX, travelledDZ = clawZ - _deliverStartZ;
        const travelled = Math.sqrt(travelledDX*travelledDX + travelledDZ*travelledDZ);
        if (totalDist > 0.01 && travelled >= totalDist * 0.5) {
          _deliveryDropFired = true;
          grabbed.body.type = C.Body.DYNAMIC;
          grabbed.body.velocity.set((Math.random()-0.5)*1.5, -2.0, (Math.random()-0.5)*1.5);
          grabbed.body.wakeUp();
          grabbed.grabbed = false;
          grabbed = null;
          clawOpen = 1.0;
          _updateClawPose();
          _showToast('💨 So close!');
          _playMiss();
          swayVelX += (Math.random() - 0.5) * 0.3;
          swayVelZ += (Math.random() - 0.5) * 0.3;
        }
      }

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
        const hubY = CLAW_REST_Y;
        const tipY = hubY - 0.68;
        const swayOffX = swayAngleX * (RAIL_Y - hubY);
        const swayOffZ = swayAngleZ * (RAIL_Y - hubY);
        grabbed.mesh.position.set(clawX + swayOffX, tipY, clawZ + swayOffZ);
        grabbed.body.position.set(clawX + swayOffX, tipY, clawZ + swayOffZ);
        grabbed.body.velocity.set(0,0,0);
        grabbed.body.angularVelocity.set(0,0,0);
      }
    }

    else if (gameState === 'releasing') {
      dropTimer += dt;
      clawOpen = Math.min(1.0, dropTimer * 3.0);
      _updateClawPose();
      if (grabbed && dropTimer > 0.22) {
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
        // Gentle sway impulse while sliding back
        swayVelX -= (dx/dist) * SWAY_DRIVE * dt * 0.4;
        swayVelZ -= (dz/dist) * SWAY_DRIVE * dt * 0.4;
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
    const tipY  = (CLAW_REST_Y - dropY) - 0.68;
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
      // Mark as grabbed — caller decides whether to keep or instant-miss
      best.grabbed = true;
      best.body.type = C.Body.KINEMATIC;
      best.body.velocity.set(0,0,0);
      return best;
    }

    // Nudge nearby balls on complete miss
    prizes.forEach(p => {
      if (p.grabbed || p.scored) return;
      const dx = p.mesh.position.x - tipX;
      const dz = p.mesh.position.z - tipZ;
      if (Math.sqrt(dx*dx + dz*dz) < 0.85)
        p.body.velocity.set((Math.random()-0.5)*2.2, Math.random()*1.8, (Math.random()-0.5)*2.2);
    });
    return null;
  }

  // drop/grab chance state
  let _dropChanceChecked = false;
  let _dropChanceThreshold = 0;   // random retraction height at which to drop (0–1 of maxDrop)
  let _instantMissRoll = false;    // whether this grab attempt is an instant-miss
  let _grabAttempted = false;      // true once _tryGrab has been called this drop cycle
  // mid-delivery drop state
  let _deliverStartX = 0, _deliverStartZ = 0;
  let _deliveryDropRoll = false;   // whether this delivery will drop at halfway
  let _deliveryDropFired = false;  // true once the halfway drop has triggered

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
        _playPrizeJingle(p.def.emoji);
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
        const intensity = 0.16 + 0.13 * Math.sin(now * 0.0017 + p.mesh.position.x * 3.2);
        p.mesh.material.emissiveIntensity = intensity;
      }
    });
  }

  return { init, destroy };
})();
