import { io } from "socket.io-client";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

// シングルトンの Socket インスタンス
const socket = io(SERVER_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"],
});

export default socket;
