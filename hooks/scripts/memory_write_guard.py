"""memory_write_guard (Epic #3380 / #3383): PreToolUse poka-yoke. A deterministic-friction
(guardrail-candidate) memory note may not be written WITHOUT a disposition line, while genuine
judgment/preference notes write frictionlessly. Ships ADVISORY (warns, allows); promotion to
blocking is replay-eval-gated per Phase-0 #3381 Q6. Fail-open: any error -> allow.

Runtime-agnostic shim: reads the SAME shared lexicon as scripts/global/friction-classifier.js
(config/friction-lexicon.json), so all four teams route identically (G5).
"""
import json
import os
import re

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_LEXICON_PATH = os.path.join(_REPO_ROOT, "config", "friction-lexicon.json")
_DEFECT_MARKERS = ("false-block", "false block", "misfire", "collision", "blocks",
                   "rejects", "trips", "denies", "regresses", "wrong", "stale")
_DISPOSITION_RE = re.compile(r"^\s*disposition:\s*(guardrail\s*#\d+|defer\b)", re.I | re.M)
_MEMORY_DIR_RE = re.compile(r"/memory/|MEMORY\.md$|/\.claude/.*memory")


def load_lexicon(path=None):
    try:
        with open(path or _LEXICON_PATH, encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {"mechanical": [], "judgment": []}


def _hits(text, terms):
    lower = text.lower()
    return [w for w in (terms or []) if w in lower]


# classify_note(body, lexicon?) -> destination in {guardrail-candidate, semantic-memory, skill, forget}
def classify_note(body, lexicon=None):
    try:
        lex = lexicon if lexicon is not None else load_lexicon()
        text = (body or "").strip()
        if not text:
            return "semantic-memory"
        judg = _hits(text, lex.get("judgment", []))
        if judg:  # judgment/preference WINS on collision (anti-over-route)
            return "semantic-memory"
        mech = _hits(text, lex.get("mechanical", []))
        looks_defect = any(m in text.lower() for m in _DEFECT_MARKERS)
        if mech and looks_defect:
            return "guardrail-candidate"
        return "semantic-memory"
    except Exception:
        return "semantic-memory"  # fail-open


def is_memory_path(path):
    return bool(path) and bool(_MEMORY_DIR_RE.search(path))


# check_memory_write(path, body, env?) -> (decision, reason). decision in {allow, advise}.
# ADVISORY contract: guardrail-candidate without a disposition -> advise (still allowed).
def check_memory_write(path, body, env=None):
    try:
        env = env if env is not None else os.environ
        if str(env.get("MEMORY_GUARD_BYPASS", "")) == "1":
            return ("allow", "[memory-guard bypass] MEMORY_GUARD_BYPASS=1 — audit warning, allowed")
        if not is_memory_path(path):
            return ("allow", "not a memory-dir write")
        if classify_note(body) != "guardrail-candidate":
            return ("allow", "judgment/skill/forget note — frictionless")
        if _DISPOSITION_RE.search(body or ""):
            return ("allow", "guardrail-candidate carries a disposition line")
        return ("advise", "deterministic-friction note: file a guardrail ticket "
                "(add 'disposition: guardrail #<N>') or 'disposition: defer <reason>'")
    except Exception as exc:  # fail-open: never block legitimate work
        return ("allow", "memory-guard fail-open: " + str(exc)[:80])


if __name__ == "__main__":
    import sys
    p = sys.argv[1] if len(sys.argv) > 1 else ""
    b = sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read()
    print(json.dumps(dict(zip(("decision", "reason"), check_memory_write(p, b)))))
