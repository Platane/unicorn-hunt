export const createColorPalette = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;

  for (let i = 8; i--;) {
    ctx.fillStyle = `hsl(${i * 7},80%,50%)`;
    ctx.fillRect(i, 0, 1, 1);
  }

  for (let i = 8; i--;) {
    ctx.fillStyle = `hsl(${100 + i * 16},80%,50%)`;
    ctx.fillRect(i, 1, 1, 1);
  }

  for (let i = 8; i--;) {
    ctx.fillStyle = `hsl(${190 + i * 17},80%,50%)`;
    ctx.fillRect(i, 2, 1, 1);
  }

  canvas.style.position = "absolute";
  canvas.style.bottom = "0";
  canvas.style.left = "0";
  canvas.style.width = "160px";
  canvas.style.imageRendering = "pixelated";
  document.body.appendChild(canvas);

  return canvas;
};
