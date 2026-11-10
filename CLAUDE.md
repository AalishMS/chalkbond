@AGENTS.md

## Claude Code

- When orchestrating, delegate implementation and tests to subagents. Give each a short brief:
  the files to read, the single task, and done criteria (which tests pass, which commands are green).
- Always set the subagent `model` explicitly. Use `sonnet` for implementation, tests and review,
  `opus` only for a hard bug or a design call, `haiku` for read-only search and lookups. Do not
  spawn subagents for work a few Grep or Read calls can do.
- The orchestrator verifies every checkpoint itself: run `npm run check` on its own and read the
  exit code and summary. For rendering work, also open the contact-sheet PNGs from
  `npm run golden:sheet -- --png out/sheet.png`.
- Never use the Artifact tool or publish pages. Visual output is a local file (HTML, SVG, PNG);
  give its path.
