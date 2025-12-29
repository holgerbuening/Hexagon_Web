import type { Axial } from "./types";

// Convert axial hex (q,r) to pixel position (pointy-top)
export function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (3 / 2) * r;
  return { x, y };
}

// Convert pixel to axial hex (fractional), then round to nearest hex
export function pixelToAxial(x: number, y: number, size: number): Axial {
  // Inverse of axialToPixel for pointy-top
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;
  return axialRound({ q, r });
}

// Round fractional axial to integer axial using cube rounding
export function axialRound(frac: { q: number; r: number }): Axial {
  // Convert to cube coords
  let x = frac.q;
  let z = frac.r;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  // Fix the component with the largest rounding error
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

// Distance in axial coords
export function axialDistance(a: Axial, b: Axial): number {
  const ax = a.q, az = a.r, ay = -ax - az;
  const bx = b.q, bz = b.r, by = -bx - bz;
  return (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz)) / 2;
}
