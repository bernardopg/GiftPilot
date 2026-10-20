/*
 * GiftPilot - giveaway row helpers for the listing script
 * Row enhancement (filters, odds, precise time, fallback buttons), Steam store
 * metadata checks and the join/leave action itself.
 *
 * Joining prefers the site's own quick-entry button when the row has one: the
 * request is then produced by SteamGifts' own code and is indistinguishable
 * from a manual click. Rows without it fall back to a request shaped exactly
 * like the site's jQuery call (see core/sg-request.js).
 */

(() => {
  const STEAM_CACHE_TTL = 7 * 24 * 60 * 60; // seconds
  const STEAM_CACHE_VERSION = 2;

  function secToTime(x) {
    let sec = Math.max(0, Math.floor(x));
    const days = Math.floor(sec / 86400);
    sec %= 86400;
    const hours = Math.floor(sec / 3600);
    sec %= 3600;
    const minutes = Math.floor(sec / 60);
    sec %= 60;
    const pad = (n) => n.toString().padStart(2, '0');
    if (days !== 0) return `${days}d ${hours}:${pad(minutes)}:${pad(sec)}`;
    if (hours !== 0) return `${hours}:${pad(minutes)}:${pad(sec)}`;
    if (minutes !== 0) return `${pad(minutes)}:${pad(sec)}`;
    return `${sec} s`;
  }

  function createGiveawayHelpers({ state, t, chrome, document }) {
    const parse = globalThis.GiftPilotGiveawayParse;
    const request = globalThis.GiftPilotRequest;

    const innerOf = (row) =>
      row.querySelector('.giveaway__row-inner-wrap') || row;

    // bundle-v18 (live) uses --btn--insert/--btn--delete; bundle-v19 uses
    // -insert/-delete. Both expose data-do on the button.
    const NATIVE_INSERT =
      '.giveaway__quick-entry-btn--insert, .giveaway__quick-entry-insert';
    const NATIVE_DELETE =
      '.giveaway__quick-entry-btn--delete, .giveaway__quick-entry-delete';
    const NATIVE_DESCRIPTION =
      '.giveaway__quick-entry-btn--description, .giveaway__description-icon';

    const nativeButton = (row, action) =>
      row.querySelector(action === 'leave' ? NATIVE_DELETE : NATIVE_INSERT);

    const hasNativeEntry = (row) =>
      Boolean(row.querySelector(`${NATIVE_INSERT}, ${NATIVE_DELETE}`));

    const hasNativeDescription = (row) =>
      Boolean(row.querySelector(NATIVE_DESCRIPTION));

    const readNavPoints = () =>
      parse.toInt(document.querySelector('.nav__points')?.textContent, NaN);

    /* ---------------- Steam store metadata (DLC / trading cards) ---------- */

    const hasGame = (id) => Boolean(id) && state.ownedSteamApps.includes(id);
    const inWishlist = (id) => Boolean(id) && state.wishList.includes(id);

    let storeChain = Promise.resolve();
    // Serialize store API calls: they are rate limited (~200 / 5 min).
    const storeFetch = (url) => {
      const run = storeChain.then(() =>
        chrome.runtime.sendMessage({ task: 'fetch', url }),
      );
      storeChain = run.catch(() => null);
      return run;
    };

    const isFresh = (entry, now) =>
      entry &&
      entry.version === STEAM_CACHE_VERSION &&
      now - (entry.lastUpdated || 0) < STEAM_CACHE_TTL;

    const persist = (key, value) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          console.warn(chrome.runtime.lastError.message);
        }
      });
    };

    async function getAppData(appId, now) {
      const cached = state.steamAppData[appId];
      if (isFresh(cached, now)) return cached;
      const response = await storeFetch(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic,categories`,
      );
      if (response?.status !== 200) return cached || null;
      try {
        const json = JSON.parse(response.text)?.[appId];
        if (!json?.success) return cached || null;
        const data = {
          appId,
          type: json.data?.type || 'game',
          hasTradingCards: Array.isArray(json.data?.categories)
            ? json.data.categories.some((c) => Number(c?.id) === 29)
            : false,
          lastUpdated: now,
          version: STEAM_CACHE_VERSION,
        };
        state.steamAppData[appId] = data;
        persist('Apps', state.steamAppData);
        return data;
      } catch {
        return cached || null;
      }
    }

    async function getPackageApps(packageId, now) {
      const cached = state.steamPackageData[packageId];
      if (isFresh(cached, now)) return cached.appIds;
      const response = await storeFetch(
        `https://store.steampowered.com/api/packagedetails?packageids=${packageId}`,
      );
      if (response?.status !== 200) return cached?.appIds || [];
      try {
        const json = JSON.parse(response.text)?.[packageId];
        if (!json?.success) return cached?.appIds || [];
        const appIds = (json.data?.apps || [])
          .map((app) => Number(app.id))
          .filter(Boolean);
        state.steamPackageData[packageId] = {
          packageId,
          appIds,
          lastUpdated: now,
          version: STEAM_CACHE_VERSION,
        };
        persist('Packages', state.steamPackageData);
        return appIds;
      } catch {
        return cached?.appIds || [];
      }
    }

    /** True when the app should be hidden according to the store filters. */
    function storeFilterHides(appId, data) {
      const { settings } = state;
      if (hasGame(appId)) return true;
      if (inWishlist(appId)) return false;
      if (!data) return false;
      if (settings.HideNonTradingCards && !data.hasTradingCards) return true;
      if (settings.HideDlc && data.type === 'dlc') return true;
      return false;
    }

    async function applyStoreFilters(row, info, now) {
      const { settings } = state;
      if (!settings.HideDlc && !settings.HideNonTradingCards) return;
      if (info.pinned) return;
      try {
        if (info.appId) {
          const data = await getAppData(info.appId, now);
          if (storeFilterHides(info.appId, data)) row.remove();
          return;
        }
        if (info.packageId) {
          const appIds = await getPackageApps(info.packageId, now);
          if (!appIds.length) return;
          for (const appId of appIds) {
            const data = await getAppData(appId, now);
            if (!storeFilterHides(appId, data)) return;
          }
          row.remove();
        }
      } catch (error) {
        console.debug('Store filter check failed:', error);
      }
    }

    /* ---------------- Row enhancement ------------------------------------ */

    function shouldHide(info) {
      const { settings } = state;
      if (info.level < settings.HideLevelsBelow) return true;
      if (info.level > settings.HideLevelsAbove) return true;
      if (settings.HideCostsBelow > 0 && info.cost < settings.HideCostsBelow) {
        return true;
      }
      if (settings.HideCostsAbove < 50 && info.cost > settings.HideCostsAbove) {
        return true;
      }
      if (settings.HideEntered && info.entered) return true;
      if (settings.HideGroups && info.isGroup) return true;
      if (settings.HideWhitelist && info.isWhitelist) return true;
      if (info.appId && hasGame(info.appId)) return true;
      return false;
    }

    function refreshButton(button, row) {
      const info = parse.parseRow(row);
      if (!info) return;
      button.disabled = false;
      if (info.entered) {
        button.dataset.state = 'leave';
        button.textContent = t('content.leave');
      } else if (info.levelTooHigh) {
        button.dataset.state = 'no-level';
        button.textContent = t('content.needHigherLevel');
        button.disabled = true;
      } else if (info.cost > state.currentState.points) {
        button.dataset.state = 'no-points';
        button.textContent = t('content.notEnoughPoints');
        button.disabled = true;
      } else {
        button.dataset.state = 'join';
        button.textContent = t('content.join');
      }
    }

    function refreshButtons(root = document) {
      root.querySelectorAll('.sgx-entry').forEach((button) => {
        const row = button.closest('.giveaway__row-outer-wrap');
        if (row) refreshButton(button, row);
      });
    }

    function addFallbackButton(row) {
      if (row.querySelector('.sgx-entry')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sgx-entry';
      innerOf(row).appendChild(button);
      refreshButton(button, row);
    }

    function addOdds(row, info, now) {
      const columns = row.querySelector('.giveaway__columns');
      if (!columns || columns.querySelector('.sgx-odds')) return;
      const odds = document.createElement('div');
      odds.className = 'sgx-odds';
      odds.title = t('content.winOddsTitle');
      const icon = document.createElement('i');
      icon.className = 'fa fa-trophy';
      odds.append(icon, ` ${parse.winChance(info, now).toFixed(3)}%`);
      columns.insertBefore(odds, columns.firstChild);
    }

    function addDescriptionToggle(row) {
      const links = row.querySelector('.giveaway__links');
      if (!links || links.querySelector('.sgx-desc')) return;
      const toggle = document.createElement('a');
      toggle.className = 'sgx-desc';
      toggle.href = '#';
      const icon = document.createElement('i');
      icon.className = 'fa fa-file-text-o';
      const label = document.createElement('span');
      label.textContent = t('content.showDescription');
      toggle.append(icon, ' ', label);
      links.appendChild(toggle);
    }

    async function toggleDescription(row) {
      if (hasNativeDescription(row)) {
        row.querySelector(NATIVE_DESCRIPTION)?.click();
        return;
      }
      const label = row.querySelector('.sgx-desc span');
      let panel = row.querySelector('.sgx-desc-panel');
      if (panel) {
        const visible = panel.hidden;
        panel.hidden = !visible;
        if (label) {
          label.textContent = t(
            visible ? 'content.hideDescription' : 'content.showDescription',
          );
        }
        return;
      }
      panel = document.createElement('div');
      panel.className = 'sgx-desc-panel';
      panel.textContent = t('utils.loading');
      innerOf(row).after(panel);
      if (label) label.textContent = t('content.hideDescription');
      try {
        const info = parse.parseRow(row);
        const html = await request.getHtml(info.url);
        const dom = new DOMParser().parseFromString(html, 'text/html');
        const markdown = dom.querySelector('.page__description .markdown');
        panel.replaceChildren(
          markdown
            ? document.importNode(markdown, true)
            : document.createTextNode(t('content.noDescription')),
        );
      } catch {
        panel.textContent = t('content.networkError');
      }
    }

    // Rows already handled; a WeakSet keeps no marker in the page's DOM.
    const processed = new WeakSet();

    function enhanceRows(root, now = Math.floor(Date.now() / 1000)) {
      const { settings } = state;
      root.querySelectorAll('.giveaway__row-outer-wrap').forEach((row) => {
        if (processed.has(row)) return;
        processed.add(row);

        const info = parse.parseRow(row);
        if (!info) return;

        if (!info.pinned && shouldHide(info)) {
          row.remove();
          return;
        }

        if (settings.ShowButtons && !hasNativeEntry(row)) {
          addFallbackButton(row);
        }
        if (settings.ShowChance) addOdds(row, info, now);
        // Rows on the current markup either have a native description button
        // or no description at all; the fallback is only for legacy markup.
        if (!hasNativeDescription(row) && !hasNativeEntry(row)) {
          addDescriptionToggle(row);
        }
        if (settings.PreciseTime) {
          const span = row.querySelector('.fa-clock-o + span[data-timestamp]');
          if (span) span.textContent = secToTime(info.timeEnd - now);
        }
        applyStoreFilters(row, info, now);
      });
    }

    /* ---------------- Join / leave --------------------------------------- */

    const ERROR_TEXT =
      '.giveaway__quick-entry-error span, .giveaway__quick-entry-btn--error span';

    function waitForNativeResult(row, action, timeoutMs = 15000) {
      const inner = innerOf(row);
      const wantFaded = action === 'join';
      return new Promise((resolve) => {
        let errorText = '';
        const finish = () => {
          observer.disconnect();
          clearTimeout(timer);
          const faded = inner.classList.contains('is-faded');
          resolve({
            success: faded === wantFaded,
            points: readNavPoints(),
            message: faded === wantFaded ? '' : errorText,
          });
        };
        const check = () => {
          // The error box is removed again after ~2 s (v18): remember its text.
          const error = row.querySelector(ERROR_TEXT);
          if (error?.textContent.trim()) errorText = error.textContent.trim();
          const loading = row.querySelector('.giveaway__quick-entry-loading');
          const busy = loading && !loading.classList.contains('is-hidden');
          if (busy) return;
          if (
            inner.classList.contains('is-faded') === wantFaded ||
            errorText ||
            inner.classList.contains('is-error')
          ) {
            finish();
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(row, {
          attributes: true,
          attributeFilter: ['class'],
          childList: true,
          characterData: true,
          subtree: true,
        });
        const timer = setTimeout(finish, timeoutMs);
      });
    }

    const waitFor = (predicate, root, timeoutMs) =>
      new Promise((resolve) => {
        if (predicate()) {
          resolve(true);
          return;
        }
        const observer = new MutationObserver(() => {
          if (predicate()) {
            observer.disconnect();
            clearTimeout(timer);
            resolve(true);
          }
        });
        observer.observe(root, {
          attributes: true,
          attributeFilter: ['class'],
          childList: true,
          subtree: true,
        });
        const timer = setTimeout(() => {
          observer.disconnect();
          resolve(predicate());
        }, timeoutMs);
      });

    /**
     * Opens the native description (which unlocks the insert button) and
     * waits roughly the time a person needs to read it.
     */
    async function readDescriptionToUnlock(row, insertButton) {
      const descButton = row.querySelector(NATIVE_DESCRIPTION);
      if (!descButton) return false;
      if (!descButton.classList.contains('is-active')) {
        await humanPause(500, 1400);
        descButton.click();
      }
      const unlocked = await waitFor(
        () => !insertButton.classList.contains('is-locked'),
        row,
        12000,
      );
      if (!unlocked) return false;
      const panel = row.querySelector('.giveaway__description-panel');
      const words = (panel?.textContent || '').trim().split(/\s+/).length;
      // ~4 words/s skim speed, bounded so long descriptions do not stall.
      const readMs = Math.min(14000, Math.max(3000, words * 250));
      await humanPause(readMs * 0.7, readMs * 1.3);
      return true;
    }

    const humanPause = (min, max) =>
      new Promise((resolve) =>
        setTimeout(resolve, min + Math.random() * (max - min)),
      );

    /**
     * Enters (`join`) or leaves (`leave`) a giveaway row.
     * @returns {Promise<{success: boolean, points: number, message: string}>}
     */
    async function enterRow(row, action = 'join') {
      const button = nativeButton(row, action);
      if (action === 'join' && button?.classList.contains('is-locked')) {
        const unlocked = await readDescriptionToUnlock(row, button);
        if (!unlocked) {
          return { success: false, points: readNavPoints(), message: '' };
        }
      }
      if (button && button.offsetParent !== null) {
        const result = waitForNativeResult(row, action);
        button.click();
        const outcome = await result;
        if (Number.isFinite(outcome.points)) {
          state.currentState.points = outcome.points;
        }
        return outcome;
      }

      const info = parse.parseRow(row);
      const json = await request.postEntry({
        xsrf_token: state.token,
        do: action === 'leave' ? 'entry_delete' : 'entry_insert',
        code: info.code,
      });
      const success = json?.type === 'success';
      const points = parse.toInt(json?.points, NaN);
      if (Number.isFinite(points)) state.currentState.points = points;
      if (success) {
        innerOf(row).classList.toggle('is-faded', action === 'join');
        if (json.entry_count) {
          const counter = row.querySelector(
            '.giveaway__links a[href$="/entries"] span',
          );
          if (counter) {
            counter.textContent = `${json.entry_count} ${
              parse.toInt(json.entry_count) === 1 ? 'entry' : 'entries'
            }`;
          }
        }
      }
      return { success, points, message: success ? '' : json?.msg || '' };
    }

    return {
      secToTime,
      enhanceRows,
      refreshButtons,
      enterRow,
      toggleDescription,
      hasNativeEntry,
      hasGame,
      inWishlist,
      storeFilterHides,
      shouldHide,
    };
  }

  const api = {
    createGiveawayHelpers,
    secToTime,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.GiftPilotRows = api;
})();
