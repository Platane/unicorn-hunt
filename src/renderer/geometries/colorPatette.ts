import { hashInt } from "../../utils/hash";

export const createColorPalette = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;

  //
  // rainbow and ground
  for (let i = 16; i--;) {
    ctx.fillStyle = `hsl(${120 + i * 4.8},80%,50%)`;
    ctx.fillRect(i, 0, 1, 1);
  }
  const colors = [10, 42, 60, 128, 200];
  for (let i = colors.length; i--;) {
    ctx.fillStyle = `hsl(${colors[i]},100%,55%)`;
    ctx.fillRect(15 - i, 0, 1, 1);
    for (let j = UNICORN_VARIANTS.length; j--;) {
      ctx.fillRect(i + 1, UNICORN_VARIANTS[j], 1, 1);
    }
  }

  //
  // hunter palette

  // ctx.fillRect(5, HUNTERS_VARIANTS[0], 1, 3);
  {
    const N = HUNTERS_VARIANTS.at(-1)! - HUNTERS_VARIANTS[0];
    ctx.fillStyle = "#fff";
    ctx.fillRect(6, HUNTERS_VARIANTS[0], 1, N);
    ctx.fillStyle = "#333";
    ctx.fillRect(5, HUNTERS_VARIANTS[0], 1, N);

    for (let i = N; i--;) {
      // shirt
      ctx.fillStyle = getHunterColor(i);
      ctx.fillRect(2, HUNTERS_VARIANTS[i], 1, 1);
      ctx.fillStyle = `hsl(${(i / N) * 360 + 10},100%,60%)`;
      ctx.fillRect(1, HUNTERS_VARIANTS[i], 1, 1);
      // pants
      ctx.fillStyle = `hsl(${(i / N) * 360 + 15},100%,30%)`;
      ctx.fillRect(4, HUNTERS_VARIANTS[i], 1, 1);

      // hair
      ctx.fillStyle = ["#895c28", "#e0a023", "#d7c437"][hashInt(i + 11) % 3];
      ctx.fillRect(3, HUNTERS_VARIANTS[i], 1, 1);

      // skin
      ctx.fillStyle = ["#e5ccc4", "#c5ad7c", "#ded380"][hashInt(i) % 3];
      ctx.fillRect(0, HUNTERS_VARIANTS[i], 1, 1);
    }
  }

  //
  // unicorn
  ctx.fillStyle = "#ffe";
  ctx.fillRect(6, UNICORN_VARIANTS[0], 1, 1);
  ctx.fillStyle = "#d9f4ff";
  ctx.fillRect(6, UNICORN_VARIANTS[1], 1, 1);
  ctx.fillStyle = "#e9c5dd";
  ctx.fillRect(6, UNICORN_VARIANTS[2], 1, 1);
  ctx.fillStyle = "#553b11";
  ctx.fillRect(7, UNICORN_VARIANTS[0], 1, 3);
  ctx.fillStyle = "#755219";
  ctx.fillRect(7, UNICORN_VARIANTS[0], 1, 3);
  ctx.fillStyle = "#fff";
  ctx.fillRect(8, UNICORN_VARIANTS[0], 1, 3);
  ctx.fillStyle = "#333";
  ctx.fillRect(0, UNICORN_VARIANTS[0], 1, 3);

  //
  // bushes
  for (let i = BUSHES_VARIANTS.length; i--;) {
    for (let j = 8; j--;) {
      ctx.fillStyle = `hsl(${100 + j * 11 + i * 20},80%,50%)`;
      ctx.fillRect(j, BUSHES_VARIANTS[i], 1, 1);
    }
  }

  //
  // obstacles
  for (let i = OBSTACLES_VARIANTS.length; i--;) {
    for (let j = 8; j--;) {
      ctx.fillStyle = `hsl(${-7 + j * 8 + i * 18},80%,40%)`;
      ctx.fillRect(j, OBSTACLES_VARIANTS[i], 1, 1);
    }
  }

  canvas.style.position = "absolute";
  canvas.style.bottom = "0";
  canvas.style.right = "0";
  canvas.style.width = "64px";
  canvas.style.imageRendering = "pixelated";
  document.body.appendChild(canvas);

  return canvas;
};

export const UNICORN_VARIANTS = [1, 2, 3];
export const HUNTERS_VARIANTS = [4, 5, 6, 7, 8, 9];
export const BUSHES_VARIANTS = [10, 11, 12];
export const OBSTACLES_VARIANTS = [13, 14, 15];

export const getHunterColor = (i: number) =>
  `hsl(${((i % HUNTERS_VARIANTS.length) / HUNTERS_VARIANTS.length) * 360},100%,50%)`;
