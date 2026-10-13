import { BYPASS_TTL_MS, SESSION_BYPASS_KEY } from '../shared/constants';
import { addTemporaryAllow, removeTemporaryAllow } from './dnrRules';

interface BypassRecord {
  expiresAt: number;
  ruleId: number;
}
type BypassMap = Record<string, BypassRecord>;

// All read/modify/write operations share a queue, including expiry and tab close.
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const result = pending.then(run);
  pending = result.catch(() => {});
  return result;
}
function key(tabId: number, domain: string): string {
  return `${tabId}|${domain.toLowerCase()}`;
}
async function read(): Promise<BypassMap> {
  const res = await chrome.storage.session.get(SESSION_BYPASS_KEY);
  return res[SESSION_BYPASS_KEY] ?? {};
}
async function write(map: BypassMap): Promise<void> {
  await chrome.storage.session.set({ [SESSION_BYPASS_KEY]: map });
  const next = Math.min(...Object.values(map).map((record) => record.expiresAt));
  if (Number.isFinite(next)) await chrome.alarms.create('sg:bypass-expiry', { when: next });
  else await chrome.alarms.clear('sg:bypass-expiry');
}

export function grantBypass(domain: string, tabId?: number): Promise<void> {
  return serial(async () => {
    if (tabId === undefined || tabId < 0) throw new Error('A temporary allowance requires a tab');
    const map = await read();
    const k = key(tabId, domain);
    const ruleId = await addTemporaryAllow(domain, tabId, map[k]?.ruleId);
    map[k] = { expiresAt: Date.now() + BYPASS_TTL_MS, ruleId };
    try {
      await write(map);
    } catch (err) {
      await removeTemporaryAllow(ruleId);
      throw err;
    }
  });
}

export async function hasBypass(domain: string, tabId?: number): Promise<boolean> {
  await pending;
  if (tabId === undefined) return false;
  const rec = (await read())[key(tabId, domain)];
  return !!rec && rec.expiresAt > Date.now();
}

/** Reconcile persisted grants with Chrome's live rules on expiry and worker wake. */
export function pruneBypasses(closedTabId?: number): Promise<void> {
  return serial(async () => {
    const map = await read();
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const live = new Map(rules.map((rule) => [rule.id, rule]));
    for (const [k, rec] of Object.entries(map)) {
      const [tab, domain] = k.split('|');
      const rule = live.get(rec.ruleId);
      const valid = rec.expiresAt > Date.now() && Number(tab) !== closedTabId &&
        rule?.condition.tabIds?.length === 1 && rule.condition.tabIds[0] === Number(tab) &&
        rule.condition.requestDomains?.[0] === domain;
      if (!valid) delete map[k];
    }
    const retained = new Set(Object.values(map).map((rec) => rec.ruleId));
    const removeRuleIds = rules.filter((rule) => !retained.has(rule.id)).map((rule) => rule.id);
    if (removeRuleIds.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
    await write(map);
  });
}
