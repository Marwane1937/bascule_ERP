// scripts/generate-secret.js
const crypto = require('crypto');

const secret = crypto.randomBytes(32).toString('hex');
console.log('\n🔐 Secret JWT généré:');
console.log(secret);
console.log('\n📋 Ajoutez cette ligne dans votre .env:');
console.log(`JWT_SECRET=${secret}\n`);

