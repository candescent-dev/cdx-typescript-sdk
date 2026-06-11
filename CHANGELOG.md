# Changelog

All notable changes to the Candescent Digital Insight TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The npm package (`@cdx-forge/di-typescript-sdk`) version and the Candescent DI OpenAPI
specification version are tracked separately. Each SDK release notes which spec file and
version it was generated from ([`candescent-dev/openapi`](https://github.com/candescent-dev/openapi/tree/v1.6.0)).

## [1.0.0] - 2026-06-17

### Version alignment

| Package | Version |
|---------|---------|
| TypeScript SDK (`@cdx-forge/di-typescript-sdk`) | **1.0.0** |
| OpenAPI spec ([`candescent-dev/openapi`](https://github.com/candescent-dev/openapi/tree/v1.6.0)) | **1.6.0** |

### Added
- Initial release of the TypeScript SDK (`@cdx-forge/di-typescript-sdk`)
- 99 API operations across 12 service areas
- Dual V1/V2 OAuth token routing with automatic token caching and refresh
- XML-to-JSON transparent response conversion
- Per-status typed error hierarchy (`AuthenticationError`, `NotFoundError`, `RateLimitError`, etc.)
- Automatic retry with exponential backoff on 408, 429, 500, 502, 503, 504
- `PageIterator` async-iterable pagination helper (supports all 4 API pagination patterns)
- Parameter validation with mutual exclusivity checks (`hostUserId` vs `loginId`)
- Operation registry for structured API metadata
- `CandescentClient.fromEnv()` — zero-config setup from environment variables
- Standalone `operations.ts` functions for serverless / Lambda deployments
- 21 runnable examples covering all operations
- `.env.example` credentials template
- `npm-publish.yaml` — publishes to npm when a version tag is pushed
- `sync-public-repo.yaml` — mirrors built SDK to public distribution repository

### Fixed
- Null-safety on subscriptions API array parsing
- `Retry-After` HTTP-date header parsing falls back to exponential backoff instead of `NaN` delay
- `institutionId` and `baseUrl` access in `PasswordGrantProvider` subclass (`protected` visibility)
- `409 Conflict` removed from auto-retry list (not a transient error)
- Content-type header correctly set to `application/json` after XML-to-JSON conversion

---
