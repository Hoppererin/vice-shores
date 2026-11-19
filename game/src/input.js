// Keyboard + pointer input, rewritten for v5.3. In the browser it listens
// for keys and turns them into a plain state object the world steps from;
// in Node (smoke tests) the same shape is built by hand, so world.js
// never touches the DOM.
//
// Held keys: up/down/left/right/run. One-shot actions, true for exactly
// the step they were pressed in: enter (E), punch (F), pause (P or Esc),
// confirm (Enter), crew (C), districts (V), jobs (B), hack (H),
// fixer (G), wheelman (X), recruit1-6 (1-6). The main loop clears the
// one-shots after each fixed step, so a held key cannot fire twice.
//
// v5: crew menu (C), hacker jam (H), district panel (V), hire by number.
// v5.1: fixer launder (G), job board (B), a fourth recruit key.
// v5.2: wheelman swap (X), a fifth recruit key.
// v5.3: a sixth recruit key — the crew menu has six rows now, because
// Ivy the Lookout can be promoted to Spotter for a second fee, and the
// promotion is hired with the 6 key. Escape also pauses, because P alone
// is easy to miss mid-chase.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyE: 'enter',
  KeyF: 'punch',
  KeyP: 'pause',
  Escape: 'pause',
  Enter: 'confirm',
  // v5: crew menu (C), hacker jam (H), district panel (V), hire by number.
  // v5.1: fixer launder (G), job board (B), a fourth recruit key.
  // v5.2: wheelman swap (X), a fifth recruit key.
  // v5.3: a sixth recruit key — promote Ivy the Lookout to Spotter.
  KeyC: 'crew',
  KeyH: 'hack',
  KeyV: 'districts',
  KeyB: 'jobs',
  KeyG: 'fixer',
  KeyX: 'wheelman',
  Digit1: 'recruit1',
  Digit2: 'recruit2',
  Digit3: 'recruit3',
  Digit4: 'recruit4',
  Digit5: 'recruit5',
  Digit6: 'recruit6',
};

const ONE_SHOTS = new Set([
  'enter', 'punch', 'pause', 'confirm', 'crew', 'hack', 'districts',
  'jobs', 'fixer', 'wheelman', 'recruit1', 'recruit2', 'recruit3',
  'recruit4', 'recruit5', 'recruit6',
]);

export function createInput() {
  const input = {
    up: false, down: false, left: false, right: false, run: false,
    enter: false, punch: false, pause: false, confirm: false,
    crew: false, hack: false, districts: false, jobs: false, fixer: false,
    wheelman: false,
    recruit1: false, recruit2: false, recruit3: false, recruit4: false,
    recruit5: false, recruit6: false,
    // Pointer position in canvas pixels, for the title-screen click.
    pointerX: 0, pointerY: 0, pointerDown: false,
    attached: false,
  };

  // Attach DOM listeners only where a DOM exists.
  if (typeof window !== 'undefined' && window.addEventListener) {
    const down = (e) => {
      const name = KEYMAP[e.code];
      if (!name) return;
      if (['up', 'down', 'left', 'right'].includes(name)) e.preventDefault();
      // Repeat keydowns are ignored for one-shots: holding ENTER would
      // otherwise skip straight through the busted screen.
      if (ONE_SHOTS.has(name)) {
        if (!e.repeat) input[name] = true;
      } else {
        input[name] = true;
      }
      unlockAudioOnce();
    };
    const up = (e) => {
      const name = KEYMAP[e.code];
      if (!name || ONE_SHOTS.has(name)) return;
      input[name] = false;
    };
    const pointer = (e) => {
      input.pointerDown = true;
      if (e && typeof e.clientX === 'number') {
        input.pointerX = e.clientX;
        input.pointerY = e.clientY;
      }
      unlockAudioOnce();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('pointerdown', pointer);
    window.addEventListener('blur', () => {
      input.up = input.down = input.left = input.right = input.run = false;
    });
    input.attached = true;
  }
  return input;
}

// One-shot flags are consumed by the world step; call after each step.
export function clearPressed(input) {
  input.enter = false;
  input.punch = false;
  input.pause = false;
  input.confirm = false;
  input.crew = false;
  input.hack = false;
  input.districts = false;
  input.jobs = false;
  input.fixer = false;
  input.wheelman = false;
  input.recruit1 = false;
  input.recruit2 = false;
  input.recruit3 = false;
  input.recruit4 = false;
  input.recruit5 = false;
  input.recruit6 = false;
  input.pointerDown = false;
}

// A blank input for tests: every key up, no action pressed.
export function blankInput() {
  return {
    up: false, down: false, left: false, right: false, run: false,
    enter: false, punch: false, pause: false, confirm: false,
    crew: false, hack: false, districts: false, jobs: false, fixer: false,
    wheelman: false,
    recruit1: false, recruit2: false, recruit3: false, recruit4: false,
    recruit5: false, recruit6: false,
    pointerX: 0, pointerY: 0, pointerDown: false,
  };
}

// Audio unlocks on the first key press; input.js owns the hook so main.js
// does not have to wire it. The audio module registers the real handler.
let unlockAudioOnce = () => {};
export function onFirstKey(fn) {
  const prev = unlockAudioOnce;
  unlockAudioOnce = () => { prev(); fn(); unlockAudioOnce = () => {}; };
}
