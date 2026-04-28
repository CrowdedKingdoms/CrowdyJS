# CrowdyJS v3 Migration Notes

CrowdyJS v3 is a breaking rewrite focused on browser game clients.

## Main Changes

- Use `createCrowdyClient()` or `new CrowdyClient()` with `httpUrl` and `wsUrl`.
- Use `client.auth.login({ email, password })` instead of `client.login(email, password)`.
- Use `client.udp.subscribe({ actorUpdate })` instead of `client.onActorUpdate(...)`.
- Use `client.udp.sendActorUpdate(...)` or `client.udp.sendActorUpdateAndWait(...)` instead of root-level send methods.
- Use `client.udp.disconnect()` instead of `client.disconnectUdpProxy()`.
- Use `client.session` for token restore, manual token injection, and token persistence.
- Use `client.realtime.onStatus()` for connection state and reconnect visibility.
- Import generated operation documents from `@crowdedkingdomstudios/crowdyjs/generated`.

## API Field Renames

- `CreateGridInput.app_id` is now `CreateGridInput.appId`.
- `TeleportRequestInput.UUID` is now `TeleportRequestInput.uuid`.
- `connectUdpProxy` takes no input.

## Error Handling

GraphQL failures now throw `CrowdyGraphQLError`, preserving every GraphQL error
including `path` and `extensions.code`. Realtime failures use
`CrowdyRealtimeError` and subscription-level `RealtimeConnectionEvent` payloads.
