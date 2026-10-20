// Initialize tabs functionality
const optionsSettingsStore = globalThis.GiftPilotSettingsStore;
const settingsActionsFactory = globalThis.GiftPilotSettingsActions;
const lowercaseSettingsMap = optionsSettingsStore
  ? new Map(
      Object.keys(optionsSettingsStore.defaults).map((key) => [
        key.toLowerCase(),
        key,
      ]),
    )
  : new Map();

const specialSettingKeys = new Map(
  Object.entries({
    txtautocomment: 'Comment',
    enablebg: 'BackgroundAJ',
    grouppriority: 'PriorityGroup',
    regionpriority: 'PriorityRegion',
    whitelistpriority: 'PriorityWhitelist',
    wishlistpriority: 'PriorityWishlist',
    infinitescroll: 'InfiniteScrolling',
    hoursbg: 'RepeatHoursBG',
    hoursfieldbg: 'RepeatHoursBG',
    hoursfield: 'RepeatHours',
  }),
);

const i18n = globalThis.GiftPilotI18n;
const translate = (key, params = {}) => (i18n ? i18n.t(key, params) : key);
let initialSettingsSnapshot = '';
let settingsEventsBound = false;
let settingsActions = null;

const setSaveButtonState = (button, state) => {
  if (!button) return;

  if (state === 'saving') {
    button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${translate(
      'settings.actions.saving',
    )}`;
    return;
  }

  if (state === 'saved') {
    button.innerHTML = `<i class="fas fa-check"></i> ${translate(
      'settings.actions.saved',
    )}`;
    return;
  }

  button.innerHTML = `<i class="fas fa-save"></i> ${translate(
    'settings.actions.save',
  )}`;
};

const deriveSettingKey = (element) => {
  if (!optionsSettingsStore) return element.id || element.name || '';

  if (element.dataset?.setting) {
    return element.dataset.setting;
  }

  const candidates = [];
  const pushCandidates = (raw) => {
    if (!raw) return;
    const normalized = raw.toLowerCase();
    candidates.push(normalized);
    candidates.push(normalized.replace(/^(chk|txt|sel|input)/, ''));
    candidates.push(normalized.replace(/field/g, ''));
    candidates.push(
      normalized.replace(/^(chk|txt|sel|input)/, '').replace(/field/g, ''),
    );
  };

  pushCandidates(element.id);
  pushCandidates(element.name);

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (specialSettingKeys.has(candidate)) {
      return specialSettingKeys.get(candidate);
    }
    if (lowercaseSettingsMap.has(candidate)) {
      return lowercaseSettingsMap.get(candidate);
    }
  }

  return element.id || element.name || '';
};

const getSettingsFormElements = () =>
  document.querySelectorAll(
    '#settingsDiv input, #settingsDiv select, #settingsDiv textarea',
  );

const clearFieldError = (element) => {
  if (!element) return;
  element.style.borderColor = '';
  element.classList.remove('setting-input-error');
  element.removeAttribute('aria-invalid');
};

const clearSettingsValidationState = () => {
  getSettingsFormElements().forEach((element) => {
    clearFieldError(element);
  });
};

const setSettingsStatus = (message, tone = 'info') => {
  const statusElement = document.getElementById('settingsStatusMessage');
  if (!statusElement) return;
  statusElement.hidden = !message;
  statusElement.textContent = message || '';
  statusElement.dataset.tone = tone;
};

function collectSettingsFormValues() {
  const updates = {};
  const formElements = getSettingsFormElements();

  formElements.forEach((element) => {
    if (element.type === 'radio' && element.name === 'BGpriority') {
      if (!element.checked) return;
      if (element.id === 'chkNoPriorityBG') {
        updates.LevelPriorityBG = false;
        updates.OddsPriorityBG = false;
      } else if (element.id === 'chkLevelPriorityBG') {
        updates.LevelPriorityBG = true;
        updates.OddsPriorityBG = false;
      } else if (element.id === 'chkOddsPriorityBG') {
        updates.LevelPriorityBG = false;
        updates.OddsPriorityBG = true;
      }
      return;
    }

    const key = deriveSettingKey(element);
    if (!key) return;

    let value;
    switch (element.type) {
      case 'checkbox':
        value = element.checked;
        break;
      case 'number':
      case 'range':
        value = element.value === '' ? '' : Number(element.value);
        break;
      default:
        value = element.value;
    }

    // Stored in seconds, edited in hours.
    if (element.dataset.scale && value !== '') {
      value = Math.round(Number(value) * Number(element.dataset.scale));
    }

    if (key === 'RepeatHoursBG' && Number(element.value) === 0.5) {
      value = 0;
    }

    updates[key] = value;
  });

  return updates;
}

const syncDirtyState = ({ statusKey, tone } = {}) => {
  const saveButtonEl = document.getElementById('btnSetSave');
  const resetButtonEl = document.getElementById('btnSetReset');
  if (!saveButtonEl) return false;

  const currentSnapshot = JSON.stringify(collectSettingsFormValues());
  const isDirty = currentSnapshot !== initialSettingsSnapshot;

  saveButtonEl.disabled = !isDirty;
  if (resetButtonEl) {
    resetButtonEl.disabled = !isDirty;
  }

  if (statusKey) {
    setSettingsStatus(
      translate(statusKey),
      tone || (statusKey === 'settings.status.validation' ? 'error' : 'info'),
    );
    return isDirty;
  }

  setSettingsStatus(
    translate(isDirty ? 'settings.status.unsaved' : 'settings.status.ready'),
    isDirty ? 'warning' : 'success',
  );
  return isDirty;
};

settingsActions = settingsActionsFactory?.createSettingsActions({
  settingsStore: optionsSettingsStore,
  confirm: globalThis.confirm?.bind(globalThis),
  translate,
  fillSettingsDiv,
  syncDirtyState,
});

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((button, index) => {
    // Add ARIA attributes for accessibility
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.setAttribute('tabindex', index === 0 ? '0' : '-1');

    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      activateTab(targetTab, button, tabButtons, tabContents);
    });

    // Add keyboard navigation
    button.addEventListener('keydown', (e) => {
      let targetButton = null;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          targetButton = button.nextElementSibling || tabButtons[0];
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          targetButton =
            button.previousElementSibling || tabButtons[tabButtons.length - 1];
          break;
        case 'Home':
          e.preventDefault();
          targetButton = tabButtons[0];
          break;
        case 'End':
          e.preventDefault();
          targetButton = tabButtons[tabButtons.length - 1];
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          button.click();
          break;
      }

      if (targetButton) {
        targetButton.focus();
        targetButton.click();
      }
    });
  });

  // Set initial tab content visibility
  tabContents.forEach((content, index) => {
    content.setAttribute('role', 'tabpanel');
    content.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
  });
}

function activateTab(targetTab, activeButton, tabButtons, tabContents) {
  // Remove active class from all buttons and contents
  tabButtons.forEach((btn) => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('tabindex', '-1');
  });

  tabContents.forEach((content) => {
    content.classList.remove('active');
    content.setAttribute('aria-hidden', 'true');
  });

  // Add active class to clicked button and corresponding content
  activeButton.classList.add('active');
  activeButton.setAttribute('aria-selected', 'true');
  activeButton.setAttribute('tabindex', '0');

  const targetContent = document.getElementById(targetTab);
  if (targetContent) {
    targetContent.classList.add('active');
    targetContent.setAttribute('aria-hidden', 'false');
  }
}

// Call this function when #settingsDiv is present on the page.
async function loadSettings() {
  initializeTabs();

  if (!optionsSettingsStore) {
    console.error('GiftPilotSettingsStore is not available.');
    return;
  }

  try {
    const settings = await optionsSettingsStore.load();
    if (i18n) {
      i18n.setLocale(settings.Language);
      i18n.apply(document);
      if (!document.location.protocol.includes('http')) {
        document.title = translate('settings.title');
      }
    }
    applyOptionsTheme(Boolean(settings.NightTheme));
    fillSettingsDiv(settings);
  } catch (error) {
    console.error('Failed to load settings:', error);
    if (window.GiftPilotNotify) {
      window.GiftPilotNotify.showNotification(
        translate('content.notifications.settingsLoadFailed'),
        'error',
      );
    }
  }
}

function fillSettingsDiv(settings, { persisted = true } = {}) {
  document.getElementById('selLanguage').value = settings.Language || 'auto';
  document.getElementById('chkAutoJoinButton').checked =
    settings.AutoJoinButton;
  document.getElementById('chkAutoDescription').checked =
    settings.AutoDescription;
  document.getElementById('chkAutoComment').checked = settings.AutoComment;
  document.getElementById('txtAutoComment').value = settings.Comment;
  document.getElementById('chkInfiniteScroll').checked =
    settings.InfiniteScrolling;
  document.getElementById('chkShowPoints').checked = settings.ShowPoints;
  document.getElementById('chkShowButtons').checked = settings.ShowButtons;
  document.getElementById('chkLoadFive').checked = settings.LoadFive;
  document.getElementById('chkHideDlc').checked = settings.HideDlc;
  document.getElementById('chkHideEntered').checked = settings.HideEntered;
  document.getElementById('chkHideGroups').checked = settings.HideGroups;
  document.getElementById('chkHideNonTradingCards').checked =
    settings.HideNonTradingCards;
  document.getElementById('chkHideWhitelist').checked = settings.HideWhitelist;
  document.getElementById('hideLevelsBelow').value = settings.HideLevelsBelow;
  document.getElementById('hideCostsBelow').value = settings.HideCostsBelow;
  document.getElementById('hideLevelsAbove').value = settings.HideLevelsAbove;
  document.getElementById('hideCostsAbove').value = settings.HideCostsAbove;
  document.getElementById('chkNightTheme').checked = settings.NightTheme;
  document.getElementById('chkRepeatIfOnPage').checked =
    settings.RepeatIfOnPage;
  document.getElementById('chkIgnoreGroups').checked = settings.IgnoreGroups;
  document.getElementById('chkIgnorePinned').checked = settings.IgnorePinned;
  document.getElementById('chkIgnoreWhitelist').checked =
    settings.IgnoreWhitelist;
  document.getElementById('chkIgnoreGroupsBG').checked =
    settings.IgnoreGroupsBG;
  document.getElementById('chkIgnorePinnedBG').checked =
    settings.IgnorePinnedBG;
  document.getElementById('chkEnableBG').checked = settings.BackgroundAJ;
  document.getElementById('chkGroupPriority').checked = settings.PriorityGroup;
  document.getElementById('chkRegionPriority').checked =
    settings.PriorityRegion;
  document.getElementById('chkWhitelistPriority').checked =
    settings.PriorityWhitelist;
  document.getElementById('chkWishlistPriority').checked =
    settings.PriorityWishlist;
  document.getElementById('chkLevelPriorityBG').checked =
    settings.LevelPriorityBG;
  document.getElementById('chkOddsPriorityBG').checked =
    settings.OddsPriorityBG;
  document.getElementById('chkPlayAudio').checked = settings.PlayAudio;
  document.getElementById('audioVolume').value = settings.AudioVolume;
  const vd = document.getElementById('audioVolumeDisplay');
  if (vd) vd.textContent = Math.round(settings.AudioVolume * 100) + '%';
  document.getElementById('chkShowChance').checked = settings.ShowChance;
  document.getElementById('hoursField').value = settings.RepeatHours;
  document.getElementById('pagestoload').value = settings.PagesToLoad;
  document.getElementById('pagestoloadBG').value = settings.PagesToLoadBG;
  document.getElementById('pageforBG').value = settings.PageForBG;
  document.getElementById('delayBG').value = settings.DelayBG;
  document.getElementById('delay').value = settings.Delay;
  document.getElementById('minLevelBG').value = settings.MinLevelBG;
  document.getElementById('minCost').value = settings.MinCost;
  document.getElementById('minCostBG').value = settings.MinCostBG;
  document.getElementById('maxCost').value = settings.MaxCost;
  document.getElementById('maxCostBG').value = settings.MaxCostBG;
  document.getElementById('pointsToPreserve').value = settings.PointsToPreserve;
  document.getElementById('chkWishlistPriorityForMainBG').checked =
    settings.WishlistPriorityForMainBG;
  document.getElementById('chkIgnorePreserveWishlistOnMainBG').checked =
    settings.IgnorePreserveWishlistOnMainBG;
  document.getElementById('chkNotifyLimit').checked = settings.NotifyLimit;
  document.getElementById('notifyLimitAmount').value =
    settings.NotifyLimitAmount;
  document.getElementById('chkPreciseTime').checked = settings.PreciseTime;
  if (settings.RepeatHoursBG === 0) {
    document.getElementById('hoursFieldBG').value = '0.5';
  } else {
    document.getElementById('hoursFieldBG').value = settings.RepeatHoursBG;
  }
  document.getElementById('chkAutoRedeemKey').checked = settings.AutoRedeemKey;
  document.getElementById('chkIgnoreWhitelistBG').checked =
    settings.IgnoreWhitelistBG;
  document.getElementById('chkLevelPriority').checked = settings.LevelPriority;
  document.getElementById('maxTimeLeftBG').value =
    Math.round((Number(settings.MaxTimeLeftBG) || 0) / 360) / 10;

  clearSettingsValidationState();
  if (!settingsEventsBound) {
    settingsAttachEventListeners();
    settingsEventsBound = true;
  }

  if (persisted) {
    initialSettingsSnapshot = JSON.stringify(collectSettingsFormValues());
  }

  syncDirtyState();
}

function applyOptionsTheme(night) {
  document.body.classList.toggle('night-theme', !!night);
}

function settingsAttachEventListeners() {
  const saveButtonEl = document.getElementById('btnSetSave');
  const resetButtonEl = document.getElementById('btnSetReset');
  const languageSelectEl = document.getElementById('selLanguage');

  languageSelectEl?.addEventListener('change', () => {
    if (!i18n) return;
    i18n.setLocale(languageSelectEl.value);
    i18n.apply(document);
    setSaveButtonState(saveButtonEl, 'default');
  });

  saveButtonEl.addEventListener('click', async () => {
    // Validate inputs before saving
    if (!validateSettings()) {
      return;
    }

    // Show loading state
    if (i18n) {
      i18n.setLocale(languageSelectEl?.value || 'auto');
      i18n.apply(document);
    }
    setSaveButtonState(saveButtonEl, 'saving');
    saveButtonEl.disabled = true;

    try {
      const updates = collectSettingsFormValues();

      // Use SettingsStore to persist values
      if (!optionsSettingsStore) {
        throw new Error('Settings store unavailable');
      }

      const persistedSettings = await optionsSettingsStore.load();
      const mergedSettings = {
        ...persistedSettings,
        ...updates,
      };

      await optionsSettingsStore.save(mergedSettings);

      setSaveButtonState(saveButtonEl, 'saved');
      setTimeout(() => {
        setSaveButtonState(saveButtonEl, 'default');
        saveButtonEl.disabled = false;
      }, 2000);

      if (!document.location.protocol.includes('http')) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveButtonState(saveButtonEl, 'default');
      saveButtonEl.disabled = false;

      if (window.GiftPilotNotify) {
        window.GiftPilotNotify.showNotification(
          translate('content.notifications.settingsSaveFailed'),
          'error',
        );
      }
    }
  });

  resetButtonEl?.addEventListener('click', async () => {
    if (!settingsActions) return;

    try {
      await settingsActions.resetSettingsToDefaults();
    } catch (error) {
      console.error('Error resetting settings:', error);
      if (window.GiftPilotNotify) {
        window.GiftPilotNotify.showNotification(
          translate('content.notifications.settingsLoadFailed'),
          'error',
        );
      }
    }
  });

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Save shortcut
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault();
        saveButtonEl.click();
        return;
      }
    }

    // Close on Escape even without modifiers when modal is open
    if (
      e.key === 'Escape' &&
      document.body.classList.contains('sgx-modal-open')
    ) {
      e.preventDefault();
      document.querySelector('.settingsCancel')?.click();
      return;
    }

    // Trap focus within modal while open
    if (e.key === 'Tab' && document.body.classList.contains('sgx-modal-open')) {
      const modal = document.getElementById('settingsDiv');
      if (!modal) return;
      const focusable = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !modal.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !modal.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });

  // grant "*://steamcommunity.com/profiles/*" permission
  document
    .getElementById('chkWishlistPriority')
    .addEventListener('change', requirePermissions);
  document
    .getElementById('chkHideNonTradingCards')
    .addEventListener('change', requirePermissions);
  document
    .getElementById('chkHideDlc')
    .addEventListener('change', requirePermissions);
  async function requirePermissions(e) {
    if (e.target.checked) {
      // chrome.permissions.* API is not available in content script
      // we'll have to message background script to check if we have it
      const response = await chrome.runtime.sendMessage({
        task: 'checkPermission',
        ask: 'true',
      });
      if (response?.granted !== 'true') {
        e.target.checked = false;
      }
    }
  }

  // to show 0.5 when value goes below 1 in hoursFieldBG field
  document
    .getElementById('hoursFieldBG')
    .addEventListener('input', function () {
      if (Number(this.value) === 0) {
        this.value = 0.5;
      } else if (this.value % 1 !== 0 && this.value > 1) {
        this.value = parseInt(this.value, 10);
      }
    });

  const settingsCancelElements =
    document.getElementsByClassName('settingsCancel');
  Array.from(settingsCancelElements).forEach((element) => {
    element.addEventListener('click', () => {
      // If we are inside the extension options page, close the tab/window
      if (!document.location.protocol.includes('http')) {
        window.close();
        return;
      }
      const settingsShadeEl = document.getElementById('settingsShade');
      const settingsDivEl = document.getElementById('settingsDiv');
      settingsShadeEl.classList.remove('fadeIn');
      settingsShadeEl.classList.add('fadeOut');
      settingsDivEl.classList.remove('fadeIn');
      settingsDivEl.classList.add('fadeOut');
      // Re-enable page scrolling when modal closes
      document.body.classList.remove('sgx-modal-open');
    });
  });

  const volumeSlider = document.getElementById('audioVolume');
  volumeSlider.addEventListener('click', setAudioVolume);

  const volumeDisplay = document.getElementById('audioVolumeDisplay');
  if (volumeDisplay) {
    volumeSlider.addEventListener('input', () => {
      volumeDisplay.textContent = Math.round(volumeSlider.value * 100) + '%';
    });
  }

  processDependentSettings();
}

function setAudioVolume() {
  // play audio when changing volume
  const audio = new Audio(chrome.runtime.getURL('/assets/sounds/win.mp3'));
  audio.volume = document.getElementById('audioVolume').value;
  audio.play();
}

// Auto-initialize when used as options page
function initOptionsPageIfPresent() {
  if (document.getElementById('settingsDiv')) {
    const settingsDivEl = document.getElementById('settingsDiv');
    // Ensure the options UI is visible in standalone options page
    settingsDivEl.style.visibility = 'visible';
    settingsDivEl.classList.add('fadeIn');
    loadSettings();
    fitSettings();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOptionsPageIfPresent);
} else {
  initOptionsPageIfPresent();
}

/* This is for case when window.innerHeight is less than settings div height. */
function fitSettings() {
  if (
    window.innerHeight < document.getElementById('settingsDiv').clientHeight
  ) {
    document.getElementById('settingsDiv').className += ' fit';
  }
}

// Validate settings before saving
function validateSettings() {
  const errors = [];

  // Clear previous error states
  document.querySelectorAll('input, textarea, select').forEach((el) => {
    el.style.borderColor = '';
    el.classList.remove('setting-input-error');
  });

  // Validate comment input
  const commentField = document.getElementById('txtAutoComment');
  if (commentField?.value?.trim()) {
    const comment = commentField.value.trim();
    if (comment.length > 1000) {
      errors.push(translate('validation.commentTooLong'));
      commentField.style.borderColor = '#dc3545';
      commentField.classList.add('setting-input-error');
    }
    // The comment is the user's own text and is only ever sent as a FormData
    // field (see js/content/listing.js), never written to innerHTML. A regex script
    // tag strip was removed here: it is trivially bypassable (`</script >`,
    // nested tags) and gave a false sense of sanitization for a sink that does
    // not parse HTML.
    commentField.value = comment;
  }

  // Validate number inputs
  const numberInputs = [
    {
      id: 'hoursField',
      min: 1,
      max: 24,
      nameKey: 'validation.fields.repeatHours',
    },
    {
      id: 'hoursFieldBG',
      min: 0.5,
      max: 24,
      nameKey: 'validation.fields.backgroundRepeatHours',
    },
    {
      id: 'pagestoload',
      min: 1,
      max: 5,
      nameKey: 'validation.fields.pagesToLoad',
    },
    {
      id: 'pagestoloadBG',
      min: 1,
      max: 3,
      nameKey: 'validation.fields.backgroundPagesToLoad',
    },
    { id: 'delay', min: 5, max: 60, nameKey: 'validation.fields.delay' },
    {
      id: 'delayBG',
      min: 5,
      max: 60,
      nameKey: 'validation.fields.backgroundDelay',
    },
    {
      id: 'minCost',
      min: 0,
      max: 200,
      nameKey: 'validation.fields.minimumCost',
    },
    {
      id: 'minCostBG',
      min: 0,
      max: 200,
      nameKey: 'validation.fields.backgroundMinimumCost',
    },
    {
      id: 'maxCost',
      min: -1,
      max: 200,
      nameKey: 'validation.fields.maximumCost',
    },
    {
      id: 'maxCostBG',
      min: -1,
      max: 200,
      nameKey: 'validation.fields.backgroundMaximumCost',
    },
    {
      id: 'pointsToPreserve',
      min: 0,
      max: 300,
      nameKey: 'validation.fields.pointsToPreserve',
    },
    {
      id: 'notifyLimitAmount',
      min: 0,
      max: 400,
      nameKey: 'validation.fields.notificationLimit',
    },
    {
      id: 'hideLevelsBelow',
      min: 0,
      max: 10,
      nameKey: 'validation.fields.hideLevelsBelow',
    },
    {
      id: 'hideLevelsAbove',
      min: 0,
      max: 10,
      nameKey: 'validation.fields.hideLevelsAbove',
    },
    {
      id: 'hideCostsBelow',
      min: 0,
      max: 50,
      nameKey: 'validation.fields.hideCostsBelow',
    },
    {
      id: 'hideCostsAbove',
      min: 0,
      max: 50,
      nameKey: 'validation.fields.hideCostsAbove',
    },
    {
      id: 'maxTimeLeftBG',
      min: 0,
      max: 720,
      nameKey: 'validation.fields.backgroundMaxTimeLeft',
    },
    {
      id: 'minLevelBG',
      min: 0,
      max: 10,
      nameKey: 'validation.fields.backgroundMinimumLevel',
    },
  ];

  numberInputs.forEach((input) => {
    const element = document.getElementById(input.id);
    if (element) {
      const value = parseFloat(element.value);

      if (isNaN(value) || value < input.min || value > input.max) {
        errors.push(
          translate('validation.rangeError', {
            name: translate(input.nameKey),
            min: input.min,
            max: input.max,
          }),
        );
        element.style.borderColor = '#dc3545';
      } else {
        element.style.borderColor = '';
      }
    }
  });

  // Validate level ranges
  const hideLevelsBelow = parseInt(
    document.getElementById('hideLevelsBelow')?.value || 0,
  );
  const hideLevelsAbove = parseInt(
    document.getElementById('hideLevelsAbove')?.value || 10,
  );
  if (hideLevelsBelow > hideLevelsAbove) {
    errors.push(translate('validation.levelRange'));
    document.getElementById('hideLevelsBelow').style.borderColor = '#dc3545';
    document.getElementById('hideLevelsAbove').style.borderColor = '#dc3545';
  }

  // Validate cost ranges
  const hideCostsBelow = parseInt(
    document.getElementById('hideCostsBelow')?.value || 0,
  );
  const hideCostsAbove = parseInt(
    document.getElementById('hideCostsAbove')?.value || 50,
  );
  if (hideCostsBelow > hideCostsAbove) {
    errors.push(translate('validation.costRange'));
    document.getElementById('hideCostsBelow').style.borderColor = '#dc3545';
    document.getElementById('hideCostsAbove').style.borderColor = '#dc3545';
  }

  // Validate min/max cost ranges
  const minCost = parseInt(document.getElementById('minCost')?.value || 0);
  const maxCost = parseInt(document.getElementById('maxCost')?.value || -1);
  if (maxCost !== -1 && minCost > maxCost) {
    errors.push(translate('validation.minCostRange'));
    document.getElementById('minCost').style.borderColor = '#dc3545';
    document.getElementById('maxCost').style.borderColor = '#dc3545';
  }

  const minCostBG = parseInt(document.getElementById('minCostBG')?.value || 0);
  const maxCostBG = parseInt(document.getElementById('maxCostBG')?.value || -1);
  if (maxCostBG !== -1 && minCostBG > maxCostBG) {
    errors.push(translate('validation.backgroundMinCostRange'));
    document.getElementById('minCostBG').style.borderColor = '#dc3545';
    document.getElementById('maxCostBG').style.borderColor = '#dc3545';
  }

  // Show errors if any
  if (errors.length > 0) {
    const errorMessage = translate('validation.fixErrors', {
      errors: errors.join('\n• '),
    });
    if (window.GiftPilotNotify) {
      window.GiftPilotNotify.showNotification(errorMessage, 'error');
    } else {
      alert(errorMessage);
    }
    return false;
  }

  return true;
}

// Show notification to user
/* Show/Hide some settings that don't make sense on their own. */
function processDependentSettings() {
  const AutoJoinButton = document.getElementById('chkAutoJoinButton');
  const EnableBG = document.getElementById('chkEnableBG');
  evalDependent();

  function evalDependent() {
    const DependOnAutoJoinButton = document.querySelectorAll(
      '.dependsOnAutoJoinButton',
    );
    const DependOnBackgroundAutoJoin = document.querySelectorAll(
      '.dependsOnBackgroundAutoJoin',
    );

    DependOnAutoJoinButton.forEach((li) => {
      li.style.display = AutoJoinButton.checked ? 'block' : 'none';
    });

    DependOnBackgroundAutoJoin.forEach((li) => {
      li.style.display = EnableBG.checked ? 'block' : 'none';
    });

    fitSettings();
  }
  AutoJoinButton.addEventListener('change', evalDependent);
  EnableBG.addEventListener('change', evalDependent);

  // Add input validation listeners
  const numberInputs = document.querySelectorAll('input[type="number"]');
  numberInputs.forEach((input) => {
    input.addEventListener('input', function () {
      this.style.borderColor = '';
    });
  });
}
