// ============================================================
// GVOL — Global Volume Controller
// ============================================================
// Intercepts every AudioContext created by any game and routes
// all audio through a single master GainNode so one slider
// controls everything. Zero changes needed per-game.
//
// LOAD ORDER: must be the FIRST script tag in index.html, before
// any game modules, so the patch is in place before any game
// calls `new AudioContext()`.
//
//   <script type="module" src="./gvol.js"></script>
//
// Public API (also window.GVol):
//   GVol.setVolume(0..1)
//   GVol.setMute(bool)
//   GVol.toggleMute()
//   GVol.volume   — current level (0..1)
//   GVol.muted    — current mute state (bool)
// ============================================================

const STORAGE_VOL  = 'gvol-volume';
const STORAGE_MUTE = 'gvol-muted';

// Screen ids where the widget should be hidden.
// pokemon-lobby-screen already has its own volume control.
const HIDDEN_ON = new Set([
  'game-select-screen',
  'home-screen',
  'pokemon-screen',
  'pokemon-lobby-screen',
]);

// ── Persisted state ───────────────────────────────────────
let _volume = Math.min(1, Math.max(0, parseFloat(localStorage.getItem(STORAGE_VOL)) || 0.8));
let _muted  = localStorage.getItem(STORAGE_MUTE) === 'true';

// ── Master gain registry ──────────────────────────────────
// Keeps a strong reference to every master GainNode so we can
// update all live contexts when volume/mute changes.
const _masterGains = [];

// ── AudioContext patch ────────────────────────────────────
// Replaces window.AudioContext with a wrapper that inserts a
// master GainNode between all game audio and the hardware output.
(function patchAudioContext() {
  const Native = window.AudioContext || window.webkitAudioContext;
  if (!Native) return;

  function GVolContext(...args) {
    if (!(this instanceof GVolContext)) return new GVolContext(...args);

    // Build the real context
    const ctx = new Native(...args);

    // Grab the hardware destination BEFORE we shadow it
    const hwDest = Native.prototype.destination
      ? Object.getOwnPropertyDescriptor(Native.prototype, 'destination').get.call(ctx)
      : ctx.destination;

    // Insert master gain → hardware destination
    const master = Native.prototype.createGain.call(ctx);
    master.gain.value = _muted ? 0 : _volume;
    master.connect(hwDest);

    // Shadow ctx.destination so `gain.connect(ctx.destination)`
    // in every game hits master instead of the hardware output.
    Object.defineProperty(ctx, 'destination', {
      get: () => master,
      configurable: true,
      enumerable:   true,
    });

    _masterGains.push(master);
    return ctx;
  }

  // Preserve prototype chain so instanceof AudioContext still works
  GVolContext.prototype = Native.prototype;
  Object.setPrototypeOf(GVolContext, Native);

  window.AudioContext       = GVolContext;
  window.webkitAudioContext = GVolContext;
})();

// ── Apply volume / mute to every live context ─────────────
function _applyToAll() {
  const target = _muted ? 0 : _volume;
  const now = performance.now() / 1000; // rough fallback time
  _masterGains.forEach(master => {
    try {
      const t = master.context.currentTime || now;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(target, t, 0.012); // 12ms smooth ramp
    } catch (_) {
      try { master.gain.value = target; } catch (__) {}
    }
  });
}

// ── Public API ────────────────────────────────────────────
function setVolume(v) {
  _volume = Math.max(0, Math.min(1, v));
  localStorage.setItem(STORAGE_VOL, _volume);
  if (!_muted) _applyToAll();
  _syncWidget();
}

function setMute(bool) {
  _muted = !!bool;
  localStorage.setItem(STORAGE_MUTE, _muted);
  _applyToAll();
  _syncWidget();
}

function toggleMute() { setMute(!_muted); }

// ── Widget ────────────────────────────────────────────────
let _widget = null, _icon = null, _slider = null;

function _activeScreenId() {
  const el = document.querySelector('[id$="-screen"].active, [id$="-lobby-screen"].active');
  return el ? el.id : null;
}

function _widgetShouldShow() {
  const id = _activeScreenId();
  if (!id) return false;
  return !HIDDEN_ON.has(id);
}

function _syncWidget() {
  if (!_widget) return;
  _widget.style.display = _widgetShouldShow() ? 'flex' : 'none';
  if (_slider) _slider.value = _muted ? 0 : _volume;
  if (_icon) {
    if      (_muted || _volume === 0) _icon.textContent = '🔇';
    else if (_volume < 0.35)          _icon.textContent = '🔈';
    else if (_volume < 0.7)           _icon.textContent = '🔉';
    else                              _icon.textContent = '🔊';
  }
}

function _buildWidget() {
  if (_widget || !document.body) return;

  // Container
  const w = document.createElement('div');
  w.id = 'gvol-widget';
  w.setAttribute('aria-label', 'Volume control');
  Object.assign(w.style, {
    position:             'fixed',
    top:                  '10px',
    right:                '12px',
    zIndex:               '99999',
    display:              'none',
    alignItems:           'center',
    gap:                  '7px',
    background:           'rgba(0,0,0,0.52)',
    backdropFilter:       'blur(8px)',
    webkitBackdropFilter: 'blur(8px)',
    border:               '1px solid rgba(255,255,255,0.13)',
    borderRadius:         '22px',
    padding:              '5px 12px 5px 9px',
    userSelect:           'none',
    pointerEvents:        'all',
    boxShadow:            '0 2px 14px rgba(0,0,0,0.45)',
    transition:           'opacity 0.15s',
    fontFamily:           'sans-serif',
  });

  // Speaker / mute toggle button
  const icon = document.createElement('button');
  icon.id = 'gvol-icon';
  Object.assign(icon.style, {
    background: 'none',
    border:     'none',
    cursor:     'pointer',
    fontSize:   '15px',
    lineHeight: '1',
    padding:    '0',
    margin:     '0',
    display:    'flex',
    alignItems: 'center',
    flexShrink: '0',
    opacity:    '0.9',
  });
  icon.title = 'Toggle mute';
  icon.setAttribute('aria-label', 'Toggle mute');
  icon.addEventListener('click', toggleMute);

  // Volume slider
  const slider = document.createElement('input');
  slider.id   = 'gvol-slider';
  slider.type = 'range';
  slider.min  = '0';
  slider.max  = '1';
  slider.step = '0.02';
  slider.setAttribute('aria-label', 'Master volume');
  Object.assign(slider.style, {
    width:       '76px',
    cursor:      'pointer',
    accentColor: '#00f5ff',
    flexShrink:  '0',
  });

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    // Dragging slider above 0 auto-unmutes
    if (_muted && v > 0) {
      _muted = false;
      localStorage.setItem(STORAGE_MUTE, false);
    }
    setVolume(v);
  });

  // Keyboard shortcut: M = toggle mute (when not typing)
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'm' || e.key === 'M') toggleMute();
  });

  w.appendChild(icon);
  w.appendChild(slider);
  document.body.appendChild(w);

  _widget = w;
  _icon   = icon;
  _slider = slider;

  _syncWidget();
}

// ── Screen-transition observer ────────────────────────────
// Watches class changes on screen elements so the widget
// shows/hides automatically as the player navigates.
function _watchScreens() {
  const obs = new MutationObserver(_syncWidget);

  // Observe all current screen elements
  document.querySelectorAll('[id$="-screen"], [id$="-lobby-screen"]').forEach(el => {
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  // Watch body for dynamically added screens
  const bodyObs = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (/screen/.test(node.id || '')) {
          obs.observe(node, { attributes: true, attributeFilter: ['class'] });
        }
      });
    });
    _syncWidget();
  });
  bodyObs.observe(document.body, { childList: true });
}

// ── Boot ──────────────────────────────────────────────────
function _boot() {
  _buildWidget();
  _watchScreens();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _boot);
} else {
  _boot();
}

// ── Export ────────────────────────────────────────────────
const GVol = {
  setVolume,
  setMute,
  toggleMute,
  get volume() { return _volume; },
  get muted()  { return _muted;  },
};

window.GVol = GVol;
export default GVol;
