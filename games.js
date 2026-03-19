// ============================================================
// GAMES REGISTRY
// To add a new game:
//   1. Create yourgame.js exporting { init } (and optionally { destroy })
//   2. Add an entry below — that's it.
//
// `global`: the window.XXXX name the module and index.html use internally.
//   If omitted, defaults to gameKey.toUpperCase()
// `script`: for non-module legacy engines — path to a plain .js file to
//   inject via <script> tag (loaded once, cached). Use instead of `module`.
// ============================================================

export const GAMES = {
  // ── Bubble puzzle games ────────────────────────────────────
  bubbleburst:  { label: '💥 Bubble Burst',     module: './bubbleburst.js',  screen: 'bubbleburst-screen',  global: 'BBURST', init: m => m.init() },

  // ── Solo / local games ─────────────────────────────────────
  stackit:      { label: '🏗 Stack It',        module: './stackit.js', screen: 'stackit-screen',       global: 'STACKIT', init: m => m.init() },
  coinpusher:   { label: '🪙 Coin Pusher',     module: './coinpusher.js', screen: 'coinpusher-screen', global: 'COINPUSHER', init: m => m.init() },
  snake:        { label: '🐍 Snake',          module: './snk.js',    screen: 'snake-screen',         global: 'SNK',   init: m => m.init() },
  wordle:       { label: '📝 Wordle',          module: './wrd.js',    screen: 'wordle-screen',        global: 'WRD',   init: m => m.init() },
  tetris:       { label: '🧱 Tetris',          module: './tet.js',    screen: 'tetris-screen',        global: 'TET',   init: () => window.tetInit?.() },
  minesweeper:  { label: '💣 Minesweeper',     script: './minesweeper.js', screen: 'minesweeper-screen',  init: () => window.msInit?.() },
  solitaire:    { label: '🃏 Solitaire',       script: './solitaire.js',   screen: 'solitaire-screen',    init: () => window.solNewGame?.() },
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
  claw:         { label: '🕹 Claw Machine',     module: './claw.js',   screen: 'claw-screen',          global: 'CLAW',  init: m => m.init() },

  // ── VS AI games ────────────────────────────────────────────
  poker:        { label: '🃏 Poker',            module: './pkr.js',    screen: 'poker-screen',         global: 'PKR',   init: m => m.initSolo() },
  chess:        { label: '♟ Chess',             module: './chess.js',  screen: 'chess-screen',                          init: m => m.initSolo() },

  // ── Multiplayer / lobby games ──────────────────────────────
  battleships:  { label: '🚢 Battleships',      module: null,          screen: 'lobby-screen',         init: () => {} },
  pool:         { label: '🎱 Pool',              script: './pool.js',   screen: 'pool-lobby-screen',    init: () => {} },
  scrabble:     { label: '🔤 Scrabble',          script: './scrabble.js', screen: 'scrabble-lobby-screen', init: () => {} },
  trivia:       { label: '🧠 Trivia',            script: './trivia.js', screen: 'trivia-lobby-screen',  init: () => {} },
  hangman:      { label: '🪢 Hangman',           module: './hm.js',     screen: 'hangman-screen',       global: 'HM',    init: m => m.initSolo() },
  connectfour:  { label: '🔴 Connect Four',      module: './c4.js',     screen: 'connectfour-screen',   global: 'C4',    init: () => {} },
  uno:          { label: '🃏 Uno',               module: './uno.js',    screen: 'uno-lobby-screen',     global: 'UNO',   init: () => {} },
  pokemon:      { label: '⚡ Pokémon',            module: './pkm.js',    screen: 'pokemon-lobby-screen', global: 'PKM',   init: m => m.init() },
  guesswho:     { label: '🎭 Guess Who',         module: './gw.js',     screen: 'guesswho-lobby-screen',global: 'GW',    init: m => { m.stopLobbyBrowse?.(); m.startLobbyBrowse?.(); } },
};

// Cache of already-loaded modules and scripts
const _cache = {};
const _scriptLoaded = {};

// Load a plain .js script by injecting a <script> tag (once only)
function loadScript(src) {
  if (_scriptLoaded[src]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload  = () => { _scriptLoaded[src] = true; resolve(); };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Load a game and call its init function.
 */
export async function loadGame(gameKey) {
  const def = GAMES[gameKey];
  if (!def) {
    console.warn(`[games] Unknown game: ${gameKey}`);
    return;
  }

  // Plain script (legacy engine — pool, scrabble, trivia, solitaire, minesweeper)
  if (def.script) {
    try {
      await loadScript(def.script);
      def.init(null);
    } catch (err) {
      console.error(`[games] Failed to load script ${gameKey}:`, err);
    }
    return;
  }

  // No module and no script = handled entirely by index.html
  if (!def.module) { def.init(null); return; }

  // Return cached module if already loaded
  if (_cache[gameKey]) {
    def.init(_cache[gameKey]);
    return;
  }

  try {
    const mod = await import(def.module);
    const api = mod.default ?? mod;
    _cache[gameKey] = api;

    // Expose on window under both the short global name and gameKey.toUpperCase()
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
