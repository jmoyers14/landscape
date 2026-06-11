# Landscape

Bun workspace monorepo. React frontend ⇄ tRPC ⇄ Bun backend with a tsyringe DI service layer.

```
packages/
  api/   Bun + @trpc/server (standalone HTTP), tsyringe service layer
  web/   React + Vite + Tailwind, @trpc/tanstack-react-query client
```

End-to-end type safety: `web` imports the `AppRouter` *type* from `api` via the
`@landscape/api` path alias — no codegen, no shared package.

## Setup

```bash
bun install
cp packages/api/.env.example packages/api/.env
cp packages/web/.env.example packages/web/.env   # optional
```

## Develop

```bash
bun run dev          # api (:3000) + web (:5173) together
bun run dev:api
bun run dev:web
bun run typecheck    # both packages
bun run build        # both packages
```

## Backend layout

- `src/index.ts` — server entry; resolves `ConfigService` from the container, starts the HTTP server.
- `src/trpc.ts` — `initTRPC` setup (`router`, `publicProcedure`).
- `src/context.ts` — request `Context` **type** (interfaces only, no runtime imports).
- `src/createContext.ts` — per-request `createContext`; resolves services from the container.
- `src/router.ts` — root router; exports `AppRouter`.
- `src/routers/*` — feature routers.
- `src/services/` — DI service layer:
  - `tokens.ts` — string DI tokens.
  - `index.ts` — imports `reflect-metadata`, registers services on the container.
  - `XService/XService.ts` — interface; `XServiceImpl.ts` — `@injectable()` implementation.

### Adding a service

1. Define interface + `@injectable()` impl under `src/services/MyService/`.
2. Add a token in `tokens.ts`, register it in `services/index.ts`.
3. Inject dependencies via `@inject(TOKEN)` in the constructor.
4. Resolve it in `createContext.ts` to expose on `ctx.services`.

> The `Context` type is kept separate from `createContext` on purpose: the type
> graph the web client compiles must not pull in the DI container, decorators,
> or `process.env`. Keep `context.ts` free of runtime/value imports.

### Adding a route

Add a router under `src/routers/`, then mount it in `src/router.ts`.

## No database yet

State lives in memory (see `GreetingServiceImpl`). To add a DB, introduce a
data-access service and inject it where needed — no router or client changes
required.
