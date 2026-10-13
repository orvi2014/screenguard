import type { CategoryKey, RiskCategory, Settings } from '../shared/types';
import { DNR_IDS, DNR_SESSION_START, MAX_DYNAMIC_RULES } from '../shared/constants';
import {
  DOMAIN_LIST, KNOWN_SAFE_DOMAINS, PRIVATE_DOMAINS, RECOVERY_HINTS, RISKY_TLDS,
  SAFE_CONTEXT, STRONG_KEYWORDS,
} from '../risk/data';

/**
 * declarativeNetRequest gives us the one thing webNavigation cannot: the risky
 * request never leaves the browser. We use it for the two cases where the
 * verdict is already known before navigation starts — the built-in risky domain
 * list and the user's own blocklist. Everything heuristic stays in
 * navigationGuard.ts, where we can reason about settings and screen-share mode.
 */

const CATEGORY_SETTING: Record<RiskCategory, CategoryKey | null> = {
  ADULT: 'adult', GAMBLING: 'gambling', PHISHING: 'phishing',
  MALWARE: 'malware', SUSPICIOUS: 'suspicious', PRIVATE: null, UNKNOWN: null,
};

/** Native blocking needs no host permissions. Custom top-level warnings are
 * best-effort UI from navigationGuard; blocked iframes use Chrome's own error UI. */
function blockRule(id: number, domain: string, priority = 1): chrome.declarativeNetRequest.Rule {
  return {
    id,
    priority,
    action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      requestDomains: [domain],
      resourceTypes: [
        'main_frame' as chrome.declarativeNetRequest.ResourceType,
        'sub_frame' as chrome.declarativeNetRequest.ResourceType,
      ],
    },
  };
}

function allowRule(id: number, domain: string, priority: number): chrome.declarativeNetRequest.Rule {
  return {
    id,
    priority,
    action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      requestDomains: [domain],
      resourceTypes: [
        'main_frame' as chrome.declarativeNetRequest.ResourceType,
        'sub_frame' as chrome.declarativeNetRequest.ResourceType,
      ],
    },
  };
}

/* ------------------------------------------------- keyword network rules -- */

/**
 * The domain list stops known sites before a single byte is requested, but a
 * heuristic match used to be caught only after the page had been fetched —
 * the request left the browser and the site logged a visit. These rules give
 * the unambiguous keywords the same native treatment.
 *
 * They deliberately mirror `classifyUrl`'s strong-keyword tier and nothing
 * weaker: an ambiguous word needs supporting evidence that a URL pattern
 * cannot express, and over-blocking is what gets an extension uninstalled.
 */
const HOST = '^https?://[^/?#]*';
const END = '(?:[:/?#]|$)';

/** Substrings that are adult/gambling wherever they appear in a hostname. */
function keywordPattern(category: 'ADULT' | 'GAMBLING'): string {
  const tokens = STRONG_KEYWORDS.filter((k) => k.category === category).map((k) => k.token);
  return `${HOST}(?:${tokens.join('|')})`;
}

/** Suffixes reserved for the category, minus the ones a substring already covers. */
function tldPattern(category: 'ADULT' | 'GAMBLING'): string | null {
  const substrings = new Set(STRONG_KEYWORDS.filter((k) => k.category === category).map((k) => k.token));
  const tlds = RISKY_TLDS
    .filter((t) => t.category === category && !substrings.has(t.tld))
    .map((t) => t.tld);
  return tlds.length ? `${HOST}\\.(?:${tlds.join('|')})${END}` : null;
}

/**
 * The classifier lets an innocent context word veto every keyword tier, and
 * help and recovery services matter far more than any block. The network
 * rules have to honour the same veto, or a support site becomes unreachable
 * with no warning page to explain why.
 *
 * Chrome compiles each regexFilter into a 2KB budget and rejects the whole
 * update if one rule exceeds it — which, since updateDynamicRules is atomic,
 * would take every other rule down with it. So the vocabulary is split across
 * several small rules that each stay well inside the budget.
 */
const VETO_CHUNK = 8;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function vetoPatterns(): string[] {
  const hints = chunk(RECOVERY_HINTS, VETO_CHUNK)
    .map((group) => `${HOST}(?:${group.join('|')})`);
  const labels = chunk([...SAFE_CONTEXT], VETO_CHUNK)
    .map((group) => `${HOST}[/.\\-](?:${group.join('|')})(?:[.\\-]|${END})`);
  return [...hints, ...labels];
}

/**
 * An explicit block — the user's own list, or a reviewed risky domain — is a
 * decision, not a heuristic, so the keyword veto must never quietly undo it.
 * Those rare domains are registered above the veto instead.
 */
function needsVetoOverride(domain: string): boolean {
  const url = `https://${domain}/`;
  return vetoPatterns().some((pattern) => new RegExp(pattern).test(url));
}

const VETO_OVERRIDE_PRIORITY = 4;

function regexBlockRule(id: number, regexFilter: string): chrome.declarativeNetRequest.Rule {
  return {
    id, priority: 1,
    action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      regexFilter,
      resourceTypes: [
        'main_frame' as chrome.declarativeNetRequest.ResourceType,
        'sub_frame' as chrome.declarativeNetRequest.ResourceType,
      ],
    },
  };
}

function regexAllowRule(id: number, regexFilter: string): chrome.declarativeNetRequest.Rule {
  return {
    id, priority: 2,
    action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      regexFilter,
      resourceTypes: [
        'main_frame' as chrome.declarativeNetRequest.ResourceType,
        'sub_frame' as chrome.declarativeNetRequest.ResourceType,
      ],
    },
  };
}

/** Keep Google and Bing search results in their strict family-safe modes. */
function safeSearchRule(id: number, regexFilter: string, parameter: string, value: string): chrome.declarativeNetRequest.Rule {
  return {
    id, priority: 1,
    action: {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { transform: { queryTransform: { addOrReplaceParams: [{ key: parameter, value }] } } },
    },
    condition: { regexFilter, resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType] },
  };
}

export function buildRules(settings: Settings): chrome.declarativeNetRequest.Rule[] {
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  const allowed = new Set(settings.allowlist.map((d) => d.toLowerCase()));

  if (settings.protectionEnabled) {
    let id = DNR_IDS.blockStart;
    const seen = new Set<string>();

    for (const domain of settings.blocklist) {
      const d = domain.toLowerCase();
      // "Always allow" wins over "always block", exactly as the policy layer
      // resolves the two lists.
      if (!d || seen.has(d) || allowed.has(d)) continue;
      seen.add(d);
      rules.push(blockRule(id++, d, needsVetoOverride(d) ? VETO_OVERRIDE_PRIORITY : 1));
    }

    for (const { domain, category } of DOMAIN_LIST) {
      const key = CATEGORY_SETTING[category];
      if (key && !settings.categories[key]) continue;
      if (seen.has(domain) || allowed.has(domain)) continue;
      seen.add(domain);
      rules.push(blockRule(id++, domain, needsVetoOverride(domain) ? VETO_OVERRIDE_PRIORITY : 1));
    }

    // Mirror the recognised private-site list in DNR while Screen Share Mode
    // is active. A private list entry may optionally include a path for
    // classification; DNR can only match by domain, which is appropriate
    // while the user is presenting.
    if (
      settings.screenShareProtection &&
      settings.screenShareActive &&
      settings.categories.private
    ) {
      for (const entry of PRIVATE_DOMAINS) {
        const domain = entry.split('/')[0].toLowerCase();
        if (!domain || seen.has(domain) || allowed.has(domain)) continue;
        seen.add(domain);
        rules.push(blockRule(id++, domain, needsVetoOverride(domain) ? VETO_OVERRIDE_PRIORITY : 1));
      }
    }
  }

  let allowId = DNR_IDS.allowStart;
  for (const domain of allowed) {
    if (!domain) continue;
    rules.push(allowRule(allowId++, domain, 2));
  }

  // The veto and the reviewed-safe list are exceptions, so they are registered
  // whenever any keyword rule is, and at a higher priority than the block.
  if (settings.protectionEnabled) {
    const keyword: string[] = [];
    if (settings.categories.adult) {
      keyword.push(keywordPattern('ADULT'));
      const tld = tldPattern('ADULT');
      if (tld) keyword.push(tld);
    }
    if (settings.categories.gambling) {
      keyword.push(keywordPattern('GAMBLING'));
      const tld = tldPattern('GAMBLING');
      if (tld) keyword.push(tld);
    }

    if (keyword.length) {
      let keywordId = DNR_IDS.keywordStart;
      for (const pattern of vetoPatterns()) rules.push(regexAllowRule(keywordId++, pattern));
      // A well-known site that happens to contain a keyword must stay reachable.
      for (const domain of KNOWN_SAFE_DOMAINS) {
        if (keyword.some((pattern) => new RegExp(pattern).test(`https://${domain}/`))) {
          rules.push(allowRule(keywordId++, domain, 2));
        }
      }
      for (const pattern of keyword) rules.push(regexBlockRule(keywordId++, pattern));
    }
  }

  if (settings.protectionEnabled && settings.safeSearchEnabled) {
    rules.push(safeSearchRule(DNR_IDS.safeSearchStart,
      '^https?://([a-z0-9-]+\\.)?google\\.[a-z.]+/search([/?].*)?$', 'safe', 'active'));
    rules.push(safeSearchRule(DNR_IDS.safeSearchStart + 1,
      '^https?://([a-z0-9-]+\\.)?bing\\.com/search([/?].*)?$', 'adlt', 'strict'));
  }

  if (rules.length > MAX_DYNAMIC_RULES) {
    throw new Error(`ScreenGuard supports up to ${MAX_DYNAMIC_RULES} blocking and allow rules`);
  }
  return rules;
}

/**
 * Chrome refuses a regex it cannot compile within its per-rule budget, and
 * refuses the entire update with it. Asking first turns that into dropping the
 * one pattern it dislikes.
 */
async function supportedRules(
  rules: chrome.declarativeNetRequest.Rule[],
): Promise<chrome.declarativeNetRequest.Rule[]> {
  const checked = await Promise.all(rules.map(async (rule) => {
    const regex = rule.condition.regexFilter;
    if (regex === undefined) return rule;
    try {
      const { isSupported, reason } = await chrome.declarativeNetRequest.isRegexSupported({ regex });
      if (isSupported) return rule;
      console.warn('[ScreenGuard] skipping unsupported pattern', regex, reason);
    } catch {
      // An older browser without the check still gets the rule; the atomic
      // update below, and its fallback, remain the backstop.
      return rule;
    }
    return null;
  }));
  return checked.filter((rule): rule is chrome.declarativeNetRequest.Rule => rule !== null);
}

/**
 * Install, startup and the settings write they trigger can all sync at once,
 * and two overlapping read-then-replace passes add the same rule ids — which
 * Chrome rejects, costing the keyword patterns via the fallback below. Each
 * sync therefore waits for the one before it.
 */
let syncChain: Promise<boolean> = Promise.resolve(true);

export function syncRules(settings: Settings): Promise<boolean> {
  syncChain = syncChain.catch(() => false).then(() => replaceAllRules(settings));
  return syncChain;
}

/** Replaces every dynamic rule we own with a freshly built set. */
async function replaceAllRules(settings: Settings): Promise<boolean> {
  const rules = await supportedRules(buildRules(settings));
  try {
    await replaceWith(rules);
    return true;
  } catch (err) {
    // updateDynamicRules is all-or-nothing, so one rule Chrome dislikes — a
    // regex over its complexity budget, say — would otherwise leave the user
    // with no protection at all. The keyword patterns are the only guessable
    // part, and navigationGuard still covers them, so drop those and keep the
    // explicit lists rather than failing open.
    console.warn('[ScreenGuard] could not sync blocking rules; retrying without keyword patterns', err);
    try {
      await replaceWith(rules.filter((rule) => rule.condition.regexFilter === undefined));
      return true;
    } catch (fallbackErr) {
      console.warn('[ScreenGuard] could not sync blocking rules', fallbackErr);
      return false;
    }
  }
}

async function replaceWith(addRules: chrome.declarativeNetRequest.Rule[]): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });
}

/* --------------------------------------------- one-off "open anyway" rules -- */

/** Allocate from Chrome's live rules so worker suspension cannot reuse an ID. */
export async function addTemporaryAllow(domain: string, tabId: number, replaceId?: number): Promise<number> {
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const used = new Set(existing.map((rule) => rule.id));
  let id = DNR_SESSION_START;
  while (used.has(id)) id++;
  const rule = allowRule(id, domain, 10);
  rule.condition.tabIds = [tabId];
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: replaceId === undefined ? [] : [replaceId],
    addRules: [rule],
  });
  return id;
}

export async function removeTemporaryAllow(id: number): Promise<void> {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] });
}
