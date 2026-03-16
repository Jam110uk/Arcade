// ============================================================
//  COIN PUSHER 3D  —  British beach arcade coin pusher
//  Requires in repo root: three_core_min.js + cannon-es_min.js
//  Both are ES modules — loaded via dynamic import()
// ============================================================

export default (() => {

  // ── DOM / renderer ────────────────────────────────────────────
  let wrap, renderer, scene, camera, clock, animId;
  let destroyed = false;
  let THREE = null, CANNON = null;

  // ── Game state ─────────────────────────────────────────────────
  let balance  = 100;   // pence (£1.00)
  let winnings = 0;
  let aimFrac  = 0.5;

  // ── Machine dimensions ────────────────────────────────────────
  const MW         = 7.0;
  const MD         = 3.5;
  const MH         = 9.5;
  const WT         = 0.15;
  const SHELF_D    = MD - WT*2 - 0.1;
  const TRAY_FLOOR = 0.08;
  const LOWER_TOP  = 1.30;
  const UPPER_TOP  = 4.20;
  const SHELF_T    = 0.22;
  const CHUTE_BOT  = UPPER_TOP + SHELF_T + 0.08;
  const CHUTE_TOP  = MH - 0.4;
  const CR = 0.26;
  const CT = 0.06;
  const PUSH_H     = 0.18;
  const PUSH_SPEED = 1.5;

  const PEG_DEFS = [
    [-0.28,0.22],[0.00,0.16],[0.28,0.22],
    [-0.14,0.42],[0.14,0.38],
    [-0.30,0.60],[0.00,0.65],[0.30,0.58],
  ];

  const BONUSES = [
    {emoji:'⭐',value:10, label:'+10p',col:0xffdd00},
    {emoji:'🍀',value:20, label:'+20p',col:0x00cc44},
    {emoji:'💎',value:50, label:'+50p',col:0x44aaff},
    {emoji:'🎰',value:100,label:'+£1!',col:0xff4488},
    {emoji:'🌈',value:30, label:'+30p',col:0xff88ff},
    {emoji:'🍭',value:5,  label:'+5p', col:0xff8844},
    {emoji:'🎁',value:25, label:'+25p',col:0xff4444},
    {emoji:'🦄',value:40, label:'+40p',col:0xcc44ff},
  ];

  // ── Physics refs ──────────────────────────────────────────────
  let world;
  const coinBodies = [];
  let upperPusherBody, lowerPusherBody;
  let upperPusherMesh, lowerPusherMesh;
  let upperPusherDir = 1, lowerPusherDir = -1;
  let dropLocked = false, bonusTimer = 5;
  let aimArrow;

  // ── Materials ─────────────────────────────────────────────────
  let coinMat, pusherMat, shelfMat, cabinetMat,
      chromeMat, trayMat, neonMat, pegMat;

  // ── Audio ─────────────────────────────────────────────────────
  let aCtx;
  function getAC() {
    if (!aCtx) aCtx = new (window.AudioContext||window.webkitAudioContext)();
    return aCtx;
  }
  function beep(freq,dur,vol=0.07,delay=0,type='sine') {
    try {
      const a=getAC(),o=a.createOscillator(),g=a.createGain(),
            f=a.createBiquadFilter();
      f.type='lowpass';f.frequency.value=Math.min(freq*2.5,2200);f.Q.value=0.4;
      o.connect(f);f.connect(g);g.connect(a.destination);
      o.type=type;o.frequency.setValueAtTime(freq,a.currentTime+delay);
      g.gain.setValueAtTime(0,a.currentTime+delay);
      g.gain.linearRampToValueAtTime(vol,a.currentTime+delay+0.018);
      g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+delay+dur);
      o.start(a.currentTime+delay);o.stop(a.currentTime+delay+dur+0.05);
    }catch(e){}
  }
  function sndClink() { beep(650+Math.random()*300,0.07,0.07,0,'triangle'); }
  function sndLand()  { beep(480,0.10,0.08);beep(320,0.09,0.06,0.06); }
  function sndWin(v)  { const f=v>=50?784:v>=20?659:523;
    beep(f,0.15,0.09);beep(f*1.25,0.12,0.07,0.10);
    if(v>=50)beep(f*1.5,0.10,0.06,0.20); }
  function sndBonus() { beep(1047,0.10,0.08);beep(1319,0.09,0.07,0.09);beep(1568,0.08,0.06,0.18); }
  function sndDrop()  { beep(880,0.05,0.06); }

  // ── Physics ───────────────────────────────────────────────────
  function buildPhysics() {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0,-22,0) });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 14;
    const dm = new CANNON.Material('d');
    world.addContactMaterial(new CANNON.ContactMaterial(dm,dm,{friction:0.45,restitution:0.25}));
    world.defaultContactMaterial.friction    = 0.45;
    world.defaultContactMaterial.restitution = 0.25;

    const sb = (w,h,d,x,y,z) => {
      const b=new CANNON.Body({mass:0});
      b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)));
      b.position.set(x,y,z); world.addBody(b); return b;
    };
    sb(MW+WT*2,MH,WT,   0,MH/2,-MD/2+WT/2);
    sb(WT,MH,MD,  -MW/2-WT/2,MH/2,0);
    sb(WT,MH,MD,   MW/2+WT/2,MH/2,0);
    sb(MW,WT,MD,   0,0,0);
    sb(MW,SHELF_T,SHELF_D, 0,UPPER_TOP+SHELF_T/2,0);
    sb(MW,SHELF_T,SHELF_D, 0,LOWER_TOP+SHELF_T/2,0);
    sb(MW,0.1,SHELF_D, 0,TRAY_FLOOR+0.05,0);
    sb(MW,0.25,WT, 0,UPPER_TOP+0.12,SHELF_D/2+WT/2);
    sb(MW,0.25,WT, 0,LOWER_TOP+0.12,SHELF_D/2+WT/2);

    const cH = CHUTE_TOP-CHUTE_BOT;
    PEG_DEFS.forEach(([xf,yf]) => {
      const b=new CANNON.Body({mass:0});
      b.addShape(new CANNON.Cylinder(0.08,0.08,0.18,10));
      b.position.set(xf*MW*0.44, CHUTE_BOT+yf*cH, 0);
      world.addBody(b);
    });

    const ps = new CANNON.Box(new CANNON.Vec3(MW/2,PUSH_H/2,SHELF_D/2));
    upperPusherBody = new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC});
    upperPusherBody.addShape(ps);
    upperPusherBody.position.set(0,UPPER_TOP+PUSH_H/2,0);
    world.addBody(upperPusherBody);

    lowerPusherBody = new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC});
    lowerPusherBody.addShape(ps);
    lowerPusherBody.position.set(0,LOWER_TOP+PUSH_H/2,SHELF_D*0.15);
    world.addBody(lowerPusherBody);
  }

  // ── Scene ─────────────────────────────────────────────────────
  function buildScene() {
    scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x080315);
    scene.fog = new THREE.FogExp2(0x080315,0.038);
    clock  = new THREE.Clock();

    const aspect = wrap.clientWidth/wrap.clientHeight;
    camera = new THREE.PerspectiveCamera(44,aspect,0.1,80);
    camera.position.set(0,MH*0.54,MD*2.35);
    camera.lookAt(0,MH*0.40,0);

    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setSize(wrap.clientWidth,wrap.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    wrap.appendChild(renderer.domElement);

    // Materials
    chromeMat  = new THREE.MeshStandardMaterial({color:0x99aabb,metalness:0.95,roughness:0.10});
    cabinetMat = new THREE.MeshStandardMaterial({color:0x180840,metalness:0.05,roughness:0.85});
    shelfMat   = new THREE.MeshStandardMaterial({color:0x2a1058,metalness:0.15,roughness:0.70});
    pusherMat  = new THREE.MeshStandardMaterial({color:0xddccff,metalness:0.65,roughness:0.28,transparent:true,opacity:0.80});
    trayMat    = new THREE.MeshStandardMaterial({color:0x3a1878,metalness:0.12,roughness:0.75});
    neonMat    = new THREE.MeshStandardMaterial({color:0xcc88ff,emissive:0xaa44ff,emissiveIntensity:1.4,roughness:0.5});
    pegMat     = new THREE.MeshStandardMaterial({color:0xf0c040,metalness:0.92,roughness:0.18});

    // Coin canvas texture
    const cs=128, cv=document.createElement('canvas');
    cv.width=cv.height=cs;
    const cx=cv.getContext('2d');
    const cg=cx.createRadialGradient(cs*0.38,cs*0.35,cs*0.06,cs/2,cs/2,cs*0.5);
    cg.addColorStop(0,'#f2c860');cg.addColorStop(0.5,'#c48218');cg.addColorStop(1,'#7a4a08');
    cx.beginPath();cx.arc(cs/2,cs/2,cs*0.48,0,Math.PI*2);cx.fillStyle=cg;cx.fill();
    cx.beginPath();cx.arc(cs/2,cs/2,cs*0.44,0,Math.PI*2);
    cx.strokeStyle='rgba(255,200,80,0.55)';cx.lineWidth=4;cx.stroke();
    cx.beginPath();cx.arc(cs/2,cs/2,cs*0.30,0,Math.PI*2);
    cx.strokeStyle='rgba(160,100,20,0.45)';cx.lineWidth=3;cx.stroke();
    cx.beginPath();cx.ellipse(cs*0.35,cs*0.34,cs*0.13,cs*0.08,-0.4,0,Math.PI*2);
    cx.fillStyle='rgba(255,240,160,0.5)';cx.fill();
    cx.font=`bold ${cs*0.26}px Arial`;cx.fillStyle='rgba(255,255,220,0.88)';
    cx.textAlign='center';cx.textBaseline='middle';
    cx.strokeStyle='rgba(60,30,0,0.55)';cx.lineWidth=3;
    cx.strokeText('2p',cs/2,cs/2);cx.fillText('2p',cs/2,cs/2);
    coinMat = new THREE.MeshStandardMaterial({
      map:new THREE.CanvasTexture(cv),color:0xc07818,metalness:0.90,roughness:0.20
    });

    // Lighting
    scene.add(new THREE.AmbientLight(0x221044,0.9));
    const sun=new THREE.DirectionalLight(0xfff0dd,1.1);
    sun.position.set(3,14,7);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-7;sun.shadow.camera.right=7;
    sun.shadow.camera.top=11;sun.shadow.camera.bottom=-2;
    scene.add(sun);
    [[- 2.5,0],[0,0],[2.5,0]].forEach(([x,z],i)=>{
      const pl=new THREE.PointLight([0xffe0a0,0xe8d0ff,0xa8d8ff][i],1.6,9);
      pl.position.set(x,MH*0.80,z);scene.add(pl);
    });
    const ul=new THREE.PointLight(0xc080ff,1.1,5.5);
    ul.position.set(0,UPPER_TOP+1.2,MD*0.35);scene.add(ul);
    const ll=new THREE.PointLight(0x8844ff,0.9,4.5);
    ll.position.set(0,LOWER_TOP+0.8,MD*0.35);scene.add(ll);

    const add=(geo,mat,x,y,z)=>{
      const m=new THREE.Mesh(geo,mat);
      m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;
      scene.add(m);return m;
    };

    // Cabinet
    add(new THREE.BoxGeometry(MW+WT*2,MH,WT),      cabinetMat,0,MH/2,-MD/2);
    add(new THREE.BoxGeometry(WT,MH,MD),            cabinetMat,-MW/2-WT/2,MH/2,0);
    add(new THREE.BoxGeometry(WT,MH,MD),            cabinetMat, MW/2+WT/2,MH/2,0);
    add(new THREE.BoxGeometry(MW+WT*2,WT,MD+WT*2),  chromeMat,0,MH,0);
    add(new THREE.BoxGeometry(MW+WT*2,WT,MD+WT*2),  chromeMat,0,0,0);
    [-1,1].forEach(sx=>add(new THREE.BoxGeometry(0.07,MH,0.07),chromeMat,sx*(MW/2+WT*0.5),MH/2,MD/2));
    [-0.35,0,0.35].forEach(fx=>add(new THREE.BoxGeometry(MW*0.22,0.07,0.07),neonMat,fx*MW,MH+0.07,MD/2-0.06));

    // Glass front
    const gm=new THREE.Mesh(new THREE.PlaneGeometry(MW,CHUTE_TOP-LOWER_TOP),
      new THREE.MeshStandardMaterial({color:0x8899cc,transparent:true,opacity:0.07,side:THREE.DoubleSide}));
    gm.position.set(0,LOWER_TOP+(CHUTE_TOP-LOWER_TOP)/2,MD/2);scene.add(gm);

    // Shelves
    add(new THREE.BoxGeometry(MW,SHELF_T,SHELF_D),shelfMat,0,UPPER_TOP+SHELF_T/2,0);
    add(new THREE.BoxGeometry(MW,0.25,0.10),chromeMat,0,UPPER_TOP+0.12,SHELF_D/2+0.05);
    add(new THREE.BoxGeometry(MW,SHELF_T,SHELF_D),shelfMat,0,LOWER_TOP+SHELF_T/2,0);
    add(new THREE.BoxGeometry(MW,0.25,0.10),chromeMat,0,LOWER_TOP+0.12,SHELF_D/2+0.05);

    // Tray
    add(new THREE.BoxGeometry(MW,0.10,SHELF_D),trayMat,0,TRAY_FLOOR+0.05,0);
    add(new THREE.BoxGeometry(MW,0.85,0.10),trayMat,0,TRAY_FLOOR+0.42,SHELF_D/2+0.05);

    // Pegs
    const pg=new THREE.CylinderGeometry(0.08,0.08,0.18,12);
    const cH=CHUTE_TOP-CHUTE_BOT;
    PEG_DEFS.forEach(([xf,yf])=>{
      const m=new THREE.Mesh(pg,pegMat);
      m.position.set(xf*MW*0.44,CHUTE_BOT+yf*cH,0);m.castShadow=true;scene.add(m);
    });

    // Pushers
    const pushGeo=new THREE.BoxGeometry(MW,PUSH_H,SHELF_D);
    upperPusherMesh=new THREE.Mesh(pushGeo,pusherMat);scene.add(upperPusherMesh);
    lowerPusherMesh=new THREE.Mesh(pushGeo,pusherMat);scene.add(lowerPusherMesh);

    // Aim arrow sprite
    const ac2=document.createElement('canvas');ac2.width=ac2.height=64;
    const ax2=ac2.getContext('2d');
    ax2.fillStyle='rgba(0,240,200,0.9)';
    ax2.beginPath();ax2.moveTo(32,6);ax2.lineTo(54,30);ax2.lineTo(38,30);
    ax2.lineTo(38,58);ax2.lineTo(26,58);ax2.lineTo(26,30);ax2.lineTo(10,30);
    ax2.closePath();ax2.fill();
    aimArrow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(ac2),transparent:true}));
    aimArrow.scale.set(0.5,0.5,0.5);scene.add(aimArrow);

    seedCoins();
  }

  // ── Spawn helpers ─────────────────────────────────────────────
  function makeCoinBody(x,y,z,vx=0,vz=0) {
    const body=new CANNON.Body({mass:0.005,linearDamping:0.42,angularDamping:0.65});
    body.addShape(new CANNON.Cylinder(CR,CR,CT,12));
    body.position.set(x,y,z);
    body.velocity.set(vx,0,vz);
    world.addBody(body);
    return body;
  }

  function spawnCoin(x,y,z,shelf='upper') {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(CR,CR,CT,22),coinMat);
    mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.rotation.x=(Math.random()-0.5)*0.3;
    mesh.rotation.z=(Math.random()-0.5)*0.3;
    scene.add(mesh);
    const body=makeCoinBody(x,y,z,(Math.random()-0.5)*0.4,(Math.random()-0.5)*0.4);
    coinBodies.push({mesh,body,type:'coin',value:2,shelf});
  }

  function spawnBonus(x,y,z) {
    const b=BONUSES[Math.floor(Math.random()*BONUSES.length)];
    const ec=document.createElement('canvas');ec.width=ec.height=96;
    const ex=ec.getContext('2d');
    ex.font=`${96*0.75}px serif`;ex.textAlign='center';ex.textBaseline='middle';
    ex.fillText(b.emoji,48,48);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(ec),transparent:true}));
    spr.scale.set(0.65,0.65,0.65);spr.position.set(x,y,z);scene.add(spr);
    const body=new CANNON.Body({mass:0.003,linearDamping:0.55,angularDamping:0.9});
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.22,0.22,0.06)));
    body.position.set(x,y,z);world.addBody(body);
    coinBodies.push({mesh:spr,body,type:'bonus',value:b.value,label:b.label,
                     emoji:b.emoji,col:b.col,shelf:'upper',bobT:Math.random()*Math.PI*2});
  }

  function seedCoins() {
    const hw=MW/2-CR*1.5, hd=SHELF_D/2-CR*1.5;
    for(let i=0;i<24;i++) spawnCoin(
      (Math.random()*2-1)*hw,
      UPPER_TOP+SHELF_T+CT/2+Math.floor(i/8)*CT*0.7+Math.random()*0.04,
      (Math.random()*2-1)*hd,'upper');
    for(let i=0;i<28;i++) spawnCoin(
      (Math.random()*2-1)*hw,
      LOWER_TOP+SHELF_T+CT/2+Math.floor(i/9)*CT*0.7+Math.random()*0.04,
      (Math.random()*2-1)*hd,'lower');
    spawnBonus(-MW*0.22,UPPER_TOP+SHELF_T+0.5,-SHELF_D*0.1);
    spawnBonus( MW*0.22,UPPER_TOP+SHELF_T+0.5, SHELF_D*0.1);
    spawnBonus(0,LOWER_TOP+SHELF_T+0.5,0);
  }

  // ── Drop a coin ───────────────────────────────────────────────
  function dropCoin() {
    if(dropLocked||balance<2||!world)return;
    try{getAC().resume();}catch(e){}
    balance-=2;sndDrop();
    dropLocked=true;setTimeout(()=>{dropLocked=false;},700);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(CR,CR,CT,22),coinMat);
    mesh.castShadow=true;scene.add(mesh);
    const body=new CANNON.Body({mass:0.005,linearDamping:0.18,angularDamping:0.40});
    body.addShape(new CANNON.Cylinder(CR,CR,CT,12));
    const dx=(aimFrac-0.5)*MW*0.86;
    body.position.set(dx,CHUTE_TOP-0.4,(Math.random()-0.5)*0.08);
    body.velocity.set((Math.random()-0.5)*0.6,-1.8,0);
    body.angularVelocity.set((Math.random()-0.5)*4,0,(Math.random()-0.5)*4);
    world.addBody(body);
    coinBodies.push({mesh,body,type:'coin',value:2,shelf:'falling'});
  }

  // ── Collect ───────────────────────────────────────────────────
  function collectItem(obj) {
    balance+=obj.value;winnings+=obj.value;
    if(obj.type==='bonus')sndBonus();else sndWin(obj.value);
    const hex='#'+(obj.type==='bonus'?obj.col:0x00ff88).toString(16).padStart(6,'0');
    const text=obj.type==='bonus'?`${obj.emoji} ${obj.label}`:'+2p';
    const el=document.createElement('div');
    el.textContent=text;
    el.style.cssText=`position:absolute;pointer-events:none;z-index:100;
      font-family:'Orbitron',sans-serif;font-size:clamp(12px,2.5vw,18px);
      font-weight:bold;color:${hex};text-shadow:0 0 8px ${hex};
      left:50%;transform:translateX(-50%);bottom:10%;white-space:nowrap;
      animation:cp3pop 1.6s ease-out forwards;`;
    wrap.appendChild(el);
    setTimeout(()=>el.parentNode&&el.parentNode.removeChild(el),1700);
  }

  // ── HUD ───────────────────────────────────────────────────────
  let hudBal,hudCoins,hudWin;
  function buildHUD() {
    const st=document.createElement('style');
    st.textContent=`
      .cp3hud{position:absolute;top:0;left:0;right:0;display:flex;
        justify-content:space-between;align-items:stretch;padding:5px 14px;
        background:rgba(6,2,18,0.90);border-bottom:1px solid rgba(160,90,240,0.3);
        font-family:'Share Tech Mono',monospace;pointer-events:none;gap:10px;z-index:10;}
      .cp3st{display:flex;flex-direction:column;justify-content:center;min-width:80px}
      .cp3lb{font-size:clamp(0.4rem,1vw,0.58rem);letter-spacing:0.18em;
        color:rgba(160,110,240,0.55);margin-bottom:2px}
      .cp3vl{font-family:'Orbitron',sans-serif;font-size:clamp(0.7rem,2vw,1rem);
        font-weight:bold;letter-spacing:0.08em}
      @keyframes cp3pop{0%{opacity:1;transform:translateX(-50%) translateY(0)}
        100%{opacity:0;transform:translateX(-50%) translateY(-65px)}}`;
    wrap.appendChild(st);
    const h=document.createElement('div');h.className='cp3hud';
    h.innerHTML=`
      <div class="cp3st"><div class="cp3lb">BALANCE</div>
        <div class="cp3vl" id="cp3b" style="color:#00ff88">£1.00</div></div>
      <div class="cp3st" style="text-align:center"><div class="cp3lb">COINS LEFT</div>
        <div class="cp3vl" id="cp3c" style="color:#00e5ff">50 × 2p</div></div>
      <div class="cp3st" style="text-align:right"><div class="cp3lb">WINNINGS</div>
        <div class="cp3vl" id="cp3w" style="color:#ffdd00">£0.00</div></div>`;
    wrap.appendChild(h);
    hudBal=wrap.querySelector('#cp3b');
    hudCoins=wrap.querySelector('#cp3c');
    hudWin=wrap.querySelector('#cp3w');
  }
  function updateHUD() {
    if(hudBal){hudBal.textContent=`£${(balance/100).toFixed(2)}`;
      hudBal.style.color=balance<20?'#ff5555':'#00ff88';}
    if(hudCoins)hudCoins.textContent=`${Math.floor(balance/2)} × 2p`;
    if(hudWin)hudWin.textContent=`£${(winnings/100).toFixed(2)}`;
  }

  // ── Main loop ─────────────────────────────────────────────────
  function animate() {
    if(destroyed)return;
    animId=requestAnimationFrame(animate);
    if(document.hidden)return;
    const dt=Math.min(clock.getDelta(),0.05);
    world.step(1/60,dt,3);

    coinBodies.forEach(obj=>{
      obj.mesh.position.copy(obj.body.position);
      if(obj.type==='coin') obj.mesh.quaternion.copy(obj.body.quaternion);
      else { obj.bobT=(obj.bobT||0)+dt*2.8;
             obj.mesh.position.y=obj.body.position.y+Math.sin(obj.bobT)*0.06; }
    });

    const maxZ=SHELF_D/2-0.10, minZ=-SHELF_D/2+0.10;
    upperPusherBody.position.z+=PUSH_SPEED*upperPusherDir*dt;
    if(upperPusherBody.position.z>maxZ){upperPusherBody.position.z=maxZ;upperPusherDir=-1;}
    if(upperPusherBody.position.z<minZ){upperPusherBody.position.z=minZ;upperPusherDir= 1;}
    upperPusherMesh.position.copy(upperPusherBody.position);
    upperPusherMesh.position.y=UPPER_TOP+PUSH_H/2;

    lowerPusherBody.position.z+=PUSH_SPEED*lowerPusherDir*dt*0.82;
    if(lowerPusherBody.position.z>maxZ){lowerPusherBody.position.z=maxZ;lowerPusherDir=-1;}
    if(lowerPusherBody.position.z<minZ){lowerPusherBody.position.z=minZ;lowerPusherDir= 1;}
    lowerPusherMesh.position.copy(lowerPusherBody.position);
    lowerPusherMesh.position.y=LOWER_TOP+PUSH_H/2;

    checkFallen();

    bonusTimer-=dt;
    if(bonusTimer<=0){
      bonusTimer=8+Math.random()*10;
      spawnBonus((Math.random()-0.5)*(MW-1),UPPER_TOP+SHELF_T+0.55,(Math.random()-0.5)*(SHELF_D-0.8));
    }

    if(aimArrow){
      aimArrow.position.set((aimFrac-0.5)*MW*0.86,CHUTE_TOP+0.35,MD*0.48);
      aimArrow.visible=!dropLocked&&balance>=2;
    }
    updateHUD();
    renderer.render(scene,camera);
  }

  function checkFallen() {
    const rem=[];
    coinBodies.forEach((obj,i)=>{
      const py=obj.body.position.y;
      if(obj.shelf==='falling'&&py<UPPER_TOP+SHELF_T+CT+0.15){
        obj.shelf='upper';sndLand();return;
      }
      if(obj.shelf==='upper'&&py<UPPER_TOP-0.5){
        obj.body.position.y=LOWER_TOP+SHELF_T+CT/2+0.4;
        obj.body.velocity.set(obj.body.velocity.x*0.4,-1,obj.body.velocity.z*0.4);
        obj.shelf='lower';sndClink();return;
      }
      if(obj.shelf==='lower'&&py<LOWER_TOP-0.4){collectItem(obj);rem.push(i);return;}
      if(obj.shelf==='lower'&&py<TRAY_FLOOR+0.3)obj.shelf='tray';
      if(obj.shelf==='tray'&&py<TRAY_FLOOR-0.2){collectItem(obj);rem.push(i);return;}
      if(py<-2||Math.abs(obj.body.position.x)>MW)rem.push(i);
    });
    rem.slice().reverse().forEach(i=>{
      const obj=coinBodies[i];
      scene.remove(obj.mesh);world.removeBody(obj.body);
      coinBodies.splice(i,1);
    });
  }

  // ── Input ─────────────────────────────────────────────────────
  function getAim(cx){const r=wrap.getBoundingClientRect();aimFrac=Math.max(0,Math.min(1,(cx-r.left)/r.width));}
  function onMouseMove(e){getAim(e.clientX);}
  function onTouchMove(e){e.preventDefault();if(e.touches[0])getAim(e.touches[0].clientX);}
  function onClick(){try{getAC().resume();}catch(e){}dropCoin();}
  function onKey(e){
    if(e.code==='Space'||e.code==='Enter'){e.preventDefault();try{getAC().resume();}catch(ex){}dropCoin();}
    if(e.code==='ArrowLeft') aimFrac=Math.max(0,aimFrac-0.04);
    if(e.code==='ArrowRight')aimFrac=Math.min(1,aimFrac+0.04);
  }
  function onResize(){
    if(!renderer||!camera||!wrap)return;
    camera.aspect=wrap.clientWidth/wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth,wrap.clientHeight);
  }

  // ── DOM shell ─────────────────────────────────────────────────
  function buildHTML(el) {
    el.innerHTML=`
      <style>
        #cp3r{width:100%;height:100%;display:flex;flex-direction:column;
          background:#080315;user-select:none;}
        #cp3tb{display:flex;align-items:center;justify-content:space-between;
          padding:5px 12px;border-bottom:1px solid rgba(160,90,240,0.25);
          flex-shrink:0;gap:8px;font-family:'Share Tech Mono',monospace;}
        #cp3ti{font-family:'Orbitron',sans-serif;font-size:clamp(0.6rem,2vw,1rem);
          color:#c084fc;letter-spacing:0.2em;text-shadow:0 0 10px rgba(192,132,252,0.6);}
        #cp3hi{font-size:clamp(0.44rem,1vw,0.62rem);color:rgba(160,90,240,0.45);letter-spacing:0.07em;}
        #cp3wp{flex:1;min-height:0;position:relative;cursor:crosshair;touch-action:none;overflow:hidden;}
        .cp3b{padding:3px 10px;background:transparent;border:1px solid rgba(160,90,240,0.35);
          color:rgba(180,110,255,0.8);font-family:'Share Tech Mono',monospace;
          font-size:clamp(0.46rem,1.1vw,0.65rem);letter-spacing:0.1em;cursor:pointer;
          transition:all 0.15s;white-space:nowrap;}
        .cp3b:hover{background:rgba(160,90,240,0.1);border-color:#c084fc;color:#c084fc;}
        #cp3ld{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          flex-direction:column;gap:14px;background:#080315;z-index:50;}
        #cp3lt{font-family:'Orbitron',sans-serif;color:#c084fc;
          font-size:clamp(0.8rem,2vw,1.2rem);letter-spacing:0.2em;}
        #cp3lbw{width:200px;height:6px;background:rgba(160,90,240,0.2);border-radius:3px;overflow:hidden;}
        #cp3lb2{height:100%;width:0%;background:#c084fc;border-radius:3px;transition:width 0.3s;}
        #cp3lm{font-family:'Share Tech Mono',monospace;color:rgba(160,90,240,0.6);
          font-size:clamp(0.5rem,1vw,0.65rem);letter-spacing:0.1em;}
      </style>
      <div id="cp3r">
        <div id="cp3tb">
          <div id="cp3ti">🪙 COIN PUSHER 3D</div>
          <div id="cp3hi">AIM WITH MOUSE · CLICK / SPACE TO DROP</div>
          <div style="display:flex;gap:6px">
            <button class="cp3b" id="cp3nb">▶ NEW GAME</button>
            <button class="arcade-back-btn" id="cp3bk">🕹 ARCADE</button>
          </div>
        </div>
        <div id="cp3wp">
          <div id="cp3ld">
            <div id="cp3lt">COIN PUSHER 3D</div>
            <div id="cp3lbw"><div id="cp3lb2"></div></div>
            <div id="cp3lm">LOADING...</div>
          </div>
        </div>
      </div>`;
    wrap=el.querySelector('#cp3wp');
    el.querySelector('#cp3nb').addEventListener('click',restartGame);
    el.querySelector('#cp3bk').addEventListener('click',()=>window.backToGameSelect?.());
    wrap.addEventListener('mousemove',onMouseMove);
    wrap.addEventListener('click',onClick);
    wrap.addEventListener('touchmove',onTouchMove,{passive:false});
    wrap.addEventListener('touchstart',e=>{e.preventDefault();onClick();},{passive:false});
    window.addEventListener('keydown',onKey);
    window.addEventListener('resize',onResize);
  }

  function setLoad(pct,msg){
    const b=document.getElementById('cp3lb2'),m=document.getElementById('cp3lm');
    if(b)b.style.width=pct+'%';if(m)m.textContent=msg;
  }

  function restartGame(){
    balance=100;winnings=0;aimFrac=0.5;bonusTimer=5;dropLocked=false;
    upperPusherDir=1;lowerPusherDir=-1;
    upperPusherBody.position.set(0,UPPER_TOP+PUSH_H/2,0);
    lowerPusherBody.position.set(0,LOWER_TOP+PUSH_H/2,SHELF_D*0.15);
    coinBodies.forEach(o=>{scene.remove(o.mesh);world.removeBody(o.body);});
    coinBodies.length=0;
    seedCoins();updateHUD();
  }

  // ── Init ──────────────────────────────────────────────────────
  async function init() {
    const el=document.getElementById('coinpusher-screen');
    if(!el){console.warn('[coinpusher3d] screen not found');return;}
    destroyed=false;
    buildHTML(el);

    try {
      setLoad(10,'LOADING THREE.JS...');
      // Dynamic ES module imports — works with local files on GitHub Pages
      const threeModule = await import('./three_core_min.js');
      THREE = threeModule;   // named exports are on the module object itself

      setLoad(55,'LOADING PHYSICS...');
      const cannonModule = await import('./cannon-es_min.js');
      // cannon-es exports classes directly as named exports
      CANNON = cannonModule;

      setLoad(80,'BUILDING SCENE...');
      buildPhysics();
      buildScene();
      buildHUD();

      setLoad(100,'READY!');
      setTimeout(()=>{
        const ld=document.getElementById('cp3ld');
        if(ld)ld.style.display='none';
        animate();
      },300);

    } catch(err) {
      console.error('[coinpusher3d] Load error:', err);
      const ld=document.getElementById('cp3ld');
      if(ld) ld.innerHTML=`
        <div style="color:#ff4444;font-family:monospace;padding:24px;text-align:center;line-height:2">
          Failed to load 3D engine.<br>
          <span style="font-size:0.8em;color:rgba(255,120,120,0.7)">
            ${err.message||err}
          </span>
        </div>`;
    }
  }

  function destroy(){
    destroyed=true;
    if(animId){cancelAnimationFrame(animId);animId=null;}
    window.removeEventListener('keydown',onKey);
    window.removeEventListener('resize',onResize);
    if(renderer){renderer.dispose();renderer=null;}
    const el=document.getElementById('coinpusher-screen');
    if(el)el.innerHTML='';
    coinBodies.length=0;
  }

  return {init,destroy};
})();
