# Verification & Acceptance Specification

**Baseline:** v0.1  
**Status:** PROPOSED

## Authentication acceptance

### AUTH-001-AC01
Given an unauthenticated visitor on civilbonus.com, when **Continue with Google** is selected and Google authentication succeeds, then CivilBonus enters authenticated state.

### AUTH-002-AC01
Given successful authentication, then the authenticated UI displays the available user's name and email and may display the provider profile image.

### AUTH-003-AC01
Given an authenticated user, when **Sign out** is selected, then the authenticated session ends and the normal unauthenticated UI is restored.

### AUTH-004-AC01
Given authentication fails, then CivilBonus remains unauthenticated and shows a recoverable user-facing error.

## Existing evidence

The manual end-to-end experiment performed on the production CivilBonus domain demonstrated successful Google sign-in, authenticated identity rendering, sign-out, and return to signed-out state.

## Future rule

Each implementation PR should identify the requirement IDs it implements and the acceptance evidence used to verify them. Automated tests should reference requirement/acceptance IDs where practical.
