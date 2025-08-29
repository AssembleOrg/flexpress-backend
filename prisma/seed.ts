import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../src/common/enums';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create system configurations
  const systemConfigs = [
    {
      key: 'credit_price',
      value: '1.0',
      description: 'Price per credit in USD',
    },
    {
      key: 'contact_email',
      value: 'contact@flexpress.com',
      description: 'Main contact email address',
    },
    {
      key: 'contact_phone',
      value: '+54 11 1234-5678',
      description: 'Main contact phone number',
    },
    {
      key: 'company_name',
      value: 'FlexPress',
      description: 'Company name',
    },
    {
      key: 'company_address',
      value: 'Buenos Aires, Argentina',
      description: 'Company address',
    },
  ];

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: config,
      create: config,
    });
    console.log(`✅ Created/Updated system config: ${config.key}`);
  }

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@flexpress.com' },
    update: {},
    create: {
      email: 'admin@flexpress.com',
      name: 'System Administrator',
      password: adminPassword,
      role: UserRole.ADMIN,
      address: 'Buenos Aires, Argentina',
      credits: 1000,
      number: 'ADMIN001',
    },
  });
  console.log(`✅ Created/Updated admin user: ${adminUser.email}`);

  // Create subadmin user
  const subadminPassword = await bcrypt.hash('subadmin123', 10);
  const subadminUser = await prisma.user.upsert({
    where: { email: 'subadmin@flexpress.com' },
    update: {},
    create: {
      email: 'subadmin@flexpress.com',
      name: 'Sub Administrator',
      password: subadminPassword,
      role: UserRole.SUBADMIN,
      address: 'Buenos Aires, Argentina',
      credits: 500,
      number: 'SUBADMIN001',
    },
  });
  console.log(`✅ Created/Updated subadmin user: ${subadminUser.email}`);

  // Create sample charter user
  const charterPassword = await bcrypt.hash('charter123', 10);
  const charterUser = await prisma.user.upsert({
    where: { email: 'charter@flexpress.com' },
    update: {},
    create: {
      email: 'charter@flexpress.com',
      name: 'Sample Charter Service',
      password: charterPassword,
      role: 'charter',
      address: 'Buenos Aires, Argentina',
      credits: 0,
      number: 'CHARTER001',
    },
  });
  console.log(`✅ Created/Updated charter user: ${charterUser.email}`);

  // Create sample regular user
  const userPassword = await bcrypt.hash('user123', 10);
  const regularUser = await prisma.user.upsert({
    where: { email: 'user@flexpress.com' },
    update: {},
    create: {
      email: 'user@flexpress.com',
      name: 'Sample User',
      password: userPassword,
      role: 'user',
      address: 'Buenos Aires, Argentina',
      credits: 100,
      number: 'USER001',
    },
  });
  console.log(`✅ Created/Updated regular user: ${regularUser.email}`);

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📋 Default credentials:');
  console.log('Admin: admin@flexpress.com / admin123');
  console.log('Subadmin: subadmin@flexpress.com / subadmin123');
  console.log('Charter: charter@flexpress.com / charter123');
  console.log('User: user@flexpress.com / user123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 