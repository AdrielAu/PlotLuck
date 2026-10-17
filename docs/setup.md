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
