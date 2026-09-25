# Security Model

**Baseline:** v0.1  
**Status:** PROPOSED

## Authentication boundary

Google acts as the initial identity provider and Firebase Authentication mediates application authentication.

## Established controls

- Google provider enabled in Firebase Authentication.
- Production domain is included in Firebase authorized domains.
- CivilBonus does not handle Google passwords.
- Sign-out returns the application to unauthenticated state.

## Important distinction

Authentication answers **who the user is**. Authorization answers **what that user may do**. Baseline v0.1 proves authentication only; it does not establish an application authorization model.

## Before protected business functionality

Specify:
- authorization roles/policies;
- protected-resource enforcement point;
- data-access rules;
- privacy and retention requirements;
- secret/configuration management;
- abuse/rate-limit controls where applicable;
- security logging and incident requirements.
