import modelBinUrl from "../../assets/models.bin" with { type: "file" };

export const getModelsGeometry = async () => {
  const res = await fetch(modelBinUrl);
  const view = new DataView(await res.arrayBuffer());

  const n = view.getUint8(0);

  let offset = 1 + (1 + 2 + 3 * 2 * 2) * n;
  const models = Array.from({ length: n }, (_, i) => {
    const triangleCount = view.getUint16(1 + i * (1 + 2 + 3 * 2 * 2) + 0);
    const bonesCount = view.getUint8(1 + i * (1 + 2 + 3 * 2 * 2) + 2);
    const bbboxMin = [
      view.getFloat16(1 + i * (1 + 2 + 3 * 2 * 2) + 3 + 0 * 2),
      view.getFloat16(1 + i * (1 + 2 + 3 * 2 * 2) + 3 + 1 * 2),
      view.getFloat16(1 + i * (1 + 2 + 3 * 2 * 2) + 3 + 2 * 2),
    ];
    const bbboxSize = [
      view.getFloat16(1 + i * (1 + 2 + 3 * 2 * 2) + 3 + 3 * 2),
      view.getFloat16(1 + i * (1 + 2 + 3 * 2 * 2) + 3 + 4 * 2),
      view.getFloat16(1 + i * (1 + 2 + 3 * 2 * 2) + 3 + 5 * 2),
    ];
    const indexes = new Uint8Array(view.buffer, offset, triangleCount * 3);
    offset += triangleCount * 3;
    const vertexCount = indexes.reduce((max, i) => Math.max(max, i)) + 1;

    const positions = new Float32Array(vertexCount * 3);

    return { triangleCount, bonesCount, vertexCount, indexes, positions, bbboxSize, bbboxMin };
  });
  for (const model of models) {
    for (let i = model.positions.length; i--;) {
      model.positions[i] =
        (view.getUint8(offset + i) / 255) * model.bbboxSize[i % 3] + model.bbboxMin[i % 3];
    }
    offset += model.positions.length;
  }

  return models;
};
