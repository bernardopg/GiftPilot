/*
  Content script for SteamGifts giveaway listings: row enhancements, the
  manual join/leave buttons and the AutoJoin run.

  Everything the user interacts with that the page could fingerprint (the
  AutoJoin button, settings button, status and notices) lives in the closed
  shadow-root panel (core/panel.js). Entries are made through the site's own
  quick-entry buttons whenever they exist.
*/
const autoJoinSettingsStore = globalThis.GiftPilotSettingsStore;
const autoJoinI18n = globalThis.GiftPilotI18n;
const steamCommunityHelper = globalThis.GiftPilotSteamCommunity;
const giveawayParse = globalThis.GiftPilotGiveawayParse;
const autoJoinPlan = globalThis.GiftPilotPlan;
const sgRequest = globalThis.GiftPilotRequest;
const thisVersion = 20261020;

// Tells page-enhancements.js that this script owns the listing scroller.
globalThis.__sgxListing = true;

function t(key, params = {}) {
  return autoJoinI18n ? autoJoinI18n.t(key, params) : key;
}

const STEAM_USERDATA_TTL_MS = 3 * 60 * 60 * 1000;
const PENDING_RUN_KEY = 'sgxPendingRun';

let settings = autoJoinSettingsStore
  ? autoJoinSettingsStore.getDefaults({ lastLaunchedVersion: thisVersion })
  : {};

const currentState = {
  amountOfPoints: 0,
  set points(n) {
    const value = parseInt(n, 10);
    if (Number.isFinite(value)) this.amountOfPoints = value;
  },
  get points() {
    return this.amountOfPoints;
  },
};

const state = {
  get settings() {
    return settings;
  },
  set settings(value) {
    settings = value;
  },
  token: '',
  level: 0,
  steamAppData: {},
  steamPackageData: {},
  ownedSteamApps: [],
  wishList: [],
  currentState,
};

const autoentrySteamData =
  globalThis.GiftPilotSteamData?.createSteamDataHelpers({
    state,
    t,
    steamCommunityHelper,
    chrome,
  });
const autoentryGiveaway = globalThis.GiftPilotRows?.createGiveawayHelpers({
  state,
  t,
  chrome,
  document,
});

const panel = () => globalThis.GiftPilotPanel?.get();
const notify = (message, type = 'info', duration) =>
  panel()?.toast(message, type, duration);

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

const storageLocalGet = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, resolve));

/* ---------------------------------------------------------------- startup */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

async function start() {
  if (!autoJoinSettingsStore || !autoentryGiveaway) {
    console.error('AutoJoin modules are not available.');
    return;
  }
  try {
    state.settings = await autoJoinSettingsStore.load({
      lastLaunchedVersion: thisVersion,
    });
    autoJoinI18n?.setLocale(settings.Language);
  } catch (error) {
    console.error('Failed to load settings:', error);
    notify(t('content.notifications.settingsLoadFailed'), 'error');
    return;
  }

  readAccountState();
  if (!state.token) {
    // Logged out (or an unexpected page): nothing to enhance.
    return;
  }

  if (shouldLoadSteamData()) {
    await loadSteamCache();
  }

  setupPage();
  if (shouldLoadSteamData()) {
    refreshSteamData();
  }
}

function readAccountState() {
  state.token =
    document.querySelector('input[name="xsrf_token"]')?.value ||
    document
      .querySelector('[data-form*="xsrf_token="]')
      ?.dataset.form.match(/xsrf_token=([a-f0-9]+)/)?.[1] ||
    '';
  currentState.points = giveawayParse.toInt(
    document.querySelector('.nav__points')?.textContent,
    0,
  );
  const levelEl = document.querySelector('a[href="/account"] span[title]');
  state.level = Math.floor(
    parseFloat(levelEl?.getAttribute('title')) ||
      giveawayParse.parseCount(levelEl?.textContent, 0),
  );
}

/* -------------------------------------------------------------- Steam data */

function shouldLoadSteamData() {
  return Boolean(autoentrySteamData?.shouldLoadSteamData());
}

async function loadSteamCache() {
  const data = await storageLocalGet(['Apps', 'Packages', 'steamUserData']);
  if (data.Apps) state.steamAppData = data.Apps;
  if (data.Packages) state.steamPackageData = data.Packages;
  if (data.steamUserData) {
    state.ownedSteamApps = data.steamUserData.ownedGames || [];
    state.wishList = data.steamUserData.wishlist || [];
  }
}

async function refreshSteamData({ force = false } = {}) {
  try {
    const { steamUserData } = await storageLocalGet(['steamUserData']);
    const fresh =
      steamUserData &&
      Date.now() - (steamUserData.updatedAt || 0) < STEAM_USERDATA_TTL_MS &&
      (steamUserData.ownedGames?.length || steamUserData.wishlist?.length);
    if (fresh && !force) return;

    const response = await chrome.runtime.sendMessage({
      task: 'fetchSteamStoreUserData',
    });
    if (response?.isLoggedIn && response.status === 200) {
      state.ownedSteamApps = response.ownedGames || [];
      state.wishList = response.wishlist || [];
      chrome.storage.local.set({
        steamUserData: {
          ownedGames: state.ownedSteamApps,
          wishlist: state.wishList,
          updatedAt: Date.now(),
        },
      });
      autoentrySteamData.updateSteamDataBanner(null);
      return;
    }

    // Not logged in on the Steam store: use the public community profile
    // when the optional permission was granted in the settings page.
    const permission = await chrome.runtime.sendMessage({
      task: 'checkPermission',
      ask: 'false',
    });
    if (permission?.granted !== 'true') {
      autoentrySteamData.updateSteamDataBanner(
        response?.isLoggedIn === false
          ? 'content.notifications.steamLoginRequired'
          : 'content.notifications.permissionDenied',
      );
      return;
    }
    const steamId = await resolveSteamId();
    const issue = steamId
      ? await autoentrySteamData.fetchCommunitySteamData(steamId)
      : 'content.notifications.steamLoginRequired';
    chrome.storage.local.set({
      steamUserData: {
        ownedGames: state.ownedSteamApps,
        wishlist: state.wishList,
        updatedAt: Date.now(),
      },
    });
    autoentrySteamData.updateSteamDataBanner(issue);
  } catch (error) {
    console.error('Error updating Steam data:', error);
  }
}

async function resolveSteamId() {
  const userLink = document.querySelector(
    '.nav__button-container--notification a.nav__avatar-outer-wrap',
  );
  const userPath = userLink?.getAttribute('href') || '';
  if (!userPath) return '';
  const cacheKey = `steamId:${userPath}`;
  const cached = (await storageLocalGet([cacheKey]))[cacheKey];
  if (cached) return cached;
  const html = await sgRequest.getHtml(userPath);
  const steamId = steamCommunityHelper?.extractSteamIdFromProfileHtml(html);
  if (steamId) chrome.storage.local.set({ [cacheKey]: steamId });
  return steamId || '';
}

/* ------------------------------------------------------------------- page */

let autoJoinButton = null;
let runController = null;

function setupPage() {
  const ui = panel();
  ui.setDark(settings.NightTheme);
  updatePointsDisplay();
  observeNavPoints();

  if (settings.AutoJoinButton) {
    autoJoinButton = ui.addPrimary({
      label: t('content.autoJoin'),
      onClick: () => {
        if (runController) {
          runController.abort();
          autoJoinButton.textContent = t('content.stopping');
        } else {
          runAutoJoin();
        }
      },
    });
    ui.setNote(t('content.suspensionRisk'), { dismissKey: 'sgxRiskNote' });
  }
  ui.show();

  autoentryGiveaway.enhanceRows(document);

  const scroller = globalThis.GiftPilotScroller?.get({ t });
  if (scroller) {
    // Already-processed rows are skipped, so rescanning the container is cheap.
    scroller.onRows(() => autoentryGiveaway.enhanceRows(scroller.container));
    if (settings.InfiniteScrolling) scroller.enableAutoLoad();
  }

  document.addEventListener('click', onDocumentClick);
  scheduleRepeat();
  resumePendingRun();
}

function updatePointsDisplay() {
  if (settings.ShowPoints) {
    panel()?.setPoints(currentState.points, state.level);
  }
  autoentryGiveaway.refreshButtons();
}

function observeNavPoints() {
  const navPoints = document.querySelector('.nav__points');
  if (!navPoints) return;
  new MutationObserver(() => {
    currentState.points = giveawayParse.toInt(navPoints.textContent, NaN);
    updatePointsDisplay();
  }).observe(navPoints, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

/* ------------------------------------------------------- manual join/leave */

async function onDocumentClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const desc = target.closest('.sgx-desc');
  if (desc) {
    event.preventDefault();
    const row = desc.closest('.giveaway__row-outer-wrap');
    if (row) autoentryGiveaway.toggleDescription(row);
    return;
  }

  const fallback = target.closest('.sgx-entry');
  if (fallback) {
    const row = fallback.closest('.giveaway__row-outer-wrap');
    if (!row || fallback.disabled) return;
    const action = fallback.dataset.state === 'leave' ? 'leave' : 'join';
    fallback.disabled = true;
    fallback.textContent = t('content.processing');
    try {
      const result = await autoentryGiveaway.enterRow(row, action);
      if (!result.success && result.message) {
        notify(result.message, 'warning');
      }
      if (result.success && action === 'join') afterManualJoin(row);
    } catch (error) {
      console.error('Error processing giveaway action:', error);
      notify(t('content.networkError'), 'error');
    } finally {
      updatePointsDisplay();
    }
    return;
  }

  // Manual click on the site's own quick-entry button.
  const native = target.closest('.giveaway__quick-entry-insert');
  if (native && event.isTrusted) {
    const row = native.closest('.giveaway__row-outer-wrap');
    const inner = row?.querySelector('.giveaway__row-inner-wrap');
    if (!inner) return;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      if (inner.classList.contains('is-faded')) {
        afterManualJoin(row);
        return;
      }
      if (inner.classList.contains('is-error')) return;
    }
  }
}

function afterManualJoin(row) {
  if (settings.HideEntered) {
    row.remove();
    return;
  }
  if (settings.AutoDescription) {
    autoentryGiveaway.toggleDescription(row);
  }
  if (settings.AutoComment && settings.Comment) {
    postComment(row);
  }
}

async function postComment(row) {
  const comments = settings.Comment.split('#')
    .map((comment) => comment.trim())
    .filter(Boolean);
  if (!comments.length) return;
  const chosen = comments[Math.floor(Math.random() * comments.length)];
  const info = giveawayParse.parseRow(row);
  if (!info) return;
  try {
    // Give it the time a person needs to type a short comment.
    await sleep(globalThis.GiftPilotTiming.randomBetween(4000, 9000));
    await sgRequest.post(
      {
        xsrf_token: state.token,
        do: 'comment_new',
        parent_id: '',
        description: chosen,
      },
      { url: info.url, expect: 'text', form: true },
    );
  } catch (error) {
    console.error('Error posting comment:', error);
  }
}

/* ---------------------------------------------------------------- AutoJoin */

function collectGiveaways() {
  return [...document.querySelectorAll('.giveaway__row-outer-wrap')]
    .map((row) => {
      const info = giveawayParse.parseRow(row);
      return info ? { ...info, row } : null;
    })
    .filter(Boolean);
}

async function runAutoJoin() {
  const controller = new AbortController();
  runController = controller;
  const { signal } = controller;
  const timing = globalThis.GiftPilotTiming;
  const ui = panel();
  let entered = 0;

  autoJoinButton.textContent = t('content.stop');
  autoJoinButton.classList.add('running');

  try {
    const scroller = globalThis.GiftPilotScroller?.get({ t });
    if (settings.LoadFive && scroller) {
      ui.setStatus(t('content.loadingPages'));
      while (
        !signal.aborted &&
        scroller.hasNext &&
        scroller.pagesLoaded < settings.PagesToLoad
      ) {
        await sleep(timing.randomBetween(900, 2600), signal);
        if (!(await scroller.loadNext())) break;
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const { queue } = autoJoinPlan.buildPlan(collectGiveaways(), {
      settings,
      mode: 'page',
      level: state.level,
      owned: state.ownedSteamApps,
      wishlist: state.wishList,
      now,
    });

    const scheduler = timing.createScheduler(settings.Delay);
    let elapsed = 0;
    for (let i = 0; i < queue.length && !signal.aborted; i++) {
      const ga = queue[i];
      if (!autoJoinPlan.canAfford(ga, currentState.points, settings)) {
        continue;
      }
      const at = scheduler.next();
      ui.setStatus(
        t('content.progress', { current: i + 1, total: queue.length }),
      );
      await sleep(at - elapsed, signal);
      elapsed = at;
      if (signal.aborted) break;
      if (!ga.row.isConnected) continue;

      try {
        const result = await autoentryGiveaway.enterRow(ga.row, 'join');
        if (result.success) {
          entered += 1;
          if (settings.HideEntered) ga.row.remove();
        } else if (/not enough points/i.test(result.message)) {
          currentState.points = Math.min(currentState.points, ga.cost - 1);
        }
      } catch (error) {
        console.error('AutoJoin entry failed:', error);
        // Back off on network errors instead of hammering the server.
        await sleep(timing.randomBetween(8000, 15000), signal);
      }
      updatePointsDisplay();

      const cheapest = Math.min(...queue.slice(i + 1).map((next) => next.cost));
      if (!Number.isFinite(cheapest) || currentState.points < cheapest) break;
    }

    ui.setStatus(
      entered > 0
        ? t('content.joinedButton', { count: entered })
        : t('content.noEntries'),
      entered > 0 ? 'success' : 'info',
    );
    notify(
      entered > 0
        ? t(
            entered === 1
              ? 'content.notifications.autoJoinSummary.one'
              : 'content.notifications.autoJoinSummary.other',
            { count: entered },
          )
        : t('content.notifications.noGiveawaysMatched'),
      entered > 0 ? 'success' : 'info',
    );
  } catch (error) {
    console.error('Error during AutoJoin:', error);
    ui.setStatus(
      t('content.notifications.autoJoinFailed', { message: error.message }),
      'error',
    );
  } finally {
    runController = null;
    autoJoinButton.textContent = t('content.autoJoin');
    autoJoinButton.classList.remove('running');
  }
}

/* ------------------------------------------------- repeat while page open */

function scheduleRepeat() {
  if (!settings.RepeatIfOnPage || !settings.AutoJoinButton) return;
  const hours = Math.max(1, Number(settings.RepeatHours) || 5);
  const jitter = globalThis.GiftPilotTiming.randomBetween(0.9, 1.15);
  setTimeout(
    () => {
      // Reload for fresh rows/points, then resume the run after the reload.
      chrome.storage.local.set({ [PENDING_RUN_KEY]: Date.now() }, () => {
        location.reload();
      });
    },
    hours * 3600 * 1000 * jitter,
  );
}

async function resumePendingRun() {
  if (!settings.AutoJoinButton) return;
  const data = await storageLocalGet([PENDING_RUN_KEY]);
  const pendingAt = data[PENDING_RUN_KEY];
  if (!pendingAt) return;
  chrome.storage.local.remove(PENDING_RUN_KEY);
  if (Date.now() - pendingAt > 2 * 60 * 1000) return;
  await sleep(globalThis.GiftPilotTiming.randomBetween(3000, 9000));
  if (!runController) runAutoJoin();
}
