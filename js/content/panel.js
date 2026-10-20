/*
  Floating control panel and toasts rendered inside a *closed* shadow root.

  SteamGifts' bundle looks for well-known autojoin elements with
  document.querySelector (the legacy AutoJoin button/settings/footer ids).
  Nothing inside a closed shadow root is reachable from the page: selectors do
  not pierce it, `host.shadowRoot` is null, the host's textContent is empty
  and click events are retargeted to an attribute-less <div>. The only thing
  the page can observe is that plain host element.
*/
(() => {
  const i18n = globalThis.GiftPilotI18n;
  const t = (key, params = {}) => (i18n ? i18n.t(key, params) : key);

  const STATE_KEY = 'sgxPanelState';

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .dock {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: var(--fg);
      --bg: #ffffff; --bg2: #f3f5f9; --fg: #1f2733; --fg2: #5c6878;
      --line: #d5dbe5; --accent: #4b72d4; --accent-fg: #ffffff;
      --ok: #3f9b4f; --warn: #c7841a; --err: #c9403a;
    }
    .dock.dark {
      --bg: #1b2230; --bg2: #232c3d; --fg: #e8ecf5; --fg2: #9aa6bd;
      --line: #344158; --accent: #5b8cff; --accent-fg: #0d1320;
      --ok: #5fcf78; --warn: #f0b552; --err: #ff7a73;
    }
    .card {
      background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22); padding: 10px; min-width: 210px;
      max-width: 300px;
    }
    .row { display: flex; align-items: center; gap: 6px; }
    .row + .row { margin-top: 8px; }
    .points { font-weight: 600; font-variant-numeric: tabular-nums; }
    .muted { color: var(--fg2); font-size: 12px; }
    .spacer { flex: 1; }
    button {
      font: inherit; color: var(--fg); background: var(--bg2);
      border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px;
      cursor: pointer; line-height: 1.2;
    }
    button:hover { filter: brightness(1.06); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    button:disabled { opacity: 0.55; cursor: default; }
    button.icon { width: 30px; height: 30px; padding: 0; display: grid; place-items: center; }
    button.icon.on { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    button.primary {
      flex: 1; background: var(--accent); color: var(--accent-fg);
      border-color: var(--accent); font-weight: 600;
    }
    button.primary.running { background: var(--warn); border-color: var(--warn); }
    .status { margin-top: 8px; font-size: 12px; color: var(--fg2); min-height: 0; }
    .status:empty { display: none; }
    .status[data-tone='success'] { color: var(--ok); }
    .status[data-tone='error'] { color: var(--err); }
    .status[data-tone='warning'] { color: var(--warn); }
    .note {
      margin-top: 8px; padding: 6px 8px; border-radius: 8px; font-size: 11.5px;
      background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--fg);
    }
    .note button { margin-top: 4px; padding: 2px 8px; font-size: 11px; }
    .fab {
      width: 40px; height: 40px; border-radius: 50%; padding: 0;
      background: var(--bg); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      display: grid; place-items: center;
    }
    .hidden { display: none !important; }
    .toasts { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
    .toast {
      background: var(--bg); color: var(--fg); border: 1px solid var(--line);
      border-left: 4px solid var(--accent); border-radius: 10px; padding: 8px 10px;
      max-width: 320px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
      opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .2s;
      white-space: pre-line;
    }
    .toast.show { opacity: 1; transform: none; }
    .toast.success { border-left-color: var(--ok); }
    .toast.error { border-left-color: var(--err); }
    .toast.warning { border-left-color: var(--warn); }
    .toast b { display: block; margin-bottom: 2px; }
    @media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
  `;

  const ICONS = {
    gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 7 4 3v2H6v-2l4-3z"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    minus:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14"/></svg>',
    gift: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  };

  const storageGet = (defaults) =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get(defaults, (data) => resolve(data || defaults));
      } catch {
        resolve(defaults);
      }
    });

  const storageSet = (data) => {
    try {
      chrome.storage.local.set(data);
    } catch {
      // extension context invalidated (reloaded) - ignore
    }
  };

  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'className') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    });
    [].concat(children).forEach((child) => child && node.append(child));
    return node;
  };

  let instance = null;

  function createPanel() {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;

    const dock = el('div', { className: 'dock' });
    const toasts = el('div', { className: 'toasts' });
    const card = el('div', { className: 'card hidden', role: 'region' });

    const points = el('span', { className: 'points' });
    const level = el('span', { className: 'muted' });
    const tools = el('div', { className: 'row' });
    const header = el('div', { className: 'row' }, [
      points,
      level,
      el('span', { className: 'spacer' }),
      tools,
    ]);
    const actions = el('div', { className: 'row hidden' });
    const status = el('div', { className: 'status', 'aria-live': 'polite' });
    const note = el('div', { className: 'note hidden' });
    card.append(header, actions, status, note);

    const fab = el('button', {
      className: 'fab hidden',
      type: 'button',
      html: ICONS.gift,
    });

    dock.append(toasts, card, fab);
    root.append(style, dock);

    const mount = () => {
      (document.body || document.documentElement).appendChild(host);
    };
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });

    const state = { minimized: false };
    const setMinimized = (value) => {
      state.minimized = value;
      card.classList.toggle('hidden', value);
      fab.classList.toggle('hidden', !value);
      storageSet({ [STATE_KEY]: { minimized: value } });
    };
    fab.title = t('content.panel.expand');
    fab.setAttribute('aria-label', t('content.panel.expand'));
    fab.addEventListener('click', () => setMinimized(false));

    const api = {
      addTool({ icon, label, onClick, active = false }) {
        const button = el('button', {
          className: `icon${active ? ' on' : ''}`,
          type: 'button',
          title: label,
          'aria-label': label,
          html: ICONS[icon] || '',
          onclick: onClick,
        });
        tools.append(button);
        return {
          setActive(value) {
            button.classList.toggle('on', Boolean(value));
          },
          setLabel(value) {
            button.title = value;
            button.setAttribute('aria-label', value);
          },
        };
      },
      addPrimary({ label, onClick }) {
        const button = el('button', {
          className: 'primary',
          type: 'button',
          text: label,
          onclick: onClick,
        });
        actions.append(button);
        actions.classList.remove('hidden');
        return button;
      },
      setPoints(value, levelValue) {
        points.textContent = Number.isFinite(value) ? `${value}P` : '';
        level.textContent = Number.isFinite(levelValue)
          ? t('content.panel.level', { level: levelValue })
          : '';
      },
      setStatus(message, tone = 'info') {
        status.textContent = message || '';
        status.dataset.tone = tone;
      },
      setNote(message, { dismissKey } = {}) {
        note.replaceChildren();
        if (!message) {
          note.classList.add('hidden');
          return;
        }
        note.append(el('div', { text: message }));
        if (dismissKey) {
          note.append(
            el('button', {
              type: 'button',
              text: t('content.panel.dismiss'),
              onclick: () => {
                note.classList.add('hidden');
                storageSet({ [dismissKey]: true });
              },
            }),
          );
          storageGet({ [dismissKey]: false }).then((data) => {
            note.classList.toggle('hidden', Boolean(data[dismissKey]));
          });
        } else {
          note.classList.remove('hidden');
        }
      },
      setDark(value) {
        dock.classList.toggle('dark', Boolean(value));
      },
      show() {
        if (!state.minimized) card.classList.remove('hidden');
      },
      toast(message, type = 'info', duration = 5000) {
        const toast = el(
          'div',
          { className: `toast ${type}`, role: 'status' },
          [
            el('b', { text: t(`utils.notification.${type}`) }),
            el('span', { text: message }),
          ],
        );
        toast.addEventListener('click', () => toast.remove());
        toasts.append(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        if (duration > 0) {
          setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 250);
          }, duration);
        }
        return toast;
      },
    };

    header.append(
      el('button', {
        className: 'icon',
        type: 'button',
        title: t('content.panel.minimize'),
        'aria-label': t('content.panel.minimize'),
        html: ICONS.minus,
        onclick: () => setMinimized(true),
      }),
    );

    storageGet({ [STATE_KEY]: { minimized: false } }).then((data) => {
      const saved = data[STATE_KEY] || {};
      state.minimized = Boolean(saved.minimized);
      card.classList.toggle('hidden', state.minimized);
      fab.classList.toggle('hidden', !state.minimized);
    });

    return api;
  }

  globalThis.GiftPilotPanel = {
    get() {
      if (!instance) instance = createPanel();
      return instance;
    },
  };
})();
