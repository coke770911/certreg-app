'use strict';

/**
 * 版本號遞增 (每次 push 到 GitHub 前執行一次)
 *
 * 用法：
 *   npm run version:bump              遞增並寫入
 *   npm run version:bump -- --dry-run 只顯示下一個版本，不寫入
 *
 * 規則 (x.y.z)：z 每次 +1；z 超過 30 時歸零、y +1；y 超過 20 時歸零、x +1。
 *   例：0.1.29 → 0.1.30 → 0.2.0；0.20.30 → 1.0.0
 *
 * 會同步更新根目錄、backend、frontend 的 package.json 與 package-lock.json，
 * 以及 README.md 開頭的「目前版本」。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MAX_Z = 30;
const MAX_Y = 20;
const PACKAGE_DIRS = ['.', 'backend', 'frontend'];
const README_VERSION = /^(> 目前版本：)`[^`]*`/m;

function nextVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error(`版本號格式錯誤：「${version}」，應為 x.y.z`);
  let [x, y, z] = match.slice(1).map(Number);
  z += 1;
  if (z > MAX_Z) {
    z = 0;
    y += 1;
  }
  if (y > MAX_Y) {
    y = 0;
    x += 1;
  }
  return `${x}.${y}.${z}`;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const current = readJson(path.join(ROOT, 'package.json')).version;

  // 三份 package.json 版本必須一致，避免遞增到錯誤的基準
  for (const dir of PACKAGE_DIRS) {
    const v = readJson(path.join(ROOT, dir, 'package.json')).version;
    if (v !== current) throw new Error(`${dir}/package.json 版本 ${v} 與根目錄 ${current} 不一致，請先手動統一`);
  }

  const next = nextVersion(current);
  console.log(`版本：${current} → ${next}${dryRun ? ' (預覽，未寫入)' : ''}`);
  if (dryRun) return;

  for (const dir of PACKAGE_DIRS) {
    const pkgFile = path.join(ROOT, dir, 'package.json');
    writeJson(pkgFile, { ...readJson(pkgFile), version: next });

    const lockFile = path.join(ROOT, dir, 'package-lock.json');
    if (fs.existsSync(lockFile)) {
      const lock = readJson(lockFile);
      lock.version = next;
      if (lock.packages?.['']) lock.packages[''].version = next;
      writeJson(lockFile, lock);
    }
  }

  const readmeFile = path.join(ROOT, 'README.md');
  const readme = fs.readFileSync(readmeFile, 'utf8');
  if (README_VERSION.test(readme)) {
    fs.writeFileSync(readmeFile, readme.replace(README_VERSION, `$1\`${next}\``));
  } else {
    console.warn('README.md 找不到「> 目前版本：`x.y.z`」，請手動補上');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { nextVersion };
