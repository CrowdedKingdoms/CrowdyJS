/**
 * Chunk/voxel coordinate math shared by the World Stores — the helpers every
 * voxel game re-derives (chunk keys, world→chunk mapping, the 4096-slot voxel
 * index). A chunk is a 16×16×16 voxel cube addressed by signed-int64 chunk
 * coordinates (decimal strings on the wire).
 */

import type { ChunkCoordinatesInput } from '../generated/graphql.js';

/** Voxels per chunk axis. */
export const CHUNK_SIZE = 16;
/** Voxels per chunk (16³) — the length of a dense voxel array. */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

/** A chunk coordinate with numeric axes (convenient client-side form). */
export interface ChunkCoord {
  x: number;
  y: number;
  z: number;
}

/** The stable string key a chunk is cached under: `"x:y:z"`. */
export function chunkKey(coord: ChunkCoord | ChunkCoordinatesInput): string {
  return `${coord.x}:${coord.y}:${coord.z}`;
}

/** Parse a {@link chunkKey} back into numeric coordinates. */
export function parseChunkKey(key: string): ChunkCoord {
  const [x, y, z] = key.split(':').map(Number);
  return { x, y, z };
}

/** Convert a numeric chunk coordinate to the wire form (decimal strings). */
export function toChunkInput(coord: ChunkCoord): ChunkCoordinatesInput {
  return { x: String(coord.x), y: String(coord.y), z: String(coord.z) };
}

/** Convert a wire chunk coordinate (decimal strings) to numeric form. */
export function fromChunkInput(coord: ChunkCoordinatesInput): ChunkCoord {
  return { x: Number(coord.x), y: Number(coord.y), z: Number(coord.z) };
}

/** The chunk containing a world-space position. */
export function worldToChunk(x: number, y: number, z: number): ChunkCoord {
  return {
    x: Math.floor(x / CHUNK_SIZE),
    y: Math.floor(y / CHUNK_SIZE),
    z: Math.floor(z / CHUNK_SIZE),
  };
}

/** The within-chunk voxel coordinate (0-15 per axis) of a world position. */
export function worldToLocalVoxel(
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const mod = (n: number) => ((Math.floor(n) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { x: mod(x), y: mod(y), z: mod(z) };
}

/**
 * The dense-array index of a within-chunk voxel coordinate:
 * `x + y*16 + z*256` (the platform's chunk `voxels` layout).
 */
export function voxelIndex(x: number, y: number, z: number): number {
  return x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE;
}

/** Invert {@link voxelIndex} back to within-chunk coordinates. */
export function voxelCoordFromIndex(index: number): { x: number; y: number; z: number } {
  return {
    x: index % CHUNK_SIZE,
    y: Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE,
    z: Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)),
  };
}

/**
 * Every chunk coordinate within a Chebyshev radius of `center` (the cube
 * `(2r+1)³`, matching `chunks.byDistance` semantics), center first.
 */
export function chunksAround(center: ChunkCoord, radius: number): ChunkCoord[] {
  const out: ChunkCoord[] = [center];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        out.push({ x: center.x + dx, y: center.y + dy, z: center.z + dz });
      }
    }
  }
  return out;
}

/** Chebyshev (chunk-grid) distance between two chunk coordinates. */
export function chunkDistance(a: ChunkCoord, b: ChunkCoord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}
