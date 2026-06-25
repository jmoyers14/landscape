# Landscape — Project Instructions

Project-specific conventions for this repo. The general coding style in the
global `~/.claude/CLAUDE.md` still applies; rules here are additions or
overrides for this project.

## Coding Style

- **Always brace control-flow bodies** (`if` / `else` / `for` / `while`), even
  when the body is a single statement. No brace-less one-liners.

  ```ts
  // Good
  if (ids.length === 0) {
    return [];
  }

  // Avoid
  if (ids.length === 0) return [];
  ```
