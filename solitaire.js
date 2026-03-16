// SOLITAIRE ENGINE — extracted from index.html
// Loaded lazily when game is first selected

window.solNewGame = function() {
  if (window._solTimer) clearInterval(window._solTimer);
  const deck = solBuildDeck();
  let di = 0;
  SOL.tableau = [];
  for (let col = 0; col < 7; col++) {
    const pile = [];
    for (let row = 0; row <= col; row++) {
      const card = deck[di++];
      card.faceUp = (row === col);
      pile.push(card);
    }
    SOL.tableau.push(pile);
  }
  SOL.stock = deck.slice(di).map(c=>({...c, faceUp:false}));
  SOL.waste = [];
  SOL.foundations = [[],[],[],[]];
  SOL.moves = 0;
  SOL.score = 0;
  SOL.selected = null;
  SOL.startTime = Date.now();

  window._solTimer = setInterval(solTickTimer, 1000);
  solRender();
};

function solTickTimer() {
  const el = document.getElementById('sol-time');
  if (!el) return;
  const s = Math.floor((Date.now() - SOL.startTime) / 1000);
  const m = Math.floor(s/60), ss = s%60;
  el.textContent = m + ':' + String(ss).padStart(2,'0');
}

function solRender() {
  document.getElementById('sol-moves').textContent = SOL.moves;
  document.getElementById('sol-score').textContent = SOL.score;

  const topRow = document.getElementById('sol-top-row');
  const tabRow = document.getElementById('sol-tableau-row');
  topRow.innerHTML = '';
  tabRow.innerHTML = '';

  // ── Helper: attach drag start to a face-up card ────────────────
  function attachDrag(cardEl, cards, source) {
    const startDrag = (clientX, clientY) => {
      SOL.selected = source; // keep selection in sync
      solDragStart(cards, source, clientX, clientY, cardEl);
    };
    cardEl.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      startDrag(e.clientX, e.clientY);
    });
    cardEl.addEventListener('touchstart', e => {
      e.stopPropagation();
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  }

  // Stock
  const stockEl = document.createElement('div');
  stockEl.className = 'sol-pile';
  if (SOL.stock.length > 0) {
    const c = solMakeCardEl({faceUp:false});
    stockEl.appendChild(c);
  } else {
    stockEl.innerHTML = '<div class="sol-empty-hint">🂠</div>';
  }
  stockEl.onclick = solClickStock;
  topRow.appendChild(stockEl);

  // Waste
  const wasteEl = document.createElement('div');
  wasteEl.className = 'sol-pile';
  if (SOL.waste.length > 0) {
    const top = SOL.waste[SOL.waste.length-1];
    const c = solMakeCardEl({...top, faceUp:true});
    const isSel = SOL.selected && SOL.selected.source === 'waste';
    if (isSel) c.classList.add('selected');
    c.onclick = (e) => { e.stopPropagation(); if (!SOL_DRAG.dragged) solSelectWaste(); };
    attachDrag(c, [top], { source: 'waste', type: 'waste' });
    wasteEl.appendChild(c);
  } else {
    wasteEl.innerHTML = '<div class="sol-empty-hint">🂠</div>';
  }
  topRow.appendChild(wasteEl);

  // Spacer
  topRow.appendChild(document.createElement('div'));

  // Foundations
  const SUIT_ORDER = ['\u2660','\u2663','\u2665','\u2666'];
  for (let fi = 0; fi < 4; fi++) {
    const fEl = document.createElement('div');
    fEl.className = 'sol-pile';
    fEl.dataset.foundation = fi;
    const pile = SOL.foundations[fi];
    if (pile.length > 0) {
      const top = pile[pile.length-1];
      const c = solMakeCardEl({...top, faceUp:true});
      fEl.appendChild(c);
    } else {
      fEl.innerHTML = `<div class="sol-empty-hint">${SUIT_ORDER[fi]}</div>`;
    }
    fEl.onclick = () => { if (!SOL_DRAG.dragged) solClickFoundation(fi); };
    topRow.appendChild(fEl);
  }

  // Tableau columns
  for (let col = 0; col < 7; col++) {
    const colEl = document.createElement('div');
    colEl.className = 'sol-col';
    colEl.dataset.col = col;
    const pile = SOL.tableau[col];
    const OFFSET = 22;

    const faceDown = pile.filter(c=>!c.faceUp).length;
    const faceUp   = pile.filter(c=>c.faceUp).length;
    const colHeight = Math.max(56, faceDown * 8 + faceUp * OFFSET + 56);
    colEl.style.minHeight = colHeight + 'px';

    if (pile.length === 0) {
      colEl.innerHTML = '<div class="sol-empty-hint">K</div>';
      colEl.onclick = () => { if (!SOL_DRAG.dragged) solClickTableau(col, -1); };
    }

    pile.forEach((card, ci) => {
      const isFaceDown = pile.slice(0,ci).filter(c=>!c.faceUp).length;
      const isFaceUpIdx = pile.slice(0,ci).filter(c=>c.faceUp).length;
      const topPx = isFaceDown * 8 + isFaceUpIdx * OFFSET;

      const c = solMakeCardEl(card);
      c.style.top = topPx + 'px';
      c.style.zIndex = ci + 1;

      if (card.faceUp) {
        const isSel = SOL.selected && SOL.selected.source === 'tableau' &&
                      SOL.selected.col === col && SOL.selected.idx <= ci;
        if (isSel) c.classList.add('selected');
        const cards = pile.slice(ci);
        c.onclick = (e) => { e.stopPropagation(); if (!SOL_DRAG.dragged) solClickTableau(col, ci); };
        attachDrag(c, cards, { source: 'tableau', type: 'tableau', col, idx: ci });
      }
      colEl.appendChild(c);
    });

    colEl.onclick = (e) => {
      if (e.target === colEl && !SOL_DRAG.dragged) solClickTableau(col, -1);
    };

    tabRow.appendChild(colEl);
  }
}

function solMakeCardEl(card) {
  const el = document.createElement('div');
  el.className = 'playing-card' + (card.faceUp ? ' face-up ' + SUIT_COLOR[card.suit] : ' face-down');
  if (card.faceUp) {
    el.innerHTML = `
      <span class="card-corner">${card.rank}<br>${card.suit}</span>
      <span class="card-center">${card.suit}</span>
      <span class="card-corner-bot">${card.rank}<br>${card.suit}</span>
    `;
  }
  return el;
}

// ── Drag-and-drop state ──────────────────────────────────────────
const SOL_DRAG = {
  active: false,
  cards: null,       // array of card objects being dragged
  source: null,      // {type:'waste'|'tableau'|'foundation', col?, idx?}
  ghost: null,       // ghost DOM element
  startX: 0, startY: 0,
  offsetX: 0, offsetY: 0,
  cardW: 0,
  dragged: false,    // did we actually move enough to count as a drag?
};

function solGetGhost() {
  if (!SOL_DRAG.ghost) {
    const g = document.createElement('div');
    g.id = 'sol-drag-ghost';
    g.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9000;display:none;';
    document.body.appendChild(g);
    SOL_DRAG.ghost = g;
  }
  return SOL_DRAG.ghost;
}

function solBuildGhost(cards, cardW) {
  const g = solGetGhost();
  g.innerHTML = '';
  g.style.display = 'block';
  g.style.width = cardW + 'px';
  const OFFSET = 22;
  const h = cardW * (3.5/2.5) + (cards.length - 1) * OFFSET;
  g.style.height = h + 'px';
  cards.forEach((card, i) => {
    const el = solMakeCardEl({...card, faceUp: true});
    el.style.cssText = `position:absolute;top:${i*OFFSET}px;left:0;width:100%;opacity:0.88;`;
    g.appendChild(el);
  });
}

function solMoveGhost(clientX, clientY) {
  const g = SOL_DRAG.ghost;
  if (!g) return;
  g.style.left = (clientX - SOL_DRAG.offsetX) + 'px';
  g.style.top  = (clientY - SOL_DRAG.offsetY) + 'px';
}

function solHideGhost() {
  if (SOL_DRAG.ghost) SOL_DRAG.ghost.style.display = 'none';
}

function solClearDropTargets() {
  document.querySelectorAll('.sol-pile.drop-target, .sol-col.drop-target').forEach(el => {
    el.classList.remove('drop-target');
  });
}

function solHighlightDropTargets(cards) {
  solClearDropTargets();
  const moving = cards[0];
  // Foundations
  document.querySelectorAll('[data-foundation]').forEach(el => {
    const fi = parseInt(el.dataset.foundation);
    if (cards.length === 1 && solCanPlaceFoundation(moving, fi)) el.classList.add('drop-target');
  });
  // Tableau cols
  document.querySelectorAll('[data-col]').forEach(el => {
    const col = parseInt(el.dataset.col);
    const pile = SOL.tableau[col];
    const topCard = pile.length > 0 ? pile[pile.length-1] : null;
    const canPlace = !topCard
      ? moving.rank === 'K'
      : (SUIT_COLOR[moving.suit] !== SUIT_COLOR[topCard.suit] &&
         RANK_VAL[moving.rank] === RANK_VAL[topCard.rank] - 1 &&
         topCard.faceUp);
    if (canPlace) el.classList.add('drop-target');
  });
}

function solGetDropTarget(clientX, clientY) {
  // Use elementsFromPoint so drops on individual cards (which overflow the col rect)
  // are correctly resolved back to their parent col or foundation.
  const els = document.elementsFromPoint(clientX, clientY);
  for (const el of els) {
    // Skip the ghost itself
    if (el.id === 'sol-drag-ghost' || SOL_DRAG.ghost && SOL_DRAG.ghost.contains(el)) continue;
    // Walk up to find a drop zone
    let node = el;
    while (node && node !== document.body) {
      if (node.dataset && node.dataset.foundation !== undefined) {
        return { type: 'foundation', fi: parseInt(node.dataset.foundation) };
      }
      if (node.dataset && node.dataset.col !== undefined) {
        return { type: 'tableau', col: parseInt(node.dataset.col) };
      }
      node = node.parentElement;
    }
  }
  return null;
}

function solDragStart(cards, source, clientX, clientY, cardEl) {
  const rect = cardEl.getBoundingClientRect();
  SOL_DRAG.active = true;
  SOL_DRAG.cards  = cards;
  SOL_DRAG.source = source;
  SOL_DRAG.startX = clientX;
  SOL_DRAG.startY = clientY;
  SOL_DRAG.offsetX = clientX - rect.left;
  SOL_DRAG.offsetY = clientY - rect.top;
  SOL_DRAG.cardW  = rect.width;
  SOL_DRAG.dragged = false;
  solBuildGhost(cards, rect.width);
  solMoveGhost(clientX, clientY);
  solHighlightDropTargets(cards);
  // Mark dragging cards visually
  document.querySelectorAll('.playing-card.selected').forEach(c => c.classList.add('dragging'));
}

function solDragMove(clientX, clientY) {
  if (!SOL_DRAG.active) return;
  const dx = clientX - SOL_DRAG.startX, dy = clientY - SOL_DRAG.startY;
  if (!SOL_DRAG.dragged && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    SOL_DRAG.dragged = true;
  }
  solMoveGhost(clientX, clientY);
}

function solDragEnd(clientX, clientY) {
  if (!SOL_DRAG.active) return;
  SOL_DRAG.active = false;
  solHideGhost();
  solClearDropTargets();

  const wasDragged = SOL_DRAG.dragged;
  // Reset dragged flag after a short delay so onclick handlers can check it
  setTimeout(() => { SOL_DRAG.dragged = false; }, 50);

  if (!wasDragged) {
    // Treat as click — use existing selection logic
    SOL_DRAG.cards = null;
    SOL_DRAG.source = null;
    return;
  }

  // Find drop target
  const target = solGetDropTarget(clientX, clientY);
  const cards = SOL_DRAG.cards;
  const source = SOL_DRAG.source;
  SOL_DRAG.cards = null;
  SOL_DRAG.source = null;

  if (!target || !cards) { SOL.selected = null; solRender(); return; }

  const moving = cards[0];

  if (target.type === 'foundation') {
    if (cards.length === 1 && solCanPlaceFoundation(moving, target.fi)) {
      // Temporarily set selected so solRemoveSelected works
      SOL.selected = source;
      solRemoveSelected();
      SOL.foundations[target.fi].push(moving);
      SOL.moves++; SOL.score += 15;
      SOL.selected = null;
      solRender(); solCheckWin(); return;
    }
  } else if (target.type === 'tableau') {
    const pile = SOL.tableau[target.col];
    const topCard = pile.length > 0 ? pile[pile.length-1] : null;
    const canPlace = !topCard
      ? moving.rank === 'K'
      : (SUIT_COLOR[moving.suit] !== SUIT_COLOR[topCard.suit] &&
         RANK_VAL[moving.rank] === RANK_VAL[topCard.rank] - 1 &&
         topCard.faceUp);
    // Don't allow dropping onto same source column
    const sameCol = source.type === 'tableau' && source.col === target.col;
    if (canPlace && !sameCol) {
      SOL.selected = source;
      solRemoveSelected();
      SOL.tableau[target.col].push(...cards);
      SOL.moves++; SOL.score += 5;
      SOL.selected = null;
      solRender(); return;
    }
  }

  SOL.selected = null;
  solRender();
}

// Global mouse/touch listeners for drag
document.addEventListener('mousemove', e => { if (SOL_DRAG.active) solDragMove(e.clientX, e.clientY); });
document.addEventListener('mouseup',   e => { if (SOL_DRAG.active) solDragEnd(e.clientX, e.clientY); });
document.addEventListener('touchmove', e => {
  if (!SOL_DRAG.active) return;
  e.preventDefault();
  solDragMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
document.addEventListener('touchend', e => {
  if (!SOL_DRAG.active) return;
  const t = e.changedTouches[0];
  solDragEnd(t.clientX, t.clientY);
});

function solClickStock() {
  SOL.selected = null;
  if (SOL.stock.length === 0) {
    // Recycle waste
    SOL.stock = SOL.waste.reverse().map(c=>({...c,faceUp:false}));
    SOL.waste = [];
  } else {
    const card = SOL.stock.pop();
    card.faceUp = true;
    SOL.waste.push(card);
  }
  solRender();
}

function solSelectWaste() {
  if (SOL.waste.length === 0) return;
  if (SOL.selected && SOL.selected.source === 'waste') {
    SOL.selected = null;
  } else {
    SOL.selected = { source: 'waste', cards: [SOL.waste[SOL.waste.length-1]] };
  }
  solRender();
}

function solClickFoundation(fi) {
  if (SOL.selected) {
    // Try to place selected card on foundation
    if (SOL.selected.cards.length === 1) {
      const card = SOL.selected.cards[0];
      if (solCanPlaceFoundation(card, fi)) {
        solRemoveSelected();
        SOL.foundations[fi].push(card);
        SOL.moves++;
        SOL.score += 15;
        SOL.selected = null;
        solRender();
        solCheckWin();
        return;
      }
    }
    SOL.selected = null;
    solRender();
  }
}

function solCanPlaceFoundation(card, fi) {
  const pile = SOL.foundations[fi];
  if (pile.length === 0) return card.rank === 'A';
  const top = pile[pile.length-1];
  return top.suit === card.suit && RANK_VAL[card.rank] === RANK_VAL[top.rank] + 1;
}

function solClickTableau(col, ci) {
  const pile = SOL.tableau[col];

  if (SOL.selected) {
    // Try to place
    const topCard = pile.length > 0 ? pile[pile.length-1] : null;
    const moving = SOL.selected.cards[0];

    const canPlace = !topCard
      ? moving.rank === 'K'
      : (SUIT_COLOR[moving.suit] !== SUIT_COLOR[topCard.suit] &&
         RANK_VAL[moving.rank] === RANK_VAL[topCard.rank] - 1 &&
         topCard.faceUp);

    if (canPlace) {
      solRemoveSelected();
      SOL.tableau[col].push(...SOL.selected.cards);
      SOL.moves++;
      SOL.score += 5;
      SOL.selected = null;
      solRender();
      return;
    }
    SOL.selected = null;
    solRender();
    return;
  }

  // Select card(s)
  if (ci === -1 || ci >= pile.length) return;
  const card = pile[ci];
  if (!card.faceUp) {
    // Flip if it's the top face-down card at top
    if (ci === pile.length-1) {
      card.faceUp = true;
      SOL.score += 5;
      solRender();
    }
    return;
  }
  // Select from ci to end
  const cards = pile.slice(ci);
  SOL.selected = { source: 'tableau', col, idx: ci, cards };
  solRender();
}

function solRemoveSelected() {
  const sel = SOL.selected;
  if (!sel) return;
  const src = sel.source || sel.type;
  if (src === 'waste') {
    SOL.waste.pop();
  } else if (src === 'tableau') {
    SOL.tableau[sel.col].splice(sel.idx);
    // Flip new top card
    const pile = SOL.tableau[sel.col];
    if (pile.length > 0 && !pile[pile.length-1].faceUp) {
      pile[pile.length-1].faceUp = true;
      SOL.score += 5;
    }
  }
}

function solCheckWin() {
  if (SOL.foundations.every(f => f.length === 13)) {
    clearInterval(window._solTimer);
    const elapsed = Math.floor((Date.now()-SOL.startTime)/1000);
    const m = Math.floor(elapsed/60), s = elapsed%60;
    document.getElementById('sol-win-msg').textContent =
      `Completed in ${m}:${String(s).padStart(2,'0')} with ${SOL.moves} moves — Score: ${SOL.score}`;
    document.getElementById('sol-win-overlay').classList.add('active');
    if (SOL.score > 0) setTimeout(() => window.HS?.promptSubmit('solitaire', SOL.score, SOL.score.toLocaleString()), 400);
  }
}

// Auto-complete: if all tableau cards are face-up, move to foundations automatically
function solAutoComplete() {
  let moved = true;
  while (moved) {
    moved = false;
    for (let col = 0; col < 7; col++) {
      const pile = SOL.tableau[col];
      if (pile.length === 0) continue;
      const top = pile[pile.length-1];
      if (!top.faceUp) continue;
      for (let fi = 0; fi < 4; fi++) {
        if (solCanPlaceFoundation(top, fi)) {
          pile.pop();
          SOL.foundations[fi].push(top);
          SOL.score += 15;
          moved = true;
          break;
        }
      }
    }
    // Also from waste
    if (SOL.waste.length > 0) {
      const top = SOL.waste[SOL.waste.length-1];
      for (let fi = 0; fi < 4; fi++) {
        if (solCanPlaceFoundation(top, fi)) {
          SOL.waste.pop();
          SOL.foundations[fi].push(top);
          SOL.score += 15;
          moved = true;
          break;
        }
      }
    }
  }
  solRender();
  solCheckWin();
}


// ============================================================
// MINESWEEPER ENGINE
// ============================================================
const MS = {
  rows: 9, cols: 9, mines: 10,
  cells: [],   // flat array of {mine,revealed,flagged,adjacent}
  state: 'idle', // idle|playing|won|lost
  firstClick: true,
  difficulty: 'easy',
};

const MS_CONFIGS = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
};

