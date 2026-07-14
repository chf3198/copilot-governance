#!/usr/bin/env python3
"""PreToolUse hook: pre-tool guards and admin sequencing gates."""
import json, os, re, subprocess, sys
from pathlib import Path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path: sys.path.insert(0, str(SCRIPT_DIR))
from admin_patterns import (  # noqa: E501
    DANGEROUS_CMD_RE, RE_GH_ISSUE_CLOSE, RE_GH_RELEASE_CREATE, RE_GIT_COMMIT,
    RE_GIT_PUSH, RE_GIT_TAG, RE_PR_CHECKS, RE_PR_CREATE, RE_PR_MERGE,
    RE_RELEASE_INTEGRITY, RE_VSCE_PUBLISH, SECRET_FILE_RE, iter_paths, iter_strings)
from canonical_main_enforcer import is_main_checkout, evaluate_path, main_checkout_root
from blast_radius_cap import ENV_BYPASS, check_caps, emit_cap_incident, load_caps
from session_anomaly import (
    ENV_ANOMALY_BYPASS, check_anomaly, emit_anomaly_incident,
)
from governance_state import ensure_state, save_state
from baton_handoff_checks import linked_issue_has_authoritative_manager_handoff
from one_ticket_per_worktree import check_one_ticket_per_worktree
from live_checks import ci_gate_status, ci_gate_status_stable, linked_issue_has_collab_handoff, linked_issue_has_manager_handoff, linked_issue_has_planning_consensus, check_merged_pr, open_pr_for_ref
from runtime_paths import runtime_hook_paths
RE_ISSUE_REF = re.compile(r"#\d+")
RE_BRANCH_TICKET = re.compile(r"^(feat|fix|hotfix)/(\d+)-")
RE_BRANCH_CREATE = re.compile(r"git\s+(?:checkout\s+-b|switch\s+-c)\s+(\S+)")
RE_BRANCH_SWITCH = re.compile(
    r"(?:(?:^|;|&&|\|\|)\s*)git\s+(?:switch|checkout)\s+(?!-[bcCq])([^\s-]\S*)",
    re.MULTILINE,
)
BRANCH_VALID = re.compile(r"^(feat|fix|hotfix)/\d+-|^(chore|skill)/[a-z0-9]|^main$|^develop$")
RE_PR_REF = re.compile(r"gh\s+pr\s+merge\s+(\S+)")
IT_OPS_MARKERS_RE = re.compile(r"\[it-ops\]|chore\(it-ops\)\s*:", re.IGNORECASE)
NO_CODE_ADMIN_RE = re.compile(
    r"\bgit\s+add\b|\bgit\s+commit\b|\bgit\s+push\b|"
    r"\bgh\s+pr\s+(?:create|merge)\b|\bnpm\s+run\s+deploy(?:[:\w-]*)?\b|"
    r"\bnpx\s+vsce\s+publish\b|\bgh\s+release\s+create\b",
    re.IGNORECASE,
)

def detect_it_ops_bypass(joined: str, env: dict | None = None) -> tuple[bool, str | None]:
    """#2142: IT-ops commit-gate bypass detector.

    Returns (True, marker) if any of the documented markers matches:
    - env var MEGINGJORD_IT_OPS=1
    - commit message contains [it-ops] literal
    - commit message uses chore(it-ops): Conventional-Commits type prefix
    Returns (False, None) otherwise.
    """
    env = env if env is not None else os.environ
    if env.get("MEGINGJORD_IT_OPS") == "1":
        return True, "env:MEGINGJORD_IT_OPS=1"
    if IT_OPS_MARKERS_RE.search(joined):
        return True, "commit-subject-marker"
    return False, None

# #2995: shell-level write-target detection — closes the canonical-main blind spot
# where terminal writes (redirect / sed -i / tee / cp / mv) mutate tracked files,
# bypassing the structured-edit-tool enforcer. evaluate_path() is the deny/allow
# authority (only tracked, non-gitignored, in-repo paths are denied), so generous
# extraction is safe; the extractor only narrows WHICH tokens to evaluate.
_SHELL_DEV_SINKS = {"/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty"}
# `>`/`>>` file redirects, anchored to a word boundary (#3001): the operator must be
# at start-of-string or after whitespace, optionally with a leading fd digit. This
# excludes arrow tokens (`->`, `=>`) and inline comparisons (`a>b`) that previously
# matched and over-blocked. fd-dup forms (`2>&1`, `>&2`) are excluded because the
# capture class rejects a leading `&`. (Residual: `&>file` all-output redirect is not
# matched — uncommon; tee/redirect/dd cover the usual writers.)
_REDIRECT_RE = re.compile(r"(?:^|\s)\d*>>?(?!=)\s*([^\s;&|<>()`]+)")
_TEE_RE = re.compile(r"\btee\b\s+(?:-{1,2}\S+\s+)*([^\s;&|<>()`]+)")
# sed in-place: take the last bare token of the sed command segment as the target.
# (Multi-file `sed -i s f1 f2` checks the last file only — a documented residual.)
_SED_I_RE = re.compile(r"\bsed\b\s+[^|;&\n]*?-i\S*\s+[^|;&\n]*?\s([^\s;&|<>()`]+)(?=\s|$|;|\||&)")
# cp/mv/install: destination is the last token of the command segment.
_CP_MV_RE = re.compile(r"\b(?:cp|mv|install)\b\s+[^|;&\n]*?\s([^\s;&|<>()`]+)(?=\s|$|;|\||&)")
# dd of=PATH (#2995 cross-family review): a common non-redirect file writer.
_DD_RE = re.compile(r"\bdd\b[^|;&\n]*?\bof=([^\s;&|<>()`]+)")

# #3471: quote/here-doc-aware sanitization so a `>` / `>=` that is PROSE (inside a quoted
# string, a here-doc body, or a description field) is not parsed as a shell redirect and
# false-blocked as a write. Real redirects to UNQUOTED targets survive and are still caught.
_QUOTE_SENTINEL = "\x00"
_HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)(\w+)\1")


def _strip_heredoc_bodies(cmd: str) -> str:
    """Drop here-doc body lines (data, not shell) so a `>`/`>=` in the body is not a redirect.
    Keeps the `<<DELIM` opening line (its own redirect, if any, stays detectable). Handles
    <<EOF, <<'EOF', <<-EOF; the terminator is a line whose stripped text equals the delimiter.
    """
    lines = cmd.split("\n")
    kept: list[str] = []
    index = 0
    while index < len(lines):
        kept.append(lines[index])
        match = _HEREDOC_RE.search(lines[index])
        if match:
            delimiter = match.group(2)
            index += 1
            while index < len(lines) and lines[index].strip() != delimiter:
                index += 1  # skip body line
            # skip the terminator line too (the trailing increment moves past it)
        index += 1
    return "\n".join(kept)


def _mask_quoted(cmd: str) -> str:
    """Replace the CONTENT of single/double/backtick-quoted spans with a NUL sentinel so a
    `>` inside a quoted string vanishes while quote structure (and a quoted redirect-target
    POSITION) is preserved. Respects backslash-escapes outside single quotes.
    """
    out: list[str] = []
    index, length = 0, len(cmd)
    while index < length:
        char = cmd[index]
        if char in "'\"`":
            quote = char
            index += 1
            while index < length and cmd[index] != quote:
                if cmd[index] == "\\" and quote != "'":
                    index += 1
                index += 1
            out.append(_QUOTE_SENTINEL)
            index += 1  # consume the closing quote (or past end if unterminated)
        else:
            out.append(char)
            index += 1
    return "".join(out)


def _sanitize_for_redirect_scan(cmd: str) -> str:
    """Here-doc bodies stripped + quoted spans masked before the redirect regex scan (#3471).
    Fail-open: any error returns the original command (never brick the hook).
    """
    try:
        return _mask_quoted(_strip_heredoc_bodies(cmd))
    except Exception:
        return cmd


def shell_write_targets(joined: str) -> list[str]:
    """Best-effort extraction of file-write targets from a shell command.

    Covers the common idioms an agent uses to mutate files via the terminal:
    `> f`, `>> f`, `tee f`, `sed -i ... f`, `cp/mv/install ... f`, `dd of=f`.
    fd-redirects (`2>&1`, `>&2`) and `/dev/*` sinks are excluded. Returns raw target
    tokens; callers MUST pass each through evaluate_path() — that is the deny/allow
    authority, so over-extraction here is harmless (non-repo / gitignored targets
    resolve to ALLOW). Fail-open: any parse error yields [] (never brick the hook).

    RESIDUAL (defense-in-depth, not airtight — documented per #2995 cross-family
    review): arbitrary in-process writers (`python -c "open(...,'w')"`,
    `node -e fs.writeFileSync`), `patch < diff`, non-interactive editors
    (`vim -c w`, `emacs --batch`), and multi-file `sed -i` (last file only) are NOT
    parsed — they cannot be detected by static shell-token analysis. The structured
    edit-tool enforcer (evaluate_path on Edit/Write/create_file/...) remains the
    primary guard; this closes the common terminal-write idioms.
    """
    targets: list[str] = []
    try:
        cleaned = _sanitize_for_redirect_scan(joined)
        for regex in (_REDIRECT_RE, _TEE_RE, _SED_I_RE, _CP_MV_RE, _DD_RE):
            for match in regex.finditer(cleaned):
                token = match.group(1).strip().strip("\"'")
                if not token or token.startswith("-") or token.startswith("&"):
                    continue
                if _QUOTE_SENTINEL in token:
                    continue  # #3471: quoted redirect target — documented residual (not path-evaluated)
                if token in _SHELL_DEV_SINKS:
                    continue
                targets.append(token)
    except Exception:
        return []
    return targets

# Epic #3392 AC2/AC5 (#3403): adjudicate-first risk classifiers for the 2 security-sensitive
# surfaces (S6 hook-mutation, S7 sensitive-path). Mirrors the #3401 adjudication-guardrail
# risk-tiering — a FAST in-process decision (no synchronous network panel; G7), reserving the
# human carve-out for genuine risk only. Both are FAIL-CLOSED: any error returns "ask" so a
# classifier bug can never silently weaken G4. ("allow" means "benign — fall through to the other
# gates", NOT short-circuit-allow.)
# A GOVERNED deploy is ONLY `npm run deploy|sync[:variant]` or a deploy/sync shell script — NOT a
# bare `deploy:word` token (a cross-family security review flagged that bare form as too permissive:
# `echo deploy:malicious` alongside a hook write would have been mis-allowed). Tightened to fail
# toward the carve-out: an unrecognized hook write reaches the human (ask), not allow.
_DEPLOY_RE = re.compile(r"\bnpm\s+run\s+(?:deploy|sync)[:\w-]*|\b(?:deploy|sync)\.sh\b")

def classify_hook_mutation(joined: str) -> str:
    """S6: 'allow' a benign hook READ/inspect or a GOVERNED deploy that writes hooks; 'ask' on a
    direct ungoverned hook MUTATION (policy-weakening risk). Fail-closed → 'ask'.
    """
    try:
        hook_paths = runtime_hook_paths()
        targets = shell_write_targets(joined)
        mutates_hook = any(any(hp in target for hp in hook_paths) for target in targets)
        if not mutates_hook:
            return "allow"  # read / inspect only — benign
        if _DEPLOY_RE.search(joined):
            return "allow"  # governed deploy/sync writes hooks legitimately
        return "ask"  # direct ungoverned hook mutation — human carve-out preserved (G4)
    except Exception:
        return "ask"  # fail-closed: never silently weaken the guard

def classify_sensitive_path(values: list[str], cwd: str) -> str:
    """S7: 'allow' read/source of a gitignored-LOCAL secret file (the operator's own .env); 'ask'
    when a secret-file path is TRACKED/committable (secret-exposure risk). Fail-closed → 'ask'.
    """
    try:
        secret_paths = [p for p in values
                        if SECRET_FILE_RE.search(p) and not p.endswith(".env.example")]
        if not secret_paths:
            return "allow"
        for path in secret_paths:
            allowed, _ = evaluate_path(path, cwd)
            if not allowed:
                return "ask"  # tracked/committable secret-file path → exposure carve-out (G4)
        return "allow"  # all are gitignored local config — benign local use
    except Exception:
        return "ask"  # fail-closed

def current_branch(cwd: str) -> str | None:
    try:
        res = subprocess.run(["git", "branch", "--show-current"], cwd=cwd,
                             check=False, capture_output=True, text=True)
        b = (res.stdout or "").strip()
        return b or None
    except Exception:
        return None

def emit(decision: str, reason: str, extra: str | None = None) -> int:
    hook = {"hookEventName":"PreToolUse","permissionDecision":decision,"permissionDecisionReason":reason}
    if extra: hook["additionalContext"] = extra
    print(json.dumps({"hookSpecificOutput": hook}))
    if decision == "deny":
        try:
            from baton_event_emitter import emit_decision as _ed
            _ed("pretool-guard", "tool-denied", "denied", rationale=reason)
        except Exception:
            pass  # G6: telemetry never breaks the gate
    return 0

def _emit_it_bypass_telemetry(marker: str, cwd: str) -> None:
    """Refs #2351: best-effort IT-bypass usage telemetry. Never blocks the hook."""
    try:
        from it_bypass_emit import emit_bypass
        emit_bypass(marker, cwd)
    except Exception:
        pass  # telemetry failure must not affect hook decision

def _active_ticket_labels(state: dict, cwd: str) -> set[str]:
    ticket = state.get("active_ticket")
    if not ticket:
        return set()
    try:
        res = subprocess.run(
            ["gh", "issue", "view", str(ticket), "--json", "labels", "-q", ".labels[].name"],
            cwd=cwd, check=False, capture_output=True, text=True, timeout=20,
        )
        return {line.strip() for line in (res.stdout or "").splitlines() if line.strip()}
    except Exception:
        return set()

def active_ticket_is_no_code_lane(state: dict, cwd: str) -> bool:
    return "lane:no-code-remediation" in _active_ticket_labels(state, cwd)

def active_ticket_is_research_lane(state: dict, cwd: str) -> bool:
    """#3266: True when the active ticket is lane:research (report-only, PR-less and
    merge-less by design). Mirrors active_ticket_is_no_code_lane; consumed by the
    issue-close carve-out here and by the Stop-hook Admin-op gate (stop_reminder ->
    stop_checks.check_admin_ops -> admin_patterns.required_admin_ops).
    """
    return "lane:research" in _active_ticket_labels(state, cwd)

DOCS_LANE_LABELS = ("lane:docs-research", "lane:docs-only")

def active_ticket_is_docs_lane(state: dict, cwd: str) -> bool:
    """#3569: True when the active ticket is lane:docs-research or lane:docs-only — report-only
    "Manager+Consultant" reduced batons that are PR-less/merge-less by design. Sibling to
    active_ticket_is_research_lane (left unchanged per #3569 D1); consumed by the same issue-close
    carve-out here and the Stop-hook Admin-op gate. NOTE: the caller's clean-tree condition is
    load-bearing for docs lanes — docs work often DOES produce a tracked docs diff, and such a
    real diff must still deny + re-route to lane:code-change; only a genuinely-empty tree is exempt.
    """
    labels = _active_ticket_labels(state, cwd)
    return any(label in labels for label in DOCS_LANE_LABELS)

CONSENSUS_OVERRIDE_ENV = "MEGINGJORD_PLANNING_CONSENSUS_OVERRIDE"

def _emit_planning_consensus_override_incident(cwd: str, ticket: int | None) -> None:
    """Best-effort incident for audited planning-consensus override usage (#2971)."""
    try:
        path = os.path.join(os.path.expanduser("~"), ".megingjord", "incidents.jsonl")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        event = {"version": 3, "service": "pretool-guard-consensus", "env": "local",
                 "event": "governance.planning-consensus-override",
                 "pattern_id": "planning-consensus-override", "severity": "medium",
                 "cwd": cwd, "ticket": ticket}
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    except Exception:
        pass

RE_ADMIN_OVERRIDE = re.compile(r"(?:^|\s)--admin(?:[=\s]|$)")
MUTATING_TOOLS = {
    "create_file", "apply_patch", "edit_notebook_file", "create_new_jupyter_notebook",
    "replace_string_in_file", "multi_replace_string_in_file", "Write", "Edit", "MultiEdit",
    "write_to_file", "replace_file_content", "multi_replace_file_content",
    "run_in_terminal", "terminal", "runTerminalCommand", "Bash", "run_command", "send_command_input",
}


def enforce_blast_radius(tool: str, state: dict, cwd: str) -> int | None:
    if tool not in MUTATING_TOOLS:
        return None
    reason = check_caps(state.get("blast_radius", {}), load_caps(cwd))
    if not reason:
        return None
    override = os.environ.get(ENV_BYPASS, "0") == "1"
    emit_cap_incident(reason, cwd, override=override)
    if override:
        return None
    return emit("deny", f"Session blast-radius cap exceeded: {reason}")

def enforce_session_anomaly(state: dict, cwd: str) -> int | None:
    """#2913: deny when session aggregate counters exceed anomaly thresholds (G-15).
    #3316: MEGINGJORD_SESSION_ANOMALY_DISABLED=1 bypasses (audited incident still
    emitted) for parity with the blast-radius cap override.
    """
    reason = check_anomaly(state, cwd)
    if not reason:
        return None
    override = os.environ.get(ENV_ANOMALY_BYPASS, "0") == "1"
    emit_anomaly_incident(reason, cwd, override=override)
    if override:
        return None
    return emit("deny",
        f"Session anomaly detected — human review required: {reason}. "
        "Refs #2913 (G-15 / ASI05 / EU-AI-Act-Art14).")

def require_bypass_exception(joined: str, state: dict, cwd: str) -> bool:
    """True when this is an admin-OVERRIDE merge lacking the Epic #2517 exception (#2706).
    Fail-CLOSED: once the command is a confirmed override, if the exception cannot be
    verified (label backend error) require it (return True) rather than silently bypass -
    consistent with the unbreakable-chain invariant. The except never re-raises, so a guard
    bug yields a recoverable deny, not a crash/brick. Non-override commands short-circuit
    to False before any throwable call.
    """
    if not RE_ADMIN_OVERRIDE.search(joined):
        return False
    try:
        return "merge-bypass:admin-exception" not in _active_ticket_labels(state, cwd)
    except Exception:
        return True

# Bounded {0,512} quantifier caps the backtracking window (#2739 cross-family review
# hardening): a curl command line longer than this never legitimately targets a fleet host.
RE_FLEET_CURL = re.compile(r"curl\b[^\n|]{0,512}(?::11434\b|/api/(?:generate|tags|chat)\b)")

def is_raw_fleet_curl(joined: str) -> bool:
    """True when a raw curl targets a fleet/ollama endpoint outside the dispatch
    wrappers without the documented carve-out (#2192 vector #2 - raw curl bypasses
    HAMR cost+observability). Fail-open: any error returns False (never brick).
    """
    try:
        if "hamr-bypass-ok" in joined:
            return False
        return bool(RE_FLEET_CURL.search(joined))
    except Exception:
        return False

def _emit_fleet_bypass_incident(cwd: str) -> None:
    """Append a Tier-1 incident for a raw-fleet-curl bypass (#2192 AC1). Never raises."""
    try:
        path = os.path.join(os.path.expanduser("~"), ".megingjord", "incidents.jsonl")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        event = {"version": 3, "service": "pretool-guard-fleet-bypass",
                 "env": "local", "event": "governance.raw-fleet-curl-bypass",
                 "pattern_id": "raw-fleet-curl-bypasses-hamr", "severity": "low", "cwd": cwd}
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    except Exception:
        pass  # telemetry failure must not affect the hook decision

def _emit_worktree_push_desync(cwd: str) -> None:
    """Append a Tier-1 incident when a push is allowed via the worktree fallback
    rather than the session commit flag (#3168 AC3). Never raises.
    """
    try:
        path = os.path.join(os.path.expanduser("~"), ".megingjord", "incidents.jsonl")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        event = {"version": 3, "service": "pretool-guard-worktree-push",
                 "env": "local", "event": "governance.worktree-push-commit-desync",
                 "pattern_id": "worktree-push-gate-commit-desync", "severity": "low", "cwd": cwd}
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    except Exception:
        pass  # telemetry failure must not affect the hook decision

def _read_body_file(path: str, cwd: str) -> str:
    """#2967: read a `--body-file` target (cwd-relative or absolute) for baton-artifact
    detection. Returns '' on any error so the guard never breaks on a missing file.
    """
    try:
        full = path if os.path.isabs(path) else os.path.join(cwd, path)
        with open(full, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception:
        return ""

def _check_auth_profile(joined: str) -> int | None:
    """#2910: enforce active authorization profile before privileged operations."""
    try:
        from auth_profile_enforcer import check_command
        result = check_command(joined)
        if result is not None:
            allowed, reason = result
            if not allowed:
                return emit("deny", reason)
    except Exception:
        pass
    return None


def _check_role_tool_allowlist(joined: str, state: dict) -> int | None:
    """#2919: enforce role-scoped tool allowlist based on active baton phase (G-16)."""
    try:
        from role_tool_allowlist_enforcer import check_command as _rtl_check
        result = _rtl_check(joined, state.get("current_phase"))
        if result is not None:
            allowed, reason = result
            if not allowed:
                return emit("deny", reason)
    except Exception:
        pass
    return None


def _check_epic_close_guard(joined: str, cwd: str) -> int | None:
    """#3350 AC3: block closing a type:epic issue that still has open children."""
    try:
        from epic_close_guard import check_command as _epic_close_check
        result = _epic_close_check(joined, cwd)
        if result is not None:
            allowed, reason = result
            return emit("allow", reason) if allowed else emit("deny", reason)
    except Exception:
        pass
    return None


def check_terminal(joined: str, state: dict, cwd: str) -> int | None:
    auth_result = _check_auth_profile(joined)
    if auth_result is not None:
        return auth_result
    role_result = _check_role_tool_allowlist(joined, state)
    if role_result is not None:
        return role_result
    epic_close_result = _check_epic_close_guard(joined, cwd)
    if epic_close_result is not None:
        return epic_close_result
    flags, ops = state.get("flags", {}), state.get("admin_ops", {})
    repo_type = state.get("repo_type", "generic")
    # #2967: one-ticket-per-worktree — refuse a baton artifact for a second,
    # still-unresolved ticket from this worktree (provider-neutral, fail-open).
    one_ticket_deny = check_one_ticket_per_worktree(
        joined, state, body_file_reader=lambda path: _read_body_file(path, cwd))
    if one_ticket_deny:
        return emit("deny", one_ticket_deny)
    no_code_lane = active_ticket_is_no_code_lane(state, cwd)
    research_lane = active_ticket_is_research_lane(state, cwd)  # #3266
    docs_lane = active_ticket_is_docs_lane(state, cwd)  # #3569
    if no_code_lane and NO_CODE_ADMIN_RE.search(joined):
        return emit("deny", "No-code remediation lane is issue-only. Admin/implementation commands are blocked; re-route to lane:code-change.")
    if is_raw_fleet_curl(joined):
        _emit_fleet_bypass_incident(cwd)
        # Epic #3392 AC2 (S1): self-resolvable REDIRECT, not a client prompt. The operator
        # uses the dispatch wrappers (cascade-dispatch / free-cloud-dispatch) so HAMR records
        # cost+observability, or adds the documented '# hamr-bypass-ok: <reason>' carve-out for an
        # audited diagnostic. The deny + bypass-incident are PRESERVED (anti-goal §6) — only ask->deny.
        return emit("deny", "Raw fleet/ollama curl (#2192 vector 2): use cascade-dispatch or "
                    "free-cloud-dispatch (HAMR cost+observability), or add '# hamr-bypass-ok: <reason>' "
                    "for an audited diagnostic bypass. Operator-resolvable — no client prompt.")
    if DANGEROUS_CMD_RE.search(joined): return emit("deny","Blocked dangerous terminal command.")
    if is_main_checkout(cwd):
        sw = RE_BRANCH_SWITCH.search(joined)
        if sw and sw.group(1) not in ("main", "master"):
            return emit("deny", f"Canonical-main read-only: branch switch to '{sw.group(1)}' from main checkout rejected (#2107). Use a worktree (devenv-ops-<team-or-ticket>/) instead.")
        # #2995: close the shell-level-write blind spot. Terminal writes (redirect,
        # sed -i, tee, cp, mv) to a tracked main file bypass the structured-edit-tool
        # enforcer; evaluate_path() denies tracked/non-gitignored in-repo targets.
        # IT-ops markers are intentionally NOT consulted here — they waive ticket/baton
        # ceremony only, never the canonical-main read-only policy.
        for target in shell_write_targets(joined):
            allowed, reason = evaluate_path(target, cwd)
            if not allowed:
                return emit("deny",
                    f"Canonical-main read-only (#2995): shell write to '{target}' rejected. {reason} "
                    "IT-ops markers do NOT authorize tracked-file edits in main — use a dedicated "
                    "worktree (devenv-ops-<team-or-ticket>/) + ticket branch.")
    m = RE_BRANCH_CREATE.search(joined)
    if m and not BRANCH_VALID.match(m.group(1)):
        return emit("deny",f"Branch '{m.group(1)}' violates naming. Use feat/<ticket#>-desc.")
    if any(marker in joined for marker in runtime_hook_paths()):
        # Epic #3392 #3403 (S6): adjudicate-first. Benign hook read / governed deploy → fall
        # through (proceed); only a direct ungoverned hook MUTATION reaches the human carve-out.
        if classify_hook_mutation(joined) == "ask":
            return emit("ask", "Direct ungoverned hook-script mutation detected. Manual approval "
                        "required — review for policy weakening (Epic #3392 security carve-out).",
                        "Review for policy weakening.")
    if RE_GIT_COMMIT.search(joined):
        bypass, marker = detect_it_ops_bypass(joined)
        if bypass:
            _emit_it_bypass_telemetry(marker, cwd)
            return emit("allow", f"IT-ops commit bypass (#2142): {marker}")
        if not RE_ISSUE_REF.search(joined):
            return emit("deny","Commit blocked: no issue ref (#N). Link a ticket first.")
        branch = current_branch(cwd)
        match = RE_BRANCH_TICKET.match(branch or "")
        if match:
            expected = f"#{match.group(2)}"
            refs = RE_ISSUE_REF.findall(joined)
            if expected not in refs:
                return emit("deny", f"Commit blocked: branch ticket {expected} must be referenced in commit message.")
            mismatched = sorted({ref for ref in refs if ref != expected})
            if mismatched:
                return emit("deny", f"Commit blocked: one branch = one ticket. Remove mismatched refs: {', '.join(mismatched)}")
    if RE_GIT_PUSH.search(joined):
        # #2878: merged-branch-guard — block pushes to already-merged branches.
        branch = current_branch(cwd)
        if branch:
            merged_pr = check_merged_pr(branch, cwd)
            if merged_pr:
                return emit("deny", f"Push blocked: branch '{branch}' was already merged via PR #{merged_pr}. Check out a new branch from main.")
        if not ops.get("commit"):
            # #3168: the session cwd is often the main checkout (on `main`, no ticket
            # commits) while the work lives in a linked worktree. Resolve the pushed
            # branch's worktree and accept the commit step there (worktree state OR a
            # real commit ahead of base) rather than falsely blocking the push.
            from worktree_push_gate import commit_step_satisfied
            from state_store import load_state
            satisfied, used_worktree = commit_step_satisfied(
                joined, cwd, ops.get("commit"), load_state)
            if not satisfied:
                return emit("deny", "Push blocked: commit step first (Admin sequencing).")
            if used_worktree:
                _emit_worktree_push_desync(cwd)
    if RE_PR_MERGE.search(joined):
        override = require_bypass_exception(joined, state, cwd)
        if override:
            return emit("deny", "Admin-override merge blocked (#2706): record the Epic #2517 exception "
                        "FIRST - add the 'merge-bypass:admin-exception' label (or a BLOCKER_NOTE with "
                        "bypass_reason: + approver:), THEN re-run the override merge.")
        if not ops.get("pr_create"):
            # #3344: the cwd-keyed admin_ops.pr_create flag is lost to cwd-churn,
            # producing a false "PR creation not recorded" block on a genuine,
            # CI-green PR. Before blocking, verify a real OPEN PR exists for the
            # merge ref (read-only). Allow ONLY on a confirmed-OPEN PR; fail-CLOSED
            # (retain the block) when there is no PR or gh is indeterminate.
            pr_ref_for_verify = RE_PR_REF.search(joined)
            pr_ref_value = pr_ref_for_verify.group(1) if pr_ref_for_verify else None
            if open_pr_for_ref(pr_ref_value, cwd) is not True:
                return emit("deny", "Merge blocked: PR creation not recorded and no open PR confirmed for the merge ref (read-only verify; fail-closed).")
        pr_m = RE_PR_REF.search(joined)
        if pr_m:
            ci_state = ci_gate_status_stable(pr_m.group(1), cwd)
            if ci_state == "pending-only":
                return emit("deny", "Merge blocked: required CI checks are still pending. Wait and re-check status only.")
            if ci_state in {"failing", "unknown"}:
                return emit("deny", "Merge blocked: required CI checks are not fully green (live API check).")
        elif not pr_m and not ops.get("ci_green"):
            return emit("deny","Merge blocked: CI-green not recorded.")
    if RE_VSCE_PUBLISH.search(joined) and repo_type == "vscode-extension" and flags.get("extension_touched"):
        if not ops.get("merge"): return emit("deny","Publish blocked: merge not recorded.")
    if RE_GH_RELEASE_CREATE.search(joined) and repo_type == "vscode-extension" and flags.get("extension_touched"):
        if not ops.get("publish"): return emit("deny","Release blocked: publish not recorded.")
    if RE_GH_ISSUE_CLOSE.search(joined):
        # #3266/#3569: report-only lanes (research, docs-research, docs-only, no-code-remediation)
        # are PR-less and merge-less BY DESIGN. When the tree is clean there is genuinely nothing
        # to merge, so the merge-precondition is skipped. But a REAL repo diff means there IS
        # something to merge — do NOT exempt; re-route to the full code-change baton (anti-abuse
        # guardrail C, mirrors the no-code-remediation diff-guard). The clean-tree condition is
        # load-bearing for docs lanes, which often DO produce a legitimate tracked docs diff.
        report_only_clean_exempt = False
        if no_code_lane or research_lane or docs_lane:
            dirty = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=cwd, check=False, capture_output=True, text=True,
            ).stdout.strip()
            if dirty:
                if no_code_lane:
                    return emit("deny", "No-code remediation lane invalid: repository diff detected. Move ticket to lane:code-change before closeout.")
                if research_lane:
                    return emit("deny", "lane:research invalid: repository diff detected. "
                                "Re-route ticket to lane:code-change before closeout.")
                return emit("deny", "lane:docs-research/lane:docs-only invalid: repository diff "
                            "detected. Re-route ticket to lane:code-change before closeout.")
            if research_lane or docs_lane:
                report_only_clean_exempt = True  # #3266/#3569: clean report-only lane — nothing to merge
        if not report_only_clean_exempt and flags.get("code_touched") and not ops.get("merge"): return emit("deny","Issue close blocked: merge not recorded.")
        if repo_type == "vscode-extension" and flags.get("extension_touched") and not ops.get("release_integrity"):
            return emit("deny","Issue close blocked: integrity check not recorded.")
        if "gh issue edit" not in joined and "--remove-label" not in joined:
            # Epic #3392 AC2 (S2): self-resolvable REDIRECT, not a client prompt. Normalize the
            # execution-role labels first, then close — fully operator-automatable. The
            # label-normalization governance intent is PRESERVED (anti-goal §6); only ask->deny.
            return emit("deny", "Issue close: remove execution role labels first "
                        "(gh issue edit #N --remove-label role:<X>), then close. "
                        "Operator-resolvable — no client prompt.")
    if RE_PR_CREATE.search(joined) and not RE_GIT_COMMIT.search(joined) and not ops.get("commit"):
        if not linked_issue_has_collab_handoff(cwd):
            return emit("deny","PR creation blocked: COLLABORATOR_HANDOFF not found on linked issue.")
        # Epic #3392 AC2 (S3): state-derive instead of prompting. The session admin_ops.commit flag
        # is often lost to cwd-churn / worktrees (#3344), so confirm a REAL commit ahead of base in
        # the pushed branch's worktree. Allow on a confirmed commit-ahead; else redirect to commit.
        from worktree_push_gate import branch_has_commit_ahead, resolve_push_cwd
        if branch_has_commit_ahead(resolve_push_cwd(joined, cwd)):
            return emit("allow", "PR creation: a real commit exists ahead of base (state-derived; no client prompt).")
        return emit("deny", "PR creation: commit step first (Admin sequencing). Operator-resolvable — no client prompt.")
    if RE_PR_CHECKS.search(joined) and not ops.get("pr_create"):
        # Epic #3392 AC2 (S4): checking CI status is READ-ONLY and harmless before PR creation (the
        # operator routinely polls checks on an existing PR). Allow with an advisory; no client prompt.
        return emit("allow", "CI checks before PR creation: read-only status poll — proceeding (no client prompt).")
    if RE_RELEASE_INTEGRITY.search(joined) and repo_type == "vscode-extension" and not ops.get("publish"):
        # Epic #3392 AC2 (S5): a release-integrity check is READ-ONLY verification; running it before
        # publish is a harmless precondition check. Allow with an advisory; no client prompt.
        return emit("allow", "Integrity check before publish: read-only verification — proceeding (no client prompt).")
    if RE_GIT_TAG.search(joined) and flags.get("ui_touched") and not ops.get("visual_qa"):
        return emit("deny","Tag blocked: visual QA not recorded for UI change.")
    return None

def _command_string(tool_input) -> str:
    """The executable command text only — never the tool `description`/metadata (#3471 AC3).
    Falls back to all string values when no explicit command field is present (fail-open).
    """
    if isinstance(tool_input, dict):
        for key in ("command", "cmd", "script", "commandLine", "shellCommand", "input"):
            value = tool_input.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return "\n".join(iter_strings(tool_input))


def main() -> int:
    try: payload = json.load(sys.stdin)
    except Exception: return 0
    tool = str(payload.get("tool_name",""))
    values = list(iter_strings(payload.get("tool_input",{})))
    cwd = str(payload.get("cwd","")) or str(Path.cwd())
    state = ensure_state(cwd)
    from state_store import reset_on_branch_change
    state = reset_on_branch_change(cwd, current_branch(cwd))
    blast_result = enforce_blast_radius(tool, state, cwd)
    if blast_result is not None:
        return blast_result
    anomaly_result = enforce_session_anomaly(state, cwd)
    if anomaly_result is not None:
        return anomaly_result
    flags = state.get("flags", {})
    if tool in {"create_file","apply_patch","edit_notebook_file","create_new_jupyter_notebook","replace_string_in_file","multi_replace_string_in_file","Write","Edit","MultiEdit","write_to_file","replace_file_content","multi_replace_file_content"}:
        # G-07 #2903: /memories/ write guard — block raw file-write tools from targeting
        # /memories/ paths. Legitimate memory operations MUST use the managed `memory` tool.
        # Raw writes here are an injection vector: retrieved content can trigger overwriting
        # session governance rules (ASI04 Memory Poisoning, EU Art.12).
        for path_val in iter_paths(payload.get("tool_input", {})):
            if str(path_val).startswith("/memories/") or str(path_val) == "/memories":
                return emit("deny",
                    "Write to /memories/ blocked: use the memory tool for memory operations. "
                    "Raw file writes to /memories/ are a governance injection vector (G-07, #2903).")
        # #3383 Epic #3380: guardrail-first memory-write poka-yoke (ADVISORY; never denies).
        # A deterministic-friction note SHOULD become a guardrail, not a context-growing memory
        # note. Warns (does not block); promotion to blocking is replay-eval-gated. Fail-open.
        try:
            from memory_write_guard import check_memory_write
            _note_body = "\n".join(values)
            for _mpath in iter_paths(payload.get("tool_input", {})):
                _decision, _why = check_memory_write(str(_mpath), _note_body)
                if _decision == "advise":
                    sys.stderr.write("[memory-guard advisory #3383] " + _why + "\n")
                    break
        except Exception:
            pass
        if active_ticket_is_no_code_lane(state, cwd):
            return emit("deny", "File edit blocked: lane:no-code-remediation is issue-only. Re-route ticket to lane:code-change.")
        # Canonical-main write guard: block writes whether cwd is main checkout
        # OR target path is an absolute path inside canonical-main (Refs #2945).
        _main_rt = main_checkout_root()
        for path_val in iter_paths(payload.get("tool_input", {})):
            if is_main_checkout(cwd):
                check_root = cwd
            elif path_val.startswith("/"):
                try:
                    Path(os.path.normpath(path_val)).relative_to(
                        os.path.normpath(_main_rt))
                except ValueError:
                    continue
                check_root = _main_rt  # absolute path targets canonical-main
            else:
                continue
            allowed, reason = evaluate_path(path_val, check_root)
            if not allowed:
                return emit("deny", f"Canonical-main read-only (#2107): {reason}")
        if not state.get("active_ticket"):
            from worktree_ticket import resolve_ticket_from_paths, any_path_in_governed_repo
            edit_paths = list(iter_paths(payload.get("tool_input", {})))
            # #2586: the gate keys on session cwd (main checkout); derive the real
            # active ticket from the edited file's worktree branch instead.
            # #2587: only gate paths that live inside a governed repo.
            derived = resolve_ticket_from_paths(edit_paths)
            gated = (not edit_paths) or any_path_in_governed_repo(edit_paths)
            if not derived and gated:
                return emit("deny","File edit blocked: no active ticket. Manager must reference a ticket (#N) before edits.")
        elif not flags.get("code_touched"):
            # #2876 + #3204: authoritative MANAGER_HANDOFF + collaborator phase
            if not linked_issue_has_authoritative_manager_handoff(cwd):
                return emit("deny", "File edit blocked: authoritative MANAGER_HANDOFF with matching worktree_branch required (#3204). Post Manager scope before first code edit.")
            # #3206: authoritative MH ⇒ collaborator (mirrors userprompt_gate; no "next prompt")
            if state.get("current_phase") != "collaborator":
                state["current_phase"] = "collaborator"
                save_state(state)
            if not linked_issue_has_planning_consensus(cwd):
                if os.environ.get(CONSENSUS_OVERRIDE_ENV) == "1":
                    _emit_planning_consensus_override_incident(cwd, state.get("active_ticket"))
                    return emit("allow", "Planning-consensus override accepted. Incident recorded for audit.")
                return emit("deny", "File edit blocked: planning consensus >=93 is not verified on the linked issue. Post a PLANNING_CONSENSUS PASS artifact or use audited override via MEGINGJORD_PLANNING_CONSENSUS_OVERRIDE=1.")
    if tool in {"run_in_terminal","terminal","runTerminalCommand","Bash","run_command","send_command_input"}:
        # Refs #2235 — wire #2220 detector as ADVISORY (no deny; emit incident only).
        # Refs #2236 — when MEGINGJORD_FLEET_DIRECT_BLOCK=1, enforce DENY on fleet-bypass.
        try:
            from hamr_bypass_detector import detect_bypass, emit_incident
            from hamr_fleet_direct_block import should_block, block_message, review_bypass_decision
            _joined = "\n".join(values)
            _det = detect_bypass(_joined)
            emit_incident(_det)
            _blk = should_block(_det)
            if _blk.get("block"):
                return emit("deny", block_message(_det))
            # #2933 C7: raw cross-family-provider (paid) call in a review context — keep the $0
            # cascade the default review path. DENY under the block flag; otherwise surface an
            # advisory on stderr during soak (the incident is already recorded by emit_incident
            # above, so the raw-bypass metric is captured without a second hook-JSON line).
            _rev = review_bypass_decision(_det, _joined)
            if _rev.get("flag"):
                if _rev.get("block"):
                    return emit("deny", _rev["message"])
                print(f"[review-bypass-advisory] {_rev['message']}", file=sys.stderr)
        except Exception:
            pass  # detector failure must not break pre-tool flow
        result = check_terminal(_command_string(payload.get("tool_input", {})), state, cwd)
        if result is not None: return result
    suspicious = [v for v in values if "/" in v or "." in v]
    if any(SECRET_FILE_RE.search(p) and not p.endswith(".env.example") for p in suspicious):
        # Epic #3392 #3403 (S7): adjudicate-first. Reading/sourcing a gitignored-local secret file
        # (own .env) → proceed; a tracked/committable secret-file path → ask (exposure carve-out).
        if classify_sensitive_path(suspicious, cwd) == "ask":
            return emit("ask", "Sensitive (tracked/committable) secret-file path detected. Manual "
                        "approval required — possible secret exposure (Epic #3392 carve-out).")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
