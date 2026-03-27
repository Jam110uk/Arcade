// ============================================================
// BUST-A-MOVE 3D  —  pb3d.js
// Three.js r128 · Orthographic front-on camera (identical view to pb.js)
// — Bubbles 2× size, half the columns per row
// — Real glass-bubble material (transparent sphere + specular)
// — Power-up bubbles: 🔥 Fire, 💧 Water, ⚡ Lightning, ⭐ Star
//   Power-up emoji rendered as canvas texture "inside" the bubble
// — Never-ending: levels keep going, colours introduced gradually
// — LVL progress meter: pop quota to advance
// — Drop meter reveals new rows (including power-ups)
// ============================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export default (() => {

  // ── SFX ──────────────────────────────────────────────────────
  const SFX = (() => {
    let ctx = null;
    function gc() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    // Soft sine tone with slow attack and long tail
    function tone(f, d, vol=0.12, fEnd=null, delay=0, type='sine') {
      try {
        const c=gc(), o=c.createOscillator(), g=c.createGain();
        o.connect(g); g.connect(c.destination); o.type=type;
        const t=c.currentTime+delay;
        o.frequency.setValueAtTime(f,t);
        if(fEnd!=null) o.frequency.exponentialRampToValueAtTime(fEnd,t+d);
        // Gentle ADSR: soft attack, no click, smooth release
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(vol, t+Math.min(0.04,d*0.2));
        g.gain.setValueAtTime(vol, t+d*0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t+d);
        o.start(t); o.stop(t+d+0.05);
      } catch(_) {}
    }

    // Two-sine chord for warmth
    function chord(f1, f2, d, vol=0.09, delay=0) {
      tone(f1, d, vol, null, delay, 'sine');
      tone(f2, d, vol*0.7, null, delay, 'sine');
    }

    // Soft filtered noise burst
    // Pre-allocated noise buffer — created once at max duration, reused every call.
    // Previously allocated a fresh PCM buffer on every bounce/land/pop, causing GC
    // pressure and brief CPU spikes on rapid pops.
    const NOISE_MAX_DUR = 0.3; // seconds — covers all softNoise() call-sites
    let _noiseBuf = null;
    function _ensureNoiseBuf() {
      if (_noiseBuf) return;
      const c = gc();
      _noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * NOISE_MAX_DUR), c.sampleRate);
      const data = _noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    function softNoise(d, vol=0.06, delay=0) {
      try {
        const c=gc();
        _ensureNoiseBuf();
        const src=c.createBufferSource();
        src.buffer=_noiseBuf; // reuse pre-filled buffer; no createBuffer() per call
        const filt=c.createBiquadFilter();
        filt.type='bandpass'; filt.frequency.value=800; filt.Q.value=0.8;
        const g=c.createGain();
        src.connect(filt); filt.connect(g); g.connect(c.destination);
        const t=c.currentTime+delay;
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(vol,t+0.01);
        g.gain.exponentialRampToValueAtTime(0.0001,t+d);
        src.start(t); src.stop(t+d+0.05);
      } catch(_) {}
    }

    return {
      // Shoot — soft rising bubble "bloop"
      shoot() {
        tone(320, 0.18, 0.10, 520);
        tone(640, 0.12, 0.05, 800, 0.02);
      },

      // Wall bounce — gentle thud
      bounce() {
        tone(220, 0.14, 0.08, 180);
        softNoise(0.08, 0.04);
      },

      // Land — soft click with warm thud
      land() {
        tone(280, 0.12, 0.09, 240);
        softNoise(0.06, 0.03);
      },

      // Pop — pleasant bubble burst, pitch rises with count
      pop(n) {
        const f = 480 + Math.min(n,8)*35;
        chord(f, f*1.26, 0.22, 0.10);
        softNoise(0.10, 0.05, 0.02);
      },

      // Floaters — cascading falling drops
      floaters(n) {
        for(let i=0;i<Math.min(n,6);i++) {
          tone(520-i*45, 0.20, 0.08, 340-i*30, i*0.055);
        }
      },

      // Chain — warm ascending arpeggio
      chain(n) {
        const notes=[440,554,659,784,988];
        for(let i=0;i<Math.min(n,5);i++) {
          chord(notes[i], notes[i]*1.5, 0.22, 0.09, i*0.09);
        }
      },

      // Level up — bright warm fanfare
      levelUp() {
        [523,659,784,988,1175].forEach((f,i)=>chord(f,f*1.26,0.28,0.10,i*0.11));
        setTimeout(()=>tone(1319,0.6,0.10,1047),620);
      },

      // Game over — gentle descending chord sequence
      gameOver() {
        [440,370,311,262].forEach((f,i)=>chord(f,f*0.75,0.35,0.09,i*0.22));
      },

      // Power — fire: warm crackling sizzle
      powerFire() {
        tone(660, 0.30, 0.10, 220);
        softNoise(0.25, 0.08);
        tone(440, 0.20, 0.07, 330, 0.05);
      },

      // Power — lightning: sharp zap with tail
      powerLightning() {
        softNoise(0.06, 0.12);
        tone(1100, 0.18, 0.09, 180, 0.02);
        tone(880, 0.25, 0.07, 220, 0.08);
      },

      // Power — star: sparkling arpeggio
      powerStar() {
        [784,988,1175,1480,1760].forEach((f,i)=>chord(f,f*1.26,0.20,0.08,i*0.07));
      },

      resume() { if(ctx&&ctx.state==='suspended') ctx.resume().catch(()=>{}); },
    };
  })();

  // ── Palette — all possible bubble colours ─────────────────────
  // Introduced one at a time as levels climb.
  // Level 1→2 colours, each subsequent level adds another up to max 7.
  const ALL_COLORS = [
    { hex: 0xff2d78, css: '#ff2d78', name: 'PINK'   },
    { hex: 0x00f5ff, css: '#00f5ff', name: 'CYAN'   },
    { hex: 0x39ff14, css: '#39ff14', name: 'GREEN'  },
    { hex: 0xffe600, css: '#ffe600', name: 'GOLD'   },
    { hex: 0xbf00ff, css: '#bf00ff', name: 'VIOLET' },
    { hex: 0xff6a00, css: '#ff6a00', name: 'ORANGE' },
    { hex: 0x00aaff, css: '#00aaff', name: 'BLUE'   },
  ];

  // How many colours are active at this level (min 2, +1 every 2 levels, max 7)
  function numColorsForLevel(lvl) {
    return Math.min(2 + Math.floor((lvl - 1) / 2), ALL_COLORS.length);
  }

  // ── Power-up definitions ──────────────────────────────────────
  const POWERS = {
    fire:      { emoji: '🔥', label: 'FIRE',      desc: 'Blasts nearby bubbles'    },
    lightning: { emoji: '⚡', label: 'LIGHTNING', desc: 'Clears entire row'         },
    star:      { emoji: '⭐', label: 'STAR',      desc: 'Clears all of that colour' },
  };
  const POWER_KEYS   = Object.keys(POWERS);
  const POWER_CHANCE = 0.08;   // overall chance a bubble is a power-up

  // Weighted power selection — lightning is rare (~5%), fire and star share the rest
  function _pickPower() {
    const r = Math.random();
    if (r < 0.05)  return 'lightning';  // 5%
    if (r < 0.525) return 'fire';       // 47.5%
    return 'star';                       // 47.5%
  }

  // ── Geometry constants ────────────────────────────────────────
  // 2× size vs original pb.js (was R=13)
  const R           = 26;
  const D           = R * 2;
  const ROW_H       = R * Math.sqrt(3);
  const SHOOT_SPEED = 28;
  const MAX_BOUNCES = 30;
  const DROP_SECS_BASE = 55;  // starting drop interval
  const DROP_SECS_MIN  = 18;  // fastest it ever gets (level ~20+)
  // Drop interval decreases by ~1.8s per level, floored at minimum
  function _dropSecs() { return Math.max(DROP_SECS_MIN, DROP_SECS_BASE - (level - 1) * 1.8); }
  const CEILING_PAD = 8;
  const CANNON_PAD  = 36;
  const CLEAR_ROWS  = 3;

  // Play area fills the full canvas width edge-to-edge
  // Even rows: N bubbles of diameter D fill exactly N*D pixels → start at 0+R
  // Odd rows: offset by R (half bubble), so N-1 bubbles fit
  function colsEven()    { return Math.floor(W / D); }
  function colsOdd()     { return Math.floor((W - R) / D); }
  function colsForRow(r) { return r % 2 === 0 ? colsEven() : colsOdd(); }

  // Bubble centres packed wall-to-wall, edge bubbles touch the walls
  function cellXY(row, col) {
    const xOff = row % 2 === 1 ? R : 0;   // odd rows shifted right by R
    return {
      x: R + xOff + col * D,
      y: CEILING_PAD + row * ROW_H + R,
    };
  }
  function cannonX()      { return W / 2; }
  function cannonCY()     { return H - CANNON_PAD - R; }   // canvas Y

  // Canvas → Three.js world (orthographic, Y-up, same pixel scale)
  // tw()   — always allocates a new Vector3 (use for stored positions)
  // twTo() — writes into a provided Vector3 (use for transient/hot-path copies)
  function tw(cx, cy)    { return new THREE.Vector3(cx, H - cy, 0); }
  const _twVec = new THREE.Vector3();
  function twTo(cx, cy, v) { v.set(cx, H - cy, 0); return v; }

  // ── Three.js state ────────────────────────────────────────────
  let renderer, scene, camera;
  let animId = null, container = null, _resizeObs = null;
  let W = 360, H = 600;

  let cannonGroup = null, cannonBarrel = null;
  let aimLineMesh = null;
  let bgObjs = [];

  // Bubble mesh pool
  let gridMeshes = []; // { mesh, row, col, ci, power }
  let ball        = null; // { mesh, x, y, vx, vy, ci, power, bounces, trail:[] }
  let trailPool   = []; // legacy — kept for cleanup
  let _trailMeshPool = null; // pre-built reusable trail meshes
  let popParticles = []; // { mesh, x, y, vx, vy, gravity, alpha, scale, isFloater }
  let scoreSprites = []; // { mesh, life, maxLife }

  // Pre-built canvas textures for power-up emoji (keyed by power key)
  const _emojiTexCache = {};

  // Material/geo cache
  const _matCache  = {};
  const _geoCache  = {};

  function sphereGeo(r) {
    const k = Math.round(r);
    if (!_geoCache[k]) _geoCache[k] = new THREE.SphereGeometry(r, 10, 8);
    return _geoCache[k];
  }

  // ── Shared material cache — never clone, always reuse ─────────
  // Keyed strings: 'shell_0', 'inner_0', 'spec', 'spec2', 'clear_shell', 'clear_rim'
  const _sharedMats = {};

  // Shell and inner are per-instance — opacity is mutated per-bubble during animations
  function _shellMat(ci) {
    return new THREE.MeshLambertMaterial({
      color: ALL_COLORS[ci].hex, emissive: ALL_COLORS[ci].hex,
      emissiveIntensity: 0.12,
      transparent: true, opacity: 0.55, side: THREE.FrontSide,
    });
  }
  function _innerMat(ci) {
    return new THREE.MeshLambertMaterial({
      color: ALL_COLORS[ci].hex, emissive: ALL_COLORS[ci].hex,
      emissiveIntensity: 0.50,
      transparent: true, opacity: 0.72,
    });
  }
  function _clearShellMat() {
    return new THREE.MeshLambertMaterial({
      color:0xffffff, emissive:0x223355, emissiveIntensity:0.12,
      transparent:true, opacity:0.30, side:THREE.FrontSide,
    });
  }
  // Specular blobs and rim are truly static — safe to share
  function _specMat()  {
    if (!_sharedMats.spec)  _sharedMats.spec  = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.55 });
    return _sharedMats.spec;
  }
  function _spec2Mat() {
    if (!_sharedMats.spec2) _sharedMats.spec2 = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.35 });
    return _sharedMats.spec2;
  }
  function _clearRimMat() {
    if (!_sharedMats.clearRim) _sharedMats.clearRim = new THREE.MeshBasicMaterial({ color:0x00f5ff, transparent:true, opacity:0.18, side:THREE.BackSide });
    return _sharedMats.clearRim;
  }

  // ── Game state ────────────────────────────────────────────────
  let grid        = []; // grid[row][col] = { ci, power } | null
  let ball_ci     = -1; // colour index of the queued ball (for cannon bubble)
  let ball_power  = null;
  let queue       = []; // [{ ci, power }, ...]
  let heldSlot    = null; // { ci, power } | null
  let canSwap     = true;
  let cannonAngle = -Math.PI / 2;
  let score = 0, best = 0, level = 1;
  let chain = 0, chainTimer = 0;
  let paused = false, dead = false;
  let dropTimer     = DROP_SECS_BASE * 1000;
  let elapsedMs     = 0;
  let lastTs        = 0;
  let _aimDirty     = true, _aimLastAngle = null, _aimPts = null;
  // Pre-allocated aim line buffer — updated in-place to avoid per-frame GC
  const AIM_MAX_PTS = 512;
  let _aimPositionsBuf = null; // Float32Array, lazy-init
  // Flat bubble list for aim collision — rebuilt only when the grid changes,
  // not on every simulation step. Avoids the O(grid²) nested row×col scan
  // that ran on every mousemove frame.
  let _aimBubbleList = []; // [{x, y}] world-space centres of occupied cells

  let leftHeld = false, rightHeld = false;
  const AIM_SPEED = 0.035;

  // ── Material builders ─────────────────────────────────────────
  // Real glass bubble:
  //   outer shell — transparent MeshPhongMaterial with high shininess
  //   inner glow   — small opaque sphere slightly inset
  //   emoji sprite — canvas texture Sprite sitting just inside
  function _buildBubbleMesh(ci, power) {
    const isColorless = ci === -1;
    const group = new THREE.Group();

    if (isColorless) {
      group.add(new THREE.Mesh(sphereGeo(R), _clearShellMat()));
      group.add(new THREE.Mesh(sphereGeo(R*1.04), _clearRimMat()));
    } else {
      group.add(new THREE.Mesh(sphereGeo(R),        _shellMat(ci)));
      group.add(new THREE.Mesh(sphereGeo(R * 0.72), _innerMat(ci)));
      const spec = new THREE.Mesh(sphereGeo(R * 0.22), _specMat());
      spec.position.set(-R*0.32, R*0.34, R*0.55);
      group.add(spec);
      const spec2 = new THREE.Mesh(sphereGeo(R * 0.10), _spec2Mat());
      spec2.position.set(-R*0.12, R*0.52, R*0.45);
      group.add(spec2);
      if (power) {
        const col = ALL_COLORS[ci];
        const tex = _getEmojiTex(power, col.hex);
        // SpriteMaterial must be per-instance (opacity can differ per power bubble shimmer)
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthTest: false }));
        sprite.scale.set(R*1.1, R*1.1, 1);
        sprite.position.set(0, 0, R*0.15);
        group.add(sprite);
        group.userData.shimmerSprite = sprite;  // cache for O(1) shimmer access
      }
    }

    if (isColorless && power) {
      const tex = _getEmojiTex(power, 0xffffff);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1.0, depthTest: false }));
      sprite.scale.set(R*1.4, R*1.4, 1);
      sprite.position.set(0, 0, R*0.2);
      group.add(sprite);
      group.userData.shimmerSprite = sprite;  // cache for O(1) shimmer access
    }

    group.userData = { ci, power };
    return group;
  }

  function _getEmojiTex(powerKey, colorHex) {
    if (_emojiTexCache[powerKey]) return _emojiTexCache[powerKey];
    const sz = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = sz;
    const c = cv.getContext('2d');
    // Soft glow circle
    const grd = c.createRadialGradient(sz/2, sz/2, sz*0.05, sz/2, sz/2, sz*0.48);
    const css = '#' + colorHex.toString(16).padStart(6,'0');
    grd.addColorStop(0, css + 'aa');
    grd.addColorStop(1, css + '00');
    c.fillStyle = grd;
    c.fillRect(0, 0, sz, sz);
    // Emoji
    c.font = `${sz * 0.52}px serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(POWERS[powerKey].emoji, sz/2, sz/2 + 3);
    const tex = new THREE.CanvasTexture(cv);
    _emojiTexCache[powerKey] = tex;
    return tex;
  }

  // ── Grid helpers ──────────────────────────────────────────────
  function _placeMesh(grp, row, col) {
    const cv = cellXY(row, col);
    grp.position.copy(tw(cv.x, cv.y));
    grp.position.z = 0;
  }

  // (rotation removed — power-up bubbles use shimmer sprites instead)

  function _getColorsInGrid() {
    const s = new Set();
    for (const row of grid) for (const b of (row||[])) if (b) s.add(b.ci);
    return [...s];
  }

  function _countBubbles() {
    let n = 0;
    for (const row of grid) for (const b of (row||[])) if (b) n++;
    return n;
  }

  function _activePalette() {
    // Only colours currently in the active level pool
    const n = numColorsForLevel(level);
    return Array.from({ length: n }, (_, i) => i);
  }

  // ── Level generation ──────────────────────────────────────────
  function generateLevel() {
    gridMeshes.forEach(bm => scene.remove(bm.mesh));
    gridMeshes = [];
    grid = [];

    const pal   = _activePalette();
    // Rows: start shallow, grow as levels increase
    const rows  = Math.min(3 + Math.floor(level * 0.6), 8);
    // Start each level with 2–4 power-up bubbles mixed in
    const powerBudget = Math.min(2 + Math.floor(level * 0.3), 6);
    let powersPlaced  = 0;

    for (let r = 0; r < rows; r++) {
      const cols = colsForRow(r);
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        const ci    = pal[Math.floor(Math.random() * pal.length)];
        const wantPower = powersPlaced < powerBudget && Math.random() < 0.12;
        const power = wantPower ? _pickPower() : null;
        if (power) powersPlaced++;
        const mesh = _buildBubbleMesh(ci, power);
        _placeMesh(mesh, r, c);
        scene.add(mesh);
        grid[r][c] = { ci, power };
        gridMeshes.push({ mesh, row: r, col: c, ci, power });
      }
    }
    _ensurePlayable(pal);
    _invalidateAim();
  }

  function _ensurePlayable(pal) {
    // Each colour must appear ≥2 times so the board is solvable
    const counts = {};
    for (const row of grid) for (const b of (row||[])) if (b) counts[b.ci] = (counts[b.ci]||0)+1;
    for (const ci of pal) {
      if ((counts[ci]||0) >= 2) continue;
      let placed = 0;
      outer: for (let r = grid.length-1; r >= 0; r--) {
        for (let c = 0; c < (grid[r]||[]).length; c++) {
          if (grid[r][c] && !grid[r][c].power && placed < 2) {
            grid[r][c].ci = ci;
            const bm = gridMeshes.find(x=>x.row===r&&x.col===c);
            if (bm) {
              bm.ci = ci;
              scene.remove(bm.mesh);
              const nm = _buildBubbleMesh(ci, null);
              _placeMesh(nm, r, c);
              scene.add(nm);
              bm.mesh = nm;
            }
            placed++;
          }
          if (placed >= 2) break outer;
        }
      }
    }
  }

  // New row dropped from top — can contain power-ups
  function _buildNewTopRow() {
    const pal  = _getColorsInGrid().length ? _getColorsInGrid() : _activePalette();
    const cols = colsForRow(0);
    const row  = [];
    for (let c = 0; c < cols; c++) {
      const ci    = pal[Math.floor(Math.random() * pal.length)];
      const power = Math.random() < POWER_CHANCE ? _pickPower() : null;
      row.push({ ci, power });
    }
    return row;
  }

  // ── Queue ─────────────────────────────────────────────────────
  function _makeSlot() {
    const power = Math.random() < POWER_CHANCE
      ? _pickPower()
      : null;
    if (power) {
      // Player power-ups are colourless — ci=-1, clear bubble with just emoji
      return { ci: -1, power };
    }
    const pal = _getColorsInGrid().length ? _getColorsInGrid() : _activePalette();
    const ci  = pal[Math.floor(Math.random() * pal.length)];
    return { ci, power: null };
  }

  function refillQueue() {
    while (queue.length < 2) queue.push(_makeSlot());
    _updateQueueUI();
    _syncCannonBubble();
  }

  function consumeQueue() {
    const s = queue.shift(); refillQueue(); return s;
  }

  function _syncCannonColor(slot) {
    if (!cannonGroup || !slot) return;
    // Power-up = cyan glow, normal = bubble's colour
    const col = (slot.ci >= 0 && !slot.power) ? ALL_COLORS[slot.ci].hex : 0x00f5ff;
    const applyColor = mesh => {
      if (!mesh || !mesh.material) return;
      mesh.material.color.setHex(col);
      mesh.material.emissive.setHex(col);
    };
    applyColor(cannonGroup.getObjectByName('cannonRing'));
    applyColor(cannonBarrel && cannonBarrel.getObjectByName('cannonMuzzle'));
  }

  function _syncCannonBubble() {
    if (!cannonGroup || !queue[0]) return;
    const old = cannonGroup.getObjectByName('cannonBubble');
    // Skip expensive rebuild if the bubble identity hasn't changed
    if (old && old.userData.ci === queue[0].ci && old.userData.power === queue[0].power) {
      _syncCannonColor(queue[0]); return;
    }
    if (old) cannonGroup.remove(old);
    const cb = _buildBubbleMesh(queue[0].ci, queue[0].power);
    cb.name = 'cannonBubble';
    cb.scale.setScalar(0.88);
    cannonGroup.add(cb);
    _syncCannonColor(queue[0]);
  }

  // ── Queue UI preview ──────────────────────────────────────────
  function _updateQueueUI() {
    _drawPreview('bam3d-next-canvas', queue[0] || null);
    _drawPreview('bam3d-hold-canvas', heldSlot);
  }

  function _drawPreview(id, slot) {
    const el = document.getElementById(id); if (!el) return;
    const c = el.getContext('2d'), w = el.width, h = el.height;
    c.clearRect(0, 0, w, h);
    if (!slot) {
      c.strokeStyle='rgba(0,245,255,0.2)'; c.lineWidth=1;
      c.beginPath(); c.arc(w/2,h/2,w/2-3,0,Math.PI*2); c.stroke(); return;
    }
    const cx=w/2, cy=h/2, r=w/2-3;

    if (slot.ci === -1) {
      // Colourless power-up — clear glass bubble
      const gr = c.createRadialGradient(cx-r*0.3,cy-r*0.35,r*0.04,cx,cy,r);
      gr.addColorStop(0, 'rgba(200,230,255,0.55)');
      gr.addColorStop(0.5, 'rgba(100,160,220,0.25)');
      gr.addColorStop(1, 'rgba(0,80,160,0.12)');
      c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2);
      c.fillStyle=gr; c.fill();
      c.strokeStyle='rgba(0,245,255,0.5)'; c.lineWidth=1.5; c.stroke();
      // Specular
      c.beginPath(); c.arc(cx-r*0.3,cy-r*0.32,r*0.22,0,Math.PI*2);
      c.fillStyle='rgba(255,255,255,0.70)'; c.fill();
    } else {
      const col = ALL_COLORS[slot.ci];
      const gr = c.createRadialGradient(cx-r*0.3,cy-r*0.35,r*0.04,cx,cy,r);
      gr.addColorStop(0, _lighten(col.css,0.65));
      gr.addColorStop(0.5, _rgba(col.css, 0.73));
      gr.addColorStop(1, _darken(col.css,0.3, 0.53));
      c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2);
      c.fillStyle=gr; c.fill();
      c.strokeStyle='rgba(255,255,255,0.3)'; c.lineWidth=1; c.stroke();
      c.beginPath(); c.arc(cx-r*0.3,cy-r*0.32,r*0.22,0,Math.PI*2);
      c.fillStyle='rgba(255,255,255,0.60)'; c.fill();
    }

    // Emoji overlay for power-ups
    if (slot.power) {
      c.font=`${Math.round(r*0.88)}px serif`;
      c.textAlign='center'; c.textBaseline='middle';
      c.globalAlpha = slot.ci === -1 ? 1.0 : 0.85;
      c.fillText(POWERS[slot.power].emoji, cx+1, cy+2);
      c.globalAlpha=1;
    }
  }

  function _rgba(hex,a){const[r,g,b]=_hr(hex);return`rgba(${r},${g},${b},${a})`;}
  function _lighten(hex,a){const[r,g,b]=_hr(hex);return`rgb(${Math.min(255,r+~~(255*a))},${Math.min(255,g+~~(255*a))},${Math.min(255,b+~~(255*a))})`;}
  function _darken(hex,a,alpha=1){const[r,g,b]=_hr(hex);return`rgba(${Math.max(0,r-~~(255*a))},${Math.max(0,g-~~(255*a))},${Math.max(0,b-~~(255*a))},${alpha})`;}
  function _hr(h){h=h.replace('#','');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255];}

  // ── Shoot ─────────────────────────────────────────────────────
  function shoot() {
    if (ball || paused || dead || !queue.length) return;
    const minA=-Math.PI+0.15, maxA=-0.15;
    cannonAngle = Math.max(minA, Math.min(maxA, cannonAngle));
    const slot = consumeQueue(); canSwap = true;
    const mesh = _buildBubbleMesh(slot.ci, slot.power);
    const cv = { x: cannonX(), y: cannonCY() };
    mesh.position.copy(tw(cv.x, cv.y)); mesh.position.z = 3;
    scene.add(mesh);
    ball = { mesh, x:cv.x, y:cv.y, vx:Math.cos(cannonAngle)*SHOOT_SPEED, vy:Math.sin(cannonAngle)*SHOOT_SPEED, ci:slot.ci, power:slot.power, bounces:0, trail:[] };
    SFX.resume(); SFX.shoot();
  }

  function swapHold() {
    if (!canSwap||paused||dead||ball) return;
    if (!heldSlot) { heldSlot=queue.shift(); refillQueue(); }
    else { const tmp=heldSlot; heldSlot=queue.shift(); queue.unshift(tmp); }
    canSwap=false; _updateQueueUI(); _syncCannonBubble();
  }

  // ── Power-up activation ───────────────────────────────────────
  function _activatePower(power, row, col) {
    // For colourless player power bubbles, pick the colour of the first occupied neighbour
    let ci = grid[row][col].ci;
    if (ci === -1) {
      for (const [nr,nc] of _hexNeighbors(row,col)) {
        if (nr>=0&&nr<grid.length&&nc>=0&&grid[nr]&&grid[nr][nc]&&grid[nr][nc].ci>=0) {
          ci = grid[nr][nc].ci; break;
        }
      }
      if (ci === -1) ci = 0; // fallback
    }
    switch (power) {
      case 'fire':      _powerFire(row, col);      break;
      case 'lightning': _powerLightning(row);       break;
      case 'star':      _powerStar(ci);             break;
    }
  }

  function _powerFire(row, col) {
    SFX.powerFire();
    const cx = cellXY(row, col).x, cy = cellXY(row, col).y;
    _vfxFire(cx, cy);
    const toKill = new Set();
    toKill.add(row+','+col);
    for (const [nr,nc] of _hexNeighbors(row,col)) {
      if (nr>=0&&nr<grid.length&&nc>=0&&nc<(grid[nr]||[]).length&&grid[nr]&&grid[nr][nc])
        toKill.add(nr+','+nc);
    }
    for (const [nr,nc] of _hexNeighbors(row,col)) {
      for (const [nr2,nc2] of _hexNeighbors(nr,nc)) {
        if (nr2>=0&&nr2<grid.length&&nc2>=0&&nc2<(grid[nr2]||[]).length&&grid[nr2]&&grid[nr2][nc2])
          toKill.add(nr2+','+nc2);
      }
    }
    let count = 0;
    for (const key of toKill) {
      const [r,c] = key.split(',').map(Number);
      if (grid[r]&&grid[r][c]) { _popCell(r,c,false); count++; }
    }
    _addScoreSprite(cx, cy-20, `🔥 +${count*25*level}`);
    score+=count*25*level;
    if(window.FX){FX.screenFlash('#ff6a00',0.3);FX.shake(5);}
  }

  function _powerLightning(snapRow) {
    SFX.powerLightning();
    let hitRow = snapRow;
    outer: for (const [nr] of _hexNeighbors(snapRow, 0).concat(_hexNeighbors(snapRow, colsForRow(snapRow)-1))) {
      if (nr >= 0 && nr < grid.length && grid[nr]) {
        for (let c = 0; c < (grid[nr]||[]).length; c++) {
          if (grid[nr][c]) { hitRow = nr; break outer; }
        }
      }
    }
    // Launch the visual bolt first, then pop cells in sync with it
    _vfxLightning(hitRow);
    // Pop cells staggered to match bolt travel (28ms per column)
    const len = (grid[hitRow]||[]).length;
    const midCol = Math.floor(len / 2);
    ['left','right'].forEach(dir => {
      for (let c = 0; c < len; c++) {
        const col = dir === 'left' ? midCol - c : midCol + c;
        if (col < 0 || col >= len) continue;
        const delay = c * 28;
        setTimeout(() => {
          if (grid[hitRow] && grid[hitRow][col]) {
            _popCell(hitRow, col, false);
            _dropAllFloating();
          }
        }, delay);
      }
    });
    const count = len;
    const spriteY = H - cellXY(hitRow, 0).y * 0.5;
    _addScoreSprite(cannonX(), spriteY, `⚡ ROW CLEAR +${count * 30 * level}`);
    score += count * 30 * level;
    if (window.FX) { FX.screenFlash('#44aaff', 0.35); FX.shake(6); }
  }

  function _powerStar(ci) {
    SFX.powerStar();
    // Collect target cells first — don't pop yet
    const targets = [];
    for (let r=0;r<grid.length;r++) {
      const len = (grid[r]||[]).length;
      for (let c=0;c<len;c++) {
        if (grid[r]&&grid[r][c]&&grid[r][c].ci===ci) targets.push({r,c});
      }
    }
    const count = targets.length;
    _addScoreSprite(cannonX(), H*0.45, `⭐ COLOUR CLEAR +${count*40*level}`);
    score+=count*40*level;
    // VFX places stars on each bubble then pops them after delay
    _vfxStarThenPop(targets, ci);
  }

  // ── Update (identical physics to pb.js) ──────────────────────
  function update(dt) {
    if (leftHeld)  cannonAngle = Math.max(-Math.PI+0.15, cannonAngle-AIM_SPEED);
    if (rightHeld) cannonAngle = Math.min(-0.15,          cannonAngle+AIM_SPEED);
    _updateBarrel();

    if (chainTimer>0) { chainTimer-=dt; if (chainTimer<=0){chain=0;updateUI();} }

    if (!dead) {
      dropTimer-=dt;
      if (dropTimer<=0) {
        dropTimer=_dropSecs()*1000;
        _addNewTopRow();
        if (_gridTooLow()) { doGameOver(); return; }
      }
      elapsedMs += Math.max(0, dt);
    }

    if (ball) {
      ball.trail.push({x:ball.x,y:ball.y});
      if (ball.trail.length>5) ball.trail.shift();

      const wallL = R, wallR = W - R;
      const NUM_STEPS=Math.ceil(SHOOT_SPEED/(R*0.8));
      let placed=false;

      for (let si=0;si<NUM_STEPS&&!placed;si++) {
        ball.x+=ball.vx/NUM_STEPS; ball.y+=ball.vy/NUM_STEPS;
        if (ball.x<wallL){ball.x=wallL;ball.vx=Math.abs(ball.vx);ball.bounces++;SFX.bounce();}
        if (ball.x>wallR){ball.x=wallR;ball.vx=-Math.abs(ball.vx);ball.bounces++;SFX.bounce();}
        if (ball.y<CEILING_PAD+ROW_H*0.5){_placeBall();placed=true;break;}
        if (ball.bounces>MAX_BOUNCES){_placeBall();placed=true;break;}
        outer: for (let r=0;r<grid.length;r++) for (let c=0;c<colsForRow(r);c++) {
          if (!grid[r]||!grid[r][c]) continue;
          const cv=cellXY(r,c); const dx=ball.x-cv.x,dy=ball.y-cv.y;
          if (dx*dx+dy*dy<D*D){_placeBall();placed=true;break outer;}
        }
      }
      if (!placed&&ball) { twTo(ball.x, ball.y, ball.mesh.position); ball.mesh.position.z=3; }
      if (!placed&&ball&&ball.y>H+60) { scene.remove(ball.mesh); ball=null; }
    }

    // Shimmer power-up bubbles — pulse sprite opacity via cached reference (no child iteration)
    const now = performance.now();
    gridMeshes.forEach(bm => {
      if (!bm.power) return;
      const sprite = bm.mesh.userData.shimmerSprite;
      if (!sprite) return;
      if (!bm.mesh.userData.shimmerPhase) bm.mesh.userData.shimmerPhase = Math.random() * Math.PI * 2;
      bm.mesh.userData.shimmerPhase += dt * 0.004;
      const s = bm.mesh.userData.shimmerPhase;
      const pulse = 0.65 + 0.25 * Math.sin(s) + 0.10 * Math.sin(s * 3.7);
      sprite.material.opacity = Math.max(0.4, Math.min(1.0, pulse));
    });
    // Trail — reuse pre-built pool, toggle visibility instead of create/destroy
    const TRAIL_SIZE = 5;
    if (!_trailMeshPool) {
      _trailMeshPool = [];
      for (let i = 0; i < TRAIL_SIZE; i++) {
        const m = new THREE.Mesh(sphereGeo(Math.round(R*0.3)), new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0 }));
        m.visible = false;
        scene.add(m);
        _trailMeshPool.push(m);
      }
    }
    // Hide all first
    _trailMeshPool.forEach(m => { m.visible = false; });
    if (ball && ball.trail.length) {
      const trailColor = ball.ci >= 0 ? ALL_COLORS[ball.ci].hex : 0xaaddff;
      ball.trail.forEach((tp, i) => {
        const poolMesh = _trailMeshPool[i];
        if (!poolMesh) return;
        const t = (i+1) / ball.trail.length;
        poolMesh.material.color.setHex(trailColor);
        poolMesh.material.opacity = t * 0.3;
        twTo(tp.x, tp.y, poolMesh.position); poolMesh.position.z = 2.5;
        poolMesh.visible = true;
      });
    }

    // Pop particles + floaters + power sparks
    popParticles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy;
      if (p.isFloater) {
        // Gravity: vy increases (more downward in canvas space = increasing y)
        p.vy+=0.45; p.vx*=0.99;
        // Stay visible while falling, fade only near bottom
        p.alpha = p.y > H*0.82 ? Math.max(0, 1-(p.y-H*0.82)/(H*0.22)) : 1;
        p.scale = 1;
      } else if (p.isSpark) {
        const gm = p.gravMult !== undefined ? p.gravMult : 0.3;
        p.vy += gm; p.vx *= 0.96;
        p.alpha -= 0.032; p.scale = Math.max(0, p.scale - 0.022);
      } else {
        p.vy+=0.6; p.vx*=0.97;
        p.alpha-=0.025; p.scale=Math.max(0,p.scale-0.016);
      }
      if (p.mesh){
        twTo(p.x, p.y, p.mesh.position); p.mesh.position.z=4;
        p.mesh.scale.setScalar(Math.max(0.01,p.scale));
        if(p.mesh.children&&p.mesh.children.length){
          // It's a full bubble group (floater) — fade via child materials
          p.mesh.children.forEach(ch=>{ if(ch.material) ch.material.opacity=Math.max(0,p.alpha); });
        } else if(p.mesh.material) {
          p.mesh.material.opacity=Math.max(0,p.alpha);
        }
      }
    });
    popParticles=popParticles.filter(p=>{
      if(p.alpha<=0||p.y>H+100){if(p.mesh)scene.remove(p.mesh);return false;}
      return true;
    });

    // Score sprites
    scoreSprites.forEach(s=>{s.mesh.position.y+=1.1;s.life-=dt;const t=Math.max(0,s.life/s.maxLife);if(s.mesh.material)s.mesh.material.opacity=t;});
    scoreSprites=scoreSprites.filter(s=>{if(s.life<=0){scene.remove(s.mesh);return false;}return true;});
  }

  // ── Snap & place ──────────────────────────────────────────────
  function _snapToGrid() {
    let bestRow=-1,bestCol=-1,bestDist=Infinity;
    const approxRow=Math.round((ball.y-R-CEILING_PAD)/ROW_H);
    const from=Math.max(0,approxRow-2), to=Math.min(grid.length+1,approxRow+2);
    for (let r=from;r<=to;r++) for (let c=0;c<colsForRow(r);c++) {
      if (r<grid.length&&grid[r]&&grid[r][c]) continue;
      const cv=cellXY(r,c); const dx=ball.x-cv.x,dy=ball.y-cv.y,dist=dx*dx+dy*dy;
      if (dist<bestDist){bestDist=dist;bestRow=r;bestCol=c;}
    }
    return bestRow===-1?null:{row:bestRow,col:bestCol};
  }

  function _placeBall() {
    if (!ball) return;
    const snap=_snapToGrid();
    if (!snap){scene.remove(ball.mesh);ball=null;return;}
    const {row,col}=snap;

    while (grid.length<=row) grid.push(new Array(colsForRow(grid.length)).fill(null));
    while ((grid[row]||[]).length<=col) grid[row].push(null);

    const {ci,power}=ball;
    ball.mesh.position.copy(tw(cellXY(row,col).x, cellXY(row,col).y));
    ball.mesh.position.z=0;
    grid[row][col]={ci,power};
    gridMeshes.push({mesh:ball.mesh,row,col,ci,power});
    ball.mesh=null; ball=null;
    if (_trailMeshPool) _trailMeshPool.forEach(m => { m.visible = false; });
    _invalidateAim();

    // Power-up activates immediately on landing
    if (power) {
      _activatePower(power, row, col);
      _popCell(row, col, false, true);
      _dropAllFloating();
      _trimEmptyRows();
      // Star pops are deferred 420ms — check board clear after delay too
      if (power === 'star' || power === 'lightning') {
        setTimeout(() => {
          _dropAllFloating(); _trimEmptyRows(); updateUI();
          if (_countBubbles()===0) setTimeout(_advanceLevel, 400);
        }, 550);
      } else {
        if (_countBubbles()===0) { setTimeout(_advanceLevel, 600); return; }
      }
      updateUI(); return;
    }

      SFX.land();
    const group=_getMatchGroup(row,col);
    if (group.length>=3) {
      // Get floaters BEFORE popping (treats group as already gone)
      const floaters=_getFloating(group);
      chain++; chainTimer=3000;
      const pts=group.length*group.length*10*level*chain+floaters.length*50*level*chain;
      score+=pts; if(score>best)best=score;

      SFX.pop(group.length);
      if(floaters.length) setTimeout(()=>SFX.floaters(floaters.length),120);
      if(chain>=2) setTimeout(()=>SFX.chain(chain),200);

      const avgCv=group.reduce((a,{r,c})=>{const cv=cellXY(r,c);a.x+=cv.x;a.y+=cv.y;return a;},{x:0,y:0});
      avgCv.x/=group.length; avgCv.y/=group.length;

      // Capture any power-up bubbles in the match before we pop them
      const powersInGroup = group
        .filter(({r,c})=>grid[r]&&grid[r][c]&&grid[r][c].power)
        .map(({r,c})=>({power:grid[r][c].power, ci:grid[r][c].ci, r, c}));

      // Pop the matched group
      group.forEach(({r,c})=>_popCell(r,c,false));

      // Fire full power effects for any power bubbles caught in the match
      powersInGroup.forEach(({power, ci: pci, r, c}) => {
        const cv = cellXY(r, c);
        setTimeout(() => {
          SFX['power'+power.charAt(0).toUpperCase()+power.slice(1)]?.();
          if (power === 'fire') {
            _vfxFire(cv.x, cv.y);
            // Fire in grid: blast 2-bubble radius around this cell
            const toKill = new Set();
            const addNeighbours = (rr, cc, depth) => {
              const key = rr+','+cc;
              if (toKill.has(key)) return;
              toKill.add(key);
              if (depth <= 0) return;
              for (const [nr,nc] of _hexNeighbors(rr, cc)) {
                if (nr>=0&&nr<grid.length&&nc>=0&&nc<(grid[nr]||[]).length&&grid[nr]&&grid[nr][nc])
                  addNeighbours(nr, nc, depth-1);
              }
            };
            addNeighbours(r, c, 2);
            toKill.forEach(key => {
              const [kr,kc] = key.split(',').map(Number);
              if (grid[kr]&&grid[kr][kc]) _popCell(kr, kc, false);
            });
            _dropAllFloating(); _trimEmptyRows(); updateUI();
            if (_countBubbles()===0) setTimeout(_advanceLevel, 600);
            if(window.FX){FX.screenFlash('#ff6a00',0.25);FX.shake(4);}
          } else if (power === 'lightning') {
            _vfxLightning(r);
            const len = (grid[r]||[]).length;
            const midCol = Math.floor(len/2);
            const maxDelay = Math.floor(len/2) * 28;
            ['left','right'].forEach(dir => {
              for (let step=0; step<len; step++) {
                const cc = dir==='left' ? midCol-step : midCol+step;
                if (cc<0||cc>=len) continue;
                setTimeout(() => {
                  if (grid[r]&&grid[r][cc]) { _popCell(r, cc, false); _dropAllFloating(); }
                }, step*28);
              }
            });
            // Check board clear after all lightning pops complete
            setTimeout(() => {
              _trimEmptyRows(); updateUI();
              if (_countBubbles()===0) setTimeout(_advanceLevel, 400);
            }, maxDelay + 60);
            if(window.FX){FX.screenFlash('#44aaff',0.3);FX.shake(5);}
          } else if (power === 'star') {
            // Star: clear all bubbles of the same colour as this bubble
            const targetCi = pci >= 0 ? pci : 0;
            const targets = [];
            for (let rr=0;rr<grid.length;rr++) {
              const len=(grid[rr]||[]).length;
              for (let cc=0;cc<len;cc++) {
                if (grid[rr]&&grid[rr][cc]&&grid[rr][cc].ci===targetCi) targets.push({r:rr,c:cc});
              }
            }
            _vfxStarThenPop(targets, targetCi);
            score += targets.length * 40 * level;
            if(score>best)best=score;
          }
          _dropAllFloating(); _trimEmptyRows(); updateUI();
          if (_countBubbles()===0) setTimeout(_advanceLevel, 600);
        }, 80);
      });

      // Drop ALL bubbles now disconnected from ceiling (not just adjacent floaters)
      _dropAllFloating();
      _trimEmptyRows();
      _addScoreSprite(avgCv.x,avgCv.y-20,chain>1?`CHAIN×${chain}! +${pts}`:`+${pts}`);

      if(window.FX){
        const rect=container.getBoundingClientRect();
        const burstColor = ci >= 0 ? ALL_COLORS[ci].css : '#aaddff';
        group.forEach(({r,c})=>{const cv=cellXY(r,c);FX.burst(rect.left+(cv.x/W)*rect.width,rect.top+(cv.y/H)*rect.height,{count:10,colors:[burstColor,'#fff'],speed:4,life:35,size:3,shape:'circle',gravity:0.12});});
        if(chain>=2){FX.screenFlash(burstColor,0.2);FX.shake(4);}
      }
    } else {
      chain=0; chainTimer=0; SFX.land();
    }

    updateUI();
    if (_countBubbles()===0) { setTimeout(_advanceLevel, 600); return; }
    if (_gridTooLow()){doGameOver();return;}
  }

  function _countBubbles() {
    let n=0; for(const row of grid) for(const b of (row||[])) if(b) n++; return n;
  }

  function _advanceLevel() {
    score+=500*level; if(score>best)best=score;
    level++;
    dropTimer=_dropSecs()*1000;
    chain=0; chainTimer=0;
    heldSlot=null; canSwap=true; queue=[];

    // Show new colour unlock if one was introduced
    const prevN = numColorsForLevel(level-1);
    const newN  = numColorsForLevel(level);
    if (newN > prevN) {
      const newCol = ALL_COLORS[newN-1];
      _addScoreSprite(W/2, H*0.42, `NEW COLOUR: ${newCol.name}!`);
    }

    generateLevel(); refillQueue(); SFX.levelUp();
    if(window.FX){FX.confetti(window.innerWidth/2,window.innerHeight*0.3);FX.screenFlash('#39ff14',0.25);}
    updateUI();
  }

  function _popCell(row, col, isFloater, silent=false) {
    if (!grid[row]||!grid[row][col]) return;
    const ci=grid[row][col].ci;
    const cv=cellXY(row,col);
    const idx=gridMeshes.findIndex(bm=>bm.row===row&&bm.col===col);
    if (idx!==-1){scene.remove(gridMeshes[idx].mesh);gridMeshes.splice(idx,1);}
    grid[row][col]=null;
    if (!silent) {
      const ang=Math.random()*Math.PI*2, spd=isFloater?1+Math.random()*2:3+Math.random()*4;
      // Shared pop geo (R*0.45 rounded)
      const popR = Math.round(R*0.45);
      const popColor = ci>=0 ? ALL_COLORS[ci].hex : 0xaaddff;
      // Reuse a per-colour MeshBasicMaterial for pop particles
      const matKey = 'pop_'+ci;
      if (!_sharedMats[matKey]) _sharedMats[matKey] = new THREE.MeshBasicMaterial({ color: popColor, transparent: true, opacity: 1 });
      // Clone only the opacity state — use per-particle material for independent fade
      const mat = _sharedMats[matKey].clone();
      const m=new THREE.Mesh(sphereGeo(popR), mat);
      m.position.copy(tw(cv.x,cv.y)); m.position.z=4; scene.add(m);
      popParticles.push({mesh:m,x:cv.x,y:cv.y,vx:Math.cos(ang)*spd,vy:isFloater?-(1+Math.random()*1.5):Math.sin(ang)*spd,alpha:1,scale:1,isFloater});
    }
  }

  // Detached bubble — falls with gravity like pb.js floaters
  function _spawnFloater(row, col) {
    if (!grid[row]||!grid[row][col]) return;
    const ci  = grid[row][col].ci;
    const cv  = cellXY(row,col);
    // Remove from grid immediately
    const idx = gridMeshes.findIndex(bm=>bm.row===row&&bm.col===col);
    if (idx!==-1){scene.remove(gridMeshes[idx].mesh);gridMeshes.splice(idx,1);}
    grid[row][col]=null;
    // Build a fresh bubble mesh for the falling animation
    const mesh = _buildBubbleMesh(ci, null);
    mesh.position.copy(tw(cv.x, cv.y)); mesh.position.z=4;
    scene.add(mesh);
    // Small upward nudge then gravity pulls it down (canvas Y convention: vy negative = up canvas = down world)
    popParticles.push({
      mesh, x:cv.x, y:cv.y,
      vx:(Math.random()-0.5)*1.5,
      vy:-(1+Math.random()*1.5),   // small up bounce then falls
      alpha:1, scale:1,
      isFloater:true,
    });
  }

  // ── Power-up VFX ──────────────────────────────────────────────

  // Fire swirl: ring of flame particles that spiral outward then fade
  function _vfxFire(cx, cy) {
    const count = 28;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const col = [0xff4400, 0xff8800, 0xffcc00, 0xff2200][Math.floor(Math.random()*4)];
      const r = R * (0.15 + Math.random() * 0.2);
      const mesh = new THREE.Mesh(
        sphereGeo(Math.max(2, Math.round(r))),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 })
      );
      mesh.position.copy(tw(cx, cy)); mesh.position.z = 6; scene.add(mesh);
      const spd = 1.8 + Math.random() * 2.5;
      // Swirl: radial + tangential component
      const vx = Math.cos(angle) * spd + Math.sin(angle) * spd * 0.6;
      const vy = Math.sin(angle) * spd - Math.cos(angle) * spd * 0.6 - 1.5;
      popParticles.push({ mesh, x: cx, y: cy, vx, vy, alpha: 1, scale: 1.2, isFloater: false, isSpark: true, gravMult: 0.15 });
    }
    // Inner bright flash ring
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const mesh = new THREE.Mesh(
        sphereGeo(Math.max(3, Math.round(R * 0.28))),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
      );
      mesh.position.copy(tw(cx, cy)); mesh.position.z = 7; scene.add(mesh);
      const spd = 3.5 + Math.random();
      popParticles.push({ mesh, x: cx, y: cy, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, alpha: 0.9, scale: 1, isFloater: false, isSpark: true, gravMult: 0.05 });
    }
  }

  // Lightning: bolts fly left and right, popping bubbles as they travel
  function _vfxLightning(hitRow) {
    if (!grid[hitRow]) return;
    const len = (grid[hitRow] || []).length;
    // Find impact column (centre of row)
    const midCol = Math.floor(len / 2);
    const impactCV = cellXY(hitRow, midCol);

    // Spawn bolt segments travelling left then right
    ['left','right'].forEach(dir => {
      for (let c = 0; c < len; c++) {
        const col = dir === 'left' ? midCol - c : midCol + c;
        if (col < 0 || col >= len) continue;
        const cv = cellXY(hitRow, col);
        const delay = c * 28; // ms stagger per column
        setTimeout(() => {
          if (!scene) return;
          // Bolt flash at this bubble's position
          for (let i = 0; i < 5; i++) {
            const boltMesh = new THREE.Mesh(
              sphereGeo(Math.max(3, Math.round(R * 0.22))),
              new THREE.MeshBasicMaterial({ color: i%2===0 ? 0x44aaff : 0xffffff, transparent: true, opacity: 1 })
            );
            boltMesh.position.copy(tw(cv.x, cv.y)); boltMesh.position.z = 8; scene.add(boltMesh);
            popParticles.push({
              mesh: boltMesh, x: cv.x, y: cv.y,
              vx: (Math.random()-0.5)*3,
              vy: (Math.random()-0.5)*3,
              alpha: 1, scale: 1, isFloater: false, isSpark: true, gravMult: 0,
            });
          }
          // Connecting bolt line to left/right neighbour
          if (col > 0 && col < len) {
            const pts = [tw(cv.x, cv.y), tw(cv.x + (dir==='left'?-D:D), cv.y)];
            const boltLine = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.9 })
            );
            boltLine.position.z = 7; scene.add(boltLine);
            // Auto-remove after 180ms
            setTimeout(() => { if (scene) scene.remove(boltLine); }, 180);
          }
        }, delay);
      }
    });
  }

  // Star: place a ⭐ sprite on each target bubble, then pop them all at once after delay
  function _vfxStarThenPop(targetCells, ci) {
    const starSprites = [];
    targetCells.forEach(({r, c}) => {
      const cv = cellXY(r, c);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx2 = canvas.getContext('2d');
      ctx2.font = '44px serif'; ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
      ctx2.fillText('⭐', 32, 34);
      const tex = new THREE.CanvasTexture(canvas);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0 }));
      sp.position.copy(tw(cv.x, cv.y)); sp.position.z = 8;
      sp.scale.set(R * 1.6, R * 1.6, 1);
      scene.add(sp);
      starSprites.push({ mesh: sp, life: 600, maxLife: 600, phase: 'fadein' });
      scoreSprites.push({ mesh: sp, life: 600, maxLife: 600, _starPhase: 'fadein' });
    });

    // After 420ms: pop all target cells at once
    setTimeout(() => {
      if (!scene) return;
      targetCells.forEach(({r, c}) => {
        if (grid[r] && grid[r][c]) _popCell(r, c, false);
      });
      // Big star burst at centre
      const avgX = targetCells.reduce((s,{r,c})=>s+cellXY(r,c).x, 0) / targetCells.length;
      const avgY = targetCells.reduce((s,{r,c})=>s+cellXY(r,c).y, 0) / targetCells.length;
      for (let i = 0; i < 24; i++) {
        const ang = (i/24)*Math.PI*2;
        const col = [0xffe600, 0xffffff, 0xffaaff, 0xff88ff][Math.floor(Math.random()*4)];
        const mesh = new THREE.Mesh(
          sphereGeo(Math.max(2, Math.round(R*0.18))),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 })
        );
        mesh.position.copy(tw(avgX, avgY)); mesh.position.z = 7; scene.add(mesh);
        const spd = 4 + Math.random()*4;
        popParticles.push({ mesh, x:avgX, y:avgY, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, alpha:1, scale:1, isFloater:false, isSpark:true, gravMult:0.2 });
      }
      _dropAllFloating(); _trimEmptyRows(); updateUI();
      if (window.FX) { FX.screenFlash('#ffe600', 0.4); FX.shake(4); }
      // Check if board is now clear — advance level
      if (_countBubbles() === 0) { setTimeout(_advanceLevel, 600); }
    }, 420);
  }

  // Legacy particle burst (kept for fire inner flash)
  function _spawnPowerParticles(powerKey, cx, cy) {
    // Now a no-op — each power has its own dedicated VFX above
  }

  function _addScoreSprite(cx,cy,text) {
    const cv=document.createElement('canvas'); cv.width=260;cv.height=52;
    const c=cv.getContext('2d');
    c.font='bold 20px Orbitron,monospace'; c.textAlign='center';
    c.fillStyle=text.includes('CHAIN')||text.includes('CLEAR')||text.includes('NEW')?'#ffe600':'#ffffff';
    c.shadowColor='#ffe600';c.shadowBlur=10;c.fillText(text,130,36);
    const tex=new THREE.CanvasTexture(cv);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:1}));
    sp.position.copy(tw(cx,cy)); sp.position.z=5; sp.scale.set(140,28,1);
    scene.add(sp); scoreSprites.push({mesh:sp,life:1300,maxLife:1300});
  }

  // ── Flood fill ────────────────────────────────────────────────
  function _getMatchGroup(row,col) {
    if (!grid[row]||!grid[row][col]) return [];
    const ci=grid[row][col].ci;
    const visited=new Set(),result=[],stack=[[row,col]];
    while (stack.length) {
      const [r,c]=stack.pop(); const key=r+','+c;
      if (visited.has(key)) continue;
      if (r<0||r>=grid.length||c<0) continue;
      const rowLen=(grid[r]||[]).length;
      if (c>=rowLen) continue;
      if (!grid[r]||!grid[r][c]||grid[r][c].ci!==ci) continue;
      visited.add(key); result.push({r,c});
      stack.push(..._hexNeighbors(r,c));
    }
    return result;
  }

  function _getFloating(justPopped) {
    const poppedKeys=new Set(justPopped.map(({r,c})=>r+','+c));
    const attached=new Set(),q=[];
    const row0len=(grid[0]||[]).length;
    for (let c=0;c<row0len;c++){
      const key='0,'+c;
      if(!poppedKeys.has(key)&&grid[0]&&grid[0][c]){q.push([0,c]);attached.add(key);}
    }
    while (q.length){
      const [r,c]=q.shift();
      for (const [nr,nc] of _hexNeighbors(r,c)){
        const key=nr+','+nc;
        if (attached.has(key)||poppedKeys.has(key)) continue;
        if (nr<0||nr>=grid.length||nc<0) continue;
        const rowLen=(grid[nr]||[]).length;
        if (nc>=rowLen) continue;
        if (!grid[nr]||!grid[nr][nc]) continue;
        attached.add(key); q.push([nr,nc]);
      }
    }
    const floating=[];
    for (let r=0;r<grid.length;r++){
      const len=(grid[r]||[]).length;
      for (let c=0;c<len;c++){
        const key=r+','+c;
        if(!poppedKeys.has(key)&&grid[r]&&grid[r][c]&&!attached.has(key)) floating.push({r,c});
      }
    }
    return floating;
  }

  function _hexNeighbors(r,c){const e=r%2===0;return[[r-1,e?c-1:c],[r-1,e?c:c+1],[r,c-1],[r,c+1],[r+1,e?c-1:c],[r+1,e?c:c+1]];}
  function _trimEmptyRows(){while(grid.length&&(grid[grid.length-1]||[]).every(b=>!b))grid.pop();}

  // Drop every bubble not connected to the ceiling — called after any mass-pop
  function _dropAllFloating() {
    const attached = new Set();
    const q = [];
    // Seed from every filled cell in row 0
    const row0len = (grid[0]||[]).length;
    for (let c=0; c<row0len; c++) {
      if (grid[0]&&grid[0][c]) { q.push([0,c]); attached.add('0,'+c); }
    }
    while (q.length) {
      const [r,c]=q.shift();
      for (const [nr,nc] of _hexNeighbors(r,c)) {
        const key=nr+','+nc;
        if (attached.has(key)) continue;
        if (nr<0||nr>=grid.length||nc<0) continue;
        const rowLen=(grid[nr]||[]).length;
        if (nc>=rowLen) continue;
        if (!grid[nr]||!grid[nr][nc]) continue;
        attached.add(key); q.push([nr,nc]);
      }
    }
    // Scan every actual occupied cell — not just colsForRow() count
    for (let r=0;r<grid.length;r++) {
      const len=(grid[r]||[]).length;
      for (let c=0;c<len;c++) {
        if (grid[r]&&grid[r][c]&&!attached.has(r+','+c)) _spawnFloater(r,c);
      }
    }
  }

  function _addNewTopRow() {
    const newRow=_buildNewTopRow();
    // Shift existing meshes down one row
    grid.unshift(newRow.map(()=>null)); // temp placeholder
    gridMeshes.forEach(bm=>{bm.row++;_placeMesh(bm.mesh,bm.row,bm.col);});
    // Now fill in the real row 0
    for (let c=0;c<newRow.length;c++) {
      const {ci,power}=newRow[c];
      grid[0][c]={ci,power};
      const mesh=_buildBubbleMesh(ci,power);
      _placeMesh(mesh,0,c); scene.add(mesh);
      gridMeshes.push({mesh,row:0,col:c,ci,power});
    }
    _invalidateAim();
    if(window.FX) FX.screenFlash('#ff2d78',0.10);
  }

  function _gridTooLow() {
    for (let r=0;r<grid.length;r++) for (let c=0;c<colsForRow(r);c++) {
      if (grid[r]&&grid[r][c]) {
        const cv=cellXY(r,c);
        if (cv.y+R>=cannonCY()-ROW_H*CLEAR_ROWS) return true;
      }
    }
    return false;
  }

  // ── Game flow ─────────────────────────────────────────────────
  function doGameOver() {
    dead=true; SFX.gameOver();
    if(window.FX){FX.screenFlash('#ff2d78',0.5);FX.shake(10);}
    showOverlay('lose','GAME OVER',score,`Level ${level} — ${Math.floor(elapsedMs/1000)}s`,[
      {label:'🔄 RETRY',  fn:'window.BAM3D?.newGame()'},
      {label:'🕹 ARCADE', fn:'backToGameSelect()'},
    ]);
    if(score>0) setTimeout(()=>window.HS?.promptSubmit('bustamove3d',score,score.toLocaleString()),400);
  }

  function newGame() {
    if (!renderer){initThree();_bindEvents();}
    // Force resize to pick up correct container dimensions — critical on re-entry
    _resize();
    score=0; best=parseInt(localStorage.getItem('bam3d-best')||'0')||0;
    level=1; chain=0; chainTimer=0; paused=false; dead=false;
    heldSlot=null; canSwap=true; queue=[];
    dropTimer=_dropSecs()*1000; elapsedMs=0; cannonAngle=-Math.PI/2;
    if(ball){if(ball.mesh)scene.remove(ball.mesh);ball=null;}
    if (_trailMeshPool) _trailMeshPool.forEach(m => { m.visible = false; });
    popParticles.forEach(p=>p.mesh&&scene.remove(p.mesh)); popParticles=[];
    scoreSprites.forEach(s=>scene.remove(s.mesh)); scoreSprites=[];
    gridMeshes.forEach(bm=>scene.remove(bm.mesh)); gridMeshes=[];
    grid=[];
    generateLevel(); refillQueue();
    _syncCannonBubble();
    _rebuildBackground(); _repositionCannon(); _invalidateAim();
    hideOverlay(); updateUI();
    // Always (re)start the loop — it may have been stopped by destroy() or never started
    if(animId){cancelAnimationFrame(animId);animId=null;}
    _loop();
  }

  function exitGame() {
    // Stop the game loop
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    dead = true;
    hideOverlay();

    const storedBest = parseInt(localStorage.getItem('bam3d-best')||'0')||0;
    const isNewBest  = score > 0 && score > storedBest;

    if (isNewBest && window.HS && typeof window.HS.promptSubmitOnExit === 'function') {
      // Update stored best immediately so it persists even if user skips
      localStorage.setItem('bam3d-best', score);
      window.HS.promptSubmitOnExit(
        'bustamove3d',
        score,
        score.toLocaleString(),
        () => { backToGameSelect(); }
      );
    } else {
      backToGameSelect();
    }
  }

  function destroy() {
    dead=true;
    if(animId){cancelAnimationFrame(animId);animId=null;}
    _unbindEvents();
    if(_trailMeshPool){ _trailMeshPool.forEach(m=>{ if(scene)scene.remove(m); }); _trailMeshPool=null; }
    // Don't dispose renderer — game may be re-entered via the arcade menu.
  }

  function togglePause() {
    if(dead)return; paused=!paused;
    const btn=document.getElementById('bam3d-pause-btn');
    if(btn)btn.textContent=paused?'▶':'⏸';
    if(paused) showOverlay('pause','PAUSED',null,'Game paused',[
      {label:'▶ RESUME',fn:'window.BAM3D?.togglePause()'},
      {label:'🆕 NEW',  fn:'window.BAM3D?.newGame()'},
    ]);
    else hideOverlay();
  }

  // ── UI ────────────────────────────────────────────────────────
  function updateUI() {
    const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    s('bam3d-score',score.toLocaleString());
    s('bam3d-best', Math.max(score,best).toLocaleString());
    s('bam3d-level',level);
    s('bam3d-chain',chain>1?`×${chain}`:'×1');
    const secs=Math.max(0,Math.floor(elapsedMs/1000));
    s('bam3d-time',`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`);

    // Drop bar
    const dropBar=document.getElementById('bam3d-drop-bar');
    if(dropBar){const f=Math.max(0,dropTimer/(_dropSecs()*1000));dropBar.style.width=(f*100)+'%';dropBar.style.background=f<0.25?'#ff2d78':f<0.5?'#ffe600':'#00f5ff';}

    if(score>best){best=score;localStorage.setItem('bam3d-best',best);}
  }

  function showOverlay(type,title,sc,msg,btns){
    const ov=document.getElementById('bam3d-overlay');if(!ov)return;ov.classList.add('active');
    const t=document.getElementById('bam3d-ov-title');if(t){t.textContent=title;t.className='bam3d-ov-title '+type;}
    const scEl=document.getElementById('bam3d-ov-score');if(scEl)scEl.textContent=sc!=null?sc.toLocaleString()+' pts':'';
    const msgEl=document.getElementById('bam3d-ov-msg');if(msgEl)msgEl.textContent=msg||'';
    const bd=document.getElementById('bam3d-ov-btns');
    if(bd)bd.innerHTML=(btns||[]).map(b=>`<button class="${b.label.includes('ARCADE')?'arcade-back-btn':'bam3d-btn'}" onclick="${b.fn}">${b.label}</button>`).join('');
  }
  function hideOverlay(){const ov=document.getElementById('bam3d-overlay');if(ov)ov.classList.remove('active');}

  // ── Three.js init ─────────────────────────────────────────────
  function initThree() {
    container=document.getElementById('bam3d-canvas-container');
    if(!container)return;
    renderer=new THREE.WebGLRenderer({antialias:false, alpha:false, powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setClearColor(0x010510,1);
    container.appendChild(renderer.domElement);
    scene=new THREE.Scene();
    camera=new THREE.OrthographicCamera(0,W,H,0,-100,100);
    camera.position.z=50;

    scene.add(new THREE.AmbientLight(0x223355,1.0));
    const key=new THREE.DirectionalLight(0xffffff,1.1);
    key.position.set(W*0.25,H*0.75,80); scene.add(key);
    const fill=new THREE.DirectionalLight(0x4466aa,0.3);
    fill.position.set(W*0.8,H*0.4,60); scene.add(fill);
    const rim=new THREE.DirectionalLight(0xff2d78,0.15);
    rim.position.set(W*0.5,0,-20); scene.add(rim);

    _buildBackground();
    _buildCannon();
    _buildAimLine();

    _resizeObs=new ResizeObserver(()=>_resize());
    _resizeObs.observe(container);
    _resize();
  }

  function _resize() {
    if(!renderer||!container)return;
    W=container.clientWidth||360; H=container.clientHeight||600;
    renderer.setSize(W,H);
    if(camera){camera.left=0;camera.right=W;camera.top=H;camera.bottom=0;camera.updateProjectionMatrix();}
    _rebuildBackground(); _repositionCannon(); _invalidateAim();
    gridMeshes.forEach(bm=>_placeMesh(bm.mesh,bm.row,bm.col));
  }

  // ── Background ────────────────────────────────────────────────
  let bgObjs2=[];
  function _buildBackground(){_rebuildBackground();}
  function _rebuildBackground(){
    bgObjs2.forEach(o=>scene.remove(o)); bgObjs2=[];

    const bg=new THREE.Mesh(new THREE.PlaneGeometry(W*2,H*2),new THREE.MeshBasicMaterial({color:0x010510}));
    bg.position.set(W/2,H/2,-50); scene.add(bg); bgObjs2.push(bg);

    const sp=new Float32Array(70*3);
    for(let i=0;i<70;i++){sp[i*3]=Math.random()*W;sp[i*3+1]=Math.random()*H;sp[i*3+2]=-20;}
    const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
    const stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xc8e8ff,size:1.5,transparent:true,opacity:0.5}));
    scene.add(stars); bgObjs2.push(stars);

    // Slim left edge glow (3px wide, not a chunky block)
    const edgeL = new THREE.Mesh(
      new THREE.PlaneGeometry(3, H),
      new THREE.MeshBasicMaterial({color:0x00f5ff, transparent:true, opacity:0.55})
    );
    edgeL.position.set(1.5, H/2, -1); scene.add(edgeL); bgObjs2.push(edgeL);

    // Slim right edge glow
    const edgeR = new THREE.Mesh(
      new THREE.PlaneGeometry(3, H),
      new THREE.MeshBasicMaterial({color:0xff2d78, transparent:true, opacity:0.55})
    );
    edgeR.position.set(W-1.5, H/2, -1); scene.add(edgeR); bgObjs2.push(edgeR);

    const top=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,H-2,1),new THREE.Vector3(W,H-2,1)]),new THREE.LineBasicMaterial({color:0xbf00ff}));
    scene.add(top); bgObjs2.push(top);

    const ceilY=H-CEILING_PAD;
    const cl=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,ceilY,1),new THREE.Vector3(W,ceilY,1)]),new THREE.LineBasicMaterial({color:0x00f5ff}));
    scene.add(cl); bgObjs2.push(cl);

    const dangerWorldY=H-(cannonCY()-ROW_H*CLEAR_ROWS);
    const dl=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,dangerWorldY,1),new THREE.Vector3(W,dangerWorldY,1)]),new THREE.LineBasicMaterial({color:0xffe600,transparent:true,opacity:0.55}));
    scene.add(dl); bgObjs2.push(dl);  }

  // ── Cannon ────────────────────────────────────────────────────
  function _buildCannon(){
    cannonGroup=new THREE.Group(); scene.add(cannonGroup);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(R*1.7,R*2,R*0.3,24),new THREE.MeshLambertMaterial({color:0x0a1e30,emissive:0x002244}));
    base.rotation.x=Math.PI/2; cannonGroup.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(R*1.8,R*0.06,8,32),new THREE.MeshLambertMaterial({color:0x00f5ff,emissive:0x00f5ff,emissiveIntensity:0.7}));
    ring.name='cannonRing'; cannonGroup.add(ring);
    cannonBarrel=new THREE.Group(); cannonGroup.add(cannonBarrel);
    const bar=new THREE.Mesh(new THREE.CylinderGeometry(R*0.28,R*0.38,R*3.2,12),new THREE.MeshLambertMaterial({color:0x2266aa,emissive:0x001133}));
    bar.name='cannonBar'; bar.position.y=R*1.6; cannonBarrel.add(bar);
    const muzzle=new THREE.Mesh(new THREE.TorusGeometry(R*0.32,R*0.09,8,16),new THREE.MeshLambertMaterial({color:0x00f5ff,emissive:0x00f5ff,emissiveIntensity:0.9}));
    muzzle.name='cannonMuzzle'; muzzle.position.y=R*3.2; cannonBarrel.add(muzzle);
    _repositionCannon();
  }
  function _repositionCannon(){if(!cannonGroup)return;cannonGroup.position.set(cannonX(),H-cannonCY(),2);}
  function _updateBarrel(){if(!cannonBarrel)return;cannonBarrel.rotation.z=-(cannonAngle+Math.PI/2);}

  // ── Aim line ──────────────────────────────────────────────────
  function _buildAimLine(){
    _aimPositionsBuf = new Float32Array(AIM_MAX_PTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_aimPositionsBuf, 3));
    geo.setDrawRange(0, 0);
    aimLineMesh=new THREE.Line(geo, new THREE.LineDashedMaterial({color:0xffffff,dashSize:6,gapSize:9,transparent:true,opacity:0.5}));
    scene.add(aimLineMesh);
  }
  // Rebuild flat bubble list from grid — called once on grid change, not per frame.
  // Replaces the O(grid²) nested row×col scan that ran at every aim sim step.
  function _rebuildAimBubbleList() {
    _aimBubbleList = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < colsForRow(r); c++) {
        if (grid[r] && grid[r][c]) {
          const cv = cellXY(r, c);
          _aimBubbleList.push({ x: cv.x, y: cv.y });
        }
      }
    }
  }
  function _invalidateAim() { _aimDirty = true; _rebuildAimBubbleList(); }
  function _updateAimLine(){
    if(!aimLineMesh)return;
    if(!queue.length||dead||paused||ball){aimLineMesh.visible=false;return;}
    aimLineMesh.visible=true;
    if(_aimDirty||_aimLastAngle!==cannonAngle){
      let vx=Math.cos(cannonAngle),vy=Math.sin(cannonAngle);
      let x=cannonX(),y=cannonCY();
      const wallL=R, wallR=W-R;
      // Write directly into the pre-allocated Float32Array — no Vector3 allocation per point
      if (!_aimPositionsBuf) _aimPositionsBuf = new Float32Array(AIM_MAX_PTS * 3);
      let ptCount = 0;
      const writePt = (px, py) => {
        if (ptCount >= AIM_MAX_PTS) return;
        const i = ptCount * 3;
        _aimPositionsBuf[i]   = px;
        _aimPositionsBuf[i+1] = H - py;
        _aimPositionsBuf[i+2] = 0;
        ptCount++;
      };
      // Collision threshold squared — computed once outside the loop
      const hitR2 = (D * 1.05) * (D * 1.05);
      // y-band half-width: bubbles further than 2×D vertically are skipped (~90% culled)
      const yCull = D * 2;
      writePt(x, y);
      for(let i=0;i<Math.ceil(H/SHOOT_SPEED)*6;i++){
        x+=vx*SHOOT_SPEED; y+=vy*SHOOT_SPEED;
        if(x<wallL){x=wallL;vx=Math.abs(vx);writePt(x,y);}
        if(x>wallR){x=wallR;vx=-Math.abs(vx);writePt(x,y);}
        if(y<CEILING_PAD+R*2){writePt(x,CEILING_PAD+R);break;}
        writePt(x,y);
        let hit=false;
        // Flat list scan with y-band cull — O(n) with ~90% skipped immediately
        for(let b=0;b<_aimBubbleList.length&&!hit;b++){
          const bub=_aimBubbleList[b];
          const dy=y-bub.y;
          if(dy>yCull||dy<-yCull)continue; // cheap vertical reject
          const dx=x-bub.x;
          if(dx*dx+dy*dy<hitR2){writePt(x,y);hit=true;}
        }
        if(hit)break;
      }
      // Update buffer in-place — no dispose, no allocation
      const posAttr = aimLineMesh.geometry.attributes.position;
      posAttr.needsUpdate = true;
      aimLineMesh.geometry.setDrawRange(0, ptCount);
      aimLineMesh.computeLineDistances();
      _aimLastAngle=cannonAngle; _aimDirty=false;
    }
    const qci = queue[0]?.ci ?? 0;
    aimLineMesh.material.color.setHex(qci >= 0 ? ALL_COLORS[qci].hex : 0xaaddff);
  }

  // ── Render loop ───────────────────────────────────────────────
  function _loop(ts=0){
    animId=requestAnimationFrame(_loop);
    if(document.hidden)return;
    const dt=Math.min(ts-lastTs,50);lastTs=ts;
    const wasActive=!!ball||popParticles.length>0||scoreSprites.length>0;
    if(!paused&&!dead)update(dt);
    _updateAimLine();
    // Skip re-render when paused and nothing is moving
    if(renderer&&scene&&camera&&(!paused||wasActive||popParticles.length>0))
      renderer.render(scene,camera);
    if(!dead&&!paused)updateUI();
  }

  // ── Input ─────────────────────────────────────────────────────
  function _aimFromClient(cx,cy){
    if(!container)return;
    const rect=container.getBoundingClientRect();
    const mx=(cx-rect.left)*(W/rect.width),my=(cy-rect.top)*(H/rect.height);
    const dx=mx-cannonX(),dy=my-cannonCY();
    cannonAngle=Math.max(-Math.PI+0.12,Math.min(-0.12,Math.atan2(dy,dx)));
    _updateBarrel(); _invalidateAim();
  }
  function _onMouseMove(e){if(!paused&&!dead)_aimFromClient(e.clientX,e.clientY);}
  function _onClick(e){if(paused||dead)return;_aimFromClient(e.clientX,e.clientY);shoot();}
  function _onRightClick(e){e.preventDefault();if(paused||dead)return;swapHold();}
  function _onTouch(e){if(paused||dead)return;e.preventDefault();const t=e.touches[0];_aimFromClient(t.clientX,t.clientY);}
  function _onTouchEnd(){if(!paused&&!dead)shoot();}
  function _onKeyDown(e){
    const scr=document.getElementById('bustamove3d-screen');
    if(!scr||!scr.classList.contains('active'))return;
    switch(e.key){
      case 'ArrowLeft':case 'a':case 'A':leftHeld=true;e.preventDefault();break;
      case 'ArrowRight':case 'd':case 'D':rightHeld=true;e.preventDefault();break;
      case ' ':shoot();e.preventDefault();break;
      case 'z':case 'Z':swapHold();e.preventDefault();break;
      case 'p':case 'P':togglePause();break;
    }
  }
  function _onKeyUp(e){
    if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A')leftHeld=false;
    if(e.key==='ArrowRight'||e.key==='d'||e.key==='D')rightHeld=false;
  }
  function _onBlur()  { if (!paused && !dead) togglePause(); }

  function _bindEvents(){
    if(!container)return;
    container.addEventListener('mousemove',_onMouseMove);
    container.addEventListener('click',_onClick);
    container.addEventListener('contextmenu',_onRightClick);
    container.addEventListener('touchmove',_onTouch,{passive:false});
    container.addEventListener('touchend',_onTouchEnd);
    document.addEventListener('keydown',_onKeyDown);
    document.addEventListener('keyup',_onKeyUp);
    window.addEventListener('blur', _onBlur);
  }
  function _unbindEvents(){
    if(container){container.removeEventListener('mousemove',_onMouseMove);container.removeEventListener('click',_onClick);container.removeEventListener('contextmenu',_onRightClick);container.removeEventListener('touchmove',_onTouch);container.removeEventListener('touchend',_onTouchEnd);}
    document.removeEventListener('keydown',_onKeyDown);
    document.removeEventListener('keyup',_onKeyUp);
    window.removeEventListener('blur', _onBlur);
  }

  return {
    newGame: ()=>{if(!renderer){initThree();_bindEvents();}newGame();},
    destroy, togglePause, exitGame,
    getCurrentScore:()=>score,
  };
})();
