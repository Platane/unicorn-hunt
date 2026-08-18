// integer hash by Thomas Mueller
// note: the multiplications exceed 2**53, so the low bits are not exact
export const hashInt = (n: number) => {
  n = ((n >> 16) ^ n) * 0x45d9f3b;
  n = ((n >> 16) ^ n) * 0x45d9f3b;
  n = ((n >> 16) ^ n) >>> 0;
  return n;
};
