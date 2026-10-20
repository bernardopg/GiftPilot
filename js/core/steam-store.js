(() => {
  function toSteamAppId(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    if (value && typeof value === 'object') {
      return toSteamAppId(value.appid || value.appId || value.id || null);
    }

    return null;
  }

  function uniqueIds(ids) {
    return [...new Set(ids.filter(Boolean))];
  }

  function normalizeSteamAppList(value) {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return uniqueIds(value.map(toSteamAppId));
    }

    if (typeof value === 'object') {
      return uniqueIds(Object.keys(value).map(toSteamAppId));
    }

    return [];
  }

  function extractStoreUserData(payload) {
    const source =
      payload && typeof payload === 'object' && payload.data
        ? payload.data
        : payload;

    if (!source || typeof source !== 'object') {
      return {
        ownedGames: [],
        wishlist: [],
      };
    }

    return {
      ownedGames: normalizeSteamAppList(
        source.rgOwnedApps || source.ownedApps || source.rgOwnedGames,
      ),
      wishlist: normalizeSteamAppList(
        source.rgWishlist || source.wishlist || source.wishlistApps,
      ),
    };
  }

  const api = {
    extractStoreUserData,
    normalizeSteamAppList,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.GiftPilotSteamStore = api;
})();
