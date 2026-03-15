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
