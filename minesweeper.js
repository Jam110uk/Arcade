// MINESWEEPER ENGINE — extracted from index.html
// Loaded lazily when game is first selected

window.msInit = function() {
  msSetDifficulty(MS.difficulty);
};

window.msSetDifficulty = function(diff) {
  MS.difficulty = diff;
  ['easy','medium','hard'].forEach(d => {
    document.getElementById('ms-btn-'+d)?.classList.toggle('active', d === diff);
  });
  const cfg = MS_CONFIGS[diff];
  MS.rows = cfg.rows; MS.cols = cfg.cols; MS.mines = cfg.mines;
  msNewGame();
};

window.msNewGame = function() {
  if (window._msTimer) { clearInterval(window._msTimer); window._msTimer = null; }
  MS.cells = Array(MS.rows * MS.cols).fill(null).map(() => ({
    mine: false, revealed: false, flagged: false, adjacent: 0
  }));
  MS.state = 'idle';
  MS.firstClick = true;
  document.getElementById('ms-face').textContent = '🙂';
  document.getElementById('ms-timer').textContent = '000';
  msUpdateMineCount();
  msRenderGrid();
};

function msIdx(r, c) { return r * MS.cols + c; }

function msPlaceMines(safeIdx) {
  let placed = 0;
  while (placed < MS.mines) {
    const i = Math.floor(Math.random() * MS.rows * MS.cols);
    if (i !== safeIdx && !MS.cells[i].mine) {
      MS.cells[i].mine = true;
      placed++;
    }
  }
  // Calculate adjacency
  for (let r = 0; r < MS.rows; r++) {
    for (let c = 0; c < MS.cols; c++) {
      if (MS.cells[msIdx(r,c)].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r+dr, nc = c+dc;
          if (nr>=0&&nr<MS.rows&&nc>=0&&nc<MS.cols && MS.cells[msIdx(nr,nc)].mine) count++;
        }
      MS.cells[msIdx(r,c)].adjacent = count;
    }
  }
}

function msReveal(r, c) {
  const i = msIdx(r, c);
  const cell = MS.cells[i];
  if (cell.revealed || cell.flagged) return;
  cell.revealed = true;
  if (cell.mine) return; // handled in click
  if (cell.adjacent === 0) {
    // Flood fill
    for (let dr=-1;dr<=1;dr++)
      for (let dc=-1;dc<=1;dc++) {
        const nr=r+dr, nc=c+dc;
        if (nr>=0&&nr<MS.rows&&nc>=0&&nc<MS.cols) msReveal(nr,nc);
      }
  }
}

function msCheckWin() {
  return MS.cells.every(c => c.mine ? !c.revealed : c.revealed);
}

function msUpdateMineCount() {
  const flags = MS.cells.filter(c => c.flagged).length;
  const remaining = MS.mines - flags;
  document.getElementById('ms-mine-count').textContent = String(Math.max(0,remaining)).padStart(3,'0');
}

function msRenderGrid() {
  const grid = document.getElementById('ms-grid');
  if (!grid) return;
  grid.style.gridTemplateColumns = `repeat(${MS.cols}, 1fr)`;
  grid.innerHTML = '';

  for (let r = 0; r < MS.rows; r++) {
    for (let c = 0; c < MS.cols; c++) {
      const cell = MS.cells[msIdx(r,c)];
      const el = document.createElement('div');
      el.className = 'ms-cell';

      if (cell.revealed) {
        el.classList.add(cell.mine ? 'mine-hit' : 'revealed');
        if (cell.mine) el.textContent = '💣';
        else if (cell.adjacent > 0) { el.textContent = cell.adjacent; el.dataset.n = cell.adjacent; }
      } else if (cell.flagged) {
        el.classList.add('flagged');
        el.textContent = '🚩';
      } else if (MS.state === 'lost' && cell.mine) {
        el.classList.add('mine-shown');
        el.textContent = '🚩';
      } else {
        el.classList.add('covered');
      }

      el.addEventListener('click', () => msClick(r, c));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); msFlag(r, c); });
      grid.appendChild(el);
    }
  }
}

function msClick(r, c) {
  if (MS.state === 'won' || MS.state === 'lost') return;
  const i = msIdx(r,c);
  const cell = MS.cells[i];
  if (cell.revealed || cell.flagged) return;

  if (MS.firstClick) {
    MS.firstClick = false;
    MS.state = 'playing';
    msPlaceMines(i);
    // Start timer
    let secs = 0;
    window._msTimer = setInterval(() => {
      secs++;
      const el = document.getElementById('ms-timer');
      if (el) el.textContent = String(Math.min(secs,999)).padStart(3,'0');
      if (secs >= 999) clearInterval(window._msTimer);
    }, 1000);
  }

  if (cell.mine) {
    cell.revealed = true;
    MS.state = 'lost';
    clearInterval(window._msTimer);
    document.getElementById('ms-face').textContent = '🙂';
    // Reveal all mines
    MS.cells.forEach(c => { if (c.mine && !c.flagged) c.revealed = true; });
    msRenderGrid();
    return;
  }

  msReveal(r, c);

  if (msCheckWin()) {
    MS.state = 'won';
    clearInterval(window._msTimer);
    document.getElementById('ms-face').textContent = '🙂';
    // Flag all mines
    MS.cells.forEach(c => { if (c.mine) c.flagged = true; });
    // High score (lower time = better)
    const elT = document.getElementById('ms-timer');
    const secs = elT ? parseInt(elT.textContent, 10) : 0;
    if (secs > 0) setTimeout(() => window.HS?.promptSubmit('minesweeper', secs, `${secs}s`), 300);
  }

  msUpdateMineCount();
  msRenderGrid();
}

function msFlag(r, c) {
  if (MS.state === 'won' || MS.state === 'lost') return;
  const cell = MS.cells[msIdx(r,c)];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  msUpdateMineCount();
  msRenderGrid();
}


// ============================================================
// SCRABBLE ENGINE
// ============================================================

// ?? Tile Distribution & Values ?????????????????????????????
