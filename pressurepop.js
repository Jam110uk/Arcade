// ============================================================
// PRESSURE POP  —  Overload mechanic
// Each bubble has pressure 0-MAX. Click to add pressure.
// When it hits MAX it pops and adds pressure to neighbours.
// Power-ups: VENT (reduce pressure), DETONATE (instant pop 3x3), SHIELD
// ============================================================
export default (() => {
  'use strict';

  const COLS=8,ROWS=8;
  const COLORS=['#ff2d78','#00f5ff','#39ff14','#ff6a00','#bf00ff','#ffe600'];
  const PU_TYPES=['vent','detonate','shield'];
  const MAX_PRESS=4;

  let canvas,ctx,W,H,cell;
  let grid=[],score=0,best=0,level=1,movesLeft=25;
  let particles=[],rings=[];
  let powerups={},selectedPU=null;
  let shielded=new Set();
  let animQueue=[],animating=false;
  let raf=null,destroyed=false;

  function $id(id){return document.getElementById(id);}

  function newGrid(){
    grid=[];
    for(let r=0;r<ROWS;r++){
      grid[r]=[];
      for(let c=0;c<COLS;c++){
        const hasPU=Math.random()<0.05;
        grid[r][c]={
          color:COLORS[Math.floor(Math.random()*COLORS.length)],
          press:Math.floor(Math.random()*2),
          alive:true,
          pu:hasPU?PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)]:null
        };
      }
    }
    shielded.clear();
    movesLeft=20+level*3;
    updateHUD();
  }

  function resize(){
    const wrap=$id('ppop-canvas-wrap');if(!wrap)return;
    const sz=Math.min(wrap.clientWidth,wrap.clientHeight,500);
    canvas.width=canvas.height=sz;W=H=sz;cell=sz/COLS;
  }

  // ── Pressure logic ─────────────────────────────────────────
  function addPressure(r,c,amount=1,chain=false){
    if(r<0||r>=ROWS||c<0||c>=COLS) return;
    const b=grid[r][c];
    if(!b||!b.alive) return;
    if(shielded.has(r*COLS+c)) return;

    if(b.pu&&!chain){
      collectPU(b.pu,r,c);
      b.pu=null; return;
    }

    b.press+=amount;
    ringAt(r,c,b.color);

    if(b.press>=MAX_PRESS){
      pop(r,c,true);
    }
    updateHUD();
  }

  function pop(r,c,chain){
    const b=grid[r][c];
    if(!b||!b.alive)return;
    b.alive=false;
    burst(colX(c)+cell/2,rowY(r)+cell/2,b.color);
    score+=10*(level+chain?2:1);
    if(chain){
      setTimeout(()=>{
        for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
          addPressure(r+dr,c+dc,1,true);
        }
      },120);
    }
    checkBoard();
  }

  function checkBoard(){
    const alive=grid.flat().filter(b=>b&&b.alive).length;
    if(alive===0){score+=500*level;level++;setTimeout(()=>newGrid(),600);}
    if(movesLeft<=0&&alive>0){showOver();}
    updateHUD();
  }

  function showOver(){
    if(score>best){best=score;try{localStorage.setItem('ppop_best',best);}catch(e){}}
    $id('ppop-over-score').textContent=score.toLocaleString();
    $id('ppop-over').style.display='flex';
  }

  // ── Power-ups ───────────────────────────────────────────────
  function collectPU(type,r,c){
    powerups[type]=(powerups[type]||0)+1;
    burst(colX(c)+cell/2,rowY(r)+cell/2,'#ffe600',20);
    renderPUBar();
  }

  function applyPU(type,r,c){
    if(type==='vent'){
      // reduce pressure of all neighbours
      for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&grid[nr][nc]?.alive){
          grid[nr][nc].press=Math.max(0,grid[nr][nc].press-2);
          ringAt(nr,nc,'#00f5ff');
        }
      }
    } else if(type==='detonate'){
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&grid[nr][nc]?.alive) pop(nr,nc,false);
      }
    } else if(type==='shield'){
      // shield 3x3 around click
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS) shielded.add(nr*COLS+nc);
      }
    }
    powerups[type]=(powerups[type]||0)-1;
    selectedPU=null;renderPUBar();score+=20;movesLeft--;updateHUD();
  }

  // ── Particles ──────────────────────────────────────────────
  function burst(x,y,col,n=20){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,sp=1.5+Math.random()*6;
      particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1,
        r:3+Math.random()*5,col,life:1,decay:0.025+Math.random()*0.02});
    }
  }

  function ringAt(r,c,col){
    rings.push({x:colX(c)+cell/2,y:rowY(r)+cell/2,r:cell*0.2,maxR:cell*0.8,col,life:1,decay:0.08});
  }

  function colX(c){return c*cell;}
  function rowY(r){return r*cell;}

  // ── Draw ──────────────────────────────────────────────────
  function draw(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(4,8,20,0.97)';ctx.fillRect(0,0,W,H);

    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const b=grid[r][c];
        if(!b||!b.alive)continue;
        const x=colX(c)+cell/2,y=rowY(r)+cell/2,rad=cell*0.42;
        const frac=b.press/MAX_PRESS;
        // danger pulse
        if(frac>=0.75){
          ctx.save();ctx.globalAlpha=0.3*(0.5+0.5*Math.sin(Date.now()*0.01));
          ctx.fillStyle='#ff2d78';ctx.beginPath();ctx.arc(x,y,rad*1.2,0,Math.PI*2);ctx.fill();
          ctx.restore();
        }
        // shield halo
        if(shielded.has(r*COLS+c)){
          ctx.save();ctx.strokeStyle='#00f5ff';ctx.lineWidth=2;ctx.globalAlpha=0.5;
          ctx.beginPath();ctx.arc(x,y,rad*1.15,0,Math.PI*2);ctx.stroke();ctx.restore();
        }
        drawBubble(ctx,x,y,rad,b.color,b.pu);
        // pressure segments
        const segs=MAX_PRESS;
        for(let s=0;s<segs;s++){
          const a0=(s/segs)*Math.PI*2-Math.PI/2;
          const a1=((s+1)/segs)*Math.PI*2-Math.PI/2;
          ctx.save();
          ctx.strokeStyle=s<b.press?b.color:'rgba(255,255,255,0.12)';
          ctx.lineWidth=3;ctx.globalAlpha=s<b.press?0.9:0.3;
          ctx.beginPath();ctx.arc(x,y,rad*0.7,a0,a1);ctx.stroke();
          ctx.restore();
        }
        // pu icon
        if(b.pu){ctx.font=`${cell*0.35}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(puEmoji(b.pu),x,y);}
      }
    }

    rings.forEach(f=>{
      ctx.save();ctx.globalAlpha=Math.max(0,f.life*0.7);
      ctx.strokeStyle=f.col;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.stroke();ctx.restore();
    });
    particles.forEach(p=>{
      ctx.save();ctx.globalAlpha=Math.max(0,p.life);
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
      g.addColorStop(0,p.col);g.addColorStop(1,'transparent');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();
    });
  }

  function drawBubble(ctx,x,y,r,col,pu){
    ctx.save();
    const g=ctx.createRadialGradient(x-r*0.3,y-r*0.35,r*0.05,x,y,r);
    g.addColorStop(0,'rgba(255,255,255,0.7)');g.addColorStop(0.3,pu?'#ffe600':col);g.addColorStop(1,shade(pu?'#ffe600':col,-60));
    ctx.fillStyle=g;ctx.shadowColor=pu?'#ffe600':col;ctx.shadowBlur=12;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.globalAlpha=0.5;ctx.fillStyle='rgba(255,255,255,0.65)';
    ctx.beginPath();ctx.ellipse(x-r*0.25,y-r*0.3,r*0.2,r*0.12,0.3,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function shade(hex,amt){
    const n=parseInt(hex.replace('#',''),16);
    return `rgb(${Math.max(0,((n>>16)&255)+amt)},${Math.max(0,((n>>8)&255)+amt)},${Math.max(0,(n&255)+amt)})`;
  }

  function puEmoji(t){return t==='vent'?'💨':t==='detonate'?'💣':'🛡️';}

  function renderPUBar(){
    PU_TYPES.forEach(t=>{
      const el=$id('ppop-pu-'+t);
      if(el){el.textContent=puEmoji(t)+' '+(powerups[t]||0);el.classList.toggle('active',selectedPU===t);}
    });
  }

  function updateHUD(){
    const s=$id('ppop-score');if(s)s.textContent=score.toLocaleString();
    const b=$id('ppop-best');if(b)b.textContent=best.toLocaleString();
    const m=$id('ppop-moves');if(m)m.textContent=movesLeft;
    const l=$id('ppop-level');if(l)l.textContent=level;
  }

  function loop(){
    if(destroyed)return;
    update();draw();raf=requestAnimationFrame(loop);
  }

  function update(){
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.15;p.life-=p.decay;});
    particles=particles.filter(p=>p.life>0);
    rings.forEach(f=>{f.r+=2.5;f.life-=f.decay;});
    rings=rings.filter(f=>f.life>0);
  }

  function onClick(e){
    const rect=canvas.getBoundingClientRect();
    const cx=(e.clientX-rect.left)*(W/rect.width);
    const cy=(e.clientY-rect.top)*(H/rect.height);
    const c=Math.floor(cx/cell),r=Math.floor(cy/cell);
    if(r<0||r>=ROWS||c<0||c>=COLS)return;
    const b=grid[r][c];
    if(!b||!b.alive)return;
    if(selectedPU){applyPU(selectedPU,r,c);return;}
    addPressure(r,c,1,false);
    movesLeft--;updateHUD();
  }

  function init(){
    destroyed=false;particles=[];rings=[];score=0;level=1;powerups={};selectedPU=null;
    try{best=parseInt(localStorage.getItem('ppop_best')||'0');}catch(e){}
    canvas=$id('ppop-canvas');if(!canvas)return;
    ctx=canvas.getContext('2d');
    resize();
    canvas.addEventListener('click',onClick);
    window.addEventListener('resize',resize);
    PU_TYPES.forEach(t=>{const el=$id('ppop-pu-'+t);if(el)el.onclick=()=>{selectedPU=(selectedPU===t?null:t);renderPUBar();};});
    $id('ppop-over').style.display='none';
    newGrid();
    if(raf)cancelAnimationFrame(raf);
    loop();
  }

  function destroy(){
    destroyed=true;if(raf){cancelAnimationFrame(raf);raf=null;}
    if(canvas)canvas.removeEventListener('click',onClick);
    window.removeEventListener('resize',resize);
  }

  window.ppopNewGame=()=>{score=0;level=1;powerups={};selectedPU=null;$id('ppop-over').style.display='none';newGrid();renderPUBar();};
  return{init,destroy};
})();
