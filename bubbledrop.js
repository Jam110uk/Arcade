// ============================================================
// BUBBLE DROP  —  Physics columns
// Bubbles fall from the top. Match 3+ horizontally or
// vertically to pop. Gravity collapses remaining bubbles.
// Power-ups: LASER (clear column), NUKE (3x3 pop), MAGNET (pull same colour)
// ============================================================
export default (() => {
  'use strict';

  const COLS=8,ROWS=12;
  const COLORS=['#ff2d78','#00f5ff','#39ff14','#ff6a00','#bf00ff','#ffe600'];
  const PU_TYPES=['laser','nuke','magnet'];

  let canvas,ctx,W,H,cellW,cellH;
  let board=[]; // ROWS x COLS, null or {color,vy,y,landing}
  let fallingBubble=null; // {color,col,y,vy,pu}
  let nextColor=null, nextPU=null;
  let score=0,best=0,level=1,combo=0;
  let particles=[],trails=[];
  let powerups={},selectedPU=null;
  let raf=null,destroyed=false;
  let dropInterval=3,dropTimer=0;
  let gameOver=false;

  function $id(id){return document.getElementById(id);}

  function initBoard(){
    board=[];
    for(let r=0;r<ROWS;r++){board[r]=[];for(let c=0;c<COLS;c++)board[r][c]=null;}
    // pre-fill bottom 3 rows
    for(let r=ROWS-3;r<ROWS;r++) for(let c=0;c<COLS;c++){
      if(Math.random()<0.6) board[r][c]={color:COLORS[Math.floor(Math.random()*COLORS.length)],vy:0,y:rowY(r),landing:false};
    }
    spawnFalling();updateHUD();
  }

  function resize(){
    const wrap=$id('bdrop-canvas-wrap');if(!wrap)return;
    W=Math.min(wrap.clientWidth,400);H=Math.min(wrap.clientHeight,560,window.innerHeight-200);
    canvas.width=W;canvas.height=H;
    cellW=Math.floor(W/COLS);cellH=Math.floor(H/ROWS);
  }

  function rowY(r){return r*cellH;}
  function colX(c){return c*cellW;}

  function spawnFalling(){
    const hasPU=Math.random()<0.06;
    fallingBubble={
      color:nextColor||COLORS[Math.floor(Math.random()*COLORS.length)],
      col:Math.floor(COLS/2),
      y:-cellH,
      vy:1.5+level*0.4,
      pu:nextPU||(hasPU?PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)]:null)
    };
    nextColor=COLORS[Math.floor(Math.random()*COLORS.length)];
    nextPU=Math.random()<0.05?PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)]:null;
    updateNext();
  }

  function updateNext(){
    const el=$id('bdrop-next');
    if(el){el.style.background=nextColor||'transparent';el.title=nextPU||'';}
  }

  // ── Move falling bubble ────────────────────────────────────
  function moveBubble(dir){
    if(!fallingBubble)return;
    const nc=fallingBubble.col+dir;
    if(nc>=0&&nc<COLS) fallingBubble.col=nc;
  }

  function dropBubble(){
    if(!fallingBubble)return;
    fallingBubble.vy=18; // fast drop
  }

  // ── Land ───────────────────────────────────────────────────
  function land(col,y,color,pu){
    // find landing row
    let landRow=ROWS-1;
    for(let r=0;r<ROWS;r++){
      if(board[r][col]) { landRow=r-1; break; }
    }
    if(landRow<0){showGameOver();return;}
    board[landRow][col]={color,vy:0,y:rowY(landRow),landing:true,pu};
    burst(colX(col)+cellW/2,rowY(landRow)+cellH/2,color,10);
    if(pu){collectPU(pu,col,landRow);}
    setTimeout(()=>{
      if(board[landRow]&&board[landRow][col]) board[landRow][col].landing=false;
      popMatches();
      spawnFalling();
    },120);
  }

  // ── Match & pop ────────────────────────────────────────────
  function popMatches(){
    const toRemove=new Set();
    // horizontal
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS-2;c++){
        const col=board[r][c]?.color;
        if(col&&board[r][c+1]?.color===col&&board[r][c+2]?.color===col){
          let end=c+2;while(end+1<COLS&&board[r][end+1]?.color===col)end++;
          for(let i=c;i<=end;i++) toRemove.add(r*COLS+i);
        }
      }
    }
    // vertical
    for(let c=0;c<COLS;c++){
      for(let r=0;r<ROWS-2;r++){
        const col=board[r][c]?.color;
        if(col&&board[r+1][c]?.color===col&&board[r+2][c]?.color===col){
          let end=r+2;while(end+1<ROWS&&board[end+1][c]?.color===col)end++;
          for(let i=r;i<=end;i++) toRemove.add(i*COLS+c);
        }
      }
    }
    if(toRemove.size===0){combo=0;return;}
    combo++;
    toRemove.forEach(k=>{
      const r=Math.floor(k/COLS),c=k%COLS;
      const b=board[r][c];
      if(b){burst(colX(c)+cellW/2,rowY(r)+cellH/2,b.color,12);}
      board[r][c]=null;
    });
    score+=toRemove.size*(toRemove.size+combo*2)*20*level;
    gravity();
    setTimeout(()=>popMatches(),250);
    updateHUD();
  }

  function gravity(){
    for(let c=0;c<COLS;c++){
      let write=ROWS-1;
      for(let r=ROWS-1;r>=0;r--){
        if(board[r][c]){board[write][c]=board[r][c];board[write][c].y=rowY(write);if(write!==r)board[r][c]=null;write--;}
      }
      for(let r=write;r>=0;r--) board[r][c]=null;
    }
  }

  function showGameOver(){
    gameOver=true;
    if(score>best){best=score;try{localStorage.setItem('bdrop_best',best);}catch(e){}}
    $id('bdrop-over-score').textContent=score.toLocaleString();
    $id('bdrop-over').style.display='flex';
  }

  // ── Power-ups ──────────────────────────────────────────────
  function collectPU(type,col,r){
    powerups[type]=(powerups[type]||0)+1;
    burst(colX(col)+cellW/2,rowY(r)+cellH/2,'#ffe600',20);
    renderPUBar();
  }

  function applyPU(type,col){
    if(!powerups[type]||powerups[type]<=0)return;
    if(type==='laser'){
      for(let r=0;r<ROWS;r++) if(board[r][col]){burst(colX(col)+cellW/2,rowY(r)+cellH/2,board[r][col].color,8);board[r][col]=null;}
      score+=150*level;
    } else if(type==='nuke'){
      const c2=Math.max(0,Math.min(COLS-1,col));
      const topRow=board.findIndex(row=>row[c2]!==null);
      const r0=Math.max(0,topRow-1);
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        const nr=r0+dr,nc=c2+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&board[nr][nc]){burst(colX(nc)+cellW/2,rowY(nr)+cellH/2,board[nr][nc].color,10);board[nr][nc]=null;}
      }
      score+=250*level;
    } else if(type==='magnet'){
      const topColor=fallingBubble?.color||COLORS[0];
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
        if(board[r][c]?.color===topColor){burst(colX(c)+cellW/2,rowY(r)+cellH/2,topColor,8);board[r][c]=null;}
      }
      score+=200*level;
    }
    gravity();setTimeout(()=>popMatches(),200);
    powerups[type]--;renderPUBar();updateHUD();
    selectedPU=null;
  }

  function puEmoji(t){return t==='laser'?'⚡':t==='nuke'?'💣':'🧲';}
  function renderPUBar(){
    PU_TYPES.forEach(t=>{
      const el=$id('bdrop-pu-'+t);
      if(el){el.textContent=puEmoji(t)+' '+(powerups[t]||0);el.classList.toggle('active',selectedPU===t);}
    });
  }

  // ── Particles ──────────────────────────────────────────────
  function burst(x,y,col,n=14){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,sp=1.5+Math.random()*5;
      particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,r:3+Math.random()*4,col,life:1,decay:0.03+Math.random()*0.02});
    }
  }

  // ── Draw ───────────────────────────────────────────────────
  function draw(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(3,8,20,0.97)';ctx.fillRect(0,0,W,H);
    // column guides
    for(let c=1;c<COLS;c++){ctx.strokeStyle='rgba(0,245,255,0.06)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(c*cellW,0);ctx.lineTo(c*cellW,H);ctx.stroke();}

    // board
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const b=board[r][c]; if(!b)continue;
      const x=colX(c)+cellW/2, y=b.y+cellH/2, rad=Math.min(cellW,cellH)*0.42;
      if(b.landing){ctx.save();ctx.globalAlpha=0.3;ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(x,y,rad*1.3,0,Math.PI*2);ctx.fill();ctx.restore();}
      drawBubble(ctx,x,y,rad,b.color);
      if(b.pu){ctx.font=`${rad*0.9}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(puEmoji(b.pu),x,y);}
    }

    // falling bubble
    if(fallingBubble){
      const x=colX(fallingBubble.col)+cellW/2,y=fallingBubble.y+cellH/2;
      const rad=Math.min(cellW,cellH)*0.42;
      // drop guide
      let guideRow=ROWS-1;
      for(let r=0;r<ROWS;r++){if(board[r][fallingBubble.col]){guideRow=r-1;break;}}
      if(guideRow>=0){
        ctx.save();ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.setLineDash([4,6]);ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x,y+cellH/2);ctx.lineTo(x,rowY(guideRow)+cellH/2);ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        ctx.save();ctx.globalAlpha=0.2;ctx.fillStyle=fallingBubble.color;
        ctx.beginPath();ctx.arc(x,rowY(guideRow)+cellH/2,rad,0,Math.PI*2);ctx.fill();ctx.restore();
      }
      drawBubble(ctx,x,y,rad,fallingBubble.color);
      if(fallingBubble.pu){ctx.font=`${rad*0.9}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(puEmoji(fallingBubble.pu),x,y);}
    }

    particles.forEach(p=>{
      ctx.save();ctx.globalAlpha=Math.max(0,p.life);
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
      g.addColorStop(0,p.col);g.addColorStop(1,'transparent');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();
    });
  }

  function drawBubble(ctx,x,y,r,col){
    ctx.save();
    const g=ctx.createRadialGradient(x-r*0.3,y-r*0.35,r*0.05,x,y,r);
    g.addColorStop(0,'rgba(255,255,255,0.75)');g.addColorStop(0.3,col);g.addColorStop(1,shade(col,-60));
    ctx.fillStyle=g;ctx.shadowColor=col;ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.globalAlpha=0.5;ctx.fillStyle='rgba(255,255,255,0.65)';
    ctx.beginPath();ctx.ellipse(x-r*0.25,y-r*0.3,r*0.2,r*0.12,0.3,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function shade(hex,amt){
    const n=parseInt(hex.replace('#',''),16);
    return `rgb(${Math.max(0,((n>>16)&255)+amt)},${Math.max(0,((n>>8)&255)+amt)},${Math.max(0,(n&255)+amt)})`;
  }

  // ── Keys ───────────────────────────────────────────────────
  function onKey(e){
    if(gameOver)return;
    if(e.key==='ArrowLeft')moveBubble(-1);
    else if(e.key==='ArrowRight')moveBubble(1);
    else if(e.key==='ArrowDown'||e.key===' ')dropBubble();
  }

  function onClick(e){
    if(gameOver||!fallingBubble)return;
    const rect=canvas.getBoundingClientRect();
    const cx=(e.clientX-rect.left)*(W/rect.width);
    const col=Math.floor(cx/cellW);
    if(col<0||col>=COLS)return;
    if(selectedPU){applyPU(selectedPU,col);return;}
    fallingBubble.col=col;dropBubble();
  }

  // ── Loop ───────────────────────────────────────────────────
  function loop(){
    if(destroyed)return;
    if(!gameOver&&fallingBubble){
      fallingBubble.y+=fallingBubble.vy;
      // trail
      if(Math.random()<0.4) trails.push({x:colX(fallingBubble.col)+cellW/2,y:fallingBubble.y+cellH/2,r:3,col:fallingBubble.color,life:0.5,decay:0.08});
      // check landing
      let landRow=ROWS-1;
      for(let r=0;r<ROWS;r++){if(board[r][fallingBubble.col]){landRow=r-1;break;}}
      if(fallingBubble.y+cellH>=rowY(landRow+1)){
        const c=fallingBubble.col,col=fallingBubble.color,pu=fallingBubble.pu;
        fallingBubble=null;
        land(c,rowY(landRow),col,pu);
      }
    }
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.15;p.life-=p.decay;});
    particles=particles.filter(p=>p.life>0);
    trails.forEach(t=>{t.r+=0.5;t.life-=t.decay;});
    trails=trails.filter(t=>t.life>0);
    draw();raf=requestAnimationFrame(loop);
  }

  function updateHUD(){
    const s=$id('bdrop-score');if(s)s.textContent=score.toLocaleString();
    const b=$id('bdrop-best');if(b)b.textContent=best.toLocaleString();
    const l=$id('bdrop-level');if(l)l.textContent=level;
    if(score>level*600)level++;
  }

  function init(){
    destroyed=false;gameOver=false;particles=[];trails=[];score=0;level=1;combo=0;powerups={};selectedPU=null;
    try{best=parseInt(localStorage.getItem('bdrop_best')||'0');}catch(e){}
    canvas=$id('bdrop-canvas');if(!canvas)return;
    ctx=canvas.getContext('2d');
    resize();
    canvas.addEventListener('click',onClick);
    window.addEventListener('keydown',onKey);
    window.addEventListener('resize',resize);
    PU_TYPES.forEach(t=>{const el=$id('bdrop-pu-'+t);if(el)el.onclick=()=>{selectedPU=(selectedPU===t?null:t);renderPUBar();};});
    $id('bdrop-over').style.display='none';
    initBoard();
    if(raf)cancelAnimationFrame(raf);
    loop();
  }

  function destroy(){
    destroyed=true;if(raf){cancelAnimationFrame(raf);raf=null;}
    if(canvas)canvas.removeEventListener('click',onClick);
    window.removeEventListener('keydown',onKey);
    window.removeEventListener('resize',resize);
  }

  window.bdropNewGame=()=>{score=0;level=1;combo=0;gameOver=false;powerups={};selectedPU=null;fallingBubble=null;$id('bdrop-over').style.display='none';initBoard();renderPUBar();};
  return{init,destroy};
})();
