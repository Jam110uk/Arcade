// ============================================================
//  COIN PUSHER  —  British beach arcade coin pusher
//  Front-on view looking through the glass, like the real machine.
//
//  Layout (top to bottom, all in canvas pixels scaled to fit):
//    ┌─────────────────────────────┐
//    │   DROP CHUTE  (pegs)        │  ← coin falls here with physics
//    ├─────────────────────────────┤
//    │  [=== UPPER PUSHER ===]     │  ← plate slides left/right
//    │  coins sit on upper shelf   │
//    ├─────────────────────────────┤
//    │  [=== LOWER PUSHER ===]     │
//    │  coins sit on lower shelf   │
//    ├─────────────────────────────┤
//    │        WIN TRAY             │  ← coins that fall off win
//    └─────────────────────────────┘
//
//  The shelf surface is drawn with a shallow 3D perspective strip
//  (just a parallelogram top face) so it looks like a real shelf
//  seen slightly from above, but the whole view stays front-on
//  and proportional — nothing is slanted or cut off.
// ============================================================

export default (() => {

  let canvas, ctx, wrap;
  let rafId = null, destroyed = false, lastTs = 0;

  // ── Money ────────────────────────────────────────────────────
  let balance  = 100;   // pence  (£1.00 to start)
  let winnings = 0;

  // ── Layout — all computed fresh in computeLayout() ───────────
  // Everything is derived from canvas W/H so nothing ever overflows.
  let L = {};   // layout object

  // ── Coin physics ─────────────────────────────────────────────
  // Falling coin (one at a time from the chute)
  let falling = null;   // { x, y, vx, vy, rot, rotV }

  // Aim position (0..1 across machine width)
  let aimX = 0.5;

  // ── Shelves ──────────────────────────────────────────────────
  // Each coin/item on a shelf:
  //   { cx, cy, r, vx, type, value, emoji, label, bobT }
  //   cx/cy are SCREEN coordinates on the shelf surface
  //   The shelf surface is a flat 2D region; we use a slight
  //   perspective transform only for drawing depth illusion.
  let upperCoins = [];
  let lowerCoins = [];

  // Pusher plates (screen-x position of LEFT edge)
  let uPush = { x: 0, dir: 1, speed: 0 };
  let lPush = { x: 0, dir: 1, speed: 0 };

  // ── Pegs ─────────────────────────────────────────────────────
  // Defined as fractions [0..1] of chute width/height
  const PEG_LAYOUT = [
    [0.20, 0.22], [0.50, 0.14], [0.80, 0.22],
    [0.35, 0.40], [0.65, 0.36],
    [0.15, 0.58], [0.85, 0.54], [0.50, 0.62],
  ];

  // ── Bonus items ──────────────────────────────────────────────
  const BONUSES = [
    { emoji:'⭐', value:10,  label:'+10p' },
    { emoji:'🍀', value:20,  label:'+20p' },
    { emoji:'💎', value:50,  label:'+50p' },
    { emoji:'🎰', value:100, label:'+£1!' },
    { emoji:'🌈', value:30,  label:'+30p' },
    { emoji:'🍭', value:5,   label:'+5p'  },
    { emoji:'🎁', value:25,  label:'+25p' },
    { emoji:'🦄', value:40,  label:'+40p' },
    { emoji:'🌟', value:15,  label:'+15p' },
  ];
  let bonusTimer = 5;

  // ── Win tray pop-ups ──────────────────────────────────────────
  let popups = [];   // { text, x, y, t, color }

  // ── Audio ─────────────────────────────────────────────────────
  let aCtx;
  function getAC() {
    if (!aCtx) aCtx = new (window.AudioContext || window.webkitAudioContext)();
    return aCtx;
  }
  function beep(freq, dur, vol=0.07, delay=0, type='sine') {
    try {
      const a=getAC(), o=a.createOscillator(), g=a.createGain(), f=a.createBiquadFilter();
      f.type='lowpass'; f.frequency.value=Math.min(freq*2.8,2400); f.Q.value=0.4;
      o.connect(f); f.connect(g); g.connect(a.destination);
      o.type=type; o.frequency.setValueAtTime(freq,a.currentTime+delay);
      g.gain.setValueAtTime(0,a.currentTime+delay);
      g.gain.linearRampToValueAtTime(vol,a.currentTime+delay+0.015);
      g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+delay+dur);
      o.start(a.currentTime+delay); o.stop(a.currentTime+delay+dur+0.05);
    } catch(e){}
  }
  function sndClink() { beep(700+Math.random()*300,0.07,0.08,0,'triangle'); }
  function sndLand()  { beep(500,0.10,0.08); beep(350,0.09,0.06,0.06); }
  function sndWin(v)  {
    const f=v>=50?784:v>=20?659:523;
    beep(f,0.15,0.09); beep(f*1.25,0.12,0.07,0.10);
    if(v>=50) beep(f*1.5,0.10,0.06,0.20);
  }
  function sndBonus() { beep(1047,0.10,0.08); beep(1319,0.09,0.07,0.09); beep(1568,0.08,0.06,0.18); }
  function sndDrop()  { beep(900,0.05,0.06,0,'sine'); }

  // ── Layout computation ────────────────────────────────────────
  // Called on every resize. All coordinates are screen pixels.
  function computeLayout() {
    const W = canvas.width, H = canvas.height;

    // Machine body takes up most of the canvas, centred
    const mw = Math.min(W * 0.94, H * 0.72, 480);  // machine width
    const mh = Math.min(H * 0.97, mw * 1.55);       // machine height
    const mx = (W - mw) / 2;  // machine left edge
    const my = (H - mh) / 2;  // machine top edge

    const CR = Math.round(mw * 0.040);   // coin radius (scales with machine)

    // Vertical zones inside the machine (fractions of mh):
    //   chute:       0 .. 0.32
    //   upper shelf: 0.32 .. 0.56
    //   lower shelf: 0.56 .. 0.80
    //   tray:        0.80 .. 1.00
    const chuteTop    = my + mh * 0.00;
    const chuteBot    = my + mh * 0.32;
    const upperTop    = my + mh * 0.32;
    const upperBot    = my + mh * 0.56;
    const lowerTop    = my + mh * 0.56;
    const lowerBot    = my + mh * 0.80;
    const trayTop     = my + mh * 0.80;
    const trayBot     = my + mh * 1.00;

    // Shelf depth illusion: the "back wall" is drawn slightly higher.
    // Coins sit on the flat part. Pusher plate spans full shelf width.
    const shelfDepth = mh * 0.06;   // how tall the 3D top-face strip appears

    // Pusher plate height (screen pixels)
    const pusherH = Math.max(6, mh * 0.035);

    // Pusher speed in px/sec
    const pusherSpeed = mw * 0.38;

    // Coin shelf Y — where coins actually rest (centre of coin on shelf)
    const upperCoinY = upperTop + shelfDepth + CR * 1.1;
    const lowerCoinY = lowerTop + shelfDepth + CR * 1.1;

    // Usable shelf width for coins
    const shelfL  = mx + mw * 0.04;
    const shelfR  = mx + mw * 0.96;
    const shelfW  = shelfR - shelfL;

    L = {
      W, H, mw, mh, mx, my, CR,
      chuteTop, chuteBot,
      upperTop, upperBot,
      lowerTop, lowerBot,
      trayTop, trayBot,
      shelfDepth, pusherH, pusherSpeed,
      upperCoinY, lowerCoinY,
      shelfL, shelfR, shelfW,
      // Pegs in screen coords
      pegs: PEG_LAYOUT.map(([fx,fy]) => ({
        x: mx + mw*0.05 + fx*(mw*0.90),
        y: chuteTop + fy*(chuteBot-chuteTop),
        r: Math.max(4, mw*0.022),
      })),
    };

    // Re-init pushers based on new layout
    if (!uPush.initialised) {
      uPush = { x: shelfL, dir: 1, speed: pusherSpeed, initialised: true };
      lPush = { x: shelfL + shelfW*0.3, dir:-1, speed: pusherSpeed*0.85, initialised: true };
    }
  }

  // ── Seed initial coins ────────────────────────────────────────
  function seedShelves() {
    upperCoins = []; lowerCoins = [];
    const { shelfL, shelfR, shelfW, CR, upperCoinY, lowerCoinY } = L;

    // Place coins in a grid-ish pattern so they look packed
    for (let i = 0; i < 24; i++) {
      const row = Math.floor(i / 7);
      const col = i % 7;
      upperCoins.push(makeCoin(
        shelfL + CR*1.2 + col*(shelfW-CR*2.4)/6 + (row%2)*CR*0.5,
        upperCoinY + row * CR * 0.3
      ));
    }
    for (let i = 0; i < 28; i++) {
      const row = Math.floor(i / 8);
      const col = i % 8;
      lowerCoins.push(makeCoin(
        shelfL + CR*1.2 + col*(shelfW-CR*2.4)/7 + (row%2)*CR*0.4,
        lowerCoinY + row * CR * 0.3
      ));
    }
    // Bonus items scattered in
    upperCoins.push(makeBonus(shelfL + shelfW*0.25, upperCoinY));
    upperCoins.push(makeBonus(shelfL + shelfW*0.72, upperCoinY));
    lowerCoins.push(makeBonus(shelfL + shelfW*0.50, lowerCoinY));
  }

  function makeCoin(cx, cy) {
    return { cx, cy, vx:0, vy:0, type:'coin', value:2, r:L.CR, rot:Math.random()*Math.PI*2 };
  }
  function makeBonus(cx, cy) {
    const b = BONUSES[Math.floor(Math.random()*BONUSES.length)];
    return { cx, cy, vx:0, vy:0, type:'bonus', value:b.value, emoji:b.emoji, label:b.label,
             r:L.CR*1.35, bobT:Math.random()*Math.PI*2 };
  }

  // ── Update ───────────────────────────────────────────────────
  function update(dt) {
    if (!L.mw) return;
    dt = Math.min(dt, 0.05);

    const { shelfL, shelfR, shelfW, pusherSpeed, pusherH,
            upperTop, upperBot, lowerTop, lowerBot,
            upperCoinY, lowerCoinY, trayTop, CR, shelfDepth,
            chuteTop, chuteBot, mx, mw, pegs } = L;

    // ── Falling coin physics ────────────────────────────────
    if (falling) {
      falling.vy += 1800 * dt;
      falling.vx *= 0.998;
      falling.x  += falling.vx * dt;
      falling.y  += falling.vy * dt;
      falling.rot += falling.rotV * dt;

      // Wall bounces inside chute
      if (falling.x - CR < mx + mw*0.03) {
        falling.x = mx + mw*0.03 + CR;
        falling.vx = Math.abs(falling.vx) * 0.55;
      }
      if (falling.x + CR > mx + mw*0.97) {
        falling.x = mx + mw*0.97 - CR;
        falling.vx = -Math.abs(falling.vx) * 0.55;
      }

      // Peg collisions
      pegs.forEach(peg => {
        const dx = falling.x - peg.x, dy = falling.y - peg.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        const minD = CR + peg.r;
        if (dist < minD && dist > 0.01) {
          const nx=dx/dist, ny=dy/dist;
          // Push out
          falling.x = peg.x + nx*minD;
          falling.y = peg.y + ny*minD;
          // Reflect velocity
          const dot = falling.vx*nx + falling.vy*ny;
          falling.vx -= 2*dot*nx * 0.55;
          falling.vy -= 2*dot*ny * 0.55;
          falling.vx += (Math.random()-0.5)*120;
          falling.rotV += (Math.random()-0.5)*8;
          sndClink();
        }
      });

      // Landed on upper shelf
      if (falling.y + CR >= upperTop + shelfDepth*0.5) {
        // Place coin on upper shelf at landing x, at the back (high y = back of shelf)
        const nc = makeCoin(
          Math.max(shelfL+CR, Math.min(shelfR-CR, falling.x)),
          upperCoinY - CR*0.3
        );
        nc.vx = falling.vx * 0.25;
        upperCoins.push(nc);
        falling = null;
        sndLand();
      }
    }

    // ── Pusher movement ─────────────────────────────────────
    uPush.x += uPush.speed * uPush.dir * dt;
    if (uPush.x + (shelfR-shelfL) > shelfR + mw*0.01) { uPush.x = shelfR - (shelfR-shelfL); uPush.dir = -1; }
    if (uPush.x < shelfL - mw*0.01)                    { uPush.x = shelfL;                   uPush.dir =  1; }

    lPush.x += lPush.speed * lPush.dir * dt;
    if (lPush.x + (shelfR-shelfL) > shelfR + mw*0.01) { lPush.x = shelfR - (shelfR-shelfL); lPush.dir = -1; }
    if (lPush.x < shelfL - mw*0.01)                    { lPush.x = shelfL;                   lPush.dir =  1; }

    // Pusher plate front face Y positions
    const uPushFaceY = upperTop + shelfDepth + pusherH;
    const lPushFaceY = lowerTop + shelfDepth + pusherH;

    // ── Shelf coin physics ───────────────────────────────────
    updateShelf(upperCoins, upperCoinY, uPush, uPushFaceY, upperTop, upperBot, 'upper', dt);
    updateShelf(lowerCoins, lowerCoinY, lPush, lPushFaceY, lowerTop, lowerBot, 'lower', dt);

    // ── Bonus spawn ──────────────────────────────────────────
    bonusTimer -= dt;
    if (bonusTimer <= 0) {
      bonusTimer = 7 + Math.random()*9;
      upperCoins.push(makeBonus(
        shelfL + CR*2 + Math.random()*(shelfW - CR*4),
        upperCoinY - CR*0.5
      ));
    }

    // Animate bonus bob
    [...upperCoins,...lowerCoins].forEach(c => {
      if (c.type==='bonus') c.bobT = (c.bobT||0) + dt*2.8;
    });

    // ── Popups ───────────────────────────────────────────────
    popups.forEach(p=>p.t+=dt);
    popups = popups.filter(p=>p.t<1.8);
  }

  function updateShelf(coins, restY, pusher, pusherFaceY, shelfTopY, shelfBotY, which, dt) {
    const { shelfL, shelfR, CR, shelfDepth, lowerCoinY, upperCoinY, trayTop } = L;

    // Gravity settling — coins sink gently to restY
    coins.forEach(c => {
      c.cx += c.vx * dt;
      c.vx *= 0.82;
      // Clamp to shelf horizontal bounds
      if (c.cx - c.r < shelfL) { c.cx = shelfL + c.r; c.vx = Math.abs(c.vx)*0.4; }
      if (c.cx + c.r > shelfR) { c.cx = shelfR - c.r; c.vx = -Math.abs(c.vx)*0.4; }
    });

    // Pusher pushes coins forward (increases their cy toward front edge)
    // The pusher front face is at pusherFaceY.
    // Coins whose cy < pusherFaceY get pushed down toward front edge.
    coins.forEach(c => {
      const coinTopY = c.cy - c.r;
      if (coinTopY < pusherFaceY) {
        // Push coin downward (toward front)
        const overlap = pusherFaceY - coinTopY;
        c.cy += overlap * 0.35 + 1.2 * dt * 60;
      }
    });

    // Coin-coin separation (simple 2D)
    for (let i=0; i<coins.length; i++) {
      for (let j=i+1; j<coins.length; j++) {
        const a=coins[i], b=coins[j];
        const dx=a.cx-b.cx, dy=a.cy-b.cy;
        const minD=a.r+b.r;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if (dist < minD && dist>0.01) {
          const nx=dx/dist, ny=dy/dist;
          const push=(minD-dist)*0.5;
          a.cx+=nx*push; a.cy+=ny*push;
          b.cx-=nx*push; b.cy-=ny*push;
          const dvx=a.vx-b.vx;
          a.vx-=dvx*0.15; b.vx+=dvx*0.15;
        }
      }
    }

    // Coins that fall off the front edge
    const frontEdge = shelfBotY;
    const fallen = coins.filter(c => c.cy - c.r > frontEdge);
    fallen.forEach(c => {
      if (which === 'upper') {
        // Transfer to lower shelf
        const nc = c.type==='bonus'
          ? makeBonus(Math.max(shelfL+c.r, Math.min(shelfR-c.r, c.cx)), lowerCoinY - c.r*0.4)
          : makeCoin(Math.max(shelfL+c.r, Math.min(shelfR-c.r, c.cx)), lowerCoinY - c.r*0.4);
        nc.vx = c.vx;
        lowerCoins.push(nc);
        sndClink();
      } else {
        // Falls into tray — WIN
        collectItem(c);
      }
    });
    // Remove fallen coins
    const keep = coins.filter(c => c.cy - c.r <= frontEdge + c.r*0.5);
    coins.length = 0; keep.forEach(c => coins.push(c));

    // Keep coins above the back wall (shelfTopY + shelfDepth)
    const backWall = shelfTopY + shelfDepth + CR*0.5;
    coins.forEach(c => { if (c.cy < backWall) c.cy = backWall; });
  }

  function collectItem(c) {
    balance  += c.value;
    winnings += c.value;
    if (c.type==='bonus') sndBonus(); else sndWin(c.value);
    const label = c.type==='bonus' ? `${c.emoji} ${c.label}` : `+2p`;
    const color = c.type==='bonus' ? '#ffdd00' : '#00ff88';
    popups.push({ text:label, x:c.cx, y:L.trayTop + L.mh*0.07, t:0, color });
  }

  // ── Drop a coin ──────────────────────────────────────────────
  function dropCoin() {
    if (falling || balance < 2 || !L.mw) return;
    try { getAC().resume(); } catch(e){}
    balance -= 2;
    sndDrop();
    const { mx, mw, chuteTop, CR } = L;
    falling = {
      x:  mx + mw*0.05 + aimX * mw*0.90,
      y:  chuteTop + CR*2,
      vx: (Math.random()-0.5)*60,
      vy: 80,
      rot: 0,
      rotV: (Math.random()-0.5)*6,
    };
  }

  // ── Drawing ──────────────────────────────────────────────────
  function draw() {
    if (!ctx || !L.mw) return;
    const { W, H, mw, mh, mx, my, CR } = L;
    ctx.clearRect(0,0,W,H);

    // Background
    const bg = ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#0d0820'); bg.addColorStop(1,'#1a0f35');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

    // Arcade light strip at very top
    for (let i=0;i<12;i++) {
      const hue=i/12*360, on=Math.sin(Date.now()*0.003+i*0.6)>0.3;
      ctx.fillStyle=on?`hsla(${hue},100%,65%,0.9)`:`hsla(${hue},60%,30%,0.4)`;
      const bw=W/12;
      ctx.beginPath();
      ctx.arc(i*bw+bw/2, 6, 4, 0, Math.PI*2);
      ctx.fill();
    }

    drawMachineCabinet();
    drawChute();
    drawShelfSection(L.upperTop, L.upperBot, upperCoins, uPush, 'upper');
    drawShelfSection(L.lowerTop, L.lowerBot, lowerCoins, lPush, 'lower');
    drawTray();
    drawFallingCoin();
    drawAimGuide();
    drawHUD();
    drawPopups();
  }

  function drawMachineCabinet() {
    const { mx, my, mw, mh } = L;

    // Outer cabinet chrome frame
    ctx.save();
    ctx.shadowColor='rgba(200,150,255,0.6)'; ctx.shadowBlur=18;
    ctx.strokeStyle='#9060d0'; ctx.lineWidth=4;
    ctx.strokeRect(mx-2, my-2, mw+4, mh+4);
    ctx.shadowBlur=0;

    // Glass panel inner background
    const glass = ctx.createLinearGradient(mx,my,mx,my+mh);
    glass.addColorStop(0,'#10062a'); glass.addColorStop(1,'#1e0f3f');
    ctx.fillStyle=glass;
    ctx.fillRect(mx,my,mw,mh);

    // Side pillar decorations
    ctx.fillStyle='rgba(100,60,180,0.5)';
    ctx.fillRect(mx,my,mw*0.04,mh);
    ctx.fillRect(mx+mw*0.96,my,mw*0.04,mh);

    // Vertical neon lines on pillars
    ctx.strokeStyle='rgba(180,100,255,0.7)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(mx+mw*0.04,my); ctx.lineTo(mx+mw*0.04,my+mh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx+mw*0.96,my); ctx.lineTo(mx+mw*0.96,my+mh); ctx.stroke();
    ctx.restore();
  }

  function drawChute() {
    const { mx, my, mw, mh, chuteTop, chuteBot, CR, pegs } = L;
    const cw = mw*0.92, cx0 = mx+mw*0.04;
    const ch = chuteBot - chuteTop;

    // Chute background
    const cg = ctx.createLinearGradient(0,chuteTop,0,chuteBot);
    cg.addColorStop(0,'rgba(15,8,40,0.98)'); cg.addColorStop(1,'rgba(25,12,55,0.95)');
    ctx.fillStyle=cg; ctx.fillRect(cx0,chuteTop,cw,ch);

    // Subtle grid lines
    ctx.strokeStyle='rgba(100,60,160,0.18)'; ctx.lineWidth=1;
    for(let i=1;i<5;i++) {
      ctx.beginPath(); ctx.moveTo(cx0,chuteTop+ch*i/5);
      ctx.lineTo(cx0+cw,chuteTop+ch*i/5); ctx.stroke();
    }

    // Chute dividers (the slots at top)
    const numSlots=5;
    ctx.strokeStyle='rgba(140,80,220,0.55)'; ctx.lineWidth=2;
    for(let i=1;i<numSlots;i++) {
      const sx=cx0+i*cw/numSlots;
      ctx.beginPath(); ctx.moveTo(sx,chuteTop); ctx.lineTo(sx,chuteTop+ch*0.15); ctx.stroke();
    }

    // Pegs
    pegs.forEach(peg => {
      // Peg body
      const pg = ctx.createRadialGradient(peg.x-peg.r*0.3, peg.y-peg.r*0.3, peg.r*0.1, peg.x, peg.y, peg.r);
      pg.addColorStop(0,'#ffe080'); pg.addColorStop(0.6,'#c09020'); pg.addColorStop(1,'#806010');
      ctx.beginPath(); ctx.arc(peg.x,peg.y,peg.r,0,Math.PI*2);
      ctx.fillStyle=pg;
      ctx.shadowColor='rgba(220,180,0,0.5)'; ctx.shadowBlur=6;
      ctx.fill(); ctx.shadowBlur=0;
      // Peg shine
      ctx.beginPath(); ctx.arc(peg.x-peg.r*0.28, peg.y-peg.r*0.28, peg.r*0.32, 0, Math.PI*2);
      ctx.fillStyle='rgba(255,240,150,0.55)'; ctx.fill();
    });

    // Bottom separator line (chute → upper shelf)
    ctx.strokeStyle='rgba(160,90,255,0.6)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx0,chuteBot); ctx.lineTo(cx0+cw,chuteBot); ctx.stroke();
  }

  function drawShelfSection(topY, botY, coins, pusher, which) {
    const { mx, mw, CR, shelfL, shelfR, shelfDepth, pusherH } = L;
    const sw = shelfR - shelfL;
    const sectionH = botY - topY;

    // Shelf area background
    const sg = ctx.createLinearGradient(0,topY,0,botY);
    sg.addColorStop(0,'rgba(20,10,45,0.98)'); sg.addColorStop(1,'rgba(30,15,60,0.95)');
    ctx.fillStyle=sg; ctx.fillRect(mx+mw*0.04, topY, mw*0.92, sectionH);

    // 3D shelf depth illusion — a darker strip at the top is the "back wall"
    // and a lighter strip is the "shelf top face" going into the screen
    const depthGrad = ctx.createLinearGradient(0,topY,0,topY+shelfDepth);
    depthGrad.addColorStop(0,'rgba(60,30,100,0.9)');
    depthGrad.addColorStop(1,'rgba(35,18,70,0.8)');
    ctx.fillStyle=depthGrad;
    ctx.fillRect(mx+mw*0.04, topY, mw*0.92, shelfDepth);

    // Shelf edge highlight line
    ctx.strokeStyle='rgba(180,100,255,0.5)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(mx+mw*0.04,topY+shelfDepth);
    ctx.lineTo(mx+mw*0.96,topY+shelfDepth); ctx.stroke();

    // Bottom separator
    ctx.strokeStyle='rgba(140,70,220,0.5)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(mx+mw*0.04,botY); ctx.lineTo(mx+mw*0.96,botY); ctx.stroke();

    // Draw pusher plate
    drawPusher(topY, pusher, which);

    // Draw coins (back-to-front: lower cy = back of shelf = draw first)
    const sorted = [...coins].sort((a,b)=>a.cy-b.cy);
    sorted.forEach(c => drawShelfCoin(c, topY, botY));
  }

  function drawPusher(shelfTopY, pusher, which) {
    const { shelfL, shelfR, shelfDepth, pusherH, mx, mw } = L;
    const sw = shelfR - shelfL;
    const py = shelfTopY + shelfDepth;
    const ph = pusherH;

    // Full-width pusher plate
    const pg = ctx.createLinearGradient(0,py,0,py+ph);
    pg.addColorStop(0,'rgba(200,180,255,0.55)');
    pg.addColorStop(0.5,'rgba(160,120,255,0.35)');
    pg.addColorStop(1,'rgba(120,80,200,0.25)');
    ctx.fillStyle=pg;
    ctx.fillRect(shelfL, py, sw, ph);

    // Pusher plate top edge (chrome look)
    ctx.strokeStyle='rgba(220,200,255,0.75)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(shelfL,py); ctx.lineTo(shelfR,py); ctx.stroke();

    // Pusher depth top face (makes it look 3D)
    ctx.fillStyle='rgba(180,140,255,0.22)';
    ctx.fillRect(shelfL, shelfTopY, sw, shelfDepth);
    ctx.strokeStyle='rgba(200,160,255,0.45)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(shelfL,shelfTopY); ctx.lineTo(shelfR,shelfTopY); ctx.stroke();
  }

  function drawShelfCoin(c, shelfTopY, shelfBotY) {
    ctx.save();
    ctx.translate(c.cx, c.cy);

    // Depth-based scale: coins at back (low cy) appear slightly smaller
    const { shelfDepth } = L;
    const depthRange = shelfBotY - (shelfTopY + shelfDepth);
    const depthFrac  = Math.max(0, Math.min(1, (c.cy - (shelfTopY+shelfDepth)) / depthRange));
    const scale = 0.72 + depthFrac * 0.28;  // 0.72 at back, 1.0 at front
    ctx.scale(scale, scale);

    if (c.type === 'bonus') {
      const bob = Math.sin(c.bobT||0) * 2.5;
      ctx.translate(0, bob - 3);

      // Glow
      ctx.shadowColor='#ffcc00'; ctx.shadowBlur=16;
      ctx.beginPath(); ctx.arc(0,0,c.r*1.4,0,Math.PI*2);
      ctx.fillStyle='rgba(255,200,0,0.12)'; ctx.fill(); ctx.shadowBlur=0;

      // Emoji face
      ctx.font=`${c.r*1.7}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(c.emoji,0,0);

      // Value label pill
      const lw = c.r*2.2;
      ctx.fillStyle='rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.roundRect(-lw/2, c.r*1.0, lw, c.r*0.85, c.r*0.3);
      ctx.fill();
      ctx.font=`bold ${c.r*0.58}px 'Orbitron',sans-serif`;
      ctx.fillStyle='#ffdd00';
      ctx.fillText(c.label||`${c.value}p`, 0, c.r*1.45);

    } else {
      // 2p coin — flat circle with bronze gradient + "2p" text
      // Coin shadow
      ctx.beginPath(); ctx.ellipse(0,3,c.r,c.r*0.28,0,0,Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fill();

      // Coin body gradient
      const cg = ctx.createRadialGradient(-c.r*0.3,-c.r*0.3,c.r*0.08, 0,0,c.r);
      cg.addColorStop(0,'#f0c050');
      cg.addColorStop(0.45,'#c88020');
      cg.addColorStop(0.85,'#9a6010');
      cg.addColorStop(1,'#7a4808');
      ctx.beginPath(); ctx.arc(0,0,c.r,0,Math.PI*2);
      ctx.fillStyle=cg; ctx.fill();

      // Coin rim
      ctx.strokeStyle='rgba(255,200,80,0.6)'; ctx.lineWidth=c.r*0.1;
      ctx.beginPath(); ctx.arc(0,0,c.r*0.92,0,Math.PI*2); ctx.stroke();

      // Inner ring detail
      ctx.strokeStyle='rgba(180,130,40,0.4)'; ctx.lineWidth=c.r*0.06;
      ctx.beginPath(); ctx.arc(0,0,c.r*0.72,0,Math.PI*2); ctx.stroke();

      // Shine highlight
      ctx.beginPath(); ctx.ellipse(-c.r*0.22,-c.r*0.28,c.r*0.36,c.r*0.22,-0.4,0,Math.PI*2);
      ctx.fillStyle='rgba(255,235,140,0.5)'; ctx.fill();

      // "2p" text
      ctx.font=`bold ${c.r*0.68}px 'Orbitron',sans-serif`;
      ctx.fillStyle='rgba(255,255,220,0.75)';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.strokeStyle='rgba(80,40,0,0.6)'; ctx.lineWidth=c.r*0.1;
      ctx.strokeText('2p',0,0);
      ctx.fillText('2p',0,0);
    }
    ctx.restore();
  }

  function drawTray() {
    const { mx, mw, trayTop, trayBot, shelfL, shelfR } = L;
    const tw = shelfR-shelfL, th = trayBot-trayTop;

    // Tray background
    const tg = ctx.createLinearGradient(0,trayTop,0,trayBot);
    tg.addColorStop(0,'rgba(30,15,65,0.98)'); tg.addColorStop(1,'rgba(15,8,35,0.98)');
    ctx.fillStyle=tg; ctx.fillRect(shelfL,trayTop,tw,th);

    // Inner tray felt effect
    ctx.fillStyle='rgba(40,20,80,0.6)';
    ctx.fillRect(shelfL+tw*0.04, trayTop+th*0.15, tw*0.92, th*0.7);

    // Tray border
    ctx.strokeStyle='rgba(160,90,240,0.6)'; ctx.lineWidth=2;
    ctx.strokeRect(shelfL,trayTop,tw,th);

    // "WINNINGS" label
    ctx.font=`bold ${Math.max(9,L.mw*0.032)}px 'Orbitron',sans-serif`;
    ctx.fillStyle='rgba(180,120,255,0.45)';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('WIN TRAY', shelfL+tw/2, trayTop+th*0.5);

    // Winnings amount
    ctx.font=`bold ${Math.max(11,L.mw*0.042)}px 'Orbitron',sans-serif`;
    ctx.fillStyle='#ffdd00';
    ctx.shadowColor='rgba(255,221,0,0.5)'; ctx.shadowBlur=8;
    ctx.fillText(`£${(winnings/100).toFixed(2)}`, shelfL+tw/2, trayTop+th*0.72);
    ctx.shadowBlur=0;
  }

  function drawFallingCoin() {
    if (!falling) return;
    const { CR } = L;
    const c = falling;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);

    // Shadow
    ctx.beginPath(); ctx.ellipse(0,3,CR,CR*0.3,0,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fill();

    // Coin
    const cg = ctx.createRadialGradient(-CR*0.3,-CR*0.3,CR*0.08, 0,0,CR);
    cg.addColorStop(0,'#f0c050'); cg.addColorStop(0.45,'#c88020');
    cg.addColorStop(0.85,'#9a6010'); cg.addColorStop(1,'#7a4808');
    ctx.beginPath(); ctx.arc(0,0,CR,0,Math.PI*2);
    ctx.fillStyle=cg;
    ctx.shadowColor='rgba(200,150,0,0.5)'; ctx.shadowBlur=8;
    ctx.fill(); ctx.shadowBlur=0;

    // Rim
    ctx.strokeStyle='rgba(255,200,80,0.6)'; ctx.lineWidth=CR*0.1;
    ctx.beginPath(); ctx.arc(0,0,CR*0.92,0,Math.PI*2); ctx.stroke();

    // Shine
    ctx.beginPath(); ctx.ellipse(-CR*0.22,-CR*0.28,CR*0.36,CR*0.22,-0.4,0,Math.PI*2);
    ctx.fillStyle='rgba(255,235,140,0.55)'; ctx.fill();

    // Label
    ctx.font=`bold ${CR*0.68}px 'Orbitron',sans-serif`;
    ctx.fillStyle='rgba(255,255,220,0.8)';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='rgba(80,40,0,0.5)'; ctx.lineWidth=CR*0.1;
    ctx.strokeText('2p',0,0); ctx.fillText('2p',0,0);
    ctx.restore();
  }

  function drawAimGuide() {
    if (falling || !L.mw || balance < 2) return;
    const { mx, mw, chuteTop, CR } = L;
    const ax = mx + mw*0.05 + aimX*mw*0.90;

    // Dashed drop line
    ctx.save();
    ctx.setLineDash([5,5]);
    ctx.strokeStyle='rgba(0,240,200,0.35)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(ax, chuteTop); ctx.lineTo(ax, chuteTop + (L.chuteBot-L.chuteTop)*0.4);
    ctx.stroke(); ctx.setLineDash([]);

    // Coin preview ghost at top
    ctx.globalAlpha=0.5;
    ctx.beginPath(); ctx.arc(ax, chuteTop+CR*1.5, CR, 0, Math.PI*2);
    const cg=ctx.createRadialGradient(ax-CR*0.3,chuteTop+CR*1.2,CR*0.1,ax,chuteTop+CR*1.5,CR);
    cg.addColorStop(0,'#f0c050'); cg.addColorStop(1,'#9a6010');
    ctx.fillStyle=cg; ctx.fill();
    ctx.font=`bold ${CR*0.65}px 'Orbitron',sans-serif`;
    ctx.fillStyle='rgba(255,255,200,0.8)';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('2p',ax,chuteTop+CR*1.5);
    ctx.globalAlpha=1;
    ctx.restore();
  }

  function drawHUD() {
    const { W, H, mx, mw, my, mh, CR } = L;

    // HUD sits in the left sidebar outside the machine
    // If there's no sidebar room, draw a compact strip above
    const sideW = mx - 8;
    const useSide = sideW > 55;

    ctx.save();
    ctx.font=`bold ${Math.max(9,Math.min(sideW*0.18,14))}px 'Orbitron',sans-serif`;
    ctx.textBaseline='middle';

    if (useSide) {
      // Left sidebar HUD
      const hx = mx * 0.5;
      const items = [
        { label:'BALANCE',  value:`£${(balance/100).toFixed(2)}`,  color: balance<20?'#ff5555':'#00ff88', y:my+mh*0.22 },
        { label:'WINNINGS', value:`£${(winnings/100).toFixed(2)}`, color:'#ffdd00',                        y:my+mh*0.40 },
        { label:'COINS',    value:`${Math.floor(balance/2)}`,      color:'#00e5ff',                        y:my+mh*0.58 },
        { label:'VALUE',    value:'2p each',                       color:'rgba(160,120,255,0.7)',           y:my+mh*0.72 },
      ];
      items.forEach(item => {
        ctx.textAlign='center';
        ctx.font=`${Math.max(7,sideW*0.14)}px 'Share Tech Mono',monospace`;
        ctx.fillStyle='rgba(140,100,200,0.55)';
        ctx.fillText(item.label, hx, item.y-10);
        ctx.font=`bold ${Math.max(9,sideW*0.17)}px 'Orbitron',sans-serif`;
        ctx.fillStyle=item.color;
        ctx.shadowColor=item.color; ctx.shadowBlur=6;
        ctx.fillText(item.value, hx, item.y+8);
        ctx.shadowBlur=0;
      });

      // Instructions
      if (!falling) {
        const blink=Math.floor(Date.now()/550)%2===0;
        ctx.font=`${Math.max(7,sideW*0.12)}px 'Share Tech Mono',monospace`;
        ctx.fillStyle=blink?'rgba(0,240,200,0.85)':'rgba(0,240,200,0.25)';
        ctx.fillText('CLICK', hx, my+mh*0.87);
        ctx.fillText('TO DROP', hx, my+mh*0.91);
      }
    } else {
      // Compact top bar inside machine
      const by = my + mh*0.015;
      const bh = Math.max(20, mh*0.04);
      ctx.fillStyle='rgba(10,5,25,0.8)';
      ctx.fillRect(mx, by, mw, bh);
      ctx.textAlign='left';
      ctx.font=`bold ${Math.max(8,mw*0.028)}px 'Orbitron',sans-serif`;
      ctx.fillStyle='#00ff88'; ctx.fillText(`£${(balance/100).toFixed(2)}`, mx+8, by+bh/2);
      ctx.textAlign='center';
      ctx.fillStyle='#ffdd00'; ctx.fillText(`WIN: £${(winnings/100).toFixed(2)}`, mx+mw/2, by+bh/2);
      ctx.textAlign='right';
      ctx.fillStyle='#00e5ff'; ctx.fillText(`${Math.floor(balance/2)} coins`, mx+mw-8, by+bh/2);
    }

    ctx.restore();
  }

  function drawPopups() {
    popups.forEach(p => {
      const alpha=Math.max(0,1-p.t/1.8);
      ctx.save();
      ctx.globalAlpha=alpha;
      ctx.font=`bold ${Math.max(11,L.mw*0.038)}px 'Orbitron',sans-serif`;
      ctx.fillStyle=p.color;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor=p.color; ctx.shadowBlur=10;
      ctx.fillText(p.text, p.x, p.y - p.t*L.mh*0.09);
      ctx.shadowBlur=0;
      ctx.restore();
    });
  }

  // ── Game loop ────────────────────────────────────────────────
  function loop(ts) {
    if (destroyed) return;
    rafId=requestAnimationFrame(loop);
    if (document.hidden) { lastTs=0; return; }
    const dt=lastTs?Math.min((ts-lastTs)/1000,0.05):0.016;
    lastTs=ts;
    update(dt);
    draw();
  }

  // ── Input ────────────────────────────────────────────────────
  function getAimX(clientX) {
    const rect=canvas.getBoundingClientRect();
    const px=(clientX-rect.left)*(canvas.width/rect.width);
    return Math.max(0,Math.min(1,(px-(L.mx+L.mw*0.05))/(L.mw*0.90)));
  }
  function onMouseMove(e) { if(L.mw) aimX=getAimX(e.clientX); }
  function onTouchMove(e) { e.preventDefault(); if(L.mw&&e.touches[0]) aimX=getAimX(e.touches[0].clientX); }
  function onClick() { try{getAC().resume();}catch(e){} dropCoin(); }
  function onKey(e) {
    if(e.code==='Space'||e.code==='Enter'){e.preventDefault();try{getAC().resume();}catch(ex){}dropCoin();}
    if(e.code==='ArrowLeft') aimX=Math.max(0,aimX-0.04);
    if(e.code==='ArrowRight')aimX=Math.min(1,aimX+0.04);
  }

  // ── Resize ───────────────────────────────────────────────────
  function resize() {
    if (!canvas||!wrap) return;
    canvas.width =wrap.clientWidth;
    canvas.height=wrap.clientHeight;
    const prevMW=L.mw||0;
    computeLayout();
    // Re-seed only if layout changed drastically (first run)
    if (!prevMW) seedShelves();
    else {
      // Reposition coins to fit new layout (scale positions)
      const scale=L.mw/prevMW;
      [...upperCoins,...lowerCoins].forEach(c=>{ c.cx*=scale; c.r=L.CR*(c.type==='bonus'?1.35:1); });
    }
    uPush.speed=L.pusherSpeed; lPush.speed=L.pusherSpeed*0.85;
  }

  // ── Build DOM ────────────────────────────────────────────────
  function buildHTML(el) {
    el.innerHTML=`
      <style>
        #cp-root{width:100%;height:100%;display:flex;flex-direction:column;
          background:#0d0820;font-family:'Share Tech Mono',monospace;user-select:none;}
        #cp-topbar{display:flex;align-items:center;justify-content:space-between;
          padding:5px 12px;border-bottom:1px solid rgba(160,90,240,0.25);
          flex-shrink:0;gap:8px;}
        #cp-title{font-family:'Orbitron',sans-serif;font-size:clamp(0.6rem,2vw,1rem);
          color:#c084fc;letter-spacing:0.2em;text-shadow:0 0 10px rgba(192,132,252,0.6);}
        #cp-wrap{flex:1;min-height:0;position:relative;cursor:crosshair;touch-action:none;}
        #cp-canvas{display:block;width:100%;height:100%;}
        .cp-btn{padding:3px 10px;background:transparent;
          border:1px solid rgba(160,90,240,0.35);color:rgba(180,110,255,0.8);
          font-family:'Share Tech Mono',monospace;font-size:clamp(0.46rem,1.1vw,0.65rem);
          letter-spacing:0.1em;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
        .cp-btn:hover{background:rgba(160,90,240,0.1);border-color:#c084fc;color:#c084fc;}
      </style>
      <div id="cp-root">
        <div id="cp-topbar">
          <div id="cp-title">🪙 COIN PUSHER</div>
          <div style="font-size:clamp(0.44rem,1vw,0.6rem);color:rgba(160,90,240,0.45);letter-spacing:0.07em">
            AIM WITH MOUSE · CLICK / SPACE TO DROP
          </div>
          <div style="display:flex;gap:6px">
            <button class="cp-btn" id="cp-new-btn">▶ NEW GAME</button>
            <button class="arcade-back-btn" id="cp-back-btn">🕹 ARCADE</button>
          </div>
        </div>
        <div id="cp-wrap"><canvas id="cp-canvas"></canvas></div>
      </div>`;

    canvas=el.querySelector('#cp-canvas');
    wrap=el.querySelector('#cp-wrap');
    ctx=canvas.getContext('2d');

    el.querySelector('#cp-new-btn').addEventListener('click',startGame);
    el.querySelector('#cp-back-btn').addEventListener('click',()=>window.backToGameSelect?.());
    canvas.addEventListener('mousemove',onMouseMove);
    canvas.addEventListener('click',onClick);
    canvas.addEventListener('touchmove',onTouchMove,{passive:false});
    canvas.addEventListener('touchstart',e=>{e.preventDefault();onClick();},{passive:false});
    window.addEventListener('keydown',onKey);
    window.addEventListener('resize',resize);
    setTimeout(resize,0);
  }

  function startGame() {
    balance=100; winnings=0;
    falling=null; popups=[]; bonusTimer=5;
    uPush={x:L.shelfL||0,dir:1,speed:L.pusherSpeed||80,initialised:true};
    lPush={x:(L.shelfL||0)+(L.shelfW||0)*0.3,dir:-1,speed:(L.pusherSpeed||80)*0.85,initialised:true};
    if(L.mw) seedShelves();
  }

  function init() {
    const el=document.getElementById('coinpusher-screen');
    if(!el){console.warn('[coinpusher] screen not found');return;}
    destroyed=false;
    buildHTML(el);
    rafId=requestAnimationFrame(loop);
  }

  function destroy() {
    destroyed=true;
    if(rafId){cancelAnimationFrame(rafId);rafId=null;}
    window.removeEventListener('keydown',onKey);
    window.removeEventListener('resize',resize);
    const el=document.getElementById('coinpusher-screen');
    if(el) el.innerHTML='';
  }

  return {init,destroy};
})();
