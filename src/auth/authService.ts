import type { AuthSession } from '../shared/types';
import { getSession, setSession } from '../storage/storageService';
import { supabaseConfig } from './config';
import { AuthNotConfiguredError, revokeGoogleSession, signInWithGoogle } from './googleAuth';

/**
 * The only auth surface the UI talks to.
 *
 * Deliberately thin, and deliberately disconnected from protection: nothing in
 * the risk engine, storage of settings, history or stats reads this module.
 * Sign-in exists purely as the foundation for future sync, subscriptions and
 * billing.
 */
export const authService = {
  isConfigured: (): boolean => supabaseConfig.isConfigured,

  get: (): Promise<AuthSession | null> => getSession(),

  async signIn(): Promise<AuthSession> {
    const session = await signInWithGoogle();
    await setSession(session);
    return session;
  },

  /**
   * Development fallback used when no Supabase project is configured, so the
   * signed-in UI can still be demonstrated. Clearly labelled in the UI and
   * never treated as a real identity.
   */
  async signInLocalPreview(): Promise<AuthSession> {
    const session: AuthSession = {
      user: {
        id: 'local-preview',
        email: 'preview@screenguard.local',
        name: 'Local preview',
        isLocalPreview: true,
      },
    };
    await setSession(session);
    return session;
  },

  async signOut(): Promise<void> {
    const session = await getSession();
    if (session && !session.user.isLocalPreview) await revokeGoogleSession(session);
    await setSession(null);
  },
};

export { AuthNotConfiguredError };
