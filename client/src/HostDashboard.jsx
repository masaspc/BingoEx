import { useEffect, useState } from "react";
import socket from "./socket.js";

export default function HostDashboard() {
  const [state, setState] = useState({
    drawnNumbers: [],
    lastDrawn: null,
    prizeCount: 5,
    prizeNames: [],
    phase: "setup",
    winners: [],
    winnersCount: 0,
    players: [],
  });

  const [prizeCountInput, setPrizeCountInput] = useState("5");
  const [prizeNameInputs, setPrizeNameInputs] = useState([]);
  const [message, setMessage] = useState(null);
  const [winnerPopup, setWinnerPopup] = useState(null); // 新しい当選者の表示用

  useEffect(() => {
    const joinHost = () => socket.emit("host:join");
    if (socket.connected) joinHost();
    socket.on("connect", joinHost);

    socket.on("host:update", (s) => {
      setState(s);
      // prizeNamesInputs がまだ空で、サーバー側に保存されている景品名があれば同期
      setPrizeNameInputs((current) => {
        if (current.length === 0 && Array.isArray(s.prizeNames) && s.prizeNames.length > 0) {
          return [...s.prizeNames];
        }
        // phase が prizeInput になっていて長さが景品数と異なれば整形
        if (s.phase === "prizeInput" && current.length !== s.prizeCount) {
          const next = current.slice(0, s.prizeCount);
          while (next.length < s.prizeCount) next.push("");
          return next;
        }
        return current;
      });
      setPrizeCountInput(String(s.prizeCount));
    });

    socket.on("host:newWinner", (winner) => {
      setWinnerPopup(winner);
      setTimeout(() => setWinnerPopup(null), 6000);
    });

    socket.on("error:message", (msg) => {
      setMessage(msg);
      setTimeout(() => setMessage(null), 3500);
    });

    return () => {
      socket.off("connect", joinHost);
      socket.off("host:update");
      socket.off("host:newWinner");
      socket.off("error:message");
    };
  }, []);

  const handleSubmitPrizeCount = (e) => {
    e.preventDefault();
    const n = Number(prizeCountInput);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      setMessage("景品数は 1〜50 の整数を指定してください。");
      setTimeout(() => setMessage(null), 3500);
      return;
    }
    // 入力欄を景品数に合わせる
    const next = prizeNameInputs.slice(0, n);
    while (next.length < n) next.push("");
    setPrizeNameInputs(next);
    socket.emit("host:setPrizeCount", { count: n });
  };

  const handleSubmitPrizeNames = (e) => {
    e.preventDefault();
    const cleaned = prizeNameInputs.map((v, i) => (v && v.trim() ? v.trim() : `景品 ${i + 1}`));
    socket.emit("host:setPrizeNames", { names: cleaned });
  };

  const handleDraw = () => {
    socket.emit("host:draw");
  };

  const handleReset = () => {
    if (!window.confirm("ゲームをリセットしますか？抽選結果と当選者が初期化されます。")) return;
    socket.emit("host:reset");
  };

  const handleBackToSetup = () => {
    if (!window.confirm("景品数の設定画面に戻りますか？")) return;
    socket.emit("host:backToSetup");
  };

  return (
    <div className="screen host-screen">
      <header className="host-header">
        <h1 className="host-title">
          <span className="title-b">B</span>
          <span className="title-i">I</span>
          <span className="title-n">N</span>
          <span className="title-g">G</span>
          <span className="title-o">O</span>
          <span className="title-ex">Ex</span>
          <span className="host-badge">HOST</span>
        </h1>
        <div className="host-status">
          Phase: <b>{phaseLabel(state.phase)}</b>　当選: <b>{state.winnersCount}</b> /{" "}
          <b>{state.prizeCount}</b>
        </div>
      </header>

      {state.phase === "setup" && (
        <section className="card setup-card">
          <h2>ステップ 1 / 景品数の設定</h2>
          <p className="muted">まずはこのゲームで何人が景品を獲得できるかを決めます。</p>
          <form onSubmit={handleSubmitPrizeCount} className="inline-form">
            <input
              className="text-input"
              type="number"
              min="1"
              max="50"
              value={prizeCountInput}
              onChange={(e) => setPrizeCountInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              次へ（景品名の入力）
            </button>
          </form>
        </section>
      )}

      {state.phase === "prizeInput" && (
        <section className="card setup-card">
          <h2>ステップ 2 / 景品名の入力</h2>
          <p className="muted">
            上位から順番に景品名を入力してください。空欄の場合は「景品 N」と表示されます。
          </p>
          <form onSubmit={handleSubmitPrizeNames} className="prize-form">
            <div className="prize-list">
              {prizeNameInputs.map((val, i) => (
                <div className="prize-row" key={i}>
                  <div className="prize-rank">{i + 1} 等</div>
                  <input
                    className="text-input"
                    type="text"
                    placeholder={`景品 ${i + 1} の名前`}
                    value={val}
                    maxLength={40}
                    onChange={(e) => {
                      const next = [...prizeNameInputs];
                      next[i] = e.target.value;
                      setPrizeNameInputs(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="prize-actions">
              <button type="button" className="btn btn-ghost" onClick={handleBackToSetup}>
                戻る
              </button>
              <button type="submit" className="btn btn-primary">
                ゲーム開始
              </button>
            </div>
          </form>
        </section>
      )}

      {(state.phase === "playing" || state.phase === "finished") && (
        <div className="host-main">
          <section className="card draw-card">
            <div className="draw-display">
              <div className="draw-label">最新の番号</div>
              <div className="draw-number">{state.lastDrawn ?? "－"}</div>
            </div>
            <div className="draw-actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleDraw}
                disabled={state.phase === "finished"}
              >
                番号を引く
              </button>
              <button className="btn btn-ghost" onClick={handleReset}>
                リセット
              </button>
            </div>
            <div className="drawn-list">
              {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  className={`drawn-cell ${state.drawnNumbers.includes(n) ? "hit" : ""} ${
                    state.lastDrawn === n ? "last" : ""
                  }`}
                >
                  {n}
                </div>
              ))}
            </div>
          </section>

          <section className="card prize-card">
            <h3>景品 / 当選者</h3>
            <ul className="prize-display-list">
              {state.prizeNames.map((name, i) => {
                const winner = state.winners.find((w) => w.prizeIndex === i);
                return (
                  <li key={i} className={`prize-display-item ${winner ? "won" : ""}`}>
                    <div className="prize-display-rank">{i + 1} 等</div>
                    <div className="prize-display-name">{name || `景品 ${i + 1}`}</div>
                    <div className="prize-display-winner">
                      {winner ? `→ ${winner.name} さん` : "（未当選）"}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card players-card">
            <h3>参加者 ({state.players.length}名)</h3>
            <ul className="player-list">
              {state.players.map((p) => (
                <li key={p.id} className={`player-item ${p.isWinner ? "winner" : ""}`}>
                  <div className={`player-dot ${p.connected ? "on" : "off"}`} />
                  <span className="player-list-name">{p.name}</span>
                  <span className="player-list-meta">
                    ビンゴ: {p.bingoLines}
                    {p.isWinner && " 🏆"}
                  </span>
                </li>
              ))}
              {state.players.length === 0 && <li className="muted">まだ参加者がいません。</li>}
            </ul>
          </section>
        </div>
      )}

      {message && <div className="toast">{message}</div>}

      {winnerPopup && (
        <div className="modal-overlay">
          <div className="modal winner-modal">
            <div className="confetti">🎊</div>
            <div className="winner-rank">{winnerPopup.prizeIndex + 1} 等 当選！</div>
            <div className="winner-name">{winnerPopup.name} さん</div>
            <div className="winner-prize-label">獲得景品</div>
            <div className="winner-prize-name">{winnerPopup.prizeName}</div>
            <button className="btn btn-primary" onClick={() => setWinnerPopup(null)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function phaseLabel(phase) {
  switch (phase) {
    case "setup":
      return "景品数設定";
    case "prizeInput":
      return "景品名入力";
    case "playing":
      return "抽選中";
    case "finished":
      return "終了";
    default:
      return phase;
  }
}
