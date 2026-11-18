// Synthesized WebAudio: engine hum, siren, jingles and a quiet bass loop.
// Every call is guarded — with no AudioContext (or before any key press)
// the game simply stays silent and keeps running.

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: 0,
    musicTimer: 0,
    musicStep: 0,
    enabled: false,
    ensure() {
      if (audio.ctx || typeof window === 'undefined') return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audio.ctx = new AC();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = 0.5;
        audio.master.connect(audio.ctx.destination);
        audio.enabled = true;
      } catch {
        audio.ctx = null;
      }
    },
    resume() {
      audio.ensure();
      if (audio.ctx && audio.ctx.state === 'suspended') {
        audio.ctx.resume().catch(() => {});
      }
    },
    tone(freq, dur, type, vol, when = 0, slideTo = null) {
      if (!audio.ctx || !audio.enabled) return;
      try {
        const t0 = audio.ctx.currentTime + when;
        const osc = audio.ctx.createOscillator();
        const g = audio.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(audio.master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      } catch { /* silent */ }
    },
    pickup() { audio.tone(660, 0.12, 'sine', 0.25); audio.tone(990, 0.18, 'sine', 0.25, 0.09); },
    cash() {
      audio.tone(880, 0.1, 'triangle', 0.3);
      audio.tone(1108, 0.1, 'triangle', 0.3, 0.08);
      audio.tone(1318, 0.22, 'triangle', 0.3, 0.16);
    },
    punch() { audio.tone(180, 0.09, 'square', 0.3, 0, 70); },
    crash() { audio.tone(120, 0.25, 'sawtooth', 0.35, 0, 45); },
    mission() {
      [523, 659, 784, 1046].forEach((f, i) => audio.tone(f, 0.16, 'triangle', 0.3, i * 0.11));
    },
    busted() { [392, 330, 262].forEach((f, i) => audio.tone(f, 0.3, 'sawtooth', 0.25, i * 0.22)); },
    engine(speedNorm) {
      if (!audio.ctx || !audio.enabled) return;
      try {
        if (!audio.engineOsc) {
          audio.engineOsc = audio.ctx.createOscillator();
          audio.engineGain = audio.ctx.createGain();
          audio.engineOsc.type = 'sawtooth';
          audio.engineOsc.frequency.value = 60;
          audio.engineGain.gain.value = 0;
          audio.engineOsc.connect(audio.engineGain);
          audio.engineGain.connect(audio.master);
          audio.engineOsc.start();
        }
        const target = speedNorm > 0.02 ? 0.05 + speedNorm * 0.05 : 0;
        audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.1);
        audio.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 140, audio.ctx.currentTime, 0.1);
      } catch { /* silent */ }
    },
    siren(on, dt) {
      if (!audio.ctx || !audio.enabled) return;
      try {
        if (on && !audio.sirenOsc) {
          audio.sirenOsc = audio.ctx.createOscillator();
          audio.sirenGain = audio.ctx.createGain();
          audio.sirenOsc.type = 'sine';
          audio.sirenGain.gain.value = 0.045;
          audio.sirenOsc.connect(audio.sirenGain);
          audio.sirenGain.connect(audio.master);
          audio.sirenOsc.start();
        }
        if (!on && audio.sirenOsc) {
          audio.sirenOsc.stop();
          audio.sirenOsc = null;
          audio.sirenGain = null;
          return;
        }
        if (audio.sirenOsc) {
          audio.sirenTimer += dt;
          const f = 700 + 320 * Math.sin(audio.sirenTimer * 4.2);
          audio.sirenOsc.frequency.setTargetAtTime(f, audio.ctx.currentTime, 0.05);
        }
      } catch { /* silent */ }
    },
    // Quiet two-note bass loop, stepped from the game loop.
    music(dt) {
      if (!audio.ctx || !audio.enabled) return;
      audio.musicTimer += dt;
      if (audio.musicTimer < 0.42) return;
      audio.musicTimer = 0;
      const bass = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4];
      const f = bass[audio.musicStep % bass.length];
      audio.musicStep++;
      audio.tone(f, 0.4, 'triangle', 0.07);
    },
  };
  return audio;
}
