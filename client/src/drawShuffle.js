// Decorative values only. Never accept or derive the server's winning number.
// The same draw ID and elapsed time reproduce the same sequence on each screen.
export function shuffleNumber(id, elapsed, reducedMotion = false) {
  const time = Math.max(0, Math.min(elapsed, 3060));
  const slowSteps = reducedMotion
    ? [450, 990]
    : [80, 175, 285, 410, 550, 705, 875, 1060, 1260, 1475];
  const fastInterval = reducedMotion ? 360 : 60;
  const step =
    time < 1440
      ? Math.floor(time / fastInterval)
      : 1440 / fastInterval +
        slowSteps.filter((at) => time - 1440 >= at).length;
  const seed = [...id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return ((seed + step * 29) % 75) + 1;
}
