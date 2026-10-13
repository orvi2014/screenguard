import type { AuthSession, DayStats, HistoryEntry, Settings } from '../shared/types';
import { DEFAULT_SETTINGS, HISTORY_LIMIT, STORAGE_KEYS } from '../shared/constants';
import { todayKey, uid } from '../shared/utils';

/**
 * Every read is defensive: a corrupt or missing value must never break the
 * extension, it just falls back to the defaults.
 */
async function readRaw<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await chrome.storage.local.get(key);
    const value = res?.[key];
    return value === undefined || value === null ? fallback : (value as T);
  } catch (err) {
    console.warn('[ScreenGuard] storage read failed', key, err);
    return fallback;
  }
}

async function writeRaw(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/* -------------------------------------------------------------- settings -- */

export function mergeSettings(partial: unknown): Settings {
  const p = (partial ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...p,
    categories: { ...DEFAULT_SETTINGS.categories, ...(p.categories ?? {}) },
    allowlist: Array.isArray(p.allowlist) ? p.allowlist : [],
    blocklist: Array.isArray(p.blocklist) ? p.blocklist : [],
  };
}

export async function getSettings(): Promise<Settings> {
  return mergeSettings(await readRaw<Partial<Settings>>(STORAGE_KEYS.settings, {}));
}

/**
 * Writes the defaults once, on first install, and never again.
 *
 * The naive version — read, merge, write — races with anything else saving
 * settings at the same moment (the onboarding tab, a popup toggle) and silently
 * throws that change away. Only writing when nothing is stored removes the race
 * entirely.
 */
export async function ensureSettingsInitialised(): Promise<Settings> {
  const existing = await readRaw<Partial<Settings> | null>(STORAGE_KEYS.settings, null);
  if (existing && typeof existing === 'object') return mergeSettings(existing);
  const defaults = mergeSettings({});
  await writeRaw(STORAGE_KEYS.settings, defaults);
  return defaults;
}

function queueSettings(update: (current: Settings) => Partial<Settings>): Promise<Settings> {
  const result = settingsWriteQueue.then(async () => {
    const current = await getSettings();
    const nextPatch = update(current);
    if (nextPatch.screenShareProtection === false) nextPatch.screenShareActive = false;
    const next = mergeSettings({
      ...current,
      ...nextPatch,
      categories: { ...current.categories, ...(nextPatch.categories ?? {}) },
    });
    await writeRaw(STORAGE_KEYS.settings, next);
    return next;
  });
  // Keep later operations usable after a failed storage write, while the
  // operation that failed still rejects so its caller can show an error.
  settingsWriteQueue = result.catch(() => getSettings());
  return result;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return queueSettings(() => ({ ...patch }));
}

let settingsWriteQueue: Promise<Settings> = Promise.resolve(mergeSettings({}));

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !changes[STORAGE_KEYS.settings]) return;
    cb(mergeSettings(changes[STORAGE_KEYS.settings].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/* ------------------------------------------------------------ allow/block -- */

export async function addToList(list: 'allowlist' | 'blocklist', domain: string): Promise<Settings> {
  const other = list === 'allowlist' ? 'blocklist' : 'allowlist';
  return queueSettings((settings) => {
    const current = settings[list];
    if (current.includes(domain)) return {};
    return {
      [list]: [...current, domain],
      [other]: settings[other].filter((d) => d !== domain),
    } as Partial<Settings>;
  });
}

export async function removeFromList(list: 'allowlist' | 'blocklist', domain: string): Promise<Settings> {
  return queueSettings((settings) => ({
    [list]: settings[list].filter((d) => d !== domain),
  } as Partial<Settings>));
}

/* --------------------------------------------------------------- history -- */

export async function getHistory(): Promise<HistoryEntry[]> {
  const raw = await readRaw<HistoryEntry[]>(STORAGE_KEYS.history, []);
  return Array.isArray(raw) ? raw : [];
}

/** A repeat of the same verdict within this window is the same event. */
const HISTORY_DEDUPE_MS = 5000;

export async function addHistoryEntry(
  entry: Omit<HistoryEntry, 'id' | 'ts'>,
): Promise<HistoryEntry> {
  return queueHistory(async () => {
    const full: HistoryEntry = { ...entry, id: uid(), ts: Date.now() };
    const history = await getHistory();

  // One navigation can be seen by more than one layer — the click interceptor
  // and the navigation guard, say. The user should see one line, not three.
  const latest = history[0];
  if (
    latest &&
    latest.domain === full.domain &&
    latest.action === full.action &&
    latest.category === full.category &&
    full.ts - latest.ts < HISTORY_DEDUPE_MS
  ) {
    return latest;
  }

    await writeRaw(STORAGE_KEYS.history, [full, ...history].slice(0, HISTORY_LIMIT));
    return full;
  });
}

export async function clearHistory(): Promise<void> {
  await queueHistory(() => writeRaw(STORAGE_KEYS.history, []));
}

let historyWriteQueue: Promise<void> = Promise.resolve();
function queueHistory<T>(operation: () => Promise<T>): Promise<T> {
  const result = historyWriteQueue.then(operation);
  historyWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

/* ----------------------------------------------------------------- stats -- */

const emptyStats = (day: string): DayStats => ({ day, linksChecked: 0, blocked: 0, warned: 0 });

export async function getTodayStats(): Promise<DayStats> {
  const day = todayKey();
  const stats = await readRaw<DayStats>(STORAGE_KEYS.stats, emptyStats(day));
  return stats.day === day ? { ...emptyStats(day), ...stats } : emptyStats(day);
}

export async function bumpStats(patch: Partial<Omit<DayStats, 'day'>>): Promise<DayStats> {
  return queueStats(async () => {
    const current = await getTodayStats();
    const next: DayStats = {
      day: current.day,
      linksChecked: current.linksChecked + (patch.linksChecked ?? 0),
      blocked: current.blocked + (patch.blocked ?? 0),
      warned: current.warned + (patch.warned ?? 0),
    };
    await writeRaw(STORAGE_KEYS.stats, next);
    return next;
  });
}

let statsWriteQueue: Promise<void> = Promise.resolve();
function queueStats<T>(operation: () => Promise<T>): Promise<T> {
  const result = statsWriteQueue.then(operation);
  statsWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

/* --------------------------------------------------------------- session -- */

export async function getSession(): Promise<AuthSession | null> {
  return readRaw<AuthSession | null>(STORAGE_KEYS.session, null);
}

export async function setSession(session: AuthSession | null): Promise<void> {
  await writeRaw(STORAGE_KEYS.session, session);
}
