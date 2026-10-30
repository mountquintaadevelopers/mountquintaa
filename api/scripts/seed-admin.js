// One-off script to create the first ADMIN account, since creating admin/scanner
// users via the API requires an ADMIN JWT that doesn't exist yet.
//
// Usage:
//   ADMIN_NAME="Admin" ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="changeme" node scripts/seed-admin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');

async function main() {
  const name = process.env.ADMIN_NAME || 'Admin';
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables before running this script.');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { name, password: hashed, role: 'ADMIN' },
    create: { name, email, password: hashed, role: 'ADMIN' }
  });

  console.log(`Admin user ready: ${admin.email} (id: ${admin.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
