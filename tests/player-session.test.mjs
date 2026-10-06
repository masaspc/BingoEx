import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { after, afterEach, before, beforeEach, test } from "node:test";

// Reuse the application's client dependency without adding a test package.
const require = createRequire(
  new URL("../client/package.json", import.meta.url),
);
const { io } = require("socket.io-client");
const cwd = new URL("..", import.meta.url);
const sockets = new Set();
let server;
let url;
let host;

function waitForEvent(target, event, predicate = () => true, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const handler = (value) => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      target.off(event, handler);
      resolve(value);
    };
    target.on(event, handler);
  });
}

async function action(
  socket,
  event,
  payload,
  response,
  target = socket,
  predicate,
) {
  const pending = waitForEvent(target, response, predicate);
  socket.emit(event, payload);
  return pending;
}

async function connect() {
  const socket = io(url, {
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
  });
  sockets.add(socket);
  const pending = waitForEvent(socket, "connect");
  socket.connect();
  await pending;
  return socket;
}

async function joinPlayer(socket, payload = { name: "参加者" }) {
  return action(socket, "player:join", payload, "player:joined");
}

function credentials(joined) {
  return { playerId: joined.playerId, token: joined.token, name: joined.name };
}

async function configureGame(names = ["景品"]) {
  await action(
    host,
    "host:setPrizeCount",
    { count: names.length },
    "host:update",
    host,
    (state) =>
      state.phase === "prizeInput" && state.prizeCount === names.length,
  );
  await action(
    host,
    "host:setPrizeNames",
    { names },
    "host:update",
    host,
    (state) => state.phase === "playing",
  );
}

async function hostSnapshot() {
  return action(host, "host:join", {}, "host:update");
}

async function displaySnapshot(viewer) {
  return action(viewer, "display:join", {}, "display:update");
}

before(async () => {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server/index.js"], {
    cwd,
    // An isolated test server never reads or changes the running event's state.
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOST_PASSWORD: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Server startup timed out: ${output}`)),
      6000,
    );
    server.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("BingoEx server listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on("data", (chunk) => {
      output += chunk;
    });
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with code ${code}: ${output}`));
    });
  });
  const health = await fetch(`${url}/api/health`).then((response) =>
    response.json(),
  );
  assert.deepEqual(health, {
    ok: true,
    name: "BingoEx server",
    phase: "setup",
  });
});

beforeEach(async () => {
  host = await connect();
  await action(host, "host:join", {}, "host:authOk");
  await action(
    host,
    "host:reset",
    {},
    "host:update",
    host,
    (state) => state.phase === "setup" && state.players.length === 0,
  );
});

afterEach(() => {
  for (const socket of sockets) socket.disconnect();
  sockets.clear();
});

after(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
});

test("two queued fresh joins on one socket create one identity and one card", async () => {
  const player = await connect();
  const joinedResponses = [];
  const responses = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      player.off("player:joined", handler);
      reject(new Error("Timed out waiting for both fresh join responses"));
    }, 6000);
    const handler = (joined) => {
      joinedResponses.push(joined);
      if (joinedResponses.length === 2) {
        clearTimeout(timer);
        player.off("player:joined", handler);
        resolve();
      }
    };
    player.on("player:joined", handler);
  });
  player.emit("player:join", { playerId: null, token: null, name: "二重参加" });
  player.emit("player:join", { playerId: null, token: null, name: "二重参加" });
  await responses;
  assert.deepEqual(joinedResponses[0], joinedResponses[1]);
  assert.equal(joinedResponses[0].won, null);
  assert.equal(joinedResponses[0].card.length, 5);
  assert.equal(joinedResponses[0].card[2][2].free, true);
  const results = await action(
    host,
    "host:exportResults",
    {},
    "host:resultsData",
  );
  assert.equal(results.totalPlayers, 1);
});

test("valid reconnect preserves card, identity, playing name and latest drawn state", async () => {
  const original = await connect();
  const joined = await joinPlayer(original, { name: "変更しない名前" });
  await configureGame();
  const drawn = await action(
    host,
    "host:draw",
    {},
    "host:update",
    host,
    (state) => state.drawnNumbers.length === 1,
  );
  const disconnected = waitForEvent(
    host,
    "host:update",
    (state) => !state.players[0].connected,
  );
  original.disconnect();
  await disconnected;

  const replacement = await connect();
  const statePending = waitForEvent(replacement, "state:update");
  const restored = await joinPlayer(replacement, {
    ...credentials(joined),
    name: "変更要求",
  });
  assert.deepEqual(restored, joined);
  assert.deepEqual((await statePending).drawnNumbers, drawn.drawnNumbers);
  const snapshot = await hostSnapshot();
  assert.equal(snapshot.players.length, 1);
  assert.equal(snapshot.players[0].connected, true);
});

test("invalid tokens and malformed joins do not allocate another card or break later joins", async () => {
  const original = await connect();
  const joined = await joinPlayer(original);
  const outsider = await connect();
  for (const token of [undefined, "incorrect-token"]) {
    const error = await action(
      outsider,
      "player:join",
      { ...credentials(joined), token },
      "error:message",
    );
    assert.match(error, /既に使用/);
  }
  for (const payload of [
    null,
    [],
    { playerId: 123 },
    { playerId: joined.playerId, token: {} },
    { token: "without-id" },
  ]) {
    const error = await action(
      outsider,
      "player:join",
      payload,
      "error:message",
    );
    assert.match(error, /データ形式/);
  }
  const results = await action(
    host,
    "host:exportResults",
    {},
    "host:resultsData",
  );
  assert.equal(results.totalPlayers, 1);
  assert.deepEqual(await joinPlayer(outsider, credentials(joined)), joined);
  const stillRejected = await action(
    outsider,
    "player:join",
    { ...credentials(joined), token: "wrong" },
    "error:message",
  );
  assert.match(stillRejected, /既に使用/);
});

test("an expired player identity reports expiration without issuing a replacement card", async () => {
  const player = await connect();
  const joined = await joinPlayer(player);
  const reset = waitForEvent(player, "player:forceReset");
  await action(
    host,
    "host:reset",
    {},
    "host:update",
    host,
    (state) => state.players.length === 0,
  );
  await reset;
  const outsider = await connect();
  let newCards = 0;
  outsider.on("player:joined", () => {
    newCards++;
  });
  const expired = await action(
    outsider,
    "player:join",
    credentials(joined),
    "player:sessionExpired",
  );
  assert.match(expired.message, /復元できません/);
  const results = await action(
    host,
    "host:exportResults",
    {},
    "host:resultsData",
  );
  assert.equal(results.totalPlayers, 0);
  assert.equal(newCards, 0);
  // Full reset still permits a deliberate new registration.
  const fresh = await joinPlayer(player, { name: "新しい大会" });
  assert.notEqual(fresh.playerId, joined.playerId);
  assert.equal(fresh.won, null);
});

test("display viewers receive counts without credentials or unawarded prizes and cannot operate the game", async () => {
  const viewer = await connect();
  const initial = await displaySnapshot(viewer);
  assert.deepEqual(
    Object.keys(initial).sort(),
    [
      "drawnNumbers",
      "lastDrawn",
      "prizeCount",
      "phase",
      "winnersCount",
      "playerCount",
      "connectedCount",
      "winners",
    ].sort(),
  );
  assert.equal(initial.playerCount, 0);
  assert.equal(initial.connectedCount, 0);
  assert.deepEqual(initial.winners, []);

  await configureGame(["秘密の一等", "秘密の二等"]);
  const player = await connect();
  const joined = await joinPlayer(player);
  const snapshot = await displaySnapshot(viewer);
  assert.equal(snapshot.playerCount, 1);
  assert.equal(snapshot.connectedCount, 1);
  for (const privateValue of [
    joined.playerId,
    joined.token,
    "秘密の一等",
    "秘密の二等",
  ]) {
    assert.equal(JSON.stringify(snapshot).includes(privateValue), false);
  }
  assert.equal("players" in snapshot, false);
  assert.equal("prizeNames" in snapshot, false);

  viewer.emit("host:draw");
  viewer.emit("host:reset");
  const unchanged = await displaySnapshot(viewer);
  assert.deepEqual(unchanged, snapshot);
  const disconnected = waitForEvent(
    viewer,
    "display:update",
    (state) => state.connectedCount === 0,
  );
  player.disconnect();
  const disconnectedState = await disconnected;
  assert.equal(disconnectedState.playerCount, 1);
  const reset = waitForEvent(
    viewer,
    "display:update",
    (state) => state.playerCount === 0,
  );
  await action(
    host,
    "host:reset",
    {},
    "host:update",
    host,
    (state) => state.players.length === 0,
  );
  assert.equal((await reset).phase, "setup");
});

function hasBingo(card, drawnNumbers) {
  const drawn = new Set(drawnNumbers);
  const lines = [
    ...card,
    ...Array.from({ length: 5 }, (_, column) => card.map((row) => row[column])),
    card.map((row, i) => row[i]),
    card.map((row, i) => row[4 - i]),
  ];
  return lines.some((line) =>
    line.every((cell) => cell.free || drawn.has(cell.number)),
  );
}

test(
  "manual claims keep arrival order and reconnect restores the personal prize in playing and finished phases",
  { timeout: 40000 },
  async () => {
    const first = await connect();
    const second = await connect();
    const firstJoined = await joinPlayer(first, { name: "先に参加" });
    const secondJoined = await joinPlayer(second, { name: "後に参加" });
    const viewer = await connect();
    await displaySnapshot(viewer);
    await configureGame(["一等の景品", "二等の景品"]);
    let drawnNumbers = [];
    while (
      !hasBingo(firstJoined.card, drawnNumbers) ||
      !hasBingo(secondJoined.card, drawnNumbers)
    ) {
      await delay(310); // Keep the real host draw cooldown enabled.
      const updated = await action(
        host,
        "host:draw",
        {},
        "host:update",
        host,
        (state) => state.drawnNumbers.length === drawnNumbers.length + 1,
      );
      drawnNumbers = updated.drawnNumbers;
      assert.equal(updated.winnersCount, 0);
      assert.equal(new Set(drawnNumbers).size, drawnNumbers.length);
    }
    const secondPrize = await action(
      second,
      "player:claimBingo",
      {},
      "player:won",
    );
    assert.deepEqual(secondPrize, { prizeIndex: 1, prizeName: "二等の景品" });
    const playingDisplay = await displaySnapshot(viewer);
    assert.equal(playingDisplay.phase, "playing");
    assert.deepEqual(playingDisplay.winners, [
      { name: "後に参加", ...secondPrize },
    ]);
    assert.equal(JSON.stringify(playingDisplay).includes("一等の景品"), false);
    second.disconnect();
    const restoredSecond = await connect();
    const restored = await joinPlayer(
      restoredSecond,
      credentials(secondJoined),
    );
    assert.deepEqual(restored.card, secondJoined.card);
    assert.deepEqual(restored.won, secondPrize);

    const firstPrize = await action(
      first,
      "player:claimBingo",
      {},
      "player:won",
    );
    assert.deepEqual(firstPrize, { prizeIndex: 0, prizeName: "一等の景品" });
    const finished = await displaySnapshot(viewer);
    assert.equal(finished.phase, "finished");
    assert.deepEqual(finished.winners, [
      { name: "後に参加", ...secondPrize },
      { name: "先に参加", ...firstPrize },
    ]);
    first.disconnect();
    const restoredFirst = await connect();
    const restoredFinished = await joinPlayer(
      restoredFirst,
      credentials(firstJoined),
    );
    assert.deepEqual(restoredFinished.card, firstJoined.card);
    assert.deepEqual(restoredFinished.won, firstPrize);
    const results = await action(
      host,
      "host:exportResults",
      {},
      "host:resultsData",
    );
    assert.deepEqual(
      results.results.map(({ winnerName, rank }) => ({ winnerName, rank })),
      [
        { winnerName: "後に参加", rank: 2 },
        { winnerName: "先に参加", rank: 1 },
      ],
    );
  },
);
