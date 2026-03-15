// ZM game module
// Auto-extracted from monolithic index.html

export default (function () {
  //=============================================================
  //  ZUMA — faithful recreation
  //
  //  CHAIN MODEL:
  //    chain[] = flat array of orbs, index 0 = FRONT (closest to skull)
  //    each orb has .dist (arc-length from path start to centre)
  //    Invariant: chain[i].dist > chain[i+1].dist  (front has higher dist)
  //
  //  SEGMENTS:
  //    A "gap" exists between chain[i] and chain[i+1] when their dist
  //    difference exceeds SPACING*1.4. Gaps form after matches.
  //    Each segment moves independently:
  //      - Front segments (closer to skull): stop advancing when a gap
  //        is behind them; if the gap edges match colour they get pulled
  //        BACKWARD (dist decreases) toward the back segment.
  //      - Back segments: always advance toward skull.
  //    When gap closes: check for match → cascade.
  //
  //  MATCH:
  //    3+ touching same-colour orbs → pop, score, leave gap.
  //=============================================================

  const ORB_R     = 14;
  const ORB_D     = ORB_R * 2;
  const SPACING   = ORB_D + 1;          // px centre-to-centre (tightly packed)
  const SPEED_BASE= 14;                 // px/s forward crawl at level 1
  const SHOOT_SPD = 9;                  // px/frame fired ball
  const CLOSE_SPD = 320;               // px/s back-segment advance speed (unused legacy)
  const GAP_THRESHOLD = SPACING * 1.5; // dist gap larger than this = real segment gap
  const ATTRACT_SPD   = 380;           // px/s front-segment magnetic pull-back speed

  const COLORS=['#ff2d78','#00f5ff','#39ff14','#ffe600','#bf00ff','#ff6a00'];
  const GLOWS =['rgba(255,45,120,.85)','rgba(0,245,255,.85)','rgba(57,255,20,.85)',
                'rgba(255,230,0,.85)','rgba(191,0,255,.85)','rgba(255,106,0,.85)'];
  const SKULL_R = 24;

  // ── Pre-rendered orb sprite cache ─────────────────────────────────────────
  const ORB_SPRITES = [];
  function buildOrbSprites() {
    ORB_SPRITES.length = 0;
    for (let ci = 0; ci < COLORS.length; ci++) {
      const sz = ORB_R * 2 + 10;
      const oc = document.createElement('canvas');
      oc.width = oc.height = sz;
      const oc2d = oc.getContext('2d');
      const cx = sz/2, cy = sz/2;
      oc2d.shadowColor = GLOWS[ci]; oc2d.shadowBlur = 8;
      const gr = oc2d.createRadialGradient(cx - ORB_R*.3,cy - ORB_R*.35,Math.max(0.01,ORB_R*.04),cx,cy,Math.max(0.01,ORB_R));
      gr.addColorStop(0, lighten(COLORS[ci], .5));
      gr.addColorStop(.5, COLORS[ci]);
      gr.addColorStop(1, darken(COLORS[ci], .45));
      oc2d.beginPath(); oc2d.arc(cx, cy,Math.max(0,ORB_R), 0, Math.PI*2);
      oc2d.fillStyle = gr; oc2d.fill();
      oc2d.shadowBlur = 5; oc2d.strokeStyle = lighten(COLORS[ci], .22);
      oc2d.lineWidth = 1.1; oc2d.stroke(); oc2d.shadowBlur = 0;
      oc2d.beginPath(); oc2d.arc(cx - ORB_R*.28, cy - ORB_R*.32,Math.max(0,ORB_R*.2), 0, Math.PI*2);
      oc2d.fillStyle = 'rgba(255,255,255,0.65)'; oc2d.fill();
      ORB_SPRITES[ci] = oc;
    }
  }
  const TRACK_NAMES = ['S-CURVE','SPIRAL','FIGURE-8','ZIGZAG','TWIN LOOPS','WAVE','CROSSOVER','SNAKE',
                       'COIL','OMEGA','PINWHEEL','HEARTBEAT','VORTEX','BOWTIE','LABYRINTH','HELIX',
                       'DUAL WAVE','DUAL SPIRAL','DUAL ZIGZAG','DUAL LOOPS',
                       'TRIPLE SNAKE','TRIPLE WAVE','TRIPLE SPIRAL'];

  // ── state ────────────────────────────────────────────────
  let W=800, H=600, canvas, ctx;
  // Multi-track: arrays of path data, one per active track
  let paths=[];   // [{pts, dist, len}]
  let chains=[];  // one chain array per track
  let trackLayout=0;
  let ball=null;
  let shooterAngle=-Math.PI/2;
  let shooterCi=0, nextCi=1;
  let score=0, best=0, level=1;
  let paused=false, dead=false, won=false;
  let raf=null, lastTs=0, elapsedMs=0;
  let popAnims=[], scorePopups=[], bgStars=[];
  let trackNameTimer=0;

  // Legacy single-chain accessors for old code paths
  // (doInsert / checkMatches still work on the active chain context set via _ctx*)
  let _ctxChain=null, _ctxPath=null;

  // ── PATH ─────────────────────────────────────────────────
  function buildSinglePath(rawPts, mX, mTop, mBot){
    const uw=W-mX*2, uh=H-mTop-mBot;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of rawPts){if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;}
    const rW=maxX-minX||1, rH=maxY-minY||1;
    const pts=[], dist=[];
    let acc=0, prev=null;
    for(const rp of rawPts){
      const pt={x:mX+(rp.x-minX)/rW*uw, y:mTop+(rp.y-minY)/rH*uh};
      if(prev){const dx=pt.x-prev.x,dy=pt.y-prev.y;acc+=Math.sqrt(dx*dx+dy*dy);}
      dist.push(acc); pts.push(pt); prev=pt;
    }
    return {pts, dist, len:acc};
  }

  function pathXYon(path, d){
    d=Math.max(0,Math.min(path.len,d));
    let lo=0,hi=path.dist.length-1;
    while(lo<hi-1){const mid=(lo+hi)>>1;if(path.dist[mid]<d)lo=mid;else hi=mid;}
    const span=path.dist[hi]-path.dist[lo];
    const f=span===0?0:(d-path.dist[lo])/span;
    return{x:path.pts[lo].x+(path.pts[hi].x-path.pts[lo].x)*f,
           y:path.pts[lo].y+(path.pts[hi].y-path.pts[lo].y)*f};
  }

  // Legacy single-path wrappers (used by zmStartLevel resize path)
  function buildPath(){
    const layout = trackLayout % TRACK_NAMES.length;
    paths = buildPathsForLayout(layout);
    _ctxPath = paths[0];
  }
  function pathXY(d){ return pathXYon(_ctxPath||paths[0], d); }

  function buildPathsForLayout(layout){
    const numTracks = layout >= 20 ? 3 : layout >= 16 ? 2 : 1;
    const raw = [];

    if(numTracks === 1){
      const margins = {mX:55, mTop:52, mBot:118};
      raw.push({gen: TRACK_GENERATORS[layout % 16], ...margins});
    } else if(numTracks === 2){
      // Two tracks stacked vertically
      raw.push({gen: TRACK_GENERATORS[(layout-16)*2   % 16], mX:55, mTop:30,  mBot: H/2+10});
      raw.push({gen: TRACK_GENERATORS[(layout-16)*2+1 % 16], mX:55, mTop:H/2+10, mBot:60});
    } else {
      // Three tracks
      const third = Math.floor(H/3);
      raw.push({gen: TRACK_GENERATORS[(layout-20)*3   % 16], mX:55, mTop:20,          mBot:H-third+10});
      raw.push({gen: TRACK_GENERATORS[(layout-20)*3+1 % 16], mX:55, mTop:third+10,    mBot:third+10});
      raw.push({gen: TRACK_GENERATORS[(layout-20)*3+2 % 16], mX:55, mTop:H-third+10,  mBot:20});
    }

    return raw.map(({gen, mX, mTop, mBot}) =>
      buildSinglePath(gen(), mX, mTop, mBot)
    );
  }

  // ── TRACK LAYOUTS ────────────────────────────────────────
  function _trackSCurve(){
    const p=[];
    for(let i=0;i<=600;i++){const t=i/600;p.push({x:.08+.84*t,y:.35+Math.sin(t*Math.PI*2.5)*.22+Math.sin(t*Math.PI*5.1+.9)*.10});}
    return p;
  }
  function _trackSpiral(){
    const p=[],cx=.50,cy=.48,N=900;
    for(let i=0;i<=100;i++)p.push({x:i/100*.14,y:.48});
    for(let i=0;i<=N;i++){
      const t=i/N,ang=t*Math.PI*6.2-Math.PI/2;
      const r=t<.72?.38*(1-t*.87):.38*(1-.72*.87)*(1+(t-.72)/.28*2.4);
      p.push({x:cx+Math.cos(ang)*r,y:cy+Math.sin(ang)*r*.75});
    }
    const last=p[p.length-1];
    for(let i=1;i<=70;i++)p.push({x:last.x+i/70*(.92-last.x),y:last.y});
    return p;
  }
  function _trackFigure8(){
    const p=[],cx=.50,cy=.48,N=800;
    for(let i=0;i<=70;i++)p.push({x:i/70*.10,y:cy});
    for(let i=0;i<=N;i++){
      const a=i/N*Math.PI*2,d=1+Math.sin(a)*Math.sin(a);
      p.push({x:cx+.37*Math.cos(a)/d,y:cy+.37*Math.sin(a)*Math.cos(a)/d*.9});
    }
    const last=p[p.length-1];
    for(let i=1;i<=70;i++)p.push({x:last.x+i/70*(.92-last.x),y:last.y});
    return p;
  }
  function _trackZigzag(){
    const p=[],rows=5,N=120;
    for(let row=0;row<rows;row++){
      const y0=.10+row*(.80/(rows-1)),goR=row%2===0;
      for(let i=0;i<=N;i++){const t=i/N;p.push({x:goR?.08+.84*t:.92-.84*t,y:y0});}
      if(row<rows-1){
        const y1=.10+(row+1)*(.80/(rows-1)),xE=goR?.92:.08,dir=goR?1:-1;
        for(let i=1;i<=36;i++){const a=i/36*Math.PI;p.push({x:xE+dir*.04*Math.sin(a),y:y0+(y1-y0)*i/36});}
      }
    }
    return p;
  }
  function _trackLoops(){
    const p=[],N=300;
    for(let i=0;i<=55;i++)p.push({x:i/55*.10,y:.5});
    const c1x=.28,c1y=.5;
    for(let i=0;i<=N;i++){const a=-Math.PI/2+i/N*Math.PI*2;p.push({x:c1x+Math.cos(a)*.20,y:c1y+Math.sin(a)*.18});}
    for(let i=1;i<=80;i++)p.push({x:.28+i/80*(.72-.28),y:.5});
    const c2x=.72,c2y=.5;
    for(let i=0;i<=N;i++){const a=-Math.PI/2-i/N*Math.PI*2;p.push({x:c2x+Math.cos(a)*.20,y:c2y+Math.sin(a)*.18});}
    for(let i=1;i<=55;i++)p.push({x:.72+i/55*.20,y:.5});
    return p;
  }
  function _trackWave(){
    const p=[];
    for(let i=0;i<=700;i++){const t=i/700;p.push({x:.08+.84*t,y:.50+Math.sin(t*Math.PI*8)*.30+Math.sin(t*Math.PI*3.1)*.09});}
    return p;
  }
  function _trackCrossover(){
    const p=[];
    for(let i=0;i<=600;i++){const t=i/600;p.push({x:.08+.84*t,y:.50+Math.sin(t*Math.PI*2)*.36+Math.sin(t*Math.PI*4.2)*.07});}
    return p;
  }
  function _trackSnake(){
    const p=[];
    for(let i=0;i<=700;i++){const t=i/700;p.push({x:.08+.84*t,y:.50+Math.sin(t*Math.PI*4)*.24+Math.sin(t*Math.PI*7.9)*.09+Math.sin(t*Math.PI*1.3)*.09});}
    return p;
  }
  // ── NEW TRACKS ───────────────────────────────────────────
  function _trackCoil(){
    // Tight coil that expands outward
    const p=[],cx=.50,cy=.50,N=1200;
    for(let i=0;i<=N;i++){
      const t=i/N,ang=t*Math.PI*10-Math.PI/2;
      const r=.05+t*.38;
      p.push({x:cx+Math.cos(ang)*r,y:cy+Math.sin(ang)*r*.75});
    }
    return p;
  }
  function _trackOmega(){
    // Omega Ω shape
    const p=[],N=500;
    for(let i=0;i<=60;i++)p.push({x:i/60*.12,y:.55});
    // big arc top
    for(let i=0;i<=N;i++){const a=Math.PI+i/N*Math.PI;p.push({x:.50+Math.cos(a)*.38,y:.45+Math.sin(a)*.32});}
    // two feet
    for(let i=1;i<=120;i++){const t=i/120;p.push({x:.12+t*.25,y:.55+t*.28});}
    for(let i=0;i<=120;i++){const t=i/120;p.push({x:.37+t*.26,y:.83-t*.28});}
    for(let i=1;i<=60;i++)p.push({x:.63+i/60*.25,y:.55});
    return p;
  }
  function _trackPinwheel(){
    // Star/pinwheel: 4 curved arms from centre
    const p=[],cx=.50,cy=.50,N=200;
    for(let arm=0;arm<4;arm++){
      const baseAng=arm*Math.PI/2;
      if(arm===0) for(let i=0;i<=40;i++)p.push({x:i/40*.12,y:.50});
      for(let i=0;i<=N;i++){
        const t=i/N,r=.08+t*.38,a=baseAng+t*Math.PI*.9;
        p.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r*.8});
      }
    }
    const last=p[p.length-1];
    for(let i=1;i<=40;i++)p.push({x:last.x+i/40*(.88-last.x),y:last.y+(0.50-last.y)*i/40});
    return p;
  }
  function _trackHeartbeat(){
    // ECG/heartbeat flatline with big spike in middle
    const p=[];
    for(let i=0;i<=800;i++){
      const t=i/800,x=.06+.88*t;
      let y=.50;
      if(t>.20&&t<.25) y=.50-(t-.20)/.05*.38;
      else if(t>=.25&&t<.30) y=.12+(t-.25)/.05*.70;
      else if(t>=.30&&t<.33) y=.82-(t-.30)/.03*.32;
      else if(t>=.33&&t<.36) y=.50+(t-.33)/.03*.08;
      else if(t>.60&&t<.65) y=.50-(t-.60)/.05*.38;
      else if(t>=.65&&t<.70) y=.12+(t-.65)/.05*.70;
      else if(t>=.70&&t<.73) y=.82-(t-.70)/.03*.32;
      else if(t>=.73&&t<.76) y=.50+(t-.73)/.03*.08;
      else y=.50+Math.sin(t*Math.PI*22)*.03;
      p.push({x,y});
    }
    return p;
  }
  function _trackVortex(){
    // Inward tightening spiral then burst outward
    const p=[],cx=.50,cy=.50,N=1000;
    for(let i=0;i<=50;i++)p.push({x:i/50*.10,y:.50});
    for(let i=0;i<=N;i++){
      const t=i/N;
      const r = t<.6 ? .42*(1-t/.6*.85) : .42*(1-.85)+(t-.6)/.4*.44;
      const ang=-Math.PI/2+t*Math.PI*8;
      p.push({x:cx+Math.cos(ang)*r,y:cy+Math.sin(ang)*r*.8});
    }
    return p;
  }
  function _trackBowtie(){
    // Two triangular loops meeting at centre
    const p=[],N=300;
    for(let i=0;i<=50;i++)p.push({x:i/50*.10,y:.50});
    for(let i=0;i<=N;i++){const a=-Math.PI/2+i/N*Math.PI*2;p.push({x:.28+Math.cos(a)*.22,y:.50+Math.sin(a)*.26});}
    for(let i=1;i<=60;i++)p.push({x:.28+i/60*(.44-.28),y:.50+(Math.sin(i/60*Math.PI))*.08});
    for(let i=0;i<=N;i++){const a=Math.PI/2+i/N*Math.PI*2;p.push({x:.72+Math.cos(a)*.22,y:.50+Math.sin(a)*.26});}
    for(let i=1;i<=50;i++)p.push({x:.94+i/50*.06,y:.50});
    return p;
  }
  function _trackLabyrinth(){
    // Rectangular maze-like path
    const p=[];
    const segs=[
      [.06,.20,.90,.20],[.90,.20,.90,.45],[.15,.45,.90,.45],
      [.15,.45,.15,.70],[.15,.70,.84,.70],[.84,.70,.84,.88],
      [.06,.88,.84,.88]
    ];
    for(let s=0;s<segs.length;s++){
      const [x0,y0,x1,y1]=segs[s],N=80;
      for(let i=(s===0?0:1);i<=N;i++){
        const t=i/N;
        p.push({x:x0+(x1-x0)*t,y:y0+(y1-y0)*t});
      }
    }
    return p;
  }
  function _trackHelix(){
    // Double-frequency overlapping sine
    const p=[];
    for(let i=0;i<=800;i++){
      const t=i/800;
      p.push({x:.06+.88*t, y:.50+Math.sin(t*Math.PI*12)*.16+Math.cos(t*Math.PI*5)*.18});
    }
    return p;
  }

  const TRACK_GENERATORS=[
    _trackSCurve,_trackSpiral,_trackFigure8,_trackZigzag,
    _trackLoops,_trackWave,_trackCrossover,_trackSnake,
    _trackCoil,_trackOmega,_trackPinwheel,_trackHeartbeat,
    _trackVortex,_trackBowtie,_trackLabyrinth,_trackHelix
  ];

  // ── CHAIN GENERATION ─────────────────────────────────────
  function generateChainOn(path){
    const nColors=Math.min(3+Math.floor((level-1)/2),COLORS.length);
    const pal=Array.from({length:nColors},(_,i)=>i);
    const count=28+level*3;
    const cols=[];
    while(cols.length<count){
      const ci=pal[Math.floor(Math.random()*pal.length)];
      const run=2+Math.floor(Math.random()*3);
      for(let r=0;r<run&&cols.length<count;r++)cols.push(ci);
    }
    const chain=[];
    for(let i=0;i<count;i++){
      const dist=(count-1-i)*SPACING+SPACING;
      const p=pathXYon(path,dist);
      chain.push({ci:cols[i],dist,x:p.x,y:p.y});
    }
    return chain;
  }

  function generateChain(){
    chains = paths.map(path => generateChainOn(path));
    // legacy single ref
    _ctxChain = chains[0];
  }

  // Sync x,y from dist for all orbs on all chains
  function syncXY(){
    for(let t=0;t<chains.length;t++){
      const path=paths[t], chain=chains[t];
      for(const o of chain){const p=pathXYon(path,o.dist);o.x=p.x;o.y=p.y;}
    }
  }

  // ── INIT / RESIZE ─────────────────────────────────────────
  function init(){
    canvas=document.getElementById('zm-canvas');
    if(!canvas)return;
    if(!ORB_SPRITES.length) buildOrbSprites();
    ctx=canvas.getContext('2d');
    canvas.addEventListener('mousemove',onMouseMove);
    canvas.addEventListener('click',onCanvasClick);
    canvas.addEventListener('touchmove',onTouchMove,{passive:false});
    canvas.addEventListener('touchend',onTouchEnd,{passive:true});
    document.addEventListener('keydown',onKeyDown);
    bgStars=Array.from({length:60},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.4+.3,a:Math.random()*.5+.15,tw:Math.random()*Math.PI*2,ts:Math.random()*.02+.005}));
    resize();
    showOverlay('zuma','ZUMA',null,'Shoot orbs into the chain.\nMatch 3+ to destroy them!\nClear all orbs to advance!',[{label:'▶ START',fn:'zmNewGame()'}]);
  }

  function resize(){
    if(!canvas)return;
    const wrap=canvas.parentElement;
    W=wrap.clientWidth||800; H=wrap.clientHeight||600;
    canvas.width=W; canvas.height=H;
    buildPath();
    if(chains.length) syncXY();
    draw();
  }

  // ── NEW GAME ──────────────────────────────────────────────
  function newGame(keepLevel){
    if(!keepLevel){level=1;score=0;trackLayout=0;}
    best=parseInt(localStorage.getItem('zm-best')||'0');
    paused=false;dead=false;won=false;
    ball=null;popAnims=[];scorePopups=[];elapsedMs=0;trackNameTimer=180;
    if(!canvas){init();return;}
    resize();
    generateChain();
    shooterCi=rndCi();nextCi=rndCi();
    hideOverlay();
    document.addEventListener('keydown',onKeyDown);
    updateUI();
    if(raf)cancelAnimationFrame(raf);
    raf=null;lastTs=0;
    loop();
  }

  function rndCi(){
    const all=chains.flatMap(c=>c.map(o=>o.ci));
    if(!all.length)return Math.floor(Math.random()*Math.min(3+level,COLORS.length));
    const s=new Set(all);
    const a=[...s];
    return a[Math.floor(Math.random()*a.length)];
  }

  // ── SHOOT ─────────────────────────────────────────────────
  function shoot(){
    if(ball||paused||dead||won)return;
    ball={x:shooterX(),y:shooterY(),vx:Math.cos(shooterAngle)*SHOOT_SPD,vy:Math.sin(shooterAngle)*SHOOT_SPD,ci:shooterCi,trail:[]};
    shooterCi=nextCi; nextCi=rndCi(); updateUI();
  }


  // ── INSERT BALL ───────────────────────────────────────────
  function doInsert(chain, path, hitIdx, bx, by, bci){
    let insertIdx=hitIdx+1;
    if(hitIdx>0){
      const frontGapX=(chain[hitIdx].x+chain[hitIdx-1].x)/2;
      const frontGapY=(chain[hitIdx].y+chain[hitIdx-1].y)/2;
      const backGapX=(hitIdx+1<chain.length)?(chain[hitIdx].x+chain[hitIdx+1].x)/2:chain[hitIdx].x;
      const backGapY=(hitIdx+1<chain.length)?(chain[hitIdx].y+chain[hitIdx+1].y)/2:chain[hitIdx].y;
      const dFront=(bx-frontGapX)**2+(by-frontGapY)**2;
      const dBack=(bx-backGapX)**2+(by-backGapY)**2;
      if(dFront<dBack) insertIdx=hitIdx;
    }
    for(let i=0;i<insertIdx;i++) chain[i].dist+=SPACING;
    const newDist=insertIdx>0
      ? chain[insertIdx-1].dist-SPACING
      : (chain.length>0 ? chain[0].dist+SPACING : SPACING);
    const np=pathXYon(path,newDist);
    chain.splice(insertIdx,0,{ci:bci,dist:newDist,x:np.x,y:np.y});
    for(const o of chain){const p=pathXYon(path,o.dist);o.x=p.x;o.y=p.y;}
    checkMatches(chain,path,insertIdx);
  }

  // ── MATCH CHECK ──────────────────────────────────────────
  const TOUCH_THRESHOLD = SPACING * 1.35;

  function checkMatches(chain, path, idx){
    if(idx<0||idx>=chain.length)return;
    const ci=chain[idx].ci;
    let lo=idx,hi=idx;
    while(lo>0&&chain[lo-1].ci===ci&&(chain[lo-1].dist-chain[lo].dist)<=TOUCH_THRESHOLD)lo--;
    while(hi<chain.length-1&&chain[hi+1].ci===ci&&(chain[hi].dist-chain[hi+1].dist)<=TOUCH_THRESHOLD)hi++;
    const matchLen=hi-lo+1;
    if(matchLen<3)return;

    const matched=chain.slice(lo,hi+1);
    const avgX=matched.reduce((s,o)=>s+o.x,0)/matched.length;
    const avgY=matched.reduce((s,o)=>s+o.y,0)/matched.length;
    const ci2=matched[0].ci;

    matched.forEach(o=>{
      const a=Math.random()*Math.PI*2,spd=2+Math.random()*4;
      popAnims.push({x:o.x,y:o.y,ci:o.ci,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd-1,alpha:1});
    });

    const pts=matchLen*matchLen*20*level;
    score+=pts;
    if(score>best){best=score;localStorage.setItem('zm-best',best);}
    scorePopups.push({x:avgX,y:avgY,text:`+${pts}`,alpha:1,vy:1,color:matchLen>=5?'#ffe600':'#39ff14',size:matchLen>=5?15:11});

    chain.splice(lo,matchLen);
    for(const o of chain){const p=pathXYon(path,o.dist);o.x=p.x;o.y=p.y;}

    if(window.FX&&canvas){
      const rect=canvas.getBoundingClientRect();
      FX.burst(rect.left+(avgX/W)*rect.width,rect.top+(avgY/H)*rect.height,
        {count:14,colors:[COLORS[ci2],'#fff'],speed:5,life:40,size:4,shape:'circle',gravity:0.15});
      if(matchLen>=5){FX.screenFlash(COLORS[ci2],.2);FX.shake(3);}
    }

    updateUI();
    if(chains.every(c=>c.length===0)){won=true;setTimeout(doNextLevel,600);}
  }

  function checkAttractionContacts(){}

  // ── LEVEL / GAME OVER ────────────────────────────────────
  function doNextLevel(){
    score+=500*level;
    if(score>best){best=score;localStorage.setItem('zm-best',best);}
    level++;trackLayout++;
    updateUI();
    if(window.FX){FX.confetti(W/2,H/2);FX.screenFlash('#39ff14',.3);}
    const name=TRACK_NAMES[trackLayout%TRACK_NAMES.length];
    showOverlay('win',`LEVEL ${level}`,null,`Track: ${name}\nGet ready!`,[{label:'▶ GO',fn:'zmStartLevel()'}]);
  }

  window.zmStartLevel=function(){
    paused=false;dead=false;won=false;
    ball=null;popAnims=[];scorePopups=[];elapsedMs=0;trackNameTimer=180;
    resize(); generateChain();
    shooterCi=rndCi();nextCi=rndCi();
    hideOverlay();updateUI();
    if(raf)cancelAnimationFrame(raf);
    raf=null;lastTs=0;loop();
  };

  function doGameOver(){
    dead=true;
    if(raf){cancelAnimationFrame(raf);raf=null;}
    if(score>best){best=score;localStorage.setItem('zm-best',best);}
    updateUI();
    if(window.FX){FX.screenFlash('#ff2d78',.4);FX.shake(8);}
    showOverlay('lose','GAME OVER',score,`Chain reached the skull! Level ${level}`,[{label:'▶ RETRY',fn:'zmNewGame()'},{label:'🕹 ARCADE',fn:'backToGameSelect()'}]);
    if(score>0)setTimeout(()=>{if(window.HS)HS.promptSubmit('zuma',score,score.toLocaleString());},400);
  }

  function destroy(){
    dead=true;
    if(raf){cancelAnimationFrame(raf);raf=null;}
    document.removeEventListener('keydown',onKeyDown);
    hideOverlay();
  }

  // ── LOOP ─────────────────────────────────────────────────
  function loop(ts=0){
    raf=requestAnimationFrame(loop);
    const dt=Math.min((ts-(lastTs||ts))||16,50);
    lastTs=ts;
    if(!paused&&!dead&&!won) update(dt);
    draw();
    if(!dead)updateUI();
  }


  function update(dt){
    if(dead||won||paused)return;
    elapsedMs+=dt;
    const dtS=dt/1000;
    const fwdSpeed=SPEED_BASE+(level-1)*2;

    // Process each chain independently
    for(let t=0;t<chains.length;t++){
      const chain=chains[t], path=paths[t];
      if(!chain.length) continue;

      // ── IDENTIFY SEGMENTS ──────────────────────────────────
      const segStart=[0];
      for(let i=0;i<chain.length-1;i++){
        if(chain[i].dist-chain[i+1].dist>GAP_THRESHOLD) segStart.push(i+1);
      }
      const segEnd=segStart.map((s,si)=>si+1<segStart.length?segStart[si+1]-1:chain.length-1);
      const numSeg=segStart.length;

      // ── MOVE SEGMENTS ──────────────────────────────────────
      for(let s=0;s<numSeg;s++){
        const isRearmost=s===numSeg-1;
        if(isRearmost){
          for(let i=segStart[s];i<=segEnd[s];i++) chain[i].dist+=fwdSpeed*dtS;
        } else {
          const gapFrontIdx=segEnd[s], gapBackIdx=segStart[s+1];
          if(chain[gapFrontIdx].ci===chain[gapBackIdx].ci){
            const pull=Math.min(ATTRACT_SPD*dtS, chain[gapFrontIdx].dist-chain[gapBackIdx].dist-SPACING);
            if(pull>0.1) for(let i=segStart[s];i<=segEnd[s];i++) chain[i].dist-=pull;
          }
          // else: front segment waits
        }
      }

      // ── ENFORCE INTRA-SEGMENT PACKING ──────────────────────
      for(let s=0;s<numSeg;s++){
        for(let i=segStart[s]+1;i<=segEnd[s];i++) chain[i].dist=chain[i-1].dist-SPACING;
      }

      // ── GAP CONTACT CHECK ──────────────────────────────────
      let gapClosed=false;
      for(let s=0;s<numSeg-1;s++){
        const gapFrontIdx=segEnd[s], gapBackIdx=segStart[s+1];
        if(chain[gapFrontIdx].dist-chain[gapBackIdx].dist<=GAP_THRESHOLD){
          const snapDist=chain[gapFrontIdx].dist-SPACING;
          const shift=snapDist-chain[gapBackIdx].dist;
          for(let i=segStart[s+1];i<chain.length;i++) chain[i].dist+=shift;
          for(let i=1;i<chain.length;i++){
            if(chain[i].dist>chain[i-1].dist-SPACING+0.1) chain[i].dist=chain[i-1].dist-SPACING;
          }
          for(const o of chain){const p=pathXYon(path,o.dist);o.x=p.x;o.y=p.y;}
          checkMatches(chain,path,gapFrontIdx);
          gapClosed=true;
          break;
        }
      }
      if(!gapClosed){
        for(const o of chain){const p=pathXYon(path,o.dist);o.x=p.x;o.y=p.y;}
      }

      // ── GAME OVER CHECK ────────────────────────────────────
      if(chain.length&&chain[0].dist>=path.len*0.96){doGameOver();return;}
    }

    // ── BALL MOVEMENT + COLLISION ─────────────────────────────
    if(ball){
      ball.trail.push({x:ball.x,y:ball.y});
      if(ball.trail.length>6)ball.trail.shift();
      ball.x+=ball.vx; ball.y+=ball.vy;
      if(ball.x-ORB_R<0){ball.x=ORB_R;ball.vx=Math.abs(ball.vx);}
      if(ball.x+ORB_R>W){ball.x=W-ORB_R;ball.vx=-Math.abs(ball.vx);}
      if(ball.y-ORB_R<0){ball.y=ORB_R;ball.vy=Math.abs(ball.vy);}
      if(ball.y>H+30){ball=null;}
      if(ball){
        let hitChainIdx=-1,hitOrbIdx=-1,hitD2=Infinity;
        for(let t=0;t<chains.length;t++){
          const chain=chains[t];
          for(let i=0;i<chain.length;i++){
            const dx=ball.x-chain[i].x,dy=ball.y-chain[i].y,d2=dx*dx+dy*dy;
            if(d2<(ORB_D*.88)*(ORB_D*.88)&&d2<hitD2){hitD2=d2;hitOrbIdx=i;hitChainIdx=t;}
          }
        }
        if(hitChainIdx>=0){
          const bx=ball.x,by=ball.y,bci=ball.ci;
          ball=null;
          doInsert(chains[hitChainIdx],paths[hitChainIdx],hitOrbIdx,bx,by,bci);
        }
      }
    }

    for(const p of popAnims){p.x+=p.vx;p.y+=p.vy;p.vy+=.45;p.vx*=.97;p.alpha-=.022;}
    popAnims=popAnims.filter(p=>p.alpha>0);
    for(const p of scorePopups){p.y-=1.2;p.alpha-=.019;}
    scorePopups=scorePopups.filter(p=>p.alpha>0);
  }

  // ── DRAW ─────────────────────────────────────────────────
  function draw(){
    if(!ctx)return;
    const now=Date.now();
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#000a06';ctx.fillRect(0,0,W,H);
    const bg=ctx.createRadialGradient(W*.5,H*.4,0,W*.5,H*.4,Math.max(0.01,W*.65));
    bg.addColorStop(0,'rgba(0,40,15,.5)');bg.addColorStop(1,'transparent');
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);

    for(const s of bgStars){
      s.tw+=s.ts;
      ctx.beginPath();ctx.arc(s.x*W,s.y*H,Math.max(0,s.r),0,Math.PI*2);
      ctx.fillStyle=`rgba(180,255,200,${s.a*(0.5+0.5*Math.sin(s.tw))})`;ctx.fill();
    }

    // Draw all track tubes and skulls
    for(let t=0;t<paths.length;t++){
      drawPathTube(paths[t]);
      drawSkull(pathXYon(paths[t],paths[t].len*.97));
    }

    // Draw all chains back-to-front
    for(let t=0;t<chains.length;t++){
      const chain=chains[t];
      for(let i=chain.length-1;i>=0;i--) drawOrb(chain[i].x,chain[i].y,ORB_R,chain[i].ci,1);
    }

    for(const p of popAnims){ctx.save();ctx.globalAlpha=Math.max(0,p.alpha);drawOrb(p.x,p.y,ORB_R*Math.max(.1,p.alpha),p.ci,1);ctx.restore();}

    if(!ball&&!paused&&!dead&&!won)drawAimLine();
    drawShooter(now);

    if(ball){
      ball.trail.forEach((tp,i)=>{const t=(i+1)/ball.trail.length;ctx.save();ctx.globalAlpha=t*.28;drawOrb(tp.x,tp.y,ORB_R*t*.7,ball.ci,1);ctx.restore();});
      drawOrb(ball.x,ball.y,ORB_R,ball.ci,1);
    }

    for(const p of scorePopups){
      ctx.save();ctx.globalAlpha=p.alpha;
      ctx.font=`bold ${p.size||11}px Orbitron,monospace`;ctx.textAlign='center';
      ctx.fillStyle=ctx.shadowColor=p.color||'#39ff14';ctx.shadowBlur=10;
      ctx.fillText(p.text,p.x,p.y);ctx.restore();
    }

    // Danger glow: any chain getting close to skull
    for(let t=0;t<chains.length;t++){
      const ch=chains[t], pth=paths[t];
      if(ch.length&&ch[0].dist>pth.len*.82){
        const tf=Math.min(1,(ch[0].dist-pth.len*.82)/(pth.len*.15));
        ctx.save();ctx.globalAlpha=tf*.2*(0.5+0.5*Math.sin(now*.007));ctx.fillStyle='#ff2d78';ctx.fillRect(0,0,W,H);ctx.restore();
        break;
      }
    }

    ctx.save();ctx.globalAlpha=.025;
    for(let y=0;y<H;y+=4){ctx.fillStyle='#000';ctx.fillRect(0,y,W,2);}
    ctx.restore();

    if(trackNameTimer>0){
      trackNameTimer--;
      const a=Math.min(1,trackNameTimer/40)*Math.min(1,trackNameTimer/40);
      ctx.save();ctx.globalAlpha=a*.85;ctx.font='bold 22px Orbitron,monospace';ctx.textAlign='center';
      ctx.fillStyle=ctx.shadowColor='#39ff14';ctx.shadowBlur=18;
      ctx.fillText(TRACK_NAMES[trackLayout%TRACK_NAMES.length],W/2,42);ctx.restore();
    }
  }

  function drawPathTube(path){
    const pts = path ? path.pts : [];
    if(pts.length<2)return;
    ctx.save();
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
    ctx.strokeStyle='rgba(57,255,20,.08)';ctx.lineWidth=ORB_D*2.3;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
    ctx.strokeStyle='rgba(8,25,12,.92)';ctx.lineWidth=ORB_D*1.95;ctx.stroke();
    ctx.strokeStyle='rgba(57,255,20,.14)';ctx.lineWidth=ORB_D*.4;ctx.stroke();
    ctx.restore();
  }

  function drawSkull(pos){
    const{x,y}=pos,pulse=.5+.5*Math.sin(Date.now()*.005);
    ctx.save();
    ctx.beginPath();ctx.arc(x,y,Math.max(0,SKULL_R+6+pulse*4),0,Math.PI*2);ctx.fillStyle=`rgba(255,45,120,${.1+pulse*.1})`;ctx.fill();
    ctx.beginPath();ctx.arc(x,y,Math.max(0,SKULL_R),0,Math.PI*2);ctx.fillStyle='#1a0010';
    ctx.strokeStyle=`rgba(255,45,120,${.7+pulse*.3})`;ctx.lineWidth=2.5;ctx.shadowColor='#ff2d78';ctx.shadowBlur=14;ctx.fill();ctx.stroke();
    ctx.font=`${SKULL_R*1.3}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowBlur=0;ctx.fillText('💀',x,y);
    ctx.restore();
  }

  function drawShooter(now){
    const cx=shooterX(),cy=shooterY(),pulse=.5+.5*Math.sin(now*.003);
    ctx.save();ctx.translate(cx,cy);
    ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);
    const bg=ctx.createRadialGradient(0,0,3,0,0,24);
    bg.addColorStop(0,'#1a3a20');bg.addColorStop(1,'#0a1a0d');
    ctx.fillStyle=bg;ctx.fill();
    ctx.strokeStyle=`rgba(57,255,20,${.5+pulse*.3})`;ctx.lineWidth=1.5;ctx.shadowColor='#39ff14';ctx.shadowBlur=10*pulse;ctx.stroke();
    const ea=shooterAngle-Math.PI/2;
    for(const s of[-1,1]){
      const ex=Math.cos(ea+s*.5)*14,ey=Math.sin(ea+s*.5)*14;
      ctx.beginPath();ctx.arc(ex,ey,6,0,Math.PI*2);ctx.fillStyle='#0d2a10';ctx.fill();
      ctx.strokeStyle='#39ff14';ctx.lineWidth=1.2;ctx.stroke();
      ctx.beginPath();ctx.arc(ex,ey,2.7,0,Math.PI*2);ctx.fillStyle='#39ff14';ctx.fill();
    }
    ctx.rotate(shooterAngle+Math.PI/2);ctx.shadowColor=GLOWS[shooterCi];ctx.shadowBlur=12;
    const bg2=ctx.createLinearGradient(-7,-35,7,0);
    bg2.addColorStop(0,'#c8ffd0');bg2.addColorStop(.5,'#1a6a20');bg2.addColorStop(1,'#0a1a0d');
    ctx.fillStyle=bg2;
    if(ctx.roundRect)ctx.roundRect(-7,-36,14,26,3);else ctx.rect(-7,-36,14,26);
    ctx.fill();ctx.strokeStyle=COLORS[shooterCi];ctx.lineWidth=1.5;ctx.stroke();
    ctx.restore();
    ctx.save();ctx.shadowColor=GLOWS[shooterCi];ctx.shadowBlur=12;drawOrb(cx,cy,ORB_R-2,shooterCi,1);ctx.restore();
    ctx.save();ctx.globalAlpha=.75;
    drawOrb(cx+44,cy+8,ORB_R*.7,nextCi,1);
    ctx.font='9px Share Tech Mono,monospace';ctx.fillStyle='rgba(57,255,20,.45)';ctx.textAlign='center';ctx.fillText('NEXT',cx+44,cy+26);
    ctx.restore();
  }

  function drawAimLine(){
    const cx=shooterX(),cy=shooterY();
    let vx=Math.cos(shooterAngle),vy=Math.sin(shooterAngle),x=cx,y=cy;
    ctx.save();ctx.setLineDash([5,10]);ctx.lineWidth=1.2;
    ctx.strokeStyle=COLORS[shooterCi];ctx.shadowColor=GLOWS[shooterCi];ctx.shadowBlur=5;
    ctx.beginPath();ctx.moveTo(x,y);
    for(let i=0;i<80;i++){
      x+=vx*SHOOT_SPD;y+=vy*SHOOT_SPD;
      if(x-ORB_R<0){x=ORB_R;vx=Math.abs(vx);}
      if(x+ORB_R>W){x=W-ORB_R;vx=-Math.abs(vx);}
      if(y<0)break;
      ctx.lineTo(x,y);
      let near=false;
      for(const ch of chains){for(const o of ch){const dx=x-o.x,dy=y-o.y;if(dx*dx+dy*dy<(ORB_D*1.05)*(ORB_D*1.05)){near=true;break;}}if(near)break;}
      if(near)break;
    }
    ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;ctx.restore();
  }

  function drawOrb(x,y,r,ci,alpha){
    if(!ctx||r<=0||ci<0||ci>=COLORS.length)return;
    ctx.save();ctx.globalAlpha=Math.max(0,alpha);
    if(ORB_SPRITES[ci] && Math.abs(r - ORB_R) < 2){
      // Use pre-rendered sprite — avoids radialGradient allocation per orb
      const sz=ORB_R*2+10;
      ctx.drawImage(ORB_SPRITES[ci], x-sz/2, y-sz/2, sz, sz);
    } else {
      ctx.shadowColor=GLOWS[ci];ctx.shadowBlur=12;
      const gr=ctx.createRadialGradient(x-r*.3,y-r*.35,Math.max(0.01,r*.04),x,y,Math.max(0.01,r));
      gr.addColorStop(0,lighten(COLORS[ci],.5));gr.addColorStop(.5,COLORS[ci]);gr.addColorStop(1,darken(COLORS[ci],.45));
      ctx.beginPath();ctx.arc(x,y,Math.max(0,r),0,Math.PI*2);ctx.fillStyle=gr;ctx.fill();
      ctx.shadowBlur=5;ctx.strokeStyle=lighten(COLORS[ci],.22);ctx.lineWidth=1.1;ctx.stroke();
      ctx.shadowBlur=0;
      ctx.beginPath();ctx.arc(x-r*.28,y-r*.32,Math.max(0,r*.2),0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.65)';ctx.fill();
    }
    ctx.restore();
  }

  function lighten(h,a){const[r,g,b]=hr(h);return`rgb(${Math.min(255,r+~~(255*a))},${Math.min(255,g+~~(255*a))},${Math.min(255,b+~~(255*a))})`;}
  function darken(h,a){const[r,g,b]=hr(h);return`rgb(${Math.max(0,r-~~(255*a))},${Math.max(0,g-~~(255*a))},${Math.max(0,b-~~(255*a))})`;}
  function hr(h){const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}

  // ── INPUT ─────────────────────────────────────────────────
  function shooterX(){return W/2;}
  function shooterY(){return H-70;}
  function updateAngle(cx,cy){
    const rect=canvas.getBoundingClientRect();
    shooterAngle=Math.atan2((cy-rect.top)*(H/rect.height)-shooterY(),(cx-rect.left)*(W/rect.width)-shooterX());
  }
  function onMouseMove(e){if(!paused&&!dead)updateAngle(e.clientX,e.clientY);}
  function onCanvasClick(e){if(paused||dead||won)return;updateAngle(e.clientX,e.clientY);shoot();}
  function onTouchMove(e){e.preventDefault();if(!paused&&!dead)updateAngle(e.touches[0].clientX,e.touches[0].clientY);}
  function onTouchEnd(){if(!paused&&!dead&&!won)shoot();}
  function onKeyDown(e){
    const scr=document.getElementById('zuma-screen');
    if(!scr||!scr.classList.contains('active'))return;
    if(e.key===' '){shoot();e.preventDefault();}
    if(e.key==='p'||e.key==='P')togglePause();
  }

  // ── UI ────────────────────────────────────────────────────
  function updateUI(){
    const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    s('zm-score',score.toLocaleString());
    s('zm-best',Math.max(score,best).toLocaleString());
    s('zm-level',level);
  }
  function showOverlay(type,title,sc,msg,btns){
    const ov=document.getElementById('zm-overlay');if(!ov)return;
    ov.classList.add('active');
    const t=document.getElementById('zm-ov-title');if(t){t.textContent=title;t.className='zuma-ov-title '+type;}
    const sEl=document.getElementById('zm-ov-score');if(sEl)sEl.textContent=sc!=null?sc.toLocaleString()+' pts':'';
    const mEl=document.getElementById('zm-ov-msg');if(mEl)mEl.innerHTML=(msg||'').replace(/\n/g,'<br>');
    const bEl=document.getElementById('zm-ov-btns');if(bEl)bEl.innerHTML=(btns||[]).map(b=>`<button class="${b.label.includes('ARCADE') ? 'arcade-back-btn' : 'zuma-btn'}" onclick="${b.fn}">${b.label}</button>`).join('');
  }
  function hideOverlay(){const ov=document.getElementById('zm-overlay');if(ov)ov.classList.remove('active');}
  function togglePause(){
    if(dead||won)return;paused=!paused;
    const btn=document.getElementById('zm-pause-btn');if(btn)btn.textContent=paused?'▶':'⏸';
    if(paused)showOverlay('pause','PAUSED',null,'Game paused',[{label:'▶ RESUME',fn:'zmTogglePause()'},{label:'🆕 NEW',fn:'zmNewGame()'}]);
    else hideOverlay();
  }

  window.addEventListener('resize',()=>{if(canvas&&!dead)resize();});

  return{init,newGame,destroy,togglePause};
})();

window.zmNewGame     = () => ZM.newGame();
window.zmTogglePause = () => ZM.togglePause();


// ============================================================
// TETRIS ENGINE
// ============================================================
window.TET = (function() {
