import "./styles.css";
import { RACE_LENGTH } from "./state/map";
import { getHunterColor } from "../renderer/geometries/colorPatette";
import type { WorldSnapshot } from "./state/types";

// min distance between two pins, in px. slightly bigger than the pin drawn in styles.css
const PIN = 12;

/**
 * race bar, one pin per hunter at their progress
 * lives outside #u, which the debug text rewrites every frame
 */
export const createGameUi = () => {
  const bar = document.createElement("div");
  bar.className = "bar";
  document.body.appendChild(bar);

  const update = (snapshot: WorldSnapshot | undefined, playerId: string) => {
    bar.hidden = !snapshot;
    if (!snapshot) return;

    const hunters = snapshot.hunters;
    const n = hunters.length;

    while (bar.children.length < n) bar.appendChild(document.createElement("i"));
    while (bar.children.length > n) bar.lastChild!.remove();

    const height = bar.clientHeight;

    const placed: [number, number][] = [];

    // current player first, so their pin stays on the bar
    const meIndex = hunters.findIndex((h) => h.id === playerId);
    const me = Math.max(0, meIndex);

    for (let k = 0; k < n; k++) {
      const i = (me + k) % n;
      const y = Math.min(1, Math.max(0, hunters[i].p[1] / RACE_LENGTH)) * height;

      let ax = 0;
      let bx = n * PIN;
      for (let s = 8; s--;) {
        const ex = (ax + bx) / 2;
        const hit = placed.some(
          ([px, py]) => (px - ex) * (px - ex) + (py - y) * (py - y) < PIN * PIN,
        );
        if (hit) ax = ex;
        else bx = ex;
      }

      const ex = (ax + bx) / 2;
      placed.push([ex, y]);

      const pin = bar.children[i] as HTMLElement;
      pin.style.transform = `translate(${-ex}px,${-y}px)`;
      pin.style.background = getHunterColor(i);
      pin.classList.toggle("me", i === meIndex);
    }
  };

  return { update };
};
