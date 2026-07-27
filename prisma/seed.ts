import { createPrismaClient } from './client';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../src/common/enums';

const prisma = createPrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create system configurations for pricing
  const systemConfigs = [
    {
      key: 'credit_price',
      value: '100',
      description: 'Precio por crédito en ARS',
    },
    {
      key: 'pricing_base_rate_per_km',
      value: '15',
      description: 'Tarifa base por kilómetro en créditos',
    },
    {
      key: 'pricing_minimum_charge',
      value: '50',
      description: 'Cargo mínimo en créditos',
    },
    {
      key: 'pricing_worker_rate',
      value: '75',
      description: 'Costo por trabajador para carga/descarga en créditos',
    },
    {
      key: 'contact_email',
      value: 'contacto@flexpress.com.ar',
      description: 'Email de contacto principal',
    },
    {
      key: 'contact_phone',
      value: '+54 11 4567-8900',
      description: 'Teléfono de contacto principal',
    },
    {
      key: 'company_name',
      value: 'FlexPress Argentina',
      description: 'Nombre de la empresa',
    },
    {
      key: 'company_address',
      value: 'Zona Sur, Buenos Aires, Argentina',
      description: 'Dirección de la empresa',
    },
  ];

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: config,
      create: config,
    });
    console.log(`✅ Configuración creada/actualizada: ${config.key}`);
  }

  // Create admin user
  const adminPassword = await bcrypt.hash('Admin2025!', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@flexpress.com.ar' },
    update: {},
    create: {
      email: 'admin@flexpress.com.ar',
      name: 'Administrador Principal',
      password: adminPassword,
      role: UserRole.ADMIN,
      address: 'Centro, Buenos Aires',
      credits: 10000,
      number: '+54 11 2000-0001',
    },
  });
  console.log(`✅ Usuario admin creado: ${adminUser.email}`);

  // Create subadmin user
  const subadminPassword = await bcrypt.hash('Subadmin2025!', 10);
  const subadminUser = await prisma.user.upsert({
    where: { email: 'subadmin@flexpress.com.ar' },
    update: {},
    create: {
      email: 'subadmin@flexpress.com.ar',
      name: 'Sub Administrador',
      password: subadminPassword,
      role: UserRole.SUBADMIN,
      address: 'Lomas de Zamora, Buenos Aires',
      credits: 5000,
      number: '+54 11 2000-0002',
    },
  });
  console.log(`✅ Usuario subadmin creado: ${subadminUser.email}`);

  // ====================
  // USUARIOS REGULARES (Zona Sur Buenos Aires)
  // ====================

  const users = [
    {
      email: 'maria.garcia@gmail.com',
      name: 'María García',
      password: await bcrypt.hash('Maria2025!', 10),
      role: 'user' as const,
      address: 'Av. Hipólito Yrigoyen 8985, Temperley, Buenos Aires',
      credits: 500,
      number: '+54 11 3456-7890',
    },
    {
      email: 'juan.lopez@gmail.com',
      name: 'Juan López',
      password: await bcrypt.hash('Juan2025!', 10),
      role: 'user' as const,
      address: 'Calle 7 N° 1234, Banfield, Buenos Aires',
      credits: 750,
      number: '+54 11 3456-7891',
    },
    {
      email: 'laura.martinez@gmail.com',
      name: 'Laura Martínez',
      password: await bcrypt.hash('Laura2025!', 10),
      role: 'user' as const,
      address: 'Av. Pavón 3456, Lanús, Buenos Aires',
      credits: 600,
      number: '+54 11 3456-7892',
    },
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: userData,
    });
    console.log(`✅ Usuario regular creado: ${user.email} - ${user.name}`);
  }

  // ====================
  // CHARTERS (Chóferes con ubicación fija)
  // ====================

  const charters = [
    {
      email: 'carlos.fernandez@charter.com',
      name: 'Carlos Fernández',
      password: await bcrypt.hash('Carlos2025!', 10),
      role: 'charter' as const,
      address: 'Zona de trabajo: Lomas de Zamora y alrededores',
      originAddress: 'Av. Meeks 456, Lomas de Zamora, Buenos Aires',
      originLatitude: '-34.7603',
      originLongitude: '-58.4015',
      credits: 0,
      number: '+54 11 4000-0001',
    },
    {
      email: 'roberto.sanchez@charter.com',
      name: 'Roberto Sánchez',
      password: await bcrypt.hash('Roberto2025!', 10),
      role: 'charter' as const,
      address: 'Zona de trabajo: Quilmes y alrededores',
      originAddress: 'Av. Calchaquí 2800, Quilmes, Buenos Aires',
      originLatitude: '-34.7200',
      originLongitude: '-58.2543',
      credits: 0,
      number: '+54 11 4000-0002',
    },
    {
      email: 'diego.rodriguez@charter.com',
      name: 'Diego Rodríguez',
      password: await bcrypt.hash('Diego2025!', 10),
      role: 'charter' as const,
      address: 'Zona de trabajo: Avellaneda y alrededores',
      originAddress: 'Av. Mitre 750, Avellaneda, Buenos Aires',
      originLatitude: '-34.6619',
      originLongitude: '-58.3640',
      credits: 0,
      number: '+54 11 4000-0003',
    },
  ];

  for (const charterData of charters) {
    const charter = await prisma.user.upsert({
      where: { email: charterData.email },
      update: {},
      create: charterData,
    });

    // Create charter availability (all available by default)
    await prisma.charterAvailability.upsert({
      where: { charterId: charter.id },
      update: { isAvailable: true },
      create: {
        charterId: charter.id,
        isAvailable: true,
      },
    });

    console.log(`✅ Chófer creado: ${charter.email} - ${charter.name} (${charterData.originAddress})`);
  }

  console.log('\n🎉 Seeding completado exitosamente!');
  console.log('\n' + '='.repeat(80));
  console.log('📋 CREDENCIALES DE ACCESO');
  console.log('='.repeat(80));
  
  console.log('\n👑 ADMINISTRADORES:');
  console.log('━'.repeat(80));
  console.log('  Admin Principal:');
  console.log('    📧 Email:    admin@flexpress.com.ar');
  console.log('    🔑 Password: Admin2025!');
  console.log('    💰 Créditos: 10,000');
  console.log('');
  console.log('  Sub Admin:');
  console.log('    📧 Email:    subadmin@flexpress.com.ar');
  console.log('    🔑 Password: Subadmin2025!');
  console.log('    💰 Créditos: 5,000');
  
  console.log('\n👥 USUARIOS REGULARES (Zona Sur):');
  console.log('━'.repeat(80));
  console.log('  María García (Temperley):');
  console.log('    📧 Email:    maria.garcia@gmail.com');
  console.log('    🔑 Password: Maria2025!');
  console.log('    📍 Dirección: Av. Hipólito Yrigoyen 8985, Temperley');
  console.log('    💰 Créditos: 500');
  console.log('');
  console.log('  Juan López (Banfield):');
  console.log('    📧 Email:    juan.lopez@gmail.com');
  console.log('    🔑 Password: Juan2025!');
  console.log('    📍 Dirección: Calle 7 N° 1234, Banfield');
  console.log('    💰 Créditos: 750');
  console.log('');
  console.log('  Laura Martínez (Lanús):');
  console.log('    📧 Email:    laura.martinez@gmail.com');
  console.log('    🔑 Password: Laura2025!');
  console.log('    📍 Dirección: Av. Pavón 3456, Lanús');
  console.log('    💰 Créditos: 600');
  
  console.log('\n🚚 CHÓFERES (Charters - Zona Sur):');
  console.log('━'.repeat(80));
  console.log('  Carlos Fernández (Lomas de Zamora):');
  console.log('    📧 Email:    carlos.fernandez@charter.com');
  console.log('    🔑 Password: Carlos2025!');
  console.log('    📍 Base:     Av. Meeks 456, Lomas de Zamora');
  console.log('    🌍 GPS:      -34.7603, -58.4015');
  console.log('    ✅ Estado:   Disponible');
  console.log('');
  console.log('  Roberto Sánchez (Quilmes):');
  console.log('    📧 Email:    roberto.sanchez@charter.com');
  console.log('    🔑 Password: Roberto2025!');
  console.log('    📍 Base:     Av. Calchaquí 2800, Quilmes');
  console.log('    🌍 GPS:      -34.7200, -58.2543');
  console.log('    ✅ Estado:   Disponible');
  console.log('');
  console.log('  Diego Rodríguez (Avellaneda):');
  console.log('    📧 Email:    diego.rodriguez@charter.com');
  console.log('    🔑 Password: Diego2025!');
  console.log('    📍 Base:     Av. Mitre 750, Avellaneda');
  console.log('    🌍 GPS:      -34.6619, -58.3640');
  console.log('    ✅ Estado:   Disponible');
  
  console.log('\n' + '='.repeat(80));
  console.log('💡 NOTAS:');
  console.log('  • Todos los chóferes están marcados como disponibles');
  console.log('  • Los usuarios tienen créditos suficientes para viajes de prueba');
  console.log('  • Las ubicaciones son reales de la zona sur de Buenos Aires');
  console.log('  • Tarifa base: 15 créditos/km | Mínimo: 50 créditos | Trabajador: 75 créditos');
  console.log('='.repeat(80) + '\n');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
