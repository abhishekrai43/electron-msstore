# Distribution around the Store listing

## Make the Store the primary download when your installer is unsigned

An unsigned NSIS installer triggers Windows SmartScreen's "unknown publisher" warning.
A Store install does not, because Microsoft signs the package. Without a paid
code-signing certificate, the Store button is the cleanest install path:

- Website hero/download section: the official "Get it from Microsoft" badge as the
  primary call to action (badge images: `https://get.microsoft.com/images/en-us%20dark.svg`
  and `...%20light.svg`).
- Keep the direct installer as a secondary link, at a stable URL
  (`https://github.com/<org>/<repo>/releases/latest/download/<App>-Setup-x64.exe`).
  Download mirrors and some directories want a direct installer URL, and the `latest`
  form never needs editing per release.

## Tag every Store link with a campaign ID

Append `?cid=<source>` to Store links (`?cid=website`, `?cid=github`, `?cid=newsletter`).
Partner Center's acquisition reports then attribute installs by source.

## Structured data

On the product page, use the Store URL as `downloadUrl`/`installUrl` in
`SoftwareApplication` JSON-LD. Do not build `aggregateRating` from a single editor
review. Show such a review visibly as a badge or quote instead.

## Listing content lives in the repo

Partner Center keeps only the latest values. Save every submitted field per version
(`templates/listing-record.md`): description, short description, search terms,
screenshot captions, what's new, privacy and age-rating answers. Keep screenshot
caption variants as separate files (`-ALT`) instead of overwriting them.

Screenshot set that works for utility apps: 1920x1080 PNGs, one message per image, in
the order result (before/after) → core workflow → secondary feature → scale (batch,
folders) → privacy/trust.

## The price lives in many places

Price and offer appear in the Store listing, the website, release notes, directory
blurbs, agent/system prompts, and press copy. On any price or plan change, grep the repo
and your copy folder for the old number before shipping.

## Directories

- Once the Store listing is live, scraper mirrors pick it up by themselves. They need no
  action and should not be counted as wins.
- Most download directories beyond a handful need accounts, phone numbers, CAPTCHAs,
  or a direct installer URL. Prepare one factual blurb set (about 160 characters plus one
  paragraph, no hype words, public business contact address) and reuse it.
- Links from GitHub READMEs and awesome-lists are `nofollow`.
- Automation (agents, scripts) can fill plain forms. Account creation, terms acceptance,
  CAPTCHA, and phone or email verification belong to the owner. Never try to bypass them.
