import type { RiskCategory } from '../shared/types';

/**
 * Local, offline risk data for the MVP.
 *
 * This is deliberately small. The point of the prototype is the *architecture*:
 * `classifyUrl()` is the only entry point, so this table can be swapped for a
 * remote reputation API (or a bloom-filtered local list) without touching the UI.
 *
 * The guiding rule throughout is **conservative detection**: a missed risky site
 * is a bad day, a false positive on a site someone uses daily is an uninstall.
 *
 * `*-demo.test` / `*-example.test` entries exist so the demo page works offline.
 */

export const DOMAIN_LIST: Array<{ domain: string; category: RiskCategory }> = [
  // --- adult ------------------------------------------------------------
  { domain: 'pornhub.com', category: 'ADULT' },
  { domain: 'xvideos.com', category: 'ADULT' },
  { domain: 'xnxx.com', category: 'ADULT' },
  // Commonly typed as “xnxxx”; list it explicitly so native protection covers
  // the typo before a page can load, rather than relying on URL heuristics.
  { domain: 'xnxxx.com', category: 'ADULT' },
  { domain: 'xhamster.com', category: 'ADULT' },
  { domain: 'redtube.com', category: 'ADULT' },
  { domain: 'youporn.com', category: 'ADULT' },
  { domain: 'spankbang.com', category: 'ADULT' },
  { domain: 'brazzers.com', category: 'ADULT' },
  { domain: 'chaturbate.com', category: 'ADULT' },
  { domain: 'stripchat.com', category: 'ADULT' },
  { domain: 'onlyfans.com', category: 'ADULT' },
  { domain: 'fansly.com', category: 'ADULT' },
  { domain: 'rule34.xxx', category: 'ADULT' },
  { domain: 'adult-demo.test', category: 'ADULT' },
  { domain: 'adult-example.com', category: 'ADULT' },

  // --- gambling ---------------------------------------------------------
  { domain: 'bet365.com', category: 'GAMBLING' },
  { domain: 'stake.com', category: 'GAMBLING' },
  { domain: 'pokerstars.com', category: 'GAMBLING' },
  { domain: 'draftkings.com', category: 'GAMBLING' },
  { domain: 'fanduel.com', category: 'GAMBLING' },
  { domain: '888casino.com', category: 'GAMBLING' },
  { domain: 'bovada.lv', category: 'GAMBLING' },
  { domain: 'roobet.com', category: 'GAMBLING' },
  { domain: 'gambling-example.com', category: 'GAMBLING' },
  { domain: 'casino-demo.test', category: 'GAMBLING' },

  // --- malware / suspicious downloads ----------------------------------
  { domain: 'download-example.test', category: 'MALWARE' },
  { domain: 'free-crack-download.test', category: 'MALWARE' },
  { domain: 'malware-demo.test', category: 'MALWARE' },

  // --- phishing ---------------------------------------------------------
  { domain: 'phishing-demo.test', category: 'PHISHING' },
  { domain: 'secure-login-verify.test', category: 'PHISHING' },
];

/**
 * Well-known domains that would otherwise trip a heuristic.
 * Checked before any heuristic, never before the explicit list above.
 */
export const KNOWN_SAFE_DOMAINS = new Set([
  'bet.com',          // Black Entertainment Television
  'adultswim.com',    // Cartoon Network
  'betterment.com',
  'betterhelp.com',
  'torrentfreak.com',
  'camera.com',
  'sextantproperties.com',
]);

/**
 * Sites that aren't risky at all — but that you probably don't want on a
 * projector. Only ever acted on while screen-share protection is active.
 */
export const PRIVATE_DOMAINS: string[] = [
  'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.proton.me',
  'web.whatsapp.com', 'messages.google.com', 'messenger.com', 'web.telegram.org',
  'discord.com', 'slack.com', 'teams.microsoft.com',
  'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'paypal.com', 'revolut.com',
  'wise.com', 'monzo.com', 'coinbase.com', 'binance.com',
  'dashboard.stripe.com',
  'myaccount.google.com', 'accounts.google.com',
  '1password.com', 'bitwarden.com', 'lastpass.com',
  'healthcare.gov',
  'private-demo.test',
];

/** Substrings unambiguous enough to match anywhere in a hostname. */
export const STRONG_KEYWORDS: Array<{ token: string; category: RiskCategory }> = [
  { token: 'porn', category: 'ADULT' },
  { token: 'xxx', category: 'ADULT' },
  { token: 'hentai', category: 'ADULT' },
  { token: 'nsfw', category: 'ADULT' },
  { token: 'camgirl', category: 'ADULT' },
  { token: 'sexcam', category: 'ADULT' },
  { token: 'bdsm', category: 'ADULT' },
  { token: 'onlyfans', category: 'ADULT' },
  { token: 'casino', category: 'GAMBLING' },
  { token: 'gambling', category: 'GAMBLING' },
  { token: 'sportsbook', category: 'GAMBLING' },
  { token: 'betting', category: 'GAMBLING' },
];

/**
 * Words that stand on their own as a whole hostname label — but are still
 * vetoed by an innocent-context label (see SAFE_CONTEXT).
 */
export const MEDIUM_KEYWORDS: Array<{ token: string; category: RiskCategory }> = [
  { token: 'escort', category: 'ADULT' },
  { token: 'escorts', category: 'ADULT' },
  { token: 'milf', category: 'ADULT' },
  { token: 'fetish', category: 'ADULT' },
  { token: 'nudes', category: 'ADULT' },
  { token: 'keygen', category: 'MALWARE' },
  { token: 'warez', category: 'MALWARE' },
];

/**
 * Genuinely ambiguous words. These only count when the word IS the registrable
 * name (sex.com, poker.com) or a supporting word appears alongside it
 * (free-sex-videos.example). That is what keeps "adult-education.org",
 * "sex-education.org" and "bet.com" clean.
 */
export const WEAK_KEYWORDS: Array<{ token: string; category: RiskCategory }> = [
  { token: 'sex', category: 'ADULT' },
  { token: 'adult', category: 'ADULT' },
  { token: 'cams', category: 'ADULT' },
  { token: 'bet', category: 'GAMBLING' },
  { token: 'bets', category: 'GAMBLING' },
  { token: 'poker', category: 'GAMBLING' },
  { token: 'slots', category: 'GAMBLING' },
  { token: 'wager', category: 'GAMBLING' },
  { token: 'lottery', category: 'GAMBLING' },
  { token: 'crack', category: 'MALWARE' },
  { token: 'torrent', category: 'SUSPICIOUS' },
  { token: 'torrents', category: 'SUSPICIOUS' },
];

/**
 * Help and recovery services.
 *
 * Someone searching for support with a gambling or pornography addiction must
 * never be blocked on the way to getting it — that is the single worst thing
 * this extension could do. These are substring hints rather than whole labels,
 * because the sites are usually named as one word (gamblingtherapy.org).
 * They veto every keyword tier, though never the explicit risky-domain list.
 */
export const RECOVERY_HINTS = [
  'therapy', 'therapist', 'addiction', 'addicts', 'recovery', 'recover',
  'anonymous', 'helpline', 'aware', 'support', 'counsel', 'rehab',
  'prevention', 'abstinence', 'quitting', 'stopit', 'gamcare', 'ncpg',
  'selfhelp', 'treatment',
];

/** Any of these in the hostname cancels a MEDIUM or WEAK keyword match. */
export const SAFE_CONTEXT = new Set([
  'education', 'educational', 'educator', 'educators', 'edu', 'learn', 'learning',
  'school', 'schools', 'college', 'university', 'academy', 'course', 'courses',
  'class', 'classes', 'training', 'literacy', 'teach', 'teacher', 'teaching',
  'health', 'healthcare', 'therapy', 'therapist', 'clinic', 'medical', 'medicine',
  'research', 'study', 'studies', 'science', 'journal', 'museum', 'library',
  'council', 'charity', 'foundation', 'church', 'government', 'gov', 'nhs',
  'ministry', 'department', 'association', 'society', 'institute',
  'support', 'advice', 'helpline', 'safeguarding', 'wikipedia', 'encyclopedia',
]);

/** Words that turn an ambiguous ADULT keyword into a real signal. */
export const ADULT_CONTEXT = new Set([
  'video', 'videos', 'vid', 'vids', 'cam', 'cams', 'chat', 'tube', 'movie',
  'movies', 'pic', 'pics', 'photo', 'photos', 'film', 'films', 'live', 'girl',
  'girls', 'babes', 'dating', 'hookup', 'milf', 'teen', 'teens', 'xxx', 'hot',
  'sexy', 'nude', 'nudes', 'star', 'stars', 'toys', 'night', 'club', 'free',
  'best', 'top', 'hub', 'zone', 'world', 'city', 'shop', 'store',
]);

/** Words that turn an ambiguous GAMBLING keyword into a real signal. */
export const GAMBLING_CONTEXT = new Set([
  'casino', 'casinos', 'bet', 'bets', 'betting', 'win', 'wins', 'winner',
  'odds', 'sport', 'sports', 'sportsbook', 'poker', 'slot', 'slots', 'spin',
  'spins', 'jackpot', 'roulette', 'blackjack', 'bingo', 'play', 'online',
  'live', 'lucky', 'vegas', 'royal', 'king', 'gold', 'cash', 'money', '365', '888',
]);

/** Words that turn an ambiguous MALWARE/SUSPICIOUS keyword into a real signal. */
export const MALWARE_CONTEXT = new Set([
  'download', 'downloads', 'free', 'serial', 'keygen', 'patch', 'patcher',
  'full', 'pro', 'key', 'keys', 'activation', 'activator', 'nulled', 'repack',
  'software', 'warez', 'torrent', 'torrents', 'crack', 'cracked',
]);

export const RISKY_TLDS: Array<{ tld: string; category: RiskCategory }> = [
  { tld: 'xxx', category: 'ADULT' },
  { tld: 'adult', category: 'ADULT' },
  { tld: 'porn', category: 'ADULT' },
  { tld: 'sex', category: 'ADULT' },
  { tld: 'cam', category: 'ADULT' },
  { tld: 'casino', category: 'GAMBLING' },
  { tld: 'bet', category: 'GAMBLING' },
  { tld: 'poker', category: 'GAMBLING' },
];

/** Executable endings that deserve a heads-up before the click. */
export const DOWNLOAD_EXTENSIONS = [
  '.exe', '.msi', '.dmg', '.pkg', '.apk', '.scr', '.bat', '.cmd', '.vbs', '.ps1',
];

/** Software people download on purpose — no warning needed. */
export const TRUSTED_DOWNLOAD_HOSTS = [
  'github.com', 'githubusercontent.com', 'gitlab.com', 'sourceforge.net',
  'apache.org', 'mozilla.org', 'microsoft.com', 'apple.com', 'python.org',
  'nodejs.org', 'docker.com', 'jetbrains.com', 'adoptium.net', 'videolan.org',
  'libreoffice.org', 'google.com', 'gstatic.com',
];

/** Brands commonly impersonated in phishing hostnames. */
export const IMPERSONATED_BRANDS = [
  'paypal', 'apple', 'icloud', 'microsoft', 'office365', 'outlook', 'netflix',
  'amazon', 'google', 'facebook', 'instagram', 'whatsapp', 'binance', 'coinbase',
  'metamask', 'chase', 'wellsfargo', 'dhl', 'fedex', 'usps',
];

/** Explicit known brand domains. New country domains require review. */
export const BRAND_SAFE_DOMAINS = new Set([
  'google.com', 'google.org', 'google.co.uk', 'google.de', 'google.fr', 'google.it',
  'google.es', 'google.nl', 'google.be', 'google.ch', 'google.at', 'google.se',
  'google.no', 'google.dk', 'google.fi', 'google.pl', 'google.pt', 'google.ie',
  'google.gr', 'google.cz', 'google.ro', 'google.hu', 'google.ru', 'google.com.tr',
  'google.ca', 'google.com.mx', 'google.com.br', 'google.com.ar', 'google.cl',
  'google.co.in', 'google.co.jp', 'google.co.kr', 'google.com.au', 'google.co.nz',
  'google.com.sg', 'google.com.hk', 'google.com.tw', 'google.co.id', 'google.com.ph',
  'google.com.vn', 'google.co.th', 'google.com.my', 'google.com.pk', 'google.com.bd',
  'google.com.eg', 'google.com.sa', 'google.ae', 'google.co.il', 'google.co.za',
  'google.com.ng',
  'amazon.com', 'amazon.ca', 'amazon.com.mx', 'amazon.com.br', 'amazon.co.uk',
  'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.se',
  'amazon.pl', 'amazon.com.be', 'amazon.com.tr', 'amazon.ae', 'amazon.sa', 'amazon.eg',
  'amazon.in', 'amazon.co.jp', 'amazon.sg', 'amazon.com.au', 'amazon.cn', 'amazon.ie',
  'amazon.jobs', 'amazon.science', 'aboutamazon.com',
  'apple.com', 'apple.co', 'apple.news', 'icloud.com', 'icloud-content.com',
  'microsoft.com', 'microsoft365.com', 'microsoftstore.com', 'microsoftedge.com',
  'office365.com', 'outlook.com',
  'netflix.com', 'netflix.net', 'netflixtechblog.com',
  'paypal.com', 'paypal.me', 'paypal.de', 'paypal.co.uk', 'paypal.fr',
  'facebook.com', 'facebook.org', 'facebookmail.com', 'instagram.com', 'cdninstagram.com',
  'whatsapp.com', 'whatsapp.net', 'binance.com', 'binance.us', 'coinbase.com', 'metamask.io',
  'chase.com', 'wellsfargo.com', 'fedex.com', 'usps.com', 'usps.gov',
  'dhl.com', 'dhl.de', 'dhl.co.uk', 'dhl.fr', 'dhl.nl', 'dhl.it', 'dhl.es',
  'google-analytics.com', 'googletagmanager.com', 'googleapis.com',
  'googleusercontent.com', 'googlesyndication.com', 'gstatic.com',
  'facebook.net', 'fbcdn.net', 'fb.com',
  'paypalobjects.com', 'paypal-community.com',
  'amazonaws.com', 'amazontrust.com', 'media-amazon.com', 'ssl-images-amazon.com',
  'microsoftonline.com', 'microsoft.net', 'msn.com', 'live.com', 'office.com',
  'apple-cloudkit.com', 'cdn-apple.com',
  'coinbase-corp.com',
]);

/**
 * Country endings that are sold worldwide as generic names, given away free,
 * or are one keystroke from ".com". A brand's exact name on any other genuine
 * country ending (google.lk, amazon.com.au) is that brand's own domain.
 */
export const BRAND_UNTRUSTED_CCTLDS = new Set([
  'co', 'cm', 'om', 'ne', 'tk', 'ml', 'ga', 'cf', 'gq', 'pw', 'ws', 'cc', 'su',
  'to', 'io', 'ai', 'me', 'ly', 'gg', 'sh', 'tv', 'fm', 'vc', 'la', 'nu', 'st',
]);

/** Digits and letter pairs that pass for a letter at a glance (g00gle, rnicrosoft). */
export const LOOKALIKE_SWAPS: Array<[RegExp, string]> = [
  [/0/g, 'o'], [/3/g, 'e'], [/4/g, 'a'], [/5/g, 's'], [/7/g, 't'], [/8/g, 'b'],
  [/rn/g, 'm'], [/vv/g, 'w'],
];

/**
 * Words a phishing kit glues onto a brand ("paypallogin", "applesupport").
 * A brand joined to any other word ("applebees", "googleblog") is just a name.
 */
export const BRAND_LURE_WORDS = [
  'login', 'signin', 'signon', 'logon', 'verify', 'verification', 'secure',
  'security', 'account', 'accounts', 'update', 'confirm', 'wallet', 'recover',
  'unlock', 'suspended', 'billing', 'invoice', 'password', 'support', 'help',
  'helpdesk', 'service', 'id', 'auth', 'sso', 'pay', 'payment', 'refund', 'alert',
  'online', 'official', 'customer',
];

/**
 * Closed "dot-brand" top-level domains run by the brand itself (blog.google,
 * www.apple). Nobody else can register under them, so they cannot impersonate.
 */
export const BRAND_TLDS = new Set([
  'google', 'apple', 'amazon', 'microsoft', 'netflix', 'chase', 'dhl',
]);

/** Words that, in a long hyphen-heavy hostname, suggest a credential-harvesting page. */
export const PHISHING_WORDS = new Set([
  'login', 'signin', 'verify', 'verification', 'secure', 'security', 'account',
  'accounts', 'update', 'confirm', 'wallet', 'recover', 'unlock', 'suspended',
  'billing', 'invoice', 'password',
]);
