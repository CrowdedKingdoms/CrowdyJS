# udpNotifications Subscription: No Notifications Delivered

## Problem

The `udpNotifications` subscription is accepted by the server (no errors), and `sendActorUpdate` mutations return `true`, but the subscription never receives any `next` messages. Zero notifications are delivered to WebSocket subscribers.

## Previous Issue (RESOLVED)

The subscription previously returned `Forbidden resource`. This was fixed by the server team (WebSocket auth guard issue).

## Environment

- Server: `https://dev-webapi.crowdedkingdoms.com/graphql`
- WebSocket: `wss://dev-webapi.crowdedkingdoms.com/graphql`
- Protocol: `graphql-transport-ws` subprotocol
- Message types: `connection_init` / `subscribe` / `next` / `complete`
- Test accounts: `michael+1@crowdedkingdoms.com` and `michael+2@crowdedkingdoms.com` (both confirmed, early access granted)

## Observed WebSocket Message Flow

```
Client → Server: {"type":"connection_init","payload":{"Authorization":"Bearer <token>"}}
Server → Client: {"type":"connection_ack","payload":{"token":"...","authorization":"Bearer ..."}}
Client → Server: {"id":"s1","type":"subscribe","payload":{"query":"subscription { udpNotifications { __typename ... } }"}}
(no response -- subscription silently accepted)

--- Actor updates sent via HTTP mutation ---
sendActorUpdate returns true (3 times)

--- No "next" messages ever arrive on the WebSocket ---

Server → Client: (connection closes with code 1005 when client disconnects)
```

## What works

- Login returns valid token
- `connectUdpProxy` returns `connected: true`
- WebSocket connects and authenticates (`connection_ack`)
- Subscription is accepted (no error returned)
- `sendActorUpdate` mutation returns `true`

## What fails

- The subscription never receives any `next` messages with notification payloads
- This happens with both cross-user updates (A sends, B subscribes) and self-subscription (A sends and subscribes)

## What to investigate

The pub/sub pipeline between `sendActorUpdate` and the `udpNotifications` subscription is broken. The mutation succeeds but the subscription resolver never emits a value. Please check:

1. Is `sendActorUpdate` actually publishing to the pub/sub channel (e.g., Redis, in-memory PubSub)?
2. Is the `udpNotifications` subscription resolver correctly listening on the same channel/topic?
3. Are there any filters in the subscription resolver (e.g., map ID, chunk coordinates) that might be filtering out the notifications?
4. Is the pub/sub system (Redis or in-memory) correctly configured and running in the dev environment?
5. Does the subscription resolver's `resolve` function correctly return the payload, or is it swallowing/transforming it into null?

## Reproducing

Run from the crowdyJS SDK repo:

```bash
node test/two-client-actor-test.mjs \
  'michael+1@crowdedkingdoms.com' 'asdfasdf' \
  'michael+2@crowdedkingdoms.com' 'asdfasdf' \
  'https://dev-webapi.crowdedkingdoms.com/graphql'
```
