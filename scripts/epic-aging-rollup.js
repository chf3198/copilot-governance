#!/usr/bin/env node
'use strict';
// epic-aging-rollup.js (#3527, Epic #3520) — fleet-wide open-epic aging report (ADR-020 §D2/D3/D4/D5).
// Pure core (classifyEpic/buildRollup/graphqlHeaders) is fixture-testable; main() does IO via gh.
// Reuses #2405 snapshot shape, #2930 circuit-breaker, #546 sink. $0 (G3).
const { execSync } = require('node:child_process');
const cb = require('./circuit-breaker');
const incidents = require('./incidents-store');
const DAY_MS = 86400e3, IDLE_PARKED_DAYS = 30, REPO_LIMIT = 200, GH_TIMEOUT_MS = 20000;
const SUB_ISSUES_HEADER = 'GraphQL-Features: sub_issues'; // #3354: omitting silently returns null
const RATE_LIMIT_RE = /rate limit|secondary|429/i;

// GraphQL headers the sub-issue read MUST carry (asserted by the self-test).
const graphqlHeaders = () => [SUB_ISSUES_HEADER];

// Pure. epic {number,title,createdAt,updatedAt,state,subIssuesSummary,repo}; now epoch ms.
// child_completion is null when the summary is absent — never a wrong 0% (ADR §D4 fallback).
const classifyEpic = (epic, now) => {
  const ageDays = Math.floor((now - new Date(epic.createdAt).getTime()) / DAY_MS);
  const idleDays = Math.floor((now - new Date(epic.updatedAt).getTime()) / DAY_MS);
  const summary = epic.subIssuesSummary;
  const childCompletion = summary && typeof summary.percentCompleted === 'number'
    ? summary.percentCompleted : null;
  const parked = (childCompletion === 100 && epic.state === 'open') || idleDays > IDLE_PARKED_DAYS;
  return {
    repo: epic.repo, number: epic.number, title: epic.title,
    age_days: ageDays, idle_days: idleDays, child_completion: childCompletion, parked,
  };
};

// Pure. repos: [{repo,archived,readable,truncated,epics:[...]}] → {rows, coverage}.
const buildRollup = (repos, now) => {
  const rows = [], reposWithoutEpicRead = [], truncated = [];
  let reposScanned = 0;
  for (const rec of repos) {
    if (rec.archived) continue;
    if (rec.readable === false) { reposWithoutEpicRead.push(rec.repo); continue; }
    reposScanned++;
    if (rec.truncated) truncated.push(rec.repo);
    for (const epic of (rec.epics || [])) rows.push(classifyEpic({ ...epic, repo: rec.repo }, now));
  }
  return {
    rows,
    coverage: { reposScanned, reposWithoutEpicRead, truncated, parked: rows.filter(r => r.parked).length },
  };
};

// ---- IO layer (not exercised by the fixture self-test) ----
const gh = (args) => execSync(`gh ${args}`, { encoding: 'utf8', timeout: GH_TIMEOUT_MS });
const EPIC_QUERY = 'query($q:String!){search(query:$q,type:ISSUE,first:100){pageInfo{hasNextPage}'
  + ' nodes{... on Issue{number title createdAt updatedAt state repository{name}'
  + ' subIssuesSummary{total completed percentCompleted}}}}}';

// REST fallback (ADR §D4): compute completed/total when subIssuesSummary is null.
const restChildCompletion = (repo, number) => {
  try {
    const subs = JSON.parse(gh(`api "repos/chf3198/${repo}/issues/${number}/sub_issues?per_page=100"`));
    if (!Array.isArray(subs) || subs.length === 0) return null;
    const done = subs.filter(s => s.state === 'closed').length;
    return Math.round((done / subs.length) * 100);
  } catch { return null; } // unavailable → caller records subissue-read-unavailable
};

const fetchEpics = (repo, breaker) => {
  if (!cb.canPass(breaker, Date.now())) return { repo, readable: false };
  const headerFlags = graphqlHeaders().map(h => `-H ${JSON.stringify(h)}`).join(' ');
  const query = `repo:chf3198/${repo} is:issue is:open label:type:epic`;
  try {
    const data = JSON.parse(gh(`api graphql ${headerFlags} -f q=${JSON.stringify(query)} -f query=${JSON.stringify(EPIC_QUERY)}`));
    const search = data.data.search;
    const epics = (search.nodes || []).map(n => {
      let summary = n.subIssuesSummary;
      if (!summary || typeof summary.percentCompleted !== 'number') {
        const pct = restChildCompletion(repo, n.number);
        summary = pct === null ? null : { percentCompleted: pct };
      }
      return { number: n.number, title: n.title, createdAt: n.createdAt, updatedAt: n.updatedAt, state: n.state.toLowerCase(), subIssuesSummary: summary };
    });
    cb.recordSuccess(breaker);
    return { repo, archived: false, readable: true, truncated: Boolean(search.pageInfo && search.pageInfo.hasNextPage), epics };
  } catch (e) { if (RATE_LIMIT_RE.test(e.message)) cb.recordFailure(breaker, Date.now()); return { repo, readable: false }; }
};

const main = () => {
  const breaker = cb.create({ threshold: 3 });
  let repos;
  try { repos = JSON.parse(gh(`repo list chf3198 --limit ${REPO_LIMIT} --json name,isArchived`)); }
  catch (e) { incidents.append({ pattern_id: 'epic-aging-enum-fail', timestamp: new Date().toISOString(), error: e.message }); process.exit(1); }
  const data = repos.map(r => r.isArchived ? { repo: r.name, archived: true } : fetchEpics(r.name, breaker));
  const { rows, coverage } = buildRollup(data, Date.now()), ts = new Date().toISOString();
  for (const row of rows) incidents.append({ pattern_id: `epic-aging:${row.repo}/${row.number}`, timestamp: ts, ...row });
  incidents.append({ pattern_id: 'epic-aging-coverage', timestamp: ts, ...coverage, epics: rows.length, breaker: cb.status(breaker).state });
  console.log(`epic-aging-rollup: ${rows.length} open epic(s), ${coverage.parked} parked, ${coverage.reposScanned} repos, breaker=${cb.status(breaker).state}`);
};

module.exports = { classifyEpic, buildRollup, graphqlHeaders, SUB_ISSUES_HEADER };
if (require.main === module) main();
