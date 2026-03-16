// ============================================================
// DIGITAL COLOURING BOOK  (clr.js)
// Abstract SVG patterns — click regions to flood-fill.
// Exports: { init, destroy }
// ============================================================

export default (() => {
  'use strict';

  // ── Constants ────────────────────────────────────────────────
  const PALETTE = [
    '#ff2d78','#ff6a00','#ffe600','#39ff14','#00f5ff',
    '#bf00ff','#ff99cc','#ff7f50','#ffd700','#7fff00',
    '#00cfff','#a855f7','#ffffff','#c8e8ff','#4a7a9b',
    '#1a1a2e',
  ];

  // Tolerance for flood-fill colour matching (0-255 per channel)
  const TOLERANCE = 28;

  // ── State ────────────────────────────────────────────────────
  let canvas, ctx, offCtx, offCanvas;
  let selectedColor  = PALETTE[0];
  let currentPage    = 0;
  let history        = [];   // array of ImageData snapshots for undo
  let filling        = false;
  let destroyed      = false;

  // ── Palette of abstract SVG patterns ────────────────────────
  // Each pattern is a function that returns an SVG string (800×800 viewBox).
  // Regions are separated by solid black strokes (#000, stroke-width ≥ 2)
  // so flood-fill can identify colour boundaries.
  // Fill colours use pure white (#fff) as the "uncoloured" base so
  // flood-fill on white regions works cleanly.

  const PATTERNS = [
    // ── 0 · Mandala rings ───────────────────────────────────────
    () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#fff"/>
  <!-- outer petals -->
  ${Array.from({length:12},(_,i)=>{
    const a=i*30, r=`rotate(${a} 400 400)`;
    return `<ellipse transform="${r}" cx="400" cy="155" rx="38" ry="90" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
  }).join('')}
  <!-- ring 3 -->
  <circle cx="400" cy="400" r="240" fill="none" stroke="#000" stroke-width="3"/>
  <!-- inner petals -->
  ${Array.from({length:8},(_,i)=>{
    const a=i*45, r=`rotate(${a} 400 400)`;
    return `<ellipse transform="${r}" cx="400" cy="230" rx="28" ry="60" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
  }).join('')}
  <!-- ring 2 -->
  <circle cx="400" cy="400" r="155" fill="none" stroke="#000" stroke-width="3"/>
  <!-- star spokes -->
  ${Array.from({length:6},(_,i)=>{
    const a=(i*60)*Math.PI/180;
    const x1=400+155*Math.cos(a), y1=400+155*Math.sin(a);
    const x2=400+80*Math.cos(a),  y2=400+80*Math.sin(a);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#000" stroke-width="2.5"/>`;
  }).join('')}
  <!-- ring 1 -->
  <circle cx="400" cy="400" r="80" fill="#fff" stroke="#000" stroke-width="3"/>
  <!-- centre star -->
  <polygon points="${Array.from({length:10},(_,i)=>{
    const a=(i*36-90)*Math.PI/180, r=i%2===0?55:28;
    return `${(400+r*Math.cos(a)).toFixed(1)},${(400+r*Math.sin(a)).toFixed(1)}`;
  }).join(' ')}" fill="#fff" stroke="#000" stroke-width="2.5"/>
  <!-- centre dot -->
  <circle cx="400" cy="400" r="14" fill="#fff" stroke="#000" stroke-width="2.5"/>
</svg>`,

    // ── 1 · Geometric tile mosaic ───────────────────────────────
    () => {
      const N=8, S=800/N; let shapes='';
      for(let r=0;r<N;r++) for(let c=0;c<N;c++){
        const x=c*S, y=r*S, cx=x+S/2, cy=y+S/2;
        const t=(r+c)%4;
        if(t===0) shapes+=`<rect x="${x+4}" y="${y+4}" width="${S-8}" height="${S-8}" rx="6" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
        else if(t===1) shapes+=`<polygon points="${cx},${y+6} ${x+S-6},${cy} ${cx},${y+S-6} ${x+6},${cy}" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
        else if(t===2) shapes+=`<ellipse cx="${cx}" cy="${cy}" rx="${S/2-6}" ry="${S/4-3}" fill="#fff" stroke="#000" stroke-width="2.5"/>
        <ellipse cx="${cx}" cy="${cy}" rx="${S/4-3}" ry="${S/2-6}" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
        else shapes+=`<polygon points="${cx},${y+6} ${x+S-6},${y+S-6} ${x+6},${y+S-6}" fill="#fff" stroke="#000" stroke-width="2.5"/>
        <polygon points="${x+6},${y+6} ${x+S-6},${y+6} ${cx},${y+S-6}" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#fff"/>${shapes}</svg>`;
    },

    // ── 2 · Flowing waves ───────────────────────────────────────
    () => {
      const BANDS=10; let paths='';
      for(let i=0;i<BANDS;i++){
        const y0=i*80, y1=(i+1)*80;
        const amp=30, freq=2;
        const pts0=Array.from({length:17},(_,x)=>{
          const px=x*50, py=y0+amp*Math.sin((x/16)*Math.PI*freq+(i*0.7));
          return `${px.toFixed(1)},${py.toFixed(1)}`;
        });
        const pts1=Array.from({length:17},(_,x)=>{
          const px=(16-x)*50, py=y1+amp*Math.sin(((16-x)/16)*Math.PI*freq+(i*0.7+0.4));
          return `${px.toFixed(1)},${py.toFixed(1)}`;
        });
        paths+=`<path d="M 0,${y0} Q ${pts0.join(' ')} L 800,${y0} L ${pts0[pts0.length-1]} ${pts0.slice(1).join(' ')} L 800,${y1} Q ${pts1.join(' ')} L 0,${y1} Z" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
      }
      // Overlay circles
      const circles=[{cx:200,cy:200,r:80},{cx:600,cy:300,r:60},{cx:400,cy:500,r:100},{cx:150,cy:600,r:50},{cx:650,cy:600,r:75}];
      const circleSvg=circles.map(({cx,cy,r})=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#000" stroke-width="3"/>`).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#fff"/>${paths}${circleSvg}</svg>`;
    },

    // ── 3 · Starburst / kaleidoscope ────────────────────────────
    () => {
      const slices=16; let paths='';
      for(let i=0;i<slices;i++){
        const a0=(i/slices)*Math.PI*2, a1=((i+1)/slices)*Math.PI*2;
        const aMid=(a0+a1)/2;
        const R=380, r1=180, r2=90;
        // outer wedge
        const ox0=(400+R*Math.cos(a0)).toFixed(1), oy0=(400+R*Math.sin(a0)).toFixed(1);
        const ox1=(400+R*Math.cos(a1)).toFixed(1), oy1=(400+R*Math.sin(a1)).toFixed(1);
        const ix0=(400+r1*Math.cos(a0)).toFixed(1), iy0=(400+r1*Math.sin(a0)).toFixed(1);
        const ix1=(400+r1*Math.cos(a1)).toFixed(1), iy1=(400+r1*Math.sin(a1)).toFixed(1);
        paths+=`<path d="M ${ix0},${iy0} L ${ox0},${oy0} A ${R},${R} 0 0,1 ${ox1},${oy1} L ${ix1},${iy1} A ${r1},${r1} 0 0,0 ${ix0},${iy0} Z" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
        // diamond accent in wedge
        const dmx=(400+(r1+r2*0.6)*Math.cos(aMid)).toFixed(1), dmy=(400+(r1+r2*0.6)*Math.sin(aMid)).toFixed(1);
        const dSize=28;
        paths+=`<polygon points="${dmx},${(parseFloat(dmy)-dSize).toFixed(1)} ${(parseFloat(dmx)+dSize).toFixed(1)},${dmy} ${dmx},${(parseFloat(dmy)+dSize).toFixed(1)} ${(parseFloat(dmx)-dSize).toFixed(1)},${dmy}" fill="#fff" stroke="#000" stroke-width="2"/>`;
        // inner ring wedge
        const ir0=(400+r2*Math.cos(a0)).toFixed(1), iry0=(400+r2*Math.sin(a0)).toFixed(1);
        const ir1=(400+r2*Math.cos(a1)).toFixed(1), iry1=(400+r2*Math.sin(a1)).toFixed(1);
        paths+=`<path d="M ${ir0},${iry0} L ${ix0},${iy0} A ${r1},${r1} 0 0,1 ${ix1},${iy1} L ${ir1},${iry1} A ${r2},${r2} 0 0,0 ${ir0},${iry0} Z" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#fff"/>
  ${paths}
  <circle cx="400" cy="400" r="90" fill="#fff" stroke="#000" stroke-width="3"/>
  <circle cx="400" cy="400" r="50" fill="#fff" stroke="#000" stroke-width="2.5"/>
  <circle cx="400" cy="400" r="20" fill="#fff" stroke="#000" stroke-width="2.5"/>
</svg>`;
    },

    // ── 4 · Spiral cells ────────────────────────────────────────
    () => {
      let shapes='';
      // Concentric rectangles rotated
      for(let i=0;i<7;i++){
        const s=320-i*40, rot=i*15;
        shapes+=`<rect transform="rotate(${rot} 400 400)" x="${400-s/2}" y="${400-s/2}" width="${s}" height="${s}" rx="${6+i*3}" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
      }
      // Corner circles
      [[150,150],[650,150],[150,650],[650,650]].forEach(([cx,cy])=>{
        shapes+=`<circle cx="${cx}" cy="${cy}" r="100" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
        shapes+=`<circle cx="${cx}" cy="${cy}" r="55" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
        shapes+=`<circle cx="${cx}" cy="${cy}" r="22" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
      });
      // Cross bars
      shapes+=`<line x1="0" y1="400" x2="800" y2="400" stroke="#000" stroke-width="2.5"/>`;
      shapes+=`<line x1="400" y1="0" x2="400" y2="800" stroke="#000" stroke-width="2.5"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#fff"/>${shapes}</svg>`;
    },

    // ── 5 · Hexagon grid ────────────────────────────────────────
    () => {
      const R=52, W=R*2, H=Math.sqrt(3)*R;
      let hexes='';
      const hexPath=(cx,cy,r)=>{
        const pts=Array.from({length:6},(_,i)=>{
          const a=(i*60-30)*Math.PI/180;
          return `${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`;
        });
        return `<polygon points="${pts.join(' ')}" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
      };
      for(let row=-1;row<10;row++){
        const cols = 10;
        for(let col=-1;col<cols;col++){
          const cx=col*W*0.75+(row%2===0?0:W*0.375);
          const cy=row*H*0.5+H*0.5;
          if(cx>-R && cx<800+R && cy>-R && cy<800+R){
            hexes+=hexPath(cx, cy, R-3);
            // inner hex
            hexes+=hexPath(cx, cy, R*0.45);
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#fff"/>${hexes}</svg>`;
    },
  ];

  // ── DOM helpers ──────────────────────────────────────────────
  function $id(id) { return document.getElementById(id); }

  // ── Render SVG onto canvas ───────────────────────────────────
  function renderPage(page) {
    return new Promise(resolve => {
      const svgStr = PATTERNS[page]();
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        history = [];
        pushHistory();
        updateUndoBtn();
        updatePageLabel();
        resolve();
      };
      img.src = url;
    });
  }

  // ── History / Undo ───────────────────────────────────────────
  function pushHistory() {
    if (history.length >= 40) history.shift();
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  function undo() {
    if (history.length <= 1) return;
    history.pop();
    ctx.putImageData(history[history.length - 1], 0, 0);
    updateUndoBtn();
  }

  function updateUndoBtn() {
    const btn = $id('clr-undo-btn');
    if (btn) btn.disabled = history.length <= 1;
  }

  // ── Flood fill ───────────────────────────────────────────────
  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#',''), 16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }

  function colorsMatch(data, pos, [tr,tg,tb]) {
    return (
      Math.abs(data[pos]   - tr) <= TOLERANCE &&
      Math.abs(data[pos+1] - tg) <= TOLERANCE &&
      Math.abs(data[pos+2] - tb) <= TOLERANCE &&
      data[pos+3] > 20
    );
  }

  function floodFill(startX, startY, fillColor) {
    if (filling) return;
    filling = true;

    const W = canvas.width, H = canvas.height;
    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;

    const startPos = (startY * W + startX) * 4;
    const targetRGB = [data[startPos], data[startPos+1], data[startPos+2]];
    const fillRGB   = hexToRgb(fillColor);

    // Don't fill if clicking on a black stroke region
    if (targetRGB[0] < 60 && targetRGB[1] < 60 && targetRGB[2] < 60) {
      filling = false;
      return;
    }

    // Don't fill if already this colour
    if (
      Math.abs(targetRGB[0] - fillRGB[0]) <= 5 &&
      Math.abs(targetRGB[1] - fillRGB[1]) <= 5 &&
      Math.abs(targetRGB[2] - fillRGB[2]) <= 5
    ) { filling = false; return; }

    const [fr,fg,fb] = fillRGB;
    const stack = [startX + startY * W];
    const visited = new Uint8Array(W * H);
    visited[startX + startY * W] = 1;

    while (stack.length) {
      const idx = stack.pop();
      const x = idx % W, y = (idx / W) | 0;
      const pos = idx * 4;

      data[pos]   = fr;
      data[pos+1] = fg;
      data[pos+2] = fb;
      data[pos+3] = 255;

      const neighbours = [
        idx - 1, idx + 1, idx - W, idx + W
      ];
      for (const n of neighbours) {
        if (n < 0 || n >= W * H) continue;
        const nx = n % W, ny = (n / W) | 0;
        if (visited[n]) continue;
        // Stay in bounds and don't cross stroke
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        visited[n] = 1;
        if (colorsMatch(data, n * 4, targetRGB)) {
          stack.push(n);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    pushHistory();
    updateUndoBtn();
    filling = false;
  }

  // ── Canvas click → fill ──────────────────────────────────────
  function onCanvasClick(e) {
    if (filling) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top)  * scaleY);
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
    floodFill(x, y, selectedColor);
  }

  // ── Colour palette UI ────────────────────────────────────────
  function buildPalette() {
    const container = $id('clr-palette');
    if (!container) return;
    container.innerHTML = '';
    PALETTE.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'clr-color-btn' + (color === selectedColor ? ' active' : '');
      btn.style.background = color;
      btn.title = color;
      btn.addEventListener('click', () => {
        selectedColor = color;
        container.querySelectorAll('.clr-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      container.appendChild(btn);
    });
  }

  // Custom colour picker
  function setupCustomColor() {
    const picker = $id('clr-custom-color');
    if (!picker) return;
    picker.addEventListener('input', () => {
      selectedColor = picker.value;
      const btns = document.querySelectorAll('.clr-color-btn');
      btns.forEach(b => b.classList.remove('active'));
    });
  }

  // ── Page navigation ──────────────────────────────────────────
  function updatePageLabel() {
    const el = $id('clr-page-label');
    if (el) el.textContent = `${currentPage + 1} / ${PATTERNS.length}`;
  }

  async function goPage(delta) {
    const next = (currentPage + delta + PATTERNS.length) % PATTERNS.length;
    currentPage = next;
    await renderPage(currentPage);
  }

  // ── Clear page ───────────────────────────────────────────────
  function clearPage() {
    renderPage(currentPage);
  }

  // ── Download ─────────────────────────────────────────────────
  function downloadImage() {
    const link = document.createElement('a');
    link.download = `colouring-page-${currentPage + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // ── Resize canvas to its CSS display size ────────────────────
  function resizeCanvas() {
    if (!canvas) return;
    const saved = history.length ? history[history.length - 1] : null;

    // Use the parent container size
    const container = $id('clr-canvas-wrap');
    if (!container) return;
    const size = Math.min(container.clientWidth, container.clientHeight, 700);

    if (canvas.width === size && canvas.height === size) return;
    canvas.width  = size;
    canvas.height = size;

    if (saved) {
      // Re-render the SVG cleanly (history cleared — that's fine on resize)
      renderPage(currentPage);
    }
  }

  let _resizeTimer = null;
  function onResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(resizeCanvas, 120);
  }

  // ── Init / destroy ───────────────────────────────────────────
  function init() {
    destroyed = false;
    filling   = false;
    history   = [];

    canvas = $id('clr-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Size canvas
    const container = $id('clr-canvas-wrap');
    const size = Math.min(container?.clientWidth ?? 600, container?.clientHeight ?? 600, 700);
    canvas.width  = size;
    canvas.height = size;

    // Wire events
    canvas.addEventListener('click', onCanvasClick);
    window.addEventListener('resize', onResize);

    buildPalette();
    setupCustomColor();
    renderPage(currentPage);
  }

  function destroy() {
    destroyed = true;
    filling   = false;
    if (canvas) canvas.removeEventListener('click', onCanvasClick);
    window.removeEventListener('resize', onResize);
    clearTimeout(_resizeTimer);
    history = [];
  }

  // ── Expose page/clear/undo/download as window helpers ────────
  // (called from inline HTML onclick attributes)
  window._CLR_prevPage   = () => goPage(-1);
  window._CLR_nextPage   = () => goPage(1);
  window._CLR_undo       = () => undo();
  window._CLR_clear      = () => clearPage();
  window._CLR_download   = () => downloadImage();

  return { init, destroy };
})();
