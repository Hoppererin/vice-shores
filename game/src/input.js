// Keyboard + pointer input. Held keys are read every step; one-shot actions
// (enter, punch, pause, confirm) are consumed once per press. In Node (no
// document) the module still imports fine and just reports nothing held.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  const input = {
    held,
    pressed,
    // Scripted drivers (shots / tests) write here; step() merges them in.
    script: null,
    isDown(name) {
      if (input.script && input.script.held && input.script.held.has(name)) return true;
      return held.has(name);
    },
    wasPressed(name) {
      if (input.script && input.script.pressed && input.script.pressed.has(name)) return true;
      return pressed.has(name);
    },
    // Axis in [-1, 1] for driving / walking.
    axisX() {
      return (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    },
    axisY() {
      return (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0);
    },
    endFrame() {
      pressed.clear();
      if (input.script) input.script.pressed = new Set();
    },
    attach() {
      if (typeof document === 'undefined') return;
      document.addEventListener('keydown', (e) => {
        const name = KEYMAP[e.code] || e.code;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }
        if (!e.repeat) pressed.add(name);
        held.add(name);
      });
      document.addEventListener('keyup', (e) => {
        held.delete(KEYMAP[e.code] || e.code);
      });
      document.addEventListener('blur', () => held.clear());
    },
  };
  return input;
}
