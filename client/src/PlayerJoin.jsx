import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function PlayerJoin() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // 既に参加済み (localStorage に名前がある) なら直接ゲーム画面へ
    const saved = localStorage.getItem("bingoex:name");
    if (saved) setName(saved);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem("bingoex:name", trimmed);
    if (!localStorage.getItem("bingoex:playerId")) {
      localStorage.setItem("bingoex:playerId", crypto.randomUUID());
    }
    navigate("/game");
  };

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
        <p className="subtitle">リアルタイム・ウェブビンゴゲーム</p>
        <form onSubmit={handleSubmit} className="join-form">
          <label className="label">あなたのお名前</label>
          <input
            className="text-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：山田 太郎"
            maxLength={20}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            参加する
          </button>
        </form>
      </div>
    </div>
  );
}
