/**
 * GiftPilot - page enhancements
 * Theme / pinned navbar, the shared control panel tools, keyboard shortcuts
 * and infinite scrolling on pages without the AutoJoin listing script.
 *
 * Dark theme and pinned navbar are stylesheets injected by the service worker
 * with chrome.scripting.insertCSS: they never appear in document.styleSheets
 * and need no class or attribute marker on the page.
 */

// Ask for the site styles as early as possible (document_start) to avoid a
// flash of the light theme; the service worker reads the settings itself.
try {
  chrome.runtime.sendMessage({ task: 'sgxStyles' }).catch(() => {});
} catch {
  // extension reloaded while the page was open
}

class PageEnhancer {
  constructor() {
    this.settings = {};
    this.initialized = false;
    this.i18n = globalThis.GiftPilotI18n;
    this.panel = null;
  }

  t(key, params = {}) {
    return this.i18n ? this.i18n.t(key, params) : key;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    await this.loadSettings();
    // Logged-out pages have no account bar; keep them untouched.
    if (!document.querySelector('.nav__points')) return;

    this.panel = globalThis.GiftPilotPanel?.get();
    this.setupPanelTools();
    this.setupKeyboardShortcuts();
    this.setupInfiniteScroll();
  }

  async loadSettings() {
    const store = globalThis.GiftPilotSettingsStore;
    try {
      this.settings = store
        ? await store.load()
        : await chrome.storage.sync.get({
            NightTheme: false,
            InfiniteScrolling: true,
            Language: 'auto',
          });
    } catch (error) {
      console.error('Error loading page enhancement settings:', error);
      this.settings = store ? store.getDefaults() : {};
    }
    this.i18n?.setLocale(this.settings.Language);
  }

  setupPanelTools() {
    const panel = this.panel;
    if (!panel) return;
    panel.setDark(this.settings.NightTheme);

    const themeTool = panel.addTool({
      icon: 'moon',
      label: this.t('page.theme.toggle'),
      active: this.settings.NightTheme,
      onClick: () => this.toggleTheme(themeTool),
    });

    chrome.storage.local.get({ pinnedNavbar: false }, (data) => {
      let pinned = Boolean(data.pinnedNavbar);
      const pinTool = panel.addTool({
        icon: 'pin',
        label: this.t(pinned ? 'page.nav.unpin' : 'page.nav.pin'),
        active: pinned,
        onClick: () => {
          pinned = !pinned;
          chrome.storage.local.set({ pinnedNavbar: pinned });
          pinTool.setActive(pinned);
          pinTool.setLabel(this.t(pinned ? 'page.nav.unpin' : 'page.nav.pin'));
        },
      });

      panel.addTool({
        icon: 'gear',
        label: this.t('content.settingsButton'),
        onClick: () => this.openSettings(),
      });
      panel.show();
    });
  }

  openSettings() {
    chrome.runtime.sendMessage({ task: 'openOptions' }).catch(() => {});
  }

  async toggleTheme(themeTool) {
    this.settings.NightTheme = !this.settings.NightTheme;
    await chrome.storage.sync.set({ NightTheme: this.settings.NightTheme });
    themeTool?.setActive(this.settings.NightTheme);
    this.panel?.setDark(this.settings.NightTheme);
    this.panel?.toast(
      this.t(this.settings.NightTheme ? 'page.theme.dark' : 'page.theme.light'),
      'info',
      2000,
    );
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        e.target?.isContentEditable
      ) {
        return;
      }
      switch (e.key) {
        case 's':
          e.preventDefault();
          this.openSettings();
          break;
        case 't':
          e.preventDefault();
          this.toggleTheme();
          break;
        case 'j':
          e.preventDefault();
          this.focusGiveaway(1);
          break;
        case 'k':
          e.preventDefault();
          this.focusGiveaway(-1);
          break;
        default:
          break;
      }
    });
  }

  focusGiveaway(step) {
    const links = [
      ...document.querySelectorAll(
        '.giveaway__row-outer-wrap .giveaway__heading__name',
      ),
    ];
    if (!links.length) return;
    const current = links.findIndex((link) =>
      link
        .closest('.giveaway__row-outer-wrap')
        ?.contains(document.activeElement),
    );
    const next =
      current === -1
        ? step > 0
          ? 0
          : links.length - 1
        : (current + step + links.length) % links.length;
    links[next].focus();
    links[next].scrollIntoView({ block: 'center' });
  }

  setupInfiniteScroll() {
    // The listing script (autoentry.js) owns the scroller on giveaway lists.
    if (!this.settings.InfiniteScrolling || globalThis.__sgxListing) return;
    globalThis.GiftPilotScroller?.get({
      t: (k, p) => this.t(k, p),
    })?.enableAutoLoad();
  }
}

const startPageEnhancer = () => new PageEnhancer().initialize();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPageEnhancer, {
    once: true,
  });
} else {
  startPageEnhancer();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageEnhancer;
}
