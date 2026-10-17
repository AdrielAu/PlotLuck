# Setup

Follow this once after cloning, in order. The last step is a green `pytest`. Commands are PowerShell; the repo does not use uv.

## After cloning

1. Install Git, VS Code and Python 3.12:

   ```powershell
   winget install Git.Git
   winget install Microsoft.VisualStudioCode
   winget install Python.Python.3.12
   ```

   Open a new terminal afterwards so the tools are on `PATH`. Check: `py -3.12 --version` prints 3.12.x.
2. Clone `AdrielAu/PlotLuck`, open the folder in VS Code and accept the recommended extensions (listed in `.vscode/extensions.json`).
3. From the repo root, create the virtualenv and install the code. The extra index gives the CPU-only PyTorch build; `.[test]` also installs `pytest`.

   ```powershell
   py -3.12 -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
   pip install -e ".[test]"
   ```

   macOS/Linux: `python3.12 -m venv .venv && source .venv/bin/activate`, then the same two `pip` lines.
4. Set up your agent tool: see [Agent setup](#agent-setup).
5. In Claude Code, run the [`/memory` check](#check-claude-reads-agentsmd).
6. Last step: run `pytest`. It must pass; tests run on the sample data in `data/sample/`.

Agent worktrees (`.claude/worktrees/`) are disposable and git-ignored. Push anything you want to keep before deleting one.

## Browser flow tests

`node --test` remains dependency-free. The separate browser workflow installs isolated test tools and exercises the actual site with Chromium; it serves Leaflet and Three.js locally and does not fetch map tiles. The NN2 flow swaps the pinned WebLLM module for a stand-in with a fixed reply, so it downloads no model and needs no WebGPU.

To run it on Windows with an installed Edge browser:

```powershell
npm.cmd install --prefix "$env:TEMP/plotluck-browser-tools" --no-package-lock --no-audit --no-fund playwright@1.64.1 leaflet@1.9.4 three@0.160.0
$env:PLOTLUCK_PLAYWRIGHT = 'file:///' + $env:TEMP.Replace('\', '/') + '/plotluck-browser-tools/node_modules/playwright/index.mjs'
$env:PLOTLUCK_BROWSER = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node tests/browser/questions-flow.mjs
node tests/browser/profile-flow.mjs
node tests/browser/nn2-flow.mjs
```

Without an installed browser, install Chromium with the isolated Playwright executable and omit `PLOTLUCK_BROWSER`. On other platforms, use a `file://` URL pointing to the isolated Playwright module. These tools are test-only; the deployed site has no new package dependency.

## Agent setup

The repo works the same in Claude Code, Codex and Antigravity. Instructions live in `AGENTS.md`; skills live in `.agents/skills/`.

| Tool | Instructions | Skills | Setup needed |
|---|---|---|---|
| Codex | reads `AGENTS.md` | reads `.agents/skills/` | none |
| Antigravity (CLI and IDE) | reads `AGENTS.md` | reads `.agents/skills/` | none |
| Claude Code | reads `AGENTS.md` natively (v2.1.281+) | reads `.claude/skills/` only | link below |

### Link Claude's skills to `.agents/skills`

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

### Check Claude reads `AGENTS.md`

In Claude Code, run `/memory`. The list must include `AGENTS.md`.

### Adding agent config

- Instructions for every tool go in `AGENTS.md`. Never add a `CLAUDE.md` or `CLAUDE.local.md`.
- New skills go in `.agents/skills/<name>/SKILL.md`; record their source in `skills-lock.json`.
- Claude-only settings (`settings.json`, subagents) go in `.claude/`. Personal settings go in `.claude/settings.local.json`, which is git-ignored.

### Manual-only skills

These skills run only when a human invokes them by name. Agents must not start them on their own.

| Skill | Claude Code | Codex |
|---|---|---|
| `unslop` | `/unslop` | `$unslop` |

#### Local changes to vendored skills

Re-syncing a skill from `skills-lock.json` overwrites local edits, so each one is recorded here beside its lock entry.

- `unslop` (`cursor/plugins`, `pstack/skills/unslop`, pinned content at `bc697d0`, MIT; `pstack/LICENSE` kept). The lock entry points at the repo's current `harness/pstack/claude-code/skills/unslop` copy, whose `SKILL.md` is byte-identical to `bc697d0`; `npx skills add` cannot pin a commit. Two changes:
  - `description` in `SKILL.md` is "Manual only: use only when the user types /unslop. Cuts AI tells from writing."
  - Added `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, the same `policy.allow_implicit_invocation` shape as the other manual-only vendored skills (e.g. `handoff`, `grill-me`; shape not verified against Codex docs), so Codex does not pick it up unasked.

### Optional: git-guardrails (Claude Code only)

`git-guardrails-claude-code` is a hard block on destructive git commands. Install is opt-in per person:

- Put the hook in the git-ignored `.claude/settings.local.json`, not in `settings.json`. Its scripts go in `.claude/hooks/`, also git-ignored.
- At the skill's customisation step, match the `AGENTS.md` never-list: drop plain `git push`, keep `push --force`, add `push .* main`, `clean -x`, `stash drop`, `checkout -- .`.
- Install `jq`: `winget install jqlang.jq`.
- Codex and Antigravity have no such hook. They rely on the `AGENTS.md` never-line and the `main` ruleset.

### Handoff

A handoff compacts the current conversation into a note so a fresh agent session can continue the work. Use it when a session gets long or you switch tools.

`claude-handoff` is for Claude Code. Codex/Antigravity: use `handoff`.
