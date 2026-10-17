# LARI one-time protected-staging synthetic E2E plan

Status: NOT_EXECUTED

Execution is permitted only after the P0 migration is separately approved, applied, and catalog postconditions pass.

## Immutable execution tuple

- Product source reference: b0abd72536d665aaed334c48f69b68e1d8806942
- Accepted preview deployment: dpl_GU7az4n1kdrAYBoGLdNhmNAvQCJA
- Accepted preview target: null
- Staging database project: rwedeejhjazwjthdjzrt
- Fixture prefix: lari-c4-YYYYMMDDTHHMMSSZ-OWNER_NONCE

If an approved release-gate descendant is tested instead, record its exact Git SHA and exact protected preview deployment alongside this immutable Product reference before creating data.

## Required controlled identities

1. One synthetic guest email at an owner-controlled sink; no real customer identity.
2. One synthetic tenant-owner account dedicated to the fixture.
3. One synthetic tenant, branch, service, and staff member whose names all begin with the fixture prefix.
4. One test browser profile with no existing customer session.

Never use service-role credentials in a browser. Keep credentials in operator-controlled environment variables and do not place them in screenshots or logs.

## Authorization and preflight

The owner records a one-time authorization containing the execution tuple, fixture prefix, maximum object count, start time, expiry time, and cleanup owner. Verify:

1. Product/preview/project identities match.
2. P0 catalog postconditions are PASS.
3. Preview remains protected and has no production/custom-domain promotion.
4. The server-authoritative create_public_booking and manage-token RPCs are present.
5. No existing row uses the fixture prefix.

Absence of credentials or owner authorization means NOT_EXECUTED.

## Execution sequence

1. Discovery: in the protected exact preview, find only the synthetic tenant via the real discovery projection.
2. Booking: create one appointment through create_public_booking using a deterministic idempotency key derived from the fixture prefix. Record returned synthetic appointment ID and branch ID.
3. Token retrieval: retrieve the synthetic manage token through the normal server-generated test channel. Store it only in ephemeral operator memory; record no raw token or token hash.
4. Manage read: call get_public_appointment_by_manage_token and verify the returned appointment is the recorded synthetic appointment.
5. Mutation path: choose exactly one:
   - cancellation through cancel_public_appointment_by_manage_token, or
   - reschedule request through request_public_appointment_reschedule_by_manage_token followed by get_public_pending_reschedule_request_by_manage_token.
6. Owner review: sign in as the synthetic tenant owner, list the pending request if the reschedule path was selected, and approve or reject through the server-authoritative admin RPC.
7. Isolation: using a second controlled tenant identity or an invalid token, verify cross-tenant data and the fixture appointment are not readable or mutable.
8. Evidence: retain sanitized request IDs, HTTP status/reason codes, object UUIDs, exact SHA/deployment/project tuple, and timestamps. Never retain raw tokens, credentials, customer fields, or database URLs.

Do not substitute localStorage, mock repositories, direct table writes, or browser-edited responses.

## Bounded cleanup

Cleanup is restricted to the exact UUID allowlist recorded during this run and must execute in dependency order. Before each deletion, assert the row has the fixture prefix or belongs to the recorded synthetic tenant. Abort on any mismatch.

1. Remove test-owned outbox and audit rows by recorded appointment/change-request IDs.
2. Remove the test-owned change request and access-token row by recorded IDs without selecting token_hash.
3. Remove the synthetic appointment.
4. Remove only the synthetic staff/service/branch/tenant/account objects created by this run.
5. Verify zero remaining objects with the fixture prefix.

Cleanup does not authorize broad prefix deletion, TRUNCATE, migration rollback, or deletion of unrelated rows. If cleanup fails, preserve the exact ID allowlist and escalate to the owner; do not widen scope.

## Result states

- PASS: full sequence, isolation, and cleanup all succeed against the recorded tuple.
- FAILED_CLEANUP: functional sequence completed but any test-owned object remains.
- FAIL: any authority, behavior, isolation, or identity assertion fails.
- NOT_EXECUTED: credentials, approval, P0 completion, or protected-preview access is absent.

No result in this plan authorizes default-branch merge or production promotion.
