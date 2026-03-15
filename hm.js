// HM game module
// Auto-extracted from monolithic index.html

export default (function() {

  const MAX_WRONG = 6;
  const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

  // Word bank for solo play
  const WORDS = [
    {w:'ELEPHANT',    h:'ANIMAL'},
    {w:'VOLCANO',     h:'GEOGRAPHY'},
    {w:'JAVASCRIPT',  h:'PROGRAMMING'},
    {w:'SAXOPHONE',   h:'MUSIC'},
    {w:'TELESCOPE',   h:'SCIENCE'},
    {w:'DEMOCRACY',   h:'POLITICS'},
    {w:'CROISSANT',   h:'FOOD'},
    {w:'MARATHON',    h:'SPORT'},
    {w:'PHOTOGRAPH',  h:'ART'},
    {w:'FIBONACCI',   h:'MATHEMATICS'},
    {w:'SUBMARINE',   h:'VEHICLES'},
    {w:'HURRICANE',   h:'WEATHER'},
    {w:'ALGORITHM',   h:'COMPUTING'},
    {w:'CHAMPAGNE',   h:'DRINKS'},
    {w:'ACCORDION',   h:'MUSIC'},
    {w:'LABYRINTH',   h:'PLACES'},
    {w:'NITROGEN',    h:'SCIENCE'},
    {w:'PARLIAMENT',  h:'POLITICS'},
    {w:'FLAMINGO',    h:'ANIMAL'},
    {w:'ARCHITECT',   h:'JOBS'},
    {w:'GUILLOTINE',  h:'HISTORY'},
    {w:'XYLOPHONE',   h:'MUSIC'},
    {w:'AVALANCHE',   h:'WEATHER'},
    {w:'PISTACHIO',   h:'FOOD'},
    {w:'PORCELAIN',   h:'MATERIALS'},
    {w:'QUICKSAND',   h:'NATURE'},
    {w:'SOLSTICE',    h:'ASTRONOMY'},
    {w:'TRAPEZOID',   h:'SHAPES'},
    {w:'WOLVERINE',   h:'ANIMAL'},
    {w:'ESPIONAGE',   h:'SPY STUFF'},
  ];

  // State
  let word = '', hint = '', guessed = new Set();
  let wrongCount = 0, streak = 0;
  let gameOver = false;
  let isMulti = false, isGuesser = false;
  let roomCode = null, myName = '', oppName = '';
  let unsubs = [];

  // Canvas
  let canvas, ctx;

  let hmRaf = null;
  function hmAnimLoop() {
    drawGallows();
    hmRaf = requestAnimationFrame(hmAnimLoop);
  }

  function init() {
    canvas = document.getElementById('hm-canvas');
    ctx = canvas.getContext('2d');
    buildKeyboard();
    if (!hmRaf) hmAnimLoop();
  }

  function destroy() {
    unsubs.forEach(u => typeof u === 'function' && u());
    unsubs = [];
    // Delete room from Firebase (chat lives inside it, so one remove covers both)
    if (roomCode && isMulti) {
      try { remove(ref(db, `hangman/${roomCode}`)); } catch(e) {}
      roomCode = null;
    }
    chatDestroy('hangman');
    hideOverlay();
    const ov = document.getElementById('hm-overlay');
    if (ov) ov.classList.remove('active');
  }

  // ?? Solo ????????????????????????????????????????????????????
  function initSolo() {
    if (!canvas) init();
    isMulti = false; isGuesser = true;
    const entry = WORDS[Math.floor(Math.random() * WORDS.length)];
    startGame(entry.w, entry.h);
    document.getElementById('hm-new-btn').style.display = '';
    showScreen('hangman-screen');
  }

  function newGame() {
    if (isMulti) return; // multiplayer: can't start new game yourself
    initSolo();
  }

  // ?? Multiplayer launch ??????????????????????????????????????
  function launchFromLobby(host, mName, oName, code) {
    if (!canvas) init();
    isMulti = true;
    myName = mName; oppName = oName; roomCode = code;
    // Host = word SETTER, Guest = GUESSER
    isGuesser = !host;

    document.getElementById('main-title').textContent = '🪢 HANGMAN';
    document.getElementById('main-subtitle').textContent = host ? 'SET THE WORD' : 'GUESS THE WORD';
    document.getElementById('hm-new-btn').style.display = 'none';

    if (host) {
      // Setter screen
      document.getElementById('hm-set-sub').textContent = oppName + ' will try to guess your word!';
      document.getElementById('hm-set-word').value = '';
      document.getElementById('hm-set-hint').value = '';
      document.getElementById('hm-set-status').textContent = '';
      document.getElementById('hm-set-waiting').style.display = 'none';
      showScreen('hm-set-screen');
      // Listen for game start (setter needs to listen too for guesses)
      listenAsHost(code);
    } else {
      // Guesser: show waiting overlay until host sets word
      showScreen('hangman-screen');
      startGame('?'.repeat(8), ''); // placeholder
      setStatus('⏳ WAITING FOR HOST TO SET THE WORD—', '');
      disableKeyboard(true);
      listenAsGuest(code);
    }
  }

  // Host submitted word
  function confirmWord() {
    const w = (document.getElementById('hm-set-word').value || '').trim().toUpperCase().replace(/[^A-Z]/g,'');
    const h = (document.getElementById('hm-set-hint').value || '').trim().toUpperCase();
    if (w.length < 2) { document.getElementById('hm-set-status').textContent = 'WORD MUST BE AT LEAST 2 LETTERS'; return; }
    document.getElementById('hm-set-status').textContent = '';
    document.getElementById('hm-set-waiting').style.display = '';
    document.getElementById('hm-set-word').disabled = true;
    document.getElementById('hm-set-hint').disabled = true;

    // Write to Firebase
    set(ref(db, `hangman/${roomCode}`), {
      status: 'playing',
      word: w,
      hint: h,
      guesses: '',
      wrong: 0,
      result: null,
      setter: myName,
      guesser: oppName,
    });
  }

  function listenAsHost(code) {
    const unsub = onValue(ref(db, `hangman/${code}`), snap => {
      if (!snap.exists()) return;
      const room = snap.val();
      if (room.result === 'win' || room.result === 'lose') {
        const won = room.result === 'win';
        // Setter sees inverse result
        showOverlay(
          won ? 'lose' : 'win',
          won ? '🎉 THEY GOT IT!' : '💀 THEY FAILED!',
          room.word,
          won ? oppName + ' guessed your word!' : 'The word was ' + room.word,
          [
            {label:'🔄 PLAY AGAIN', fn:'hmMultiPlayAgain()'},
            {label:'🕹 ARCADE',     fn:'backToGameSelect()'},
          ]
        );
      }
    });
    unsubs.push(unsub);
  }

  function listenAsGuest(code) {
    const unsub = onValue(ref(db, `hangman/${code}`), snap => {
      if (!snap.exists()) return;
      const room = snap.val();
      if (room.status !== 'playing') return;

      // First time word arrives
      if (word !== room.word || hint !== room.hint) {
        word = room.word;
        hint = room.hint;
        guessed = new Set((room.guesses || '').split('').filter(Boolean));
        wrongCount = room.wrong || 0;
        gameOver = false;
        disableKeyboard(false);
        setStatus('');
        renderWord();
        renderHint();
        drawGallows();
        updateStats();
        chatInit('hangman', `hangman/${code}/chat`, myName);
        showHeaderLeave('hangman-multi');
      } else {
        // Sync state
        guessed = new Set((room.guesses || '').split('').filter(Boolean));
        wrongCount = room.wrong || 0;
        renderWord();
        drawGallows();
        updateStats();
      }

      if (room.result === 'win') {
        gameOver = true;
        disableKeyboard(true);
        showOverlay('win', '🎉 YOU WIN!', word, oppName + ' set: ' + word, [
          {label:'🔄 PLAY AGAIN', fn:'hmMultiPlayAgain()'},
          {label:'🕹 ARCADE',     fn:'backToGameSelect()'},
        ]);
      } else if (room.result === 'lose') {
        gameOver = true;
        disableKeyboard(true);
        showOverlay('lose', '💀 HANGED!', word, 'The word was: ' + word, [
          {label:'🔄 PLAY AGAIN', fn:'hmMultiPlayAgain()'},
          {label:'🕹 ARCADE',     fn:'backToGameSelect()'},
        ]);
      }
    });
    unsubs.push(unsub);
  }

  // Guess synced to Firebase
  async function guessMulti(letter) {
    if (gameOver || !isGuesser) return;
    const snap = await get(ref(db, `hangman/${roomCode}`));
    if (!snap.exists()) return;
    const room = snap.val();
    if (room.result) return;

    const newGuesses = room.guesses + letter;
    const isHit = room.word.includes(letter);
    const newWrong = isHit ? room.wrong : room.wrong + 1;

    // Check win/lose
    const revealed = room.word.split('').filter(c => newGuesses.includes(c)).length;
    let result = null;
    if (revealed === room.word.length) result = 'win';
    else if (newWrong >= MAX_WRONG) result = 'lose';

    await update(ref(db, `hangman/${roomCode}`), {
      guesses: newGuesses,
      wrong:   newWrong,
      result,
    });
  }

  // ?? Solo game ???????????????????????????????????????????????
  function startGame(w, h) {
    word = w.toUpperCase(); hint = h;
    guessed = new Set();
    wrongCount = 0; gameOver = false;
    hideOverlay();
    disableKeyboard(false);
    renderWord();
    renderHint();
    drawGallows();
    updateStats();
    setStatus('');
  }

  function guess(letter) {
    if (gameOver || guessed.has(letter)) return;
    guessed.add(letter);
    const hit = word.includes(letter);
    if (!hit) wrongCount++;

    if (isMulti && isGuesser) {
      guessMulti(letter);
      // Optimistic local update
      renderWord(); drawGallows(); updateStats();
      markKey(letter, hit);
      return;
    }

    renderWord(); drawGallows(); updateStats();
    markKey(letter, hit);

    // Check win
    const allGuessed = word.split('').every(c => c === ' ' || guessed.has(c));
    if (allGuessed) {
      gameOver = true; streak++;
      showOverlay('win', '🎉 YOU WIN!', word, 'Well done!', [
        {label:'🔄 NEW WORD', fn:'hmNewGame()'},
        {label:'🕹 ARCADE',   fn:'backToGameSelect()'},
      ]);
      if (!isMulti && streak > 0) setTimeout(() => HS.promptSubmit('hangman', streak, `${streak} word streak`), 400);
      return;
    }
    if (wrongCount >= MAX_WRONG) {
      gameOver = true; streak = 0;
      showOverlay('lose', '💀 HANGED!', word, 'The word was: ' + word, [
        {label:'🔄 TRY AGAIN', fn:'hmNewGame()'},
        {label:'🕹 ARCADE',    fn:'backToGameSelect()'},
      ]);
    }
  }

  // ?? Render ??????????????????????????????????????????????????
  function renderWord() {
    const row = document.getElementById('hm-word-row');
    if (!row) return;
    const chars = word.split('');
    row.innerHTML = chars.map(c => {
      if (c === ' ') return '<div style="width:14px"></div>';
      const revealed = guessed.has(c);
      return `<div class="hm-letter-slot">
        <div class="hm-letter-char">${revealed ? c : ''}</div>
        <div class="hm-letter-dash${revealed ? ' active' : ''}"></div>
      </div>`;
    }).join('');
  }

  function renderHint() {
    const el = document.getElementById('hm-hint-label');
    if (!el) return;
    el.innerHTML = hint ? `CATEGORY: <span>${hint}</span>` : '';
  }

  function updateStats() {
    const wrongEl = document.getElementById('hm-wrong');
    const leftEl  = document.getElementById('hm-left');
    const streakEl = document.getElementById('hm-streak');
    if (wrongEl)  wrongEl.textContent  = wrongCount;
    if (leftEl)   leftEl.textContent   = Math.max(0, MAX_WRONG - wrongCount);
    if (streakEl) streakEl.textContent = streak;
    if (wrongEl) wrongEl.classList.toggle('danger', wrongCount > 3);
  }

  function setStatus(msg, type) {
    const el = document.getElementById('hm-status-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'hm-status' + (type ? ' ' + type : '');
  }

  // ?? Keyboard ????????????????????????????????????????????????
  function buildKeyboard() {
    KEY_ROWS.forEach((row, i) => {
      const rowEl = document.getElementById('hm-row-' + (i+1));
      if (!rowEl) return;
      rowEl.innerHTML = '';
      row.split('').forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'hm-key';
        btn.textContent = letter;
        btn.id = 'hm-key-' + letter;
        btn.onclick = () => guess(letter);
        rowEl.appendChild(btn);
      });
    });
  }

  function disableKeyboard(disabled) {
    document.querySelectorAll('.hm-key').forEach(k => {
      k.disabled = disabled;
      if (!disabled) { k.classList.remove('hit','miss'); }
    });
  }

  function markKey(letter, hit) {
    const btn = document.getElementById('hm-key-' + letter);
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add(hit ? 'hit' : 'miss');
  }

  function syncKeyboard() {
    disableKeyboard(false);
    guessed.forEach(letter => {
      const hit = word.includes(letter);
      markKey(letter, hit);
      const btn = document.getElementById('hm-key-' + letter);
      if (btn) btn.disabled = true;
    });
  }

  // ?? Gallows drawing ?????????????????????????????????????????
  function drawGallows() {
    if (!ctx) return;
    const W = 280, H = 220;
    ctx.clearRect(0, 0, W, H);
    const now = Date.now();

    // Atmospheric background
    ctx.fillStyle = '#010410'; ctx.fillRect(0, 0, W, H);
    // Radial glow behind gallows
    const bgGrad = ctx.createRadialGradient(180, 100, 0, 180, 100, 120);
    const dangerAlpha = wrongCount / 6;
    bgGrad.addColorStop(0, `rgba(${Math.round(dangerAlpha*60)},0,${Math.round(20-dangerAlpha*10)},0.4)`);
    bgGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = bgGrad; ctx.fillRect(0,0,W,H);

    // Grid
    ctx.strokeStyle = 'rgba(0,60,120,0.15)'; ctx.lineWidth = 0.5;
    for (let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for (let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Flickering neon gallows — intensity flickers slightly
    const flicker = 0.85 + 0.15 * Math.sin(now * 0.012);
    const lc = '#00f5ff', lw = 3;
    ctx.shadowColor = lc;
    ctx.shadowBlur  = 10 * flicker;
    ctx.strokeStyle = lc; ctx.lineWidth = lw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = flicker;

    // Base, pole, beam, noose support
    ctx.beginPath(); ctx.moveTo(20,210); ctx.lineTo(260,210); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(60,210); ctx.lineTo(60,20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(60,20); ctx.lineTo(180,20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(180,20); ctx.lineTo(180,50); ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    if (wrongCount < 1) return;

    // Danger color progression: cyan → pink → red
    const danger = wrongCount / 6;
    const h = Math.round(180 - danger * 200); // 180=cyan → -20≈red
    const figColor = danger < 0.5
      ? `hsl(${h},100%,60%)`
      : `hsl(${Math.max(0,h)},100%,${Math.round(60-danger*20)}%)`;

    // Swaying rope + figure (oscillates when hanging)
    const swayAmt = wrongCount >= 6 ? Math.sin(now * 0.003) * 4 : 0;
    const fx = 180 + swayAmt; // figure pivot x

    ctx.save();
    ctx.shadowColor = figColor; ctx.shadowBlur = 14 + danger*8;
    ctx.strokeStyle = figColor; ctx.lineWidth = 3;

    // Rope (always pink when any parts drawn)
    ctx.strokeStyle = '#ff2d78'; ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(180,20); ctx.lineTo(fx,50); ctx.stroke();

    ctx.strokeStyle = figColor; ctx.shadowColor = figColor; ctx.shadowBlur = 14;

    // Head
    ctx.beginPath(); ctx.arc(fx, 65, 15, 0, Math.PI*2); ctx.stroke();

    // Face expressions — more distraught each wrong guess
    if (wrongCount >= 1) {
      ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = figColor; ctx.lineWidth = 1.5;
      // Eyes
      const eyeStyle = wrongCount >= 6 ? 'x' : wrongCount >= 3 ? 'o' : 'dot';
      if (eyeStyle === 'x') {
        // X eyes
        [[fx-6,60],[fx+6,60]].forEach(([ex,ey]) => {
          ctx.beginPath(); ctx.moveTo(ex-3,ey-3); ctx.lineTo(ex+3,ey+3); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ex+3,ey-3); ctx.lineTo(ex-3,ey+3); ctx.stroke();
        });
      } else if (eyeStyle === 'o') {
        ctx.beginPath(); ctx.arc(fx-6,61,3,0,Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(fx+6,61,3,0,Math.PI*2); ctx.stroke();
      } else {
        ctx.fillStyle = figColor;
        ctx.beginPath(); ctx.arc(fx-6,61,2,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(fx+6,61,2,0,Math.PI*2); ctx.fill();
      }
      // Mouth — frown gets worse
      const mouthY = 70;
      ctx.beginPath();
      ctx.arc(fx, mouthY + wrongCount*1.5, 7, 0.2 + wrongCount*0.08, Math.PI - 0.2 - wrongCount*0.08, true);
      ctx.stroke();
      ctx.restore();
    }

    if (wrongCount < 2) { ctx.restore(); return; }
    // Body
    ctx.beginPath(); ctx.moveTo(fx,80); ctx.lineTo(fx,140); ctx.stroke();
    if (wrongCount < 3) { ctx.restore(); return; }
    // Left arm
    ctx.beginPath(); ctx.moveTo(fx,95); ctx.lineTo(fx-30,120+swayAmt*0.5); ctx.stroke();
    if (wrongCount < 4) { ctx.restore(); return; }
    // Right arm
    ctx.beginPath(); ctx.moveTo(fx,95); ctx.lineTo(fx+30,120+swayAmt*0.5); ctx.stroke();
    if (wrongCount < 5) { ctx.restore(); return; }
    // Left leg
    ctx.beginPath(); ctx.moveTo(fx,140); ctx.lineTo(fx-30,175+swayAmt*0.3); ctx.stroke();
    if (wrongCount < 6) { ctx.restore(); return; }
    // Right leg — complete figure
    ctx.beginPath(); ctx.moveTo(fx,140); ctx.lineTo(fx+30,175+swayAmt*0.3); ctx.stroke();

    // Drip effect — small animated drops when dead
    if (wrongCount >= 6) {
      const dropT = ((now * 0.001) % 1);
      const dropY = 80 + dropT * 60;
      ctx.save(); ctx.globalAlpha = Math.sin(dropT * Math.PI) * 0.6;
      ctx.fillStyle = '#ff0040'; ctx.shadowColor='#ff0040'; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.arc(fx, dropY, 2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // ?? Overlay ?????????????????????????????????????????????????
  function showOverlay(type, title, revealWord, sub, btns) {
    const ov = document.getElementById('hm-overlay');
    if (!ov) return;
    ov.classList.add('active');
    const t = document.getElementById('hm-ov-title');
    t.textContent = title; t.className = 'hm-ov-title ' + type;
    document.getElementById('hm-ov-word').textContent = revealWord || '';
    document.getElementById('hm-ov-sub').textContent  = sub || '';
    const bd = document.getElementById('hm-ov-btns');
    bd.innerHTML = btns.map(b => `<button class="${b.label.includes('ARCADE') ? 'arcade-back-btn' : 'hm-btn'}" onclick="${b.fn}">${b.label}</button>`).join('');
  }

  function hideOverlay() {
    const ov = document.getElementById('hm-overlay');
    if (ov) ov.classList.remove('active');
  }

  return {
    initSolo,
    launchFromLobby,
    newGame,
    confirmWord,
    destroy,
  };
})();
