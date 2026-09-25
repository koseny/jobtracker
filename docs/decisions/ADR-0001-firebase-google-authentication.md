# ADR-0001 — Firebase Authentication with Google

**Status:** ACCEPTED  
**Date:** 2026-09-25

## Context

CivilBonus requires a user identity mechanism. A minimal end-to-end experiment was implemented and tested on the production domain.

## Decision

Use Firebase Authentication with Google as the initial CivilBonus authentication mechanism.

## Current implementation context

- Firebase project: CivilBonus
- Firebase project ID: `civilbonus-13cd1`
- production domain: `civilbonus.com`
- source/deployment repository: `koseny/jobtracker`
- deployment: GitHub Pages

No secret credentials or passwords are recorded in this ADR.

## Rationale

The experiment established that the chosen mechanism can support the required initial sign-in/sign-out flow with limited application complexity and without CivilBonus handling Google passwords.

## Consequences

- Firebase Authentication is an infrastructure dependency.
- Google is the initial identity provider.
- Authorized-domain and Firebase configuration must remain consistent with deployed environments.
- Authentication does not itself provide application authorization.
- Additional providers or replacement of Firebase require a subsequent ADR.

## Evidence

Production manual E2E validation demonstrated:
1. unauthenticated state;
2. Google authentication;
3. authenticated identity rendering;
4. sign-out;
5. restoration of unauthenticated state.
