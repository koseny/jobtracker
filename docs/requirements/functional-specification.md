# Functional Specification

**Baseline:** v0.1  
**Status:** PROPOSED

## Requirement notation

Requirements use stable domain-prefixed IDs. Acceptance criteria use `<REQ>-AC<n>`.

## Authentication

### AUTH-001 — Google sign-in
The system shall allow an unauthenticated visitor to initiate authentication using a Google account.

### AUTH-002 — Authenticated identity
After successful authentication, the system shall establish authenticated application state and display available Google identity information including display name and email; a profile image may be displayed when supplied.

### AUTH-003 — Sign-out
The system shall allow an authenticated user to sign out and return to the unauthenticated state.

### AUTH-004 — Authentication failure
If authentication cannot be completed, the application shall remain unauthenticated and present a user-visible failure state without exposing sensitive diagnostic information.

## Scope control

No additional CivilBonus business functionality is specified by baseline v0.1. New functional requirements must be added and approved before implementation.
