/**
 * Optional Supabase configuration.
 *
 * Both values are build-time only and entirely optional: when they are absent
 * the extension still builds, installs and protects exactly the same. Auth is
 * a foundation for future sync/billing, never a gate on protection.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseConfig = {
  url,
  anonKey,
  isConfigured: Boolean(url && anonKey && url.startsWith('http')),
};
