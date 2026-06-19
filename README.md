# pulsar-to-nostr

A Node.js bridge that replays events from an [Apache Pulsar](https://pulsar.apache.org) topic into a [Nostr](https://github.com/nostr-protocol/nostr) relay over WebSocket.

It reads stored events from a Pulsar topic and publishes them to a Nostr relay (default `wss://saltivka.org`), in batches and with a configurable delay between them. The id of the last processed message is cached on disk (`cache/mid.hex`) so the bridge can resume where it left off instead of replaying everything; set `FORCE` to start over from the beginning.

This is the counterpart to [knowstr](https://github.com/viktorvsk/knowstr) (which aggregates Nostr events *into* Pulsar) — this tool streams them back *out* to a relay.

## Usage

```sh
npm install
node index.js
```

Or build and run the included `Dockerfile`.

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PULSAR_URL` | `pulsar://127.0.0.1:6650` | Pulsar service URL |
| `PULSAR_TOPIC` | — | Topic to read events from |
| `PULSAR_TOKEN` | — | Pulsar auth token (optional) |
| `RELAY_URL` | `wss://saltivka.org` | Destination Nostr relay |
| `BATCH_SIZE` | `1000` | Number of events to publish per batch |
| `DELAY` | `1000` | Delay between batches, in ms |
| `READ_TIMEOUT` | `5000` | Reader idle timeout, in ms (exits when the topic is drained) |
| `FORCE` | — | If set, ignores the resume cache and starts from the beginning |
