// ============================================================
// MINIGOLF — golf.js
// Drop into your arcade root alongside other game files.
// Requires Three.js r128 loaded globally (via index.html CDN).
// Uses window._fbRef / _fbGet / _fbSet / _fbOnValue for Firebase.
// Uses window.showScreen / window.backToGameSelect / window.HS.
// ============================================================

export default (() => {

  // ── Constants ──────────────────────────────────────────────
  const MAX_STROKES = 10;
  const BALL_R      = 0.18;
  const GRAVITY     = -20;
  const FRICTION    = 0.988;
  const GND_FRIC    = 0.91;
  const MAX_POWER   = 20;
  const HOLE_PAR    = [2,3,2,3,3,2,3,3,2];

  // ── Colours ────────────────────────────────────────────────
  const C = {
    sky:     0x87CEEB, grass:  0x4ade80, fairway: 0x6ee7b7,
    wall:    0xfbbf24, wallDk: 0xd97706, ball:    0xffffff,
    flag:    0xff3333, cup:    0x111122, mill:    0xf97316,
    bumper:  0x818cf8, water:  0x38bdf8, tunnel:  0x7c3aed,
    ramp:    0xfde68a, post:   0xaaaaaa,
  };

  // ── Module-level state ────────────────────────────────────
  let renderer, scene, camera, clock;
  let ball, ballVel, ballOnGround, ballInMotion;
  let currentHole = 0, strokes = 0;
  let scorecard   = new Array(9).fill(null);
  let gameOver    = false, animId = null;
  let holeObjs    = [], holeCup = null, holeFlag = null;
  let windmills   = [], bumpers = [], movingWalls = [];
  let aimLine     = null;
  let camTheta    = Math.PI, camPhi = 1.0, camRadius = 9;
  let isDraggingCam = false, lastPtr = null;
  let aimStart = null, aimCurrent = null, isAiming = false;
  let container = null, canvas = null;

  // Multiplayer
  let mpMode = false, myId = null, roomCode = null;
  let mpNames = {}, mpScores = {}, mpTurn = null;
  let mpUnsubs = [];

  // ── Firebase helpers ───────────────────────────────────────
  const _ref     = p     => window._fbRef(p);
  const _get     = r     => window._fbGet(r);
  const _set     = (r,v) => window._fbSet(r,v);
  const _onValue = (r,cb)=> window._fbOnValue(r,cb);

  // ────────────────────────────────────────────────────────────
  // THREE.JS BOOTSTRAP
  // ────────────────────────────────────────────────────────────
  function bootThree() {
    container = document.getElementById('golf-canvas-wrap');
    if (!container || !window.THREE) return false;
    const T3 = window.THREE;

    renderer = new T3.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T3.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(C.sky);
    container.appendChild(renderer.domElement);
    canvas = renderer.domElement;

    scene = new T3.Scene();
    scene.fog = new T3.Fog(C.sky, 40, 90);

    camera = new T3.PerspectiveCamera(55, 1, 0.1, 200);
    clock  = new T3.Clock();

    scene.add(new T3.AmbientLight(0xffffff, 0.55));
    const sun = new T3.DirectionalLight(0xfffbe0, 1.3);
    sun.position.set(10, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left   = -25; sun.shadow.camera.right  = 25;
    sun.shadow.camera.top    =  25; sun.shadow.camera.bottom = -25;
    sun.shadow.camera.near   = 0.5; sun.shadow.camera.far    = 100;
    scene.add(sun);

    doResize();
    window.addEventListener('resize', doResize);
    return true;
  }

  function doResize() {
    if (!container || !renderer) return;
    const w = container.clientWidth, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }

  // ────────────────────────────────────────────────────────────
  // MESH FACTORIES
  // ────────────────────────────────────────────────────────────
  function phongMat(col, shine) {
    return new window.THREE.MeshPhongMaterial({ color: col, shininess: shine || 40 });
  }
  function addMesh(geo, col, x, y, z, ry) {
    const m = new window.THREE.Mesh(geo, phongMat(col));
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m); holeObjs.push(m);
    return m;
  }
  function boxGeo(w, h, d) { return new window.THREE.BoxGeometry(w, h, d); }
  function floor(w, d, x, z, col, y) {
    return addMesh(boxGeo(w, 0.2, d), col||C.fairway, x, (y||0)-0.1, z);
  }
  function wall(w, h, d, x, y, z, col, ry) {
    return addMesh(boxGeo(w, h, d), col||C.wall, x, y, z, ry);
  }
  function sideWalls(len, cx, cz, hw) {
    const half = hw || 1.6;
    wall(len, 1.1, 0.28, cx, 0.55, cz + half);
    wall(len, 1.1, 0.28, cx, 0.55, cz - half);
  }
  function endCap(x, cz, hw) {
    wall(0.28, 1.1, (hw||1.6)*2, x, 0.55, cz);
  }

  // ────────────────────────────────────────────────────────────
  // OBSTACLE BUILDERS
  // ────────────────────────────────────────────────────────────
  function buildWindmill(x, z, speed) {
    const T3 = window.THREE;
    wall(0.15, 1.4, 0.15, x, 0.7, z, C.post);
    const hub = new T3.Mesh(boxGeo(0.3,0.3,0.3), phongMat(C.wall));
    hub.position.set(x,1.4,z);
    scene.add(hub); holeObjs.push(hub);
    const grp = new T3.Group();
    grp.position.set(x,1.4,z);
    for (let i=0;i<4;i++) {
      const blade = new T3.Mesh(boxGeo(1.7,0.15,0.09), phongMat(C.mill));
      const a = i*Math.PI/2;
      blade.position.set(Math.cos(a)*0.85, Math.sin(a)*0.85, 0);
      blade.rotation.z = a;
      grp.add(blade);
    }
    scene.add(grp); holeObjs.push(grp);
    windmills.push({ grp, speed: speed||1.5, angle: 0 });
  }

  function buildTunnel(x, z, len) {
    floor(len, 3.2, x, z, C.tunnel);
    const T3 = window.THREE;
    const roof = new T3.Mesh(boxGeo(len,0.25,3.2), phongMat(0x4c1d95));
    roof.position.set(x,1.3,z);
    scene.add(roof); holeObjs.push(roof);
    [x-len/2, x+len/2].forEach(px => wall(0.25,1.35,3.2, px,0.67,z, 0x4c1d95));
  }

  function addBumper(x, z) {
    addMesh(boxGeo(0.42,1.1,0.42), C.bumper, x,0.55,z);
    bumpers.push({ x, z, r:0.52 });
  }

  function addMovingWall(x, z, axis, range, speed, phase) {
    const m = wall(0.28,1.05,2.8, x,0.52,z, C.mill);
    movingWalls.push({ m, axis, cx:x, cz:z, range, speed, phase:phase||0 });
  }

  function placeCup(x, z, y) {
    const T3 = window.THREE;
    const yy = y||0;
    const cup = new T3.Mesh(
      new T3.CylinderGeometry(0.3,0.3,0.06,20),
      phongMat(C.cup)
    );
    cup.position.set(x, yy+0.03, z);
    scene.add(cup); holeObjs.push(cup);
    holeCup = cup;
    holeCup._wp = new T3.Vector3(x, yy, z);
    wall(0.05,1.6,0.05, x,yy+0.8,z, C.post);
    const flag = new T3.Mesh(boxGeo(0.5,0.28,0.05), phongMat(C.flag));
    flag.position.set(x+0.27, yy+1.5, z);
    scene.add(flag); holeObjs.push(flag);
    holeFlag = flag;
  }

  // ────────────────────────────────────────────────────────────
  // HOLE DEFINITIONS  (9 holes)
  // ────────────────────────────────────────────────────────────
  function hole1() {
    floor(13,3.2, 0,0); sideWalls(13,0,0); endCap(-6.5,0); endCap(6.5,0);
    addBumper(0,0);
    placeCup(5.5,0);
  }
  function hole2() {
    // Horizontal arm
    floor(11,3.2, -0.5,-5); sideWalls(11,-0.5,-5);
    endCap(-6,-5); wall(0.28,1.1,3.2, 5.5,0.55,-5);
    // Corner
    floor(3.2,3.2, 5,-3.5);
    // Vertical arm
    floor(3.2,8, 5,0.5);
    wall(0.28,1.1,8, 3.5,0.55,0.5); wall(0.28,1.1,8, 6.5,0.55,0.5);
    wall(3.2,1.1,0.28, 5,0.55,4.5);
    buildWindmill(3.2,-3.5);
    placeCup(5,4);
  }
  function hole3() {
    floor(13,3.2, 0,0); sideWalls(13,0,0); endCap(-6.5,0); endCap(6.5,0);
    addMovingWall(-2.5,0,'x',1.3,1.6,0);
    addMovingWall( 2.5,0,'x',1.3,1.6,Math.PI);
    placeCup(5.5,0);
  }
  function hole4() {
    const T3 = window.THREE;
    floor(5,3.2,-3.5,0); sideWalls(5,-3.5,0); endCap(-6,0);
    // Ramp
    const ramp = new T3.Mesh(boxGeo(3,0.22,3.2), phongMat(C.ramp));
    ramp.position.set(0,0.72,0); ramp.rotation.z=-0.44;
    scene.add(ramp); holeObjs.push(ramp);
    // Elevated green
    floor(4.5,3.2, 3.8,0, C.fairway, 1.35);
    wall(4.5,1.6,0.28, 3.8,2.15, 1.6); wall(4.5,1.6,0.28, 3.8,2.15,-1.6);
    wall(0.28,1.6,3.2, 6,2.15,0);
    wall(3,1.5,0.28, 0,1.1, 1.6); wall(3,1.5,0.28, 0,1.1,-1.6);
    placeCup(5,0,1.37);
  }
  function hole5() {
    floor(7,3.2,-2,-4); sideWalls(7,-2,-4); endCap(-5.5,-4);
    wall(0.28,1.1,3.2, 5.5,0.55,-4);
    floor(3.2,3.2, 3.5,-2.5);
    floor(3.2,9, 5,2.5);
    wall(0.28,1.1,9, 3.5,0.55,2.5); wall(0.28,1.1,9, 6.5,0.55,2.5);
    wall(3.2,1.1,0.28, 5,0.55,7);
    [[-1,-2.5],[1,-2.5],[4.5,1],[4.5,-1]].forEach(([x,z])=>addBumper(x,z));
    placeCup(5,6);
  }
  function hole6() {
    floor(13,3.2, 0,0); sideWalls(13,0,0); endCap(-6.5,0); endCap(6.5,0);
    buildTunnel(0,0,4.5);
    placeCup(5.5,0);
  }
  function hole7() {
    floor(15,3.2, 0,0); sideWalls(15,0,0); endCap(-7.5,0); endCap(7.5,0);
    buildWindmill(-4,0,1.4); buildWindmill(0,0,1.9); buildWindmill(4,0,1.4);
    placeCup(6.5,0);
  }
  function hole8() {
    // Tee platform
    floor(3.2,3.2,-4.5,0); sideWalls(3.2,-4.5,0); endCap(-6,0);
    wall(0.28,1.1,3.2,-3,0.55,0);
    // Bridge
    floor(3,1, 0,0, C.ramp);
    wall(3,0.5,0.12, 0,0.35, 0.56); wall(3,0.5,0.12, 0,0.35,-0.56);
    // Green
    floor(3.2,3.2, 4.5,0); sideWalls(3.2,4.5,0); endCap(6,0);
    wall(0.28,1.1,3.2, 3,0.55,0);
    addBumper(4.5,0);
    // Water
    const T3 = window.THREE;
    const wt = new T3.Mesh(
      new T3.PlaneGeometry(15,7),
      new T3.MeshPhongMaterial({ color:C.water, transparent:true, opacity:0.72, shininess:180 })
    );
    wt.rotation.x=-Math.PI/2; wt.position.set(0,-0.06,0);
    scene.add(wt); holeObjs.push(wt);
    placeCup(4.5,0);
  }
  function hole9() {
    floor(15,3.2, 0,0); sideWalls(15,0,0); endCap(-7.5,0); endCap(7.5,0);
    addMovingWall(-4.5,0,'x',1.2,2.1,0);
    buildWindmill(0,0,2.2);
    buildTunnel(4.5,0,3.5);
    [[-2,0.9],[-2,-0.9],[2,0.9],[2,-0.9]].forEach(([x,z])=>addBumper(x+0.5,z));
    placeCup(6.5,0);
  }

  const HOLES = [
    { par:2, tee:[-5.5,0],  teeY:0,    camT:Math.PI,       build:hole1 },
    { par:3, tee:[-5.5,-5], teeY:0,    camT:Math.PI*0.8,   build:hole2 },
    { par:2, tee:[-5.5,0],  teeY:0,    camT:Math.PI,       build:hole3 },
    { par:3, tee:[-5.5,0],  teeY:0,    camT:Math.PI,       build:hole4 },
    { par:3, tee:[-5,-4],   teeY:0,    camT:Math.PI*0.75,  build:hole5 },
    { par:2, tee:[-5.5,0],  teeY:0,    camT:Math.PI,       build:hole6 },
    { par:3, tee:[-6.5,0],  teeY:0,    camT:Math.PI,       build:hole7 },
    { par:3, tee:[-4.5,0],  teeY:0,    camT:Math.PI,       build:hole8 },
    { par:2, tee:[-6.5,0],  teeY:0,    camT:Math.PI,       build:hole9 },
  ];

  // ────────────────────────────────────────────────────────────
  // HOLE LOADING
  // ────────────────────────────────────────────────────────────
  function loadHole(idx) {
    currentHole=idx; strokes=0;
    windmills=[]; bumpers=[]; movingWalls=[];
    ballInMotion=false;
    holeObjs.forEach(o => {
      scene.remove(o);
      o.geometry?.dispose();
      [o.material].flat().forEach(m => m?.dispose());
    });
    holeObjs=[]; holeCup=null; holeFlag=null;
    const h = HOLES[idx];
    h.build();
    spawnBall(h.tee[0], h.tee[1], h.teeY);
    camTheta=h.camT; camPhi=1.0; camRadius=9;
    updateHUD();
    flash(`HOLE ${idx+1} — PAR ${h.par}`);
  }

  // ────────────────────────────────────────────────────────────
  // BALL
  // ────────────────────────────────────────────────────────────
  function spawnBall(x, z, y) {
    if (ball) scene.remove(ball);
    const T3 = window.THREE;
    ball = new T3.Mesh(
      new T3.SphereGeometry(BALL_R,16,16),
      new T3.MeshPhongMaterial({ color:C.ball, shininess:120, specular:0xffffff })
    );
    ball.castShadow=true;
    ball.position.set(x, (y||0)+BALL_R+0.02, z);
    scene.add(ball);
    ballVel=new T3.Vector3(); ballOnGround=true; ballInMotion=false;
  }

  // ────────────────────────────────────────────────────────────
  // PHYSICS
  // ────────────────────────────────────────────────────────────
  function groundY(x) {
    if (currentHole===3) {
      if (x>-1.9 && x<1.9) return (x+1.9)/3.8*1.35;
      if (x>=1.9) return 1.37;
    }
    return 0.0;
  }

  function tickPhysics(dt) {
    if (!ball||gameOver) return;
    if (!ballOnGround) ballVel.y += GRAVITY*dt;
    ball.position.addScaledVector(ballVel, dt);
    ballVel.x*=FRICTION; ballVel.z*=FRICTION;

    const gy = groundY(ball.position.x);
    if (ball.position.y <= gy+BALL_R) {
      ball.position.y = gy+BALL_R;
      if (ballVel.y < -0.8) ballVel.y = -ballVel.y*0.28;
      else { ballVel.y=0; ballOnGround=true; }
      ballVel.x*=GND_FRIC; ballVel.z*=GND_FRIC;
    } else ballOnGround=false;

    // Wall bounce
    const T3 = window.THREE;
    holeObjs.forEach(obj => {
      if (!obj.geometry?.parameters || obj===holeFlag) return;
      const p = obj.geometry.parameters;
      if (!p || (p.height||0)<0.5) return;
      const ob = new T3.Box3().setFromObject(obj);
      const sp = new T3.Sphere(ball.position, BALL_R);
      if (!ob.intersectsSphere(sp)) return;
      const ctr=new T3.Vector3(); ob.getCenter(ctr);
      const sz=new T3.Vector3();  ob.getSize(sz);
      const dx=ball.position.x-ctr.x, dz=ball.position.z-ctr.z;
      const ox=sz.x/2+BALL_R-Math.abs(dx), oz=sz.z/2+BALL_R-Math.abs(dz);
      if (ox<oz) { ballVel.x=-ballVel.x*0.65; ball.position.x+=Math.sign(dx)*(ox+0.005); }
      else        { ballVel.z=-ballVel.z*0.65; ball.position.z+=Math.sign(dz)*(oz+0.005); }
    });

    // Bumpers
    bumpers.forEach(b => {
      const dx=ball.position.x-b.x, dz=ball.position.z-b.z;
      const d=Math.hypot(dx,dz);
      if (d>0 && d<b.r+BALL_R) {
        const nx=dx/d, nz=dz/d, dot=ballVel.x*nx+ballVel.z*nz;
        ballVel.x-=2*dot*nx*1.15; ballVel.z-=2*dot*nz*1.15;
        ball.position.x=b.x+nx*(b.r+BALL_R+0.01);
        ball.position.z=b.z+nz*(b.r+BALL_R+0.01);
      }
    });

    if (ball.position.y < -2.5) { penaltyReset(); return; }

    const spd2=ballVel.x**2+ballVel.z**2;
    if (spd2<0.003&&ballOnGround) { ballVel.x=0; ballVel.z=0; }
    ballInMotion = !ballOnGround || spd2>0.006;

    // Cup
    const wp=holeCup?._wp;
    if (wp) {
      const dx=ball.position.x-wp.x, dz=ball.position.z-wp.z;
      if (Math.hypot(dx,dz)<0.3 && Math.abs(ball.position.y-wp.y)<0.55 && ballVel.length()<7) {
        onSunk();
      }
    }
  }

  function penaltyReset() {
    strokes++;
    const h=HOLES[currentHole];
    spawnBall(h.tee[0],h.tee[1],h.teeY);
    updateHUD(); flash('OUT OF BOUNDS — +1');
  }

  // ────────────────────────────────────────────────────────────
  // CAMERA
  // ────────────────────────────────────────────────────────────
  function tickCamera() {
    if (!ball||!camera) return;
    const bp=ball.position;
    camera.position.set(
      bp.x+camRadius*Math.sin(camTheta)*Math.sin(camPhi),
      bp.y+camRadius*Math.cos(camPhi),
      bp.z+camRadius*Math.cos(camTheta)*Math.sin(camPhi)
    );
    camera.lookAt(bp);
  }

  // ────────────────────────────────────────────────────────────
  // AIM LINE
  // ────────────────────────────────────────────────────────────
  function drawAimLine(dir, power) {
    const T3=window.THREE;
    if (!aimLine) {
      aimLine=new T3.Line(new T3.BufferGeometry(), new T3.LineBasicMaterial({color:0xffff00}));
      scene.add(aimLine);
    }
    aimLine.geometry.setFromPoints([ball.position.clone(), ball.position.clone().addScaledVector(dir,power*0.35)]);
  }
  function clearAimLine() { if(aimLine){scene.remove(aimLine);aimLine=null;} }

  // ────────────────────────────────────────────────────────────
  // INPUT
  // ────────────────────────────────────────────────────────────
  function ptrPos(e) {
    const r=canvas.getBoundingClientRect(), s=e.touches?e.touches[0]:e;
    return { x:s.clientX-r.left, y:s.clientY-r.top };
  }

  // Direction derived from pixel-space drag so it works regardless of aspect ratio.
  function dragDir(a,b) {
    const T3=window.THREE;
    const fwd=new T3.Vector3(); camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize();
    const right=new T3.Vector3().crossVectors(fwd,new T3.Vector3(0,1,0)).normalize();
    return new T3.Vector3()
      .addScaledVector(fwd,  -(a.y-b.y))
      .addScaledVector(right,-(a.x-b.x))
      .setY(0).normalize();
  }

  // 200px drag = full power. Dragging back toward start genuinely reduces power.
  function dragPow(a,b) {
    const px=Math.hypot(a.x-b.x, a.y-b.y);
    return Math.min(px/200*MAX_POWER, MAX_POWER);
  }

  function onPtrDown(e) {
    if (e.button!==undefined && e.button!==0) return; // left-click / touch only
    if (ballInMotion||gameOver) return;
    if (mpMode&&mpTurn!==myId) return;
    isAiming=true;
    aimStart=ptrPos(e); aimCurrent={...aimStart};
    e.preventDefault();
  }

  function onPtrMove(e) {
    const pos=ptrPos(e);
    if (isAiming) {
      aimCurrent=pos;
      const pow=dragPow(aimStart,aimCurrent);
      drawAimLine(dragDir(aimStart,aimCurrent), pow);
      setPower(pow/MAX_POWER);
    }
    lastPtr=pos;
    e.preventDefault();
  }

  function onPtrUp() {
    if (isAiming&&aimStart&&aimCurrent) {
      const pow=dragPow(aimStart,aimCurrent);
      if (pow>0.5) shoot(dragDir(aimStart,aimCurrent),pow);
      clearAimLine(); setPower(0);
    }
    isAiming=false; aimStart=null; aimCurrent=null;
    if (!isDraggingCam) lastPtr=null;
  }

  function onWheel(e) { camRadius=Math.max(4,Math.min(20,camRadius+e.deltaY*0.018)); }

  // Right-click drag rotates camera — handled separately from pointer events
  // so it never conflicts with left-click aiming.
  function onMouseDown(e) {
    if (e.button===2) { isDraggingCam=true; lastPtr=ptrPos(e); }
  }
  function onMouseMove(e) {
    if (isDraggingCam&&lastPtr) {
      const pos=ptrPos(e);
      camTheta-=(pos.x-lastPtr.x)*0.010;
      camPhi=Math.max(0.22,Math.min(Math.PI/2.1,camPhi+(pos.y-lastPtr.y)*0.010));
      lastPtr=pos;
    }
  }
  function onMouseUp(e) {
    if (e.button===2) { isDraggingCam=false; lastPtr=null; }
  }

  function shoot(dir,power) {
    if (!ball||ballInMotion||strokes>=MAX_STROKES) return;
    strokes++;
    ballVel.set(dir.x*power, power*0.12, dir.z*power);
    ballOnGround=false; ballInMotion=true; ball.visible=true;
    updateHUD();
  }

  // ────────────────────────────────────────────────────────────
  // HUD
  // ────────────────────────────────────────────────────────────
  function updateHUD() {
    const el=document.getElementById('gf-hud-info');
    if (el) el.textContent=`HOLE ${currentHole+1}/9  ·  PAR ${HOLES[currentHole].par}  ·  STROKES ${strokes}`;
    if (mpMode) updateMPHUD();
  }
  function setPower(pct) {
    const f=document.getElementById('gf-power-fill');
    if (!f) return;
    f.style.width=(pct*100)+'%';
    f.style.background=pct<0.5?'#4ade80':pct<0.8?'#fbbf24':'#f87171';
  }
  function flash(msg) {
    const el=document.getElementById('gf-status');
    if (!el) return;
    el.textContent=msg; el.classList.add('visible');
    clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('visible'),2600);
  }

  // ────────────────────────────────────────────────────────────
  // GAME FLOW
  // ────────────────────────────────────────────────────────────
  function onSunk() {
    ballInMotion=false; ballVel.set(0,0,0); ball.visible=false;
    scorecard[currentHole]=strokes;
    const d=strokes-HOLES[currentHole].par;
    flash(d<=-2?'🦅 EAGLE!':d===-1?'🐦 BIRDIE!':d===0?'⛳ PAR!':d===1?'😅 BOGEY':d===2?'😬 DOUBLE':'😱 TRIPLE+');
    if (mpMode) fbSubmitScore(currentHole,strokes);
    setTimeout(()=>{
      if (currentHole<8) mpMode ? mpCheckAdvance() : loadHole(currentHole+1);
      else showScorecard();
    },2000);
  }

  function showScorecard() {
    gameOver=true;
    const total=scorecard.reduce((a,b)=>a+(b||0),0);
    const parT=HOLE_PAR.reduce((a,b)=>a+b,0);
    const diff=total-parT;
    const diffStr=diff===0?'E':diff>0?`+${diff}`:`${diff}`;
    const rows=scorecard.map((s,i)=>{
      const d=(s||0)-HOLE_PAR[i];
      const cls=d<0?'gf-birdie':d===0?'gf-par':'gf-bogey';
      return `<tr><td>H${i+1}</td><td>Par ${HOLE_PAR[i]}</td><td class="${cls}">${s??'-'}</td></tr>`;
    }).join('');
    let mpBlock='';
    if (mpMode) {
      const opp=Object.keys(mpScores).find(k=>k!==myId)||'';
      const myT=(mpScores[myId]||[]).reduce((a,b)=>a+(b||0),0);
      const oppT=(mpScores[opp]||[]).reduce((a,b)=>a+(b||0),0);
      mpBlock=`<div class="gf-mp-result">${myT<=oppT?'🏆 YOU WIN!':'😔 OPPONENT WINS'}<br>${mpNames[myId]||'YOU'}: ${myT} &nbsp;|&nbsp; ${mpNames[opp]||'OPP'}: ${oppT}</div>`;
    }
    const modal=document.getElementById('golf-scorecard-modal');
    if (modal) {
      document.getElementById('gf-sc-rows').innerHTML=rows;
      document.getElementById('gf-sc-total').textContent=`${total} (${diffStr})`;
      document.getElementById('gf-mp-result').innerHTML=mpBlock;
      modal.classList.add('active');
    }
    if (!mpMode) window.HS?.promptSubmit('golf',total,`${total} strokes`);
  }

  // ────────────────────────────────────────────────────────────
  // MAIN LOOP
  // ────────────────────────────────────────────────────────────
  function loop() {
    animId=requestAnimationFrame(loop);
    const dt=Math.min(clock.getDelta(),0.05);
    windmills.forEach(w=>{ w.angle+=w.speed*dt; w.grp.rotation.z=w.angle; });
    movingWalls.forEach(w=>{
      w.phase+=w.speed*dt;
      if (w.axis==='x') w.m.position.x=w.cx+Math.sin(w.phase)*w.range;
      else              w.m.position.z=w.cz+Math.sin(w.phase)*w.range;
    });
    if (holeFlag) holeFlag.rotation.y=Math.sin(Date.now()*0.003)*0.35;
    tickPhysics(dt);
    tickCamera();
    renderer.render(scene,camera);
  }

  // ────────────────────────────────────────────────────────────
  // MULTIPLAYER (Firebase)
  // ────────────────────────────────────────────────────────────
  function genCode() { return Math.random().toString(36).slice(2,7).toUpperCase(); }
  function nameVal() {
    const v=(document.getElementById('gf-mp-name')?.value||'').trim().toUpperCase();
    const n=v||'PLAYER'; localStorage.setItem('golf-player-name',n); return n;
  }

  async function hostGame() {
    if (!window._firebaseReady) { alert('Firebase not connected'); return; }
    const name=nameVal(); roomCode=genCode(); myId='host';
    mpNames={host:name}; mpScores={host:[]}; mpTurn='host';
    await _set(_ref(`golf-rooms/${roomCode}`),{
      host:{name,scores:[]}, guest:null, turn:'host', hole:0, state:'waiting'
    });
    document.getElementById('gf-room-code').textContent=roomCode;
    switchPanel('waiting'); listenRoom();
  }

  async function joinGame() {
    if (!window._firebaseReady) { alert('Firebase not connected'); return; }
    const code=(document.getElementById('gf-join-code')?.value||'').trim().toUpperCase();
    if (!code) return;
    const name=nameVal();
    const snap=await _get(_ref(`golf-rooms/${code}`));
    if (!snap.exists()) { alert('Room not found!'); return; }
    const data=snap.val();
    if (data.guest) { alert('Room is full!'); return; }
    roomCode=code; myId='guest';
    mpNames[myId]=name; mpNames['host']=data.host?.name||'HOST';
    await _set(_ref(`golf-rooms/${code}/guest`),{name,scores:[]});
    switchPanel('ingame'); listenRoom(); startMP();
  }

  function listenRoom() {
    const u=_onValue(_ref(`golf-rooms/${roomCode}`),snap=>{
      if (!snap.exists()) return;
      const d=snap.val();
      if (d.host)  mpNames['host'] =d.host.name;
      if (d.guest) mpNames['guest']=d.guest.name;
      if (d.host?.scores)  mpScores['host'] =Object.values(d.host.scores);
      if (d.guest?.scores) mpScores['guest']=Object.values(d.guest.scores);
      if (myId==='host'&&d.guest&&d.state==='waiting') {
        _set(_ref(`golf-rooms/${roomCode}/state`),'playing');
        switchPanel('ingame'); startMP();
      }
      if (d.turn&&d.turn!==mpTurn) {
        mpTurn=d.turn;
        flash(mpTurn===myId?'YOUR TURN!':`${mpNames[mpTurn]||'OPP'}'S TURN`);
      }
      if (d.hole!==undefined&&d.hole!==currentHole&&d.state==='playing') loadHole(d.hole);
      updateMPHUD();
    });
    mpUnsubs.push(u);
  }

  function startMP() { mpMode=true; loadHole(0); updateMPHUD(); }

  async function fbSubmitScore(holeIdx,score) {
    if (!roomCode) return;
    await _set(_ref(`golf-rooms/${roomCode}/${myId}/scores/${holeIdx}`),score);
  }

  async function mpCheckAdvance() {
    await new Promise(r=>setTimeout(r,600));
    const snap=await _get(_ref(`golf-rooms/${roomCode}`));
    if (!snap.exists()) return;
    const d=snap.val();
    const hD=d.host?.scores?.[currentHole]!==undefined;
    const gD=d.guest?.scores?.[currentHole]!==undefined;
    if (hD&&gD) {
      if (currentHole<8) { if(myId==='host') await _set(_ref(`golf-rooms/${roomCode}/hole`),currentHole+1); loadHole(currentHole+1); }
      else showScorecard();
    } else flash('Waiting for opponent…');
  }

  function updateMPHUD() {
    const el=document.getElementById('gf-mp-hud');
    if (!el) return;
    const opp=Object.keys(mpNames).find(k=>k!==myId)||'';
    const myT=(mpScores[myId]||[]).reduce((a,b)=>a+(b||0),0);
    const oppT=(mpScores[opp]||[]).reduce((a,b)=>a+(b||0),0);
    el.innerHTML=`${mpNames[myId]||'YOU'}: ${myT} &nbsp;vs&nbsp; ${mpNames[opp]||'OPP'}: ${oppT}`;
    el.style.display='block';
  }

  function switchPanel(state) {
    document.getElementById('gf-mp-lobby')  .style.display=state==='lobby'  ?'':'none';
    document.getElementById('gf-mp-waiting').style.display=state==='waiting'?'':'none';
    if (state==='ingame') document.getElementById('golf-mp-modal')?.classList.remove('active');
  }

  // ────────────────────────────────────────────────────────────
  // INIT / DESTROY
  // ────────────────────────────────────────────────────────────
  function init() {
    window.showScreen?.('golf-screen');
    if (!bootThree()) { console.error('[golf] Three.js not found'); return; }
    canvas.addEventListener('pointerdown', onPtrDown,  {passive:false});
    canvas.addEventListener('pointermove', onPtrMove,  {passive:false});
    canvas.addEventListener('pointerup',   onPtrUp,    {passive:false});
    canvas.addEventListener('pointerleave',onPtrUp);
    canvas.addEventListener('mousedown',   onMouseDown);
    canvas.addEventListener('mousemove',   onMouseMove);
    canvas.addEventListener('mouseup',     onMouseUp);
    canvas.addEventListener('contextmenu', e=>e.preventDefault());
    canvas.addEventListener('wheel',       onWheel, {passive:true});
    const saved=localStorage.getItem('golf-player-name')||localStorage.getItem('hs-player-name')||'';
    const nEl=document.getElementById('gf-mp-name');
    if (nEl) nEl.value=saved;
    gameOver=false; scorecard=new Array(9).fill(null);
    loadHole(0); loop();
  }

  function destroy() {
    cancelAnimationFrame(animId); animId=null;
    window.removeEventListener('resize',doResize);
    if (canvas) {
      canvas.removeEventListener('pointerdown',  onPtrDown);
      canvas.removeEventListener('pointermove',  onPtrMove);
      canvas.removeEventListener('pointerup',    onPtrUp);
      canvas.removeEventListener('pointerleave', onPtrUp);
      canvas.removeEventListener('mousedown',    onMouseDown);
      canvas.removeEventListener('mousemove',    onMouseMove);
      canvas.removeEventListener('mouseup',      onMouseUp);
      canvas.removeEventListener('wheel',        onWheel);
    }
    mpUnsubs.forEach(u=>{try{u();}catch(e){}});
    mpUnsubs=[];
    if (renderer){ renderer.dispose(); renderer.domElement?.remove(); renderer=null; }
    scene=null; camera=null; ball=null;
    windmills=[]; bumpers=[]; movingWalls=[]; holeObjs=[];
    gameOver=false; mpMode=false; roomCode=null; myId=null;
  }

  // Expose for HTML onclick
  window._golfHost    = hostGame;
  window._golfJoin    = joinGame;
  window._golfRestart = ()=>{ gameOver=false; scorecard=new Array(9).fill(null); document.getElementById('golf-scorecard-modal')?.classList.remove('active'); loadHole(0); };
  window._golfCamReset= ()=>{ camTheta=HOLES[currentHole].camT; camPhi=1.0; };
  window._golfOpenMP  = ()=>{ switchPanel('lobby'); document.getElementById('golf-mp-modal')?.classList.add('active'); };

  return { init, destroy };
})();
