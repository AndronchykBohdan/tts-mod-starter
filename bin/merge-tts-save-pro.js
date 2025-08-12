// merge-tts-save-pro.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { bundleXML } = require('./modules/xml-bundler');

const srcDir = process.env.SRC_DIR || './src';
const buildDir = process.env.BUILD_DIR || './build';
const archiveDir = process.env.ARCHIVE_DIR || './archive';
const manifestPath = path.join(srcDir, 'manifest.json');

// Lua modules dir (always on)
const LIB_DIR = './lib';

// Detect CI
const isCI = String(process.env.CI).toLowerCase() === 'true'
  || String(process.env.GITHUB_ACTIONS).toLowerCase() === 'true';

// CLI args
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.findIndex(a => a === name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const customVersion = getArg('--version');
const debug = args.includes('--debug');

if (!customVersion) {
  console.error('❌ Please provide --version (e.g. --version v0.5.0)');
  process.exit(1);
}

/** Unicode-safe, cross-platform file-name sanitizer */
function sanitizeFileNameStrict(input, fallback = 'TTS_Save') {
  let s = String(input ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_\-.]/gu, '_');

  s = s.replace(/_+/g, '_').replace(/\.{2,}/g, '.');
  s = s.replace(/^[\s._]+/, '').replace(/[\s._]+$/, '');
  if (!s || s === '.' || s === '..') s = fallback;

  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(s)) s = '_' + s;

  if (s.length > 50) s = s.slice(0, 50);
  if (!s) s = fallback;
  return s;
}

const getTimestamp = () =>
  new Date().toISOString().replace(/[:]/g, '-').split('.')[0];

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    console.error(`❌ Invalid JSON: ${filePath}`);
    process.exit(1);
  }
}

// Validate presence and (optional) GUID match
function fileExistsStrict(entry) {
  const fullPath = path.join(srcDir, entry.file);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing file for entry: ${entry.type} "${entry.nickname}" (${entry.guid})`);
    console.error(`Expected path: ${fullPath}`);
    process.exit(1);
  }
  try {
    const json = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    if (entry.guid && json.GUID && entry.guid !== json.GUID) {
      console.error(`❌ GUID mismatch: manifest(${entry.guid}) != file(${json.GUID}) at ${entry.file}`);
      process.exit(1);
    }
  } catch {
    console.error(`❌ Invalid JSON: ${fullPath}`);
    process.exit(1);
  }
}

/** Stable sort by .order (keeps insertion order when equal/undefined) */
function sortByOrderStable(arr) {
  return arr.slice().sort((a, b) => {
    const ao = (typeof a.order === 'number') ? a.order : Number.POSITIVE_INFINITY;
    const bo = (typeof b.order === 'number') ? b.order : Number.POSITIVE_INFINITY;
    return ao - bo;
  });
}

/* ======================= luabundle‑style bundler (exact 1.6.0 format) ======================= */

function readText(file) { return fs.readFileSync(file, 'utf-8'); }

// require("id") or require 'id'
const REQUIRE_RE = /(^|\s)require\s*(?:\(\s*["']([^"']+)["']\s*\)|\s+["']([^"']+)["'])/g;

function findRequireIds(luaCode) {
  const ids = new Set();
  let m;
  while ((m = REQUIRE_RE.exec(luaCode)) !== null) {
    const id = m[2] || m[3];
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

function resolveModulePath(id) {
  const parts = id.split('/').filter(Boolean);
  const base = path.join(LIB_DIR, ...parts);
  const candidates = [`${base}.lua`, `${base}.ttslua`];
  for (const file of candidates) if (fs.existsSync(file)) return file;
  return null;
}

// emit exact luabundle 1.6.0 header
function emitLuabundleHeader() {
  return `-- Bundled by luabundle {"version":"1.6.0"}
local __bundle_require, __bundle_loaded, __bundle_register, __bundle_modules = (function(superRequire)
\tlocal loadingPlaceholder = {[{}] = true}

\tlocal register
\tlocal modules = {}

\tlocal require
\tlocal loaded = {}

\tregister = function(name, body)
\t\tif not modules[name] then
\t\t\tmodules[name] = body
\t\tend
\tend

\trequire = function(name)
\t\tlocal loadedModule = loaded[name]

\t\tif loadedModule then
\t\t\tif loadedModule == loadingPlaceholder then
\t\t\t\treturn nil
\t\t\tend
\t\telse
\t\t\tif not modules[name] then
\t\t\t\tif not superRequire then
\t\t\t\t\tlocal identifier = type(name) == 'string' and '\"' .. name .. '\"' or tostring(name)
\t\t\t\t\terror('Tried to require ' .. identifier .. ', but no such module has been registered')
\t\t\t\telse
\t\t\t\t\treturn superRequire(name)
\t\t\t\tend
\t\t\tend

\t\t\tloaded[name] = loadingPlaceholder
\t\t\tloadedModule = modules[name](require, loaded, register, modules)
\t\t\tloaded[name] = loadedModule
\t\tend

\t\treturn loadedModule
\tend

\treturn require, loaded, register, modules
end)(nil)`;
}

function bundleLuaIfNeeded(rootCode, who = 'script') {
  const requires = findRequireIds(rootCode);
  if (requires.length === 0) {
    // no require → return code unchanged, без рантайма и без return __bundle_require
    if (debug) console.log(`ℹ️  No requires in ${who} → bundling skipped`);
    return rootCode;
  }

  if (!fs.existsSync(LIB_DIR)) {
    console.error(`❌ Lua requires detected in ${who}, but LIB_DIR not found: ${LIB_DIR}`);
    console.error(`   Put your modules into ${LIB_DIR} (e.g., ${LIB_DIR}/util/serpent.lua)`);
    process.exit(1);
  }

  const visited = new Set();
  const modules = []; // { id, code }

  function loadModule(id, chain = []) {
    if (visited.has(id)) return;
    visited.add(id);

    const file = resolveModulePath(id);
    if (!file) {
      console.error(`❌ Missing Lua module "${id}" → expected: ${LIB_DIR}/${id}.lua or .ttslua`);
      process.exit(1);
    }
    const code = readText(file);

    for (const sub of findRequireIds(code)) {
      if (chain.includes(sub)) {
        console.warn(`⚠️  Circular require: ${[...chain, sub].join(' -> ')}`);
        continue;
      }
      loadModule(sub, [...chain, id]);
    }

    modules.push({ id, code });
  }

  for (const id of requires) loadModule(id, ['__root']);

  const out = [];
  out.push(emitLuabundleHeader());

  for (const m of modules) {
    out.push(`__bundle_register("${m.id}", function(require, _LOADED, __bundle_register, __bundle_modules)
${m.code}
end)`);
  }

  out.push(`__bundle_register("__root", function(require, _LOADED, __bundle_register, __bundle_modules)
${rootCode}
end)

return __bundle_require("__root")`);

  if (debug) console.log(`🧵 Bundled ${modules.length} module(s) from ${LIB_DIR} for ${who}`);
  return out.join('\n\n');
}

/* ======================= END bundler ======================= */

function readObjectLuaIfExists(jsonPath) {
  const base = jsonPath.replace(/\.json$/i, '');
  const candidates = [`${base}.lua`, `${base}.ttslua`];
  for (const p of candidates) if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  return null;
}

// Children by parent GUID (order-preserving)
function loadObjectFromManifest(entry, manifestMap) {
  const jsonPath = path.join(srcDir, entry.file);
  const obj = readJSON(jsonPath);

  const rawCode = readObjectLuaIfExists(jsonPath);
  const statePath = jsonPath.replace(/\.json$/i, '.state.txt');
  const xmlPath = jsonPath.replace(/\.json$/i, '.xml');
  const memoPath = jsonPath.replace(/\.json$/i, '.memo.txt');

  if (rawCode != null) {
    obj.LuaScript = bundleLuaIfNeeded(rawCode, `object:${entry.guid || 'noguid'}`);
  }
  if (fs.existsSync(statePath)) obj.LuaScriptState = fs.readFileSync(statePath, 'utf-8');
  if (fs.existsSync(xmlPath)) obj.XmlUI = fs.readFileSync(xmlPath, 'utf-8');
  if (fs.existsSync(memoPath)) obj.Memo = fs.readFileSync(memoPath, 'utf-8');

  const rawChildren = manifestMap[entry.guid] || [];
  const children = sortByOrderStable(rawChildren);
  if (children.length > 0) {
    obj.ContainedObjects = children.map(child =>
      loadObjectFromManifest(child, manifestMap)
    );
  }
  return obj;
}

function archivePreviousBuilds(currentGameMode) {
  if (!fs.existsSync(buildDir)) return;
  fs.readdirSync(buildDir)
    .filter(file => file.endsWith('.json'))
    .forEach(file => {
      const fullPath = path.join(buildDir, file);
      const content = readJSON(fullPath);
      if (content.GameMode === currentGameMode) {
        fs.mkdirSync(archiveDir, { recursive: true });
        const archivedFile = path.join(
          archiveDir,
          path.basename(file, '.json') + '_' + getTimestamp() + '.json'
        );
        fs.renameSync(fullPath, archivedFile);
        console.log(`📦 Archived: ${file} → ${archivedFile}`);
      }
    });
}

function validateModStructure(mod) {
  const errors = [];
  const warnings = [];
  const seenGuids = new Set();

  if (!Array.isArray(mod.ObjectStates) || mod.ObjectStates.length === 0) {
    errors.push('Mod must contain non-empty ObjectStates array.');
  }
  if (!mod.SaveName || typeof mod.SaveName !== 'string') {
    errors.push('SaveName is missing or invalid.');
  }
  if (!mod.GameMode || typeof mod.GameMode !== 'string') {
    errors.push('GameMode is missing or invalid.');
  }

  mod.ObjectStates?.forEach((obj, i) => {
    const p = `ObjectStates[${i}]`;
    if (!obj.GUID) errors.push(`${p} is missing GUID.`);
    if (!obj.Name) errors.push(`${p} is missing Name.`);
    if (!obj.Transform) errors.push(`${p} is missing Transform.`);

    if (!obj.Nickname) {
      const guid = obj.GUID || 'N/A';
      const name = obj.Name || 'N/A';
      const pos = obj.Transform?.posX !== undefined
        ? `at position (${obj.Transform.posX}, ${obj.Transform.posY}, ${obj.Transform.posZ})`
        : '(position unknown)';
      warnings.push(`${p} is missing Nickname → GUID: ${guid}, Name: ${name} ${pos}`);
    }

    if (obj.GUID) {
      if (seenGuids.has(obj.GUID)) errors.push(`${p} has duplicate GUID: ${obj.GUID}`);
      else seenGuids.add(obj.GUID);
    }
  });

  if (errors.length > 0) {
    console.error('\n❌ Validation failed:');
    errors.forEach(e => console.error('  • ' + e));
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.warn('\n⚠️  Validation warnings:');
    warnings.forEach(w => console.warn('  • ' + w));
  }
  console.log('✅ Validation passed.');
}

// Robust base name from SaveName -> GameMode -> fallback
function pickBaseName(base, topLevelEntries) {
  const primary =
    (typeof base.SaveName === 'string' && base.SaveName.trim()) ? base.SaveName.trim() :
      (typeof base.GameMode === 'string' && base.GameMode.trim()) ? base.GameMode.trim() :
        (topLevelEntries && topLevelEntries.length
          ? (topLevelEntries[0].nickname || topLevelEntries[0].type || 'TTS_Save')
          : 'TTS_Save');

  return sanitizeFileNameStrict(primary, 'TTS_Save');
}

function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ manifest.json not found in ./src');
    process.exit(1);
  }

  fs.mkdirSync(buildDir, { recursive: true });
  if (!isCI) fs.mkdirSync(archiveDir, { recursive: true });

  const manifest = readJSON(manifestPath);
  const base = readJSON(path.join(srcDir, 'base.json'));

  // Verify manifest files exist and GUIDs match
  manifest.forEach(fileExistsStrict);

  // Group by parent GUID (or __root__) — insertion order preserved
  const manifestMap = {};
  for (const entry of manifest) {
    const key = entry.parent || '__root__';
    if (!manifestMap[key]) manifestMap[key] = [];
    manifestMap[key].push(entry);
  }

  if (debug) {
    const keys = Object.keys(manifestMap);
    console.log(`🧩 Manifest groups: ${keys.length} keys`);
    for (const k of keys) {
      const label = (k === '__root__') ? '__root__' : `parent GUID ${k}`;
      const orders = (manifestMap[k] || []).map(e => (typeof e.order === 'number') ? e.order : null);
      console.log(`  - ${label}: ${manifestMap[k].length} item(s) | order: [${orders.join(', ')}]`);
    }
  }

  // Top-level strictly by .order
  const topLevel = sortByOrderStable(manifestMap['__root__'] || []);
  const objectStates = topLevel.map(entry => loadObjectFromManifest(entry, manifestMap));

  // Compose output filename
  const baseName = pickBaseName(base, topLevel);
  const versionTag = String(customVersion).trim().replace(/^v+/i, '');
  let versionClean = sanitizeFileNameStrict(versionTag, 'dev').replace(/[^A-Za-z0-9._-]/g, '_');

  const saveFileName = `${baseName}_v${versionClean}.json`;
  const outputFile = path.join(buildDir, saveFileName);

  // Assemble final save
  const merged = {
    ...base,
    ObjectStates: objectStates,
    SaveName: (typeof base.SaveName === 'string' && base.SaveName.trim()) ? base.SaveName : baseName,
    GameMode: (typeof base.GameMode === 'string' && base.GameMode.trim()) ? base.GameMode : baseName,
    VersionNumber: customVersion
  };

  // Global Lua & UI — prefer .lua, then .ttslua; bundle only if there are requires
  const globalDir = path.join(srcDir, 'Global');
  const globalLuaCandidates = [path.join(globalDir, 'Global.lua'), path.join(globalDir, 'Global.ttslua')];
  const globalLuaPath = globalLuaCandidates.find(p => fs.existsSync(p));

  if (globalLuaPath) {
    const rawGlobal = fs.readFileSync(globalLuaPath, 'utf-8');
    merged.LuaScript = bundleLuaIfNeeded(rawGlobal, 'Global');
  }

  // Global state
  const globalStateFile = path.join(globalDir, 'Global.state.txt');
  if (fs.existsSync(globalStateFile)) {
    merged.LuaScriptState = fs.readFileSync(globalStateFile, 'utf-8');
  }

  // Smart XML processing with bundling support
  const globalXml = path.join(globalDir, 'UI.xml');
  if (fs.existsSync(globalXml)) {
    const rawXml = fs.readFileSync(globalXml, 'utf-8');

    // Check for <Include> tags
    if (rawXml.includes('<Include src=')) {
      // XML bundling needed
      try {
        const xmlUIDir = path.join(globalDir, 'UI');
        const xmlSourceDir = fs.existsSync(xmlUIDir) ? xmlUIDir : globalDir;
        merged.XmlUI = bundleXML(rawXml, xmlSourceDir);
        if (debug) console.log(`🎨 XML bundled with includes from ${xmlSourceDir}`);
      } catch (err) {
        console.error(`❌ Error bundling XML: ${err.message}`);
        // Fallback: use raw XML
        merged.XmlUI = rawXml;
        console.log('🎨 XML used as fallback due to bundling error');
      }
    } else {
      // Simple XML without includes
      merged.XmlUI = rawXml;
      if (debug) console.log('🎨 Simple XML loaded (no includes found)');
    }
  }

  // Archiving (off in dev/CI)
  const isDevBuild = /^v?dev$/i.test(String(customVersion).trim());
  if (!isDevBuild && !isCI) {
    archivePreviousBuilds(merged.GameMode);
  } else {
    if (isDevBuild) console.log('🧪 Dev build detected → archiving is disabled; file will be overwritten.');
    if (isCI) console.log('🛰️ CI detected → archiving is disabled in CI to keep artifacts clean.');
  }

  validateModStructure(merged);
  fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2), 'utf-8');

  console.log(`✅ Merged ${objectStates.length} objects`);
  console.log(`📁 Output saved to: ${outputFile}`);
  console.log(`📝 GameMode: ${merged.GameMode}`);
  console.log(`🧵 Bundling: luabundle-1.6.0 format (runtime ONLY if require(...) is present)`);
  if (merged.XmlUI) {
    const hasIncludes = merged.XmlUI.includes('<!-- include ');
    console.log(`🎨 XML: ${hasIncludes ? 'bundled with includes' : 'simple format'}`);
  }
  console.log(`🆕 Version: ${customVersion}`);
}

main();