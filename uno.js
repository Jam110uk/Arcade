// UNO game module
// Auto-extracted from monolithic index.html

export default (() => {
  // ── Constants ────────────────────────────────────────────────
  const COLORS = ['red','blue','green','yellow'];
  const NUMS   = ['0','1','2','3','4','5','6','7','8','9'];
  const ACTS   = ['skip','reverse','draw2'];
  const GLYPHS = { skip:'⊘', reverse:'⇄', draw2:'+2', wild:'✦', wilddraw4:'✦+4' };

  // ── State ─────────────────────────────────────────────────────
  let deck=[], drawPile=[], discardPile=[];
  let players=[];   // [{name, hand, isAI, isMe}]
  let currentPlayer=0, direction=1; // direction: 1=clockwise, -1=reverse
  let pendingDraws=0;  // stacked draw penalties
  let wildColor=null;  // chosen colour after wild
  let gameOver=false;
  let selectedIdx=-1;
  let calledUno=false; // did current player press UNO before going to 1 card?

  let isMulti=false;
  let roomCode=null, myPlayerIdx=0, myName='', unsubs=[];
  let pendingColorPick=false;  // waiting for local colour pick before pushing to firebase


  // ── Deck Builder ──────────────────────────────────────────────
  function buildDeck() {
    const d=[];
    for(const c of COLORS){
      d.push({color:c,type:'num',value:'0'});
      for(const n of NUMS.slice(1)) for(let i=0;i<2;i++) d.push({color:c,type:'num',value:n});
      for(const a of ACTS) for(let i=0;i<2;i++) d.push({color:c,type:a,value:a});
    }
    for(let i=0;i<4;i++) d.push({color:'wild',type:'wild',value:'wild'});
    for(let i=0;i<4;i++) d.push({color:'wild',type:'wilddraw4',value:'wilddraw4'});
    return d;
  }

  function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

  function dealHands(n){ return Array.from({length:n},()=>drawPile.splice(0,7)); }

  function topCard(){ return discardPile[discardPile.length-1]; }

  // ── Playability ───────────────────────────────────────────────
  function canPlay(card){
    if(pendingDraws>0){
      // Only draw2 can stack on draw2 (standard: no stacking, player just draws)
      return false;
    }
    const top=topCard();
    const effectColor = wildColor || top.color;
    if(card.type==='wild'||card.type==='wilddraw4') return true;
    if(card.color===effectColor) return true;
    if(card.type==='num'&&top.type==='num'&&card.value===top.value) return true;
    if(card.type!=='num'&&card.type===top.type) return true;
    return false;
  }

  function hasPlayable(hand){ return hand.some(c=>canPlay(c)); }

  // ── Card rendering ────────────────────────────────────────────
  function cardColor(card){
    if(card.type==='wild'||card.type==='wilddraw4'){
      return wildColor && discardPile[discardPile.length-1]===card ? wildColor : 'wild';
    }
    return card.color;
  }

  function cardLabel(card){
    if(card.type==='num') return card.value;
    return GLYPHS[card.type]||card.type;
  }

  function makeCardEl(card, idx, clickable, selected){
    const el=document.createElement('div');
    const cc = (card.color==='wild' && wildColor && discardPile[discardPile.length-1]===card) ? wildColor : card.color;
    el.className='uno-card '+cc+(clickable&&canPlay(card)?' playable':'')+(selected?' selected':'');
    const lbl=cardLabel(card);
    const isText=card.type!=='num';
    el.innerHTML=`
      <div class="uno-corner tl">${lbl}</div>
      <div class="uno-center ${isText?'text':''}">${lbl}</div>
      <div class="uno-corner br">${lbl}</div>
    `;
    if(clickable){
      el.addEventListener('click',()=>UNO.selectCard(idx));
    }
    return el;
  }

  function makeDiscardEl(card){
    const el=document.createElement('div');
    const cc = wildColor || card.color;
    el.className='uno-card '+cc;
    const lbl=cardLabel(card);
    const isText=card.type!=='num';
    el.innerHTML=`
      <div class="uno-corner tl">${lbl}</div>
      <div class="uno-center ${isText?'text':''}">${lbl}</div>
      <div class="uno-corner br">${lbl}</div>
    `;
    return el;
  }

  // ── Rendering ─────────────────────────────────────────────────
  function render(){
    if(gameOver) return;
    renderOpponents();
    renderDiscard();
    renderHand();
    renderActions();
    renderStatus();
  }

  function renderOpponents(){
    const el=document.getElementById('uno-opponents');
    if(!el) return;
    el.innerHTML='';
    for(let i=0;i<players.length;i++){
      if(i===myPlayerIdx) continue;
      const p=players[i];
      const tag=document.createElement('div');
      const isCurrent=i===currentPlayer;
      const isUno=p.hand.length===1;
      tag.className='uno-opp-tag'+(isCurrent?' active':'')+(isUno?' uno-call':'');
      tag.innerHTML=`<span>${p.name}</span><span class="uno-opp-count">${p.hand.length}🃏</span>`;
      el.appendChild(tag);
    }
  }

  function renderDiscard(){
    const el=document.getElementById('uno-discard');
    if(!el||!discardPile.length) return;
    el.innerHTML='';
    el.appendChild(makeDiscardEl(topCard()));
  }

  function renderHand(){
    const el=document.getElementById('uno-hand');
    if(!el) return;
    el.innerHTML='';
    const me=players[myPlayerIdx];
    if(!me) return;
    const isMyTurn=currentPlayer===myPlayerIdx&&!gameOver;
    me.hand.forEach((card,i)=>{
      el.appendChild(makeCardEl(card,i,isMyTurn,selectedIdx===i));
    });
  }

  function renderActions(){
    const playBtn=document.getElementById('uno-play-btn');
    const unoBtn=document.getElementById('uno-uno-btn');
    if(!playBtn||!unoBtn) return;
    const isMyTurn=currentPlayer===myPlayerIdx&&!gameOver;
    playBtn.style.display=(isMyTurn&&selectedIdx>=0)?'':'none';
    // Show UNO button when player has 2 cards and one is playable (about to go to 1)
    const me=players[myPlayerIdx];
    const showUno=isMyTurn&&me&&me.hand.length===2&&!calledUno;
    unoBtn.style.display=showUno?'':'none';
  }

  function renderStatus(){
    const el=document.getElementById('uno-status');
    if(!el) return;
    if(currentPlayer===myPlayerIdx){
      if(pendingDraws>0) el.textContent=`Draw ${pendingDraws} cards!`;
      else el.textContent='Your turn';
    } else {
      el.textContent=`${players[currentPlayer]?.name}'s turn…`;
    }
  }

  // ── Core game actions ─────────────────────────────────────────
  function nextPlayer(){
    currentPlayer=(currentPlayer+direction+players.length)%players.length;
  }

  function applyCardEffect(card, chosenColor){
    wildColor=null;
    if(card.type==='skip'){
      nextPlayer(); // skip next
    } else if(card.type==='reverse'){
      direction*=-1;
      if(players.length===2) nextPlayer(); // in 2-player reverse acts as skip
    } else if(card.type==='draw2'){
      pendingDraws+=2;
    } else if(card.type==='wilddraw4'){
      pendingDraws+=4;
      wildColor=chosenColor;
    } else if(card.type==='wild'){
      wildColor=chosenColor;
    }
  }

  function drawFromPile(n){
    const drawn=[];
    for(let i=0;i<n;i++){
      if(!drawPile.length){
        // Reshuffle discard except top
        const top=discardPile.pop();
        drawPile=shuffle(discardPile);
        discardPile=[top];
        if(!drawPile.length) break;
      }
      drawn.push(drawPile.pop());
    }
    return drawn;
  }

  function checkWin(playerIdx){
    if(players[playerIdx].hand.length===0){
      endGame(playerIdx);
      return true;
    }
    return false;
  }

  function endGame(winnerIdx){
    gameOver=true;
    const winner=players[winnerIdx];
    const ov=document.getElementById('uno-result-overlay');
    const title=document.getElementById('uno-result-title');
    const sub=document.getElementById('uno-result-sub');
    const btns=document.getElementById('uno-result-btns');
    if(!ov) return;
    const isMyWin=winnerIdx===myPlayerIdx;
    title.className='uno-ov-title'+(isMyWin?' win':'');
    title.textContent=isMyWin?'🏆 UNO — YOU WIN!':'GAME OVER';
    sub.textContent=isMyWin?'You played your last card!':winner.name+' has won the game!';
    btns.innerHTML='';
    if(!isMulti){
      const again=document.createElement('button');
      again.className='btn'; again.textContent='▶ PLAY AGAIN';
      again.style.cssText='border-color:#ff4757;color:#ff4757;padding:10px 20px';
      again.onclick=()=>{ ov.classList.remove('active'); UNO.startSolo(); };
      btns.appendChild(again);
    }
    const back=document.createElement('button');
    back.className='arcade-back-btn'; back.textContent='🕹 ARCADE';
    back.onclick=()=>{ ov.classList.remove('active'); UNO.destroy(); backToGameSelect(); };
    btns.appendChild(back);
    ov.classList.add('active');
    // Firebase cleanup
    if(isMulti&&roomCode){ setTimeout(()=>{ try{remove(ref(db,`uno/${roomCode}`));}catch(e){} },4000); }
  }

  // ── AI Logic ──────────────────────────────────────────────────
  function aiChooseCard(hand){
    // Priority: action > number, prefer matching colour
    const top=topCard();
    const effectColor=wildColor||top.color;
    const playable=hand.map((c,i)=>({c,i})).filter(({c})=>canPlay(c));
    if(!playable.length) return -1;
    // Prefer non-wild action cards
    const action=playable.find(({c})=>c.type!=='num'&&c.type!=='wild'&&c.type!=='wilddraw4');
    if(action) return action.i;
    // Prefer matching colour
    const sameColor=playable.find(({c})=>c.color===effectColor);
    if(sameColor) return sameColor.i;
    // Wild draw 4 last resort
    const wd4=playable.find(({c})=>c.type==='wilddraw4');
    if(wd4&&playable.length===1) return wd4.i;
    // Otherwise first playable
    return playable[0].i;
  }

  function aiChooseColor(hand){
    // Pick the color the AI has the most of
    const counts={red:0,blue:0,green:0,yellow:0};
    for(const c of hand) if(counts[c.color]!==undefined) counts[c.color]++;
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
  }

  function scheduleAI(){
    if(gameOver||isMulti) return;
    const p=players[currentPlayer];
    if(!p||!p.isAI) return;
    const delay=800+Math.random()*700;
    setTimeout(()=>{
      if(gameOver||currentPlayer===myPlayerIdx) return;
      const ai=players[currentPlayer];
      // Must draw pending
      if(pendingDraws>0){
        const drawn=drawFromPile(pendingDraws);
        ai.hand.push(...drawn);
        pendingDraws=0;
        nextPlayer();
        render();
        scheduleAI();
        return;
      }
      const idx=aiChooseCard(ai.hand);
      if(idx===-1){
        // draw one
        const drawn=drawFromPile(1);
        ai.hand.push(...drawn);
        // if drawn card is playable, play it
        const newCard=ai.hand[ai.hand.length-1];
        if(canPlay(newCard)){
          const color=newCard.type==='wild'||newCard.type==='wilddraw4'?aiChooseColor(ai.hand):null;
          ai.hand.splice(ai.hand.length-1,1);
          discardPile.push(newCard);
          applyCardEffect(newCard,color);
          if(checkWin(currentPlayer)) return;
          nextPlayer();
        } else {
          nextPlayer();
        }
      } else {
        const card=ai.hand.splice(idx,1)[0];
        discardPile.push(card);
        const color=card.type==='wild'||card.type==='wilddraw4'?aiChooseColor(ai.hand):null;
        applyCardEffect(card,color);
        if(checkWin(currentPlayer)) return;
        nextPlayer();
      }
      render();
      scheduleAI();
    }, delay);
  }

  // ── Solo init ─────────────────────────────────────────────────
  function initGame(pNames, meIdx){
    deck=buildDeck(); shuffle(deck);
    drawPile=deck.slice(); discardPile=[];
    // Deal 7 cards each
    const hands=dealHands(pNames.length);
    // Ensure first discard is a number card
    let first;
    do { first=drawPile.pop(); } while(first.type!=='num');
    discardPile.push(first);
    wildColor=null; direction=1; currentPlayer=0; pendingDraws=0; gameOver=false;
    selectedIdx=-1; calledUno=false;
    players=pNames.map((name,i)=>({name,hand:hands[i],isAI:i!==meIdx,isMe:i===meIdx}));
    myPlayerIdx=meIdx;
    document.getElementById('uno-color-overlay').classList.remove('active');
    document.getElementById('uno-result-overlay').classList.remove('active');
    render();
    if(currentPlayer!==myPlayerIdx) scheduleAI();
  }

  // ── Multiplayer Firebase ──────────────────────────────────────
  function stateToFirebase(){
    return {
      deck: drawPile.map(c=>c.color+'|'+c.type+'|'+c.value),
      discard: discardPile.map(c=>c.color+'|'+c.type+'|'+c.value),
      hands: players.map(p=>p.hand.map(c=>c.color+'|'+c.type+'|'+c.value)),
      currentPlayer, direction, pendingDraws, wildColor: wildColor||'',
      gameOver,
    };
  }

  function cardFromStr(s){ const[color,type,value]=s.split('|'); return{color,type,value}; }

  function applyFirebaseState(d){
    drawPile=d.deck.map(cardFromStr);
    discardPile=d.discard.map(cardFromStr);
    players.forEach((p,i)=>{ p.hand=d.hands[i].map(cardFromStr); });
    currentPlayer=d.currentPlayer; direction=d.direction;
    pendingDraws=d.pendingDraws; wildColor=d.wildColor||null;
    gameOver=d.gameOver||false;
    selectedIdx=-1;
  }

  function pushState(){
    if(!roomCode) return;
    set(ref(db,`uno/${roomCode}`), stateToFirebase()).catch(()=>{});
  }

  function listenMulti(){
    const unsub=onValue(ref(db,`uno/${roomCode}`),snap=>{
      if(!snap.exists()) return;
      const d=snap.val();
      if(d.abandoned){ showAbandoned(); return; }
      applyFirebaseState(d);
      render();
      if(d.gameOver){
        // find winner
        const wi=players.findIndex(p=>p.hand.length===0);
        if(wi>=0) endGame(wi);
      }
    });
    unsubs.push(unsub);
  }

  function showAbandoned(){
    gameOver=true;
    const ov=document.getElementById('uno-result-overlay');
    const title=document.getElementById('uno-result-title');
    const sub=document.getElementById('uno-result-sub');
    const btns=document.getElementById('uno-result-btns');
    if(!ov) return;
    title.className='uno-ov-title'; title.textContent='OPPONENT LEFT';
    sub.textContent='Your opponent has disconnected.';
    btns.innerHTML='<button class="arcade-back-btn" onclick="UNO.destroy();backToGameSelect()">🕹 ARCADE</button>';
    ov.classList.add('active');
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    get roomCode(){ return roomCode; },

    startSolo(){
      isMulti=false; roomCode=null;
      unsubs.forEach(u=>typeof u==='function'&&u()); unsubs=[];
      const nameEl=document.getElementById('uno-player-name');
      const name=(nameEl&&nameEl.value.trim().toUpperCase())||'PLAYER';
      const pNames=[name,'ACE'];
      showScreen('uno-screen');
      document.getElementById('main-title').textContent='🃏 UNO';
      document.getElementById('main-subtitle').textContent='VS AI';
      initGame(pNames,0);
    },

    launchMulti(isHost, mName, oppName, code){
      isMulti=true; roomCode=code; myName=mName;
      unsubs.forEach(u=>typeof u==='function'&&u()); unsubs=[];
      document.getElementById('main-title').textContent='🃏 UNO';
      document.getElementById('main-subtitle').textContent='ONLINE MULTIPLAYER';
      document.getElementById('header-room-code').textContent=code;
      document.getElementById('room-code-display').style.display='';
      showScreen('uno-screen');
      chatInit('uno',`uno/${code}/chat`,mName);

      if(isHost){
        // Host sets up game
        deck=buildDeck(); shuffle(deck);
        drawPile=deck.slice(); discardPile=[];
        const hands=dealHands(2);
        let first;
        do { first=drawPile.pop(); } while(first.type!=='num');
        discardPile.push(first);
        wildColor=null; direction=1; currentPlayer=0; pendingDraws=0; gameOver=false;
        selectedIdx=-1; calledUno=false;
        players=[
          {name:mName, hand:hands[0], isAI:false, isMe:true},
          {name:oppName, hand:hands[1], isAI:false, isMe:false},
        ];
        myPlayerIdx=0;
        pushState();
      } else {
        // Guest — wait for host state
        players=[
          {name:oppName, hand:[], isAI:false, isMe:false},
          {name:mName,   hand:[], isAI:false, isMe:true},
        ];
        myPlayerIdx=1;
        currentPlayer=0; direction=1; pendingDraws=0; wildColor=null; gameOver=false;
      }
      document.getElementById('uno-color-overlay').classList.remove('active');
      document.getElementById('uno-result-overlay').classList.remove('active');
      listenMulti();
      render();
    },

    selectCard(idx){
      if(currentPlayer!==myPlayerIdx||gameOver) return;
      if(pendingDraws>0) return; // must draw
      selectedIdx=selectedIdx===idx?-1:idx;
      renderHand();
      renderActions();
    },

    playSelected(){
      if(selectedIdx<0||currentPlayer!==myPlayerIdx||gameOver) return;
      const me=players[myPlayerIdx];
      const card=me.hand[selectedIdx];
      if(!canPlay(card)) return;
      // Wild — ask colour
      if(card.type==='wild'||card.type==='wilddraw4'){
        pendingColorPick=true;
        document.getElementById('uno-color-overlay').classList.add('active');
        return;
      }
      commitPlay(selectedIdx,null);
    },

    pickColor(color){
      document.getElementById('uno-color-overlay').classList.remove('active');
      if(!pendingColorPick) return;
      pendingColorPick=false;
      commitPlay(selectedIdx,color);
    },

    drawCard(){
      if(currentPlayer!==myPlayerIdx||gameOver) return;
      if(pendingDraws>0){
        // Must draw penalty
        const me=players[myPlayerIdx];
        const drawn=drawFromPile(pendingDraws);
        me.hand.push(...drawn);
        pendingDraws=0;
        selectedIdx=-1; calledUno=false;
        nextPlayer();
        if(isMulti) pushState();
        render();
        if(!isMulti) scheduleAI();
        return;
      }
      const me=players[myPlayerIdx];
      const drawn=drawFromPile(1);
      if(!drawn.length){ nextPlayer(); render(); return; }
      me.hand.push(...drawn);
      selectedIdx=-1; calledUno=false;
      // Can the drawn card be played?
      const newCard=me.hand[me.hand.length-1];
      if(canPlay(newCard)){
        // Auto-select it for convenience
        selectedIdx=me.hand.length-1;
        if(isMulti) pushState();
        render();
        return;
      }
      nextPlayer();
      if(isMulti) pushState();
      render();
      if(!isMulti) scheduleAI();
    },

    callUno(){
      calledUno=true;
      document.getElementById('uno-uno-btn').style.display='none';
    },

    destroy(){
      gameOver=true;
      unsubs.forEach(u=>typeof u==='function'&&u()); unsubs=[];
      document.getElementById('uno-color-overlay').classList.remove('active');
      document.getElementById('uno-result-overlay').classList.remove('active');
      roomCode=null; isMulti=false;
    },
  };

  function commitPlay(idx, chosenColor){
    const me=players[myPlayerIdx];
    const card=me.hand.splice(idx,1)[0];
    discardPile.push(card);
    selectedIdx=-1; calledUno=false;
    applyCardEffect(card,chosenColor);
    if(checkWin(myPlayerIdx)) {
      if(isMulti) pushState();
      return;
    }
    nextPlayer();
    if(isMulti) pushState();
    render();
    if(!isMulti) scheduleAI();
  }
})();
