import { PlayerInput } from "./types";

const GAMEPAD_DEAD_ZONE = 0.3;
const TOUCH_DEAD_ZONE = 30; // px
const TAP_MAX_DURATION = 200; // ms
const TAP_MAX_DISTANCE = 10; // px
const HUNTER_TAP_RADIUS = 40; // px

export const createKeyboardController = (
  registerInput: (i: PlayerInput) => void,
  getHunterScreenPos: () => [number, number] | undefined = () => undefined,
) => {
  let keyboardX = 0;
  let keyboardY = 1;

  let keyboardJumpDown = false;
  let gamepadJumpDown = false;

  let angle = Math.round((Math.atan2(keyboardY, keyboardX) / (Math.PI * 2)) * 16);

  let touch:
    | { x: number; y: number; startX: number; startY: number; startDate: number; onHunter: boolean }
    | undefined;

  const loop = () => {
    requestAnimationFrame(loop);

    // origin follows the hunter, recomputed every frame
    if (touch) {
      const p = getHunterScreenPos();

      if (p) {
        const x = touch.x - p[0];
        const y = p[1] - touch.y; // screen y goes down

        const newAngle =
          x * x + y * y < TOUCH_DEAD_ZONE * TOUCH_DEAD_ZONE
            ? angle
            : Math.round((Math.atan2(y, x) / (Math.PI * 2)) * 16);

        if (angle !== newAngle) {
          angle = newAngle;
          registerInput({ angle });
        }
      }
    }

    const g = navigator.getGamepads().find(Boolean);
    if (g) {
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
    }
  };

  const handle = (dir: 1 | -1) => (e: KeyboardEvent) => {
    let jump = undefined;

    switch (e.key) {
      case "ArrowUp":
        keyboardY = dir === -1 ? 0 : 1;
        e.preventDefault();
        break;
      case "ArrowDown":
        keyboardY = dir === -1 ? 0 : -1;
        e.preventDefault();
        break;
      case "ArrowLeft":
        keyboardX = dir === -1 ? 0 : -1;
        e.preventDefault();
        break;
      case "ArrowRight":
        keyboardX = dir === -1 ? 0 : 1;
        e.preventDefault();
        break;
      case " ":
        jump = dir === 1 && !keyboardJumpDown;
        keyboardJumpDown = dir === 1;
        e.preventDefault();
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

  document.ontouchstart = (e) => {
    const t = e.touches[0];
    const p = getHunterScreenPos();

    const dx = p ? t.clientX - p[0] : Infinity;
    const dy = p ? t.clientY - p[1] : Infinity;

    touch = {
      x: t.clientX,
      y: t.clientY,
      startX: t.clientX,
      startY: t.clientY,
      startDate: Date.now(),
      onHunter: dx * dx + dy * dy < HUNTER_TAP_RADIUS * HUNTER_TAP_RADIUS,
    };
  };

  document.ontouchmove = (e) => {
    const t = e.touches[0];

    if (!touch) return;

    touch.x = t.clientX;
    touch.y = t.clientY;
  };

  document.ontouchend = (e) => {
    const { startX, startY, startDate, onHunter } = touch ?? {};
    touch = undefined;

    if (!onHunter || Date.now() - startDate! > TAP_MAX_DURATION) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - startX!;
    const dy = t.clientY - startY!;

    if (dx * dx + dy * dy < TAP_MAX_DISTANCE * TAP_MAX_DISTANCE)
      registerInput({ angle, jump: true });
  };

  loop();
};
