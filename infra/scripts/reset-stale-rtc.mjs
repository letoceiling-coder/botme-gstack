import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const reset = await prisma.visitorSession.updateMany({
  where: { controlMode: 'RTC_ACTIVE' },
  data: { controlMode: 'OPERATOR' },
});
const ended = await prisma.callSession.updateMany({
  where: { status: { in: ['INVITED', 'ACTIVE'] } },
  data: { status: 'ENDED', endedAt: new Date() },
});
console.log('reset visitor RTC_ACTIVE:', reset.count);
console.log('ended stale call sessions:', ended.count);
await prisma.$disconnect();
