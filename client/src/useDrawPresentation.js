import { useEffect, useState } from "react";
import socket from "./socket.js";
import "./DrawPresentation.css";

// Epoch time anchored to a monotonic clock; estimate transport latency using RTT.
export default function useDrawPresentation(state, connected) {
  const [clock, setClock] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!connected) return;
    let disposed = false;
    const sync = () => {
      const sent = performance.now();
      socket.timeout(2000).emit("clock:sync", (error, serverNow) => {
        if (disposed || error || !Number.isFinite(serverNow)) return;
        const received = performance.now();
        setClock({
          server: serverNow + (received - sent) / 2,
          local: received,
        });
      });
    };
    sync();
    const timer = setInterval(sync, 30000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [connected]);
  useEffect(() => {
    if (!state) return;
    const fallback = {
      server: state.serverNow ?? Date.now(),
      local: performance.now(),
    };
    const anchor = clock ?? fallback;
    const tick = () => setNow(anchor.server + performance.now() - anchor.local);
    tick();
    if (!state.draw || !connected) return;
    const timer = setInterval(tick, 30);
    return () => clearInterval(timer);
  }, [state, connected, clock]);

  const draw = state?.draw;
  let phase = "idle";
  if (draw && connected) {
    const elapsed = now - draw.startedAt;
    phase = draw.revealed
      ? now < draw.endsAt
        ? "reveal"
        : "idle"
      : elapsed < 0
        ? "ready"
        : elapsed < 1440
          ? "fast"
          : elapsed < 3060
            ? "slow"
            : elapsed < 3510
              ? "hold"
              : "waiting";
  }
  const pending = Boolean(draw && !draw.revealed);
  const elapsed = Math.max(0, now - (draw?.startedAt ?? now));
  // Decorative sequence only: independent of the private server result.
  const tick =
    elapsed < 1440
      ? Math.floor(elapsed / 60)
      : 24 +
        [80, 175, 285, 410, 550, 705, 875, 1060, 1260, 1475].filter(
          (at) => elapsed - 1440 >= at,
        ).length;
  const seed = draw
    ? [...draw.id].reduce((sum, c) => sum + c.charCodeAt(0), 0)
    : 0;
  const number = pending
    ? !connected || reduced || ["ready", "hold", "waiting"].includes(phase)
      ? "?"
      : ((seed + tick * 29) % 75) + 1
    : state?.lastDrawn;
  const labels = {
    ready: "まもなく抽選スタート",
    fast: "運命の番号、回転中！",
    slow: "だんだん、ゆっくり…",
    hold: "次の番号は…",
    waiting: "結果を確認中…",
    reveal: "この番号に決定！",
    idle: "最新の番号",
  };
  return {
    phase,
    number,
    pending,
    busy: Boolean(draw),
    label: pending && !connected ? "再接続して結果を確認中…" : labels[phase],
  };
}
