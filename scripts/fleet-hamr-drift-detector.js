'use strict';
// tier: 3
// fleet-hamr-drift-detector — detect AC-threshold breaches in fleet/HAMR observability
// data; auto-file Tier-2 anneal tickets. Refs Epic #2150 #2206 AC7.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SUPPRESSION_PATH = path.join(os.homedir(), '.megingjord', 'anneal-suppression.json');
const DEDUP_WINDOW_MS = 7 * 86400000;

const THRESHOLDS = {
  'fleet-utilization-low': { min_ratio: 0.4, description: 'fleet (ollama) usage <40% of HAMR-wrapped calls' },
  'paid-provider-surge': { max_ratio: 0.5, description: 'paid providers (anthropic/openai) >50% of calls' },
  'tier-fleet-misroute': { max_count: 5, description: 'tier=fleet calls landing on ollama (should be fleet-local)' },
};

function loadSuppression(suppressionPath = SUPPRESSION_PATH) {
  if (!fs.existsSync(suppressionPath)) return [];
  try { return JSON.parse(fs.readFileSync(suppressionPath, 'utf8')); } catch { return []; }
}

function isSuppressed(patternId, suppressions, now = Date.now()) {
  return (suppressions || []).some((entry) => {
    if (entry.pattern_id !== patternId) return false;
    const filed = Number(entry.last_filed_ts);
    if (!filed) return false;
    return (now - filed) < DEDUP_WINDOW_MS;
  });
}

function detectBreaches(aggregate, now = Date.now()) {
  const breaches = [];
  const total = aggregate.totalCalls || 0;
  const fleetCalls = aggregate.fleetCalls || 0;
  if (total > 0) {
    const fleetRatio = fleetCalls / total;
    if (fleetRatio < THRESHOLDS['fleet-utilization-low'].min_ratio) {
      breaches.push({ pattern_id: 'fleet-utilization-low', detected_at: now, observed_ratio: fleetRatio });
    }
    const paidProviders = ['anthropic', 'openai', 'gemini'];
    const paidCount = paidProviders.reduce((sum, p) => sum + (aggregate.byProvider[p] || 0), 0);
    const paidRatio = paidCount / total;
    if (paidRatio > THRESHOLDS['paid-provider-surge'].max_ratio) {
      breaches.push({ pattern_id: 'paid-provider-surge', detected_at: now, observed_ratio: paidRatio });
    }
  }
  const tierFleetCount = aggregate.byTier ? (aggregate.byTier['fleet'] || 0) : 0;
  if (tierFleetCount > THRESHOLDS['tier-fleet-misroute'].max_count) {
    breaches.push({ pattern_id: 'tier-fleet-misroute', detected_at: now, observed_count: tierFleetCount });
  }
  return breaches;
}

function filterUnsuppressed(breaches, suppressions, now = Date.now()) {
  return breaches.filter((b) => !isSuppressed(b.pattern_id, suppressions, now));
}

function runDetection({ aggregate, suppressionPath } = {}) {
  const suppressions = loadSuppression(suppressionPath);
  const breaches = detectBreaches(aggregate || { totalCalls: 0 });
  const actionable = filterUnsuppressed(breaches, suppressions);
  return { breaches, actionable, suppressed: breaches.length - actionable.length };
}

module.exports = { runDetection, detectBreaches, isSuppressed, loadSuppression, filterUnsuppressed, THRESHOLDS, DEDUP_WINDOW_MS };
