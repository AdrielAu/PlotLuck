# Karpathy guidelines and ponytail: sources and overlap

Research for issue #4 (wayfinder map #3). Checked 2026-10-17 against the GitHub API and repo files. Claims cite the repo that owns them.

## 1. Karpathy-inspired guidelines

- **What it is:** a single `CLAUDE.md` of four behavioural principles. It is not written by Karpathy. It is derived from his public post on LLM coding pitfalls (<https://x.com/karpathy/status/2015883857489522876>, linked and quoted in the repo README; the post itself was not fetched).
- **Canonical repo:** <https://github.com/multica-ai/andrej-karpathy-skills>. Created 2026-01-27, last push 2026-04-20, about 220k stars. The older URL `forrestchang/andrej-karpathy-skills` resolves to the same repo (API returns `multica-ai/...`); `plugin.json` still names author `forrestchang`.
- **Licence:** ambiguous. The GitHub API reports no licence and the tree has no `LICENSE` file. `.claude-plugin/plugin.json` and the `skills/karpathy-guidelines/SKILL.md` frontmatter both declare `MIT`. Treat as MIT-declared but unlicensed on paper. The text is short, so paraphrase rather than vendor verbatim.
- **Contents:** `CLAUDE.md`, `skills/karpathy-guidelines/SKILL.md`, `.cursor/rules/karpathy-guidelines.mdc`, `CURSOR.md`, `EXAMPLES.md`, README (en/zh), Claude plugin manifests.
- **Prescribes** (from `CLAUDE.md`):
  1. Think before coding: state assumptions, present multiple interpretations, push back, stop and ask when confused.
  2. Simplicity first: nothing beyond what was asked; no single-use abstractions; no unrequested configurability; no error handling for impossible cases; "200 lines that could be 50, rewrite".
  3. Surgical changes: do not improve adjacent code; match existing style; mention unrelated dead code, do not delete it; remove only orphans your change created; every changed line traces to the request.
  4. Goal-driven execution: turn tasks into verifiable goals (test first for bugs and validation), state a short plan with a verify step per item.
  - Stated tradeoff: biased toward caution over speed; use judgement on trivial tasks.

## 2. "ponytail"

- **Most likely referent:** <https://github.com/DietrichGebert/ponytail>, "Makes your AI agent think like the laziest senior dev in the room." Created 2026-06-12, last push 2026-10-16, latest release v5.3.2 (2026-10-16), about 165k stars. Licence: **MIT** (`LICENSE`, copyright 2026 DietrichGebert; API agrees).
- **Evidence it is the one:** it is the top result for "ponytail" plus agent skill; it is in SKILL.md format; and a third-party repo `AbdullahHameedKhan/karpathy-ponytail-skills` ("Karpathy's LLM coding guidelines merged with Ponytail's laziness ladder", 53 stars, no licence declared) exists, which matches the user's "combined hybrid" framing and treats this repo as "Ponytail".
- **Other candidates (low likelihood):** `ilindaniel/ponytail-lite` (single AGENTS.md inspired by Ponytail, MIT, 211 stars); DeepSeek Harness ports (`gongyijie85/dsh-ponytail`, `Wenaixi/dsh-ponytail`); `JayPokale/Chisle` (token-saving, overlaps in spirit). All derive from DietrichGebert/ponytail. If the user meant `ponytail-lite`, it is the closest fit to a "one AGENTS.md" doc; worth a one-line confirmation.
- **Contents:** six skills under `skills/`: `ponytail` (the always-on ruleset), `ponytail-review`, `ponytail-audit`, `ponytail-debt` (ledger of `shortcut:` comments), `ponytail-gain`, `ponytail-help`. Also rule files for about 20 agents (`.cursor`, `.windsurf`, `.clinerules`, `.kiro`, `.codex-plugin`, repo `AGENTS.md`, etc.) and an npm package. Large, with a plugin/installer surface, so vendoring all of it is heavy.
- **Prescribes** (from `skills/ponytail/SKILL.md`): act as a lazy senior dev; keep replies short and end with what was skipped or unchecked plus any risk. Before writing, read the task and list everything the change must reach (callers, tests, fixtures, config, exports). Then take the first option that fully works: (1) does it need to exist, (2) already in the codebase, (3) stdlib or platform feature, (4) installed dependency, never add one for a few lines, (5) one-liner, (6) minimum code. Rules: lazy about the solution, never about completeness; no unrequested abstraction or config; deletion beats addition; keep existing structure; comment only the why; bug fix means grep all callers and fix the root cause once; moved code keeps its validation; non-trivial new logic gets one small test or assert; known-limit shortcuts get a `shortcut: <limit>, <when to upgrade>` comment. Never cut: validation at trust boundaries, data-loss error handling, security, accessibility, hardware calibration, anything requested. Levels: lite / full (default) / ultra (also challenges the request). Session-persistent until "stop ponytail".

## 3. Overlap and conflict

| Topic | Karpathy | Ponytail | Verdict |
|---|---|---|---|
| Minimal code | Simplicity First | Ladder, "best code is code never written" | Same rule; ponytail is more concrete (reuse, stdlib, no new dependency) |
| Scope discipline | Surgical Changes | Scope = everything the change must reach | Mostly aligned; see conflict 1 |
| Asking first | Think Before Coding: ask, list interpretations | lite names smaller option; ultra pushes back; otherwise just builds | Partial conflict, see 2 |
| Verification | Goal-Driven: tests first, plan with verify steps | One small test or assert for non-trivial logic only | Karpathy stronger; ponytail lighter |
| Error handling | None for impossible scenarios | Keep validation at trust boundaries; moved code keeps handling | Compatible if "impossible" is read narrowly |
| Reply style | Not covered | Short reply plus skipped/risk line | Ponytail only |
| Review / audit / debt | Not covered | Separate skills | Ponytail only |

Conflicts:
1. **Dead code and adjacent edits.** Karpathy: leave pre-existing dead code, only mention it. Ponytail: "deletion beats addition" and fix the callers, tests and fixtures the change breaks. Resolve: delete only what your change orphans or breaks; report the rest.
2. **Ask vs act.** Karpathy stops and asks on any ambiguity (slow in a two-day hackathon). Ponytail defaults to building the smallest version and noting skips. Resolve: ask only when interpretations differ materially; otherwise state the assumption and proceed.
3. **Tests.** Karpathy implies test-first broadly; ponytail only for risky logic. Resolve with ponytail's threshold plus Karpathy's "reproduce the bug first".
4. **Persistence.** Ponytail is a session mode with levels and slash commands; Karpathy is static text. A plain doc cannot toggle levels, so drop them.

## 4. Suggested contents for the merged one-page doc (`docs/agents/coding-guidelines.md`)

Keep from Karpathy:
- Surface assumptions; ask only on material ambiguity.
- Surgical changes; every changed line traces to the request; clean only your own orphans; mention other dead code.
- Verifiable goals with a one-line plan and verify step; reproduce bugs with a test first.

Keep from ponytail:
- The ladder (needed? exists? stdlib? installed dependency? one-liner? minimum) and "no new dependency for a few lines".
- Enumerate callers, tests, fixtures and config before editing; fix the root cause once.
- The never-cut list (trust-boundary validation, data-loss handling, security).
- `shortcut: <limit>, <when to upgrade>` comments; one small test or assert for non-trivial logic.
- End-of-reply line: what was skipped or unchecked, and risks.

Drop: levels and slash commands, the review/audit/debt/gain/help skills (not needed for a two-day build; `code-review` is already vendored), per-agent rule files, plugin manifests, benchmark claims, Cursor-specific files.

Project-specific additions the doc should carry (from root `AGENTS.md`): `pathlib` for paths, LF endings, pins matching the IBM Jupyter image, check weights load on x86 after export-format changes.

Provenance: credit both sources by URL. Because the Karpathy repo has no LICENSE file, write in our own words.
