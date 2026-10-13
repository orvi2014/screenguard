/**
 * Real-world corpora. The legitimate list is the important one: every entry here
 * is a site someone uses without thinking, and ScreenGuard must stay invisible
 * on all of them. A regression here is worse than a missed risky site.
 */

export const LEGITIMATE = `
github.com gitlab.com bitbucket.org stackoverflow.com serverfault.com superuser.com
npmjs.com pypi.org crates.io rubygems.org packagist.org nuget.org
docker.com kubernetes.io apache.org mozilla.org developer.mozilla.org w3.org ietf.org
rfc-editor.org nodejs.org python.org go.dev rust-lang.org typescriptlang.org
react.dev vuejs.org svelte.dev angular.dev nextjs.org vite.dev
vercel.com netlify.com heroku.com digitalocean.com linode.com cloudflare.com
jetbrains.com figma.com notion.so linear.app asana.com trello.com atlassian.com
nytimes.com washingtonpost.com theguardian.com bbc.co.uk bbc.com cnn.com
reuters.com apnews.com bloomberg.com ft.com wsj.com economist.com npr.org
aljazeera.com dw.com lemonde.fr spiegel.de elpais.com corriere.it
techcrunch.com theverge.com arstechnica.com wired.com engadget.com torrentfreak.com
hackernews.com news.ycombinator.com slashdot.org lobste.rs
twitter.com x.com facebook.com instagram.com linkedin.com reddit.com tiktok.com
pinterest.com tumblr.com mastodon.social bsky.app threads.net snapchat.com
amazon.com amazon.co.uk amazon.de amazon.co.jp ebay.com etsy.com walmart.com
target.com bestbuy.com ikea.com alibaba.com shopify.com costco.com
youtube.com netflix.com spotify.com twitch.tv vimeo.com soundcloud.com
hulu.com disneyplus.com bandcamp.com last.fm imdb.com
wikipedia.org en.wikipedia.org de.wikipedia.org britannica.com khanacademy.org
coursera.org edx.org udemy.com duolingo.com
mit.edu harvard.edu stanford.edu berkeley.edu ox.ac.uk cam.ac.uk ethz.ch
arxiv.org nature.com science.org jstor.org scholar.google.com
pubmed.ncbi.nlm.nih.gov biorxiv.org plos.org
usa.gov gov.uk irs.gov cdc.gov nih.gov nasa.gov noaa.gov europa.eu canada.ca
australia.gov.au india.gov.in
google.com google.de google.co.uk google.co.jp apple.com apps.apple.com
developer.apple.com support.apple.com microsoft.com azure.microsoft.com
docs.microsoft.com paypal.me netflix.com
google-analytics.com googletagmanager.com googleapis.com gstatic.com
googleusercontent.com facebook.net fbcdn.net amazonaws.com amazontrust.com
login.microsoftonline.com office.com live.com msn.com paypalobjects.com
essex.gov.uk middlesex.edu sussex.ac.uk wessex-water.co.uk
scunthorpe-united.co.uk
alphabet.com bethesda.net betterment.com betterhelp.com betamax.example
adultswim.com adult-education.org adult-learning.net adulteducation.gov.uk
sex-education.org sexual-health.org sexeducationcollaborative.org
bet.com camera.com camden.gov.uk webcams.travel cambridge.org
adult-day-care.com adult-social-care.gov.uk sexual-assault-support.org
poker-face-band.com national-lottery-results.co.uk slot-machine-museum.org
torrentfreak.com crackthecode.io slotsofvegas.example
maven.apache.org repo1.maven.org sonatype.com
mail.yahoo.com login.yahoo.com account.samsung.com signin.aws.amazon.com
s3.eu-west-1.amazonaws.com my-app.us-east-1.elb.amazonaws.com
stripe.com docs.stripe.com developer.chrome.com
`.trim().split(/\s+/);

/** Sites that must be caught. */
export const RISKY = [
  'https://pornhub.com/video/1',
  'https://m.pornhub.com/x',
  'https://www.xvideos.com/',
  'https://xnxx.com/',
  'https://xnxxx.com/',
  'https://xhamster.com/',
  'https://onlyfans.com/someone',
  'https://chaturbate.com/',
  'https://rule34.xxx/',
  'https://adult-demo.test/videos',
  'https://casino-demo.test/welcome-bonus',
  'https://download-example.test/get/installer.exe',
  'https://bet365.com/',
  'https://888casino.com/',
  'https://freepornsite.example/',
  'https://best-hentai-tube.example/',
  'https://something.xxx/',
  'https://play.casino/',
  'https://luckyslots.bet/',
  'https://online-gambling-site.example/',
  'https://mysportsbook.example/',
  'https://paypal-secure-login.verify-account.test/signin',
  'https://apple.id-verify.example/login',
  'https://secure-login.microsoft.account-update.example/',
  'https://user:hunter2@totally-normal.example/',
  'https://free-sex-videos.example/',
  'https://sex.com/',
  'https://poker.com/',
  'https://adult-cams-live.example/',
  'https://win-big-casino-bonus.example/',
];

/** Warn, but never block: worth a heads-up, not worth stopping. */
export const SENSITIVE = [
  'https://cdn.unknown-host.example/setup.exe',
  'https://files.example.org/tool.dmg',
  'https://203.0.113.55/admin',
  'https://escorts.example/',
  'https://fetish-blog.example/',
  'https://crack-software-download.example/',
  'https://keygen-site.example/',
];

/** Personal pages: fine normally, blocked only while screen sharing. */
export const PRIVATE_PAGES = [
  'https://mail.google.com/mail/u/0',
  'https://web.whatsapp.com/',
  'https://chase.com/personal/banking',
  'https://paypal.com/myaccount',
  'https://outlook.office.com/mail/',
  'https://1password.com/vault',
];

/**
 * Innocent names that deliberately brush against every keyword in the engine.
 * The addiction-support entries matter most: blocking someone on their way to
 * getting help would be the worst possible failure.
 */
export const TRAPS = `
essex.gov.uk sussex.ac.uk middlesex.edu wessex-water.co.uk unisex-salon.com
sexton-funeral.com sextant-navigation.com sextet-jazz.org intersex-support.org
asexuality.org sexualityresource.edu transsexualroadmap.net homosexuality-history.org
alphabet.com betray-the-game.com better-together.org between-the-lines.blog
bethesda.net betelgeuse-observatory.org diabetes.org diabetesuk.org sherbet-lemon.co.uk
tibet.net tibethouse.org abetterway.org betterment.com betterhelp.com
camera.com campus.harvard.edu campaign-monitor.com camden.gov.uk cambridge.org
camouflage-clothing.com camelbak.com campfire-stories.net became-a-teacher.org
webcams.travel webcam-directory.net camcorder-reviews.com
adulthood-podcast.com adultery-law.co.uk adulterate-chemistry.org
adult-day-care.com adult-social-care.gov.uk adult-literacy.org adult-education.org
cracker-barrel.com crackle.com nutcracker-ballet.org firecracker-festival.com
crackdown-game.net crackthecode.io
torrential-rain.org torrentfreak.com
slot-machine-museum.org slotted-spoon.com poker-face-band.com
national-lottery-results.co.uk lotteryresults-checker.info
gamblingtherapy.org begambleaware.org gamcare.org.uk gamblersanonymous.org
ncpgambling.org gambling-addiction-help.org gambling-recovery.net
stopitnow.org pornaddictionrecovery.org porn-addiction-counselling.org
sex-addiction-therapy.co.uk
scunthorpe-united.co.uk penistone-council.gov.uk lightwater-valley.co.uk
wager-history.edu wagermuseum.org bet.com bet-david.com
`.trim().split(/\s+/);
