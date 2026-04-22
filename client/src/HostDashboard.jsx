import { useCallback, useEffect, useRef, useState } from "react";
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
  const [winnerPopup, setWinnerPopup] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawDisplay, setDrawDisplay] = useState(null);
  const drawIntervalRef = useRef(null);

  useEffect(() => {
    const joinHost = () => {
      const saved = sessionStorage.getItem("bingoex:hostPassword") || "";
      socket.emit("host:join", { password: saved });
    };
    joinHost();
    socket.on("connect", joinHost);
    socket.on("reconnect", joinHost);

    socket.on("host:authOk", () => {
      setAuthed(true);
      setNeedPassword(false);
    });

    socket.on("host:authFailed", (msg) => {
      setAuthed(false);
      setNeedPassword(true);
      sessionStorage.removeItem("bingoex:hostPassword");
      if (msg) {
        setMessage(msg);
        setTimeout(() => setMessage(null), 3500);
      }
    });

    socket.on("host:update", (s) => {
      setState(s);
      setPrizeNameInputs((current) => {
        if (s.phase !== "prizeInput") return current;
        const next = current.slice(0, s.prizeCount);
        while (next.length < s.prizeCount) next.push("");
        if (Array.isArray(s.prizeNames)) {
          for (let i = 0; i < s.prizeCount; i++) {
            if (!next[i] && s.prizeNames[i]) next[i] = s.prizeNames[i];
          }
        }
        return next;
      });
      setPrizeCountInput(String(s.prizeCount));
    });

    socket.on("host:newWinner", (winner) => {
      setWinnerPopup(winner);
      setTimeout(() => setWinnerPopup(null), 6000);
    });

    socket.on("host:resultsData", (data) => {
      downloadCSV(data);
    });

    socket.on("error:message", (msg) => {
      setMessage(msg);
      setTimeout(() => setMessage(null), 3500);
    });

    return () => {
      socket.off("connect", joinHost);
      socket.off("reconnect", joinHost);
      socket.off("host:authOk");
      socket.off("host:authFailed");
      socket.off("host:update");
      socket.off("host:newWinner");
      socket.off("host:resultsData");
      socket.off("error:message");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
    };
  }, []);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    sessionStorage.setItem("bingoex:hostPassword", passwordInput);
    socket.emit("host:join", { password: passwordInput });
  };

  const handleSubmitPrizeCount = (e) => {
    e.preventDefault();
    const n = Number(prizeCountInput);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      setMessage("景品数は 1〜50 の整数を指定してください。");
      setTimeout(() => setMessage(null), 3500);
      return;
    }
    const next = prizeNameInputs.slice(0, n);
    while (next.length < n) next.push("");
    setPrizeNameInputs(next);
    socket.emit("host:setPrizeCount", { count: n });
  };

  const handleSubmitPrizeNames = (e) => {
    e.preventDefault();
    const target = state.prizeCount || prizeNameInputs.length || 0;
    const padded = prizeNameInputs.slice(0, target);
    while (padded.length < target) padded.push("");
    const cleaned = padded.map((v, i) => (v && v.trim() ? v.trim() : `景品 ${i + 1}`));
    socket.emit("host:setPrizeNames", { names: cleaned });
  };

  const handleDraw = () => {
    if (isDrawing) return;
    setIsDrawing(true);

    let count = 0;
    const totalTicks = 30;
    drawIntervalRef.current = setInterval(() => {
      setDrawDisplay(Math.floor(Math.random() * 75) + 1);
      count++;
      if (count >= totalTicks) {
        clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = null;
        socket.emit("host:draw");
        setTimeout(() => {
          setIsDrawing(false);
          setDrawDisplay(null);
        }, 200);
      }
    }, 60);
  };

  const handleReset = () => {
    if (!window.confirm("ゲームをリセットしますか？抽選結果と当選者が初期化されます。")) return;
    socket.emit("host:reset");
  };

  const handleBackToSetup = () => {
    if (!window.confirm("景品数の設定画面に戻りますか？")) return;
    socket.emit("host:backToSetup");
  };

  const handleExportCSV = () => {
    socket.emit("host:exportResults");
  };

  const downloadCSV = useCallback((data) => {
    const BOM = "﻿";
    const header = "順位,景品名,当選者名,当選時刻";
    const rows = data.results.map(
      (r) =>
        `${r.rank},"${(r.prizeName || "").replace(/"/g, '""')}","${(r.winnerName || "").replace(/"/g, '""')}",${r.timestamp}`,
    );
    const footer = `\n# 出力日時: ${data.exportedAt}  参加者数: ${data.totalPlayers}  抽選数: ${data.drawnCount}`;
    const csv = BOM + [header, ...rows].join("\n") + footer;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bingoex-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleCopyResults = () => {
    const lines = state.winners.map(
      (w) => `${w.prizeIndex + 1}等: ${w.prizeName} → ${w.name}`,
    );
    const text = lines.length > 0 ? lines.join("\n") : "当選者なし";
    navigator.clipboard.writeText(text).then(() => {
      setMessage("クリップボードにコピーしました");
      setTimeout(() => setMessage(null), 2000);
    });
  };

  const displayedNumber = isDrawing ? drawDisplay : state.lastDrawn;

  // 景品リストを逆順 (下位等 → 1等) で表示
  const prizeIndices = Array.from({ length: state.prizeCount }, (_, i) => i).reverse();

  if (needPassword && !authed) {
    return (
      <div className="screen center">
        <div className="card join-card">
          <h1 className="title">
            <span className="title-b">B</span>
            <span className="title-i">I</span>
            <span className="title-n">N</span>
            <span className="title-g">G</span>
            <span className="title-o">O</span>
            <span className="title-ex">Ex</span>
          </h1>
          <p className="subtitle">ホスト認証</p>
          <form onSubmit={handlePasswordSubmit} className="join-form">
            <label className="label">ホスト用パスワード</label>
            <input
              className="text-input"
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={!passwordInput}>
              ログイン
            </button>
          </form>
          {message && <div className="toast">{message}</div>}
        </div>
      </div>
    );
  }

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
            1等が最上位の景品です。当選は下位（{state.prizeCount}等）から順に確定します。
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
        <div className="host-main-wide">
          <section className="card draw-card">
            <div className={`draw-display ${isDrawing ? "drawing" : ""}`}>
              <div className="draw-label">
                {isDrawing ? "抽選中..." : "最新の番号"}
              </div>
              <div className={`draw-number ${isDrawing ? "draw-spinning" : ""}`}>
                {displayedNumber ?? "－"}
              </div>
            </div>
            <div className="draw-actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleDraw}
                disabled={state.phase === "finished" || isDrawing}
              >
                {isDrawing ? "抽選中..." : "抽選！"}
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

          <section className="card prize-card prize-card-wide">
            <div className="prize-card-header">
              <h3>景品 / 当選者</h3>
              {state.winners.length > 0 && (
                <div className="prize-card-actions">
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setShowResults((v) => !v)}
                  >
                    {showResults ? "カード表示" : "結果一覧"}
                  </button>
                </div>
              )}
            </div>
            {!showResults ? (
              <ul className="prize-display-list">
                {prizeIndices.map((i) => {
                  const name = state.prizeNames[i];
                  const winner = state.winners.find((w) => w.prizeIndex === i);
                  const nextPrizeIndex = state.prizeCount - 1 - state.winners.length;
                  const isNext = i === nextPrizeIndex && state.phase === "playing";
                  return (
                    <li
                      key={i}
                      className={`prize-display-item ${winner ? "won" : ""} ${isNext ? "next-prize" : ""}`}
                    >
                      <div className="prize-display-rank">{i + 1} 等</div>
                      <div className="prize-display-name">
                        {winner ? name || `景品 ${i + 1}` : "？？？"}
                      </div>
                      <div className="prize-display-winner">
                        {winner ? `→ ${winner.name} さん` : isNext ? "次の当選景品" : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="results-panel">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>順位</th>
                      <th>景品名</th>
                      <th>当選者</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.prizeNames.map((name, i) => {
                      const winner = state.winners.find((w) => w.prizeIndex === i);
                      return (
                        <tr key={i} className={winner ? "row-won" : ""}>
                          <td>{i + 1} 等</td>
                          <td>{winner ? name || `景品 ${i + 1}` : "？？？"}</td>
                          <td>{winner ? winner.name : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="results-actions">
                  <button className="btn btn-primary" onClick={handleExportCSV}>
                    CSV ダウンロード
                  </button>
                  <button className="btn btn-ghost" onClick={handleCopyResults}>
                    コピー
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {state.phase === "finished" && (
        <section className="card finished-card">
          <div className="finished-banner">
            <div className="finished-icon">🏆</div>
            <h2>ゲーム終了 — 全景品が確定しました</h2>
          </div>
          <table className="results-table results-table-final">
            <thead>
              <tr>
                <th>順位</th>
                <th>景品名</th>
                <th>当選者</th>
              </tr>
            </thead>
            <tbody>
              {state.prizeNames.map((name, i) => {
                const winner = state.winners.find((w) => w.prizeIndex === i);
                return (
                  <tr key={i} className={winner ? "row-won" : ""}>
                    <td>{i + 1} 等</td>
                    <td>{name || `景品 ${i + 1}`}</td>
                    <td>{winner ? winner.name : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="finished-actions">
            <button className="btn btn-primary btn-lg" onClick={handleExportCSV}>
              CSV ダウンロード
            </button>
            <button className="btn btn-ghost btn-lg" onClick={handleCopyResults}>
              テキストをコピー
            </button>
            <button className="btn btn-ghost" onClick={handleReset}>
              リセット
            </button>
          </div>
        </section>
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
