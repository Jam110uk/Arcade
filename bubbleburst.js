// ============================================================
// BUBBLE BURST  —  Chain Reaction Puzzle
// Click one bubble → chain explosion clears neighbours.
// Power-ups: BOMB (clears 5x5), LIGHTNING (clears row+col),
//            RAINBOW (clears all of one colour), FREEZE (locks board for inspection)
// ============================================================
export default (() => {
  'use strict';

  const COLS = 10, ROWS = 10;
  const COLORS = ['#ff2d78','#00f5ff','#39ff14','#ff6a00','#bf00ff','#ffe600'];
  const POWERUP_TYPES = ['bomb','lightning','rainbow'];

  let canvas, ctx, W, H, cellSize;
  let grid = [], score = 0, best = 0, level = 1, movesLeft = 20;
  let particles = [], floaters = [];
  let powerups = {}; // key -> { type, count }
  let selectedPU = null;
  let raf = null, destroyed = false;
  let animating = false;

  function $id(id){ return document.getElementById(id); }

  // ── Grid ────────────────────────────────────────────────────
  function newGrid(){
    grid = [];
    for(let r=0;r<ROWS;r++){
      grid[r] = [];
      for(let c=0;c<COLS;c++){
        grid[r][c] = Math.floor(Math.random()*COLORS.length);
      }
    }
    // Seed 1-2 power-up cells
    for(let i=0;i<2;i++){
      const r=Math.floor(Math.random()*ROWS), c=Math.floor(Math.random()*COLS);
      grid[r][c] = -1 - Math.floor(Math.random()*POWERUP_TYPES.length); // -1,-2,-3
    }
    movesLeft = 15 + level*2;
    updateHUD();
  }

  function puTypeFromVal(v){ return POWERUP_TYPES[-(v+1)]; }

  // ── BFS flood fill ───────────────────────────────────────────
  function findGroup(r,c){
    const target = grid[r][c];
    if(target === null || target < 0) return [];
    const visited = new Set(), queue = [[r,c]];
    visited.add(r*COLS+c);
    while(queue.length){
      const [cr,cc] = queue.shift();
      for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=cr+dr, nc=cc+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&!visited.has(nr*COLS+nc)&&grid[nr][nc]===target){
          visited.add(nr*COLS+nc); queue.push([nr,nc]);
        }
      }
    }
    return [...visited].map(k=>[Math.floor(k/COLS),k%COLS]);
  }

  function popCells(cells, col){
    cells.forEach(([r,c])=>{
      spawnBurst(colX(c)+cellSize/2, rowY(r)+cellSize/2, col);
      grid[r][c] = null;
    });
    score += cells.length * cells.length * 10 * level;
    movesLeft--;
    gravity();
    checkWin();
    updateHUD();
  }

  function gravity(){
    for(let c=0;c<COLS;c++){
      let write = ROWS-1;
      for(let r=ROWS-1;r>=0;r--){
        if(grid[r][c] !== null){ grid[write][c]=grid[r][c]; if(write!==r) grid[r][c]=null; write--; }
      }
      for(let r=write;r>=0;r--) grid[r][c]=null;
    }
    // collapse empty columns left
    let writeCol=0;
    for(let c=0;c<COLS;c++){
      if(grid[ROWS-1][c]!==null){ if(writeCol!==c) for(let r=0;r<ROWS;r++){grid[r][writeCol]=grid[r][c]; grid[r][c]=null;} writeCol++; }
    }
  }

  function checkWin(){
    const any = grid.some(row=>row.some(v=>v!==null));
    if(!any){ score+=1000*level; level++; setTimeout(()=>{ newGrid(); },600); }
    if(movesLeft<=0 && any){ setTimeout(()=>showOver(),400); }
  }

  function showOver(){
    if(score>best){ best=score; try{localStorage.setItem('bburst_best',best);}catch(e){} }
    $id('bburst-over-score').textContent = score.toLocaleString();
    $id('bburst-over').style.display='flex';
  }

  // ── Power-ups ────────────────────────────────────────────────
  function usePowerup(r,c,type){
    let cells=[];
    if(type==='bomb'){
      for(let dr=-2;dr<=2;dr++) for(let dc=-2;dc<=2;dc++){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&grid[nr][nc]!==null) cells.push([nr,nc]);
      }
    } else if(type==='lightning'){
      for(let cc=0;cc<COLS;cc++) if(grid[r][cc]!==null) cells.push([r,cc]);
      for(let rr=0;rr<ROWS;rr++) if(grid[rr][c]!==null) cells.push([rr,c]);
      cells = [...new Set(cells.map(([a,b])=>a*COLS+b))].map(k=>[Math.floor(k/COLS),k%COLS]);
    } else if(type==='rainbow'){
      const target=grid[r][c]; if(target===null||target<0) return;
      for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++) if(grid[rr][cc]===target) cells.push([rr,cc]);
    }
    if(cells.length){ popCells(cells, '#ffffff'); }
    powerups[type] = (powerups[type]||0)-1;
    selectedPU = null;
    renderPUBar();
  }

  function collectPU(type){
    powerups[type] = (powerups[type]||0)+1;
    renderPUBar();
  }

  function renderPUBar(){
    POWERUP_TYPES.forEach(t=>{
      const el=$id('bburst-pu-'+t);
      if(el){ el.textContent = puEmoji(t)+' '+(powerups[t]||0); el.classList.toggle('active', selectedPU===t); }
    });
  }
  function puEmoji(t){ return t==='bomb'?'💣':t==='lightning'?'⚡':'🌈'; }

  // ── Particles ────────────────────────────────────────────────
  function spawnBurst(x,y,col){
    for(let i=0;i<18;i++){
      const a=Math.random()*Math.PI*2, sp=2+Math.random()*6;
      particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:4+Math.random()*5,
        col,life:1,decay:0.025+Math.random()*0.02});
    }
    // ring
    floaters.push({x,y,r:cellSize*0.4,maxR:cellSize*1.2,col,life:1,decay:0.06,ring:true});
  }

  // ── Layout ───────────────────────────────────────────────────
  function resize(){
    const wrap=$id('bburst-canvas-wrap');
    if(!wrap) return;
    const sz=Math.min(wrap.clientWidth,wrap.clientHeight,520);
    canvas.width=canvas.height=sz; W=H=sz;
    cellSize=sz/COLS;
  }
  function colX(c){ return c*cellSize; }
  function rowY(r){ return r*cellSize; }

  // ── Draw ─────────────────────────────────────────────────────
  function draw(){
    ctx.clearRect(0,0,W,H);
    // board bg
    ctx.fillStyle='rgba(5,12,28,0.95)';
    ctx.fillRect(0,0,W,H);
    // grid lines
    ctx.strokeStyle='rgba(0,245,255,0.06)';
    ctx.lineWidth=1;
    for(let i=0;i<=COLS;i++){ ctx.beginPath();ctx.moveTo(i*cellSize,0);ctx.lineTo(i*cellSize,H);ctx.stroke(); }
    for(let i=0;i<=ROWS;i++){ ctx.beginPath();ctx.moveTo(0,i*cellSize);ctx.lineTo(W,i*cellSize);ctx.stroke(); }

    // bubbles
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const v=grid[r][c];
        if(v===null) continue;
        const x=colX(c)+cellSize/2, y=rowY(r)+cellSize/2, rad=cellSize*0.42;
        if(v<0){
          // power-up cell
          const t=puTypeFromVal(v);
          drawBubble(ctx,x,y,rad,'#ffffff',0.9);
          ctx.font=`${cellSize*0.45}px serif`;
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(puEmoji(t),x,y);
        } else {
          drawBubble(ctx,x,y,rad,COLORS[v],0.85);
        }
      }
    }

    // particles
    particles.forEach(p=>{
      ctx.save();
      ctx.globalAlpha=Math.max(0,p.life);
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
      g.addColorStop(0,p.col); g.addColorStop(1,'transparent');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
    floaters.forEach(f=>{
      ctx.save();
      ctx.globalAlpha=Math.max(0,f.life*0.7);
      ctx.strokeStyle=f.col; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    });
  }

  function drawBubble(ctx,x,y,r,col,alpha){
    ctx.save();
    ctx.globalAlpha=alpha;
    // main fill
    const g=ctx.createRadialGradient(x-r*0.3,y-r*0.3,r*0.1,x,y,r);
    g.addColorStop(0,'rgba(255,255,255,0.7)');
    g.addColorStop(0.3,col);
    g.addColorStop(1,shadeColor(col,-60));
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    // glow
    ctx.shadowColor=col; ctx.shadowBlur=12;
    ctx.strokeStyle=col; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    // shine
    ctx.shadowBlur=0; ctx.globalAlpha=0.55;
    ctx.fillStyle='rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(x-r*0.28,y-r*0.32,r*0.22,r*0.14,Math.PI*0.2,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function shadeColor(hex,amt){
    const n=parseInt(hex.replace('#',''),16);
    const r=Math.max(0,Math.min(255,((n>>16)&255)+amt));
    const g=Math.max(0,Math.min(255,((n>>8)&255)+amt));
    const b=Math.max(0,Math.min(255,(n&255)+amt));
    return `rgb(${r},${g},${b})`;
  }

  // ── Main loop ────────────────────────────────────────────────
  function loop(){
    if(destroyed) return;
    update();
    draw();
    raf=requestAnimationFrame(loop);
  }

  function update(){
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life-=p.decay;
      if(p.life<=0) particles.splice(i,1);
    }
    for(let i=floaters.length-1;i>=0;i--){
      const f=floaters[i];
      f.r+=3; f.life-=f.decay;
      if(f.life<=0) floaters.splice(i,1);
    }
  }

  function updateHUD(){
    const s=$id('bburst-score'); if(s) s.textContent=score.toLocaleString();
    const b=$id('bburst-best'); if(b) b.textContent=best.toLocaleString();
    const m=$id('bburst-moves'); if(m) m.textContent=movesLeft;
    const l=$id('bburst-level'); if(l) l.textContent=level;
  }

  // ── Click ────────────────────────────────────────────────────
  function onClick(e){
    if(animating) return;
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.width/rect.width, scaleY=canvas.height/rect.height;
    const cx=(e.clientX-rect.left)*scaleX, cy=(e.clientY-rect.top)*scaleY;
    const c=Math.floor(cx/cellSize), r=Math.floor(cy/cellSize);
    if(r<0||r>=ROWS||c<0||c>=COLS) return;
    const v=grid[r][c];
    if(v===null) return;

    if(v<0){
      collectPU(puTypeFromVal(v));
      spawnBurst(colX(c)+cellSize/2, rowY(r)+cellSize/2, '#ffe600');
      grid[r][c]=null; gravity(); movesLeft--; updateHUD(); return;
    }

    if(selectedPU){
      usePowerup(r,c,selectedPU); return;
    }

    const group=findGroup(r,c);
    if(group.length<2) return;
    popCells(group, COLORS[v]);
  }

  // ── Init / destroy ───────────────────────────────────────────
  function init(){
    destroyed=false; particles=[]; floaters=[]; score=0; level=1;
    try{ best=parseInt(localStorage.getItem('bburst_best')||'0'); }catch(e){}
    powerups={}; selectedPU=null;

    canvas=$id('bburst-canvas');
    if(!canvas) return;
    ctx=canvas.getContext('2d');
    resize();
    canvas.addEventListener('click',onClick);
    window.addEventListener('resize',resize);

    // PU buttons
    POWERUP_TYPES.forEach(t=>{
      const el=$id('bburst-pu-'+t);
      if(el) el.onclick=()=>{ selectedPU=(selectedPU===t?null:t); renderPUBar(); };
    });
    $id('bburst-over').style.display='none';
    newGrid();
    if(raf) cancelAnimationFrame(raf);
    loop();
  }

  function destroy(){
    destroyed=true;
    if(raf){ cancelAnimationFrame(raf); raf=null; }
    if(canvas){ canvas.removeEventListener('click',onClick); }
    window.removeEventListener('resize',resize);
  }

  window.bburstNewGame=()=>{ score=0; level=1; powerups={}; selectedPU=null; $id('bburst-over').style.display='none'; newGrid(); renderPUBar(); };

  return { init, destroy };
})();
