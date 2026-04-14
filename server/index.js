import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// ==============================
// ゲーム状態
// ==============================
const initialState = () => ({
  // プレイヤー一覧 (uuid -> player)
  players: new Map(),
  // 抽選済みの番号
  drawnNumbers: [],
  // 最新の抽選番号
  lastDrawn: null,
  // 景品数（上限）
  prizeCount: 5,
  // 景品名の配列 (index 0 が最初の当選者に割り当て)
  prizeNames: [],
  // 当選者一覧 { playerId, name, prizeIndex, prizeName, timestamp }
  winners: [],
  // ゲームフェーズ: "setup" | "prizeInput" | "playing" | "finished"
  phase: "setup",
});

let state = initialState();

// ==============================
// ヘルパー関数
// ==============================

/**
 * 標準的な5x5ビンゴカードを生成する
 * 列ごとの範囲:
 *   B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75
 * 中央 (N列3行目) は FREE
 */
function generateBingoCard() {
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];
  const card = [];
  for (let col = 0; col < 5; col++) {
    const [min, max] = ranges[col];
    const pool = [];
    for (let n = min; n <= max; n++) pool.push(n);
    // シャッフルして先頭5つを取得
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    card.push(pool.slice(0, 5));
  }

  // card[col][row] -> grid[row][col] に転置
  const grid = [];
  for (let row = 0; row < 5; row++) {
    const r = [];
    for (let col = 0; col < 5; col++) {
      if (col === 2 && row === 2) {
        r.push({ number: 0, free: true });
      } else {
        r.push({ number: card[col][row], free: false });
      }
    }
    grid.push(r);
  }
  return grid;
}

/**
 * プレイヤーのカードとドロー済み番号からビンゴ(揃っている列)の数を計算
 */
function countBingoLines(card, drawn) {
  const drawnSet = new Set(drawn);
  const isMarked = (cell) => cell.free || drawnSet.has(cell.number);

  let lines = 0;
  // 横
  for (let r = 0; r < 5; r++) {
    if (card[r].every(isMarked)) lines++;
  }
  // 縦
  for (let c = 0; c < 5; c++) {
    let ok = true;
    for (let r = 0; r < 5; r++) {
      if (!isMarked(card[r][c])) {
        ok = false;
        break;
      }
    }
    if (ok) lines++;
  }
  // 対角
  let diag1 = true;
  let diag2 = true;
  for (let i = 0; i < 5; i++) {
    if (!isMarked(card[i][i])) diag1 = false;
    if (!isMarked(card[i][4 - i])) diag2 = false;
  }
  if (diag1) lines++;
  if (diag2) lines++;
  return lines;
}

/**
 * ホスト画面に送るプレイヤー情報リスト (カードを除外)
 */
function serializePlayersForHost() {
  return Array.from(state.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    bingoLines: countBingoLines(p.card, state.drawnNumbers),
    hasClaimed: p.hasClaimed,
    isWinner: state.winners.some((w) => w.playerId === p.id),
    connected: p.connected,
  }));
}

/**
 * 全体用ステート (景品名はホストにのみ送信)
 */
function broadcastState() {
  const publicState = {
    drawnNumbers: state.drawnNumbers,
    lastDrawn: state.lastDrawn,
    prizeCount: state.prizeCount,
    phase: state.phase,
    winnersCount: state.winners.length,
  };

  // プレイヤーに配信 (景品名や他プレイヤー情報は送らない)
  io.emit("state:update", publicState);

  // ホストにだけ詳細情報を送信
  io.to("host").emit("host:update", {
    ...publicState,
    prizeNames: state.prizeNames,
    winners: state.winners,
    players: serializePlayersForHost(),
  });
}

// ==============================
// Socket.IO 通信
// ==============================
io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ------ ホスト ------
  socket.on("host:join", () => {
    socket.join("host");
    socket.emit("host:update", {
      drawnNumbers: state.drawnNumbers,
      lastDrawn: state.lastDrawn,
      prizeCount: state.prizeCount,
      prizeNames: state.prizeNames,
      phase: state.phase,
      winners: state.winners,
      winnersCount: state.winners.length,
      players: serializePlayersForHost(),
    });
  });

  // 景品数を設定 (その後 prizeInput フェーズに移行)
  socket.on("host:setPrizeCount", ({ count }) => {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      socket.emit("error:message", "景品数は 1〜50 の範囲で指定してください。");
      return;
    }
    state.prizeCount = n;
    // 既存の景品名を長さに揃える
    const names = Array.isArray(state.prizeNames) ? state.prizeNames.slice(0, n) : [];
    while (names.length < n) names.push("");
    state.prizeNames = names;
    state.phase = "prizeInput";
    broadcastState();
  });

  // 景品名を一括で設定 (設定後 playing フェーズに移行)
  socket.on("host:setPrizeNames", ({ names }) => {
    if (!Array.isArray(names)) {
      socket.emit("error:message", "景品名のデータ形式が正しくありません。");
      return;
    }
    if (names.length !== state.prizeCount) {
      socket.emit(
        "error:message",
        `景品名の数 (${names.length}) が景品数 (${state.prizeCount}) と一致しません。`,
      );
      return;
    }
    state.prizeNames = names.map((v, i) =>
      typeof v === "string" && v.trim() ? v.trim() : `景品 ${i + 1}`,
    );
    state.phase = "playing";
    broadcastState();
  });

  // 番号を引く
  socket.on("host:draw", () => {
    if (state.phase !== "playing") {
      socket.emit("error:message", "まだゲームが開始されていません。");
      return;
    }
    if (state.winners.length >= state.prizeCount) {
      socket.emit("error:message", "景品数の上限に達したため、これ以上抽選できません。");
      return;
    }
    if (state.drawnNumbers.length >= 75) {
      socket.emit("error:message", "1〜75 の番号をすべて引き切りました。");
      return;
    }
    const remaining = [];
    const drawnSet = new Set(state.drawnNumbers);
    for (let i = 1; i <= 75; i++) if (!drawnSet.has(i)) remaining.push(i);
    const next = remaining[Math.floor(Math.random() * remaining.length)];
    state.drawnNumbers.push(next);
    state.lastDrawn = next;
    broadcastState();
  });

  // ゲームリセット
  socket.on("host:reset", () => {
    const keepPlayers = state.players;
    // プレイヤーにはカードを新しく発行する
    for (const [, player] of keepPlayers) {
      player.card = generateBingoCard();
      player.hasClaimed = false;
      // プレイヤーに新しいカードを通知
      io.to(player.socketId).emit("player:card", { card: player.card });
    }
    const prevPrizeCount = state.prizeCount;
    state = {
      ...initialState(),
      players: keepPlayers,
      prizeCount: prevPrizeCount,
    };
    broadcastState();
  });

  // 景品数を変更するために setup に戻す
  socket.on("host:backToSetup", () => {
    state.phase = "setup";
    broadcastState();
  });

  // ------ プレイヤー ------
  socket.on("player:join", ({ playerId, name }) => {
    const id = playerId && typeof playerId === "string" ? playerId : uuidv4();
    const playerName = typeof name === "string" && name.trim() ? name.trim().slice(0, 20) : "名無し";

    let player = state.players.get(id);
    if (player) {
      // 再接続
      player.socketId = socket.id;
      player.connected = true;
      player.name = playerName;
    } else {
      player = {
        id,
        name: playerName,
        socketId: socket.id,
        card: generateBingoCard(),
        hasClaimed: false,
        connected: true,
      };
      state.players.set(id, player);
    }

    socket.join(`player:${id}`);
    socket.data.playerId = id;

    socket.emit("player:joined", {
      playerId: id,
      name: player.name,
      card: player.card,
    });

    broadcastState();
  });

  // プレイヤーがビンゴを申告
  socket.on("player:claimBingo", () => {
    const id = socket.data.playerId;
    if (!id) return;
    const player = state.players.get(id);
    if (!player) return;

    const lines = countBingoLines(player.card, state.drawnNumbers);
    if (lines < 1) {
      socket.emit("error:message", "まだビンゴになっていません。");
      return;
    }
    if (state.winners.some((w) => w.playerId === id)) {
      socket.emit("error:message", "すでに当選済みです。");
      return;
    }
    if (state.winners.length >= state.prizeCount) {
      socket.emit("error:message", "景品数の上限に達しているため申告できません。");
      return;
    }

    const prizeIndex = state.winners.length;
    const prizeName = state.prizeNames[prizeIndex] || `景品 ${prizeIndex + 1}`;
    const winner = {
      playerId: id,
      name: player.name,
      prizeIndex,
      prizeName,
      timestamp: Date.now(),
    };
    state.winners.push(winner);
    player.hasClaimed = true;

    // ホスト画面向けに当選イベントを配信 (景品名の表示演出用)
    io.to("host").emit("host:newWinner", winner);

    // 本人には当選した景品を通知
    io.to(socket.id).emit("player:won", {
      prizeIndex,
      prizeName,
    });

    if (state.winners.length >= state.prizeCount) {
      state.phase = "finished";
    }

    broadcastState();
  });

  socket.on("disconnect", () => {
    console.log(`[disconnect] ${socket.id}`);
    const id = socket.data.playerId;
    if (id) {
      const player = state.players.get(id);
      if (player && player.socketId === socket.id) {
        player.connected = false;
        broadcastState();
      }
    }
  });
});

app.get("/", (_req, res) => {
  res.json({ ok: true, name: "BingoEx server", phase: state.phase });
});

server.listen(PORT, () => {
  console.log(`BingoEx server listening on http://localhost:${PORT}`);
});
