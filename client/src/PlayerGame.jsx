import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "./socket.js";

export default function PlayerGame() {
  const navigate = useNavigate();
  const [card, setCard] = useState(null);
  const [state, setState] = useState({
    drawnNumbers: [],
    lastDrawn: null,
    prizeCount: 0,
    phase: "setup",
    winnersCount: 0,
  });
  const [myName, setMyName] = useState("");
  const [message, setMessage] = useState(null);
  const [won, setWon] = useState(null); // { prizeName, prizeIndex }

  useEffect(() => {
    const playerId = localStorage.getItem("bingoex:playerId");
    const name = localStorage.getItem("bingoex:name");
    if (!name) {
      navigate("/");
      return;
    }
    setMyName(name);

    const joinNow = () => {
      socket.emit("player:join", { playerId, name });
    };

    if (socket.connected) joinNow();
    socket.on("connect", joinNow);

    socket.on("player:joined", ({ card }) => {
      setCard(card);
    });

    socket.on("player:card", ({ card }) => {
      setCard(card);
      setWon(null);
    });

    socket.on("state:update", (s) => {
      setState(s);
    });

    socket.on("player:won", ({ prizeIndex, prizeName }) => {
      setWon({ prizeIndex, prizeName });
    });

    socket.on("error:message", (msg) => {
      setMessage(msg);
      setTimeout(() => setMessage(null), 3500);
    });

    return () => {
      socket.off("connect", joinNow);
      socket.off("player:joined");
      socket.off("player:card");
      socket.off("state:update");
      socket.off("player:won");
      socket.off("error:message");
    };
  }, [navigate]);

  const drawnSet = useMemo(() => new Set(state.drawnNumbers), [state.drawnNumbers]);

  const bingoLines = useMemo(() => {
    if (!card) return 0;
    const isMarked = (cell) => cell.free || drawnSet.has(cell.number);
    let lines = 0;
    for (let r = 0; r < 5; r++) if (card[r].every(isMarked)) lines++;
    for (let c = 0; c < 5; c++) {
      let ok = true;
      for (let r = 0; r < 5; r++) if (!isMarked(card[r][c])) ok = false;
      if (ok) lines++;
    }
    let d1 = true;
    let d2 = true;
    for (let i = 0; i < 5; i++) {
      if (!isMarked(card[i][i])) d1 = false;
      if (!isMarked(card[i][4 - i])) d2 = false;
    }
    if (d1) lines++;
    if (d2) lines++;
    return lines;
  }, [card, drawnSet]);

  const handleClaim = () => {
    socket.emit("player:claimBingo");
  };

  const handleLeave = () => {
    localStorage.removeItem("bingoex:name");
    navigate("/");
  };

  if (!card) {
    return (
      <div className="screen center">
        <div className="card">接続中...</div>
      </div>
    );
  }

  const headerLabels = ["B", "I", "N", "G", "O"];

  return (
    <div className="screen player-screen">
      <header className="player-header">
        <div>
          <div className="player-name">{myName}</div>
          <div className="player-sub">ビンゴ数: {bingoLines}</div>
        </div>
        <button className="btn btn-ghost" onClick={handleLeave}>
          退出
        </button>
      </header>

      <div className="last-drawn">
        <div className="last-drawn-label">最新の番号</div>
        <div className="last-drawn-number">{state.lastDrawn ?? "－"}</div>
        <div className="last-drawn-meta">
          抽選済み: {state.drawnNumbers.length} / 75　当選: {state.winnersCount} /{" "}
          {state.prizeCount}
        </div>
      </div>

      <div className="bingo-card">
        <div className="bingo-header">
          {headerLabels.map((l, i) => (
            <div key={i} className={`bingo-head bingo-head-${i}`}>
              {l}
            </div>
          ))}
        </div>
        <div className="bingo-grid">
          {card.map((row, ri) =>
            row.map((cell, ci) => {
              const marked = cell.free || drawnSet.has(cell.number);
              return (
                <div
                  key={`${ri}-${ci}`}
                  className={`bingo-cell ${marked ? "marked" : ""} ${cell.free ? "free" : ""}`}
                >
                  {cell.free ? "★" : cell.number}
                </div>
              );
            }),
          )}
        </div>
      </div>

      <div className="player-actions">
        <button
          className="btn btn-primary btn-lg"
          disabled={bingoLines < 1 || !!won || state.phase !== "playing"}
          onClick={handleClaim}
        >
          {won ? "当選済み" : "ビンゴを申告する"}
        </button>
      </div>

      {message && <div className="toast">{message}</div>}

      {won && (
        <div className="modal-overlay">
          <div className="modal win-modal">
            <div className="confetti">🎉</div>
            <h2>おめでとうございます！</h2>
            <p className="modal-sub">あなたが獲得した景品は</p>
            <div className="prize-big">{won.prizeName}</div>
            <p className="modal-hint">ホスト画面で確認してください</p>
            <button className="btn btn-primary" onClick={() => setWon(null)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
