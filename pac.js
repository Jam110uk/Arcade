// PAC game module
// Fixes applied: double-RAF, isPaused export, ?? nullish, highScore persistence,
// DOM re-query, performance.now() in draw loop, dead vars removed, tunnel wrap.
// Added: arcade turn-snapping, Web Audio sounds, 4 hand-crafted mazes (randomised
// from level 2), full HS leaderboard integration on game over.

export default (function() {
  'use strict';

  // ── Maze definitions (28×31 tiles) ───────────────────────
  // 0=empty passage, 1=wall, 2=dot, 3=power pellet, 4=ghost house door
  // All mazes share the same ghost house block (rows 9-19, cols 6/21 corridors)
  // and tunnel row (row 14) so ghost AI and spawn positions stay constant.
  const COLS = 28, ROWS = 31;

  // ── MAZE 0 — Classic (original layout) ───────────────────
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

  // ── MAZE 1 — "Grid" — open central cross, dense outer ring ──
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

  // ── MAZE 2 — "Comb" — vertical teeth, long corridors ─────
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

  // ── MAZE 3 — "Fortress" — blockier walls, wider paths ────
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
    if (lvl === 1) return 0; // always Classic on level 1
    let idx;
    do { idx = Math.floor(Math.random() * ALL_MAZES.length); } while (idx === currentMazeIdx);
    return idx;
  }

  // ── Constants ─────────────────────────────────────────────
  const TILE    = 18;
  const PAC_R   = TILE * 0.42;
  const GHOST_R = TILE * 0.44;
  const GHOST_COLORS = ['#ff0000','#ffb8ff','#00ffff','#ffb852'];

  const SCARED_DURATION  = 8000;
  const SCARED_FLASH_AT  = 2000;
  const GHOST_BASE_SPEED = 0.08;
  const PAC_BASE_SPEED   = 0.10;
  const DOT_SCORE    = 10;
  const PELLET_SCORE = 50;
  const GHOST_SCORES = [200,400,800,1600];
  const TURN_WINDOW  = TILE * 0.55;

  // ── Web Audio ─────────────────────────────────────────────
  // All sounds synthesised via Web Audio API — zero external files.
  let _ac = null;
  function getAC() {
    if (!_ac) {
      try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    if (_ac && _ac.state === 'suspended') _ac.resume().catch(() => {});
    return _ac;
  }

  // Schedule a sequence of { freq, dur, type?, vol?, slide? } notes
  function playNotes(notes, startDelay = 0) {
    const a = getAC(); if (!a) return;
    let t = a.currentTime + startDelay + 0.01;
    for (const n of notes) {
      const osc  = a.createOscillator();
      const gain = a.createGain();
      osc.connect(gain); gain.connect(a.destination);
      osc.type = n.type || 'square';
      osc.frequency.setValueAtTime(n.freq, t);
      if (n.slide) osc.frequency.linearRampToValueAtTime(n.slide, t + n.dur);
      gain.gain.setValueAtTime(n.vol ?? 0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
      osc.start(t); osc.stop(t + n.dur + 0.02);
      t += n.dur;
    }
  }

  // Waka: alternating two-tone chomp
  let _wakaPhase = 0;
  function sfxWaka() {
    const hi = 440, lo = 300;
    const f1 = _wakaPhase ? hi : lo, f2 = _wakaPhase ? lo : hi;
    _wakaPhase ^= 1;
    playNotes([{ freq: f1, slide: f2, dur: 0.07, type: 'square', vol: 0.13 }]);
  }

  // Power pellet — 4-note rising burst
  function sfxPowerPellet() {
    playNotes([
      { freq: 220, dur: 0.055, type: 'square', vol: 0.20 },
      { freq: 330, dur: 0.055, type: 'square', vol: 0.20 },
      { freq: 440, dur: 0.055, type: 'square', vol: 0.20 },
      { freq: 550, dur: 0.10,  type: 'square', vol: 0.25 },
    ]);
  }

  // Ghost eaten — ascending arpeggio
  function sfxEatGhost() {
    playNotes([
      { freq: 600,  dur: 0.04, type: 'square', vol: 0.20 },
      { freq: 800,  dur: 0.04, type: 'square', vol: 0.20 },
      { freq: 1000, dur: 0.04, type: 'square', vol: 0.20 },
      { freq: 1200, dur: 0.08, type: 'square', vol: 0.25 },
    ]);
  }

  // Death — descending chromatic spiral (matches the classic descending sweep)
  function sfxDeath() {
    const notes = [];
    let f = 640;
    for (let i = 0; i < 14; i++) {
      notes.push({ freq: f, dur: 0.075, type: 'square', vol: 0.22 });
      f *= 0.88;
    }
    playNotes(notes);
  }

  // Level complete — 4-note rising fanfare
  function sfxLevelUp() {
    playNotes([
      { freq: 523,  dur: 0.08, type: 'square', vol: 0.20 },
      { freq: 659,  dur: 0.08, type: 'square', vol: 0.20 },
      { freq: 784,  dur: 0.08, type: 'square', vol: 0.20 },
      { freq: 1047, dur: 0.16, type: 'square', vol: 0.25 },
    ]);
  }

  // Intro jingle — approximation of the classic start music
  function sfxIntro() {
    playNotes([
      { freq: 494, dur: 0.10, type: 'square', vol: 0.20 },
      { freq: 494, dur: 0.10, type: 'square', vol: 0.20 },
      { freq: 494, dur: 0.10, type: 'square', vol: 0.20 },
      { freq: 392, dur: 0.15, type: 'square', vol: 0.20 },
      { freq: 494, dur: 0.10, type: 'square', vol: 0.22 },
      { freq: 587, dur: 0.25, type: 'square', vol: 0.25 },
      { freq: 294, dur: 0.25, type: 'square', vol: 0.20 },
    ]);
  }

  // Scared ghost — low warble loop
  let _scaredSfxTimer = null;
  let _scaredPhase = 0;
  function startScaredSfx() {
    stopScaredSfx();
    _scaredPhase = 0;
    _scaredSfxTimer = setInterval(() => {
      playNotes([{ freq: _scaredPhase ? 160 : 130, dur: 0.10, type: 'square', vol: 0.07 }]);
      _scaredPhase ^= 1;
    }, 130);
  }
  function stopScaredSfx() {
    if (_scaredSfxTimer) { clearInterval(_scaredSfxTimer); _scaredSfxTimer = null; }
  }

  // ── State ─────────────────────────────────────────────────
  let canvas, ctx, raf = null;
  let map, score, highScore = parseInt(localStorage.getItem('hs-pb-pacman') || '0', 10), level, lives;
  let totalDots, dotsEaten;
  let paused = false, gameRunning = false;
  let ghostEatenCount = 0;
  let levelTransition = false;

  let elPacOverlay, elPacOvTitle, elPacOvSub, elPacOvScore;
  let elPacScore, elPacHigh, elPacLevel, elPacLives, elPacPauseBtn;

  let pac = {};
  let ghosts = [];
  let scaredEnd = 0;

  // ── Resize / scale ────────────────────────────────────────
  function resize() {
    const wrap = document.querySelector('.pac-canvas-wrap');
    if (!canvas || !wrap) return;
    const maxW = Math.min(wrap.clientWidth, 560);
    const maxH = wrap.clientHeight || window.innerHeight * 0.7;
    const scale = Math.min(maxW / (COLS * TILE), maxH / (ROWS * TILE), 1.5);
    canvas.style.width  = (COLS * TILE * scale) + 'px';
    canvas.style.height = (ROWS * TILE * scale) + 'px';
  }

  // ── Map helpers ───────────────────────────────────────────
  function cloneMap() { return ALL_MAZES[currentMazeIdx].map(r => [...r]); }
  function isWall(col, row) {
    if (row < 0 || row >= ROWS) return true;
    return map[row][((col % COLS) + COLS) % COLS] === 1;
  }
  function isGhostWall(col, row) {
    if (row < 0 || row >= ROWS) return true;
    return map[row][((col % COLS) + COLS) % COLS] === 1;
  }

  // ── Entity init ───────────────────────────────────────────
  function initPac() {
    pac = { x: 14 * TILE, y: 23 * TILE + TILE / 2, dx: 0, dy: 0, qx: 0, qy: 0,
            mouthAngle: 0, mouthDir: 1, dead: false, deathAnim: 0 };
  }

  function initGhosts() {
    const sp = [{ col:14,row:11 },{ col:13,row:14 },{ col:14,row:14 },{ col:15,row:14 }];
    ghosts = sp.map((p, i) => ({
      id: i, x: p.col * TILE, y: p.row * TILE + TILE / 2,
      dx: i === 0 ? -1 : 0, dy: 0,
      color: GHOST_COLORS[i], scared: false, eaten: false,
      inHouse: i > 0, leaveTimer: i * 5000, wobble: 0,
      tileCol: p.col, tileRow: p.row,
      targetCol: i === 0 ? p.col - 1 : p.col, targetRow: p.row,
    }));
  }

  // ── Count dots ────────────────────────────────────────────
  function countDots() {
    totalDots = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (map[r][c] === 2 || map[r][c] === 3) totalDots++;
  }

  // ── New game / level ──────────────────────────────────────
  function newGame() {
    level = 1; score = 0; lives = 3;
    currentMazeIdx = 0;
    updateHUD();
    startLevel();
    sfxIntro();
  }

  function startLevel() {
    currentMazeIdx = pickMaze(level);
    map = cloneMap();
    countDots();
    dotsEaten = 0; scaredEnd = 0; ghostEatenCount = 0; levelTransition = false;
    stopScaredSfx();
    initPac(); initGhosts(); updateHUD();
  }

  // ── Movement helpers ──────────────────────────────────────
  function tileOf(px) { return Math.floor(px / TILE); }
  function centreOf(t) { return t * TILE + TILE / 2; }

  function canMove(px, py, dx, dy) {
    const nx = px + dx * TILE * PAC_BASE_SPEED;
    const ny = py + dy * TILE * PAC_BASE_SPEED;
    const r  = PAC_R - 2;
    return ![[nx-r,ny-r],[nx+r,ny-r],[nx-r,ny+r],[nx+r,ny+r]].some(
      ([cx,cy]) => isWall(Math.floor(cx/TILE), Math.floor(cy/TILE))
    );
  }

  function canTurnAt(col, row, dx, dy) {
    return !isWall(((col + dx) % COLS + COLS) % COLS, row + dy);
  }

  // ── Update pac (with arcade turn-snapping) ────────────────
  function updatePac(dt) {
    if (pac.dead) return;
    const speed = TILE * PAC_BASE_SPEED * (dt / 16);
    const hasQ  = pac.qx !== 0 || pac.qy !== 0;

    if (hasQ) {
      if (pac.qx === pac.dx && pac.qy === pac.dy) {
        // Same direction — clear queue
        pac.qx = 0; pac.qy = 0;
      } else if (pac.qx === -pac.dx && pac.qy === -pac.dy) {
        // Reverse — always immediate
        pac.dx = pac.qx; pac.dy = pac.qy; pac.qx = 0; pac.qy = 0;
      } else {
        // Perpendicular — snap to nearest valid tile centre
        const cc = tileOf(pac.x), cr = tileOf(pac.y);
        const cx = centreOf(cc),  cy = centreOf(cr);
        const offAxis = pac.qx !== 0 ? Math.abs(pac.y - cy) : Math.abs(pac.x - cx);

        if (offAxis <= TURN_WINDOW && canTurnAt(cc, cr, pac.qx, pac.qy)) {
          if (pac.qx !== 0) pac.y = cy; else pac.x = cx;
          pac.dx = pac.qx; pac.dy = pac.qy; pac.qx = 0; pac.qy = 0;
        } else {
          // Check the tile ahead
          const lc = cc + pac.dx, lr = cr + pac.dy;
          const lcx = centreOf(((lc % COLS) + COLS) % COLS), lcy = centreOf(lr);
          const ahead = pac.dx !== 0 ? (pac.dx > 0 ? lcx - pac.x : pac.x - lcx)
                                     : (pac.dy > 0 ? lcy - pac.y : pac.y - lcy);
          const wlc = ((lc % COLS) + COLS) % COLS;
          if (ahead >= 0 && ahead <= TURN_WINDOW && !isWall(wlc, lr) && canTurnAt(wlc, lr, pac.qx, pac.qy)) {
            if (pac.dx !== 0) pac.x = lcx; else pac.y = lcy;
            if (pac.qx !== 0) pac.y = centreOf(lr); else pac.x = lcx;
            pac.dx = pac.qx; pac.dy = pac.qy; pac.qx = 0; pac.qy = 0;
          }
          // else: hold queue until valid
        }
      }
    }

    if (canMove(pac.x, pac.y, pac.dx, pac.dy)) {
      pac.x += pac.dx * speed;
      pac.y += pac.dy * speed;
    } else {
      if (pac.dx !== 0) pac.x = centreOf(tileOf(pac.x + pac.dx * 0.5));
      if (pac.dy !== 0) pac.y = centreOf(tileOf(pac.y + pac.dy * 0.5));
    }

    // Tunnel wrap
    if (pac.x < -TILE / 2) pac.x = COLS * TILE;
    if (pac.x > COLS * TILE) pac.x = -TILE / 2;

    // Mouth animation
    if (pac.dx !== 0 || pac.dy !== 0) {
      pac.mouthAngle += pac.mouthDir * 0.12 * (dt / 16);
      if (pac.mouthAngle > 0.35) pac.mouthDir = -1;
      if (pac.mouthAngle < 0.01) pac.mouthDir  = 1;
    }

    // Eat dots / pellets
    const col = tileOf(pac.x), row = tileOf(pac.y);
    if (row >= 0 && row < ROWS) {
      const c = ((col % COLS) + COLS) % COLS;
      const cell = map[row][c];
      if (cell === 2) {
        map[row][c] = 0; score += DOT_SCORE; dotsEaten++; updateHUD(); sfxWaka();
      } else if (cell === 3) {
        map[row][c] = 0; score += PELLET_SCORE; dotsEaten++;
        activatePower(); updateHUD(); sfxPowerPellet();
      }
    }
    if (dotsEaten >= totalDots) triggerLevelWin();
  }

  // ── Power pellet ──────────────────────────────────────────
  function activatePower() {
    scaredEnd = performance.now() + SCARED_DURATION;
    ghostEatenCount = 0;
    ghosts.forEach(g => { if (!g.eaten) { g.scared = true; g.dx = -g.dx; g.dy = -g.dy; } });
    startScaredSfx();
  }

  // ── Ghost AI ──────────────────────────────────────────────
  function ghostSpeed(g) {
    if (g.eaten)  return GHOST_BASE_SPEED * 1.8;
    if (g.scared) return GHOST_BASE_SPEED * 0.5;
    return GHOST_BASE_SPEED * (1 + (level - 1) * 0.05);
  }

  function updateGhost(g, dt, now) {
    if (g.inHouse) {
      g.leaveTimer -= dt;
      if (g.leaveTimer <= 0) leaveHouse(g);
      else { g.y += Math.sin(now / 400 + g.id) * 0.3; return; }
    }
    const speed = ghostSpeed(g) * TILE * (dt / 16);
    if (g.targetCol === undefined) { g.targetCol = tileOf(g.x) + g.dx; g.targetRow = tileOf(g.y) + g.dy; }

    const tx = centreOf(g.targetCol), ty = centreOf(g.targetRow);
    const distX = tx - g.x, distY = ty - g.y;
    const dist  = Math.hypot(distX, distY);

    if (dist <= speed + 0.5) {
      g.x = tx; g.y = ty;
      g.tileCol = ((g.targetCol % COLS) + COLS) % COLS;
      g.tileRow = g.targetRow;
      chooseGhostDir(g, now);
    } else {
      g.x += (distX / dist) * speed;
      g.y += (distY / dist) * speed;
    }

    if (g.x < -TILE / 2)               { g.x += COLS * TILE; if (g.targetCol !== undefined) g.targetCol += COLS; }
    if (g.x > COLS * TILE + TILE / 2)  { g.x -= COLS * TILE; if (g.targetCol !== undefined) g.targetCol -= COLS; }
    g.wobble += 0.18;
  }

  function leaveHouse(g) {
    g.inHouse = false; g.x = 14 * TILE; g.y = 11 * TILE + TILE / 2;
    g.dx = -1; g.dy = 0; g.tileCol = 14; g.tileRow = 11; g.targetCol = 13; g.targetRow = 11;
  }

  function chooseGhostDir(g, now) {
    const col = g.tileCol ?? tileOf(g.x);
    const row = g.tileRow ?? tileOf(g.y);
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const notRev = dirs.filter(d => {
      if (d.dx === -g.dx && d.dy === -g.dy) return false;
      return !isGhostWall(((col+d.dx)%COLS+COLS)%COLS, row+d.dy);
    });
    const possible = notRev.length > 0 ? notRev : dirs.filter(d =>
      !isGhostWall(((col+d.dx)%COLS+COLS)%COLS, row+d.dy)
    );
    if (!possible.length) return;

    let chosen;
    if (g.scared) {
      chosen = possible[Math.floor(Math.random() * possible.length)];
    } else if (g.eaten) {
      chosen = pickTargetDir(col, row, possible, 14, 13);
    } else {
      const pt = { col: tileOf(pac.x), row: tileOf(pac.y) };
      let tc = pt.col, tr = pt.row;
      if      (g.id === 1) { tc = pt.col + pac.dx * 4; tr = pt.row + pac.dy * 4; }
      else if (g.id === 2) {
        const mc = pt.col + pac.dx * 2, mr = pt.row + pac.dy * 2;
        tc = mc * 2 - tileOf(ghosts[0].x); tr = mr * 2 - tileOf(ghosts[0].y);
      } else if (g.id === 3 && Math.hypot(col-pt.col, row-pt.row) < 8) {
        tc = 0; tr = ROWS - 1;
      }
      chosen = pickTargetDir(col, row, possible, tc, tr);
    }
    g.dx = chosen.dx; g.dy = chosen.dy;
    g.targetCol = col + chosen.dx; g.targetRow = row + chosen.dy;
  }

  function pickTargetDir(col, row, possible, tc, tr) {
    let best = null, bd = Infinity;
    for (const d of possible) {
      const dist = Math.hypot(col+d.dx-tc, row+d.dy-tr);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best || possible[0];
  }

  // ── Collision ─────────────────────────────────────────────
  function checkCollisions() {
    if (pac.dead || levelTransition) return;
    for (const g of ghosts) {
      if (g.eaten) continue;
      if (Math.hypot(pac.x - g.x, pac.y - g.y) < PAC_R + GHOST_R - 4) {
        if (g.scared) {
          g.scared = false; g.eaten = true;
          const pts = GHOST_SCORES[Math.min(ghostEatenCount, 3)];
          ghostEatenCount++; score += pts; updateHUD();
          showFloatingScore(g.x, g.y, pts); sfxEatGhost();
        } else { pacDie(); return; }
      }
    }
  }

  // ── Pac death ─────────────────────────────────────────────
  function pacDie() {
    if (pac.dead) return;
    pac.dead = true; pac.deathAnim = 0; paused = false;
    stopScaredSfx(); sfxDeath();
    setTimeout(() => {
      lives--; updateHUD();
      if (lives <= 0) triggerGameOver(); else resetPositions();
    }, 1400);
  }

  function resetPositions() {
    scaredEnd = 0; ghostEatenCount = 0; initPac(); initGhosts();
  }

  // ── Level win ─────────────────────────────────────────────
  function triggerLevelWin() {
    if (levelTransition) return;
    levelTransition = true;
    stopScaredSfx(); sfxLevelUp();
    let flashes = 0;
    const iv = setInterval(() => {
      if (++flashes >= 6) { clearInterval(iv); level++; startLevel(); }
    }, 220);
  }

  // ── Game over — full HS leaderboard integration ───────────
  function triggerGameOver() {
    gameRunning = false;
    stopScaredSfx();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('hs-pb-pacman', highScore);
    }
    if (elPacOvTitle) { elPacOvTitle.textContent = 'GAME OVER'; elPacOvTitle.className = 'pac-ov-title gameover'; }
    if (elPacOvSub)   elPacOvSub.textContent  = 'Better luck next time!';
    if (elPacOvScore) elPacOvScore.textContent = `SCORE: ${score}  |  HIGH: ${highScore}`;
    if (elPacOverlay) elPacOverlay.classList.add('active');
    updateHUD();
    // Trigger the shared HS prompt — same path as every other game in the arcade.
    // promptSubmit only shows if score beats the player's stored personal best.
    if (score > 0 && window.HS) {
      setTimeout(() => window.HS.promptSubmit('pacman', score, score.toLocaleString()), 500);
    }
  }

  // ── Floating score ────────────────────────────────────────
  const floaters = [];
  function showFloatingScore(x, y, pts) { floaters.push({ x, y, pts, life: 1.0 }); }

  // ── HUD ───────────────────────────────────────────────────
  function updateHUD() {
    if (elPacScore) elPacScore.textContent = score;
    if (elPacHigh)  elPacHigh.textContent  = highScore;
    if (elPacLevel) elPacLevel.textContent = level;
    if (elPacLives) {
      elPacLives.innerHTML = '';
      for (let i = 0; i < Math.max(0, lives - 1); i++) {
        const s = document.createElement('span');
        s.textContent = '🟡'; s.style.fontSize = '0.9rem';
        elPacLives.appendChild(s);
      }
    }
  }

  // ── Draw maze ─────────────────────────────────────────────
  function drawMaze(flashLight) {
    const wc = flashLight ? '#ffffff' : '#1a4aff';
    const wi = flashLight ? '#aaaaff' : '#0000cc';
    const now = performance.now();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = col * TILE, y = row * TILE, cell = map[row][col];
        if (cell === 1) {
          ctx.fillStyle = wc; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = wi; ctx.fillRect(x+2, y+2, TILE-4, TILE-4);
        } else if (cell === 2) {
          ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2, 2, 0, Math.PI*2);
          ctx.fillStyle = '#ffb8ae'; ctx.fill();
        } else if (cell === 3) {
          const pulse = 0.7 + 0.3 * Math.sin(now / 250);
          ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2, Math.max(0, 5*pulse), 0, Math.PI*2);
          ctx.fillStyle = '#ffe600'; ctx.fill();
          ctx.shadowBlur = 10; ctx.shadowColor = '#ffe600'; ctx.fill(); ctx.shadowBlur = 0;
        } else if (cell === 4) {
          ctx.fillStyle = '#ffb8ff';
          ctx.fillRect(x+3, y+TILE/2-1, TILE-6, 3);
        }
      }
    }
  }

  // ── Draw pac ──────────────────────────────────────────────
  function drawPac() {
    if (pac.dead) {
      pac.deathAnim = Math.min(pac.deathAnim + 0.03, 1);
      const a = pac.deathAnim * Math.PI;
      ctx.beginPath(); ctx.moveTo(pac.x, pac.y);
      ctx.arc(pac.x, pac.y, Math.max(0, PAC_R), a, Math.PI*2-a);
      ctx.closePath(); ctx.fillStyle = '#ffe600'; ctx.fill();
      return;
    }
    let rot = 0;
    if (pac.dx === 1) rot = 0; else if (pac.dx === -1) rot = Math.PI;
    else if (pac.dy === -1) rot = -Math.PI/2; else if (pac.dy === 1) rot = Math.PI/2;
    const mouth = pac.mouthAngle * Math.PI;
    ctx.save(); ctx.translate(pac.x, pac.y); ctx.rotate(rot);
    ctx.shadowBlur = 8; ctx.shadowColor = '#ffe600';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, Math.max(0, PAC_R), mouth, Math.PI*2-mouth);
    ctx.closePath(); ctx.fillStyle = '#ffe600'; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(2, -PAC_R*0.4, 2, 0, Math.PI*2);
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
  }

  // ── Draw ghosts ───────────────────────────────────────────
  function drawGhosts(now) {
    const scared   = now < scaredEnd;
    const flashing = scared && (scaredEnd - now) < SCARED_FLASH_AT;
    for (const g of ghosts) {
      ctx.save(); ctx.translate(g.x, g.y);
      if (g.eaten) { drawGhostEyes(); ctx.restore(); continue; }
      let color = g.color;
      if (g.scared) color = (flashing && Math.sin(now/150) > 0) ? '#ffffff' : '#2121de';
      const r = GHOST_R;
      ctx.shadowBlur = g.scared ? 0 : 10; ctx.shadowColor = color;
      ctx.beginPath(); ctx.arc(0, -r*0.1, Math.max(0,r), Math.PI, 0);
      ctx.lineTo(r, r*0.9);
      for (let i = 3; i >= 0; i--) {
        const wx = r - (r*2/3)*i;
        const wy = r*0.9 + (i%2===0 ? 2.5 : -2.5)*Math.sin(g.wobble);
        ctx.lineTo(wx-r, wy);
      }
      ctx.lineTo(-r, r*0.9); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0;
      if (!g.scared) {
        drawGhostEyes();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(-r*0.35,-r*0.1,2.5,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc( r*0.35,-r*0.1,2.5,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r*0.5, r*0.3);
        for (let i=0;i<=4;i++) ctx.lineTo(-r*0.5+i*r*0.25, r*0.3+(i%2===0?3:-3));
        ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5; ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawGhostEyes() {
    const r = GHOST_R;
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.ellipse(-r*0.35,-r*0.2,r*0.25,r*0.32,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( r*0.35,-r*0.2,r*0.25,r*0.32,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2222ff';
    ctx.beginPath(); ctx.arc(-r*0.35,-r*0.2,Math.max(0,r*0.14),0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( r*0.35,-r*0.2,Math.max(0,r*0.14),0,Math.PI*2); ctx.fill();
  }

  // ── Draw floaters ─────────────────────────────────────────
  function drawFloaters() {
    ctx.font = 'bold 11px Orbitron, monospace'; ctx.textAlign = 'center';
    for (let i = floaters.length-1; i >= 0; i--) {
      const f = floaters[i];
      ctx.globalAlpha = f.life; ctx.fillStyle = '#ffe600';
      ctx.fillText(f.pts, f.x, f.y);
      f.y -= 0.5; f.life -= 0.02;
      if (f.life <= 0) { floaters[i] = floaters[floaters.length-1]; floaters.pop(); }
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  // ── Power bar ─────────────────────────────────────────────
  function drawPowerBar(now) {
    if (now >= scaredEnd) return;
    const pct = (scaredEnd - now) / SCARED_DURATION;
    const w = COLS * TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, ROWS*TILE-4, w, 4);
    ctx.fillStyle = pct < 0.25 ? '#ff4444' : '#ffe600';
    ctx.fillRect(0, ROWS*TILE-4, w*pct, 4);
  }

  // ── Main loop ─────────────────────────────────────────────
  let lastTime = 0;

  function loop(now) {
    if (!gameRunning) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - lastTime, 40);
    lastTime = now;

    if (paused || levelTransition) { render(now); return; }

    if (now >= scaredEnd && scaredEnd > 0) {
      scaredEnd = 0;
      ghosts.forEach(g => { if (!g.eaten) g.scared = false; });
      stopScaredSfx();
    }

    ghosts.forEach(g => {
      if (g.eaten) {
        const dc = Math.abs((g.tileCol ?? tileOf(g.x)) - 14);
        const dr = Math.abs((g.tileRow ?? tileOf(g.y)) - 13);
        if (dc + dr < 1) {
          g.eaten = false; g.scared = false; g.inHouse = true;
          g.leaveTimer = 3000; g.dx = 0; g.dy = 0; g.targetCol = undefined;
        }
      }
    });

    updatePac(dt);
    ghosts.forEach(g => updateGhost(g, dt, now));
    checkCollisions();
    render(now);
  }

  function render(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fl = levelTransition && Math.floor(now/220) % 2 === 0;
    drawMaze(fl); drawGhosts(now); drawPac(); drawFloaters(); drawPowerBar(now);
  }

  // ── Input ─────────────────────────────────────────────────
  function onKey(e) {
    const km = { ArrowLeft:'L',ArrowRight:'R',ArrowUp:'U',ArrowDown:'D',
                 a:'L',d:'R',w:'U',s:'D',A:'L',D:'R',W:'U',S:'D' };
    const dir = km[e.key]; if (!dir) return;
    e.preventDefault();
    getAC(); // resume AudioContext on first interaction
    if (!gameRunning) { startGame(); return; }
    const d = {L:{dx:-1,dy:0},R:{dx:1,dy:0},U:{dx:0,dy:-1},D:{dx:0,dy:1}}[dir];
    pac.qx = d.dx; pac.qy = d.dy;
    if (pac.dx === 0 && pac.dy === 0) { pac.dx = d.dx; pac.dy = d.dy; }
  }

  function queueDir(dx, dy) {
    getAC();
    pac.qx = dx; pac.qy = dy;
    if (!gameRunning) startGame();
    else if (pac.dx === 0 && pac.dy === 0) { pac.dx = dx; pac.dy = dy; }
  }

  // ── Init / start / destroy ────────────────────────────────
  function init() {
    canvas = document.getElementById('pac-canvas');
    canvas.width = COLS * TILE; canvas.height = ROWS * TILE;
    ctx = canvas.getContext('2d');
    elPacOverlay  = document.getElementById('pac-overlay');
    elPacOvTitle  = document.getElementById('pac-ov-title');
    elPacOvSub    = document.getElementById('pac-ov-sub');
    elPacOvScore  = document.getElementById('pac-ov-score');
    elPacScore    = document.getElementById('pac-score');
    elPacHigh     = document.getElementById('pac-high');
    elPacLevel    = document.getElementById('pac-level');
    elPacLives    = document.getElementById('pac-lives');
    elPacPauseBtn = document.getElementById('pac-pause-btn');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    newGame(); updateHUD();
    if (elPacOverlay) elPacOverlay.classList.add('active');
    if (elPacOvTitle) { elPacOvTitle.textContent = 'PAC-MAN'; elPacOvTitle.className = 'pac-ov-title'; }
    if (elPacOvSub)   elPacOvSub.textContent = 'Arrow keys / WASD · tap to start';
    if (elPacOvScore) elPacOvScore.textContent = '';
  }

  function startGame() {
    if (elPacOverlay) elPacOverlay.classList.remove('active');
    newGame(); gameRunning = true; lastTime = performance.now();
    raf = requestAnimationFrame(loop);
    if (elPacPauseBtn) elPacPauseBtn.textContent = '⏸ PAUSE';
  }

  function togglePause() {
    if (!gameRunning) return;
    paused = !paused;
    if (elPacPauseBtn) elPacPauseBtn.textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
    if (!paused) lastTime = performance.now(); // loop is self-registering
  }

  function destroy() {
    gameRunning = false; paused = false; stopScaredSfx();
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
  }

  return { init, startGame, newGame, togglePause, isPaused: () => paused, destroy, queueDir };
})();
