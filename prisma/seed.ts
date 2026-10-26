import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const CATEGORIES = [
  { slug: 'smartphones',  name: 'Smartphones',  icon: '📱' },
  { slug: 'laptops',      name: 'Laptops',      icon: '💻' },
  { slug: 'tablets',      name: 'Tablets',      icon: '📲' },
  { slug: 'consoles',     name: 'Consoles',     icon: '🎮' },
  { slug: 'cameras',      name: 'Cameras',      icon: '📷' },
  { slug: 'audio',        name: 'Audio',        icon: '🎧' },
  { slug: 'smartwatches', name: 'Smartwatches', icon: '⌚' },
  { slug: 'bikes',        name: 'Bikes',        icon: '🚲' },
  { slug: 'furniture',    name: 'Furniture',    icon: '🪑' },
  { slug: 'books',        name: 'Books',        icon: '📚' },
  { slug: 'clothing',     name: 'Clothing',     icon: '👕' },
  { slug: 'other',        name: 'Other',        icon: '📦' },
];

async function main() {
  // --- Categories ---
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon },
      create: c,
    });
  }
  console.log(`✅ Seeded ${CATEGORIES.length} categories`);

  // --- Test user (keep existing) ---
  const email = 'test@barter.local';
  const passwordHash = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, name: 'Test User', passwordHash },
  });
  console.log(`✅ Test user: ${email} / password123`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());