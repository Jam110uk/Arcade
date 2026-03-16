// ============================================================
// BUBBLE GAME AUDIO  (bubbleaudio.js)
// Soft Web Audio tones — gentle, musical, never harsh.
// ============================================================
export class BubbleAudio {
  constructor() { this._ctx = null; }

  _ctx_get() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  // notes = [[freq, delaySec], ...]
  _play(notes, type = 'sine', dur = 0.13, vol = 0.18) {
    const ctx = this._ctx_get(); if (!ctx) return;
    notes.forEach(([freq, delay = 0]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  }

  pop(pitch = 1.0) {
    this._play([[500 * pitch, 0]], 'sine', 0.14, 0.16);
  }

  combo(count = 2) {
    const freqs = [480, 600, 720, 840, 960];
    const notes = freqs.slice(0, Math.min(count + 1, 5)).map((f, i) => [f, i * 0.065]);
    this._play(notes, 'sine', 0.13, 0.15);
  }

  powerup() {
    this._play([[523, 0], [659, 0.07], [784, 0.14], [1047, 0.21]], 'sine', 0.15, 0.14);
  }

  activate() {
    this._play([[784, 0], [1047, 0.09], [1319, 0.18]], 'triangle', 0.18, 0.13);
  }

  levelup() {
    this._play([[523,0],[659,0.07],[784,0.14],[1047,0.21],[1319,0.28]], 'sine', 0.20, 0.15);
  }

  gameover() {
    this._play([[440,0],[370,0.14],[311,0.28],[262,0.42]], 'sine', 0.22, 0.14);
  }
}
