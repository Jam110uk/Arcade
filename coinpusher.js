// ============================================================
//  COIN PUSHER  —  British beach arcade coin pusher
//  export default { init, destroy }
//
//  Mechanics:
//    - Player starts with £1.00 (50 × 2p coins)
//    - Drop a 2p coin from the top chute
//    - Coin falls through pegs, lands on upper shelf
//    - Upper pusher plate slides back/forth pushing coins forward
//    - Coins fall off upper shelf onto lower shelf
//    - Lower pusher pushes coins off into the tray (winnings)
//    - Bonus emoji items on shelves — push them off for prizes
//    - 3D isometric-style canvas rendering
// ============================================================

export default (() => {

  // ── Canvas / state ───────────────────────────────────────────
  let canvas, ctx, wrap, container;
  let rafId = null, destroyed = false;
  let lastTs = 0;

  // ── Game constants ───────────────────────────────────────────
  const SHELF_W   = 380;   // logical shelf width
  const SHELF_D   = 110;   // shelf depth (how far back coins can sit)
  const COIN_R    = 11;    // 2p coin radius
  const PUSHER_SPEED = 28; // px per second the pusher moves

  // ── Money ────────────────────────────────────────────────────
  let playerMoney  = 100;   // pence — starts at £1.00
  let winnings     = 0;     // pence won this session
  let coinsInHand  = Math.floor(playerMoney / 2); // 50 × 2p

  // ── Drop zone ────────────────────────────────────────────────
  let dropX        = SHELF_W / 2;  // where player is aiming
  let dropActive   = false;        // coin currently falling from top
  let dropCoin     = null;         // { x, y, vx, vy, spin }

  // ── Shelves ──────────────────────────────────────────────────
  // Each shelf: array of items { x, y (depth 0-SHELF_D), vx, type, value, emoji, spin, wobble }
  // type: 'coin' | 'bonus'
  // x: 0..SHELF_W, y: depth on shelf (0=front edge, SHELF_D=back)

  let upperShelf  = [];  // coins resting on upper shelf
  let lowerShelf  = [];  // coins resting on lower shelf

  // Pusher plates
  let upperPusher = { x: SHELF_D * 0.85, dir: 1 };  // depth position
  let lowerPusher = { x: SHELF_D * 0.85, dir: 1 };

  // ── Pegs (obstacles on the fall chute) ───────────────────────
  const PEGS = [
    { x: 0.2, y: 0.25 }, { x: 0.5, y: 0.18 }, { x: 0.78, y: 0.28 },
    { x: 0.35, y: 0.42 }, { x: 0.65, y: 0.38 }, { x: 0.15, y: 0.56 },
    { x: 0.85, y: 0.52 }, { x: 0.5, y: 0.60 },
  ];

  // ── Bonus items (spawned periodically on back of upper shelf) ──
  const BONUS_ITEMS = [
    { emoji: '⭐', value: 10, label: '10p' },
    { emoji: '🍀', value: 20, label: '20p' },
    { emoji: '💎', value: 50, label: '50p' },
    { emoji: '🎰', value: 100, label: '£1!' },
    { emoji: '🌈', value: 30, label: '30p' },
    { emoji: '🍭', value: 5,  label: '5p'  },
    { emoji: '🎁', value: 25, label: '25p' },
    { emoji: '🦄', value: 40, label: '40p' },
  ];
  let bonusSpawnTimer = 4.0;

  // ── Win tray animation ────────────────────────────────────────
  let trayCoins   = [];   // { x, t, emoji, value } coins falling into tray
  let winFlashes  = [];   // { text, x, y, t, color }

  // ── Audio ─────────────────────────────────────────────────────
  let audioCtx;
  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function tone(freq, dur, vol = 0.08, delay = 0, type = 'sine') {
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = Math.min(freq * 2.5, 2200); f.Q.value = 0.5;
      o.connect(f); f.connect(g); g.connect(a.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, a.currentTime + delay);
      g.gain.setValueAtTime(0, a.currentTime + delay);
      g.gain.linearRampToValueAtTime(vol, a.currentTime + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + dur);
      o.start(a.currentTime + delay); o.stop(a.currentTime + delay + dur + 0.05);
    } catch(e) {}
  }
  function sndClink()   { tone(900 + Math.random()*200, 0.08, 0.10, 0, 'triangle'); }
  function sndDrop()    { tone(600, 0.12, 0.09, 0, 'sine'); tone(400, 0.10, 0.07, 0.05, 'sine'); }
  function sndWin(val)  {
    const f = val >= 50 ? 784 : val >= 20 ? 659 : 523;
    tone(f, 0.18, 0.10); tone(f*1.25, 0.14, 0.08, 0.12); if (val >= 50) tone(f*1.5, 0.12, 0.07, 0.24);
  }
  function sndBonus()   { tone(1046, 0.12, 0.09); tone(1318, 0.10, 0.08, 0.10); tone(1568, 0.08, 0.07, 0.20); }

  // ── Geometry helpers ─────────────────────────────────────────
  // Convert shelf coords to canvas screen coords (isometric-ish projection)
  // shelfId: 0=upper, 1=lower
  // sx: 0..SHELF_W (left/right), sd: 0..SHELF_D (front/back depth)
  let VIEW;  // computed in resize()

  function shelfToScreen(shelfId, sx, sd) {
    // Isometric: x goes right, depth goes up-right
    const isoX = VIEW.originX + sx * VIEW.scaleX - sd * VIEW.depthX;
    const isoY = VIEW.originY[shelfId] + sd * VIEW.depthY - sx * VIEW.skewY;
    return { x: isoX, y: isoY };
  }

  function computeView(W, H) {
    // Scale everything to fit canvas
    const scale  = Math.min(W / 560, H / 520);
    const scaleX = scale;
    const depthX = scale * 0.45;
    const depthY = scale * 0.28;
    const skewY  = scale * 0.02;
    const shelfH = scale * 38;  // visual height of shelf surface
    const gap    = scale * 90;  // vertical gap between shelves

    // Upper shelf top-left screen origin
    const totalW = SHELF_W * scaleX + SHELF_D * depthX;
    const startX = (W - totalW) / 2 + SHELF_D * depthX;
    const upperY = H * 0.28;
    const lowerY = upperY + shelfH + gap;

    VIEW = {
      W, H, scale,
      scaleX, depthX, depthY, skewY, shelfH,
      originX: startX,
      originY: [upperY, lowerY],
      // Chute area (coin drop zone) above upper shelf
      chuteTop: upperY - scale * 195,
      chuteBot: upperY,
      trayY:    lowerY + shelfH + scale * 52,
      // Shelf surface polygon corners (for clipping/drawing)
      shelf: (id) => {
        const o = { x: VIEW.originX, y: VIEW.originY[id] };
        return [
          { x: o.x,                                 y: o.y },
          { x: o.x + SHELF_W * scaleX,              y: o.y - SHELF_W * skewY },
          { x: o.x + SHELF_W * scaleX - SHELF_D * depthX, y: o.y - SHELF_W * skewY + SHELF_D * depthY },
          { x: o.x - SHELF_D * depthX,              y: o.y + SHELF_D * depthY },
        ];
      },
    };
  }

  // ── Seed initial coins on shelves ─────────────────────────────
  function seedShelves() {
    upperShelf = []; lowerShelf = [];
    // Scatter some coins on both shelves to start
    for (let i = 0; i < 18; i++) {
      upperShelf.push(makeCoin(
        COIN_R + Math.random() * (SHELF_W - COIN_R*2),
        Math.random() * SHELF_D * 0.7 + SHELF_D * 0.15
      ));
    }
    for (let i = 0; i < 22; i++) {
      lowerShelf.push(makeCoin(
        COIN_R + Math.random() * (SHELF_W - COIN_R*2),
        Math.random() * SHELF_D * 0.7 + SHELF_D * 0.1
      ));
    }
    // A couple of bonus items
    upperShelf.push(makeBonus(SHELF_W * 0.3, SHELF_D * 0.6));
    upperShelf.push(makeBonus(SHELF_W * 0.7, SHELF_D * 0.55));
    lowerShelf.push(makeBonus(SHELF_W * 0.5, SHELF_D * 0.5));
  }

  function makeCoin(x, depth) {
    return { x, depth, vx: 0, type: 'coin', value: 2, spin: Math.random()*Math.PI*2, wobble: 0 };
  }

  function makeBonus(x, depth) {
    const b = BONUS_ITEMS[Math.floor(Math.random() * BONUS_ITEMS.length)];
    return { x, depth, vx: 0, type: 'bonus', value: b.value, emoji: b.emoji, label: b.label,
             spin: 0, wobble: 0, bob: Math.random() * Math.PI * 2 };
  }

  // ── Main update ───────────────────────────────────────────────
  function update(dt) {
    dt = Math.min(dt, 0.05);

    // Bonus spawn
    bonusSpawnTimer -= dt;
    if (bonusSpawnTimer <= 0) {
      bonusSpawnTimer = 6 + Math.random() * 8;
      // Spawn on back row of upper shelf
      upperShelf.push(makeBonus(
        COIN_R * 3 + Math.random() * (SHELF_W - COIN_R * 6),
        SHELF_D * 0.82 + Math.random() * SHELF_D * 0.12
      ));
    }

    // Animate bonus item bob
    upperShelf.forEach(c => { if (c.type === 'bonus') c.bob = (c.bob || 0) + dt * 2.5; });
    lowerShelf.forEach(c => { if (c.type === 'bonus') c.bob = (c.bob || 0) + dt * 2.5; });

    // Move pushers
    upperPusher.x += PUSHER_SPEED * dt * upperPusher.dir;
    if (upperPusher.x >= SHELF_D * 0.92) { upperPusher.x = SHELF_D * 0.92; upperPusher.dir = -1; }
    if (upperPusher.x <= SHELF_D * 0.28) { upperPusher.x = SHELF_D * 0.28; upperPusher.dir =  1; }

    lowerPusher.x += PUSHER_SPEED * dt * lowerPusher.dir;
    if (lowerPusher.x >= SHELF_D * 0.92) { lowerPusher.x = SHELF_D * 0.92; lowerPusher.dir = -1; }
    if (lowerPusher.x <= SHELF_D * 0.28) { lowerPusher.x = SHELF_D * 0.28; lowerPusher.dir =  1; }

    // Push coins on shelves
    pushShelf(upperShelf, upperPusher, 0);
    pushShelf(lowerShelf, lowerPusher, 1);

    // Drop coin physics
    if (dropActive && dropCoin) {
      dropCoin.vy += 900 * dt;
      dropCoin.x  += dropCoin.vx * dt;
      dropCoin.y  += dropCoin.vy * dt;
      dropCoin.spin += dt * 4;

      // Clamp to chute width
      if (dropCoin.x < COIN_R)            { dropCoin.x = COIN_R;            dropCoin.vx *= -0.5; }
      if (dropCoin.x > SHELF_W - COIN_R)  { dropCoin.x = SHELF_W - COIN_R;  dropCoin.vx *= -0.5; }

      // Peg collisions
      PEGS.forEach(peg => {
        const px = peg.x * SHELF_W;
        const chuteH = VIEW ? (VIEW.chuteBot - VIEW.chuteTop) : 200;
        const py_screen = VIEW ? VIEW.chuteTop + peg.y * chuteH : peg.y * 200;
        // Work in chute-local coords: dropCoin.y is screen Y within chute
        const py_local = peg.y * (VIEW ? (VIEW.chuteBot - VIEW.chuteTop) : 200);
        const dx = dropCoin.x - px;
        const dy = dropCoin.y - py_local;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < COIN_R + 7 && dist > 0.1) {
          const nx = dx / dist, ny = dy / dist;
          const dot = dropCoin.vx * nx + dropCoin.vy * ny;
          dropCoin.vx -= 1.6 * dot * nx + (Math.random()-0.5)*40;
          dropCoin.vy -= 1.6 * dot * ny;
          dropCoin.x = px + nx * (COIN_R + 7.5);
          dropCoin.y = py_local + ny * (COIN_R + 7.5);
          sndClink();
        }
      });

      // Landed on upper shelf
      const chuteH = VIEW ? (VIEW.chuteBot - VIEW.chuteTop) : 200;
      if (dropCoin.y >= chuteH) {
        // Place at mid-depth of upper shelf, velocity becomes lateral
        const item = makeCoin(dropCoin.x, SHELF_D * 0.72);
        item.vx = dropCoin.vx * 0.3;
        upperShelf.push(item);
        dropActive = false;
        dropCoin   = null;
        sndDrop();
      }
    }

    // Tray coin animations
    trayCoins.forEach(c => { c.t += dt; });
    trayCoins = trayCoins.filter(c => c.t < 1.2);

    // Win flash animations
    winFlashes.forEach(f => { f.t += dt; });
    winFlashes = winFlashes.filter(f => f.t < 1.6);
  }

  function pushShelf(shelf, pusher, shelfId) {
    // Move coins pushed by the pusher plate (anything behind pusher.x gets pushed forward)
    shelf.forEach(coin => {
      if (coin.depth > pusher.x - COIN_R * 0.8) {
        // Being pushed forward (decreasing depth = toward front edge)
        const pushAmt = (coin.depth - (pusher.x - COIN_R * 0.8)) * 0.08;
        coin.depth -= pushAmt + 0.4;
      }
      // Lateral drift from vx
      coin.x += coin.vx;
      coin.vx *= 0.88;
      // Bounce off side walls
      if (coin.x < COIN_R)           { coin.x = COIN_R;           coin.vx *= -0.5; }
      if (coin.x > SHELF_W - COIN_R) { coin.x = SHELF_W - COIN_R; coin.vx *= -0.5; }
      // Simple coin-coin separation
      shelf.forEach(other => {
        if (other === coin) return;
        const dx = coin.x - other.x;
        const dd = coin.depth - other.depth;
        const dist = Math.sqrt(dx*dx + dd*dd);
        if (dist < COIN_R * 1.85 && dist > 0.1) {
          const f = (COIN_R * 1.85 - dist) * 0.15;
          coin.x += (dx / dist) * f; other.x -= (dx / dist) * f;
          coin.depth += (dd / dist) * f; other.depth -= (dd / dist) * f;
        }
      });
    });

    // Coins off front edge (depth < 0) fall to next shelf or tray
    const fallen = shelf.filter(c => c.depth < -COIN_R);
    fallen.forEach(coin => {
      if (shelfId === 0) {
        // Falls onto lower shelf
        const item = { ...coin, depth: SHELF_D * 0.75 };
        lowerShelf.push(item);
        sndClink();
      } else {
        // Falls into tray — win!
        collectCoin(coin);
      }
    });
    // Remove fallen
    const keep = shelf.filter(c => c.depth >= -COIN_R);
    shelf.length = 0; keep.forEach(c => shelf.push(c));

    // Clamp depth to back wall
    shelf.forEach(c => { if (c.depth > SHELF_D - COIN_R) c.depth = SHELF_D - COIN_R; });
  }

  function collectCoin(coin) {
    winnings    += coin.value;
    playerMoney += coin.value;
    sndWin(coin.value);
    if (coin.type === 'bonus') sndBonus();

    const label = coin.type === 'bonus' ? `${coin.emoji} +${coin.label || coin.value+'p'}` : `+${coin.value}p`;
    const color = coin.type === 'bonus' ? '#ffdd00' : '#00ff88';
    // Tray visual
    trayCoins.push({ x: coin.x, t: 0, emoji: coin.type === 'bonus' ? coin.emoji : null, value: coin.value });
    winFlashes.push({ text: label, x: coin.x / SHELF_W, t: 0, color });
  }

  // ── Drop a coin ───────────────────────────────────────────────
  function dropPlayerCoin() {
    if (dropActive) return;
    if (playerMoney < 2) return;
    if (!VIEW) return;
    try { ac().resume(); } catch(e) {}

    playerMoney -= 2;
    coinsInHand  = Math.floor(playerMoney / 2);
    dropActive   = true;

    const chuteH = VIEW.chuteBot - VIEW.chuteTop;
    dropCoin = {
      x:    dropX,
      y:    COIN_R * 2,
      vx:   (Math.random() - 0.5) * 30,
      vy:   60,
      spin: 0,
    };
    tone(800, 0.06, 0.07, 0, 'sine');
  }

  // ── Drawing ───────────────────────────────────────────────────
  function draw() {
    if (!ctx || !VIEW) return;
    const { W, H, scale } = VIEW;
    ctx.clearRect(0, 0, W, H);

    // ── Background — seaside arcade feel ─────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0520');
    bg.addColorStop(0.5, '#12062e');
    bg.addColorStop(1, '#1a0a3a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle arcade light strips at top
    for (let i = 0; i < 8; i++) {
      const hue = (i / 8) * 360;
      ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.12)`;
      ctx.fillRect(i * W/8, 0, W/8, 4);
    }

    drawCabinet();
    drawChute();
    drawShelf(0, upperShelf, upperPusher);
    drawShelf(1, lowerShelf, lowerPusher);
    drawTray();
    drawDropCoin();
    drawHUD();
    drawWinFlashes();
  }

  function drawCabinet() {
    const { W, H, scale } = VIEW;
    // Side walls of cabinet
    ctx.save();
    ctx.fillStyle = 'rgba(80,40,120,0.35)';
    ctx.strokeStyle = 'rgba(180,100,255,0.3)';
    ctx.lineWidth = 2 * scale;
    // Left wall
    ctx.beginPath();
    ctx.rect(VIEW.originX - SHELF_D * VIEW.depthX - scale*18, VIEW.chuteTop - scale*10,
             scale*18, VIEW.trayY - VIEW.chuteTop + scale*20);
    ctx.fill(); ctx.stroke();
    // Right wall
    ctx.beginPath();
    ctx.rect(VIEW.originX + SHELF_W * VIEW.scaleX + scale*2, VIEW.chuteTop - scale*10,
             scale*18, VIEW.trayY - VIEW.chuteTop + scale*20);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawChute() {
    const { scale, chuteTop, chuteBot, originX, scaleX } = VIEW;
    const chuteH = chuteBot - chuteTop;

    // Chute background
    ctx.save();
    const cg = ctx.createLinearGradient(0, chuteTop, 0, chuteBot);
    cg.addColorStop(0, 'rgba(20,10,50,0.9)');
    cg.addColorStop(1, 'rgba(40,20,80,0.7)');
    ctx.fillStyle = cg;
    ctx.fillRect(originX - scale*2, chuteTop, SHELF_W * scaleX + scale*4, chuteH);

    // Chute border
    ctx.strokeStyle = 'rgba(140,80,220,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(originX - scale*2, chuteTop, SHELF_W * scaleX + scale*4, chuteH);

    // Draw pegs
    PEGS.forEach(peg => {
      const px = originX + peg.x * SHELF_W * scaleX;
      const py = chuteTop + peg.y * chuteH;
      ctx.beginPath();
      ctx.arc(px, py, scale * 5, 0, Math.PI * 2);
      ctx.fillStyle = '#e0c060';
      ctx.shadowColor = 'rgba(255,200,0,0.6)';
      ctx.shadowBlur  = 6;
      ctx.fill();
      ctx.shadowBlur  = 0;
    });

    // Drop aim line
    const aimX = originX + dropX * scaleX;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0,255,200,0.35)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(aimX, chuteTop - scale*5);
    ctx.lineTo(aimX, chuteTop + chuteH * 0.3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Drop arrow
    ctx.fillStyle = 'rgba(0,255,200,0.7)';
    ctx.beginPath();
    ctx.moveTo(aimX, chuteTop - scale*3);
    ctx.lineTo(aimX - scale*7, chuteTop - scale*16);
    ctx.lineTo(aimX + scale*7, chuteTop - scale*16);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawShelf(shelfId, coins, pusher) {
    const { scale, shelfH, scaleX, depthX, depthY, skewY, originX, originY } = VIEW;
    const corners = VIEW.shelf(shelfId);

    ctx.save();

    // Shelf surface
    ctx.beginPath();
    corners.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    const sg = ctx.createLinearGradient(corners[0].x, corners[0].y, corners[3].x, corners[3].y);
    sg.addColorStop(0, '#2a1045');
    sg.addColorStop(1, '#3d1a60');
    ctx.fillStyle   = sg;
    ctx.strokeStyle = 'rgba(180,100,255,0.4)';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();

    // Shelf front face
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[1].x, corners[1].y + shelfH);
    ctx.lineTo(corners[0].x, corners[0].y + shelfH);
    ctx.closePath();
    ctx.fillStyle   = '#1a0830';
    ctx.strokeStyle = 'rgba(120,60,200,0.4)';
    ctx.fill(); ctx.stroke();

    // Draw pusher plate
    drawPusher(shelfId, pusher);

    // Draw coins (sorted by depth — back ones first for occlusion)
    const sorted = [...coins].sort((a, b) => b.depth - a.depth);
    sorted.forEach(coin => drawShelfItem(shelfId, coin));

    ctx.restore();
  }

  function drawPusher(shelfId, pusher) {
    const { scaleX, depthX, depthY, skewY, originX, originY, shelfH, scale } = VIEW;
    // Pusher plate goes full width at a certain depth
    const p0 = shelfToScreen(shelfId, 0,         pusher.x);
    const p1 = shelfToScreen(shelfId, SHELF_W,   pusher.x);

    ctx.save();
    // Plate top face
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p1.x, p1.y + shelfH * 0.55);
    ctx.lineTo(p0.x, p0.y + shelfH * 0.55);
    ctx.closePath();
    ctx.fillStyle   = 'rgba(200,160,255,0.18)';
    ctx.strokeStyle = 'rgba(220,180,255,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawShelfItem(shelfId, coin) {
    const pos = shelfToScreen(shelfId, coin.x, coin.depth);
    const { scale } = VIEW;
    const r = COIN_R * scale * 0.95;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    if (coin.type === 'bonus') {
      // Floating bonus item with bob
      const bobOffset = Math.sin(coin.bob || 0) * scale * 3;
      ctx.translate(0, bobOffset - scale * 4);

      // Glow halo
      ctx.shadowColor = '#ffdd00';
      ctx.shadowBlur  = 14 * scale;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,221,0,0.15)';
      ctx.fill();
      ctx.shadowBlur = 0;

      // Emoji
      ctx.font = `${r * 1.9}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(coin.emoji, 0, 0);

      // Value label
      ctx.font      = `bold ${r * 0.72}px 'Orbitron', sans-serif`;
      ctx.fillStyle = '#ffdd00';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur  = 3;
      ctx.fillText(coin.label || `${coin.value}p`, 0, r * 1.55);
      ctx.shadowBlur = 0;

    } else {
      // 2p coin — shiny bronze/copper ellipse (isometric foreshortening)
      const ry = r * 0.38;  // foreshortened vertical radius

      // Coin edge (thickness)
      ctx.beginPath();
      ctx.ellipse(0, r * 0.12, r, ry * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7a4a10';
      ctx.fill();

      // Coin face
      const cg = ctx.createRadialGradient(-r*0.25, -ry*0.3, r*0.05, 0, 0, r);
      cg.addColorStop(0, '#e8a840');
      cg.addColorStop(0.5, '#c07820');
      cg.addColorStop(1, '#8a5010');
      ctx.beginPath();
      ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = cg;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur  = 3;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Shine highlight
      ctx.beginPath();
      ctx.ellipse(-r*0.2, -ry*0.25, r*0.38, ry*0.28, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,220,100,0.45)';
      ctx.fill();

      // "2p" text
      ctx.font      = `bold ${r * 0.62}px 'Orbitron', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('2p', 0, -ry * 0.05);
    }

    ctx.restore();
  }

  function drawTray() {
    const { W, H, scale, originX, scaleX, trayY } = VIEW;
    const trayW = SHELF_W * scaleX;
    const trayH = scale * 42;

    ctx.save();
    // Tray body
    const tg = ctx.createLinearGradient(0, trayY, 0, trayY + trayH);
    tg.addColorStop(0, '#2a0a50');
    tg.addColorStop(1, '#18063a');
    ctx.fillStyle   = tg;
    ctx.strokeStyle = 'rgba(180,100,255,0.5)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.rect(originX, trayY, trayW, trayH);
    ctx.fill(); ctx.stroke();

    // "WINNINGS" label
    ctx.font      = `${scale * 8}px 'Orbitron', sans-serif`;
    ctx.fillStyle = 'rgba(180,100,255,0.5)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('WINNINGS', originX + trayW/2, trayY + trayH/2);

    // Tray coins falling in
    trayCoins.forEach(tc => {
      const tx = originX + tc.x * scaleX;
      const ty = trayY + tc.t * trayH * 1.1;
      const alpha = Math.max(0, 1 - tc.t * 1.2);
      ctx.globalAlpha = alpha;
      if (tc.emoji) {
        ctx.font = `${scale * 14}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tc.emoji, tx, ty);
      } else {
        ctx.beginPath();
        ctx.ellipse(tx, ty, scale * 9, scale * 4, 0, 0, Math.PI * 2);
        const cg = ctx.createRadialGradient(tx - scale*2, ty - scale, scale, tx, ty, scale*9);
        cg.addColorStop(0, '#e8a840'); cg.addColorStop(1, '#8a5010');
        ctx.fillStyle = cg;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }

  function drawDropCoin() {
    if (!dropActive || !dropCoin || !VIEW) return;
    const { originX, scaleX, chuteTop, scale } = VIEW;
    const sx = originX + dropCoin.x * scaleX;
    const sy = chuteTop + dropCoin.y;
    const r  = COIN_R * scale;
    const ry = r * 0.38;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(dropCoin.spin * 0.15);

    // Edge
    ctx.beginPath();
    ctx.ellipse(0, r * 0.12, r, ry * 1.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7a4a10'; ctx.fill();
    // Face
    const cg = ctx.createRadialGradient(-r*0.25, -ry*0.3, r*0.05, 0, 0, r);
    cg.addColorStop(0, '#e8a840'); cg.addColorStop(0.5, '#c07820'); cg.addColorStop(1, '#8a5010');
    ctx.beginPath();
    ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = cg;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6;
    ctx.fill(); ctx.shadowBlur = 0;
    // Shine
    ctx.beginPath();
    ctx.ellipse(-r*0.2, -ry*0.25, r*0.38, ry*0.28, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,220,100,0.5)'; ctx.fill();
    // Label
    ctx.font = `bold ${r * 0.62}px 'Orbitron', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('2p', 0, 0);
    ctx.restore();
  }

  function drawHUD() {
    const { W, H, scale, chuteTop } = VIEW;
    ctx.save();

    // Top HUD bar
    ctx.fillStyle = 'rgba(10,5,30,0.85)';
    ctx.fillRect(0, 0, W, chuteTop - scale * 22);

    const fs = Math.max(10, scale * 13);
    ctx.font      = `${fs * 0.7}px 'Share Tech Mono', monospace`;
    ctx.textBaseline = 'middle';

    const hudY = (chuteTop - scale * 22) / 2;

    // Balance
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(140,80,220,0.6)';
    ctx.fillText('BALANCE', scale * 14, hudY - fs * 0.6);
    ctx.font      = `${fs}px 'Orbitron', sans-serif`;
    ctx.fillStyle = playerMoney < 10 ? '#ff4444' : '#00ff88';
    ctx.shadowColor = playerMoney < 10 ? 'rgba(255,68,68,0.5)' : 'rgba(0,255,136,0.4)';
    ctx.shadowBlur  = 8;
    ctx.fillText(`£${(playerMoney/100).toFixed(2)}`, scale * 14, hudY + fs * 0.5);
    ctx.shadowBlur = 0;

    // Winnings
    ctx.textAlign = 'center';
    ctx.font      = `${fs * 0.7}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = 'rgba(140,80,220,0.6)';
    ctx.fillText('WINNINGS', W / 2, hudY - fs * 0.6);
    ctx.font      = `${fs}px 'Orbitron', sans-serif`;
    ctx.fillStyle = '#ffdd00';
    ctx.shadowColor = 'rgba(255,221,0,0.4)'; ctx.shadowBlur = 8;
    ctx.fillText(`£${(winnings/100).toFixed(2)}`, W / 2, hudY + fs * 0.5);
    ctx.shadowBlur = 0;

    // Coins left
    ctx.textAlign = 'right';
    ctx.font      = `${fs * 0.7}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = 'rgba(140,80,220,0.6)';
    ctx.fillText('COINS', W - scale*14, hudY - fs * 0.6);
    ctx.font      = `${fs}px 'Orbitron', sans-serif`;
    ctx.fillStyle = '#00e5ff';
    ctx.shadowColor = 'rgba(0,229,255,0.4)'; ctx.shadowBlur = 8;
    ctx.fillText(`${Math.floor(playerMoney/2)} × 2p`, W - scale*14, hudY + fs * 0.5);
    ctx.shadowBlur = 0;

    // "TAP TO DROP" hint or "OUT OF COINS"
    if (playerMoney < 2) {
      ctx.textAlign   = 'center';
      ctx.font        = `${fs * 0.8}px 'Orbitron', sans-serif`;
      ctx.fillStyle   = '#ff4444';
      ctx.shadowColor = 'rgba(255,68,68,0.6)'; ctx.shadowBlur = 10;
      ctx.fillText('OUT OF COINS!', W/2, VIEW.chuteTop - scale * 8);
      ctx.shadowBlur  = 0;
    } else if (!dropActive) {
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      ctx.textAlign   = 'center';
      ctx.font        = `${fs * 0.65}px 'Share Tech Mono', monospace`;
      ctx.fillStyle   = blink ? 'rgba(0,229,255,0.8)' : 'rgba(0,229,255,0.25)';
      ctx.fillText('← MOVE MOUSE · CLICK TO DROP →', W/2, VIEW.chuteTop - scale * 8);
    }

    ctx.restore();
  }

  function drawWinFlashes() {
    const { W, originX, scaleX, lowerPusher: lp, scale, trayY } = VIEW;
    winFlashes.forEach(f => {
      const alpha = Math.max(0, 1 - f.t / 1.6);
      const x = VIEW.originX + f.x * SHELF_W * VIEW.scaleX;
      const y = VIEW.trayY - f.t * VIEW.scale * 55;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font        = `bold ${VIEW.scale * 13}px 'Orbitron', sans-serif`;
      ctx.fillStyle   = f.color;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = f.color; ctx.shadowBlur = 10;
      ctx.fillText(f.text, x, y);
      ctx.shadowBlur  = 0;
      ctx.restore();
    });
  }

  // ── Game loop ─────────────────────────────────────────────────
  function loop(ts) {
    if (destroyed) return;
    rafId = requestAnimationFrame(loop);
    if (document.hidden) { lastTs = 0; return; }
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016;
    lastTs = ts;
    update(dt);
    draw();
  }

  // ── Input ─────────────────────────────────────────────────────
  function onMouseMove(e) {
    if (!VIEW) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (canvas.width / rect.width);
    dropX = Math.max(COIN_R, Math.min(SHELF_W - COIN_R,
      (mx - VIEW.originX) / VIEW.scaleX));
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (!VIEW || !e.touches[0]) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
    dropX = Math.max(COIN_R, Math.min(SHELF_W - COIN_R,
      (mx - VIEW.originX) / VIEW.scaleX));
  }

  function onMouseClick(e) {
    try { ac().resume(); } catch(ex) {}
    dropPlayerCoin();
  }

  function onKey(e) {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); try { ac().resume(); } catch(ex) {} dropPlayerCoin(); }
    if (e.code === 'ArrowLeft')  { dropX = Math.max(COIN_R, dropX - 12); }
    if (e.code === 'ArrowRight') { dropX = Math.min(SHELF_W - COIN_R, dropX + 12); }
  }

  // ── Resize ────────────────────────────────────────────────────
  function resize() {
    if (!canvas || !wrap) return;
    canvas.width  = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    computeView(canvas.width, canvas.height);
  }

  // ── Build DOM ─────────────────────────────────────────────────
  function buildHTML(el) {
    el.innerHTML = `
      <style>
        #cp-root {
          width:100%; height:100%;
          display:flex; flex-direction:column;
          background:#080318;
          font-family:'Share Tech Mono',monospace;
          user-select:none;
        }
        #cp-topbar {
          display:flex; align-items:center;
          justify-content:space-between;
          padding:5px 12px;
          border-bottom:1px solid rgba(180,100,255,0.2);
          flex-shrink:0; gap:8px;
        }
        #cp-title {
          font-family:'Orbitron',sans-serif;
          font-size:clamp(0.6rem,2vw,1rem);
          color:#c084fc; letter-spacing:0.2em;
          text-shadow:0 0 10px rgba(192,132,252,0.6);
        }
        #cp-wrap {
          flex:1; min-height:0; position:relative;
          cursor:crosshair; touch-action:none;
        }
        #cp-canvas { display:block; width:100%; height:100%; }
        .cp-btn {
          padding:3px 10px; background:transparent;
          border:1px solid rgba(180,100,255,0.35);
          color:rgba(180,100,255,0.8);
          font-family:'Share Tech Mono',monospace;
          font-size:clamp(0.46rem,1.1vw,0.65rem);
          letter-spacing:0.1em; cursor:pointer;
          transition:all 0.15s; white-space:nowrap;
        }
        .cp-btn:hover { background:rgba(180,100,255,0.1); border-color:#c084fc; color:#c084fc; }
      </style>
      <div id="cp-root">
        <div id="cp-topbar">
          <div id="cp-title">🪙 COIN PUSHER</div>
          <div style="font-size:clamp(0.44rem,1vw,0.6rem);color:rgba(180,100,255,0.4);letter-spacing:0.07em">
            MOUSE / TOUCH to aim · CLICK / SPACE to drop
          </div>
          <div style="display:flex;gap:6px">
            <button class="cp-btn" id="cp-new-btn">▶ NEW GAME</button>
            <button class="arcade-back-btn" id="cp-back-btn">🕹 ARCADE</button>
          </div>
        </div>
        <div id="cp-wrap">
          <canvas id="cp-canvas"></canvas>
        </div>
      </div>
    `;

    canvas = el.querySelector('#cp-canvas');
    wrap   = el.querySelector('#cp-wrap');
    ctx    = canvas.getContext('2d');

    el.querySelector('#cp-new-btn').addEventListener('click', startGame);
    el.querySelector('#cp-back-btn').addEventListener('click', () => window.backToGameSelect?.());

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click',     onMouseClick);
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onMouseClick(e); }, { passive: false });

    window.addEventListener('keydown', onKey);
    window.addEventListener('resize',  resize);

    setTimeout(resize, 0);
  }

  function startGame() {
    playerMoney = 100;
    winnings    = 0;
    coinsInHand = 50;
    dropActive  = false;
    dropCoin    = null;
    trayCoins   = [];
    winFlashes  = [];
    bonusSpawnTimer = 4;
    upperPusher = { x: SHELF_D * 0.85, dir: 1 };
    lowerPusher = { x: SHELF_D * 0.85, dir: 1 };
    seedShelves();
  }

  // ── Public API ────────────────────────────────────────────────
  function init() {
    const screenEl = document.getElementById('coinpusher-screen');
    if (!screenEl) { console.warn('[coinpusher] screen not found'); return; }
    destroyed = false;
    container = screenEl;
    buildHTML(screenEl);
    startGame();
    rafId = requestAnimationFrame(loop);
  }

  function destroy() {
    destroyed = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize',  resize);
    const el = document.getElementById('coinpusher-screen');
    if (el) el.innerHTML = '';
  }

  return { init, destroy };
})();
