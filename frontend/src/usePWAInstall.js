import { useEffect, useState, useCallback } from 'react';

export default function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  // detect standalone (already installed)
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator.standalone === true;
    setInstalled(!!standalone);
  }, []);

  // capture the install prompt when available
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();           // don’t show the default mini-infobar
      setDeferredPrompt(e);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return { outcome: 'unavailable' };
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    setDeferredPrompt(null); // Chrome only allows once
    return choice || { outcome: 'dismissed' };
  }, [deferredPrompt]);

  // basic platform detection for instructions
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in window);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  return { deferredPrompt, promptInstall, installed, isIOS, isSafari };
}

