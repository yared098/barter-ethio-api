import { PrismaClient, Condition, Tier, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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

const USERS = [
  { email: 'test@barter.local',  name: 'Alice Test',  role: 'USER' as Role,  tier: 'FREE' as Tier },
  { email: 'bob@barter.local',   name: 'Bob Test',    role: 'USER' as Role,  tier: 'PRO' as Tier  },
  { email: 'carol@barter.local', name: 'Carol',       role: 'USER' as Role,  tier: 'PRO' as Tier  },
  { email: 'dave@barter.local',  name: 'Dave',        role: 'USER' as Role,  tier: 'FREE' as Tier },
  { email: 'eve@barter.local',   name: 'Eve',         role: 'USER' as Role,  tier: 'PRO' as Tier  },
  { email: 'frank@barter.local', name: 'Frank',       role: 'USER' as Role,  tier: 'FREE' as Tier },
  { email: 'grace@barter.local', name: 'Grace',       role: 'USER' as Role,  tier: 'PRO' as Tier  },
  { email: 'henry@barter.local', name: 'Henry',       role: 'USER' as Role,  tier: 'FREE' as Tier },
  { email: 'ivy@barter.local',   name: 'Ivy',         role: 'USER' as Role,  tier: 'PRO' as Tier  },
  { email: 'jack@barter.local',  name: 'Jack',        role: 'USER' as Role,  tier: 'FREE' as Tier },
  { email: 'admin@barter.local', name: 'Admin',       role: 'ADMIN' as Role, tier: 'PRO' as Tier  },
];

// Products: each user has one, designed to match another user
const PRODUCTS = [
  {
    ownerEmail: 'test@barter.local',
    title: 'iPhone 15 Pro 256GB',
    description: 'Excellent condition, unlocked, with original box and charger.',
    condition: 'LIKE_NEW' as Condition,
    estimatedValue: 1200,
    categorySlug: 'smartphones',
    wants: [{ categorySlug: 'audio', keywords: 'Sony' }],
  },
  {
    ownerEmail: 'bob@barter.local',
    title: 'Sony WH-1000XM5',
    description: 'Premium noise-cancelling headphones, like new, with case.',
    condition: 'LIKE_NEW' as Condition,
    estimatedValue: 350,
    categorySlug: 'audio',
    wants: [{ categorySlug: 'smartphones', keywords: 'iPhone' }],
  },
  {
    ownerEmail: 'carol@barter.local',
    title: 'MacBook Pro 14-inch M3',
    description: '2024 model, 16GB RAM, 512GB SSD, barely used.',
    condition: 'LIKE_NEW' as Condition,
    estimatedValue: 1800,
    categorySlug: 'laptops',
    wants: [{ categorySlug: 'smartphones', keywords: 'Samsung' }],
  },
  {
    ownerEmail: 'dave@barter.local',
    title: 'Samsung Galaxy S24 Ultra',
    description: '512GB, titanium black, excellent condition.',
    condition: 'GOOD' as Condition,
    estimatedValue: 1100,
    categorySlug: 'smartphones',
    wants: [{ categorySlug: 'laptops', keywords: 'MacBook' }],
  },
  {
    ownerEmail: 'eve@barter.local',
    title: 'PlayStation 5 Disc Edition',
    description: 'With 2 controllers and 3 games, well maintained.',
    condition: 'GOOD' as Condition,
    estimatedValue: 550,
    categorySlug: 'consoles',
    wants: [{ categorySlug: 'tablets', keywords: 'iPad' }],
  },
  {
    ownerEmail: 'frank@barter.local',
    title: 'iPad Air 5th Gen 256GB',
    description: 'Space gray, with Apple Pencil 2 included.',
    condition: 'LIKE_NEW' as Condition,
    estimatedValue: 600,
    categorySlug: 'tablets',
    wants: [{ categorySlug: 'consoles', keywords: 'PlayStation' }],
  },
  {
    ownerEmail: 'grace@barter.local',
    title: 'Canon EOS R6 Mirrorless',
    description: 'Full frame camera, 2 lenses included, low shutter count.',
    condition: 'GOOD' as Condition,
    estimatedValue: 2000,
    categorySlug: 'cameras',
    wants: [{ categorySlug: 'smartwatches', keywords: 'Apple Watch' }],
  },
  {
    ownerEmail: 'henry@barter.local',
    title: 'Apple Watch Ultra 2',
    description: 'Titanium case, 49mm, with extra bands.',
    condition: 'LIKE_NEW' as Condition,
    estimatedValue: 750,
    categorySlug: 'smartwatches',
    wants: [{ categorySlug: 'cameras', keywords: 'Canon' }],
  },
  {
    ownerEmail: 'ivy@barter.local',
    title: 'Nike Air Max 90 Size 42',
    description: 'Brand new in box, never worn, black and white.',
    condition: 'NEW' as Condition,
    estimatedValue: 180,
    categorySlug: 'clothing',
    wants: [{ categorySlug: 'books', keywords: 'Clean Code' }],
  },
  {
    ownerEmail: 'jack@barter.local',
    title: 'Clean Code (Robert Martin)',
    description: 'Hardcover, perfect condition, coding classic.',
    condition: 'LIKE_NEW' as Condition,
    estimatedValue: 50,
    categorySlug: 'books',
    wants: [{ categorySlug: 'clothing', keywords: 'Nike' }],
  },
];

async function main() {
  console.log('🌱 Starting seed...\n');

  // ─── 1. Categories ───
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon },
      create: c,
    });
  }
  console.log(`✅ ${CATEGORIES.length} categories\n`);

  // ─── 2. Users ───
  const passwordHash = await bcrypt.hash('password123', 10);
  const userIds: Record<string, string> = {};

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, name: u.name, role: u.role, tier: u.tier },
      create: { email: u.email, name: u.name, passwordHash, role: u.role, tier: u.tier },
    });
    userIds[u.email] = user.id;
    const roleStr = u.role.padEnd(5);
    const tierStr = u.tier.padEnd(4);
    console.log(`✅ ${u.email.padEnd(22)} / password123  (${roleStr}, ${tierStr})`);
  }
  console.log(`\n✅ ${USERS.length} users created\n`);

  // ─── 3. Products (idempotent — skip if user already has) ───
  let created = 0;
  let skipped = 0;

  for (const p of PRODUCTS) {
    const ownerId = userIds[p.ownerEmail];
    const existing = await prisma.product.findFirst({
      where: { ownerId, title: p.title },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const category = await prisma.category.findUnique({
      where: { slug: p.categorySlug },
    });
    if (!category) {
      console.log(`⚠️  Missing category ${p.categorySlug} — skipping ${p.title}`);
      continue;
    }

    const wants: { categoryId: string; keywords?: string }[] = [];
    for (const w of p.wants) {
      const wc = await prisma.category.findUnique({ where: { slug: w.categorySlug } });
      if (wc) wants.push({ categoryId: wc.id, keywords: w.keywords });
    }

    await prisma.product.create({
      data: {
        title: p.title,
        description: p.description,
        images: [],
        condition: p.condition,
        estimatedValue: p.estimatedValue,
        categoryId: category.id,
        ownerId,
        wants: { create: wants },
      },
    });
    created++;
  }

  console.log(`✅ ${created} products created, ${skipped} skipped (already exist)\n`);

  // ─── 4. Summary ───
  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    wants: await prisma.productWanted.count(),
  };

  console.log('════════════════════════════════════════');
  console.log('  🎉 SEED COMPLETE');
  console.log('════════════════════════════════════════');
  console.log(`  Users:       ${counts.users}`);
  console.log(`  Categories:  ${counts.categories}`);
  console.log(`  Products:    ${counts.products}`);
  console.log(`  Wants:       ${counts.wants}`);
  console.log('════════════════════════════════════════\n');

  console.log('📋 TEST ACCOUNTS (all password: password123)');
  console.log('─────────────────────────────────────────────');
  console.log('  test@barter.local   → Alice   (iPhone → Audio)');
  console.log('  bob@barter.local    → Bob     (Sony → iPhone)');
  console.log('  carol@barter.local  → Carol   (MacBook → Samsung)');
  console.log('  dave@barter.local   → Dave    (Samsung → MacBook)');
  console.log('  eve@barter.local    → Eve     (PS5 → iPad)');
  console.log('  frank@barter.local  → Frank   (iPad → PS5)');
  console.log('  grace@barter.local  → Grace   (Canon → Apple Watch)');
  console.log('  henry@barter.local  → Henry   (Watch → Canon)');
  console.log('  ivy@barter.local    → Ivy     (Nike → Books)');
  console.log('  jack@barter.local   → Jack    (Books → Nike)');
  console.log('  admin@barter.local  → Admin   (no products)');
  console.log('─────────────────────────────────────────────\n');

  console.log('🔁 MATCH PAIRS (each pair sees each other):');
  console.log('  Alice ↔ Bob       (iPhone ↔ Sony)');
  console.log('  Carol ↔ Dave      (MacBook ↔ Samsung)');
  console.log('  Eve   ↔ Frank     (PS5 ↔ iPad)');
  console.log('  Grace ↔ Henry     (Canon ↔ Apple Watch)');
  console.log('  Ivy   ↔ Jack      (Nike ↔ Books)');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());