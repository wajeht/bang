# Anti-slop provenance

Installed on 2026-09-19 from the bundled assets in
`.agents/skills/install-anti-slop/assets/anti-slop/`.

- Source repository: unknown; the supplied bundle contains no top-level repository identity.
- Source commit: unknown; the supplied skill is not tracked in this repository.
- Recoverable pristine source: `UPSTREAM.snapshot.tar.gz` beside this file, containing all 38 copied files before any local edits.
- Snapshot SHA-256: `d324c1eec61e1d282c9860d2ef4b066e0734bf3bb609cf63786eb176c44ede32`.
- Installed generic plugin: `tools/oxlint/anti-slop/index.ts`.
- Installed optional Effect plugin: `tools/oxlint/anti-slop/effect/index.ts` (not enabled; this project has no direct Effect dependency).
- Source deviations: none. Every copied file was byte-compared with its source.

## Integration

The generic plugin is registered in `vite.config.ts`. All 18 generic rules plus
`oxc/no-accumulating-spread` are errors. Existing lint rules and ignores remain.
Agent tooling and vendored plugin files are ignored by both lint and formatting.
The application TypeScript build excludes this tooling directory because these
runtime-loaded TypeScript rules use `.ts` import extensions.

`@oxlint/plugins` is pinned to 1.75.0, matching Oxlint 1.75.0 supplied by
Vite+ 0.2.7. Vite+'s own nested helper dependency is unchanged. Upgrade the
project's helper pin alongside future Oxlint upgrades.

## Nested upstream license

The copied ESLint Stylistic rule retains its original provenance and license in
`vendor/eslint-stylistic/UPSTREAM.md` and `vendor/eslint-stylistic/LICENSE`.
Its recorded source revision applies only to that nested rule, not this whole bundle.

## Updating

Extract the snapshot into a separate directory to recover this pristine base.
Compare that base, the installed files, and the incoming bundle; preserve intentional
local changes. Replace this snapshot and record the actual new source identity after
an update. Do not infer a revision from the current upstream HEAD.
