// ============================================================
// COLOUR FLOOD  —  Flood-fill conquest
// Start from top-left. Each turn pick a colour — your blob
// absorbs all touching bubbles of that colour.
// Cover the whole board in fewest moves.
// Power-ups: FLOOD2 (double flood), RAINBOW (wild colour),  PEEK (highlight best move)
// ============================================================
export default (() => {
  'use strict';

  const COLS=14,ROWS=14;
  const COLORS=['#ff2d78','#00f5ff','#39ff14','#ff6a00','#bf00ff','#ffe600'];
  const MAX_MOVES=35;

  let canvas,ctx,W,H,cell;
  let grid=[];
  let blob=new Set();
  let score=0,best=0,moves=0,level=1;
  let particles=[],ripples=[];
  let powerups={},peekColor=null;
  let raf=null,destroyed=false;
  let gameWon=false;

  const PU_TYPES=['flood2','rainbow','peek'];

  function $id(id){return document.getElementById(id);}

  function newGrid(){
    grid=[];
    for(let r=0;r<ROWS;r++){grid[r]=[];
      for(let c=0;c<COLS;c++) grid[r][c]=COLORS[Math.floor(Math.random()*COLORS.length)];
    }
    // seed power-ups as special cells
    for(let i=0;i<4;i++){
      const r=1+Math.floor(Math.random()*(ROWS-2)),c=1+Math.floor(Math.random()*(COLS-2));
      grid[r][c]='PU_'+PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)];
    }
    blob=new Set(['0']); // start cell 0,0
    moves=0;gameWon=false;peekColor=null;
    expandBlob(grid[0][0],true);
    updateHUD();
  }

  function resize(){
    const wrap=$id('cflood-canvas-wrap');if(!wrap)return;
    const sz=Math.min(wrap.clientWidth,wrap.clientHeight,520);
    canvas.width=canvas.height=sz;W=H=sz;cell=sz/COLS;
  }

  function key(r,c){return r+'_'+c;}
  function fromKey(k){const[r,c]=k.split('_').map(Number);return[r,c];}

  function expandBlob(color,init=false){
    const frontier=[];
    blob.forEach(k=>{
      const[r,c]=fromKey(k);
      for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&!blob.has(key(nr,nc))){
          const cv=grid[nr][nc];
          if(cv===color||(typeof cv==='string'&&cv.startsWith('PU_')&&cv!==color)){
            if(cv.startsWith('PU_')){ collectPU(cv.replace('PU_',''),nr,nc); grid[nr][nc]=color; }
            blob.add(key(nr,nc));
            frontier.push([nr,nc]);
          }
        }
      }
    });
    // color all blob cells
    blob.forEach(k=>{const[r,c]=fromKey(k);if(!grid[r][c].startsWith('PU_'))grid[r][c]=color;});

    // particles on expansion
    frontier.forEach(([r,c])=>{
      burstAt(c*cell+cell/2,r*cell+cell/2,color,6);
      ripples.push({x:c*cell+cell/2,y:r*cell+cell/2,r:cell*0.3,col:color,life:1,decay:0.07});
    });

    checkWin();
    updateHUD();
  }

  function flood(color){
    if(gameWon)return;
    const curColor=grid[0][0];
    if(color===curColor)return;
    moves++;
    expandBlob(color);
    if(moves>=MAX_MOVES+level*2&&!gameWon) showOver(false);
    updateHUD();
  }

  function checkWin(){
    if(blob.size===COLS*ROWS){
      gameWon=true;
      const bonus=Math.max(0,(MAX_MOVES+level*2-moves))*50*level;
      score+=1000*level+bonus;
      level++;
      // big fireworks
      for(let i=0;i<40;i++) setTimeout(()=>{
        burstAt(Math.random()*W,Math.random()*H,COLORS[Math.floor(Math.random()*COLORS.length)],15);
      },i*80);
      setTimeout(()=>newGrid(),3500);
    }
  }

  function showOver(won){
    if(score>best){best=score;try{localStorage.setItem('cflood_best',best);}catch(e){}}
    $id('cflood-over-score').textContent=score.toLocaleString();
    $id('cflood-over').style.display='flex';
  }

  // ── Power-ups ──────────────────────────────────────────────
  function collectPU(type,r,c){
    powerups[type]=(powerups[type]||0)+1;
    burstAt(c*cell+cell/2,r*cell+cell/2,'#ffe600',20);
    renderPUBar();
  }

  function usePU(type){
    if(!powerups[type]||powerups[type]<=0)return;
    if(type==='flood2'){
      // two flood steps with best colour each
      const best2=bestColor();if(!best2)return;
      expandBlob(best2);
      setTimeout(()=>{const b2=bestColor();if(b2)expandBlob(b2);updateHUD();},300);
      moves++;
    } else if(type==='rainbow'){
      // absorb ALL colours touching blob
      COLORS.forEach(col=>expandBlob(col));
      moves++;
    } else if(type==='peek'){
      peekColor=bestColor();
      setTimeout(()=>{peekColor=null;},2500);
    }
    powerups[type]--;renderPUBar();updateHUD();
  }

  function bestColor(){
    const counts={};
    blob.forEach(k=>{
      const[r,c]=fromKey(k);
      for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&!blob.has(key(nr,nc))){
          const v=grid[nr][nc];if(!v.startsWith('PU_')) counts[v]=(counts[v]||0)+1;
        }
      }
    });
    let best2=null,bv=0;
    Object.entries(counts).forEach(([col,cnt])=>{if(cnt>bv){bv=cnt;best2=col;}});
    return best2;
  }

  function puEmoji(t){return t==='flood2'?'🌊':t==='rainbow'?'🌈':'👁️';}
  function renderPUBar(){
    PU_TYPES.forEach(t=>{
      const el=$id('cflood-pu-'+t);
      if(el){el.textContent=puEmoji(t)+' '+(powerups[t]||0);}
    });
  }

  // ── Particles ──────────────────────────────────────────────
  function burstAt(x,y,col,n=12){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,sp=1+Math.random()*4;
      particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1,r:2+Math.random()*3,col,life:1,decay:0.03+Math.random()*0.03});
    }
  }

  // ── Draw ───────────────────────────────────────────────────
  function draw(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(3,7,18,0.97)';ctx.fillRect(0,0,W,H);

    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const v=grid[r][c];
      const col=v.startsWith('PU_')?'#ffe600':v;
      const inBlob=blob.has(key(r,c));
      const x=c*cell,y=r*cell,sz=cell-1;

      // cell bg
      ctx.fillStyle=col;
      ctx.globalAlpha=inBlob?1:0.65;
      roundRect(ctx,x+0.5,y+0.5,sz,sz,cell*0.22);ctx.fill();

      // blob shimmer
      if(inBlob){
        ctx.save();
        const g=ctx.createLinearGradient(x,y,x+sz,y+sz);
        g.addColorStop(0,'rgba(255,255,255,0.25)');g.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=g;ctx.globalAlpha=0.5;
        roundRect(ctx,x+0.5,y+0.5,sz,sz,cell*0.22);ctx.fill();
        ctx.restore();
      }

      ctx.globalAlpha=1;

      // peek highlight
      if(peekColor&&col===peekColor&&!inBlob){
        ctx.save();ctx.strokeStyle='#ffe600';ctx.lineWidth=2;ctx.globalAlpha=0.7*(0.5+0.5*Math.sin(Date.now()*0.008));
        roundRect(ctx,x+0.5,y+0.5,sz,sz,cell*0.22);ctx.stroke();ctx.restore();
      }

      // power-up icon
      if(v.startsWith('PU_')){
        ctx.font=`${cell*0.55}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(puEmoji(v.replace('PU_','')),x+cell/2,y+cell/2);
      }
    }

    // blob border glow
    blob.forEach(k=>{
      const[r,c]=fromKey(k);
      const blobCol=grid[r][c];
      for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr,nc=c+dc;
        if(nr<0||nr>=ROWS||nc<0||nc>=COLS||!blob.has(key(nr,nc))){
          ctx.save();ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1.5;ctx.globalAlpha=0.5;
          ctx.beginPath();
          if(dr===-1){ctx.moveTo(c*cell,r*cell);ctx.lineTo((c+1)*cell,r*cell);}
          else if(dr===1){ctx.moveTo(c*cell,(r+1)*cell);ctx.lineTo((c+1)*cell,(r+1)*cell);}
          else if(dc===-1){ctx.moveTo(c*cell,r*cell);ctx.lineTo(c*cell,(r+1)*cell);}
          else{ctx.moveTo((c+1)*cell,r*cell);ctx.lineTo((c+1)*cell,(r+1)*cell);}
          ctx.stroke();ctx.restore();
        }
      }
    });

    ripples.forEach(f=>{
      ctx.save();ctx.globalAlpha=Math.max(0,f.life*0.5);ctx.strokeStyle=f.col;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.stroke();ctx.restore();
    });
    particles.forEach(p=>{
      ctx.save();ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();
    });
  }

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }

  function loop(){
    if(destroyed)return;
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.life-=p.decay;});
    particles=particles.filter(p=>p.life>0);
    ripples.forEach(f=>{f.r+=1.5;f.life-=f.decay;});
    ripples=ripples.filter(f=>f.life>0);
    draw();raf=requestAnimationFrame(loop);
  }

  function updateHUD(){
    const s=$id('cflood-score');if(s)s.textContent=score.toLocaleString();
    const b=$id('cflood-best');if(b)b.textContent=best.toLocaleString();
    const m=$id('cflood-moves');if(m)m.textContent=moves;
    const ml=$id('cflood-max');if(ml)ml.textContent=MAX_MOVES+level*2;
    const l=$id('cflood-level');if(l)l.textContent=level;
    // coverage
    const pct=Math.round(blob.size/(COLS*ROWS)*100);
    const pb=$id('cflood-prog');if(pb)pb.style.width=pct+'%';
  }

  // ── Colour buttons ─────────────────────────────────────────
  function buildColorBtns(){
    const bar=$id('cflood-colors');if(!bar)return;
    bar.innerHTML='';
    COLORS.forEach(col=>{
      const btn=document.createElement('button');
      btn.className='cflood-color-btn';
      btn.style.background=col;
      btn.style.boxShadow=`0 0 8px ${col}88`;
      btn.onclick=()=>flood(col);
      bar.appendChild(btn);
    });
  }

  function init(){
    destroyed=false;particles=[];ripples=[];score=0;level=1;powerups={};peekColor=null;
    try{best=parseInt(localStorage.getItem('cflood_best')||'0');}catch(e){}
    canvas=$id('cflood-canvas');if(!canvas)return;
    ctx=canvas.getContext('2d');
    resize();
    window.addEventListener('resize',resize);
    PU_TYPES.forEach(t=>{const el=$id('cflood-pu-'+t);if(el)el.onclick=()=>usePU(t);});
    $id('cflood-over').style.display='none';
    buildColorBtns();newGrid();
    if(raf)cancelAnimationFrame(raf);
    loop();
  }

  function destroy(){
    destroyed=true;if(raf){cancelAnimationFrame(raf);raf=null;}
    window.removeEventListener('resize',resize);
  }

  window.cfloodNewGame=()=>{score=0;level=1;powerups={};peekColor=null;$id('cflood-over').style.display='none';newGrid();renderPUBar();updateHUD();};
  return{init,destroy};
})();
