export type RiskLevel = 'SAFE' | 'SENSITIVE' | 'RISKY';

export type RiskCategory =
  | 'ADULT'
  | 'GAMBLING'
  | 'PHISHING'
  | 'MALWARE'
  | 'SUSPICIOUS'
  | 'PRIVATE'
  | 'UNKNOWN';

export interface RiskResult {
  level: RiskLevel;
  category: RiskCategory;
  /** 0–1. How sure the local engine is. */
  confidence: number;
  /** Short, human-readable. Shown in the UI verbatim. */
  reason: string;
  /** Registrable-ish domain the verdict applies to. */
  domain: string;
}

/** What ScreenGuard should actually do, after user settings are applied. */
export type Enforcement = 'allow' | 'warn' | 'block';

export interface Verdict extends RiskResult {
  enforcement: Enforcement;
  /** True when the verdict was upgraded because screen-share mode is active. */
  screenShareUpgraded: boolean;
}

export type CategoryKey = 'adult' | 'gambling' | 'suspicious' | 'phishing' | 'malware' | 'private';

export type SensitiveMode = 'off' | 'screenshare' | 'always';

export interface Settings {
  protectionEnabled: boolean;
  warnBeforeRisky: boolean;
  screenShareProtection: boolean;
  /** The manual "I'm sharing my screen" switch. */
  screenShareActive: boolean;
  sensitiveMode: SensitiveMode;
  confirmBeforeReveal: boolean;
  /** Enforce strict filtering on supported search engines. */
  safeSearchEnabled: boolean;
  /** Opt-in cloud visual classification. Images are sent to Gemini only when enabled. */
  geminiVisionEnabled: boolean;
  /** Stored locally by Chrome; users should use a key restricted to the Gemini API. */
  geminiApiKey: string;
  geminiModel: string;
  categories: Record<CategoryKey, boolean>;
  allowlist: string[];
  blocklist: string[];
  onboardingComplete: boolean;
}

export type HistoryAction = 'blocked' | 'warned' | 'allowed';

export interface HistoryEntry {
  id: string;
  url: string;
  domain: string;
  action: HistoryAction;
  level: RiskLevel;
  category: RiskCategory;
  reason: string;
  ts: number;
}

export interface DayStats {
  day: string; // YYYY-MM-DD
  linksChecked: number;
  blocked: number;
  warned: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  /** True for the local development fallback session. */
  isLocalPreview?: boolean;
}

export interface AuthSession {
  user: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

/* ------------------------------------------------------------- messages -- */

/** What the user chose in a confirmation dialog. */
export type DialogChoice = 'back' | 'once' | 'always';

export interface DialogRequest {
  url: string;
  verdict: Verdict;
}

export type Message =
  | { type: 'LOG_EVENT'; entry: Omit<HistoryEntry, 'id' | 'ts'> }
  | { type: 'LINKS_CHECKED'; count: number }
  | { type: 'ALLOW_DOMAIN'; domain: string; scope: 'once' | 'always'; tabId?: number }
  | { type: 'BYPASS_AND_NAVIGATE'; url: string; scope: 'once' | 'always'; newTab?: boolean }
  | { type: 'CHECK_BYPASS'; domain: string }
  | { type: 'CHECK_ARRIVAL' }
  | { type: 'GET_POPUP_STATE' }
  | { type: 'OPEN_PAGE'; page: 'settings' | 'history' | 'demo' | 'onboarding' }
  | { type: 'RESYNC_RULES' }
  /* Embedded frames are too small to host a dialog, so they ask the top frame
     of the same tab to show it and report back what the user chose. */
  | { type: 'RELAY_DIALOG'; payload: DialogRequest }
  | { type: 'SHOW_DIALOG'; payload: DialogRequest }
  | { type: 'FRAME_SENSITIVE_COUNT'; counts: Record<string, number>; frameId: number }
  | { type: 'REPORT_SENSITIVE_COUNT'; counts: Record<string, number> }
  | { type: 'REVEAL_ALL_FRAMES' }
  | { type: 'REVEAL_IN_FRAME' }
  | { type: 'REQUEST_SENSITIVE_COUNTS' }
  | { type: 'GET_FRAME_URL' }
  | { type: 'PAGE_RISK_DETECTED'; url: string; verdict: Verdict }
  | { type: 'SITE_FEEDBACK'; url: string; decision: 'allow' | 'block' }
  | { type: 'CHECK_VISUAL_CONTENT'; url: string; images: Array<{ mimeType: string; data: string }> }
  /** Full packaged reputation lookup for a visible link. Never reaches a network. */
  | { type: 'CHECK_URL_REPUTATION'; url: string };

export interface PopupState {
  settings: Settings;
  today: DayStats;
  activeTabVerdict: (Verdict & { url: string }) | null;
  session: AuthSession | null;
}
