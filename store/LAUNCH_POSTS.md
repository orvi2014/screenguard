# Launch posts

Each store link below carries its own `utm_source`, so the Developer Dashboard
shows which post brought installs.

Fill in every `[YOUR REAL REASON …]` with your own story; a real reason is what makes these posts land.

Post these yourself, one or two a day, and stay around for the first couple of
hours to answer comments. Replies matter more than the post.

---

## Reddit — r/chrome_extensions

**Title**
```
I built a Chrome extension that blurs emails, card numbers and API keys while you screen share
```

**Body**
```
[YOUR REAL REASON — one or two sentences on why you built it, e.g. a moment you shared something you shouldn't have.] So I built ScreenGuard.

Before a call you flip "I'm sharing my screen" (or leave it always on) and it:

- blurs email addresses, phone numbers, card numbers and API keys in page text and form fields
- blocks your personal tabs (email, banking, chat) until sharing is off
- stops risky links (phishing, adult, gambling) before they open, so nothing awful lands on the shared screen

It has no server. Everything runs locally, with no analytics and no account. On normal sites it shows nothing at all.

It's free: https://chromewebstore.google.com/detail/screenguard/dggihakhjjleajeimnfipcgbadkbjdcn?utm_source=reddit_chrome_extensions

It's early and I'd really like feedback, especially anything it blurs that it shouldn't, or misses that it should.
```

---

## Reddit — r/sales or r/salesengineers

Check each subreddit's self-promotion rules first. Some only allow it in a weekly thread.

**Title**
```
How do you avoid leaking customer data during demos? I built a small tool for it
```

**Body**
```
Every SE I know has a story about sharing the wrong tab mid-demo: another customer's name in the CRM, a pricing sheet, a personal inbox.

I built a free Chrome extension, ScreenGuard, for exactly this. Turn on "I'm sharing my screen" and it blurs emails, phone numbers, card numbers and API keys on whatever page you show, and blocks your email, banking and chat tabs until you stop sharing.

It runs entirely in your browser. No server, no account, nothing leaves your machine, which matters if your security team reviews extensions.

https://chromewebstore.google.com/detail/screenguard/dggihakhjjleajeimnfipcgbadkbjdcn?utm_source=reddit_sales

Curious what else people would want hidden during demos. Deal sizes? Customer logos?
```

---

## Hacker News — Show HN

Post on a weekday morning, US Eastern time. The title must start with "Show HN:". The link goes in the URL field; the text below is the first comment, posted by you straight away.

**Title**
```
Show HN: ScreenGuard – a Chrome extension that blurs secrets while you screen share
```

**URL**
```
https://chromewebstore.google.com/detail/screenguard/dggihakhjjleajeimnfipcgbadkbjdcn?utm_source=hn
```

**First comment**
```
Hi HN. [YOUR REAL REASON for building this, in one sentence.]

ScreenGuard does two things:

1. While you're sharing, it blurs emails, phone numbers, card numbers and API keys in the visible page and in form fields, and blocks personal pages like webmail and banking.
2. All the time, it checks where a link goes before it opens: on hover it shows a small warning, and on navigation it stops the page before it loads. That covers typed URLs, redirects and iframes, not just clicks.

A few design decisions HN might care about:

- No server at all. Classification is a local, synchronous function over a bundled domain list plus heuristics, so there's no URL telemetry because there's nowhere to send it.
- No analytics either, which means I'm launching blind. Feedback here is genuinely the main signal I get.
- Brand-impersonation checks handle lookalike characters (g00gle, paypa1), lure words glued to brands (paypallogin) and brand TLDs like blog.google, while leaving names like applebees.com or purchase.com alone. Getting false positives down has been most of the work.
- Network blocking uses declarativeNetRequest, so Chrome enforces the block list without the extension reading your traffic.

Happy to answer questions, and I'd love reports of anything it gets wrong.
```

---

## Product Hunt

**Name** — ScreenGuard

**Tagline** (60 characters max)
```
Blur secrets and block risky links while you screen share
```

**Description**
```
ScreenGuard hides what you shouldn't show on a call. Turn on screen-share mode and it blurs emails, phone numbers, card numbers and API keys, blocks your personal tabs, and stops risky links before they open. Everything runs locally: no server, no account, no tracking.
```

**Maker's first comment**
```
Hey Product Hunt! [YOUR REAL REASON for making ScreenGuard, in one sentence.]

It's free, runs entirely in your browser, and stays invisible on normal sites. It only steps in when something sensitive is on screen or a link looks risky.

I'd love to hear what else you'd want hidden during screen shares.
```

Use the launch video from `brag-output-2026-09-19-023716/` as the gallery video and the five store screenshots as the images.

---

## Indie Hackers / X (short version)

```
Shipped ScreenGuard: a free Chrome extension that blurs emails, card numbers and API keys while you screen share, and blocks risky links before they open.

No server, no analytics, no account. Everything runs on your machine.

Would love feedback 👉 https://chromewebstore.google.com/detail/screenguard/dggihakhjjleajeimnfipcgbadkbjdcn?utm_source=indiehackers
```
