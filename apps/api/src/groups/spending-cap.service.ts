import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Membership {
  groupId: string;
  userId: string;
  groupTotalVnd: bigint;
}

export interface SpendingCap {
  groupId: string;
  userId: string;
  capVnd: number | null;
  updatedAt: string;
  affectedPlans: { id: string; highestMemberSpendVnd: number }[];
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

@Injectable()
export class SpendingCapService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The caller's membership in the group, or null when either id is not a UUID, the group does
   * not exist, or the caller is not in it.
   */
  async findMembership(groupId: string, userId: string): Promise<Membership | null> {
    if (!isUuid(groupId) || !isUuid(userId)) return null;

    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { group: { select: { totalVnd: true } } },
    });
    return member && { groupId, userId, groupTotalVnd: member.group.totalVnd };
  }

  /**
   * Stores the cap and flags the group's saved plans it no longer fits, in one transaction
   * (contract section 4). Plans are never edited and never unflagged here.
   */
  async setCap(membership: Membership, capVnd: bigint | null): Promise<SpendingCap> {
    const { groupId, userId } = membership;

    return this.prisma.$transaction(async (tx) => {
      const key = { groupId_userId: { groupId, userId } };
      let member = await tx.groupMember.findUniqueOrThrow({ where: key });

      // updatedAt records when the value last changed, so a repeated PUT leaves it as it was.
      if (member.capVnd !== capVnd) {
        member = await tx.groupMember.update({
          where: key,
          data: { capVnd, updatedAt: new Date() },
        });
      }

      let affectedPlans: { id: string; highestMemberSpendVnd: bigint }[] = [];
      if (capVnd !== null) {
        const overCap = {
          groupId,
          status: 'SAVED' as const,
          highestMemberSpendVnd: { gt: capVnd },
        };
        await tx.plan.updateMany({ where: overCap, data: { needsReview: true } });
        affectedPlans = await tx.plan.findMany({
          where: overCap,
          select: { id: true, highestMemberSpendVnd: true },
          orderBy: { id: 'asc' },
        });
      }

      // BigInt cannot go through JSON; the contract caps every amount at 2^53 - 1, so Number is exact.
      return {
        groupId,
        userId,
        capVnd: member.capVnd === null ? null : Number(member.capVnd),
        updatedAt: member.updatedAt.toISOString(),
        affectedPlans: affectedPlans.map((plan) => ({
          id: plan.id,
          highestMemberSpendVnd: Number(plan.highestMemberSpendVnd),
        })),
      };
    });
  }
}
