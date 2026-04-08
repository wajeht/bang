# Building Block Extraction Plan

Extract two reusable packages from Bang's monolith following the "building block economy" model: a command parser library and a bang database builder CLI.

---

## Motivation

Bang's core value lives in two framework-agnostic pieces:

1. **A command parser** — takes a raw query string (`!g python`, `@notes meeting`, `example.com`) and returns structured data (command type, trigger, search term, URL). This is useful to anyone building a bang-style search tool, browser extension, launcher, or CLI.
2. **A bang database builder** — fetches 15,000+ bang shortcuts from DuckDuckGo and Kagi, merges them by priority, and outputs a typed file. Already nearly standalone in `banger.mts`.

Both are currently buried inside the app with Express/DB coupling they don't need. Extracting them lets Bang import them as workspace packages while also letting others `npm install` them independently.

---

## Packages

### `@bang/search` — Command Parser

**What moves in (pure functions, zero dependencies):**

| Function | Current Location | Lines | Notes |
|---|---|---|---|
| `parseSearchQuery()` | `search.ts` | 278–449 | Pure. Only depends on `searchConfig` regex/charCodes — pass as config instead of closure |
| `getBangRedirectUrl()` | `search.ts` | 599–619 | Pure except `ensureHttps()` — inline the 10-line helper |
| `getSearchLimitWarning()` | `search.ts` | 451–464 | Pure. Only needs `searchLimit` config value |
| `parseReminderContent()` | `search.ts` | 621–736 | Pure except `context.utils.validation` calls — accept as config/callbacks |
| `parseReminderTiming()` | `search.ts` | 738–950 | Pure except `context.libs.dayjs.tz()` — accept dayjs instance as param |
| `searchConfig` (partial) | `search.ts` | 6–123 | Regex, charCodes, defaultSearchProviders, systemBangs. NOT directCommands (app-specific) |
| `reminderTimingConfig` | `search.ts` | 124–170 | Timing keywords, date patterns, option lists |
| `Bang` type | `type.ts` | 62–77 | Core type |
| `ReminderTimingResult` type | `type.ts` | 255–261 | Used by parseReminderTiming |
| `ReminderType`, `ReminderFrequency` | `type.ts` | 51–53 | Used by ReminderTimingResult |
| `DefaultSearchProviders` | `type.ts` | 41 | Used by searchConfig |

**What stays in the app (Express/DB-coupled):**

| Function | Why |
|---|---|
| `search()` (main handler, lines 952–1986) | Express req/res, DB queries, session, full context |
| `loadCachedTriggers()` | Session + DB |
| `invalidateTriggerCache()` | Session |
| `trackAnonymousUserSearch()` | Session mutation |
| `handleAnonymousSearch()` | Express req/res |
| `redirectWithCache()` | Express res + dayjs |
| `redirectWithAlert()` | Express res + HTML util |
| `goBackWithValidationAlert()` | Express res + HTML util |
| `goBack()` | Express res |
| `processDelayedSearch()` | Session |
| `directCommands` map | App-specific routing |
| `directCommandSearchPaths` map | App-specific routing |
| `adminOnlySearchPaths` set | App-specific auth |

**Dependency handling for extracted functions:**

- `parseSearchQuery()` — needs regex and charCodes from config. Solution: accept a config object parameter, export a `createDefaultConfig()` for convenience.
- `getBangRedirectUrl()` — calls `context.utils.util.ensureHttps()`. Solution: copy the 10-line `ensureHttps` function into the package (it's pure string manipulation with no dependencies).
- `parseReminderContent()` — calls `context.utils.validation.isUrlLike()`, `.extractUrlFromText()`, `.findDomainUrlInWords()`. Solution: accept a `validators` object parameter. Export the validation functions from the package too (they're pure, live in `validation.ts`, zero dependencies).
- `parseReminderTiming()` — calls `context.libs.dayjs.tz()` for timezone math. Solution: accept a dayjs-compatible instance as parameter. Document that consumers must bring their own dayjs with timezone plugin. This is the one external dependency.

### `@bang/banger` — Bang Database Builder

**What moves in (already standalone):**

| Function | Current Location | Lines | Notes |
|---|---|---|---|
| `mergeBangSources()` | `banger.mts` | 17–34 | Pure |
| `fetchBangsFromSource()` | `banger.mts` | 36–46 | I/O but dependency-injected via `fetcher` param |
| `generateBangFile()` | `banger.mts` | 48–51 | Pure |
| `getDefaultSources()` | `banger.mts` | 53–66 | Pure |
| `parseCliArgs()` | `banger.mts` | 68–93 | Pure |
| `buildBangs()` | `banger.mts` | 95–132 | I/O but dependency-injected via `deps` param |
| `main()` | `banger.mts` | 134–162 | CLI entry point |
| `Bang` type | `type.ts` | 62–77 | Shared with `@bang/search` |
| `BangSource` interface | `banger.mts` | 4–8 | Local type |

This package is almost a copy-paste. The only change is importing `Bang` from `@bang/search` instead of `../type.js`, and adding a `bin` entry for `npx banger`.

---

## Folder Structure

```
bang/
├── packages/
│   ├── search/                              # @bang/search
│   │   ├── src/
│   │   │   ├── index.ts                     # public API barrel export
│   │   │   ├── parser.ts                    # parseSearchQuery
│   │   │   ├── resolver.ts                  # getBangRedirectUrl, ensureHttps
│   │   │   ├── reminder.ts                  # parseReminderContent, parseReminderTiming
│   │   │   ├── validation.ts                # isValidUrl, isUrlLike, extractUrlFromText, findDomainUrlInWords
│   │   │   ├── config.ts                    # createDefaultConfig, searchConfig defaults, reminderTimingConfig
│   │   │   └── types.ts                     # Bang, ParsedQuery, ReminderTimingResult, SearchConfig, etc.
│   │   ├── tests/
│   │   │   ├── parser.test.ts               # parseSearchQuery unit tests (extracted from search.test.ts)
│   │   │   ├── resolver.test.ts             # getBangRedirectUrl unit tests
│   │   │   ├── reminder.test.ts             # parseReminderContent, parseReminderTiming unit tests
│   │   │   └── validation.test.ts           # isValidUrl, isUrlLike unit tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── banger/                              # @bang/banger
│       ├── src/
│       │   ├── index.ts                     # public API barrel export
│       │   ├── builder.ts                   # buildBangs, mergeBangSources, generateBangFile
│       │   ├── fetcher.ts                   # fetchBangsFromSource
│       │   ├── sources.ts                   # getDefaultSources
│       │   ├── cli.ts                       # parseCliArgs, main, CLI entry point
│       │   └── types.ts                     # BangSource, Dependencies (re-exports Bang from @bang/search)
│       ├── tests/
│       │   ├── builder.test.ts              # mergeBangSources, generateBangFile, buildBangs tests
│       │   ├── fetcher.test.ts              # fetchBangsFromSource tests
│       │   └── cli.test.ts                  # parseCliArgs tests
│       ├── package.json
│       └── tsconfig.json
│
├── src/                                     # app — structure unchanged
│   ├── app.ts
│   ├── config.ts
│   ├── context.ts
│   ├── server.ts
│   ├── type.ts                              # keeps app types, re-exports Bang from @bang/search
│   ├── error.ts
│   ├── libs.ts
│   ├── crons.ts
│   ├── db/
│   │   ├── bang.ts                          # still generated by @bang/banger
│   │   ├── db.ts
│   │   ├── knexfile.ts
│   │   ├── migrations/
│   │   └── seeds/
│   ├── utils/
│   │   ├── search.ts                        # CHANGED — thinner, imports from @bang/search
│   │   ├── validation.ts                    # CHANGED — re-exports @bang/search validation + adds app-specific validators
│   │   ├── auth.ts                          # unchanged
│   │   ├── banger.mts                       # REMOVED — replaced by @bang/banger
│   │   ├── ... (everything else unchanged)
│   ├── routes/                              # unchanged
│   └── tests/                               # unchanged
│
├── package.json                             # adds "workspaces": ["packages/*"]
├── tsconfig.json
└── ...
```

---

## Implementation Steps

### Phase 1: Workspace Setup

1. Add `"workspaces": ["packages/*"]` to root `package.json`
2. Create `packages/search/` and `packages/banger/` directories
3. Create `package.json` for each package:
   - `@bang/search`: zero dependencies, peer dependency on `dayjs` (optional, only needed for `parseReminderTiming`)
   - `@bang/banger`: depends on `@bang/search` (for `Bang` type only)
4. Create `tsconfig.json` for each package extending root config
5. Run `npm install` to link workspaces

### Phase 2: Extract `@bang/search`

6. Create `packages/search/src/types.ts`:
   - Move `Bang`, `ReminderTimingResult`, `ReminderType`, `ReminderFrequency`, `DefaultSearchProviders` from `src/type.ts`
   - Define new types: `ParsedQuery`, `SearchConfig`, `ReminderConfig`, `Validators`

7. Create `packages/search/src/config.ts`:
   - Extract `searchConfig` constants: regex, charCodes, defaultSearchProviders, systemBangs, searchLimit
   - Extract `reminderTimingConfig` constants
   - Export `createDefaultConfig()` factory
   - Do NOT move `directCommands`, `directCommandSearchPaths`, `adminOnlySearchPaths` — these are app-specific

8. Create `packages/search/src/validation.ts`:
   - Move pure validation functions from `src/utils/validation.ts`: `isValidUrl`, `isUrlLike`, `extractUrlFromText`, `findDomainUrlInWords`, `isOnlyLettersAndNumbers`
   - Move their regex constants: `REGEX_WWW_PREFIX`, `REGEX_EMAIL`, `REGEX_ALPHANUMERIC`, `REGEX_URL_PROTOCOL`, `REGEX_DOMAIN_PATTERN`
   - These are already pure with zero dependencies

9. Create `packages/search/src/parser.ts`:
   - Move `parseSearchQuery()` from `search.ts:278–449`
   - Change from closure over `searchConfig` to accepting `config: SearchConfig` parameter
   - Signature: `parseSearchQuery(query: string, config?: SearchConfig): ParsedQuery`
   - Default config via `createDefaultConfig()` for standalone use

10. Create `packages/search/src/resolver.ts`:
    - Move `getBangRedirectUrl()` from `search.ts:599–619`
    - Copy `ensureHttps()` from `util.ts:134–152` (10 lines, pure string manipulation)
    - Remove dependency on `context.utils.util.ensureHttps()`
    - Signature: `getBangRedirectUrl(bang: Bang, searchTerm: string): string`

11. Create `packages/search/src/reminder.ts`:
    - Move `parseReminderContent()` from `search.ts:621–736`
    - Move `parseReminderTiming()` from `search.ts:738–950`
    - Replace `context.utils.validation` calls with imported functions from `./validation.ts`
    - Replace `context.libs.dayjs.tz()` with injected dayjs parameter
    - Signatures:
      - `parseReminderContent(content: string, options?: { defaultTiming?: string }): ParsedReminder`
      - `parseReminderTiming(timeStr: string, options: { dayjs: DayjsFn; defaultTime?: string; userTimezone?: string }): ReminderTimingResult`

12. Create `packages/search/src/index.ts`:
    - Barrel export of all public API

### Phase 3: Extract `@bang/banger`

13. Create `packages/banger/src/types.ts`:
    - Move `BangSource` and `Dependencies` interfaces from `banger.mts`
    - Re-export `Bang` from `@bang/search`

14. Create `packages/banger/src/fetcher.ts`:
    - Move `fetchBangsFromSource()` from `banger.mts:36–46`

15. Create `packages/banger/src/sources.ts`:
    - Move `getDefaultSources()` from `banger.mts:53–66`

16. Create `packages/banger/src/builder.ts`:
    - Move `mergeBangSources()` from `banger.mts:17–34`
    - Move `generateBangFile()` from `banger.mts:48–51`
    - Move `buildBangs()` from `banger.mts:95–132`

17. Create `packages/banger/src/cli.ts`:
    - Move `parseCliArgs()` from `banger.mts:68–93`
    - Move `main()` from `banger.mts:134–162`
    - Add shebang (`#!/usr/bin/env node`) for `npx banger` support

18. Create `packages/banger/src/index.ts`:
    - Barrel export of all public API (excluding CLI entry point)

### Phase 4: Tests

19. Create `packages/search/tests/parser.test.ts`:
    - Extract `parseSearchQuery` tests from `src/utils/search.test.ts`
    - These become pure unit tests — no `createContext()`, no Express mocks, no DB
    - Pattern: `import { parseSearchQuery } from '../src/index'` then direct assertions
    - Cover: empty queries, bang commands (`!g python`), direct commands (`@notes`), URL detection, edge cases

20. Create `packages/search/tests/resolver.test.ts`:
    - Extract `getBangRedirectUrl` tests from `src/utils/search.test.ts`
    - Test: URL template substitution, empty search term, Kagi relative URLs, `ensureHttps` fallback

21. Create `packages/search/tests/reminder.test.ts`:
    - Extract reminder parsing/timing tests from `src/utils/search.test.ts`
    - Test: pipe-separated format, timing keywords, date parsing, URL extraction, timezone handling
    - `parseReminderTiming` tests need real `dayjs` with timezone plugin (only external dep in tests)

22. Create `packages/search/tests/validation.test.ts`:
    - Extract from `src/utils/validation.test.ts`
    - Test: isValidUrl, isUrlLike, extractUrlFromText, findDomainUrlInWords

23. Create `packages/banger/tests/builder.test.ts`:
    - Move tests from `src/utils/banger.test.mts`
    - Tests already use dependency injection (mock `fetch`, `fs`, etc.) — minimal changes

24. Create `packages/banger/tests/fetcher.test.ts`:
    - Move `fetchBangsFromSource` tests from `banger.test.mts`

25. Create `packages/banger/tests/cli.test.ts`:
    - Move `parseCliArgs` tests from `banger.test.mts`

### Phase 5: Rewire the App

26. Update `src/type.ts`:
    - Replace local `Bang`, `ReminderTimingResult`, `ReminderType`, `ReminderFrequency` definitions with re-exports from `@bang/search`
    - Keep all app-specific types as-is

27. Update `src/utils/search.ts`:
    - Import `parseSearchQuery`, `getBangRedirectUrl`, `parseReminderContent`, `parseReminderTiming`, `createDefaultConfig` from `@bang/search`
    - Keep `directCommands`, `directCommandSearchPaths`, `adminOnlySearchPaths` in `searchConfig` (app-specific)
    - `createSearch()` still returns the same public API shape — callers don't change
    - The returned `parseSearchQuery` delegates to the library
    - The returned `getBangRedirectUrl` delegates to the library
    - The returned `parseReminderContent` wraps the library function, passing validation config
    - The returned `parseReminderTiming` wraps the library function, passing dayjs instance
    - All Express/DB methods stay in place untouched

28. Update `src/utils/validation.ts`:
    - Import pure validators from `@bang/search` and re-export
    - Keep any app-specific validators (e.g., `isValidEmail` — could go either way, keeping it simple)

29. Delete `src/utils/banger.mts` — replaced by `@bang/banger`

30. Update `package.json` scripts:
    - Change `build:bang` from `tsx ./src/utils/banger.mts` to `tsx ./packages/banger/src/cli.ts` (or just `banger` if using bin)
    - Add `test:packages` script to run package tests separately

31. Update `src/utils/search.test.ts`:
    - Remove tests for pure functions that moved to packages (parser, resolver, reminder, validation)
    - Keep integration tests that test the full `search()` handler with Express mocks and DB

32. Delete `src/utils/banger.test.mts` — tests moved to `packages/banger/tests/`

### Phase 6: Verify

33. Run `npm run check` — format, lint, type-check
34. Run `npm test` — all app integration tests pass
35. Run package tests — all unit tests pass
36. Run `npm run build` — production build works
37. Run `npm run build:bang` — bang database generation works
38. Run `npm run test:browser:headless` — browser tests pass

---

## What Does NOT Change

- Route handlers (`src/routes/**`) — zero changes
- Templates (`*.html`) — zero changes
- Database layer (`src/db/`) — zero changes
- Middleware (`src/routes/middleware.ts`) — zero changes
- Context shape (`src/context.ts`) — `ctx.utils.search` still returns the same API
- Any consumer of `ctx.utils.search` — the returned object shape is identical
- The `search()` main handler — stays in the app, same logic, same file

---

## Package API Surface

### `@bang/search`

```typescript
// Parser
export function parseSearchQuery(query: string, config?: SearchConfig): ParsedQuery;

// Resolver
export function getBangRedirectUrl(bang: Bang, searchTerm: string): string;
export function ensureHttps(url: string): string;

// Reminder
export function parseReminderContent(content: string, options?: ParseReminderOptions): ParsedReminder;
export function parseReminderTiming(timeStr: string, options: ParseReminderTimingOptions): ReminderTimingResult;

// Validation
export function isValidUrl(url: string): boolean;
export function isUrlLike(str: string): boolean;
export function extractUrlFromText(text: string): ExtractedUrl | null;
export function findDomainUrlInWords(words: string[]): FoundUrl | null;
export function isOnlyLettersAndNumbers(str: string): boolean;

// Config
export function createDefaultConfig(): SearchConfig;

// Types
export type { Bang, ParsedQuery, SearchConfig, ReminderTimingResult, ReminderType, ReminderFrequency, DefaultSearchProviders, ParsedReminder, ExtractedUrl, FoundUrl };
```

### `@bang/banger`

```typescript
// Builder
export function mergeBangSources(sources: { bangs: Bang[]; priority: number }[]): Map<string, Bang>;
export function generateBangFile(bangs: Map<string, Bang>): string;
export function buildBangs(sources: BangSource[], outputPath: string, deps?: Dependencies): Promise<BuildResult>;

// Fetcher
export function fetchBangsFromSource(url: string, fetcher?: typeof fetch): Promise<Bang[]>;

// Sources
export function getDefaultSources(): BangSource[];

// CLI
export function parseCliArgs(args: string[]): ParsedArgs;
export function main(args?: string[]): Promise<void>;

// Types (re-exported from @bang/search)
export type { Bang };
export type { BangSource, Dependencies, BuildResult, ParsedArgs };
```

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Breaking app tests after extraction | Medium | Phase 5 rewires carefully. `createSearch()` return shape stays identical. Run full test suite in Phase 6. |
| Type mismatches between packages and app | Low | Single source of truth: types defined in `@bang/search`, re-exported everywhere else. |
| Workspace resolution issues | Low | npm workspaces are mature. `"workspaces": ["packages/*"]` is standard. |
| `parseReminderTiming` dayjs coupling | Low | Accept dayjs instance as parameter. App passes `context.libs.dayjs`, standalone users pass their own. No magic. |
| Circular dependency between packages | None | `@bang/banger` depends on `@bang/search` (types only). `@bang/search` has zero package deps. |
| Build script changes | Low | `build:bang` script just points to new path. Same CLI interface. |
