# ADR-0002 — React Native + Expo instead of Flutter

**Status:** accepted · 2026-08-12
**Supersedes:** spec §4 rows "Mobile", "Mobile state"; §5 `mobile/` tree; §27 mobile test rows

## Context

Spec §4 fixes mobile on Flutter 3.24 with Riverpod, `go_router`, `dio`,
`freezed` and `json_serializable`. The product owner asked whether React Native
would be more sensible given the rest of the stack.

## Decision

Build the app with **React Native via Expo (SDK 52+)**, TypeScript throughout.

| Concern | Flutter (§4) | Now |
|---|---|---|
| Framework | Flutter 3.24 | Expo / React Native |
| Routing | `go_router` | Expo Router (file-based) |
| Server state | Riverpod + `dio` | TanStack Query + the generated OpenAPI client |
| Client state | Riverpod | Zustand |
| Models | `freezed` + `json_serializable` | zod schemas from `packages/shared-types` |
| Styling | Flutter ThemeData | NativeWind, sharing the §20 token file with web |
| Offline (§18.3) | Hive / Isar | TanStack Query persistence + MMKV |
| E2E (§27) | `integration_test` + Patrol | Maestro |

## Rationale

The decisive argument is the type boundary. Spec §5 puts zod schemas and a
generated OpenAPI client in `packages/shared-types`, and §27 requires contract
tests so "mobile/web clients never break silently". With Flutter, the mobile
client cannot consume that package — the §7 enums, the §12 request/response
envelopes and the §13 state machines get hand-transcribed into Dart, and the
contract test is the only thing standing between a schema change and a runtime
crash. With React Native the same package is imported directly, so an API
change that breaks mobile fails at `pnpm typecheck` instead of in CI, or in
production.

Secondary: one language across api/web/mobile, so validation rules (§13.1
publish preconditions, §13.2 quality score) are written once and run on every
surface; and the §20 design tokens become one file consumed by Tailwind and
NativeWind rather than a CSS file plus a hand-mirrored Dart theme.

## Consequences

Flutter's advantages that we give up are real but not load-bearing here: the
media-heavy screens (§18.2 S08 gallery, S05 horizontal carousels) are within
reach of RN with `FlashList`, Reanimated and `expo-image`, which has the
blurhash placeholder support §18.3 asks for.

§18's `go_router` route table maps onto Expo Router file-for-file; the route
paths in §18.1 are preserved exactly so deep links (`onlyhorses://`) and
universal links are unaffected.

§27's mobile rows change tooling but not scope: widget tests become React
Native Testing Library, and the §24.22 core journey runs under Maestro.
