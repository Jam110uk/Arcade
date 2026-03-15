// BJW game module
// Auto-extracted from monolithic index.html

export default (() => {
  'use strict';

  const COLS = 8, ROWS = 8;
  const GEM_TYPES = 7;
  const GEM_COLORS = ['#ff1744','#2979ff','#00e676','#ffd600','#d500f9','#ff6d00','#00e5ff'];
  const GEM_DARK   = ['#7f0000','#0039cb','#00600a','#c79a00','#6200a8','#bf360c','#006064'];
  const GEM_LIGHT  = ['#ff8a80','#82b1ff','#b9f6ca','#ffff8d','#ea80fc','#ffab40','#84ffff'];

  let canvas, ctx, cellSize = 60;
  let gems = [];          // gems[r][c] = 0-6
  let score = 0, best = 0, level = 1;
  let timerInterval = null;
  let sel = null;         // selected cell {r,c}
  let busy = false;       // true while animating
  let phase = 'idle';     // idle | playing | over

  // Level thresholds — score needed to REACH that level
  // Level 1 starts at 0, level 2 at 500, level 3 at 1500, etc.
  const LEVEL_THRESHOLDS = [0, 500, 1500, 3000, 5500, 9000, 14000, 21000, 30000, 42000, 58000];
  // Beyond the defined thresholds, each level costs 20000 more than the last gap

  function thresholdFor(lvl) {
    if (lvl <= 0) return 0;
    if (lvl < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[lvl];
    // Extrapolate: last defined gap * 1.5 per extra level
    const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const extra = lvl - (LEVEL_THRESHOLDS.length - 1);
    return last + extra * 20000;
  }

  function levelForScore(s) {
    let lv = 1;
    while (thresholdFor(lv + 1) <= s) lv++;
    return lv;
  }

  // ── Helpers ────────────────────────────────────────────────
  function rnd(n) { return Math.floor(Math.random() * n); }

  function gemAt(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
    return gems[r][c] ? gems[r][c].type : -1;
  }

  // ── Gem helpers ─────────────────────────────────────────────
  // gems[r][c] = { type: 0-6, special: null | 'flame' | 'star' | 'supernova' | 'hyper' }
  // type -1 = empty

  function mkGem(type, special=null) { return { type, special }; }
  function gemType(r,c) {
    if (r<0||r>=ROWS||c<0||c>=COLS) return -1;
    const g = gems[r][c]; return g ? g.type : -1;
  }
  function isEmpty(r,c) { return !gems[r][c] || gems[r][c].type < 0; }

  // ── Floating score popups ────────────────────────────────────
  let scorePopups = []; // {x,y,text,color,life,vy}

  function spawnScorePopup(x, y, pts, combo) {
    const color = combo >= 3 ? '#ffd600' : combo === 2 ? '#ff6d00' : '#ffffff';
    scorePopups.push({ x, y, text: '+' + pts.toLocaleString(), color,
      life: 1, vy: -1.4 - combo * 0.3 });
  }

  function updateScorePopups() {
    scorePopups = scorePopups.filter(p => p.life > 0);
    scorePopups.forEach(p => { p.life -= 0.022; p.y += p.vy; p.vy *= 0.96; });
  }

  function drawScorePopups() {
    scorePopups.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life > 0.6 ? 1 : p.life / 0.6);
      ctx.font = `bold ${Math.round(cellSize * 0.38)}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    });
  }

  // ── Combo banner ─────────────────────────────────────────────
  let comboBanner = null; // {text, color, life}
  const COMBO_LABELS = ['','','2× COMBO!','3× COMBO!','BLAZING!','INFERNO!','UNSTOPPABLE!','LEGENDARY!'];

  function showComboBanner(combo) {
    if (combo < 2) return;
    const text  = COMBO_LABELS[Math.min(combo, COMBO_LABELS.length-1)];
    const color = combo >= 5 ? '#ff1744' : combo >= 4 ? '#ff6d00' : combo >= 3 ? '#ffd600' : '#00f5ff';
    comboBanner = { text, color, life: 1 };
    // Fanfare sound: ascending soft chimes matching gem tone style
    const ac = getAudio(); if (!ac) return;
    try {
      const freqs = combo >= 4 ? [523,659,784,1047,1319] : [523,659,784,1047];
      freqs.forEach((freq,i) => {
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        const t = ac.currentTime + i * 0.09;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.06, t + 0.06);
        gain.gain.setValueAtTime(0.07, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain); gain.connect(ac.destination);
        osc.start(t); osc.stop(t+0.25);
      });
    } catch(e) {}
  }

  function drawComboBanner(ts) {
    if (!comboBanner || comboBanner.life <= 0) return;
    comboBanner.life -= 0.016;
    const a = comboBanner.life > 0.7 ? 1 : comboBanner.life / 0.7;
    const scale = comboBanner.life > 0.85 ? 1 + (1-comboBanner.life)*3 : 1; // pop-in
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(scale, scale);
    ctx.font = `bold ${Math.round(cellSize * 0.62)}px 'Orbitron', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = comboBanner.color;
    ctx.shadowColor = comboBanner.color;
    ctx.shadowBlur = 28;
    ctx.fillText(comboBanner.text, 0, 0);
    ctx.restore();
  }

  // ── Build board ──────────────────────────────────────────────
  function buildBoard() {
    gems = [];
    for (let r = 0; r < ROWS; r++) {
      gems[r] = [];
      for (let c = 0; c < COLS; c++) {
        let t, tries = 0;
        do {
          t = rnd(GEM_TYPES); tries++;
        } while (tries < 50 && (
          (c >= 2 && gemType(r,c-1) === t && gemType(r,c-2) === t) ||
          (r >= 2 && gemType(r-1,c) === t && gemType(r-2,c) === t)
        ));
        gems[r][c] = mkGem(t);
      }
    }
  }

  // ── Find matches — returns runs with length info ─────────────
  function findMatches() {
    const mark = Array.from({length:ROWS}, ()=>Array(COLS).fill(false));
    const runs = [];

    // Horizontal runs
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const t = gemType(r,c);
        if (t < 0) { c++; continue; }
        let e = c;
        while (e+1 < COLS && gemType(r,e+1) === t) e++;
        if (e-c >= 2) {
          const cells = [];
          for (let k=c;k<=e;k++) { mark[r][k]=true; cells.push({r,c:k}); }
          runs.push({cells, len:e-c+1, dir:'h', t});
        }
        c = e+1;
      }
    }
    // Vertical runs
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const t = gemType(r,c);
        if (t < 0) { r++; continue; }
        let e = r;
        while (e+1 < ROWS && gemType(e+1,c) === t) e++;
        if (e-r >= 2) {
          const cells = [];
          for (let k=r;k<=e;k++) { mark[k][c]=true; cells.push({r:k,c}); }
          runs.push({cells, len:e-r+1, dir:'v', t});
        }
        r = e+1;
      }
    }

    // Detect L/T/+ shapes: find intersections between h and v runs of same type
    // These produce a 'cross' run with shape:'cross' for Star Gem creation
    const hRuns = runs.filter(r=>r.dir==='h');
    const vRuns = runs.filter(r=>r.dir==='v');
    for (const h of hRuns) {
      for (const v of vRuns) {
        if (h.t !== v.t) continue;
        // Find intersection cell
        const inter = h.cells.find(hc => v.cells.some(vc => vc.r===hc.r && vc.c===hc.c));
        if (inter) {
          // Merge these two runs into a cross run
          const allCells = [...h.cells, ...v.cells.filter(vc => !h.cells.some(hc=>hc.r===vc.r&&hc.c===vc.c))];
          const existing = runs.find(r=>r._crossKey===`${h.cells[0].r},${h.cells[0].c}-${v.cells[0].r},${v.cells[0].c}`);
          if (!existing) {
            runs.push({cells:allCells, len:allCells.length, dir:'cross', t:h.t, inter, _crossKey:`${h.cells[0].r},${h.cells[0].c}-${v.cells[0].r},${v.cells[0].c}`});
          }
        }
      }
    }

    const hit = [];
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (mark[r][c]) hit.push({r,c});
    return { hit, runs, mark };
  }

  function findMatchesIgnoringSpecial() { return findMatches(); }

  // ── Expand matches to include special gem effects ────────────
  // Flame    → 3×3 blast around gem
  // Star     → full row + full column
  // Supernova→ 3×3 blast + full row + full column
  // Hyper    → handled separately in tap handler
  function expandSpecials(initialHit) {
    const toRemove = new Set(initialHit.map(({r,c})=>`${r},${c}`));
    const queue = [...initialHit];
    while (queue.length) {
      const {r,c} = queue.shift();
      const g = gems[r]?.[c];
      if (!g || g.type < 0) continue;

      if (g.special === 'flame') {
        // 3×3 radius blast
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
          const k=`${nr},${nc}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r:nr,c:nc}); }
        }
      } else if (g.special === 'star') {
        // Full row + full column
        for (let cc=0;cc<COLS;cc++) {
          const k=`${r},${cc}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r,c:cc}); }
        }
        for (let rr=0;rr<ROWS;rr++) {
          const k=`${rr},${c}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r:rr,c}); }
        }
      } else if (g.special === 'supernova') {
        // 3×3 blast + full row + full column
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
          const k=`${nr},${nc}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r:nr,c:nc}); }
        }
        for (let cc=0;cc<COLS;cc++) {
          const k=`${r},${cc}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r,c:cc}); }
        }
        for (let rr=0;rr<ROWS;rr++) {
          const k=`${rr},${c}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r:rr,c}); }
        }
      }
    }
    return [...toRemove].map(k => { const [r,c]=k.split(',').map(Number); return {r,c}; });
  }
  function anyValidMove() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const nbrs = [{r,c:c+1},{r:r+1,c}];
        for (const nb of nbrs) {
          if (nb.r>=ROWS||nb.c>=COLS) continue;
          const tmp = gems[r][c]; gems[r][c] = gems[nb.r][nb.c]; gems[nb.r][nb.c] = tmp;
          const ok = findMatchesIgnoringSpecial().hit.length > 0;
          gems[nb.r][nb.c] = gems[r][c]; gems[r][c] = tmp;
          if (ok) return true;
        }
      }
    }
    return false;
  }

  // ── Cascade ──────────────────────────────────────────────────
  function cascade(combo, onDone) {
    const { hit, runs } = findMatchesIgnoringSpecial();
    if (hit.length === 0) {
      if (!anyValidMove()) { endGame(); return; }
      busy = false; sel = null;
      if (typeof onDone === 'function') onDone();
      return;
    }

    // Score
    const pts = (hit.length <= 3 ? 50 : hit.length <= 4 ? 150 : 300) * hit.length * combo;
    score += pts;
    const newLevel = levelForScore(score);
    const leveledUp = newLevel > level;
    if (leveledUp) {
      level = newLevel;
      levelFlash = 1; triggerShake(18); playLevelUpSound();
    }
    updateHUD();

    if (combo >= 3) triggerShake(10 + combo*2);
    else if (hit.length >= 5) triggerShake(8);

    // Combo banner
    if (combo >= 2) showComboBanner(combo);

    // Sounds
    const uniqueTypes = [...new Set(hit.map(({r,c})=>gems[r][c]?.type).filter(t=>t!=null&&t>=0))];
    uniqueTypes.forEach((t,i) => setTimeout(()=>playGemSound(t,combo), i*60));

    // Spawn score popup at centroid of matched gems
    const cx = hit.reduce((s,{c})=>s+c*cellSize+cellSize/2,0)/hit.length;
    const cy = hit.reduce((s,{r})=>s+r*cellSize+cellSize/2,0)/hit.length;
    spawnScorePopup(cx, cy, pts, combo);

    // Determine which cells to create special gems at (match point = middle of run)
    // match-4 straight    → Flame Gem  (3×3 blast)
    // match-5 L/T/+ cross → Star Gem   (row + column)
    // match-5 straight    → Hypercube  (wipe all of one colour)
    // match-6+ straight   → Supernova  (3×3 + row + column)
    const newSpecials = []; // {r,c,special,type}
    // Process cross runs first (they take priority over straight runs at the intersection)
    const crossRuns = runs.filter(r=>r.dir==='cross');
    const straightRuns = runs.filter(r=>r.dir!=='cross');
    crossRuns.forEach(run => {
      const pivot = run.inter || run.cells[Math.floor(run.cells.length/2)];
      newSpecials.push({r:pivot.r, c:pivot.c, special:'star', type:run.t});
    });
    straightRuns.forEach(run => {
      if (run.len === 4) {
        const mid = run.cells[Math.floor(run.cells.length/2)];
        // Don't overwrite a cross-run special at same cell
        if (!newSpecials.some(s=>s.r===mid.r&&s.c===mid.c))
          newSpecials.push({r:mid.r, c:mid.c, special:'flame', type:run.t});
      } else if (run.len === 5) {
        const mid = run.cells[Math.floor(run.cells.length/2)];
        if (!newSpecials.some(s=>s.r===mid.r&&s.c===mid.c))
          newSpecials.push({r:mid.r, c:mid.c, special:'hyper', type:0});
      } else if (run.len >= 6) {
        const mid = run.cells[Math.floor(run.cells.length/2)];
        if (!newSpecials.some(s=>s.r===mid.r&&s.c===mid.c))
          newSpecials.push({r:mid.r, c:mid.c, special:'supernova', type:run.t});
      }
    });

    // Deduplicate newSpecials by cell (last one wins)
    const specialMap = new Map();
    newSpecials.forEach(s => specialMap.set(`${s.r},${s.c}`, s));
    const deduped = [...specialMap.values()];

    // Expand specials (flame chain reactions)
    const expanded = expandSpecials(hit);
    const matchSet = new Set(expanded.map(({r,c})=>`${r},${c}`));

    animFlash(matchSet, () => {
      // Remove matched gems
      expanded.forEach(({r,c}) => { if (gems[r]) gems[r][c] = mkGem(-1); });

      // Place special gems (overwrite the removal)
      deduped.forEach(({r,c,special,type}) => {
        if (gems[r]) gems[r][c] = mkGem(type, special);
      });

      // Build fall offsets
      const fallOffsets = Array.from({length:ROWS}, ()=>Array(COLS).fill(0));
      for (let c=0;c<COLS;c++) {
        let empty=0;
        for (let r=ROWS-1;r>=0;r--) {
          if (isEmpty(r,c)) { empty++; }
          else if (empty>0) { fallOffsets[r][c]=empty*cellSize; }
        }
        let newSlots=0;
        for (let r=0;r<ROWS;r++) {
          if (isEmpty(r,c)) { fallOffsets[r][c]=(++newSlots)*cellSize; }
          else break;
        }
      }

      // Compact columns
      for (let c=0;c<COLS;c++) {
        const col=[];
        for (let r=ROWS-1;r>=0;r--) {
          if (!isEmpty(r,c)) col.push(gems[r][c]);
        }
        while (col.length < ROWS) col.push(mkGem(rnd(GEM_TYPES)));
        for (let r=0;r<ROWS;r++) gems[r][c] = col[ROWS-1-r];
      }
    animDrop(fallOffsets, () => {
        // Small delay to let rAF settle, then cascade again
        setTimeout(() => cascade(combo+1, onDone), 16);
      });
    });
  }

  // reshuffleBoard removed — no valid moves = game over

  // ── Simple timed animations ─────────────────────────────────
  // ── Particle / sparkle system ───────────────────────────────
  let particles = [];   // burst particles on match
  let glints    = [];   // ambient per-gem glints
  let rafId     = null;

  // ── Level background themes ──────────────────────────────────
  const LEVEL_THEMES = [
    { bg1:'#020818', bg2:'#041230', g1:'rgba(0,30,60,0.55)',   g2:'rgba(0,18,40,0.55)',   accent:'#00f5ff' },
    { bg1:'#0d0818', bg2:'#1a0830', g1:'rgba(20,0,50,0.55)',   g2:'rgba(10,0,35,0.55)',   accent:'#bf5fff' },
    { bg1:'#001208', bg2:'#002818', g1:'rgba(0,40,10,0.55)',   g2:'rgba(0,25,5,0.55)',    accent:'#00e676' },
    { bg1:'#180800', bg2:'#301500', g1:'rgba(50,15,0,0.55)',   g2:'rgba(35,8,0,0.55)',    accent:'#ff6d00' },
    { bg1:'#181200', bg2:'#302400', g1:'rgba(50,40,0,0.55)',   g2:'rgba(35,28,0,0.55)',   accent:'#ffd600' },
    { bg1:'#000818', bg2:'#001530', g1:'rgba(0,20,55,0.55)',   g2:'rgba(0,12,38,0.55)',   accent:'#2979ff' },
    { bg1:'#180018', bg2:'#300030', g1:'rgba(45,0,45,0.55)',   g2:'rgba(30,0,30,0.55)',   accent:'#ff2d78' },
    { bg1:'#001818', bg2:'#003030', g1:'rgba(0,45,45,0.55)',   g2:'rgba(0,30,30,0.55)',   accent:'#00e5ff' },
    { bg1:'#100018', bg2:'#200030', g1:'rgba(30,0,55,0.55)',   g2:'rgba(20,0,38,0.55)',   accent:'#d500f9' },
    { bg1:'#180c00', bg2:'#301800', g1:'rgba(48,22,0,0.55)',   g2:'rgba(32,14,0,0.55)',   accent:'#ff1744' },
  ];
  function getTheme() { return LEVEL_THEMES[Math.min(level-1, LEVEL_THEMES.length-1)]; }

  // ── Audio (Web Audio API) ────────────────────────────────────
  let audioCtx = null;
  function getAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
  }
  const GEM_FREQS = [523,587,659,698,784,880,988]; // C5 D5 E5 F5 G5 A5 B5
  function playGemSound(type, combo) {
    const ac = getAudio(); if (!ac) return;
    try {
      const osc = ac.createOscillator(), gain = ac.createGain();
      const freq = GEM_FREQS[type % GEM_FREQS.length] * (combo > 1 ? Math.pow(1.06, combo-1) : 1);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.06, ac.currentTime + 0.06);
      gain.gain.setValueAtTime(0.06, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(); osc.stop(ac.currentTime + 0.3);
    } catch(e) {}
  }
  function playLevelUpSound() {
    const ac = getAudio(); if (!ac) return;
    try {
      [523,659,784,1047].forEach((freq,i) => {
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        const t = ac.currentTime + i * 0.13;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.06, t + 0.06);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain); gain.connect(ac.destination);
        osc.start(t); osc.stop(t+0.3);
      });
    } catch(e) {}
  }

  // ── Screen shake ─────────────────────────────────────────────
  let shakeAmt = 0;
  function triggerShake(amount) { shakeAmt = Math.max(shakeAmt, amount); }

  // ── Level-up flash ───────────────────────────────────────────
  let levelFlash = 0;  // 1 = full white, decays to 0

  // ── Gem bob/float ────────────────────────────────────────────
  let bobPhases = [];
  let bobSpeeds = [];
  function initBobPhases() {
    bobPhases = Array.from({length:ROWS}, () =>
      Array.from({length:COLS}, () => Math.random() * Math.PI * 2)
    );
    bobSpeeds = Array.from({length:ROWS}, () =>
      Array.from({length:COLS}, () => 0.0008 + Math.random() * 0.0016)
    );
  }

  function spawnBurst(cx, cy, color, count) {
    if (particles.length > 180) return; // cap total particles
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.4;
      const speed = cellSize * (0.06 + Math.random() * 0.14);
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, decay: 0.04 + Math.random() * 0.04,
        r: 2 + Math.random() * 3,
        color,
      });
    }
  }

  function spawnRing(cx, cy, color) {
    particles.push({ type: 'ring', x: cx, y: cy, r: 0, maxR: cellSize * 0.85,
      life: 1, decay: 0.045, color });
  }

  function spawnStar(cx, cy, color) {
    particles.push({ type: 'star', x: cx, y: cy,
      life: 1, decay: 0.03 + Math.random() * 0.03,
      size: 3 + Math.random() * 4, color,
      angle: Math.random() * Math.PI });
  }

  // Ambient glints: random gems periodically get a 4-point star flash
  function tickGlints(now) {
    // Randomly spawn new glints
    if (Math.random() < 0.06 && phase === 'playing') {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if (gems[r] && gems[r][c] && gems[r][c].type >= 0) {
        glints.push({
          r, c,
          x: c * cellSize + cellSize / 2,
          y: r * cellSize + cellSize / 2,
          life: 1, decay: 0.025 + Math.random() * 0.02,
          size: cellSize * (0.18 + Math.random() * 0.18),
          color: GEM_LIGHT[gems[r][c].type] ?? '#ffffff',
        });
      }
    }
    glints = glints.filter(g => g.life > 0);
    glints.forEach(g => { g.life -= g.decay; });
  }

  function drawStar4(cx, cy, size, alpha, color) {
    if (size <= 0 || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    const arms = 4;
    ctx.beginPath();
    for (let i = 0; i < arms * 2; i++) {
      const a = (i * Math.PI / arms);
      const r = i % 2 === 0 ? size : size * 0.12;
      if (i === 0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
      else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 1.5;
    ctx.fill();
    ctx.restore();
  }

  function updateParticles() {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.life -= p.decay;
      if (p.type === 'ring') { p.r += (p.maxR - p.r) * 0.18; return; }
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.35; // gravity
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      const a = Math.max(0, p.life);
      if (p.type === 'ring') {
        ctx.beginPath();
        ctx.arc(p.x, p.y,Math.max(0,p.r), 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.type === 'star') {
        drawStar4(p.x, p.y, p.size, a, p.color);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0, p.r * p.life), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  function drawGlints() {
    glints.forEach(g => {
      const pulse = Math.max(0, Math.sin(g.life * Math.PI));
      drawStar4(g.x, g.y, g.size * pulse, pulse * 0.9, g.color);
    });
  }

  // ── Continuous rAF render loop (idle + playing) ─────────────
  let matchExplodeSet = null;   // Set of 'r,c' keys currently exploding
  let explodeProgress = 0;      // 0→1
  let dropOffsets = null;       // [r][c] pixel offset for falling gems
  let dropProgress = 0;         // 0→1
  let swapAnim = null;          // {r1,c1,r2,c2,p,forward,onDone}
  let lastTs = 0;

  function easeOut(t) { return 1 - (1-t)*(1-t)*(1-t); }
  function easeIn(t)  { return t*t*t; }

  function renderLoop(ts) {
    const dt = Math.min(ts - lastTs, 50); lastTs = ts;
    tickGlints(ts);
    updateParticles();

    // Decay shake
    shakeAmt *= 0.82;
    // Decay level flash
    if (levelFlash > 0) levelFlash = Math.max(0, levelFlash - 0.03);

    const theme = getTheme();
    const shX = shakeAmt > 0.3 ? (Math.random()-0.5)*shakeAmt : 0;
    const shY = shakeAmt > 0.3 ? (Math.random()-0.5)*shakeAmt : 0;

    ctx.save();
    ctx.translate(shX, shY);

    ctx.clearRect(-shakeAmt, -shakeAmt, canvas.width+shakeAmt*2, canvas.height+shakeAmt*2);

    // Themed background
    const bgGrad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
    bgGrad.addColorStop(0, theme.bg1);
    bgGrad.addColorStop(1, theme.bg2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-shakeAmt, -shakeAmt, canvas.width+shakeAmt*2, canvas.height+shakeAmt*2);

    // Grid cells
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r+c)%2===0 ? theme.g1 : theme.g2;
        ctx.fillRect(c*cellSize, r*cellSize, cellSize, cellSize);
      }
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    for (let i=0;i<=COLS;i++){ctx.beginPath();ctx.moveTo(i*cellSize,0);ctx.lineTo(i*cellSize,canvas.height);ctx.stroke();}
    for (let j=0;j<=ROWS;j++){ctx.beginPath();ctx.moveTo(0,j*cellSize);ctx.lineTo(canvas.width,j*cellSize);ctx.stroke();}

    // Gems with bob
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!gems[r][c] || gems[r][c].type < 0) continue;
        const key = r+','+c;

        let ox = 0, oy = 0, scale = 1, alpha = 1;

        // Bob: only when playing and not busy
        if (phase === 'playing' && !busy && bobPhases[r] && bobPhases[r][c] !== undefined) {
          const spd = bobSpeeds[r]?.[c] ?? 0.0014;
          oy = Math.sin(ts * spd + bobPhases[r][c]) * cellSize * 0.018;
          scale = 1 + Math.sin(ts * spd * 0.7 + bobPhases[r][c] + 1) * 0.006;
        }

        // Swap animation offset
        if (swapAnim) {
          const {r1,c1,r2,c2,p} = swapAnim;
          if (r===r1&&c===c1) { ox=(c2-c1)*cellSize*p; oy=(r2-r1)*cellSize*p; }
          else if (r===r2&&c===c2) { ox=(c1-c2)*cellSize*p; oy=(r1-r2)*cellSize*p; }
        }

        // Drop offset
        if (dropOffsets && dropOffsets[r] && dropOffsets[r][c]) {
          oy -= dropOffsets[r][c] * (1 - easeOut(dropProgress));
        }

        // Match explode: scale down + fade
        if (matchExplodeSet && matchExplodeSet.has(key)) {
          scale = 1 - easeIn(explodeProgress) * 0.85;
          alpha = 1 - easeIn(explodeProgress);
        }

        drawCellTransformed(r, c, ox, oy, scale, alpha);
      }
    }

    drawParticles();
    drawGlints();
    updateScorePopups();
    drawScorePopups();
    drawComboBanner(ts);

    // Selection highlight with theme accent colour
    if (sel && !busy) {
      const sx = sel.c * cellSize, sy = sel.r * cellSize;
      const pulse = 0.6 + 0.4 * Math.sin(ts / 300);
      ctx.strokeStyle = theme.accent;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 3;
      ctx.shadowColor = theme.accent; ctx.shadowBlur = 14 * pulse;
      ctx.strokeRect(sx+2, sy+2, cellSize-4, cellSize-4);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // Level-up flash overlay
    if (levelFlash > 0) {
      ctx.globalAlpha = levelFlash * 0.55;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(-shakeAmt, -shakeAmt, canvas.width+shakeAmt*2, canvas.height+shakeAmt*2);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    rafId = requestAnimationFrame(renderLoop);
  }

  function startRaf() {
    if (rafId) cancelAnimationFrame(rafId);
    lastTs = performance.now();
    rafId = requestAnimationFrame(renderLoop);
  }
  function stopRaf() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ── Core draw helpers ────────────────────────────────────────
  function resize() {
    const wrap = canvas.parentElement;
    const fit = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight - 4) / COLS);
    cellSize = Math.max(32, Math.min(fit, 76));
    canvas.width  = cellSize * COLS;
    canvas.height = cellSize * ROWS;
  }

  function draw() {} // no-op — rAF loop handles all drawing now

  // ── Pre-cache gem gradients (rebuilt on resize) ──────────────
  let gemGradCache = {};   // key: `${type}-${special}` → {fill, inner}
  let lastCellSizeForCache = 0;

  function buildGradCache() {
    gemGradCache = {};
    lastCellSizeForCache = cellSize;
    const s = cellSize * 0.43;
    // Normal gems
    for (let t = 0; t < GEM_TYPES; t++) {
      const col  = GEM_COLORS[t], dark = GEM_DARK[t], lite = GEM_LIGHT[t];
      const fill = ctx.createLinearGradient(0, -s, 0, s);
      fill.addColorStop(0, lite); fill.addColorStop(0.25, col);
      fill.addColorStop(0.7, col); fill.addColorStop(1, dark);
      const inner = ctx.createLinearGradient(-s*0.4, -s*0.5, s*0.2, s*0.3);
      inner.addColorStop(0, 'rgba(255,255,255,0.38)');
      inner.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      inner.addColorStop(1, 'rgba(0,0,0,0.18)');
      gemGradCache[`${t}`] = { fill, inner, col, dark, lite };
    }
    // Hyper gem
    const hFill = ctx.createLinearGradient(0, -s, 0, s);
    hFill.addColorStop(0, '#555'); hFill.addColorStop(0.25, '#111');
    hFill.addColorStop(0.7, '#111'); hFill.addColorStop(1, '#000');
    const hInner = ctx.createLinearGradient(-s*0.4, -s*0.5, s*0.2, s*0.3);
    hInner.addColorStop(0, 'rgba(255,255,255,0.38)');
    hInner.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    hInner.addColorStop(1, 'rgba(0,0,0,0.18)');
    gemGradCache['hyper'] = { fill: hFill, inner: hInner, col:'#111', dark:'#000', lite:'#555' };

    // Star gem — gold/white
    const stFill = ctx.createLinearGradient(0, -s, 0, s);
    stFill.addColorStop(0,'#fff9c4'); stFill.addColorStop(0.3,'#ffd600');
    stFill.addColorStop(0.7,'#ff8f00'); stFill.addColorStop(1,'#e65100');
    gemGradCache['star-base'] = { fill:stFill, inner:hInner, col:'#ffd600', dark:'#e65100', lite:'#fff9c4' };

    // Supernova — deep purple/white
    const snFill = ctx.createLinearGradient(0, -s, 0, s);
    snFill.addColorStop(0,'#ffffff'); snFill.addColorStop(0.2,'#e040fb');
    snFill.addColorStop(0.7,'#7b1fa2'); snFill.addColorStop(1,'#4a148c');
    gemGradCache['supernova-base'] = { fill:snFill, inner:hInner, col:'#e040fb', dark:'#4a148c', lite:'#ffffff' };
  }

  function drawCellTransformed(r, c, ox, oy, scale, alpha) {
    const g = gems[r][c];
    if (!g || g.type < 0) return;
    const t = g.type;
    const x = c * cellSize + cellSize/2 + ox;
    const y = r * cellSize + cellSize/2 + oy;
    const s = cellSize * 0.43 * scale;

    // Rebuild cache if cellSize changed
    if (cellSize !== lastCellSizeForCache) buildGradCache();

    const cache = g.special === 'hyper'      ? gemGradCache['hyper']
                : g.special === 'star'       ? gemGradCache['star-base']
                : g.special === 'supernova'  ? gemGradCache['supernova-base']
                : gemGradCache[`${t}`];
    const { col, dark } = cache;

    function hexPath(radius) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = i * Math.PI / 3;
        if (i===0) ctx.moveTo(Math.cos(ang)*radius, Math.sin(ang)*radius);
        else       ctx.lineTo(Math.cos(ang)*radius, Math.sin(ang)*radius);
      }
      ctx.closePath();
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);

    // No shadowBlur per-gem — too expensive at 64 gems/frame.
    // Use a thicker bright border instead for the glow effect.
    hexPath(s);
    ctx.fillStyle = cache.fill;
    ctx.fill();

    ctx.strokeStyle = g.special === 'flame'     ? '#ff8c00'
                    : g.special === 'hyper'      ? '#ffffff'
                    : g.special === 'star'       ? '#ffd600'
                    : g.special === 'supernova'  ? '#e040fb'
                    : col;
    ctx.lineWidth = g.special ? 2.5 : 1.5;
    ctx.stroke();

    // Inner highlight hex
    hexPath(s * 0.62);
    ctx.fillStyle = cache.inner;
    ctx.fill();

    // Special gem overlay icons
    if (g.special === 'flame') {
      ctx.fillStyle = '#ffd600';
      ctx.beginPath();
      ctx.moveTo(0, -s*0.58);
      ctx.bezierCurveTo( s*0.28, -s*0.28,  s*0.36,  s*0.10,  0,  s*0.52);
      ctx.bezierCurveTo(-s*0.36,  s*0.10, -s*0.28, -s*0.28,  0, -s*0.58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff8e0';
      ctx.beginPath();
      ctx.moveTo(0, -s*0.28);
      ctx.bezierCurveTo( s*0.14, -s*0.08,  s*0.18,  s*0.14,  0,  s*0.32);
      ctx.bezierCurveTo(-s*0.18,  s*0.14, -s*0.14, -s*0.08,  0, -s*0.28);
      ctx.closePath();
      ctx.fill();
    } else if (g.special === 'star') {
      // 4-point star (cross shape) in bright white/gold
      ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1;
      const arms=4, outer=s*0.52, inner2=s*0.16;
      ctx.beginPath();
      for (let i=0;i<arms*2;i++) {
        const a=(i*Math.PI/arms);
        const rad = i%2===0 ? outer : inner2;
        if(i===0) ctx.moveTo(Math.cos(a)*rad, Math.sin(a)*rad);
        else ctx.lineTo(Math.cos(a)*rad, Math.sin(a)*rad);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Cross lines to emphasise row+col effect
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-s*0.6,0); ctx.lineTo(s*0.6,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-s*0.6); ctx.lineTo(0,s*0.6); ctx.stroke();
    } else if (g.special === 'supernova') {
      // 8-point starburst — bigger, more dramatic
      ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1;
      const arms=8, outer=s*0.52, inner2=s*0.18;
      ctx.beginPath();
      for (let i=0;i<arms*2;i++) {
        const a=(i*Math.PI/arms)-Math.PI/8;
        const rad = i%2===0 ? outer : inner2;
        if(i===0) ctx.moveTo(Math.cos(a)*rad, Math.sin(a)*rad);
        else ctx.lineTo(Math.cos(a)*rad, Math.sin(a)*rad);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Glow rings
      ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(0,0,Math.max(0,s*0.58),0,Math.PI*2); ctx.stroke();
    } else if (g.special === 'hyper') {
      ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1;
      const arms=4, outer=s*0.5, inner2=s*0.18;
      ctx.beginPath();
      for (let i=0;i<arms*2;i++) {
        const a=(i*Math.PI/arms)-Math.PI/4;
        const rad = i%2===0 ? outer : inner2;
        if(i===0) ctx.moveTo(Math.cos(a)*rad, Math.sin(a)*rad);
        else ctx.lineTo(Math.cos(a)*rad, Math.sin(a)*rad);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      // Normal sparkle dots
      ctx.beginPath();
      ctx.arc(-s*0.22, -s*0.30, Math.max(0, s*0.11), 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      ctx.beginPath();
      ctx.arc(-s*0.36, -s*0.12, Math.max(0, s*0.055), 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    }

    ctx.restore();
  }

  // Legacy drawCell still needed by drawWithSwap
  function drawCell(r, c, ox, oy, alpha, flash) {
    drawCellTransformed(r, c, ox, oy, 1, alpha);
  }

  // ── Improved animations using rAF loop state ─────────────────
  function animFlash(matchSet, done) {
    matchSet.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const g = gems[r]?.[c];
      if (!g || g.type < 0) return;
      const col  = g.special === 'hyper'     ? '#ffffff'
                 : g.special === 'star'      ? '#ffd600'
                 : g.special === 'supernova' ? '#e040fb'
                 : (GEM_COLORS[g.type] ?? '#ffffff');
      const lite = g.special === 'hyper'     ? '#ffffff'
                 : g.special === 'star'      ? '#fff9c4'
                 : g.special === 'supernova' ? '#ffffff'
                 : (GEM_LIGHT[g.type]  ?? '#ffffff');
      const cx = c * cellSize + cellSize/2;
      const cy = r * cellSize + cellSize/2;
      spawnBurst(cx, cy, col, g.special ? 16 : 10);
      spawnRing(cx, cy, col);
      if (Math.random() < 0.5) spawnStar(cx, cy, lite);
    });
    matchExplodeSet = matchSet;
    explodeProgress = 0;
    const dur = 380, start = performance.now();
    function tick() {
      explodeProgress = Math.min((performance.now()-start)/dur, 1);
      if (explodeProgress < 1) { requestAnimationFrame(tick); }
      else { matchExplodeSet=null; explodeProgress=0; done(); }
    }
    requestAnimationFrame(tick);
  }

  function animDrop(offsets, done) {
    dropOffsets = offsets;
    dropProgress = 0;
    const dur = 320, start = performance.now();

    function tick() {
      dropProgress = Math.min((performance.now() - start) / dur, 1);
      if (dropProgress < 1) { requestAnimationFrame(tick); }
      else { dropOffsets = null; dropProgress = 0; done(); }
    }
    requestAnimationFrame(tick);
  }

  function animSwap(r1, c1, r2, c2, forward, done) {
    swapAnim = { r1, c1, r2, c2, p: forward ? 0 : 1 };
    const dur = 160, start = performance.now();

    function tick() {
      const raw = Math.min((performance.now() - start) / dur, 1);
      swapAnim.p = forward ? easeOut(raw) : 1 - easeOut(raw);
      if (raw < 1) { requestAnimationFrame(tick); }
      else { swapAnim = null; done(); }
    }
    requestAnimationFrame(tick);
  }

  function drawWithSwap() {} // no-op — handled by swapAnim state in renderLoop

  // ── Input ───────────────────────────────────────────────────
  function getCell(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    return {
      r: Math.floor((cy - rect.top)  * sy / cellSize),
      c: Math.floor((cx - rect.left) * sx / cellSize)
    };
  }

  function onTap(e) {
    e.preventDefault();
    if (phase !== 'playing' || busy) return;
    getAudio(); // unlock AudioContext on first tap
    const {r, c} = getCell(e);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;

    if (!sel) { sel = {r, c}; return; }
    if (sel.r === r && sel.c === c) { sel = null; return; }
    const dr = Math.abs(sel.r-r), dc = Math.abs(sel.c-c);
    if (dr+dc !== 1) { sel = {r,c}; return; }

    const r1=sel.r, c1=sel.c;
    sel = null; busy = true;

    // ── Special gem swap handling ──────────────────────────────
    const g1 = gems[r1][c1], g2 = gems[r][c];
    const isSpecial = g => g?.special === 'hyper' || g?.special === 'flame' || g?.special === 'star' || g?.special === 'supernova';

    if (g1?.special === 'hyper' || g2?.special === 'hyper') {
      // Hypercube: wipe all gems of the swapped colour
      // Hyper + Hyper = wipe entire board
      let toRemove = [];
      if (g1?.special === 'hyper' && g2?.special === 'hyper') {
        for (let rr=0;rr<ROWS;rr++) for (let cc=0;cc<COLS;cc++) toRemove.push({r:rr,c:cc});
      } else {
        const targetType = g1?.special === 'hyper' ? g2?.type : g1?.type;
        for (let rr=0;rr<ROWS;rr++) for (let cc=0;cc<COLS;cc++) {
          if (gems[rr][cc]?.type === targetType || (rr===r1&&cc===c1) || (rr===r&&cc===c))
            toRemove.push({r:rr,c:cc});
        }
      }
      const hyperSet = new Set(toRemove.map(({r,c})=>`${r},${c}`));
      toRemove.forEach(({r,c}) => {
        const cx=c*cellSize+cellSize/2, cy=r*cellSize+cellSize/2;
        spawnBurst(cx,cy,'#ffffff',12); spawnRing(cx,cy,'#ffffff');
      });
      triggerShake(22);
      const pts = toRemove.length * 200;
      score += pts;
      spawnScorePopup(canvas.width/2, canvas.height/2, pts, 3);
      showComboBanner(5); updateHUD();
      animFlash(hyperSet, () => {
        toRemove.forEach(({r,c}) => { if(gems[r]) gems[r][c]=mkGem(-1); });
        for (let c=0;c<COLS;c++) {
          const col=[];
          for (let r=ROWS-1;r>=0;r--) { if(!isEmpty(r,c)) col.push(gems[r][c]); }
          while(col.length<ROWS) col.push(mkGem(rnd(GEM_TYPES)));
          for (let r=0;r<ROWS;r++) gems[r][c]=col[ROWS-1-r];
        }
        const fallOffsets=Array.from({length:ROWS},()=>Array(COLS).fill(cellSize*2));
        animDrop(fallOffsets, () => { cascade(1, null); });
      });
      return;
    }

    // Two non-hyper specials swapped together — chain their effects
    if (isSpecial(g1) && isSpecial(g2)) {
      // Combine: treat as both activating at the same cell, chain into cascade
      // Mark both as hit so expandSpecials fires both
      const combined = new Set([`${r1},${c1}`, `${r},${c}`]);
      const expanded = expandSpecials([{r:r1,c:c1},{r:r,c:c}]);
      const expandSet = new Set(expanded.map(({r,c})=>`${r},${c}`));
      expanded.forEach(({r,c}) => {
        const g=gems[r]?.[c]; if(!g||g.type<0) return;
        const col = GEM_COLORS[g.type]??'#ffffff';
        spawnBurst(c*cellSize+cellSize/2, r*cellSize+cellSize/2, col, 10);
      });
      triggerShake(18);
      const pts = expanded.length * 150;
      score += pts; updateHUD();
      spawnScorePopup(canvas.width/2, canvas.height/2, pts, 2);
      animFlash(expandSet, () => {
        expanded.forEach(({r,c}) => { if(gems[r]) gems[r][c]=mkGem(-1); });
        for (let c=0;c<COLS;c++) {
          const col=[];
          for (let r=ROWS-1;r>=0;r--) { if(!isEmpty(r,c)) col.push(gems[r][c]); }
          while(col.length<ROWS) col.push(mkGem(rnd(GEM_TYPES)));
          for (let r=0;r<ROWS;r++) gems[r][c]=col[ROWS-1-r];
        }
        const fallOffsets=Array.from({length:ROWS},()=>Array(COLS).fill(cellSize*2));
        animDrop(fallOffsets, () => { cascade(1, null); });
      });
      return;
    }

    animSwap(r1, c1, r, c, true, () => {
      const tmp=gems[r1][c1]; gems[r1][c1]=gems[r][c]; gems[r][c]=tmp;

      const hasMatch = findMatchesIgnoringSpecial().hit.length > 0;

      if (!hasMatch) {
        animSwap(r1, c1, r, c, false, () => {
          const tmp2=gems[r1][c1]; gems[r1][c1]=gems[r][c]; gems[r][c]=tmp2;
          busy=false;
        });
      } else {
        cascade(1, null);
      }
    });
  }

  // ── HUD / timer ─────────────────────────────────────────────
  function updateHUD() {
    document.getElementById('bjw-score').textContent = score.toLocaleString();
    document.getElementById('bjw-best').textContent  = best.toLocaleString();
    document.getElementById('bjw-level').textContent = level;

    // Progress bar
    const curThresh  = thresholdFor(level);
    const nextThresh = thresholdFor(level + 1);
    const pct = Math.min(100, ((score - curThresh) / (nextThresh - curThresh)) * 100);
    document.getElementById('bjw-progress-fill').style.width = pct + '%';
    document.getElementById('bjw-prog-level').textContent = level;
    document.getElementById('bjw-prog-next').textContent  = level + 1;
    document.getElementById('bjw-prog-pts').textContent   =
      (score - curThresh).toLocaleString() + ' / ' + (nextThresh - curThresh).toLocaleString();
  }

  function startTimer() { /* no-op — untimed mode */ }

  // ── Pause / Resume ───────────────────────────────────────────
  let paused = false;

  function pause() {
    if (phase !== 'playing' || paused) return;
    paused = true;
    clearInterval(timerInterval);
    stopRaf();
    const ov = document.getElementById('bjw-overlay');
    document.getElementById('bjw-ov-title').textContent = 'PAUSED';
    document.getElementById('bjw-ov-title').className = 'bjw-ov-title';
    document.getElementById('bjw-ov-score').textContent = '';
    document.getElementById('bjw-ov-msg').textContent = 'Click Resume to continue.';
    document.getElementById('bjw-ov-btns').innerHTML =
      `<button class="bjw-btn" onclick="BJW.resume()">▶ RESUME</button>
       <button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    ov.classList.add('active');
  }

  function resume() {
    if (phase !== 'playing' || !paused) return;
    paused = false;
    document.getElementById('bjw-overlay').classList.remove('active');
    startRaf();
    startTimer();
  }

  // Pause when tab/window loses focus
  function onVisibilityChange() {
    if (document.hidden) pause();
  }
  function onWindowBlur() {
    pause();
  }

  function endGame() {
    phase = 'over'; busy = false;
    stopRaf(); clearInterval(timerInterval);
    if (score > best) { best = score; try { localStorage.setItem('bjw-best', best); } catch(e){} }
    updateHUD();
    const ov = document.getElementById('bjw-overlay');
    document.getElementById('bjw-ov-title').textContent = 'GAME OVER';
    document.getElementById('bjw-ov-title').className = 'bjw-ov-title lose';
    document.getElementById('bjw-ov-score').textContent = score.toLocaleString() + ' PTS';
    document.getElementById('bjw-ov-msg').textContent = `Level ${level} reached!`;
    document.getElementById('bjw-ov-btns').innerHTML =
      `<button class="bjw-btn" onclick="BJW.newGame()">🔄 RETRY</button>
       <button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    ov.classList.add('active');
    if (score > 0) setTimeout(() => HS.promptSubmit('bejeweled', score, score.toLocaleString()), 600);
  }

  // ── Public ──────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('bjw-canvas');
    ctx    = canvas.getContext('2d');
    try { best = parseInt(localStorage.getItem('bjw-best')) || 0; } catch(e) {}
    canvas.addEventListener('click',      onTap);
    canvas.addEventListener('touchstart', onTap, {passive: false});
    window.addEventListener('resize', () => { if (phase !== 'idle') { resize(); } });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    resize(); buildBoard();
    updateHUD();
    startRaf();
    const ov = document.getElementById('bjw-overlay');
    document.getElementById('bjw-ov-title').textContent = 'BEJEWELED';
    document.getElementById('bjw-ov-title').className = 'bjw-ov-title';
    document.getElementById('bjw-ov-score').textContent = '';
    document.getElementById('bjw-ov-msg').innerHTML = 'Click two adjacent gems to swap.<br>Match 3+ to score!';
    document.getElementById('bjw-ov-btns').innerHTML =
      `<button class="bjw-btn" onclick="BJW.start()">▶ START</button>
       <button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    ov.classList.add('active');
  }

  function start() {
    clearInterval(timerInterval);
    score = 0; level = 1; busy = false; sel = null; phase = 'playing'; paused = false;
    particles = []; glints = []; shakeAmt = 0; levelFlash = 0;
    scorePopups = []; comboBanner = null;
    matchExplodeSet = null; dropOffsets = null; swapAnim = null;
    resize(); buildGradCache();
    // Keep rebuilding until no starting matches
    let _tries = 0;
    do { buildBoard(); _tries++; } while ((findMatches().hit.length > 0 || !anyValidMove()) && _tries < 100);
    initBobPhases();
    document.getElementById('bjw-overlay').classList.remove('active');
    updateHUD(); startRaf(); startTimer();
  }

  function newGame() { start(); }

  function destroy() { clearInterval(timerInterval); stopRaf(); }

  return { init, start, newGame, resume, pause, destroy };
})();
