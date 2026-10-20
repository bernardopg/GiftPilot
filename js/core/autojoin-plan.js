/*
  Pure selection/ordering of giveaways to enter, shared by the page AutoJoin
  button and the background routine. Input giveaways are plain objects as
  produced by GiftPilotGiveawayParse.parseRow (plus an optional `fromWishlist`
  flag set by the background when the row came from the wishlist listing).
*/
(() => {
  const isPriority = (ga, settings, wishlist) =>
    (settings.PriorityWishlist && wishlist.has(ga.appId)) ||
    (settings.PriorityGroup && ga.isGroup) ||
    (settings.PriorityRegion && ga.isRegion) ||
    (settings.PriorityWhitelist && ga.isWhitelist);

  const withinCost = (cost, min, max) =>
    cost >= (Number(min) || 0) && (Number(max) === -1 || cost <= Number(max));

  /**
   * @returns {{ queue: object[], skipped: {code: string, reason: string}[] }}
   */
  function buildPlan(
    giveaways,
    {
      settings,
      mode = 'page',
      level = 10,
      owned = [],
      wishlist = [],
      now = Math.floor(Date.now() / 1000),
      odds = () => 0,
    },
  ) {
    const ownedSet = new Set(owned);
    const wishSet = new Set(wishlist);
    const bg = mode === 'background';
    const seen = new Set();
    const queue = [];
    const skipped = [];
    const skip = (ga, reason) => skipped.push({ code: ga.code, reason });

    giveaways.forEach((ga, index) => {
      if (!ga?.code || seen.has(ga.code)) return;
      seen.add(ga.code);

      if (ga.entered) return skip(ga, 'entered');
      if (ga.levelTooHigh || ga.level > level) return skip(ga, 'level');
      // Locked rows can only be entered after reading their description.
      if (ga.locked && !ga.hasDescription) return skip(ga, 'locked');
      if (ga.timeEnd && ga.timeEnd <= now) return skip(ga, 'ended');
      if (ga.appId && ownedSet.has(ga.appId)) return skip(ga, 'owned');

      const ignorePinned = bg ? settings.IgnorePinnedBG : settings.IgnorePinned;
      const ignoreGroups = bg ? settings.IgnoreGroupsBG : settings.IgnoreGroups;
      const ignoreWhitelist = bg
        ? settings.IgnoreWhitelistBG
        : settings.IgnoreWhitelist;
      if (ignorePinned && ga.pinned) return skip(ga, 'pinned');
      if (ignoreGroups && ga.isGroup) return skip(ga, 'group');
      if (ignoreWhitelist && ga.isWhitelist) return skip(ga, 'whitelist');

      const [min, max] = bg
        ? [settings.MinCostBG, settings.MaxCostBG]
        : [settings.MinCost, settings.MaxCost];
      if (!withinCost(ga.cost, min, max)) return skip(ga, 'cost');

      if (bg) {
        if (ga.level < (Number(settings.MinLevelBG) || 0)) {
          return skip(ga, 'minLevel');
        }
        const maxLeft = Number(settings.MaxTimeLeftBG) || 0;
        if (maxLeft > 0 && ga.timeEnd && ga.timeEnd - now > maxLeft) {
          return skip(ga, 'timeLeft');
        }
      }

      queue.push({
        ...ga,
        index,
        priority: bg
          ? Boolean(ga.fromWishlist)
          : isPriority(ga, settings, wishSet),
        odds: odds(ga),
      });
    });

    const byLevel = bg
      ? Boolean(settings.LevelPriorityBG)
      : Boolean(settings.LevelPriority);
    const byOdds = bg && !byLevel && Boolean(settings.OddsPriorityBG);

    queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      if (byLevel && a.level !== b.level) return b.level - a.level;
      if (byOdds && a.odds !== b.odds) return b.odds - a.odds;
      return a.index - b.index;
    });

    return { queue, skipped };
  }

  /**
   * Whether entering `ga` is allowed with `points` left. In background mode
   * PointsToPreserve is honored (wishlist rows may bypass it when configured).
   */
  function canAfford(ga, points, settings, mode = 'page') {
    if (ga.cost > points) return false;
    if (mode !== 'background') return true;
    const preserve = Number(settings.PointsToPreserve) || 0;
    if (points - ga.cost >= preserve) return true;
    return Boolean(
      ga.fromWishlist &&
      settings.WishlistPriorityForMainBG &&
      settings.IgnorePreserveWishlistOnMainBG,
    );
  }

  const api = { buildPlan, canAfford, isPriority };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.GiftPilotPlan = api;
})();
