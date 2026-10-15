// Run against an isolated local production server, never the live event.
// BINGO_BROWSER_URL=http://127.0.0.1:3301 node tests/draw-browser.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.env.BINGO_BROWSER_URL || "http://127.0.0.1:3301";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [];
const pages = [];
async function page(path, viewport, reducedMotion = "no-preference") {
  const context = await browser.newContext({ viewport, reducedMotion });
  if (path === "/host")
    await context.addInitScript(() => {
      const nativeNow = Date.now.bind(Date);
      Date.now = () => nativeNow() + 3600000; // A host with a skewed system clock.
    });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + path);
  pages.push(p);
  return p;
}
const phase = (p) => p.locator("[data-draw-phase]");
const waitPhase = (p, value) =>
  p.waitForFunction(
    (value) =>
      document.querySelector("[data-draw-phase]")?.dataset.drawPhase === value,
    value,
  );
const number = (p) =>
  p.locator(".draw-number, .projection-latest-number").innerText();
async function noOverflow(p) {
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
}
try {
  const host = await page("/host", { width: 390, height: 844 });
  await host.getByRole("button", { name: /景品名を設定する/ }).click();
  await host.getByRole("button", { name: /ゲームを始める/ }).click();
  const display = await page("/display", { width: 1920, height: 1080 });
  const reducedHost = await page(
    "/host",
    { width: 390, height: 844 },
    "reduce",
  );
  const reduced = await page("/display", { width: 390, height: 844 }, "reduce");
  await Promise.all(pages.map(noOverflow));
  for (const p of pages)
    await p.evaluate(() => {
      window.phases = [];
      window.numbers = [];
      new MutationObserver(() => {
        const value = document.querySelector(
          ".draw-number, .projection-latest-number",
        )?.textContent;
        const phase =
          document.querySelector("[data-draw-phase]")?.dataset.drawPhase;
        if (
          window.numbers.at(-1)?.value !== value ||
          window.numbers.at(-1)?.phase !== phase
        )
          window.numbers.push({
            value,
            phase,
            at: performance.timeOrigin + performance.now(),
          });
      }).observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      new MutationObserver(() => {
        const phase =
          document.querySelector("[data-draw-phase]")?.dataset.drawPhase;
        if (window.phases.at(-1)?.phase !== phase)
          window.phases.push({
            phase,
            at: performance.timeOrigin + performance.now(),
          });
      }).observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ["data-draw-phase"],
      });
    });
  const button = host.getByRole("button", { name: /次の番号を抽選する/ });
  await button.click();
  await Promise.all(pages.map((p) => waitPhase(p, "fast")));
  assert.equal(await host.locator(".draw-button").isDisabled(), true);
  assert.equal(
    await reduced
      .locator(".projection-latest-number")
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  assert.equal(
    await reducedHost
      .locator(".draw-number")
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  assert.match(await number(reduced), /^\d+$/);
  assert.equal(await host.locator(".history-count").innerText(), "0 / 75");
  assert.equal(
    await display.locator(".projection-draw-count").innerText(),
    "抽選済み 0 / 75",
  );
  await display.screenshot({
    path: "/tmp/bingoex-projection-fast.png",
    fullPage: true,
  });
  await host.screenshot({
    path: "/tmp/bingoex-host-mobile-fast.png",
    fullPage: true,
  });
  const late = await page("/display", { width: 1920, height: 1080 });
  await waitPhase(display, "slow");
  await waitPhase(late, "slow");
  await waitPhase(display, "hold");
  assert.match(await number(display), /^\d+$/);
  await Promise.all(pages.map((p) => waitPhase(p, "reveal")));
  const results = await Promise.all(pages.map(number));
  assert.equal(new Set(results).size, 1);
  await display.screenshot({
    path: "/tmp/bingoex-projection-result.png",
    fullPage: true,
  });
  await Promise.all(pages.map((p) => waitPhase(p, "idle")));
  const timings = await Promise.all(
    [host, display, reduced, reducedHost].map((p) =>
      p.evaluate(() => window.phases),
    ),
  );
  for (const name of ["fast", "slow", "hold", "reveal"]) {
    const times = timings.map((t) => t.find((x) => x.phase === name)?.at);
    assert.ok(times.every(Number.isFinite), JSON.stringify(timings));
    assert.ok(
      Math.max(...times) - Math.min(...times) < 180,
      `${name}: ${times}`,
    );
  }
  const numericSamples = await Promise.all(
    [host, display, reducedHost, reduced].map((p) =>
      p.evaluate(() => window.numbers),
    ),
  );
  for (const [index, samples] of numericSamples.entries()) {
    const spinning = samples.filter((s) => ["fast", "slow"].includes(s.phase));
    assert.ok(
      spinning.every((s) => /^\d+$/.test(s.value)),
      JSON.stringify(spinning),
    );
    assert.ok(
      new Set(spinning.map((s) => s.value)).size >= (index < 2 ? 20 : 6),
      JSON.stringify(spinning),
    );
    const hold = samples.filter((s) => s.phase === "hold");
    assert.equal(new Set(hold.map((s) => s.value)).size, 1);
  }
  // Repeated draw with an offline projection. Restore after authoritative result.
  await host.getByRole("button", { name: /次の番号を抽選する/ }).click();
  await waitPhase(display, "fast");
  await display.context().setOffline(true);
  await waitPhase(host, "reveal");
  await display.context().setOffline(false);
  await display.waitForFunction(() =>
    document.querySelector(".projection-draw-count")?.textContent.includes("2"),
  );
  assert.equal(await number(display), await number(host));
  await waitPhase(host, "idle");
  // Reset during a pending draw must not resurrect a delayed result.
  await host.getByRole("button", { name: /次の番号を抽選する/ }).click();
  await waitPhase(display, "fast");
  host.once("dialog", (d) => d.accept());
  await host.getByRole("button", { name: /リセット/ }).click();
  await host.getByRole("button", { name: /景品名を設定する/ }).waitFor();
  await new Promise((resolve) => setTimeout(resolve, 4500));
  assert.equal(await number(display), "—");
  assert.equal(
    await display.locator(".projection-draw-count").innerText(),
    "抽選済み 0 / 75",
  );
  await Promise.all(pages.map(noOverflow));
  for (const p of [host, reduced]) {
    await p.setViewportSize({ width: 320, height: 740 });
    await noOverflow(p);
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        timings,
        numericSamples,
        screenshots: [
          "/tmp/bingoex-projection-fast.png",
          "/tmp/bingoex-host-mobile-fast.png",
          "/tmp/bingoex-projection-result.png",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
