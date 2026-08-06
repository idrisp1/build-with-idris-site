import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node backend/scripts/hash-password.js "your-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nAdd this to backend/.env as ADMIN_PASSWORD_HASH:\n');
console.log(hash);
console.log('');
