import { PlayerInput } from "./types";

export const createKeyboardController = (registerInput: (i: PlayerInput) => void) => {
  let x = 0;
  let y = 0;

  const handle = (dir: 1 | -1) => (e: KeyboardEvent) => {
    const x0 = x;
    const y0 = y;

    switch (e.key) {
      case "ArrowUp":
        y = dir === -1 ? 0 : 1;
        break;
      case "ArrowDown":
        y = dir === -1 ? 0 : -1;
        break;
      case "ArrowLeft":
        x = dir === -1 ? 0 : -1;
        break;
      case "ArrowRight":
        x = dir === -1 ? 0 : 1;
        break;
    }

    if (x0 === x && y === y0) return;
    if (!x && !y) return;

    const angle = Math.round((Math.atan2(y, x) / (Math.PI * 2)) * 16);
    registerInput({ angle });
  };
  document.onkeydown = handle(1);
  document.onkeyup = handle(-1);
};
