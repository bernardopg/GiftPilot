/*
  Native-looking SteamGifts requests.

  The site talks to /ajax.php through jQuery's $.ajax with a serialized form,
  which produces a very specific request: urlencoded body, `X-Requested-With:
  XMLHttpRequest` and jQuery's JSON Accept header. A `fetch()` with a FormData
  body instead sends multipart/form-data without those headers, which is
  trivially distinguishable server-side. Every POST made by the extension goes
  through `post()` so it is byte-for-byte shaped like the site's own calls.

  The content script also answers bridge requests from the service worker, so
  background work runs from a real steamgifts.com page (same-origin cookies,
  Origin, Referer and Sec-Fetch-* headers) whenever a tab is open.
*/
(() => {
  const JSON_ACCEPT = 'application/json, text/javascript, */*; q=0.01';
  const HTML_ACCEPT =
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded; charset=UTF-8';

  const origin = () =>
    globalThis.location?.origin?.startsWith('http')
      ? globalThis.location.origin
      : 'https://www.steamgifts.com';

  const resolveUrl = (url) => new URL(url || '/ajax.php', origin()).href;

  const encodeBody = (data) => {
    if (data instanceof URLSearchParams) return data.toString();
    if (typeof data === 'string') return data;
    return new URLSearchParams(
      Object.entries(data || {}).map(([key, value]) => [key, String(value)]),
    ).toString();
  };

  const buildPostInit = (data) => ({
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: JSON_ACCEPT,
      'Content-Type': FORM_CONTENT_TYPE,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: encodeBody(data),
  });

  // A plain <form method="post"> submission (e.g. the comment form): no XHR
  // marker header and the browser's navigation Accept header.
  const buildFormInit = (data) => ({
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: HTML_ACCEPT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeBody(data),
  });

  const buildGetInit = () => ({
    method: 'GET',
    credentials: 'include',
    headers: { Accept: HTML_ACCEPT },
  });

  /** POST to /ajax.php (or `url`) and return the parsed JSON (or text). */
  async function post(
    data,
    { url = '/ajax.php', expect = 'json', form = false } = {},
  ) {
    const response = await fetch(
      resolveUrl(url),
      form ? buildFormInit(data) : buildPostInit(data),
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (expect === 'text') return response.text();
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { type: 'error', msg: 'Invalid response', raw: text };
    }
  }

  /*
    Entry requests must match whatever the live bundle sends for its own
    quick-entry buttons:
    - bundle-v18: fetch(ajax_url, { method: 'POST', body: new FormData(form) })
      -> multipart/form-data, no X-Requested-With, default fetch Accept;
    - bundle-v19+: jQuery $.ajax with form.serialize() -> urlencoded + XHR.
    Field order follows the quick-entry form: xsrf_token, do, code.
  */
  const ENTRY_STYLE_KEY = 'sgxEntryStyle';
  let entryStyle = 'formdata';

  const detectBundleVersion = (root = globalThis.document) => {
    const script = root?.querySelector?.('script[src*="/js/bundle-v"]');
    const match = script?.getAttribute('src')?.match(/bundle-v(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const styleForVersion = (version) => (version >= 19 ? 'jquery' : 'formdata');

  const setEntryStyle = (style) => {
    entryStyle = style === 'jquery' ? 'jquery' : 'formdata';
    return entryStyle;
  };

  const buildFormDataInit = (data) => {
    const body = new FormData();
    Object.entries(data || {}).forEach(([key, value]) =>
      body.append(key, String(value)),
    );
    return { method: 'POST', credentials: 'include', body };
  };

  const ENTRY_FIELDS = ['xsrf_token', 'do', 'code'];
  const orderEntry = (data) => {
    const ordered = {};
    ENTRY_FIELDS.forEach((key) => {
      if (key in data) ordered[key] = data[key];
    });
    Object.keys(data).forEach((key) => {
      if (!(key in ordered)) ordered[key] = data[key];
    });
    return ordered;
  };

  /** Entry insert/delete shaped like the live bundle's own request. */
  async function postEntry(data) {
    const ordered = orderEntry(data);
    if (entryStyle === 'jquery') return post(ordered);
    const response = await fetch(
      resolveUrl('/ajax.php'),
      buildFormDataInit(ordered),
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { type: 'error', msg: 'Invalid response', raw: text };
    }
  }

  /** GET a SteamGifts page and return its HTML. */
  async function getHtml(url) {
    const response = await fetch(resolveUrl(url), buildGetInit());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  }

  const api = {
    JSON_ACCEPT,
    HTML_ACCEPT,
    FORM_CONTENT_TYPE,
    encodeBody,
    buildPostInit,
    buildFormInit,
    buildGetInit,
    buildFormDataInit,
    ENTRY_STYLE_KEY,
    detectBundleVersion,
    styleForVersion,
    setEntryStyle,
    getEntryStyle: () => entryStyle,
    orderEntry,
    post,
    postEntry,
    getHtml,
  };

  // Answer bridge requests from the service worker (content-script context only).
  if (
    typeof chrome !== 'undefined' &&
    chrome.runtime?.onMessage &&
    globalThis.location?.protocol?.startsWith('http')
  ) {
    // Mirror what the site's own quick-entry handler does after a response,
    // so an open tab never shows stale points or rows.
    const mirrorEntry = (data, json) => {
      if (!json || !data?.code) return;
      if (json.points !== undefined) {
        const points = document.querySelector('.nav__points');
        if (points) points.textContent = json.points;
      }
      if (json.type !== 'success' || !/^entry_/.test(data.do || '')) return;
      document
        .querySelectorAll(`.giveaway__quick-entry-form input[name="code"]`)
        .forEach((input) => {
          if (input.value !== data.code) return;
          input
            .closest('.giveaway__row-outer-wrap')
            ?.querySelector('.giveaway__row-inner-wrap')
            ?.classList.toggle('is-faded', data.do === 'entry_insert');
        });
    };

    const publishStyle = () => {
      const version = detectBundleVersion();
      if (!version) return;
      setEntryStyle(styleForVersion(version));
      chrome.storage.local.set({ [ENTRY_STYLE_KEY]: entryStyle });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', publishStyle, {
        once: true,
      });
    } else {
      publishStyle();
    }

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request?.task !== 'sgxBridge') return undefined;
      const run =
        request.method === 'GET'
          ? getHtml(request.url).then((text) => ({ ok: true, text }))
          : (request.entry
              ? postEntry(request.data)
              : post(request.data, { url: request.url })
            ).then((json) => ({
              ok: true,
              json,
            }));
      run
        .then((response) => {
          if (request.entry) mirrorEntry(request.data, response.json);
          sendResponse(response);
        })
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  // Service worker / offscreen: reuse the style the content script detected.
  if (
    typeof chrome !== 'undefined' &&
    chrome.storage?.local &&
    !globalThis.location?.protocol?.startsWith('http')
  ) {
    try {
      chrome.storage.local.get({ [ENTRY_STYLE_KEY]: 'formdata' }, (data) =>
        setEntryStyle(data?.[ENTRY_STYLE_KEY]),
      );
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === 'local' && changes[ENTRY_STYLE_KEY]) {
          setEntryStyle(changes[ENTRY_STYLE_KEY].newValue);
        }
      });
    } catch {
      // not an extension context (tests)
    }
  }

  globalThis.GiftPilotRequest = api;
})();
