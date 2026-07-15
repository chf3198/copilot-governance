'use strict';
// Shared atomic JSON read/write + directory lock (#3033 C5 AC1).
const fs = require('fs');
const path = require('path');

const TMP = '.tmp';
const LOCK = '.lock';
const WAIT_MS = 2;
const STALE_MS = 5000;
const LOCK_TIMEOUT_MS = Number(process.env.ATOMIC_LOCK_TIMEOUT_MS || 3000);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readJson(file, fallback = () => ({})) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return typeof fallback === 'function' ? fallback() : fallback; }
}

function writeJsonAtomic(data, file) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}${TMP}.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function withFileLock(file, fn, opts = {}) {
  const lock = file + LOCK;
  const deadline = Date.now() + (opts.timeoutMs || LOCK_TIMEOUT_MS);
  while (true) {
    try { fs.mkdirSync(lock); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() > deadline) {
        throw new Error(`atomic-json-store: lock timeout on ${file}`);
      }
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > STALE_MS) fs.rmSync(lock, { recursive: true, force: true });
      } catch {}
      sleep(WAIT_MS);
    }
  }
  try { return fn(); }
  finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

function mutateJson(file, mutator, fallback) {
  return withFileLock(file, () => {
    const data = readJson(file, fallback);
    const out = mutator(data);
    writeJsonAtomic(data, file);
    return out;
  });
}

module.exports = { readJson, writeJsonAtomic, withFileLock, mutateJson };
