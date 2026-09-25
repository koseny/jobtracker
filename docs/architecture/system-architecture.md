# System Architecture

**Baseline:** v0.1  
**Status:** PROPOSED

## Proven deployment/authentication topology

```text
User browser
   |
   +-- civilbonus.com
   |      |
   |      +-- static CivilBonus web application
   |             |
   |             +-- Firebase Web SDK
   |
   +-- Google identity flow
             |
             +-- Firebase Authentication

Source: GitHub repository
Deployment: GitHub Pages
Production domain: civilbonus.com
```

## Current boundaries

The authentication experiment is intentionally minimal. Baseline v0.1 does not establish a CivilBonus backend, application database, React/framework architecture, server-side API, or Firebase Hosting.

## Architecture rule

A new persistent store, backend/service, framework, external service, privileged API, or material deployment change requires an approved architecture decision before implementation.
