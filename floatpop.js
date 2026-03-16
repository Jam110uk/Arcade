// ============================================================
// FLOAT & POP  —  Rising column puzzle
// Bubbles float UP. Pop same-colour groups in a column before
// they reach the top. Power-ups: CLEAR_COL, SLOW, WILDCARD
// ============================================================
export default (() => {
  'use strict';

  const COLS=8, VISIBLE=10;
  const COLORS=['#ff2d78','#00f5ff','#39ff14','#ff6a00','#bf00ff','#ffe600'];
  const PU_TYPES=['clearCol','slow','wild'];

  let canvas,ctx,W,H,cellW,cellH;
  let columns=[]; // each col: array of {color,y,vy,popped,pu}
  let score=0,best=0,level=1,combo=0;
  let particles=[],shakes=0;
  let powerups={},selectedPU=null;
  let slowTimer=0;
  let raf=null,destroyed=false;
  let spawnTimer=0,spawnInterval=90;

  function $id(id){return document.getElementById(id);}

  function initCols(){
    columns=[];
    for(let c=0;c<COLS;c++) columns.push([]);
    for(let c=0;c<COLS;c++){
      for(let i=0;i<4;i++) spawnInCol(c, H-(i+1)*cellH*1.1);
    }
  }

  function spawnInCol(c,startY){
    const hasPU=Math.random()<0.04;
    columns[c].push({
      color: COLORS[Math.floor(Math.random()*COLORS.length)],
      y: startY||H+cellH,
      vy: (0.4+level*0.15)*(slowTimer>0?0.3:1),
      popped:false,
      pu: hasPU?PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)]:null
    });
  }

  function resize(){
    const wrap=$id('fpop-canvas-wrap'); if(!wrap) return;
    W=Math.min(wrap.clientWidth,500); H=Math.min(wrap.clientHeight,580,window.innerHeight-180);
    canvas.width=W; canvas.height=H;
    cellW=Math.floor(W/COLS); cellH=Math.floor(H/VISIBLE);
  }

  // ── Particles ─────────────────────────────────────────────
  function burst(x,y,col,n=16){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,sp=2+Math.random()*5;
      particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,
        r:3+Math.random()*4,col,life:1,decay:0.03+Math.random()*0.02});
    }
  }

  // ── Click ─────────────────────────────────────────────────
  function onClick(e){
    const rect=canvas.getBoundingClientRect();
    const cx=(e.clientX-rect.left)*(W/rect.width);
    const cy=(e.clientY-rect.top)*(H/rect.height);
    const col=Math.floor(cx/cellW);
    if(col<0||col>=COLS) return;

    // find clicked bubble
    const arr=columns[col];
    for(let i=arr.length-1;i>=0;i--){
      const b=arr[i];
      if(b.popped) continue;
      const bx=col*cellW+cellW/2, by=b.y;
      const r=cellW*0.4;
      if(Math.abs(cx-bx)<r*1.2&&Math.abs(cy-by)<r*1.2){
        if(b.pu){ activatePU(b.pu,col,i); arr.splice(i,1); score+=50; updateHUD(); return; }
        if(selectedPU){ applyPU(selectedPU,col,i); return; }
        popGroup(col,i,b.color);
        return;
      }
    }
  }

  function popGroup(startCol,startIdx,color){
    if(columns[startCol][startIdx]?.color!==color) return;
    let popped=[];
    // pop all of same color in same and adjacent columns that overlap vertically
    const refY=columns[startCol][startIdx].y;
    for(let dc=-1;dc<=1;dc++){
      const c2=startCol+dc; if(c2<0||c2>=COLS) continue;
      columns[c2].forEach((b,i)=>{
        if(!b.popped&&b.color===color&&Math.abs(b.y-refY)<cellH*1.5) popped.push({c:c2,i});
      });
    }
    if(popped.length<1) return;
    combo++;
    popped.forEach(({c,i})=>{
      const b=columns[c][i];
      burst(c*cellW+cellW/2,b.y,b.color);
      columns[c].splice(i,1);
    });
    score+=popped.length*(popped.length+combo)*15*level;
    shakes=6;
    updateHUD();
  }

  function activatePU(type,col){
    powerups[type]=(powerups[type]||0)+1;
    burst(col*cellW+cellW/2,H/2,'#ffe600',20);
    renderPUBar();
  }

  function applyPU(type,col){
    if(type==='clearCol'){
      columns[col].forEach(b=>burst(col*cellW+cellW/2,b.y,b.color));
      columns[col]=[];
      score+=200*level;
    } else if(type==='slow'){
      slowTimer=300;
    } else if(type==='wild'){
      // pop biggest group regardless of color
      let best2=null,bsz=0;
      columns.forEach((arr,c)=>{
        if(arr.length>bsz){bsz=arr.length;best2=c;}
      });
      if(best2!==null){
        columns[best2].forEach(b=>burst(best2*cellW+cellW/2,b.y,b.color));
        score+=columns[best2].length*50*level;
        columns[best2]=[];
      }
    }
    powerups[type]=(powerups[type]||0)-1;
    selectedPU=null;
    renderPUBar();
    updateHUD();
  }

  function puEmoji(t){return t==='clearCol'?'💨':t==='slow'?'🧊':'🌟';}
  function renderPUBar(){
    PU_TYPES.forEach(t=>{
      const el=$id('fpop-pu-'+t);
      if(el){el.textContent=puEmoji(t)+' '+(powerups[t]||0);el.classList.toggle('active',selectedPU===t);}
    });
  }

  // ── Game over check ────────────────────────────────────────
  function checkFail(){
    for(let c=0;c<COLS;c++){
      if(columns[c].some(b=>!b.popped&&b.y<0)){
        if(score>best){best=score;try{localStorage.setItem('fpop_best',best);}catch(e){}}
        $id('fpop-over-score').textContent=score.toLocaleString();
        $id('fpop-over').style.display='flex';
        return true;
      }
    }
    return false;
  }

  // ── Draw ──────────────────────────────────────────────────
  function draw(){
    ctx.clearRect(0,0,W,H);
    // bg
    ctx.fillStyle='rgba(3,8,20,0.96)';
    ctx.fillRect(0,0,W,H);
    // column separators
    for(let c=1;c<COLS;c++){
      ctx.strokeStyle='rgba(0,245,255,0.08)'; ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(c*cellW,0);ctx.lineTo(c*cellW,H);ctx.stroke();
    }
    // danger zone top
    const dh=cellH*1.5;
    const dg=ctx.createLinearGradient(0,0,0,dh);
    dg.addColorStop(0,'rgba(255,45,120,0.25)'); dg.addColorStop(1,'transparent');
    ctx.fillStyle=dg; ctx.fillRect(0,0,W,dh);

    // bubbles
    columns.forEach((arr,c)=>{
      arr.forEach(b=>{
        if(b.popped) return;
        const x=c*cellW+cellW/2,y=b.y,r=cellW*0.38;
        drawBubble(ctx,x,y,r,b.pu?'#ffe600':b.color);
        if(b.pu){
          ctx.font=`${r*0.9}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(puEmoji(b.pu),x,y);
        }
        // danger flash
        if(y<dh*1.5){
          ctx.save();ctx.globalAlpha=(1-y/dh)*0.4;
          ctx.strokeStyle='#ff2d78';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
          ctx.restore();
        }
      });
    });

    // slow overlay
    if(slowTimer>0){
      ctx.save();ctx.globalAlpha=0.08;
      ctx.fillStyle='#00f5ff';ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    // particles
    particles.forEach(p=>{
      ctx.save();ctx.globalAlpha=Math.max(0,p.life);
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
      g.addColorStop(0,p.col);g.addColorStop(1,'transparent');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
      ctx.restore();
    });
  }

  function drawBubble(ctx,x,y,r,col){
    ctx.save();
    const g=ctx.createRadialGradient(x-r*0.3,y-r*0.35,r*0.05,x,y,r);
    g.addColorStop(0,'rgba(255,255,255,0.75)');g.addColorStop(0.35,col);g.addColorStop(1,shadeCol(col,-50));
    ctx.fillStyle=g;ctx.shadowColor=col;ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.globalAlpha=0.5;ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.beginPath();ctx.ellipse(x-r*0.25,y-r*0.3,r*0.2,r*0.12,Math.PI*0.2,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function shadeCol(hex,amt){
    const n=parseInt(hex.replace('#',''),16);
    return `rgb(${Math.max(0,((n>>16)&255)+amt)},${Math.max(0,((n>>8)&255)+amt)},${Math.max(0,(n&255)+amt)})`;
  }

  // ── Loop ──────────────────────────────────────────────────
  function loop(){
    if(destroyed) return;
    if(document.hidden){raf=requestAnimationFrame(loop);return;}
    update();
    draw();
    raf=requestAnimationFrame(loop);
  }

  function update(){
    if(slowTimer>0) slowTimer--;
    const speed=slowTimer>0?0.3:1;

    // move bubbles up
    columns.forEach(arr=>{
      arr.forEach(b=>{
        b.y-=b.vy*speed;
      });
    });

    // spawn new bubbles periodically
    spawnTimer++;
    if(spawnTimer>=spawnInterval){
      spawnTimer=0;
      const c=Math.floor(Math.random()*COLS);
      spawnInCol(c);
    }
    // escalate
    if(score>level*800){ level++; spawnInterval=Math.max(30,spawnInterval-8); updateHUD(); }

    // reset combo on no pop (simplified: combo decays)
    particles.forEach((p,i)=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.12;p.life-=p.decay;});
    particles=particles.filter(p=>p.life>0);

    checkFail();
  }

  function updateHUD(){
    const s=$id('fpop-score');if(s)s.textContent=score.toLocaleString();
    const b=$id('fpop-best');if(b)b.textContent=best.toLocaleString();
    const l=$id('fpop-level');if(l)l.textContent=level;
  }

  function init(){
    destroyed=false;particles=[];score=0;level=1;combo=0;slowTimer=0;
    spawnTimer=0;spawnInterval=90;powerups={};selectedPU=null;
    try{best=parseInt(localStorage.getItem('fpop_best')||'0');}catch(e){}
    canvas=$id('fpop-canvas');if(!canvas)return;
    ctx=canvas.getContext('2d');
    resize();
    canvas.addEventListener('click',onClick);
    window.addEventListener('resize',resize);
    PU_TYPES.forEach(t=>{const el=$id('fpop-pu-'+t);if(el)el.onclick=()=>{selectedPU=(selectedPU===t?null:t);renderPUBar();};});
    $id('fpop-over').style.display='none';
    initCols(); updateHUD();
    if(raf)cancelAnimationFrame(raf);
    loop();
  }

  function destroy(){
    destroyed=true;
    if(raf){cancelAnimationFrame(raf);raf=null;}
    if(canvas)canvas.removeEventListener('click',onClick);
    window.removeEventListener('resize',resize);
  }

  window.fpopNewGame=()=>{score=0;level=1;combo=0;slowTimer=0;spawnInterval=90;powerups={};selectedPU=null;$id('fpop-over').style.display='none';initCols();updateHUD();renderPUBar();};
  return{init,destroy};
})();
