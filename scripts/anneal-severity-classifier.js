#!/usr/bin/env node
'use strict';

const TWO = Number('2');
const THREE = Number('3');
const FIVE = Number('5');

function classifyRecord(record) {
  const count = Number(record.count || '0');
  if (record.trigger_type === 'goal-failure' || count >= FIVE) return 'critical';
  if (count >= THREE) return 'high';
  if (count >= TWO) return 'medium';
  return 'low';
}

function classifyTier1(events) {
  const groups = new Map();
  events.forEach((item) => {
    const key = item.pattern_id || 'unknown-pattern';
    const prior = groups.get(key) || { pattern_id: key, count: Number('0'), events: [] };
    prior.count += Number('1');
    prior.events.push(item);
    groups.set(key, prior);
  });
  return Array.from(groups.values()).map((record) => {
    const triggerType = record.events.some((item) => item.trigger_type === 'goal-failure')
      ? 'goal-failure'
      : 'sensor-driven';
    return {
      ...record,
      trigger_type: triggerType,
      severity: classifyRecord({ count: record.count, trigger_type: triggerType }),
    };
  });
}

if (require.main === module) {
  const sample = [{ pattern_id: 'sample', trigger_type: 'sensor-driven' }, { pattern_id: 'sample' }];
  process.stdout.write(JSON.stringify(classifyTier1(sample), null, TWO) + '\n');
}

module.exports = { classifyRecord, classifyTier1, FIVE };
