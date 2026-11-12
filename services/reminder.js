const cron = require('node-cron');
const db = require('../database');
const { sendOwnerReminder } = require('./whatsapp');

// Dispara todo dia às 18h no horário de Brasília
function startReminder() {
  cron.schedule('0 18 * * *', async () => {
    console.log('[Reminder] Disparando lembretes de fim de dia...');

    const businesses = db.prepare('SELECT * FROM businesses').all();
    const today = new Date().toISOString().split('T')[0];

    for (const business of businesses) {
      const pendingContacts = db.prepare(`
        SELECT COUNT(*) as count FROM contacts
        WHERE business_id = ? AND DATE(added_at) = ? AND status = 'pending'
      `).get(business.id, today);

      try {
        await sendOwnerReminder(business.owner_phone, business.name, pendingContacts.count);
        console.log(`[Reminder] Lembrete enviado para ${business.name} (${business.owner_phone})`);
      } catch (err) {
        console.error(`[Reminder] Erro ao enviar para ${business.name}:`, err.message);
      }
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log('[Reminder] Agendado para 18h (Brasília)');
}

// Lembrete de follow-up: 48h após envio sem clique no link
function startFollowup() {
  cron.schedule('0 10 * * *', async () => {
    console.log('[Followup] Verificando envios sem resposta...');

    const { sendMessage } = require('./whatsapp');

    const pendingSends = db.prepare(`
      SELECT s.*, c.phone, c.name FROM sends s
      JOIN contacts c ON c.id = s.contact_id
      WHERE s.rating IS NULL
      AND s.google_link_sent = 0
      AND s.sent_at < datetime('now', '-48 hours')
      AND s.followup_sent IS NULL OR s.followup_sent = 0
    `).all();

    for (const send of pendingSends) {
      try {
        const business = db.prepare(`
          SELECT b.* FROM businesses b
          JOIN contacts c ON c.business_id = b.id
          WHERE c.id = ?
        `).get(send.contact_id);

        const message = `Oi ${send.name}! 😊 Ainda dá tempo de nos contar como foi o atendimento.\n\nDe 1 a 5, qual nota você daria? ⭐`;
        await sendMessage(send.phone, message);

        db.prepare(`UPDATE sends SET followup_sent = 1 WHERE id = ?`).run(send.id);
        console.log(`[Followup] Follow-up enviado para ${send.name}`);
      } catch (err) {
        console.error(`[Followup] Erro para ${send.name}:`, err.message);
      }
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log('[Followup] Agendado para 10h (Brasília)');
}

module.exports = { startReminder, startFollowup };
