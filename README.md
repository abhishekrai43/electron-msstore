# electron-msstore

An agent skill for shipping an **Electron app to the Microsoft Store** with
**electron-builder** (`appx` / MSIX target), plus a zero-config checker that catches the
traps electron-builder itself lets through.

Generic Microsoft Store skills cover Partner Center. This one covers the layer above
it, where Electron apps actually break:

- **Display-name escaping changed in electron-builder 26.16.0.** Before it, a raw `&` in
  `appx.displayName` produces invalid XML (makeappx `0x80080204`). After it, the common
  `&amp;` workaround double-escapes to `&amp;amp;`, and your name no longer matches the
  reserved Store name. The checker reads your installed version and tells you which form
  is right.
- **Missing tiles are silently replaced with electron-builder's sample placeholders**, and
  `Square310x310Logo.png` / `Square71x71Logo.png` are never used (the manifest wants
  `LargeTile.png` / `SmallTile.png`).
- **Placeholder identity** (`CN=MyApp`, `MyApp.MyApp`) builds fine and fails at upload.
  Store packages need the Partner Center `CN=<GUID>` publisher and identity name, pasted
  exactly.
- **The 4th version part must be 0** (`setBuildNumber` breaks it), and the first part
  must not be 0.
- **Store installs must not self-update.** The checker flags electron-updater code that
  never checks `process.windowsStore`.
- Plus the runtime and distribution details: the review deep link, `?cid=` attribution,
  making the Store the SmartScreen-free download, and keeping listing text in the repo.

Facts are verified against `app-builder-lib` source (24.13 → 26.18) and a real
Store submission.

## Install

**Claude Code plugin**

```
/plugin marketplace add abhishekrai43/electron-msstore
/plugin install electron-msstore@electron-msstore
```

**Or copy the skill**: put `skills/electron-msstore/` into `~/.claude/skills/` (all
projects) or `<project>/.claude/skills/` (one project). It works with any agent that
reads `SKILL.md` skills.

Then ask your agent something like *"prepare this Electron app for the Microsoft Store"*
or *"why does Partner Center reject my appx?"*.

## Run the checker without an agent

```bash
cd your-electron-app
npm install
node path/to/skills/electron-msstore/scripts/check-appx-config.mjs \
  --expect-identity "Publisher.YourApp" \
  --expect-publisher "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" \
  --expect-publisher-display-name "Your Name" \
  --expect-display-name "YourApp - What It Does"
```

The `--expect-*` values come from Partner Center → your app → Product management →
Product identity. Exit code 1 means a blocking problem. Add `--json` for machine-readable
output. It reads `electron-builder.yml`/`.yaml`/`.json` or `package.json` `"build"`.
It needs Node 18+ and the project's `node_modules` (it reuses the `js-yaml` that
electron-builder installs).

Example:

```
[ERROR] displayName-double-escaped: displayName contains an XML entity (&amp;) but
electron-builder 26.18.1 escapes this field itself, so the manifest gets
"MyApp - CSV &amp;amp; Excel Cleaner" and the Store shows the entity literally.
        fix: Write the plain character instead, e.g. "MyApp - CSV & Excel Cleaner".
```

## Scope

Covers electron-builder's `appx` target (v24–v26). electron-builder v27 adds a separate
`msix` target (beta) with its own `msix` config block; the checker warns when it sees it
but does not validate it yet. Inspect the built `AppxManifest.xml` in that case.

## Pairs well with

- [`microsoft-store-publisher`](https://github.com/github/awesome-copilot) (GitHub's
  awesome-copilot) for Partner Center submission, WACK, and certification.
- Microsoft's `msstore` CLI for CI publishing.

## Tests

```bash
cd tests && npm install && node run-tests.mjs
```

13 fixture projects cover each trap, including both sides of the 26.16.0 escaping change.

## Layout

```
skills/electron-msstore/
  SKILL.md                         workflow + hard rules
  scripts/check-appx-config.mjs    the checker
  references/                      electron-builder appx, Store-build runtime, distribution, checklist
  templates/listing-record.md      per-version record of everything you submitted
tests/                             fixtures + runner
```

## License

MIT
