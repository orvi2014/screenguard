import { useEffect, useState } from 'react';
import type { AuthSession } from '../shared/types';
import { authService } from '../auth/authService';
import { Section } from '../ui/components';

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

/**
 * Optional by design. Nothing below this component affects protection —
 * it exists so sync, subscriptions and billing have somewhere to land later.
 */
export function AccountSection() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = authService.isConfigured();

  useEffect(() => {
    authService.get().then(setSession).catch(() => undefined);
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      setSession(await authService.signIn());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    try {
      setSession(await authService.signInLocalPreview());
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await authService.signOut();
      setSession(null);
    } finally {
      setBusy(false);
    }
  };

  // A released build with no auth backend has nothing to show here: a dead
  // button and a fake-account preview are worse than no section at all. The
  // section appears as soon as Supabase credentials are configured.
  if (!configured && !session && !import.meta.env.DEV) return null;

  return (
    <Section
      title="Account"
      footer="Optional, and nothing here affects how you are protected."
    >
      {session ? (
        <div className="setting-row">
          <div
            aria-hidden
            style={{
              width: 36, height: 36, borderRadius: '50%', flex: '0 0 36px',
              background: session.user.avatarUrl ? `center/cover url(${session.user.avatarUrl})` : 'var(--sg-primary-soft)',
              color: 'var(--sg-primary)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: 600, fontSize: 14,
            }}
          >
            {!session.user.avatarUrl && (session.user.name[0] ?? '?').toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 540 }}>{session.user.name}</div>
            <div className="muted small">
              {session.user.isLocalPreview ? 'Development preview — not a real account' : session.user.email}
            </div>
          </div>
          <div className="spacer" />
          <button className="btn secondary" onClick={signOut} disabled={busy}>Sign out</button>
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 540, marginBottom: 4 }}>Not signed in</div>
          <p className="muted small" style={{ marginBottom: 14 }}>
            ScreenGuard runs entirely on this device and needs no account. Signing in
            changes nothing today — it is the groundwork for carrying settings between
            computers in a later version. Your browsing history stays here either way.
          </p>

          <button className="btn secondary" onClick={signIn} disabled={busy || !configured}>
            <GoogleG />
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>

          {!configured && import.meta.env.DEV && (
            <div className="muted small" style={{ marginTop: 12 }}>
              Google sign-in isn’t configured in this build. Add{' '}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
              <code>.env</code> and rebuild to enable it.
              <div style={{ marginTop: 8 }}>
                <button className="btn quiet" onClick={preview} disabled={busy}>
                  Preview the signed-in state
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="small" style={{ color: 'var(--sg-risk)', marginTop: 12 }}>{error}</div>
          )}
        </div>
      )}
    </Section>
  );
}
