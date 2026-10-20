/*
  Parsing of SteamGifts giveaway rows.

  The string helpers are pure so they can be unit tested without a DOM; the
  `parseRow` helper reads a `.giveaway__row-outer-wrap` element and is shared
  by the content scripts and the offscreen document.

  Current markup notes (bundle-v19 era):
  - giveaway links are relative and have no trailing slash
    (/giveaway/CODE/slug), so codes must not require a trailing "/";
  - Steam store links look like store.steampowered.com/app/123?utm_source=...
    (no trailing slash either);
  - capsule images may carry a hash segment
    (/store_item_assets/steam/apps/123/<hash>/capsule_184x69.jpg).
*/
(() => {
  const toInt = (value, fallback = 0) => {
    const parsed = parseInt(String(value ?? '').replace(/[,.\s]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  /** "1,058 entries" -> 1058 */
  const parseCount = (text, fallback = 0) => {
    const match = String(text ?? '').match(/\d[\d,.]*/);
    return match ? toInt(match[0], fallback) : fallback;
  };

  /** "/giveaway/xlUGy/stepfight" or absolute URL -> "xlUGy" */
  const parseGiveawayCode = (href) => {
    const match = String(href ?? '').match(
      /\/giveaway\/([A-Za-z0-9]{5})(?:[/?#]|$)/,
    );
    return match ? match[1] : '';
  };

  /** "(10P)" -> 10, "(1,000P)" -> 1000, otherwise null */
  const parseCost = (text) => {
    const match = String(text ?? '').match(/\(\s*([\d,]+)\s*P\s*\)/i);
    return match ? toInt(match[1]) : null;
  };

  /** "(50 Copies)" -> 50, otherwise null */
  const parseCopies = (text) => {
    const match = String(text ?? '').match(
      /\(\s*([\d,]+)\s+Cop(?:y|ies)\s*\)/i,
    );
    return match ? toInt(match[1]) : null;
  };

  /** Store / capsule URL -> { type: 'app'|'sub'|'bundle', id } or null */
  const parseSteamLink = (url) => {
    const value = String(url ?? '');
    const store = value.match(
      /store\.steampowered\.com\/(app|sub|bundle)\/(\d+)/,
    );
    if (store) return { type: store[1], id: toInt(store[2]) };
    const asset = value.match(/\/(apps|subs|bundles)\/(\d+)\//);
    if (asset) {
      const type = { apps: 'app', subs: 'sub', bundles: 'bundle' }[asset[1]];
      return { type, id: toInt(asset[2]) };
    }
    return null;
  };

  /** "Level 5+" / "5+" -> 5 */
  const parseLevel = (text) => parseCount(text, 0);

  const readTimestamp = (element) => toInt(element?.dataset?.timestamp, 0);

  /**
   * Reads a giveaway row element. Returns null when the row has no code
   * (e.g. a malformed or placeholder row).
   */
  const parseRow = (row) => {
    if (!row?.querySelector) return null;
    const inner = row.querySelector('.giveaway__row-inner-wrap') || row;
    const nameLink = row.querySelector('a.giveaway__heading__name');
    const code = parseGiveawayCode(nameLink?.getAttribute('href'));
    if (!code) return null;

    let cost = null;
    let copies = 1;
    row.querySelectorAll('.giveaway__heading__thin').forEach((node) => {
      const text = node.textContent;
      const parsedCost = parseCost(text);
      if (parsedCost !== null) cost = parsedCost;
      const parsedCopies = parseCopies(text);
      if (parsedCopies !== null) copies = parsedCopies;
    });

    const storeLink = row.querySelector(
      'a.giveaway__icon[href*="store.steampowered.com"]',
    );
    let steam = parseSteamLink(storeLink?.getAttribute('href'));
    if (!steam) {
      const thumb = row.querySelector('.giveaway_image_thumbnail');
      steam = parseSteamLink(thumb?.getAttribute('style'));
    }

    const levelEl = row.querySelector('.giveaway__column--contributor-level');
    const columns = row.querySelector('.giveaway__columns');
    const stamps = columns
      ? [...columns.querySelectorAll('span[data-timestamp]')]
      : [];
    const endEl =
      row.querySelector('.fa-clock-o + span[data-timestamp]') || stamps[0];
    const startEl =
      row
        .querySelector('.giveaway__username')
        ?.parentElement?.querySelector('span[data-timestamp]') || stamps[1];

    return {
      code,
      name: nameLink?.textContent.trim() || '',
      // Resolve against the site, not the parsing document (the offscreen
      // document lives on chrome-extension://).
      url: new URL(nameLink.getAttribute('href'), 'https://www.steamgifts.com')
        .href,
      gameId: row.dataset?.gameId || '',
      steamType: steam?.type || null,
      steamId: steam?.id || 0,
      appId: steam?.type === 'app' ? steam.id : 0,
      packageId: steam?.type === 'sub' ? steam.id : 0,
      cost: cost ?? 0,
      copies,
      level: levelEl ? parseLevel(levelEl.textContent) : 0,
      // Giveaways with a description ship a locked (pointer-events: none)
      // insert button that the site unlocks only after the description was
      // opened (do=giveaway_description); a person could never click it before.
      hasDescription: inner.classList.contains('has-description'),
      locked: Boolean(
        row.querySelector('.giveaway__quick-entry-btn--insert.is-locked'),
      ),
      levelTooHigh: Boolean(
        row.querySelector('.giveaway__column--contributor-level--negative'),
      ),
      entries: parseCount(
        row.querySelector('.giveaway__links a[href$="/entries"]')?.textContent,
      ),
      timeEnd: readTimestamp(endEl),
      timeStart: readTimestamp(startEl),
      isGroup: Boolean(row.querySelector('.giveaway__column--group')),
      isWhitelist: Boolean(row.querySelector('.giveaway__column--whitelist')),
      isRegion: Boolean(
        row.querySelector('.giveaway__column--region-restricted'),
      ),
      entered: inner.classList.contains('is-faded'),
      pinned: Boolean(row.closest('.pinned-giveaways__inner-wrap')),
    };
  };

  /** Rough win chance in percent, projecting entries until the end time. */
  const winChance = ({ entries, copies, timeStart, timeEnd }, now) => {
    const passed = Math.max(1, now - timeStart);
    const left = Math.max(0, timeEnd - now);
    const projected = entries + (entries / passed) * left;
    const chance = (Math.max(1, copies) / (projected + 1)) * 100;
    return Math.min(100, Math.max(0, chance));
  };

  const api = {
    toInt,
    parseCount,
    parseGiveawayCode,
    parseCost,
    parseCopies,
    parseSteamLink,
    parseLevel,
    parseRow,
    winChance,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.GiftPilotGiveawayParse = api;
})();
