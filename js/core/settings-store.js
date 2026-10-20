(() => {
  const DEFAULT_SETTINGS = Object.freeze({
    AutoJoinButton: false,
    AutoDescription: true,
    AutoComment: false,
    Comment: '',
    Language: 'auto',
    IgnoreGroups: false,
    IgnorePinned: true,
    IgnoreWhitelist: false,
    IgnoreGroupsBG: false,
    IgnorePinnedBG: true,
    IgnoreWhitelistBG: false,
    PageForBG: 'wishlist',
    RepeatHoursBG: 5,
    PagesToLoad: 3,
    PagesToLoadBG: 2,
    BackgroundAJ: false,
    LevelPriorityBG: true,
    OddsPriorityBG: false,
    InfiniteScrolling: true,
    ShowPoints: true,
    ShowButtons: true,
    LoadFive: false,
    HideDlc: false,
    HideEntered: false,
    HideGroups: false,
    HideNonTradingCards: false,
    HideWhitelist: false,
    HideLevelsBelow: 0,
    HideCostsBelow: 0,
    HideLevelsAbove: 10,
    HideCostsAbove: 50,
    PriorityGroup: false,
    PriorityRegion: false,
    PriorityWhitelist: false,
    PriorityWishlist: true,
    RepeatIfOnPage: false,
    RepeatHours: 5,
    NightTheme: false,
    LevelPriority: false,
    PlayAudio: true,
    AudioVolume: 1,
    Delay: 10,
    DelayBG: 10,
    MaxTimeLeftBG: 0,
    MinLevelBG: 0,
    MinCost: 0,
    MinCostBG: 0,
    MaxCost: -1,
    MaxCostBG: -1,
    LastKnownLevel: 10,
    PointsToPreserve: 0,
    WishlistPriorityForMainBG: false,
    IgnorePreserveWishlistOnMainBG: false,
    ShowChance: true,
    NotifyLimit: false,
    NotifyLimitAmount: 300,
    PreciseTime: false,
    AutoRedeemKey: false,
    lastLaunchedVersion: 0,
  });

  const wrapChrome =
    (storageArea, method) =>
    (...args) =>
      new Promise((resolve, reject) => {
        storageArea[method](...args, (result) => {
          const { lastError } = chrome.runtime;
          if (lastError) {
            reject(lastError);
            return;
          }
          resolve(result);
        });
      });

  const syncGet = wrapChrome(chrome.storage.sync, 'get');
  const syncSet = wrapChrome(chrome.storage.sync, 'set');

  const getDefaults = (overrides = {}) => ({
    ...DEFAULT_SETTINGS,
    ...overrides,
  });

  const load = async (overrides = {}) => {
    const values = await syncGet(getDefaults(overrides));
    return {
      ...DEFAULT_SETTINGS,
      ...values,
    };
  };

  const save = async (values) => {
    await syncSet(values);
    return values;
  };

  const update = async (updater, overrides = {}) => {
    const current = await load(overrides);
    const next = updater({ ...current });
    await save(next);
    return next;
  };

  const listen = (handler) => {
    const listener = (changes, area) => {
      if (area !== 'sync') return;
      handler(changes);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  };

  const settingsStore = {
    defaults: DEFAULT_SETTINGS,
    getDefaults,
    load,
    save,
    update,
    listen,
  };

  globalThis.GiftPilotSettingsStore = settingsStore;
})();
