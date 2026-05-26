import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpiando data de travel...');

  const reports   = await prisma.report.deleteMany({});
  const feedbacks = await prisma.feedback.deleteMany({});
  const personnel = await prisma.tripPersonnel.deleteMany({});
  const convs     = await prisma.conversation.deleteMany({});
  const matches   = await prisma.travelMatch.deleteMany({});
  const trips     = await prisma.trip.deleteMany({});

  console.log(`✅ Reports:       ${reports.count}`);
  console.log(`✅ Feedbacks:     ${feedbacks.count}`);
  console.log(`✅ TripPersonnel: ${personnel.count}`);
  console.log(`✅ Conversations: ${convs.count} (Messages en cascade)`);
  console.log(`✅ TravelMatches: ${matches.count}`);
  console.log(`✅ Trips:         ${trips.count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
