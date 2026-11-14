---
name: electron-msstore
description: Ship an Electron app to the Microsoft Store with electron-builder (appx/MSIX target). Use when configuring the appx block, matching Partner Center identity, choosing a Store display name, fixing makeappx or package-acceptance errors, preparing Store screenshots/tiles, or making an Electron app behave correctly when installed from the Store.
---

# Electron → Microsoft Store (electron-builder appx)

This skill covers the Electron- and electron-builder-specific layer of a Microsoft Store
release: the `appx` config, the AppxManifest it generates, tile assets, and how the app
must behave when it runs as a Store install. These are the places Electron apps break
that generic Store guides do not cover.

For the Partner Center side (account, agreements, WACK, submission sections,
certification monitoring), pair this with a Partner Center skill such as GitHub's
`microsoft-store-publisher` (`github/awesome-copilot`) or the official `msstore` CLI.
This skill does not drive Partner Center.

## Safeguards

- Never accept agreements, press **Submit for certification**, change pricing or
  markets, or delete a submission without explicit, action-specific approval.
- Never handle the user's passwords, MFA codes, tokens, signing-certificate passwords,
  or payment details. The user signs in to Partner Center themselves.
- Never invent identity values. Every value from Partner Center is copied, not typed.
- Do not commit the publisher ID, certificate files, or `.env` signing variables if the
  repository is public.

## Files

- `scripts/check-appx-config.mjs`: lints the project for the traps below. Run it before every Store build.
- `references/electron-builder-appx.md`: identity, names, escaping by electron-builder version, versions, assets, signing, building.
- `references/store-build-runtime.md`: what the app must do differently when installed from the Store.
- `references/distribution.md`: Store as the primary download, campaign links, directories.
- `references/release-checklist.md`: the per-release checklist.
- `templates/listing-record.md`: record of every listing field submitted, kept in the repo per version.

Read the reference for a phase before doing it.

## Workflow

### 1. Get identity from Partner Center (user does this)

Ask the user to reserve the product name, then copy from
**Partner Center → the app → Product management → Product identity**:

| Partner Center field | electron-builder key |
|---|---|
| Package/Identity/Name | `appx.identityName` |
| Package/Identity/Publisher (`CN=<GUID>`) | `appx.publisher` |
| Package/Properties/PublisherDisplayName | `appx.publisherDisplayName` |
| A reserved app name (Manage app names) | `appx.displayName` |

Treat the identity name as an opaque token. It can look misspelled or oddly cased, and
"correcting" it breaks the upload.

### 2. Configure the appx target

Read `references/electron-builder-appx.md`, then set the `appx` block. Minimum:

```yaml
win:
  target:
    - target: nsis   # optional: your website installer
    - target: appx   # Microsoft Store package
appx:
  applicationId: MyApp                 # letters/digits only; no hyphen
  identityName: <Package/Identity/Name>
  publisher: CN=<GUID from Partner Center>
  publisherDisplayName: <Publisher display name>
  displayName: "<reserved Store name>" # see the escaping rule below
  backgroundColor: "#RRGGBB"           # matches your tile padding
```

Keep `productName` short (it names the .exe, installer, shortcuts, and install folder).
Put the long, keyword-bearing Store name only in `appx.displayName`.

**Escaping depends on the installed electron-builder version** (check
`node_modules/app-builder-lib/package.json`):

- **26.16.0 and later**: write the plain character, e.g. `MyApp - CSV & Excel`.
  electron-builder escapes it. A hand-written `&amp;` becomes `&amp;amp;`, and the
  name no longer matches the reservation.
- **Before 26.16.0**: `displayName`, `publisherDisplayName`, and package.json
  `description` go into the manifest unescaped. Write `&amp;`, or makeappx fails with
  `0x80080204`.
- **Any version with `addAutoLaunchExtension`**: the startup-task element gets the raw
  name. Avoid `&`, `<`, `>`, and quotes in the name entirely.

Simplest: choose a reserved name without `&`.

### 3. Run the checker

```bash
node <skill-dir>/scripts/check-appx-config.mjs --project . \
  --expect-identity "<Package/Identity/Name>" \
  --expect-publisher "CN=<GUID>" \
  --expect-publisher-display-name "<name>" \
  --expect-display-name "<reserved name>"
```

It reads `electron-builder.yml`/`.yaml`/`.json` or package.json `build`, detects the
electron-builder version, and reports errors (exit 1) and warnings. Fix every error.
Explain every warning to the user rather than silently ignoring it. It needs
`npm install` to have run (it borrows the project's `js-yaml`). JS/TS builder configs are
not evaluated; export them to JSON and pass `--config`.

### 4. Build on Windows

The appx target builds on Windows only (or on macOS through a Windows VM). Linux and WSL
cannot produce it. Build from a clean checkout. Bump package.json `version` before every
Store submission: the Store needs a higher version each time, and the 4th part is
always 0.

### 5. Inspect the built manifest

Before uploading, extract `AppxManifest.xml` from the built `.appx` and read it back:

```powershell
tar -xf dist\<name>.appx AppxManifest.xml   # Windows 10+ ships bsdtar
Select-String -Path AppxManifest.xml -Pattern 'Identity|DisplayName|PublisherDisplayName|Version'
```

Confirm Identity Name, Publisher, Version (`x.y.z.0`), and `<DisplayName>` show exactly
the Partner Center values, with `&amp;` appearing once in the XML for an `&` in the name.
Also confirm the `assets\` entries are your images, not electron-builder's sample tiles.

### 6. Make the Store build behave like a Store app

Read `references/store-build-runtime.md`. At minimum: gate self-updates and "download the
new version" links on `process.windowsStore`, and use the Store review deep link for
ratings.

### 7. Record the listing and submit

Fill `templates/listing-record.md` for this version (description, search terms,
screenshot captions, what's new, privacy and age-rating answers) and commit it. Then
submit via Partner Center or the companion skill. `runFullTrust` is always present in
electron-builder packages; Partner Center asks why. Give a plain explanation: a desktop
app built on Electron needs full trust to run its bundled Chromium/Node runtime and
access user-chosen files.

### 8. When anything fails

Save the exact error output (makeappx, Partner Center package validation, certification
report) into a file in the repo at the time. Then map it with the references, fix the
smallest thing, bump the version if a package was already uploaded, rebuild, and re-run
the checker.

## Output standard

Report: electron-builder version, checker result (errors/warnings), the four identity
values as they appear in the built manifest, package version, package path, and any
remaining blocker with the exact next action.
