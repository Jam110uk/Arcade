// ============================================================
// GAMES REGISTRY
// To add a new game:
//   1. Create yourgame.js exporting { init } (and optionally { destroy })
//   2. Add an entry below — that's it.
//
// `global`: the window.XXXX name the module and index.html use internally.
//   If omitted, defaults to gameKey.toUpperCase() (fine for TRON, ORBIT etc.)
// ============================================================

export const GAMES = {
  // ── Solo / local games ─────────────────────────────────────
  snake:        { label: '🐍 Snake',          module: './snk.js',    screen: 'snake-screen',         global: 'SNK',   init: m => m.init() },
  wordle:       { label: '📝 Wordle',          module: './wrd.js',    screen: 'wordle-screen',        global: 'WRD',   init: m => m.init() },
  tetris:       { label: '🧱 Tetris',          module: './tet.js',    screen: 'tetris-screen',        global: 'TET',   init: () => window.tetInit?.() },
  minesweeper:  { label: '💣 Minesweeper',     module: null,          screen: 'minesweeper-screen',                    init: () => window.msInit?.() },
  solitaire:    { label: '🃏 Solitaire',       module: null,          screen: 'solitaire-screen',                      init: () => window.solNewGame?.() },
  bubblebreaker:{ label: '🫧 Bubble Breaker',  module: './bb.js',     screen: 'bubblebreaker-screen', global: 'BB',    init: m => m.newGame?.() },
  puzzlebobble: { label: '🎯 Puzzle Bobble',   module: './pb.js',     screen: 'puzzlebobble-screen',  global: 'PB',    init: m => m.newGame?.() },
  zuma:         { label: '🔴 Zuma',            module: './zm.js',     screen: 'zuma-screen',          global: 'ZM',    init: m => m.init() },
  racer:        { label: '🚗 Road Rage',        module: './rc.js',     screen: 'racer-screen',         global: 'RC',    init: m => m.init() },
  pacman:       { label: '🟡 Pac-Man',          module: './pac.js',    screen: 'pacman-screen',        global: 'PAC',   init: m => m.init() },
  tron:         { label: '⚡ Tron',             module: './tron.js',   screen: 'tron-screen',                           init: m => m.init() },
  bejeweled:    { label: '💎 Bejeweled',        module: './bjw.js',    screen: 'bejeweled-screen',     global: 'BJW',   init: m => m.init() },
  monopoly:     { label: '🏦 Monopoly',         module: './mono.js',   screen: 'monopoly-screen',      global: 'MONO',  init: m => m.init() },
  plinko:       { label: '🪙 Plinko',           module: './plinko.js', screen: 'plinko-screen',                         init: m => m.init() },
  orbit:        { label: '🪐 Orbit',            module: './orbit.js',  screen: 'orbit-screen',                          init: m => setTimeout(() => m.init(), 50) },

  // ── VS AI games ────────────────────────────────────────────
  poker:        { label: '🃏 Poker',            module: './pkr.js',    screen: 'poker-screen',         global: 'PKR',   init: m => m.initSolo() },
  chess:        { label: '♟ Chess',             module: './chess.js',  screen: 'chess-screen',                          init: m => m.initSolo() },

  // ── Multiplayer / lobby games (no module — handled by index.html) ──
  battleships:  { label: '🚢 Battleships',      module: null,          screen: 'lobby-screen',         init: () => {} },
  pool:         { label: '🎱 Pool',              module: null,          screen: 'pool-lobby-screen',    init: () => {} },
  scrabble:     { label: '🔤 Scrabble',          module: null,          screen: 'scrabble-lobby-screen',init: () => {} },
  trivia:       { label: '🧠 Trivia',            module: null,          screen: 'trivia-lobby-screen',  init: () => {} },
  hangman:      { label: '🪢 Hangman',           module: './hm.js',     screen: 'hangman-screen',       global: 'HM',    init: m => m.initSolo() },
  connectfour:  { label: '🔴 Connect Four',      module: './c4.js',     screen: 'connectfour-screen',   global: 'C4',    init: () => {} },
  uno:          { label: '🃏 Uno',               module: './uno.js',    screen: 'uno-lobby-screen',     global: 'UNO',   init: () => {} },
  pokemon:      { label: '⚡ Pokémon',            module: './pkm.js',    screen: 'pokemon-lobby-screen', global: 'PKM',   init: m => m.init() },
  guesswho:     { label: '🎭 Guess Who',         module: './gw.js',     screen: 'guesswho-lobby-screen',global: 'GW',    init: m => { m.stopLobbyBrowse?.(); m.startLobbyBrowse?.(); } },
};

// Cache of already-loaded modules (avoid re-importing)
const _cache = {};

/**
 * Load a game module and call its init function.
 * Returns a promise that resolves when the game is ready.
 */
export async function loadGame(gameKey) {
  const def = GAMES[gameKey];
  if (!def) {
    console.warn(`[games] Unknown game: ${gameKey}`);
    return;
  }

  // No module = handled entirely by index.html (multiplayer lobbies etc.)
  // Still call init() in case it needs to kick off setup (e.g. solNewGame, msInit)
  if (!def.module) { def.init(null); return; }

  // Return cached module if already loaded
  if (_cache[gameKey]) {
    def.init(_cache[gameKey]);
    return;
  }

  try {
    const mod = await import(def.module);
    // Support both `export default` (object) and named exports
    const api = mod.default ?? mod;
    _cache[gameKey] = api;

    // Expose module on window using the name the module itself expects (e.g. SNK, WRD, PKR).
    // Also set the gameKey-based name (e.g. SNAKE) as an alias for safety.
    const globalName = def.global || gameKey.toUpperCase();
    window[globalName] = api;
    if (globalName !== gameKey.toUpperCase()) {
      window[gameKey.toUpperCase()] = api;
    }

    // Run any post-load setup hooks registered by index.html
    const setupFn = window[`_setup${globalName}`] || window[`_setup${gameKey.toUpperCase()}`];
    if (typeof setupFn === 'function') setupFn(api);

    def.init(api);
  } catch (err) {
    console.error(`[games] Failed to load ${gameKey}:`, err);
  }
}
