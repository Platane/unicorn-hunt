export const createSpriteSheet = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.scale(canvas.width, canvas.width);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${0.6}px monospace`;
  const N = 6;
  let contourFilter = "";

  for (let k = N; k--;) {
    const a = (k / N) * Math.PI * 2;
    const h = 10;
    const b = 0.1;
    contourFilter += `drop-shadow( ${Math.cos(a) * h}px ${Math.sin(a) * h}px ${b}px #fff)`;
  }

  ctx.filter = contourFilter;
  ctx.fillText(`🦄`, 0.5, 0.5);

  canvas.style.position = "absolute";
  canvas.style.bottom = "0";
  canvas.style.right = "0";
  document.body.appendChild(canvas);

  return canvas;
};
