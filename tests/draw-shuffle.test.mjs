import assert from "node:assert/strict";
import { test } from "node:test";
import { shuffleNumber } from "../client/src/drawShuffle.js";

for (const reduced of [false, true]) {
  test(`numeric shuffle stays visible, slows and holds (reduced=${reduced})`, () => {
    const changes = [];
    for (let elapsed = 0; elapsed < 3510; elapsed++) {
      const number = shuffleNumber("shared-draw-id", elapsed, reduced);
      assert.ok(Number.isInteger(number) && number >= 1 && number <= 75);
      if (number !== changes.at(-1)?.number) changes.push({ number, elapsed });
    }
    assert.ok(new Set(changes.map((c) => c.number)).size >= (reduced ? 7 : 35));
    const gaps = changes.slice(1).map((c, i) => c.elapsed - changes[i].elapsed);
    assert.ok(gaps.every((gap, i) => !i || gap >= gaps[i - 1]));
    if (reduced) assert.ok(Math.min(...gaps) >= 360);
    assert.equal(
      shuffleNumber("shared-draw-id", 3060, reduced),
      shuffleNumber("shared-draw-id", 9000, reduced),
    );
    assert.equal(
      shuffleNumber("shared-draw-id", 0, reduced),
      shuffleNumber("shared-draw-id", -200, reduced),
    );
  });
}
