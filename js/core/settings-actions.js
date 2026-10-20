(() => {
  function createSettingsActions({
    settingsStore,
    confirm = globalThis.confirm?.bind(globalThis),
    translate = (key) => key,
    fillSettingsDiv = () => {},
    syncDirtyState = () => {},
  } = {}) {
    async function resetSettingsToDefaults() {
      if (!settingsStore) {
        throw new Error('Settings store unavailable');
      }

      const proceed =
        typeof confirm === 'function'
          ? confirm(translate('settings.actions.resetConfirm'))
          : true;

      if (!proceed) {
        return { reset: false, cancelled: true };
      }

      const defaults = settingsStore.getDefaults();
      fillSettingsDiv(defaults, { persisted: false });
      syncDirtyState({ statusKey: 'settings.actions.resetDone', tone: 'info' });

      return { reset: true, defaults };
    }

    return {
      resetSettingsToDefaults,
    };
  }

  const api = {
    createSettingsActions,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.GiftPilotSettingsActions = api;
})();
