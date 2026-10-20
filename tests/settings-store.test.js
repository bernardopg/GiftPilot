const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../js/core/settings-store.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function loadSettingsStore({ getImpl, setImpl, onChangedImpl } = {}) {
  const storageSyncGet =
    getImpl ||
    ((defaults, callback) => {
      callback(defaults);
    });
  const storageSyncSet =
    setImpl ||
    ((values, callback) => {
      callback(values);
    });
  const listeners = new Set();
  const chromeStub = {
    runtime: {
      lastError: null,
    },
    storage: {
      sync: {
        get: storageSyncGet,
        set: storageSyncSet,
      },
      onChanged: {
        addListener: (listener) => {
          listeners.add(listener);
          if (onChangedImpl) onChangedImpl('add', listener);
        },
        removeListener: (listener) => {
          listeners.delete(listener);
          if (onChangedImpl) onChangedImpl('remove', listener);
        },
      },
    },
  };

  const context = {
    console,
    chrome: chromeStub,
  };
  context.globalThis = context;

  vm.runInNewContext(moduleSource, context, { filename: modulePath });

  return {
    store: context.GiftPilotSettingsStore,
    listeners,
  };
}

test('settings store exposes canonical defaults', () => {
  const { store } = loadSettingsStore();

  assert.equal(store.defaults.AutoJoinButton, false);
  assert.equal(store.defaults.PagesToLoad, 3);
  assert.equal(store.defaults.ShowChance, true);
  assert.equal(store.defaults.lastLaunchedVersion, 0);
  assert.deepEqual(store.getDefaults({ PagesToLoad: 9 }).PagesToLoad, 9);
});

test('settings store load merges defaults with stored values', async () => {
  let capturedDefaults;
  const { store } = loadSettingsStore({
    getImpl: (defaults, callback) => {
      capturedDefaults = defaults;
      callback({
        Language: 'pt-BR',
        ShowChance: false,
      });
    },
  });

  const values = await store.load({ lastLaunchedVersion: 20230517 });

  assert.equal(capturedDefaults.lastLaunchedVersion, 20230517);
  assert.equal(capturedDefaults.AutoJoinButton, false);
  assert.equal(values.Language, 'pt-BR');
  assert.equal(values.ShowChance, false);
  assert.equal(values.PagesToLoad, 3);
});

test('settings store save and update persist the next snapshot', async () => {
  const savedSnapshots = [];
  const { store } = loadSettingsStore({
    getImpl: (_defaults, callback) => {
      callback({
        PagesToLoad: 4,
        ShowChance: false,
      });
    },
    setImpl: (values, callback) => {
      savedSnapshots.push(values);
      callback(values);
    },
  });

  const saved = await store.save({ PagesToLoad: 6, ShowChance: true });
  assert.deepEqual(saved, { PagesToLoad: 6, ShowChance: true });

  const updated = await store.update((current) => ({
    ...current,
    PagesToLoad: current.PagesToLoad + 1,
  }));

  assert.equal(updated.PagesToLoad, 5);
  assert.equal(savedSnapshots.length, 2);
  assert.equal(savedSnapshots[0].PagesToLoad, 6);
  assert.equal(savedSnapshots[1].PagesToLoad, 5);
});

test('settings store listen registers and removes sync listeners', () => {
  const { store, listeners } = loadSettingsStore();

  const changes = [];
  const unlisten = store.listen((payload) => {
    changes.push(payload);
  });

  assert.equal(listeners.size, 1);
  const [listener] = listeners;
  listener({ Language: { oldValue: 'en', newValue: 'pt-BR' } }, 'sync');
  listener({ Language: { oldValue: 'en', newValue: 'pt-BR' } }, 'local');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].Language.newValue, 'pt-BR');

  unlisten();
  assert.equal(listeners.size, 0);
});
