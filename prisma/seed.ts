import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminExists = await prisma.user.findUnique({
    where: { email: 'admin@clouddrive.com' },
  });

  if (!adminExists) {
    const passwordHash = await bcrypt.hash('admin123', 12);
    await prisma.user.create({
      data: {
        email: 'admin@clouddrive.com',
        name: 'Admin',
        passwordHash,
        role: 'admin',
        storageLimit: 10737418240, // 10GB
      },
    });
    console.log('Admin user created: admin@clouddrive.com / admin123');
  } else {
    console.log('Admin user already exists');
  }

  // Create demo user
  const demoExists = await prisma.user.findUnique({
    where: { email: 'demo@clouddrive.com' },
  });

  if (!demoExists) {
    const passwordHash = await bcrypt.hash('demo123', 12);
    await prisma.user.create({
      data: {
        email: 'demo@clouddrive.com',
        name: 'Demo User',
        passwordHash,
        role: 'user',
        storageLimit: 10737418240, // 10GB
      },
    });
    console.log('Demo user created: demo@clouddrive.com / demo123');
  } else {
    console.log('Demo user already exists');
  }

  // Create default storage driver config
  const existingDefaultDriver = await prisma.storageDriverConfig.findFirst({
    where: { isDefault: true },
  });

  if (!existingDefaultDriver) {
    await prisma.storageDriverConfig.create({
      data: {
        name: 'Default Local Storage',
        type: 'local',
        config: JSON.stringify({ path: './storage' }),
        isDefault: true,
        isEnabled: true,
        priority: 0,
      },
    });
    console.log('Default storage driver created: Local Storage');
  } else {
    console.log('Default storage driver already exists');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
