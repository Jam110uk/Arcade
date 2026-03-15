// CHESS game module
// Auto-extracted from monolithic index.html

export default (() => {
  'use strict';

  // ── Piece constants ──────────────────────────────────────
  const EMPTY=0, P=1, N=2, B=3, R=4, Q=5, K=6;
  const W=1, BL=-1;

  const GLYPHS = {
    [W]:  {[P]:'♙',[N]:'♘',[B]:'♗',[R]:'♖',[Q]:'♕',[K]:'♔'},
    [BL]: {[P]:'♟',[N]:'♞',[B]:'♝',[R]:'♜',[Q]:'♛',[K]:'♚'},
  };

  const PST = {
    [P]:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
    [N]:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
    [B]:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
    [R]:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
    [Q]:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
    [K]:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
  };
  const PIECE_VAL = {[P]:100,[N]:320,[B]:330,[R]:500,[Q]:900,[K]:20000};

  let board=[], turn=W, castleRights={wK:true,wQ:true,bK:true,bQ:true};
  let enPassant=-1, selected=-1, legalMovesCache=null, lastMove={from:-1,to:-1};
  let flipped=false, isMulti=false, playerColor=W;
  let myName='YOU', oppName='AI', roomCode=null, unsubs=[];
  let aiDepth=3, aiWorking=false, aiTimer=null, aiDotTimer=null, gameOver=false;
  let moveHistory=[], promotionPending=null;

  const idx=(r,c)=>r*8+c, row=i=>i>>3, col=i=>i&7;
  function inBounds(r,c){return r>=0&&r<8&&c>=0&&c<8;}

  function initBoard(){
    board=Array(64).fill(null);
    const br=[R,N,B,Q,K,B,N,R];
    for(let c=0;c<8;c++){board[idx(0,c)]={color:BL,type:br[c]};board[idx(1,c)]={color:BL,type:P};board[idx(6,c)]={color:W,type:P};board[idx(7,c)]={color:W,type:br[c]};}
    castleRights={wK:true,wQ:true,bK:true,bQ:true};enPassant=-1;turn=W;selected=-1;legalMovesCache=null;lastMove={from:-1,to:-1};moveHistory=[];gameOver=false;promotionPending=null;
  }

  function pseudoMoves(color,brd,cr,ep){
    const moves=[];
    for(let sq=0;sq<64;sq++){
      const pc=brd[sq];if(!pc||pc.color!==color)continue;
      const r=row(sq),c=col(sq);
      if(pc.type===P)pawnMoves(sq,r,c,color,brd,ep,moves);
      else if(pc.type===N)knightMoves(sq,r,c,color,brd,moves);
      else if(pc.type===B)slideMoves(sq,r,c,color,brd,moves,[[1,1],[1,-1],[-1,1],[-1,-1]]);
      else if(pc.type===R)slideMoves(sq,r,c,color,brd,moves,[[1,0],[-1,0],[0,1],[0,-1]]);
      else if(pc.type===Q)slideMoves(sq,r,c,color,brd,moves,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
      else if(pc.type===K)kingMoves(sq,r,c,color,brd,cr,moves);
    }
    return moves;
  }
  function pawnMoves(sq,r,c,color,brd,ep,moves){
    const dir=color===W?-1:1,sR=color===W?6:1,pR=color===W?0:7;
    const fwd=idx(r+dir,c);
    if(inBounds(r+dir,c)&&!brd[fwd]){moves.push({from:sq,to:fwd,promo:row(fwd)===pR});if(r===sR&&!brd[idx(r+dir*2,c)])moves.push({from:sq,to:idx(r+dir*2,c),promo:false});}
    for(const dc of[-1,1]){if(!inBounds(r+dir,c+dc))continue;const ts=idx(r+dir,c+dc);if(brd[ts]&&brd[ts].color!==color)moves.push({from:sq,to:ts,promo:row(ts)===pR});if(ts===ep)moves.push({from:sq,to:ts,promo:false,ep:true});}
  }
  function knightMoves(sq,r,c,color,brd,moves){
    for(const[dr,dc]of[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]){if(!inBounds(r+dr,c+dc))continue;const ts=idx(r+dr,c+dc);if(!brd[ts]||brd[ts].color!==color)moves.push({from:sq,to:ts,promo:false});}
  }
  function slideMoves(sq,r,c,color,brd,moves,dirs){
    for(const[dr,dc]of dirs){let nr=r+dr,nc=c+dc;while(inBounds(nr,nc)){const ts=idx(nr,nc);if(brd[ts]){if(brd[ts].color!==color)moves.push({from:sq,to:ts,promo:false});break;}moves.push({from:sq,to:ts,promo:false});nr+=dr;nc+=dc;}}
  }
  function kingMoves(sq,r,c,color,brd,cr,moves){
    for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){if(!inBounds(r+dr,c+dc))continue;const ts=idx(r+dr,c+dc);if(!brd[ts]||brd[ts].color!==color)moves.push({from:sq,to:ts,promo:false});}
    if(color===W&&r===7&&c===4){if(cr.wK&&!brd[idx(7,5)]&&!brd[idx(7,6)]&&!isAttacked(sq,BL,brd)&&!isAttacked(idx(7,5),BL,brd))moves.push({from:sq,to:idx(7,6),castle:'wK',promo:false});if(cr.wQ&&!brd[idx(7,3)]&&!brd[idx(7,2)]&&!brd[idx(7,1)]&&!isAttacked(sq,BL,brd)&&!isAttacked(idx(7,3),BL,brd))moves.push({from:sq,to:idx(7,2),castle:'wQ',promo:false});}
    if(color===BL&&r===0&&c===4){if(cr.bK&&!brd[idx(0,5)]&&!brd[idx(0,6)]&&!isAttacked(sq,W,brd)&&!isAttacked(idx(0,5),W,brd))moves.push({from:sq,to:idx(0,6),castle:'bK',promo:false});if(cr.bQ&&!brd[idx(0,3)]&&!brd[idx(0,2)]&&!brd[idx(0,1)]&&!isAttacked(sq,W,brd)&&!isAttacked(idx(0,3),W,brd))moves.push({from:sq,to:idx(0,2),castle:'bQ',promo:false});}
  }

  function isAttacked(sq,byColor,brd){
    const r=row(sq),c=col(sq);
    const pd=byColor===W?1:-1;
    for(const dc of[-1,1]){const nr=r+pd,nc=c+dc;if(inBounds(nr,nc)){const pc=brd[idx(nr,nc)];if(pc&&pc.color===byColor&&pc.type===P)return true;}}
    for(const[dr,dc]of[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]){const nr=r+dr,nc=c+dc;if(inBounds(nr,nc)){const pc=brd[idx(nr,nc)];if(pc&&pc.color===byColor&&pc.type===N)return true;}}
    for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]]){let nr=r+dr,nc=c+dc;while(inBounds(nr,nc)){const pc=brd[idx(nr,nc)];if(pc){if(pc.color===byColor&&(pc.type===R||pc.type===Q))return true;break;}nr+=dr;nc+=dc;}}
    for(const[dr,dc]of[[1,1],[1,-1],[-1,1],[-1,-1]]){let nr=r+dr,nc=c+dc;while(inBounds(nr,nc)){const pc=brd[idx(nr,nc)];if(pc){if(pc.color===byColor&&(pc.type===B||pc.type===Q))return true;break;}nr+=dr;nc+=dc;}}
    for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inBounds(nr,nc)){const pc=brd[idx(nr,nc)];if(pc&&pc.color===byColor&&pc.type===K)return true;}}
    return false;
  }

  function kingSquare(color,brd){for(let i=0;i<64;i++)if(brd[i]&&brd[i].color===color&&brd[i].type===K)return i;return-1;}

  function applyMove(brd,mv,cr,ep){
    const nb=brd.slice(),pc=nb[mv.from];
    nb[mv.to]=mv.promoType?{color:pc.color,type:mv.promoType}:pc;nb[mv.from]=null;
    if(mv.ep){nb[idx(row(mv.to)+(pc.color===W?1:-1),col(mv.to))]=null;}
    if(mv.castle==='wK'){nb[idx(7,5)]=nb[idx(7,7)];nb[idx(7,7)]=null;}
    if(mv.castle==='wQ'){nb[idx(7,3)]=nb[idx(7,0)];nb[idx(7,0)]=null;}
    if(mv.castle==='bK'){nb[idx(0,5)]=nb[idx(0,7)];nb[idx(0,7)]=null;}
    if(mv.castle==='bQ'){nb[idx(0,3)]=nb[idx(0,0)];nb[idx(0,0)]=null;}
    const ncr={...cr};
    if(pc.type===K){if(pc.color===W){ncr.wK=false;ncr.wQ=false;}else{ncr.bK=false;ncr.bQ=false;}}
    if(mv.from===idx(7,0)||mv.to===idx(7,0))ncr.wQ=false;if(mv.from===idx(7,7)||mv.to===idx(7,7))ncr.wK=false;
    if(mv.from===idx(0,0)||mv.to===idx(0,0))ncr.bQ=false;if(mv.from===idx(0,7)||mv.to===idx(0,7))ncr.bK=false;
    const nep=(pc.type===P&&Math.abs(row(mv.to)-row(mv.from))===2)?idx((row(mv.from)+row(mv.to))>>1,col(mv.from)):-1;
    return{board:nb,cr:ncr,ep:nep};
  }

  function legalMoves(color,brd,cr,ep){
    return pseudoMoves(color,brd,cr,ep).filter(mv=>{const{board:nb}=applyMove(brd,mv,cr,ep);return!isAttacked(kingSquare(color,nb),-color,nb);});
  }

  function evaluate(brd){
    let s=0;for(let i=0;i<64;i++){const pc=brd[i];if(!pc)continue;const pi=pc.color===W?i:63-i;s+=pc.color*(PIECE_VAL[pc.type]+(PST[pc.type]?PST[pc.type][pi]:0));}return s;
  }

  function minimax(brd,depth,alpha,beta,maximizing,cr,ep){
    if(depth===0)return{score:evaluate(brd)};
    const color=maximizing?W:BL;
    const moves=legalMoves(color,brd,cr,ep);
    if(moves.length===0){const ks=kingSquare(color,brd);return isAttacked(ks,-color,brd)?{score:maximizing?-99999+depth:99999-depth}:{score:0};}
    moves.sort((a,b)=>(brd[b.to]?PIECE_VAL[brd[b.to].type]:0)-(brd[a.to]?PIECE_VAL[brd[a.to].type]:0));
    let best=null;
    for(const mv of moves){
      const{board:nb,cr:ncr,ep:nep}=applyMove(brd,mv,cr,ep);
      const{score}=minimax(nb,depth-1,alpha,beta,!maximizing,ncr,nep);
      if(best===null||(maximizing&&score>best.score)||(!maximizing&&score<best.score))best={score,move:mv};
      if(maximizing)alpha=Math.max(alpha,score);else beta=Math.min(beta,score);
      if(beta<=alpha)break;
    }
    return best;
  }

  function doAiTurn(){
    if(gameOver||aiWorking)return;
    aiWorking=true;
    if(aiTimer)clearTimeout(aiTimer);

    // Animated "AI is thinking" dots
    let dotCount=0;
    const dotFrames=['AI is thinking','AI is thinking.','AI is thinking..','AI is thinking...'];
    setStatus(dotFrames[0]);
    aiDotTimer=setInterval(()=>{ dotCount=(dotCount+1)%dotFrames.length; setStatus(dotFrames[dotCount]); },500);

    // Random think time 3–12 seconds
    const thinkMs = 3000 + Math.floor(Math.random()*9001);
    aiTimer=setTimeout(()=>{
      clearInterval(aiDotTimer);aiDotTimer=null;
      // AI plays the opposite color to the player
      const aiMaximizing = playerColor===BL; // AI is white (maximizing) when player chose black
      const result=minimax(board,aiDepth,-Infinity,Infinity,aiMaximizing,castleRights,enPassant);
      aiWorking=false;
      if(!result||!result.move){checkGameEnd();return;}
      executeMove(result.move,Q);
    },thinkMs);
  }

  // ── Piece movement animation ─────────────────────────────────
  function animatePieceMove(mv, pieceType, pieceColor, onDone) {
    const boardEl = document.getElementById('chess-board');
    const wrap = boardEl ? boardEl.closest('.chess-board-wrap') : null;
    if (!boardEl || !wrap) { onDone(); return; }

    // Map visual index → square index (accounting for flip)
    function sqToVisIdx(sq) { return flipped ? 63 - sq : sq; }

    const fromCell = boardEl.children[sqToVisIdx(mv.from)];
    const toCell   = boardEl.children[sqToVisIdx(mv.to)];
    if (!fromCell || !toCell) { onDone(); return; }

    const wrapRect  = wrap.getBoundingClientRect();
    const fromRect  = fromCell.getBoundingClientRect();
    const toRect    = toCell.getBoundingClientRect();

    // Piece size matches the square font-size
    const sqW = fromRect.width;
    const sqH = fromRect.height;

    // Start position (relative to wrap)
    const startL = fromRect.left - wrapRect.left;
    const startT = fromRect.top  - wrapRect.top;
    const endL   = toRect.left   - wrapRect.left;
    const endT   = toRect.top    - wrapRect.top;

    // Hide the real piece on the from-square during animation
    const realPiece = fromCell.querySelector('.ch-piece');
    if (realPiece) realPiece.style.visibility = 'hidden';

    // Create flying clone
    const fly = document.createElement('div');
    fly.className = 'ch-fly-piece ' + (pieceColor === W ? 'white' : 'black');
    fly.textContent = GLYPHS[pieceColor][pieceType];
    fly.style.cssText = `
      left: ${startL}px; top: ${startT}px;
      width: ${sqW}px; height: ${sqH}px;
      font-size: ${getComputedStyle(fromCell).fontSize};
    `;
    wrap.appendChild(fly);

    const isKnight = (pieceType === N);
    // Duration scales with distance, capped for snappiness
    const dist = Math.sqrt((endL-startL)**2 + (endT-startT)**2);
    const duration = Math.min(600, Math.max(300, dist * 1.6));

    function cleanup() {
      if (fly.parentNode) fly.parentNode.removeChild(fly);
      if (realPiece) realPiece.style.visibility = '';
    }

    if (isKnight) {
      // L-shape: first move vertically, then horizontally
      const midL = startL;
      const midT  = endT;
      const seg1 = Math.abs(midT - startT) / (Math.abs(midT - startT) + Math.abs(endL - midL) || 1) * duration;
      const seg2 = duration - seg1;

      // Segment 1
      fly.style.transition = `top ${seg1}ms cubic-bezier(0.4,0,0.6,1)`;
      requestAnimationFrame(() => {
        fly.style.top = midT + 'px';
        setTimeout(() => {
          // Segment 2
          fly.style.transition = `left ${seg2}ms cubic-bezier(0.4,0,0.6,1)`;
          requestAnimationFrame(() => {
            fly.style.left = endL + 'px';
            setTimeout(() => { cleanup(); onDone(); }, seg2 + 20);
          });
        }, seg1 + 10);
      });
    } else {
      // Straight line
      fly.style.transition = `left ${duration}ms cubic-bezier(0.25,0.1,0.25,1), top ${duration}ms cubic-bezier(0.25,0.1,0.25,1)`;
      requestAnimationFrame(() => {
        fly.style.left = endL + 'px';
        fly.style.top  = endT + 'px';
        setTimeout(() => { cleanup(); onDone(); }, duration + 20);
      });
    }
  }

  // Pending move state (multiplayer confirm/undo)
  let pendingMove=null; // {mv, promoType, boardSnapshot, castleSnapshot, epSnapshot, turnSnapshot, historySnapshot}

  function executeMove(mv,promoType){
    const pc=board[mv.from];if(!pc)return;
    if(mv.promo&&!promoType){promotionPending={from:mv.from,to:mv.to,color:pc.color};showPromotion(pc.color);return;}
    const finalMv={...mv,promoType:mv.promo?(promoType||Q):undefined};

    // Animate the piece travelling, then commit
    animatePieceMove(mv, pc.type, pc.color, () => {
      _commitMove(finalMv);
    });
  }

  function _commitMove(finalMv){
    const mv=finalMv;
    // In multiplayer: stage the move as pending first (show confirm/undo)
    if(isMulti&&!pendingMove){
      const boardSnap=board.slice();
      const crSnap={...castleRights};
      const epSnap=enPassant;
      const turnSnap=turn;
      const histSnap=moveHistory.slice();
      const{board:nb,cr:ncr,ep:nep}=applyMove(board,mv,castleRights,enPassant);
      board=nb;castleRights=ncr;enPassant=nep;lastMove={from:mv.from,to:mv.to};
      legalMovesCache=null;selected=-1;promotionPending=null;
      pendingMove={mv,boardSnap,crSnap,epSnap,turnSnap,histSnap};
      showPendingControls(true);
      renderBoard();
      setStatus('Confirm your move?');
      return;
    }

    // Solo or confirming pending: commit the move
    const{board:nb,cr:ncr,ep:nep}=applyMove(board,mv,castleRights,enPassant);
    board=nb;castleRights=ncr;enPassant=nep;lastMove={from:mv.from,to:mv.to};turn=-turn;legalMovesCache=null;selected=-1;promotionPending=null;
    moveHistory.push(boardFen());
    pendingMove=null;
    showPendingControls(false);
    if(isMulti) syncToFirebase();
    renderBoard();checkGameEnd();
    if(!isMulti&&!gameOver&&turn!==playerColor)setTimeout(doAiTurn,50);
  }

  function showPendingControls(show){
    const etb=document.getElementById('ch-end-turn-btn');
    const unb=document.getElementById('ch-undo-btn');
    if(etb)etb.style.display=show?'':'none';
    if(unb)unb.style.display=show?'':'none';
  }

  function confirmPendingMove(){
    if(!pendingMove)return;
    // Board is already showing the move visually — just commit it:
    // advance turn, push history, sync, hide controls
    turn=-turn;
    moveHistory.push(boardFen());
    pendingMove=null;
    showPendingControls(false);
    syncToFirebase();
    renderBoard();
    checkGameEnd();
  }

  function undoPendingMove(){
    if(!pendingMove)return;
    board=pendingMove.boardSnap;
    castleRights=pendingMove.crSnap;
    enPassant=pendingMove.epSnap;
    turn=pendingMove.turnSnap;
    moveHistory=pendingMove.histSnap;
    lastMove={from:-1,to:-1};
    legalMovesCache=null;selected=-1;
    pendingMove=null;
    showPendingControls(false);
    renderBoard();
    setStatus('Your turn');
  }

  function boardFen(){let s='';for(let i=0;i<64;i++){const pc=board[i];s+=pc?`${pc.color>0?'w':'b'}${pc.type}`:'.';}return s+turn;}

  function checkGameEnd(){
    const moves=legalMoves(turn,board,castleRights,enPassant);
    legalMovesCache=moves;
    const kSq=kingSquare(turn,board);
    const inCheck=isAttacked(kSq,-turn,board);
    const cur=boardFen();
    if(moveHistory.filter(h=>h===cur).length>=3){gameOver=true;showResult('draw','DRAW','Three-fold repetition');return;}
    if(moves.length===0){
      gameOver=true;
      if(inCheck){
        const winner=turn===W?BL:W;
        const iWon=(!isMulti&&winner===W)||(isMulti&&winner===playerColor);
        showResult(iWon?'win':'lose','CHECKMATE!',iWon?'You win by checkmate! 🎉':`${isMulti?oppName:'AI'} wins by checkmate`);
      }else showResult('draw','STALEMATE','Draw — no legal moves');
      return;
    }
    if(inCheck)setStatus(`${turn===W?'White':'Black'} is in CHECK!`);
    else if(!isMulti)setStatus(turn===playerColor?'Your turn':'AI thinking...');
    else setStatus(turn===playerColor?'Your turn':`${oppName}'s turn`);
    renderBoard();
  }

  function renderBoard(){
    const boardEl=document.getElementById('chess-board');if(!boardEl)return;
    const moves=legalMovesCache||(selected>=0?legalMoves(turn,board,castleRights,enPassant):[]);
    const hints=selected>=0?new Set(moves.filter(m=>m.from===selected).map(m=>m.to)):new Set();
    const caps=selected>=0?new Set(moves.filter(m=>m.from===selected&&board[m.to]).map(m=>m.to)):new Set();
    const kSq=kingSquare(turn,board);const inCheck=isAttacked(kSq,-turn,board);
    boardEl.innerHTML='';
    for(let vi=0;vi<64;vi++){
      const sq=flipped?63-vi:vi;const r=row(sq),c=col(sq);
      const isLight=(r+c)%2===0;
      const cell=document.createElement('div');
      cell.className='ch-sq '+(isLight?'light':'dark');
      if(sq===selected)cell.classList.add('selected');
      else if(caps.has(sq))cell.classList.add('capture-hint');
      else if(hints.has(sq))cell.classList.add('move-hint');
      if(sq===lastMove.from||sq===lastMove.to)cell.classList.add('last-move');
      if(inCheck&&sq===kSq)cell.classList.add('check-king');
      const pc=board[sq];
      if(pc){const span=document.createElement('span');span.className='ch-piece '+(pc.color===W?'white':'black');span.textContent=GLYPHS[pc.color][pc.type];cell.appendChild(span);}
      if((!flipped&&c===0)||(flipped&&c===7)){const l=document.createElement('div');l.textContent=flipped?r+1:8-r;l.style.cssText='position:absolute;top:1px;left:2px;font-size:0.42rem;font-family:monospace;opacity:0.5;pointer-events:none;color:'+(isLight?'#886644':'#f0d9b5');cell.appendChild(l);}
      if((!flipped&&r===7)||(flipped&&r===0)){const l=document.createElement('div');l.textContent='abcdefgh'[flipped?7-c:c];l.style.cssText='position:absolute;bottom:1px;right:2px;font-size:0.42rem;font-family:monospace;opacity:0.5;pointer-events:none;color:'+(isLight?'#886644':'#f0d9b5');cell.appendChild(l);}
      cell.addEventListener('click',()=>onSquareClick(sq));
      boardEl.appendChild(cell);
    }
    renderCaptures();
    // active player highlight
    const mt=document.getElementById('ch-my-tag'),ot=document.getElementById('ch-opp-tag');
    const iAmWhite=(!isMulti)||playerColor===W;
    if(mt)mt.classList.toggle('active',turn===(iAmWhite?W:BL));
    if(ot)ot.classList.toggle('active',turn===(iAmWhite?BL:W));
  }

  function renderCaptures(){
    const wP={},bP={};
    for(let i=0;i<64;i++){const pc=board[i];if(pc){if(pc.color===W)wP[pc.type]=(wP[pc.type]||0)+1;else bP[pc.type]=(bP[pc.type]||0)+1;}}
    const start={[P]:8,[N]:2,[B]:2,[R]:2,[Q]:1};
    // wCap = white's captures (black pieces taken by white)
    // bCap = black's captures (white pieces taken by black)
    let wCap='',bCap='';
    for(const t of[Q,R,B,N,P]){
      wCap+=GLYPHS[BL][t].repeat(Math.max(0,(start[t]||0)-(bP[t]||0)));
      bCap+=GLYPHS[W][t].repeat(Math.max(0,(start[t]||0)-(wP[t]||0)));
    }
    const iAmWhite=(!isMulti)||playerColor===W;
    // Topbar small display (keep for context)
    const mc=document.getElementById('ch-my-captures'),oc=document.getElementById('ch-opp-captures');
    if(mc)mc.textContent=iAmWhite?wCap:bCap;if(oc)oc.textContent=iAmWhite?bCap:wCap;
    // Big captures bar below the board
    const myBar  = document.getElementById('ch-my-cap-pieces');
    const oppBar = document.getElementById('ch-opp-cap-pieces');
    if(myBar){
      const myCaps  = iAmWhite ? wCap : bCap;
      const myClass = iAmWhite ? 'black-caps' : 'white-caps'; // I captured the opposite colour
      myBar.className  = 'ch-cap-pieces ' + myClass;
      myBar.textContent = myCaps || '—';
    }
    if(oppBar){
      const oppCaps  = iAmWhite ? bCap : wCap;
      const oppClass = iAmWhite ? 'white-caps' : 'black-caps';
      oppBar.className  = 'ch-cap-pieces ' + oppClass;
      oppBar.textContent = oppCaps || '—';
    }
  }

  function onSquareClick(sq){
    if(gameOver||promotionPending||pendingMove)return;
    if(isMulti&&turn!==playerColor)return;
    if(!isMulti&&turn!==playerColor)return;
    const pc=board[sq];
    if(selected>=0){
      const moves=legalMovesCache||legalMoves(turn,board,castleRights,enPassant);
      legalMovesCache=moves;
      const mv=moves.find(m=>m.from===selected&&m.to===sq);
      if(mv){executeMove(mv,undefined);return;}
      if(pc&&pc.color===turn){selected=sq;legalMovesCache=legalMoves(turn,board,castleRights,enPassant);renderBoard();return;}
      selected=-1;renderBoard();return;
    }
    if(pc&&pc.color===turn){selected=sq;legalMovesCache=legalMoves(turn,board,castleRights,enPassant);renderBoard();}
  }

  function showPromotion(color){
    const el=document.getElementById('ch-promotion'),choices=document.getElementById('ch-promo-choices');
    if(!el||!choices)return;
    choices.innerHTML=[Q,R,B,N].map(t=>`<button class="ch-promo-btn" onclick="CHESS.confirmPromo(${t})">${GLYPHS[color][t]}</button>`).join('');
    el.style.display='';
  }

  function showResult(cls,title,sub){
    const ov=document.getElementById('ch-overlay');if(!ov)return;
    pendingMove=null;showPendingControls(false);
    const btns=isMulti
      ?`<button class="arcade-back-btn" onclick="confirmLeave('chess')">🕹 ARCADE</button>`
      :`<button class="ch-btn" onclick="CHESS.newGame()" style="border-color:#c084fc;color:#c084fc">NEW GAME</button><button class="arcade-back-btn" onclick="confirmLeave('chess')">🕹 ARCADE</button>`;
    document.getElementById('ch-ov-title').className='ch-ov-title '+cls;
    document.getElementById('ch-ov-title').textContent=title;
    document.getElementById('ch-ov-sub').innerHTML=sub.replace(/\n/g,'<br>');
    document.getElementById('ch-ov-btns').innerHTML=btns;
    ov.classList.add('active');
    // Solo checkmate win = 1 point (win tracked as wins leaderboard)
    if (!isMulti && cls==='win' && window.HS) {
      const wins = (parseInt(localStorage.getItem('chess-wins')||'0')) + 1;
      localStorage.setItem('chess-wins', wins);
      setTimeout(() => HS.promptSubmit('chess', wins, `${wins} win${wins!==1?'s':''}`), 400);
    }
  }
  function hideOverlay(){const ov=document.getElementById('ch-overlay');if(ov)ov.classList.remove('active');}
  function setStatus(msg){const el=document.getElementById('ch-status-msg');if(el)el.textContent=msg;}

  function boardToData(){return board.map(pc=>pc?pc.color+'|'+pc.type:'0').join(',');}
  function boardFromData(str){return str.split(',').map(s=>{if(s==='0')return null;const[c,t]=s.split('|');return{color:+c,type:+t};});}

  function syncToFirebase(){
    if(!roomCode)return;
    set(ref(db,`chess/${roomCode}/state`),{board:boardToData(),turn,castleRights,enPassant,lastFrom:lastMove.from,lastTo:lastMove.to,gameOver,lastMover:playerColor}).catch(()=>{});
  }

  function listenFirebase(){
    const unsub=onValue(ref(db,`chess/${roomCode}/state`),snap=>{
      if(!snap.exists())return;
      const d=snap.val();
      // Only skip if this is our own write AND it's still our turn (prevents echo)
      if(d.turn===playerColor&&d.lastMover===playerColor)return;

      // Animate the opponent's piece travelling before we apply the new board state
      const fromSq = d.lastFrom??-1;
      const toSq   = d.lastTo??-1;
      const oppPiece = (fromSq>=0&&toSq>=0) ? board[fromSq] : null;

      function applyRemoteState(){
        board=boardFromData(d.board);turn=d.turn;castleRights=d.castleRights;enPassant=d.enPassant??-1;
        lastMove={from:fromSq,to:toSq};gameOver=d.gameOver??false;legalMovesCache=null;selected=-1;
        pendingMove=null;
        const etb=document.getElementById('ch-end-turn-btn');if(etb)etb.style.display='none';
        const unb=document.getElementById('ch-undo-btn');if(unb)unb.style.display='none';
        renderBoard();if(!gameOver)checkGameEnd();
      }

      if(oppPiece&&fromSq>=0&&toSq>=0&&fromSq!==toSq){
        animatePieceMove({from:fromSq,to:toSq},oppPiece.type,oppPiece.color,applyRemoteState);
      } else {
        applyRemoteState();
      }
    });
    unsubs.push(unsub);
    const abUnsub=watchForAbandoned(`chess/${roomCode}`,()=>{showAbandonedNotice(()=>{destroy();backToGameSelect();});});
    unsubs.push(abUnsub);
  }

  function updateNameTags(){
    const iAmWhite=(!isMulti&&playerColor===W)||(isMulti&&playerColor===W);
    const md=document.getElementById('ch-my-color-dot'),od=document.getElementById('ch-opp-color-dot');
    if(md){md.textContent='●';md.className='ch-tag-color '+(iAmWhite?'white':'black');}
    if(od){od.textContent='●';od.className='ch-tag-color '+(iAmWhite?'black':'white');}
    const mn=document.getElementById('ch-my-name'),on=document.getElementById('ch-opp-name');
    if(mn)mn.textContent=myName;if(on)on.textContent=oppName;
    // Set WHITE/BLACK labels
    const ml=document.getElementById('ch-my-color-label'),ol=document.getElementById('ch-opp-color-label');
    if(ml)ml.textContent=iAmWhite?'WHITE':'BLACK';
    if(ol)ol.textContent=iAmWhite?'BLACK':'WHITE';
    flipped=!iAmWhite;
  }

  let preSelectedDiff = 3; // default medium
  let preSelectedColor = W; // default white

  return {
    initSolo(){
      isMulti=false;roomCode=null;playerColor=W;myName='YOU';oppName='ACE (AI)';
      // Show pre-game selection overlay
      preSelectedDiff = aiDepth;
      preSelectedColor = W;
      // Reset pre-screen button states
      const pd = document.getElementById('ch-prestart-overlay');
      if(pd) pd.classList.add('active');
      // Sync diff buttons
      [['easy',1],['med',3],['hard',5]].forEach(([n,v])=>{
        const b=document.getElementById(`ch-pre-${n}`);
        if(b)b.className='ch-pre-diff-btn'+(preSelectedDiff===v?' active':'');
      });
      // Sync color buttons
      const wb=document.getElementById('ch-pre-white'),bb=document.getElementById('ch-pre-black');
      if(wb)wb.className='ch-pre-color-btn active';
      if(bb)bb.className='ch-pre-color-btn';
      const cw=document.getElementById('chat-chess');if(cw)cw.style.display='none';
      showHeaderLeave('chess');
      // Render empty board in background
      initBoard();renderBoard();
    },
    startFromPrescreen(){
      // Apply selections and start
      aiDepth = preSelectedDiff;
      playerColor = preSelectedColor;
      const iAmWhite = playerColor===W;
      if(!iAmWhite){ myName='YOU'; oppName='ACE (AI)'; flipped=true; }
      else { myName='YOU'; oppName='ACE (AI)'; flipped=false; }
      initBoard();aiWorking=false;
      updateNameTags();hideOverlay();
      // Hide pre-screen
      const pd=document.getElementById('ch-prestart-overlay');if(pd)pd.classList.remove('active');
      legalMovesCache=legalMoves(W,board,castleRights,enPassant);
      renderBoard();
      if(iAmWhite){ setStatus('Your turn (White)'); }
      else { setStatus('AI thinking...'); setTimeout(doAiTurn,300); }
    },
    preSetDiff(d){
      preSelectedDiff=d;
      [['easy',1],['med',3],['hard',5]].forEach(([n,v])=>{
        const b=document.getElementById(`ch-pre-${n}`);
        if(b)b.className='ch-pre-diff-btn'+(d===v?' active':'');
      });
    },
    preSetColor(c){
      preSelectedColor=c;
      const wb=document.getElementById('ch-pre-white'),bb=document.getElementById('ch-pre-black');
      if(wb)wb.className='ch-pre-color-btn'+(c===W?' active':'');
      if(bb)bb.className='ch-pre-color-btn'+(c===BL?' active':'');
    },
    destroy(){
      if(aiTimer){clearTimeout(aiTimer);aiTimer=null;}
      if(aiDotTimer){clearInterval(aiDotTimer);aiDotTimer=null;}
      unsubs.forEach(u=>typeof u==='function'&&u());unsubs=[];
      aiWorking=false;gameOver=true;pendingMove=null;hideOverlay();
      const el=document.getElementById('ch-promotion');if(el)el.style.display='none';
      const pd=document.getElementById('ch-prestart-overlay');if(pd)pd.classList.remove('active');
      showPendingControls(false);
    },
    get roomCode(){return roomCode;},
    flipBoard(){flipped=!flipped;renderBoard();},
    setDiff(d){
      aiDepth=d;
      [['easy',1],['med',3],['hard',5]].forEach(([n,v])=>{const b=document.getElementById(`ch-diff-${n}`);if(b)b.className='ch-diff-btn'+(d===v?' active':'');});
    },
    newGame(){
      // Show pre-screen again for new game
      hideOverlay();
      preSelectedDiff=aiDepth;
      preSelectedColor=W;
      const pd=document.getElementById('ch-prestart-overlay');if(pd)pd.classList.add('active');
      [['easy',1],['med',3],['hard',5]].forEach(([n,v])=>{
        const b=document.getElementById(`ch-pre-${n}`);
        if(b)b.className='ch-pre-diff-btn'+(preSelectedDiff===v?' active':'');
      });
      const wb=document.getElementById('ch-pre-white'),bb=document.getElementById('ch-pre-black');
      if(wb)wb.className='ch-pre-color-btn active';
      if(bb)bb.className='ch-pre-color-btn';
      initBoard();renderBoard();
    },
    confirmPromo(type){
      if(!promotionPending)return;
      const el=document.getElementById('ch-promotion');if(el)el.style.display='none';
      const mv={from:promotionPending.from,to:promotionPending.to,promo:true,promoType:type};
      promotionPending=null;executeMove(mv,type);
    },
    confirmMove(){ confirmPendingMove(); },
    undoMove(){ undoPendingMove(); },
    launchMulti(isHost,myN,oppN,code){
      isMulti=true;roomCode=code;playerColor=isHost?W:BL;myName=myN;oppName=oppN;
      initBoard();aiWorking=false;
      updateNameTags();hideOverlay();
      const pd=document.getElementById('ch-prestart-overlay');if(pd)pd.classList.remove('active');
      const sc=document.getElementById('ch-solo-controls');if(sc)sc.style.display='none';
      const etb=document.getElementById('ch-end-turn-btn');if(etb)etb.style.display='none';
      // Show chat — clear any inline style override from solo mode
      const cw=document.getElementById('chat-chess');
      if(cw){cw.style.display='';} 
      showHeaderLeave('chess');
      chatInit('chess',`chess/${code}/chat`,myN);
      if(isHost){syncToFirebase();setStatus('Your turn (White)');}
      else setStatus(`${oppName}'s turn (White)...`);
      legalMovesCache=legalMoves(turn,board,castleRights,enPassant);
      renderBoard();listenFirebase();
    },
  };
})();

function chessLaunchFromLobby(isHost,myName,oppName,gameCode){
  document.getElementById('main-title').textContent='♟ CHESS';
  document.getElementById('main-subtitle').textContent='CHESS — ONLINE';
  document.getElementById('header-room-code').textContent=gameCode;
  document.getElementById('room-code-display').style.display='';
  showScreen('chess-screen');
  CHESS.launchMulti(isHost,myName,oppName,gameCode);
}

// ???????????????????????????????????????????????????????????
// ============================================================
// PER-GAME MULTIPLAYER LOBBY SYSTEM
// ============================================================

const GAME_META = {
  battleships: { icon:'🚢', name:'BATTLESHIPS', accent:'#00d4ff' },
  pool:        { icon:'🎱', name:'POOL',        accent:'#22c55e' },
  scrabble:    { icon:'🔤', name:'SCRABBLE',    accent:'#a855f7' },
  hangman:     { icon:'🪢', name:'HANGMAN',     accent:'#06b6d4' },
  trivia:      { icon:'🧠', name:'TRIVIA',      accent:'#f97316' },
  connectfour: { icon:'🔴', name:'CONNECT FOUR',accent:'#f43f5e' },
  poker:       { icon:'🃏', name:'POKER',       accent:'#10b981' },
  chess:       { icon:'♟',  name:'CHESS',       accent:'#c084fc' },
  tron:        { icon:'⚡', name:'TRON',        accent:'#00ffff' },
  pokemon:     { icon:'⚡', name:'POKÉMON',     accent:'#ef4444' },
  uno:         { icon:'🃏', name:'UNO',         accent:'#f97316' },
};

const ML = {
  game: null,       // which game this lobby is for
  lobbyId: null,    // Firebase key under perGameLobbies/{game}
  isHost: false,
  playerName: '',
  unsubs: [],
  listUnsub: null,
};

// ── Entry point ───────────────────────────────────────────────
window.openMultiLobby = function(game) {
  ML.game = game;
  ML.lobbyId = null;
  ML.isHost = false;
  ML.playerName = '';
  ML.unsubs.forEach(u => typeof u === 'function' && u());
  ML.unsubs = [];

  const meta = GAME_META[game];
  document.getElementById('main-title').textContent    = meta.icon + ' ' + meta.name;
  document.getElementById('main-subtitle').textContent = meta.name + ' — MULTIPLAYER';
  document.getElementById('ml-title').textContent      = meta.icon + ' ' + meta.name + ' MULTIPLAYER';
  document.getElementById('ml-host-btn').style.borderColor = meta.accent;
  document.getElementById('ml-host-btn').style.background  = meta.accent;
  document.getElementById('ml-host-btn').style.color       = '#000';

  // Reset UI
  document.getElementById('ml-entry').style.display = '';
  document.getElementById('ml-room').style.display  = 'none';
  mlSetStatus('', '');

  showScreen('multi-lobby-screen');
  mlListStart();
};

// ── Status helper ─────────────────────────────────────────────
function mlSetStatus(msg, type) {
  const el = document.getElementById('ml-status');
  el.style.display = msg ? '' : 'none';
  el.className = 'status-bar ' + (type || '');
  el.textContent = msg;
}

// ── Live lobby list ───────────────────────────────────────────
function mlListStart() {
  const listEl = document.getElementById('ml-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="lobby-list-loading">SCANNING—</div>';

  if (ML.listUnsub) { ML.listUnsub(); ML.listUnsub = null; }

  const doStart = () => {
    ML.listUnsub = onValue(ref(db, `perGameLobbies/${ML.game}`), snap => {
      const listEl = document.getElementById('ml-list');
      if (!listEl) return;

      if (!snap.exists()) {
        listEl.innerHTML = '<div class="lobby-list-empty">NO OPEN GAMES — HOST ONE!</div>';
        return;
      }

      const all = snap.val();
      const open = Object.entries(all).filter(([id, lobby]) =>
        lobby.status === 'waiting' && !lobby.guest
      );

      if (open.length === 0) {
        listEl.innerHTML = '<div class="lobby-list-empty">NO OPEN GAMES — HOST ONE!</div>';
        return;
      }

      const dot = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 5px #22c55e;margin-right:5px;vertical-align:middle"></span>';
      listEl.innerHTML = open.map(([id, lobby]) =>
        `<div class="lobby-row">
          <div class="lobby-row-info">
            <div class="lobby-row-host">${dot}${lobby.hostName}</div>
            <div class="lobby-row-meta" style="color:var(--dim);font-size:0.6rem;letter-spacing:0.1em">WAITING FOR PLAYER 2</div>
          </div>
          <div class="lobby-row-players">1/2</div>
          <button class="lobby-join-btn" onclick="mlJoin('${id}')">JOIN ▶</button>
        </div>`
      ).join('');
    });
  };

  if (window._firebaseReady) doStart();
  else window.addEventListener('firebaseReady', doStart, { once: true });
}

function mlListStop() {
  if (ML.listUnsub) { ML.listUnsub(); ML.listUnsub = null; }
}

// ── Host ──────────────────────────────────────────────────────
window.mlHost = async function() {
  if (!window._firebaseReady) {
    mlSetStatus('CONNECTING—', '');
    await new Promise(r => window.addEventListener('firebaseReady', r, { once: true }));
  }
  const name = (document.getElementById('ml-name').value.trim().toUpperCase() || 'HOST');
  ML.playerName = name;
  ML.isHost = true;

  mlSetStatus('CREATING GAME—', '');
  mlListStop();

  // Push a new lobby entry
  const lobbyRef = push(ref(db, `perGameLobbies/${ML.game}`));
  ML.lobbyId = lobbyRef.key;

  await set(lobbyRef, {
    status: 'waiting',
    hostName: name,
    guest: null,
    gameCode: null,
    created: Date.now(),
  });

  // Auto-delete when host disconnects
  onDisconnect(lobbyRef).remove();

  mlSetStatus('', '');
  mlShowRoom();
  mlListen();
};

// ── Join ──────────────────────────────────────────────────────
window.mlJoin = async function(lobbyId) {
  if (!window._firebaseReady) {
    mlSetStatus('CONNECTING—', '');
    await new Promise(r => window.addEventListener('firebaseReady', r, { once: true }));
  }
  const name = (document.getElementById('ml-name').value.trim().toUpperCase() || 'GUEST');
  ML.playerName = name;
  ML.isHost = false;
  ML.lobbyId = lobbyId;

  mlSetStatus('JOINING—', '');

  const snap = await get(ref(db, `perGameLobbies/${ML.game}/${lobbyId}`));
  if (!snap.exists()) { mlSetStatus('GAME NO LONGER AVAILABLE', 'error'); mlListStart(); return; }
  const lobby = snap.val();
  if (lobby.status !== 'waiting' || lobby.guest) { mlSetStatus('GAME ALREADY FULL', 'error'); mlListStart(); return; }

  // Generate game code here
  const gameCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  await update(ref(db, `perGameLobbies/${ML.game}/${lobbyId}`), {
    guest: { name },
    status: 'launching',
    gameCode,
  });

  mlSetStatus('', '');
  mlListStop();
  mlShowRoom();

  // Guest launches immediately — build fullLobby locally to avoid
  // a race condition where the host deletes the lobby before a
  // second get() resolves, which would return null and crash launch.
  const fullLobby = { ...lobby, guest: { name }, status: 'launching', gameCode };
  mlLaunch(fullLobby);
};

// ── Waiting room UI ───────────────────────────────────────────
function mlShowRoom() {
  document.getElementById('ml-entry').style.display = 'none';
  document.getElementById('ml-room').style.display  = '';
  mlRenderPlayers(null);
}

function mlRenderPlayers(lobby) {
  const el = document.getElementById('ml-players');
  if (!el) return;
  const hostName  = lobby ? lobby.hostName : ML.playerName;
  const guestName = lobby && lobby.guest ? lobby.guest.name : null;
  el.innerHTML = [
    { num:1, name: hostName,  badge:'<span class="slot-badge host">HOST</span>' },
    { num:2, name: guestName, badge: guestName ? '<span class="slot-badge guest">GUEST</span>' : '<span class="slot-badge waiting">WAITING...</span>' },
  ].map(r => `<div class="lobby-player-row">
    <span class="slot-num">${r.num}.</span>
    <span class="slot-name">${r.name || '—'}</span>
    ${r.badge}
  </div>`).join('');
}

// ── Firebase listener (host only — guest launches immediately) ───────────────
function mlListen() {
  if (!ML.isHost) return;
  let _launched = false;
  const unsub = onValue(ref(db, `perGameLobbies/${ML.game}/${ML.lobbyId}`), snap => {
    if (_launched) return;
    const lobby = snap.exists() ? snap.val() : null;

    if (lobby) mlRenderPlayers(lobby);

    const msg = document.getElementById('ml-waiting-msg');
    if (!lobby || lobby.status === 'waiting') {
      if (msg) msg.innerHTML = '⏳ WAITING FOR PLAYER 2<span class="waiting-dots"></span>';
    } else if (lobby.status === 'launching') {
      _launched = true;
      if (msg) msg.textContent = '✅ PLAYER 2 JOINED — LAUNCHING...';
      unsub();
      ML.unsubs = ML.unsubs.filter(u => u !== unsub);
      mlLaunch(lobby);
    }
  });
  ML.unsubs.push(unsub);
}

// ── Launch game ───────────────────────────────────────────────
function mlLaunch(lobby) {
  // Clean up all lobby listeners
  ML.unsubs.forEach(u => typeof u === 'function' && u());
  ML.unsubs = [];
  mlListStop();

  // Only host deletes the lobby — this ensures the host's onValue fires on
  // the 'launching' status before the document is removed (avoids race condition
  // where guest deletes lobby before host listener sees the 'launching' status)
  if (ML.isHost) {
    try { remove(ref(db, `perGameLobbies/${ML.game}/${ML.lobbyId}`)); } catch(e) {}
  }

  const isHost   = ML.isHost;
  const myName   = ML.playerName;
  const oppName  = isHost ? lobby.guest.name : lobby.hostName;
  const gameCode = lobby.gameCode;
  const game     = ML.game;

  // Reuse slLaunchGame by building a compatible room object
  const room = {
    player1:  { name: isHost ? myName : oppName },
    player2:  { name: isHost ? oppName : myName },
    gameCode,
    selectedGame: game,
  };

  // Temporarily set SL fields so slLaunchGame works unchanged
  SL.isHost      = isHost;
  SL.playerName  = myName;
  SL.code        = null;

  slLaunchGame(game, room);
}

// ── Back ──────────────────────────────────────────────────────
window.mlBack = async function() {
  // If host with open lobby, remove it
  if (ML.isHost && ML.lobbyId) {
    try { await remove(ref(db, `perGameLobbies/${ML.game}/${ML.lobbyId}`)); } catch(e) {}
  }
  ML.unsubs.forEach(u => typeof u === 'function' && u());
  ML.unsubs = [];
  mlListStop();
  ML.lobbyId = null;
  ML.isHost  = false;
  backToGameSelect();
};

// ── Keep showSharedLobby as no-op alias for safety ───────────────────────────
window.showSharedLobby = function() { backToGameSelect(); };
window.sharedLobbyBack = function() { backToGameSelect(); };

// Legacy SL object still used by slLaunchGame
const SL = {
  code: null,
  isHost: false,
  playerName: '',
  unsubs: [],
};
function slSetStatus() {}  // no-op — ML has its own status

</script>

<!-- ═══════════════════════════════════════════════════════════
     ARCADE PARTICLE ENGINE + GRAPHICS ENHANCEMENTS v3
     Particle effects, screen flashes, star fields, trails,
     explosions, and canvas post-processing for all games.
     ═══════════════════════════════════════════════════════════ -->
<canvas id="fx-canvas" style="
  position:fixed;top:0;left:0;width:100%;height:100%;
  pointer-events:none;z-index:9990;
  will-change:transform;
"></canvas>

<script>
// ╔══════════════════════════════════════════════════════════════╗
// ║  GLOBAL FX ENGINE                                           ║
// ╚══════════════════════════════════════════════════════════════╝
export default (() => {
  const canvas = document.getElementById('fx-canvas');
  const ctx    = canvas.getContext('2d');
  let W = 0, H = 0;
  let particles = [];
  let stars     = [];
  let screenShake = { x:0, y:0, mag:0, decay:0.85 };
  let flashAlpha  = 0;
  let flashColor  = '#ffffff';
  let raf = null;
  let active = false;

  // ── Resize ────────────────────────────────────────────────────
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Star field ────────────────────────────────────────────────
  function initStars(n = 120) {
    stars = Array.from({length: n}, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.2,
      speed: Math.random() * 0.3 + 0.05,
      alpha: Math.random() * 0.6 + 0.1,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.04 + 0.01,
    }));
  }
  initStars();

  function drawStars() {
    // Batch by pre-bucketed alpha to reduce draw calls
    const buckets = {};
    stars.forEach(s => {
      s.twinkle += s.twinkleSpeed;
      const a = Math.round(s.alpha * (0.6 + 0.4 * Math.sin(s.twinkle)) * 10) / 10;
      const key = a.toFixed(1);
      if (!buckets[key]) buckets[key] = { a, paths: [] };
      buckets[key].paths.push(s);
    });
    Object.values(buckets).forEach(({ a, paths }) => {
      ctx.fillStyle = `rgba(180,220,255,${a})`;
      ctx.beginPath();
      paths.forEach(s => { ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y,Math.max(0,s.r), 0, Math.PI*2); });
      ctx.fill();
    });
  }

  // ── Particle spawn ─────────────────────────────────────────────
  function burst(x, y, {
    count=20, colors=['#00f5ff','#ff2d78','#ffe600'],
    speed=3, spread=Math.PI*2, angle=0,
    life=60, size=3, gravity=0.12, fade=true,
    shape='circle', // 'circle' | 'spark' | 'square' | 'star'
  }={}) {
    for (let i=0; i<count; i++) {
      const a = angle - spread/2 + Math.random()*spread;
      const spd = speed * (0.4 + Math.random()*0.8);
      particles.push({
        x, y,
        vx: Math.cos(a)*spd,
        vy: Math.sin(a)*spd - (Math.random()*speed*0.3),
        color: colors[Math.floor(Math.random()*colors.length)],
        life: life * (0.7+Math.random()*0.6),
        maxLife: life,
        size: size * (0.5+Math.random()*0.8),
        gravity, fade, shape,
        rotation: Math.random()*Math.PI*2,
        rotSpeed: (Math.random()-0.5)*0.3,
      });
    }
    if (!active) startLoop();
  }

  function spark(x, y, color='#00f5ff', count=8) {
    burst(x, y, {count, colors:[color,'#ffffff',color], speed:5, life:30, size:2, gravity:0.05, shape:'spark'});
  }

  function explosion(x, y, colors=['#ff6a00','#ff2d78','#ffe600','#ffffff']) {
    burst(x, y, {count:40, colors, speed:6, life:70, size:4, gravity:0.15, shape:'circle'});
    burst(x, y, {count:16, colors:['#ffffff'], speed:9, life:25, size:2, gravity:0.08, shape:'spark'});
    screenFlash(colors[0], 0.25, 8);
    shake(6);
  }

  function confetti(x, y, colors=['#00f5ff','#ff2d78','#ffe600','#39ff14','#bf00ff']) {
    burst(x, y, {count:60, colors, speed:7, spread:Math.PI*2, life:90, size:5, gravity:0.2, shape:'square'});
  }

  function trail(x, y, color, size=2) {
    particles.push({
      x: x + (Math.random()-0.5)*4,
      y: y + (Math.random()-0.5)*4,
      vx: (Math.random()-0.5)*0.5,
      vy: (Math.random()-0.5)*0.5,
      color, size, life: 20, maxLife: 20,
      gravity: 0, fade: true, shape: 'circle', rotation:0, rotSpeed:0,
    });
    if (!active) startLoop();
  }

  // ── Screen effects ─────────────────────────────────────────────
  function screenFlash(color='#ffffff', intensity=0.4, dur=6) {
    flashColor = color;
    flashAlpha = intensity;
    if (!active) startLoop();
  }

  function shake(magnitude=8) {
    screenShake.mag = magnitude;
    screenShake.x   = 0;
    screenShake.y   = 0;
    const el = document.querySelector('.screen.active');
    if (el) {
      el.style.transition = 'transform 0s';
      let mag = magnitude;
      const doShake = () => {
        if (mag < 0.5) { el.style.transform = ''; return; }
        el.style.transform = `translate(${(Math.random()-0.5)*mag}px, ${(Math.random()-0.5)*mag}px)`;
        mag *= screenShake.decay;
        requestAnimationFrame(doShake);
      };
      requestAnimationFrame(doShake);
    }
  }

  // ── Draw one particle ──────────────────────────────────────────
  function drawParticle(p) {
    const t = p.life / p.maxLife;
    const alpha = p.fade ? t : 1;
    const s = p.size * (p.shape === 'spark' ? t : (0.3 + t*0.7));
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    // No shadowBlur — use a cheap radial gradient halo instead (10x faster)
    ctx.fillStyle = p.color;

    if (p.shape === 'spark') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.5, s * 0.3);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx*4, p.y - p.vy*4);
      ctx.stroke();
      // Soft glow dot at tip
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(0.01, s * 2.5));
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.max(0, alpha * 0.4);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y,Math.max(0,s * 2.5), 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
    } else if (p.shape === 'square') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      // Soft halo behind square
      ctx.globalAlpha = Math.max(0, alpha * 0.3);
      ctx.fillStyle = p.color;
      ctx.fillRect(-s, -s, s*2, s*2);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillRect(-s/2, -s/2, s, s);
    } else if (p.shape === 'star') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      const pts = 5, ir = s*0.4, or2 = s;
      ctx.beginPath();
      for (let i=0; i<pts*2; i++) {
        const r2 = i%2===0 ? or2 : ir;
        const a2 = (i*Math.PI)/pts;
        i===0 ? ctx.moveTo(Math.cos(a2)*r2, Math.sin(a2)*r2)
              : ctx.lineTo(Math.cos(a2)*r2, Math.sin(a2)*r2);
      }
      ctx.closePath(); ctx.fill();
    } else {
      // Circle: draw a larger semi-transparent halo first, then the core
      const glowR = s * 2.2;
      const grad = ctx.createRadialGradient(p.x, p.y, Math.max(0.01, s * 0.3), p.x, p.y, Math.max(0.02, glowR));
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.max(0, alpha * 0.35);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.01, glowR), 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, s), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Main loop ──────────────────────────────────────────────────
  let _cachedScreenId = '';
  let _lastScreenCheck = 0;
  let _fxTickLast = 0;
  function tick(ts) {
    // Pause when tab is hidden — don't burn CPU or keep browser spinner active
    if (document.hidden) { raf = requestAnimationFrame(tick); return; }
    // Delta-time so particle physics is frame-rate independent
    const _dt = Math.min((ts - (_fxTickLast || ts)) / (1000/60), 3);
    _fxTickLast = ts;

    ctx.clearRect(0, 0, W, H);

    // Cache screen check (re-check every 500ms max instead of every frame)
    const now = Date.now();
    if (now - _lastScreenCheck > 500) {
      const screen = document.querySelector('.screen.active');
      _cachedScreenId = screen ? screen.id : '';
      _lastScreenCheck = now;
    }
    const showStars = _cachedScreenId === 'game-select-screen' || !_cachedScreenId;
    if (showStars) drawStars();

    // Flash
    if (flashAlpha > 0.01) {
      ctx.fillStyle = flashColor;
      ctx.globalAlpha = flashAlpha;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      flashAlpha *= Math.pow(0.75, _dt);
    }

    // Update + draw particles — swap-and-pop O(1) removal (no re-indexing)
    for (let _i = particles.length - 1; _i >= 0; _i--) {
      if (particles[_i].life <= 0) {
        particles[_i] = particles[particles.length - 1];
        particles.pop();
      }
    }
    for (const p of particles) {
      p.x  += p.vx * _dt;
      p.y  += p.vy * _dt;
      p.vy += p.gravity * _dt;
      p.vx *= Math.pow(0.97, _dt);
      p.life -= _dt;
      p.rotation += p.rotSpeed * _dt;
      drawParticle(p);
    }

    // Use a higher threshold so flashAlpha decays to zero quickly
    if (flashAlpha < 0.02) flashAlpha = 0;
    active = particles.length > 0 || flashAlpha > 0;
    if (active) raf = requestAnimationFrame(tick);
    else { raf = null; ctx.clearRect(0,0,W,H); }
  }

  function startLoop() {
    active = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // ── Star loop — only ticks while on game-select, self-stops otherwise ──
  let starRaf = null;
  function starLoop() {
    // Stop if tab hidden or not on home screen
    if (document.hidden) { starRaf = requestAnimationFrame(starLoop); return; }
    const screen = document.querySelector('.screen.active');
    const screenId = screen ? screen.id : 'game-select-screen';
    if (screenId !== 'game-select-screen') {
      starRaf = null;
      ctx.clearRect(0, 0, W, H);
      return; // stop — a game screen is active
    }
    ctx.clearRect(0, 0, W, H);
    drawStars();
    starRaf = requestAnimationFrame(starLoop);
  }

  function startStarLoop() {
    if (!starRaf) starRaf = requestAnimationFrame(starLoop);
  }

  function stopStarLoop() {
    if (starRaf) { cancelAnimationFrame(starRaf); starRaf = null; }
    ctx.clearRect(0, 0, W, H);
  }

  // ── Clear — kill all live particles immediately (call when leaving a game) ──
  function clear() {
    particles = [];
    flashAlpha = 0;
    active = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    ctx.clearRect(0, 0, W, H);
  }

  // Kick off star field on load and whenever we return to game-select
  document.addEventListener('DOMContentLoaded', () => { clear(); startStarLoop(); });
  // Also start immediately if DOM already ready
  if (document.readyState !== 'loading') { clear(); startStarLoop(); }

  return { burst, spark, explosion, confetti, trail, screenFlash, shake, startLoop, startStarLoop, stopStarLoop, clear };
})();

// Star field is handled by the FX engine's tick() + starLoop() above.

// ── Tab visibility: pause canvas games when hidden, resume when visible ──────
(function() {
  let _wasRunning = {};

  const PAUSEABLE_GAMES = [
    { id:'tetris-screen',        obj:()=>window.TET,  fn:'togglePause' },
    { id:'snake-screen',         obj:()=>window.SNK,  fn:'togglePause' },
    { id:'puzzlebobble-screen',  obj:()=>window.PB,   fn:'togglePause' },
    { id:'bubblebreaker-screen', obj:()=>window.BB,   fn:'togglePause' },
    { id:'zuma-screen',          obj:()=>window.ZM,   fn:'togglePause' },
    { id:'racer-screen',         obj:()=>window.RC,   fn:'togglePause' },
    { id:'pacman-screen',        obj:()=>window.PAC,  fn:'togglePause' },
    { id:'tron-screen',           obj:()=>window.TRON, fn:'pause' },
  ];

  // Escape key → pause the active single-player game
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;
    for (const g of PAUSEABLE_GAMES) {
      if (activeScreen.id !== g.id) continue;
      const obj = g.obj();
      if (obj && typeof obj[g.fn] === 'function') {
        try { obj[g.fn](); } catch(err) {}
      }
      break;
    }
  });

  // Window blur → pause when user clicks outside the browser window
  function pauseActive() {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;
    for (const g of PAUSEABLE_GAMES) {
      if (activeScreen.id !== g.id) continue;
      const obj = g.obj();
      if (!obj || typeof obj[g.fn] !== 'function') break;
      try {
        const wasP = obj.isPaused ? obj.isPaused() : false;
        if (!wasP) { obj[g.fn](); _wasRunning[g.id] = true; }
      } catch(e) {}
      break;
    }
  }

  function resumeActive() {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;
    for (const g of PAUSEABLE_GAMES) {
      if (activeScreen.id !== g.id) continue;
      if (!_wasRunning[g.id]) break;
      const obj = g.obj();
      if (!obj || typeof obj[g.fn] !== 'function') break;
      try { obj[g.fn](); } catch(e) {}
      delete _wasRunning[g.id];
      break;
    }
  }

  window.addEventListener('blur', pauseActive);
  window.addEventListener('focus', resumeActive);

  document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;
    for (const g of PAUSEABLE_GAMES) {
      if (!activeScreen.id.includes(g.id.replace('-screen','')) && activeScreen.id !== g.id) continue;
      const obj = g.obj();
      if (!obj || typeof obj[g.fn] !== 'function') continue;
      if (hidden) {
        try { const wasP = obj.isPaused ? obj.isPaused() : false;
          if (!wasP) { obj[g.fn](); _wasRunning[g.id] = true; } } catch(e){}
      } else {
        if (_wasRunning[g.id]) {
          try { obj[g.fn](); } catch(e){}
          delete _wasRunning[g.id];
        }
      }
    }
  });
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  SNAKE — PARTICLE INTEGRATION                               ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchSnake() {
  // Wait for SNK to be defined
  const origTick = (() => {
    const wait = setInterval(() => {
      if (!window.SNK) return;
      clearInterval(wait);

      // Patch food-eat → burst of particles
      const origNewGame = window.snkNewGame;
      // We intercept via a MutationObserver on the score display
      let lastScore = 0;
      let lastLen   = 0;

      const scoreEl  = document.getElementById('snk-score');
      const lengthEl = document.getElementById('snk-length');
      if (!scoreEl) return;

      const obs = new MutationObserver(() => {
        const newScore  = parseInt(scoreEl.textContent||'0');
        const newLen    = parseInt((lengthEl||{}).textContent||'0');
        if (newScore > lastScore) {
          // Food eaten — find food position via canvas center guess (approximate)
          const canvas = document.getElementById('snk-canvas');
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            // Burst at center of canvas as food position varies
            const cx = rect.left + rect.width/2 + (Math.random()-0.5)*rect.width*0.6;
            const cy = rect.top  + rect.height/2 + (Math.random()-0.5)*rect.height*0.6;
            FX.burst(cx, cy, {
              count: 18,
              colors: ['#ff2d78','#ff6a00','#ffe600','#ffffff'],
              speed: 5, life: 45, size: 3, gravity: 0.15, shape: 'spark',
            });
          }
          lastScore = newScore;
        }
        lastLen = newLen;
      });
      obs.observe(scoreEl, {childList:true, characterData:true, subtree:true});
    }, 200);
  })();
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  TETRIS — LINE CLEAR PARTICLES                              ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchTetris() {
  const wait = setInterval(() => {
    const scoreEl = document.getElementById('tet-score');
    const linesEl = document.getElementById('tet-lines');
    if (!scoreEl || !linesEl) return;
    clearInterval(wait);

    let lastLines = 0;
    const obs = new MutationObserver(() => {
      const newLines = parseInt(linesEl.textContent||'0');
      if (newLines > lastLines) {
        const canvas = document.getElementById('tet-canvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const cleared = newLines - lastLines;
          // Horizontal sweep burst across the canvas
          for (let i=0; i<8; i++) {
            const px = rect.left + (i/7)*rect.width;
            const py = rect.top  + rect.height*0.5;
            FX.burst(px, py, {
              count: cleared >= 4 ? 20 : 10,
              colors: cleared >= 4
                ? ['#ffe600','#ff2d78','#00f5ff','#39ff14','#bf00ff']
                : ['#00f5ff','#ffe600','#ffffff'],
              speed: 6, life: 55, size: 4, gravity: 0.18, shape: 'square',
            });
          }
          if (cleared >= 4) {
            FX.screenFlash('#00f5ff', 0.35, 8);
            FX.shake(8);
          } else {
            FX.screenFlash('#4169ff', 0.15, 5);
          }
        }
        lastLines = newLines;
      }
    });
    obs.observe(linesEl, {childList:true, characterData:true, subtree:true});
  }, 300);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  HANGMAN — WRONG GUESS SPARKS + WIN CONFETTI               ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchHangman() {
  const wait = setInterval(() => {
    const statusEl = document.getElementById('hm-status-msg');
    if (!statusEl) return;
    clearInterval(wait);

    // Watch keyboard clicks
    document.addEventListener('click', (e) => {
      const key = e.target.closest('.hm-key');
      if (!key) return;
      // Determine hit or miss from classes applied after click
      setTimeout(() => {
        const rect = key.getBoundingClientRect();
        const cx = rect.left + rect.width/2;
        const cy = rect.top  + rect.height/2;
        if (key.classList.contains('hit')) {
          FX.burst(cx, cy, {count:20, colors:['#39ff14','#00f5ff','#ffe600'], speed:5, life:40, size:3, shape:'spark'});
          FX.screenFlash('#39ff14', 0.1);
        } else if (key.classList.contains('miss')) {
          FX.burst(cx, cy, {count:12, colors:['#ff2d78','#ff6a00'], speed:3, life:30, size:2, shape:'spark'});
          FX.shake(4);
        }
      }, 50);
    });

    // Watch for win overlay
    const hmOverlay = document.getElementById('hm-overlay');
    if (hmOverlay) {
      const ovObs = new MutationObserver(() => {
        if (hmOverlay.classList.contains('active')) {
          const titleEl = document.getElementById('hm-ov-title');
          if (titleEl && titleEl.classList.contains('win')) {
            const canvas = document.getElementById('hm-canvas');
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              FX.confetti(rect.left+rect.width/2, rect.top+rect.height/2);
              FX.screenFlash('#39ff14', 0.2);
            }
          } else if (titleEl && titleEl.classList.contains('lose')) {
            FX.screenFlash('#ff2d78', 0.3);
            FX.shake(10);
          }
        }
      });
      ovObs.observe(hmOverlay, {attributes:true, attributeFilter:['class']});
    }
  }, 300);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  CONNECT FOUR — DROP PARTICLES + WIN FIREWORKS             ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchConnectFour() {
  const wait = setInterval(() => {
    const board = document.getElementById('c4-board');
    if (!board) return;
    clearInterval(wait);

    // Disc drop — watch for new p1/p2 cells
    board.addEventListener('animationstart', (e) => {
      const cell = e.target.closest('.c4-cell');
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      const cx = rect.left + rect.width/2;
      const cy = rect.top;
      const isP1 = cell.classList.contains('p1');
      FX.burst(cx, cy, {
        count: 10,
        colors: isP1 ? ['#ff2d78','#ff6a00','#ffffff'] : ['#4169ff','#00f5ff','#ffffff'],
        speed: 3, life: 30, size: 2, shape: 'spark', gravity: 0.1,
      });
    });

    // Win overlay → fireworks
    const overlay = document.getElementById('c4-overlay');
    if (overlay) {
      const obs = new MutationObserver(() => {
        if (overlay.classList.contains('active')) {
          const titleEl = overlay.querySelector('.c4-ov-title');
          if (titleEl && titleEl.classList.contains('win')) {
            FX.screenFlash('#00f5ff', 0.25);
            // Staggered fireworks
            for (let i=0; i<6; i++) {
              setTimeout(() => {
                FX.explosion(
                  window.innerWidth*0.2 + Math.random()*window.innerWidth*0.6,
                  window.innerHeight*0.2 + Math.random()*window.innerHeight*0.4,
                  ['#00f5ff','#ff2d78','#ffe600','#39ff14','#bf00ff']
                );
              }, i*250);
            }
          } else if (titleEl && titleEl.classList.contains('draw')) {
            FX.screenFlash('#ff6a00', 0.2);
            FX.shake(5);
          }
        }
      });
      obs.observe(overlay, {attributes:true, attributeFilter:['class']});
    }
  }, 300);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  WORDLE — LETTER FLIP SPARKS + WIN/LOSE EFFECTS            ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchWordle() {
  const wait = setInterval(() => {
    const grid = document.getElementById('wrd-grid');
    if (!grid) return;
    clearInterval(wait);

    grid.addEventListener('animationend', (e) => {
      const tile = e.target.closest('.wrd-tile');
      if (!tile || e.animationName !== 'wrd-flip') return;
      const rect = tile.getBoundingClientRect();
      const cx = rect.left + rect.width/2;
      const cy = rect.top  + rect.height/2;
      if (tile.classList.contains('correct')) {
        FX.spark(cx, cy, '#39ff14', 8);
      } else if (tile.classList.contains('present')) {
        FX.spark(cx, cy, '#ffe600', 5);
      }
    });

    const wrdOverlay = document.getElementById('wrd-overlay');
    if (wrdOverlay) {
      const obs = new MutationObserver(() => {
        if (wrdOverlay.classList.contains('active')) {
          const t = wrdOverlay.querySelector('.wrd-ov-title');
          if (t && t.classList.contains('win')) {
            FX.confetti(window.innerWidth/2, window.innerHeight*0.3);
            FX.screenFlash('#39ff14', 0.2);
          } else if (t && t.classList.contains('lose')) {
            FX.screenFlash('#ff2d78', 0.3);
            FX.shake(8);
          }
        }
      });
      obs.observe(wrdOverlay, {attributes:true, attributeFilter:['class']});
    }
  }, 300);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  TRIVIA — CORRECT/WRONG ANSWER PARTICLES                   ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchTrivia() {
  const wait = setInterval(() => {
    const answersEl = document.getElementById('trv-answers');
    if (!answersEl) return;
    clearInterval(wait);

    answersEl.addEventListener('animationend', () => {});

    // Watch answer button state changes
    answersEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.trv-answer-btn');
      if (!btn) return;
      setTimeout(() => {
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width/2;
        const cy = rect.top  + rect.height/2;
        if (btn.classList.contains('correct')) {
          FX.burst(cx, cy, {count:30, colors:['#39ff14','#ffe600','#00f5ff'], speed:6, life:50, size:4, shape:'star'});
          FX.screenFlash('#39ff14', 0.15);
        } else if (btn.classList.contains('wrong')) {
          FX.burst(cx, cy, {count:15, colors:['#ff2d78','#ff6a00'], speed:4, life:35, size:3, shape:'spark'});
          FX.shake(5);
        }
      }, 100);
    });

    // Watch reveal for correct answer
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        if (m.target.classList.contains('correct')) {
          const rect = m.target.getBoundingClientRect();
          FX.burst(rect.left+rect.width/2, rect.top+rect.height/2, {
            count:25, colors:['#39ff14','#ffe600','#ffffff'], speed:5, life:45, size:4, shape:'star',
          });
        }
      });
    });
    observer.observe(answersEl, {attributes:true, subtree:true, attributeFilter:['class']});
  }, 400);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  MINESWEEPER — REVEAL + MINE EXPLOSION PARTICLES           ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchMinesweeper() {
  const wait = setInterval(() => {
    const ms = document.getElementById('minesweeper-screen');
    if (!ms) return;
    clearInterval(wait);

    ms.addEventListener('click', (e) => {
      const cell = e.target.closest('.ms-cell');
      if (!cell) return;
      setTimeout(() => {
        const rect = cell.getBoundingClientRect();
        const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
        if (cell.classList.contains('mine-hit')) {
          FX.explosion(cx, cy, ['#ff6a00','#ff2d78','#ffe600','#ffffff']);
          FX.screenFlash('#ff2d78', 0.45);
        } else if (cell.classList.contains('revealed')) {
          const n = cell.dataset.n ? parseInt(cell.dataset.n) : 0;
          if (n > 0) {
            const colors = [
              '#60a5fa','#39ff14','#ff2d78','#bf00ff',
              '#ff6a00','#00f5ff','#ffffff','#aaaaaa'
            ];
            FX.spark(cx, cy, colors[n-1] || '#00f5ff', 4);
          }
        }
      }, 30);
    });
  }, 300);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  BATTLESHIP — FULL VISUAL ENGINE                           ║
// ║  • Animated ocean cells with wave offsets                  ║
// ║  • SVG ship sprites overlaid on grid                       ║
// ║  • Hit explosion + fire + smoke + screen shake             ║
// ║  • Miss water-splash ripple                                ║
// ║  • Sunk: ship sinks with tilt + debris + bubbles           ║
// ╚══════════════════════════════════════════════════════════════╝
(function BattleshipVisuals() {

  // ── Ship SVG paths by type ──────────────────────────────────
  // Each ship is drawn as an SVG scaled to fit its cells.
  // viewBox is 100*size x 100 (horizontal). We rotate for vertical.
  const SHIP_SVGS = {
    carrier: (size) => `
      <svg viewBox="0 ${-10} ${size*100} 120" xmlns="http://www.w3.org/2000/svg">
        <!-- Hull -->
        <path d="M10,85 L${size*100-10},85 L${size*100},60 L${size*100-20},50 L20,50 L0,60 Z"
              fill="#1a3a1a" stroke="#3a7a3a" stroke-width="1.5"/>
        <!-- Flight deck -->
        <rect x="5" y="35" width="${size*100-10}" height="18" rx="2"
              fill="#243824" stroke="#4a8a4a" stroke-width="1"/>
        <!-- Deck markings -->
        <line x1="${size*50}" y1="35" x2="${size*50}" y2="53" stroke="#5aaa5a" stroke-width="0.8" stroke-dasharray="3,2"/>
        <rect x="${size*15}" y="37" width="${size*30}" height="14" rx="1" fill="none" stroke="rgba(90,200,90,0.4)" stroke-width="0.6"/>
        <!-- Island superstructure -->
        <rect x="${size*70}" y="20" width="${size*18}" height="30" rx="2"
              fill="#0f2010" stroke="#3a6a3a" stroke-width="1"/>
        <rect x="${size*72}" y="12" width="${size*6}" height="12" rx="1"
              fill="#0a1a0a" stroke="#2a5a2a" stroke-width="0.8"/>
        <!-- Radar mast -->
        <line x1="${size*75}" y1="12" x2="${size*75}" y2="2" stroke="#5aaa5a" stroke-width="1.2"/>
        <circle cx="${size*75}" cy="2" r="3" fill="none" stroke="#7acc7a" stroke-width="0.8"/>
        <!-- Aircraft silhouettes -->
        <ellipse cx="${size*25}" cy="44" rx="${size*6}" ry="2.5" fill="rgba(100,200,100,0.3)" stroke="rgba(100,200,100,0.5)" stroke-width="0.5"/>
        <ellipse cx="${size*45}" cy="44" rx="${size*6}" ry="2.5" fill="rgba(100,200,100,0.3)" stroke="rgba(100,200,100,0.5)" stroke-width="0.5"/>
        <!-- Waterline glow -->
        <path d="M10,85 L${size*100-10},85" stroke="rgba(0,200,100,0.4)" stroke-width="1.5"/>
        <!-- Bow wave -->
        <path d="M0,60 Q-5,75 0,88" fill="none" stroke="rgba(0,180,255,0.5)" stroke-width="1.2"/>
        <path d="M${size*100},60 Q${size*100+5},75 ${size*100},88" fill="none" stroke="rgba(0,180,255,0.5)" stroke-width="1.2"/>
      </svg>`,

    battleship: (size) => `
      <svg viewBox="0 ${-5} ${size*100} 110" xmlns="http://www.w3.org/2000/svg">
        <!-- Hull -->
        <path d="M15,80 L${size*100-15},80 L${size*100-5},60 L${size*100-25},48 L25,48 L5,60 Z"
              fill="#1a2530" stroke="#2a4560" stroke-width="1.5"/>
        <!-- Main deck -->
        <rect x="10" y="38" width="${size*100-20}" height="12" rx="1"
              fill="#1a2e42" stroke="#3a5e72" stroke-width="1"/>
        <!-- Main gun turret front -->
        <rect x="${size*8}" y="30" width="${size*22}" height="12" rx="2"
              fill="#12202e" stroke="#2a4a5e" stroke-width="1"/>
        <rect x="${size*10}" y="26" width="${size*18}" height="7" rx="1"
              fill="#0e1a26" stroke="#2a4050" stroke-width="0.8"/>
        <!-- Gun barrels -->
        <line x1="${size*12}" y1="29" x2="${size*4}" y2="18" stroke="#4a7a9a" stroke-width="2"/>
        <line x1="${size*18}" y1="29" x2="${size*10}" y2="18" stroke="#4a7a9a" stroke-width="2"/>
        <!-- Main gun turret rear -->
        <rect x="${size*65}" y="30" width="${size*22}" height="12" rx="2"
              fill="#12202e" stroke="#2a4a5e" stroke-width="1"/>
        <rect x="${size*67}" y="26" width="${size*18}" height="7" rx="1"
              fill="#0e1a26" stroke="#2a4050" stroke-width="0.8"/>
        <line x1="${size*78}" y1="29" x2="${size*86}" y2="18" stroke="#4a7a9a" stroke-width="2"/>
        <line x1="${size*84}" y1="29" x2="${size*92}" y2="18" stroke="#4a7a9a" stroke-width="2"/>
        <!-- Superstructure -->
        <rect x="${size*38}" y="22" width="${size*24}" height="28" rx="2"
              fill="#0e1c2a" stroke="#2a4258" stroke-width="1"/>
        <!-- Bridge -->
        <rect x="${size*41}" y="14" width="${size*18}" height="12" rx="1"
              fill="#0a1620" stroke="#1e3a4e" stroke-width="0.8"/>
        <!-- Mast -->
        <line x1="${size*50}" y1="14" x2="${size*50}" y2="3" stroke="#3a6a8a" stroke-width="1.2"/>
        <line x1="${size*45}" y1="7" x2="${size*55}" y2="7" stroke="#3a6a8a" stroke-width="0.8"/>
        <!-- Waterline -->
        <path d="M15,80 L${size*100-15},80" stroke="rgba(0,160,220,0.4)" stroke-width="1.5"/>
        <path d="M5,60 Q0,70 5,80" fill="none" stroke="rgba(0,180,255,0.5)" stroke-width="1.2"/>
        <path d="M${size*100-5},60 Q${size*100},70 ${size*100-5},80" fill="none" stroke="rgba(0,180,255,0.5)" stroke-width="1.2"/>
      </svg>`,

    cruiser: (size) => `
      <svg viewBox="0 ${-5} ${size*100} 110" xmlns="http://www.w3.org/2000/svg">
        <!-- Hull -->
        <path d="M20,78 L${size*100-20},78 L${size*100-8},58 L${size*100-25},46 L25,46 L8,58 Z"
              fill="#1e2a1e" stroke="#2e4a2e" stroke-width="1.5"/>
        <!-- Deck -->
        <rect x="15" y="36" width="${size*100-30}" height="12" rx="1"
              fill="#182a18" stroke="#2e4e2e" stroke-width="1"/>
        <!-- Forward gun -->
        <rect x="${size*10}" y="28" width="${size*20}" height="10" rx="2"
              fill="#10200e" stroke="#2a402a" stroke-width="1"/>
        <line x1="${size*16}" y1="28" x2="${size*8}" y2="16" stroke="#3a6a3a" stroke-width="2.2"/>
        <!-- Missile launcher -->
        <rect x="${size*35}" y="26" width="${size*30}" height="13" rx="2"
              fill="#0e1c0e" stroke="#284028" stroke-width="1"/>
        <rect x="${size*37}" y="22" width="${size*8}" height="8" rx="1"
              fill="#0a160a" stroke="#1e321e" stroke-width="0.8"/>
        <rect x="${size*53}" y="22" width="${size*8}" height="8" rx="1"
              fill="#0a160a" stroke="#1e321e" stroke-width="0.8"/>
        <!-- Bridge -->
        <rect x="${size*40}" y="14" width="${size*20}" height="14" rx="1"
              fill="#0c180c" stroke="#203820" stroke-width="0.8"/>
        <line x1="${size*50}" y1="14" x2="${size*50}" y2="3" stroke="#2a5a2a" stroke-width="1.2"/>
        <!-- Rear gun -->
        <rect x="${size*68}" y="28" width="${size*18}" height="10" rx="2"
              fill="#10200e" stroke="#2a402a" stroke-width="1"/>
        <line x1="${size*80}" y1="28" x2="${size*88}" y2="16" stroke="#3a6a3a" stroke-width="2.2"/>
        <!-- Waterline -->
        <path d="M20,78 L${size*100-20},78" stroke="rgba(0,180,80,0.4)" stroke-width="1.5"/>
        <path d="M8,58 Q3,68 8,78" fill="none" stroke="rgba(0,200,100,0.4)" stroke-width="1"/>
        <path d="M${size*100-8},58 Q${size*100-3},68 ${size*100-8},78" fill="none" stroke="rgba(0,200,100,0.4)" stroke-width="1"/>
      </svg>`,

    submarine: (size) => `
      <svg viewBox="5 10 ${size*100-10} 90" xmlns="http://www.w3.org/2000/svg">
        <!-- Main hull - torpedo shape -->
        <ellipse cx="${size*50}" cy="72" rx="${size*46}" ry="16"
                 fill="#1a2a1a" stroke="#2a4a2a" stroke-width="1.5"/>
        <!-- Hull shading -->
        <ellipse cx="${size*50}" cy="68" rx="${size*44}" ry="10"
                 fill="none" stroke="rgba(60,120,60,0.3)" stroke-width="1"/>
        <!-- Conning tower (sail) -->
        <rect x="${size*42}" y="48" width="${size*16}" height="22" rx="3"
              fill="#162816" stroke="#2a4a2a" stroke-width="1.2"/>
        <rect x="${size*45}" y="42" width="${size*10}" height="10" rx="2"
              fill="#101e10" stroke="#243e24" stroke-width="0.8"/>
        <!-- Periscope -->
        <line x1="${size*50}" y1="42" x2="${size*50}" y2="28" stroke="#2a5a2a" stroke-width="1.5"/>
        <line x1="${size*48}" y1="28" x2="${size*54}" y2="28" stroke="#2a5a2a" stroke-width="1.2"/>
        <circle cx="${size*54}" cy="28" r="2.5" fill="none" stroke="#3a7a3a" stroke-width="0.8"/>
        <!-- Propeller -->
        <circle cx="${size*96}" cy="72" r="6" fill="none" stroke="#2a5a2a" stroke-width="1.5"/>
        <line x1="${size*96}" y1="66" x2="${size*96}" y2="78" stroke="#2a5a2a" stroke-width="1.2"/>
        <line x1="${size*90}" y1="72" x2="${size*102}" y2="72" stroke="#2a5a2a" stroke-width="1.2"/>
        <!-- Torpedo tubes -->
        <ellipse cx="${size*5}" cy="70" rx="4" ry="2.5"
                 fill="#0a180a" stroke="#1e3e1e" stroke-width="0.8"/>
        <ellipse cx="${size*5}" cy="75" rx="4" ry="2.5"
                 fill="#0a180a" stroke="#1e3e1e" stroke-width="0.8"/>
        <!-- Diving planes -->
        <path d="M${size*20},72 L${size*14},64 L${size*10},66 L${size*18},72 Z"
              fill="#1a2e1a" stroke="#2a4e2a" stroke-width="0.8"/>
        <path d="M${size*80},72 L${size*86},64 L${size*90},66 L${size*82},72 Z"
              fill="#1a2e1a" stroke="#2a4e2a" stroke-width="0.8"/>
        <!-- Sonar dome -->
        <ellipse cx="${size*5}" cy="72" rx="7" ry="11" fill="#0e1e0e" stroke="#1e3e1e" stroke-width="1"/>
      </svg>`,

    destroyer: (size) => `
      <svg viewBox="0 0 ${size*100} 100" xmlns="http://www.w3.org/2000/svg">
        <!-- Sleek hull -->
        <path d="M25,80 L${size*100-25},80 L${size*100-5},58 L${size*100-28},44 L28,44 L5,58 Z"
              fill="#1a1e2a" stroke="#2a3050" stroke-width="1.5"/>
        <!-- Deck -->
        <rect x="20" y="34" width="${size*100-40}" height="12" rx="1"
              fill="#141822" stroke="#242c42" stroke-width="1"/>
        <!-- Forward gun -->
        <rect x="${size*12}" y="26" width="${size*18}" height="9" rx="2"
              fill="#0e1420" stroke="#1e2840" stroke-width="1"/>
        <line x1="${size*20}" y1="26" x2="${size*12}" y2="14" stroke="#3a4e70" stroke-width="2.5"/>
        <!-- Bridge/Superstructure -->
        <rect x="${size*38}" y="18" width="${size*24}" height="20" rx="2"
              fill="#0c1018" stroke="#1c2838" stroke-width="1"/>
        <rect x="${size*41}" y="10" width="${size*18}" height="12" rx="1"
              fill="#080e16" stroke="#162030" stroke-width="0.8"/>
        <!-- Mast -->
        <line x1="${size*50}" y1="10" x2="${size*50}" y2="0" stroke="#2a3e5e" stroke-width="1.2"/>
        <line x1="${size*46}" y1="4" x2="${size*54}" y2="4" stroke="#2a3e5e" stroke-width="0.8"/>
        <!-- Rear gun -->
        <rect x="${size*68}" y="26" width="${size*16}" height="9" rx="2"
              fill="#0e1420" stroke="#1e2840" stroke-width="1"/>
        <line x1="${size*76}" y1="26" x2="${size*84}" y2="14" stroke="#3a4e70" stroke-width="2.5"/>
        <!-- Torpedo tubes -->
        <rect x="${size*30}" y="36" width="${size*12}" height="5" rx="1"
              fill="#0c1018" stroke="#1c2838" stroke-width="0.8"/>
        <rect x="${size*56}" y="36" width="${size*12}" height="5" rx="1"
              fill="#0c1018" stroke="#1c2838" stroke-width="0.8"/>
        <!-- Waterline -->
        <path d="M25,80 L${size*100-25},80" stroke="rgba(0,120,255,0.4)" stroke-width="1.5"/>
        <path d="M5,58 Q0,68 5,80" fill="none" stroke="rgba(0,150,255,0.4)" stroke-width="1"/>
        <path d="M${size*100-5},58 Q${size*100},68 ${size*100-5},80" fill="none" stroke="rgba(0,150,255,0.4)" stroke-width="1"/>
      </svg>`
  };

  // ── Single full-grid ocean canvas per board ─────────────────
  // One canvas sits BEHIND the entire grid (z-index 0).
  // Grid cells are transparent so the ocean shows through all water squares.
  let _ot = 0;
  let _oceanRaf = null;
  const _oceanCanvases = new Map(); // gridId -> canvas

  function ensureOceanCanvas(gridId) {
    if (_oceanCanvases.has(gridId)) {
      const existing = _oceanCanvases.get(gridId);
      if (existing.isConnected) return existing;
      _oceanCanvases.delete(gridId);
    }
    const grid = document.getElementById(gridId);
    if (!grid) return null;
    grid.style.position = 'relative';
    const canvas = document.createElement('canvas');
    canvas.className = 'grid-ocean-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
    grid.insertBefore(canvas, grid.firstChild);
    _oceanCanvases.set(gridId, canvas);
    function sizeIt() {
      const r = grid.getBoundingClientRect();
      if (r.width > 0) { canvas.width = Math.round(r.width); canvas.height = Math.round(r.height); }
    }
    sizeIt();
    const ro = new ResizeObserver(sizeIt);
    ro.observe(grid);
    if (!_oceanRaf) startGridOceanLoop();
    return canvas;
  }

  function startGridOceanLoop() {
    let _oceanLastTs = 0;
    function loop(ts) {
      // Pause when tab hidden or battleship screen not visible
      if (document.hidden) { _oceanRaf = requestAnimationFrame(loop); return; }
      const bsScreen = document.getElementById('battleship-screen');
      if (!bsScreen || !bsScreen.classList.contains('active')) {
        _oceanRaf = null; return; // truly stop — startGridOceanLoop() restarts it when needed
      }
      const dt = Math.min((ts - (_oceanLastTs || ts)) / (1000/60), 3);
      _oceanLastTs = ts;
      _ot += 0.012 * dt;
      _oceanCanvases.forEach((canvas, gridId) => {
        if (!canvas.isConnected) { _oceanCanvases.delete(gridId); return; }
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        if (!W || !H) return;

        // ── Top-down realistic ocean ──

        // ── Base: bright tropical water, lighter in centre (sunlit shallows feel) ──
        const baseGrad = ctx.createRadialGradient(W*0.45, H*0.38, 0, W*0.5, H*0.5, Math.max(W,H)*0.8);
        baseGrad.addColorStop(0,   '#061f33');
        baseGrad.addColorStop(0.4, '#041726');
        baseGrad.addColorStop(0.8, '#030f1a');
        baseGrad.addColorStop(1,   '#01080f');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, W, H);

        // ── Swell pattern: overlapping 2D sine waves (top-down view) ──
        const SW = Math.ceil(W/3), SH = Math.ceil(H/3);
        if (!canvas._offCtx) {
          const off = document.createElement('canvas');
          off.width = SW; off.height = SH;
          canvas._offCtx = off.getContext('2d');
          canvas._offCanvas = off;
        }
        const oc2 = canvas._offCtx;
        oc2.canvas.width = SW; oc2.canvas.height = SH;
        const imgData = oc2.createImageData(SW, SH);
        const d = imgData.data;
        // Multiple wave trains at different angles — bright teal/cyan on deep blue
        const swells = [
          { dx:1.0,  dy:0.25, speed:0.38, wl:0.06,  bright:38 },
          { dx:0.45, dy:1.0,  speed:0.26, wl:0.05,  bright:28 },
          { dx:-0.3, dy:0.9,  speed:0.31, wl:0.085, bright:22 },
          { dx:0.8,  dy:-0.4, speed:0.20, wl:0.038, bright:16 },
          { dx:0.2,  dy:0.6,  speed:0.45, wl:0.11,  bright:12 },
        ];
        for (let y = 0; y < SH; y++) {
          for (let x = 0; x < SW; x++) {
            // Start from a visible ocean mid-tone
            let r = 5, g = 20, b = 45;
            swells.forEach(({ dx, dy, speed, wl, bright }) => {
              const phase = (x*dx + y*dy) * wl * Math.PI*2 + _ot*speed*Math.PI*2;
              const v = (Math.sin(phase)*0.5+0.5) * bright;
              r += v * 0.2; g += v * 0.45; b += v * 0.7;
            });
            const i = (y*SW+x)*4;
            d[i]=Math.min(255,r); d[i+1]=Math.min(255,g); d[i+2]=Math.min(255,b); d[i+3]=255;
          }
        }
        oc2.putImageData(imgData, 0, 0);
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(canvas._offCanvas, 0, 0, W, H);
        ctx.restore();
      });
      if (_oceanCanvases.size > 0) {
        _oceanRaf = requestAnimationFrame(loop);
      } else {
        _oceanRaf = null; // no canvases left — stop the loop entirely
      }
    }
    _oceanRaf = requestAnimationFrame(loop); // start
  }

  // Called after grid is built — just ensure the canvas exists
  function applyOceanToGrid(gridId) {
    setTimeout(() => ensureOceanCanvas(gridId), 30);
  }

  // Expose restart so showScreen() can wake the loop after it self-stopped
  window.BSOCEAN = { restart: () => { if (!_oceanRaf) startGridOceanLoop(); } };

  // ── Hit animation: layered explosion + persistent fire ──────
  function animateHit(cellEl, isSunk) {
    if (!cellEl) return;
    [...cellEl.children].forEach(ch => {
      if (!ch.classList.contains('ship-overlay') && !ch.classList.contains('cell-fx-canvas')) ch.remove();
    });

    // Expanding rings (transient)
    const r1 = document.createElement('div'); r1.className = 'hit-ring';
    const r2 = document.createElement('div'); r2.className = 'hit-ring2';
    cellEl.appendChild(r1); cellEl.appendChild(r2);
    setTimeout(() => { r1.remove(); r2.remove(); }, 800);

    // Canvas flame
    startCellFX(cellEl, 'flame');

    const rect = cellEl.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top  + rect.height/2;
    const colors = ['#ff6600','#ff4400','#ffcc00','#ff8800','#ffff00','#ffffff','#ff2200'];
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('div');
      d.className = 'debris';
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 35 + Math.random() * 70;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed - 25;
      const rot = (Math.random()-0.5) * 400;
      const sz  = 2 + Math.random() * 5;
      d.style.cssText = `left:${cx-sz/2}px;top:${cy-sz/2}px;width:${sz}px;height:${sz}px;background:${colors[i%colors.length]};--dx:${dx}px;--dy:${dy}px;--dr:${rot}deg;`;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1200);
    }

    if (window.FX) {
      FX.explosion(cx, cy, ['#ff6a00','#ff4400','#ffe600','#ffffff','#ff2200']);
      FX.shake(isSunk ? 8 : 4);
      if (isSunk) FX.screenFlash('#ff4400', 0.18);
    }
  }

  // ── Miss animation: water splash ripple ────────────────────
  function animateMiss(cellEl) {
    if (!cellEl) return;
    [...cellEl.children].forEach(ch => { if (!ch.classList.contains('ship-overlay')) ch.remove(); });

    const dot = document.createElement('div'); dot.className = 'miss-dot';
    const s1  = document.createElement('div'); s1.className  = 'miss-splash';
    const s2  = document.createElement('div'); s2.className  = 'miss-splash2';
    cellEl.appendChild(dot); cellEl.appendChild(s1); cellEl.appendChild(s2);
    setTimeout(() => { s1.remove(); s2.remove(); }, 900);

    const rect = cellEl.getBoundingClientRect();
    if (window.FX) {
      FX.burst(rect.left+rect.width/2, rect.top+rect.height/2,
        {count:10, colors:['#00a0ff','#0060c0','#00d4ff','#ffffff'],
         speed:3, life:28, size:2, shape:'circle', gravity:0.05});
    }
  }

  // ── Get bounding rect for a cell by row/col in a grid ──────
  function getCellEl(gridId, r, c) {
    const grid = document.getElementById(gridId);
    if (!grid) return null;
    return [...grid.querySelectorAll('.grid-cell')]
      .find(el => parseInt(el.dataset.r) === r && parseInt(el.dataset.c) === c) || null;
  }

  // ── Draw ship SVG overlaid on grid cells ───────────────────
  // Returns the overlay element (or null)
  function drawShipOverlay(gridEl, cells, shipKey, isMine) {
    if (!cells || !cells.length || !gridEl) return null;
    // Determine orientation
    const sorted = [...cells].sort((a,b) => a.r===b.r ? a.c-b.c : a.r-b.r);
    const isHorizontal = sorted[0].r === sorted[sorted.length-1].r;
    const size = sorted.length;

    // Get bounding box of cells
    const firstCell = getCellEl(gridEl.id, sorted[0].r, sorted[0].c);
    const lastCell  = getCellEl(gridEl.id, sorted[sorted.length-1].r, sorted[sorted.length-1].c);
    if (!firstCell || !lastCell) return null;

    const gridRect  = gridEl.getBoundingClientRect();
    const r1 = firstCell.getBoundingClientRect();
    const r2 = lastCell.getBoundingClientRect();

    const x  = r1.left - gridRect.left;
    const y  = r1.top  - gridRect.top;
    const w  = isHorizontal ? (r2.right  - r1.left) : r1.width;
    const h  = isHorizontal ? r1.height              : (r2.bottom - r1.top);

    const overlay = document.createElement('div');
    overlay.className = 'ship-overlay';
    overlay.dataset.shipKey = shipKey;
    overlay.dataset.gridId  = gridEl.id;
    overlay.style.cssText = `
      left:${x}px; top:${y}px;
      width:${w}px; height:${h}px;
      transform-origin: center center;
    `;

    const gen = SHIP_SVGS[shipKey] || SHIP_SVGS['destroyer'];
    const svgStr = isHorizontal ? gen(size) : gen(size);

    const svgWrapper = document.createElement('div');
    svgWrapper.style.cssText = `width:100%;height:100%;position:relative;`;

    if (!isHorizontal) {
      svgWrapper.style.transform = 'rotate(90deg)';
      svgWrapper.style.transformOrigin = 'center center';
      svgWrapper.style.width = `${h}px`;
      svgWrapper.style.height = `${w}px`;
      svgWrapper.style.position = 'absolute';
      svgWrapper.style.left = `${(w-h)/2}px`;
      svgWrapper.style.top  = `${(h-w)/2}px`;
    }

    svgWrapper.innerHTML = svgStr;
    const svgEl = svgWrapper.querySelector('svg');
    if (svgEl) {
      svgEl.style.cssText = 'width:100%;height:100%;display:block;filter:drop-shadow(0 0 3px rgba(0,255,100,0.4));';
      // Dim for enemy-placed ships (my grid); brighten for own
      if (!isMine) svgEl.style.opacity = '0.85';
    }

    overlay.appendChild(svgWrapper);

    // Position the overlay relative to the grid container
    gridEl.style.position = 'relative';
    gridEl.appendChild(overlay);

    return overlay;
  }

  // ── Draw a charred black wreck overlay for a sunk ship ──────
  function drawWreckOverlay(gridEl, cells, shipKey) {
    if (!cells || !cells.length || !gridEl) return;
    const sorted = [...cells].sort((a,b) => a.r===b.r ? a.c-b.c : a.r-b.r);
    const isHorizontal = sorted[0].r === sorted[sorted.length-1].r;
    const size = sorted.length;

    const firstCell = getCellEl(gridEl.id, sorted[0].r, sorted[0].c);
    const lastCell  = getCellEl(gridEl.id, sorted[sorted.length-1].r, sorted[sorted.length-1].c);
    if (!firstCell || !lastCell) return;

    const gridRect = gridEl.getBoundingClientRect();
    const r1 = firstCell.getBoundingClientRect();
    const r2 = lastCell.getBoundingClientRect();

    const x = r1.left - gridRect.left;
    const y = r1.top  - gridRect.top;
    const w = isHorizontal ? (r2.right  - r1.left) : r1.width;
    const h = isHorizontal ? r1.height              : (r2.bottom - r1.top);

    const wreck = document.createElement('div');
    wreck.className = 'ship-wreck';
    wreck.dataset.shipKey = shipKey;
    wreck.dataset.gridId  = gridEl.id;
    wreck.style.cssText = `left:${x}px; top:${y}px; width:${w}px; height:${h}px;`;

    const gen = SHIP_SVGS[shipKey] || SHIP_SVGS['destroyer'];
    const svgWrapper = document.createElement('div');
    svgWrapper.style.cssText = `width:100%;height:100%;position:relative;`;

    if (!isHorizontal) {
      svgWrapper.style.transform = 'rotate(90deg)';
      svgWrapper.style.transformOrigin = 'center center';
      svgWrapper.style.width  = `${h}px`;
      svgWrapper.style.height = `${w}px`;
      svgWrapper.style.position = 'absolute';
      svgWrapper.style.left = `${(w-h)/2}px`;
      svgWrapper.style.top  = `${(h-w)/2}px`;
    }

    svgWrapper.innerHTML = gen(size);
    wreck.appendChild(svgWrapper);
    gridEl.style.position = 'relative';
    gridEl.appendChild(wreck);
  }

  // ── Redraw all ship overlays for both grids ─────────────────
  function redrawAllShipOverlays() {
    // Remove old overlays and wrecks
    document.querySelectorAll('.ship-overlay, .ship-wreck').forEach(el => el.remove());

    const gs = document.getElementById('game-screen');
    if (!gs || !gs.classList.contains('active')) return;

    const myGridEl    = document.getElementById('my-grid');
    const enemyGridEl = document.getElementById('enemy-grid');

    // ── MY GRID ─────────────────────────────────────────────
    if (myGridEl && window.bsState) {
      for (const [key, cells] of Object.entries(window.bsState.placedShips || {})) {
        const cellArr = Array.isArray(cells) ? cells : Object.values(cells);
        if (window.bsState.sunkMyShips.has(key)) {
          // Draw charred wreck instead of live ship
          drawWreckOverlay(myGridEl, cellArr, key);
        } else {
          drawShipOverlay(myGridEl, cellArr, key, true);
        }
      }
    }

    // ── ENEMY GRID ───────────────────────────────────────────
    if (enemyGridEl && window.bsState) {
      // NPC mode: use npcShips
      const npcShips = window.bsState.npcShips || {};
      // Multiplayer mode: use room enemy placedShips stored on bsState
      const mpEnemyShips = window.bsState.enemyPlacedShips || {};

      for (const key of window.bsState.sunkEnemyShips) {
        const cells = npcShips[key] || mpEnemyShips[key];
        if (cells) {
          const cellArr = Array.isArray(cells) ? cells : Object.values(cells);
          drawWreckOverlay(enemyGridEl, cellArr, key);
        }
      }
    }
  }

  // ── Canvas flame + smoke particle engine ───────────────────
  const _cellFX = new Map(); // cellEl -> { raf, particles, canvas, ctx, mode }

  function startCellFX(cellEl, mode) { // mode: 'flame' | 'smoke'
    if (_cellFX.has(cellEl)) {
      const old = _cellFX.get(cellEl);
      cancelAnimationFrame(old.raf);
      if (old.canvas.parentNode) old.canvas.remove();
      _cellFX.delete(cellEl);
    }

    // Canvas fills the cell exactly as an overlay — CSS makes it top:0 left:0 w:100% h:100%
    const cellRect = cellEl.getBoundingClientRect();
    const CW = Math.round(cellRect.width)  || 40;
    const CH = Math.round(cellRect.height) || 40;

    const canvas = document.createElement('canvas');
    canvas.width  = CW;
    canvas.height = CH;
    canvas.className = 'cell-fx-canvas';
    // CSS (top:0 left:0 w:100% h:100%) handles positioning;
    // explicit px size keeps canvas pixel buffer matching layout size
    canvas.style.width  = '100%';
    canvas.style.height = '100%';
    cellEl.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const particles = [];
    const fxState = { raf: null, canvas, ctx, particles, mode };
    _cellFX.set(cellEl, fxState);

    function spawnFlame() {
      particles.push({
        x: CW * 0.5 + (Math.random()-0.5) * CW * 0.5,
        y: CH * 0.85,                          // start near bottom of cell
        vx: (Math.random()-0.5) * 0.8,
        vy: -(CW * 0.04 + Math.random() * CW * 0.045), // rise upward within cell
        life: 1, decay: 0.04 + Math.random() * 0.03,
        r: CW * 0.08 + Math.random() * CW * 0.07,
        type: 'flame',
      });
    }

    function spawnSmoke() {
      particles.push({
        x: CW * 0.5 + (Math.random()-0.5) * CW * 0.5,
        y: CH * 0.7,                           // mid-lower area of cell
        vx: (Math.random()-0.5) * 0.5,
        vy: -(CW * 0.018 + Math.random() * CW * 0.022),
        life: 1, decay: 0.012 + Math.random() * 0.007,
        r: CW * 0.14 + Math.random() * CW * 0.18,
        type: 'smoke',
      });
    }

    let _fxLastTs = 0;
    function loop(ts) {
      // Pause when tab hidden or battleship not active
      if (document.hidden || !cellEl.isConnected) {
        fxState.raf = requestAnimationFrame(loop);
        return;
      }
      const _fxDt = Math.min((ts - (_fxLastTs || ts)) / (1000/60), 3);
      _fxLastTs = ts;
      ctx.clearRect(0, 0, CW, CH);
      fxState.raf = requestAnimationFrame(loop);

      if (mode === 'flame') {
        if (Math.random() < 0.5 * _fxDt) spawnFlame();
        if (Math.random() < 0.2 * _fxDt) spawnSmoke();
      } else { // smoke only
        if (Math.random() < 0.5 * _fxDt) spawnSmoke();
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x  += p.vx * _fxDt;
        p.y  += p.vy * _fxDt;
        p.vx += (Math.random()-0.5) * 0.15 * _fxDt;
        p.life -= p.decay * _fxDt;
        // Cull particles that drift out of cell bounds or die
        if (p.life <= 0 || p.y < -p.r || p.x < -p.r || p.x > CW + p.r) {
          particles[i] = particles[particles.length - 1]; particles.pop(); continue;
        }

        ctx.save();
        if (p.type === 'flame') {
          const g = Math.round(p.life > 0.5 ? 60 + (1-p.life)*280 : p.life*120);
          const grad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.max(0.01,p.r));
          grad.addColorStop(0,   `rgba(255,${g},0,${p.life*0.9})`);
          grad.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
        } else {
          const v = Math.round(40 + (1-p.life)*50);
          const rr = p.r * (1 + (1-p.life) * 0.8);
          const grad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.max(0.01,rr));
          grad.addColorStop(0,   `rgba(${v},${v},${v},${p.life*0.6})`);
          grad.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y,Math.max(0,p.type==='flame' ? p.r : p.r*(1+(1-p.life))*0.8), 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
    }
    loop();
  }

  function stopCellFX(cellEl) {
    if (_cellFX.has(cellEl)) {
      const s = _cellFX.get(cellEl);
      cancelAnimationFrame(s.raf);
      if (s.canvas.parentNode) s.canvas.remove();
      _cellFX.delete(cellEl);
    }
  }

  function animateHit(cellEl, isSunk) {
    if (!cellEl) return;
    [...cellEl.children].forEach(ch => {
      if (!ch.classList.contains('ship-overlay') && !ch.classList.contains('cell-fx-canvas')) ch.remove();
    });

    // Explosion ring
    const ring = document.createElement('div');
    ring.className = 'hit-ring';
    cellEl.appendChild(ring);
    setTimeout(() => ring.remove(), 700);

    // Start canvas flame
    startCellFX(cellEl, 'flame');

    // Screen-space debris burst
    const rect = cellEl.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top  + rect.height/2;
    const colors = ['#ff6600','#ff4400','#ffcc00','#ff8800','#ffff00','#ffffff'];
    for (let i = 0; i < 14; i++) {
      const d = document.createElement('div');
      d.className = 'debris';
      const angle = (i / 14) * Math.PI * 2;
      const speed = 30 + Math.random() * 60;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed - 20;
      const rot = (Math.random()-0.5) * 360;
      d.style.cssText = `left:${cx-2}px;top:${cy-2}px;background:${colors[Math.floor(Math.random()*colors.length)]};--dx:${dx}px;--dy:${dy}px;--dr:${rot}deg;width:${2+Math.random()*4}px;height:${2+Math.random()*4}px;`;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1300);
    }

    if (window.FX) {
      FX.explosion(cx, cy, ['#ff6a00','#ff4400','#ffe600','#ffffff','#ff2200']);
      FX.shake(isSunk ? 8 : 4);
      if (isSunk) FX.screenFlash('#ff4400', 0.2);
    }
  }

  // ── Miss animation: water splash ripple ────────────────────
  function animateMiss(cellEl) {
    if (!cellEl) return;
    cellEl.innerHTML = '';
    const dot = document.createElement('div'); dot.className = 'miss-dot';
    const s1  = document.createElement('div'); s1.className  = 'miss-splash';
    const s2  = document.createElement('div'); s2.className  = 'miss-splash';
    s2.style.animationDelay = '0.15s';
    cellEl.appendChild(dot); cellEl.appendChild(s1); cellEl.appendChild(s2);
    const rect = cellEl.getBoundingClientRect();
    if (window.FX) {
      FX.burst(rect.left+rect.width/2, rect.top+rect.height/2,
        {count:10, colors:['#00a0ff','#0060c0','#00d4ff','#ffffff'],
         speed:3, life:28, size:2, shape:'circle', gravity:0.05});
    }
  }

  // ── Sink animation: ship tilts/sinks + cells switch to smoke ──
  function animateSink(gridId, shipKey, cells) {
    const gridEl = document.getElementById(gridId);
    if (!gridEl) return;

    const cellArr = Array.isArray(cells) ? cells : Object.values(cells);
    const overlay = drawShipOverlay(gridEl, cellArr, shipKey, gridId==='my-grid');

    // Stop flame and start smoke on every cell of the sunk ship
    cellArr.forEach(({r, c}) => {
      const cell = getCellEl(gridId, r, c);
      if (cell) {
        setTimeout(() => {
          stopCellFX(cell);       // kill the flame canvas
          startCellFX(cell, 'smoke'); // start thick smoke
        }, 400);

        const rect = cell.getBoundingClientRect();
        if (window.FX) {
          for (let i=0;i<3;i++) setTimeout(()=>FX.burst(
            rect.left+Math.random()*rect.width, rect.top+rect.height/2,
            {count:5, colors:['#888','#aaa','#555','#333'], speed:2, life:35, size:3, shape:'circle', gravity:-0.12}
          ), i*250);
        }
      }
    });

    // Sink the ship overlay
    if (overlay) {
      setTimeout(() => {
        overlay.classList.add('sinking');
        if (window.FX) {
          const firstCell = getCellEl(gridId, cellArr[0].r, cellArr[0].c);
          if (firstCell) {
            const rect = firstCell.getBoundingClientRect();
            FX.explosion(rect.left+rect.width/2, rect.top+rect.height/2,
              ['#ff6a00','#ff4400','#ffffff','#aaaaaa','#888888']);
          }
        }
      }, 200);
      setTimeout(() => {
        overlay.classList.add('sunk-final');
        overlay.remove();
        // Draw the permanent charred wreck in place of the sunk ship
        const gridEl = document.getElementById(gridId);
        if (gridEl) drawWreckOverlay(gridEl, cellArr, shipKey);
      }, 2900);
    }
  }

  // ── Searchlight: track mouse over enemy grid ──────────────────
  function initSearchlight() {
    const grid = document.getElementById('enemy-grid');
    if (!grid) return;
    grid.addEventListener('mousemove', e => {
      const rect = grid.getBoundingClientRect();
      grid.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      grid.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    });
    grid.addEventListener('mouseleave', () => {
      grid.style.setProperty('--mouse-x', '-200px');
      grid.style.setProperty('--mouse-y', '-200px');
    });
  }

  // ══════════════════════════════════════════════════════════════
  // MISSILE CANVAS SYSTEM
  // Renders all in-flight missiles on a shared fixed canvas overlay.
  // Player missiles: launch from bottom, arc up then dive to target.
  // Enemy missiles:  appear at top, arc down and dive to player grid.
  // ══════════════════════════════════════════════════════════════
  let _mCanvas = null, _mCtx = null, _mRaf = null;
  const _missiles = []; // active missile objects

  // ── roundRect polyfill for Safari < 16 ──────────────────────────
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      const R = Math.min(r instanceof Array ? r[0] : r, w/2, h/2);
      this.moveTo(x+R, y);
      this.lineTo(x+w-R, y); this.quadraticCurveTo(x+w, y, x+w, y+R);
      this.lineTo(x+w, y+h-R); this.quadraticCurveTo(x+w, y+h, x+w-R, y+h);
      this.lineTo(x+R, y+h); this.quadraticCurveTo(x, y+h, x, y+h-R);
      this.lineTo(x, y+R); this.quadraticCurveTo(x, y, x+R, y);
      this.closePath();
    };
  }

  function getMissileCanvas() {
    if (_mCanvas) return _mCanvas;
    _mCanvas = document.createElement('canvas');
    _mCanvas.id = 'bs-missile-canvas';
    _mCanvas.width  = window.innerWidth;
    _mCanvas.height = window.innerHeight;
    document.body.appendChild(_mCanvas);
    _mCtx = _mCanvas.getContext('2d');
    window.addEventListener('resize', () => {
      if (!_mCanvas) return;
      _mCanvas.width  = window.innerWidth;
      _mCanvas.height = window.innerHeight;
    });
    return _mCanvas;
  }

  function startMissileLoop() {
    if (_mRaf) return;
    getMissileCanvas();
    function loop() {
      if (!_missiles.length) { _mRaf = null; _mCtx.clearRect(0,0,_mCanvas.width,_mCanvas.height); return; }
      _mRaf = requestAnimationFrame(loop);
      _mCtx.clearRect(0, 0, _mCanvas.width, _mCanvas.height);
      for (let i = _missiles.length - 1; i >= 0; i--) {
        const m = _missiles[i];
        m.t += m.dt;
        if (m.t >= 1) {
          m.t = 1;
          drawMissileAt(m, m.t);
          _missiles.splice(i, 1);
          m.onLand();
          continue;
        }
        drawMissileAt(m, m.t);
      }
    }
    _mRaf = requestAnimationFrame(loop);
  }

  // Cubic bezier interpolation for parabolic arc
  function bezier(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
  }

  function getMissilePos(m, t) {
    return {
      x: bezier(m.sx, m.cx1, m.cx2, m.tx, t),
      y: bezier(m.sy, m.cy1, m.cy2, m.ty, t),
    };
  }

  function getMissileAngle(m, t) {
    const dt = 0.01;
    const t2 = Math.min(1, t + dt);
    const p1 = getMissilePos(m, t);
    const p2 = getMissilePos(m, t2);
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  // Draw a single realistic missile body at its current position
  function drawMissileAt(m, t) {
    const pos   = getMissilePos(m, t);
    const angle = getMissileAngle(m, t);
    const ctx   = _mCtx;

    // ── Draw exhaust trail (last N positions) ─────────────────
    m.trail.push({ x: pos.x, y: pos.y, age: 0 });
    if (m.trail.length > 48) m.trail.shift();
    for (let j = 0; j < m.trail.length; j++) {
      m.trail[j].age++;
      const tp = m.trail[j];
      const tfade = 1 - tp.age / 48;
      const tr = 3.5 * tfade;
      if (tr < 0.3) continue;

      // Hot core → orange → grey smoke
      const heat = Math.max(0, 1 - tp.age / 12);
      let r, g, b;
      if (heat > 0.6)      { r=255; g=Math.round(140+heat*115); b=40; }   // white-hot
      else if (heat > 0.2) { r=255; g=Math.round(80+heat*200);  b=20; }   // orange
      else                 { r=Math.round(80+tfade*60); g=r; b=r; }        // grey smoke

      const grad = ctx.createRadialGradient(tp.x,tp.y,0,tp.x,tp.y,Math.max(0.01,tr * 2));
      grad.addColorStop(0,   `rgba(${r},${g},${b},${(tfade*0.7).toFixed(2)})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${(tfade*0.3).toFixed(2)})`);
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y,Math.max(0,tr * 2), 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Draw missile body ──────────────────────────────────────
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle + Math.PI / 2); // point nose in direction of travel

    const L  = m.enemy ? 22 : 26;   // body length
    const W  = m.enemy ? 4  : 4.5;  // body width
    const NL = L * 0.32;             // nose length
    const col = m.enemy ? '#ff3a1a' : '#00e8ff'; // enemy=red, player=cyan

    // Body gradient
    const bodyGrad = ctx.createLinearGradient(-W, 0, W, 0);
    bodyGrad.addColorStop(0,   m.enemy ? 'rgba(80,0,0,0.9)'   : 'rgba(0,40,80,0.9)');
    bodyGrad.addColorStop(0.3, m.enemy ? 'rgba(200,40,20,0.95)': 'rgba(0,150,200,0.95)');
    bodyGrad.addColorStop(0.7, m.enemy ? 'rgba(200,40,20,0.95)': 'rgba(0,150,200,0.95)');
    bodyGrad.addColorStop(1,   m.enemy ? 'rgba(80,0,0,0.9)'   : 'rgba(0,40,80,0.9)');

    // === Rear fins ===
    const finColor = m.enemy ? 'rgba(200,30,10,0.85)' : 'rgba(0,180,220,0.85)';
    ctx.fillStyle = finColor;
    // Left fin
    ctx.beginPath();
    ctx.moveTo(-W, L * 0.15);
    ctx.lineTo(-W * 2.8, L * 0.5);
    ctx.lineTo(-W * 1.8, L * 0.55);
    ctx.lineTo(-W * 0.5, L * 0.3);
    ctx.closePath(); ctx.fill();
    // Right fin
    ctx.beginPath();
    ctx.moveTo(W, L * 0.15);
    ctx.lineTo(W * 2.8, L * 0.5);
    ctx.lineTo(W * 1.8, L * 0.55);
    ctx.lineTo(W * 0.5, L * 0.3);
    ctx.closePath(); ctx.fill();
    // Small side fins (mid-body)
    ctx.fillStyle = finColor;
    ctx.beginPath();
    ctx.moveTo(-W, -L * 0.1);
    ctx.lineTo(-W * 2.2, -L * 0.05);
    ctx.lineTo(-W * 1.5, -L * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, -L * 0.1);
    ctx.lineTo(W * 2.2, -L * 0.05);
    ctx.lineTo(W * 1.5, -L * 0.18);
    ctx.closePath(); ctx.fill();

    // === Main cylindrical body ===
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-W, -L * 0.5, W * 2, L, [W * 0.3]);
    ctx.fill();

    // Body highlight stripe
    ctx.fillStyle = m.enemy ? 'rgba(255,100,80,0.35)' : 'rgba(150,240,255,0.35)';
    ctx.beginPath();
    ctx.roundRect(-W * 0.3, -L * 0.48, W * 0.55, L * 0.6, [W * 0.2]);
    ctx.fill();

    // Band markings
    ctx.strokeStyle = m.enemy ? 'rgba(255,80,50,0.6)' : 'rgba(0,240,255,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-W, -L*0.12); ctx.lineTo(W, -L*0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W, -L*0.22); ctx.lineTo(W, -L*0.22); ctx.stroke();

    // === Nose cone (ogive shape) ===
    const noseGrad = ctx.createLinearGradient(-W, -L * 0.5 - NL, W, -L * 0.5 - NL);
    noseGrad.addColorStop(0,   m.enemy ? '#661010' : '#003050');
    noseGrad.addColorStop(0.4, m.enemy ? '#cc3020' : '#00a8d0');
    noseGrad.addColorStop(1,   m.enemy ? '#661010' : '#003050');
    ctx.fillStyle = noseGrad;
    ctx.beginPath();
    ctx.moveTo(-W, -L * 0.5);
    ctx.quadraticCurveTo(-W * 0.4, -L * 0.5 - NL * 0.8, 0, -L * 0.5 - NL);
    ctx.quadraticCurveTo( W * 0.4, -L * 0.5 - NL * 0.8, W, -L * 0.5);
    ctx.closePath(); ctx.fill();

    // Nose tip glow
    ctx.shadowColor = col;
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -L * 0.5 - NL, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // === Engine nozzle ===
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(0, L * 0.5, W * 0.65, W * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // === Engine glow ===
    const nozzleGrad = ctx.createRadialGradient(0,L*0.5,0,0,L*0.5,Math.max(0.01,W*1.8));
    nozzleGrad.addColorStop(0,   'rgba(255,230,120,0.95)');
    nozzleGrad.addColorStop(0.3, 'rgba(255,120,20,0.8)');
    nozzleGrad.addColorStop(0.7, 'rgba(255,60,0,0.4)');
    nozzleGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = nozzleGrad;
    ctx.beginPath();
    ctx.ellipse(0, L * 0.5, W * 1.8, W * 2.5 + Math.random() * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Outer glow around missile
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur  = 14;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 0.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Player missile: launches from bottom, arcs to target cell ────
  function launchMissile(targetCell, onLand, snapRect) {
    getMissileCanvas();
    const rect = snapRect || targetCell.getBoundingClientRect();
    const tx = rect.left + rect.width  / 2;
    const ty = rect.top  + rect.height / 2;

    const sx = window.innerWidth  * 0.5 + (Math.random()-0.5)*80;
    const sy = window.innerHeight + 30;

    // Bezier control points: launch steep upward, then curve to target
    const peakX = sx + (tx - sx) * 0.3;
    const peakY = Math.min(sy, ty) - Math.max(160, Math.abs(tx-sx)*0.7);

    const m = {
      sx, sy, tx, ty,
      cx1: peakX,         cy1: peakY - 60,
      cx2: tx + (sx-tx)*0.15, cy2: ty - 80,
      t: 0, dt: 1 / (Math.max(380, Math.min(620, Math.hypot(tx-sx, ty-sy)*0.85)) / 7),
      trail: [], onLand, enemy: false,
    };
    _missiles.push(m);
    startMissileLoop();
  }

  // ── Enemy missile: drops from above onto player's my-grid cell ───
  function launchEnemyMissile(targetCell, onLand) {
    getMissileCanvas();
    if (!targetCell) { onLand(); return; }
    const rect = targetCell.getBoundingClientRect();
    const tx = rect.left + rect.width  / 2;
    const ty = rect.top  + rect.height / 2;

    // Launch from random position high above the target
    const sx = tx + (Math.random()-0.5) * window.innerWidth * 0.6;
    const sy = -40;

    const peakX = sx + (tx-sx)*0.35;
    const peakY = sy - Math.max(80, Math.abs(tx-sx)*0.4);

    const m = {
      sx, sy, tx, ty,
      cx1: peakX,     cy1: peakY,
      cx2: tx + (sx-tx)*0.2, cy2: ty - 60,
      t: 0, dt: 1 / (Math.max(340, Math.min(580, Math.hypot(tx-sx, ty-sy)*0.75)) / 7),
      trail: [], onLand, enemy: true,
    };
    _missiles.push(m);
    startMissileLoop();
  }

  // ── Intercept enemy grid clicks to trigger missile ──────────────
  function hookMissileOnEnemyGrid() {
    const grid = document.getElementById('enemy-grid');
    if (!grid || grid._missileHooked) return;
    grid._missileHooked = true;

    grid.addEventListener('click', e => {
      const cell = e.target.closest('.grid-cell');
      if (!cell) return;
      // Only intercept untargeted cells
      if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;
      // Don't double-intercept
      if (cell._missileInFlight) return;
      // Block missile animation when it's not your turn or enemy is animating
      const ti = document.getElementById('turn-indicator');
      if (ti && ti.className.includes('their-turn')) return;
      if (state._enemyAnimating) return;

      const r = parseInt(cell.dataset.r);
      const c = parseInt(cell.dataset.c);
      if (isNaN(r) || isNaN(c)) return;

      // Block the original click — we'll call fireShot directly on landing
      e.stopImmediatePropagation();
      e.preventDefault();

      cell._missileInFlight = true;

      // Snapshot the cell rect now (before any DOM changes)
      const snapRect = cell.getBoundingClientRect();

      launchMissile(cell, () => {
        cell._missileInFlight = false;
        // Call fireShot directly using captured r/c — no cell reference needed
        if (typeof fireShot === 'function') {
          fireShot(r, c, true); // true = called from missile, bypass turn-indicator guard
        }
      }, snapRect);
    }, true); // capture phase — runs before cell.onclick
  }

  // ── Patch animateMiss to add sonar ping ripple ──────────────────
  // (replaces base animateMiss with enhanced version using canvas ripple)
  function animateMissEnhanced(cellEl) {
    if (!cellEl) return;
    cellEl.innerHTML = '';
    const dot = document.createElement('div'); dot.className = 'miss-dot';
    const s1  = document.createElement('div'); s1.className  = 'miss-splash';
    const s2  = document.createElement('div'); s2.className  = 'miss-splash';
    s2.style.animationDelay = '0.15s';
    cellEl.appendChild(dot); cellEl.appendChild(s1); cellEl.appendChild(s2);

    const rect = cellEl.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;

    if (window.FX) {
      // Water droplets
      FX.burst(cx, cy, { count: 14, colors: ['#00b4ff','#0070d0','#00e0ff','#aaddff','#ffffff'],
        speed: 4.5, life: 35, size: 2.5, shape: 'circle', gravity: 0.12 });
      // Sonar ping flash
      FX.screenFlash('#0088ff', 0.06, 3);
    }
  }

  // ── Patch animateHit with enhanced shockwave ────────────────────
  function animateHitEnhanced(cellEl, isSunk) {
    if (!cellEl) return;
    [...cellEl.children].forEach(ch => {
      if (!ch.classList.contains('ship-overlay') && !ch.classList.contains('cell-fx-canvas')) ch.remove();
    });

    const ring = document.createElement('div'); ring.className = 'hit-ring';
    cellEl.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
    startCellFX(cellEl, 'flame');

    const rect = cellEl.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const colors = ['#ff6600','#ff4400','#ffcc00','#ff8800','#ffff00','#ffffff'];

    // Debris burst
    for (let i = 0; i < (isSunk ? 22 : 14); i++) {
      const d = document.createElement('div');
      d.className = 'debris';
      const angle = (i / (isSunk ? 22 : 14)) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (isSunk ? 45 : 30) + Math.random() * 65;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed - (isSunk ? 30 : 20);
      const rot = (Math.random()-0.5) * 400;
      const sz  = 2 + Math.random() * (isSunk ? 6 : 4);
      d.style.cssText = `left:${cx-sz/2}px;top:${cy-sz/2}px;background:${colors[i%colors.length]};--dx:${dx}px;--dy:${dy}px;--dr:${rot}deg;width:${sz}px;height:${sz}px;`;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1300);
    }

    if (window.FX) {
      FX.explosion(cx, cy, ['#ff6a00','#ff4400','#ffe600','#ffffff','#ff2200']);
      FX.shake(isSunk ? 10 : 5);
      if (isSunk) {
        FX.screenFlash('#ff4400', 0.25);
        // Second shockwave burst after brief delay
        setTimeout(() => FX.explosion(cx, cy, ['#ff8800','#ffcc00','#ffffff']), 180);
      }
    }
  }

  // ── Patch the visual engine to use enhanced versions ───────────
  // We override the module-scoped functions by monkey-patching via the
  // MutationObserver hook — the observer calls animateHit/animateMiss
  // from this closure scope, so we just reassign them.
  const _origAnimateHit  = animateHit;
  const _origAnimateMiss = animateMiss;
  // Swap to enhanced:
  // Note: can't reassign const functions in strict mode, so we patch via
  // the observer path. We'll expose them on bsVisuals.
  window.bsVisuals = { animateHit: animateHitEnhanced, animateMiss: animateMissEnhanced, launchMissile, launchEnemyMissile };

  // ── Patch the MutationObserver-triggered calls ─────────────────
  // The watchGrid function calls animateHit/animateMiss — replace those
  // at call sites via global bsVisuals lookups:

  // ── Patch buildMyGrid / buildEnemyGrid to add wave offsets + animations ──
  const _origBuildMyGrid    = window.buildMyGrid    || (() => {});
  const _origBuildEnemyGrid = window.buildEnemyGrid || (() => {});

  // Override by patching the functions called AFTER grid is built
  // We hook the state object to detect changes
  function hookStateForAnimations() {
    if (!window.bsState) { setTimeout(hookStateForAnimations, 200); return; }

    // Mirror state reference for our use
    window.bsState = state;

    // Patch fireShot to trigger animations
    const _origFireShot = window.fireShot || (() => {});

    // Patch npcTurn to trigger my-grid animations
    const _origDoNpcTurn = window.doNpcTurn || null;

    // Monitor DOM changes on both grids to add cell animations
    function watchGrid(gridId) {
      const grid = document.getElementById(gridId);
      if (!grid) return;

      const obs = new MutationObserver(mutations => {
        // When grid is rebuilt (many new cells), reapply ocean
        const hasRebuild = mutations.some(m => m.type === 'childList' && m.addedNodes.length > 5);
        if (hasRebuild) {
          setTimeout(() => {
            applyOceanToGrid(gridId);
            redrawAllShipOverlays();
          }, 30);
        } else {
          // Individual cell added (ship placement grid)
          mutations.forEach(m => {
            if (m.type === 'childList') m.addedNodes.forEach(n => {
              // individual cell — ocean is a full-grid canvas, no per-cell work needed
            });
          });
        }

        // Watch class changes on individual cells
        mutations.forEach(m => {
          if (m.type !== 'attributes' || !m.target.classList) return;
          const cell = m.target;
          const old  = m.oldValue || '';

          if (!old.includes('hit') && cell.classList.contains('hit')) {
            const isSunk = cell.classList.contains('sunk') || cell.classList.contains('sunk-ship');
            (window.bsVisuals ? window.bsVisuals.animateHit : animateHit)(cell, isSunk);
          } else if (!old.includes('sunk') && (cell.classList.contains('sunk-ship') || cell.classList.contains('sunk'))) {
            (window.bsVisuals ? window.bsVisuals.animateHit : animateHit)(cell, true);
          } else if (!old.includes('miss') && cell.classList.contains('miss')) {
            (window.bsVisuals ? window.bsVisuals.animateMiss : animateMiss)(cell);
          }
        });
      });

      obs.observe(grid, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['class'], attributeOldValue: true
      });
    }

    watchGrid('enemy-grid');
    watchGrid('my-grid');
    watchGrid('placement-grid');
  }

  // ── Intercept sunk events ───────────────────────────────────
  // Patch addLog to detect sunk messages and trigger sink animation
  const _origAddLog = window.addLog;
  if (typeof _origAddLog === 'function') {
    window.addLog = function(msg, type) {
      _origAddLog(msg, type);
      if (type === 'sunk' && window.state) {
        // Parse which ship was sunk
        const sunkMatch = msg.match(/SUNK[!]?\s+(\w+)/i) || msg.match(/SUNK your (\w+)/i);
        const shipKey = sunkMatch ? sunkMatch[1].toLowerCase() : null;

        if (msg.includes('BOT:') || msg.includes('your')) {
          // NPC sank my ship
          if (shipKey && state.placedShips[shipKey]) {
            setTimeout(() => animateSink('my-grid', shipKey, state.placedShips[shipKey]), 300);
          }
        } else {
          // I sank enemy ship
          if (shipKey && state.npcShips && state.npcShips[shipKey]) {
            setTimeout(() => animateSink('enemy-grid', shipKey, state.npcShips[shipKey]), 300);
          }
          // Redraw overlays to show the newly revealed ship
          setTimeout(redrawAllShipOverlays, 3200);
        }
      }
    };
  }

  // ── Init ────────────────────────────────────────────────────
  // Watch only the game-screen element for active class changes
  let _bsInitDone = false;
  const _gsEl = document.getElementById('game-screen');
  const initObs = new MutationObserver(() => {
    if (!_bsInitDone && _gsEl && _gsEl.classList.contains('active')) {
      _bsInitDone = true;
      setTimeout(() => {
        applyOceanToGrid('enemy-grid');
        applyOceanToGrid('my-grid');
        hookStateForAnimations();
        initSearchlight();
        hookMissileOnEnemyGrid();
        setTimeout(redrawAllShipOverlays, 300);
      }, 50);
    }
    const ps = document.getElementById('placement-grid');
    if (ps && ps.children.length > 10) applyOceanToGrid('placement-grid');
  });
  if (_gsEl) {
    initObs.observe(_gsEl, {attributes: true, attributeFilter: ['class']});
  }
  // No document.body fallback — BSVisuals.initForGameScreen() is called directly from startGame()

  // Also redraw on window resize (debounced)
  let _bsResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_bsResizeTimer);
    _bsResizeTimer = setTimeout(redrawAllShipOverlays, 150);
  });

  // Expose for external use (multiplayer sync)
  window.BSVisuals = { animateHit, animateMiss, animateSink, redrawAllShipOverlays };

})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  GAME SELECT — CARD CLICK PARTICLES                        ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchGameSelect() {
  // Click → big burst
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.game-card:not(.locked)');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    FX.burst(rect.left+rect.width/2, rect.top+rect.height/2, {
      count:30, colors:['#00f5ff','#ff2d78','#ffe600','#39ff14'],
      speed:8, life:50, size:4, shape:'star', gravity:0.2,
    });
    FX.screenFlash('#00f5ff', 0.15);
  });
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  BUBBLE BREAKER — POP PARTICLES (canvas-level)             ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchBubbleBreaker() {
  const wait = setInterval(() => {
    const canvas = document.getElementById('bb-canvas');
    if (!canvas) return;
    clearInterval(wait);

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX;
      const cy = e.clientY;
      setTimeout(() => {
        // Burst at click point with bubble breaker colors
        FX.burst(cx, cy, {
          count: 25,
          colors: ['#ff2d78','#00f5ff','#39ff14','#ff6a00','#bf00ff','#ffe600'],
          speed: 5, life: 50, size: 4, shape: 'circle', gravity: 0.12,
        });
      }, 30);
    });
  }, 300);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  POOL — BALL POCKET + BREAK PARTICLES (canvas-level)       ║
// ╚══════════════════════════════════════════════════════════════╝
(function patchPool() {
  // We'll watch the pool score/status for pocket events
  const wait = setInterval(() => {
    const ps = document.getElementById('pool-screen');
    if (!ps) return;
    clearInterval(wait);

    const scoreEl = document.getElementById('pool-my-score');
    if (!scoreEl) return;

    let lastScore = 0;
    const obs = new MutationObserver(() => {
      const s = parseInt(scoreEl.textContent||'0');
      if (s > lastScore) {
        // Ball potted! Particle splash at a corner pocket area
        const canvas = document.getElementById('pool-canvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          // Simulate pocket at corner
          const px = rect.left + (Math.random()<0.5 ? rect.width*0.05 : rect.width*0.95);
          const py = rect.top  + (Math.random()<0.5 ? rect.height*0.05 : rect.height*0.95);
          FX.burst(px, py, {
            count: 20,
            colors: ['#ffffff','#ffe600','#39ff14','#00f5ff'],
            speed: 4, life: 40, size: 3, shape: 'circle', gravity: 0.1,
          });
        }
        lastScore = s;
      }
    });
    obs.observe(scoreEl, {childList:true, characterData:true, subtree:true});
  }, 400);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  ENHANCED CANVAS BACKGROUND: TETRIS — moving grid lines    ║
// ╚══════════════════════════════════════════════════════════════╝
// Tetris and Snake already enhanced via drawCell patches above.
// Additional: inject a persistent "LEVEL UP" flash effect
(function levelUpFlash() {
  const wait = setInterval(() => {
    const levelEl = document.getElementById('tet-level');
    if (!levelEl) return;
    clearInterval(wait);
    let lastLevel = 1;
    const obs = new MutationObserver(() => {
      const lvl = parseInt(levelEl.textContent||'1');
      if (lvl > lastLevel) {
        FX.confetti(window.innerWidth/2, window.innerHeight*0.4);
        FX.screenFlash('#ffe600', 0.3);
        FX.shake(6);
        lastLevel = lvl;
      }
    });
    obs.observe(levelEl, {childList:true, characterData:true, subtree:true});
  }, 400);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  WIN/LOSE OVERLAY UNIVERSAL FIREWORKS                      ║
// ╚══════════════════════════════════════════════════════════════╝
(function universalOverlayFX() {
  // Watch all overlays for win/lose state transitions
  const overlayIds = [
    'end-overlay','hm-overlay','tet-overlay','snk-overlay',
    'pb-overlay','rc-overlay','wrd-overlay','c4-overlay',
    'bb-end-overlay','trivia-end-overlay','zm-overlay',
  ];

  function attachObs(el) {
    if (!el) return;
    const obs = new MutationObserver(() => {
      if (!el.classList.contains('active')) return;
      // Check for win/victory text
      const winEl = el.querySelector('.win, [class*="win"]');
      const loseEl = el.querySelector('.lose, [class*="lose"], [class*="over"]');
      if (winEl && getComputedStyle(winEl).color.includes('0, 245') || 
          el.querySelector('.win, .victory, .c4-ov-title')) {
        // Fireworks volley
        const doVolley = (times) => {
          if (times <= 0) return;
          setTimeout(() => {
            FX.explosion(
              window.innerWidth*(0.1+Math.random()*0.8),
              window.innerHeight*(0.1+Math.random()*0.5),
              ['#00f5ff','#ffe600','#ff2d78','#39ff14','#bf00ff','#ff6a00']
            );
            doVolley(times-1);
          }, 300);
        };
        doVolley(5);
      }
    });
    obs.observe(el, {attributes:true, attributeFilter:['class']});
  }

  const setupObs = () => {
    overlayIds.forEach(id => attachObs(document.getElementById(id)));
  };
  // Try now and again after 1s for dynamically created overlays
  setupObs();
  setTimeout(setupObs, 1000);
  setTimeout(setupObs, 3000);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  ROAD RACER — ENHANCED PLAYER CAR GLOW + SPEED LINES      ║
// ╚══════════════════════════════════════════════════════════════╝
// Inject speed line effect into racer canvas via CSS filter
(function racerEnhance() {
  const wait = setInterval(() => {
    const canvas = document.getElementById('rc-canvas');
    if (!canvas) return;
    clearInterval(wait);

    // Enhance player car color to neon
    // The drawCar is already called with '#00d4ff' — we already patched road
    // Add: when racer screen active, inject speed-line overlay via FX canvas
    const rcScreen = document.getElementById('racer-screen');
    if (!rcScreen) return;

    // Watch for racer screen becoming active
    const obs = new MutationObserver(() => {
      if (rcScreen.classList.contains('active')) {
        // Speed particles from top → bottom when screen first activates
        for (let i=0; i<10; i++) {
          setTimeout(() => {
            FX.burst(
              Math.random()*window.innerWidth,
              0,
              {count:1, colors:['rgba(255,230,0,0.6)'], speed:0, life:30, size:1, gravity:8, shape:'spark'}
            );
          }, i*100);
        }
      }
    });
    obs.observe(rcScreen, {attributes:true, attributeFilter:['class']});
  }, 300);
})();


// ╔══════════════════════════════════════════════════════════════╗
// ║  GLOBAL BUTTON CLICK SPARK                                 ║
// ╚══════════════════════════════════════════════════════════════╝
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn, .tet-btn, .snk-btn, .pb-btn, .hm-btn, .rc-btn, .wrd-btn, .c4-btn, .bb-ctrl-btn, .ms-diff-btn, .sol-btn, .trv-next-btn, .trv-answer-btn, .hs-btn');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
  FX.spark(cx, cy, '#00f5ff', 6);
}, true);

</script>
<!-- ============================================================ -->
<!-- GUESS WHO — SCREEN HTML                                      -->
<!-- ============================================================ -->

<!-- Lobby / mode select -->
<div class="screen" id="guesswho-lobby-screen">
  <div class="card" style="max-width:460px;width:100%">
    <h2>🎭 GUESS WHO</h2>
    <p style="color:var(--dim);font-size:0.72rem;letter-spacing:0.1em;text-align:center;margin-bottom:20px">40 RANDOM CHARACTERS · YES/NO QUESTIONS</p>
    <div id="gw-lobby-entry">
      <input type="text" id="gw-name" placeholder="Your name..." maxlength="14" style="margin-bottom:12px">
      <button class="btn" onclick="GW.startVsAI()">🤖 PLAY VS AI</button>
      <div style="text-align:center;font-size:0.6rem;color:var(--dim);letter-spacing:0.15em;margin:12px 0">— OR PLAY ONLINE —</div>
      <button class="btn" onclick="GW.hostOnline()" style="border-color:#f472b6;color:#f472b6">🏠 HOST GAME</button>
      <div style="font-size:0.62rem;color:var(--dim);letter-spacing:0.12em;text-align:center;margin:10px 0 6px">— OR JOIN OPEN GAME —</div>
      <div class="lobby-list-scroll" id="gw-lobby-list" style="max-height:160px"><div class="lobby-list-loading">SCANNING—</div></div>
    </div>
    <div id="gw-lobby-room" style="display:none">
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:0.65rem;color:var(--dim);letter-spacing:0.18em">ROOM CODE</div>
        <div id="gw-room-code" style="font-size:1.6rem;color:#f472b6;letter-spacing:0.3em;font-family:'Orbitron',sans-serif;text-shadow:0 0 14px rgba(244,114,182,0.7)"></div>
      </div>
      <div id="gw-lobby-status" style="text-align:center;font-size:0.7rem;color:var(--dim);letter-spacing:0.12em;min-height:24px"></div>
    </div>
    <button class="arcade-back-btn" onclick="GW.destroy();backToGameSelect()">🕹 ARCADE</button>
  </div>
</div>

<!-- Main game screen -->
<div class="screen" id="guesswho-screen">
<style>
#guesswho-screen {
  background: #060e1a;
  font-family: 'Share Tech Mono', monospace;
  overflow-y: auto !important;
  overflow-x: hidden;
  padding: 0 !important;
}
.gw-layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-height: 100%;
  padding: 10px;
  gap: 10px;
  max-width: 960px;
  margin: 0 auto;
}
.gw-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(0,212,255,0.04);
  border: 1px solid rgba(244,114,182,0.2);
  border-radius: 3px;
  flex-wrap: wrap;
  gap: 8px;
}
.gw-status-msg {
  font-size: var(--fs-sm);
  color: #f472b6;
  letter-spacing: 0.1em;
  text-align: center;
  flex: 1;
}
.gw-turn-badge {
  font-size: var(--fs-xs);
  padding: 3px 10px;
  border: 1px solid #f472b6;
  color: #f472b6;
  letter-spacing: 0.12em;
  border-radius: 2px;
  white-space: nowrap;
}
.gw-turn-badge.opponent { border-color: var(--dim); color: var(--dim); }

.gw-main {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
/* Board of 24 characters — 6 cols × 4 rows */
.gw-board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 5px;
  flex: 1;
}
.gw-card {
  position: relative;
  background: var(--panel);
  border: 1px solid rgba(244,114,182,0.25);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  aspect-ratio: 0.68;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  background-size: 100% 100%;
  user-select: none;
}
.gw-card:hover:not(.gw-eliminated) { border-color: #f472b6; box-shadow: 0 0 10px rgba(244,114,182,0.3); }
.gw-card.gw-eliminated {
  opacity: 0.18;
  cursor: default;
  pointer-events: none;
}
.gw-card.gw-secret {
  border-color: #f472b6;
  box-shadow: 0 0 14px rgba(244,114,182,0.6), inset 0 0 12px rgba(244,114,182,0.08);
}
.gw-card.gw-selected {
  border-color: #ffe600;
  box-shadow: 0 0 14px rgba(255,230,0,0.5);
}
.gw-card-face {
  font-size: clamp(1.2rem, 2.5vw, 1.8rem);
  line-height: 1;
  padding-top: 18%;
  flex-shrink: 0;
}
.gw-card-name {
  font-size: clamp(0.52rem, 1.1vw, 0.72rem);
  letter-spacing: 0.04em;
  color: var(--text);
  text-align: center;
  padding: 4px 3px 0;
  line-height: 1.25;
}
.gw-card-tag {
  font-size: clamp(0.38rem, 0.7vw, 0.5rem);
  color: var(--dim);
  text-align: center;
  padding: 2px 3px 4px;
  line-height: 1.2;
}
.gw-card .gw-x {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(1.4rem, 3vw, 2.2rem);
  color: rgba(255,60,60,0.5);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.gw-card.gw-eliminated .gw-x { opacity: 1; }

/* Side panel: secret card + question log */
.gw-side {
  width: clamp(150px, 22%, 200px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.gw-secret-panel {
  background: rgba(244,114,182,0.06);
  border: 1px solid rgba(244,114,182,0.3);
  border-radius: 4px;
  padding: 8px;
  text-align: center;
}
.gw-secret-label {
  font-size: var(--fs-xs);
  color: #f472b6;
  letter-spacing: 0.18em;
  margin-bottom: 6px;
}
.gw-secret-face { font-size: 2.4rem; line-height: 1; }
.gw-secret-name { font-size: var(--fs-xs); color: var(--text); letter-spacing: 0.1em; margin-top: 4px; }

.gw-log {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(0,212,255,0.1);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: var(--fs-xs);
  color: var(--dim);
  letter-spacing: 0.08em;
  line-height: 1.6;
  max-height: 180px;
  overflow-y: auto;
  flex: 1;
}
.gw-log-entry { margin-bottom: 3px; }
.gw-log-entry.q { color: var(--text); }
.gw-log-entry.yes { color: #39ff14; }
.gw-log-entry.no  { color: #ff4444; }
.gw-log-entry.sys { color: #f472b6; }

/* Question controls */
.gw-controls {
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(244,114,182,0.15);
  border-radius: 4px;
  padding: 8px 10px;
}
.gw-controls-title {
  font-size: var(--fs-xs);
  color: var(--dim);
  letter-spacing: 0.18em;
  margin-bottom: 8px;
  text-align: center;
}
.gw-q-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-bottom: 8px;
}
.gw-q-btn {
  padding: 5px 4px;
  background: transparent;
  border: 1px solid rgba(244,114,182,0.3);
  color: rgba(244,114,182,0.8);
  font-family: 'Share Tech Mono', monospace;
  font-size: var(--fs-xs);
  letter-spacing: 0.05em;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.15s;
  text-align: center;
  line-height: 1.3;
}
.gw-q-btn:hover { background: rgba(244,114,182,0.1); border-color: #f472b6; }
.gw-q-btn:disabled { opacity: 0.3; cursor: default; pointer-events: none; }

.gw-answer-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 8px;
}
.gw-yes-btn, .gw-no-btn {
  padding: 7px;
  font-family: 'Share Tech Mono', monospace;
  font-size: var(--fs-sm);
  cursor: pointer;
  border-radius: 2px;
  letter-spacing: 0.12em;
  transition: all 0.15s;
  border: none;
}
.gw-yes-btn { background: rgba(57,255,20,0.15); color: #39ff14; border: 1px solid #39ff14; }
.gw-yes-btn:hover { background: rgba(57,255,20,0.28); }
.gw-no-btn  { background: rgba(255,68,68,0.15);  color: #ff4444; border: 1px solid #ff4444; }
.gw-no-btn:hover  { background: rgba(255,68,68,0.28); }

.gw-guess-btn {
  width: 100%;
  padding: 7px;
  background: rgba(244,114,182,0.12);
  border: 1px solid #f472b6;
  color: #f472b6;
  font-family: 'Share Tech Mono', monospace;
  font-size: var(--fs-sm);
  cursor: pointer;
  letter-spacing: 0.12em;
  border-radius: 2px;
  transition: all 0.15s;
}
.gw-guess-btn:hover { background: rgba(244,114,182,0.25); }
.gw-guess-btn:disabled { opacity: 0.3; cursor: default; }

/* End overlay */
#gw-end-overlay {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(6,14,26,0.92);
  z-index: 50;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 14px;
  text-align: center;
}
#gw-end-overlay.active { display: flex; }
#gw-end-title { font-family: 'Orbitron', sans-serif; font-size: clamp(1.2rem,3vw,2rem); color: #f472b6; text-shadow: 0 0 20px rgba(244,114,182,0.8); }
#gw-end-msg { font-size: var(--fs-sm); color: var(--text); letter-spacing: 0.12em; }
</style>

<div class="gw-layout">
  <div class="gw-topbar">
    <div class="gw-turn-badge" id="gw-my-badge">YOU</div>
    <div class="gw-status-msg" id="gw-status">—</div>
    <div class="gw-turn-badge opponent" id="gw-opp-badge">OPPONENT</div>
    <button class="arcade-back-btn" onclick="GW.destroy();backToGameSelect()">🕹 ARCADE</button>
  </div>

  <div class="gw-main">
    <div class="gw-board" id="gw-board"></div>

    <div class="gw-side">
      <div class="gw-secret-panel">
        <div class="gw-secret-label">MY PERSON</div>
        <div class="gw-secret-face" id="gw-my-face">?</div>
        <div class="gw-secret-name" id="gw-my-name">—</div>
      </div>
      <div class="gw-log" id="gw-log"></div>
    </div>
  </div>

  <div class="gw-controls" id="gw-controls">
    <div class="gw-controls-title" id="gw-ctrl-label">ASK A QUESTION</div>
    <!-- Question buttons -->
    <div class="gw-q-grid" id="gw-q-grid"></div>
    <!-- Answer row (shown when opponent asks us) -->
    <div class="gw-answer-row" id="gw-answer-row" style="display:none">
      <button class="gw-yes-btn" onclick="GW.answerQuestion(true)">✓ YES</button>
      <button class="gw-no-btn"  onclick="GW.answerQuestion(false)">✗ NO</button>
    </div>
    <button class="gw-guess-btn" id="gw-guess-btn" onclick="GW.enterGuessMode()">🎯 MAKE A GUESS</button>
  </div>

  <div id="gw-end-overlay">
    <div id="gw-end-title">—</div>
    <div id="gw-end-msg"></div>
    <button class="btn" onclick="GW.newGame()" style="margin-top:6px">🔄 PLAY AGAIN</button>
    <button class="arcade-back-btn" onclick="GW.destroy();backToGameSelect()">🕹 ARCADE</button>
  </div>
</div>
</div>

<script>
// ============================================================
// GUESS WHO ENGINE
// ============================================================
window.GW = (function() {
