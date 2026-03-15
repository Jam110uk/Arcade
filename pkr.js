// PKR game module
// Auto-extracted from monolithic index.html

export default (() => {
  'use strict';

  // ── Constants ────────────────────────────────────────────
  const SUITS  = ['♠','♥','♦','♣'];
  const RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const RANK_V = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
  const STARTING_CHIPS = 1000;
  const SMALL_BLIND = 25, BIG_BLIND = 50;
  const AI_THINK_MS = 900;

  const HAND_NAMES = [
    'High Card','One Pair','Two Pair','Three of a Kind',
    'Straight','Flush','Full House','Four of a Kind',
    'Straight Flush','Royal Flush'
  ];

  // ── State ─────────────────────────────────────────────────
  let isMulti = false;
  let myName = 'YOU', oppName = 'AI';
  let roomCode = null, playerNum = 1;
  let unsubs = [];
  let aiTimer = null;

  // Game state (mirrored to Firebase in multi)
  let deck = [], myCards = [], oppCards = [], community = [];
  let myChips = STARTING_CHIPS, oppChips = STARTING_CHIPS;
  let pot = 0, myBet = 0, oppBet = 0;
  let dealer = 1; // 1=me, 2=opp
  let stage = 'preflop'; // preflop, flop, turn, river, showdown
  let toAct = 1; // 1=me, 2=opp
  let handOver = false;
  let roundCount = 0;

  // ── Deck helpers ─────────────────────────────────────────
  function makeDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({r,s});
    return d;
  }
  function shuffle(d) {
    for (let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
    return d;
  }
  function cardHtml(card, faceDown=false, dealt=false) {
    if (faceDown) return `<div class="pk-card back${dealt?' dealt':''}"></div>`;
    const isRed = card.s==='♥'||card.s==='♦';
    return `<div class="pk-card${isRed?' red':''}${dealt?' dealt':''}">
      <span class="pk-corner">${card.r}</span>
      <span class="pk-center">${card.s}</span>
      <span class="pk-corner-bot">${card.r}</span>
    </div>`;
  }

  // ── Hand evaluator ────────────────────────────────────────
  function evaluate(cards) {
    // Returns {rank:0-9, tiebreak:[]} — higher is better
    const hand = cards.slice(0,7);
    let best = {rank:-1, tiebreak:[]};
    const combos = getCombinations(hand, 5);
    for (const five of combos) {
      const ev = eval5(five);
      if (ev.rank > best.rank || (ev.rank===best.rank && cmpArr(ev.tiebreak,best.tiebreak)>0)) best=ev;
    }
    return best;
  }
  function getCombinations(arr, k) {
    if (k===arr.length) return [arr];
    if (k===1) return arr.map(x=>[x]);
    const result=[];
    for (let i=0;i<=arr.length-k;i++) {
      const rest=getCombinations(arr.slice(i+1),k-1);
      for (const r of rest) result.push([arr[i],...r]);
    }
    return result;
  }
  function eval5(cards) {
    const vals = cards.map(c=>RANK_V[c.r]).sort((a,b)=>b-a);
    const suits = cards.map(c=>c.s);
    const isFlush = suits.every(s=>s===suits[0]);
    const isStraight = checkStraight(vals);
    const counts = {};
    for (const v of vals) counts[v]=(counts[v]||0)+1;
    const freq = Object.entries(counts).map(([v,c])=>({v:+v,c})).sort((a,b)=>b.c-a.c||b.v-a.v);

    if (isFlush && isStraight) {
      const high = isStraight===14 ? 14 : Math.max(...vals);
      return {rank: high===14&&vals.includes(13)?9:8, tiebreak:[high]};
    }
    if (freq[0].c===4) return {rank:7, tiebreak:[freq[0].v, freq[1].v]};
    if (freq[0].c===3&&freq[1].c===2) return {rank:6, tiebreak:[freq[0].v, freq[1].v]};
    if (isFlush) return {rank:5, tiebreak:vals};
    if (isStraight) return {rank:4, tiebreak:[isStraight]};
    if (freq[0].c===3) return {rank:3, tiebreak:[freq[0].v,...freq.slice(1).map(f=>f.v)]};
    if (freq[0].c===2&&freq[1].c===2) return {rank:2, tiebreak:[Math.max(freq[0].v,freq[1].v),Math.min(freq[0].v,freq[1].v),freq[2].v]};
    if (freq[0].c===2) return {rank:1, tiebreak:[freq[0].v,...freq.slice(1).map(f=>f.v)]};
    return {rank:0, tiebreak:vals};
  }
  function checkStraight(vals) {
    const unique=[...new Set(vals)].sort((a,b)=>b-a);
    for (let i=0;i<=unique.length-5;i++) {
      if (unique[i]-unique[i+4]===4&&new Set(unique.slice(i,i+5)).size===5) return unique[i];
    }
    // wheel A-2-3-4-5
    if (unique.includes(14)&&unique.includes(2)&&unique.includes(3)&&unique.includes(4)&&unique.includes(5)) return 5;
    return 0;
  }
  function cmpArr(a,b) {
    for (let i=0;i<Math.min(a.length,b.length);i++) { if(a[i]!==b[i]) return a[i]-b[i]; }
    return 0;
  }
  function compareHands(myEv, oppEv) {
    if (myEv.rank!==oppEv.rank) return myEv.rank>oppEv.rank?1:-1;
    return cmpArr(myEv.tiebreak,oppEv.tiebreak);
  }

  // ── AI logic ─────────────────────────────────────────────
  function aiDecide() {
    const callAmt = myBet - oppBet;
    // Evaluate AI hand strength
    const known = [...oppCards, ...community];
    const ev = known.length>=2 ? evaluate([...known,...Array(Math.max(0,7-known.length)).fill({r:'2',s:'♠'})]) : {rank:0};
    const strength = ev.rank + Math.random()*0.8; // add some randomness
    const potOdds = pot > 0 ? callAmt/(pot+callAmt) : 0;

    // Preflop ranges
    const rank1=RANK_V[oppCards[0]?.r]||0, rank2=RANK_V[oppCards[1]?.r]||0;
    const handStrength = (rank1+rank2)/28 + (oppCards[0]?.r===oppCards[1]?.r?0.3:0) + Math.random()*0.15;

    let action;
    if (callAmt === 0) {
      // Can check or bet
      if (handStrength > 0.7 || strength >= 5) {
        const raise = Math.min(Math.max(BIG_BLIND*2, Math.floor(pot*0.6/BIG_BLIND)*BIG_BLIND), oppChips);
        action = { type:'raise', amount: raise };
      } else if (handStrength > 0.35 || strength >= 2) {
        action = { type:'check' };
      } else {
        action = { type:'check' }; // AI never folds for free
      }
    } else {
      // Must call or raise or fold
      if (handStrength < 0.25 && strength < 2 && potOdds > 0.3) {
        action = { type:'fold' };
      } else if (handStrength > 0.75 || strength >= 6) {
        const raise = Math.min(Math.max(callAmt*2, Math.floor(pot*0.75/BIG_BLIND)*BIG_BLIND), oppChips);
        action = { type:'raise', amount: raise };
      } else {
        action = { type:'call' };
      }
    }
    return action;
  }

  // ── Game flow ─────────────────────────────────────────────
  function dealHand() {
    handOver = false;
    deck = shuffle(makeDeck());
    myCards=[deck.pop(),deck.pop()];
    oppCards=[deck.pop(),deck.pop()];
    community=[];
    pot=0; myBet=0; oppBet=0;
    stage='preflop';
    roundCount++;

    // Post blinds
    const meIsSmall = (dealer===1);
    const smallBlind = Math.min(SMALL_BLIND, meIsSmall?myChips:oppChips);
    const bigBlind   = Math.min(BIG_BLIND,   meIsSmall?oppChips:myChips);

    if (meIsSmall) {
      myChips-=smallBlind; myBet=smallBlind;
      oppChips-=bigBlind;  oppBet=bigBlind;
      toAct=1; // small blind acts first preflop (they need to call or raise)
    } else {
      oppChips-=smallBlind; oppBet=smallBlind;
      myChips-=bigBlind;    myBet=bigBlind;
      toAct=2;
    }
    pot=smallBlind+bigBlind;

    renderAll();
    setStatus(`Round ${roundCount} — Blinds: ${SMALL_BLIND}/${BIG_BLIND}`);
    setStageLabel('PRE-FLOP');

    if (!isMulti) {
      if (toAct===2) scheduleAI();
      else showActions();
    } else {
      syncStateToFirebase();
      if (toAct===playerNum) showActions();
      else setStatus(`${oppName}'s turn...`);
    }
  }

  function advanceStreet() {
    myBet=0; oppBet=0;
    if (stage==='preflop') {
      stage='flop'; community=[deck.pop(),deck.pop(),deck.pop()];
      setStageLabel('FLOP');
    } else if (stage==='flop') {
      stage='turn'; community.push(deck.pop());
      setStageLabel('TURN');
    } else if (stage==='turn') {
      stage='river'; community.push(deck.pop());
      setStageLabel('RIVER');
    } else if (stage==='river') {
      stage='showdown';
      doShowdown();
      return;
    }
    // After flop/turn/river, first to act is player after dealer
    toAct = dealer===1 ? 2 : 1;
    renderCommunity();
    if (!isMulti) {
      if (toAct===2) scheduleAI();
      else showActions();
    } else {
      syncStateToFirebase();
      if (toAct===playerNum) showActions();
      else setStatus(`${oppName}'s turn...`);
    }
  }

  function doShowdown() {
    handOver = true;
    // Reveal opponent cards
    renderOppHand(true);
    const myAll=[...myCards,...community], oppAll=[...oppCards,...community];
    const myEv=evaluate(myAll), oppEv=evaluate(oppAll);
    const cmp=compareHands(myEv,oppEv);

    setTimeout(() => {
      let title, sub, cls;
      if (cmp>0) {
        myChips+=pot; title='YOU WIN!'; cls='win';
        sub=`Your ${HAND_NAMES[myEv.rank]} beats their ${HAND_NAMES[oppEv.rank]}\nPot: +${pot} chips`;
      } else if (cmp<0) {
        oppChips+=pot; title='YOU LOSE'; cls='lose';
        sub=`Their ${HAND_NAMES[oppEv.rank]} beats your ${HAND_NAMES[myEv.rank]}\nPot: -${myBet+SMALL_BLIND} chips`;
      } else {
        const half=Math.floor(pot/2); myChips+=half; oppChips+=pot-half;
        title='SPLIT POT'; cls='draw'; sub=`Both have ${HAND_NAMES[myEv.rank]}`;
      }
      pot=0;
      renderChips();
      if (myChips<=0) { endGame('OUT OF CHIPS', false); return; }
      if (oppChips<=0) { endGame(isMulti?'OPPONENT OUT':'AI BUSTED', true); return; }
      showOverlay(cls, title, sub, true);
    }, isMulti?300:800);
  }

  function doAction(type, amount) {
    if (handOver) return;
    const callAmt = (toAct===1?oppBet:myBet) - (toAct===1?myBet:oppBet);

    if (type==='fold') {
      pot += (toAct===1?myBet:oppBet);
      if (toAct===1) oppChips+=pot; else myChips+=pot;
      pot=0;
      handOver=true;
      renderChips();
      const iWon = toAct!==1;
      if (myChips<=0) { endGame('OUT OF CHIPS', false); return; }
      if (oppChips<=0) { endGame(isMulti?'OPPONENT FOLDED':'AI FOLDED', true); return; }
      showOverlay(iWon?'win':'lose', iWon?'YOU WIN!':'YOU LOSE',
        toAct===1 ? 'You folded.' : 'Opponent folded.', true);
      return;
    }

    if (type==='check') {
      // both checked or big blind checks — advance
    } else if (type==='call') {
      const amt = Math.min(callAmt, toAct===1?myChips:oppChips);
      if (toAct===1) { myChips-=amt; myBet+=amt; } else { oppChips-=amt; oppBet+=amt; }
      pot+=amt;
    } else if (type==='raise') {
      const amt = Math.min(amount, toAct===1?myChips:oppChips);
      if (toAct===1) { myChips-=amt; myBet+=amt; } else { oppChips-=amt; oppBet+=amt; }
      pot+=amt;
    }

    renderChips();
    renderPot();
    hideActions();

    // Determine if betting is complete
    const betsEqual = myBet===oppBet;
    const actedOnce = type==='check'||type==='call';

    if (betsEqual && actedOnce) {
      // Betting round complete
      setTimeout(advanceStreet, isMulti?100:600);
    } else if (type==='raise') {
      // Other player must respond
      toAct = toAct===1 ? 2 : 1;
      if (!isMulti) {
        if (toAct===2) scheduleAI(); else showActions();
      } else {
        syncStateToFirebase();
        if (toAct===playerNum) showActions();
        else setStatus(`${oppName}'s turn...`);
      }
    } else if (type==='check') {
      // Other player gets to check/bet too
      toAct = toAct===1 ? 2 : 1;
      if (!isMulti) {
        if (toAct===2) scheduleAI(); else showActions();
      } else {
        syncStateToFirebase();
        if (toAct===playerNum) showActions();
        else setStatus(`${oppName}'s turn...`);
      }
    }
  }

  function scheduleAI() {
    setStatus(`${oppName} is thinking...`);
    hideActions();
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = setTimeout(() => {
      const action = aiDecide();
      doAction(action.type, action.amount||0);
    }, AI_THINK_MS);
  }

  // ── Firebase (multiplayer) ────────────────────────────────
  function syncStateToFirebase() {
    if (!roomCode) return;
    const stateData = {
      deck: deck.map(c=>c.r+c.s),
      myCards: playerNum===1 ? myCards.map(c=>c.r+c.s) : oppCards.map(c=>c.r+c.s),
      oppCards: playerNum===1 ? oppCards.map(c=>c.r+c.s) : myCards.map(c=>c.r+c.s),
      community: community.map(c=>c.r+c.s),
      p1Chips: playerNum===1 ? myChips : oppChips,
      p2Chips: playerNum===1 ? oppChips : myChips,
      p1Bet: playerNum===1 ? myBet : oppBet,
      p2Bet: playerNum===1 ? oppBet : myBet,
      pot, dealer, stage, toAct, handOver, roundCount,
    };
    set(ref(db, `poker/${roomCode}/state`), stateData).catch(()=>{});
  }

  function parseCard(str) {
    // e.g. "A♠" or "10♥"
    const s = str.slice(-1); const r = str.slice(0,-1);
    return {r,s};
  }

  function applyFirebaseState(data) {
    if (!data) return;
    deck        = (data.deck||[]).map(parseCard);
    const p1Cards = (data.myCards||[]).map(parseCard);
    const p2Cards = (data.oppCards||[]).map(parseCard);
    myCards     = playerNum===1 ? p1Cards : p2Cards;
    oppCards    = playerNum===1 ? p2Cards : p1Cards;
    community   = (data.community||[]).map(parseCard);
    myChips     = playerNum===1 ? data.p1Chips : data.p2Chips;
    oppChips    = playerNum===1 ? data.p2Chips : data.p1Chips;
    myBet       = playerNum===1 ? data.p1Bet : data.p2Bet;
    oppBet      = playerNum===1 ? data.p2Bet : data.p1Bet;
    pot         = data.pot||0;
    dealer      = data.dealer||1;
    stage       = data.stage||'preflop';
    toAct       = data.toAct||1;
    handOver    = data.handOver||false;
    roundCount  = data.roundCount||0;

    renderAll();
    setStageLabel(stage.toUpperCase().replace('PREFLOP','PRE-FLOP'));

    if (handOver) { hideActions(); return; }

    if (toAct===playerNum) showActions();
    else { hideActions(); setStatus(`${oppName}'s turn...`); }
  }

  function listenToFirebase() {
    const unsub = onValue(ref(db, `poker/${roomCode}/state`), snap => {
      if (!snap.exists()) return;
      const data = snap.val();
      // Only apply if the other player pushed this update
      if (toAct===playerNum && !handOver) return; // we control state when it's our turn
      applyFirebaseState(data);
    });
    unsubs.push(unsub);

    const abUnsub = watchForAbandoned(`poker/${roomCode}`, () => {
      showAbandonedNotice(() => { destroy(); backToGameSelect(); });
    });
    unsubs.push(abUnsub);
  }

  // ── Render ────────────────────────────────────────────────
  function renderAll() {
    renderMyHand();
    renderOppHand(handOver && stage==='showdown');
    renderCommunity();
    renderChips();
    renderPot();
  }

  function renderMyHand() {
    const el = document.getElementById('pk-my-hand');
    if (!el) return;
    el.innerHTML = myCards.map(c=>cardHtml(c,false,true)).join('');
  }
  function renderOppHand(reveal=false) {
    const el = document.getElementById('pk-opp-hand');
    if (!el) return;
    if (reveal) el.innerHTML = oppCards.map(c=>cardHtml(c,false,true)).join('');
    else        el.innerHTML = oppCards.map(()=>cardHtml(null,true,false)).join('');
  }
  function renderCommunity() {
    const el = document.getElementById('pk-community-cards');
    if (!el) return;
    const slots = [];
    for (let i=0;i<5;i++) {
      slots.push(i<community.length ? cardHtml(community[i],false,true) : '<div class="pk-card" style="opacity:0.15;border:1px dashed rgba(16,185,129,0.3)"></div>');
    }
    el.innerHTML = slots.join('');
  }
  function renderChips() {
    const mc=document.getElementById('pk-my-chips'), oc=document.getElementById('pk-opp-chips');
    if(mc)mc.textContent=myChips;
    if(oc)oc.textContent=oppChips;
    // dealer badge
    const md=document.getElementById('pk-my-dealer'), od=document.getElementById('pk-opp-dealer');
    if(md)md.style.display=dealer===1?'':'none';
    if(od)od.style.display=dealer===2?'':'none';
    // active border
    const mt=document.getElementById('pk-my-tag'), ot=document.getElementById('pk-opp-tag');
    if(mt){ mt.classList.toggle('active', toAct===1); }
    if(ot){ ot.classList.toggle('active', toAct===2); }
  }
  function renderPot() {
    const el=document.getElementById('pk-pot'); if(el) el.textContent=pot;
  }
  function setStageLabel(txt) {
    const el=document.getElementById('pk-stage-label'); if(el) el.textContent=txt;
  }
  function setStatus(msg) {
    const el=document.getElementById('pk-status-msg'); if(el) el.textContent=msg;
  }

  function showActions() {
    setStatus('Your turn');
    const bar = document.getElementById('pk-action-btns');
    if (!bar) return;
    bar.style.display='';

    const callAmt = oppBet - myBet;
    const checkBtn  = document.getElementById('pk-check-btn');
    const callBtn   = document.getElementById('pk-call-btn');
    const raiseSlider = document.getElementById('pk-raise-slider');

    if (checkBtn) checkBtn.style.display = callAmt===0 ? '' : 'none';
    if (callBtn)  { callBtn.style.display = callAmt>0 ? '' : 'none'; callBtn.textContent=`CALL ${callAmt}`; }

    const maxRaise = myChips;
    const minRaise = Math.max(BIG_BLIND, callAmt*2);
    if (raiseSlider && maxRaise>0) {
      raiseSlider.min = minRaise;
      raiseSlider.max = maxRaise;
      raiseSlider.value = Math.min(Math.max(minRaise, Math.floor(pot/2)), maxRaise);
      PKR.updateRaiseDisplay();
    }
    const raiseBtn=document.getElementById('pk-raise-btn');
    if(raiseBtn) raiseBtn.disabled=(myChips<minRaise);
  }

  function hideActions() {
    const bar=document.getElementById('pk-action-btns'); if(bar) bar.style.display='none';
  }

  function showOverlay(cls, title, sub, showNextBtn=false) {
    const ov=document.getElementById('pk-overlay'); if(!ov) return;
    document.getElementById('pk-ov-title').className='pk-ov-title '+cls;
    document.getElementById('pk-ov-title').textContent=title;
    document.getElementById('pk-ov-sub').innerHTML=sub.replace(/\n/g,'<br>');
    const btns=document.getElementById('pk-ov-btns');
    if (showNextBtn) {
      btns.innerHTML=`<button class="pk-btn check" onclick="PKR.nextHand()">NEXT HAND ▶</button>
        <button class="arcade-back-btn" onclick="confirmLeave('poker')">🕹 ARCADE</button>`;
    } else {
      btns.innerHTML=`<button class="pk-btn check" onclick="PKR.restart()">PLAY AGAIN</button>
        <button class="arcade-back-btn" onclick="confirmLeave('poker')">🕹 ARCADE</button>`;
    }
    ov.classList.add('active');
  }

  function hideOverlay() {
    const ov=document.getElementById('pk-overlay'); if(ov) ov.classList.remove('active');
  }

  function endGame(reason, iWon) {
    handOver=true;
    showHeaderLeave('poker');
    showOverlay(iWon?'win':'lose', iWon?'YOU WIN!':'GAME OVER',
      reason+`\nYou: ${myChips} chips | Opp: ${oppChips} chips`, false);
    if (!isMulti && iWon && myChips > 0 && window.HS)
      setTimeout(() => HS.promptSubmit('poker', myChips, `${myChips} chips`), 400);
  }

  // ── Public API ────────────────────────────────────────────
  function initSolo() {
    isMulti=false; roomCode=null;
    myName='YOU'; oppName='ACE (AI)';
    playerNum=1;
    myChips=STARTING_CHIPS; oppChips=STARTING_CHIPS;
    dealer=1; roundCount=0;
    setNames();
    hideOverlay();
    document.getElementById('pk-my-tag').style.display='';
    document.getElementById('pk-opp-tag').style.display='';
    showHeaderLeave('poker');
    dealHand();
  }

  function setNames() {
    const mn=document.getElementById('pk-my-name'), on=document.getElementById('pk-opp-name');
    if(mn) mn.textContent=myName;
    if(on) on.textContent=oppName;
  }

  function destroy() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer=null; }
    unsubs.forEach(u=>typeof u==='function'&&u()); unsubs=[];
    handOver=true;
    hideOverlay();
  }

  return {
    initSolo,
    destroy,
    get roomCode() { return roomCode; },

    doAction(type) {
      if (toAct!==playerNum&&isMulti) return;
      if (toAct!==1&&!isMulti) return;
      const slider=document.getElementById('pk-raise-slider');
      const amount=slider?+slider.value:0;
      doAction(type, amount);
      if (isMulti && !handOver) syncStateToFirebase();
    },

    updateRaiseDisplay() {
      const slider=document.getElementById('pk-raise-slider');
      const label=document.getElementById('pk-raise-amt');
      if(slider&&label) label.textContent=slider.value;
    },

    nextHand() {
      if (myChips<=0||oppChips<=0) { PKR.restart(); return; }
      hideOverlay();
      dealer = dealer===1?2:1;
      dealHand();
    },

    restart() {
      myChips=STARTING_CHIPS; oppChips=STARTING_CHIPS;
      dealer=1; roundCount=0; handOver=false;
      hideOverlay();
      dealHand();
    },

    // Called from slLaunchGame
    launchMulti(isHost, myN, oppN, code) {
      isMulti=true;
      roomCode=code;
      playerNum=isHost?1:2;
      myName=myN; oppName=oppN;
      myChips=STARTING_CHIPS; oppChips=STARTING_CHIPS;
      dealer=1; roundCount=0;
      setNames();
      hideOverlay();
      showHeaderLeave('poker');
      chatInit('poker', `poker/${code}/chat`, myN);
      listenToFirebase();

      if (isHost) {
        // Host deals
        dealHand();
      } else {
        setStatus(`Waiting for ${oppN} to deal...`);
        renderOppHand(false);
        renderCommunity();
      }
    },
  };
})();

function pokerLaunchFromLobby(isHost, myName, oppName, gameCode) {
  document.getElementById('main-title').textContent = '🃏 POKER';
  document.getElementById('main-subtitle').textContent = 'TEXAS HOLD\'EM — ONLINE';
  document.getElementById('header-room-code').textContent = gameCode;
  document.getElementById('room-code-display').style.display = '';
  showScreen('poker-screen');
  PKR.launchMulti(isHost, myName, oppName, gameCode);
}


// ============================================================
// CHESS ENGINE — Solo vs AI (minimax) + 2P Online
// ============================================================

window.CHESS = (() => {
