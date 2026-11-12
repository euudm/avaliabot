const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/:businessId/today', (req, res) => {
  res.json(db.getTodayContacts(req.params.businessId));
});

router.post('/:businessId', (req, res) => {
  const { name, phone, service } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });

  const cleanPhone = phone.replace(/\D/g, '');

  if (db.wasRecentlySent(req.params.businessId, cleanPhone)) {
    return res.status(409).json({ error: 'Avaliação já solicitada nos últimos 30 dias para este contato' });
  }

  const contact = db.createContact({ business_id: req.params.businessId, name, phone: cleanPhone, service });
  res.json(contact);
});

router.delete('/:contactId', (req, res) => {
  db.deleteContact(req.params.contactId);
  res.json({ ok: true });
});

module.exports = router;
