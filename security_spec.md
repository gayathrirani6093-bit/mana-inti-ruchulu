# Security Specification

## 1. Data Invariants
1. A location document must belong to the authenticated user who is writing it.
2. Users cannot update another user's live location.
3. Users cannot write fields with invalid types (e.g. non-numeric coordinates).
4. Timestamp fields must be valid ISO-8601 strings or server-derived times.
5. Location IDs (user UIDs) must be structurally valid strings matching standard IDs.

## 2. The "Dirty Dozen" Payloads
These payloads attempt to breach secure constraints and must be rejected by Firestore Security Rules:

1. **Identity Spoofing - Write as Other User**: User `attacker` tries to write a location document under ID `victim`.
2. **Identity Spoofing - Null User**: Unauthenticated user tries to write to any user's location.
3. **Ghost Fields Injection**: Sending shadow fields (`isAdmin: true`, `verified: true`) along with standard coordinates.
4. **Incorrect DataType - Latitude**: Writing `latitude` as a string instead of a number.
5. **Incorrect DataType - Longitude**: Writing `longitude` as a string instead of a number.
6. **Incorrect DataType - Timestamp**: Writing `timestamp` as an array or map.
7. **Poisonous Path Variable**: Document ID contains malicious or extremely long characters to crash index lookups.
8. **Negative Coords Out of Range**: Latitude below -90 or above 90.
9. **Negative Longitude Out of Range**: Longitude below -180 or above 180.
10. **Null Payload Fields**: Omitting mandatory coordinates fields.
11. **Anonymity Bypass**: Modifying another user's location document while operating on an unverified user account.
12. **State Shortcut**: Manipulating historical metadata on the location document.

## 3. The Test Runner
A test file `firestore.rules.test.ts` will verify that these malicious payloads are strictly denied by the rules.
