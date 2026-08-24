# udpNotifications Subscription: No Notifications Delivered

> **HISTORICAL BUG REPORT — DO NOT RUN THE COMMANDS BELOW AS WRITTEN.** Every
> hostname on this page is `dev-webapi.crowdedkingdoms.com`, which is dead: it
> still resolves, to the legacy us-east-2 ALB, and answers **HTTP 503** from a
> load balancer with no targets (measured 2026-08-22). A 503 reads as a transient
> outage, so pasting the reproduction below gets you a failure that looks like the
> product rather than a failure that looks like a wrong address — which is the
> whole reason this banner is worth more than deleting the page.
>
> The live equivalent is the tier's single client origin, derived rather than
> typed. From the privileged wrapper checkout:
>
> ```bash
> . scripts/tier-facts.sh && tier_client_graphql dev   # dev | test | prod
> ```
>
> The account names below are also historical, and `asdfasdf` is not a password
> that exists on any tier today.

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

Run from the CrowdyJS SDK repo:

```bash
node test/two-client-actor-test.mjs \
  'michael+1@crowdedkingdoms.com' 'asdfasdf' \
  'michael+2@crowdedkingdoms.com' 'asdfasdf' \
  'https://dev-webapi.crowdedkingdoms.com/graphql'
```
