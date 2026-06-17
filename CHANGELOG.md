# Changelog

All notable changes to Turbalance Analytics are tracked here.

This project follows a date-based release process for customer builds and uses
Conventional Commit-style change categories.

## [0.1.0] - 2026-06-16

### Added

- Productization phase audit for repo hygiene, tenant identity, production
  infrastructure, reliability, commercial readiness, and engineering process.
- Tenant-scoped collector credentials for production lakehouse deployments.
- Demo-data boundary in dashboard state, UI, workspace exports, and schema.
- Commercial GTM, support, status-page, and engineering-process docs.

### Changed

- Generated `build/` artifacts and Python bytecode are no longer tracked.
- Lakehouse production config now requires managed object storage, metadata DB,
  queue, and tenant-scoped collector credentials for production readiness.

### Security

- Historical collector credential markers were scrubbed from local history.
- Secret-like production env reports redact tenant credential maps.

