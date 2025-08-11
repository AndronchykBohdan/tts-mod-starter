require('dotenv').config();
const chokidar = require('chokidar');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const srcDir = './src';
const buildDir = process.env.BUILD_DIR || './build';
const version = 'vDEV';
let devFilePath = null;

let running = false;
let pending = false;

function runMergeImmediate() {
  if (running) { pending = true; return; }

  running = true;
  console.log(`\n🔁 Change detected. Rebuilding immediately (version=${version}) ...`);

  const child = spawn(
    process.execPath,
    [path.resolve('./bin/merge-tts-save-pro.js'), '--version', version],
    { stdio: 'inherit' }
  );

  child.on('close', (code) => {
    running = false;
    if (code === 0) {
      console.log('✅ Rebuild complete.');
      devFilePath = findDevFile(buildDir);
    } else {
      console.error(`❌ Merge exited with code ${code}`);
    }

    if (pending) {
      pending = false;
      runMergeImmediate();
    }
  });
}

function findDevFile(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().includes('_vdev') && f.endsWith('.json'));
  return files.length ? path.join(dir, files[0]) : null;
}

function cleanup() {
  if (devFilePath && fs.existsSync(devFilePath)) {
    fs.unlinkSync(devFilePath);
    console.log(`🗑️ Deleted dev file: ${devFilePath}`);
  }
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

console.log(`👀 Watching ${srcDir} (version=${version}) ...`);
chokidar
  .watch(srcDir, {
    ignoreInitial: true,
    ignored: ['**/Global.lua.tmp', '**/*.swp', '**/.DS_Store']
  })
  .on('all', () => runMergeImmediate());
