/*
  Toast notifications for the options page. (Pages on steamgifts.com use the
  closed shadow-root panel in js/content/panel.js instead.)
*/
(() => {
  const t = (key, params = {}) =>
    globalThis.GiftPilotI18n ? globalThis.GiftPilotI18n.t(key, params) : key;

  const ICONS = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle',
  };

  const el = (tag, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  };

  function showNotification(message, type = 'info', duration = 5000) {
    let container = document.getElementById('notification-container');
    if (!container) {
      container = el('div', 'notification-container');
      container.id = 'notification-container';
      document.body.appendChild(container);
    }

    const notification = el('div', `notification ${type}`);
    const title = el('div', 'notification-title');
    title.append(
      el('i', ICONS[type] || ICONS.info),
      ` ${t(`utils.notification.${type}`)}`,
    );
    const body = el('div', 'notification-message');
    body.textContent = message;
    const close = el('button', 'notification-close');
    close.type = 'button';
    close.setAttribute('aria-label', t('utils.close'));
    close.append(el('i', 'fas fa-times'));
    notification.append(title, body, close);

    const dismiss = () => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    };
    close.addEventListener('click', dismiss);
    container.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    if (duration > 0) setTimeout(dismiss, duration);
    return notification;
  }

  globalThis.GiftPilotNotify = { showNotification };
})();
