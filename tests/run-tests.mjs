// Builds throwaway fixture projects and asserts which finding codes check-appx-config.mjs reports.
// Run: (cd tests && npm install && node run-tests.mjs)
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const checker = path.join(here, "..", "skills", "electron-msstore", "scripts", "check-appx-config.mjs")
const root = path.join(here, "fixtures")
fs.rmSync(root, { recursive: true, force: true })

function png(w, h) {
  const crc = buf => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
    let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}
const GOOD_TILES = { "StoreLogo.png": [50, 50], "Square44x44Logo.png": [44, 44], "Square150x150Logo.png": [150, 150], "Wide310x150Logo.png": [310, 150] }

function fixture(name, { pkg, yml, builder, tiles = GOOD_TILES, src = {} }) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "my-app", version: "1.2.3", description: "Cleans files", author: { name: "Acme" }, ...pkg }, null, 2))
  if (yml) fs.writeFileSync(path.join(dir, "electron-builder.yml"), yml)
  if (builder) { const d = path.join(dir, "node_modules", "app-builder-lib"); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: "app-builder-lib", version: builder })) }
  if (tiles) { const d = path.join(dir, "build", "appx"); fs.mkdirSync(d, { recursive: true }); for (const [f, [w, h]] of Object.entries(tiles)) fs.writeFileSync(path.join(d, f), png(w, h)) }
  for (const [f, s] of Object.entries(src)) { const p = path.join(dir, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s) }
  return dir
}
function run(dir, extra = []) {
  try { return { code: 0, out: JSON.parse(execFileSync("node", [checker, "--project", dir, "--json", ...extra], { encoding: "utf8" })) } }
  catch (e) { return { code: e.status, out: JSON.parse(e.stdout) } }
}
const GUID = "CN=1A2B3C4D-1111-2222-3333-444455556666"
const base = dn => `productName: MyApp
win:
  target:
    - target: nsis
    - target: appx
appx:
  applicationId: MyApp
  identityName: AcmeInc.myapp
  publisher: ${GUID}
  publisherDisplayName: Acme
  displayName: "${dn}"
  backgroundColor: "#312e81"
`
let pass = 0, failN = 0
function expectCodes(label, res, { has = [], not = [], exit }) {
  const codes = res.out.findings.map(f => f.code)
  const problems = []
  for (const c of has) if (!codes.includes(c)) problems.push(`missing ${c}`)
  for (const c of not) if (codes.includes(c)) problems.push(`unexpected ${c}`)
  if (exit !== undefined && res.code !== exit) problems.push(`exit ${res.code} != ${exit}`)
  if (problems.length) { failN++; console.log(`FAIL ${label}: ${problems.join("; ")}\n     codes: ${codes.join(", ")}`) }
  else { pass++; console.log(`ok   ${label}`) }
}

// 1. Old electron-builder + "&amp;" written by hand (the documented workaround): correct for < 26.16.
expectCodes("old builder, &amp; workaround is accepted",
  run(fixture("old-escaped", { yml: base("MyApp - CSV &amp; Excel Cleaner"), builder: "26.15.7" }), ["--expect-display-name", "MyApp - CSV & Excel Cleaner"]),
  { not: ["displayName-unescaped", "displayName-double-escaped", "displayName-mismatch"], exit: 0 })

// 2. Same config after upgrading to >= 26.16: double escape -> Store shows "&amp;".
expectCodes("new builder flags the old &amp; workaround as double-escaped",
  run(fixture("new-double", { yml: base("MyApp - CSV &amp; Excel Cleaner"), builder: "26.18.1" }), ["--expect-display-name", "MyApp - CSV & Excel Cleaner"]),
  { has: ["displayName-double-escaped", "displayName-mismatch"], exit: 1 })

// 3. Old builder + raw "&": the 0x80080204 failure.
expectCodes("old builder flags raw &",
  run(fixture("old-raw", { yml: base("MyApp - CSV & Excel Cleaner"), builder: "25.1.8" })),
  { has: ["displayName-unescaped"], exit: 1 })

// 4. New builder + raw "&": fine.
expectCodes("new builder accepts raw &",
  run(fixture("new-raw", { yml: base("MyApp - CSV & Excel Cleaner"), builder: "26.16.0" }), ["--expect-display-name", "MyApp - CSV & Excel Cleaner"]),
  { not: ["displayName-unescaped", "displayName-double-escaped", "displayName-mismatch"], exit: 0 })

// 5. En dash in the name.
expectCodes("en dash is flagged",
  run(fixture("en-dash", { yml: base("MyApp – Cleaner"), builder: "26.18.1" })),
  { has: ["displayName-typographic"], exit: 1 })

// 6. The "first draft" config: placeholder identity, 0.x version, build number, no tiles, ungated updater.
expectCodes("first-draft config collects every trap",
  run(fixture("first-draft", {
    pkg: { version: "0.9.0", dependencies: { "electron-updater": "^6" } },
    yml: `productName: MyApp\nwin:\n  target: [nsis, appx]\nappx:\n  identityName: MyApp.MyApp\n  publisher: CN=MyApp\n  setBuildNumber: true\n`,
    builder: "26.18.1", tiles: null,
    src: { "src/main/updater.js": 'import { autoUpdater } from "electron-updater"\nexport const init = () => autoUpdater.checkForUpdatesAndNotify()\n' },
  })),
  { has: ["publisher-placeholder", "version-major-zero", "revision-nonzero", "assets-none", "updater-not-gated", "display-name-implicit", "publisher-display-name-implicit", "background-default"], exit: 1 })

// 7. Updater gated on process.windowsStore: no warning.
expectCodes("gated updater is accepted",
  run(fixture("gated", { yml: base("MyApp - Cleaner"), builder: "26.18.1",
    src: { "src/main/updater.js": 'import { autoUpdater } from "electron-updater"\nexport function init() { if (process.windowsStore) return; autoUpdater.checkForUpdates() }\n' } })),
  { not: ["updater-not-gated"], exit: 0 })

// 8. Misnamed large/small tiles, a wrong-size tile and a missing required tile.
expectCodes("tile naming and sizes",
  run(fixture("tiles", { yml: base("MyApp - Cleaner"), builder: "26.18.1",
    tiles: { "StoreLogo.png": [64, 64], "Square44x44Logo.png": [44, 44], "Square150x150Logo.png": [150, 150], "Square310x310Logo.png": [310, 310], "Square71x71Logo.png": [71, 71] } })),
  { has: ["asset-missing", "asset-misnamed", "asset-size"], exit: 1 })

// 9. Config in package.json "build", identity mismatch vs expected, hyphenated app id.
expectCodes("package.json build config + expected identity",
  run(fixture("pkg-build", { builder: "26.18.1",
    pkg: { build: { productName: "MyApp", win: { target: ["appx"] }, appx: { identityName: "AcmeInc.MyApp", publisher: GUID, publisherDisplayName: "Acme", displayName: "MyApp", applicationId: "my-app", backgroundColor: "#000000" } } } }),
    ["--expect-identity", "Acmeinc.myapp"]),
  { has: ["identity-mismatch", "application-id"], exit: 1 })

// 10. Auto-launch + "&" breaks the StartupTask element in every version.
expectCodes("auto-launch with & in name",
  run(fixture("autolaunch", { yml: base("MyApp - CSV & Excel").replace("backgroundColor", "addAutoLaunchExtension: true\n  backgroundColor"), builder: "26.18.1" })),
  { has: ["display-name-startup-task"], exit: 1 })

// 11. Old builder + "&" in package.json description.
expectCodes("old builder + & in description",
  run(fixture("desc", { pkg: { description: "Clean CSV & Excel" }, yml: base("MyApp - Cleaner"), builder: "26.10.0" })),
  { has: ["description-unescaped"], exit: 1 })

// 12. Clean project.
expectCodes("clean project passes",
  run(fixture("clean", { yml: base("MyApp - Data Cleaner"), builder: "26.18.1" }),
    ["--expect-identity", "AcmeInc.myapp", "--expect-publisher", GUID, "--expect-publisher-display-name", "Acme", "--expect-display-name", "MyApp - Data Cleaner"]),
  { not: ["identity-mismatch", "publisher-mismatch", "displayName-mismatch", "publisherDisplayName-mismatch"], exit: 0 })

console.log(`\n${pass} passed, ${failN} failed`)
process.exit(failN ? 1 : 0)
