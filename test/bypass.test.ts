import { describe, equal, check } from './harness';
import { grantBypass, hasBypass, pruneBypasses } from '../src/background/bypass';
import { SESSION_BYPASS_KEY, BYPASS_TTL_MS } from '../src/shared/constants';

const previous = globalThis.chrome;
const storage: Record<string, unknown> = {};
const rules = new Map<number, chrome.declarativeNetRequest.Rule>();
let failWrite = false;
globalThis.chrome = {
  storage: { session: {
    get: async (k: string) => structuredClone({ [k]: storage[k] }),
    set: async (data: Record<string, unknown>) => {
      if (failWrite) throw new Error('write failed');
      Object.assign(storage, structuredClone(data));
    },
  } },
  alarms: { create: async () => {}, clear: async () => true },
  declarativeNetRequest: {
    getSessionRules: async () => structuredClone([...rules.values()]),
    updateSessionRules: async ({ removeRuleIds = [], addRules = [] }: Parameters<typeof chrome.declarativeNetRequest.updateSessionRules>[0]) => {
      removeRuleIds.forEach((id) => rules.delete(id));
      addRules.forEach((rule) => rules.set(rule.id, structuredClone(rule)));
    },
  },
} as unknown as typeof chrome;

const originalNow = Date.now;
try {
  describe('Temporary allowances are scoped, serialized and reconciled');
  await grantBypass('example.com', 10);
  await grantBypass('example.com', 10);
  equal('renewal removes the superseded rule', rules.size, 1);
  equal('network allowance is limited to the granting tab', [...rules.values()][0].condition.tabIds?.[0], 10);
  check('the granting tab can proceed', await hasBypass('example.com', 10));
  check('another tab cannot use the allowance', !(await hasBypass('example.com', 11)));
  Date.now = () => originalNow() + BYPASS_TTL_MS + 1;
  await pruneBypasses();
  equal('expiry removes every network rule', rules.size, 0);
  equal('expiry clears the grant', Object.keys(storage[SESSION_BYPASS_KEY] as object).length, 0);
  Date.now = originalNow;

  await Promise.all([grantBypass('one.example', 10), grantBypass('two.example', 11)]);
  equal('concurrent grants keep distinct rules', rules.size, 2);
  check('concurrent grants keep both records', await hasBypass('one.example', 10) && await hasBypass('two.example', 11));
  await pruneBypasses(10);
  equal('closing a tab removes only its grant', rules.size, 1);
  check('other tabs keep their allowance', await hasBypass('two.example', 11));

  // Simulate a rule surviving an earlier worker while its map entry was lost.
  const occupied = [...rules.keys()][0];
  storage[SESSION_BYPASS_KEY] = {};
  await grantBypass('three.example', 12);
  check('allocation consults live rules instead of restarting a counter', rules.has(occupied) && rules.size === 2);
  await pruneBypasses();
  equal('wake reconciliation removes orphan rules', rules.size, 1);
  check('the newly tracked rule survives reconciliation', await hasBypass('three.example', 12));

  failWrite = true;
  let rejected = false;
  try { await grantBypass('failed.example', 13); } catch { rejected = true; }
  check('failed persistence does not report a successful grant', rejected);
  equal('failed persistence rolls back its network allowance', rules.size, 1);
  failWrite = false;
  let missingTabRejected = false;
  try { await grantBypass('global.example'); } catch { missingTabRejected = true; }
  check('global temporary grants are rejected', missingTabRejected);
} finally {
  Date.now = originalNow;
  globalThis.chrome = previous;
}
