# Handoff — CrowdyJS 15.8.0-dev.1 papercuts

Branch: `michael/js-papercuts-15.8` (off `origin/dev` `0f493dd`).
Not merged, not tagged, not pushed to `dev`/`test`/`prod`.

## Reconfirm (all still true on origin/dev before this branch)

- `setVoxel` sent `voxelState: ''` when `state` was omitted
- starter `Cargo.toml` had only `crowdy-compute-sdk`
- `PlayerCodeBroker` still uses `tickIntervalMs ?? 0` (unchanged; docs only)
- `refreshGameplayToken` did not wait for in-flight `sendActorUpdate`

## What landed

1. `ChunkStore.setVoxel` omits `voxelState` when `state` is undefined.
   `VoxelUpdateRequestInput.voxelState` is optional in `src/types.ts`.
   Generated GraphQL types still require `String!`; `UdpAPI.sendVoxelUpdate`
   accepts optional and casts at the request. Live ck-api is still `String!`
   until the sibling nullable change.
2. Starter `Cargo.toml` adds `serde_json = "1"`.
3. README + starter `on_tick` comments + rust-analysis hovers: the host only
   ticks when `tickIntervalMs` is set. `?? 0` is unchanged.
4. `UdpAPI` tracks in-flight `sendActorUpdate`. Refresh waits for those
   before `disconnect`. New UDP sends wait for `gameplayTokenRefresh`.
   Public `client.waitForGameplayTokenRefresh()`.

## Tests

`npm run test:unit` (build + 388 tests): 387 pass, 1 skip, 0 fail.
New coverage: `starter-projects.test.mjs`, stores no-state `voxelState`,
two offline gameplay-token-rotation cases.

## Next

Open a PR into `dev`. Do not tag until merged. After merge, update
`cks-project-root/project-root-docs/OPEN-ISSUES-2026-09-08.md` rows
`crowdyjs-tick-interval-default`, `crowdyjs-starter-cargo-toml-missing-serde-json`,
`crowdyjs-empty-voxel-state`, `crowdyjs-inflight-actor-update-across-rotation`.
`voxelState` omit still needs the ck-api nullable field on the live schema.
