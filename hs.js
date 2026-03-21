// HS game module
// Auto-extracted from monolithic index.html

export default (() => {
  // Games tracked, in tab order
  const GAMES = [
    { key: 'tetris',       label: 'TETRIS',        unit: 'pts' },
    { key: 'snake',        label: 'SNAKE',          unit: 'pts' },
    { key: 'racer',        label: 'ROAD RAGE',      unit: 'pts' },
    { key: 'zuma',         label: 'ZUMA',           unit: 'pts' },
    { key: 'pacman',       label: 'PAC-MAN',        unit: 'pts' },
    { key: 'bejeweled',    label: 'BEJEWELED',      unit: 'pts' },
    { key: 'plinko',       label: 'PLINKO',         unit: 'pts' },
    { key: 'bubblebreaker',label: 'BUBBLE BREAKER', unit: 'pts' },
    { key: 'puzzlebobble', label: 'PUZZLE BOBBLE',  unit: 'pts' },
    { key: 'bustamove3d',  label: 'BUST-A-MOVE 3D', unit: 'pts' },
    { key: 'orbit',        label: 'ORBIT',          unit: 'pts' },
    { key: 'claw',         label: 'CLAW MACHINE',   unit: 'pts' },
    { key: 'wordle',       label: 'WORDLE',         unit: 'streak' },
    { key: 'hangman',      label: 'HANGMAN',        unit: 'streak' },
    { key: 'minesweeper',  label: 'MINESWEEPER',    unit: 'sec', lowerBetter: true },
    { key: 'solitaire',    label: 'SOLITAIRE',      unit: 'pts' },
    { key: 'trivia',       label: 'TRIVIA',         unit: 'pts' },
    { key: 'poker',        label: 'POKER',          unit: 'chips' },
    { key: 'chess',        label: 'CHESS',          unit: 'wins' },
    { key: 'tron',         label: 'TRON',           unit: 'wins' },
    { key: 'stackit',      label: 'STACK IT',       unit: 'pts', extraKey: 'rows', extraLabel: 'ROWS' },
  ];

  let pendingGame  = null;
  let pendingScore = null;
  let currentTab   = GAMES[0].key;
  let viewUnsub    = null;
  let _postCloseAction = null; // fires after submit or skip (used for mid-game exit)

  // Helpers — use window._fb* so this ES module can reach Firebase
  // without relying on the non-module globals (ref, get, set) from index.html
  function _ref(path)       { return window._fbRef(path); }
  function _get(r)          { return window._fbGet(r); }
  function _set(r, v)       { return window._fbSet(r, v); }
  function _onValue(r, cb)  { return window._fbOnValue(r, cb); }

  // ── Submit modal ──────────────────────────────────────────
  function promptSubmit(gameKey, score, scoreLabel) {
    if (!window._firebaseReady) return;
    const game = GAMES.find(g => g.key === gameKey);
    if (!game) return;

    // Only prompt if this score beats the player's stored personal best
    const pbKey = `hs-pb-${gameKey}`;
    const prevBest = parseFloat(localStorage.getItem(pbKey));
    const isNewBest = isNaN(prevBest) ||
      (game.lowerBetter ? score < prevBest : score > prevBest);
    if (!isNewBest) return;

    _showPrompt(gameKey, score, scoreLabel, null);
  }

  // Always shows the prompt (bypasses personal best gate) — used on mid-game exit
  function promptSubmitOnExit(gameKey, score, scoreLabel, afterClose) {
    if (!window._firebaseReady || !(score > 0)) {
      if (typeof afterClose === 'function') afterClose();
      return;
    }
    const game = GAMES.find(g => g.key === gameKey);
    if (!game) { if (typeof afterClose === 'function') afterClose(); return; }
    _showPrompt(gameKey, score, scoreLabel, afterClose);
  }

  function _showPrompt(gameKey, score, scoreLabel, afterClose) {
    const game = GAMES.find(g => g.key === gameKey);
    _postCloseAction = typeof afterClose === 'function' ? afterClose : null;
    pendingGame  = gameKey;
    pendingScore = score;

    document.getElementById('hs-submit-game-label').textContent = game.label;
    document.getElementById('hs-submit-score').textContent      = scoreLabel || score;
    document.getElementById('hs-submitted-msg').classList.remove('visible');
    document.getElementById('hs-submit-btn').disabled = false;
    document.getElementById('hs-submit-btn').textContent = '✅ SUBMIT';

    // Pre-fill saved name
    const saved = localStorage.getItem('hs-player-name') || '';
    const inp = document.getElementById('hs-name-input');
    inp.value = saved;
    inp.disabled = false;

    document.getElementById('hs-submit-modal').classList.add('active');
    setTimeout(() => inp.focus(), 80);
  }

  async function submitConfirm() {
    const name = (document.getElementById('hs-name-input').value || '').trim().toUpperCase();
    if (!name) { document.getElementById('hs-name-input').focus(); return; }
    if (!pendingGame) return;

    localStorage.setItem('hs-player-name', name);

    const btn = document.getElementById('hs-submit-btn');
    btn.disabled = true;
    btn.textContent = '—';

    const entry = {
      name,
      score: pendingScore,
      ts: Date.now(),
    };
    // Attach any extra stat visible in the modal (e.g. rows for Stack It)
    const extraVal = document.getElementById('hs-extra-val');
    const extraLbl = document.getElementById('hs-extra-label');
    if (extraVal && extraLbl && extraVal.textContent && extraLbl.textContent) {
      entry.extra      = extraVal.textContent;
      entry.extraLabel = extraLbl.textContent;
    }

    try {
      const path = `highscores/${pendingGame}`;
      // FIX: use window._fb* instead of bare ref/get/set (not in scope for ES modules)
      const snap = await _get(_ref(path));
      const existing = snap.exists() ? snap.val() : {};

      // Keep top 20 entries
      const arr = Object.values(existing);
      arr.push(entry);
      const game = GAMES.find(g => g.key === pendingGame);
      arr.sort((a, b) => game.lowerBetter ? a.score - b.score : b.score - a.score);
      const top20 = arr.slice(0, 20);
      const obj = {};
      top20.forEach((e, i) => { obj[i] = e; });

      await _set(_ref(path), obj);

      // Save new personal best
      const pbKey = `hs-pb-${pendingGame}`;
      localStorage.setItem(pbKey, pendingScore);

      document.getElementById('hs-submitted-msg').classList.add('visible');
      document.getElementById('hs-name-input').disabled = true;
      btn.textContent = '✅ DONE';
      // Close the modal after a short delay so the user sees the confirmation
      setTimeout(() => submitClose(), 1200);
    } catch(e) {
      btn.disabled = false;
      btn.textContent = '✅ SUBMIT';
    }
  }

  function submitClose() {
    document.getElementById('hs-submit-modal').classList.remove('active');
    pendingGame = null; pendingScore = null;
    const cb = _postCloseAction;
    _postCloseAction = null;
    if (typeof cb === 'function') cb();
  }

  // ── View leaderboard ──────────────────────────────────────
  function viewOpen(startTab) {
    currentTab = startTab || GAMES[0].key;
    buildTabs();
    document.getElementById('hs-view-modal').classList.add('active');
    loadTab(currentTab);
  }

  function viewClose() {
    document.getElementById('hs-view-modal').classList.remove('active');
    if (viewUnsub) { viewUnsub(); viewUnsub = null; }
  }

  function buildTabs() {
    const container = document.getElementById('hs-tabs');
    container.innerHTML = GAMES.map(g =>
      `<button class="hs-tab${g.key === currentTab ? ' active' : ''}" onclick="hsTabSelect('${g.key}')">${g.label}</button>`
    ).join('');
  }

  function tabSelect(key) {
    currentTab = key;
    buildTabs();
    loadTab(key);
  }

  function loadTab(key) {
    const content = document.getElementById('hs-board-content');
    content.innerHTML = `<div class="hs-loading">LOADING<span class="waiting-dots"></span></div>`;
    if (viewUnsub) { viewUnsub(); viewUnsub = null; }

    if (!window._firebaseReady) {
      content.innerHTML = `<div class="hs-empty">NOT CONNECTED</div>`;
      return;
    }

    // FIX: use window._fbRef instead of bare ref() (not in scope for ES modules)
    const r = _ref(`highscores/${key}`);
    viewUnsub = _onValue(r, snap => {
      const game = GAMES.find(g => g.key === key);
      if (!snap.exists()) {
        content.innerHTML = `<div class="hs-empty">NO SCORES YET<br><span style="font-size:0.6rem;opacity:0.5">Be the first to submit!</span></div>`;
        return;
      }
      const entries = Object.values(snap.val());
      entries.sort((a, b) => game.lowerBetter ? a.score - b.score : b.score - a.score);

      let html = `<table class="hs-table"><thead><tr>
        <th style="width:28px">#</th>
        <th>NAME</th>
        <th>DATE</th>
        ${game.extraKey ? `<th class="hs-th-score">${game.extraLabel || game.extraKey}</th>` : ''}
        <th class="hs-th-score">${game.unit.toUpperCase()}</th>
      </tr></thead><tbody>`;

      entries.slice(0, 15).forEach((e, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
        const d = new Date(e.ts);
        const date = `${d.getDate()}/${d.getMonth()+1}`;
        const cls = i === 0 ? ' class="hs-gold"' : '';
        const scoreStr = game.lowerBetter ? `${e.score}s` : e.score.toLocaleString();
        html += `<tr${cls}>
          <td class="hs-rank">${medal}</td>
          <td>${e.name}</td>
          <td class="hs-date">${date}</td>
          ${game.extraKey ? `<td class="hs-td-score" style="color:#00ff88">${e.extra ?? '—'}</td>` : ''}
          <td class="hs-td-score">${scoreStr}</td>
        </tr>`;
      });
      html += '</tbody></table>';
      content.innerHTML = html;
    });
  }

  // Subscribe to top score for a given game key.
  // Calls cb(entry | null) immediately and on every change.
  // Returns an unsubscribe function.
  function subscribeTopScore(key, cb) {
    if (!window._firebaseReady) { cb(null); return () => {}; }
    const game = GAMES.find(g => g.key === key);
    if (!game) { cb(null); return () => {}; }
    // FIX: use window._fbRef instead of bare ref() (not in scope for ES modules)
    const r = _ref(`highscores/${key}`);
    const unsub = _onValue(r, snap => {
      if (!snap.exists()) { cb(null); return; }
      const entries = Object.values(snap.val());
      entries.sort((a, b) => game.lowerBetter ? a.score - b.score : b.score - a.score);
      cb(entries[0] || null, game);
    });
    return unsub;
  }

  return { promptSubmit, promptSubmitOnExit, submitConfirm, submitClose, viewOpen, viewClose, tabSelect, subscribeTopScore };
})();
