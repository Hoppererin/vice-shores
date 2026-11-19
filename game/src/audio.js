// All sound is synthesized with WebAudio: an engine hum that follows the
// car's speed, a two-tone police siren, short jingles for pickups, cash,
// punches and crashes, and a quiet bassline loop. Everything is guarded, so
// the game runs fine with no audio device and no user gesture yet — audio
// only starts after the first key press (see unlock()).
//
// v5.1 adds four sounds: the PIT spin (a low grinding whine), the spike
// strip (a sharp metallic pop), the fixer's launder (a soft two-note
// chime) and the job board (a paper-ish click as a side job pins up).

export function createAudio() {
  const stub = {
    unlock() {}, setEngine() {}, siren() {},
    pickup() {}, cash() {}, punch() {}, crash() {}, jingle() {}, mission() {},
    // v5: dispatch radio blip, hacker jam warble, crew hire chime.
    dispatch() {}, hack() {}, recruit() {},
    // v5.1: PIT spin, spike strip, fixer launder, job board pin.
    pit() {}, spike() {}, launder() {}, sidejob() {},
  };
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return stub; // Node / no audio: silent no-ops.
  }

  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new window.AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  // Short tone helper: a single oscillator blip with an envelope.
  function blip(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function startEngine() {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function startSiren() {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 660;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  }

  // A slow, quiet bassline: root notes walking a minor groove.
  function startMusic() {
    const notes = [55, 55, 65.41, 49, 55, 55, 73.42, 65.41];
    let i = 0;
    musicTimer = window.setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      blip(notes[i % notes.length], 0.42, 'triangle', 0.05);
      blip(notes[i % notes.length] * 2, 0.2, 'sine', 0.02);
      i++;
    }, 420);
  }

  return {
    unlock() {
      if (unlocked) return;
      unlocked = true;
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      startEngine();
      startSiren();
      startMusic();
    },
    // speed01: 0..1 of top speed. Silent when parked.
    setEngine(speed01) {
      if (!ctx || !engineOsc) return;
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = speed01 > 0.02 ? 0.03 + speed01 * 0.05 : 0.0;
    },
    // on: siren audible while wanted. The two tones alternate by time.
    siren(on, time) {
      if (!ctx || !sirenOsc) return;
      sirenGain.gain.value = on ? 0.035 : 0.0;
      if (on) sirenOsc.frequency.value = Math.floor(time * 2) % 2 === 0 ? 660 : 520;
    },
    pickup() { blip(880, 0.12, 'sine', 0.12); blip(1318, 0.18, 'sine', 0.12, 0.09); },
    cash() {
      blip(1046, 0.1, 'square', 0.07);
      blip(1318, 0.1, 'square', 0.07, 0.09);
      blip(1568, 0.22, 'square', 0.07, 0.18);
    },
    punch() { blip(140, 0.12, 'square', 0.16, 0, 60); },
    crash() { blip(90, 0.3, 'sawtooth', 0.2, 0, 40); },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.16, 'triangle', 0.1, i * 0.11));
    },
    mission() {
      blip(392, 0.14, 'triangle', 0.1);
      blip(523, 0.14, 'triangle', 0.1, 0.12);
      blip(659, 0.24, 'triangle', 0.1, 0.24);
    },
    // Dispatch radio: two short squelch blips.
    dispatch() { blip(1200, 0.06, 'square', 0.05); blip(900, 0.08, 'square', 0.05, 0.08); },
    // Hacker jam: a quick descending warble.
    hack() {
      blip(1400, 0.1, 'sawtooth', 0.07, 0, 500);
      blip(1100, 0.1, 'sawtooth', 0.07, 0.1, 400);
      blip(800, 0.16, 'sawtooth', 0.07, 0.2, 300);
    },
    // Hiring a crew member: a warm little major chime.
    recruit() {
      blip(523, 0.12, 'triangle', 0.1);
      blip(659, 0.12, 'triangle', 0.1, 0.1);
      blip(784, 0.2, 'triangle', 0.1, 0.2);
    },
    // v5.1: the PIT spin — a low grinding whine as the car is spun out.
    pit() { blip(180, 0.35, 'sawtooth', 0.18, 0, 60); },
    // v5.1: the spike strip — a sharp metallic pop as the tyres blow.
    spike() { blip(1600, 0.1, 'square', 0.14, 0, 400); },
    // v5.1: the fixer's launder — a soft two-note chime, heat washing off.
    launder() {
      blip(523, 0.18, 'sine', 0.1);
      blip(1046, 0.24, 'sine', 0.1, 0.16);
    },
    // v5.1: the job board — a paper-ish click as the side job pins up.
    sidejob() { blip(700, 0.08, 'triangle', 0.1, 0, 900); },
  };
}
