export const createSpriteSheet = () => {
  const canvas = document.createElement("canvas");
  const L = 128;
  canvas.width = 4 * L;
  canvas.height = L;
  const ctx = canvas.getContext("2d")!;

  ctx.scale(L, L);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${0.6}px monospace`;
  const N = 6;
  let contourFilter = "";

  for (let k = N; k--;) {
    const a = (k / N) * Math.PI * 2;
    const h = 4;
    const b = 0.2;
    contourFilter += `drop-shadow( ${Math.cos(a) * h}px ${Math.sin(a) * h}px ${b}px #fff)`;
  }

  ctx.filter = contourFilter;
  ctx.fillText(`🦄`, 0.5, 0.5);
  ctx.fillText(`🌈`, 1.5, 0.5);
  ctx.fillText(`⭐️`, 2.5, 0.5);
  ctx.fillText(`📦`, 3.5, 0.5);

  canvas.style.position = "absolute";
  canvas.style.bottom = "0";
  canvas.style.right = "0";
  document.body.appendChild(canvas);

  return canvas;
};
