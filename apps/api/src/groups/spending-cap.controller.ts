import { Controller, Param, Put, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/supabase-auth.guard';
import { readJsonBody, type JsonBodyRequest } from '../http/read-json-body';
import { ProblemException } from '../problems/problem.exception';
import { SpendingCapService, type SpendingCap } from './spending-cap.service';

const CAP_RULE = `must be an integer from 0 to ${Number.MAX_SAFE_INTEGER}, or null`;

/** Contract section 5, field table: an integer from 0 to 2^53 - 1, or null. Nothing is converted. */
function parseCapVnd(body: Record<string, unknown>): bigint | null {
  const value = body['capVnd'];
  if (value === null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  throw new ProblemException('validation', '1 field is invalid', {
    errors: [{ pointer: '/capVnd', detail: CAP_RULE }],
  });
}

// docs/contract/spending-cap.md. The steps below run in the order of section 5 and stop at the first
// that fails; the guard is step 1.
@Controller('v1/groups/:groupId/members/:userId/spending-cap')
@UseGuards(SupabaseAuthGuard)
export class SpendingCapController {
  constructor(private readonly spendingCaps: SpendingCapService) {}

  @Put()
  async put(
    @Param('groupId') rawGroupId: string,
    @Param('userId') rawUserId: string,
    @CurrentUser() caller: AuthenticatedUser,
    @Req() req: JsonBodyRequest,
  ): Promise<SpendingCap> {
    const groupId = rawGroupId.toLowerCase();
    const callerId = caller.id.toLowerCase();

    // 2. Membership. A missing group and a non-member get the same answer.
    const membership = await this.spendingCaps.findMembership(groupId, callerId);
    if (!membership) {
      throw new ProblemException('not-found', 'The requested resource was not found.');
    }

    // DELIBERATE CONTRACT BREAK (PA#2 A4, never merged): the ownership check is gone, so any
    // member can set any other member's cap. Contract section 2 requires 403 forbidden here.
    const target = { ...membership, userId: rawUserId.toLowerCase() };

    // 4-6. Size, JSON, then field rules. The body is read only now, after 401/404/403.
    const capVnd = parseCapVnd(await readJsonBody(req));

    // 7. The group total.
    const total = membership.groupTotalVnd;
    if (capVnd !== null && capVnd > total) {
      throw new ProblemException(
        'cap-above-group-total',
        `The cap of ${capVnd} VND is above the group total of ${total} VND`,
        {
          errors: [{ pointer: '/capVnd', detail: `must be at most ${total}, the group total` }],
          groupTotalVnd: Number(total),
        },
      );
    }

    // 8. Store and flag plans in one transaction.
    return this.spendingCaps.setCap(target, capVnd);
  }
}
