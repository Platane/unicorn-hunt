import { PlayerInput } from "./types";

const GAMEPAD_DEAD_ZONE = 0.3;

export const createKeyboardController = (registerInput: (i: PlayerInput) => void) => {
  let keyboardX = 0;
  let keyboardY = 1;

  let gamepadJumpDown = false;

  let angle = Math.round((Math.atan2(keyboardY, keyboardX) / (Math.PI * 2)) * 16);

  const loop = () => {
    requestAnimationFrame(loop);

    const g = navigator.getGamepads().find(Boolean);
    if (!g) return;

    const x = g.axes[0] || 0;
    const y = -g.axes[1] || 0;

    const pressed = !!g.buttons[0]?.pressed;
    const jump = pressed && !gamepadJumpDown;
    gamepadJumpDown = pressed;

    const newAngle =
      x * x + y * y < GAMEPAD_DEAD_ZONE * GAMEPAD_DEAD_ZONE
        ? angle
        : Math.round((Math.atan2(y, x) / (Math.PI * 2)) * 16);

    if (angle === newAngle && !jump) return;

    angle = newAngle;
    registerInput({ angle, jump });
  };
  loop();

  const handle = (dir: 1 | -1) => (e: KeyboardEvent) => {
    let jump = undefined;

    switch (e.key) {
      case "ArrowUp":
        keyboardY = dir === -1 ? 0 : 1;
        break;
      case "ArrowDown":
        keyboardY = dir === -1 ? 0 : -1;
        break;
      case "ArrowLeft":
        keyboardX = dir === -1 ? 0 : -1;
        break;
      case "ArrowRight":
        keyboardX = dir === -1 ? 0 : 1;
        break;
      case " ":
        jump = dir === 1;
        break;
    }

    const newAngle =
      !keyboardX && !keyboardY
        ? angle
        : Math.round((Math.atan2(keyboardY, keyboardX) / (Math.PI * 2)) * 16);

    if (angle === newAngle && !jump) return;

    angle = newAngle;
    registerInput({ angle, jump });
  };

  document.onkeydown = handle(1);
  document.onkeyup = handle(-1);
};
