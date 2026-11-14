# Store release checklist (Electron + electron-builder)

## Once, before the first Store build
- [ ] Product name reserved in Partner Center (plus 1-2 alternates if you may retitle).
- [ ] identityName, publisher (`CN=<GUID>`), publisherDisplayName pasted from Product identity.
- [ ] `appx.displayName` set to a reserved name; `productName` kept short.
- [ ] `appx.applicationId` set explicitly (letters/digits, no hyphen).
- [ ] Tiles in `build/appx/`: StoreLogo, Square44x44Logo, Square150x150Logo, Wide310x150Logo (plus LargeTile/SmallTile if wanted), generated from one master image.
- [ ] `appx.backgroundColor` matches the tile padding color.
- [ ] `.gitignore` covers `*.appx`, `*.msix`, `*.exe`, `*.blockmap`, `latest.yml`, `.env*`, recordings and sample data.
- [ ] Self-update and "download latest" UI gated on `process.windowsStore`.
- [ ] "Rate us" uses `ms-windows-store://review/?ProductId=<id>`; the scheme is in your external-link allowlist.
- [ ] Privacy policy URL is live and matches what the app actually sends.

## Every release
- [ ] package.json `version` bumped (first part ≥ 1; Store version becomes `x.y.z.0`).
- [ ] `node scripts/check-appx-config.mjs --expect-...` exits 0; warnings reviewed.
- [ ] If electron-builder was upgraded across 26.16.0: name escaping re-checked.
- [ ] Built on Windows from a clean checkout; signing env unset for the Store package (or `signExts: ["!.appx"]`).
- [ ] `AppxManifest.xml` extracted from the built `.appx`; identity, publisher, version, and DisplayName read back.
- [ ] Sideloaded on a test machine: first launch, upgrade from the previous version, uninstall.
- [ ] Listing record filled in `templates/listing-record.md` and committed.
- [ ] Network-behavior changes since the last release? Then re-check the privacy answers and the README/website claims.
- [ ] Price/offer changed? Then grep everywhere for the old value.

## After submission
- [ ] Certification report or rejection text saved verbatim in the repo.
- [ ] Public listing checked from a signed-out browser once Partner Center says published.
- [ ] Website/README Store links still carry `?cid=` tags.
