# Spending cap API: contract, version 1

`PUT /v1/groups/{groupId}/members/{userId}/spending-cap`: a group member sets or removes their own spending cap.

This file is the specification. `apps/api/test/contract/spending-cap.contract.test.ts` checks the implementation against it. If the code and this file disagree, the code is wrong. If this file is wrong, change it in a separate commit that says why, never in the same commit as the code or the tests.

## 1. Conventions

- Every endpoint in this contract lives under `/v1`.
- Requests and responses are JSON, UTF-8.
- **Money is an integer number of dong**: `capVnd`, `highestMemberSpendVnd`, `groupTotalVnd`.
- Ids are UUIDs. A `userId` is the user's Supabase Auth id (the `sub` of their access token). Ids in a path are matched without regard to case; ids in a response are lowercase.
- Timestamps are ISO 8601 strings in UTC, e.g. `2026-11-24T08:15:00.000Z`.
- Clients ignore response fields they do not know. The server ignores request fields it does not know.

## 2. Who may call it

Every request carries `Authorization: Bearer <access token>`, where the token is a Supabase Auth access token. The server accepts the token only when:

- its signature checks out against the Supabase project's signing keys;
- `exp` is in the future;
- `aud` is `authenticated`;
- `iss` is the project's Auth URL (`<SUPABASE_URL>/auth/v1`);
- `sub` is present.

The caller is the user named by `sub`. The server never reads a user id from the body or the query string.

**The ownership rule.** A user may set only **their own** cap, and only in a group they belong to:

| Caller                                            | Result                               |
| ------------------------------------------------- | ------------------------------------ |
| No token, or a token that fails any check above   | `401 unauthenticated`                |
| Not a member of the group, or no such group       | `404 not-found`                      |
| A member, and `userId` is not the caller's own id | `403 forbidden`                      |
| A member, and `userId` is the caller's own id     | the request is processed (section 5) |

No role can set another member's cap, the member who created the group included. A non-member gets `404` and never `403`, so the response does not reveal whether the group exists. A member who names someone else gets `403` whether or not that person is in the group.

## 3. Errors

Every `/v1` response with a 4xx or 5xx status, including a request for a `/v1` path or method that does not exist, is a **problem details** object (RFC 9457) with `Content-Type: application/problem+json`:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "https://ai-travel-planner.example/problems/validation",
  "title": "Invalid request",
  "status": 400,
  "detail": "1 field is invalid",
  "errors": [{ "pointer": "/capVnd", "detail": "must be an integer from 0 to 9007199254740991, or null" }]
}
```

| Member          | Rule                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`          | `https://ai-travel-planner.example/problems/` followed by a slug from the table below. No other values                                                                                                     |
| `title`         | the title from the table below                                                                                                                                                                             |
| `status`        | a number, equal to the HTTP status of the response                                                                                                                                                         |
| `detail`        | one sentence about **this** occurrence. Never a stack trace, an SQL message, a table name, a file path or a token                                                                                          |
| `errors`        | only on `validation` and `cap-above-group-total`: one entry **per problem found**, each `{ "pointer", "detail" }`, where `pointer` is a JSON Pointer into the body (`/capVnd`), or `""` for the whole body |
| `groupTotalVnd` | only on `cap-above-group-total`: the group total the cap was compared with                                                                                                                                 |

| Slug                    | Status | Title                   | When                                                                                                         |
| ----------------------- | ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `invalid-json`          | 400    | Malformed JSON          | the body is not valid JSON                                                                                   |
| `validation`            | 400    | Invalid request         | the body breaks a rule in section 5                                                                          |
| `unauthenticated`       | 401    | Authentication required | no `Authorization` header, a header that is not `Bearer <token>`, or a token that fails a check in section 2 |
| `forbidden`             | 403    | Forbidden               | the caller is a member of the group, but `userId` is not the caller's own id                                 |
| `not-found`             | 404    | Not found               | no such group, a `groupId` that is not a UUID, a caller who is not a member, or no such `/v1` path or method |
| `cap-above-group-total` | 422    | Cap above group total   | `capVnd` is larger than the group's `totalVnd`                                                               |
| `internal`              | 500    | Internal error          | anything else. `detail` is always `An unexpected error occurred.`                                            |

A `401` also carries the header `WWW-Authenticate: Bearer`.

Clients decide what to do from `type`, never from `title` or `detail`.

## 4. Resources

**SpendingCap**: one member's cap in one group, and the saved plans the cap no longer fits.

```json
{
  "groupId": "0b6c3a2e-5d1f-4c8a-9e7b-2f4d6a8c0e13",
  "userId": "7d2f9c41-8a3b-4e6d-b5c0-1e9f2a7d4c68",
  "capVnd": 600000,
  "updatedAt": "2026-11-24T08:15:00.000Z",
  "affectedPlans": [
    { "id": "c4e8a1f0-3b7d-4a29-8f6e-5d1c9b2a7e40", "highestMemberSpendVnd": 750000 }
  ]
}
```

| Field                                    | Meaning                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capVnd`                                 | the member's cap: an integer from 0 to the group's `totalVnd`, or `null` when the member has no cap of their own                                   |
| `updatedAt`                              | when `capVnd` last **changed**. A PUT that sets the value it already has leaves it as it was                                                       |
| `affectedPlans`                          | the group's saved plans that do not fit this cap (see below), ordered by `id` ascending. An empty array when every plan fits or `capVnd` is `null` |
| `affectedPlans[i].id`                    | the plan's id                                                                                                                                      |
| `affectedPlans[i].highestMemberSpendVnd` | the largest amount any one member spends in that plan, as recorded when the plan was saved                                                         |

**When a saved plan no longer fits.** The class brief's validator requires every member's spending in a group plan to stay within the lowest cap in the group. A saved plan of this group does not fit the cap when some member's spending in it, as recorded when the plan was saved, is above `capVnd`. Every such plan:

- is **never edited**: its stops, times, chosen items and amounts stay exactly as they were;
- is flagged `needsReview: true`, which shows on the plan wherever it is read;
- is listed in `affectedPlans`;
- cannot be saved or shared again until the backend validator accepts it.

Only saved plans are checked. A draft is checked by the validator when it is saved. This endpoint never clears a `needsReview` flag, even when a later PUT raises or removes the cap: a flagged plan leaves review only by passing the validator again.

A member with no cap (`capVnd` `null`) does not count when the lowest cap in the group is found, but their spending is still held to the lowest cap the other members set. When no member has a cap, only the group total applies.

## 5. `PUT /v1/groups/{groupId}/members/{userId}/spending-cap`

Request headers: `Authorization: Bearer <access token>` and `Content-Type: application/json`.

Request body:

```json
{ "capVnd": 600000 }
```

| Field    | Rule                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capVnd` | **required**. Either an integer from 0 to 9007199254740991, or `null` to remove the member's cap. No other type: the string `"600000"` is rejected, not converted |

- `capVnd` is a JSON number with no fractional part: `600000`, `600000.0` and `6e5` are the same value; `600000.5` is not an integer.
- `0` is a valid cap: the member plans to spend nothing.
- A body that is missing, empty, not sent as `application/json`, or valid JSON but not an object is a `validation` error with pointer `""`.
- A body larger than 16 KB (16,384 bytes) is a `validation` error with pointer `""`. The server stops reading at that limit and does not parse the body.

The server checks, **in this order**, and stops at the first step that fails:

1. The caller is authenticated (section 2), else `401 unauthenticated`.
2. `groupId` is a UUID, the group exists and the caller is a member, else `404 not-found`.
3. `userId` is the caller's own id, else `403 forbidden`.
4. The body is at most 16 KB, else `400 validation`, with one `errors` entry with pointer `""`.
5. A non-empty body sent as `application/json` is valid JSON, else `400 invalid-json`.
6. The body follows the table above, else `400 validation`, listing every broken rule.
7. `capVnd` is `null` or at most the group's `totalVnd`, else `422 cap-above-group-total`, with one `errors` entry with pointer `/capVnd`, and `groupTotalVnd`. Nothing is changed.
8. The cap is stored and every saved plan of the group is checked against it, in one transaction: **`200`**, with the SpendingCap as the body.

A request that fails at any step changes nothing.

Example: the group total is 4,000,000 VND.

```http
PUT /v1/groups/0b6c3a2e-5d1f-4c8a-9e7b-2f4d6a8c0e13/members/7d2f9c41-8a3b-4e6d-b5c0-1e9f2a7d4c68/spending-cap
Authorization: Bearer eyJhbGciOiJFUzI1NiIs...
Content-Type: application/json

{ "capVnd": 5000000 }
```

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://ai-travel-planner.example/problems/cap-above-group-total",
  "title": "Cap above group total",
  "status": 422,
  "detail": "The cap of 5000000 VND is above the group total of 4000000 VND",
  "errors": [{ "pointer": "/capVnd", "detail": "must be at most 4000000, the group total" }],
  "groupTotalVnd": 4000000
}
```

**Idempotency.** PUT replaces the cap with the value in the body, so repeating it is safe. A client that gets no answer (a timeout, a dropped connection) sends the same request again. Sending the same body again, with nothing else changed in between, returns `200` and the **same body**: the same `capVnd`, the same `updatedAt` and the same `affectedPlans`. No `Idempotency-Key` header is needed, and none is read.

**Concurrent edits.** Only the member can change their own cap, so the last PUT to arrive wins. Version 1 has no `If-Match`.

## 6. Versions

- **Within `/v1`, only additive changes**: a new optional request field, a new response field, a new problem type, a new endpoint. Anything else is a new version, `/v2`, and `/v1` keeps running until its `Sunset` date. That includes renaming or removing a field, changing a type or a unit, tightening a rule (for example a smaller maximum for `capVnd`), changing which status or `type` an error comes with, changing who may call the endpoint, and changing which plans count as affected.
