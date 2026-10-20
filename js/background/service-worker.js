importScripts(
  '../core/background-helpers.js',
  '../core/i18n.js',
  '../core/settings-store.js',
  '../core/steam-store.js',
  '../core/timing.js',
  '../core/sg-request.js',
  '../core/autojoin-plan.js',
);

/*
  Service-worker fetches would otherwise carry `Origin: chrome-extension://<id>`
  and no Referer at all, while genuine page requests always carry the site's own
  Origin/Referer — an easy server-side automation tell. These session rules
  rewrite the headers for requests initiated by this extension so background
  joins look identical to page-originated traffic. Only requests initiated by
  this extension are touched; the site's own page requests keep their headers.

  Whenever a steamgifts.com tab is open, requests are not made from here at all
  but bridged through that tab (see sgFetch), which is the closest possible
  match to real browsing.
*/
const setupRequestHeaderRules = async () => {
  if (!chrome.declarativeNetRequest?.updateSessionRules) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1, 2],
      addRules: [
        {
          // Entry/leave POSTs: match the page's own ajax.php requests exactly
          id: 1,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              {
                header: 'origin',
                operation: 'set',
                value: 'https://www.steamgifts.com',
              },
              {
                header: 'referer',
                operation: 'set',
                value: 'https://www.steamgifts.com/',
              },
            ],
          },
          condition: {
            urlFilter: '||www.steamgifts.com/ajax.php',
            initiatorDomains: [chrome.runtime.id],
            resourceTypes: ['xmlhttprequest'],
          },
        },
        {
          // Page-scan GETs: same Referer a logged-in browsing session would send
          id: 2,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              {
                header: 'referer',
                operation: 'set',
                value: 'https://www.steamgifts.com/',
              },
            ],
          },
          condition: {
            requestDomains: ['www.steamgifts.com', 'steamgifts.com'],
            initiatorDomains: [chrome.runtime.id],
            resourceTypes: ['xmlhttprequest'],
          },
        },
      ],
    });
  } catch (error) {
    console.debug('declarativeNetRequest header rules unavailable:', error);
  }
};
setupRequestHeaderRules();

const backgroundHelpers = globalThis.GiftPilotBackgroundHelpers;
const backgroundSettingsStore = globalThis.GiftPilotSettingsStore;
const backgroundI18n = globalThis.GiftPilotI18n;
const steamStoreHelper = globalThis.GiftPilotSteamStore;
const sgRequest = globalThis.GiftPilotRequest;
const autoJoinPlan = globalThis.GiftPilotPlan;
const timing = globalThis.GiftPilotTiming;
const matchesHost = backgroundHelpers.matchesHost;
const looksLikeSteamSessionBlocked =
  backgroundHelpers.looksLikeSteamSessionBlocked;

const SG_TAB_PATTERNS = ['*://www.steamgifts.com/*', '*://steamgifts.com/*'];
const thisVersion = 20261020;
let settings;

const bgT = (key, params = {}) => {
  backgroundI18n?.setLocale(settings?.Language || 'auto');
  return backgroundI18n ? backgroundI18n.t(key, params) : key;
};

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/* ------------------------------------------------------- offscreen helpers */

let creating;
const setupOffscreenDocument = async (path) => {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });
  if (existingContexts.length > 0) return;

  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ['DOM_PARSER', 'AUDIO_PLAYBACK'],
      justification:
        'Parsing HTML returned by fetch request to get useful data',
    });
    try {
      await creating;
    } finally {
      creating = null;
    }
  }
};

const parseHTML = async (data) => {
  await setupOffscreenDocument('html/offscreen.html');
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onDone);
      resolve({});
    }, 20000);
    const onDone = (msg) => {
      if (
        msg?.target === 'background' &&
        msg.type === 'parsed' &&
        msg.requestId === requestId
      ) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(onDone);
        resolve(msg.payload || {});
      }
    };
    chrome.runtime.onMessage.addListener(onDone);
    chrome.runtime.sendMessage({
      task: 'parse',
      target: 'offscreen',
      requestId,
      data,
    });
  });
};

const playAudio = async (volume) => {
  await setupOffscreenDocument('html/offscreen.html');
  chrome.runtime.sendMessage({
    task: 'audio',
    target: 'offscreen',
    data: volume,
  });
};

/* ------------------------------------------------- SteamGifts tab bridge */

const findSteamGiftsTab = async () => {
  const tabs = await chrome.tabs.query({ url: SG_TAB_PATTERNS });
  // Prefer a tab that finished loading; discarded tabs cannot run scripts.
  return (
    tabs.find((tab) => tab.status === 'complete' && !tab.discarded) || null
  );
};

/**
 * Performs a SteamGifts request from an open steamgifts.com tab when possible
 * (real page context), falling back to a native-shaped fetch from here.
 * @returns {Promise<{text?: string, json?: object}>}
 */
const sgFetch = async ({ method = 'GET', url, data, entry = false }) => {
  const tab = await findSteamGiftsTab();
  if (tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        task: 'sgxBridge',
        method,
        url,
        data,
        entry,
      });
      if (response?.ok) return response;
    } catch (error) {
      console.debug('Tab bridge unavailable, using direct request:', error);
    }
  }
  if (method === 'GET') return { text: await sgRequest.getHtml(url) };
  if (entry) return { json: await sgRequest.postEntry(data) };
  return { json: await sgRequest.post(data, { url }) };
};

/* ---------------------------------------------------- site style injection */

const SITE_STYLES = {
  dark: 'css/site/dark.css',
  pin: 'css/site/pin.css',
};

const isSteamGiftsUrl = (url) => matchesHost(url || '', 'steamgifts.com');

const readStyleFlags = async () => {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get({ NightTheme: false }),
    chrome.storage.local.get({ pinnedNavbar: false }),
  ]);
  return { dark: Boolean(sync.NightTheme), pin: Boolean(local.pinnedNavbar) };
};

// Injected author stylesheets are not exposed through document.styleSheets
// and need no marker class on the page.
const applySiteStyles = async (target, flags, previous = {}) => {
  for (const [name, file] of Object.entries(SITE_STYLES)) {
    const on = Boolean(flags[name]);
    if (previous[name] === on) continue;
    try {
      if (on) {
        await chrome.scripting.insertCSS({ target, files: [file] });
      } else if (previous[name]) {
        await chrome.scripting.removeCSS({ target, files: [file] });
      }
    } catch (error) {
      console.debug(`Could not update ${name} style:`, error);
    }
  }
};

const refreshStylesInAllTabs = async (flags, previous) => {
  const tabs = await chrome.tabs.query({ url: SG_TAB_PATTERNS });
  await Promise.all(
    tabs.map((tab) =>
      applySiteStyles({ tabId: tab.id, allFrames: false }, flags, previous),
    ),
  );
};

chrome.storage.onChanged.addListener(async (changes, area) => {
  const darkChanged = area === 'sync' && 'NightTheme' in changes;
  const pinChanged = area === 'local' && 'pinnedNavbar' in changes;
  if (!darkChanged && !pinChanged) return;
  const flags = await readStyleFlags();
  const previous = { ...flags };
  if (darkChanged) previous.dark = Boolean(changes.NightTheme.oldValue);
  if (pinChanged) previous.pin = Boolean(changes.pinnedNavbar.oldValue);
  refreshStylesInAllTabs(flags, previous);
});

/* ------------------------------------------------------------ notifications */

const ICON_URL = chrome.runtime.getURL('assets/icons/icon-128.png');

const createNotification = (id, title, message) =>
  new Promise((resolve) => {
    chrome.notifications.clear(id, () => {
      chrome.notifications.create(
        id,
        { type: 'basic', title, message, iconUrl: ICON_URL },
        resolve,
      );
    });
  });

const notifyWin = async () => {
  try {
    const { text: wonPageHtml } = await sgFetch({ url: '/giveaways/won' });
    const parsed = await parseHTML({ items: ['wonName'], html: wonPageHtml });
    const name = parsed.wonName || bgT('background.winFallbackName');
    await createNotification(
      'won_notification',
      bgT('background.title'),
      bgT('background.notifications.win', { name }),
    );
    if (settings.PlayAudio) playAudio(settings.AudioVolume);
    if (settings.AutoRedeemKey) {
      await setupOffscreenDocument('html/offscreen.html');
      chrome.runtime.sendMessage({
        task: 'redeemKeys',
        target: 'offscreen',
        data: { html: wonPageHtml },
      });
    }
  } catch (err) {
    console.error('Error while notifying about a win:', err);
  }
};

/* ------------------------------------------------------- background routine */

// MV3 workers are stopped after ~30 s without extension API activity; long
// human-paced waits need a heartbeat.
const keepAlive = () => {
  const timer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000);
  return () => clearInterval(timer);
};

let routineRunning = false;

const searchUrl = (type, page) => {
  const params = new URLSearchParams();
  if (type && type !== 'all') params.set('type', type);
  if (Number(settings.MinLevelBG) > 0) {
    params.set('level_min', settings.MinLevelBG);
  }
  params.set('page', page);
  return `/giveaways/search?${params.toString()}`;
};

const loadListing = async (type, pages, collected) => {
  let state = null;
  for (let page = 1; page <= pages; page++) {
    if (page > 1) await sleep(timing.randomBetween(2500, 7000));
    const { text } = await sgFetch({ url: searchUrl(type, page) });
    const parsed = await parseHTML({
      html: text,
      items: [
        'loggedIn',
        'giveaways',
        'myPoints',
        'myLevel',
        'token',
        'won',
        'wonCount',
        'hasNext',
      ],
    });
    if (!parsed.loggedIn) return null;
    state ||= parsed;
    (parsed.giveaways || []).forEach((ga) =>
      collected.push({ ...ga, fromWishlist: type === 'wishlist' }),
    );
    if (!parsed.hasNext) break;
  }
  return state;
};

const checkWins = async (pageState) => {
  const { lastWonCount = 0 } = await chrome.storage.local.get({
    lastWonCount: 0,
  });
  const wonCount = pageState.wonCount || 0;
  if (pageState.won || wonCount > lastWonCount) {
    notifyWin();
  }
  if (wonCount !== lastWonCount) {
    chrome.storage.local.set({ lastWonCount: wonCount });
  }
};

const enterQueue = async (queue, startPoints, token) => {
  let points = startPoints;
  let entered = 0;
  const scheduler = timing.createScheduler(settings.DelayBG);
  let elapsed = 0;
  for (const ga of queue) {
    if (!autoJoinPlan.canAfford(ga, points, settings, 'background')) continue;
    const at = scheduler.next();
    await sleep(at - elapsed);
    elapsed = at;
    try {
      if (ga.hasDescription) {
        // The site only unlocks entry after the description was opened.
        const { json: desc } = await sgFetch({
          method: 'POST',
          url: '/ajax.php',
          entry: true,
          data: { do: 'giveaway_description', code: ga.code },
        });
        if (desc?.type !== 'success') continue;
        const words = String(desc.html || '')
          .replace(/<[^>]+>/g, ' ')
          .trim()
          .split(/\s+/).length;
        const readMs = Math.min(14000, Math.max(3000, words * 250));
        await sleep(timing.randomBetween(readMs * 0.7, readMs * 1.3));
      }
      const { json } = await sgFetch({
        method: 'POST',
        url: '/ajax.php',
        entry: true,
        data: { xsrf_token: token, do: 'entry_insert', code: ga.code },
      });
      const newPoints = parseInt(
        String(json?.points ?? '').replace(/,/g, ''),
        10,
      );
      if (Number.isFinite(newPoints)) points = newPoints;
      if (json?.type === 'success') {
        entered += 1;
        console.debug(`Entered ${ga.code} (${ga.cost}P), ${points}P left`);
      } else {
        console.debug(`Skipped ${ga.code}: ${json?.msg || 'unknown error'}`);
      }
    } catch (error) {
      console.warn('Background entry failed, backing off:', error);
      await sleep(timing.randomBetween(10000, 20000));
    }
    if (points < Math.min(...queue.map((next) => next.cost))) break;
  }
  return { entered, points };
};

const runRoutine = async () => {
  if (routineRunning) return;
  routineRunning = true;
  const release = keepAlive();
  try {
    settings = await backgroundSettingsStore.load({
      lastLaunchedVersion: thisVersion,
    });

    const { lastBgRun = 0 } = await chrome.storage.local.get({ lastBgRun: 0 });
    const intervalMs =
      Math.max(0.5, Number(settings.RepeatHoursBG) || 0.5) * 3600000;
    // Alarms fire every 30 min; allow a little slack so runs do not drift.
    const due = Date.now() - lastBgRun >= intervalMs - 5 * 60 * 1000;
    const runEntries = settings.BackgroundAJ && due;

    const collected = [];
    let pageState;
    if (!runEntries) {
      pageState = await loadListing('all', 1, collected);
    } else {
      chrome.storage.local.set({ lastBgRun: Date.now() });
      const pages = Math.min(
        3,
        Math.max(1, Number(settings.PagesToLoadBG) || 1),
      );
      const wishFirst =
        settings.PageForBG === 'all' && settings.WishlistPriorityForMainBG;
      if (wishFirst) {
        pageState = await loadListing('wishlist', 1, collected);
        if (pageState) await sleep(timing.randomBetween(2500, 6000));
      }
      const main = await loadListing(settings.PageForBG, pages, collected);
      pageState ||= main;
    }
    if (!pageState) {
      console.debug('Not logged in on SteamGifts; skipping routine.');
      return;
    }

    await checkWins(pageState);
    if (pageState.myLevel !== settings.LastKnownLevel) {
      backgroundSettingsStore.save({ LastKnownLevel: pageState.myLevel });
    }
    if (
      settings.NotifyLimit &&
      pageState.myPoints >= settings.NotifyLimitAmount
    ) {
      createNotification(
        'points_notification',
        bgT('background.title'),
        bgT('background.notifications.points', { points: pageState.myPoints }),
      );
    }
    if (!runEntries) return;

    const now = Math.floor(Date.now() / 1000);
    const { queue } = autoJoinPlan.buildPlan(collected, {
      settings,
      mode: 'background',
      level: pageState.myLevel,
      now,
      odds: (ga) =>
        backgroundHelpers.calculateWinChance(
          ga.timeEnd - now,
          ga.timeStart,
          ga.entries,
          ga.copies,
          now,
        ),
    });
    const result = await enterQueue(queue, pageState.myPoints, pageState.token);
    console.debug(`Background AutoJoin done: ${result.entered} entered.`);
  } catch (error) {
    console.error('Background routine failed:', error);
  } finally {
    release();
    routineRunning = false;
  }
};

/* ------------------------------------------------------------------ alarms */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'routine') runRoutine();
});

const createAlarm = () => {
  chrome.alarms.get('routine', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('routine', {
        delayInMinutes: 0.5 + Math.random(),
        periodInMinutes: 30,
      });
    }
  });
};
createAlarm();

chrome.runtime.onStartup.addListener(createAlarm);

// Toolbar button: no popup, it opens the options page.
chrome.action?.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.notifications.onClicked.addListener((notificationId) => {
  const url =
    notificationId === 'points_notification'
      ? 'https://www.steamgifts.com/'
      : 'https://www.steamgifts.com/giveaways/won';
  chrome.windows.getCurrent((currentWindow) => {
    if (currentWindow) {
      chrome.tabs.create({ url });
    } else {
      chrome.windows.create({ url, type: 'normal', focused: true });
    }
  });
});

chrome.runtime.onInstalled.addListener((updateInfo) => {
  chrome.alarms.clearAll(createAlarm);
  if (!updateInfo.previousVersion) return;

  const parseVersion = (version) =>
    Number(
      version
        .split('.')
        .map((v) => v.padStart(3, 0))
        .join('')
        .padEnd(9, 0),
    );
  const prevVersion = parseVersion(updateInfo.previousVersion);

  if (prevVersion < parseVersion('1.5.0')) {
    backgroundSettingsStore
      ?.save({
        BackgroundAJ: false,
        IgnorePinnedBG: true,
        RepeatIfOnPage: false,
        RepeatHoursBG: 5,
        RepeatHours: 5,
      })
      .then(() =>
        createNotification(
          '1.5.0 announcement',
          bgT('background.notifications.guidelinesTitle'),
          bgT('background.notifications.guidelinesBody'),
        ),
      )
      .catch((error) => {
        console.error('Failed to migrate settings for v1.5.0:', error);
      });
  }
  if (prevVersion < parseVersion('1.6.2')) {
    backgroundSettingsStore
      ?.load()
      .then((current) =>
        backgroundSettingsStore.save({
          MinCost: 0,
          MinCostBG: current.MinCost ?? 0,
        }),
      )
      .catch((error) => {
        console.error('Failed to migrate minCost to minCostBG:', error);
      });
  }
  if (prevVersion < parseVersion('2.2.0')) {
    // Old caches used a different schema and the legacy in-page localStorage
    // keys are no longer read.
    chrome.storage.local.remove(['Apps', 'Packages']);
  }
});

/* ---------------------------------------------------------- Steam fetching */

const fetchPageWithBrowserSession = async (url) => {
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabComplete(tab.id);
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (delayMs) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return document.documentElement.outerHTML;
      },
      args: [1200],
    });
    return { status: 200, text: result?.result || '' };
  } finally {
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
};

const waitForTabComplete = (tabId, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timeoutId);
    };
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
        resolve();
      }
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for tab ${tabId}`));
    }, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab?.status === 'complete') {
        cleanup();
        resolve();
      }
    }, reject);
  });

const normalizeStoreUserData = (status, isLoggedIn, payload) => {
  const normalized = steamStoreHelper.extractStoreUserData(payload);
  return {
    status,
    ok: status === 200,
    isLoggedIn,
    ownedGames: normalized.ownedGames,
    wishlist: normalized.wishlist,
  };
};

let storeUserDataInFlight = null;
const fetchSteamStoreUserData = async () => {
  // 1) Direct request with the browser's Steam cookies (no tab needed).
  try {
    const response = await fetch(
      `https://store.steampowered.com/dynamicstore/userdata/?t=${Date.now()}`,
      { credentials: 'include', headers: { accept: 'application/json' } },
    );
    if (response.ok) {
      const payload = await response.json();
      const data = normalizeStoreUserData(200, true, payload);
      if (data.ownedGames.length || data.wishlist.length) return data;
    }
  } catch (error) {
    console.debug('Direct Steam userdata request failed:', error);
  }

  // 2) Fallback: read it from a background store tab (first-party cookies).
  let tab;
  try {
    tab = await chrome.tabs.create({
      url: 'https://store.steampowered.com/',
      active: false,
    });
    await waitForTabComplete(tab.id);
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const isLoggedIn = Boolean(
          document.querySelector(
            '#global_actions .playerAvatar, #account_pulldown, a[href*="logout"]',
          ),
        );
        try {
          const res = await fetch('/dynamicstore/userdata/', {
            credentials: 'include',
          });
          return { isLoggedIn, status: res.status, data: await res.json() };
        } catch (error) {
          return { isLoggedIn, status: 0, error: error.message };
        }
      },
    });
    const payload = result?.result || {};
    return normalizeStoreUserData(
      payload.status || 0,
      Boolean(payload.isLoggedIn),
      payload.data,
    );
  } finally {
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
};

const fetchHelper = async (url) => {
  const result = { status: null, text: '' };

  if (matchesHost(url, 'steamcommunity.com')) {
    const granted = await chrome.permissions.contains({
      origins: ['*://steamcommunity.com/profiles/*'],
    });
    if (!granted) {
      result.status = 403;
      return result;
    }
  }

  const res = await fetch(url, { credentials: 'include', redirect: 'follow' });
  result.status = res.status;
  if (res.ok) {
    result.text = await res.text();
    if (looksLikeSteamSessionBlocked(url, result.text)) {
      try {
        const fallback = await fetchPageWithBrowserSession(url);
        if (fallback.text) return fallback;
      } catch (error) {
        console.warn('Browser-session scrape fallback failed:', error);
      }
    }
  }
  return result;
};

/* --------------------------------------------------------------- messaging */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request?.task) {
    case 'notifyKey':
      if (request.message) {
        createNotification(
          'key_notification',
          bgT('background.title'),
          request.message,
        );
      }
      return undefined;

    case 'sgxStyles': {
      if (!sender.tab?.id || !isSteamGiftsUrl(sender.url || sender.tab.url)) {
        return undefined;
      }
      const target = sender.documentId
        ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
        : { tabId: sender.tab.id, frameIds: [sender.frameId || 0] };
      readStyleFlags().then((flags) => applySiteStyles(target, flags));
      return undefined;
    }

    case 'openOptions':
      chrome.runtime.openOptionsPage();
      return undefined;

    case 'checkPermission':
      chrome.permissions.contains(
        { origins: ['*://steamcommunity.com/profiles/*'] },
        (granted) => {
          if (granted || request.ask !== 'true') {
            sendResponse({ granted: granted ? 'true' : 'false' });
            return;
          }
          chrome.permissions.request(
            { origins: ['*://steamcommunity.com/profiles/*'] },
            (ok) => sendResponse({ granted: ok ? 'true' : 'false' }),
          );
        },
      );
      return true;

    case 'fetch':
      // Cross-origin Steam requests (content scripts are bound by CORS).
      fetchHelper(request.url)
        .then(sendResponse)
        .catch((error) =>
          sendResponse({ status: 0, text: '', error: error.message }),
        );
      return true;

    case 'fetchSteamStoreUserData':
      storeUserDataInFlight ||= fetchSteamStoreUserData().finally(() => {
        storeUserDataInFlight = null;
      });
      storeUserDataInFlight.then(sendResponse).catch((error) => {
        sendResponse({
          status: 0,
          ok: false,
          isLoggedIn: false,
          ownedGames: [],
          wishlist: [],
          error: error.message,
        });
      });
      return true;

    default:
      return undefined;
  }
});
