// POOL ENGINE — extracted from index.html
// Loaded lazily when game is first selected

// ============================================================
// POOL GAME ENGINE
// ============================================================
const POOL = {
  // Table dimensions (logical units)
  TW: 700, TH: 350,
  POCKET_R: 18,
  BALL_R: 11,
  // Physics uses constant-deceleration model (like real felt):
  //   sliding decel = MU_SLIDE * G  (strong, ~0.2 in SI units)
  //   rolling decel = MU_ROLL  * G  (weak,  ~0.016 in SI units)
  // Scaled to table units where 1 unit ≈ 3.6mm, 60fps
  MU_SLIDE: 0.032,         // sliding friction decel per frame (px/frame²)
  MU_ROLL:  0.0018,        // rolling friction decel per frame (px/frame²)
  MIN_SPEED: 0.05,         // stop threshold
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
  POOL.canvas = document.getElementById('pool-canvas');
  POOL.ctx = POOL.canvas.getContext('2d');
  // Set logical size
  POOL.canvas.width = POOL.TW;
  POOL.canvas.height = POOL.TH;

  // Attach to document so mouse doesn't need to stay over canvas
  document.addEventListener('mousemove', poolMouseMove);
  document.addEventListener('click', poolMouseClick);
  document.addEventListener('touchmove', poolTouchMove, {passive:false});
  document.addEventListener('touchend', poolTouchEnd);
  POOL._docListeners = true;
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
  // Power adjustment (locked state) works anywhere on screen — no gate needed
  // Aiming angle only updates when over the canvas
  if (POOL.isMoving || !POOL.myTurn || !POOL.cueBall || POOL.cueBall.potted) return;
  if (!POOL._screenEl) POOL._screenEl = document.getElementById('pool-screen');
  if (!POOL._screenEl.classList.contains('active')) return;
  POOL.mouseX = mx;
  POOL.mouseY = my;

  if (POOL.shotState === 'aiming') {
    // Orbit mode: angle follows mouse around cue ball (canvas coords)
    const dx = mx - POOL.cueBall.x;
    const dy = my - POOL.cueBall.y;
    POOL.aimAngle = Math.atan2(dy, dx);

  } else if (POOL.shotState === 'locked') {
    // Pull-back mode: use raw screen coords projected onto locked axis
    // This works anywhere on screen, not just over the canvas
    const cos = Math.cos(POOL.lockedAngle);
    const sin = Math.sin(POOL.lockedAngle);
    // Project screen movement onto the shot direction axis
    const sx = (screenX !== undefined ? screenX : mx);
    const sy = (screenY !== undefined ? screenY : my);
    const dx = sx - POOL.lockScreenX;
    const dy = sy - POOL.lockScreenY;
    const proj = dx * cos + dy * sin;
    // Negative projection = pulled back (opposite to shot direction)
    const pullDist = -proj;
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
  const rect = POOL.canvas.getBoundingClientRect();
  POOL.scaleFactor = POOL.canvas.width / rect.width;
  poolHandleMove(
    (touch.clientX - rect.left) * POOL.scaleFactor,
    (touch.clientY - rect.top) * POOL.scaleFactor,
    touch.clientX,
    touch.clientY
  );
}

function poolTouchEnd(e) {
  poolHandleClick(e);
}

function poolDraw() {
  const ctx = POOL.ctx;
  const tw = POOL.TW, th = POOL.TH;
  const pr = POOL.POCKET_R;
  const cw = pr - 2; // cushion visual width

  // ── TABLE SURFACE — drawn to offscreen cache once ──────────────
  if (!POOL._tableBg || POOL._tableBgW !== tw || POOL._tableBgH !== th) {
    const off = document.createElement('canvas');
    off.width = tw; off.height = th;
    const oc = off.getContext('2d');
    const gap2 = POOL.MID_GAP;

    // Outer rail/frame
    oc.fillStyle = '#2a1206';
    oc.fillRect(0, 0, tw, th);

    // Inner felt — noise texture for realistic felt look
    const feltGrad = oc.createRadialGradient(tw*0.5, th*0.5, 0, tw*0.5, th*0.5, Math.max(tw,th)*0.65);
    feltGrad.addColorStop(0,   '#1e7a3c');
    feltGrad.addColorStop(0.5, '#196832');
    feltGrad.addColorStop(1,   '#124d25');
    oc.fillStyle = feltGrad;
    oc.fillRect(pr, pr, tw - pr*2, th - pr*2);

    // Felt noise texture — generated once on a small tile and tiled via pattern
    const feltTile = document.createElement('canvas');
    feltTile.width = 80; feltTile.height = 80;
    const ftx = feltTile.getContext('2d');
    ftx.fillStyle = 'rgba(0,0,0,0)';
    ftx.fillRect(0, 0, 80, 80);
    for (let i = 0; i < 1800; i++) {
      ftx.fillStyle = Math.random() > 0.5
        ? `rgba(0,200,80,${(Math.random() * 0.045).toFixed(3)})`
        : `rgba(0,0,0,${(Math.random() * 0.07).toFixed(3)})`;
      ftx.fillRect(Math.random() * 80, Math.random() * 80, 1, 1);
    }
    const feltPattern = oc.createPattern(feltTile, 'repeat');
    oc.fillStyle = feltPattern;
    oc.fillRect(pr, pr, tw - pr*2, th - pr*2);

    // Felt nap lines
    oc.strokeStyle = 'rgba(255,255,255,0.025)';
    oc.lineWidth = 1;
    for (let y = pr + 8; y < th - pr; y += 8) {
      oc.beginPath(); oc.moveTo(pr, y); oc.lineTo(tw - pr, y); oc.stroke();
    }

    // Baulk line
    const baulkX = pr + (tw - pr*2) * 0.20;
    oc.beginPath(); oc.moveTo(baulkX, pr); oc.lineTo(baulkX, th - pr);
    oc.strokeStyle = 'rgba(255,255,255,0.18)'; oc.lineWidth = 1.2; oc.stroke();

    // D semi-circle
    const dRadius = (th - pr*2) * 0.28;
    oc.beginPath(); oc.arc(baulkX, th/2,Math.max(0,dRadius), -Math.PI/2, Math.PI/2);
    oc.strokeStyle = 'rgba(255,255,255,0.18)'; oc.lineWidth = 1.2; oc.stroke();

    // Spots
    const cx = tw/2, cy = th/2;
    [[cx, cy, 'rgba(255,255,255,0.35)'], [cx+(tw*0.5-pr)*0.5, cy, 'rgba(255,200,200,0.35)'],
     [tw-pr-(tw-pr*2)*0.08, cy, 'rgba(200,200,255,0.3)'], [baulkX, cy, 'rgba(210,180,140,0.35)'],
     [baulkX, cy-dRadius, 'rgba(255,220,50,0.35)'], [baulkX, cy+dRadius, 'rgba(50,220,100,0.35)']
    ].forEach(([sx, sy, sc]) => {
      oc.beginPath(); oc.arc(sx, sy, 2.5, 0, Math.PI*2);
      oc.fillStyle = sc; oc.fill();
    });

    // Pockets
    POOL.POCKETS.forEach(p => {
      const pocketGrad = oc.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.max(0.01,pr*1.1));
      pocketGrad.addColorStop(0, '#000000'); pocketGrad.addColorStop(0.6, '#0a0a0a'); pocketGrad.addColorStop(1, '#1a1a1a');
      oc.beginPath(); oc.arc(p.x, p.y,Math.max(0,pr*1.05), 0, Math.PI*2);
      oc.fillStyle = pocketGrad; oc.fill();
      oc.beginPath(); oc.arc(p.x, p.y,Math.max(0,pr*1.05), 0, Math.PI*2);
      oc.strokeStyle = '#4a3010'; oc.lineWidth = 2.5; oc.stroke();
      oc.beginPath(); oc.arc(p.x, p.y,Math.max(0,pr*1.05), 0, Math.PI*2);
      oc.strokeStyle = 'rgba(120,80,30,0.5)'; oc.lineWidth = 1; oc.stroke();
    });

    // Cushions
    oc.fillStyle = '#1e8040';
    oc.fillRect(pr+gap2, 0, tw/2-pr-gap2*2, cw); oc.fillRect(tw/2+gap2, 0, tw/2-pr-gap2*2, cw);
    oc.fillRect(pr+gap2, th-cw, tw/2-pr-gap2*2, cw); oc.fillRect(tw/2+gap2, th-cw, tw/2-pr-gap2*2, cw);
    oc.fillRect(0, pr+gap2, cw, th-(pr+gap2)*2); oc.fillRect(tw-cw, pr+gap2, cw, th-(pr+gap2)*2);

    // Cushion highlights
    oc.strokeStyle = 'rgba(100,220,100,0.4)'; oc.lineWidth = 1.5;
    [[pr+gap2,cw,tw/2-gap2,cw],[tw/2+gap2,cw,tw-pr-gap2,cw],
     [pr+gap2,th-cw,tw/2-gap2,th-cw],[tw/2+gap2,th-cw,tw-pr-gap2,th-cw],
     [cw,pr+gap2,cw,th-pr-gap2],[tw-cw,pr+gap2,tw-cw,th-pr-gap2]
    ].forEach(([x1,y1,x2,y2]) => { oc.beginPath(); oc.moveTo(x1,y1); oc.lineTo(x2,y2); oc.stroke(); });

    // Rail wood grain
    oc.strokeStyle = 'rgba(80,40,10,0.4)'; oc.lineWidth = 1;
    [4,9,14].forEach(off => {
      oc.beginPath(); oc.moveTo(pr+gap2+off, 1); oc.lineTo(tw/2-gap2-off, 1); oc.stroke();
      oc.beginPath(); oc.moveTo(tw/2+gap2+off, 1); oc.lineTo(tw-pr-gap2-off, 1); oc.stroke();
    });

    POOL._tableBg = off; POOL._tableBgW = tw; POOL._tableBgH = th;
  }
  ctx.drawImage(POOL._tableBg, 0, 0);

  // ── CUE RENDERING ──────────────────────────────────────────────
  if (!POOL.isMoving && POOL.myTurn && !POOL.cueBall.potted) {
    const cb = POOL.cueBall;
    const angle = POOL.shotState === 'locked' ? POOL.lockedAngle : POOL.aimAngle;
    const power = POOL.shotState === 'locked' ? POOL.pullback : 0.3;

    const aimLen = 60 + power * 140;
    ctx.beginPath();
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = POOL.shotState === 'locked'
      ? `rgba(255,${Math.round(200 - power*200)},0,0.7)`
      : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(cb.x, cb.y);
    ctx.lineTo(cb.x + Math.cos(angle) * aimLen, cb.y + Math.sin(angle) * aimLen);
    ctx.stroke();
    ctx.setLineDash([]);

    const TIP_GAP = POOL.BALL_R + 2;
    const CUE_LEN = 160;
    const PULLBACK_MAX = 50;
    const pullPx = POOL.shotState === 'locked' ? POOL.pullback * PULLBACK_MAX : 0;
    const tipDist = TIP_GAP + pullPx;
    const tipX = cb.x - Math.cos(angle) * tipDist;
    const tipY = cb.y - Math.sin(angle) * tipDist;
    const buttX = tipX - Math.cos(angle) * CUE_LEN;
    const buttY = tipY - Math.sin(angle) * CUE_LEN;

    const cueGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
    cueGrad.addColorStop(0, '#e8d5a0');
    cueGrad.addColorStop(0.25, '#c8a060');
    cueGrad.addColorStop(1, '#6b3a1f');
    ctx.beginPath();
    ctx.strokeStyle = cueGrad;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(buttX, buttY);
    ctx.stroke();

    const perpX = -Math.sin(angle) * 1.5;
    const perpY = Math.cos(angle) * 1.5;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(tipX + perpX, tipY + perpY);
    ctx.lineTo(buttX + perpX, buttY + perpY);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.beginPath();
    ctx.arc(tipX, tipY, 3, 0, Math.PI*2);
    ctx.fillStyle = '#4488ff';
    ctx.fill();
  }

  // Opponent's cue — only shown when it's their turn, not ours
  if (!POOL.isMoving && !POOL.myTurn && POOL.oppCue && !POOL.cueBall.potted) {
    const cb = POOL.cueBall;
    const opp = POOL.oppCue;
    const angle = opp.angle;
    const pullback = opp.pullback || 0;
    const isLocked = opp.state === 'locked';
    const power = isLocked ? pullback : 0.3;

    const aimLen = 60 + power * 140;
    ctx.beginPath();
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = isLocked
      ? `rgba(255,${Math.round(160 - pullback*160)},0,0.5)`
      : 'rgba(255,180,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(cb.x, cb.y);
    ctx.lineTo(cb.x + Math.cos(angle) * aimLen, cb.y + Math.sin(angle) * aimLen);
    ctx.stroke();
    ctx.setLineDash([]);

    const TIP_GAP = POOL.BALL_R + 2;
    const CUE_LEN = 160;
    const PULLBACK_MAX = 50;
    const pullPx = isLocked ? pullback * PULLBACK_MAX : 0;
    const tipDist = TIP_GAP + pullPx;
    const tipX = cb.x - Math.cos(angle) * tipDist;
    const tipY = cb.y - Math.sin(angle) * tipDist;
    const buttX = tipX - Math.cos(angle) * CUE_LEN;
    const buttY = tipY - Math.sin(angle) * CUE_LEN;

    ctx.save();
    ctx.globalAlpha = 0.55;
    const oppCueGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
    oppCueGrad.addColorStop(0, '#ffe0a0');
    oppCueGrad.addColorStop(0.25, '#e09040');
    oppCueGrad.addColorStop(1, '#7a4010');
    ctx.beginPath();
    ctx.strokeStyle = oppCueGrad;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(buttX, buttY);
    ctx.stroke();

    const perpX = -Math.sin(angle) * 1.5;
    const perpY = Math.cos(angle) * 1.5;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,220,150,0.3)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(tipX + perpX, tipY + perpY);
    ctx.lineTo(buttX + perpX, buttY + perpY);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.beginPath();
    ctx.arc(tipX, tipY, 3, 0, Math.PI*2);
    ctx.fillStyle = '#ff9900';
    ctx.fill();
    ctx.restore();
  }

  // ── BALL DROP SHADOWS (render before balls) ─────────────────────
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  POOL.balls.forEach(ball => {
    if (ball.potted) return;
    const r = POOL.BALL_R;
    ctx.beginPath();
    ctx.ellipse(ball.x + 3, ball.y + 4, r * 0.85, r * 0.5, 0, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.restore();

  // ── COLLISION SPARKS ────────────────────────────────────────────
  if (POOL._sparks && POOL._sparks.length) {
    for (let _si = POOL._sparks.length - 1; _si >= 0; _si--) {
      const sp = POOL._sparks[_si];
      ctx.beginPath();
      ctx.arc(sp.x, sp.y,Math.max(0,sp.r), 0, Math.PI * 2);
      ctx.fillStyle = sp.isCue
        ? `rgba(0, 245, 255, ${sp.life.toFixed(2)})`
        : `rgba(255, 220, 80, ${sp.life.toFixed(2)})`;
      ctx.fill();
      sp.x += sp.vx; sp.y += sp.vy;
      sp.vx *= 0.88; sp.vy *= 0.88;
      sp.life -= 0.055;
      if (sp.life <= 0) { POOL._sparks[_si] = POOL._sparks[POOL._sparks.length - 1]; POOL._sparks.pop(); }
    }
  }

  // ── BALLS ───────────────────────────────────────────────────────
  POOL.balls.forEach(ball => {
    if (ball.potted) return;
    const r = POOL.BALL_R, bx = ball.x, by = ball.y;
    const spr = POOL._ballSprites && POOL._ballSprites[ball.id];
    if (spr) {
      const off = spr.width / 2;
      ctx.drawImage(spr, bx - off, by - off);
    } else {
      // Fallback plain circle
      ctx.beginPath(); ctx.arc(bx, by,Math.max(0,r), 0, Math.PI*2);
      ctx.fillStyle = POOL.BALL_COLORS[ball.id] || '#fff'; ctx.fill();
    }
  });
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
  poolInit();
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

  if (POOL.playerNum === 1) {
    // Host: set up balls and push to Firebase
    poolSetupBalls();
    poolSyncBallsToFirebase();
    setTimeout(() => {
      poolGetCanvas();
      poolDraw();
      poolUpdateTurnIndicator();
      poolUpdateScores();
    }, 50);
  } else {
    // Guest: fetch ball positions from Firebase so they match the host's rack
    setTimeout(async () => {
      poolGetCanvas();
      const snap = await get(ref(db, `pool/${POOL.roomCode}/balls`));
      if (snap.exists()) poolBallsFromData(snap.val());
      else poolSetupBalls(); // fallback if host hasn't pushed yet
      poolDraw();
      poolUpdateTurnIndicator();
      poolUpdateScores();
    }, 50);
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
      // Shot in progress — apply positions and ensure render loop is running
      // If _observingShot not yet set by parent listener (race), use isMoving as fallback
      if (!POOL._observingShot && !POOL.isMoving) return; // truly idle, ignore
      if (!POOL._observingShot) POOL._observingShot = -1; // placeholder until parent catches up
      poolBallsFromData(data.balls);
      if (!POOL._observerRendering) _startObserverRender();
    } else {
      // balls:null — shooter's animation finished
      if (POOL._observingShot) {
        POOL._observingShot = 0;
        POOL.isMoving = false;
        _stopObserverRender();
      }
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



function slLaunchGame(game, room) {
  // Clean up lobby listeners
  SL.unsubs.forEach(u => typeof u === 'function' && u());
  SL.unsubs = [];

  const isHost = SL.isHost;
  const myName = SL.playerName;
  const oppName = isHost ? (room.player2 && room.player2.name) : room.player1.name;
  const gameCode = room.gameCode;

  if (game === 'battleships') {
    // Pre-fill battleships state and skip to placement
    state.playerName = myName;
    state.playerNum = isHost ? 1 : 2;
    state.roomCode = gameCode;
    document.getElementById('player-name').value = myName;

    if (isHost) {
      // Host sets up the Firebase room for battleships
      set(ref(db, `rooms/${gameCode}`), {
        status: 'placing',
        player1: { name: myName, ready: false, shots: [] },
        player2: { name: oppName, ready: false, shots: [] },
        turn: 1, winner: null,
      }).then(() => {
        document.getElementById('main-subtitle').textContent = 'NAVAL COMBAT SYSTEM v2.0';
        document.getElementById('header-room-code').textContent = gameCode;
        document.getElementById('room-code-display').style.display = '';
        startPlacement();
      });
    } else {
      // Guest just joins — room already exists
      document.getElementById('main-subtitle').textContent = 'NAVAL COMBAT SYSTEM v2.0';
      document.getElementById('header-room-code').textContent = gameCode;
      document.getElementById('room-code-display').style.display = '';
      startPlacement();
    }

  } else if (game === 'pool') {
    POOL.playerName = myName;
    POOL.playerNum = isHost ? 1 : 2;
    POOL.roomCode = gameCode;
    POOL.opponentName = oppName;
    POOL.isBot = false;
    document.getElementById('pool-player-name').value = myName;

    if (isHost) {
      poolInit();
      poolSetupBalls();
      POOL.myTurn = true;
      POOL.myBallType = null;
      POOL.opponentBallType = null;
      POOL.myPotted = 0; POOL.oppPotted = 0;
      POOL.shotState = 'aiming'; POOL.pullback = 0;
      set(ref(db, `pool/${gameCode}`), {
        status: 'playing', winner: null, turn: 1,
        balls: poolBallsToData(), lastShot: null, ballTypes: null,
        player1: { name: myName }, player2: { name: oppName },
      }).then(() => {
        document.getElementById('main-subtitle').textContent = '8-BALL — ONLINE MULTIPLAYER';
        document.getElementById('header-room-code').textContent = gameCode;
        document.getElementById('room-code-display').style.display = '';
        showScreen('pool-screen');
        setTimeout(() => { poolGetCanvas(); poolDraw(); poolUpdateTurnIndicator(); poolUpdateScores(); }, 50);
        poolListenToGame();
      });
    } else {
      poolInit();
      POOL.myTurn = false;
      POOL.myBallType = null;
      POOL.opponentBallType = null;
      POOL.myPotted = 0; POOL.oppPotted = 0;
      POOL.shotState = 'aiming'; POOL.pullback = 0;
      POOL.shotSeq = 0;
      POOL._lastObservedSeq = 0;
  POOL._observingShot = 0;
      document.getElementById('main-subtitle').textContent = '8-BALL — ONLINE MULTIPLAYER';
      document.getElementById('header-room-code').textContent = gameCode;
      document.getElementById('room-code-display').style.display = '';
      showScreen('pool-screen');
      // Fetch initial ball state from Firebase before drawing
      setTimeout(async () => {
        poolGetCanvas();
        const snap = await get(ref(db, `pool/${gameCode}/balls`));
        if (snap.exists()) poolBallsFromData(snap.val());
        else poolSetupBalls(); // fallback
        poolDraw();
        poolUpdateTurnIndicator();
        poolUpdateScores();
      }, 50);
      poolListenToGame();
    }
  } else if (game === 'scrabble') {
    scrLaunchFromLobby(room, isHost, myName, oppName, gameCode);
  } else if (game === 'trivia') {
    triviaLaunchFromLobby(isHost, myName, oppName, gameCode);
  } else if (game === 'hangman') {
    hangmanLaunchFromLobby(isHost, myName, oppName, gameCode);
  } else if (game === 'connectfour') {
    c4LaunchFromLobby(isHost, myName, oppName, gameCode);
  } else if (game === 'poker') {
    pokerLaunchFromLobby(isHost, myName, oppName, gameCode);
  } else if (game === 'chess') {
    chessLaunchFromLobby(isHost, myName, oppName, gameCode);
  } else if (game === 'uno') {
    window.UNO?.launchMulti(isHost, myName, oppName, gameCode);
  } else if (game === 'pokemon') {
    window.PKM?.launchMulti(isHost, myName, oppName, gameCode);
  }
}


// ============================================================
