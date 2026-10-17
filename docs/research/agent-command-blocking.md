# Can Codex and Antigravity block shell commands per project?

Issue: #17. Researched 2026-10-17 from official docs only. Docs were read via a summarising fetcher, not raw page text, so exact field names should be re-checked against the pages before building on them. Nothing was run; all findings are documentation-based.

## Short answer

Both tools have a checked-in, project-scoped hook mechanism that runs an arbitrary command and can deny a tool call. `block-dangerous-git.sh` can be reused in both, with a small output-format adapter. Both also have a pattern/prefix mechanism, but it is weaker here: Codex's is project-scoped, Antigravity's CLI one is user-only.

| | Codex (CLI + IDE ext.) | Antigravity (IDE / CLI / App) |
|---|---|---|
| Script hook | `PreToolUse` in `<repo>/.codex/hooks.json` or `<repo>/.codex/config.toml` | `PreToolUse` in `<workspace>/.agents/hooks.json` |
| Arbitrary script | Yes (`command` handler) | Yes (`command` handler, only type supported) |
| Project-scoped | Yes, but only once the project `.codex/` layer is trusted and the hook is reviewed/trusted (hash-based) | Yes (workspace file); no trust gate mentioned in docs |
| Deny protocol | JSON `permissionDecision: "deny"` on stdout, or exit code 2 with reason on stderr | JSON on stdout with `decision: "deny"`; exit-code blocking not documented |
| Pattern mechanism | `.codex/rules/*.rules` (Starlark `prefix_rule`, `decision = "forbidden"`), project-scoped when trusted | `permissions.deny` such as `command(git push)` in `~/.gemini/antigravity-cli/settings.json`: user-only for CLI |
| Windows | `commandWindows` override documented; otherwise unverified | Unverified for hooks; permissions page is inconsistent on Windows |

## Codex

Sources: hooks, https://developers.openai.com/codex/hooks (308-redirects to https://learn.chatgpt.com/docs/hooks); rules, https://developers.openai.com/codex/rules (redirects to https://learn.chatgpt.com/docs/agent-configuration/rules).

### Hooks (equivalent of Claude's PreToolUse hook)
- Locations loaded: `~/.codex/hooks.json` or `~/.codex/config.toml` (user); `<repo>/.codex/hooks.json` or `<repo>/.codex/config.toml` (project); plugin-bundled `hooks/hooks.json`.
- Format: JSON, or inline TOML (`[[hooks.PreToolUse]]`). Structure is event, then matcher group, then handlers. Handler `type` `command` and `mcp_tool` work; `prompt` and `agent` are parsed but skipped.
- `PreToolUse` with matcher `Bash` intercepts shell commands. A `command` handler runs a shell command with the session cwd, so a script can be reused.
- Deny output per docs: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`. Legacy `{"decision":"block","reason":"..."}` and exit code 2 with reason on stderr are also accepted.
- Trust: "Project-local hooks load only when the project `.codex/` layer is trusted." Non-managed hooks must be reviewed (`/hooks`) and trusted; trust is tied to the hook hash, so edits need re-trust. `--dangerously-bypass-hook-trust` skips it.
- Status: docs say hooks are enabled by default (`[features] hooks = false` disables); not labelled experimental.
- Caveat from docs: hooks are "a useful guardrail, not a complete enforcement boundary"; not all tools (e.g. hosted WebSearch) are covered.
- Windows: docs document a `commandWindows` / `command_windows` override and a `windows_managed_dir` setting. No explicit statement that hooks work on Windows otherwise. Unverified in practice.
- IDE extension: the docs fetched do not separately describe the extension. Assumed to share config layers; unverified.

### Rules (exec policy)
- Path: `<repo>/.codex/rules/*.rules` (also `~/.codex/rules/`). Project rules load only when the project `.codex/` layer is trusted.
- Format: Starlark `prefix_rule(pattern=["git","push"], decision="forbidden", justification="...", match=[...], not_match=[...])`. `decision` is `allow`, `prompt` or `forbidden`; the most restrictive wins.
- Pattern only: no script execution (rules are designed to run without side effects). `bash -lc` scripts that are simple `&&`/`||`/`;`/`|` chains are split and each part checked; scripts with redirection, substitution, variables, wildcards or control flow are evaluated as one invocation (so a prefix rule can be sidestepped).
- Test with `codex execpolicy check --pretty --rules <file> -- <command>`.
- Windows: not mentioned on the page. Unverified.
- The pattern is a positional prefix: `["git","push"]` blocks all pushes, not just `--force`; `git reset --hard` needs `["git","reset"]` (all resets) or a hook script.

## Antigravity

Sources: https://www.antigravity.google/docs/hooks (IDE/CLI/App tabs; old `/docs/ide/hooks` redirects here), https://www.antigravity.google/docs/permissions (CLI tab), https://www.antigravity.google/docs/agent-settings.

### Hooks
- Paths: workspace `.agents/hooks.json` (IDE, CLI, App); global `~/.gemini/config/hooks.json`; CLI also accepts hooks inside `~/.gemini/antigravity-cli/settings.json` and plugin `hooks.json`. Inspect with `/hooks` in the CLI.
- Format: JSON mapping hook name to events. Events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop`. `PreToolUse` takes a regex `matcher` on tool name (docs example uses `run_command`) and a `hooks` array of `{type:"command", command, timeout}` (default 30 s). Per-hook `"enabled": false` is supported.
- Script: yes, `command` is "the shell command to execute". Hooks receive JSON on stdin and return JSON (camelCase) on stdout.
- Block: `PreToolUse` output `decision` of `"deny"` "hard blocks execution immediately" (others: `allow`, `ask`, `auto_approve`, `force_ask`, `deny_unless_prior_grant`). Exit-code blocking is not documented.
- Project-scoped: yes via `.agents/hooks.json`. No trust prompt mentioned.
- Windows: not mentioned. Unverified. Maturity status: not stated.
- `.agents/` is already this repo's shared directory, so `.agents/hooks.json` fits.

### Permissions deny rules (pattern only)
- CLI: `permissions.deny` array in `~/.gemini/antigravity-cli/settings.json`, e.g. `"deny": ["command(git push)", "command(regex:git push.*)"]`. Docs describe this file as global only; no project-level CLI settings file documented. So not checked-in.
- Matching: word-by-word token prefix; `regex:` prefix for regex. Commands with `$(...)`, backticks or brace expansion fall back to exact full-line match. Precedence Deny > Ask > Allow.
- App: preset can be overridden per project in the app UI (Settings > Projects); this is app state, not a repo file.
- IDE: the Terminal Command Auto Execution Deny list applies only in "Always Proceed" mode and is set in IDE settings; storage location not stated and no repo file is documented.
- Windows: docs are inconsistent about whether the new permission system applies; unsplittable PowerShell/cmd commands need an exact match or `regex:`. A forum report (Feb 2026, https://discuss.ai.google.dev/t/always-proceed-terminal-command-setting-has-no-effect/127846) says the IDE Deny list misbehaved on Windows; user report, unconfirmed.

## Implications for this repo
- `block-dangerous-git.sh` reads Claude's hook JSON. Codex and Antigravity differ in stdin field names (Antigravity's tool name is `run_command`); exact stdin schemas were not captured and need checking before reuse. A thin wrapper per tool should translate the output (Codex: exit 2 or `permissionDecision`; Antigravity: `decision:"deny"` JSON).
- Teammates are on Windows and the server is s390x Linux: a `.sh` script needs Git Bash/WSL on Windows; Codex `commandWindows` can point at an alternative. Hook behaviour on Windows is unverified for both tools.
- Codex hooks need one-time trust per teammate; an untrusted `.codex/` layer loads nothing.
