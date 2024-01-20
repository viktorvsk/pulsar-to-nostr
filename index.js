const fs = require("node:fs");
const Pulsar = require("pulsar-client");
const WebSocket = require("ws");

const MID_CACHE_PATH = "./cache/mid.hex";
const READ_TIMEOUT = parseInt(process.env.READ_TIMEOUT || 5000);
const RELAY_URL = process.env.RELAY_URL || "wss://saltivka.org";
const PULSAR_URL = process.env.PULSAR_URL || "pulsar://127.0.0.1:6650";
const PULSAR_TOKEN = process.env.PULSAR_TOKEN;
const PULSAR_TOPIC = process.env.PULSAR_TOPIC;
const CLIENT_PARAMS = {
  serviceUrl: PULSAR_URL,
  operationTimeoutSeconds: 30,
  authentication: PULSAR_TOKEN ? new Pulsar.AuthenticationToken({ token: PULSAR_TOKEN }) : undefined,
};
const client = new Pulsar.Client(CLIENT_PARAMS);
const FORCE = process.env.FORCE;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || 1000);
const DELAY = parseInt(process.env.DELAY || 1000);
const SIGNALS = [`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `SIGTERM`];

try {
  if (FORCE) {
    fs.unlinkSync(MID_CACHE_PATH);
  }
} catch (e) {}

(async () => {
  let exiting;
  let msg;
  let currentMessageId;
  let timeout;
  let reader;
  let ws;
  let delay;
  const events = {};
  let inProgress = [];

  const cleanupAndExit = async (eventType) => {
    const exitMsg = eventType || "Exiting because of reader timeout";
    console.log(exitMsg);
    if (exiting) {
      return;
    }
    exiting = true;
    if (currentMessageId) {
      fs.writeFileSync(MID_CACHE_PATH, currentMessageId);
    }
    // if (reader && reader.isConnected()) {
    //   console.log("Closing reader");
    //   await reader.close().catch(console.error);
    //   console.log("Closed reader");
    // }
    console.log("Closing client");
    await client?.close()?.catch(console.error);
    console.log("Closed client");
    process.exit();
  };

  SIGNALS.forEach((eventType) => {
    process.on(eventType, cleanupAndExit.bind(null, eventType));
  });

  ws = new WebSocket(RELAY_URL);

  ws.on("close", cleanupAndExit);
  ws.on("error", cleanupAndExit);
  ws.on("unexpected-response", cleanupAndExit);

  process
    .on("unhandledRejection", (reason, p) => {
      console.error(reason, "Unhandled Rejection at Promise", p);
    })
    .on("uncaughtException", (err) => {
      console.error(err, "Uncaught Exception thrown");
      cleanup("uncaughtException");
      process.exit(1);
    });

  try {
    currentMessageId = fs.readFileSync(MID_CACHE_PATH).toString();
    console.log(`Starting with message ${currentMessageId}`)
  } catch (e) {
    if (!e.message.match(/^ENOENT/)) {
      console.log(e);
    }
  }

  const mid = currentMessageId ? Pulsar.MessageId.deserialize(Buffer.from(currentMessageId, "hex")) : Pulsar.MessageId.earliest();

  let connectedSuccessfully;
  const isRelayConnected = new Promise((res, rej) => {
    connectedSuccessfully = res;
  });

  ws.on("message", (data) => {
    const command = JSON.parse(data);

    if (command[0] === "OK") {
      const eventId = command[1];
      const isSuccess = command[2];
      isSuccess ? events[eventId].res() : events[eventId].rej();
    }
  });

  ws.on("open", connectedSuccessfully);

  await isRelayConnected;
  reader = await client
    .createReader({
      topic: PULSAR_TOPIC,
      startMessageId: mid,
    })
    .catch(console.error);

  timeout = setTimeout(cleanupAndExit, READ_TIMEOUT);

  while ((msg = await reader.readNext())) {
    if (exiting) {
      break;
    }
    const atStart = Date.now();
    clearTimeout(timeout);
    timeout = setTimeout(cleanupAndExit, READ_TIMEOUT);
    const payload = msg.getData().toString();
    const event = JSON.parse(payload);
    
    const pr = new Promise((res, rej) => {
      events[event.id] = { res, rej };
    }).catch(console.error);

    ws.send(JSON.stringify(["EVENT", event]));
    inProgress.push(pr);

    if (inProgress.length === BATCH_SIZE) {
      await Promise.allSettled(inProgress);
      currentMessageId = msg.getMessageId().serialize().toString("hex");
      inProgress = [];
      const delta = Date.now() - atStart;
      if (delta < DELAY) {
        await new Promise((res, rej) => setTimeout(res, DELAY - delta));
      }
    }
  }
})();
