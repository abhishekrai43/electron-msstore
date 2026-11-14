#!/usr/bin/env node
// check-appx-config.mjs — lint an electron-builder project for Microsoft Store (MSIX/AppX) traps
// that electron-builder itself does not catch. Zero dependencies except js-yaml, which is
// resolved from the project (electron-builder already installs it) for YAML configs.
//
// Usage:
//   node check-appx-config.mjs [--project <dir>] [--config <file>]
//        [--expect-identity <Package identity name>] [--expect-publisher <CN=...>]
//        [--expect-publisher-display-name <name>] [--expect-display-name <reserved name>]
//        [--json]
//
// Exit code: 0 = no errors (warnings allowed), 1 = at least one error, 2 = could not run.

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

// ---------- args ----------
const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const projectDir = path.resolve(arg("--project") || process.cwd())
const asJson = args.includes("--json")
const expect = {
  identity: arg("--expect-identity"),
  publisher: arg("--expect-publisher"),
  publisherDisplayName: arg("--expect-publisher-display-name"),
  displayName: arg("--expect-display-name"),
}

const findings = []
const add = (level, code, message, fix) => findings.push({ level, code, message, fix })
const ERROR = "error", WARN = "warn", INFO = "info"

function fail(msg) {
  if (asJson) console.log(JSON.stringify({ ok: false, fatal: msg }, null, 2))
  else console.error(`check-appx-config: ${msg}`)
  process.exit(2)
}

// ---------- load package.json and builder config ----------
const pkgPath = path.join(projectDir, "package.json")
if (!fs.existsSync(pkgPath)) fail(`no package.json in ${projectDir} (use --project)`)
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))

function loadYaml(file) {
  const tries = [path.join(projectDir, "package.json"), fileURLToPath(import.meta.url)]
  for (const from of tries) {
    try {
      const yaml = createRequire(from)("js-yaml")
      return yaml.load(fs.readFileSync(file, "utf8"))
    } catch (e) {
      if (e.code !== "MODULE_NOT_FOUND") throw e
    }
  }
  fail(`cannot parse ${path.basename(file)}: js-yaml not found. Run "npm install" in the project first.`)
}

let config, configSource
const explicit = arg("--config")
const candidates = explicit
  ? [path.resolve(projectDir, explicit)]
  : ["electron-builder.yml", "electron-builder.yaml", "electron-builder.json"].map(f => path.join(projectDir, f))
for (const file of candidates) {
  if (!fs.existsSync(file)) continue
  configSource = path.relative(projectDir, file)
  config = file.endsWith(".json") ? JSON.parse(fs.readFileSync(file, "utf8")) : loadYaml(file)
  break
}
if (!config && pkg.build) {
  config = pkg.build
  configSource = 'package.json "build"'
}
if (!config) {
  const js = ["electron-builder.config.js", "electron-builder.config.cjs", "electron-builder.config.mjs", "electron-builder.config.ts"]
    .find(f => fs.existsSync(path.join(projectDir, f)))
  if (js) fail(`${js} is a JS/TS config; this checker reads YAML/JSON only. Export the config to JSON and pass --config.`)
  fail("no electron-builder config found (electron-builder.yml/.yaml/.json or package.json \"build\")")
}
config = config || {}
const appx = config.appx || {}

// ---------- electron-builder version ----------
function readVersion(name) {
  try {
    const p = createRequire(pkgPath).resolve(`${name}/package.json`)
    return JSON.parse(fs.readFileSync(p, "utf8")).version
  } catch {
    return null
  }
}
const builderVersion = readVersion("app-builder-lib") || readVersion("electron-builder")
const cmp = (a, b) => {
  const pa = a.split(/[.-]/).map(n => parseInt(n, 10) || 0), pb = b.split(/[.-]/).map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}
// app-builder-lib 26.16.0 started XML-escaping displayName/publisherDisplayName/description in AppxManifest.xml.
const ESCAPES_SINCE = "26.16.0"
const builderEscapes = builderVersion ? cmp(builderVersion, ESCAPES_SINCE) >= 0 : null
if (!builderVersion) {
  add(WARN, "builder-version-unknown",
    "Could not read the installed electron-builder version (node_modules missing?). Escaping checks assume the worst case.",
    "Run the checker after `npm install`.")
}

// ---------- is appx even a target? ----------
const targets = []
for (const t of [].concat(config.win?.target || [])) targets.push(typeof t === "string" ? t : t?.target)
const hasAppx = targets.includes("appx")
const hasMsix = targets.includes("msix") || config.msix != null
if (hasMsix) add(WARN, "msix-target",
  'This project uses electron-builder\'s newer "msix" target (v27, beta) and/or an "msix" config block. This checker validates the "appx" block; identity, name and asset results may not reflect your msix settings.',
  "Inspect the built AppxManifest.xml directly before upload (SKILL.md step 5).")
else if (!hasAppx) add(INFO, "no-appx-target", `win.target does not include "appx" (found: ${targets.join(", ") || "default nsis"}). Checks still run.`,
  'Add `- target: appx` under win.target, or build with `--win appx`.')
if (appx.customManifestPath) add(WARN, "custom-manifest",
  `appx.customManifestPath is set (${appx.customManifestPath}); identity/name checks below describe the config, not your custom manifest.`,
  "Inspect the built AppxManifest.xml directly before upload.")

// ---------- helpers ----------
const RAW_SPECIAL = /[&<>"']/
const RAW_AMP = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i
const ENTITY = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i
const decode = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
const TYPOGRAPHIC = /[–—‘’“”… ]/
const describeChar = c => ({ "–": "en dash", "—": "em dash", "‘": "curly quote", "’": "curly apostrophe",
  "“": "curly quote", "”": "curly quote", "…": "ellipsis character", " ": "non-breaking space" }[c] || c)

// Check one string that electron-builder writes into AppxManifest.xml.
function checkManifestString(field, value, expected) {
  if (value == null || value === "") return
  const typo = value.match(TYPOGRAPHIC)
  if (typo) add(ERROR, `${field}-typographic`,
    `${field} contains a ${describeChar(typo[0])}. Reserved Store names are matched character-for-character; this usually differs from what Partner Center holds.`,
    'Use plain ASCII: hyphen "-", straight quotes, "...".')

  let manifestValue // what ends up in the manifest after electron-builder
  if (builderEscapes === true) {
    if (ENTITY.test(value)) add(ERROR, `${field}-double-escaped`,
      `${field} contains an XML entity (${value.match(ENTITY)[0]}) but electron-builder ${builderVersion} escapes this field itself, so the manifest gets "${value.replace(/&/g, "&amp;")}" and the Store shows the entity literally.`,
      `Write the plain character instead, e.g. "${decode(value)}".`)
    manifestValue = value
  } else {
    if (RAW_AMP.test(value) || /[<>]/.test(value)) add(ERROR, `${field}-unescaped`,
      `${field} contains a raw ${value.match(/[&<>]/)[0]}. electron-builder ${builderVersion || "(unknown version)"} writes this field into AppxManifest.xml WITHOUT escaping (fixed in ${ESCAPES_SINCE}), so makeappx fails (0x80080204) or the manifest is invalid.`,
      `Write it as an entity ("&" → "&amp;"), upgrade electron-builder to >= ${ESCAPES_SINCE}, or (simplest) remove the character.`)
    manifestValue = decode(value)
  }
  if (expected != null && manifestValue !== expected) add(ERROR, `${field}-mismatch`,
    `${field} resolves to "${manifestValue}" in the Store package but Partner Center expects "${expected}".`,
    "Copy the value from Partner Center character for character (reserve a new name first if you want to change it).")
}

// ---------- identity ----------
const identityName = appx.identityName || pkg.name
if (!appx.identityName) add(ERROR, "identity-missing",
  `appx.identityName is not set, so the package uses package.json "name" ("${pkg.name}"). It must be the Package identity name from Partner Center.`,
  "Partner Center → your app → Product management → Product identity → Package/Identity/Name. Paste it exactly.")
else if (expect.identity && appx.identityName !== expect.identity) add(ERROR, "identity-mismatch",
  `appx.identityName is "${appx.identityName}" but Partner Center says "${expect.identity}".`,
  "Paste the value; never retype or 'tidy' it (it can legitimately look misspelled or oddly cased).")
if (identityName && (!/^[A-Za-z0-9.-]{3,50}$/.test(identityName))) add(ERROR, "identity-format",
  `identityName "${identityName}" must be 3-50 characters of letters, digits, "." and "-".`,
  "Use the exact Partner Center value.")

const publisher = appx.publisher
const GUID_CN = /^CN=[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/
if (!publisher) add(ERROR, "publisher-missing",
  "appx.publisher is not set. electron-builder then derives it from your signing certificate (or a placeholder), which will not match your Store account.",
  "Partner Center → Product identity → Package/Identity/Publisher (looks like CN=XXXXXXXX-XXXX-...). Paste it exactly.")
else if (!GUID_CN.test(publisher)) add(ERROR, "publisher-placeholder",
  `appx.publisher is "${publisher}". Store packages use the Partner Center publisher ID, which is "CN=" followed by a GUID.`,
  "Paste Package/Identity/Publisher from Partner Center → Product identity.")
if (expect.publisher && publisher && publisher !== expect.publisher) add(ERROR, "publisher-mismatch",
  `appx.publisher does not match the expected Partner Center value.`, "Paste the exact value.")

const pdn = appx.publisherDisplayName || pkg.author?.name || (typeof pkg.author === "string" ? pkg.author.replace(/\s*[<(].*$/, "") : undefined)
if (!appx.publisherDisplayName) add(WARN, "publisher-display-name-implicit",
  `appx.publisherDisplayName is not set; electron-builder falls back to package.json author ("${pdn ?? "none"}"). It must equal your account's Publisher display name.`,
  "Set appx.publisherDisplayName to Partner Center → Product identity → Package/Properties/PublisherDisplayName.")
checkManifestString("publisherDisplayName", appx.publisherDisplayName, expect.publisherDisplayName)

// ---------- application id ----------
let applicationId = appx.applicationId
if (!applicationId) {
  const n = parseInt(appx.identityName, 10)
  applicationId = !isNaN(n) && appx.identityName ? appx.identityName.replace(String(n), "").replace(/^0/, "") : (appx.identityName || pkg.name)
}
const RESTRICTED = ["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)]
if (applicationId && (!/^([A-Za-z][A-Za-z0-9]*)(\.[A-Za-z][A-Za-z0-9]*)*$/.test(applicationId) || applicationId.length > 64 || RESTRICTED.includes(applicationId.toUpperCase())))
  add(ERROR, "application-id", `Application Id resolves to "${applicationId}", which is invalid (letters/digits, dot-separated segments starting with a letter, no "-").`,
    'Set appx.applicationId explicitly, e.g. "MyApp".')

// ---------- display name ----------
const displayName = appx.displayName || config.productName || pkg.productName || pkg.name
if (!appx.displayName) add(WARN, "display-name-implicit",
  `appx.displayName is not set, so the Store package uses productName ("${displayName}"). Package/Properties/DisplayName must exactly match a name reserved in Partner Center.`,
  "Set appx.displayName to the reserved name. Keep productName short: it names the .exe, installer and install folder.")
checkManifestString("displayName", appx.displayName || displayName, expect.displayName)
if (/[&<>"']/.test(decode(displayName))) {
  const autoLaunch = appx.addAutoLaunchExtension ?? Boolean(pkg.dependencies?.["electron-winstore-auto-launch"])
  if (autoLaunch) add(ERROR, "display-name-startup-task",
    "displayName contains &, <, >, or a quote AND the auto-launch extension is on. electron-builder inserts displayName into the StartupTask element without escaping in every version, so the manifest breaks either way.",
    "Choose a reserved name without these characters, or disable addAutoLaunchExtension.")
  else add(INFO, "display-name-special", "displayName contains a character that needs XML escaping. Avoiding &, <, >, and quotes in Store names removes this whole class of bugs.")
}

// description (package.json) goes into the manifest too
if (pkg.description && builderEscapes !== true && (RAW_AMP.test(pkg.description) || /[<>"]/.test(pkg.description)))
  add(ERROR, "description-unescaped",
    `package.json "description" contains &, <, > or " and electron-builder ${builderVersion || "(unknown)"} writes it into AppxManifest.xml (Description element and attribute) without escaping.`,
    `Remove those characters from the description or upgrade electron-builder to >= ${ESCAPES_SINCE}.`)

// ---------- version ----------
const ver = String(pkg.version || "")
const [maj, min, pat] = ver.split(".").map(v => parseInt(v, 10))
if (isNaN(maj)) add(ERROR, "version-invalid", `package.json version "${ver}" is not numeric.`, "Use MAJOR.MINOR.PATCH.")
else {
  if (maj === 0) add(ERROR, "version-major-zero", `Version ${ver} becomes ${maj}.${min || 0}.${pat || 0}.0; the Store rejects a package whose first version part is 0.`, "Bump to 1.0.0 or higher.")
  if ([maj, min, pat].some(n => n > 65535)) add(ERROR, "version-range", "Each version part must be <= 65535.", "Lower the offending part.")
}
if (appx.setBuildNumber === true) add(ERROR, "revision-nonzero",
  "appx.setBuildNumber is true: electron-builder puts buildNumber (or BUILD_NUMBER / CI build env vars) into the 4th version part. The Store requires the 4th part to be 0 and rejects the upload.",
  "Remove appx.setBuildNumber; bump package.json version for every Store submission instead.")
if (/-/.test(ver)) add(WARN, "version-prerelease", `Version "${ver}" has a pre-release suffix; it is dropped in the 4-part Store version, so two builds can collide.`,
  "Use a plain MAJOR.MINOR.PATCH for Store builds and bump it each submission.")

// ---------- background color ----------
if (!appx.backgroundColor) add(WARN, "background-default", 'appx.backgroundColor is not set; tiles get electron-builder\'s default grey (#464646).',
  "Set it to the color your tile images are padded with.")

// ---------- assets ----------
const resDir = path.join(projectDir, config.directories?.buildResources || "build")
const assetDir = path.join(resDir, "appx")
const REQUIRED = { StoreLogo: [50, 50], Square150x150Logo: [150, 150], Square44x44Logo: [44, 44], Wide310x150Logo: [310, 150] }
const OPTIONAL = { LargeTile: [310, 310], SmallTile: [71, 71], SplashScreen: [620, 300], BadgeLogo: [24, 24] }
const MISNAMED = { Square310x310Logo: "LargeTile", Square71x71Logo: "SmallTile" }
let files = []
if (fs.existsSync(assetDir)) files = fs.readdirSync(assetDir).filter(f => !f.startsWith(".") && !f.endsWith(".db") && f.includes("."))
const rel = path.relative(projectDir, assetDir) || assetDir
if (files.length === 0) add(ERROR, "assets-none",
  `No files in ${rel}/. electron-builder silently packs its own SAMPLE placeholder images as your Store logo and tiles.`,
  `Create ${rel}/ with StoreLogo.png (50x50), Square44x44Logo.png, Square150x150Logo.png, Wide310x150Logo.png (310x150).`)
else {
  for (const name of Object.keys(REQUIRED)) if (!files.some(f => f.includes(name)))
    add(ERROR, "asset-missing", `${rel}/${name}.png is missing; electron-builder substitutes its SAMPLE placeholder image.`, `Add ${name}.png (${REQUIRED[name].join("x")}).`)
  for (const [wrong, right] of Object.entries(MISNAMED)) for (const f of files.filter(f => f.startsWith(wrong)))
    add(WARN, "asset-misnamed", `${rel}/${f} is never referenced by electron-builder's manifest (it only wires up ${right}.png).`, `Rename to ${f.replace(wrong, right)}.`)
}
function pngSize(file) {
  try {
    const b = fs.readFileSync(file)
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
    return [b.readUInt32BE(16), b.readUInt32BE(20)]
  } catch { return null }
}
for (const [name, want] of Object.entries({ ...REQUIRED, ...OPTIONAL })) {
  const f = files.find(x => x === `${name}.png`)
  if (!f) continue
  const got = pngSize(path.join(assetDir, f))
  if (!got) add(WARN, "asset-not-png", `${rel}/${f} is not a readable PNG.`, "Export a real PNG.")
  else if (got[0] !== want[0] || got[1] !== want[1]) add(WARN, "asset-size",
    `${rel}/${f} is ${got.join("x")}, expected ${want.join("x")} for the unscaled asset.`, "Regenerate it at the expected size (or add .scale-XXX variants).")
}

// ---------- runtime: own updater in a Store build ----------
function* walk(dir, depth = 0) {
  if (depth > 8 || !fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "out", "build", "release", ".git", "coverage"].includes(e.name) || e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p, depth + 1)
    else if (/\.(c|m)?(j|t)sx?$/.test(e.name)) yield p
  }
}
let usesUpdater = false, gatesStore = false
const updaterFiles = []
for (const f of walk(projectDir)) {
  const s = fs.readFileSync(f, "utf8")
  if (/electron-updater|autoUpdater\.(checkForUpdates|checkForUpdatesAndNotify|downloadUpdate)/.test(s)) { usesUpdater = true; updaterFiles.push(path.relative(projectDir, f)) }
  if (/process\.windowsStore/.test(s)) gatesStore = true
}
if (usesUpdater && !gatesStore) add(WARN, "updater-not-gated",
  `Self-update code found (${updaterFiles.slice(0, 3).join(", ")}) but nothing checks process.windowsStore. In the Store build it will offer a second, non-Store copy; the Store already updates MSIX installs.`,
  "Return early from your update check when process.windowsStore is true, and hide any 'download new version' links there too.")

// ---------- report ----------
const errors = findings.filter(f => f.level === ERROR).length
const warns = findings.filter(f => f.level === WARN).length
const summary = { ok: errors === 0, project: projectDir, config: configSource, electronBuilder: builderVersion,
  builderEscapesManifestStrings: builderEscapes, store: { identityName, publisher: publisher || null, displayName, version: ver }, errors, warnings: warns, findings }
if (asJson) console.log(JSON.stringify(summary, null, 2))
else {
  console.log(`Microsoft Store config check — ${configSource} (electron-builder ${builderVersion || "unknown"})`)
  console.log(`  identity: ${identityName}   publisher: ${publisher || "(unset)"}   displayName: ${displayName}   version: ${ver}`)
  for (const f of findings) {
    const tag = f.level === ERROR ? "ERROR" : f.level === WARN ? "WARN " : "INFO "
    console.log(`\n[${tag}] ${f.code}: ${f.message}${f.fix ? `\n        fix: ${f.fix}` : ""}`)
  }
  console.log(`\n${errors} error(s), ${warns} warning(s). ${errors ? "Fix errors before building the Store package." : "No blocking issues found by this checker."}`)
}
process.exit(errors ? 1 : 0)
