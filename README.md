# TTS Mod Starter Kit

A starter toolkit for creating, editing, and rebuilding **Tabletop Simulator** mods.  
It provides Node.js scripts to **split** a TTS save into structured files and **merge** them back into a `.json` save, with optional live-watch rebuilds.

---

## 📦 Features
- **Split TTS saves** into individual JSON, Lua, and XML files.
- **Merge** all files back into a single `.json` save.
- **Preserve object hierarchy** via `manifest.json`.
- **Global script and UI extraction**.
- **Automatic versioning** when building.
- **Watch mode** to rebuild on file save.
- **Archive old builds** by GameMode.

---

## 📂 Project Structure

```
.
├── src/                  # Extracted mod files (after split)
│   ├── base.json          # Base save data (without ObjectStates/scripts/UI)
│   ├── manifest.json      # Object structure + hierarchy
│   ├── Global/            # Global Lua and UI files
│   └── Contained/         # Nested objects (cards, bags, etc.)
├── src/                  
│   ├── split-tts-save-pro.js # Split script         
│   ├── merge-tts-save-pro.js # Merge script          
│   └── watch-merge.js        # Watch mode for merge               
├── .env                  # Environment configuration
└── package.json
```

---

## ⚙️ Prerequisites
Before you begin, you must install:

1. **Node.js 22+**
2. **pnpm**

⚠️ We recommend using pnpm because this project includes a pnpm-lock.yaml file in the repository.

---

## ⚙️ Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/AndronchykBohdan/tts-mod-starter.git
   cd tts-mod-starter
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Set up `.env`**:
   ```env
   # Path to the TTS save file OR Saves directory
   INPUT_SAVE=''

   # Path to build folder (merge output)
   BUILD_DIR=''

   # Path to archive folder
   ARCHIVE_DIR=''
   ```

---

## 🚀 Commands

### **Split a save into files**
```bash
pnpm run split
```
- Reads `INPUT_SAVE` from `.env` (file or folder).
- If folder → automatically picks the **latest save**.

---

### **Merge files into a save**
```bash
pnpm run merge [version]
```
- Combines all files in `src` into a single `.json` save in `BUILD_DIR`.
- Archives previous builds with the same GameMode into `ARCHIVE_DIR`.

---

### **Watch mode (merge)**
```bash
pnpm run watch:merge
```
- Watches `src` for file changes.
- On save, immediately merges and overwrites a `*_vDEV.json` in `BUILD_DIR`.
- Deletes the dev file when watch stops.

---

## 📄 Example Workflow

1. Save your game in **Tabletop Simulator**.
2. Run:
   ```bash
   npm run split
   ```
   → Your save is now in `src/`.

3. Edit scripts (`.lua`), UI (`.xml`), or object JSON.

4. Merge changes:
   ```bash
   npm run merge v0.0.2
   ```
   → New `.json` save created in `BUILD_DIR`.

5. In TTS, load the merged save to see changes.

---

## 🛠 Notes
- **File names**:  
  If both `Nickname` and `Name` exist → file name is `Nickname.Name_GUID.json`.  
  If only `Name` → `Name_GUID.json`.
- **Global scripts/UI** are in `src/Global/`.
- **Nested objects** go in `src/Contained/`.

---
