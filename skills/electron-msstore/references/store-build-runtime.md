# How a Store-installed Electron app must behave

## Detect the Store install

Electron sets `process.windowsStore` to `true` when the app runs from an AppX/MSIX
package. It is `undefined` otherwise. Use it in the main process; expose a boolean to the
renderer through your preload if the UI needs it.

## One update channel per install

- The Store updates MSIX installs. electron-updater does not update them.
- If your own update check runs in the Store build, it offers the website installer,
  and the user ends up with two copies side by side.

```js
export function initUpdater() {
  if (!app.isPackaged) return
  if (process.windowsStore) return   // the Store handles updates
  autoUpdater.checkForUpdatesAndNotify()
}
```

Apply the same gate to every self-distribution path: "new version available" banners,
"download latest" links, and links to the website installer in Help/About menus. The
checker warns when it finds electron-updater calls and no `process.windowsStore` anywhere.

## Store deep links

| Purpose | URI |
|---|---|
| Open the Store app on your product page | `ms-windows-store://pdp/?ProductId=<StoreProductId>` |
| Open the Store app straight to "Write a review" | `ms-windows-store://review/?ProductId=<StoreProductId>` |
| Web listing (any OS) | `https://apps.microsoft.com/detail/<StoreProductId>` |

- The web listing has no rating UI. In-app "Rate us" buttons should use the `review`
  URI.
- If you route external links through an allowlist (good practice with
  `shell.openExternal`), add the `ms-windows-store:` scheme to it, or the button silently
  does nothing.
- Ask for a rating after a success moment (a completed export, a finished job), not on
  launch.

## Privacy declarations follow the code

The Store listing has privacy answers and needs a privacy policy URL. Any change that
adds a network call (telemetry, crash reporting, license checks, update checks, feature
flags) must trigger a review of:

- the privacy policy page,
- the Partner Center privacy and data answers,
- README/website claims such as "no telemetry" or "100% offline".

Prefer wording that stays true: "your files never leave your computer" rather than "no
network calls".

## Selling inside a Store-distributed app

Microsoft Store Policies (section 10.8) allow non-game desktop apps to sell through
their own payment system or license keys (Gumroad, Paddle, Stripe, LemonSqueezy), with no
Store fee on those sales. Games have different rules. Read the current policy version
before relying on this. It changes, and Partner Center asks about in-app purchases.

## File system and identity differences

Packaged apps run with package identity. Writes to some locations under `AppData` are
virtualized per package, and uninstall removes package data. Test first launch, upgrade
from the previous Store version, and uninstall from an actual Store-style install (sideload
the built `.appx` on a test machine) before submitting.
