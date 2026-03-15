// ============================================================
// GAMES REGISTRY
// To add a new game:
//   1. Create yourgame.js exporting { init } (and optionally { destroy })
//   2. Add an entry below — that's it.
// ============================================================

export const GAMES = {
  // ── Solo / local games ─────────────────────────────────────
  snake:        { label: '🐍 Snake',          module: './snk.js',    screen: 'snake-screen',        init: m => m.init() },
  wordle:       { label: '📝 Wordle',          module: './wrd.js',    screen: 'wordle-screen',       init: m => m.init() },
  tetris:       { label: '🧱 Tetris',          module: './tet.js',    screen: 'tetris-screen',       init: () => window.tetInit?.() },
  minesweeper:  { label: '💣 Minesweeper',     module: null,          screen: 'minesweeper-screen',  init: () => window.msInit?.() },
  solitaire:    { label: '🃏 Solitaire',       module: null,          screen: 'solitaire-screen',    init: () => window.solNewGame?.() },
  bubblebreaker:{ label: '🫧 Bubble Breaker',  module: './bb.js',     screen: 'bubblebreaker-screen',init: m => m.newGame?.() },
  puzzlebobble: { label: '🎯 Puzzle Bobble',   module: './pb.js',     screen: 'puzzlebobble-screen', init: m => m.newGame?.() },
  zuma:         { label: '🔴 Zuma',            module: './zm.js',     screen: 'zuma-screen',         init: m => m.init() },
  racer:        { label: '🚗 Road Rage',        module: './rc.js',     screen: 'racer-screen',        init: m => m.init() },
  pacman:       { label: '🟡 Pac-Man',          module: './pac.js',    screen: 'pacman-screen',       init: m => m.init() },
  tron:         { label: '⚡ Tron',             module: './tron.js',   screen: 'tron-screen',         init: m => m.init() },
  bejeweled:    { label: '💎 Bejeweled',        module: './bjw.js',    screen: 'bejeweled-screen',    init: m => m.init() },
  monopoly:     { label: '🏦 Monopoly',         module: './mono.js',   screen: 'monopoly-screen',     init: m => m.init() },
  plinko:       { label: '🪙 Plinko',           module: './plinko.js', screen: 'plinko-screen',       init: m => m.init() },
  orbit:        { label: '🪐 Orbit',            module: './orbit.js',  screen: 'orbit-screen',        init: m => m.init() },

  // ── VS AI games ────────────────────────────────────────────
  poker:        { label: '🃏 Poker',            module: './pkr.js',    screen: 'poker-screen',        init: m => m.initSolo() },
  chess:        { label: '♟ Chess',             module: './chess.js',  screen: 'chess-screen',        init: m => m.initSolo() },

  // ── Multiplayer / lobby games (no module — handled by index.html) ──
  battleships:  { label: '🚢 Battleships',      module: null,          screen: 'lobby-screen',        init: () => {} },
  pool:         { label: '🎱 Pool',              module: null,          screen: 'pool-lobby-screen',   init: () => {} },
  scrabble:     { label: '🔤 Scrabble',          module: null,          screen: 'scrabble-lobby-screen', init: () => {} },
  trivia:       { label: '🧠 Trivia',            module: null,          screen: 'trivia-lobby-screen', init: () => {} },
  hangman:      { label: '🪢 Hangman',           module: './hm.js',     screen: 'hangman-screen',      init: m => m.initSolo() },
  connectfour:  { label: '🔴 Connect Four',      module: './c4.js',     screen: 'connectfour-screen',  init: () => {} },
  uno:          { label: '🃏 Uno',               module: './uno.js',    screen: 'uno-lobby-screen',    init: () => {} },
  pokemon:      { label: '⚡ Pokémon',            module: './pkm.js',    screen: 'pokemon-lobby-screen', init: m => m.init() },
  guesswho:     { label: '🎭 Guess Who',         module: './gw.js',     screen: 'guesswho-lobby-screen', init: () => {} },
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
    // Expose module as a global (e.g. window.ZM, window.SNK) so HTML button
    // wrappers like zmNewGame = () => window.ZM?.newGame() work after load
    window[gameKey.toUpperCase()] = api;
    // Run any post-load setup hooks registered by index.html
    const setupFn = window[`_setup${gameKey.toUpperCase()}`];
    if (typeof setupFn === 'function') setupFn(api);
    def.init(api);
  } catch (err) {
    console.error(`[games] Failed to load ${gameKey}:`, err);
  }
}
