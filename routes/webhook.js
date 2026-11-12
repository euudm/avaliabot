const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendGoogleLink, sendFeedbackRequest } = require('../services/whatsapp');

router.post('/', async (req, res) => {
  res.sendStatus(200);

  const { phone, text, isGroupMsg } = req.body;
  if (isGroupMsg || !phone || !text) return;

  const cleanPhone = phone.replace(/\D/g, '');
  const rating = parseInt(text.trim());
  if (isNaN(rating) || rating < 1 || rating > 5) return;

  const send = db.getSendByPhone(cleanPhone);
  if (!send) return;

  db.setSendRating(send.id, rating);

  const contact = db.getContact(send.contact_id);
  const business = db.getBusiness(contact?.business_id);
  if (!business) return;

  if (rating >= 4) {
    await sendGoogleLink(cleanPhone, send.name || contact?.name, business);
    db.setSendGoogleLink(send.id);
  } else {
    await sendFeedbackRequest(cleanPhone, send.name || contact?.name);
  }
});

module.exports = router;
