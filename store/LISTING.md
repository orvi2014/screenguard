# Chrome Web Store listing - ScreenGuard 1.0.17

Everything the developer console asks for, ready to paste.

---

## Product details

**Name** (comes from `name` in `public/manifest.json`; 75 character limit — this is 53)
```
ScreenGuard – Blur Sensitive Info When Screen Sharing
```

**Short description** (comes from `description` in the manifest; 132 character limit — this is 131)
```
Blurs emails, card numbers and API keys while you share your screen on Zoom, Meet or Teams, and stops risky links before they open.
```

**Category** — Privacy & Security
**Language** — English
**Support email** — `hello@robatdasorvi.com`

**Detailed description**
```
Share your screen without leaking what's in your browser.

You're on a Zoom, Google Meet or Teams call, you share your screen, and there it is: a customer's email address, a card number, an API key in a settings page, a personal inbox in the next tab. ScreenGuard hides that before anyone on the call sees it.

Flip "I'm sharing my screen" before a call, or leave it always on, and ScreenGuard:

• BLURS SENSITIVE INFO in the pages you show: email addresses, phone numbers, card numbers and API keys, in page text and in form fields.
• BLOCKS PERSONAL PAGES while you share: your email, banking and chat tabs stay off screen until sharing is off again.
• STOPS RISKY LINKS before they open, so an adult, gambling or phishing page never lands on the shared screen.

Made for anyone who demos, presents or troubleshoots live: sales engineers, support agents, recruiters, teachers, developers and streamers.

LINK PROTECTION, ALL THE TIME

• Hover a risky link and a small warning appears beside it. Click one and ScreenGuard stops the page before it loads, so you can decide.
• It covers every way a page can open: typed addresses, bookmarks, history, redirects, links opened from other apps, and risky pages embedded inside ordinary sites.
• It catches brand lookalikes such as "paypa1", "g00gle" or "paypal-login", without flagging real sites like google.fr or blog.google.

PRIVATE BY DESIGN

ScreenGuard has no server. There is nobody to send your data to.

• Link checks and sensitive-info detection run on your own computer.
• Your browsing history and page text never leave the browser.
• No analytics, no tracking, no ads, no account needed.
• Settings, allow and block lists and protection history stay on this device. Clear them at any time.

Optional and off by default: if you add your own Google Gemini API key and turn on visual detection, up to three visible thumbnails are sent directly to Google Gemini to check for explicit images.

QUIET UNTIL IT MATTERS

On normal websites ScreenGuard shows nothing at all: no badge, no banner, no overlay. It should feel like a seatbelt, not an antivirus.

YOU STAY IN CONTROL

ScreenGuard is not a parental control or a censor. Every block can be overridden in one click, temporarily or for good, and you keep your own lists of allowed and blocked sites. If it ever gets a site wrong, the "Tell the developer it was wrong" link on the block page reaches me directly.

ScreenGuard protects what's in Chrome. Other desktop apps you share are outside its reach.
```

---

## Privacy practices tab

**Single purpose** (one sentence, as the policy requires)
```
ScreenGuard warns the user before they open a website that is risky or awkward to have on screen, and hides sensitive information on the page while they are sharing their screen.
```

**Permission justifications** — paste each into the matching field.

`storage`
```
Stores the user's own settings on their device: which protection categories are on, their list of allowed and blocked websites, and their local protection history. Nothing is transmitted anywhere.
```

`webNavigation`
```
Needed to detect a navigation to a risky website that did not come from a link click — a typed address, a bookmark, a redirect, the back button, or a link opened from another application — so the warning page can replace the destination as navigation starts.
```

`declarativeNetRequest`
```
Blocks the known risky domains and the user's own blocked list before the request is made, without the extension ever seeing the user's browsing. Chrome applies the rules; the extension only supplies them.
```

`alarms`
```
Expires the short-lived "open anyway" permissions the user grants, so a one-time override does not stay active indefinitely.
```

`content script matches (http://*/* and https://*/*)`
```
ScreenGuard declares no explicit host_permissions or optional_host_permissions. Its network rules use native block and allow actions with declarativeNetRequest. Content scripts run on HTTP and HTTPS websites to check links and hide sensitive text locally.

That access is required for the product's core function: checking where a link goes before the user clicks it, and hiding sensitive information on the page while they are sharing their screen. Both have to be in place before the user acts, so activeTab — which is granted only after a click on the extension icon — cannot provide them.

The extension does not request permission to read tab URLs. The popup and existing-tab protection checks ask the content script on each page to report its own address.

Nothing is transmitted off the device. Risk checks compare against a list bundled in the extension, and sensitive-content detection reads the page inside the page.
```

`identity` (optional permission — requested only if the user taps sign-in)
```
Reserved for optional Google sign-in, which is not enabled in this release. Chrome only requests it if the user explicitly chooses to sign in.
```

**Data usage** — tick nothing, and certify all three statements:

| Question | Answer |
|---|---|
| Does this item collect or transmit user data? | **Only when the user enables optional Gemini visual detection** |
| Personally identifiable information | Not collected |
| Health / financial / authentication information | Not collected |
| Personal communications, location, web history, user activity | Not collected |
| Website content | Optional: up to three visible thumbnails are transmitted directly to Google Gemini only when the user enables visual detection and adds their own API key |

Certifications to tick:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
```
https://orvi2014.github.io/screenguard/privacy.html
```

**Support contact** — `hello@robatdasorvi.com` (also reachable from inside the
extension: Settings › Help, and the "Tell the developer it was wrong" link on any
block page).

---

## Graphics

| Asset | Requirement | Status |
|---|---|---|
| Store icon | 128×128 PNG | `dist/icons/icon128.png` |
| Screenshots | 1280×800, 1–5 | `store/screenshots/` — five, in order |
| Small promo tile | 440×280 PNG | `store/promo/small-tile-440x280.png` |
| Marquee promo tile | 1400×560 PNG | `store/promo/marquee-1400x560.png` |

Upload the **captioned** screenshots from `store/screenshots-captioned/`, in file-name order: blur secrets, hover warning, blocked page, one switch, private by design. Each has a keyword headline so the gallery explains the extension without reading the description.

## Store listing SEO

| Field | Value |
|---|---|
| Official URL / Homepage | `https://orvi2014.github.io/screenguard/` (also set as `homepage_url` in the manifest) |
| Privacy policy | `https://orvi2014.github.io/screenguard/privacy.html` |
| Support URL | `https://github.com/orvi2014/screenguard/issues` |
| Promo video | Upload `brag-output-2026-09-19-023716/brag.mp4` to YouTube (unlisted is fine) and paste the link |

The name, short description and the first lines of the detailed description carry
the search terms people actually type: *screen share*, *blur*, *sensitive info*,
*Zoom*, *Meet*, *Teams*, *API keys*, *phishing*. Keep them there in future edits.

Ratings and installs move rankings more than wording at this stage: after each
release, ask early users for a review.

---

## On the "broad host permissions" warning

The store flags any extension that can run on every site. ScreenGuard's answer:

- No explicit required or optional host permissions are requested. Native network
  block and allow rules use declarativeNetRequest. HTTP/HTTPS content-script matches
  still provide broad in-page access for local link checks and sensitive-text hiding.
- It does **not** take `activeTab`, `tabs`, `history`, `bookmarks`, `downloads`,
  `cookies`, `scripting` or `webRequest`.
- The popup learns the current site from its content script. Enabling sharing also
  checks already-open tabs through their content scripts.

activeTab is not a workable substitute here: it is granted only after the user clicks
the extension icon, and the whole point of the product is to warn *before* the click.
An extension that only protects you after you ask it to protects nobody.

## Before you upload

- [ ] Register a Chrome Web Store developer account (one-time $5 fee, Google account required)
- [ ] Host the privacy policy and have its URL ready
- [ ] Check the name "ScreenGuard" is not taken or trademarked in your market
- [ ] Decide visibility: Public, Unlisted, or Private for a first release
- [ ] Run `npm run package` and upload the generated `release/screenguard-1.0.17.zip`

Review duration varies. Removing explicit host permissions does not guarantee
faster approval: the extension still runs content scripts across websites.
