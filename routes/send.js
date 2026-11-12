const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendRatingRequest, sendGoogleLink } = require('../services/whatsapp');

const DEMO_MODE = process.env.DEMO_MODE === 'true';

router.post('/', async (req, res) => {
  const { contactIds, businessId } = req.body;
  if (!contactIds || !contactIds.length) return res.status(400).json({ error: 'Nenhum contato selecionado' });

  const business = db.getBusiness(businessId);
  if (!business) return res.status(404).json({ error: 'Negócio não encontrado' });

  const results = [];

  for (let i = 0; i < contactIds.length; i++) {
    const contact = db.getContact(contactIds[i]);
    if (!contact) continue;

    if (i > 0) await sleep(3000);

    try {
      await sendRatingRequest(contact, business);
      const send = db.createSend(contact.id);
      db.setContactStatus(contact.id, 'sent');

      if (DEMO_MODE) {
        setTimeout(async () => {
          db.setSendRating(send.id, 5);
          await sendGoogleLink(contact.phone, contact.name, business);
          db.setSendGoogleLink(send.id);
          console.log(`[DEMO] Simulou resposta 5⭐ de ${contact.name}`);
        }, 8000);
      }

      results.push({ contactId: contact.id, name: contact.name, status: 'sent' });
    } catch (err) {
      results.push({ contactId: contact.id, name: contact.name, status: 'error', error: err.message });
    }
  }

  res.json({ results });
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = router;
