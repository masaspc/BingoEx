import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./PlayerStatus.css";

export default function PlayerJoin() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // 保存された名前を入力欄に復元する。
    const saved = localStorage.getItem("bingoex:name");
    if (saved) setName(saved);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem("bingoex:name", trimmed);
    // playerId と token はサーバー発行を受け取ってから保存する
    navigate("/game");
  };

  return (
    <main className="join-screen">
      <header className="join-topbar">
        <div className="player-wordmark" aria-label="Bingo Ex">
          BINGO <em>EX</em>
        </div>
        <span className="join-event-tag">
          <i aria-hidden="true" /> LIVE EVENT
        </span>
      </header>

      <div className="join-layout">
        <section className="join-intro">
          <p className="player-eyebrow">A LITTLE LUCK. A GREAT NIGHT.</p>
          <h1>
            その一瞬を、
            <br />
            <span>みんなで。</span>
          </h1>
          <p className="join-description">
            あなたのカードで、今夜の主役に。
            <br />
            名前を入れて、ビンゴの輪に加わろう。
          </p>
          <div className="join-orbit" aria-hidden="true">
            <div className="join-orbit-ring ring-one" />
            <div className="join-orbit-ring ring-two" />
            <div className="join-orbit-ring ring-three" />
            <div className="join-orbit-cross cross-one" />
            <div className="join-orbit-cross cross-two" />
            <div className="join-ball ball-back">
              <span>07</span>
            </div>
            <div className="join-ball ball-front">
              <small>BINGO EX</small>
              <span>24</span>
            </div>
            <div className="join-ball ball-small">
              <span>61</span>
            </div>
            <div className="join-orbit-caption">YOUR LUCK STARTS HERE</div>
          </div>
        </section>

        <section className="join-ticket" aria-labelledby="join-title">
          <div className="join-ticket-top">
            <span className="player-eyebrow">YOUR INVITATION</span>
            <svg
              className="join-ticket-star"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 id="join-title">準備はいいですか？</h2>
          <p className="join-form-description">
            まずは、会場で呼ばれるお名前を。
          </p>
          <form onSubmit={handleSubmit} className="join-form">
            <label className="label" htmlFor="player-name">
              あなたのお名前
            </label>
            <input
              id="player-name"
              className="text-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：山田 太郎"
              maxLength={20}
              autoComplete="name"
              required
            />
            <button
              type="submit"
              className="btn btn-primary join-submit"
              disabled={!name.trim()}
            >
              <span>参加する</span>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 12h15m-6-6 6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>
          <div className="join-ticket-divider">
            <span /> <span /> <span /> <span /> <span /> <span /> <span />{" "}
            <span /> <span /> <span /> <span /> <span /> <span /> <span />{" "}
            <span /> <span /> <span /> <span /> <span /> <span />
          </div>
          <ol className="join-guide">
            <li>
              <span>01</span>
              <p>名前を入力して、カードを受け取る</p>
            </li>
            <li>
              <span>02</span>
              <p>抽選された番号は自動でマーク</p>
            </li>
            <li>
              <span>03</span>
              <p>縦・横・斜めがそろったら申告！</p>
            </li>
          </ol>
          <p className="join-no-install">アプリのインストールは不要です</p>
        </section>
      </div>
      <footer className="join-footer">
        <span>GOOD COMPANY. GOOD LUCK.</span>
        <span>BINGO EX</span>
      </footer>
    </main>
  );
}
