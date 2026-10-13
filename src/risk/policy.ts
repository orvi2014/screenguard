import type { CategoryKey, RiskCategory, RiskResult, Settings, Verdict } from '../shared/types';
import { getDomain, getHostname, listMatches } from '../shared/utils';
import { classifyUrl } from './riskClassifier';

const CATEGORY_SETTING: Record<RiskCategory, CategoryKey | null> = {
  ADULT: 'adult',
  GAMBLING: 'gambling',
  PHISHING: 'phishing',
  MALWARE: 'malware',
  SUSPICIOUS: 'suspicious',
  PRIVATE: 'private',
  UNKNOWN: null,
};

export function isScreenShareOn(settings: Settings): boolean {
  return settings.screenShareProtection && settings.screenShareActive;
}

/**
 * Turns a raw classification into what ScreenGuard should actually do,
 * taking the user's settings, allowlist, blocklist and screen-share mode
 * into account. Shared by the content script and the background worker so
 * both always agree.
 */
export function evaluateUrl(url: string, settings: Settings): Verdict {
  const host = getHostname(url);
  const domain = getDomain(url);
  const base = classifyUrl(url);
  return evaluateClassification(base, url, settings, host, domain);
}

/** Applies the user's switches and lists to a classification result. */
export function evaluateClassification(
  base: RiskResult,
  url: string,
  settings: Settings,
  suppliedHost?: string,
  suppliedDomain?: string,
): Verdict {
  const host = suppliedHost ?? getHostname(url);
  const domain = suppliedDomain ?? getDomain(url);

  const allow = (reason: string): Verdict => ({
    ...base,
    domain: domain || base.domain,
    level: 'SAFE',
    enforcement: 'allow',
    reason,
    screenShareUpgraded: false,
  });

  if (!settings.protectionEnabled) return allow('Protection is off');
  if (!host) return allow('Not a web page');

  if (listMatches(host, settings.allowlist)) {
    return allow('You always allow this site');
  }

  if (listMatches(host, settings.blocklist)) {
    return {
      level: 'RISKY',
      category: 'SUSPICIOUS',
      confidence: 1,
      reason: 'You added this site to your blocked list',
      domain,
      enforcement: 'block',
      screenShareUpgraded: false,
    };
  }

  const key = CATEGORY_SETTING[base.category];
  if (key && !settings.categories[key]) {
    return allow(`${base.category.toLowerCase()} checks are turned off`);
  }

  const shareOn = isScreenShareOn(settings);
  // Screen-share mode is about what ends up on the projector. A suspicious
  // download or an odd IP address is a safety question, not an exposure one,
  // so those stay at "warn" rather than becoming a full block.
  const exposureRisk = base.category === 'ADULT' || base.category === 'GAMBLING' ||
    base.category === 'PRIVATE';

  if (base.level === 'RISKY') {
    return { ...base, enforcement: 'block', screenShareUpgraded: false };
  }

  if (base.level === 'SENSITIVE') {
    // Personal pages are perfectly fine to browse. They only matter on a shared screen.
    if (base.category === 'PRIVATE' && !shareOn) {
      return allow('Private page, but you are not sharing your screen');
    }
    if (shareOn && exposureRisk) {
      return { ...base, enforcement: 'block', screenShareUpgraded: true };
    }
    if (!settings.warnBeforeRisky) return allow('Warnings are turned off');
    return { ...base, enforcement: 'warn', screenShareUpgraded: false };
  }

  return { ...base, enforcement: 'allow', screenShareUpgraded: false };
}
