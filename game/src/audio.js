// All sound is synthesized with WebAudio: no audio files, no network.
// Every call is guarded, so the game runs fine with audio off, blocked, or
// missing entirely. Audio only starts after a key press (the browser's
// autoplay rule), from the main loop's first user gesture.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = 0;
  let musicStep = 0;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
      started = true;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // A failed blip is never worth stopping the game for.
    }
  }

  // Quiet walking bassline: A minor, one note every half second.
  const BASSLINE = [55, 55, 65.41, 55, 49, 55, 82.41, 73.42];

  return {
    get ready() {
      return started;
    },
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    // Called every frame with the driving speed (0 on foot) and wanted level.
    update(dt, speed, wanted) {
      if (!ctx) return;
      try {
        const driving = speed > 1;
        engineGain.gain.value = driving ? 0.035 + Math.min(0.05, Math.abs(speed) / 9000) : 0;
        engineOsc.frequency.value = 46 + Math.abs(speed) * 0.14;
        if (wanted > 0) {
          sirenGain.gain.value = 0.028;
          sirenOsc.frequency.value = (Math.floor(performance.now() / 450) % 2 === 0) ? 660 : 880;
        } else {
          sirenGain.gain.value = 0;
        }
        musicTimer -= dt;
        if (musicTimer <= 0) {
          musicTimer = 0.5;
          blip(BASSLINE[musicStep % BASSLINE.length], 0.42, 'triangle', 0.045);
          musicStep += 1;
        }
      } catch {
        // Keep the game running if the audio graph misbehaves.
      }
    },
    pickup() { blip(880, 0.12, 'sine', 0.12, 1320); },
    cash() {
      blip(660, 0.1, 'sine', 0.12);
      setTimeout(() => blip(990, 0.16, 'sine', 0.12), 90);
    },
    punch() { blip(140, 0.09, 'square', 0.1, 70); },
    crash() { blip(90, 0.25, 'sawtooth', 0.14, 45); },
    mission() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'sine', 0.12), i * 110));
    },
    busted() {
      [392, 311, 233].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.12), i * 160));
    },
  };
}
