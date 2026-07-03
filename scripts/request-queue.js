#!/usr/bin/env node
'use strict';
// Priority request queue with RPS throttle and adaptive processing.

const PRIORITY_ORDER = { urgent: 0, normal: 1, low: 2 };
const MAX_SIZE = 500;

class RequestQueue {
  constructor() {
    this._queue = [];
    this._rps = 5;
    this._stats = { enqueued: 0, processed: 0, failed: 0, dropped: 0 };
    this._timer = null;
  }

  /**
   * Add a task function to the queue.
   * @param {Function} task      Async function returning a result.
   * @param {string}   priority  'urgent' | 'normal' | 'low'
   * @returns {Promise<*>}       Resolves/rejects when the task runs.
   */
  enqueue(task, priority = 'normal') {
    if (this._queue.length >= MAX_SIZE) {
      this._stats.dropped++;
      return Promise.reject(new Error('request_queue_full'));
    }
    const order = PRIORITY_ORDER[priority] !== undefined ? PRIORITY_ORDER[priority] : 1;
    this._stats.enqueued++;
    return new Promise((resolve, reject) => {
      this._queue.push({ task, order, resolve, reject });
      this._queue.sort((a, b) => a.order - b.order);
      if (!this._timer) this._startProcessing();
    });
  }

  /** Set target requests-per-second (1–50). */
  setRps(n) {
    this._rps = Math.max(1, Math.min(50, n));
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      this._startProcessing();
    }
  }

  /** Return a snapshot of queue statistics. */
  getStats() {
    return { ...this._stats, queueDepth: this._queue.length, rps: this._rps };
  }

  _startProcessing() {
    const intervalMs = Math.floor(1000 / this._rps);
    this._timer = setInterval(() => this._tick(), intervalMs);
  }

  async _tick() {
    const item = this._queue.shift();
    if (!item) {
      clearInterval(this._timer);
      this._timer = null;
      return;
    }
    try {
      const result = await item.task();
      this._stats.processed++;
      item.resolve(result);
      // Adaptive: on success keep current rate, already sorted queue
    } catch (err) {
      this._stats.failed++;
      // Adaptive: slow down on failures
      this._rps = Math.max(1, this._rps - 1);
      item.reject(err);
    }
  }

  /** Drain remaining items, rejecting each. Stops the internal timer. */
  drain() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    for (const item of this._queue) item.reject(new Error('queue_drained'));
    this._queue = [];
  }
}

module.exports = { RequestQueue };
