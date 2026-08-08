'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes the console installable to a phone
 * home screen. Registration is deliberately deferred to the load event so it
 * never competes with the first paint on a slow branch connection.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration only costs offline support — never block the app.
      });
    };
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
    return undefined;
  }, []);

  return null;
}
