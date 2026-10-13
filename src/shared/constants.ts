import type { Settings } from './types';

export const STORAGE_KEYS = {
  settings: 'sg:settings',
  history: 'sg:history',
  stats: 'sg:stats',
  session: 'sg:session',
} as const;

/** chrome.storage.session key holding short-lived "open anyway" grants. */
export const SESSION_BYPASS_KEY = 'sg:bypass';

/** How long a one-time "open anyway" stays valid, in ms. */
export const BYPASS_TTL_MS = 2 * 60 * 1000;

export const HISTORY_LIMIT = 300;

export const DEFAULT_SETTINGS: Settings = {
  protectionEnabled: true,
  warnBeforeRisky: true,
  screenShareProtection: true,
  screenShareActive: false,
  sensitiveMode: 'screenshare',
  confirmBeforeReveal: true,
  safeSearchEnabled: true,
  geminiVisionEnabled: false,
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash',
  categories: {
    adult: true,
    gambling: true,
    suspicious: true,
    phishing: true,
    malware: true,
    private: true,
  },
  allowlist: [],
  blocklist: [],
  onboardingComplete: false,
};

export const CATEGORY_LABELS: Record<string, string> = {
  ADULT: 'Adult content',
  GAMBLING: 'Gambling',
  PHISHING: 'Possible phishing',
  MALWARE: 'Malware risk',
  SUSPICIOUS: 'Suspicious website',
  PRIVATE: 'Personal / private',
  UNKNOWN: 'Unrecognised',
};

/** Dynamic declarativeNetRequest rule id ranges, kept apart so syncing is safe. */
export const DNR_IDS = {
  blockStart: 1000,
  allowStart: 100_000,
  keywordStart: 250_000,
  safeSearchStart: 300_000,
} as const;

/** Session rule ids (one-off "open anyway" grants). */
export const DNR_SESSION_START = 200_000;

/** Keep dynamic rules comfortably below Chrome's guaranteed capacity. */
export const MAX_DYNAMIC_RULES = 10_000;
