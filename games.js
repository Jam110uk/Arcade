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
  minesweeper:  { label: '💣 Minesweeper',     module: null,          screen: 'minesweeper-screen',  init: () => {} },
  solitaire:    { label: '🃏 Solitaire',       module: null,          screen: 'solitaire-screen',    init: () => window.solNewGame?.() },
  bubblebreaker:{ label: '🫧 Bubble Breaker',  module: './bb.js',     screen: 'bubblebreaker-screen',init: m => m.newGame?.() },
  puzzlebobble: { label: '🎯 Puzzle Bobble',   module: './pb.js',     screen: 'puzzlebobble-screen', init: m => m.newGame?.() },
  bustamove3d:  { label: '🎯 Bust-A-Move 3D',  module: './pb3d.js',   screen: 'bustamove3d-screen',  init: m => m.newGame?.() },
  zuma:         { label: '🔴 Zuma',            module: './zm.js',     screen: 'zuma-screen',         init: m => m.init() },
  racer:        { label: '🚗 Road Rage',        module: './rc.js',     screen: 'racer-screen',        init: m => m.init() },
  pacman:       { label: '🟡 Pac-Man',          module: './pac.js',    screen: 'pacman-screen',       init: m => m.init() },
  tron:         { label: '⚡ Tron',             module: './tron.js',   screen: 'tron-screen',         init: m => m.init() },
  bejeweled:    { label: '💎 Bejeweled',        module: './bjw.js',    screen: 'bejeweled-screen',    init: m => m.init() },
  monopoly:     { label: '🏦 Monopoly',         module: './mono.js',   screen: 'monopoly-screen',     init: m => m.init() },
  plinko:       { label: '🪙 Plinko',           module: './plinko.js', screen: 'plinko-screen',       init: m => m.init() },
  orbit:        { label: '🪐 Orbit',            module: './orbit.js',  screen: 'orbit-screen',        init: m => requestAnimationFrame(() => m.init()) },
  claw:         { label: '🕹 Claw Machine',     module: './claw.js',   screen: 'claw-screen',         init: m => requestAnimationFrame(() => { m.init(); requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }) },

  // ── VS AI games ────────────────────────────────────────────
  poker:        { label: '🃏 Poker',            module: './pkr.js',    screen: 'poker-screen',        init: m => m.initSolo() },
  chess:        { label: '♟ Chess',             module: './chess.js',  screen: 'chess-screen',        init: m => m.initSolo() },

  // ── Multiplayer / lobby games (no module — handled by index.html) ──
  battleships:  { label: '🚢 Battleships',      module: null,          screen: 'lobby-screen',        init: () => {} },
  pool:         { label: '🎱 Pool',              module: null,          screen: 'pool-lobby-screen',   init: () => {
    // pool.js uses plain globals (not an ES module) so load via script tag
    if (document.querySelector('script[src="./pool.js"]')) return; // already loading/loaded
    const s = document.createElement('script');
    s.src = './pool.js';
    document.head.appendChild(s);
  } },
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

// Short aliases used by inline onclick handlers in index.html
// e.g. BJW.newGame(), ZM.init(), RC.restart() etc.
const SHORT_ALIASES = {
  bejeweled:    'BJW',
  bubblebreaker:'BB',
  puzzlebobble: 'PB',
  bustamove3d:  'BAM3D',
  zuma:         'ZM',
  racer:        'RC',
  pacman:       'PAC',
  snake:        'SNK',
  wordle:       'WRD',
  tetris:       'TET',
  poker:        'PKR',
  hangman:      'HM',
  connectfour:  'C4',
  guesswho:     'GW',
  pokemon:      'PKM',
  monopoly:     'MONO',
  tron:         'TRON',
  orbit:        'ORBIT',
  claw:         'CLAW',
  chess:        'CHESS',
  plinko:       'PLINKO',
  uno:          'UNO',
};

/**
 * Preload a game module without calling its init function.
 * Used by multiplayer lobbies to ensure the module is ready before launch.
 */
export async function preloadGame(gameKey) {
  const def = GAMES[gameKey];
  if (!def || !def.module || _cache[gameKey]) return;
  try {
    const mod = await import(def.module);
    const api = mod.default ?? mod;
    _cache[gameKey] = api;
    const shortKey = SHORT_ALIASES[gameKey];
    if (shortKey) window[shortKey] = api;
    window[gameKey.toUpperCase()] = api;
  } catch (err) {
    console.error(`[games] Failed to preload ${gameKey}:`, err);
  }
}
export async function loadGame(gameKey) {
  const def = GAMES[gameKey];
  if (!def) {
    console.warn(`[games] Unknown game: ${gameKey}`);
    return;
  }

  // No module = handled entirely by index.html (multiplayer lobbies etc.)
  // Still call init() so games like solitaire can auto-start.
  if (!def.module) { def.init({}); return; }

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
    // Expose as both the short alias (e.g. window.BJW) that inline onclick
    // handlers in index.html reference, and the long-form (e.g. window.BEJEWELED)
    const shortKey = SHORT_ALIASES[gameKey];
    if (shortKey) window[shortKey] = api;
    window[gameKey.toUpperCase()] = api;
    // Run any post-load setup hooks registered by index.html
    const setupFn = window[`_setup${gameKey.toUpperCase()}`];
    if (typeof setupFn === 'function') setupFn(api);
    def.init(api);
  } catch (err) {
    console.error(`[games] Failed to load ${gameKey}:`, err);
  }
}
