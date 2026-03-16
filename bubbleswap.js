// ============================================================
// BUBBLE SWAP  —  Match-3 swapping puzzle
// Swap adjacent bubbles to form groups of 3+ to pop them.
// Power-ups: SHUFFLE, BOMB, COLORWILD
// ============================================================
export default (() => {
  'use strict';

  const COLS=8,ROWS=8;
  const COLORS=['#ff2d78','#00f5ff','#39ff14','#ff6a00','#bf00ff','#ffe600'];
  const PU_TYPES=['shuffle','bomb','colorwild'];

  let canvas,ctx,W,H,cell;
  let grid=[];  // {color,scale,dy,pu}
  let selected=null; // {r,c}
  let score=0,best=0,level=1,moves=30;
  let particles=[],rings=[];
  let powerups={},selectedPU=null;
  let swapping=false;
  let raf=null,destroyed=false;

  function $id(id){return document.getElementById(id);}

  function newGrid(){
    do{
      grid=[];
      for(let r=0;r<ROWS;r++){grid[r]=[];
        for(let c=0;c<COLS;c++){
          grid[r][c]={color:COLORS[Math.floor(Math.random()*COLORS.length)],scale:1,dy:0,pu:null};
        }
      }
      // seed power-ups
      for(let i=0;i<3;i++){
        grid[Math.floor(Math.random()*ROWS)][Math.floor(Math.random()*COLS)].pu=PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)];
      }
    }while(findAllMatches().length===0);
    moves=25+level*3; updateHUD();
  }

  function resize(){
    const wrap=$id('bswap-canvas-wrap');if(!wrap)return;
    const sz=Math.min(wrap.clientWidth,wrap.clientHeight,520);
    canvas.width=canvas.height=sz;W=H=sz;cell=sz/COLS;
  }

  // ── Match finding ──────────────────────────────────────────
  function findAllMatches(){
    const matched=new Set();
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS-2;c++){
      const col=grid[r][c]?.color;
      if(col&&col===grid[r][c+1]?.color&&col===grid[r][c+2]?.color){
        matched.add(r*COLS+c);matched.add(r*COLS+c+1);matched.add(r*COLS+c+2);
      }
    }
    for(let r=0;r<ROWS-2;r++) for(let c=0;c<COLS;c++){
      const col=grid[r][c]?.color;
      if(col&&col===grid[r+1][c]?.color&&col===grid[r+2][c]?.color){
        matched.add(r*COLS+c);matched.add((r+1)*COLS+c);matched.add((r+2)*COLS+c);
      }
    }
    return [...matched].map(k=>[Math.floor(k/COLS),k%COLS]);
  }

  function popMatches(){
    const matches=findAllMatches();
    if(matches.length===0) return false;
    score+=matches.length*matches.length*15*level;
    matches.forEach(([r,c])=>{
      const b=grid[r][c];
      if(b){
        burst(colX(c)+cell/2,rowY(r)+cell/2,b.color,14);
        if(b.pu) collectPU(b.pu,r,c);
        grid[r][c]=null;
      }
    });
    gravity();
    refill();
    setTimeout(()=>{popMatches();updateHUD();},300);
    return true;
  }

  function gravity(){
    for(let c=0;c<COLS;c++){
      let write=ROWS-1;
      for(let r=ROWS-1;r>=0;r--) if(grid[r][c]!==null){grid[write][c]=grid[r][c];if(write!==r)grid[r][c]=null;write--;}
      for(let r=write;r>=0;r--) grid[r][c]=null;
    }
  }

  function refill(){
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      if(grid[r][c]===null){
        const hasPU=Math.random()<0.04;
        grid[r][c]={color:COLORS[Math.floor(Math.random()*COLORS.length)],scale:1,dy:-cell,pu:hasPU?PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)]:null};
      }
    }
  }

  function trySwap(r1,c1,r2,c2){
    if(swapping) return;
    swapping=true;
    const tmp=grid[r1][c1]; grid[r1][c1]=grid[r2][c2]; grid[r2][c2]=tmp;
    const matched=findAllMatches();
    if(matched.length===0){ const t=grid[r1][c1];grid[r1][c1]=grid[r2][c2];grid[r2][c2]=t; }
    else{ moves--; updateHUD(); setTimeout(()=>popMatches(),80); }
    swapping=false;
    if(moves<=0) setTimeout(showOver,500);
    updateHUD();
  }

  function showOver(){
    if(score>best){best=score;try{localStorage.setItem('bswap_best',best);}catch(e){}}
    $id('bswap-over-score').textContent=score.toLocaleString();
    $id('bswap-over').style.display='flex';
  }

  // ── Power-ups ──────────────────────────────────────────────
  function collectPU(type,r,c){
    powerups[type]=(powerups[type]||0)+1;
    burst(colX(c)+cell/2,rowY(r)+cell/2,'#ffe600',18);
    renderPUBar();
  }

  function applyPU(type,r,c){
    if(type==='shuffle'){
      const flat=grid.flat().filter(b=>b);
      flat.sort(()=>Math.random()-0.5);
      let i=0;
      for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++) if(grid[rr][cc]) grid[rr][cc]=flat[i++];
      burst(W/2,H/2,'#bf00ff',30);
    } else if(type==='bomb'){
      for(let dr=-2;dr<=2;dr++) for(let dc=-2;dc<=2;dc++){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&grid[nr][nc]){
          burst(colX(nc)+cell/2,rowY(nr)+cell/2,grid[nr][nc].color,8);
          grid[nr][nc]=null;
        }
      }
      gravity();refill();score+=200*level;
    } else if(type==='colorwild'){
      const col=grid[r][c]?.color; if(!col)return;
      for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++){
        if(grid[rr][cc]?.color===col){burst(colX(cc)+cell/2,rowY(rr)+cell/2,col,10);grid[rr][cc]=null;}
      }
      gravity();refill();score+=300*level;
    }
    powerups[type]=(powerups[type]||0)-1;
    selectedPU=null;renderPUBar();moves--;updateHUD();
  }

  function puEmoji(t){return t==='shuffle'?'🔀':t==='bomb'?'💣':'🌈';}
  function renderPUBar(){
    PU_TYPES.forEach(t=>{
      const el=$id('bswap-pu-'+t);
      if(el){el.textContent=puEmoji(t)+' '+(powerups[t]||0);el.classList.toggle('active',selectedPU===t);}
    });
  }

  // ── Particles ──────────────────────────────────────────────
  function burst(x,y,col,n=16){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,sp=2+Math.random()*5;
      particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1,r:3+Math.random()*4,col,life:1,decay:0.03+Math.random()*0.02});
    }
  }

  function colX(c){return c*cell;}
  function rowY(r){return r*cell;}

  // ── Draw ───────────────────────────────────────────────────
  function draw(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(4,8,22,0.97)';ctx.fillRect(0,0,W,H);
    for(let i=1;i<COLS;i++){ctx.strokeStyle='rgba(0,245,255,0.06)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(i*cell,0);ctx.lineTo(i*cell,H);ctx.stroke();}
    for(let i=1;i<ROWS;i++){ctx.beginPath();ctx.moveTo(0,i*cell);ctx.lineTo(W,i*cell);ctx.stroke();}

    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const b=grid[r][c];if(!b)continue;
      const x=colX(c)+cell/2,y=rowY(r)+cell/2+b.dy,rad=cell*0.42*b.scale;
      const isSel=selected&&selected.r===r&&selected.c===c;
      if(isSel){
        ctx.save();ctx.globalAlpha=0.35;ctx.fillStyle='#ffe600';
        ctx.beginPath();ctx.arc(x,y,rad*1.2,0,Math.PI*2);ctx.fill();ctx.restore();
      }
      drawBubble(ctx,x,y,rad,b.color,b.pu);
      if(b.pu){ctx.font=`${cell*0.35}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(puEmoji(b.pu),x,y);}
      // selection ring
      if(isSel){ctx.save();ctx.strokeStyle='#ffe600';ctx.lineWidth=2.5;ctx.globalAlpha=0.9;ctx.beginPath();ctx.arc(x,y,rad+2,0,Math.PI*2);ctx.stroke();ctx.restore();}
    }

    particles.forEach(p=>{
      ctx.save();ctx.globalAlpha=Math.max(0,p.life);
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
      g.addColorStop(0,p.col);g.addColorStop(1,'transparent');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();
    });
  }

  function drawBubble(ctx,x,y,r,col,pu){
    ctx.save();
    const c2=pu?'#ffe600':col;
    const g=ctx.createRadialGradient(x-r*0.3,y-r*0.35,r*0.05,x,y,r);
    g.addColorStop(0,'rgba(255,255,255,0.75)');g.addColorStop(0.3,c2);g.addColorStop(1,shade(c2,-60));
    ctx.fillStyle=g;ctx.shadowColor=c2;ctx.shadowBlur=12;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.globalAlpha=0.5;ctx.fillStyle='rgba(255,255,255,0.65)';
    ctx.beginPath();ctx.ellipse(x-r*0.25,y-r*0.3,r*0.2,r*0.12,0.3,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function shade(hex,amt){
    const n=parseInt(hex.replace('#',''),16);
    return `rgb(${Math.max(0,((n>>16)&255)+amt)},${Math.max(0,((n>>8)&255)+amt)},${Math.max(0,(n&255)+amt)})`;
  }

  // ── Click ──────────────────────────────────────────────────
  function onClick(e){
    const rect=canvas.getBoundingClientRect();
    const cx=(e.clientX-rect.left)*(W/rect.width);
    const cy=(e.clientY-rect.top)*(H/rect.height);
    const c=Math.floor(cx/cell),r=Math.floor(cy/cell);
    if(r<0||r>=ROWS||c<0||c>=COLS)return;
    if(selectedPU){applyPU(selectedPU,r,c);return;}
    if(!selected){selected={r,c};return;}
    if(selected.r===r&&selected.c===c){selected=null;return;}
    const dr=Math.abs(r-selected.r),dc=Math.abs(c-selected.c);
    if(dr+dc===1){trySwap(selected.r,selected.c,r,c);}
    selected=null;
  }

  function loop(){
    if(destroyed)return;
    // animate dy toward 0
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(grid[r][c]&&grid[r][c].dy!==0) grid[r][c].dy*=0.75;
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.15;p.life-=p.decay;});
    particles=particles.filter(p=>p.life>0);
    draw();raf=requestAnimationFrame(loop);
  }

  function updateHUD(){
    const s=$id('bswap-score');if(s)s.textContent=score.toLocaleString();
    const b=$id('bswap-best');if(b)b.textContent=best.toLocaleString();
    const m=$id('bswap-moves');if(m)m.textContent=moves;
    const l=$id('bswap-level');if(l)l.textContent=level;
  }

  function init(){
    destroyed=false;particles=[];score=0;level=1;selected=null;powerups={};selectedPU=null;
    try{best=parseInt(localStorage.getItem('bswap_best')||'0');}catch(e){}
    canvas=$id('bswap-canvas');if(!canvas)return;
    ctx=canvas.getContext('2d');
    resize();
    canvas.addEventListener('click',onClick);
    window.addEventListener('resize',resize);
    PU_TYPES.forEach(t=>{const el=$id('bswap-pu-'+t);if(el)el.onclick=()=>{selectedPU=(selectedPU===t?null:t);renderPUBar();};});
    $id('bswap-over').style.display='none';
    newGrid();setTimeout(()=>popMatches(),200);
    if(raf)cancelAnimationFrame(raf);
    loop();
  }

  function destroy(){
    destroyed=true;if(raf){cancelAnimationFrame(raf);raf=null;}
    if(canvas)canvas.removeEventListener('click',onClick);
    window.removeEventListener('resize',resize);
  }

  window.bswapNewGame=()=>{score=0;level=1;selected=null;powerups={};selectedPU=null;$id('bswap-over').style.display='none';newGrid();setTimeout(()=>popMatches(),200);renderPUBar();updateHUD();};
  return{init,destroy};
})();
