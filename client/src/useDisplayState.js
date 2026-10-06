import { useEffect, useState } from "react";
import socket from "./socket.js";

// 表示専用の公開情報だけを購読する。参加者登録やホスト認証は行わない。
export default function useDisplayState() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const joinDisplay = () => {
      setConnected(true);
      setSynced(false);
      socket.emit("display:join");
    };
    const onDisconnect = () => {
      setConnected(false);
      setSynced(false);
    };
    const onUpdate = (nextState) => {
      setState(nextState);
      setSynced(true);
    };

    // 初回スナップショットを取りこぼさないよう、購読を先に設定する。
    socket.on("display:update", onUpdate);
    socket.on("connect", joinDisplay);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);
    if (socket.connected) joinDisplay();

    return () => {
      socket.off("display:update", onUpdate);
      socket.off("connect", joinDisplay);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return { state, connected, synced };
}
