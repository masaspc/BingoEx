import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "./socket.js";
import Celebration from "./Celebration.jsx";
import "./PlayerStatus.css";

function PlayerWinDialog({ won, onClose }) {
  const closeButton = useRef(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") closeHandler.current();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButton.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);

  return (
    <div className="modal-overlay player-win-overlay">
      <Celebration />
      <section
        className="modal win-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-win-title"
      >
        <p className="player-eyebrow">YOU DID IT! LET’S CELEBRATE!</p>
        <div className="player-win-medal" aria-hidden="true">
          <span>✦</span>
        </div>
        <p className="player-win-rank">
          {won.prizeIndex + 1}
          <span>等</span>
        </p>
        <h2 id="player-win-title">おめでとうございます！</h2>
        <p className="modal-sub">あなたが獲得した景品</p>
        <div className="prize-big">{won.prizeName}</div>
        <p className="modal-hint">
          景品の受け取りは、主催者の案内に従ってください。
        </p>
        <button ref={closeButton} className="btn btn-primary" onClick={onClose}>
          カードに戻る
        </button>
      </section>
    </div>
  );
}

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
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [sessionExpired, setSessionExpired] = useState(null);

  useEffect(() => {
    const name = localStorage.getItem("bingoex:name");
    if (!name) {
      navigate("/");
      return;
    }
    setMyName(name);

    const joinNow = () => {
      setConnected(true);
      const pid = localStorage.getItem("bingoex:playerId");
      const tok = localStorage.getItem("bingoex:token");
      socket.emit("player:join", { playerId: pid, token: tok, name });
    };

    const handleJoined = ({
      playerId: newId,
      token: newToken,
      name: restoredName,
      card,
      won,
    }) => {
      if (newId) localStorage.setItem("bingoex:playerId", newId);
      if (newToken) localStorage.setItem("bingoex:token", newToken);
      if (restoredName) {
        localStorage.setItem("bingoex:name", restoredName);
        setMyName(restoredName);
      }
      setCard(card);
      setWon(won || null);
      setSessionExpired(null);
    };
    const handleState = (s) => {
      setState(s);
    };
    const handleWon = ({ prizeIndex, prizeName }) => {
      setWon({ prizeIndex, prizeName });
      setShowWinPopup(true);
    };
    let messageTimer;
    const handleError = (msg) => {
      setMessage(msg);
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => setMessage(null), 3500);
    };
    const handleDisconnect = () => setConnected(false);
    const handleSessionExpired = ({ message }) => {
      setSessionExpired(message);
      setShowWinPopup(false);
    };
    const handleForceReset = () => {
      localStorage.removeItem("bingoex:playerId");
      localStorage.removeItem("bingoex:token");
      localStorage.removeItem("bingoex:name");
      navigate("/");
    };
    socket.on("connect", joinNow);
    socket.on("disconnect", handleDisconnect);
    socket.on("player:joined", handleJoined);
    socket.on("state:update", handleState);
    socket.on("player:won", handleWon);
    socket.on("error:message", handleError);
    socket.on("player:sessionExpired", handleSessionExpired);
    socket.on("player:forceReset", handleForceReset);
    // 接続前には送信をためず、接続後に一度だけ参加を要求する。
    // StrictMode 等による再実行はサーバー側でも同じ参加者として扱う。
    if (socket.connected) joinNow();

    return () => {
      socket.off("connect", joinNow);
      socket.off("disconnect", handleDisconnect);
      socket.off("player:joined", handleJoined);
      socket.off("state:update", handleState);
      socket.off("player:won", handleWon);
      socket.off("error:message", handleError);
      socket.off("player:sessionExpired", handleSessionExpired);
      socket.off("player:forceReset", handleForceReset);
      clearTimeout(messageTimer);
    };
  }, [navigate]);

  const drawnSet = useMemo(
    () => new Set(state.drawnNumbers),
    [state.drawnNumbers],
  );

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
    if (connected && !sessionExpired && !won) socket.emit("player:claimBingo");
  };

  if (sessionExpired) {
    return (
      <main className="screen center player-recovery-screen">
        <div className="card player-recovery" role="alert">
          <div className="player-wordmark">
            BINGO <em>EX</em>
          </div>
          <div className="player-recovery-symbol" aria-hidden="true">
            !
          </div>
          <p className="player-eyebrow">CHECK YOUR SESSION</p>
          <h1>参加情報を復元できません</h1>
          <p>{sessionExpired}</p>
          <p>新しいカードは発行していません。主催者に確認してください。</p>
          <p>参加し直す場合は、新しいカードになります。</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              localStorage.removeItem("bingoex:playerId");
              localStorage.removeItem("bingoex:token");
              navigate("/");
            }}
          >
            名前入力へ戻る
          </button>
        </div>
      </main>
    );
  }

  if (!card) {
    return (
      <main className="screen center player-loading-screen">
        <div className="player-loading" role="status">
          <div className="player-wordmark">
            BINGO <em>EX</em>
          </div>
          <div className="player-loading-orbit" aria-hidden="true">
            <span>✦</span>
          </div>
          <p>
            {message ||
              (connected
                ? "あなたのカードを準備しています…"
                : "会場に接続しています…")}
          </p>
          <small>まもなく、あなたの番です。</small>
        </div>
      </main>
    );
  }

  const headerLabels = ["B", "I", "N", "G", "O"];
  const markedCount = card
    .flat()
    .filter((cell) => cell.free || drawnSet.has(cell.number)).length;
  const possibleLines = [
    ...card,
    ...headerLabels.map((_, index) => card.map((row) => row[index])),
    card.map((row, index) => row[index]),
    card.map((row, index) => row[4 - index]),
  ];
  const hasReach = possibleLines.some(
    (line) =>
      line.filter((cell) => cell.free || drawnSet.has(cell.number)).length ===
      4,
  );
  const canClaim =
    connected && bingoLines > 0 && !won && state.phase === "playing";
  const waitingForStart =
    state.phase === "setup" || state.phase === "prizeInput";
  const phaseLabel = waitingForStart
    ? "まもなく開始"
    : state.phase === "finished"
      ? "ゲーム終了"
      : "ゲーム進行中";

  return (
    <main
      className={`screen player-screen ${canClaim ? "player-can-claim" : ""}`}
    >
      <header className="player-header">
        <div className="player-wordmark">
          BINGO <em>EX</em>
        </div>
        <div className={`player-live-badge ${connected ? "" : "offline"}`}>
          <i aria-hidden="true" />
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </header>

      <div className="player-greeting">
        <div>
          <p className="player-eyebrow">LET’S MAKE IT A BINGO!</p>
          <h1>
            <span className="player-name">{myName}</span>
            <small>さん</small>
          </h1>
        </div>
        <span className="player-phase">{phaseLabel}</span>
      </div>

      {!connected && (
        <div className="player-connection-notice" role="status">
          再接続中です。カードはそのままです。接続が戻るまでお待ちください。
        </div>
      )}

      <section className="last-drawn" aria-label="最新の抽選状況">
        <div className="player-draw-number-group">
          <div className="last-drawn-label">
            LATEST NUMBER <span>最新の番号</span>
          </div>
          <div
            key={state.lastDrawn ?? "waiting"}
            className={`last-drawn-number ${state.lastDrawn == null ? "draw-waiting" : ""}`}
            aria-live="polite"
          >
            {state.lastDrawn ?? "—"}
          </div>
        </div>
        <div className="player-draw-stats">
          <div>
            <span>抽選済み</span>
            <strong>
              {state.drawnNumbers.length}
              <small> / 75</small>
            </strong>
          </div>
          <div>
            <span>当選者</span>
            <strong>
              {state.winnersCount}
              <small> / {state.prizeCount}</small>
            </strong>
          </div>
        </div>
      </section>

      <section
        className="player-card-section"
        aria-label="あなたのビンゴカード"
      >
        <div className="player-card-caption">
          <span>YOUR BINGO CARD</span>
          <span>
            {bingoLines > 0 ? (
              <b>{bingoLines} BINGO!</b>
            ) : hasReach ? (
              <b>リーチ！</b>
            ) : (
              `${markedCount} / 25 MARKED`
            )}
          </span>
        </div>
        <div className={`bingo-card ${bingoLines > 0 ? "bingo-complete" : ""}`}>
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
                    className={`bingo-cell bingo-col-${ci} ${marked ? "marked" : ""} ${cell.free ? "free" : ""} ${!cell.free && cell.number === state.lastDrawn ? "cell-latest" : ""}`}
                  >
                    {cell.free ? (
                      <>
                        <span className="free-star" aria-hidden="true">
                          ✦
                        </span>
                        <span className="free-label">FREE</span>
                      </>
                    ) : (
                      <span>{cell.number}</span>
                    )}
                    {marked && !cell.free && (
                      <svg
                        className="cell-check"
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="m2 6 2.5 2.5L10 3"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {marked && (
                      <span className="player-sr-only">マーク済み</span>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>
        <p className="player-card-note">
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m3 8 3 3 7-7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          番号は自動でマークされます
        </p>
      </section>

      {won && (
        <section className="player-winner-summary" aria-label="獲得景品">
          <span className="player-winner-icon" aria-hidden="true">
            ✦
          </span>
          <div>
            <strong>{won.prizeIndex + 1} 等 当選済み</strong>
            <span>{won.prizeName}</span>
          </div>
        </section>
      )}

      <div className="player-actions">
        <p
          className={`player-claim-hint ${canClaim ? "ready" : ""}`}
          aria-live="polite"
        >
          {won
            ? "当選おめでとうございます！"
            : !connected
              ? "接続が戻るまでお待ちください"
              : waitingForStart
                ? "開始まで、この画面でお待ちください"
                : state.phase === "finished"
                  ? "ご参加ありがとうございました"
                  : bingoLines > 0
                    ? "ビンゴ成立！ボタンを押して申告しよう"
                    : hasReach
                      ? "あとひとつ。次の番号に期待！"
                      : "縦・横・斜め、どれか一列そろえばビンゴ"}
        </p>
        <button
          className="btn btn-primary btn-lg"
          disabled={!canClaim}
          onClick={handleClaim}
        >
          <span>{won ? "当選済み" : "ビンゴを申告する"}</span>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d={won ? "m5 12 4 4L19 6" : "M4 12h15m-6-6 6 6-6 6"}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <footer className="player-footer">
        <span>LET THE GOOD TIMES ROLL.</span>
        <span>BINGO EX</span>
      </footer>

      {message && (
        <div className="toast" role="alert">
          {message}
        </div>
      )}

      {won && showWinPopup && (
        <PlayerWinDialog won={won} onClose={() => setShowWinPopup(false)} />
      )}
    </main>
  );
}
