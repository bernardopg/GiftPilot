/*
 * GiftPilot - Steam data helpers for the listing script
 * Keeps Steam profile cache, banner, and fetch logic isolated from the main content script.
 */

(() => {
  function normalizeSteamProfileUrl(url) {
    if (!url) {
      return '';
    }

    return url.endsWith('/') ? url : `${url}/`;
  }

  function getSteamCacheKeys(profileUrl, steamProfileID) {
    return [
      ...new Set(
        [steamProfileID, normalizeSteamProfileUrl(profileUrl)].filter(Boolean),
      ),
    ];
  }

  function createSteamDataHelpers({ state, t, steamCommunityHelper, chrome }) {
    function shouldLoadSteamData() {
      const { settings } = state;

      return (
        settings.HideDlc ||
        settings.HideNonTradingCards ||
        settings.HideGroups ||
        settings.PriorityWishlist
      );
    }

    function applyCachedSteamData(storageData, cacheKeys) {
      for (const cacheKey of cacheKeys) {
        if (!storageData[cacheKey]) {
          continue;
        }

        state.ownedSteamApps = storageData[cacheKey].ownedGames || [];
        state.wishList = storageData[cacheKey].wishlist || [];
        console.debug('Owned games: ', state.ownedSteamApps);
        console.debug('Wishlist: ', state.wishList);
        return true;
      }

      return false;
    }

    function saveSteamData(cacheKeys) {
      const steamUserData = {
        ownedGames: [...new Set(state.ownedSteamApps)],
        wishlist: [...new Set(state.wishList)],
      };
      const payload = {};

      cacheKeys.forEach((cacheKey) => {
        payload[cacheKey] = steamUserData;
      });

      chrome.storage.local.set(payload);
    }

    function updateSteamDataBanner(steamDataIssueKey) {
      const panel = globalThis.GiftPilotPanel?.get();
      if (!panel) return;
      if (!steamDataIssueKey) {
        panel.setNote('');
        return;
      }
      panel.setNote(
        `${t('content.permissionBanner.title')} ${t(
          steamDataIssueKey === 'content.notifications.steamLoginRequired'
            ? 'content.permissionBanner.loginBody'
            : 'content.permissionBanner.body',
        )}`,
        { dismissKey: `sgxSteamNote:${steamDataIssueKey}` },
      );
    }

    async function resolveSteamProfileId(profileUrl) {
      if (!profileUrl) {
        return '';
      }

      const response = await chrome.runtime.sendMessage({
        task: 'fetch',
        url: profileUrl,
      });

      if (response.status !== 200) {
        return '';
      }

      return (
        steamCommunityHelper?.extractSteamIdFromProfileHtml(response.text) || ''
      );
    }

    async function fetchCommunitySteamData(steamProfileID) {
      const requiresSteamLogin = (html) =>
        /<title>\s*(Sign In|Wishlist - Error)\s*<\/title>/i.test(html);
      let steamDataIssueKey = null;

      let url = `https://steamcommunity.com/profiles/${steamProfileID}/games?tab=all`;
      let response = await chrome.runtime.sendMessage({ task: 'fetch', url });
      if (response.status === 200) {
        if (requiresSteamLogin(response.text)) {
          steamDataIssueKey = 'content.notifications.steamLoginRequired';
          console.info(t(steamDataIssueKey));
        } else {
          const patterns = [
            /rgGames\s*=\s*(\[.*?\])/s,
            /var\s+rgGames\s*=\s*(\[.*?\])/s,
            /RG\.games\s*=\s*(\[.*?\])/s,
          ];
          let jsonArrayStr = null;
          for (const pat of patterns) {
            const match = pat.exec(response.text);
            if (match && match[1]) {
              jsonArrayStr = match[1];
              break;
            }
          }
          if (jsonArrayStr) {
            try {
              const jsonResponse = JSON.parse(jsonArrayStr);
              state.ownedSteamApps = jsonResponse
                .map((g) => g.appid)
                .filter(Boolean);
            } catch {
              console.info('Failed to parse owned games JSON');
            }
          } else {
            steamDataIssueKey = 'content.notifications.ownedGamesParseFailed';
            console.info(t(steamDataIssueKey));
          }
        }
      } else if (response.status === 403) {
        console.warn(t('content.notifications.skipOwnedGames'));
        steamDataIssueKey ||= 'content.notifications.skipOwnedGames';
      }

      url = `https://steamcommunity.com/profiles/${steamProfileID}/wishlist`;
      response = await chrome.runtime.sendMessage({ task: 'fetch', url });
      if (response.status === 200) {
        if (requiresSteamLogin(response.text)) {
          steamDataIssueKey ||= 'content.notifications.steamLoginRequired';
        } else {
          const regex = /steamcommunity\.com\/app\/(\d+)/g;
          let match;
          state.wishList = [];
          while ((match = regex.exec(response.text)) != null) {
            state.wishList.push(parseInt(match[1], 10));
          }
        }
      } else if (response.status === 403) {
        console.warn(t('content.notifications.skipWishlist'));
        steamDataIssueKey ||= 'content.notifications.skipWishlist';
      }

      return steamDataIssueKey;
    }

    return {
      shouldLoadSteamData,
      normalizeSteamProfileUrl,
      getSteamCacheKeys,
      applyCachedSteamData,
      saveSteamData,
      updateSteamDataBanner,
      resolveSteamProfileId,
      fetchCommunitySteamData,
    };
  }

  const api = {
    createSteamDataHelpers,
    normalizeSteamProfileUrl,
    getSteamCacheKeys,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.GiftPilotSteamData = api;
})();
