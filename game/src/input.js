// Keyboard input. Held keys give a steering direction; one-shot presses
// (enter a car, punch, start, pause) are queued by key code and taken once,
// so a press between two frames is never lost and never counted twice.
// The world only ever sees this small interface, which the headless tests
// can fake with a plain object of the same shape.
const DIRECTIONS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export function createInput(target) {
  const held = new Set();
  const pressed = new Set();

  function onKeyDown(event) {
    const dir = DIRECTIONS[event.code];
    if (dir) {
      held.add(dir);
      event.preventDefault();
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      held.add('run');
      return;
    }
    if (!event.repeat) pressed.add(event.code);
    if (['Space', 'Enter', 'KeyE', 'KeyF', 'KeyP'].includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    const dir = DIRECTIONS[event.code];
    if (dir) held.delete(dir);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.delete('run');
  }

  function onBlur() {
    held.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  if (target) {
    target.addEventListener('pointerdown', () => pressed.add('Enter'));
  }

  return {
    isDown(name) {
      return held.has(name);
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    axisX() {
      return (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    },
    axisY() {
      return (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
    },
    // Drop the one-shot presses at the end of each frame.
    endFrame() {
      pressed.clear();
    },
  };
}
