#!/usr/bin/env node
// jsonl-tail.js — chokidar-based JSONL tail with offset tracking, rotation
// awareness, and backpressure. Epic #1339 / #1354. Per R&D Thread 3.
'use strict';

const fs = require('fs');
const chokidar = require('chokidar');

const DEFAULT_MAX_BUFFER = 1000;

function readFromOffset(file, offset) {
  const stat = fs.statSync(file);
  // Rotation/truncate detection: shrunken file resets offset
  let startAt = offset;
  if (stat.size < offset) startAt = 0;
  if (stat.size === startAt) return { content: '', newOffset: startAt };
  const buf = Buffer.alloc(stat.size - startAt);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, buf, 0, buf.length, startAt);
  fs.closeSync(fd);
  return { content: buf.toString('utf-8'), newOffset: stat.size };
}

function parseLines(content, onEvent, onError) {
  const lines = content.split('\n').filter(Boolean);
  for (const line of lines) {
    try { onEvent(JSON.parse(line)); }
    catch (err) { onError({ kind: 'parse', line, error: err.message }); }
  }
}

function bufferAndDrain(state, line) {
  if (state.buffer.length >= state.maxBuffer) {
    state.buffer.shift();
    state.dropped++;
    state.onDrop(state.dropped);
  }
  state.buffer.push(line);
  drainBuffer(state);
}

function drainBuffer(state) {
  if (state.processing) return;
  state.processing = true;
  while (state.buffer.length > 0) {
    const event = state.buffer.shift();
    try { state.onLine(event); }
    catch (err) { state.onError({ kind: 'handler', error: err.message }); }
  }
  state.processing = false;
}

function pumpNewContent(state) {
  if (!fs.existsSync(state.file)) {
    state.offset = 0;
    return;
  }
  try {
    const { content, newOffset } = readFromOffset(state.file, state.offset);
    state.offset = newOffset;
    if (content) parseLines(content, (event) => bufferAndDrain(state, event), state.onError);
  } catch (err) {
    state.onError({ kind: 'io', file: state.file, error: err.message });
  }
}

/**
 * Tail a JSONL file. Calls onLine(event) for each newly appended line.
 * Returns a handle with close()/getOffset()/getDropped()/getBufferDepth().
 */
function tail(file, onLine, opts = {}) {
  const state = {
    file,
    onLine,
    onDrop: opts.onDrop || (() => {}),
    onError: opts.onError || (() => {}),
    maxBuffer: opts.maxBuffer || DEFAULT_MAX_BUFFER,
    offset: fs.existsSync(file) ? fs.statSync(file).size : 0,
    buffer: [],
    processing: false,
    dropped: 0,
  };
  // chokidar handles rotation (unlink + add) better than fs.watch
  const watcher = chokidar.watch(file, { persistent: false, ignoreInitial: true });
  const handle = () => pumpNewContent(state);
  watcher.on('change', handle);
  watcher.on('add', () => { state.offset = 0; handle(); });
  return {
    close: () => watcher.close(),
    getOffset: () => state.offset,
    getDropped: () => state.dropped,
    getBufferDepth: () => state.buffer.length,
  };
}

module.exports = {
  tail, DEFAULT_MAX_BUFFER,
  readFromOffset, parseLines,  // exported for testability
};
