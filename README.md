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
├── bin/                  
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

## ⚡ How to Use This Starter

### If you want to **contribute to the template itself** (update/improve the starter)
Use **git clone** (you will keep the original Git history and remote):
```bash
git clone https://github.com/<your-username>/tts-mod-starter.git
cd tts-mod-starter
pnpm install
```

---

### If you want to **build your own mod** (recommended)
Prefer **Use this template** or **degit** so you don’t keep the original Git remote/history.

#### Option A — GitHub “Use this template”
1. Go to the template repo page on GitHub.
2. Click **Use this template** → **Create a new repository**.
3. Choose a name, create the repo, then:
   ```bash
   git clone https://github.com/<your-username>/<your-mod>.git
   cd <your-mod>
   pnpm install
   ```

#### Option B — `degit` (clean copy, no Git history)
Use this if you want a **completely clean** project folder with **no Git history** and **no remote**. Perfect for starting a new mod repo.

1) Generate a fresh copy:
```bash
# Node 22+ required
npx degit <your-username>/tts-mod-starter <your-mod>
cd <your-mod>
```

2) Initialize your own Git:
```bash
git init
git add .
git commit -m "init from template"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-mod>.git
git push -u origin main
```

3) Install deps:
```bash
pnpm install
```

That’s it — you now own a clean repo with no link to the original starter.

> Tip: avoid `git clone` for your mod, otherwise `origin` will point to the starter repo and you’ll need to run `git remote set-url origin ...` to fix it.

---

## 🛠 Environment

Create `.env` (or copy from `.env.example`):
```env
# Path to the TTS save file OR the TTS Saves directory
INPUT_SAVE=''

# Where merged saves are written
BUILD_DIR=''

# Where old builds are archived
ARCHIVE_DIR=''
```

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
pnpm run watch
```
- Watches `src` for file changes.
- On save, immediately merges and overwrites a `*_vDEV.json` in `BUILD_DIR`.
- Deletes the dev file when watch stops.

---

## 📄 Example Workflow

1. Save your game in **Tabletop Simulator**.
2. Run:
   ```bash
   pnpm run split
   ```
   → Your save is now in `src/`.

3. Edit scripts (`.lua`), UI (`.xml`), or object JSON.

4. Merge changes:
   ```bash
   pnpm run merge v0.0.2
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
