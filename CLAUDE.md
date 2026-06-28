# Landscape — Project Instructions

## About

Landscape is a project estimation and management SaaS application for
landscaping businesses. It is a monorepo with the following stack:

- **Runtime / tooling:** Bun
- **API:** tRPC, with a layered backend (data-access repositories →
  integrations adapters → services) wired together with tsyringe DI
- **Database:** MongoDB
- **Frontend:** React
- **Auth / multi-tenancy:** Clerk (an organization maps to a tenant)
- **Hosting:** Google Cloud Platform (Cloud Run)

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

## Tooling

- **Prettier formats; Biome only lints.** Prettier (run on save) owns all
  formatting. Biome runs **linter-only** (`formatter.enabled: false` in
  `biome.json`) so the two never fight. Do not enable Biome's formatter.
- Biome's linter is scoped to a single rule today (`style/useBlockStatements`,
  enforcing the brace rule above). `bun run lint` checks; `bun run lint:fix`
  auto-fixes (uses `--unsafe`, which is fine while that's the only rule — revisit
  if more rules are added).
