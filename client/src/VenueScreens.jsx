import { useEffect, useState } from "react";
import useDisplayState from "./useDisplayState.js";
import Celebration from "./Celebration.jsx";
import "./VenueScreens.css";

function BingoTitle() {
  return (
    <span className="venue-logo" aria-label="BingoEx">
      <span className="title-b">B</span>
      <span className="title-i">I</span>
      <span className="title-n">N</span>
      <span className="title-g">G</span>
      <span className="title-o">O</span>
      <span className="title-ex">EX</span>
    </span>
  );
}

function PartyBalls() {
  return (
    <div className="venue-party-balls" aria-hidden="true">
      {"BINGO".split("").map((letter, index) => (
        <span key={letter} data-color={index}>
          {letter}
        </span>
      ))}
    </div>
  );
}

function phaseLabel(phase) {
  switch (phase) {
    case "setup":
    case "prizeInput":
      return "開始準備中";
    case "playing":
      return "ゲーム進行中";
    case "finished":
      return "ゲーム終了";
    default:
      return "情報を取得中";
  }
}

function ConnectionStatus({ connected, synced, hasState }) {
  const ready = connected && synced;
  return (
    <div
      className={`venue-connection ${ready ? "is-ready" : "is-waiting"}`}
      role="status"
    >
      <span className="venue-connection-dot" aria-hidden="true" />
      {ready
        ? "接続中"
        : connected
          ? "最新の情報を取得しています"
          : hasState
            ? "再接続中 · 表示は最後に受信した情報です"
            : "サーバーに接続しています"}
    </div>
  );
}

export function ReceptionScreen() {
  const { state, connected, synced } = useDisplayState();
  const [qrImage, setQrImage] = useState("");
  const [qrError, setQrError] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const joinUrl = `${window.location.origin}/`;

  useEffect(() => {
    let active = true;
    // 参加者のスマホには不要な QR ライブラリを、受付表示時だけ読み込む。
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(joinUrl, {
          width: 560,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#24304a", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (active) setQrImage(url);
      })
      .catch(() => {
        if (active) setQrError(true);
      });
    return () => {
      active = false;
    };
  }, [joinUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopyMessage("参加リンクをコピーしました。");
    } catch {
      setCopyMessage("下の参加リンクを選択してコピーしてください。");
    }
  };

  return (
    <main className="venue-screen reception-screen">
      <header className="venue-header">
        <h1>
          <BingoTitle />
          <span className="venue-page-label">参加受付</span>
        </h1>
        <ConnectionStatus
          connected={connected}
          synced={synced}
          hasState={Boolean(state)}
        />
      </header>

      <div className="reception-content">
        <section
          className="card reception-qr-panel"
          aria-labelledby="reception-join-heading"
        >
          <PartyBalls />
          <p className="venue-eyebrow">LET’S PLAY TOGETHER!</p>
          <h2 id="reception-join-heading">
            スマホで読み取って、
            <br />
            みんなでビンゴ！
          </h2>
          <div className="reception-qr">
            {qrImage ? (
              <img
                src={qrImage}
                alt="BingoEx の参加ページを開く QR コード"
                width="560"
                height="560"
              />
            ) : (
              <p role="status">
                {qrError
                  ? "参加リンクからアクセスしてください。"
                  : "QR コードを準備しています…"}
              </p>
            )}
          </div>
          <p className="reception-qr-caption">
            スマホのカメラで QR コードを読み取ってください。
          </p>
          <label className="label" htmlFor="reception-join-url">
            参加リンク
          </label>
          <input
            id="reception-join-url"
            className="text-input reception-join-url"
            value={joinUrl}
            readOnly
            onFocus={(event) => event.target.select()}
          />
          <div className="reception-link-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={copyLink}
            >
              リンクをコピー
            </button>
            <a
              className="btn btn-ghost"
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              参加ページを開く
            </a>
          </div>
          <p className="reception-copy-message" role="status">
            {copyMessage}
          </p>
        </section>

        <div className="reception-details">
          <section className="card reception-counts" aria-label="参加状況">
            <p className="venue-eyebrow">PARTICIPANTS</p>
            <div className="reception-phase">{phaseLabel(state?.phase)}</div>
            <dl>
              <div>
                <dt>登録人数</dt>
                <dd>
                  {state?.playerCount ?? "—"}
                  <span>人</span>
                </dd>
              </div>
              <div>
                <dt>接続中</dt>
                <dd>
                  {state?.connectedCount ?? "—"}
                  <span>人</span>
                </dd>
              </div>
            </dl>
            <p>接続中の人数は、ゲーム画面を開いている参加者の人数です。</p>
          </section>
          <section
            className="card reception-instructions"
            aria-labelledby="reception-howto-heading"
          >
            <p className="venue-eyebrow">HOW TO JOIN</p>
            <h2 id="reception-howto-heading">参加の流れ</h2>
            <ol>
              <li>
                <strong>QR コードを読み取る</strong>
                <span>スマホで参加ページを開きます。</span>
              </li>
              <li>
                <strong>名前を入力して参加する</strong>
                <span>司会者が呼びやすい名前を入力してください。</span>
              </li>
              <li>
                <strong>自分のカードで楽しむ</strong>
                <span>
                  番号が出たらカードを確認。ビンゴになったら「ビンゴを申告する」を押してください。
                </span>
              </li>
            </ol>
            <p className="reception-notice">
              参加したブラウザをそのまま使い、ゲーム中はこの参加ページを開いておいてください。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

export function ProjectionScreen() {
  const { state, connected, synced } = useDisplayState();
  const drawnNumbers = state?.drawnNumbers ?? [];
  const drawn = new Set(drawnNumbers);
  const winners = state?.winners ?? [];
  const latestWinner = winners.at(-1);
  const prizeIndices = Array.from(
    { length: state?.prizeCount ?? 0 },
    (_, index) => index,
  ).reverse();

  return (
    <main className="venue-screen projection-screen">
      <header className="venue-header">
        <h1>
          <BingoTitle />
          <span className="venue-page-label">{phaseLabel(state?.phase)}</span>
        </h1>
        <div className="projection-header-status">
          <span>
            参加者 <b>{state?.playerCount ?? "—"}</b> 人
          </span>
          <ConnectionStatus
            connected={connected}
            synced={synced}
            hasState={Boolean(state)}
          />
        </div>
      </header>

      <div className="projection-content">
        <section
          className={`projection-latest${latestWinner ? " has-winner" : ""}`}
          aria-labelledby="projection-latest-heading"
          tabIndex={0}
        >
          {latestWinner && (
            <Celebration
              key={`winner-${latestWinner.prizeIndex}-${latestWinner.name}`}
            />
          )}
          <p className="venue-eyebrow">LIVE DRAW</p>
          <h2 id="projection-latest-heading">最新の番号</h2>
          <div
            role="status"
            aria-labelledby="projection-latest-heading"
            aria-live="polite"
            aria-atomic="true"
          >
            <span
              key={state?.lastDrawn ?? "waiting"}
              className="projection-latest-number"
              data-color={
                state?.lastDrawn ? Math.floor((state.lastDrawn - 1) / 15) : 0
              }
            >
              {state?.lastDrawn ?? "—"}
            </span>
          </div>
          <p className="projection-draw-count">
            抽選済み <b>{drawnNumbers.length}</b> / 75
          </p>

          <section
            className="projection-latest-winner"
            aria-labelledby="projection-winner-heading"
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="venue-eyebrow">WINNER</p>
            <h2 id="projection-winner-heading">
              {latestWinner ? "最新の当選者" : "当選発表"}
            </h2>
            {latestWinner ? (
              <>
                <p className="projection-winner-rank">
                  {latestWinner.prizeIndex + 1} 等
                </p>
                <p className="projection-winner-name">
                  {latestWinner.name}
                  <span>さん</span>
                </p>
                <p className="projection-winner-prize">
                  {latestWinner.prizeName}
                </p>
              </>
            ) : (
              <p className="projection-winner-placeholder">
                ビンゴの申告をお待ちしています
              </p>
            )}
          </section>
        </section>

        <div className="projection-details">
          <section
            className="projection-history"
            aria-labelledby="projection-history-heading"
          >
            <p className="venue-eyebrow">NUMBER BOARD</p>
            <h2 id="projection-history-heading">これまでの番号</h2>
            <div className="projection-board-legend" aria-hidden="true">
              {"BINGO".split("").map((letter, index) => (
                <span key={letter} data-color={index}>
                  <b>{letter}</b> {index * 15 + 1}–{(index + 1) * 15}
                </span>
              ))}
            </div>
            <div
              className="projection-number-board"
              aria-label="1 から 75 の抽選状況"
            >
              {Array.from({ length: 75 }, (_, index) => index + 1).map(
                (number) => (
                  <span
                    key={number}
                    data-color={Math.floor((number - 1) / 15)}
                    className={`projection-number${drawn.has(number) ? " is-drawn" : ""}${state?.lastDrawn === number ? " is-latest" : ""}`}
                    aria-label={`${number}${state?.lastDrawn === number ? " 最新の番号" : drawn.has(number) ? " 抽選済み" : " 未抽選"}`}
                  >
                    {number}
                  </span>
                ),
              )}
            </div>
          </section>

          <section
            className="projection-prizes"
            aria-labelledby="projection-prizes-heading"
          >
            <div className="projection-prizes-heading">
              <h2 id="projection-prizes-heading">当選者・景品</h2>
              <span>
                当選 <b>{state?.winnersCount ?? 0}</b> /{" "}
                {state?.prizeCount ?? "—"}
              </span>
            </div>
            {prizeIndices.length ? (
              <ol
                className="projection-prize-list"
                tabIndex={0}
                aria-label="当選者・景品の一覧"
              >
                {prizeIndices.map((index) => {
                  const winner = winners.find(
                    (entry) => entry.prizeIndex === index,
                  );
                  return (
                    <li
                      key={index}
                      className={`projection-prize-row${winner ? " is-won" : ""}${winner && winner === latestWinner ? " is-latest-winner" : ""}`}
                    >
                      <span className="projection-prize-rank">
                        {index + 1} 等
                      </span>
                      <span className="projection-prize-name">
                        {winner ? winner.prizeName : "未発表"}
                      </span>
                      <span className="projection-prize-winner">
                        {winner ? `${winner.name} さん` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="projection-winner-placeholder">
                景品を準備しています
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
