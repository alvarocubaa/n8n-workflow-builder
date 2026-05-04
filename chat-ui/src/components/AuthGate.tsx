'use client';

// AuthGate wraps the chat UI. On mount it asks /api/auth/me whether the
// current request is already authenticated (IAP header path while IAP is
// still on, OR gid_token cookie path post-IAP). If yes, renders children
// untouched. If no, renders the Google Sign-In button — the user clicks it,
// Google Identity Services hands us an ID token client-side, we POST it to
// /api/auth/exchange (which verifies + sets a cookie), then reload so the
// rest of the app can render with the user resolved server-side.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface CredentialResponse {
  credential: string; // the ID token
  select_by?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (resp: CredentialResponse) => void;
            auto_select?: boolean;
            ux_mode?: 'popup' | 'redirect';
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: { theme?: string; size?: string; text?: string; width?: number },
          ) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

type Status = 'checking' | 'authed' | 'unauthed' | 'signing_in' | 'error';

const AuthGate: React.FC<{
  clientId: string;
  children: React.ReactNode;
}> = ({ clientId, children }) => {
  const [status, setStatus] = useState<Status>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const initialised = useRef(false);

  // Step 1: check whether this request is already authed (IAP or existing cookie).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setStatus('authed');
        } else {
          setStatus('unauthed');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('unauthed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 2: when unauthed, lazy-load Google Identity Services and render the button.
  const handleCredentialResponse = useCallback(async (resp: CredentialResponse) => {
    setStatus('signing_in');
    setErrorMsg(null);
    try {
      const exchangeRes = await fetch('/api/auth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: resp.credential }),
        credentials: 'include',
      });
      if (!exchangeRes.ok) {
        const body = (await exchangeRes.json().catch(() => null)) as { error?: string } | null;
        setErrorMsg(body?.error ?? `Sign-in rejected (${exchangeRes.status})`);
        setStatus('error');
        return;
      }
      // Cookie is set. Reload so server components pick it up on the next render.
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error during sign-in');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (status !== 'unauthed' && status !== 'error') return;
    if (initialised.current) return;
    if (!clientId) return;

    const ensureScript = (): Promise<void> =>
      new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) {
          resolve();
          return;
        }
        const existing = document.querySelector<HTMLScriptElement>(
          `script[src="${GIS_SCRIPT_SRC}"]`,
        );
        if (existing) {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('GIS load failed')));
          return;
        }
        const script = document.createElement('script');
        script.src = GIS_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('GIS load failed'));
        document.head.appendChild(script);
      });

    ensureScript()
      .then(() => {
        if (!window.google?.accounts?.id || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          ux_mode: 'popup',
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width: 280,
        });
        initialised.current = true;
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load Google Sign-In');
        setStatus('error');
      });
  }, [status, clientId, handleCredentialResponse]);

  if (status === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-warm-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (status === 'authed') {
    return <>{children}</>;
  }

  // unauthed | signing_in | error
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-warm-50 px-6">
      <div className="flex flex-col items-center gap-5 max-w-md text-center">
        <Image src="/guesty-logo.png" alt="Guesty" width={120} height={36} priority />
        <div>
          <h1 className="text-xl font-semibold text-guesty-400">Workflow Builder</h1>
          <p className="text-sm text-gray-600 mt-1">
            Sign in with your Guesty Google account to continue.
          </p>
        </div>
        {!clientId && (
          <p className="text-xs text-rose-600">
            Sign-in misconfigured: missing GOOGLE_OAUTH_CLIENT_ID. Contact AI Team.
          </p>
        )}
        <div ref={buttonRef} aria-label="Google Sign-In button container" />
        {status === 'signing_in' && <p className="text-xs text-gray-500">Verifying…</p>}
        {errorMsg && <p className="text-xs text-rose-600">{errorMsg}</p>}
      </div>
    </div>
  );
};

export default AuthGate;
