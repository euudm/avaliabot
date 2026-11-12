// Roda uma vez para preparar o ambiente de demonstração
require('dotenv').config();
const db = require('./database');
const fs = require('fs');

// Cria .env se não existir
if (!fs.existsSync('.env')) {
  fs.copyFileSync('.env.example', '.env');
  console.log('✓ .env criado a partir do .env.example');
}

// Limpa dados anteriores de demo
db.prepare('DELETE FROM sends').run();
db.prepare('DELETE FROM contacts').run();
db.prepare('DELETE FROM businesses').run();
db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('sends','contacts','businesses')").run();

// Cadastra negócio demo
const result = db.prepare(`
  INSERT INTO businesses (name, owner_phone, google_review_link)
  VALUES (?, ?, ?)
`).run('Allaska Demo', '11999999999', 'https://g.page/r/demo/review');

console.log(`✓ Negócio demo criado (id: ${result.lastInsertRowid})`);
console.log('');
console.log('Pronto! Agora rode:');
console.log('  npm install');
console.log('  node server.js');
console.log('');
console.log('Acesse: http://localhost:3000/?b=1');
