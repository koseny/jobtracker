# Domain & Data Model

**Baseline:** v0.1  
**Status:** PROPOSED

## Current model

No CivilBonus application database has been introduced.

The currently observed authentication identity is external identity-provider data. Conceptually:

```text
AuthenticatedIdentity
- provider
- provider user identifier
- display name
- email
- profile image URL (optional)
```

This conceptual object is not authorization to persist these fields.

## Pending domain modelling

Business entities, relationships, identifiers, lifecycle states, persistence ownership, retention and deletion rules must be derived from the approved product/MVP definition before a database schema is designed.
