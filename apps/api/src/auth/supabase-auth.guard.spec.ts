import type { ExecutionContext } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalAuthEnv, type LocalAuthEnv } from '../../test/helpers/test-auth';
import { ProblemException } from '../problems/problem.exception';
import { type AuthenticatedRequest, SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseAuthService } from './supabase-auth.service';

function createContext(authorization?: string): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
  } as AuthenticatedRequest;

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('SupabaseAuthGuard', () => {
  const userId = '7d2f9c41-8a3b-4e6d-b5c0-1e9f2a7d4c68';
  let authEnv: LocalAuthEnv;
  let guard: SupabaseAuthGuard;

  beforeAll(async () => {
    authEnv = await createLocalAuthEnv();
    guard = new SupabaseAuthGuard(new SupabaseAuthService());
  });

  afterAll(() => {
    authEnv.restore();
  });

  it('accepts a valid Supabase access token and sets request.user.id from sub', async () => {
    const token = await authEnv.signToken({ sub: userId });
    const { context, request } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: userId });
  });

  it('rejects a missing Authorization header with 401 unauthenticated', async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      slug: 'unauthenticated',
      status: 401,
    } satisfies Partial<ProblemException>);
  });

  it('rejects a non-Bearer Authorization header with 401 unauthenticated', async () => {
    const token = await authEnv.signToken({ sub: userId });
    const { context } = createContext(`Basic ${token}`);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      slug: 'unauthenticated',
      status: 401,
    });
  });

  it('rejects an expired token with 401 unauthenticated', async () => {
    const token = await authEnv.signToken({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      slug: 'unauthenticated',
      status: 401,
    });
  });

  it('rejects a token signed with a different key with 401 unauthenticated', async () => {
    const token = await authEnv.signWithWrongKey(userId);
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      slug: 'unauthenticated',
      status: 401,
    });
  });

  it('rejects a token with wrong audience or issuer with 401 unauthenticated', async () => {
    const badAud = await authEnv.signToken({ sub: userId, aud: 'anon' });
    const badIss = await authEnv.signToken({
      sub: userId,
      iss: 'https://other.supabase.co/auth/v1',
    });

    await expect(
      guard.canActivate(createContext(`Bearer ${badAud}`).context),
    ).rejects.toMatchObject({
      slug: 'unauthenticated',
      status: 401,
    });
    await expect(
      guard.canActivate(createContext(`Bearer ${badIss}`).context),
    ).rejects.toMatchObject({
      slug: 'unauthenticated',
      status: 401,
    });
  });

  it('rejects a token missing sub with 401 unauthenticated', async () => {
    const token = await authEnv.signToken({ sub: null });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      slug: 'unauthenticated',
      status: 401,
    });
  });
});
