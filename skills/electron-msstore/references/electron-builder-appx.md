# electron-builder `appx` reference

Facts below were verified against `app-builder-lib` source (the package that implements
electron-builder's AppX target), versions 24.13.3 through 26.18.1, unless marked otherwise.

## 1. Identity: copy, never type

| Manifest element | Config key | Source of truth | If unset |
|---|---|---|---|
| `Identity/@Name` | `appx.identityName` | Partner Center → Product identity → Package/Identity/Name | package.json `name` (wrong for the Store) |
| `Identity/@Publisher` | `appx.publisher` | Package/Identity/Publisher, `CN=` + GUID | derived from your signing cert (wrong for the Store) |
| `Properties/PublisherDisplayName` | `appx.publisherDisplayName` | Package/Properties/PublisherDisplayName | package.json `author.name` |
| `Properties/DisplayName` and `VisualElements/@DisplayName` | `appx.displayName` | a name reserved under Manage app names | `productName` |
| `Application/@Id` | `appx.applicationId` | your choice | derived from identityName or `name` |

Rules:

- Invented values like `MyApp.MyApp` or `CN=MyApp` build fine locally and fail at upload.
  The Partner Center identity name may be spelled or cased differently from your
  product. It is a token; paste it.
- `identityName`: 3-50 chars, letters, digits, `.`, `-` (electron-builder enforces this).
- `applicationId`: segments of letters and digits starting with a letter, joined by
  dots. No hyphens. 1-64 chars. Not `CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`.
  If unset it is derived from identityName (a leading publisher number is stripped) or
  package.json `name`. A package name like `my-app` therefore fails. Set it explicitly.
- `displayName` must match a reserved name **character for character**. Use an ASCII
  hyphen `-`, not an en dash `–`. Use straight quotes, not curly ones. A trailing space
  counts too.

## 2. Two names on purpose

- `productName` (short, e.g. `MyApp`): names `MyApp.exe`, the NSIS installer, shortcuts,
  and install folder. Changing it renames artifacts and breaks stable download URLs such
  as `.../releases/latest/download/MyApp-Setup-x64.exe`.
- `appx.displayName` (long, e.g. `MyApp - CSV Cleaner`): what the Store shows. It carries
  the keywords. Only the Store package uses it.

Changing the Store name later: reserve the new name in Partner Center **first**, then
change `appx.displayName`, then build. Reserving two or three candidate names up front
avoids blocking a release on a retitle.

## 3. XML escaping changed in 26.16.0

electron-builder fills `AppxManifest.xml` by string substitution.

| Field | app-builder-lib < 26.16.0 | >= 26.16.0 |
|---|---|---|
| `displayName` (Properties and VisualElements) | inserted raw | escaped (`& < > " '`) |
| `publisherDisplayName` | raw | escaped |
| package.json `description` → Description | raw | escaped |
| `publisher` | raw | escaped |
| `backgroundColor` | raw | escaped |
| `displayName` inside the auto-launch StartupTask | raw | **raw** (all versions) |
| protocol names in extensions | raw | raw |

Consequences:

- Old versions with a raw `&`: invalid XML, and makeappx fails with `0x80080204`.
  Workaround: write `&amp;` in the config. The Store reads it back as `&`.
- New versions with that old workaround: `&amp;` becomes `&amp;amp;`. The package
  builds, but its DisplayName is the literal text `&amp;`, which does not match the
  reservation. Remove the workaround when you upgrade past 26.16.0.
- With `addAutoLaunchExtension: true` (or the `electron-winstore-auto-launch`
  dependency), the name is inserted raw into the StartupTask in every version. Keep `&`,
  `<`, `>`, and quotes out of the name.

The escaping function escapes blindly (`&` → `&amp;` even inside an existing entity), so
there is no form that works on both sides of 26.16.0. Pin the version or avoid the
characters.

## 4. Version

- electron-builder maps package.json `1.2.3` to `1.2.3.0`.
- The Store reserves the 4th part and rejects uploads where it is not 0
  ("Apps are not allowed to have a Version with a revision number other than zero
  specified in the app manifest").
- `appx.setBuildNumber: true` puts `buildNumber`, or a CI `BUILD_NUMBER`-style env var,
  into the 4th part. Leave it off.
- The first part must not be 0: ship `1.0.0`, not `0.9.0`.
- Every part must be ≤ 65535. Each new submission needs a higher version than the last.
  A rejected package means bump and rebuild, not reuse.
- Pre-release suffixes (`1.2.3-beta.1`) are dropped. Two builds can produce the same
  Store version.

## 5. Tile assets

electron-builder takes every file in `<buildResources>/appx/` (default `build/appx/`) and
maps it into the package's `assets\` folder. The manifest references these names:

| File | Unscaled size | Required | Notes |
|---|---|---|---|
| `StoreLogo.png` | 50x50 | yes | |
| `Square44x44Logo.png` | 44x44 | yes | taskbar/start list icon |
| `Square150x150Logo.png` | 150x150 | yes | medium tile |
| `Wide310x150Logo.png` | 310x150 | yes | wide tile |
| `LargeTile.png` | 310x310 | no | **not** `Square310x310Logo.png` |
| `SmallTile.png` | 71x71 | no | **not** `Square71x71Logo.png` |
| `SplashScreen.png` | 620x300 | no | |
| `BadgeLogo.png` | 24x24 | no | lock screen badge |

- If a required file is missing, or the folder is empty, electron-builder silently
  packs its own **sample placeholder** image under that name. Nothing fails; your Store
  listing just shows a stock tile.
- Files named `Square310x310Logo.png` / `Square71x71Logo.png` are copied but never
  referenced. They do nothing. Use `LargeTile` / `SmallTile`.
- Scale variants (`StoreLogo.scale-200.png`, `.targetsize-*`) are supported; when present
  electron-builder runs makepri.
- Generate all tiles from one master PNG with a script (for example `sharp`) instead of
  hand-editing each. Pad the wide tile with the master's background color, and set
  `appx.backgroundColor` to that same color (default is grey `#464646`).

## 6. Capabilities

electron-builder always adds `runFullTrust`. It is a restricted capability, so Partner
Center asks you to justify it in Submission options. This is expected and not a
rejection. Add other capabilities via `appx.capabilities` only if the app needs them.

## 7. Signing

Microsoft signs Store packages, so you do not need a code-signing certificate for the
Store route. If you sign your NSIS installer (`CSC_LINK`/`WIN_CSC_LINK`), electron-builder
also tries to sign the `.appx`. With a certificate whose subject differs from
`appx.publisher`, that signing fails; electron-builder only logs a warning and carries
on, so read the build log. Build the Store package with signing variables unset, or
exclude it with `win.signExts: ["!.appx"]`, and upload it unsigned.

## 8. Building

- The AppX target refuses to run on Linux. Build on Windows 10/11, or on macOS via a
  Windows VM. WSL can produce the unpacked app but not the `.appx`.
- Build from a clean checkout (copy without `node_modules`, `dist`, `out`, `.git`, then
  `npm ci`) so dev artifacts and WSL `node_modules` do not leak in.
- `appx.customManifestPath` replaces the template entirely. The config-level checks then
  describe the config, not your manifest; inspect the built manifest directly.
- `asar`: decide it deliberately for release builds. Shipping `asar: false` exposes your
  app source in the install folder.
