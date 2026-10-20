const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../js/core/timing.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function loadTiming() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(moduleSource, sandbox);
  return sandbox.GiftPilotTiming;
}

// Deterministic rng that cycles through the given values
const cycleRng = (values) => () => {
  const v = values.shift();
  values.push(v);
  return v;
};

test('timing module exposes the scheduling API', () => {
  const timing = loadTiming();
  assert.equal(typeof timing.buildSchedule, 'function');
  assert.equal(typeof timing.createScheduler, 'function');
  assert.equal(typeof timing.humanStepMultiplier, 'function');
  assert.equal(typeof timing.randomBetween, 'function');
  assert.equal(typeof timing.shuffled, 'function');
});

test('humanStepMultiplier stays within documented bands', () => {
  const timing = loadTiming();
  assert.equal(
    timing.humanStepMultiplier(cycleRng([0.0, 0.5])),
    0.5 * (4.2 - 2.2) + 2.2,
  );
  const slow = timing.humanStepMultiplier(cycleRng([0.2, 0.5]));
  assert.ok(slow >= 1.15 && slow <= 1.9);
  const normal = timing.humanStepMultiplier(cycleRng([0.9, 0.5]));
  assert.ok(normal >= 0.4 && normal <= 1.1);
});

test('buildSchedule returns cumulative increasing offsets with lead-in', () => {
  const timing = loadTiming();
  const schedule = timing.buildSchedule(5, 10, cycleRng([0.5]));
  assert.equal(schedule.length, 5);
  // lead-in with rng 0.5 => 400 + 0.5 * 2000 = 1400ms before the first action
  assert.ok(schedule[0] >= 1400);
  for (let i = 1; i < schedule.length; i++) {
    assert.ok(
      schedule[i] > schedule[i - 1],
      'offsets must be strictly increasing',
    );
  }
});

test('buildSchedule with zero items returns empty schedule', () => {
  const timing = loadTiming();
  assert.deepEqual([...timing.buildSchedule(0, 10)], []);
});

test('createScheduler accumulates delays across calls', () => {
  const timing = loadTiming();
  const scheduler = timing.createScheduler(10, cycleRng([0.5]));
  const first = scheduler.next();
  const second = scheduler.next();
  assert.ok(second > first);
  assert.equal(scheduler.elapsed(), second);
});

test('shuffled keeps all items and does not mutate the input', () => {
  const timing = loadTiming();
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const output = timing.shuffled(input, cycleRng([0.3]));
  assert.deepEqual(
    [...output].sort((a, b) => a - b),
    input,
  );
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('schedule is non-uniform (no fixed-interval bot pattern)', () => {
  const timing = loadTiming();
  const schedule = timing.buildSchedule(50, 10);
  const gaps = schedule.slice(1).map((v, i) => v - schedule[i]);
  const uniqueGaps = new Set(gaps);
  assert.ok(
    uniqueGaps.size > 10,
    `expected varied gaps, got ${uniqueGaps.size} unique values`,
  );
});
