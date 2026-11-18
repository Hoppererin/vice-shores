// Keyboard + pointer input. In the browser it listens for keys and turns
// them into a plain state object the world steps from; in Node (smoke
// tests) the same shape is built by hand, so world.js never touches the DOM.
//
// Held keys: up/down/left/right/run. One-shot actions, true for exactly the
// step they were pressed in: enter (E), punch (F), pause (P), confirm
// (Enter). The main loop clears the one-shots after each fixed step.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyE: 'enter',
  KeyF: 'punch',
  KeyP: 'pause',
  Enter: 'confirm',
};

export function createInput() {
  const input = {
    up: false, down: false, left: false, right: false, run: false,
    enter: false, punch: false, pause: false, confirm: false,
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
      if (name === 'enter' || name === 'punch' || name === 'pause' || name === 'confirm') {
        if (!e.repeat) input[name] = true;
      } else {
        input[name] = true;
      }
      unlockAudioOnce();
    };
    const up = (e) => {
      const name = KEYMAP[e.code];
      if (!name) return;
      if (name === 'enter' || name === 'punch' || name === 'pause' || name === 'confirm') return;
      input[name] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
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
  input.pointerDown = false;
}

// A blank input for tests: every key up, no action pressed.
export function blankInput() {
  return {
    up: false, down: false, left: false, right: false, run: false,
    enter: false, punch: false, pause: false, confirm: false,
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
