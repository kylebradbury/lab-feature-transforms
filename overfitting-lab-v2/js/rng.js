// Seeded random numbers. Every random choice in the lab (data, random
// features, challenge test sets) flows from here so results are reproducible.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash -> 32-bit unsigned int.
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Independent streams from one base seed, e.g. deriveSeed(705, 'test').
export function deriveSeed(base, tag) {
  return hashString(`${base}:${tag}`);
}

export function makeRng(seed) {
  const u = mulberry32(seed);
  let spare = null;
  const rng = {
    uniform: u,
    range: (a, b) => a + (b - a) * u(),
    int: (n) => Math.floor(u() * n),
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let r, x, y;
      do {
        x = 2 * u() - 1;
        y = 2 * u() - 1;
        r = x * x + y * y;
      } while (r >= 1 || r === 0);
      const f = Math.sqrt((-2 * Math.log(r)) / r);
      spare = y * f;
      return x * f;
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(u() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
  };
  return rng;
}
