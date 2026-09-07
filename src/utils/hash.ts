// integer hash by Thomas Mueller
// note: the multiplications exceed 2**53, so the low bits are not exact
export const hashInt = (n: number) => {
  n = ((n >> 16) ^ n) * 0x45d9f3b;
  n = ((n >> 16) ^ n) * 0x45d9f3b;
  n = ((n >> 16) ^ n) >>> 0;
  return n;
};

// mixed on the way out: the polynomial alone leaves ids that differ by one
// character one apart, and callers scattering by modulo would collide
export const hashString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return hashInt(h);
};
