# Coding guidelines

Rules for writing or changing code, including notebooks. Cross-platform and s390x rules live in root `AGENTS.md` and `notebooks/AGENTS.md`, not here.

## Ask vs act

Ask only when the readings of a request lead to materially different code. Otherwise state the assumption in one line and proceed.

## Surgical scope

- Every changed line traces to the request.
- Before editing, list what the change reaches: callers, tests, fixtures, config. Fix the root cause once, in one place.
- Delete only what your change orphaned or broke. Mention other dead code; leave it.

## Tests

- Non-trivial logic gets one small test or assert.
- Reproduce every bug with a failing test first, then fix it.
- Tests run on `data/sample/`.
- Full red-green TDD is opt-in: use the `tdd` skill.

## The ladder

Stop at the first rung that works:

1. Is it needed at all?
2. Is it already in the code?
3. Does the stdlib cover it?
4. Does an installed dependency cover it?
5. Is it a one-liner?
6. Write the minimum code.

A few lines never justify a new dependency.

## Never cut

These stay even when the task says "minimal":

- Validation at trust boundaries.
- Error handling that prevents data loss.
- Security.
- Accessibility.

## Shortcuts

Mark each deliberate shortcut with a comment: `shortcut: <limit>, <when to upgrade>`.

## Ending a reply

End every reply with one line: what you skipped or left unchecked, plus any risks.

---

Adapted, in our own words, from [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) and [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).
