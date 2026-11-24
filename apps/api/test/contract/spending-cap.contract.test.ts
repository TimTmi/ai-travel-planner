import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestAppHarness } from '../helpers/test-app';

// Checks the API against docs/contract/spending-cap.md. Section numbers below refer to that file.
// Every expected value is written out from the contract, not imported from src/, so a change in the
// code that breaks the contract fails here.

const PROBLEM_BASE = 'https://ai-travel-planner.example/problems/';

const PROBLEMS = {
  'invalid-json': { status: 400, title: 'Malformed JSON' },
  validation: { status: 400, title: 'Invalid request' },
  unauthenticated: { status: 401, title: 'Authentication required' },
  forbidden: { status: 403, title: 'Forbidden' },
  'not-found': { status: 404, title: 'Not found' },
  'cap-above-group-total': { status: 422, title: 'Cap above group total' },
  internal: { status: 500, title: 'Internal error' },
} as const;

type ProblemSlug = keyof typeof PROBLEMS;

const MAX_CAP_VND = Number.MAX_SAFE_INTEGER; // 9007199254740991
const MAX_BODY_BYTES = 16_384;

const ALICE = '7d2f9c41-8a3b-4e6d-b5c0-1e9f2a7d4c68'; // the caller in most tests
const BOB = '1f0e5b2a-6c4d-4e8f-9a1b-3c5d7e9f0a2b'; // another member of GROUP
const CAROL = 'a3c5e7f9-1b2d-4f6a-8c0e-2d4f6a8b0c1e'; // a member of OTHER_GROUP only
const NOBODY = 'e5f7a9b1-3c4d-4e6f-8a0b-1c2d3e4f5a6b'; // no such user

const GROUP = '0b6c3a2e-5d1f-4c8a-9e7b-2f4d6a8c0e13'; // total 4,000,000 VND: Alice and Bob
const OTHER_GROUP = '5e7a9c1b-2d4f-4a6b-8c0d-9e1f2a3b4c5d'; // Carol only
const BIG_GROUP = '9c1e3a5b-7d9f-4b2d-8e4a-6c8e0a2b4d6f'; // total 9007199254740991 VND: Alice only
const MISSING_GROUP = '2a4c6e8a-0b1c-4d3e-9f5a-7b8c9d0e1f2a'; // no such group

const GROUP_TOTAL_VND = 4_000_000;
const SEEDED_AT = '2026-01-01T00:00:00.000Z';

// Plans of GROUP. Their ids sort in a different order from the order they are created in, so a
// response that lists them in insertion order instead of by id fails.
const PLAN_750 = 'f0000000-0000-4000-8000-000000000001'; // saved, highest member spend 750,000
const PLAN_650 = '10000000-0000-4000-8000-000000000002'; // saved, 650,000
const PLAN_600 = '80000000-0000-4000-8000-000000000003'; // saved, 600,000
const PLAN_200 = '30000000-0000-4000-8000-000000000004'; // saved, 200,000
const DRAFT_900 = '00000000-0000-4000-8000-000000000005'; // draft, 900,000
const OTHER_PLAN = '00000000-0000-4000-8000-000000000006'; // saved, 950,000, in OTHER_GROUP

// expect.any returns `any`; typed as unknown so the lint rules on `any` hold.
const ANY_STRING: unknown = expect.any(String);

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function capPath(groupId: string, userId: string): string {
  return `/v1/groups/${groupId}/members/${userId}/spending-cap`;
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

function bodyOf(res: request.Response): Record<string, unknown> {
  expect(typeof res.body).toBe('object');
  return res.body as Record<string, unknown>;
}

describe('PUT /v1/groups/{groupId}/members/{userId}/spending-cap', () => {
  let harness: TestAppHarness;
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;

  beforeAll(async () => {
    harness = await createTestApp();
    aliceToken = await harness.auth.signToken({ sub: ALICE });
    bobToken = await harness.auth.signToken({ sub: BOB });
    carolToken = await harness.auth.signToken({ sub: CAROL });
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    await seed();
  });

  afterAll(async () => {
    await harness?.close();
  });

  async function seed(): Promise<void> {
    const { prisma } = harness;
    const seededAt = new Date(SEEDED_AT);
    await prisma.user.createMany({ data: [{ id: ALICE }, { id: BOB }, { id: CAROL }] });
    await prisma.group.createMany({
      data: [
        { id: GROUP, totalVnd: BigInt(GROUP_TOTAL_VND) },
        { id: OTHER_GROUP, totalVnd: 3_000_000n },
        { id: BIG_GROUP, totalVnd: BigInt(MAX_CAP_VND) },
      ],
    });
    await prisma.groupMember.createMany({
      data: [
        { groupId: GROUP, userId: ALICE, capVnd: 800_000n, updatedAt: seededAt },
        { groupId: GROUP, userId: BOB, capVnd: 900_000n, updatedAt: seededAt },
        { groupId: OTHER_GROUP, userId: CAROL, capVnd: null, updatedAt: seededAt },
        { groupId: BIG_GROUP, userId: ALICE, capVnd: null, updatedAt: seededAt },
      ],
    });
    await prisma.plan.createMany({
      data: [
        { id: PLAN_750, groupId: GROUP, status: 'SAVED', highestMemberSpendVnd: 750_000n },
        { id: PLAN_650, groupId: GROUP, status: 'SAVED', highestMemberSpendVnd: 650_000n },
        { id: PLAN_600, groupId: GROUP, status: 'SAVED', highestMemberSpendVnd: 600_000n },
        { id: PLAN_200, groupId: GROUP, status: 'SAVED', highestMemberSpendVnd: 200_000n },
        { id: DRAFT_900, groupId: GROUP, status: 'DRAFT', highestMemberSpendVnd: 900_000n },
        { id: OTHER_PLAN, groupId: OTHER_GROUP, status: 'SAVED', highestMemberSpendVnd: 950_000n },
      ],
    });
  }

  interface PutRequest {
    groupId?: string;
    userId?: string;
    /** The whole Authorization header. Defaults to Alice's token; null sends no header. */
    authorization?: string | null;
    /** A value sent as JSON. */
    json?: unknown;
    /** A body sent exactly as given. */
    raw?: string;
    /** Defaults to application/json whenever a body is sent. */
    contentType?: string;
  }

  function putCap(req: PutRequest = {}): request.Test {
    let test = request(harness.app.getHttpServer()).put(
      capPath(req.groupId ?? GROUP, req.userId ?? ALICE),
    );

    const authorization = req.authorization === undefined ? bearer(aliceToken) : req.authorization;
    if (authorization !== null) test = test.set('Authorization', authorization);

    const payload = req.raw ?? ('json' in req ? JSON.stringify(req.json) : undefined);
    if (payload !== undefined) {
      test = test.set('Content-Type', req.contentType ?? 'application/json').send(payload);
    } else if (req.contentType !== undefined) {
      test = test.set('Content-Type', req.contentType);
    }
    return test;
  }

  /** Section 3: the status, the media type and every member of a problem details body. */
  function expectProblem(res: request.Response, slug: ProblemSlug): Record<string, unknown> {
    const { status, title } = PROBLEMS[slug];
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json(;|$)/);

    const body = bodyOf(res);
    expect(body['type']).toBe(`${PROBLEM_BASE}${slug}`);
    expect(body['title']).toBe(title);
    expect(body['status']).toBe(status);
    expect(typeof body['detail']).toBe('string');
    expect(body['detail']).not.toBe('');

    if (slug === 'validation' || slug === 'cap-above-group-total') {
      const errors = body['errors'];
      expect(Array.isArray(errors)).toBe(true);
      expect((errors as unknown[]).length).toBeGreaterThan(0);
      for (const entry of errors as unknown[]) {
        expect(entry).toEqual({ pointer: ANY_STRING, detail: ANY_STRING });
      }
    } else {
      expect(body).not.toHaveProperty('errors');
    }

    if (slug !== 'cap-above-group-total') {
      expect(body).not.toHaveProperty('groupTotalVnd');
    }

    if (status === 401) {
      expect(res.headers['www-authenticate']).toMatch(/^Bearer\b/);
    }
    return body;
  }

  /** A validation problem whose errors point at exactly these places in the body. */
  function expectValidation(res: request.Response, pointers: string[]): void {
    const body = expectProblem(res, 'validation');
    const errors = body['errors'] as { pointer: string }[];
    expect(errors.map((e) => e.pointer).sort()).toEqual([...pointers].sort());
  }

  function expectSpendingCap(res: request.Response): Record<string, unknown> {
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json(;|$)/);
    const body = bodyOf(res);
    expect(typeof body['groupId']).toBe('string');
    expect(typeof body['userId']).toBe('string');
    expect(body).toHaveProperty('capVnd');
    expect(body['updatedAt']).toMatch(ISO_UTC);
    expect(Array.isArray(body['affectedPlans'])).toBe(true);
    return body;
  }

  async function storedCap(groupId: string, userId: string): Promise<bigint | null> {
    const member = await harness.prisma.groupMember.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId } },
    });
    return member.capVnd;
  }

  async function flaggedPlanIds(): Promise<string[]> {
    const plans = await harness.prisma.plan.findMany({
      where: { needsReview: true },
      orderBy: { id: 'asc' },
    });
    return plans.map((p) => p.id);
  }

  /** Makes every query on plans fail, so the request fails inside the server, then undoes it. */
  async function withPlansTableUnavailable<T>(run: () => Promise<T>): Promise<T> {
    await harness.prisma.$executeRawUnsafe('ALTER TABLE plans RENAME TO plans_unavailable');
    try {
      return await run();
    } finally {
      await harness.prisma.$executeRawUnsafe('ALTER TABLE plans_unavailable RENAME TO plans');
    }
  }

  describe('section 2: authentication', () => {
    const cases: [string, () => Promise<string | null>][] = [
      ['no Authorization header', () => Promise.resolve(null)],
      ['a header that is not Bearer', () => Promise.resolve(`Basic ${btoa('alice:secret')}`)],
      ['a Bearer header that is not a JWT', () => Promise.resolve('Bearer not-a-jwt')],
      [
        'an expired token',
        () =>
          harness.auth
            .signToken({ sub: ALICE, exp: Math.floor(Date.now() / 1000) - 60 })
            .then(bearer),
      ],
      ['a token signed with another key', () => harness.auth.signWithWrongKey(ALICE).then(bearer)],
      [
        'a token for another audience',
        () => harness.auth.signToken({ sub: ALICE, aud: 'anon' }).then(bearer),
      ],
      [
        'a token from another issuer',
        () =>
          harness.auth
            .signToken({ sub: ALICE, iss: 'https://other-project.supabase.co/auth/v1' })
            .then(bearer),
      ],
      ['a token with no sub', () => harness.auth.signToken({ sub: null }).then(bearer)],
    ];

    it.each(cases)('answers 401 unauthenticated for %s', async (_name, makeAuthorization) => {
      const res = await putCap({
        authorization: await makeAuthorization(),
        json: { capVnd: 600_000 },
      });

      expectProblem(res, 'unauthenticated');
      expect(await storedCap(GROUP, ALICE)).toBe(800_000n);
      expect(await flaggedPlanIds()).toEqual([]);
    });

    it('checks the token before the group, the user and the body', async () => {
      const res = await putCap({
        groupId: MISSING_GROUP,
        userId: BOB,
        authorization: null,
        raw: '{"capVnd":',
      });

      expectProblem(res, 'unauthenticated');
    });
  });

  describe('section 2: the ownership rule', () => {
    it('answers 404 not-found to a caller who is not a member of the group', async () => {
      const res = await putCap({
        userId: CAROL,
        authorization: bearer(carolToken),
        json: { capVnd: 100_000 },
      });

      expectProblem(res, 'not-found');
    });

    it('answers 404 not-found when the group does not exist', async () => {
      const res = await putCap({ groupId: MISSING_GROUP, json: { capVnd: 100_000 } });

      expectProblem(res, 'not-found');
    });

    it('answers 404 not-found when groupId is not a UUID', async () => {
      const res = await putCap({ groupId: 'not-a-uuid', json: { capVnd: 100_000 } });

      expectProblem(res, 'not-found');
    });

    it('does not reveal whether the group exists: a non-member gets the same answer as for a missing group', async () => {
      const nonMember = await putCap({
        groupId: GROUP,
        userId: CAROL,
        authorization: bearer(carolToken),
        json: { capVnd: 100_000 },
      });
      const missing = await putCap({
        groupId: MISSING_GROUP,
        userId: CAROL,
        authorization: bearer(carolToken),
        json: { capVnd: 100_000 },
      });

      expectProblem(nonMember, 'not-found');
      expectProblem(missing, 'not-found');
      const withoutId = (res: request.Response, groupId: string): string =>
        JSON.stringify(res.body).split(groupId).join('{groupId}');
      expect(withoutId(nonMember, GROUP)).toBe(withoutId(missing, MISSING_GROUP));
    });

    it("answers 403 forbidden when a member sets another member's cap, and changes nothing", async () => {
      const res = await putCap({ userId: BOB, json: { capVnd: 0 } });

      expectProblem(res, 'forbidden');
      expect(await storedCap(GROUP, BOB)).toBe(900_000n);
      expect(await flaggedPlanIds()).toEqual([]);
    });

    it.each([
      ['a user who is not in the group', CAROL],
      ['a user who does not exist', NOBODY],
      ['a userId that is not a UUID', 'not-a-uuid'],
    ])('answers 403 forbidden when a member names %s', async (_name, userId) => {
      const res = await putCap({ userId, json: { capVnd: 100_000 } });

      expectProblem(res, 'forbidden');
    });

    it('answers 404, not 403, to a non-member who names another user', async () => {
      const res = await putCap({
        userId: BOB,
        authorization: bearer(carolToken),
        json: { capVnd: 100_000 },
      });

      expectProblem(res, 'not-found');
    });

    it('takes the caller from the token, never from the body or the query string', async () => {
      const someoneElse = await request(harness.app.getHttpServer())
        .put(`${capPath(GROUP, BOB)}?userId=${ALICE}`)
        .set('Authorization', bearer(aliceToken))
        .send({ capVnd: 100_000, userId: ALICE });
      expectProblem(someoneElse, 'forbidden');

      const own = await putCap({ json: { capVnd: 700_000, userId: BOB } });
      expectSpendingCap(own);
      expect(await storedCap(GROUP, ALICE)).toBe(700_000n);
      expect(await storedCap(GROUP, BOB)).toBe(900_000n);
    });

    it('lets every member set their own cap', async () => {
      const res = await putCap({
        userId: BOB,
        authorization: bearer(bobToken),
        json: { capVnd: 500_000 },
      });

      expect(expectSpendingCap(res)).toMatchObject({ userId: BOB, capVnd: 500_000 });
      expect(await storedCap(GROUP, BOB)).toBe(500_000n);
    });
  });

  describe('section 3: errors on paths and methods', () => {
    it('answers 404 not-found as problem details for a method the path does not have', async () => {
      const res = await request(harness.app.getHttpServer())
        .get(capPath(GROUP, ALICE))
        .set('Authorization', bearer(aliceToken));

      expectProblem(res, 'not-found');
    });
  });

  describe('section 5: the order of checks', () => {
    it('checks membership before the body: a non-member with malformed JSON gets 404', async () => {
      const res = await putCap({
        userId: CAROL,
        authorization: bearer(carolToken),
        raw: '{"capVnd":',
      });

      expectProblem(res, 'not-found');
    });

    it("checks ownership before the body: another member's cap with malformed JSON gets 403", async () => {
      const res = await putCap({ userId: BOB, raw: '{"capVnd":' });

      expectProblem(res, 'forbidden');
    });

    it('checks the body size before parsing: an oversized body that is not JSON gets validation', async () => {
      const res = await putCap({ raw: `{"capVnd":${' '.repeat(MAX_BODY_BYTES)}` });

      expectValidation(res, ['']);
    });

    it('checks that the body is JSON before the field rules', async () => {
      const res = await putCap({ raw: '{"capVnd": "600000",' });

      expectProblem(res, 'invalid-json');
    });

    it('checks the field rules before the group total: a value above the largest integer is validation, not 422', async () => {
      const res = await putCap({ raw: '{"capVnd":9007199254740992}' });

      expectValidation(res, ['/capVnd']);
    });
  });

  describe('section 5: the body', () => {
    it('answers 400 invalid-json for a body that is not valid JSON, and changes nothing', async () => {
      const res = await putCap({ raw: '{"capVnd": 600000' });

      expectProblem(res, 'invalid-json');
      expect(await storedCap(GROUP, ALICE)).toBe(800_000n);
    });

    it.each([
      ['no body', {}],
      ['an empty body', { raw: '' }],
      [
        'a body not sent as application/json',
        { raw: '{"capVnd":600000}', contentType: 'text/plain' },
      ],
      ['a JSON array', { raw: '[600000]' }],
      ['a JSON string', { raw: '"600000"' }],
      ['a JSON number', { raw: '600000' }],
      ['JSON null', { raw: 'null' }],
      [
        'a body larger than 16 KB',
        { raw: `{"capVnd":600000,"pad":"${'a'.repeat(MAX_BODY_BYTES)}"}` },
      ],
    ] satisfies [string, PutRequest][])(
      'answers 400 validation with pointer "" for %s',
      async (_name, req) => {
        const res = await putCap(req);

        expectValidation(res, ['']);
        expect(await storedCap(GROUP, ALICE)).toBe(800_000n);
      },
    );

    it.each([
      ['missing', {}],
      ['a numeric string', { capVnd: '600000' }],
      ['negative', { capVnd: -1 }],
      ['not a whole number', { capVnd: 600_000.5 }],
      ['a boolean', { capVnd: true }],
      ['an object', { capVnd: { vnd: 600_000 } }],
      ['an array', { capVnd: [600_000] }],
    ])(
      'answers 400 validation with pointer /capVnd when capVnd is %s, and changes nothing',
      async (_name, json) => {
        const res = await putCap({ json });

        expectValidation(res, ['/capVnd']);
        expect(await storedCap(GROUP, ALICE)).toBe(800_000n);
        expect(await flaggedPlanIds()).toEqual([]);
      },
    );

    it('accepts a body of exactly 16 KB', async () => {
      const prefix = '{"capVnd":600000,"pad":"';
      const raw = `${prefix}${'a'.repeat(MAX_BODY_BYTES - prefix.length - 2)}"}`;
      expect(Buffer.byteLength(raw)).toBe(MAX_BODY_BYTES);

      const res = await putCap({ raw });

      expect(expectSpendingCap(res)).toMatchObject({ capVnd: 600_000 });
    });

    it.each(['600000.0', '6e5'])('reads %s as the integer 600000', async (literal) => {
      const res = await putCap({ raw: `{"capVnd":${literal}}` });

      expect(expectSpendingCap(res)).toMatchObject({ capVnd: 600_000 });
      expect(await storedCap(GROUP, ALICE)).toBe(600_000n);
    });

    it('accepts application/json with a charset parameter', async () => {
      const res = await putCap({
        raw: '{"capVnd":600000}',
        contentType: 'application/json; charset=utf-8',
      });

      expect(expectSpendingCap(res)).toMatchObject({ capVnd: 600_000 });
    });

    it('ignores request fields it does not know', async () => {
      const res = await putCap({ json: { capVnd: 700_000, note: 'trip to District 1' } });

      expect(expectSpendingCap(res)).toMatchObject({ capVnd: 700_000 });
    });
  });

  describe('section 5: the group total', () => {
    it('answers 422 cap-above-group-total with the group total, and changes nothing', async () => {
      const res = await putCap({ json: { capVnd: 5_000_000 } });

      const body = expectProblem(res, 'cap-above-group-total');
      expect(body['groupTotalVnd']).toBe(GROUP_TOTAL_VND);
      expect(body['errors']).toEqual([{ pointer: '/capVnd', detail: ANY_STRING }]);
      expect(await storedCap(GROUP, ALICE)).toBe(800_000n);
      expect(await flaggedPlanIds()).toEqual([]);
    });

    it('accepts a cap equal to the group total', async () => {
      const res = await putCap({ json: { capVnd: GROUP_TOTAL_VND } });

      expect(expectSpendingCap(res)).toMatchObject({ capVnd: GROUP_TOTAL_VND });
    });

    it('accepts the largest cap, 9007199254740991, when the group total allows it', async () => {
      const res = await putCap({ groupId: BIG_GROUP, json: { capVnd: MAX_CAP_VND } });

      expect(expectSpendingCap(res)).toMatchObject({ groupId: BIG_GROUP, capVnd: MAX_CAP_VND });
      expect(await storedCap(BIG_GROUP, ALICE)).toBe(BigInt(MAX_CAP_VND));
    });
  });

  describe('section 4: the SpendingCap response', () => {
    it('stores the cap and answers 200 with the SpendingCap', async () => {
      // 750,000: every saved plan of GROUP fits (PLAN_750 exactly), so none is affected.
      const res = await putCap({ json: { capVnd: 750_000 } });

      const body = expectSpendingCap(res);
      expect(body).toMatchObject({
        groupId: GROUP,
        userId: ALICE,
        capVnd: 750_000,
        affectedPlans: [],
      });
      expect(Date.parse(body['updatedAt'] as string)).toBeGreaterThan(Date.parse(SEEDED_AT));
      expect(await storedCap(GROUP, ALICE)).toBe(750_000n);
    });

    it('accepts 0 as a cap', async () => {
      const res = await putCap({ json: { capVnd: 0 } });

      expect(expectSpendingCap(res)).toMatchObject({ capVnd: 0 });
      expect(await storedCap(GROUP, ALICE)).toBe(0n);
    });

    it('removes the cap with null, and lists no affected plans', async () => {
      const res = await putCap({ json: { capVnd: null } });

      expect(expectSpendingCap(res)).toMatchObject({ capVnd: null, affectedPlans: [] });
      expect(await storedCap(GROUP, ALICE)).toBeNull();
    });

    it('matches path ids without regard to case and answers with lowercase ids', async () => {
      const res = await putCap({
        groupId: GROUP.toUpperCase(),
        userId: ALICE.toUpperCase(),
        json: { capVnd: 700_000 },
      });

      expect(expectSpendingCap(res)).toMatchObject({ groupId: GROUP, userId: ALICE });
      expect(await storedCap(GROUP, ALICE)).toBe(700_000n);
    });
  });

  describe('section 4: saved plans the cap no longer fits', () => {
    it('lists the saved plans of this group above the cap, ordered by id, with their highest member spend', async () => {
      const res = await putCap({ json: { capVnd: 600_000 } });

      const body = expectSpendingCap(res);
      // PLAN_600 fits exactly; DRAFT_900 is not saved; OTHER_PLAN is in another group.
      expect(body['affectedPlans']).toMatchObject([
        { id: PLAN_650, highestMemberSpendVnd: 650_000 },
        { id: PLAN_750, highestMemberSpendVnd: 750_000 },
      ]);
      expect((body['affectedPlans'] as unknown[]).length).toBe(2);
    });

    it('lists every saved plan with any spending when the cap is 0', async () => {
      const res = await putCap({ json: { capVnd: 0 } });

      const plans = expectSpendingCap(res)['affectedPlans'] as { id: string }[];
      expect(plans.map((p) => p.id)).toEqual([PLAN_650, PLAN_200, PLAN_600, PLAN_750]);
    });

    it('flags the affected plans needsReview and never edits them', async () => {
      const before = await harness.prisma.plan.findMany({ orderBy: { id: 'asc' } });

      expectSpendingCap(await putCap({ json: { capVnd: 600_000 } }));

      expect(await flaggedPlanIds()).toEqual([PLAN_650, PLAN_750]);
      const after = await harness.prisma.plan.findMany({ orderBy: { id: 'asc' } });
      expect(after.map((plan) => ({ ...plan, needsReview: false }))).toEqual(before);
    });

    it('never clears a needsReview flag, even when a later PUT raises or removes the cap', async () => {
      expectSpendingCap(await putCap({ json: { capVnd: 600_000 } }));

      const raised = await putCap({ json: { capVnd: 800_000 } });
      expect(expectSpendingCap(raised)).toMatchObject({ capVnd: 800_000, affectedPlans: [] });
      expect(await flaggedPlanIds()).toEqual([PLAN_650, PLAN_750]);

      const removed = await putCap({ json: { capVnd: null } });
      expect(expectSpendingCap(removed)).toMatchObject({ capVnd: null, affectedPlans: [] });
      expect(await flaggedPlanIds()).toEqual([PLAN_650, PLAN_750]);
    });
  });

  describe('section 5: idempotency', () => {
    it('answers a repeated PUT with the same body, updatedAt and affectedPlans included', async () => {
      const first = await putCap({ json: { capVnd: 600_000 } });
      const second = await putCap({ json: { capVnd: 600_000 } });

      expectSpendingCap(first);
      expectSpendingCap(second);
      expect(second.body).toEqual(first.body);
      expect(await storedCap(GROUP, ALICE)).toBe(600_000n);
      expect(await flaggedPlanIds()).toEqual([PLAN_650, PLAN_750]);
    });

    it('leaves updatedAt as it was when the PUT sets the value the cap already has', async () => {
      const res = await putCap({ json: { capVnd: 800_000 } });

      expect(expectSpendingCap(res)).toMatchObject({ capVnd: 800_000, updatedAt: SEEDED_AT });
    });

    it('moves updatedAt forward when the value changes', async () => {
      const first = expectSpendingCap(await putCap({ json: { capVnd: 700_000 } }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      const second = expectSpendingCap(await putCap({ json: { capVnd: 650_000 } }));

      expect(Date.parse(first['updatedAt'] as string)).toBeGreaterThan(Date.parse(SEEDED_AT));
      expect(Date.parse(second['updatedAt'] as string)).toBeGreaterThan(
        Date.parse(first['updatedAt'] as string),
      );
    });
  });

  describe('section 3: internal errors', () => {
    it('answers 500 internal with the fixed detail, leaks nothing, and changes nothing', async () => {
      const res = await withPlansTableUnavailable(() => putCap({ json: { capVnd: 600_000 } }));

      const body = expectProblem(res, 'internal');
      expect(body['detail']).toBe('An unexpected error occurred.');
      expect(JSON.stringify(body)).not.toMatch(/plans_unavailable|relation|prisma|sql|\bat\s/i);
      expect(await storedCap(GROUP, ALICE)).toBe(800_000n);
      expect(await flaggedPlanIds()).toEqual([]);
    });
  });
});
