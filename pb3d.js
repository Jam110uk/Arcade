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
    function tone(f, d, type = 'sine', vol = 0.15, fEnd = null, delay = 0) {
      try {
        const c = gc(), o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination); o.type = type;
        const t = c.currentTime + delay;
        o.frequency.setValueAtTime(f, t);
        if (fEnd != null) o.frequency.linearRampToValueAtTime(fEnd, t + d);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.start(t); o.stop(t + d + 0.01);
      } catch (_) {}
    }
    function noise(d, vol = 0.1, delay = 0) {
      try {
        const c = gc(), buf = c.createBuffer(1, c.sampleRate * d, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const s = c.createBufferSource(), g = c.createGain();
        s.buffer = buf; s.connect(g); g.connect(c.destination);
        const t = c.currentTime + delay;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        s.start(t); s.stop(t + d + 0.01);
      } catch (_) {}
    }
    return {
      shoot()      { tone(520, 0.07, 'sine', 0.14, 680); },
      bounce()     { tone(300, 0.05, 'sine', 0.10, 240); },
      land()       { tone(180, 0.08, 'sine', 0.10, 160); },
      pop(n)       { tone(600 + Math.min(n,8)*40, 0.06, 'square', 0.13); noise(0.06, 0.07); },
      floaters(n)  { for (let i=0;i<Math.min(n,6);i++) tone(400-i*35,0.12,'sine',0.10,200-i*20,i*0.04); },
      chain(n)     { for (let i=0;i<Math.min(n,5);i++) tone(440*Math.pow(1.2,i),0.10,'square',0.14,null,i*0.07); },
      levelUp()    { [523,659,784,1047,1319].forEach((f,i)=>tone(f,0.12,'square',0.15,null,i*0.09)); setTimeout(()=>tone(1319,0.4,'sine',0.12,1047),500); },
      gameOver()   { [440,370,330,262].forEach((f,i)=>tone(f,0.22,'sine',0.14,null,i*0.18)); },
      powerFire()  { tone(880,0.12,'sawtooth',0.18,220); noise(0.08,0.1); },
      powerWater() { for (let i=0;i<4;i++) tone(600-i*60,0.1,'sine',0.12,400-i*40,i*0.06); },
      powerLightning() { noise(0.04,0.18); tone(1200,0.1,'square',0.15,200); },
      powerStar()  { [784,988,1175,1568].forEach((f,i)=>tone(f,0.12,'square',0.14,null,i*0.06)); },
      resume()     { if (ctx&&ctx.state==='suspended') ctx.resume().catch(()=>{}); },
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
    fire:      { emoji: '🔥', label: 'FIRE',      desc: 'Clears surrounding cluster' },
    water:     { emoji: '💧', label: 'WATER',     desc: 'Recolours nearby bubbles'   },
    lightning: { emoji: '⚡', label: 'LIGHTNING', desc: 'Clears entire row'          },
    star:      { emoji: '⭐', label: 'STAR',      desc: 'Clears all of this colour'  },
  };
  const POWER_KEYS   = Object.keys(POWERS);
  const POWER_CHANCE = 0.08;   // chance per cell when generating a row

  // ── Geometry constants ────────────────────────────────────────
  // 2× size vs original pb.js (was R=13)
  const R           = 26;
  const D           = R * 2;
  const ROW_H       = R * Math.sqrt(3);
  const SHOOT_SPEED = 28;
  const MAX_BOUNCES = 30;
  const DROP_SECS   = 55;
  const CEILING_PAD = 8;
  const CANNON_PAD  = 36;
  const CLEAR_ROWS  = 3;

  // Play area is the full canvas width minus one bubble radius each side
  function _playW()      { return W - R * 2; }
  function colsEven()    { return Math.floor(_playW() / D); }
  function colsOdd()     { return Math.floor((_playW() - R) / D); }
  function colsForRow(r) { return r % 2 === 0 ? colsEven() : colsOdd(); }

  // Centre the hex grid within the full canvas width
  function cellXY(row, col) {
    const isOdd  = row % 2 === 1;
    const cols   = colsForRow(row);
    const rowW   = cols * D + (isOdd ? R : 0);
    const startX = (W - rowW) / 2 + R + (isOdd ? R : 0);
    return {
      x: startX + col * D,
      y: CEILING_PAD + row * ROW_H + R,
    };
  }
  function cannonX()      { return W / 2; }
  function cannonCY()     { return H - CANNON_PAD - R; }   // canvas Y

  // Canvas → Three.js world (orthographic, Y-up, same pixel scale)
  function tw(cx, cy)    { return new THREE.Vector3(cx, H - cy, 0); }

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
  let trailPool   = [];
  let popParticles = []; // { mesh, x, y, vx, vy, gravity, alpha, scale, isFloater }
  let scoreSprites = []; // { mesh, life, maxLife }

  // Pre-built canvas textures for power-up emoji (keyed by power key)
  const _emojiTexCache = {};

  // Material/geo cache
  const _matCache  = {};
  const _geoCache  = {};

  function sphereGeo(r) {
    const k = Math.round(r);
    if (!_geoCache[k]) _geoCache[k] = new THREE.SphereGeometry(r, 24, 18);
    return _geoCache[k];
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
  let dropTimer     = DROP_SECS * 1000;
  let elapsedMs     = 0;
  let lastTs        = 0;
  let _aimDirty     = true, _aimLastAngle = null, _aimPts = null;

  let leftHeld = false, rightHeld = false;
  const AIM_SPEED = 0.035;

  // ── Material builders ─────────────────────────────────────────
  // Real glass bubble:
  //   outer shell — transparent MeshPhongMaterial with high shininess
  //   inner glow   — small opaque sphere slightly inset
  //   emoji sprite — canvas texture Sprite sitting just inside
  function _buildBubbleMesh(ci, power) {
    const col = ALL_COLORS[ci];
    const group = new THREE.Group();

    // Outer glass shell
    const shellMat = new THREE.MeshPhongMaterial({
      color:             col.hex,
      emissive:          col.hex,
      emissiveIntensity: 0.08,
      shininess:         260,
      specular:          0xffffff,
      transparent:       true,
      opacity:           0.55,
      side:              THREE.FrontSide,
    });
    const shell = new THREE.Mesh(sphereGeo(R), shellMat);
    group.add(shell);

    // Inner glow sphere
    const innerMat = new THREE.MeshPhongMaterial({
      color:             col.hex,
      emissive:          col.hex,
      emissiveIntensity: 0.45,
      shininess:         80,
      transparent:       true,
      opacity:           0.72,
    });
    const inner = new THREE.Mesh(sphereGeo(R * 0.72), innerMat);
    group.add(inner);

    // Specular highlight blob (small white sphere off-centre top-left)
    const specMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    const spec = new THREE.Mesh(sphereGeo(R * 0.22), specMat);
    spec.position.set(-R * 0.32, R * 0.34, R * 0.55);
    group.add(spec);

    // Secondary smaller specular
    const spec2 = new THREE.Mesh(sphereGeo(R * 0.10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    spec2.position.set(-R * 0.12, R * 0.52, R * 0.45);
    group.add(spec2);

    // Power-up emoji sprite inside the bubble
    if (power) {
      const tex = _getEmojiTex(power, col.hex);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthTest: false }));
      sprite.scale.set(R * 1.1, R * 1.1, 1);
      sprite.position.set(0, 0, R * 0.15);
      group.add(sprite);
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
        const power = wantPower ? POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)] : null;
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
      const power = Math.random() < POWER_CHANCE ? POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)] : null;
      row.push({ ci, power });
    }
    return row;
  }

  // ── Queue ─────────────────────────────────────────────────────
  function _makeSlot() {
    const pal = _getColorsInGrid().length ? _getColorsInGrid() : _activePalette();
    const ci  = pal[Math.floor(Math.random() * pal.length)];
    // Power-up slots share same colours as grid
    const power = Math.random() < POWER_CHANCE ? POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)] : null;
    return { ci, power };
  }

  function refillQueue() {
    while (queue.length < 2) queue.push(_makeSlot());
    _updateQueueUI();
    _syncCannonBubble();
  }

  function consumeQueue() {
    const s = queue.shift(); refillQueue(); return s;
  }

  function _syncCannonBubble() {
    if (!cannonGroup || !queue[0]) return;
    const old = cannonGroup.getObjectByName('cannonBubble');
    if (old) cannonGroup.remove(old);
    const cb = _buildBubbleMesh(queue[0].ci, queue[0].power);
    cb.name = 'cannonBubble';
    cb.scale.setScalar(0.88);
    cannonGroup.add(cb);
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
    const col = ALL_COLORS[slot.ci];
    const cx=w/2, cy=h/2, r=w/2-3;
    // Glass bubble look
    const gr = c.createRadialGradient(cx-r*0.3,cy-r*0.35,r*0.04,cx,cy,r);
    gr.addColorStop(0, _lighten(col.css,0.65));
    gr.addColorStop(0.5, _rgba(col.css, 0.73));
    gr.addColorStop(1, _darken(col.css,0.3, 0.53));
    c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2);
    c.fillStyle=gr; c.fill();
    c.strokeStyle='rgba(255,255,255,0.3)'; c.lineWidth=1; c.stroke();
    // Specular
    c.beginPath(); c.arc(cx-r*0.3,cy-r*0.32,r*0.22,0,Math.PI*2);
    c.fillStyle='rgba(255,255,255,0.60)'; c.fill();
    // Emoji for power-ups
    if (slot.power) {
      c.font=`${Math.round(r*0.88)}px serif`;
      c.textAlign='center'; c.textBaseline='middle';
      c.globalAlpha=0.85;
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
    const ci = grid[row][col].ci;
    switch (power) {
      case 'fire':      _powerFire(row, col);      break;
      case 'water':     _powerWater(row, col, ci); break;
      case 'lightning': _powerLightning(row);       break;
      case 'star':      _powerStar(ci);             break;
    }
  }

  function _powerFire(row, col) {
    // Flood-fill all connected bubbles of any colour within radius 1.5 cells
    SFX.powerFire();
    const toKill = new Set();
    // Mark the power bubble itself
    toKill.add(row+','+col);
    // All hex-neighbours
    for (const [nr,nc] of _hexNeighbors(row,col)) {
      if (nr>=0&&nr<grid.length&&nc>=0&&nc<colsForRow(nr)&&grid[nr]&&grid[nr][nc])
        toKill.add(nr+','+nc);
    }
    // Second ring
    for (const [nr,nc] of _hexNeighbors(row,col)) {
      for (const [nr2,nc2] of _hexNeighbors(nr,nc)) {
        if (nr2>=0&&nr2<grid.length&&nc2>=0&&nc2<colsForRow(nr2)&&grid[nr2]&&grid[nr2][nc2])
          toKill.add(nr2+','+nc2);
      }
    }
    let count = 0;
    for (const key of toKill) {
      const [r,c] = key.split(',').map(Number);
      if (grid[r]&&grid[r][c]) { _popCell(r,c,false); count++; }
    }
    _addScoreSprite(cellXY(row,col).x, cellXY(row,col).y-20, `🔥 +${count*25*level}`);
    score+=count*25*level;
    if(window.FX){FX.screenFlash('#ff6a00',0.3);FX.shake(5);}
    _spawnPowerParticles('fire', cellXY(row,col).x, cellXY(row,col).y);
  }

  function _powerWater(row, col, ci) {
    // Recolour all neighbours to match the bubble that triggered it
    SFX.powerWater();
    let count=0;
    for (const [nr,nc] of _hexNeighbors(row,col)) {
      if (nr<0||nr>=grid.length||nc<0||nc>=colsForRow(nr)) continue;
      if (!grid[nr]||!grid[nr][nc]||grid[nr][nc].power) continue;
      // Recolour
      grid[nr][nc].ci = ci;
      const bm=gridMeshes.find(x=>x.row===nr&&x.col===nc);
      if (bm) {
        scene.remove(bm.mesh);
        const nm=_buildBubbleMesh(ci,null);
        _placeMesh(nm,nr,nc); scene.add(nm);
        bm.mesh=nm; bm.ci=ci;
      }
      count++;
    }
    _addScoreSprite(cellXY(row,col).x, cellXY(row,col).y-20, `💧 ×${count} recoloured`);
    if(window.FX) FX.screenFlash('#00f5ff',0.2);
    _spawnPowerParticles('water', cellXY(row,col).x, cellXY(row,col).y);
  }

  function _powerLightning(row) {
    SFX.powerLightning();
    let count=0;
    for (let c=0; c<colsForRow(row); c++) {
      if (grid[row]&&grid[row][c]) { _popCell(row,c,false); count++; }
    }
    _addScoreSprite(cannonX(), H-cellXY(row,0).y*0.5, `⚡ ROW CLEAR +${count*30*level}`);
    score+=count*30*level;
    if(window.FX){FX.screenFlash('#ffe600',0.35);FX.shake(6);}
    _spawnPowerParticles('lightning', W/2, cellXY(row,0).y);
  }

  function _powerStar(ci) {
    SFX.powerStar();
    let count=0;
    for (let r=0;r<grid.length;r++) for (let c=0;c<colsForRow(r);c++) {
      if (grid[r]&&grid[r][c]&&grid[r][c].ci===ci&&!grid[r][c].power) { _popCell(r,c,false); count++; }
    }
    _addScoreSprite(cannonX(), H*0.45, `⭐ COLOUR CLEAR +${count*40*level}`);
    score+=count*40*level;
    if(window.FX){FX.screenFlash('#ffe600',0.4);FX.shake(4);}
    _spawnPowerParticles('star', W/2, H*0.5);
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
        dropTimer=DROP_SECS*1000;
        _addNewTopRow();
        if (_gridTooLow()) { doGameOver(); return; }
      }
      elapsedMs+=dt;
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
      if (!placed&&ball) { ball.mesh.position.copy(tw(ball.x,ball.y)); ball.mesh.position.z=3; }
      if (!placed&&ball&&ball.y>H+60) { scene.remove(ball.mesh); ball=null; }
    }

    // Trail
    trailPool.forEach(m=>scene.remove(m)); trailPool=[];
    if (ball&&ball.trail.length) {
      ball.trail.forEach((tp,i)=>{
        const t=(i+1)/ball.trail.length;
        const r=Math.max(2,Math.round(R*t*0.55));
        const m=new THREE.Mesh(sphereGeo(r),new THREE.MeshBasicMaterial({color:ALL_COLORS[ball.ci].hex,transparent:true,opacity:t*0.3}));
        m.position.copy(tw(tp.x,tp.y)); m.position.z=2.5;
        scene.add(m); trailPool.push(m);
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
        p.vy+=0.3; p.vx*=0.96;
        p.alpha-=0.038; p.scale=Math.max(0,p.scale-0.025);
      } else {
        p.vy+=0.6; p.vx*=0.97;
        p.alpha-=0.025; p.scale=Math.max(0,p.scale-0.016);
      }
      if (p.mesh){
        p.mesh.position.copy(tw(p.x,p.y)); p.mesh.position.z=4;
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
    _invalidateAim();

    // Power-up activates immediately on landing
    if (power) {
      _activatePower(power, row, col);
      // Remove the power bubble from grid after effect
      _popCell(row, col, false, true);
      _trimEmptyRows();
      // Check if board is clear after power-up
      if (_countBubbles()===0) { setTimeout(_advanceLevel, 600); return; }
      updateUI(); return;
    }

    SFX.land();
    const group=_getMatchGroup(row,col);
    if (group.length>=3) {
      const floaters=_getFloating(group);
      chain++; chainTimer=3000;
      const pts=group.length*group.length*10*level*chain+floaters.length*50*level*chain;
      score+=pts; if(score>best)best=score;

      SFX.pop(group.length);
      if(floaters.length) setTimeout(()=>SFX.floaters(floaters.length),120);
      if(chain>=2) setTimeout(()=>SFX.chain(chain),200);

      const avgCv=group.reduce((a,{r,c})=>{const cv=cellXY(r,c);a.x+=cv.x;a.y+=cv.y;return a;},{x:0,y:0});
      avgCv.x/=group.length; avgCv.y/=group.length;
      group.forEach(({r,c})=>_popCell(r,c,false));
      // Floaters fall with gravity — spawn as falling bubbles not pop particles
      floaters.forEach(({r,c})=>_spawnFloater(r,c));
      _trimEmptyRows();
      _addScoreSprite(avgCv.x,avgCv.y-20,chain>1?`CHAIN×${chain}! +${pts}`:`+${pts}`);

      if(window.FX){
        const rect=container.getBoundingClientRect();
        group.forEach(({r,c})=>{const cv=cellXY(r,c);FX.burst(rect.left+(cv.x/W)*rect.width,rect.top+(cv.y/H)*rect.height,{count:10,colors:[ALL_COLORS[ci].css,'#fff'],speed:4,life:35,size:3,shape:'circle',gravity:0.12});});
        if(chain>=2){FX.screenFlash(ALL_COLORS[ci].css,0.2);FX.shake(4);}
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
    dropTimer=DROP_SECS*1000;
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
      const m=new THREE.Mesh(sphereGeo(R*0.45),new THREE.MeshBasicMaterial({color:ALL_COLORS[ci].hex,transparent:true,opacity:1}));
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

  // Power-up particle burst — coloured particles matching the power type
  function _spawnPowerParticles(powerKey, cx, cy) {
    const configs = {
      fire:      { colors:[0xff6a00,0xff2d78,0xffe600], count:18, speed:5 },
      water:     { colors:[0x00f5ff,0x0088ff,0xffffff], count:14, speed:4 },
      lightning: { colors:[0xffe600,0xffffff,0xbf00ff], count:22, speed:7 },
      star:      { colors:[0xffe600,0xffffff,0xffaaff], count:20, speed:6 },
    };
    const cfg = configs[powerKey] || configs.star;
    for (let i=0; i<cfg.count; i++) {
      const col = cfg.colors[Math.floor(Math.random()*cfg.colors.length)];
      const r   = R * (0.18 + Math.random()*0.22);
      const mesh = new THREE.Mesh(
        sphereGeo(Math.max(2,Math.round(r))),
        new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:1})
      );
      mesh.position.copy(tw(cx,cy)); mesh.position.z=6; scene.add(mesh);
      const ang  = Math.random()*Math.PI*2;
      const spd  = cfg.speed*(0.5+Math.random());
      // For lightning, shoot horizontally; for star, spray in all directions
      const vxp  = powerKey==='lightning' ? Math.cos(ang)*spd*2 : Math.cos(ang)*spd;
      const vyp  = powerKey==='lightning' ? (Math.random()-0.5)*spd : Math.sin(ang)*spd;
      popParticles.push({mesh, x:cx, y:cy, vx:vxp, vy:vyp, alpha:1, scale:1, isFloater:false, isSpark:true});
    }
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
    if (!grid[row]||!grid[row][col]||grid[row][col].power) return [];
    const ci=grid[row][col].ci;
    const visited=new Set(),result=[],stack=[[row,col]];
    while (stack.length) {
      const [r,c]=stack.pop(); const key=r+','+c;
      if (visited.has(key)) continue;
      if (r<0||r>=grid.length) continue;
      if (c<0||c>=colsForRow(r)) continue;
      if (!grid[r]||!grid[r][c]||grid[r][c].ci!==ci||grid[r][c].power) continue;
      visited.add(key); result.push({r,c});
      stack.push(..._hexNeighbors(r,c));
    }
    return result;
  }

  function _getFloating(justPopped) {
    const poppedKeys=new Set(justPopped.map(({r,c})=>r+','+c));
    const attached=new Set(),q=[];
    for (let c=0;c<colsForRow(0);c++){const key='0,'+c;if(!poppedKeys.has(key)&&grid[0]&&grid[0][c]){q.push([0,c]);attached.add(key);}}
    while (q.length){
      const [r,c]=q.shift();
      for (const [nr,nc] of _hexNeighbors(r,c)){
        const key=nr+','+nc;
        if (attached.has(key)||poppedKeys.has(key)) continue;
        if (nr<0||nr>=grid.length||nc<0||nc>=colsForRow(nr)) continue;
        if (!grid[nr]||!grid[nr][nc]) continue;
        attached.add(key); q.push([nr,nc]);
      }
    }
    const floating=[];
    for (let r=0;r<grid.length;r++) for (let c=0;c<colsForRow(r);c++){
      const key=r+','+c;
      if (!poppedKeys.has(key)&&grid[r]&&grid[r][c]&&!attached.has(key)) floating.push({r,c});
    }
    return floating;
  }

  function _hexNeighbors(r,c){const e=r%2===0;return[[r-1,e?c-1:c],[r-1,e?c:c+1],[r,c-1],[r,c+1],[r+1,e?c-1:c],[r+1,e?c:c+1]];}
  function _trimEmptyRows(){while(grid.length&&(grid[grid.length-1]||[]).every(b=>!b))grid.pop();}

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
    dropTimer=DROP_SECS*1000; elapsedMs=0; cannonAngle=-Math.PI/2;
    if(ball){if(ball.mesh)scene.remove(ball.mesh);ball=null;}
    trailPool.forEach(m=>scene.remove(m)); trailPool=[];
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

  function destroy() {
    dead=true;
    if(animId){cancelAnimationFrame(animId);animId=null;}
    _unbindEvents();
    // Don't dispose renderer — game may be re-entered via the arcade menu.
    // The loop will restart cleanly when newGame() is called again.
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
    const secs=Math.floor(elapsedMs/1000);
    s('bam3d-time',`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`);

    // Drop bar
    const dropBar=document.getElementById('bam3d-drop-bar');
    if(dropBar){const f=Math.max(0,dropTimer/(DROP_SECS*1000));dropBar.style.width=(f*100)+'%';dropBar.style.background=f<0.25?'#ff2d78':f<0.5?'#ffe600':'#00f5ff';}

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
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
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
    const base=new THREE.Mesh(new THREE.CylinderGeometry(R*1.7,R*2,R*0.3,24),new THREE.MeshPhongMaterial({color:0x0a1e30,emissive:0x002244,shininess:80}));
    base.rotation.x=Math.PI/2; cannonGroup.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(R*1.8,R*0.06,8,32),new THREE.MeshPhongMaterial({color:0x00f5ff,emissive:0x00f5ff,emissiveIntensity:0.7}));
    cannonGroup.add(ring);
    cannonBarrel=new THREE.Group(); cannonGroup.add(cannonBarrel);
    const bar=new THREE.Mesh(new THREE.CylinderGeometry(R*0.28,R*0.38,R*3.2,12),new THREE.MeshPhongMaterial({color:0x2266aa,emissive:0x001133,shininess:120}));
    bar.position.y=R*1.6; cannonBarrel.add(bar);
    const muzzle=new THREE.Mesh(new THREE.TorusGeometry(R*0.32,R*0.09,8,16),new THREE.MeshPhongMaterial({color:0x00f5ff,emissive:0x00f5ff,emissiveIntensity:0.9}));
    muzzle.position.y=R*3.2; cannonBarrel.add(muzzle);
    _repositionCannon();
  }
  function _repositionCannon(){if(!cannonGroup)return;cannonGroup.position.set(cannonX(),H-cannonCY(),2);}
  function _updateBarrel(){if(!cannonBarrel)return;cannonBarrel.rotation.z=-(cannonAngle+Math.PI/2);}

  // ── Aim line ──────────────────────────────────────────────────
  function _buildAimLine(){
    aimLineMesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0)]),new THREE.LineDashedMaterial({color:0xffffff,dashSize:6,gapSize:9,transparent:true,opacity:0.5}));
    scene.add(aimLineMesh);
  }
  function _invalidateAim(){_aimDirty=true;}
  function _updateAimLine(){
    if(!aimLineMesh)return;
    if(!queue.length||dead||paused||ball){aimLineMesh.visible=false;return;}
    aimLineMesh.visible=true;
    if(_aimDirty||_aimLastAngle!==cannonAngle){
      let vx=Math.cos(cannonAngle),vy=Math.sin(cannonAngle);
      let x=cannonX(),y=cannonCY();
      const pillarW=0, wallL=R, wallR=W-R;
      const pts=[];
      for(let i=0;i<Math.ceil(H/SHOOT_SPEED)*6;i++){
        x+=vx*SHOOT_SPEED; y+=vy*SHOOT_SPEED;
        if(x<wallL){x=wallL;vx=Math.abs(vx);pts.push(tw(x,y));}
        if(x>wallR){x=wallR;vx=-Math.abs(vx);pts.push(tw(x,y));}
        if(y<CEILING_PAD+R*2){pts.push(tw(x,CEILING_PAD+R));break;}
        pts.push(tw(x,y));
        let hit=false;
        for(let r=0;r<grid.length&&!hit;r++) for(let c=0;c<colsForRow(r)&&!hit;c++){
          if(!grid[r]||!grid[r][c])continue;
          const cv=cellXY(r,c),dx=x-cv.x,dy=y-cv.y;
          if(dx*dx+dy*dy<(D*1.05)*(D*1.05)){pts.push(tw(x,y));hit=true;}
        }
        if(hit)break;
      }
      _aimPts=pts.length?pts:[tw(cannonX(),cannonCY())];
      _aimLastAngle=cannonAngle; _aimDirty=false;
    }
    aimLineMesh.geometry.dispose();
    aimLineMesh.geometry=new THREE.BufferGeometry().setFromPoints(_aimPts);
    aimLineMesh.computeLineDistances();
    aimLineMesh.material.color.setHex(ALL_COLORS[queue[0]?.ci??0].hex);
  }

  // ── Render loop ───────────────────────────────────────────────
  function _loop(ts=0){
    animId=requestAnimationFrame(_loop);
    if(document.hidden)return;
    const dt=Math.min(ts-lastTs,50);lastTs=ts;
    if(!paused&&!dead)update(dt);
    _updateAimLine();
    if(renderer&&scene&&camera)renderer.render(scene,camera);
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
  function _bindEvents(){
    if(!container)return;
    container.addEventListener('mousemove',_onMouseMove);
    container.addEventListener('click',_onClick);
    container.addEventListener('touchmove',_onTouch,{passive:false});
    container.addEventListener('touchend',_onTouchEnd);
    document.addEventListener('keydown',_onKeyDown);
    document.addEventListener('keyup',_onKeyUp);
  }
  function _unbindEvents(){
    if(container){container.removeEventListener('mousemove',_onMouseMove);container.removeEventListener('click',_onClick);container.removeEventListener('touchmove',_onTouch);container.removeEventListener('touchend',_onTouchEnd);}
    document.removeEventListener('keydown',_onKeyDown);
    document.removeEventListener('keyup',_onKeyUp);
  }

  return {
    newGame: ()=>{if(!renderer){initThree();_bindEvents();}newGame();},
    destroy, togglePause,
    getCurrentScore:()=>score,
  };
})();
