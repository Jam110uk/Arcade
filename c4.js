// C4 game module
// Auto-extracted from monolithic index.html

export default (() => {
  const COLS = 7, ROWS = 6;

  let board, turn, myNum, myName, oppName, roomCode, unsubs, gameOver, fromSharedLobby;

  function init(isHost, _myName, _oppName, _roomCode, _fromSharedLobby) {
    myNum           = isHost ? 1 : 2;
    myName          = _myName;
    oppName         = _oppName;
    roomCode        = _roomCode;
    fromSharedLobby = !!_fromSharedLobby;
    unsubs          = [];
    gameOver        = false;
    board           = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    turn            = 1;

    buildBoard();
    updateNames();
    setOverlay(true, 'CONNECTING—', '', []);
    showHeaderLeave('connectfour');

    if (isHost) {
      set(ref(db, `connectfour/${roomCode}`), {
        board: board.map(r => r.join('')).join('|'),
        turn: 1,
        status: 'playing',
        winner: 0,
        abandoned: false,
      }).then(() => { listenGame(); });
    } else {
      listenGame();
    }
  }

  function buildBoard() {
    // Column drop buttons
    const btnRow = document.getElementById('c4-col-btns');
    btnRow.innerHTML = '';
    for (let c = 0; c < COLS; c++) {
      const btn = document.createElement('button');
      btn.className   = 'c4-col-btn';
      btn.textContent = '▼';
      btn.id          = `c4-col-btn-${c}`;
      btn.disabled    = true;
      btn.onclick     = () => dropDisc(c);
      btnRow.appendChild(btn);
    }
    // Board cells
    const boardEl = document.getElementById('c4-board');
    boardEl.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'c4-cell';
        cell.id        = `c4-cell-${r}-${c}`;
        cell.style.cursor = 'pointer';
        cell.onclick = (function(col){ return function(){ dropDisc(col); }; })(c);
        boardEl.appendChild(cell);
      }
    }
  }

  function updateNames() {
    const p1El = document.getElementById('c4-name-p1');
    const p2El = document.getElementById('c4-name-p2');
    if (myNum === 1) { if(p1El) p1El.textContent = myName; if(p2El) p2El.textContent = oppName || '—'; }
    else             { if(p2El) p2El.textContent = myName; if(p1El) p1El.textContent = oppName || '—'; }
  }

  function listenGame() {
    const r = ref(db, `connectfour/${roomCode}`);
    const unsub = window._fbOnValue(r, snap => {
      if (!snap.exists()) return;
      const room = snap.val();

      if (room.abandoned && !gameOver) {
        gameOver = true;
        disableButtons();
        setOverlay(true, 'OPPONENT LEFT', '', [
          {label:'🕹 ARCADE', fn:'backToGameSelect()'},
        ]);
        return;
      }

      // Sync board
      if (room.board) {
        const rows = room.board.split('|');
        rows.forEach((rowStr, r) => {
          rowStr.split('').forEach((v, c) => {
            board[r][c] = parseInt(v);
          });
        });
        renderBoard();
      }

      turn     = room.turn || 1;
      gameOver = !!room.winner || room.status === 'draw';

      updateTurnUI();

      if (room.winner) {
        const iWon = room.winner === myNum;
        highlightWin(board);
        setOverlay(true, iWon ? '🏆 YOU WIN!' : '💔 YOU LOSE', '', [
          {label:'🔄 PLAY AGAIN', fn:'c4PlayAgain()'},
          {label:'🕹 ARCADE',    fn:'confirmLeave(\'connectfour\')'},
        ]);
        disableButtons();
      } else if (room.status === 'draw') {
        setOverlay(true, "IT'S A DRAW!", '', [
          {label:'🔄 PLAY AGAIN', fn:'c4PlayAgain()'},
          {label:'🕹 ARCADE',    fn:'confirmLeave(\'connectfour\')'},
        ]);
        disableButtons();
      } else {
        setOverlay(false);
        setMyTurnButtons(turn === myNum);
      }
    });
    unsubs.push(unsub);

    // Abandoned watcher
    const abUnsub = watchForAbandoned(`connectfour/${roomCode}`, () => {
      if (!gameOver) {
        gameOver = true;
        disableButtons();
        setOverlay(true, 'OPPONENT LEFT', '', [{label:'🕹 ARCADE', fn:'backToGameSelect()'}]);
      }
    });
    unsubs.push(abUnsub);

    chatInit('connectfour', `chat/connectfour_${roomCode}`, myName);
    showScreen('connectfour-screen');
  }

  async function dropDisc(col) {
    if (gameOver || turn !== myNum) return;
    // Find lowest empty row
    let dropRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][col] === 0) { dropRow = r; break; }
    }
    if (dropRow === -1) return; // column full

    // Optimistic local update
    board[dropRow][col] = myNum;
    renderBoard(dropRow, col);

    // Check win / draw
    const winner = checkWinner(board);
    const isDraw = !winner && board[0].every(v => v !== 0);
    const newTurn = winner || isDraw ? turn : (turn === 1 ? 2 : 1);

    await update(ref(db, `connectfour/${roomCode}`), {
      board:  board.map(r => r.join('')).join('|'),
      turn:   newTurn,
      winner: winner || 0,
      status: isDraw ? 'draw' : 'playing',
    });
  }

  function checkWinner(b) {
    // Horizontal
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c <= COLS-4; c++)
        if (b[r][c] && b[r][c]===b[r][c+1] && b[r][c]===b[r][c+2] && b[r][c]===b[r][c+3]) return b[r][c];
    // Vertical
    for (let r = 0; r <= ROWS-4; r++)
      for (let c = 0; c < COLS; c++)
        if (b[r][c] && b[r][c]===b[r+1][c] && b[r][c]===b[r+2][c] && b[r][c]===b[r+3][c]) return b[r][c];
    // Diagonal ?
    for (let r = 0; r <= ROWS-4; r++)
      for (let c = 0; c <= COLS-4; c++)
        if (b[r][c] && b[r][c]===b[r+1][c+1] && b[r][c]===b[r+2][c+2] && b[r][c]===b[r+3][c+3]) return b[r][c];
    // Diagonal ?
    for (let r = 0; r <= ROWS-4; r++)
      for (let c = 3; c < COLS; c++)
        if (b[r][c] && b[r][c]===b[r+1][c-1] && b[r][c]===b[r+2][c-2] && b[r][c]===b[r+3][c-3]) return b[r][c];
    return 0;
  }

  function findWinCells(b) {
    const cells = [];
    const check = (coords) => { const vs = coords.map(([r,c]) => b[r][c]); if (vs[0] && vs.every(v=>v===vs[0])) { cells.push(...coords); } };
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c <= COLS-4; c++) check([[r,c],[r,c+1],[r,c+2],[r,c+3]]);
    for (let r = 0; r <= ROWS-4; r++)
      for (let c = 0; c < COLS; c++) check([[r,c],[r+1,c],[r+2,c],[r+3,c]]);
    for (let r = 0; r <= ROWS-4; r++)
      for (let c = 0; c <= COLS-4; c++) check([[r,c],[r+1,c+1],[r+2,c+2],[r+3,c+3]]);
    for (let r = 0; r <= ROWS-4; r++)
      for (let c = 3; c < COLS; c++) check([[r,c],[r+1,c-1],[r+2,c-2],[r+3,c-3]]);
    return cells;
  }

  function renderBoard(dropR, dropC) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.getElementById(`c4-cell-${r}-${c}`);
        if (!cell) continue;
        const v = board[r][c];
        cell.className = 'c4-cell' + (v === 1 ? ' p1' : v === 2 ? ' p2' : '');
        if (r === dropR && c === dropC && v !== 0) {
          cell.classList.add('drop');
        }
      }
    }
  }

  function highlightWin(b) {
    const winCells = findWinCells(b);
    winCells.forEach(([r,c]) => {
      const cell = document.getElementById(`c4-cell-${r}-${c}`);
      if (cell) cell.classList.add('win-cell');
    });
  }

  function updateTurnUI() {
    const msg = document.getElementById('c4-turn-msg');
    if (!msg) return;
    if (gameOver) { msg.textContent = ''; return; }
    const isMyTurn = turn === myNum;
    msg.textContent = isMyTurn ? '🟢 YOUR TURN' : `⏳ ${oppName || 'OPPONENT'}\'S TURN`;
    msg.className = 'c4-turn-msg ' + (isMyTurn ? `p${myNum}` : 'wait');

    const p1chip = document.getElementById('c4-chip-p1');
    const p2chip = document.getElementById('c4-chip-p2');
    if (p1chip) p1chip.className = 'c4-player-chip' + (turn===1 ? ' active-p1' : '');
    if (p2chip) p2chip.className = 'c4-player-chip' + (turn===2 ? ' active-p2' : '');
  }

  function setMyTurnButtons(enabled) {
    for (let c = 0; c < COLS; c++) {
      const btn = document.getElementById(`c4-col-btn-${c}`);
      if (!btn) continue;
      // Also disable full columns
      const colFull = board[0][c] !== 0;
      btn.disabled = !enabled || colFull;
    }
  }

  function disableButtons() {
    for (let c = 0; c < COLS; c++) {
      const btn = document.getElementById(`c4-col-btn-${c}`);
      if (btn) btn.disabled = true;
    }
  }

  function setOverlay(show, title, sub, btns) {
    const ov = document.getElementById('c4-overlay');
    if (!ov) return;
    if (!show) { ov.classList.remove('active'); return; }
    ov.classList.add('active');
    const t = document.getElementById('c4-ov-title');
    t.textContent = title;
    const isWin = title.includes('WIN');
    const isDraw = title.includes('DRAW');
    t.className = 'c4-ov-title' + (isWin ? ' win' : isDraw ? ' draw' : '');
    document.getElementById('c4-ov-sub').textContent = sub || '';
    const bd = document.getElementById('c4-ov-btns');
    bd.innerHTML = btns.map(b => `<button class="${b.label.includes('ARCADE') ? 'arcade-back-btn' : 'c4-btn'}" onclick="${b.fn}">${b.label}</button>`).join('');
  }

  async function playAgain() {
    if (!roomCode) return;
    gameOver = false;
    board    = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    renderBoard();
    setOverlay(false);
    // Only host resets the Firebase state
    if (myNum === 1) {
      await set(ref(db, `connectfour/${roomCode}`), {
        board: board.map(r => r.join('')).join('|'),
        turn: 1, status: 'playing', winner: 0, abandoned: false,
      });
    }
  }

  function destroy() {
    unsubs && unsubs.forEach(u => typeof u === 'function' && u());
    unsubs   = [];
    gameOver = true;
    chatDestroy('connectfour');
    hideHeaderLeave();
  }

  return { init, destroy, playAgain, roomCode: null };
})();
