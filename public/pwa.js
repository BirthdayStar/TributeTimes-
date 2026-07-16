(function () {
  const APP_NAME = 'The Tribute Times';
  const DISMISS_INSTALL_KEY = 'tributeTimesInstallDismissedAt';
  const DISMISS_IOS_KEY = 'tributeTimesIosDismissedAt';
  const RELOAD_ON_UPDATE_KEY = 'tributeTimesReloadOnUpdate';
  const STORAGE_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
  const iosRetentionMs = 1000 * 60 * 60 * 24 * 14;
  const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isInstallableBrowser = 'BeforeInstallPromptEvent' in window || 'onbeforeinstallprompt' in window;
  let deferredInstallPrompt = null;
  let registration = null;
  let updateToast;
  let updateChannel = null;
  let shell;
  let statusPill;

  function syncShellOffset() {
    const hasVisibleShell = Boolean(
      (shell && !shell.wrapper.hidden) ||
      (updateToast && !updateToast.hidden)
    );
    document.body.classList.toggle('pwa-shell-offset', hasVisibleShell);
  }

  function setLayerVisibility(element, visible) {
    if (!element) return;
    element.hidden = !visible;
    syncShellOffset();
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('tribute-times-pwa', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveMeta(key, value) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn('PWA metadata save failed:', error);
    }
  }

  function getDismissedAt(key) {
    try {
      const raw = window.localStorage.getItem(key);
      const value = Number(raw || 0);
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      console.warn('PWA preference read failed:', error);
      return 0;
    }
  }

  function setDismissedAt(key) {
    try {
      window.localStorage.setItem(key, String(Date.now()));
    } catch (error) {
      console.warn('PWA preference save failed:', error);
    }
  }

  function getSessionFlag(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (error) {
      console.warn('PWA session read failed:', error);
      return null;
    }
  }

  function setSessionFlag(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (error) {
      console.warn('PWA session save failed:', error);
    }
  }

  function clearSessionFlag(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('PWA session clear failed:', error);
    }
  }

  function recentlyDismissed(key, ttl) {
    const dismissedAt = getDismissedAt(key);
    return dismissedAt && Date.now() - dismissedAt < ttl;
  }

  function createButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function createShellCard(id) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pwa-shell';
    wrapper.id = id;
    wrapper.hidden = true;
    const card = document.createElement('section');
    card.className = 'pwa-card';
    wrapper.appendChild(card);
    document.body.appendChild(wrapper);
    return { wrapper, card };
  }

  function initUpdateChannel() {
    if (!('BroadcastChannel' in window)) return;
    updateChannel = new BroadcastChannel('tribute-times-pwa-updates');
    updateChannel.addEventListener('message', (event) => {
      if (!event.data || event.data.tabId === TAB_ID) return;
      if (event.data.type === 'UPDATE_APPLYING' && updateToast) {
        setLayerVisibility(updateToast, false);
      }
    });
  }

  function setOnlineState(online) {
    if (!statusPill) return;
    statusPill.hidden = false;
    statusPill.classList.toggle('offline', !online);
    statusPill.querySelector('.pwa-dot').setAttribute('aria-hidden', 'true');
    statusPill.querySelector('.pwa-status-text').textContent = online ? 'Online' : 'Offline';
    if (!online) {
      saveMeta('last-offline-at', Date.now());
    }
  }

  function showUpdateToast(waitingWorker) {
    if (!updateToast) {
      const parts = createShellCard('pwa-update-toast');
      parts.wrapper.className = 'pwa-toast';
      parts.wrapper.setAttribute('role', 'status');
      parts.wrapper.setAttribute('aria-live', 'polite');
      updateToast = parts.wrapper;
      parts.card.innerHTML = [
        '<div class="pwa-row">',
        '  <div class="pwa-copy">',
        '    <span class="pwa-eyebrow"></span>',
        '    <h2 class="pwa-title"></h2>',
        '    <p class="pwa-text"></p>',
        '  </div>',
        '</div>',
        '<div class="pwa-actions"></div>'
      ].join('');
    }
    const eyebrow = updateToast.querySelector('.pwa-eyebrow');
    const title = updateToast.querySelector('.pwa-title');
    const text = updateToast.querySelector('.pwa-text');
    const actions = updateToast.querySelector('.pwa-actions');
    actions.innerHTML = '';

    if (waitingWorker) {
      eyebrow.textContent = 'Update ready';
      title.textContent = 'A new version of The Tribute Times is available.';
      text.textContent = 'Refresh when you are ready. Your current task will not be interrupted automatically.';
      actions.appendChild(createButton('Refresh to Update', 'pwa-btn', () => {
        setSessionFlag(RELOAD_ON_UPDATE_KEY, '1');
        if (updateChannel) {
          updateChannel.postMessage({ type: 'UPDATE_APPLYING', tabId: TAB_ID });
        }
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }));
      actions.appendChild(createButton('Later', 'pwa-btn ghost', () => {
        setLayerVisibility(updateToast, false);
      }));
    } else {
      eyebrow.textContent = 'Update installed';
      title.textContent = 'A newer version was activated in another tab.';
      text.textContent = 'Refresh this tab when you are ready so you can pick up the latest cached files.';
      actions.appendChild(createButton('Refresh This Tab', 'pwa-btn', () => {
        window.location.reload();
      }));
      actions.appendChild(createButton('Later', 'pwa-btn ghost', () => {
        setLayerVisibility(updateToast, false);
      }));
    }

    setLayerVisibility(updateToast, true);
  }

  function maybeShowInstallUi() {
    if (isStandalone) return;
    if (!deferredInstallPrompt && !(isIOS && !recentlyDismissed(DISMISS_IOS_KEY, iosRetentionMs))) return;
    if (deferredInstallPrompt && recentlyDismissed(DISMISS_INSTALL_KEY, STORAGE_RETENTION_MS)) return;

    if (!shell) {
      shell = createShellCard('pwa-install-shell');
    }

    const { wrapper, card } = shell;
    setLayerVisibility(wrapper, true);

    const iOSText = 'On iPhone or iPad, tap Share and then “Add to Home Screen” to install the app.';
    const generalText = 'Install The Tribute Times for a full-screen experience, faster repeat visits, and easier access from your home screen.';
    const bodyText = isIOS && !deferredInstallPrompt ? iOSText : generalText;

    card.innerHTML = [
      '<div class="pwa-row">',
      '  <div class="pwa-copy">',
      '    <span class="pwa-eyebrow">Install app</span>',
      `    <h2 class="pwa-title">${APP_NAME}</h2>`,
      `    <p class="pwa-text">${bodyText}</p>`,
      '  </div>',
      '  <button class="pwa-dismiss" type="button" aria-label="Dismiss install prompt">×</button>',
      '</div>',
      '  <div class="pwa-actions"></div>'
    ].join('');

    card.querySelector('.pwa-dismiss').addEventListener('click', () => {
      setLayerVisibility(wrapper, false);
      setDismissedAt(isIOS && !deferredInstallPrompt ? DISMISS_IOS_KEY : DISMISS_INSTALL_KEY);
    });

    const actions = card.querySelector('.pwa-actions');
    actions.innerHTML = '';

    if (deferredInstallPrompt) {
      actions.appendChild(createButton('Install App', 'pwa-btn', async () => {
        const promptEvent = deferredInstallPrompt;
        deferredInstallPrompt = null;
        promptEvent.prompt();
        try {
          const choice = await promptEvent.userChoice;
          saveMeta('install-choice', choice.outcome);
          if (choice.outcome !== 'accepted') {
            setDismissedAt(DISMISS_INSTALL_KEY);
            setLayerVisibility(wrapper, false);
          } else {
            setLayerVisibility(wrapper, false);
          }
        } catch (error) {
          console.warn('Install prompt failed:', error);
        }
      }));
      actions.appendChild(createButton('Maybe Later', 'pwa-btn secondary', () => {
        setDismissedAt(DISMISS_INSTALL_KEY);
        setLayerVisibility(wrapper, false);
      }));
    } else if (isIOS) {
      actions.appendChild(createButton('Got It', 'pwa-btn', () => {
        setDismissedAt(DISMISS_IOS_KEY);
        setLayerVisibility(wrapper, false);
      }));
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((item) => item.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith('tt-pwa-')).map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.warn('Local service worker cleanup failed:', error);
      }
      return;
    }
    if (!(window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;

    try {
      registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      await saveMeta('sw-registered-at', Date.now());

      if (registration.waiting) {
        showUpdateToast(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(worker);
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (getSessionFlag(RELOAD_ON_UPDATE_KEY) === '1') {
          clearSessionFlag(RELOAD_ON_UPDATE_KEY);
          window.location.reload();
          return;
        }
        showUpdateToast(null);
      });

      navigator.serviceWorker.addEventListener('message', (event) => {
        const type = event.data && event.data.type;
        if (type === 'SW_ACTIVATED') {
          saveMeta('last-sw-version', event.data.version || 'unknown');
        }
        if (type === 'SW_CACHE_ERROR') {
          console.warn('Service worker cache warning:', event.data.message || 'unknown cache error');
        }
      });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
      saveMeta('sw-register-failed', String(error && error.message || error));
    }
  }

  function boot() {
    document.body.classList.toggle('pwa-standalone', isStandalone);

    statusPill = document.createElement('div');
    statusPill.className = 'pwa-status';
    statusPill.hidden = false;
    statusPill.setAttribute('role', 'status');
    statusPill.setAttribute('aria-live', 'polite');
    statusPill.innerHTML = '<span class="pwa-dot"></span><span class="pwa-status-text">Online</span>';
    document.body.appendChild(statusPill);
    setOnlineState(navigator.onLine);

    window.addEventListener('online', () => {
      setOnlineState(true);
      saveMeta('last-online-at', Date.now());
    });
    window.addEventListener('offline', () => {
      setOnlineState(false);
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      maybeShowInstallUi();
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (shell) setLayerVisibility(shell.wrapper, false);
      saveMeta('installed-at', Date.now());
    });

    if (!isStandalone) {
      window.setTimeout(maybeShowInstallUi, 1200);
    }

    initUpdateChannel();
    registerServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
