// modules/lua-bundler.js
const fs = require('fs');
const path = require('path');

/** ===== Require scan ===== */
const REQUIRE_RE =
  /(^|\s)require\s*(?:\(\s*["']([^"']+)["']\s*\)|\s+["']([^"']+)["'])/g;

function findRequireIds(luaCode) {
  const ids = new Set();
  let m;
  while ((m = REQUIRE_RE.exec(luaCode)) !== null) {
    const id = m[2] || m[3];
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

/** ===== luabundle 1.6.0 ===== */
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

/** libDir/<id>.lua | .ttslua */
function resolveModulePath(id, libDir) {
  const parts = id.split('/').filter(Boolean);
  const base = path.join(libDir, ...parts);
  const candidates = [`${base}.lua`, `${base}.ttslua`];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 *
 * @param {string} rootCode  Lua-code (__root)
 * @param {string} who
 * @param {{libDir?: string, debug?: boolean}} opts
 * @returns {string}
 */
function bundleLuaIfNeeded(rootCode, who = 'script', opts = {}) {
  const libDir = opts.libDir || './lib';
  const debug = !!opts.debug;

  if (typeof rootCode !== 'string') {
    console.error(`❌ ${who}: Lua code is not a string`);
    process.exit(1);
  }

  const requires = findRequireIds(rootCode);
  if (requires.length === 0) {
    if (debug) console.log(`ℹ️  No requires in ${who} → bundling skipped`);
    return rootCode;
  }

  if (!fs.existsSync(libDir)) {
    console.error(`❌ ${who}: require(...) found, but LIB_DIR is missing: ${libDir}`);
    console.error(`   Put your modules into ${libDir} (e.g., ${libDir}/util/serpent.lua)`);
    process.exit(1);
  }

  const visited = new Set();
  const modules = []; // { id, code }

  function loadModule(id, chain = []) {
    if (visited.has(id)) return;
    visited.add(id);

    const file = resolveModulePath(id, libDir);
    if (!file) {
      console.error(`❌ ${who}: missing Lua module "${id}" → expected: ${libDir}/${id}.lua or .ttslua`);
      process.exit(1);
    }

    let code;
    try {
      code = fs.readFileSync(file, 'utf-8');
    } catch (e) {
      console.error(`❌ ${who}: failed to read module "${id}" at ${file}`);
      console.error(String(e && e.message ? e.message : e));
      process.exit(1);
    }

    if (!code || !String(code).trim()) {
      console.error(`❌ ${who}: module "${id}" is empty at ${file}`);
      process.exit(1);
    }

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
    out.push(
      `__bundle_register("${m.id}", function(require, _LOADED, __bundle_register, __bundle_modules)
${m.code}
end)`
    );
  }

  out.push(
    `__bundle_register("__root", function(require, _LOADED, __bundle_register, __bundle_modules)
${rootCode}
end)

return __bundle_require("__root")`
  );

  if (debug) console.log(`🧵 ${who}: bundled ${modules.length} module(s) from ${libDir}`);
  return out.join('\n\n');
}

module.exports = {
  REQUIRE_RE,
  findRequireIds,
  bundleLuaIfNeeded,
};