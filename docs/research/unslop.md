# Research: pstack's `unslop` skill (issue #6)

Researched 2026-10-17 against primary sources (GitHub API, each tool's official docs). Feeds wayfinder map #3 and blocks #12.

## Answer in brief

- "pstack" is Lauren Tan's (poteto) Cursor plugin at `cursor/plugins`, directory `pstack/`. `unslop` is one skill in it.
- Licence: MIT, copyright 2026 Lauren Tan.
- It is a single `SKILL.md` (5,827 bytes, no other files). It edits text to remove AI-writing patterns.
- Claude Code honours `disable-model-invocation: true`, and unslop already ships with it. Codex needs an extra `agents/openai.yaml`. Antigravity documents no way to disable auto-triggering.

## Which "pstack"

`gh search repos pstack` returns several matches. Only the first is the origin.

| Repo | Role | Licence |
|---|---|---|
| [cursor/plugins](https://github.com/cursor/plugins) `pstack/` | Origin. `pstack/plugin.json` names author Lauren Tan, `"license": "MIT"`. | MIT (`pstack/LICENSE`) |
| [backnotprop/pstack](https://github.com/backnotprop/pstack), [michael-denyer/pstack-claude](https://github.com/michael-denyer/pstack-claude), [ericlitman/open-pstack](https://github.com/ericlitman/open-pstack), others | Third-party ports/mirrors for Claude Code, Codex etc. | MIT |
| peadar/pstack, bloomberg/pystack, z0nt/pstack | Unrelated (process stack-trace tools) | various |

Use the origin. Latest commit touching `pstack/skills/unslop` is `bc697d0a5a163cec979e362b601e36f5616083fd` (2026-10-12); plugin version then was 0.15.25. Pin to that commit.

Licence caveat: the GitHub API reports no licence for the repo root, and `cursor/plugins` has no root `LICENSE` file. The MIT text is in `pstack/LICENSE` and `pstack/plugin.json`. Keep that notice when vendoring.

## What it does to text

Frontmatter: `name: unslop`, `description: Cut AI tells from any writing.`, `disable-model-invocation: true`.

Body: "Edit text to remove AI patterns. Scan for the patterns below, then rewrite. Preserve meaning and match the intended tone." It is a numbered rule catalogue (ids are stable, gaps are intentional, other skills cite them):

- Content: superficial -ing phrases (3), vague attributions (5).
- Language: AI vocabulary such as delve/pivotal/tapestry (7), "serves as" for "is" (8), "not just X but Y" (9), rule of three (10), synonym cycling (11), false ranges (12).
- Style: no em dashes (13), colon overuse (14), boldface overuse (15), inline-header lists (16), sentence-case headings (17), no decorative emoji (18), straight quotes (19).
- Communication artifacts: chatbot phrases (20), sycophancy (22).
- Filler: filler phrases (23), hedging (24), generic conclusions (25).
- Jargon: abstract metaphor nouns such as substrate, wedge, ratchet, north star (26).
- Plain speech: say what it does (27), split dense sentences (28), active voice (29), cut adverbs (30), plain words (31), no mannered prose (32), no over-compression (33).

It is prose-only with no scripts. Plotluck caveats: rule 13 bans em dashes outright, and rule 26 bans some words that may be legitimate domain terms.

Source: [`pstack/skills/unslop/SKILL.md`](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md).

## File layout

```
cursor/plugins
  pstack/skills/unslop/SKILL.md                      # canonical, the only file
  harness/pstack/claude-code/skills/unslop/SKILL.md  # generated Claude Code copy, same frontmatter
```

Vendoring means copying one file to `.agents/skills/unslop/SKILL.md` and adding a `skills-lock.json` entry. Existing entries are all `mattpocock/skills` with `source`, `sourceType`, `skillPath`, `computedHash`; the new one would use source `cursor/plugins`, skillPath `pstack/skills/unslop/SKILL.md`. The hash tool is not identified in the repo.

Other pstack skills cite unslop (`technical-writing`, `teach`, `recall`, `poteto-mode`, `blast-radius`). None are vendored here, so there is no dangling dependency.

## Manual invocation and auto-trigger control, per tool

| Tool | Manual invocation | Project skills path | Disable auto-trigger | Stays manual as shipped? |
|---|---|---|---|---|
| Claude Code | Start the message with `/unslop` | `.claude/skills/` (docs do not mention `.agents/skills`; this repo links it locally per `docs/setup.md`) | `disable-model-invocation: true`: "Claude can't invoke the skill on its own"; description not loaded into context | Yes |
| Codex | `/skills`, or type `$unslop` | `.agents/skills` (scanned from cwd up to repo root) | `agents/openai.yaml` with `allow_implicit_invocation: false` ("Codex won't implicitly invoke the skill"). Docs do not mention `disable-model-invocation` | Not documented. Add `agents/openai.yaml` |
| Antigravity | App: `/unslop`. CLI: each skill becomes a slash command. Or name the skill in the prompt | `<workspace>/.agents/skills/` | Not documented in the skills docs or codelab | Unconfirmed |

Sources: Claude Code [skills docs](https://code.claude.com/docs/en/skills) (first 100k of ~110k characters read); Codex [skills docs](https://learn.chatgpt.com/docs/build-skills) (redirect from developers.openai.com/codex/skills); Antigravity [skills docs](https://antigravity.google/docs/skills) and [codelab](https://codelabs.developers.google.com/getting-started-with-antigravity-skills).

Codex caveat: the fetched page gave the setting name `allow_implicit_invocation` in `agents/openai.yaml` but the summary did not show the exact YAML nesting (likely under a `policy:` key). Verify before building.

## Can it be vendored without auto-triggering?

- Claude Code: yes, no change needed.
- Codex: yes, with one added file `.agents/skills/unslop/agents/openai.yaml`. It is a local addition, so record it so a re-sync does not drop it.
- Antigravity: no documented guarantee. The docs say the agent sees names and descriptions and decides from context. The description "Cut AI tells from any writing." is broad enough to fire on ordinary writing tasks. Options for #12: accept the risk; reword the description locally (for example "Manual only. Use only when the user types /unslop"), which changes the vendored hash; or test in the real tool first. No test was run here.

## Open items

- Confirm the Codex `openai.yaml` schema.
- Test whether Antigravity ignores or respects `disable-model-invocation`.
- Last ~10k characters of the Claude Code skills page were not read.
