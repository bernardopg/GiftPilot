const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPlan, canAfford } = require('../js/core/autojoin-plan');

const settings = {
  IgnorePinned: true,
  IgnoreGroups: false,
  IgnoreWhitelist: false,
  MinCost: 0,
  MaxCost: -1,
  PriorityWishlist: true,
  PriorityGroup: false,
  PriorityRegion: false,
  PriorityWhitelist: false,
  LevelPriority: false,
  PointsToPreserve: 100,
};

const ga = (code, extra = {}) => ({
  code,
  cost: 10,
  level: 0,
  appId: 0,
  timeEnd: 2000,
  entered: false,
  pinned: false,
  ...extra,
});

test('plan skips entered, pinned, owned, too-high and duplicate rows', () => {
  const { queue, skipped } = buildPlan(
    [
      ga('aaaaa'),
      ga('aaaaa'),
      ga('bbbbb', { entered: true }),
      ga('ccccc', { pinned: true }),
      ga('ddddd', { appId: 7 }),
      ga('eeeee', { level: 5 }),
    ],
    { settings, level: 1, owned: [7], now: 1000 },
  );
  assert.deepEqual(
    queue.map((g) => g.code),
    ['aaaaa'],
  );
  assert.deepEqual(
    skipped.map((s) => s.reason),
    ['entered', 'pinned', 'owned', 'level'],
  );
});

test('locked rows are kept only when the description unlocks them', () => {
  const { queue, skipped } = buildPlan(
    [
      ga('aaaaa', { locked: true, hasDescription: true }),
      ga('bbbbb', { locked: true, hasDescription: false }),
    ],
    { settings, level: 1, now: 1000 },
  );
  assert.deepEqual(
    queue.map((g) => g.code),
    ['aaaaa'],
  );
  assert.equal(skipped[0].reason, 'locked');
});

test('wishlist rows are prioritized, original order kept otherwise', () => {
  const { queue } = buildPlan(
    [ga('aaaaa'), ga('bbbbb', { appId: 42 }), ga('ccccc')],
    { settings, level: 1, wishlist: [42], now: 1000 },
  );
  assert.deepEqual(
    queue.map((g) => g.code),
    ['bbbbb', 'aaaaa', 'ccccc'],
  );
});

test('background mode honors PointsToPreserve', () => {
  assert.equal(canAfford({ cost: 10 }, 115, settings, 'background'), true);
  assert.equal(canAfford({ cost: 20 }, 115, settings, 'background'), false);
  assert.equal(canAfford({ cost: 20 }, 115, settings, 'page'), true);
  assert.equal(canAfford({ cost: 200 }, 115, settings, 'page'), false);
});
