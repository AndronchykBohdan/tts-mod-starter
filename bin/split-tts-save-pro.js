// split-tts-save-pro.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Input path from .env (fallback to arg or ./Save.json)
const inputPath = process.env.INPUT_SAVE || process.argv[2] || './Save.json';
const outputDir = './src';
const manifest = [];

// Unicode-safe sanitize: keep letters, numbers, _ - . ; replace others with _
const sanitize = (str) => (str || 'unnamed')
  .replace(/[^\p{L}\p{N}_\-.]/gu, '_')
  .slice(0, 50);

function cleanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const file of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      cleanDirectory(fullPath);
      fs.rmdirSync(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}

function generateFilename(obj) {
  const guid = sanitize(obj.GUID || 'noguid');
  let prefix = 'Unnamed';
  if (obj.Nickname && obj.Name) {
    prefix = sanitize(`${obj.Nickname}.${obj.Name}`);
  } else if (obj.Name) {
    prefix = sanitize(obj.Name);
  }
  return `${prefix}_${guid}.json`;
}

function generateParentKey(obj) {
  const nickname = sanitize(obj.Nickname);
  const guid = sanitize(obj.GUID || 'noguid');
  return `${nickname}_${guid}`;
}

function saveObjectToFile(obj, relativePath, parentKey = '') {
  const fileName = generateFilename(obj);
  const dirPath = path.join(outputDir, relativePath);
  const jsonPath = path.join(dirPath, fileName);

  fs.mkdirSync(dirPath, { recursive: true });

  // Extract scripts to sibling files; strip from JSON-on-disk
  const basePathNoExt = jsonPath.replace(/\.json$/i, '');
  if (obj.LuaScript && obj.LuaScript.trim()) {
    fs.writeFileSync(basePathNoExt + '.lua', obj.LuaScript, 'utf-8');
  }
  if (obj.LuaScriptState && obj.LuaScriptState.trim()) {
    fs.writeFileSync(basePathNoExt + '.state.txt', obj.LuaScriptState, 'utf-8');
  }

  const objToWrite = { ...obj };
  delete objToWrite.LuaScript;
  delete objToWrite.LuaScriptState;
  fs.writeFileSync(jsonPath, JSON.stringify(objToWrite, null, 2), 'utf-8');

  // Add to manifest
  manifest.push({
    type: obj.Name || 'Object',
    nickname: obj.Nickname || null,
    guid: obj.GUID || null,
    file: path.join(relativePath, fileName),
    parent: parentKey || null,
  });

  // Recurse contained
  if (Array.isArray(obj.ContainedObjects) && obj.ContainedObjects.length) {
    const containerRelPath = path.join('Contained', generateParentKey(obj));
    obj.ContainedObjects.forEach(child =>
      saveObjectToFile(child, containerRelPath, generateParentKey(obj))
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

  // Split top-level objects
  data.ObjectStates.forEach(obj => saveObjectToFile(obj, '.'));

  // Export Global scripts/UI and strip them from base
  const globalDir = path.join(outputDir, 'Global');
  fs.mkdirSync(globalDir, { recursive: true });
  if (data.LuaScript && data.LuaScript.trim()) {
    fs.writeFileSync(path.join(globalDir, 'Global.lua'), data.LuaScript, 'utf-8');
  }
  if (data.LuaScriptState && data.LuaScriptState.trim()) {
    fs.writeFileSync(path.join(globalDir, 'Global.state.txt'), data.LuaScriptState, 'utf-8');
  }
  if (data.XmlUI && data.XmlUI.trim()) {
    fs.writeFileSync(path.join(globalDir, 'UI.xml'), data.XmlUI, 'utf-8');
  }

  const { ObjectStates, LuaScript, LuaScriptState, XmlUI, ...base } = data;
  fs.writeFileSync(path.join(outputDir, 'base.json'), JSON.stringify(base, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`✅ Successfully split ${manifest.length} objects.`);
  console.log(`📤 Output saved in: ${outputDir}`);
  console.log(`🔎 Global extracted: ${[
    !!data.LuaScript && 'Lua',
    !!data.LuaScriptState && 'State',
    !!data.XmlUI && 'UI'
  ].filter(Boolean).join(', ') || 'none'}`);
}

main();
