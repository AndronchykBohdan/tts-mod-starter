// split-tts-save-pro.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { unbundleXMLToFiles, isXMLBundled } = require('./modules/xml-bundler');

// Input path from .env (fallback to arg or ./Save.json)
const inputPath = process.env.INPUT_SAVE || process.argv[2] || './Save.json';
const outputDir = './src';
const manifest = [];

// Unicode-safe sanitize: keep letters, numbers, _ - . ; replace others with _
const sanitize = (str) => (str || 'unnamed')
  .replace(/[^\p{L}\p{N}_\-.]/gu, '_')
  .slice(0, 50);

const padIndex = (i) => String(i + 1).padStart(3, '0');

/**
 * Extract ONLY the body of the bundled __root module.
 * Handles bundles like:
 *   __bundle_register("__root", function(...) ... end)
 *   package.preload["__root"] = function(...) ... end
 * Supports both LF and CRLF, and the tail "return __bundle_require('__root')".
 * If no bundle is found, returns original lua unchanged.
 */
function extractRootModule(lua) {
  if (!lua) return lua;
  const s = String(lua);

  // 1) luabundle-style: __bundle_register("__root", function(...) ... end)
  // Stop right before the matching 'end)' of that function.
  // Allow what follows to be: another register, package.preload, 'return __bundle_require("__root")', or EOF.
  const reRegister =
    /__bundle_register\(\s*["']__root["']\s*,\s*function\s*\([^)]*\)\s*([\s\S]*?)\bend\)\s*(?=__bundle_register|package\.preload|return\s+__bundle_require|\s*$)/i;
  const m1 = s.match(reRegister);
  if (m1 && m1[1]) {
    return tidyLua(m1[1]);
  }

  // 2) preload-style: package.preload["__root"] = function(...) ... end
  const rePreload =
    /package\.preload\[\s*["']__root["']\s*\]\s*=\s*function\s*\([^)]*\)\s*([\s\S]*?)\bend\b/;
  const m2 = s.match(rePreload);
  if (m2 && m2[1]) {
    return tidyLua(m2[1]);
  }

  // Fallback: leave as-is
  return s;
}

// collapse excessive blank lines, trim
function tidyLua(s) {
  return String(s)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '')
    .trimEnd();
}

function cleanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const file of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, file);
    const st = fs.statSync(fullPath);
    if (st.isDirectory()) {
      cleanDirectory(fullPath);
      fs.rmdirSync(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}

function generateFilename(obj, order = null, includeNickname = false) {
  const guid = sanitize(obj.GUID || 'noguid');
  let base = 'Unnamed';

  if (includeNickname && obj.Nickname && obj.Name) {
    base = sanitize(`${obj.Nickname}.${obj.Name}`);
  } else if (obj.Name) {
    base = sanitize(obj.Name);
  }

  const orderPrefix = (typeof order === 'number') ? `${padIndex(order)}_` : '';
  return `${orderPrefix}${base}_${guid}.json`;
}

function generateParentKey(obj) {
  const nickname = sanitize(obj.Nickname);
  const guid = sanitize(obj.GUID || 'noguid');
  return `${nickname}_${guid}`;
}

// стало: includeNicknameOnFilename — true для топ-левела, false для всех детей
function saveObjectToFile(obj, relativePath, parentGuid = null, order = null, includeNicknameOnFilename = false) {
  const fileName = generateFilename(obj, order, includeNicknameOnFilename);
  const dirPath = path.join(outputDir, relativePath);
  const jsonPath = path.join(dirPath, fileName);

  fs.mkdirSync(dirPath, { recursive: true });

  const basePathNoExt = jsonPath.replace(/\.json$/i, '');
  if (obj.LuaScript && obj.LuaScript.trim()) {
    const cleaned = extractRootModule(obj.LuaScript);
    fs.writeFileSync(basePathNoExt + '.lua', cleaned, 'utf-8');
  }
  if (obj.LuaScriptState && obj.LuaScriptState.trim()) {
    fs.writeFileSync(basePathNoExt + '.state.txt', obj.LuaScriptState, 'utf-8');
  }
  if (obj.XmlUI && obj.XmlUI.trim()) {
    fs.writeFileSync(basePathNoExt + '.xml', obj.XmlUI, 'utf-8');
  }
  if (obj.Memo && obj.Memo.trim()) {
    fs.writeFileSync(basePathNoExt + '.memo.txt', obj.Memo, 'utf-8');
  }

  const objToWrite = { ...obj };
  delete objToWrite.LuaScript;
  delete objToWrite.LuaScriptState;
  delete objToWrite.XmlUI;
  delete objToWrite.Memo;
  fs.writeFileSync(jsonPath, JSON.stringify(objToWrite, null, 2), 'utf-8');

  manifest.push({
    type: obj.Name || 'Object',
    nickname: obj.Nickname || null,
    guid: obj.GUID || null,
    file: path.join(relativePath, fileName),
    parent: parentGuid || null,        // parent — GUID (как мы уже чинили)
    order: (typeof order === 'number') ? order : null,
  });

  if (Array.isArray(obj.ContainedObjects) && obj.ContainedObjects.length) {
    const containerRelPath = path.join('Contained', `${sanitize(obj.Nickname)}_${sanitize(obj.GUID || 'noguid')}`);
    obj.ContainedObjects.forEach((child, index) =>
      // для детей includeNicknameOnFilename = false
      saveObjectToFile(child, containerRelPath, obj.GUID || null, index, false)
    );
  }
}

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`🧹 Cleaning output folder: ${outputDir}`);
  fs.mkdirSync(outputDir, { recursive: true });
  cleanDirectory(outputDir);

  const raw = fs.readFileSync(inputPath, 'utf-8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data.ObjectStates)) {
    console.error('❌ Save file does not contain ObjectStates array!');
    process.exit(1);
  }

  // Split top-level objects with order
  data.ObjectStates.forEach((obj, index) => saveObjectToFile(obj, '.', null, index, true));

  // Export Global scripts/UI and strip them from base
  const globalDir = path.join(outputDir, 'Global');
  fs.mkdirSync(globalDir, { recursive: true });

  if (data.LuaScript && data.LuaScript.trim()) {
    const cleanedGlobal = extractRootModule(data.LuaScript);
    fs.writeFileSync(path.join(globalDir, 'Global.lua'), cleanedGlobal, 'utf-8');
  }

  if (data.LuaScriptState && data.LuaScriptState.trim()) {
    fs.writeFileSync(path.join(globalDir, 'Global.state.txt'), data.LuaScriptState, 'utf-8');
  }

  // Smart XML processing with unbundling support
  if (data.XmlUI && data.XmlUI.trim()) {
    if (isXMLBundled(data.XmlUI)) {
      // Bundled XML → split into modules
      try {
        const xmlFiles = unbundleXMLToFiles(data.XmlUI, globalDir);
        console.log(`🎨 XML unbundled: ${xmlFiles.length} files (${xmlFiles.join(', ')})`);
      } catch (err) {
        console.error(`❌ Error unbundling XML: ${err.message}`);
        // Fallback: save as simple XML
        fs.writeFileSync(path.join(globalDir, 'UI.xml'), data.XmlUI, 'utf-8');
        console.log('🎨 XML saved as fallback UI.xml due to unbundling error');
      }
    } else {
      // Simple XML → save as is
      fs.writeFileSync(path.join(globalDir, 'UI.xml'), data.XmlUI, 'utf-8');
      console.log('🎨 Simple XML saved as UI.xml');
    }
  }

  const { ObjectStates, LuaScript, LuaScriptState, XmlUI, ...base } = data;
  fs.writeFileSync(path.join(outputDir, 'base.json'), JSON.stringify(base, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`✅ Successfully split ${manifest.length} objects.`);
  console.log(`📤 Output saved in: ${outputDir}`);
  console.log('🧹 Lua cleaned: extracted only __root body (handles return __bundle_require("__root")).');
  console.log(`🔎 Global extracted: ${[
    !!data.LuaScript && 'Lua',
    !!data.LuaScriptState && 'State',
    !!data.XmlUI && 'UI'
  ].filter(Boolean).join(', ') || 'none'}`);
  console.log('🔢 Order preserved: files prefixed with numbers (001_, 002_, etc.)');
}

main();