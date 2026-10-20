const test = require('node:test');
const assert = require('node:assert/strict');

const { createGiveawayHelpers, secToTime } = require('../js/content/rows');

function makeHelpers(settingsOverrides = {}, stateOverrides = {}) {
  const state = {
    settings: {
      PriorityWishlist: false,
      PriorityGroup: false,
      PriorityRegion: false,
      PriorityWhitelist: false,
      IgnoreGroups: false,
      IgnoreWhitelist: false,
      HideDlc: false,
      HideNonTradingCards: false,
      HideGroups: false,
      HideWhitelist: false,
      HideLevelsBelow: 0,
      HideLevelsAbove: 10,
      HideCostsBelow: 0,
      HideCostsAbove: 50,
      HideEntered: false,
      ...settingsOverrides,
    },
    ownedSteamApps: [],
    wishList: [],
    steamAppData: {},
    steamPackageData: {},
    ...stateOverrides,
  };

  return createGiveawayHelpers({
    state,
    t: (key) => key,
    chrome: {
      storage: {
        local: {
          set: () => {},
        },
      },
      runtime: {
        lastError: null,
      },
    },
    document: {
      createElement: () => ({}),
      createTextNode: (value) => ({ value }),
    },
  });
}

test('secToTime formats long and short durations', () => {
  assert.equal(secToTime(59), '59 s');
  assert.equal(secToTime(125), '02:05');
  assert.equal(secToTime(3661), '1:01:01');
  assert.equal(secToTime(90061), '1d 1:01:01');
});

test('row filters hide by level, cost, entry state, groups and ownership', () => {
  const helpers = makeHelpers(
    {
      HideLevelsBelow: 1,
      HideLevelsAbove: 8,
      HideCostsBelow: 2,
      HideCostsAbove: 40,
      HideEntered: true,
      HideGroups: true,
      HideWhitelist: true,
    },
    { ownedSteamApps: [100] },
  );
  const base = {
    level: 3,
    cost: 10,
    entered: false,
    isGroup: false,
    isWhitelist: false,
    appId: 0,
  };

  assert.equal(helpers.shouldHide(base), false);
  assert.equal(helpers.shouldHide({ ...base, level: 0 }), true);
  assert.equal(helpers.shouldHide({ ...base, level: 9 }), true);
  assert.equal(helpers.shouldHide({ ...base, cost: 1 }), true);
  assert.equal(helpers.shouldHide({ ...base, cost: 45 }), true);
  assert.equal(helpers.shouldHide({ ...base, entered: true }), true);
  assert.equal(helpers.shouldHide({ ...base, isGroup: true }), true);
  assert.equal(helpers.shouldHide({ ...base, isWhitelist: true }), true);
  assert.equal(helpers.shouldHide({ ...base, appId: 100 }), true);
});

test('store filters remove owned, DLC and card-less apps but keep wishlist', () => {
  const helpers = makeHelpers(
    { HideNonTradingCards: true, HideDlc: true },
    { ownedSteamApps: [100], wishList: [200] },
  );

  assert.equal(helpers.storeFilterHides(100, null), true);
  assert.equal(
    helpers.storeFilterHides(200, { type: 'dlc', hasTradingCards: false }),
    false,
  );
  assert.equal(
    helpers.storeFilterHides(300, { type: 'game', hasTradingCards: false }),
    true,
  );
  assert.equal(
    helpers.storeFilterHides(301, { type: 'dlc', hasTradingCards: true }),
    true,
  );
  assert.equal(
    helpers.storeFilterHides(302, { type: 'game', hasTradingCards: true }),
    false,
  );
  assert.equal(helpers.storeFilterHides(303, null), false);
});
