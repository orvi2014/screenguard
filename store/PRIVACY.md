# ScreenGuard Privacy Policy

**Last updated: 11 September 2026**

## The short version

ScreenGuard has no ScreenGuard-operated server and sells nothing. Core protection and
sensitive-text detection happen inside your browser, on your computer. Optional Gemini
visual detection is the one exception: if you enable it and supply your own API key,
selected thumbnails are sent directly to Google for classification.

## What ScreenGuard collects

Nothing for the default, local-only product. ScreenGuard has no analytics, telemetry,
crash reporting, advertising identifier or remote configuration.

There is no account, no analytics, no telemetry, no crash reporting, no advertising
identifier, and no remote configuration. The extension makes no network requests of
its own unless you explicitly enable Gemini visual detection.

## What stays on your device

These are stored locally using Chrome's extension storage and never leave your computer:

- **Your settings** — which protection categories are on, screen-share preferences,
  and how sensitive content should be handled.
- **Your lists** — the websites you have chosen to always allow or always block.
- **Your protection history** — a local record of what was blocked, warned about or
  allowed, so you can review it. You can erase it at any time from the Protection
  history page, and doing so deletes it permanently.
- **Daily counters** — how many links were checked and how many pages were blocked today.
- **Optional Gemini API key** — if you add one, it is stored in your Chrome profile so
  the extension can make direct requests to Google Gemini. Use an API key restricted to
  the Gemini API, and use the Settings control to remove it at any time.

Uninstalling the extension removes all of it.

## How websites are checked

When you hover or click a link, or navigate to a page, ScreenGuard compares the
address against a list and a set of rules that are **bundled inside the extension**.
The comparison happens on your machine. The address is not sent to us or to any
third party, because there is no service to send it to.

## How sensitive content detection works

When sensitive-content hiding is active, ScreenGuard looks for patterns that resemble
email addresses, phone numbers, card numbers, API keys and tokens in visible page text
and form fields, and blurs matching values visually.

This reads the page inside the page. The text is never sent to the extension's
background process, to a server, or to any AI service. Nothing is stored — the
detection runs again each time a page loads.

## Permissions

| Permission | Why it is needed |
|---|---|
| Storage | Keeps your settings, lists and history on your device |
| Web navigation | Detects a navigation as it starts so a warning can replace its destination |
| Declarative net request | Lets Chrome block known risky addresses without the extension observing your traffic |
| Alarms | Expires temporary "open anyway" permissions |
| Access to websites | Content scripts run local link checks and sensitive-content hiding |
| Identity (optional) | Only requested if you explicitly choose to sign in. Not enabled in this release |

Chrome's "access to websites" permission is broad by necessity: the extension cannot
know in advance which page you will visit. Content scripts use this access for
local checks. ScreenGuard requests no explicit required or optional host permissions;
network protection uses native block and allow rules. The popup and existing-tab
checks ask page content scripts for their own addresses.

## Third parties

ScreenGuard does not use third-party analytics, error tracking, advertising networks or
content delivery networks. If, and only if, you turn on Gemini visual detection, up to
three visible thumbnails from the page and your API key are sent directly to Google
Gemini to classify explicit content. ScreenGuard does not receive a copy, keep a server
copy, or use those images for analytics. Google handles that request under the terms
and settings of your Google AI account.

## Children

ScreenGuard is not directed at children and collects no information from anyone,
including children.

## Changes

If a future version collects or transmits anything, this policy will be updated
before that version is released, and the change will be described in the extension's
listing.

## Reporting a problem

ScreenGuard's Settings page and its block page both offer to report a problem — a
site flagged by mistake, a risky site that got through, or a bug. Choosing one opens
a message in **your own mail client**, pre-filled with a template and the extension's
version number. A false-positive report also includes the blocked address, category and
reason shown on the block page so it can be investigated; you can remove or edit them.

Nothing is sent automatically. You can read and edit every word before deciding
whether to send it, and no browsing history, page content or diagnostic data is
attached. The only information that reaches us is what you leave in the draft.

## Contact

Questions about this policy, or anything else about the extension:

**hello@robatdasorvi.com**

If you write to us, we hold your email address and message for as long as it takes
to answer you. We do not add it to a mailing list and we do not share it.
