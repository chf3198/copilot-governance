'use strict';
/** Dashboard module: goal-health split panel. Refs #1253 / Phase-B follow-up. */

async function fetchGoalHealthSummary() {
  const response = await fetch('/api/governance-audit');
  if (!response.ok) throw new Error(`goal health fetch failed: ${response.status}`);
  return response.json();
}

function renderGoalHealthPanel(report) {
  const goal = report?.goal_health || report || {};
  const contributing = goal.contributing || {};
  const rows = Object.entries(contributing).map(([sensor, data]) =>
    `<tr><td>${esc(sensor)}</td><td>${data.value ?? '—'}</td><td>${data.clamped ?? '—'}</td><td>${data.weight != null ? data.weight.toFixed(3) : '—'}</td></tr>`
  ).join('');
  const actuators = report?.actuator_state?.actuators || {};
  const overrides = report?.operator_overrides_active || [];
  const overrideMap = {};
  for (const ov of overrides) overrideMap[ov.actuator] = ov;
  const aRows = Object.entries(actuators).map(([name, data]) => {
    const ov = overrideMap[name];
    const ovBadge = ov ? ` <span class="cost-badge" title="${esc(ov.reason || '')}">⚠ override → ${esc(ov.tier || '—')}</span>` : '';
    return `<tr><td>${esc(name)}${ovBadge}</td><td>${esc(data.tier || data.level || '—')}</td><td>${data.escalated_at ? 'yes' : 'no'}</td><td>clean=${data.consecutive_clean_count ?? 0}</td></tr>`;
  }).join('');
  const score = goal.score == null ? 'stale' : `${(goal.score * 100).toFixed(1)}%`;
  const ovNote = overrides.length > 0
    ? `<p class="config-note">⚠ ${overrides.length} operator-override(s) active. Velocity-relative de-escalation (#1113).</p>`
    : '<p class="config-note">Goal health uses the weighted sensor set; de-escalation is velocity-relative (N consecutive clean GHS samples).</p>';
  const note = goal.stale ? `<p class="config-note">${esc(goal.reason || 'goal health is stale')}</p>` : ovNote;
  return `<h4>Goal Health Split <span style="font-size:0.8em;color:#888">${esc(report?.overall || 'UNAVAILABLE')}</span></h4>${note}
    <div class="cost-metric"><span class="cost-label">Goal health score</span><span class="cost-value">${score}</span><span class="cost-budget">weight floor ${(report?.goal_health?.weights_used ? Object.values(report.goal_health.weights_used).reduce((s, v) => s + v, 0) : 0).toFixed(3)}</span></div>
    <table class="cost-table"><thead><tr><th>Sensor</th><th>Value</th><th>Clamped</th><th>Weight</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No contributing sensors.</td></tr>'}</tbody></table>
    <table class="cost-table"><thead><tr><th>Actuator</th><th>State</th><th>Escalated</th><th>Clean count</th></tr></thead><tbody>${aRows || '<tr><td colspan="4">No actuator state.</td></tr>'}</tbody></table>`;
}

if (typeof module !== 'undefined') module.exports = { fetchGoalHealthSummary, renderGoalHealthPanel };
else Object.assign(window, { fetchGoalHealthSummary, renderGoalHealthPanel });