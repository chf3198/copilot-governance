#!/usr/bin/env python3
"""Planning-consensus verification helpers for ticket first-edit gating."""
import json
import re
import subprocess
from pathlib import Path

RE_BRANCH_ISSUE = re.compile(r"(?:feat|fix|hotfix)/(\d+)-")
RE_ARTIFACT_PASS = re.compile(r"^##\s+.*PLANNING[_-]CONSENSUS\s+[-:]\s+PASS", re.I | re.M)
RE_ARTIFACT_ANY = re.compile(r"^##\s+.*PLANNING[_-]CONSENSUS\s+[-:]\s+(PASS|FAIL)", re.I | re.M)
RE_SCORE_ROW = re.compile(r"\|\s*(\d+)\s*\|\s*([^|]+)\|\s*\**\s*(\d+(?:\.\d+)?)\s*\**\s*\|")
RE_SIGNED_BY = re.compile(r"^Signed-by:\s*(.+)$", re.M)
RE_TEAM_MODEL = re.compile(r"^Team&Model:\s*([^\s]+)", re.M)
RE_ROLE = re.compile(r"^Role:\s*(\S+)", re.M)
TRUSTED_ASSOCIATIONS = {"OWNER", "MEMBER", "COLLABORATOR"}
DEFAULT_POLICY = {
    "threshold": 93,
    "min_models": 2,
    "require_cross_family": True,
    "agreement_band": 5,
    "max_rounds": 3,
}


def load_policy(cwd: str) -> dict:
    policy = dict(DEFAULT_POLICY)
    path = Path(cwd) / "hooks" / "consensus-policy.json"
    with path.open(encoding="utf-8") as fh:
        loaded = json.load(fh)
    policy.update({k: loaded[k] for k in DEFAULT_POLICY.keys() if k in loaded})
    return policy


def _rounds_scores_and_families(body: str) -> tuple[list[int], list[float], set[str]]:
    rounds, scores, families = [], [], set()
    for match in RE_SCORE_ROW.finditer(body):
        round_no, judge_col, score = match.groups()
        rounds.append(int(round_no))
        scores.append(float(score))
        fam_match = re.search(r"\(([^)]+)\)", judge_col)
        if fam_match:
            families.add(fam_match.group(1).strip().lower())
        else:
            families.add(judge_col.strip().lower())
    return rounds, scores, families


def _trusted_comment_author(author_association: str) -> bool:
    if not author_association:
        return False
    return author_association.upper() in TRUSTED_ASSOCIATIONS


def _signature_matches_registry(body: str, cwd: str) -> bool:
    signed = RE_SIGNED_BY.search(body or "")
    team_model = RE_TEAM_MODEL.search(body or "")
    role = RE_ROLE.search(body or "")
    if not signed or not team_model or not role:
        return False
    if role.group(1).strip().lower() != "manager":
        return False
    parsed = re.match(r"^([^:]+):([^@]+)@", team_model.group(1).strip())
    if not parsed:
        return False
    team, model = parsed.groups()
    run = subprocess.run(
        ["node", "scripts/global/agent-signature.js", "--team", team,
         "--model", model, "--role", "manager", "--format", "json"],
        cwd=cwd, check=False, capture_output=True, text=True, timeout=20,
    )
    if run.returncode != 0:
        return False
    expected = json.loads(run.stdout or "{}").get("signedBy", "").strip()
    return bool(expected and signed.group(1).strip() == expected)


def evaluate_consensus_comment(body: str, policy: dict, cwd: str = "", author_association: str = "") -> bool:
    text = body or ""
    if len(RE_ARTIFACT_ANY.findall(text)) != 1:
        return False
    if not RE_ARTIFACT_PASS.search(text):
        return False
    if not _trusted_comment_author(author_association):
        return False
    lower = text.lower()
    if "| round |" not in lower or "| judge" not in lower:
        return False
    if "Signed-by:" not in text or "Team&Model:" not in text or "Role:" not in text:
        return False
    if not cwd or not _signature_matches_registry(text, cwd):
        return False
    rounds, scores, families = _rounds_scores_and_families(text)
    if rounds and max(rounds) > int(policy["max_rounds"]):
        return False
    if len(scores) < int(policy["min_models"]):
        return False
    if any(score < float(policy["threshold"]) for score in scores):
        return False
    if (max(scores) - min(scores)) > float(policy["agreement_band"]):
        return False
    if bool(policy["require_cross_family"]) and len(families) < 2:
        return False
    return True


def issue_has_planning_consensus(ticket: int, cwd: str) -> bool:
    policy = load_policy(cwd)
    run = subprocess.run(
        ["gh", "issue", "view", str(ticket), "--json", "comments"],
        cwd=cwd, check=False, capture_output=True, text=True, timeout=20,
    )
    if run.returncode != 0:
        return False
    data = json.loads(run.stdout or "{}")
    comments = data.get("comments", [])
    return any(
        evaluate_consensus_comment(
            c.get("body", ""), policy, cwd=cwd,
            author_association=c.get("authorAssociation", ""),
        )
        for c in comments
    )


def linked_issue_has_planning_consensus(cwd: str) -> bool:
    branch = subprocess.check_output(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        text=True, stderr=subprocess.DEVNULL, cwd=cwd,
    ).strip()
    match = RE_BRANCH_ISSUE.match(branch)
    if not match:
        return True
    return issue_has_planning_consensus(int(match.group(1)), cwd)
