# UX/UI Specification

**Baseline:** v0.1  
**Status:** PROPOSED

## Authentication states

### UX-AUTH-001 — Signed out
Display CivilBonus identification, a welcome/sign-in message, and a clear **Continue with Google** control.

### UX-AUTH-002 — Authentication in progress
Prevent ambiguous duplicate authentication actions while an authentication attempt is being processed where technically applicable.

### UX-AUTH-003 — Signed in
Display an authenticated state, available user identity information, and a clear **Sign out** control.

### UX-AUTH-004 — Failure
Display a concise recoverable sign-in failure message. Technical diagnostics remain developer-facing.

### UX-AUTH-005 — Signed out after session
After sign-out, restore the normal unauthenticated screen without stale authenticated identity data.

## Future UX governance

Primary navigation, information architecture, design system, responsive behaviour and accessibility criteria are not yet baselined and must be specified with the MVP.
