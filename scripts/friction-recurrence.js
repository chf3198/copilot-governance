'use strict';
// friction-recurrence.js — cross-team-weighted recurrence over friction events (#3165).
//
// Friction events (event === 'governance.friction', tier:1) already route to Tier-2 through
// the existing anneal-tier2-autofile model (classifyTier1 groups by pattern_id; count >= 2 =>
// medium). This module adds the cross-team weighting AC3 calls for: a friction pattern seen
// by >= 2 DISTINCT teams is a stronger signal than the same count from one team, so it is
// bumped one severity level (escalates faster). Only friction candidates are touched; ordinary
// anneal candidates pass through unchanged, so wiring this into the autofile path is additive.

const { FRICTION_EVENT, SEVERITIES } = require('./friction-event');

const SEVERITY_INDEX = SEVERITIES.reduce((acc, name, idx) => ({ ...acc, [name]: idx }), {});
const CROSS_TEAM_MIN = 2;

function isFrictionEvent(event) {
  return Boolean(event) && event.event === FRICTION_EVENT;
}

function bumpSeverity(severity) {
  const idx = Math.min(SEVERITIES.length - 1, (SEVERITY_INDEX[severity] ?? 0) + 1);
  return SEVERITIES[idx];
}

// Map pattern_id -> Set(distinct teams) over the friction events in the window.
function distinctTeamsByPattern(events) {
  const teams = new Map();
  for (const event of events || []) {
    if (!isFrictionEvent(event)) continue;
    const set = teams.get(event.pattern_id) || new Set();
    if (event.team) set.add(event.team);
    teams.set(event.pattern_id, set);
  }
  return teams;
}

// Additive enhancer for anneal-tier2-autofile: bump the severity of any candidate whose
// friction events span >= 2 distinct teams. Non-friction candidates are returned unchanged.
function applyFrictionCrossTeamWeighting(candidates, events) {
  const teamsByPattern = distinctTeamsByPattern(events);
  return (candidates || []).map((candidate) => {
    const teams = teamsByPattern.get(candidate.pattern_id);
    if (!teams || teams.size < CROSS_TEAM_MIN) return candidate;
    return {
      ...candidate,
      severity: bumpSeverity(candidate.severity),
      distinct_teams: teams.size,
      cross_team_weighted: true,
    };
  });
}

// Standalone friction-only recurrence detector (used by tests + the router). Returns Tier-2
// candidates: a pattern qualifies at count >= minCount OR when >= 2 distinct teams hit it.
function frictionRecurrenceCandidates(events, opts = {}) {
  const minCount = opts.minCount || CROSS_TEAM_MIN;
  const groups = new Map();
  for (const event of events || []) {
    if (!isFrictionEvent(event)) continue;
    const group = groups.get(event.pattern_id)
      || { pattern_id: event.pattern_id, count: 0, teams: new Set(), events: [] };
    group.count += 1;
    if (event.team) group.teams.add(event.team);
    group.events.push(event);
    groups.set(event.pattern_id, group);
  }
  return Array.from(groups.values())
    .filter((group) => group.count >= minCount || group.teams.size >= CROSS_TEAM_MIN)
    .map((group) => {
      const base = group.count >= 5 ? 'critical' : group.count >= 3 ? 'high' : 'medium';
      const crossTeam = group.teams.size >= CROSS_TEAM_MIN;
      return {
        pattern_id: group.pattern_id,
        count: group.count,
        distinct_teams: group.teams.size,
        severity: crossTeam ? bumpSeverity(base) : base,
        cross_team_weighted: crossTeam,
        trigger_type: 'friction',
        events: group.events,
      };
    });
}

module.exports = {
  isFrictionEvent, applyFrictionCrossTeamWeighting, frictionRecurrenceCandidates,
  distinctTeamsByPattern, bumpSeverity, CROSS_TEAM_MIN,
};
