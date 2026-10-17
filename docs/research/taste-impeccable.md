# Research: the "taste" and "impeccable" agent skills

Ticket: AdrielAu/PlotLuck#5 (wayfinder map #3). Researched 2026-10-17 from the upstream GitHub repos (READMEs, SKILL.md files, launcher script, GitHub API metadata).

## Summary

- **impeccable** = `pbakaus/impeccable` (Apache-2.0). One skill, `impeccable`, with 24 sub-commands including `critique`, `audit`, `polish`. This is the proofread/critique skill.
- **taste** = most likely `Leonxlnx/taste-skill` (MIT, ~98k stars). Default skill install name `design-taste-frontend`. Several lookalike "taste" repos exist, so confirm this is the one meant.
- Both are plain Agent Skills (`SKILL.md` with `name`/`description` frontmatter) and drop into `.agents/skills/<name>/`. Neither is from `mattpocock/skills`, so the `skills-lock.json` entry needs a different `source`, and the hash must be computed by tooling (see below).
- Both are stack-agnostic and fine for a static GitHub Pages site. Both need tooling on the developer machine (Node 22 + a Chromium browser for taste; a downloaded engine binary for impeccable), not at site runtime. Neither runs on the s390x server and neither needs to.
- taste v2 says "Not for dashboards or app screens"; the Plotluck map is closer to an app screen (see caveats).

## impeccable

| Item | Finding | Source |
|---|---|---|
| Repo | https://github.com/pbakaus/impeccable (pushed 2026-10-16; latest release `cli-v4.6.0`, 2026-10-15) | GitHub API |
| Licence | Apache-2.0 (`LICENSE`). `NOTICE.md` lists derived third-party content (iOS/Android reference files from `ehmo/platform-design-skills`, MIT). It started from Anthropic's `frontend-design` skill. | repo `LICENSE`, `NOTICE.md`, README |
| Skill count | 1 skill named `impeccable`, v4.6.0 per SKILL.md `metadata.version` | `.agents/skills/impeccable/SKILL.md` |
| Layout | Upstream already has `.agents/skills/impeccable/` in our layout: `SKILL.md`, `agents/` (`openai.yaml` for Codex, four `*.toml` sub-agent definitions), `reference/*.md` (one per command, plus modes, craft-floor, routing, ios/android), `scripts/` (`impeccable` sh launcher, `impeccable.cmd` for Windows, `VERSION`, `command-metadata.json`, live-browser JS, font index data) | repo tree |
| Dependencies | No Node or other runtime. The launcher runs a self-contained engine binary. It looks for `IMPECCABLE_BIN`, a sibling `bin/<os>-<arch>/impeccable`, `~/.impeccable/bin/`, then PATH; otherwise it downloads it once with `curl`/`wget` from `github.com/pbakaus/impeccable/releases/download/...` (checks a `.sha256` sidecar). Platforms: darwin, linux, windows on x64/arm64 only. Needs network on first run. | `scripts/impeccable`, README "Installation" |
| Install paths | (1) `npx impeccable install` (needs Node; detects harnesses, writes to project or global; also installs hook manifests for Claude Code, Cursor, Codex, Copilot, Grok). (2) Git submodule + `npx impeccable link`. (3) Plugin/marketplace installs. Copying `.agents/skills/impeccable/` by hand also works since the skill needs no runtime. | README |
| Invocation | `/impeccable <command> <target>`; run `/impeccable init` first (writes `PRODUCT.md`), then e.g. `/impeccable critique landing`, `/impeccable audit`, `/impeccable polish`. No argument shows a menu. Codex uses `$impeccable ...`. `pin` creates shortcuts like `/audit`. | README, SKILL.md |
| Files written into the project | `PRODUCT.md`, `DESIGN.md` (repo root), optional config/surface briefs, optional edit hooks (`.claude/settings.json`, `.codex/hooks.json`, etc.) that run a design detector after UI file edits. | README, SKILL.md, `reference/hooks.md` |
| Cross-tool | Upstream ships provider folders for `.claude`, `.codex`, `.gemini`, `.cursor` and many more. Its neutral copy is `.agents/skills/impeccable`, so Codex and Antigravity read it as-is; Claude Code needs the `.claude/skills` junction from `docs/setup.md`. Antigravity is not named in the README's provider list; it reads `.agents/skills` per our `docs/setup.md`, but hooks and sub-agents are unverified there. | repo tree, README, `docs/setup.md` |
| Stack assumption | None. Frontend design in general (web, plus native iOS/Android references). It picks a mode per surface: Persuade (landing pages), Operate (app UI, dashboards), Read (docs), Experience (portfolios). | SKILL.md |
| Other | 59 deterministic detector rules runnable from the CLI without an LLM; "live" mode iterates variants in a browser. Heavy: 24 commands, about 50 reference files. | README |

### Fit for Plotluck

`critique` (UX review with heuristic scoring) and `audit` (a11y, performance, responsive) cover the "proofread the design" job. The map page is an Operate-mode surface; any landing or about page is Persuade. The engine download means the first run needs internet and writes to `~/.impeccable/`; fine on laptops.

## taste

| Item | Finding | Source |
|---|---|---|
| Repo | https://github.com/Leonxlnx/taste-skill (pushed 2026-10-14; ~98k stars) | GitHub API |
| Licence | MIT (`LICENSE`). Example photos credited separately in `examples/v2/CREDITS.md`. | repo, README |
| Which skill | `skills/taste-skill/` (install name `design-taste-frontend`, "v2") is the default. The repo bundles 14 skills: `redesign-existing-projects`, `image-to-code`, `gpt-taste`, `high-end-visual-design`, `minimalist-ui`, `industrial-brutalist-ui`, `stitch-design-taste`, `full-output-enforcement`, three image-gen skills, plus older v1 and v2-experimental. | README "Skills" |
| Layout of default skill | `SKILL.md`, `README.md`, `scripts/` (`draw.mjs`, `assets.mjs`, `inspect.mjs`, `lint.mjs`, `lib/`), `library/*.json` (directions, palettes, type, heroes...), `references/*.md` (colour, copy, critique, imagery, layout, motion, tells...), `assets/base.css`/`base.js`, `evals/evals.json`. No `agents/openai.yaml`. | repo tree |
| Dependencies | Scripts need **Node 22+** and an installed Chrome/Edge/Chromium. No npm installs, no API keys. `assets.mjs` fetches photos from open collections (Wikimedia Commons, Openverse, Met), so it needs network. A build is described as about 30-45 min and a few hundred thousand tokens. Working files go to `.taste-skill/` in the project root. | SKILL.md, README |
| Install paths | `npx skills add https://github.com/Leonxlnx/taste-skill [--skill design-taste-frontend]` (vercel-labs `skills` CLI), Claude Code plugin marketplace, Codex plugin marketplace, or `./install.sh` symlinks. Manual copy of `skills/taste-skill/` into `.agents/skills/` should work since SKILL.md uses paths relative to the skill folder. | README |
| Invocation | Description-triggered: the agent loads it when asked to build, design, redesign or polish a landing page or public site, or to make a page look less "AI-made". No slash-command syntax defined. Six-step run: brief, argument, draw direction (script deals 3 of 20), idea, build with real imagery, browser check at three widths and a look-and-fix loop. | SKILL.md |
| Cross-tool | Generic Agent Skills format ("Agent Skills compatible" badge); ships Claude and Codex plugin manifests. Antigravity not mentioned. | README, repo tree |
| Stack assumption | None: "any stack (HTML/CSS, React, Next.js, Vue, Svelte, Astro, Tailwind)". Plain HTML/CSS/JS suits GitHub Pages. | SKILL.md frontmatter, README FAQ |
| Scope limit | "Not for dashboards or app screens"; for product UI the README points to `minimalist-ui` / `high-end-visual-design`. | SKILL.md, README FAQ |

### Fit for Plotluck

Good for a first pass at the landing, about and shell pages. The interactive core (clustered map plus score UI) is app-like, so taste v2 is a weaker match there; `minimalist-ui` or impeccable's Operate mode fits better. The 30-45 min and several-hundred-thousand-token run cost matters in a 2-day window. Its imagery step assumes open-licence photos credited on the page.

## Vendoring into this repo

Per `docs/setup.md` and `AGENTS.md`: skills go in `.agents/skills/<name>/SKILL.md`, source recorded in `skills-lock.json`. Existing entries are all `mattpocock/skills` with `sourceType: github`, `skillPath` and `computedHash`. Both new skills fit the same schema with a different `source`:

```json
"impeccable": { "source": "pbakaus/impeccable", "sourceType": "github",
  "skillPath": ".agents/skills/impeccable/SKILL.md", "computedHash": "<computed>" },
"design-taste-frontend": { "source": "Leonxlnx/taste-skill", "sourceType": "github",
  "skillPath": "skills/taste-skill/SKILL.md", "computedHash": "<computed>" }
```

Caveats:

- The lockfile format looks like the one written by the `npx skills` CLI (vercel-labs). Easiest is to run `npx skills add pbakaus/impeccable` and `npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend` and let it write the entry and hash. Not run here, and the hash algorithm is unverified, so do not hand-write hashes.
- Folder name should match the frontmatter `name` (`design-taste-frontend`, not the repo folder `taste-skill`). Keep the local folder and lock key consistent.
- `npx impeccable install` also writes provider-specific folders and hooks (`.claude/`, `.codex/`, ...). To keep the single-copy-in-`.agents/skills` rule, vendor the `.agents/skills/impeccable/` folder and skip hook installation, or accept the hooks deliberately. Hooks run the detector on every UI file edit; Codex needs approval via `/hooks`.
- Impeccable's `PRODUCT.md` and `DESIGN.md` land at repo root: a layout decision for the spec.
- Neither tool is needed on the LinuxONE server. Impeccable's binary has no s390x build, so do not run it there.
- The map says taste and impeccable are referenced only from the web area's `AGENTS.md`. Both descriptions are broad ("build, design, redesign..."), so they may auto-trigger on any frontend work, and impeccable's long description costs context in every session that lists skills. Pruning unused sub-skills (taste bundle) is sensible.

## Open questions

1. Confirm "taste" = `Leonxlnx/taste-skill` (other candidates: `senlindesign/taste-skill`, `jaytel0/taste`, `h3nryprod01/design-taste`).
2. Which taste variant: default v2 (heavy, landing-page oriented) or `minimalist-ui` / `redesign-existing-projects` (lighter, nearer to app UI)?
3. Antigravity compatibility of both skills (esp. impeccable's `agents/*.toml` sub-agents and hooks) is undocumented upstream; test once vendored.
