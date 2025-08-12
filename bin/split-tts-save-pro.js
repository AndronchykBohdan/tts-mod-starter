// split-tts-save-pro.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const inputPath = process.env.INPUT_SAVE || process.argv[2] || './Save.json';
const outputDir = './src';
const manifest = [];

// Unicode-safe sanitize (stable across OS)
const sanitize = (str, fallback = 'unnamed') => {
  let s = String(str || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_\-.]/gu, '_');
  s = s.replace(/_+/g, '_').replace(/\.{2,}/g, '.');
  s = s.replace(/^[._]+/, '').replace(/[._]+$/, '');
  if (!s) s = fallback;
  return s.slice(0, 50);
};

const padIndex = (i) => String(i).padStart(3, '0');

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

// Top-level filename: Nickname.Name_GUID.json (if Nickname), else Name_GUID.json
function generateTopLevelFilename(obj) {
  const guid = sanitize(obj.GUID || 'noguid');
  if (obj.Nickname && obj.Name) {
    const nick = sanitize(obj.Nickname);
    const name = sanitize(obj.Name);
    return `${nick}.${name}_${guid}.json`;
  }
  const name = sanitize(obj.Name || 'Object');
  return `${name}_${guid}.json`;
}

// Nested filename (inside Contained): 000_Name_GUID.json
function generateNestedFilename(obj, orderIndex) {
  const name = sanitize(obj.Name || 'Object');
  const guid = sanitize(obj.GUID || 'noguid');
  return `${padIndex(orderIndex)}_${name}_${guid}.json`;
}

// Folder for children: Contained/<NicknameOrName>_<GUID>
function generateContainerRelPath(parentObj) {
  const label = sanitize(parentObj.Nickname || parentObj.Name || 'Object');
  const guid = sanitize(parentObj.GUID || 'noguid');
  return path.join('Contained', `${label}_${guid}`);
}

/**
 * Save object to disk and append to manifest.
 */
function saveObjectToFile(obj, relativePath, parentGuid = null, order = 0) {
  const isTopLevel = relativePath === '.';
  const fileName = isTopLevel
    ? generateTopLevelFilename(obj)
    : generateNestedFilename(obj, order);

  const dirPath = path.join(outputDir, relativePath);
  const jsonPath = path.join(dirPath, fileName);
  fs.mkdirSync(dirPath, { recursive: true });

  // Extract object-level scripts to sibling files; strip from JSON-on-disk
  const basePathNoExt = jsonPath.replace(/\.json$/i, '');
  if (obj.LuaScript && String(obj.LuaScript).trim()) {
    fs.writeFileSync(basePathNoExt + '.lua', obj.LuaScript, 'utf-8');
  }
  if (obj.LuaScriptState && String(obj.LuaScriptState).trim()) {
    fs.writeFileSync(basePathNoExt + '.state.txt', obj.LuaScriptState, 'utf-8');
  }

  const objToWrite = { ...obj };
  delete objToWrite.LuaScript;
  delete objToWrite.LuaScriptState;
  fs.writeFileSync(jsonPath, JSON.stringify(objToWrite, null, 2), 'utf-8');

  // Manifest entry
  manifest.push({
    type: obj.Name || 'Object',
    name: obj.Name || null,
    nickname: obj.Nickname || null,
    guid: obj.GUID || null,
    file: path.join(relativePath, fileName),
    parent: parentGuid,
    order
  });

  // Recurse contained
  if (Array.isArray(obj.ContainedObjects) && obj.ContainedObjects.length) {
    const containerRelPath = generateContainerRelPath(obj);
    for (let i = 0; i < obj.ContainedObjects.length; i++) {
      saveObjectToFile(obj.ContainedObjects[i], containerRelPath, obj.GUID || null, i);
    }
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
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`❌ Invalid JSON: ${inputPath}`);
    process.exit(1);
  }

  if (!Array.isArray(data.ObjectStates)) {
    console.error('❌ Save file does not contain ObjectStates array!');
    process.exit(1);
  }

  // Top-level — без префиксов
  for (let i = 0; i < data.ObjectStates.length; i++) {
    saveObjectToFile(data.ObjectStates[i], '.', null, i);
  }

  // Global scripts/UI
  const globalDir = path.join(outputDir, 'Global');
  fs.mkdirSync(globalDir, { recursive: true });
  if (data.LuaScript && String(data.LuaScript).trim()) {
    fs.writeFileSync(path.join(globalDir, 'Global.lua'), data.LuaScript, 'utf-8');
  }
  if (data.LuaScriptState && String(data.LuaScriptState).trim()) {
    fs.writeFileSync(path.join(globalDir, 'Global.state.txt'), data.LuaScriptState, 'utf-8');
  }
  if (data.XmlUI && String(data.XmlUI).trim()) {
    fs.writeFileSync(path.join(globalDir, 'UI.xml'), data.XmlUI, 'utf-8');
  }

  const { ObjectStates, LuaScript, LuaScriptState, XmlUI, ...base } = data;
  fs.writeFileSync(path.join(outputDir, 'base.json'), JSON.stringify(base, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`✅ Successfully split ${manifest.length} objects.`);
  console.log(`📤 Output saved in: ${outputDir}`);
  console.log(`🔢 Numeric prefixes: children only`);
  console.log(`🔎 Global extracted: ${[
    !!data.LuaScript && 'Lua',
    !!data.LuaScriptState && 'State',
    !!data.XmlUI && 'UI'
  ].filter(Boolean).join(', ') || 'none'}`);
}

main();