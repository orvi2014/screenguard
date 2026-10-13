import type { AuthSession } from '../shared/types';
import { supabaseConfig } from './config';

/**
 * Google sign-in via Supabase's OAuth endpoint and chrome.identity.
 *
 * `identity` is an *optional* permission: Chrome only ever asks for it at the
 * moment the user taps "Continue with Google", so a user who never signs in is
 * never prompted for an account permission.
 */

export class AuthNotConfiguredError extends Error {
  constructor() {
    super('Google sign-in is not configured in this build.');
    this.name = 'AuthNotConfiguredError';
  }
}

async function ensureIdentityPermission(): Promise<boolean> {
  try {
    if (await chrome.permissions.contains({ permissions: ['identity'] })) return true;
    return await chrome.permissions.request({ permissions: ['identity'] });
  } catch {
    return false;
  }
}

function parseFragment(redirectUrl: string): Record<string, string> {
  const hash = redirectUrl.split('#')[1] ?? '';
  const query = redirectUrl.split('?')[1]?.split('#')[0] ?? '';
  const params = new URLSearchParams(hash || query);
  return Object.fromEntries(params.entries());
}

async function fetchUser(accessToken: string) {
  const res = await fetch(`${supabaseConfig.url}/auth/v1/user`, {
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(`Could not load your profile (${res.status})`);
  return (await res.json()) as {
    id: string;
    email?: string;
    user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
  };
}

export async function signInWithGoogle(): Promise<AuthSession> {
  if (!supabaseConfig.isConfigured) throw new AuthNotConfiguredError();

  const granted = await ensureIdentityPermission();
  if (!granted) throw new Error('ScreenGuard needs permission to open the Google sign-in window.');

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    `${supabaseConfig.url}/auth/v1/authorize` +
    `?provider=google&redirect_to=${encodeURIComponent(redirectUri)}`;

  const redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!redirect) throw new Error('Sign-in was cancelled.');

  const params = parseFragment(redirect);
  if (params.error_description) throw new Error(params.error_description);

  const accessToken = params.access_token;
  if (!accessToken) throw new Error('Google did not return a sign-in token.');

  const profile = await fetchUser(accessToken);
  const meta = profile.user_metadata ?? {};

  return {
    user: {
      id: profile.id,
      email: profile.email ?? '',
      name: meta.full_name ?? meta.name ?? (profile.email ?? 'Signed in').split('@')[0],
      avatarUrl: meta.avatar_url,
    },
    accessToken,
    refreshToken: params.refresh_token,
    expiresAt: params.expires_in ? Date.now() + Number(params.expires_in) * 1000 : undefined,
  };
}

export async function revokeGoogleSession(session: AuthSession): Promise<void> {
  if (!supabaseConfig.isConfigured || !session.accessToken) return;
  try {
    await fetch(`${supabaseConfig.url}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
  } catch {
    // Signing out locally is what actually matters; a failed network call is fine.
  }
}
