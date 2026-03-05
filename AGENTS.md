# AGENTS.md

Instructions for AI coding agents working on **opencode-telegram-bot** — a Telegram + Slack bot that acts as a mobile client for [OpenCode](https://opencode.ai). Single-user design; both platforms share the same session/project state.

See [PRODUCT.md](./PRODUCT.md) for functional requirements and development status.

## Build / Lint / Test commands

```bash
npm run build          # TypeScript → dist/ (runs `tsc`)
npm run lint           # ESLint with zero warnings allowed
npm run format         # Prettier auto-format src/**/*.ts
npm test               # Vitest — run all tests
npm run test:coverage  # Vitest with V8 coverage

# Run a single test file
npx vitest run tests/config.test.ts

# Run tests matching a name pattern
npx vitest run -t "parses truthy values"

# Run all tests in a directory
npx vitest run tests/bot/commands/
```

After any code change, always run: `npm run build && npm run lint && npm test`

## Tech stack

- **Language:** TypeScript 5.x (strict mode, ES2022 target, NodeNext modules)
- **Runtime:** Node.js 20+, ESM (`"type": "module"` in package.json)
- **Package manager:** npm (ignore `pnpm-lock.yaml` if present)
- **Bot frameworks:** `grammy` (Telegram), `@slack/bolt` (Slack, Socket Mode)
- **OpenCode SDK:** `@opencode-ai/sdk` — SSE event subscription, session/project management
- **Test framework:** Vitest with `vi.mock()` / `vi.stubEnv()` — tests in `tests/` mirroring `src/` structure
- **Config:** environment variables via `dotenv` (`.env` file)

## Code style

### Formatting (Prettier)

- Double quotes, semicolons, trailing commas (`all`)
- 2-space indent, 100 char print width

### ESLint rules

- `no-console: "error"` — use `logger` from `src/utils/logger.ts` instead
  - Exception: `src/utils/logger.ts` itself
- `@typescript-eslint/no-explicit-any: "warn"` — avoid `any`; use `unknown` + narrowing
- `@typescript-eslint/no-unused-vars: ["warn", { argsIgnorePattern: "^_" }]` — prefix unused args with `_`

### TypeScript

- Strict mode enabled. Never suppress errors with `as any`, `@ts-ignore`, or `@ts-expect-error`.
- All imports use `.js` extension (ESM requirement): `import { foo } from "./bar.js"`
- Prefer `const` over `let`. No `var`.
- Prefer `async/await` over `.then()` chains.
- Use `type` imports when importing only types: `import type { Foo } from "./bar.js"`

### Naming

- Files: `kebab-case.ts` (e.g., `cache-manager.ts`, `safe-background-task.ts`)
- Types/interfaces: `PascalCase` (e.g., `SessionInfo`, `BotCommandDefinition`)
- Functions/variables: `camelCase`
- Constants: `camelCase` for module-level (e.g., `const LOG_LEVELS` is an exception for lookup maps)
- Logger tags: `[Component]` prefix (e.g., `logger.info("[Slack] Bot started")`)

### Error handling

- Wrap async operations in `try/catch`.
- Log errors with context: session ID, operation type, component tag.
- Send user-friendly error messages. Never expose stack traces to users.
- Use `safeBackgroundTask()` from `src/utils/safe-background-task.ts` for fire-and-forget async work.

### Logging

```typescript
import { logger } from "../utils/logger.js";

logger.debug("[Component] Detailed diagnostics", details);  // SSE internals, polling
logger.info("[Component] Lifecycle event");                  // session start/stop
logger.warn("[Component] Recoverable issue", error);         // timeouts, retries
logger.error("[Component] Critical failure", error);         // must-fix problems
```

Default level is `info`. Never use `console.log`/`console.error` in feature code.

## Architecture

```
src/
├── app/          # Application startup (start-bot-app.ts)
├── bot/          # Telegram bot — grammY setup, commands, handlers, middleware
├── slack/        # Slack bot — Bolt handler, event routing, mrkdwn formatter
├── opencode/     # SDK client wrapper + SSE event subscription
├── summary/      # Event aggregation + Telegram MarkdownV2 formatting
├── session/      # Session state manager
├── settings/     # Persistent settings (settings.json)
├── project/      # Project manager
├── agent/        # Agent selection manager
├── model/        # Model selection manager
├── i18n/         # Localization (en, de, es, ru, zh, zh-TW)
├── process/      # OpenCode server process start/stop/status
├── runtime/      # Runtime mode, paths, CLI bootstrap
├── utils/        # Logger, error formatting, background tasks
└── config.ts     # Centralized env var config
```

**Data flow:** User message → Bot handler → Managers + OpenCode SDK → OpenCode Server → SSE events → Summary Aggregator → Bot → User

**Platform routing:** Both Telegram and Slack share the aggregator singleton. `src/slack/events.ts` patches aggregator callbacks to route output based on which platform sent the current prompt (`isSlackActive()`).

## Key conventions

### Bot commands

Centralized in `src/bot/commands/definitions.ts`. When adding a command, update that file only — it feeds both Telegram `setMyCommands` and help output. Do not duplicate command lists.

### I18n

User-facing messages go through `t()` from `src/i18n/index.ts`. Code, comments, and identifiers are always in English.

### Config

All env vars are read in `src/config.ts` via `getEnvVar(key, required)`. Telegram and Slack configs are independently optional — at least one platform must be configured.

### Tests

- Tests mirror `src/` structure under `tests/`.
- Global setup in `tests/setup.ts` resets singletons and mocks between tests.
- Use `vi.mock()` for module mocking, `vi.stubEnv()` for env vars.
- Follow Arrange–Act–Assert. Use descriptive test names.
- Dynamic config imports: `vi.resetModules()` then `await import("../src/config.js")`.

### Slack-specific

- `@slack/bolt` uses CJS default export in ESM: `import pkg from "@slack/bolt"; const { App } = pkg;`
- Slack formatting uses `mrkdwn` (not Markdown): `*bold*`, `_italic_`, `` `code` ``, ` ```block``` `
- Auth is channel-based (`SLACK_ALLOWED_CHANNEL_ID`), not user-based.

## Workflow

1. Read [PRODUCT.md](./PRODUCT.md) for scope and status.
2. Inspect existing code before adding or changing components.
3. Confirm major architecture changes or new dependencies with the user first.
4. Add or update tests for new functionality.
5. Run `npm run build && npm run lint && npm test` after changes.
6. Update checkboxes in `PRODUCT.md` when relevant tasks are completed.
7. Never create commits automatically — only when explicitly asked.
