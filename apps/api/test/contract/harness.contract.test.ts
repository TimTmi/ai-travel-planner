import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PROBLEM_BASE_URI } from '../../src/problems/problem.exception';
import { createTestApp, type TestAppHarness } from '../helpers/test-app';

describe('API harness', () => {
  let harness: TestAppHarness;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('returns RFC 9457 application/problem+json for an unknown /v1 path', async () => {
    const res = await request(harness.app.getHttpServer()).get('/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({
      type: `${PROBLEM_BASE_URI}not-found`,
      title: 'Not found',
      status: 404,
      detail: 'The requested resource was not found.',
    });
  });

  it('persists and resets User, Group, GroupMember and Plan records with BigInt VND values', async () => {
    const userId = '7d2f9c41-8a3b-4e6d-b5c0-1e9f2a7d4c68';
    const groupId = '0b6c3a2e-5d1f-4c8a-9e7b-2f4d6a8c0e13';

    await harness.prisma.user.create({ data: { id: userId } });
    await harness.prisma.group.create({
      data: {
        id: groupId,
        totalVnd: 9_007_199_254_740_991n,
        members: {
          create: { userId, capVnd: 600_000n },
        },
        plans: {
          create: { highestMemberSpendVnd: 750_000n, status: 'SAVED', needsReview: false },
        },
      },
    });

    const member = await harness.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    expect(member?.capVnd).toBe(600_000n);

    await harness.resetDatabase();
    const count = await harness.prisma.group.count();
    expect(count).toBe(0);
  });
});
