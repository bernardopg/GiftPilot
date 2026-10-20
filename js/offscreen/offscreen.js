/*
  Offscreen document: HTML parsing (service workers have no DOMParser), the
  win sound and Steam key redemption.
*/
const offscreenI18n = globalThis.GiftPilotI18n;
const offscreenParse = globalThis.GiftPilotGiveawayParse;
const offscreenRequest = globalThis.GiftPilotRequest;

const syncGet = (defaults) =>
  new Promise((resolve) => {
    chrome.storage.sync.get(defaults, resolve);
  });

const offscreenT = async (key, params = {}) => {
  const { Language } = await syncGet({ Language: 'auto' });
  offscreenI18n?.setLocale(Language);
  return offscreenI18n ? offscreenI18n.t(key, params) : key;
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') {
    return;
  }

  switch (msg.task) {
    case 'parse': {
      let payload;
      try {
        payload = parse(msg.data);
      } catch (error) {
        console.error('Offscreen parse error:', error);
        payload = { error: error.message };
      }
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'parsed',
        requestId: msg.requestId,
        payload,
      });
      break;
    }
    case 'audio': {
      const audio = new Audio(chrome.runtime.getURL('/assets/sounds/win.mp3'));
      audio.volume = Math.min(1, Math.max(0, Number(msg.data) || 0));
      audio.play().catch((error) => console.warn('Audio failed:', error));
      break;
    }
    case 'redeemKeys': {
      try {
        const wonPage = new DOMParser().parseFromString(
          msg.data.html,
          'text/html',
        );
        redeemKeysFromWonPage(wonPage);
      } catch (e) {
        console.error('Offscreen redeemKeys error:', e);
      }
      break;
    }
    default:
      console.warn(`Unknown message type for offscreen document: ${msg.task}`);
  }
});

const parseMyLevel = (dom) => {
  const el = dom.querySelector('a[href="/account"] span[title]');
  const value = parseFloat(el?.getAttribute('title'));
  if (Number.isFinite(value)) return Math.floor(value);
  return offscreenParse.parseCount(el?.textContent, 0);
};

const parseMyPoints = (dom) =>
  offscreenParse.toInt(dom.querySelector('.nav__points')?.textContent, 0);

const parseToken = (dom) =>
  dom.querySelector('input[name=xsrf_token]')?.value ||
  dom
    .querySelector('[data-form*="xsrf_token="]')
    ?.dataset.form.match(/xsrf_token=([a-f0-9]+)/)?.[1] ||
  '';

// Unread wins badge in the account bar ("Giveaways Won" notification).
const parseWonCount = (dom) =>
  offscreenParse.toInt(
    dom.querySelector('a[href="/giveaways/won"] .nav__notification')
      ?.textContent,
    0,
  );

const parseGiveaways = (dom) =>
  [...dom.querySelectorAll('.giveaway__row-outer-wrap')]
    .map((row) => offscreenParse.parseRow(row))
    .filter(Boolean);

const parse = ({ html, items }) => {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const result = {};
  for (const item of items) {
    switch (item) {
      case 'won':
        result.won = Boolean(dom.querySelector('.popup--gift-received'));
        break;
      case 'wonCount':
        result.wonCount = parseWonCount(dom);
        break;
      case 'wonName':
        result.wonName =
          dom.querySelector('.table__column__heading')?.textContent?.trim() ||
          '';
        break;
      case 'myLevel':
        result.myLevel = parseMyLevel(dom);
        break;
      case 'myPoints':
        result.myPoints = parseMyPoints(dom);
        break;
      case 'token':
        result.token = parseToken(dom);
        break;
      case 'loggedIn':
        result.loggedIn = Boolean(dom.querySelector('.nav__points'));
        break;
      case 'giveaways':
        result.giveaways = parseGiveaways(dom);
        break;
      case 'hasNext':
        result.hasNext = [
          ...dom.querySelectorAll('.pagination__navigation a'),
        ].some((link) => /next/i.test(link.textContent));
        break;
      default:
        console.warn(`Unknown parse item: ${item}`);
    }
  }
  return result;
};

const STEAM_KEY_PATTERN = /\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){2,4}\b/i;

// Steam's EPurchaseResultDetail values most likely to show up for keys.
const STEAM_REDEEM_REASONS = {
  9: 'AlreadyPurchased',
  13: 'RestrictedCountry',
  14: 'BadActivationCode',
  15: 'DuplicateActivationCode',
  24: 'DoesNotOwnRequiredApp',
  36: 'MustLoginPS3AppForPurchase',
  50: 'CannotRedeemCodeFromClient',
  53: 'RateLimited',
};

async function getSteamSessionId() {
  const response = await fetch('https://store.steampowered.com/', {
    credentials: 'include',
  });
  const html = await response.text();
  return html.match(/g_sessionID\s*=\s*"([0-9a-f]+)"/i)?.[1] || '';
}

// Redeem Steam keys found on the won page and notify via background
async function redeemKeysFromWonPage(wonPage) {
  const notify = (message) => {
    chrome.runtime.sendMessage({ task: 'notifyKey', message });
  };

  const forms = [...wonPage.querySelectorAll('form')].filter(
    (form) =>
      form.querySelector("input[name='winner_id']") &&
      form.querySelector("input[name='xsrf_token']") &&
      form.closest('.table__row-inner-wrap')?.querySelector('.view_key_btn'),
  );

  for (const form of forms) {
    try {
      const winnerId = form.querySelector("input[name='winner_id']").value;
      const xsrfToken = form.querySelector("input[name='xsrf_token']").value;

      const json = await offscreenRequest.post({
        do: 'view_key',
        winner_id: winnerId,
        xsrf_token: xsrfToken,
      });
      const key = JSON.stringify(json).match(STEAM_KEY_PATTERN)?.[0] || '';
      if (!key) {
        notify(
          await offscreenT('offscreen.notify.invalidFormat', { key: '?' }),
        );
        continue;
      }

      const sessionId = await getSteamSessionId();
      if (!sessionId) {
        notify(await offscreenT('offscreen.notify.manualRedeem', { key }));
        continue;
      }

      const regRes = await fetch(
        'https://store.steampowered.com/account/ajaxregisterkey/',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: new URLSearchParams({
            product_key: key,
            sessionid: sessionId,
          }).toString(),
        },
      );
      if (!regRes.ok) {
        notify(
          await offscreenT('offscreen.notify.httpError', {
            status: regRes.status,
            key,
          }),
        );
        continue;
      }
      const regJson = await regRes.json();
      if (regJson?.success === 1) {
        notify(await offscreenT('offscreen.notify.redeemed', { key }));
        await offscreenRequest
          .post({
            xsrf_token: xsrfToken,
            do: 'received_feedback',
            action: 1,
            winner_id: winnerId,
          })
          .catch((error) => console.warn('Mark as received failed:', error));
      } else {
        const detail = regJson?.purchase_result_details;
        const reason =
          STEAM_REDEEM_REASONS[detail] ||
          detail ||
          (await offscreenT('offscreen.unknownReason'));
        notify(
          await offscreenT('offscreen.notify.unsuccessful', { reason, key }),
        );
      }
    } catch (e) {
      console.error('Error during key redemption:', e);
      notify(await offscreenT('offscreen.notify.unexpected'));
    }
  }
}
