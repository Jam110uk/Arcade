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

</script>



<!-- ═══════════════════════════════════════════════════════════
     POKÉMON BATTLE — LOBBY + GAME SCREENS
     ═══════════════════════════════════════════════════════════ -->

<!-- POKEMON LOBBY -->
<div class="screen" id="pokemon-lobby-screen">
  <div class="card" style="max-width:520px;padding:20px;width:100%">
    <h2 style="margin-bottom:4px">⚡ POKÉMON BATTLE</h2>
    <input type="text" id="pkm-player-name" placeholder="Enter trainer name..." maxlength="12" style="margin-bottom:8px;text-align:center">

    <!-- Coin + Shop bar -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:6px 10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:4px">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:1rem">&#x1F4B0;</span>
        <div>
          <div style="font-size:0.44rem;color:#ca8a04;letter-spacing:0.15em">POK&#xC9;COINS</div>
          <div id="pkm-coin-display-lobby" style="font-family:'Orbitron',sans-serif;font-size:0.82rem;color:#fbbf24;text-shadow:0 0 8px rgba(251,191,36,0.5)">0</div>
        </div>
      </div>
      <button onclick="PKM.openShop()" style="padding:5px 12px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.5);color:#fbbf24;font-family:'Share Tech Mono',monospace;font-size:0.58rem;letter-spacing:0.12em;cursor:pointer;border-radius:3px;transition:all 0.2s" onmouseover="this.style.background='rgba(251,191,36,0.22)'" onmouseout="this.style.background='rgba(251,191,36,0.12)'">&#x1F6D2; ITEM SHOP</button>
      <button onclick="PKM.openLobbyBag()" style="padding:5px 12px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.5);color:#fbbf24;font-family:'Share Tech Mono',monospace;font-size:0.58rem;letter-spacing:0.12em;cursor:pointer;border-radius:3px;transition:all 0.2s" onmouseover="this.style.background='rgba(251,191,36,0.22)'" onmouseout="this.style.background='rgba(251,191,36,0.12)'">&#x1F392; BAG</button>
    </div>

    <!-- Tab buttons -->
    <div style="display:flex;gap:6px;margin-bottom:14px">
      <button id="pkm-tab-starter" onclick="PKM.switchLobbyTab('starter')" style="flex:1;padding:7px 4px;background:rgba(0,245,255,0.12);border:1px solid var(--accent);color:var(--accent);font-family:'Share Tech Mono',monospace;font-size:0.6rem;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s">⭐ STARTER</button>
      <button id="pkm-tab-custom" onclick="PKM.switchLobbyTab('custom')" style="flex:1;padding:7px 4px;background:transparent;border:1px solid var(--dim);color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:0.6rem;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s">🛠 CUSTOM TEAM</button>
      <button id="pkm-tab-random" onclick="PKM.switchLobbyTab('random')" style="flex:1;padding:7px 4px;background:transparent;border:1px solid var(--dim);color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:0.6rem;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s">🎲 RANDOM</button>
    </div>

    <!-- STARTER TAB -->
    <div id="pkm-panel-starter">
      <div style="font-size:0.6rem;color:var(--dim);letter-spacing:0.15em;margin-bottom:10px;text-align:center">PICK YOUR STARTER — REST OF TEAM IS RANDOM</div>
      <div id="pkm-starter-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px"></div>
    </div>

    <!-- CUSTOM TEAM TAB -->
    <div id="pkm-panel-custom" style="display:none">
      <div style="font-size:0.6rem;color:var(--dim);letter-spacing:0.15em;margin-bottom:8px;text-align:center">BUILD YOUR TEAM (PICK 6) &nbsp;·&nbsp; <span id="pkm-roster-count" style="color:var(--accent)">—</span> POKÉMON AVAILABLE</div>
      <input type="text" id="pkm-search-box" placeholder="🔍 Search Pokémon..." oninput="PKM.filterCustomList(this.value)" style="margin-bottom:8px;font-size:0.72rem;padding:6px 10px">
      <div style="font-size:0.58rem;color:var(--dim);margin-bottom:6px;text-align:center">
        SELECTED: <span id="pkm-custom-count" style="color:var(--accent)">0</span>/6
      </div>
      <div id="pkm-custom-list" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;max-height:360px;overflow-y:auto;margin-bottom:10px;padding:4px;border:1px solid rgba(0,245,255,0.1);border-radius:4px;scrollbar-width:thin;scrollbar-color:rgba(0,245,255,0.3) transparent"></div>
      <div id="pkm-custom-selected" style="display:flex;gap:5px;flex-wrap:wrap;min-height:48px;margin-bottom:10px;padding:6px;background:rgba(0,0,0,0.2);border:1px solid rgba(0,245,255,0.1);border-radius:4px;align-items:center"></div>
      <!-- Preset save/load -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:0.58rem;color:var(--dim);letter-spacing:0.12em">TEAM PRESETS</div>
        <button id="pkm-preset-edit-btn" onclick="PKM.togglePresetEditMode()" style="font-size:0.48rem;padding:2px 7px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:var(--dim);font-family:'Share Tech Mono',monospace;letter-spacing:0.1em;cursor:pointer;border-radius:3px;transition:all 0.2s">✏️ EDIT</button>
      </div>
      <div id="pkm-presets-row" style="display:flex;gap:5px;margin-bottom:10px"></div>
    </div>

    <!-- RANDOM TAB -->
    <div id="pkm-panel-random" style="display:none">
      <div style="font-size:0.6rem;color:var(--dim);letter-spacing:0.15em;margin-bottom:12px;text-align:center">SURPRISE ME — FULLY RANDOM TEAM</div>
      <div id="pkm-random-preview" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px"></div>
      <button onclick="PKM.rerollPreview()" style="width:100%;padding:8px;background:transparent;border:1px solid #a78bfa;color:#a78bfa;font-family:'Share Tech Mono',monospace;font-size:0.65rem;letter-spacing:0.12em;cursor:pointer;margin-bottom:10px;transition:all 0.2s" onmouseover="this.style.background='rgba(167,139,250,0.1)'" onmouseout="this.style.background='transparent'">🎲 RE-ROLL TEAM</button>
    </div>

    <!-- Battle / separator -->
    <button class="btn" onclick="PKM.startSolo()" id="pkm-solo-btn" style="border-color:#ef4444;color:#ef4444;width:100%;margin-bottom:10px;opacity:0.4;pointer-events:none" disabled>▶ BATTLE VS AI</button>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <div style="flex:1;height:1px;background:rgba(255,255,255,0.08)"></div>
      <span style="font-size:0.58rem;color:var(--dim);letter-spacing:0.15em">OR</span>
      <div style="flex:1;height:1px;background:rgba(255,255,255,0.08)"></div>
    </div>
    <button class="btn" onclick="openMultiLobby('pokemon')" style="width:100%;margin-bottom:16px">🌐 FIND OPPONENT</button>
    <!-- Shop overlay (lobby) -->
    <div id="pkm-lobby-shop-overlay" style="display:none;position:fixed;inset:0;background:rgba(2,6,15,0.97);z-index:200;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px;overflow-y:auto;gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;max-width:500px;margin-bottom:8px">
        <div style="font-family:'Orbitron',sans-serif;font-size:0.85rem;letter-spacing:0.2em;color:#fbbf24">🛒 ITEM SHOP</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span>🪙</span>
          <span id="pkm-lobby-shop-coins" style="font-family:'Orbitron',sans-serif;font-size:0.85rem;color:#fbbf24">0</span>
        </div>
      </div>
      <div id="pkm-lobby-shop-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;max-width:500px"></div>
    <button onclick="PKM.closeLobbyShop()" style="margin-top:12px;padding:8px 24px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#94a3b8;font-family:'Share Tech Mono',monospace;font-size:0.65rem;letter-spacing:0.12em;cursor:pointer">✖ CLOSE SHOP</button>
    </div>

    <!-- Lobby Bag overlay -->
    <div id="pkm-lobby-bag-overlay" style="display:none;position:fixed;inset:0;background:rgba(2,6,15,0.97);z-index:200;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px;overflow-y:auto;gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;max-width:500px;margin-bottom:8px">
        <div style="font-family:'Orbitron',sans-serif;font-size:0.85rem;letter-spacing:0.2em;color:#fbbf24">🎒 BAG</div>
        <div style="display:flex;align-items:center;gap:6px"><span>🪙</span><span id="pkm-lobby-bag-coins" style="font-family:'Orbitron',sans-serif;font-size:0.85rem;color:#fbbf24">0</span></div>
      </div>
      <div id="pkm-lobby-bag-items" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;max-width:500px"></div>
      <div id="pkm-lobby-bag-empty" style="display:none;font-size:0.62rem;color:#64748b;letter-spacing:0.12em;text-align:center;padding:20px 0">BAG IS EMPTY<br><span style="font-size:0.52rem;opacity:0.6">BUY ITEMS FROM THE SHOP</span></div>
      <!-- Roster picker for shiny charm -->
      <div id="pkm-lobby-bag-picker" style="display:none;width:100%;max-width:500px">
        <div style="font-size:0.58rem;color:#fbbf24;letter-spacing:0.12em;margin-bottom:8px;text-align:center">SELECT A POKÉMON TO MAKE SHINY</div>
        <div id="pkm-lobby-bag-picker-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"></div>
        <button onclick="PKM.cancelLobbyItemTarget()" style="margin-top:10px;width:100%;padding:6px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#94a3b8;font-family:'Share Tech Mono',monospace;font-size:0.6rem;letter-spacing:0.12em;cursor:pointer">✖ CANCEL</button>
      </div>
      <button id="pkm-lobby-bag-close-btn" onclick="PKM.closeLobbyBag()" style="margin-top:12px;padding:8px 24px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#94a3b8;font-family:'Share Tech Mono',monospace;font-size:0.65rem;letter-spacing:0.12em;cursor:pointer">✖ CLOSE BAG</button>
    </div>

    <button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>
  </div>
</div>

<style>
/* Custom list pokemon cards */
.pkm-custom-card {
  display:flex;flex-direction:column;align-items:center;padding:5px 3px;
  background:rgba(0,0,0,0.25);border:1px solid rgba(0,245,255,0.1);
  border-radius:4px;cursor:pointer;transition:all 0.15s;
}
.pkm-custom-card:hover { border-color:rgba(0,245,255,0.4);background:rgba(0,245,255,0.06); }
.pkm-custom-card.selected { border-color:var(--accent);background:rgba(0,245,255,0.12);box-shadow:0 0 8px rgba(0,245,255,0.25); }
.pkm-custom-card.disabled { opacity:0.3;cursor:not-allowed; }
.pkm-custom-card img { width:44px;height:44px;object-fit:contain;image-rendering:auto; }
.pkm-custom-card .pkm-cc-name { font-size:0.46rem;letter-spacing:0.06em;color:var(--text);text-align:center;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62px; }

/* Random preview cards */
.pkm-rand-card {
  display:flex;flex-direction:column;align-items:center;padding:8px 4px;
  background:rgba(0,0,0,0.25);border:1px solid rgba(167,139,250,0.2);border-radius:4px;
}
.pkm-rand-card img { width:54px;height:54px;object-fit:contain; }
.pkm-rand-card .pkm-rc-name { font-size:0.48rem;color:var(--text);text-align:center;margin-top:2px; }

/* Selected mini ball */
.pkm-sel-ball {
  display:flex;flex-direction:column;align-items:center;
  background:rgba(0,245,255,0.08);border:1px solid rgba(0,245,255,0.25);
  border-radius:4px;padding:3px;cursor:pointer;transition:all 0.15s;
  position:relative;
}
.pkm-sel-ball:hover { border-color:#ef4444; }
.pkm-sel-ball img { width:34px;height:34px;object-fit:contain; }
.pkm-sel-ball .pkm-sb-name { font-size:0.38rem;color:var(--dim);text-align:center;max-width:40px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.pkm-sel-ball::after { content:'✕';position:absolute;top:1px;right:3px;font-size:0.4rem;color:rgba(255,100,100,0.5); }

/* Preset slot */
.pkm-preset-slot {
  flex:1;min-width:0;padding:6px 4px;text-align:center;
  background:rgba(0,0,0,0.25);border:1px solid rgba(0,245,255,0.12);
  border-radius:4px;cursor:pointer;font-family:'Share Tech Mono',monospace;
  font-size:0.48rem;color:var(--dim);letter-spacing:0.05em;transition:all 0.2s;
  position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:52px;justify-content:center;
}
.pkm-preset-slot:hover { border-color:rgba(0,245,255,0.35); }
.pkm-preset-slot.has-team { border-color:rgba(0,245,255,0.3);color:var(--text); }
.pkm-preset-slot.active-preset { border-color:var(--accent);background:rgba(0,245,255,0.1);color:var(--accent); }
.pkm-preset-slot .preset-sprites { display:flex;gap:1px;flex-wrap:wrap;justify-content:center; }
.pkm-preset-slot .preset-sprites img { width:16px;height:16px;object-fit:contain; }
.pkm-preset-slot .preset-save-btn {
  position:absolute;bottom:2px;right:3px;font-size:0.4rem;
  color:rgba(0,245,255,0.4);cursor:pointer;padding:1px 3px;
  background:transparent;border:none;font-family:'Share Tech Mono',monospace;
}
.pkm-preset-slot .preset-save-btn:hover { color:var(--accent); }
</style>

<!-- POKEMON GAME SCREEN -->
<!-- SVG chroma-key filter for Pokémon showdown GIF backgrounds -->
<svg width="0" height="0" style="position:absolute">
  <defs>
    <filter id="pkm-chroma-key" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">
      <!-- Shift hue so the grey-green bg becomes a known colour, then key it out -->
      <feColorMatrix type="matrix"
        values="1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                -6 -3 -6 20 -2"
        result="mask"/>
      <feComposite in="SourceGraphic" in2="mask" operator="in"/>
    </filter>
  </defs>
</svg>
<div class="screen" id="pokemon-screen">
<style>
#pokemon-screen {
  padding: 0;
  align-items: stretch;
  overflow: hidden;
  background-size: 100% 100%;
  background: #0d1117;
  justify-content: flex-start;
}
.pkm-layout {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  max-width: 520px; margin: 0 auto;
  position: relative;
  overflow: hidden;
  background-size: 100% 100%;
}

/* ── Topbar ── */
.pkm-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px;
  background: rgba(5,8,16,0.98);
  border-bottom: 1px solid rgba(239,68,68,0.2);
  flex-shrink: 0; z-index: 10;
}
.pkm-opp-label {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.55rem; letter-spacing: 0.18em; color: #ef4444;
}

/* ── Battle field ── */
.pkm-field {
  position: relative;
  width: 100%; flex-shrink: 0;
  height: 320px;
  overflow: hidden;
  background-color: #0a1628;
  background-size: 100% 100%;
}
/* Horizon line — hidden now that real backgrounds are used */
.pkm-field::after {
  content: '';
  position: absolute; left: 0; right: 0;
  top: 50%; height: 1px;
  background: transparent;
}
/* Ground ellipses */
.pkm-ground-opp {
  position: absolute; top: 48%; left: 8%;
  width: 30%; height: 10px;
  background: rgba(0,0,0,0.35); border-radius: 50%; filter: blur(5px);
}
.pkm-ground-me {
  position: absolute; top: 78%; right: 6%;
  width: 34%; height: 12px;
  background: rgba(0,0,0,0.3); border-radius: 50%; filter: blur(5px);
}
/* Stars */
.pkm-stars {
  display: none;
}
.pkm-star {
  position: absolute; background: #fff; border-radius: 50%;
  animation: pkmTwinkle 3s ease-in-out infinite;
}
@keyframes pkmTwinkle {
  0%,100%{opacity:0.3} 50%{opacity:1}
}

/* ── HP bars ── */
.pkm-hpbar-wrap {
  position: absolute;
  background: rgba(5,10,20,0.92);
  border: 1px solid rgba(255,255,255,0.12);
  padding: 6px 10px 5px;
  border-radius: 6px;
  min-width: 148px;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.5);
}
.pkm-hpbar-wrap.opp {
  top: 76%; right: 10px;
  animation: pkmSlideInRight 0.35s ease;
}
.pkm-hpbar-wrap.me {
  top: 12px; left: 10px;
  animation: pkmSlideInLeft 0.35s ease;
}
@keyframes pkmSlideInLeft  { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:none} }
@keyframes pkmSlideInRight { from{opacity:0;transform:translateX(12px)}  to{opacity:1;transform:none} }
/* Show HP numbers for me, hide for opp (like real games) */
.pkm-hpbar-name {
  font-family: 'Orbitron', sans-serif; font-size: 0.52rem;
  letter-spacing: 0.1em; color: #f1f5f9; margin-bottom: 4px;
  display: flex; justify-content: space-between; align-items: center; gap: 6px;
}
.pkm-hpbar-lvl { color: #64748b; font-size: 0.48rem; white-space: nowrap; }
.pkm-hpbar-types { display: flex; gap: 3px; margin-bottom: 4px; }
.pkm-hpbar-track {
  height: 7px; background: #1e293b; border-radius: 4px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.06);
}
.pkm-hpbar-fill {
  height: 100%; border-radius: 4px;
  transition: width 0.7s cubic-bezier(.4,0,.2,1), background 0.7s;
  background: linear-gradient(90deg, #22c55e, #4ade80);
  position: relative;
}
.pkm-hpbar-fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.15), transparent);
  border-radius: 4px;
}
.pkm-hpbar-fill.yellow { background: linear-gradient(90deg, #ca8a04, #facc15); }
.pkm-hpbar-fill.red    { background: linear-gradient(90deg, #b91c1c, #ef4444); animation: pkmHPPulse 1s ease-in-out infinite; }
@keyframes pkmHPPulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
.pkm-hp-nums {
  font-size: 0.46rem; color: #64748b; margin-top: 3px;
  text-align: right; font-family: 'Share Tech Mono', monospace;
}
/* Hide hp nums for opponent (like real games) */
.pkm-hpbar-wrap.opp .pkm-hp-nums { display: none; }

/* ── Status effect badges ── */
.pkm-status-badge {
  display: inline-block;
  font-size: 0.42rem; font-family: 'Share Tech Mono', monospace;
  letter-spacing: 0.08em; font-weight: bold;
  padding: 1px 5px; border-radius: 3px;
  margin-left: 4px; vertical-align: middle;
  flex-shrink: 0;
}
.pkm-status-badge.brn { background: #7c2d12; color: #fb923c; border: 1px solid #c2410c; }
.pkm-status-badge.psn { background: #4a044e; color: #d946ef; border: 1px solid #7e22ce; }
.pkm-status-badge.tox { background: #581c87; color: #c084fc; border: 1px solid #9333ea; }
.pkm-status-badge.par { background: #713f12; color: #facc15; border: 1px solid #ca8a04; }
.pkm-status-badge.slp { background: #1e3a5f; color: #93c5fd; border: 1px solid #3b82f6; }
.pkm-status-badge.frz { background: #0c4a6e; color: #67e8f9; border: 1px solid #0891b2; }

/* Stat stage badges */
.pkm-stages {
  display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px; min-height: 10px;
}
.pkm-stage-badge {
  display: inline-block;
  font-size: 0.38rem; font-family: 'Share Tech Mono', monospace;
  letter-spacing: 0.05em; padding: 1px 4px; border-radius: 2px;
  font-weight: bold; white-space: nowrap;
}
.pkm-stage-badge.up   { background: rgba(34,197,94,0.18);  color: #4ade80; border: 1px solid rgba(34,197,94,0.45); }
.pkm-stage-badge.down { background: rgba(239,68,68,0.18);  color: #f87171; border: 1px solid rgba(239,68,68,0.45); }

/* Stat boost/drop float animation */
.pkm-stat-float {
  position: absolute; pointer-events: none;
  font-size: 0.62rem; font-weight: bold; font-family: 'Share Tech Mono', monospace;
  letter-spacing: 0.08em; z-index: 50;
  animation: pkmStatFloat 1.4s ease-out forwards;
}
.pkm-stat-float.up   { color: #4ade80; text-shadow: 0 0 8px rgba(74,222,128,0.8); }
.pkm-stat-float.down { color: #f87171; text-shadow: 0 0 8px rgba(248,113,113,0.8); }
@keyframes pkmStatFloat {
  0%   { opacity: 1; transform: translateY(0); }
  70%  { opacity: 1; transform: translateY(-28px); }
  100% { opacity: 0; transform: translateY(-40px); }
}

/* Protect / Detect shield overlay */
.pkm-protect-shield {
  position: absolute; pointer-events: none; z-index: 40;
  border-radius: 50%;
  border: 3px solid rgba(96, 165, 250, 0.9);
  box-shadow: 0 0 18px rgba(96,165,250,0.7), inset 0 0 18px rgba(96,165,250,0.2);
  animation: pkmShieldPulse 0.35s ease-out forwards;
}
.pkm-protect-shield.opp { width: 90px; height: 110px; left: 68%; top: 38%; }
.pkm-protect-shield.me  { width: 110px; height: 130px; left:  2%; top: 52%; }
@keyframes pkmShieldPulse {
  0%   { opacity: 0; transform: scale(0.6); }
  40%  { opacity: 1; transform: scale(1.08); }
  70%  { opacity: 1; transform: scale(1.0); }
  100% { opacity: 0.85; transform: scale(1.0); }
}
.pkm-protect-shield.fade-out {
  animation: pkmShieldFade 0.4s ease-in forwards;
}
@keyframes pkmShieldFade {
  0%   { opacity: 0.85; transform: scale(1.0); }
  100% { opacity: 0;    transform: scale(1.15); }
}

/* Miss float */
.pkm-miss-float {
  position: absolute; pointer-events: none; z-index: 50;
  font-size: 0.72rem; font-weight: bold; font-family: 'Share Tech Mono', monospace;
  letter-spacing: 0.1em; color: #94a3b8;
  text-shadow: 0 0 6px rgba(148,163,184,0.6);
  animation: pkmMissFloat 1.1s ease-out forwards;
}
@keyframes pkmMissFloat {
  0%   { opacity: 1; transform: translateY(0) rotate(-8deg); }
  60%  { opacity: 1; transform: translateY(-22px) rotate(4deg); }
  100% { opacity: 0; transform: translateY(-36px) rotate(-2deg); }
}

/* Status overlay flicker on sprite */
@keyframes pkmBurnFlicker {
  0%,100%{filter:drop-shadow(0 0 8px #f97316) drop-shadow(0 6px 14px rgba(0,0,0,0.7))}
  50%{filter:drop-shadow(0 0 18px #ef4444) drop-shadow(0 6px 14px rgba(0,0,0,0.7)) brightness(1.15)}
}
@keyframes pkmPoisonPulse {
  0%,100%{filter:drop-shadow(0 0 6px #a855f7) drop-shadow(0 6px 14px rgba(0,0,0,0.7))}
  50%{filter:drop-shadow(0 0 16px #d946ef) drop-shadow(0 6px 14px rgba(0,0,0,0.7)) hue-rotate(30deg)}
}
@keyframes pkmParalysisFlash {
  0%,80%,100%{filter:drop-shadow(0 6px 14px rgba(0,0,0,0.7))}
  85%,95%{filter:drop-shadow(0 0 14px #facc15) drop-shadow(0 6px 14px rgba(0,0,0,0.7)) brightness(1.3)}
}
@keyframes pkmSleepFloat {
  0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)}
}
@keyframes pkmSleepFloatOpp {
  0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)}
}
@keyframes pkmFreezeShimmer {
  0%,100%{filter:drop-shadow(0 6px 14px rgba(0,0,0,0.7)) saturate(0.2) hue-rotate(180deg) brightness(1.4)}
  50%{filter:drop-shadow(0 0 16px #67e8f9) drop-shadow(0 6px 14px rgba(0,0,0,0.7)) saturate(0.1) hue-rotate(190deg) brightness(1.6)}
}
.pkm-sprite.status-burn  { animation: pkmBurnFlicker 1.4s ease-in-out infinite !important; }
.pkm-sprite.status-psn,.pkm-sprite.status-tox { animation: pkmPoisonPulse 1.8s ease-in-out infinite !important; }
.pkm-sprite.status-par   { animation: pkmParalysisFlash 2s ease-in-out infinite !important; }
.pkm-sprite.status-slp.me  { animation: pkmSleepFloat 2.5s ease-in-out infinite !important; }
.pkm-sprite.status-slp.opp { animation: pkmSleepFloatOpp 2.5s ease-in-out infinite !important; }
.pkm-sprite.status-frz   { animation: pkmFreezeShimmer 1.2s ease-in-out infinite !important; }

/* Damage float for status */
.pkm-dmg-float.status { color: #d946ef; font-size: 0.7rem; }
.pkm-dmg-float.burn   { color: #fb923c; font-size: 0.7rem; }
.pkm-dmg-float.heal   { color: #4ade80; font-size: 0.7rem; }


/* ── Sprites ── */
.pkm-sprite {
  position: absolute;
  image-rendering: auto;
  filter: url(#pkm-chroma-key) drop-shadow(0 6px 14px rgba(0,0,0,0.7));
  transition: opacity 0.2s;
}
.pkm-sprite.shiny {
  filter: hue-rotate(155deg) saturate(2.2) brightness(1.15)
          drop-shadow(0 0 6px rgba(255,215,0,0.85))
          drop-shadow(0 0 14px rgba(255,215,0,0.45)) !important;
}
@keyframes shinySparkle {
  0%   { opacity:1; transform:translate(-50%,-50%) scale(0)   rotate(0deg);   }
  40%  { opacity:1; transform:translate(-50%,-50%) scale(1.4) rotate(120deg); }
  100% { opacity:0; transform:translate(-50%,-50%) scale(0.6) rotate(240deg); }
}
.pkm-shiny-spark {
  position:absolute; pointer-events:none; font-size:1.1rem; z-index:20;
  animation: shinySparkle 0.8s ease-out forwards;
}
.pkm-shiny-star {
  display:inline-block; font-size:0.6rem; margin-left:3px;
  color:#fbbf24; filter:drop-shadow(0 0 3px #fbbf24);
  animation: shinyStarPulse 1.8s ease-in-out infinite;
}
@keyframes shinyStarPulse {
  0%,100% { opacity:1; transform:scale(1); }
  50%     { opacity:0.5; transform:scale(0.75); }
}
.pkm-sprite.me {
  width: 148px; height: 148px; object-fit: contain;
  bottom: 4%; left: 4%;
}
.pkm-sprite.opp {
  width: 96px; height: 96px; object-fit: contain;
  bottom: 30%; right: 6%;
}
/* Entry slide-in */
.pkm-sprite.entering-opp { animation: pkmEnterOpp 0.4s cubic-bezier(.2,1.4,.4,1); }
.pkm-sprite.entering-me  { animation: pkmEnterMe  0.4s cubic-bezier(.2,1.4,.4,1); }
@keyframes pkmEnterOpp { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:none} }
@keyframes pkmEnterMe  { from{opacity:0;transform:translateX(-40px)} to{opacity:1;transform:none} }

/* Hit flash */
@keyframes pkmHitFlash {
  0%,100%{filter:drop-shadow(0 6px 14px rgba(0,0,0,0.7))}
  25%,75%{filter:drop-shadow(0 0 20px #ef4444) brightness(2)}
}
.pkm-sprite.hit { animation: pkmHitFlash 0.4s ease; }

/* Shake animations */
@keyframes pkmShakeMe {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-7px)}
  40%{transform:translateX(7px)}
  60%{transform:translateX(-5px)}
  80%{transform:translateX(5px)}
}
@keyframes pkmShakeOpp {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-7px)}
  40%{transform:translateX(7px)}
  60%{transform:translateX(-5px)}
  80%{transform:translateX(5px)}
}
.pkm-sprite.shake-me  { animation: pkmShakeMe  0.4s ease, pkmHitFlash 0.4s ease; }
.pkm-sprite.shake-opp { animation: pkmShakeOpp 0.4s ease, pkmHitFlash 0.4s ease; }

/* Faint */
@keyframes pkmFaintMe  { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(36px)} }
@keyframes pkmFaintOpp { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(36px)} }
.pkm-sprite.faint-me  { animation: pkmFaintMe  0.6s ease forwards; }
.pkm-sprite.faint-opp { animation: pkmFaintOpp 0.6s ease forwards; }

/* ── Battle log ── */
.pkm-log-box {
  background: rgba(5,10,20,0.96);
  border-top: 2px solid rgba(239,68,68,0.25);
  padding: 10px 14px 8px;
  flex-shrink: 0; min-height: 48px;
  position: relative;
}
.pkm-log-text {
  font-size: 0.72rem; color: #e2e8f0;
  letter-spacing: 0.04em; line-height: 1.55;
  min-height: 1.1em;
}
/* Typing cursor */
.pkm-log-text::after {
  content: '▋';
  color: #ef4444;
  animation: pkmCursor 0.9s step-end infinite;
  margin-left: 2px;
}
@keyframes pkmCursor { 0%,100%{opacity:1} 50%{opacity:0} }
.pkm-log-text.idle::after { display: none; }

/* ── Party bar ── */
.pkm-party-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 10px;
  background: rgba(5,10,20,0.96);
  border-top: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}
.pkm-party-label {
  font-size: 0.48rem; color: #475569;
  letter-spacing: 0.12em; margin-right: 2px;
}
.pkm-party-ball {
  width: 18px; height: 18px;
  cursor: pointer;
  transition: transform 0.15s, filter 0.15s;
  position: relative; flex-shrink: 0;
}
.pkm-party-ball:hover { transform: scale(1.25); }
.pkm-party-ball.fainted { filter: grayscale(1) brightness(0.4); cursor: default; }
.pkm-party-ball.fainted:hover { transform: none; }
.pkm-party-ball.active-dot {
  transform: scale(1.4) !important;
  filter: drop-shadow(0 0 4px #fff) drop-shadow(0 0 8px rgba(255,255,255,0.6)) !important;
}
.pkm-party-ball.hurt {
  filter: drop-shadow(0 0 3px rgba(234,179,8,0.8));
}
.pkm-party-sep {
  width: 1px; height: 14px; background: rgba(255,255,255,0.1); margin: 0 3px;
}

/* ── Move grid ── */
.pkm-moves {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 5px; padding: 6px 8px;
  background: rgba(5,10,20,0.96);
  border-top: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}
.pkm-move-btn {
  padding: 9px 8px 7px;
  background: #0d1117;
  border: 1px solid rgba(255,255,255,0.1);
  color: #e2e8f0;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.62rem; letter-spacing: 0.06em;
  cursor: pointer; transition: border-color 0.12s, background 0.12s, transform 0.08s;
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  border-radius: 3px;
  text-align: left;
}
.pkm-move-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(255,255,255,0.04);
}
.pkm-move-btn:active:not(:disabled) { transform: translateY(0); }
.pkm-move-btn:disabled { opacity: 0.3; cursor: default; }
.pkm-move-btn.no-pp { opacity: 0.25; cursor: default; }

/* Each move button gets its type colour on hover */
.pkm-move-btn[data-type="fire"]:hover:not(:disabled)     { border-color:#ef4444; background:rgba(239,68,68,0.08); }
.pkm-move-btn[data-type="water"]:hover:not(:disabled)    { border-color:#3b82f6; background:rgba(59,130,246,0.08); }
.pkm-move-btn[data-type="grass"]:hover:not(:disabled)    { border-color:#22c55e; background:rgba(34,197,94,0.08); }
.pkm-move-btn[data-type="electric"]:hover:not(:disabled) { border-color:#eab308; background:rgba(234,179,8,0.08); }
.pkm-move-btn[data-type="ice"]:hover:not(:disabled)      { border-color:#67e8f9; background:rgba(103,232,249,0.08); }
.pkm-move-btn[data-type="fighting"]:hover:not(:disabled) { border-color:#f97316; background:rgba(249,115,22,0.08); }
.pkm-move-btn[data-type="poison"]:hover:not(:disabled)   { border-color:#a855f7; background:rgba(168,85,247,0.08); }
.pkm-move-btn[data-type="ground"]:hover:not(:disabled)   { border-color:#d97706; background:rgba(217,119,6,0.08); }
.pkm-move-btn[data-type="flying"]:hover:not(:disabled)   { border-color:#7dd3fc; background:rgba(125,211,252,0.08); }
.pkm-move-btn[data-type="psychic"]:hover:not(:disabled)  { border-color:#ec4899; background:rgba(236,72,153,0.08); }
.pkm-move-btn[data-type="bug"]:hover:not(:disabled)      { border-color:#84cc16; background:rgba(132,204,22,0.08); }
.pkm-move-btn[data-type="rock"]:hover:not(:disabled)     { border-color:#78716c; background:rgba(120,113,108,0.08); }
.pkm-move-btn[data-type="ghost"]:hover:not(:disabled)    { border-color:#8b5cf6; background:rgba(139,92,246,0.08); }
.pkm-move-btn[data-type="dragon"]:hover:not(:disabled)   { border-color:#6366f1; background:rgba(99,102,241,0.08); }
.pkm-move-btn[data-type="dark"]:hover:not(:disabled)     { border-color:#78716c; background:rgba(120,113,108,0.08); }
.pkm-move-btn[data-type="steel"]:hover:not(:disabled)    { border-color:#94a3b8; background:rgba(148,163,184,0.08); }
.pkm-move-btn[data-type="normal"]:hover:not(:disabled)   { border-color:#94a3b8; background:rgba(148,163,184,0.08); }
.pkm-move-btn[data-type="fairy"]:hover:not(:disabled)    { border-color:#f9a8d4; background:rgba(249,168,212,0.08); }

.pkm-move-row1 { display: flex; align-items: center; gap: 5px; width: 100%; }
.pkm-move-name { font-weight: bold; font-size: 0.64rem; flex: 1; }
.pkm-move-eff  { font-size: 0.6rem; }
.pkm-move-meta { font-size: 0.5rem; color: #64748b; width: 100%; }
.pkm-type-pip {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0;
}
/* type colours */
.tc-fire{background:#ef4444}.tc-water{background:#3b82f6}.tc-grass{background:#22c55e}
.tc-electric{background:#eab308}.tc-ice{background:#a5f3fc}.tc-fighting{background:#f97316}
.tc-poison{background:#a855f7}.tc-ground{background:#d97706}.tc-flying{background:#7dd3fc}
.tc-psychic{background:#ec4899}.tc-bug{background:#84cc16}.tc-rock{background:#78716c}
.tc-ghost{background:#8b5cf6}.tc-dragon{background:#6366f1}.tc-dark{background:#6b7280}
.tc-steel{background:#94a3b8}.tc-normal{background:#9ca3af}.tc-fairy{background:#f9a8d4}

/* ── Action row ── */
.pkm-actions {
  display: flex; gap: 6px; padding: 4px 8px 6px;
  background: rgba(5,10,20,0.96);
  border-top: 1px solid rgba(255,255,255,0.04);
  flex-shrink: 0;
}
.pkm-action-btn {
  padding: 5px 12px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.12); color: #64748b;
  font-family: 'Share Tech Mono', monospace; font-size: 0.56rem;
  letter-spacing: 0.1em; cursor: pointer; transition: all 0.12s;
  border-radius: 3px; white-space: nowrap;
}
.pkm-action-btn:hover:not(:disabled) { border-color: #e2e8f0; color: #e2e8f0; }
.pkm-action-btn:disabled { opacity: 0.25; cursor: default; }

/* ── Volume control ── */
.pkm-vol-wrap {
  display: flex; align-items: center; gap: 5px;
  padding: 0 6px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 3px;
  background: transparent;
}
.pkm-vol-icon {
  background: transparent; border: none; color: #64748b;
  font-size: 0.75rem; cursor: pointer; padding: 0; line-height: 1;
  transition: color 0.12s; flex-shrink: 0;
}
.pkm-vol-icon:hover { color: #e2e8f0; }
.pkm-vol-slider {
  -webkit-appearance: none; appearance: none;
  width: 64px; height: 3px;
  background: rgba(255,255,255,0.15);
  border-radius: 2px; outline: none; cursor: pointer;
}
.pkm-vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 10px; height: 10px; border-radius: 50%;
  background: #00f5ff; cursor: pointer;
  box-shadow: 0 0 4px rgba(0,245,255,0.6);
}
.pkm-vol-slider::-moz-range-thumb {
  width: 10px; height: 10px; border-radius: 50%;
  background: #00f5ff; cursor: pointer; border: none;
  box-shadow: 0 0 4px rgba(0,245,255,0.6);
}

/* ── Switch overlay ── */
.pkm-switch-overlay {
  display: none; position: absolute; inset: 0;
  background: rgba(2,6,15,0.97); z-index: 50;
  flex-direction: column; align-items: center;
  padding: 16px; gap: 10px;
  overflow-y: auto;
}
.pkm-switch-overlay.active { display: flex; }
.pkm-switch-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.75rem;
  letter-spacing: 0.2em; color: #ef4444;
}
.pkm-switch-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 8px; width: 100%;
}
.pkm-switch-card {
  background: #0d1117; border: 1px solid rgba(255,255,255,0.1);
  padding: 8px 4px; cursor: pointer; transition: all 0.15s;
  text-align: center; border-radius: 4px; position: relative;
}
.pkm-switch-card:hover:not(.sw-fainted):not(.sw-active) {
  border-color: rgba(239,68,68,0.6); transform: translateY(-2px);
  background: rgba(239,68,68,0.06);
}
.pkm-switch-card.sw-fainted { opacity: 0.25; cursor: default; }
.pkm-switch-card.sw-active  { border-color: #22c55e; cursor: default; }
.pkm-switch-img  { width: 56px; height: 56px; object-fit: contain; }
.pkm-switch-name { font-size: 0.52rem; letter-spacing: 0.08em; color: #e2e8f0; margin-top: 3px; }
.pkm-switch-hpbar {
  height: 4px; background: #1e293b; border-radius: 2px; margin: 3px 4px 0;
  overflow: hidden;
  background-size: 100% 100%;
}
.pkm-switch-hpfill { height: 100%; border-radius: 2px; transition: width 0.4s; }
.pkm-switch-hptxt  { font-size: 0.44rem; color: #64748b; margin-top: 2px; }

/* ── Result overlay ── */
.pkm-result-overlay {
  display: none; position: absolute; inset: 0;
  background: rgba(2,6,15,0.97); z-index: 60;
  flex-direction: column; align-items: center;
  justify-content: center; gap: 16px; padding: 24px;
}
.pkm-result-overlay.active { display: flex; animation: pkmFadeIn 0.4s ease; }
@keyframes pkmFadeIn { from{opacity:0} to{opacity:1} }
.pkm-result-icon { font-size: 3rem; line-height: 1; }
.pkm-result-title {
  font-family: 'Orbitron', sans-serif; font-size: 1.3rem;
  letter-spacing: 0.25em; color: #ef4444; text-align: center;
}
.pkm-result-title.win {
  color: #fbbf24;
  text-shadow: 0 0 30px rgba(251,191,36,0.6), 0 0 60px rgba(251,191,36,0.3);
}
.pkm-result-sub { font-size: 0.65rem; color: #64748b; letter-spacing: 0.12em; text-align: center; }
.pkm-result-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 4px; }

/* ── Lobby starter cards ── */
.pkm-starter-card {
  background: #0d1117; border: 2px solid rgba(255,255,255,0.08);
  padding: 10px 6px 8px; cursor: pointer; transition: all 0.18s;
  text-align: center; border-radius: 8px;
}
.pkm-starter-card:hover {
  border-color: rgba(239,68,68,0.5);
  transform: translateY(-3px);
  background: rgba(239,68,68,0.05);
}
.pkm-starter-card.selected {
  border-color: #ef4444;
  box-shadow: 0 0 16px rgba(239,68,68,0.35), inset 0 0 20px rgba(239,68,68,0.05);
  background: rgba(239,68,68,0.06);
}
.pkm-starter-img  { width: 76px; height: 76px; object-fit: contain; display: block; margin: 0 auto; }
.pkm-starter-name { font-size: 0.58rem; letter-spacing: 0.1em; color: #e2e8f0; margin-top: 5px; font-weight: bold; }
.pkm-starter-types { display: flex; gap: 3px; justify-content: center; margin-top: 4px; flex-wrap: wrap; }

/* ── Type badge ── */
.pkm-type-badge {
  font-size: 0.44rem; padding: 1px 5px;
  border-radius: 10px; font-weight: bold; letter-spacing: 0.08em;
  display: inline-block; white-space: nowrap;
}
.tb-fire{background:#ef4444;color:#fff}.tb-water{background:#3b82f6;color:#fff}
.tb-grass{background:#22c55e;color:#000}.tb-electric{background:#eab308;color:#000}
.tb-ice{background:#a5f3fc;color:#000}.tb-fighting{background:#f97316;color:#fff}
.tb-poison{background:#a855f7;color:#fff}.tb-ground{background:#d97706;color:#fff}
.tb-flying{background:#7dd3fc;color:#000}.tb-psychic{background:#ec4899;color:#fff}
.tb-bug{background:#84cc16;color:#000}.tb-rock{background:#78716c;color:#fff}
.tb-ghost{background:#8b5cf6;color:#fff}.tb-dragon{background:#6366f1;color:#fff}
.tb-dark{background:#4b5563;color:#fff}.tb-steel{background:#94a3b8;color:#000}
.tb-normal{background:#6b7280;color:#fff}.tb-fairy{background:#f9a8d4;color:#000}

/* ── Damage number floaters ── */
.pkm-dmg-float {
  position: absolute; pointer-events: none; z-index: 30;
  font-family: 'Orbitron', sans-serif; font-weight: bold;
  font-size: 1.1rem; color: #fff;
  text-shadow: 0 2px 8px rgba(0,0,0,0.9), 0 0 16px currentColor;
  animation: pkmDmgFloat 1.2s ease forwards;
}
.pkm-dmg-float.super { color: #fbbf24; font-size: 1.3rem; }
.pkm-dmg-float.miss  { color: #94a3b8; font-size: 0.8rem; }
.pkm-dmg-float.heal  { color: #4ade80; }
.pkm-dmg-float.crit  { color: #f97316; font-size: 1.45rem;
  text-shadow: 0 2px 10px rgba(0,0,0,0.9), 0 0 22px #f97316, 0 0 8px #fbbf24; }
@keyframes pkmDmgFloat {
  0%  { opacity: 1; transform: translateY(0)   scale(1); }
  20% { opacity: 1; transform: translateY(-8px) scale(1.1); }
  100%{ opacity: 0; transform: translateY(-40px) scale(0.8); }
}

/* ── Pokéball throw canvas overlay ── */
#pkm-ball-canvas {
  position: absolute; inset: 0;
  pointer-events: none; z-index: 25;
}
/* White flash overlay for send-out/recall */
#pkm-flash-overlay {
  position: absolute; inset: 0;
  background: #fff;
  opacity: 0; pointer-events: none; z-index: 24;
}

/* ── Attack animation canvas ── */
#pkm-atk-canvas {
  position: absolute; inset: 0;
  pointer-events: none; z-index: 20;
}

/* ── Recoil: attacker lunges forward ── */
@keyframes pkmLungeRight { 0%,100%{transform:translateX(0)} 40%{transform:translateX(22px)} }
@keyframes pkmLungeLeft  { 0%,100%{transform:translateX(0)} 40%{transform:translateX(-22px)} }
.pkm-sprite.lunge-me  { animation: pkmLungeRight 0.35s ease; }
.pkm-sprite.lunge-opp { animation: pkmLungeLeft  0.35s ease; }

/* ── Shop / Bag cards ── */
.pkm-item-card {
  background:#0d1117; border:1px solid rgba(251,191,36,0.18);
  border-radius:5px; padding:10px 8px; cursor:pointer;
  display:flex; flex-direction:column; align-items:center; gap:4px;
  transition:all 0.15s; text-align:center; position:relative;
}
.pkm-item-card:hover:not(.disabled) { border-color:rgba(251,191,36,0.55); background:rgba(251,191,36,0.06); transform:translateY(-1px); }
.pkm-item-card.disabled { opacity:0.35; cursor:not-allowed; }
.pkm-item-card.selected { border-color:#fbbf24; background:rgba(251,191,36,0.12); box-shadow:0 0 10px rgba(251,191,36,0.25); }
.pkm-item-img { width:40px; height:40px; object-fit:contain; image-rendering:pixelated; }
.pkm-item-name { font-size:0.58rem; color:#e2e8f0; letter-spacing:0.06em; font-weight:bold; }
.pkm-item-desc { font-size:0.46rem; color:#64748b; letter-spacing:0.04em; line-height:1.4; }
.pkm-item-price { font-size:0.5rem; color:#fbbf24; margin-top:2px; }
.pkm-item-qty { position:absolute; top:4px; right:6px; font-size:0.5rem; color:#fbbf24; font-family:'Orbitron',monospace; }
.pkm-item-buy-btn {
  margin-top:4px; padding:3px 10px;
  background:rgba(251,191,36,0.12); border:1px solid rgba(251,191,36,0.4);
  color:#fbbf24; font-family:'Share Tech Mono',monospace; font-size:0.5rem;
  cursor:pointer; border-radius:3px; letter-spacing:0.08em; transition:all 0.12s;
}
.pkm-item-buy-btn:hover { background:rgba(251,191,36,0.25); }
.pkm-item-buy-btn:disabled { opacity:0.3; cursor:not-allowed; }

/* ── Waiting indicator (multiplayer) ── */
.pkm-waiting {
  display: none; position: absolute; bottom: 8px; left: 0; right: 0;
  text-align: center;
  font-size: 0.56rem; color: #64748b; letter-spacing: 0.12em;
}
.pkm-waiting.active { display: block; animation: pkmPulse 1.5s ease-in-out infinite; }
@keyframes pkmPulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
</style>

  <div class="pkm-layout">
    <!-- Topbar -->
    <div class="pkm-topbar">
      <span class="pkm-opp-label" id="pkm-opp-label">VS AI</span>
      <button class="arcade-back-btn" onclick="confirmLeave('pokemon')" style="font-size:0.52rem;padding:3px 8px">🕹 ARCADE</button>
    </div>

    <!-- Battle field -->
    <div class="pkm-field" id="pkm-field">
      <div class="pkm-stars" id="pkm-stars"></div>
      <div class="pkm-ground-opp"></div>
      <div class="pkm-ground-me"></div>

      <!-- Opponent HP bar -->
      <div class="pkm-hpbar-wrap opp" id="pkm-opp-hpbar" style="display:none">
        <div class="pkm-hpbar-name">
          <span id="pkm-opp-name">---</span>
          <span class="pkm-hpbar-lvl" id="pkm-opp-lvl">Lv.50</span>
        </div>
        <div class="pkm-hpbar-types" id="pkm-opp-types"></div>
        <div id="pkm-opp-status"></div>
        <div class="pkm-stages" id="pkm-opp-stages"></div>
        <div class="pkm-hpbar-track">
          <div class="pkm-hpbar-fill" id="pkm-opp-hp-fill" style="width:100%"></div>
        </div>
        <div class="pkm-hp-nums" id="pkm-opp-hp-text"></div>
      </div>

      <!-- My HP bar -->
      <div class="pkm-hpbar-wrap me" id="pkm-me-hpbar" style="display:none">
        <div class="pkm-hpbar-name">
          <span id="pkm-me-name">---</span>
          <span class="pkm-hpbar-lvl" id="pkm-me-lvl">Lv.1</span>
        </div>
        <div class="pkm-hpbar-types" id="pkm-me-types"></div>
        <div id="pkm-me-status"></div>
        <div class="pkm-stages" id="pkm-me-stages"></div>
        <div class="pkm-hpbar-track">
          <div class="pkm-hpbar-fill" id="pkm-me-hp-fill" style="width:100%"></div>
        </div>
        <div class="pkm-hp-nums" id="pkm-me-hp-text"></div>
        <!-- XP bar (solo only) -->
        <div id="pkm-me-xpbar-wrap" style="margin-top:3px;display:none">
          <div style="height:3px;background:#1e293b;border-radius:2px;overflow:hidden">
            <div id="pkm-me-xp-fill" style="height:100%;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:2px;width:0%;transition:width 0.5s ease"></div>
          </div>
          <div id="pkm-me-xp-text" style="font-size:0.38rem;color:#3b82f6;text-align:right;margin-top:1px"></div>
        </div>
      </div>

      <!-- Sprites -->
      <img class="pkm-sprite opp" id="pkm-opp-sprite" src="" alt="" style="display:none"
           onerror="this.src='';this.style.opacity='0'">
      <img class="pkm-sprite me"  id="pkm-me-sprite"  src="" alt="" style="display:none"
           onerror="this.src='';this.style.opacity='0'">

      <!-- Attack animation canvas -->
      <canvas id="pkm-atk-canvas"></canvas>
      <!-- Pokéball throw canvas -->
      <canvas id="pkm-ball-canvas"></canvas>
      <!-- White flash for send-out/recall -->
      <div id="pkm-flash-overlay"></div>
      <!-- Waiting indicator -->
      <div class="pkm-waiting" id="pkm-waiting">WAITING FOR OPPONENT...</div>
    </div>

    <!-- Battle log -->
    <div class="pkm-log-box">
      <div class="pkm-log-text idle" id="pkm-log">Choose your starter to begin!</div>
    </div>

    <!-- Party bar -->
    <div class="pkm-party-bar" id="pkm-party-bar"></div>

    <!-- Moves -->
    <div class="pkm-moves" id="pkm-moves"></div>

    <!-- Actions -->
    <div class="pkm-actions">
      <button class="pkm-action-btn" id="pkm-switch-btn" onclick="PKM.openSwitch()">⇄ SWITCH</button>
      <button class="pkm-action-btn" id="pkm-bag-btn" onclick="PKM.openBag()" style="border-color:rgba(251,191,36,0.4);color:#ca8a04">🎒 BAG</button>
      <div class="pkm-vol-wrap">
        <button class="pkm-vol-icon" id="pkm-mute-btn" onclick="PKM.toggleMute()" title="Toggle Sound">🔊</button>
        <input class="pkm-vol-slider" id="pkm-vol-slider" type="range" min="0" max="100" value="20"
               oninput="PKM.setVolume(this.value)" title="Volume">
      </div>
    </div>

    <!-- Switch overlay -->
    <div class="pkm-switch-overlay" id="pkm-switch-overlay">
      <div class="pkm-switch-title">CHOOSE POKÉMON</div>
      <div class="pkm-switch-grid" id="pkm-switch-grid"></div>
      <button class="arcade-back-btn" onclick="PKM.closeSwitch()" id="pkm-switch-cancel" style="margin-top:4px">✖ CANCEL</button>
    </div>

    <!-- Result overlay -->
    <div class="pkm-result-overlay" id="pkm-result-overlay">
      <div class="pkm-result-icon" id="pkm-result-icon">🏆</div>
      <div class="pkm-result-title" id="pkm-result-title">BATTLE OVER</div>
      <div class="pkm-result-sub"   id="pkm-result-sub"></div>
      <div class="pkm-result-btns"  id="pkm-result-btns"></div>
    </div>

    <!-- Evolution animation overlay -->
    <div id="pkm-evo-overlay" style="display:none;position:absolute;inset:0;z-index:200;background:#000;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;">
      <div id="pkm-evo-flash" style="position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity 0.12s;"></div>
      <div id="pkm-evo-label" style="font-family:'Orbitron',sans-serif;font-size:clamp(0.7rem,2vw,1.1rem);letter-spacing:0.18em;color:#f472b6;text-shadow:0 0 20px #f472b6,0 0 40px #f472b6;margin-bottom:18px;text-align:center;position:relative;z-index:2;">WHAT?!</div>
      <div id="pkm-evo-sprite-wrap" style="position:relative;width:120px;height:120px;display:flex;align-items:center;justify-content:center;z-index:2;">
        <img id="pkm-evo-sprite-from" src="" style="width:100px;height:100px;image-rendering:pixelated;position:absolute;transition:opacity 0.3s;" />
        <img id="pkm-evo-sprite-to"   src="" style="width:100px;height:100px;image-rendering:pixelated;position:absolute;opacity:0;transition:opacity 0.3s;" />
        <!-- silhouette canvas drawn over sprite -->
        <canvas id="pkm-evo-canvas" width="100" height="100" style="position:absolute;image-rendering:pixelated;"></canvas>
      </div>
      <div id="pkm-evo-msg" style="font-family:'Share Tech Mono',monospace;font-size:clamp(0.6rem,1.5vw,0.85rem);letter-spacing:0.12em;color:#f9fafb;margin-top:20px;text-align:center;min-height:2.4em;position:relative;z-index:2;max-width:80%;"></div>
    </div>

    <!-- Shop overlay -->
    <div class="pkm-switch-overlay" id="pkm-shop-overlay" style="z-index:70;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:8px">
        <div class="pkm-switch-title" style="color:#fbbf24">🛒 ITEM SHOP</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:0.75rem">🪙</span>
          <span id="pkm-shop-coins" style="font-family:'Orbitron',sans-serif;font-size:0.85rem;color:#fbbf24">0</span>
        </div>
      </div>
      <div id="pkm-shop-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%"></div>
      <button class="arcade-back-btn" onclick="PKM.closeShop()" style="margin-top:10px">✖ CLOSE</button>
    </div>

    <!-- Bag overlay (in-battle) -->
    <div class="pkm-switch-overlay" id="pkm-bag-overlay" style="z-index:65;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:8px">
        <div class="pkm-switch-title" style="color:#fbbf24">🎒 BAG</div>
        <div style="font-size:0.5rem;color:#64748b;letter-spacing:0.1em">USING AN ITEM USES YOUR TURN</div>
      </div>
      <div id="pkm-bag-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%"></div>
      <div id="pkm-bag-empty" style="display:none;font-size:0.62rem;color:#64748b;letter-spacing:0.12em;text-align:center;padding:20px 0">
        BAG IS EMPTY<br><span style="font-size:0.52rem;opacity:0.6">BUY ITEMS FROM THE SHOP IN THE LOBBY</span>
      </div>
      <div style="margin-top:8px;font-size:0.5rem;color:#475569;text-align:center;letter-spacing:0.1em">SELECT A POKÉMON TO USE ITEM ON</div>
      <!-- Pokemon target picker (shown after selecting an item) -->
      <div id="pkm-bag-target" style="display:none;margin-top:8px;width:100%">
        <div style="font-size:0.56rem;color:#fbbf24;letter-spacing:0.12em;margin-bottom:6px;text-align:center">USE ON WHICH POKÉMON?</div>
        <div id="pkm-bag-target-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"></div>
        <button onclick="PKM.cancelItemTarget()" style="margin-top:8px;padding:5px 14px;background:transparent;border:1px solid rgba(255,255,255,0.15);color:#64748b;font-family:'Share Tech Mono',monospace;font-size:0.56rem;cursor:pointer;width:100%">✖ CANCEL</button>
      </div>
      <button class="arcade-back-btn" id="pkm-bag-close-btn" onclick="PKM.closeBag()" style="margin-top:8px">✖ CLOSE</button>
    </div>

    <!-- Chat (multiplayer only) -->
    <div class="chat-widget" id="chat-pokemon" style="flex-shrink:0">
      <div class="chat-header" id="chat-hdr-pokemon">CHAT</div>
      <div class="chat-messages" id="chat-msgs-pokemon"></div>
      <div class="chat-input-row">
        <input class="chat-input" id="chat-inp-pokemon" placeholder="Say something..." maxlength="120" onkeydown="if(event.key==='Enter')chatSend('pokemon')">
        <button class="chat-send-btn" onclick="chatSend('pokemon')">SEND</button>
      </div>
    </div>
  </div>
</div>

<script>
// ╔══════════════════════════════════════════════════════════════╗
// ║  POKÉMON BATTLE ENGINE  v2 — Solo AI + Online Multiplayer   ║
// ╚══════════════════════════════════════════════════════════════╝
const PKM = (() => {
