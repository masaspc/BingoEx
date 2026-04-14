import { io } from "socket.io-client";

// 同一オリジン (window.location.origin) に接続する。
// 開発時は Vite の proxy が /socket.io を localhost:3001 に中継するため、
// クラウド開発環境 / プロキシ経由のURLでもそのまま動作する。
// 本番で別オリジンに繋ぎたい場合は VITE_SERVER_URL を設定する。
const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;

// シングルトンの Socket インスタンス
const socket = io(SERVER_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"],
});

export default socket;
