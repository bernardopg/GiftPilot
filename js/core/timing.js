/*
  Randomized scheduling helpers to make automated actions look human-paced.

  Fixed-interval timers (e.g. one action every exactly N seconds) are a classic
  bot tell: real people click in bursts, pause to read, get distracted, etc.
  These helpers build jittered, non-uniform schedules around a user-configured
  base delay. All functions are pure and accept an injectable `rng` so they can
  be unit tested deterministically.
*/
(() => {
  const randomBetween = (min, max, rng = Math.random) =>
    min + rng() * (max - min);

  /**
   * Multiplier applied to the base delay for a single step.
   * Most steps cluster around the base pace, some are faster, and a few take
   * much longer (reading the page, distractions), mimicking human behavior.
   */
  const humanStepMultiplier = (rng = Math.random) => {
    const r = rng();
    if (r < 0.08) return randomBetween(2.2, 4.2, rng); // distracted pause
    if (r < 0.4) return randomBetween(1.15, 1.9, rng); // slower than usual
    return randomBetween(0.4, 1.1, rng); // normal pace
  };

  /**
   * Cumulative schedule (millisecond offsets from "now") for `count` actions
   * with an average spacing of `baseSeconds`, jittered per step. A random
   * lead-in avoids acting at t=0, another automation tell.
   */
  const buildSchedule = (count, baseSeconds, rng = Math.random) => {
    const schedule = [];
    let elapsed = randomBetween(400, 2400, rng); // human "page settle" lead-in
    for (let i = 0; i < count; i++) {
      elapsed += baseSeconds * 1000 * humanStepMultiplier(rng);
      schedule.push(Math.round(elapsed));
    }
    return schedule;
  };

  /**
   * Incremental scheduler for loops that discover work item by item (so the
   * total count is not known upfront). Each call to `next()` returns the
   * cumulative delay in ms for the next action.
   */
  const createScheduler = (baseSeconds, rng = Math.random) => {
    let elapsed = randomBetween(400, 2400, rng);
    return {
      next() {
        elapsed += baseSeconds * 1000 * humanStepMultiplier(rng);
        return Math.round(elapsed);
      },
      elapsed() {
        return Math.round(elapsed);
      },
    };
  };

  /** Fisher-Yates shuffle; returns a new array, input is not mutated. */
  const shuffled = (items, rng = Math.random) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  globalThis.GiftPilotTiming = {
    buildSchedule,
    createScheduler,
    humanStepMultiplier,
    randomBetween,
    shuffled,
  };
})();
