import { useCallback, useEffect, useRef, useState } from "react";
import socket from "./socket.js";
import Celebration from "./Celebration.jsx";

const INITIAL_STATE = {
  drawnNumbers: [],
  lastDrawn: null,
  prizeCount: 5,
  prizeNames: [],
  phase: "setup",
  winners: [],
  winnersCount: 0,
  players: [],
};

const DRAW_PALETTE = [
  { color: "#c52b4d", soft: "#ffedf2" },
  { color: "#127e92", soft: "#e3f8fc" },
  { color: "#6746d3", soft: "#f0ebff" },
  { color: "#916408", soft: "#fff6d5" },
  { color: "#16836a", soft: "#e3f9f0" },
];

export default function HostDashboard() {
  const [state, setState] = useState(INITIAL_STATE);
  const [prizeCountInput, setPrizeCountInput] = useState("5");
  const [prizeNameInputs, setPrizeNameInputs] = useState([]);
  const [message, setMessage] = useState(null);
  const [winnerQueue, setWinnerQueue] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawDisplay, setDrawDisplay] = useState(null);
  const drawIntervalRef = useRef(null);
  const drawFinishRef = useRef(null);
  const messageTimerRef = useRef(null);
  const winnerDismissRef = useRef(null);
  const serverSetupRef = useRef(null);
  const winnerPopup = winnerQueue[0] || null;

  const notify = useCallback((text, duration = 3500) => {
    clearTimeout(messageTimerRef.current);
    setMessage(text);
    messageTimerRef.current = setTimeout(() => setMessage(null), duration);
  }, []);

  const downloadCSV = useCallback((data) => {
    const rows = data.results.map(
      (r) =>
        `${r.rank},"${(r.prizeName || "").replace(/"/g, '""')}","${(r.winnerName || "").replace(/"/g, '""')}",${r.timestamp}`,
    );
    const footer = `\n# 出力日時: ${data.exportedAt}  参加者数: ${data.totalPlayers}  抽選数: ${data.drawnCount}`;
    const csv =
      "\uFEFF" + ["順位,景品名,当選者名,当選時刻", ...rows].join("\n") + footer;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `bingoex-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const joinHost = () => {
      setConnected(true);
      socket.emit("host:join", {
        password: sessionStorage.getItem("bingoex:hostPassword") || "",
      });
    };
    const onAuthOk = () => {
      setAuthed(true);
      setNeedPassword(false);
    };
    const onAuthFailed = (msg) => {
      setAuthed(false);
      setNeedPassword(true);
      sessionStorage.removeItem("bingoex:hostPassword");
      if (msg) notify(msg);
    };
    const onUpdate = (s) => {
      const previousSetup = serverSetupRef.current;
      serverSetupRef.current = { phase: s.phase, prizeCount: s.prizeCount };
      setState(s);
      if (s.phase === "setup") {
        setWinnerQueue([]);
        setShowResults(false);
        clearInterval(drawIntervalRef.current);
        clearTimeout(drawFinishRef.current);
        drawIntervalRef.current = null;
        setIsDrawing(false);
        setDrawDisplay(null);
      }
      setPrizeNameInputs((current) => {
        if (s.phase !== "prizeInput") return current;
        if (
          previousSetup?.phase === "prizeInput" &&
          previousSetup.prizeCount === s.prizeCount
        )
          return current;
        const next = current.slice(0, s.prizeCount);
        while (next.length < s.prizeCount) next.push("");
        for (let i = 0; i < s.prizeCount; i++) {
          if (!next[i] && s.prizeNames?.[i]) next[i] = s.prizeNames[i];
        }
        return next;
      });
      if (
        previousSetup?.phase !== s.phase ||
        previousSetup?.prizeCount !== s.prizeCount
      ) {
        setPrizeCountInput(String(s.prizeCount));
      }
    };
    const onWinner = (winner) => setWinnerQueue((queue) => [...queue, winner]);
    const onDisconnect = () => {
      setConnected(false);
      setAuthed(false);
      clearInterval(drawIntervalRef.current);
      clearTimeout(drawFinishRef.current);
      drawIntervalRef.current = null;
      setIsDrawing(false);
      setDrawDisplay(null);
    };
    socket.on("connect", joinHost);
    socket.on("disconnect", onDisconnect);
    socket.on("host:authOk", onAuthOk);
    socket.on("host:authFailed", onAuthFailed);
    socket.on("host:update", onUpdate);
    socket.on("host:newWinner", onWinner);
    socket.on("host:resultsData", downloadCSV);
    socket.on("error:message", notify);
    if (socket.connected) joinHost();
    return () => {
      socket.off("connect", joinHost);
      socket.off("disconnect", onDisconnect);
      socket.off("host:authOk", onAuthOk);
      socket.off("host:authFailed", onAuthFailed);
      socket.off("host:update", onUpdate);
      socket.off("host:newWinner", onWinner);
      socket.off("host:resultsData", downloadCSV);
      socket.off("error:message", notify);
      clearInterval(drawIntervalRef.current);
      clearTimeout(drawFinishRef.current);
      clearTimeout(messageTimerRef.current);
    };
  }, [downloadCSV, notify]);

  const dismissWinner = useCallback(
    () => setWinnerQueue((queue) => queue.slice(1)),
    [],
  );
  useEffect(() => {
    if (!winnerPopup) return;
    const timer = setTimeout(dismissWinner, 8000);
    const previousFocus = document.activeElement;
    winnerDismissRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") dismissWinner();
      if (e.key === "Tab") {
        e.preventDefault();
        winnerDismissRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [winnerPopup, dismissWinner]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    sessionStorage.setItem("bingoex:hostPassword", passwordInput);
    socket.emit("host:join", { password: passwordInput });
  };
  const handleSubmitPrizeCount = (e) => {
    e.preventDefault();
    const n = Number(prizeCountInput);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      notify("景品数は 1〜50 の整数を指定してください。");
      return;
    }
    const next = prizeNameInputs.slice(0, n);
    while (next.length < n) next.push("");
    setPrizeNameInputs(next);
    socket.emit("host:setPrizeCount", { count: n });
  };
  const handleSubmitPrizeNames = (e) => {
    e.preventDefault();
    const padded = prizeNameInputs.slice(0, state.prizeCount);
    while (padded.length < state.prizeCount) padded.push("");
    socket.emit("host:setPrizeNames", {
      names: padded.map((v, i) => v?.trim() || `景品 ${i + 1}`),
    });
  };
  const handleDraw = () => {
    if (
      isDrawing ||
      !connected ||
      !authed ||
      state.phase !== "playing" ||
      state.drawnNumbers.length >= 75
    )
      return;
    setIsDrawing(true);
    setDrawDisplay(Math.floor(Math.random() * 75) + 1);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let count = 0;
    const totalTicks = reducedMotion ? 1 : 26;
    drawIntervalRef.current = setInterval(
      () => {
        if (!reducedMotion) setDrawDisplay(Math.floor(Math.random() * 75) + 1);
        count++;
        if (count >= totalTicks) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
          socket.emit("host:draw");
          drawFinishRef.current = setTimeout(() => {
            setIsDrawing(false);
            setDrawDisplay(null);
          }, 250);
        }
      },
      reducedMotion ? 150 : 65,
    );
  };
  const handleReset = () => {
    if (
      window.confirm(
        "ゲームをリセットしますか？抽選結果・当選者・参加者のカードが初期化されます。",
      )
    )
      socket.emit("host:reset");
  };
  const handleBackToSetup = () => {
    if (window.confirm("景品数の設定画面に戻りますか？"))
      socket.emit("host:backToSetup");
  };
  const handleExportCSV = () => socket.emit("host:exportResults");
  const handleCopyResults = async () => {
    const text =
      state.winners
        .map((w) => `${w.prizeIndex + 1}等: ${w.prizeName} → ${w.name}`)
        .join("\n") || "当選者なし";
    try {
      await navigator.clipboard.writeText(text);
      notify("クリップボードにコピーしました", 2000);
    } catch {
      notify("コピーできませんでした。CSV ダウンロードをご利用ください。");
    }
  };

  const displayedNumber = isDrawing ? drawDisplay : state.lastDrawn;
  const drawPalette =
    DRAW_PALETTE[displayedNumber ? Math.floor((displayedNumber - 1) / 15) : 0];
  const prizeIndices = Array.from(
    { length: state.prizeCount },
    (_, i) => i,
  ).reverse();
  const remainingPrizes = Math.max(0, state.prizeCount - state.winnersCount);
  const connectedPlayers = state.players.filter((p) => p.connected).length;
  const isSetup = state.phase === "setup" || state.phase === "prizeInput";
  const canOperate = connected && authed;

  if (needPassword && !authed) {
    return (
      <div className="screen center host-auth-screen">
        <div className="card join-card host-auth-card">
          <Wordmark />
          <div className="host-auth-seal" aria-hidden="true">
            <Icon name="key" />
          </div>
          <p className="eyebrow">EVENT CONTROL</p>
          <h1>主催者ログイン</h1>
          <p className="muted">イベントの進行を、ここから。</p>
          <form onSubmit={handlePasswordSubmit} className="join-form">
            <label className="label" htmlFor="host-password">
              ホスト用パスワード
            </label>
            <input
              id="host-password"
              className="text-input"
              type="password"
              autoComplete="current-password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!passwordInput || !connected}
            >
              ログイン <Icon name="arrow" />
            </button>
          </form>
          {message && (
            <div className="toast" role="status">
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen host-screen">
      <header className="host-header">
        <a className="host-brand" href="/host" aria-label="BingoEx ホスト画面">
          <Wordmark />
          <span className="host-badge">HOST</span>
        </a>
        <nav className="venue-host-links" aria-label="会場向け画面">
          <a href="/reception" target="_blank" rel="noopener noreferrer">
            <Icon name="qr" />
            参加受付<span aria-hidden="true">↗</span>
          </a>
          <a href="/display" target="_blank" rel="noopener noreferrer">
            <Icon name="screen" />
            投影画面<span aria-hidden="true">↗</span>
          </a>
        </nav>
        <div
          className={`host-connection ${connected ? "" : "offline"}`}
          role="status"
        >
          <span className="live-dot" />
          {connected ? "接続中" : "再接続中"}
        </div>
      </header>

      <div className="host-heading-row">
        <div>
          <p className="eyebrow">
            {isSetup ? "LET’S GET THE PARTY STARTED" : "HERE COMES THE FUN"}
          </p>
          <h1>
            {isSetup
              ? "楽しいビンゴの、準備をしよう！"
              : state.phase === "finished"
                ? "みんなに拍手！おつかれさまでした。"
                : "さあ、次は何番？"}
          </h1>
        </div>
        <span
          className={`phase-badge ${state.phase === "playing" ? "is-live" : ""}`}
        >
          <span />
          {phaseLabel(state.phase)}
        </span>
      </div>

      <div className="host-stat-strip" aria-label="ゲームの状況">
        <Stat
          label="参加者"
          value={state.players.length}
          unit="人"
          detail={`${connectedPlayers} 人が接続中`}
        />
        <Stat
          label="抽選済み"
          value={state.drawnNumbers.length}
          unit="/ 75"
          detail="重複のないランダム抽選"
        />
        <Stat
          label="残りの景品"
          value={remainingPrizes}
          unit="個"
          detail={`当選 ${state.winnersCount} / ${state.prizeCount}`}
        />
      </div>

      {isSetup && (
        <section className="card host-setup-panel">
          <div className="host-setup-content">
            <ol className="setup-progress" aria-label="準備のステップ">
              {["景品数", "景品名", "スタート"].map((label, i) => (
                <li
                  key={label}
                  className={
                    (state.phase === "prizeInput" ? 1 : 0) === i
                      ? "active"
                      : i === 0 && state.phase === "prizeInput"
                        ? "complete"
                        : ""
                  }
                >
                  <span>
                    {i === 0 && state.phase === "prizeInput"
                      ? "✓"
                      : `0${i + 1}`}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
            {state.phase === "setup" ? (
              <div className="setup-card">
                <p className="eyebrow">STEP 01 — PRIZES</p>
                <h2>
                  ワクワクする景品、
                  <br />
                  いくつ用意する？
                </h2>
                <p className="muted">
                  景品の数を決めて、イベントの準備を始めましょう。
                </p>
                <form
                  onSubmit={handleSubmitPrizeCount}
                  className="prize-count-form"
                >
                  <label className="label" htmlFor="prize-count">
                    景品の数 <span>1〜50 個</span>
                  </label>
                  <div className="prize-count-field">
                    <input
                      id="prize-count"
                      className="text-input"
                      type="number"
                      min="1"
                      max="50"
                      value={prizeCountInput}
                      onChange={(e) => setPrizeCountInput(e.target.value)}
                      required
                    />
                    <span>個</span>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!canOperate}
                  >
                    景品名を設定する <Icon name="arrow" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="setup-card">
                <p className="eyebrow">STEP 02 — PRIZE LINEUP</p>
                <h2>お楽しみの景品を、並べよう！</h2>
                <p className="muted">
                  {state.prizeCount} 等から順に当選。1
                  等の景品が、フィナーレを飾ります。
                </p>
                <form onSubmit={handleSubmitPrizeNames} className="prize-form">
                  <div className="prize-list">
                    {prizeNameInputs.map((val, i) => (
                      <div className="prize-row" key={i}>
                        <label
                          className={`prize-rank ${i === 0 ? "top-rank" : ""}`}
                          htmlFor={`prize-name-${i}`}
                        >
                          <span>{String(i + 1).padStart(2, "0")}</span>等
                        </label>
                        <input
                          id={`prize-name-${i}`}
                          className="text-input"
                          type="text"
                          placeholder={`景品 ${i + 1} の名前`}
                          value={val}
                          maxLength={40}
                          onChange={(e) =>
                            setPrizeNameInputs((current) =>
                              current.map((v, index) =>
                                index === i ? e.target.value : v,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="setup-hint">
                    <Icon name="spark" />
                    景品名は、当選まで参加者には秘密です。
                  </p>
                  <div className="prize-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={!canOperate}
                      onClick={handleBackToSetup}
                    >
                      戻る
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!canOperate}
                    >
                      ゲームを始める <Icon name="arrow" />
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
          <aside className="setup-art" aria-hidden="true">
            <span className="setup-art-kicker">
              GOOD NUMBERS. GREAT MEMORIES.
            </span>
            <div className="setup-art-orbit orbit-one" />
            <div className="setup-art-orbit orbit-two" />
            <div className="setup-art-ball ball-small">07</div>
            <div className="setup-art-ball ball-main">
              24<span>BINGO EX</span>
            </div>
            <div className="setup-art-ball ball-back">68</div>
            <div className="setup-art-caption">
              <span>READY, SET,</span>
              <strong>
                BINGO!
                <br />
                <em>Let’s play.</em>
              </strong>
              <p>みんなで笑って、みんなでドキドキ。</p>
            </div>
            <div className="setup-art-bottom">
              <span>B</span>
              <span>I</span>
              <span>N</span>
              <span>G</span>
              <span>O</span>
              <i>EX</i>
            </div>
          </aside>
        </section>
      )}

      {!isSetup && (
        <div className="host-main-wide">
          <div className="host-stage-column">
            <section
              className={`card draw-card ${isDrawing ? "is-drawing" : ""}`}
              aria-label="番号の抽選"
            >
              <div className="draw-stage-top">
                <span className="eyebrow">THE LUCKY NUMBER</span>
                <span className="draw-round">
                  DRAW{" "}
                  {String(
                    state.drawnNumbers.length + (isDrawing ? 1 : 0),
                  ).padStart(2, "0")}
                </span>
              </div>
              <div
                className={`draw-display ${isDrawing ? "drawing" : ""}`}
                style={{
                  "--draw-color": drawPalette.color,
                  "--draw-soft": drawPalette.soft,
                }}
                aria-busy={isDrawing}
              >
                <div className="draw-orbit orbit-outer" />
                <div className="draw-orbit orbit-inner" />
                <div className="draw-spotlight" />
                <span className="draw-column-label">
                  {displayedNumber
                    ? ["B", "I", "N", "G", "O"][
                        Math.floor((displayedNumber - 1) / 15)
                      ]
                    : "EX"}
                </span>
                <div
                  className={`draw-number ${isDrawing ? "draw-spinning" : ""}`}
                  key={isDrawing ? "drawing" : state.lastDrawn}
                  aria-live={isDrawing ? "off" : "polite"}
                >
                  {displayedNumber ?? "—"}
                </div>
                <div className="draw-label">
                  {isDrawing
                    ? "ドキドキ…次の番号は？"
                    : state.lastDrawn
                      ? "最新の番号"
                      : "準備はいいですか？"}
                </div>
              </div>
              <div className="draw-actions">
                <button
                  className="btn btn-primary btn-lg draw-button"
                  onClick={handleDraw}
                  disabled={
                    !canOperate ||
                    state.phase === "finished" ||
                    isDrawing ||
                    state.drawnNumbers.length >= 75
                  }
                >
                  <Icon name="spark" />
                  {isDrawing
                    ? "抽選中..."
                    : state.phase === "finished"
                      ? "全景品の当選が確定"
                      : state.drawnNumbers.length >= 75
                        ? "すべての番号を抽選済み"
                        : "次の番号を抽選する"}
                  <Icon name="arrow" />
                </button>
              </div>
              <div className="draw-stage-bottom">
                <span>
                  <span className="live-dot" />
                  {state.phase === "finished" ? "GAME COMPLETE" : "LIVE GAME"}
                </span>
                <span>{75 - state.drawnNumbers.length} NUMBERS TO GO</span>
              </div>
            </section>

            <section className="card history-card" aria-label="抽選番号の履歴">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">DRAW HISTORY</p>
                  <h2>これまでの番号</h2>
                </div>
                <span className="history-count">
                  {state.drawnNumbers.length}
                  <small> / 75</small>
                </span>
              </div>
              {state.drawnNumbers.length > 0 && (
                <div className="recent-draws">
                  <span>最新</span>
                  {state.drawnNumbers
                    .slice(-5)
                    .reverse()
                    .map((n, i) => (
                      <span
                        key={n}
                        className={`recent-number column-${Math.floor((n - 1) / 15)} ${i === 0 ? "latest" : ""}`}
                      >
                        {n}
                      </span>
                    ))}
                </div>
              )}
              <div className="drawn-list">
                {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => (
                  <div
                    key={n}
                    className={`drawn-cell column-${Math.floor((n - 1) / 15)} ${state.drawnNumbers.includes(n) ? "hit" : ""} ${state.lastDrawn === n ? "last" : ""}`}
                    aria-label={`${n}${state.drawnNumbers.includes(n) ? " 抽選済み" : " 未抽選"}`}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="host-side-column">
            <section className="card prize-card prize-card-wide">
              <div className="prize-card-header">
                <div>
                  <p className="eyebrow">THE PRIZE LINEUP</p>
                  <h2>景品と当選者</h2>
                </div>
                <span className="prize-progress-count">
                  {state.winnersCount}
                  <small> / {state.prizeCount}</small>
                </span>
              </div>
              {state.winners.length > 0 && (
                <div className="prize-view-tabs">
                  <button
                    className={!showResults ? "active" : ""}
                    onClick={() => setShowResults(false)}
                  >
                    景品カード
                  </button>
                  <button
                    className={showResults ? "active" : ""}
                    onClick={() => setShowResults(true)}
                  >
                    結果一覧
                  </button>
                </div>
              )}
              {!showResults ? (
                <ul className="prize-display-list">
                  {prizeIndices.map((i) => {
                    const winner = state.winners.find(
                      (w) => w.prizeIndex === i,
                    );
                    const isNext =
                      i === state.prizeCount - 1 - state.winners.length &&
                      state.phase === "playing";
                    return (
                      <li
                        key={i}
                        className={`prize-display-item ${winner ? "won" : ""} ${isNext ? "next-prize" : ""}`}
                      >
                        <div className="prize-display-rank">
                          <span>{String(i + 1).padStart(2, "0")}</span>等
                        </div>
                        <div className="prize-display-content">
                          <div className="prize-display-name">
                            {winner
                              ? state.prizeNames[i] || `景品 ${i + 1}`
                              : "SECRET PRIZE"}
                          </div>
                          <div className="prize-display-winner">
                            {winner
                              ? `${winner.name} さん`
                              : isNext
                                ? "次のビンゴで当選"
                                : "当選までのお楽しみ"}
                          </div>
                        </div>
                        <span
                          className={`prize-state-label ${winner ? "claimed" : ""}`}
                        >
                          {winner ? (
                            "✓"
                          ) : isNext ? (
                            "NEXT"
                          ) : (
                            <Icon name="lock" />
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="results-panel">
                  <ResultsTable state={state} />
                  <div className="results-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleExportCSV}
                    >
                      CSV ダウンロード
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleCopyResults}
                    >
                      コピー
                    </button>
                  </div>
                </div>
              )}
              <p className="prize-side-note">
                <Icon name="spark" />1 等は、最後のお楽しみ。
              </p>
            </section>
            <details className="card participants-card">
              <summary>
                <span>
                  <span className="live-dot" />
                  参加者
                </span>
                <b>{state.players.length} 人</b>
                <Icon name="chevron" />
              </summary>
              <ul className="player-list">
                {state.players.length ? (
                  state.players.map((p) => (
                    <li
                      className={`player-item ${p.isWinner ? "winner" : ""}`}
                      key={p.id}
                    >
                      <span
                        className={`player-dot ${p.connected ? "on" : "off"}`}
                      />
                      <span className="player-list-name">{p.name}</span>
                      <span className="player-list-meta">
                        {p.isWinner
                          ? "当選済み"
                          : p.connected
                            ? "接続中"
                            : "未接続"}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="muted">参加者を待っています。</li>
                )}
              </ul>
            </details>
          </aside>
        </div>
      )}

      {state.phase === "finished" && (
        <section className="card finished-card">
          <div className="finished-banner">
            <span className="finished-icon" aria-hidden="true">
              <Icon name="trophy" />
            </span>
            <div>
              <p className="eyebrow">WHAT A FUN GAME!</p>
              <h2>すべての景品が、当選者のもとへ。</h2>
              <p>ご参加ありがとうございました。</p>
            </div>
          </div>
          <ResultsTable state={state} final />
          <div className="finished-actions">
            <button className="btn btn-primary" onClick={handleExportCSV}>
              <Icon name="download" />
              結果を CSV で保存
            </button>
            <button className="btn btn-ghost" onClick={handleCopyResults}>
              テキストをコピー
            </button>
          </div>
        </section>
      )}

      <footer className="host-footer">
        <span>
          BINGO EX <span>—</span> MAKE EVERY NUMBER COUNT.
        </span>
        {!isSetup && (
          <button
            className="host-reset-button"
            disabled={!canOperate || isDrawing}
            onClick={handleReset}
          >
            ゲームをリセット
          </button>
        )}
      </footer>
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}

      {winnerPopup && (
        <div className="modal-overlay host-winner-overlay">
          <Celebration />
          <div
            className="modal winner-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="winner-heading"
          >
            <div className="winner-medal" aria-hidden="true">
              <Icon name="trophy" />
            </div>
            <p className="eyebrow">HURRAY! WE HAVE A WINNER!</p>
            <div className="winner-rank">
              {winnerPopup.prizeIndex + 1}
              <span>等 当選</span>
            </div>
            <h2 className="winner-name" id="winner-heading">
              {winnerPopup.name}
              <small>さん</small>
            </h2>
            <div className="winner-prize-label">獲得景品</div>
            <div className="winner-prize-name">{winnerPopup.prizeName}</div>
            <button
              ref={winnerDismissRef}
              className="btn btn-primary"
              onClick={dismissWinner}
            >
              {winnerQueue.length > 1
                ? `次の当選者へ（あと ${winnerQueue.length - 1} 人）`
                : "おめでとうございます！"}
              <Icon name="arrow" />
            </button>
            <p className="winner-dismiss-hint">
              8 秒後に自動で
              {winnerQueue.length > 1 ? "次の当選者を表示" : "閉じます"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Wordmark() {
  return (
    <span className="wordmark">
      BINGO <em>EX</em>
      <span className="wordmark-star" aria-hidden="true">
        ✦
      </span>
    </span>
  );
}
function Stat({ label, value, unit, detail }) {
  return (
    <div className="host-stat">
      <span className="host-stat-label">{label}</span>
      <div className="host-stat-value">
        {String(value).padStart(2, "0")}
        <small>{unit}</small>
      </div>
      <span className="host-stat-detail">{detail}</span>
    </div>
  );
}
function ResultsTable({ state, final = false }) {
  return (
    <div className="results-table-scroll">
      <table className={`results-table ${final ? "results-table-final" : ""}`}>
        <thead>
          <tr>
            <th scope="col">順位</th>
            <th scope="col">景品名</th>
            <th scope="col">当選者</th>
          </tr>
        </thead>
        <tbody>
          {state.prizeNames.map((name, i) => {
            const winner = state.winners.find((w) => w.prizeIndex === i);
            return (
              <tr key={i} className={winner ? "row-won" : ""}>
                <td>{i + 1} 等</td>
                <td>{winner || final ? name || `景品 ${i + 1}` : "？？？"}</td>
                <td>{winner ? winner.name : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function phaseLabel(phase) {
  return (
    {
      setup: "景品数を設定",
      prizeInput: "景品名を設定",
      playing: "ゲーム進行中",
      finished: "ゲーム終了",
    }[phase] || phase
  );
}
function Icon({ name }) {
  const paths = {
    arrow: (
      <>
        <path d="M4 12h15M13 6l6 6-6 6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" />
        <path d="M20 3v4M18 5h4" />
      </>
    ),
    screen: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M12 17v4M8 21h8" />
      </>
    ),
    qr: (
      <>
        <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="m12 12 9 9M16 16l3-3M19 19l3-3" />
      </>
    ),
    trophy: (
      <>
        <path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 15v6M8 21h8" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
