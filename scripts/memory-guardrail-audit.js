"use strict";
// memory-guardrail-audit (Epic #3380 / #3385): classify EXISTING memory files via the friction
// classifier, surfacing which notes are guardrail-candidates (deterministic-friction that should
// become a hook/validator/CI/test) vs genuine semantic-memory. Dry-run by default. Dogfoods #3382.
const fs = require("fs");
const path = require("path");
const { classifyFriction } = require("./friction-classifier");

const DEFAULT_MEMORY_DIR = path.join(
  process.env.HOME || "", ".claude", "projects", "-home-curtisfranks-devenv-ops", "memory");
const MECHANISM_RULES = [
  { rule: /enforcer|pretool|hook|sandbox|guard/i, mechanism: "hook" },
  { rule: /baton|regex|schema|signer|prose-collision|validator|closeout/i, mechanism: "validator" },
  { rule: /drift|merge|sync|epic-clos|deploy|ci\b/i, mechanism: "ci-backstop" },
  { rule: /parser|collision|ordering|enum|lint/i, mechanism: "unit-test" },
];

/** Propose the prevention-first mechanism for a guardrail-candidate from its text. */
function proposeMechanism(text) {
  for (const entry of MECHANISM_RULES) {
    if (entry.rule.test(text)) return entry.mechanism;
  }
  return "hook";
}

/** Build a friction record from a memory file's text. Persisted memory ⇒ already recurred. */
function recordFromMemory(fileName, text) {
  return { _summary: text, file: fileName, recurrence_7d: 2, severity: "medium" };
}

/** Classify every *.md memory file (excluding the MEMORY.md index) under dir. */
function auditMemoryDir(dir) {
  const target = dir || DEFAULT_MEMORY_DIR;
  let names = [];
  try {
    names = fs.readdirSync(target).filter((name) => name.endsWith(".md") && name !== "MEMORY.md");
  } catch (_err) {
    return { dir: target, error: "memory-dir-unreadable", entries: [], counts: {} };
  }
  const entries = names.map((name) => {
    const text = safeRead(path.join(target, name));
    const result = classifyFriction(recordFromMemory(name, text));
    return {
      file: name,
      destination: result.destination,
      mechanism: result.destination === "guardrail-candidate" ? proposeMechanism(text) : null,
    };
  });
  return { dir: target, entries, counts: tally(entries) };
}

/** Read a file, returning empty string on any error (fail-open). */
function safeRead(filePath) {
  try { return fs.readFileSync(filePath, "utf8"); } catch (_err) { return ""; }
}

/** Count entries per destination. */
function tally(entries) {
  return entries.reduce((acc, entry) => {
    acc[entry.destination] = (acc[entry.destination] || 0) + 1;
    return acc;
  }, {});
}

module.exports = { auditMemoryDir, proposeMechanism, recordFromMemory };

if (require.main === module) {
  const dirArg = process.argv.find((arg) => arg.startsWith("--dir="));
  const report = auditMemoryDir(dirArg ? dirArg.split("=")[1] : undefined);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Audited ${report.entries.length} memory files in ${report.dir}`);
    console.log("Counts:", JSON.stringify(report.counts));
    const candidates = report.entries.filter((entry) => entry.destination === "guardrail-candidate");
    console.log(`\nGuardrail-candidates (${candidates.length}) — convert to a guardrail, not a note:`);
    for (const entry of candidates) console.log(`  - ${entry.file} -> ${entry.mechanism}`);
    if (process.argv.includes("--forget")) {
      const forgettable = report.entries.filter((entry) => entry.destination === "forget");
      console.log(`\nForget-eligible (${forgettable.length}):`);
      for (const entry of forgettable) console.log(`  - ${entry.file}`);
    }
  }
}
