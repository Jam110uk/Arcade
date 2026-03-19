// BJW game module — 3D gem renderer (Three.js r128)
// All game logic identical to original; only gem visuals upgraded to WebGL 3D.

export default (() => {
  'use strict';

  const COLS = 8, ROWS = 8;
  const GEM_TYPES = 7;
  // 7 well-separated gem colours — each occupies a distinct hue region
  // Red · Blue · Green · Yellow · Purple · Teal · Orange
  const GEM_COLORS = ['#f52222','#1565ff','#00c853','#ffd600','#aa00ff','#00bcd4','#ff6d00'];
  const GEM_DARK   = ['#7f0000','#0033aa','#005929','#997a00','#5500aa','#006070','#7a2800'];
  const GEM_LIGHT  = ['#ff8080','#80a8ff','#80ffaa','#ffee66','#cc80ff','#80e8ff','#ffaa66'];

  let canvas, ctx, cellSize = 60;
  let gems = [];
  let score = 0, best = 0, level = 1;
  let timerInterval = null;
  let sel = null;
  let busy = false;
  let phase = 'idle';

  const LEVEL_THRESHOLDS = [0, 500, 1500, 3000, 5500, 9000, 14000, 21000, 30000, 42000, 58000];

  function thresholdFor(lvl) {
    if (lvl <= 0) return 0;
    if (lvl < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[lvl];
    const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const extra = lvl - (LEVEL_THRESHOLDS.length - 1);
    return last + extra * 20000;
  }

  function levelForScore(s) {
    let lv = 1;
    while (thresholdFor(lv + 1) <= s) lv++;
    return lv;
  }

  function rnd(n) { return Math.floor(Math.random() * n); }

  function gemType(r,c) {
    if (r<0||r>=ROWS||c<0||c>=COLS) return -1;
    const g = gems[r][c]; return g ? g.type : -1;
  }
  function isEmpty(r,c) { return !gems[r][c] || gems[r][c].type < 0; }
  function mkGem(type, special=null) { return { type, special }; }

  // ── THREE.js gem renderer ─────────────────────────────────────
  let THREE = null;
  let threeRenderer = null;
  let threeScene    = null;
  let threeCamera   = null;
  let gemMeshPool   = {};   // key `r,c` → THREE.Mesh
  let ambientLight  = null;
  let dirLight1     = null;
  let dirLight2     = null;
  let pointLightPool = [];
  let threeReady    = false;

  // Hex color string → THREE.Color
  function hex2three(hex) {
    return new THREE.Color(hex);
  }

  // Build a faceted gem LatheGeometry (octahedral diamond-ish)
  function makeGemGeometry(radius) {
    // Define the silhouette profile of a gemstone (rotated around Y axis)
    // Points are [x, y] where x = distance from axis, y = height
    const r = radius;
    const points = [
      new THREE.Vector2(0,         r * 0.72),   // top crown point
      new THREE.Vector2(r * 0.55,  r * 0.35),   // upper crown edge
      new THREE.Vector2(r * 0.88,  r * 0.08),   // girdle top
      new THREE.Vector2(r * 0.88, -r * 0.08),   // girdle bottom
      new THREE.Vector2(r * 0.55, -r * 0.40),   // pavilion upper
      new THREE.Vector2(r * 0.18, -r * 0.78),   // pavilion lower
      new THREE.Vector2(0,        -r * 0.88),    // culet (bottom point)
    ];
    return new THREE.LatheGeometry(points, 8); // 8 segments = octagonal facets
  }

  // Flat-shading helper — recompute normals for faceted look
  function facetGeometry(geo) {
    geo.computeVertexNormals();
    return geo;
  }

  // Material per gem type
  function makeGemMaterial(type, special) {
    if (!THREE) return null;
    const baseCol  = new THREE.Color(GEM_COLORS[type] || '#ffffff');
    const darkCol  = new THREE.Color(GEM_DARK[type]   || '#333333');
    const lightCol = new THREE.Color(GEM_LIGHT[type]  || '#ffffff');

    // All gems — solid, faceted, high-shininess crystal.
    // Special gems get a brighter emissive glow so they stand out,
    // but same opacity/solid look as normal gems.
    const shininess = special ? 750 : 600;
    const emissive  = special
      ? darkCol.clone().lerp(baseCol, 0.45)   // warm inner glow of own colour
      : darkCol.clone().multiplyScalar(0.30);

    return new THREE.MeshPhongMaterial({
      color:       baseCol,
      emissive,
      specular:    lightCol.clone().lerp(new THREE.Color('#ffffff'), 0.45),
      shininess,
      transparent: true,
      opacity:     0.92,
      side:        THREE.DoubleSide,
      flatShading: true,
    });
  }

  function initThree() {
    if (threeReady) return Promise.resolve();
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = () => {
        THREE = window.THREE;
        setupThreeScene();
        threeReady = true;
        resolve();
      };
      script.onerror = () => {
        console.warn('[bjw] Three.js failed to load — falling back to 2D gems');
        threeReady = false;
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  function setupThreeScene() {
    // Offscreen WebGL renderer — same pixel dimensions as game canvas
    threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    threeRenderer.setPixelRatio(1);
    threeRenderer.setClearColor(0x000000, 0);
    threeRenderer.setSize(canvas.width, canvas.height);
    threeRenderer.domElement.style.display = 'none';
    document.body.appendChild(threeRenderer.domElement);

    threeScene = new THREE.Scene();

    // Orthographic camera — sized to match our canvas grid in world units
    const W = canvas.width, H = canvas.height;
    threeCamera = new THREE.OrthographicCamera(-W/2, W/2, H/2, -H/2, -500, 500);
    threeCamera.position.set(0, 0, 100);
    threeCamera.lookAt(0, 0, 0);

    // Lighting for glossy gem look
    ambientLight = new THREE.AmbientLight(0xffffff, 0.40);
    threeScene.add(ambientLight);

    // Key light — upper left
    dirLight1 = new THREE.DirectionalLight(0xffffff, 0.90);
    dirLight1.position.set(-W * 0.4, H * 0.5, 200);
    threeScene.add(dirLight1);

    // Fill light — lower right
    dirLight2 = new THREE.DirectionalLight(0xc8d8ff, 0.45);
    dirLight2.position.set(W * 0.5, -H * 0.4, 150);
    threeScene.add(dirLight2);

    // Rim light — back
    const rimLight = new THREE.DirectionalLight(0xffeedd, 0.30);
    rimLight.position.set(0, 0, -200);
    threeScene.add(rimLight);

    // Pre-create gem meshes for all cells
    rebuildGemMeshes();
  }

  function rebuildThreeSize() {
    if (!threeReady || !threeRenderer) return;
    const W = canvas.width, H = canvas.height;
    threeRenderer.setSize(W, H);
    threeCamera.left   = -W / 2;
    threeCamera.right  =  W / 2;
    threeCamera.top    =  H / 2;
    threeCamera.bottom = -H / 2;
    threeCamera.updateProjectionMatrix();
    if (dirLight1) dirLight1.position.set(-W * 0.4, H * 0.5, 200);
    if (dirLight2) dirLight2.position.set(W * 0.5, -H * 0.4, 150);
    rebuildGemMeshes();
  }

  function clearGemMeshes() {
    Object.values(gemMeshPool).forEach(mesh => {
      threeScene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    gemMeshPool = {};
  }

  function rebuildGemMeshes() {
    if (!threeReady) return;
    clearGemMeshes();
    const radius = cellSize * 0.40;
    const geo = facetGeometry(makeGemGeometry(radius));

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        threeScene.add(mesh);
        gemMeshPool[`${r},${c}`] = mesh;
      }
    }
  }

  // Convert grid cell to Three.js world coords (Y flipped — Three uses +Y up)
  function cellToWorld(r, c, ox, oy) {
    const wx = (c + 0.5) * cellSize - canvas.width  / 2 + ox;
    const wy = -(r + 0.5) * cellSize + canvas.height / 2 - oy;
    return { wx, wy };
  }

  // Update all gem meshes from current game state + anim offsets
  function syncGemMeshes(ts) {
    if (!threeReady) return;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const key = `${r},${c}`;
        const mesh = gemMeshPool[key];
        if (!mesh) continue;

        const g = gems[r] && gems[r][c];
        if (!g || g.type < 0) {
          mesh.visible = false;
          continue;
        }

        // Compute offsets from animation states
        let ox = 0, oy = 0, scale = 1, alpha = 1;

        // Bob
        if (phase === 'playing' && !busy && bobPhases[r] && bobPhases[r][c] !== undefined) {
          const spd = bobSpeeds[r]?.[c] ?? 0.0014;
          oy = Math.sin(ts * spd + bobPhases[r][c]) * cellSize * 0.018;
          scale = 1 + Math.sin(ts * spd * 0.7 + bobPhases[r][c] + 1) * 0.006;
        }

        // Swap anim
        if (swapAnim) {
          const {r1,c1,r2,c2,p} = swapAnim;
          if (r===r1&&c===c1) { ox=(c2-c1)*cellSize*p; oy+=(r2-r1)*cellSize*p; }
          else if (r===r2&&c===c2) { ox=(c1-c2)*cellSize*p; oy+=(r1-r2)*cellSize*p; }
        }

        // Drop
        if (dropOffsets && dropOffsets[r] && dropOffsets[r][c]) {
          oy += dropOffsets[r][c] * (1 - easeOut(dropProgress));
        }

        // Match explode
        if (matchExplodeSet && matchExplodeSet.has(key)) {
          scale = 1 - easeIn(explodeProgress) * 0.85;
          alpha = 1 - easeIn(explodeProgress);
        }

        // Selection pulse
        let selGlow = 0;
        if (sel && sel.r === r && sel.c === c && !busy) {
          selGlow = 0.5 + 0.5 * Math.sin(ts / 250);
        }

        const { wx, wy } = cellToWorld(r, c, ox, oy);
        mesh.position.set(wx, wy, 0);
        mesh.scale.setScalar(scale);
        mesh.visible = alpha > 0.02;

        // Update material if gem changed type/special
        const matKey = `${g.type}-${g.special || 'n'}`;
        if (mesh._bjwMatKey !== matKey) {
          mesh.material.dispose();
          mesh.material = makeGemMaterial(g.type, g.special);
          mesh._bjwMatKey = matKey;
        }
        mesh.material.opacity = 0.92 + selGlow * 0.06;
        mesh.material.transparent = true;

        // Tilt gems slightly on hover/select
        const tiltX = selGlow * 0.18;
        mesh.rotation.set(tiltX, selGlow * 0.12, ts * 0.0004 + bobPhases[r]?.[c] * 0.3 || 0);

        // Add emissive boost on selection
        if (selGlow > 0) {
          mesh.material.emissiveIntensity = selGlow * 0.5;
        }
      }
    }

    // Rotate special gems continuously
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const g = gems[r] && gems[r][c];
        if (!g || !g.special) continue;
        const mesh = gemMeshPool[`${r},${c}`];
        if (!mesh || !mesh.visible) continue;
        const speed = g.special === 'hyper' ? 0.0018 : g.special === 'supernova' ? 0.0014 : 0.0009;
        mesh.rotation.y = ts * speed;
        mesh.rotation.z = Math.sin(ts * speed * 0.5) * 0.2;
      }
    }
  }

  // Render Three.js scene to offscreen canvas, then composite onto game canvas
  function renderThreeGems(ts) {
    if (!threeReady || !threeRenderer) return;
    syncGemMeshes(ts);
    threeRenderer.render(threeScene, threeCamera);
    // Composite the WebGL canvas onto the 2D canvas
    ctx.drawImage(threeRenderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  // ── Floating score popups ────────────────────────────────────
  let scorePopups = [];
  function spawnScorePopup(x, y, pts, combo) {
    const color = combo >= 3 ? '#ffd600' : combo === 2 ? '#ff6d00' : '#ffffff';
    scorePopups.push({ x, y, text: '+' + pts.toLocaleString(), color, life: 1, vy: -1.4 - combo * 0.3 });
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
  let comboBanner = null;
  const COMBO_LABELS = ['','','2× COMBO!','3× COMBO!','BLAZING!','INFERNO!','UNSTOPPABLE!','LEGENDARY!'];
  function showComboBanner(combo) {
    if (combo < 2) return;
    const text  = COMBO_LABELS[Math.min(combo, COMBO_LABELS.length-1)];
    const color = combo >= 5 ? '#ff1744' : combo >= 4 ? '#ff6d00' : combo >= 3 ? '#ffd600' : '#00f5ff';
    comboBanner = { text, color, life: 1 };
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
    const scale = comboBanner.life > 0.85 ? 1 + (1-comboBanner.life)*3 : 1;
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

  // ── Find matches ─────────────────────────────────────────────
  function findMatches() {
    const mark = Array.from({length:ROWS}, ()=>Array(COLS).fill(false));
    const runs = [];
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
    const hRuns = runs.filter(r=>r.dir==='h');
    const vRuns = runs.filter(r=>r.dir==='v');
    for (const h of hRuns) {
      for (const v of vRuns) {
        if (h.t !== v.t) continue;
        const inter = h.cells.find(hc => v.cells.some(vc => vc.r===hc.r && vc.c===hc.c));
        if (inter) {
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

  function expandSpecials(initialHit) {
    const toRemove = new Set(initialHit.map(({r,c})=>`${r},${c}`));
    const queue = [...initialHit];
    while (queue.length) {
      const {r,c} = queue.shift();
      const g = gems[r]?.[c];
      if (!g || g.type < 0) continue;
      if (g.special === 'flame') {
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
          const k=`${nr},${nc}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r:nr,c:nc}); }
        }
      } else if (g.special === 'star') {
        for (let cc=0;cc<COLS;cc++) {
          const k=`${r},${cc}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r,c:cc}); }
        }
        for (let rr=0;rr<ROWS;rr++) {
          const k=`${rr},${c}`; if (!toRemove.has(k)) { toRemove.add(k); queue.push({r:rr,c}); }
        }
      } else if (g.special === 'supernova') {
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
    if (combo >= 2) showComboBanner(combo);
    const uniqueTypes = [...new Set(hit.map(({r,c})=>gems[r][c]?.type).filter(t=>t!=null&&t>=0))];
    uniqueTypes.forEach((t,i) => setTimeout(()=>playGemSound(t,combo), i*60));
    const cx = hit.reduce((s,{c})=>s+c*cellSize+cellSize/2,0)/hit.length;
    const cy = hit.reduce((s,{r})=>s+r*cellSize+cellSize/2,0)/hit.length;
    spawnScorePopup(cx, cy, pts, combo);

    const newSpecials = [];
    const crossRuns = runs.filter(r=>r.dir==='cross');
    const straightRuns = runs.filter(r=>r.dir!=='cross');
    crossRuns.forEach(run => {
      const pivot = run.inter || run.cells[Math.floor(run.cells.length/2)];
      newSpecials.push({r:pivot.r, c:pivot.c, special:'star', type:run.t});
    });
    straightRuns.forEach(run => {
      if (run.len === 4) {
        const mid = run.cells[Math.floor(run.cells.length/2)];
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
    const specialMap = new Map();
    newSpecials.forEach(s => specialMap.set(`${s.r},${s.c}`, s));
    const deduped = [...specialMap.values()];
    const expanded = expandSpecials(hit);
    const matchSet = new Set(expanded.map(({r,c})=>`${r},${c}`));

    animFlash(matchSet, () => {
      expanded.forEach(({r,c}) => { if (gems[r]) gems[r][c] = mkGem(-1); });
      deduped.forEach(({r,c,special,type}) => {
        if (gems[r]) gems[r][c] = mkGem(type, special);
      });
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
      for (let c=0;c<COLS;c++) {
        const col=[];
        for (let r=ROWS-1;r>=0;r--) {
          if (!isEmpty(r,c)) col.push(gems[r][c]);
        }
        while (col.length < ROWS) col.push(mkGem(rnd(GEM_TYPES)));
        for (let r=0;r<ROWS;r++) gems[r][c] = col[ROWS-1-r];
      }
      animDrop(fallOffsets, () => {
        setTimeout(() => cascade(combo+1, onDone), 16);
      });
    });
  }

  // ── Particles ─────────────────────────────────────────────────
  let particles = [];
  let glints    = [];
  let rafId     = null;

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

  let audioCtx = null;
  function getAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
  }
  const GEM_FREQS = [523,587,659,698,784,880,988];
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

  let shakeAmt = 0;
  function triggerShake(amount) { shakeAmt = Math.max(shakeAmt, amount); }
  let levelFlash = 0;

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
    if (particles.length > 180) return;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.4;
      const speed = cellSize * (0.06 + Math.random() * 0.14);
      particles.push({ x: cx, y: cy, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        life: 1, decay: 0.04+Math.random()*0.04, r: 2+Math.random()*3, color });
    }
  }
  function spawnRing(cx, cy, color) {
    particles.push({ type:'ring', x:cx, y:cy, r:0, maxR:cellSize*0.85, life:1, decay:0.045, color });
  }
  function spawnStar(cx, cy, color) {
    particles.push({ type:'star', x:cx, y:cy, life:1, decay:0.03+Math.random()*0.03,
      size:3+Math.random()*4, color, angle:Math.random()*Math.PI });
  }

  function tickGlints(now) {
    if (Math.random() < 0.06 && phase === 'playing') {
      const r = Math.floor(Math.random()*ROWS), c = Math.floor(Math.random()*COLS);
      if (gems[r] && gems[r][c] && gems[r][c].type >= 0) {
        glints.push({ r, c, x:c*cellSize+cellSize/2, y:r*cellSize+cellSize/2,
          life:1, decay:0.025+Math.random()*0.02, size:cellSize*(0.18+Math.random()*0.18),
          color:GEM_LIGHT[gems[r][c].type]??'#ffffff' });
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
    for (let i = 0; i < arms*2; i++) {
      const a = (i*Math.PI/arms);
      const r = i%2===0 ? size : size*0.12;
      if (i===0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
      else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = size*1.5;
    ctx.fill();
    ctx.restore();
  }

  function updateParticles() {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.life -= p.decay;
      if (p.type==='ring') { p.r += (p.maxR-p.r)*0.18; return; }
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.35;
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      const a = Math.max(0, p.life);
      if (p.type==='ring') {
        ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0,p.r),0,Math.PI*2);
        ctx.strokeStyle=p.color; ctx.globalAlpha=a; ctx.lineWidth=2; ctx.stroke();
        ctx.globalAlpha=1;
      } else if (p.type==='star') {
        drawStar4(p.x, p.y, p.size, a, p.color);
      } else {
        ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0,p.r*p.life),0,Math.PI*2);
        ctx.fillStyle=p.color; ctx.globalAlpha=a; ctx.fill(); ctx.globalAlpha=1;
      }
    });
  }

  function drawGlints() {
    glints.forEach(g => {
      const pulse = Math.max(0, Math.sin(g.life*Math.PI));
      drawStar4(g.x, g.y, g.size*pulse, pulse*0.9, g.color);
    });
  }

  let matchExplodeSet = null;
  let explodeProgress = 0;
  let dropOffsets = null;
  let dropProgress = 0;
  let swapAnim = null;
  let lastTs = 0;

  function easeOut(t) { return 1-(1-t)*(1-t)*(1-t); }
  function easeIn(t)  { return t*t*t; }

  function renderLoop(ts) {
    const dt = Math.min(ts-lastTs, 50); lastTs = ts;
    tickGlints(ts);
    updateParticles();
    shakeAmt *= 0.82;
    if (levelFlash > 0) levelFlash = Math.max(0, levelFlash-0.03);

    const theme = getTheme();
    const shX = shakeAmt > 0.3 ? (Math.random()-0.5)*shakeAmt : 0;
    const shY = shakeAmt > 0.3 ? (Math.random()-0.5)*shakeAmt : 0;

    ctx.save();
    ctx.translate(shX, shY);
    ctx.clearRect(-shakeAmt, -shakeAmt, canvas.width+shakeAmt*2, canvas.height+shakeAmt*2);

    // Background
    const bgGrad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
    bgGrad.addColorStop(0, theme.bg1);
    bgGrad.addColorStop(1, theme.bg2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-shakeAmt, -shakeAmt, canvas.width+shakeAmt*2, canvas.height+shakeAmt*2);

    // Grid
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
      ctx.fillStyle = (r+c)%2===0 ? theme.g1 : theme.g2;
      ctx.fillRect(c*cellSize, r*cellSize, cellSize, cellSize);
    }
    ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
    for (let i=0;i<=COLS;i++){ctx.beginPath();ctx.moveTo(i*cellSize,0);ctx.lineTo(i*cellSize,canvas.height);ctx.stroke();}
    for (let j=0;j<=ROWS;j++){ctx.beginPath();ctx.moveTo(0,j*cellSize);ctx.lineTo(canvas.width,j*cellSize);ctx.stroke();}

    // ── 3D Gem render ──────────────────────────────────────────
    if (threeReady) {
      // Update Three camera/renderer offset to match canvas shake
      threeCamera.position.set(shX, -shY, 100);
      renderThreeGems(ts);
    } else {
      // Fallback: flat 2D hex gems (original style)
      for (let r=0;r<ROWS;r++) {
        for (let c=0;c<COLS;c++) {
          if (!gems[r][c]||gems[r][c].type<0) continue;
          drawCellTransformed2D(r,c,ts);
        }
      }
    }

    drawParticles();
    drawGlints();
    updateScorePopups();
    drawScorePopups();
    drawComboBanner(ts);

    // Selection highlight
    if (sel && !busy) {
      const sx=sel.c*cellSize, sy=sel.r*cellSize;
      const pulse=0.6+0.4*Math.sin(ts/300);
      ctx.strokeStyle=theme.accent;
      ctx.globalAlpha=pulse; ctx.lineWidth=3;
      ctx.shadowColor=theme.accent; ctx.shadowBlur=14*pulse;
      ctx.strokeRect(sx+2,sy+2,cellSize-4,cellSize-4);
      ctx.shadowBlur=0; ctx.globalAlpha=1;
    }

    // Level-up flash
    if (levelFlash > 0) {
      ctx.globalAlpha = levelFlash*0.55;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(-shakeAmt,-shakeAmt,canvas.width+shakeAmt*2,canvas.height+shakeAmt*2);
      ctx.globalAlpha=1;
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

  // ── Resize ───────────────────────────────────────────────────
  function resize() {
    const wrap = canvas.parentElement;
    const fit = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight-4)/COLS);
    cellSize = Math.max(32, Math.min(fit, 76));
    canvas.width  = cellSize*COLS;
    canvas.height = cellSize*ROWS;
    rebuildThreeSize();
  }

  // ── Grad cache for 2D fallback ───────────────────────────────
  let gemGradCache = {};
  let lastCellSizeForCache = 0;
  function buildGradCache() {
    gemGradCache = {};
    lastCellSizeForCache = cellSize;
    const s = cellSize*0.43;
    for (let t=0;t<GEM_TYPES;t++) {
      const col=GEM_COLORS[t], dark=GEM_DARK[t], lite=GEM_LIGHT[t];
      const fill = ctx.createLinearGradient(0,-s,0,s);
      fill.addColorStop(0,lite); fill.addColorStop(0.25,col);
      fill.addColorStop(0.7,col); fill.addColorStop(1,dark);
      const inner = ctx.createLinearGradient(-s*0.4,-s*0.5,s*0.2,s*0.3);
      inner.addColorStop(0,'rgba(255,255,255,0.38)');
      inner.addColorStop(0.5,'rgba(255,255,255,0.08)');
      inner.addColorStop(1,'rgba(0,0,0,0.18)');
      gemGradCache[`${t}`] = {fill,inner,col,dark,lite};
    }
    const hFill=ctx.createLinearGradient(0,-s,0,s);
    hFill.addColorStop(0,'#555');hFill.addColorStop(0.25,'#111');
    hFill.addColorStop(0.7,'#111');hFill.addColorStop(1,'#000');
    const hInner=ctx.createLinearGradient(-s*0.4,-s*0.5,s*0.2,s*0.3);
    hInner.addColorStop(0,'rgba(255,255,255,0.38)');
    hInner.addColorStop(0.5,'rgba(255,255,255,0.08)');
    hInner.addColorStop(1,'rgba(0,0,0,0.18)');
    gemGradCache['hyper']={fill:hFill,inner:hInner,col:'#111',dark:'#000',lite:'#555'};
    const stFill=ctx.createLinearGradient(0,-s,0,s);
    stFill.addColorStop(0,'#fff9c4');stFill.addColorStop(0.3,'#ffd600');
    stFill.addColorStop(0.7,'#ff8f00');stFill.addColorStop(1,'#e65100');
    gemGradCache['star-base']={fill:stFill,inner:hInner,col:'#ffd600',dark:'#e65100',lite:'#fff9c4'};
    const snFill=ctx.createLinearGradient(0,-s,0,s);
    snFill.addColorStop(0,'#ffffff');snFill.addColorStop(0.2,'#e040fb');
    snFill.addColorStop(0.7,'#7b1fa2');snFill.addColorStop(1,'#4a148c');
    gemGradCache['supernova-base']={fill:snFill,inner:hInner,col:'#e040fb',dark:'#4a148c',lite:'#ffffff'};
  }

  // 2D fallback draw (original logic, kept intact)
  function drawCellTransformed2D(r, c, ts) {
    const g=gems[r][c]; if (!g||g.type<0) return;
    const t=g.type;
    let ox=0,oy=0,scale=1,alpha=1;
    if (phase==='playing'&&!busy&&bobPhases[r]&&bobPhases[r][c]!==undefined) {
      const spd=bobSpeeds[r]?.[c]??0.0014;
      oy=Math.sin(ts*spd+bobPhases[r][c])*cellSize*0.018;
      scale=1+Math.sin(ts*spd*0.7+bobPhases[r][c]+1)*0.006;
    }
    if (swapAnim) {
      const {r1,c1,r2,c2,p}=swapAnim;
      if (r===r1&&c===c1) {ox=(c2-c1)*cellSize*p;oy=(r2-r1)*cellSize*p;}
      else if (r===r2&&c===c2) {ox=(c1-c2)*cellSize*p;oy=(r1-r2)*cellSize*p;}
    }
    if (dropOffsets&&dropOffsets[r]&&dropOffsets[r][c]) oy-=dropOffsets[r][c]*(1-easeOut(dropProgress));
    const key=r+','+c;
    if (matchExplodeSet&&matchExplodeSet.has(key)) {
      scale=1-easeIn(explodeProgress)*0.85; alpha=1-easeIn(explodeProgress);
    }
    const x=c*cellSize+cellSize/2+ox, y=r*cellSize+cellSize/2+oy;
    const s=cellSize*0.43*scale;
    if (cellSize!==lastCellSizeForCache) buildGradCache();
    const cache=g.special==='hyper'?gemGradCache['hyper']:g.special==='star'?gemGradCache['star-base']:g.special==='supernova'?gemGradCache['supernova-base']:gemGradCache[`${t}`];
    const {col,dark}=cache;
    function hexPath(radius) {
      ctx.beginPath();
      for (let i=0;i<6;i++) {
        const ang=i*Math.PI/3;
        if (i===0) ctx.moveTo(Math.cos(ang)*radius,Math.sin(ang)*radius);
        else ctx.lineTo(Math.cos(ang)*radius,Math.sin(ang)*radius);
      }
      ctx.closePath();
    }
    ctx.save();
    ctx.globalAlpha=Math.max(0,alpha);
    ctx.translate(x,y);
    hexPath(s); ctx.fillStyle=cache.fill; ctx.fill();
    ctx.strokeStyle=g.special==='flame'?'#ff8c00':g.special==='hyper'?'#ffffff':g.special==='star'?'#ffd600':g.special==='supernova'?'#e040fb':col;
    ctx.lineWidth=g.special?2.5:1.5; ctx.stroke();
    hexPath(s*0.62); ctx.fillStyle=cache.inner; ctx.fill();
    ctx.beginPath(); ctx.arc(-s*0.22,-s*0.30,Math.max(0,s*0.11),0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fill();
    ctx.restore();
  }

  // ── Animations ───────────────────────────────────────────────
  function animFlash(matchSet, done) {
    matchSet.forEach(key => {
      const [r,c]=key.split(',').map(Number);
      const g=gems[r]?.[c]; if (!g||g.type<0) return;
      const col=g.special==='hyper'?'#ffffff':g.special==='star'?'#ffd600':g.special==='supernova'?'#e040fb':(GEM_COLORS[g.type]??'#ffffff');
      const lite=g.special==='hyper'?'#ffffff':g.special==='star'?'#fff9c4':g.special==='supernova'?'#ffffff':(GEM_LIGHT[g.type]??'#ffffff');
      const cx=c*cellSize+cellSize/2, cy=r*cellSize+cellSize/2;
      spawnBurst(cx,cy,col,g.special?16:10);
      spawnRing(cx,cy,col);
      if (Math.random()<0.5) spawnStar(cx,cy,lite);
    });
    matchExplodeSet=matchSet; explodeProgress=0;
    const dur=380, start=performance.now();
    function tick() {
      explodeProgress=Math.min((performance.now()-start)/dur,1);
      if (explodeProgress<1) requestAnimationFrame(tick);
      else { matchExplodeSet=null; explodeProgress=0; done(); }
    }
    requestAnimationFrame(tick);
  }

  function animDrop(offsets, done) {
    dropOffsets=offsets; dropProgress=0;
    const dur=320, start=performance.now();
    function tick() {
      dropProgress=Math.min((performance.now()-start)/dur,1);
      if (dropProgress<1) requestAnimationFrame(tick);
      else { dropOffsets=null; dropProgress=0; done(); }
    }
    requestAnimationFrame(tick);
  }

  function animSwap(r1,c1,r2,c2,forward,done) {
    swapAnim={r1,c1,r2,c2,p:forward?0:1};
    const dur=160, start=performance.now();
    function tick() {
      const raw=Math.min((performance.now()-start)/dur,1);
      swapAnim.p=forward?easeOut(raw):1-easeOut(raw);
      if (raw<1) requestAnimationFrame(tick);
      else { swapAnim=null; done(); }
    }
    requestAnimationFrame(tick);
  }

  // ── Input ────────────────────────────────────────────────────
  function getCell(e) {
    const rect=canvas.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
    return { r:Math.floor((cy-rect.top)*sy/cellSize), c:Math.floor((cx-rect.left)*sx/cellSize) };
  }

  function onTap(e) {
    e.preventDefault();
    if (phase!=='playing'||busy) return;
    getAudio();
    const {r,c}=getCell(e);
    if (r<0||r>=ROWS||c<0||c>=COLS) return;
    if (!sel) { sel={r,c}; return; }
    if (sel.r===r&&sel.c===c) { sel=null; return; }
    const dr=Math.abs(sel.r-r), dc=Math.abs(sel.c-c);
    if (dr+dc!==1) { sel={r,c}; return; }
    const r1=sel.r, c1=sel.c;
    sel=null; busy=true;

    const g1=gems[r1][c1], g2=gems[r][c];
    const isSpecial=g=>g?.special==='hyper'||g?.special==='flame'||g?.special==='star'||g?.special==='supernova';

    if (g1?.special==='hyper'||g2?.special==='hyper') {
      let toRemove=[];
      if (g1?.special==='hyper'&&g2?.special==='hyper') {
        for (let rr=0;rr<ROWS;rr++) for (let cc=0;cc<COLS;cc++) toRemove.push({r:rr,c:cc});
      } else {
        const targetType=g1?.special==='hyper'?g2?.type:g1?.type;
        for (let rr=0;rr<ROWS;rr++) for (let cc=0;cc<COLS;cc++) {
          if (gems[rr][cc]?.type===targetType||(rr===r1&&cc===c1)||(rr===r&&cc===c))
            toRemove.push({r:rr,c:cc});
        }
      }
      const hyperSet=new Set(toRemove.map(({r,c})=>`${r},${c}`));
      toRemove.forEach(({r,c}) => {
        const cx=c*cellSize+cellSize/2, cy=r*cellSize+cellSize/2;
        spawnBurst(cx,cy,'#ffffff',12); spawnRing(cx,cy,'#ffffff');
      });
      triggerShake(22);
      const pts=toRemove.length*200;
      score+=pts; spawnScorePopup(canvas.width/2,canvas.height/2,pts,3);
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
        animDrop(fallOffsets, () => { cascade(1,null); });
      });
      return;
    }

    if (isSpecial(g1)&&isSpecial(g2)) {
      const expanded=expandSpecials([{r:r1,c:c1},{r:r,c:c}]);
      const expandSet=new Set(expanded.map(({r,c})=>`${r},${c}`));
      expanded.forEach(({r,c}) => {
        const g=gems[r]?.[c]; if(!g||g.type<0) return;
        const col=GEM_COLORS[g.type]??'#ffffff';
        spawnBurst(c*cellSize+cellSize/2,r*cellSize+cellSize/2,col,10);
      });
      triggerShake(18);
      const pts=expanded.length*150;
      score+=pts; updateHUD();
      spawnScorePopup(canvas.width/2,canvas.height/2,pts,2);
      animFlash(expandSet, () => {
        expanded.forEach(({r,c}) => { if(gems[r]) gems[r][c]=mkGem(-1); });
        for (let c=0;c<COLS;c++) {
          const col=[];
          for (let r=ROWS-1;r>=0;r--) { if(!isEmpty(r,c)) col.push(gems[r][c]); }
          while(col.length<ROWS) col.push(mkGem(rnd(GEM_TYPES)));
          for (let r=0;r<ROWS;r++) gems[r][c]=col[ROWS-1-r];
        }
        const fallOffsets=Array.from({length:ROWS},()=>Array(COLS).fill(cellSize*2));
        animDrop(fallOffsets, () => { cascade(1,null); });
      });
      return;
    }

    animSwap(r1,c1,r,c,true, () => {
      const tmp=gems[r1][c1]; gems[r1][c1]=gems[r][c]; gems[r][c]=tmp;
      const hasMatch=findMatchesIgnoringSpecial().hit.length>0;
      if (!hasMatch) {
        animSwap(r1,c1,r,c,false, () => {
          const tmp2=gems[r1][c1]; gems[r1][c1]=gems[r][c]; gems[r][c]=tmp2;
          busy=false;
        });
      } else {
        cascade(1,null);
      }
    });
  }

  // ── HUD ──────────────────────────────────────────────────────
  function updateHUD() {
    document.getElementById('bjw-score').textContent=score.toLocaleString();
    document.getElementById('bjw-best').textContent=best.toLocaleString();
    document.getElementById('bjw-level').textContent=level;
    const curThresh=thresholdFor(level), nextThresh=thresholdFor(level+1);
    const pct=Math.min(100,((score-curThresh)/(nextThresh-curThresh))*100);
    document.getElementById('bjw-progress-fill').style.width=pct+'%';
    document.getElementById('bjw-prog-level').textContent=level;
    document.getElementById('bjw-prog-next').textContent=level+1;
    document.getElementById('bjw-prog-pts').textContent=
      (score-curThresh).toLocaleString()+' / '+(nextThresh-curThresh).toLocaleString();
  }

  function startTimer() {}

  let paused=false;
  function pause() {
    if (phase!=='playing'||paused) return;
    paused=true; clearInterval(timerInterval); stopRaf();
    const ov=document.getElementById('bjw-overlay');
    document.getElementById('bjw-ov-title').textContent='PAUSED';
    document.getElementById('bjw-ov-title').className='bjw-ov-title';
    document.getElementById('bjw-ov-score').textContent='';
    document.getElementById('bjw-ov-msg').textContent='Click Resume to continue.';
    document.getElementById('bjw-ov-btns').innerHTML=
      `<button class="bjw-btn" onclick="BJW.resume()">▶ RESUME</button>
       <button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    ov.classList.add('active');
  }
  function resume() {
    if (phase!=='playing'||!paused) return;
    paused=false;
    document.getElementById('bjw-overlay').classList.remove('active');
    startRaf(); startTimer();
  }
  function onVisibilityChange() { if (document.hidden) pause(); }
  function onWindowBlur() { pause(); }

  function endGame() {
    phase='over'; busy=false;
    stopRaf(); clearInterval(timerInterval);
    if (score>best) { best=score; try { localStorage.setItem('bjw-best',best); } catch(e){} }
    updateHUD();
    const ov=document.getElementById('bjw-overlay');
    document.getElementById('bjw-ov-title').textContent='GAME OVER';
    document.getElementById('bjw-ov-title').className='bjw-ov-title lose';
    document.getElementById('bjw-ov-score').textContent=score.toLocaleString()+' PTS';
    document.getElementById('bjw-ov-msg').textContent=`Level ${level} reached!`;
    document.getElementById('bjw-ov-btns').innerHTML=
      `<button class="bjw-btn" onclick="BJW.newGame()">🔄 RETRY</button>
       <button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    ov.classList.add('active');
    if (score>0) setTimeout(()=>HS.promptSubmit('bejeweled',score,score.toLocaleString()),600);
  }

  // ── Public ───────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('bjw-canvas');
    ctx    = canvas.getContext('2d');
    try { best=parseInt(localStorage.getItem('bjw-best'))||0; } catch(e){}
    canvas.addEventListener('click',      onTap);
    canvas.addEventListener('touchstart', onTap, {passive:false});
    window.addEventListener('resize', () => { if (phase!=='idle') { resize(); } });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    resize(); buildBoard(); updateHUD(); startRaf();

    // Load Three.js async — gems will upgrade to 3D once ready
    initThree();

    const ov=document.getElementById('bjw-overlay');
    document.getElementById('bjw-ov-title').textContent='BEJEWELED';
    document.getElementById('bjw-ov-title').className='bjw-ov-title';
    document.getElementById('bjw-ov-score').textContent='';
    document.getElementById('bjw-ov-msg').innerHTML='Click two adjacent gems to swap.<br>Match 3+ to score!';
    document.getElementById('bjw-ov-btns').innerHTML=
      `<button class="bjw-btn" onclick="BJW.start()">▶ START</button>
       <button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
    ov.classList.add('active');
  }

  function start() {
    clearInterval(timerInterval);
    score=0; level=1; busy=false; sel=null; phase='playing'; paused=false;
    particles=[]; glints=[]; shakeAmt=0; levelFlash=0;
    scorePopups=[]; comboBanner=null;
    matchExplodeSet=null; dropOffsets=null; swapAnim=null;
    resize(); buildGradCache();
    let _tries=0;
    do { buildBoard(); _tries++; } while ((findMatches().hit.length>0||!anyValidMove())&&_tries<100);
    initBobPhases();
    // Reset Three.js mesh material keys so gems re-skin on new game
    Object.values(gemMeshPool).forEach(m => { m._bjwMatKey=null; });
    document.getElementById('bjw-overlay').classList.remove('active');
    updateHUD(); startRaf(); startTimer();
  }

  function newGame() { start(); }

  function destroy() {
    clearInterval(timerInterval); stopRaf();
    if (threeRenderer) {
      clearGemMeshes();
      threeRenderer.dispose();
      if (threeRenderer.domElement.parentNode)
        threeRenderer.domElement.parentNode.removeChild(threeRenderer.domElement);
      threeRenderer=null; threeReady=false;
    }
  }

  return { init, start, newGame, resume, pause, destroy };
})();
