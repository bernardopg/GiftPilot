(() => {
  const parseUrl = (url) => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  };

  // `url.includes('steamcommunity.com')` also matches hosts such as
  // steamcommunity.com.evil.tld, so compare the parsed hostname instead.
  const matchesHost = (url, host) => {
    const hostname = parseUrl(url)?.hostname;
    if (!hostname) return false;
    return hostname === host || hostname.endsWith(`.${host}`);
  };

  const looksLikeSteamSessionBlocked = (url, html) => {
    if (!html) return false;

    if (
      matchesHost(url, 'steamcommunity.com') &&
      /<title>\s*Sign In\s*<\/title>/i.test(html)
    ) {
      return true;
    }

    if (
      matchesHost(url, 'store.steampowered.com') &&
      parseUrl(url)?.pathname.startsWith('/wishlist') &&
      /<title>\s*Wishlist - Error\s*<\/title>/i.test(html)
    ) {
      return true;
    }

    return false;
  };

  const calculateWinChance = (
    timeLeft,
    timeStart,
    numberOfEntries,
    numberOfCopies,
    timeLoaded,
  ) => {
    const timePassed = timeLoaded - timeStart;
    const predictionOfEntries = (numberOfEntries / timePassed) * timeLeft;
    const chance =
      (1 / (numberOfEntries + 1 + predictionOfEntries)) * 100 * numberOfCopies;
    return chance;
  };

  const api = {
    matchesHost,
    looksLikeSteamSessionBlocked,
    calculateWinChance,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.GiftPilotBackgroundHelpers = api;
})();
