import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite の開発サーバーが /socket.io/ へのリクエストを
// サーバー (localhost:3001) へ中継する。これにより
// クライアントは window.location.origin だけで接続でき、
// プロキシ / クラウド開発環境でも動作する。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
