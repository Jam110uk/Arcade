// PAC game module — Three.js 3D renderer
// Game logic (movement, AI, collisions, sounds, HS) unchanged from 2D version.
// Rendering layer fully replaced with Three.js r128 top-down 3D scene.

export default (function () {
  'use strict';

  // ── Three.js loader ───────────────────────────────────────
  // Dynamically inject the script if not already present, then init.
  function loadThree(cb) {
    if (window.THREE) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  // ── Maze definitions (28×31) ──────────────────────────────
  const COLS = 28, ROWS = 31;

  const MAZE_CLASSIC = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,3,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,3,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
    [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,4,4,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [0,0,0,0,0,0,2,0,0,0,1,0,0,0,0,0,0,1,0,0,0,2,0,0,0,0,0,0],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,3,2,2,1,1,2,2,2,2,2,2,2,0,0,2,2,2,2,2,2,2,1,1,2,2,3,1],
    [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
    [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
    [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  const MAZE_GRID = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
    [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
    [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,2,1,1,2,1,1,1,1,2,1,1,1,1,2,1,1,1,1,2,1,1,2,1,1,1],
    [1,1,1,2,1,1,2,1,1,1,1,2,1,1,1,1,2,1,1,1,1,2,1,1,2,1,1,1],
    [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,4,4,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [0,0,0,0,0,0,2,0,0,0,1,0,0,0,0,0,0,1,0,0,0,2,0,0,0,0,0,0],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,2,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,2,1,1,1,2,1],
    [1,2,1,1,1,2,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,2,1,1,1,2,1],
    [1,3,2,2,2,2,2,2,2,2,2,2,2,0,0,2,2,2,2,2,2,2,2,2,2,2,3,1],
    [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
    [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
    [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
    [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  const MAZE_COMB = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,2,1,1,1,2,1,1,2,1,1,2,1,1,2,1,1,1,2,1,1,1,2,1],
    [1,3,1,1,1,2,1,1,1,2,1,1,2,1,1,2,1,1,2,1,1,1,2,1,1,1,3,1],
    [1,2,1,1,1,2,1,1,1,2,1,1,2,1,1,2,1,1,2,1,1,1,2,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,2,1,2,1,2,1,2,1,1,1,1,2,1,2,1,2,1,2,1,1,1,2,1],
    [1,2,1,1,1,2,1,2,1,2,1,2,1,1,1,1,2,1,2,1,2,1,2,1,1,1,2,1],
    [1,2,2,2,2,2,1,2,2,2,1,2,2,1,1,2,2,1,2,2,2,1,2,2,2,2,2,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,4,4,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [0,0,0,0,0,0,2,0,0,0,1,0,0,0,0,0,0,1,0,0,0,2,0,0,0,0,0,0],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,2,1,1,1,2,1,1,2,1,2,1,1,2,1,2,1,1,2,1,1,1,2,1,2,1],
    [1,2,1,2,1,1,1,2,1,1,2,1,2,1,1,2,1,2,1,1,2,1,1,1,2,1,2,1],
    [1,3,2,2,2,2,2,2,2,2,2,2,2,0,0,2,2,2,2,2,2,2,2,2,2,2,3,1],
    [1,1,1,2,1,1,2,1,2,2,1,1,1,1,1,1,1,1,2,2,1,2,1,1,2,1,1,1],
    [1,1,1,2,1,1,2,1,2,2,1,1,1,1,1,1,1,1,2,2,1,2,1,1,2,1,1,1],
    [1,2,2,2,2,2,2,1,2,2,2,2,2,1,1,2,2,2,2,2,2,1,2,2,2,2,2,1],
    [1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1],
    [1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  const MAZE_FORTRESS = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,3,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,3,1],
    [1,2,1,1,2,2,2,2,2,2,2,1,2,1,1,2,1,2,2,2,2,2,2,2,1,1,2,1],
    [1,2,2,2,2,1,1,1,1,1,2,2,2,2,2,2,2,2,1,1,1,1,1,2,2,2,2,1],
    [1,2,1,1,2,1,2,2,2,1,2,1,1,1,1,1,1,2,1,2,2,2,1,2,1,1,2,1],
    [1,2,1,1,2,1,2,1,2,1,2,1,1,1,1,1,1,2,1,2,1,2,1,2,1,1,2,1],
    [1,2,2,2,2,1,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,1,2,2,2,2,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,4,4,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [0,0,0,0,0,0,2,0,0,0,1,0,0,0,0,0,0,1,0,0,0,2,0,0,0,0,0,0],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,1,2,2,1,1,2,2,1,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,2,1,2,1,1,1,1,2,1,2,1,1,2,1,1,1,1,2,1],
    [1,2,1,1,1,1,2,1,1,2,1,2,1,1,1,1,2,1,2,1,1,2,1,1,1,1,2,1],
    [1,3,2,2,2,2,2,2,2,2,1,2,2,0,0,2,2,1,2,2,2,2,2,2,2,2,3,1],
    [1,1,1,2,1,2,1,1,1,2,1,1,1,1,1,1,1,1,2,1,1,1,2,1,2,1,1,1],
    [1,1,1,2,1,2,1,1,1,2,1,1,1,1,1,1,1,1,2,1,1,1,2,1,2,1,1,1],
    [1,2,2,2,1,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,1,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];

  const ALL_MAZES = [MAZE_CLASSIC, MAZE_GRID, MAZE_COMB, MAZE_FORTRESS];
  let currentMazeIdx = 0;

  function pickMaze(lvl) {
    if (lvl === 1) return 0;
    let idx;
    do { idx = Math.floor(Math.random() * ALL_MAZES.length); } while (idx === currentMazeIdx);
    return idx;
  }

  // ── Game constants ────────────────────────────────────────
  const TILE    = 18;
  const PAC_R   = TILE * 0.42;
  const GHOST_R = TILE * 0.44;
  const GHOST_COLORS_HEX = [0xff2222, 0xffb8ff, 0x00ffff, 0xffb852];
  const GHOST_COLORS_STR = ['#ff2222','#ffb8ff','#00ffff','#ffb852'];

  const SCARED_DURATION  = 8000;
  const SCARED_FLASH_AT  = 2000;
  const GHOST_BASE_SPEED = 0.08;
  const PAC_BASE_SPEED   = 0.10;
  const DOT_SCORE    = 10;
  const PELLET_SCORE = 50;
  const GHOST_SCORES = [200,400,800,1600];
  const TURN_WINDOW  = TILE * 0.55;

  // ── Web Audio ─────────────────────────────────────────────
  let _ac = null;
  function getAC() {
    if (!_ac) { try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }
    if (_ac && _ac.state === 'suspended') _ac.resume().catch(()=>{});
    return _ac;
  }
  function playNotes(notes, delay = 0) {
    const a = getAC(); if (!a) return;
    let t = a.currentTime + delay + 0.01;
    for (const n of notes) {
      const o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = n.type || 'square';
      o.frequency.setValueAtTime(n.freq, t);
      if (n.slide) o.frequency.linearRampToValueAtTime(n.slide, t + n.dur);
      g.gain.setValueAtTime(n.vol ?? 0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
      o.start(t); o.stop(t + n.dur + 0.02);
      t += n.dur;
    }
  }
  let _wakaPhase = 0;
  function sfxWaka() {
    const [a,b] = _wakaPhase ? [440,300] : [300,440]; _wakaPhase ^= 1;
    playNotes([{freq:a,slide:b,dur:0.07,type:'square',vol:0.13}]);
  }
  function sfxPowerPellet() {
    playNotes([{freq:220,dur:0.055,vol:0.20},{freq:330,dur:0.055,vol:0.20},
               {freq:440,dur:0.055,vol:0.20},{freq:550,dur:0.10,vol:0.25}]);
  }
  function sfxEatGhost() {
    playNotes([{freq:600,dur:0.04,vol:0.20},{freq:800,dur:0.04,vol:0.20},
               {freq:1000,dur:0.04,vol:0.20},{freq:1200,dur:0.08,vol:0.25}]);
  }
  function sfxDeath() {
    const ns=[]; let f=640;
    for(let i=0;i<14;i++){ns.push({freq:f,dur:0.075,vol:0.22});f*=0.88;}
    playNotes(ns);
  }
  function sfxLevelUp() {
    playNotes([{freq:523,dur:0.08,vol:0.20},{freq:659,dur:0.08,vol:0.20},
               {freq:784,dur:0.08,vol:0.20},{freq:1047,dur:0.16,vol:0.25}]);
  }
  function sfxIntro() {
    playNotes([{freq:494,dur:0.10,vol:0.20},{freq:494,dur:0.10,vol:0.20},
               {freq:494,dur:0.10,vol:0.20},{freq:392,dur:0.15,vol:0.20},
               {freq:494,dur:0.10,vol:0.22},{freq:587,dur:0.25,vol:0.25},
               {freq:294,dur:0.25,vol:0.20}]);
  }
  let _scaredTimer=null, _scaredPhase=0;
  function startScaredSfx(){
    stopScaredSfx(); _scaredPhase=0;
    _scaredTimer=setInterval(()=>{
      playNotes([{freq:_scaredPhase?160:130,dur:0.10,type:'square',vol:0.07}]);
      _scaredPhase^=1;
    },130);
  }
  function stopScaredSfx(){if(_scaredTimer){clearInterval(_scaredTimer);_scaredTimer=null;}}

  // ── Game state ────────────────────────────────────────────
  let map, score, highScore=parseInt(localStorage.getItem('hs-pb-pacman')||'0',10), level, lives;
  let totalDots, dotsEaten;
  let paused=false, gameRunning=false;
  let ghostEatenCount=0, levelTransition=false;
  let pac={}, ghosts=[], scaredEnd=0;
  const floaters=[];
  let raf=null, lastTime=0;

  // DOM refs
  let elPacOverlay,elPacOvTitle,elPacOvSub,elPacOvScore;
  let elPacScore,elPacHigh,elPacLevel,elPacLives,elPacPauseBtn;

  // ── Three.js scene state ──────────────────────────────────
  let THREE_LIB = null;
  let threeCanvas, renderer, scene, camera;
  let wallMeshes=[], dotMeshes={}, pelletMeshes={};
  let pacMesh, pacBodyMesh, pacTopMesh;
  let ghostMeshes=[];
  let particleSystems=[];
  let floorMesh, floorGrid;
  let _levelFlash=false;

  // 3D coordinate helpers
  // Map pixel coords (pac.x, pac.y) → Three.js world coords
  // Pac game: x increases right, y increases down
  // Three.js: x right, z forward (down in top-down), y up
  const S = 1/TILE; // scale: 1 unit = 1 tile
  function worldX(px) { return px * S - COLS/2; }
  function worldZ(py) { return py * S - ROWS/2; }
  function tileWorldX(col) { return (col + 0.5) - COLS/2; }
  function tileWorldZ(row) { return (row + 0.5) - ROWS/2; }

  // ── Build Three.js scene ──────────────────────────────────
  function buildScene() {
    const T = THREE_LIB;

    // Replace the existing pac-canvas with a brand-new element.
    // A canvas that already has a '2d' context (from a prior session) will
    // silently fail WebGL context creation. Replacing the node guarantees a clean slate.
    const oldCanvas = document.getElementById('pac-canvas');
    threeCanvas = document.createElement('canvas');
    threeCanvas.id = 'pac-canvas';
    threeCanvas.width  = COLS * TILE;   // initial size, resize() will correct
    threeCanvas.height = ROWS * TILE;
    if (oldCanvas && oldCanvas.parentNode) {
      oldCanvas.parentNode.replaceChild(threeCanvas, oldCanvas);
    } else {
      const wrap = document.querySelector('.pac-canvas-wrap');
      if (wrap) wrap.appendChild(threeCanvas);
    }
    renderer = new T.WebGLRenderer({ canvas: threeCanvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.setSize(COLS * TILE, ROWS * TILE); // resize() corrects this after build
    renderer.setClearColor(0x000005);

    scene = new T.Scene();
    // No fog — full maze must be visible at all times

    // ── Follow camera — fixed tilt, scrolls in XZ only ──────────
    // FOV 52°, positioned 16 up + 7 back from pac centre.
    // The camera NEVER rotates — only XZ position changes per frame.
    // Initial lookAt sets the permanent tilt angle.
    camera = new T.PerspectiveCamera(52, COLS / ROWS, 0.1, 300);
    camera.position.set(0, 16, 7);
    // Point camera at a spot ~7 units in front of and below its position
    // This gives ~66° down-angle — dramatic but clearly shows wall depth
    camera.lookAt(0, 0, 0);

    // Controlled lighting for MeshStandardMaterial with slight tilt camera.
    // Ambient keeps corridors visible; key light from slightly above-front
    // so wall top faces are bright, front faces are mid, giving clear 3D depth.
    const ambient = new T.AmbientLight(0x112244, 2.5);
    scene.add(ambient);
    const key = new T.DirectionalLight(0xffffff, 1.2);
    key.position.set(0, 10, 8);  // from slightly above and in front
    scene.add(key);
    const rim = new T.DirectionalLight(0x2233ff, 0.4);
    rim.position.set(0, 5, -10); // blue rim from behind
    scene.add(rim);

    const floorGeo = new T.PlaneGeometry(COLS + 2, ROWS + 2);
    const floorMat = new T.MeshStandardMaterial({ color: 0x000008, roughness: 1, metalness: 0 });
    floorMesh = new T.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI/2;
    scene.add(floorMesh);

    buildMazeGeometry();
    buildDots();
    buildPacMesh();
    buildGhostMeshes();
    addPointLights();
  }

  function buildMazeGeometry() {
    const T = THREE_LIB;
    // Remove old walls
    wallMeshes.forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    wallMeshes = [];

    const wallMat = new T.MeshStandardMaterial({ color: 0x1a3fff, roughness: 0.6, metalness: 0.1,
      emissive: 0x050a44, emissiveIntensity: 1.0 });
    const doorMat = new T.MeshStandardMaterial({ color: 0xff88ff, roughness: 0.5, metalness: 0,
      emissive: 0x330033, emissiveIntensity: 0.5 });

    const curMap = ALL_MAZES[currentMazeIdx];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = curMap[row][col];
        if (cell === 1 || cell === 4) {
          const geo = new T.BoxGeometry(1, cell===4?0.12:1.1, cell===4?0.08:1);
          const mat = cell===4 ? doorMat : wallMat;
          const mesh = new T.Mesh(geo, mat);
          mesh.position.set(tileWorldX(col), cell===4?0.06:0.55, tileWorldZ(row));
          scene.add(mesh);
          wallMeshes.push(mesh);
        }
      }
    }
  }

  function buildDots() {
    const T = THREE_LIB;
    // Remove old dots
    // Remove from scene and dispose shared geo/mat once
    const dotVals = Object.values(dotMeshes);
    const pelVals = Object.values(pelletMeshes);
    dotVals.forEach(m => scene.remove(m));
    pelVals.forEach(m => scene.remove(m));
    if (dotVals.length)  { dotVals[0].geometry.dispose(); dotVals[0].material.dispose(); }
    if (pelVals.length)  { pelVals[0].geometry.dispose(); pelVals[0].material.dispose(); }
    dotMeshes={}; pelletMeshes={};

    const dotGeo = new T.SphereGeometry(0.16, 8, 8);
    const dotMat = new T.MeshStandardMaterial({ color: 0xffd090,
      emissive: 0xff6600, emissiveIntensity: 0.9, roughness: 0.4 });
    const pelGeo = new T.SphereGeometry(0.32, 12, 12);
    const pelMat = new T.MeshStandardMaterial({ color: 0xffee00,
      emissive: 0xff9900, emissiveIntensity: 1.5, roughness: 0.2 });

    for (let row=0; row<ROWS; row++) {
      for (let col=0; col<COLS; col++) {
        const cell = map[row][col];
        if (cell === 2) {
          const m = new T.Mesh(dotGeo, dotMat);
          m.position.set(tileWorldX(col), 0.18, tileWorldZ(row));
          scene.add(m);
          dotMeshes[`${col},${row}`] = m;
        } else if (cell === 3) {
          const m = new T.Mesh(pelGeo, pelMat);
          m.position.set(tileWorldX(col), 0.36, tileWorldZ(row));
          scene.add(m);
          pelletMeshes[`${col},${row}`] = m;
        }
      }
    }
  }

  // Pac-Man: a flattened sphere body that opens/closes like a jaw
  function buildPacMesh() {
    const T = THREE_LIB;
    if (pacMesh) { scene.remove(pacMesh); }

    pacMesh = new T.Group();
    const R = 0.46;

    const pacMat = new T.MeshStandardMaterial({
      color: 0xffe600, emissive: 0xcc7700, emissiveIntensity: 0.55,
      roughness: 0.3, metalness: 0.05,
    });

    // ── Upper jaw: top hemisphere, pivots upward when mouth opens ──
    const upperGeo = new T.SphereGeometry(R, 32, 16, 0, Math.PI*2, 0, Math.PI/2);
    pacBodyMesh = new T.Mesh(upperGeo, pacMat);
    pacMesh.add(pacBodyMesh);

    // ── Lower jaw: bottom hemisphere, pivots downward when mouth opens ──
    const lowerGeo = new T.SphereGeometry(R, 32, 16, 0, Math.PI*2, Math.PI/2, Math.PI/2);
    const lowerJaw = new T.Mesh(lowerGeo, pacMat);
    pacMesh.add(lowerJaw);
    pacMesh.userData.lowerJaw = lowerJaw;

    // Flat discs sealing the back of each jaw so no gap shows
    const discGeo = new T.CircleGeometry(R, 32);
    const upperDisc = new T.Mesh(discGeo, pacMat);
    upperDisc.rotation.x = Math.PI / 2;
    upperDisc.position.y = 0.005;
    pacMesh.add(upperDisc);
    const lowerDisc = new T.Mesh(discGeo, pacMat);
    lowerDisc.rotation.x = -Math.PI / 2;
    lowerDisc.position.y = -0.005;
    pacMesh.add(lowerDisc);
    pacMesh.userData.upperDisc = upperDisc;
    pacMesh.userData.lowerDisc = lowerDisc;

    // ── Two eyes on the front-upper face ─────────────────────────
    const eyeMat = new T.MeshStandardMaterial({ color: 0x111111, roughness: 1 });
    const eyeGeo = new T.SphereGeometry(0.065, 10, 10);

    const eyeL = new T.Mesh(eyeGeo, eyeMat); // left eye
    eyeL.position.set(-0.17, R * 0.52, -R * 0.74);
    pacMesh.add(eyeL);

    const eyeR = new T.Mesh(eyeGeo, eyeMat); // right eye
    eyeR.position.set( 0.17, R * 0.52, -R * 0.74);
    pacMesh.add(eyeR);

    // Slightly flatten pac vertically so it looks like a disc from the tilted camera
    pacMesh.scale.y = 0.72;
    pacMesh.userData.light = null;
    pacMesh.position.set(worldX(pac.x), 0.28, worldZ(pac.y));
    scene.add(pacMesh);
  }

  const GHOST_HEX = [0xff2222, 0xffb8ff, 0x00ffff, 0xffb852];
  const GHOST_EMI = [0x660000, 0x660033, 0x003333, 0x664400];

  function buildGhostMeshes() {
    const T = THREE_LIB;
    ghostMeshes.forEach(g => { scene.remove(g.group); });
    ghostMeshes = [];

    for (let i=0; i<4; i++) {
      const group = new T.Group();

      // Body — capsule-like: sphere top + cylinder bottom
      const topGeo = new T.SphereGeometry(0.42, 20, 12, 0, Math.PI*2, 0, Math.PI/2);
      const bodyMat = new T.MeshStandardMaterial({ color: GHOST_HEX[i],
        emissive: GHOST_EMI[i], emissiveIntensity: 0.8, roughness: 0.4, metalness: 0 });
      const top = new T.Mesh(topGeo, bodyMat);
      top.position.y = 0.28;
      group.add(top);

      const cylGeo = new T.CylinderGeometry(0.42, 0.42, 0.56, 20);
      const cyl = new T.Mesh(cylGeo, bodyMat);
      cyl.position.y = 0.0;
      group.add(cyl);

      // Wavy skirt — 4 half-spheres at the base
      for (let j=0; j<4; j++) {
        const skGeo = new T.SphereGeometry(0.18, 8, 8, 0, Math.PI*2, Math.PI/2, Math.PI/2);
        const sk = new T.Mesh(skGeo, bodyMat);
        const angle = (j/4)*Math.PI*2;
        sk.position.set(Math.cos(angle)*0.28, -0.28, Math.sin(angle)*0.28);
        group.add(sk);
      }

      // Eyes (whites + pupils)
      for (let side=0; side<2; side++) {
        const wx = side===0 ? -0.16 : 0.16;
        const wGeo = new T.SphereGeometry(0.10, 10, 10);
        const wMat = new T.MeshStandardMaterial({ color:0xffffff, emissive:0xaaaaaa, emissiveIntensity:0.5 });
        const white = new T.Mesh(wGeo, wMat);
        white.position.set(wx, 0.32, -0.33);
        group.add(white);

        const pGeo = new T.SphereGeometry(0.055, 8, 8);
        const pMat = new T.MeshStandardMaterial({ color:0x1111ff, emissive:0x0000cc, emissiveIntensity:0.5 });
        const pupil = new T.Mesh(pGeo, pMat);
        pupil.position.set(wx, 0.32, -0.38);
        group.add(pupil);
      }

      group.userData = { light: null, bodyMat, idx: i };

      const g = ghosts[i] || { x:0, y:0 };
      group.position.set(worldX(g.x), 0.28, worldZ(g.y));
      scene.add(group);
      ghostMeshes.push({ group, bodyMat, light: null, idx: i });
    }
  }

  function addPointLights() { /* removed — using MeshBasicMaterial, no lights needed */ }

  // ── Update 3D scene from game state ──────────────────────
  function update3D(now) {
    const T = THREE_LIB; if (!T) return;

    // Pac-Man position & rotation
    if (pacMesh) {
      pacMesh.position.x = worldX(pac.x);
      pacMesh.position.z = worldZ(pac.y);

      // ── Follow camera — pure XZ scroll, fixed tilt, no rotation ──
      // Camera keeps a fixed offset above+behind pac in world space.
      // Only X and Z translate to follow pac; Y and rotation never change.
      const px = worldX(pac.x);
      const pz = worldZ(pac.y);
      // Fixed offset: 16 units up, 7 units back (south) for the tilt look
      const targetX = px;
      const targetY = 16;
      const targetZ = pz + 7;
      // Smooth lerp — fast enough to feel responsive
      const lp = 0.12;
      camera.position.x += (targetX - camera.position.x) * lp;
      camera.position.y += (targetY - camera.position.y) * lp;
      camera.position.z += (targetZ - camera.position.z) * lp;
      // lookAt is called ONCE at buildScene and never again — camera doesn't rotate

      // Face direction of travel
      if (pac.dx === 1)       pacMesh.rotation.y = -Math.PI/2;
      else if (pac.dx === -1) pacMesh.rotation.y =  Math.PI/2;
      else if (pac.dy === -1) pacMesh.rotation.y =  0;
      else if (pac.dy === 1)  pacMesh.rotation.y =  Math.PI;

      // Mouth: rotate upper and lower jaws open/closed
      if (!pac.dead) {
        // mouthAngle goes 0→0.35 (open) and back — map to jaw rotation angle
        const jawAngle = pac.mouthAngle * 0.55; // radians each jaw rotates
        if (pacBodyMesh) pacBodyMesh.rotation.x = -jawAngle;  // upper jaw tilts up
        const lj = pacMesh.userData.lowerJaw;
        if (lj) lj.rotation.x = jawAngle;                     // lower jaw tilts down
        // Move sealing discs with their jaws
        const ud = pacMesh.userData.upperDisc;
        const ld = pacMesh.userData.lowerDisc;
        if (ud) { ud.rotation.x = Math.PI/2 - jawAngle; }
        if (ld) { ld.rotation.x = -(Math.PI/2 - jawAngle); }
        pacMesh.position.y = 0.28;
      } else {
        // Death: flatten and spin
        pacMesh.position.y = Math.max(0, 0.28 * (1 - pac.deathAnim));
        pacMesh.rotation.y = pac.deathAnim * Math.PI * 3;
        if (pacBodyMesh) {
          const s = 1 - pac.deathAnim * 0.95;
          pacBodyMesh.scale.set(1, Math.max(0.01, s), 1);
          if (pacMesh.userData.lowerJaw) pacMesh.userData.lowerJaw.scale.set(1, Math.max(0.01, s), 1);
        }
      }


    }

    // Ghosts
    for (let i=0; i<4; i++) {
      const g = ghosts[i]; if (!g) continue;
      const gm = ghostMeshes[i]; if (!gm) continue;
      const group = gm.group;

      group.position.x = worldX(g.x);
      group.position.z = worldZ(g.y);

      if (g.inHouse) {
        group.position.y = 0.22;
      } else {
        group.position.y = 0.22;
      }

      // Wavy skirt: rotate slowly
      group.rotation.y = now * 0.002 * (i%2===0?1:-1);

      // Update colour for scared/flashing state
      const scared = now < scaredEnd;
      const flashing = scared && (scaredEnd - now) < SCARED_FLASH_AT;
      let bodyColor, emiColor, lightColor;

      if (g.eaten) {
        // Eyes only — hide body
        group.visible = true;
        group.children.forEach((child, ci) => {
          // show only eyes (children 4-7 = whites+pupils)
          child.visible = ci >= 4;
        });
        if (gm.light) gm.light.intensity = 0;
        continue;
      } else {
        group.children.forEach(child => { child.visible = true; });
      }

      if (g.scared) {
        if (flashing) {
          const flash = Math.sin(now/150) > 0;
          bodyColor = flash ? 0xffffff : 0x2121de;
          emiColor  = flash ? 0x666666 : 0x000044;
          lightColor = flash ? 0xffffff : 0x0000ff;
        } else {
          bodyColor = 0x2121de; emiColor = 0x000044; lightColor = 0x0000ff;
        }
      } else {
        bodyColor = GHOST_HEX[i]; emiColor = GHOST_EMI[i]; lightColor = GHOST_HEX[i];
      }

      if (gm.bodyMat) {
        gm.bodyMat.color.setHex(bodyColor);
        if (gm.bodyMat.emissive) gm.bodyMat.emissive.setHex(emiColor);
      }
    }

    // Dots — remove eaten ones from scene
    for (const key in dotMeshes) {
      const [c,r] = key.split(',').map(Number);
      if (map[r] && map[r][c] === 0) {
        scene.remove(dotMeshes[key]);
        // Don't dispose geometry/material — they are shared across all dots
        delete dotMeshes[key];
      }
    }
    for (const key in pelletMeshes) {
      const [c,r] = key.split(',').map(Number);
      if (map[r] && map[r][c] === 0) {
        scene.remove(pelletMeshes[key]);
        // Don't dispose shared material/geometry here
        delete pelletMeshes[key];
      }
    }

    // Pulse pellets
    for (const key in pelletMeshes) {
      const pm = pelletMeshes[key];
      const pulse = 0.85 + 0.15 * Math.sin(now/250);
      pm.scale.setScalar(pulse);
      pm.position.y = 0.32;
    }

    // Floating score text (handled on overlay canvas, see drawFloaters2D)
    updateParticles(now);

    // Level flash — tint walls
    if (levelTransition) {
      const fl = Math.floor(now/220)%2===0;
      wallMeshes.forEach(m => {
        m.material.color.setHex(fl ? 0xffffff : 0x1a3fff);
        if (m.material.emissive) m.material.emissive.setHex(fl ? 0x888888 : 0x050a44);
      });
    }
  }

  // ── Particle system for eat-ghost / death effects ─────────
  function spawnParticles(x, y, color, count=16, speed=0.04) {
    const T = THREE_LIB; if (!T) return;
    const particles = [];
    for (let i=0; i<count; i++) {
      const geo = new T.SphereGeometry(0.07, 4, 4);
      const mat = new T.MeshBasicMaterial({ color });
      const m = new T.Mesh(geo, mat);
      const angle = (i/count)*Math.PI*2 + Math.random()*0.3;
      const elev  = Math.random()*0.08;
      m.position.set(worldX(x), 0.5, worldZ(y));
      m.userData.vx = Math.cos(angle)*speed*(0.5+Math.random());
      m.userData.vy = 0.06 + elev;
      m.userData.vz = Math.sin(angle)*speed*(0.5+Math.random());
      m.userData.life = 1.0;
      scene.add(m);
      particles.push(m);
    }
    particleSystems.push({ particles, born: performance.now() });
  }

  function updateParticles(now) {
    for (let si = particleSystems.length-1; si >= 0; si--) {
      const ps = particleSystems[si];
      let alive = false;
      for (const p of ps.particles) {
        p.userData.life -= 0.025;
        if (p.userData.life <= 0) { scene.remove(p); continue; }
        alive = true;
        p.position.x += p.userData.vx;
        p.position.y += p.userData.vy;
        p.position.z += p.userData.vz;
        p.userData.vy -= 0.004; // gravity
        p.material.opacity = p.userData.life;
        p.scale.setScalar(p.userData.life);
      }
      if (!alive) { particleSystems.splice(si,1); }
    }
  }

  // ── 2D overlay canvas for HUD floaters ───────────────────
  // We keep a small 2D canvas overlay just for floating score text
  let overlayCanvas, overlayCtx;
  function buildOverlayCanvas() {
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.width  = COLS * TILE;
    overlayCanvas.height = ROWS * TILE;
    // Actual display size set by resize()
    Object.assign(overlayCanvas.style, {
      position:'absolute', top:'0', left:'0', width:'100%', height:'100%',
      pointerEvents:'none', zIndex:'2',
    });
    const wrap = document.querySelector('.pac-canvas-wrap');
    if (wrap) wrap.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext('2d');
  }
  function drawFloaters2D() {
    if (!overlayCtx) return;
    overlayCtx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
    overlayCtx.font = 'bold 13px Orbitron, monospace';
    overlayCtx.textAlign = 'center';
    for (let i=floaters.length-1; i>=0; i--) {
      const f = floaters[i];
      overlayCtx.globalAlpha = f.life;
      overlayCtx.fillStyle = '#ffe600';
      overlayCtx.fillText(f.pts, f.x, f.y);
      f.y -= 0.5; f.life -= 0.018;
      if (f.life<=0){floaters[i]=floaters[floaters.length-1];floaters.pop();}
    }
    overlayCtx.globalAlpha = 1;

    // Power bar
    if (performance.now() < scaredEnd) {
      const pct = (scaredEnd - performance.now()) / SCARED_DURATION;
      const w = COLS * TILE;
      overlayCtx.fillStyle = 'rgba(0,0,0,0.5)';
      overlayCtx.fillRect(0, ROWS*TILE-6, w, 6);
      overlayCtx.fillStyle = pct < 0.25 ? '#ff4444' : '#ffe600';
      overlayCtx.fillRect(0, ROWS*TILE-6, w*pct, 6);
    }
  }

  // ── Resize ────────────────────────────────────────────────
  function resize() {
    const wrap = document.querySelector('.pac-canvas-wrap');
    if (!wrap) return;
    // Fill the full available wrap area — no arbitrary caps
    const availW = wrap.clientWidth  || window.innerWidth;
    const availH = wrap.clientHeight || window.innerHeight * 0.88;
    // Maintain maze aspect ratio (COLS:ROWS), scale to fill as much as possible
    const mazeAspect = COLS / ROWS;
    let w, h;
    if (availW / availH > mazeAspect) {
      h = availH;
      w = Math.round(h * mazeAspect);
    } else {
      w = availW;
      h = Math.round(w / mazeAspect);
    }
    if (threeCanvas) {
      threeCanvas.style.width  = w + 'px';
      threeCanvas.style.height = h + 'px';
    }
    if (overlayCanvas) {
      overlayCanvas.style.width  = w + 'px';
      overlayCanvas.style.height = h + 'px';
    }
    if (renderer) {
      // Render at actual pixel size for sharpness
      renderer.setSize(w, h);
    }
    if (camera) {
      camera.aspect = COLS / ROWS;
      camera.updateProjectionMatrix();
    }
  }

  // ── Map helpers ───────────────────────────────────────────
  function cloneMap() { return ALL_MAZES[currentMazeIdx].map(r=>[...r]); }
  function isWall(col,row) {
    if (row<0||row>=ROWS) return true;
    return map[row][((col%COLS)+COLS)%COLS]===1;
  }
  function isGhostWall(col,row) {
    if (row<0||row>=ROWS) return true;
    return map[row][((col%COLS)+COLS)%COLS]===1;
  }

  // ── Entity init ───────────────────────────────────────────
  function initPac() {
    pac = { x:14*TILE, y:23*TILE+TILE/2, dx:0, dy:0, qx:0, qy:0,
            mouthAngle:0, mouthDir:1, dead:false, deathAnim:0 };
    if (pacBodyMesh) { pacBodyMesh.scale.set(1,1,1); pacBodyMesh.rotation.x=0; }
    if (pacMesh) {
      pacMesh.rotation.set(0,0,0);
      pacMesh.position.y=0.28;
      if (pacMesh.userData.lowerJaw) { pacMesh.userData.lowerJaw.scale.set(1,1,1); pacMesh.userData.lowerJaw.rotation.x=0; }
    }
  }
  function initGhosts() {
    const sp=[{col:14,row:11},{col:13,row:14},{col:14,row:14},{col:15,row:14}];
    ghosts = sp.map((p,i)=>({
      id:i, x:p.col*TILE, y:p.row*TILE+TILE/2,
      dx:i===0?-1:0, dy:0,
      color:GHOST_COLORS_STR[i], scared:false, eaten:false,
      inHouse:i>0, leaveTimer:i*5000, wobble:0,
      tileCol:p.col, tileRow:p.row,
      targetCol:i===0?p.col-1:p.col, targetRow:p.row,
    }));
    // Reset ghost mesh visuals
    ghostMeshes.forEach(gm => {
      gm.group.children.forEach(c=>{ c.visible=true; });
      if (gm.bodyMat) {
        gm.bodyMat.color.setHex(GHOST_HEX[gm.idx]);
        if (gm.bodyMat.emissive) gm.bodyMat.emissive.setHex(GHOST_EMI[gm.idx]);
      }
    });
  }

  function countDots() {
    totalDots=0;
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++)
      if(map[r][c]===2||map[r][c]===3) totalDots++;
  }

  // ── New game / level ──────────────────────────────────────
  function newGame() {
    level=1; score=0; lives=3; currentMazeIdx=0;
    updateHUD();
    startLevel();
    sfxIntro();
  }
  function startLevel() {
    currentMazeIdx = pickMaze(level);
    map = cloneMap(); countDots();
    dotsEaten=0; scaredEnd=0; ghostEatenCount=0; levelTransition=false;
    stopScaredSfx();
    initPac(); initGhosts(); updateHUD();
    // Only rebuild 3D geometry if the scene is already fully built
    if (THREE_LIB && scene && wallMeshes !== undefined) {
      buildMazeGeometry();
      buildDots();
    }
  }

  // ── Movement helpers ──────────────────────────────────────
  function tileOf(px){return Math.floor(px/TILE);}
  function centreOf(t){return t*TILE+TILE/2;}
  function canMove(px,py,dx,dy){
    const nx=px+dx*TILE*PAC_BASE_SPEED, ny=py+dy*TILE*PAC_BASE_SPEED, r=PAC_R-2;
    return ![[nx-r,ny-r],[nx+r,ny-r],[nx-r,ny+r],[nx+r,ny+r]].some(
      ([cx,cy])=>isWall(Math.floor(cx/TILE),Math.floor(cy/TILE)));
  }
  function canTurnAt(col,row,dx,dy){
    return !isWall(((col+dx)%COLS+COLS)%COLS,row+dy);
  }

  // ── Update pac ────────────────────────────────────────────
  function updatePac(dt) {
    if (pac.dead) { pac.deathAnim=Math.min(pac.deathAnim+0.03,1); return; }
    const speed=TILE*PAC_BASE_SPEED*(dt/16);
    const hasQ=pac.qx!==0||pac.qy!==0;
    if (hasQ) {
      if (pac.qx===pac.dx&&pac.qy===pac.dy){ pac.qx=0;pac.qy=0; }
      else if (pac.qx===-pac.dx&&pac.qy===-pac.dy){ pac.dx=pac.qx;pac.dy=pac.qy;pac.qx=0;pac.qy=0; }
      else {
        const cc=tileOf(pac.x),cr=tileOf(pac.y),cx=centreOf(cc),cy=centreOf(cr);
        const offAxis=pac.qx!==0?Math.abs(pac.y-cy):Math.abs(pac.x-cx);
        if (offAxis<=TURN_WINDOW&&canTurnAt(cc,cr,pac.qx,pac.qy)){
          if(pac.qx!==0)pac.y=cy;else pac.x=cx;
          pac.dx=pac.qx;pac.dy=pac.qy;pac.qx=0;pac.qy=0;
        } else {
          const lc=cc+pac.dx,lr=cr+pac.dy;
          const lcx=centreOf(((lc%COLS)+COLS)%COLS),lcy=centreOf(lr);
          const ahead=pac.dx!==0?(pac.dx>0?lcx-pac.x:pac.x-lcx):(pac.dy>0?lcy-pac.y:pac.y-lcy);
          const wlc=((lc%COLS)+COLS)%COLS;
          if(ahead>=0&&ahead<=TURN_WINDOW&&!isWall(wlc,lr)&&canTurnAt(wlc,lr,pac.qx,pac.qy)){
            if(pac.dx!==0)pac.x=lcx;else pac.y=lcy;
            if(pac.qx!==0)pac.y=centreOf(lr);else pac.x=lcx;
            pac.dx=pac.qx;pac.dy=pac.qy;pac.qx=0;pac.qy=0;
          }
        }
      }
    }
    if(canMove(pac.x,pac.y,pac.dx,pac.dy)){pac.x+=pac.dx*speed;pac.y+=pac.dy*speed;}
    else{if(pac.dx!==0)pac.x=centreOf(tileOf(pac.x+pac.dx*0.5));if(pac.dy!==0)pac.y=centreOf(tileOf(pac.y+pac.dy*0.5));}
    if(pac.x<-TILE/2)pac.x=COLS*TILE;if(pac.x>COLS*TILE)pac.x=-TILE/2;
    if(pac.dx!==0||pac.dy!==0){
      pac.mouthAngle+=pac.mouthDir*0.12*(dt/16);
      if(pac.mouthAngle>0.35)pac.mouthDir=-1;if(pac.mouthAngle<0.01)pac.mouthDir=1;
    }
    const col=tileOf(pac.x),row=tileOf(pac.y);
    if(row>=0&&row<ROWS){
      const c=((col%COLS)+COLS)%COLS, cell=map[row][c];
      if(cell===2){map[row][c]=0;score+=DOT_SCORE;dotsEaten++;updateHUD();sfxWaka();}
      else if(cell===3){map[row][c]=0;score+=PELLET_SCORE;dotsEaten++;activatePower();updateHUD();sfxPowerPellet();}
    }
    if(dotsEaten>=totalDots)triggerLevelWin();
  }

  function activatePower(){
    scaredEnd=performance.now()+SCARED_DURATION;ghostEatenCount=0;
    ghosts.forEach(g=>{if(!g.eaten){g.scared=true;g.dx=-g.dx;g.dy=-g.dy;}});
    startScaredSfx();
  }

  // ── Ghost AI ──────────────────────────────────────────────
  function ghostSpeed(g){
    if(g.eaten)return GHOST_BASE_SPEED*1.8;
    if(g.scared)return GHOST_BASE_SPEED*0.5;
    return GHOST_BASE_SPEED*(1+(level-1)*0.05);
  }
  function updateGhost(g,dt,now){
    if(g.inHouse){g.leaveTimer-=dt;if(g.leaveTimer<=0)leaveHouse(g);else return;}
    const speed=ghostSpeed(g)*TILE*(dt/16);
    if(g.targetCol===undefined){g.targetCol=tileOf(g.x)+g.dx;g.targetRow=tileOf(g.y)+g.dy;}
    const tx=centreOf(g.targetCol),ty=centreOf(g.targetRow);
    const distX=tx-g.x,distY=ty-g.y,dist=Math.hypot(distX,distY);
    if(dist<=speed+0.5){
      g.x=tx;g.y=ty;
      g.tileCol=((g.targetCol%COLS)+COLS)%COLS;g.tileRow=g.targetRow;
      chooseGhostDir(g,now);
    } else { g.x+=(distX/dist)*speed;g.y+=(distY/dist)*speed; }
    if(g.x<-TILE/2){g.x+=COLS*TILE;if(g.targetCol!==undefined)g.targetCol+=COLS;}
    if(g.x>COLS*TILE+TILE/2){g.x-=COLS*TILE;if(g.targetCol!==undefined)g.targetCol-=COLS;}
    g.wobble+=0.18;
  }
  function leaveHouse(g){
    g.inHouse=false;g.x=14*TILE;g.y=11*TILE+TILE/2;
    g.dx=-1;g.dy=0;g.tileCol=14;g.tileRow=11;g.targetCol=13;g.targetRow=11;
  }
  function chooseGhostDir(g,now){
    const col=g.tileCol??tileOf(g.x),row=g.tileRow??tileOf(g.y);
    const dirs=[{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const notRev=dirs.filter(d=>{
      if(d.dx===-g.dx&&d.dy===-g.dy)return false;
      return !isGhostWall(((col+d.dx)%COLS+COLS)%COLS,row+d.dy);
    });
    const possible=notRev.length>0?notRev:dirs.filter(d=>!isGhostWall(((col+d.dx)%COLS+COLS)%COLS,row+d.dy));
    if(!possible.length)return;
    let chosen;
    if(g.scared){chosen=possible[Math.floor(Math.random()*possible.length)];}
    else if(g.eaten){chosen=pickTargetDir(col,row,possible,14,13);}
    else{
      const pt={col:tileOf(pac.x),row:tileOf(pac.y)};
      let tc=pt.col,tr=pt.row;
      if(g.id===1){tc=pt.col+pac.dx*4;tr=pt.row+pac.dy*4;}
      else if(g.id===2){const mc=pt.col+pac.dx*2,mr=pt.row+pac.dy*2;tc=mc*2-tileOf(ghosts[0].x);tr=mr*2-tileOf(ghosts[0].y);}
      else if(g.id===3&&Math.hypot(col-pt.col,row-pt.row)<8){tc=0;tr=ROWS-1;}
      chosen=pickTargetDir(col,row,possible,tc,tr);
    }
    g.dx=chosen.dx;g.dy=chosen.dy;g.targetCol=col+chosen.dx;g.targetRow=row+chosen.dy;
  }
  function pickTargetDir(col,row,possible,tc,tr){
    let best=null,bd=Infinity;
    for(const d of possible){const dist=Math.hypot(col+d.dx-tc,row+d.dy-tr);if(dist<bd){bd=dist;best=d;}}
    return best||possible[0];
  }

  // ── Collision ─────────────────────────────────────────────
  function checkCollisions(){
    if(pac.dead||levelTransition)return;
    for(const g of ghosts){
      if(g.eaten)continue;
      if(Math.hypot(pac.x-g.x,pac.y-g.y)<PAC_R+GHOST_R-4){
        if(g.scared){
          g.scared=false;g.eaten=true;
          const pts=GHOST_SCORES[Math.min(ghostEatenCount,3)];
          ghostEatenCount++;score+=pts;updateHUD();
          showFloatingScore(g.x,g.y,pts);sfxEatGhost();
          spawnParticles(g.x,g.y,GHOST_HEX[g.id],20,0.05);
        } else { pacDie(); return; }
      }
    }
  }

  function pacDie(){
    if(pac.dead)return;
    pac.dead=true;pac.deathAnim=0;paused=false;
    stopScaredSfx();sfxDeath();
    spawnParticles(pac.x,pac.y,0xffe600,30,0.06);
    setTimeout(()=>{
      lives--;updateHUD();
      if(lives<=0)triggerGameOver();else resetPositions();
    },1400);
  }
  function resetPositions(){scaredEnd=0;ghostEatenCount=0;initPac();initGhosts();}

  function triggerLevelWin(){
    if(levelTransition)return;
    levelTransition=true;stopScaredSfx();sfxLevelUp();
    let flashes=0;
    const iv=setInterval(()=>{if(++flashes>=6){clearInterval(iv);level++;startLevel();}},220);
  }

  function triggerGameOver(){
    gameRunning=false;stopScaredSfx();
    if(score>highScore)highScore=score;
    if(elPacOvTitle){elPacOvTitle.textContent='GAME OVER';elPacOvTitle.className='pac-ov-title gameover';}
    if(elPacOvSub)elPacOvSub.textContent='Better luck next time!';
    if(elPacOvScore)elPacOvScore.textContent=`SCORE: ${score}  |  HIGH: ${highScore}`;
    if(elPacOverlay)elPacOverlay.classList.add('active');
    updateHUD();
    if(score>0&&window.HS){
      setTimeout(()=>{
        if(window._firebaseReady)window.HS.promptSubmit('pacman',score,score.toLocaleString());
        else window.HS.promptSubmitOnExit('pacman',score,score.toLocaleString(),null);
      },500);
    }
  }

  const floatersArr = floaters;
  function showFloatingScore(x,y,pts){ floaters.push({x,y,pts,life:1.0}); }

  function updateHUD(){
    if(elPacScore)elPacScore.textContent=score;
    if(elPacHigh)elPacHigh.textContent=highScore;
    if(elPacLevel)elPacLevel.textContent=level;
    if(elPacLives){
      elPacLives.innerHTML='';
      for(let i=0;i<Math.max(0,lives-1);i++){
        const s=document.createElement('span');s.textContent='🟡';s.style.fontSize='0.9rem';
        elPacLives.appendChild(s);
      }
    }
  }

  // ── Main loop ─────────────────────────────────────────────
  function loop(now){
    if(!gameRunning)return;
    raf=requestAnimationFrame(loop);
    const dt=Math.min(now-lastTime,40);lastTime=now;

    if(!paused&&!levelTransition){
      if(now>=scaredEnd&&scaredEnd>0){
        scaredEnd=0;ghosts.forEach(g=>{if(!g.eaten)g.scared=false;});stopScaredSfx();
      }
      ghosts.forEach(g=>{
        if(g.eaten){
          const dc=Math.abs((g.tileCol??tileOf(g.x))-14);
          const dr=Math.abs((g.tileRow??tileOf(g.y))-13);
          if(dc+dr<1){g.eaten=false;g.scared=false;g.inHouse=true;g.leaveTimer=3000;g.dx=0;g.dy=0;g.targetCol=undefined;}
        }
      });
      updatePac(dt);
      ghosts.forEach(g=>updateGhost(g,dt,now));
      checkCollisions();
    }

    update3D(now);
    if(renderer&&scene&&camera) renderer.render(scene,camera);
    drawFloaters2D();
  }

  // ── Input ─────────────────────────────────────────────────
  function onKey(e){
    const km={ArrowLeft:'L',ArrowRight:'R',ArrowUp:'U',ArrowDown:'D',a:'L',d:'R',w:'U',s:'D',A:'L',D:'R',W:'U',S:'D'};
    const dir=km[e.key]; if(!dir)return;
    e.preventDefault(); getAC();
    if(!gameRunning){startGame();return;}
    const d={L:{dx:-1,dy:0},R:{dx:1,dy:0},U:{dx:0,dy:-1},D:{dx:0,dy:1}}[dir];
    pac.qx=d.dx;pac.qy=d.dy;
    if(pac.dx===0&&pac.dy===0){pac.dx=d.dx;pac.dy=d.dy;}
  }
  function queueDir(dx,dy){
    getAC();pac.qx=dx;pac.qy=dy;
    if(!gameRunning)startGame();
    else if(pac.dx===0&&pac.dy===0){pac.dx=dx;pac.dy=dy;}
  }

  // ── Init / start / destroy ────────────────────────────────
  function init(){
    elPacOverlay  = document.getElementById('pac-overlay');
    elPacOvTitle  = document.getElementById('pac-ov-title');
    elPacOvSub    = document.getElementById('pac-ov-sub');
    elPacOvScore  = document.getElementById('pac-ov-score');
    elPacScore    = document.getElementById('pac-score');
    elPacHigh     = document.getElementById('pac-high');
    elPacLevel    = document.getElementById('pac-level');
    elPacLives    = document.getElementById('pac-lives');
    elPacPauseBtn = document.getElementById('pac-pause-btn');

    // Position pac-canvas-wrap for overlay canvas
    const wrap = document.querySelector('.pac-canvas-wrap');
    if (wrap) wrap.style.position = 'relative';

    // Initialise game state only (no 3D yet — THREE_LIB is null here)
    level=1; score=0; lives=3; currentMazeIdx=0;
    currentMazeIdx = pickMaze(level);
    map = cloneMap(); countDots();
    dotsEaten=0; scaredEnd=0; ghostEatenCount=0; levelTransition=false;
    initPac();

    loadThree(() => {
      THREE_LIB = window.THREE;
      // buildScene does full build: maze, dots, pac, ghosts
      buildScene();
      buildOverlayCanvas();
      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('keydown', onKey);
      updateHUD();
      if(elPacOverlay)elPacOverlay.classList.add('active');
      if(elPacOvTitle){elPacOvTitle.textContent='PAC-MAN';elPacOvTitle.className='pac-ov-title';}
      if(elPacOvSub)elPacOvSub.textContent='Arrow keys / WASD · tap to start';
      if(elPacOvScore)elPacOvScore.textContent='';
    });
  }

  function startGame(){
    if(elPacOverlay)elPacOverlay.classList.remove('active');
    // Reset game state fully
    level=1; score=0; lives=3; currentMazeIdx=0;
    updateHUD();
    startLevel();   // rebuilds maze geometry + dots cleanly
    sfxIntro();
    gameRunning=true; lastTime=performance.now();
    raf=requestAnimationFrame(loop);
    if(elPacPauseBtn)elPacPauseBtn.textContent='⏸ PAUSE';
  }
  function togglePause(){
    if(!gameRunning)return;
    paused=!paused;
    if(elPacPauseBtn)elPacPauseBtn.textContent=paused?'▶ RESUME':'⏸ PAUSE';
    if(!paused)lastTime=performance.now();
  }
  function destroy(){
    gameRunning=false;paused=false;stopScaredSfx();
    if(raf){cancelAnimationFrame(raf);raf=null;}
    window.removeEventListener('resize',resize);
    window.removeEventListener('keydown',onKey);
    if(renderer){renderer.dispose();}
    if(overlayCanvas&&overlayCanvas.parentNode)overlayCanvas.parentNode.removeChild(overlayCanvas);
  }

  return { init, startGame, newGame, togglePause, isPaused:()=>paused, destroy, queueDir };
})();
