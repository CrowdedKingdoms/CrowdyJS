/**
 * `@crowdedkingdoms/crowdyjs/grid-program` — player-authored JS that uses the
 * full CrowdyJS SDK inside one grid (DN-10 §5).
 *
 * The program runs in a sandboxed, network-less iframe or worker and builds
 * its client with {@link createGridProgramClient}. The page runs
 * {@link hostGridProgram}, which relays that client's traffic with a
 * grid-scoped token, so the server confines the program to the grid no
 * matter what its code does.
 */
export * from './protocol.js';
export {
  createGridProgramClient,
  type GridProgramClient,
} from './program.js';
export {
  GridProgramHost,
  hostGridProgram,
  type GridProgramHostOptions,
  type HeldGridToken,
} from './host.js';
