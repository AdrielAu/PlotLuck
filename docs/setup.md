# Setup

The repo works the same in Claude Code, Codex and Antigravity. Instructions live in `AGENTS.md`; skills live in `.agents/skills/`.

| Tool | Instructions | Skills | Setup needed |
|---|---|---|---|
| Codex | reads `AGENTS.md` | reads `.agents/skills/` | none |
| Antigravity (CLI and IDE) | reads `AGENTS.md` | reads `.agents/skills/` | none |
| Claude Code | `CLAUDE.md` imports `AGENTS.md` | reads `.claude/skills/` only | link below |

## Link Claude's skills to `.agents/skills`

`.claude/skills` is a local link to `.agents/skills` and is git-ignored, so each clone creates it once. Run from the repo root.

Windows (PowerShell, a junction: no admin or Developer Mode needed):

```powershell
New-Item -ItemType Directory -Force .claude | Out-Null
New-Item -ItemType Junction -Path .claude\skills -Target .agents\skills
```

macOS/Linux:

```sh
mkdir -p .claude && ln -s ../.agents/skills .claude/skills
```

Check: `.claude/skills` lists the same folders as `.agents/skills`.

## Adding agent config

- Instructions for every tool go in `AGENTS.md`. Keep `CLAUDE.md` as the single `@AGENTS.md` line.
- New skills go in `.agents/skills/<name>/SKILL.md`; record their source in `skills-lock.json`.
- Claude-only settings (`settings.json`, subagents) go in `.claude/`. Personal settings go in `.claude/settings.local.json`, which is git-ignored.

## Manual-only skills

These skills run only when a human invokes them by name. Agents must not start them on their own.

| Skill | Claude Code | Codex |
|---|---|---|
| `unslop` | `/unslop` | `$unslop` |

### Local changes to vendored skills

Re-syncing a skill from `skills-lock.json` overwrites local edits, so each one is recorded here beside its lock entry.

- `unslop` (`cursor/plugins`, `pstack/skills/unslop`, pinned content at `bc697d0`, MIT; `pstack/LICENSE` kept). The lock entry points at the repo's current `harness/pstack/claude-code/skills/unslop` copy, whose `SKILL.md` is byte-identical to `bc697d0`; `npx skills add` cannot pin a commit. Two changes:
  - `description` in `SKILL.md` is "Manual only: use only when the user types /unslop. Cuts AI tells from writing."
  - Added `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, the same shape as the other vendored skills, so Codex does not pick it up unasked.

## Optional: git-guardrails (Claude Code only)

`git-guardrails-claude-code` is a hard block on destructive git commands. Install is opt-in per person:

- Put the hook in the git-ignored `.claude/settings.local.json`, not in `settings.json`. Its scripts go in `.claude/hooks/`, also git-ignored.
- At the skill's customisation step, match the `AGENTS.md` never-list: drop plain `git push`, keep `push --force`, add `push .* main`, `clean -x`, `stash drop`, `checkout -- .`.
- Install `jq`: `winget install jqlang.jq`.
- Codex and Antigravity have no such hook. They rely on the `AGENTS.md` never-line and the `main` ruleset.

## Handoff

`claude-handoff` is for Claude Code. Codex/Antigravity: use `handoff`.
