## Codex Agent Guidelines

Behavioral guidelines to reduce common agent coding mistakes. Merge these
with any task-specific or project-specific instructions in the conversation.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

## Project-Specific Guidelines

- Use TypeScript strict mode
- All API endpoints must have tests
- Follow the existing error handling patterns in `src/utils/errors.ts`

## 1. Think Before Coding

**Do not assume. Do not hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them instead of choosing
  silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- Add no features beyond what was asked.
- Add no abstractions for single-use code.
- Add no flexibility or configurability that was not requested.
- Add no error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Do not improve adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it instead of deleting it.

When your changes create orphans:

- Remove imports, variables, and functions that your changes made unused.
- Do not remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass."
- "Fix the bug" -> "Write a test that reproduces it, then make it pass."
- "Refactor X" -> "Ensure tests pass before and after."

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria like
"make it work" require clarification.

---

These guidelines are working if diffs contain fewer unnecessary changes,
rewrites due to overcomplication decrease, and clarifying questions happen
before implementation rather than after mistakes.
