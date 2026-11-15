/** Nonempty triangle payload only; open surfaces remain supported. */
export function hasExportTriangles(positions: ArrayLike<number>, indices: ArrayLike<number>): boolean {
  return positions.length >= 9 && indices.length >= 3;
}
/** Binary STL must contain at least one complete triangle. */
export function hasStlTriangles(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 84) return false;
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  return count > 0 && bytes.byteLength === 84 + 50 * count;
}
