const express = require('express');
const { nanoid } = require('nanoid');
const { DateTime } = require('luxon');

const db = require('../db');
const google = require('../google');
const availability = require('../availability');

const router = express.Router();

const LOCATION_NAMES = {
  '1': process.env.LOCATION_1_NAME || 'Lokalizacja 1',
  '2': process.env.LOCATION_2_NAME || 'Lokalizacja 2',
};

router.get('/locations', (req, res) => {
  res.json({
    locations: [
      { id: '1', name: LOCATION_NAMES['1'], color: 'blue' },
      { id: '2', name: LOCATION_NAMES['2'], color: 'green' },
    ],
  });
});

router.get('/status', (req, res) => {
  const cfg = availability.getConfig();
  res.json({
    connected: google.isConnected(),
    slotDurationMin: cfg.slotDuration,
    timezone: cfg.timezone,
  });
});


router.get('/available-days', async (req, res) => {
  try {
    if (!google.isConnected()) {
      return res.status(409).json({ error: 'not_connected' });
    }
    const cfg = availability.getConfig();
    const today = DateTime.now().setZone(cfg.timezone).toFormat('yyyy-MM-dd');
    const maxDate = DateTime.now().setZone(cfg.timezone).plus({ days: cfg.windowDays }).toFormat('yyyy-MM-dd');

    const from = req.query.from || today;
    const to = req.query.to || maxDate;

    const days = await availability.getAvailableDaysInRange(from, to);
    res.json({ days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});


router.get('/available-slots', async (req, res) => {
  try {
    if (!google.isConnected()) {
      return res.status(409).json({ error: 'not_connected' });
    }
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'missing_date' });

    const slots = await availability.getAvailableSlotsForDate(date);
    res.json({ slots: slots.map((s) => s.toFormat('HH:mm')) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

router.post('/book', express.json(), async (req, res) => {
  try {
    if (!google.isConnected()) {
      return res.status(409).json({ error: 'not_connected' });
    }
    const { date, time, name, phone, location, note } = req.body || {};

    if (!date || !time || !name || !phone || !location) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (!LOCATION_NAMES[location]) {
      return res.status(400).json({ error: 'invalid_location' });
    }
    const digitsOnly = phone.replace(/[^\d]/g, '');
    const phoneOk = /^\+?[\d\s-]{9,20}$/.test(phone) && digitsOnly.length >= 9;
    if (!phoneOk) {
      return res.status(400).json({ error: 'invalid_phone' });
    }

    const cfg = availability.getConfig();

    const freshSlots = await availability.getAvailableSlotsForDate(date);
    const match = freshSlots.find((s) => s.toFormat('HH:mm') === time);
    if (!match) {
      return res.status(409).json({ error: 'slot_taken' });
    }

    const startDT = match;
    const endDT = startDT.plus({ minutes: cfg.slotDuration });

    const locationName = LOCATION_NAMES[location];
    const descriptionLines = [`Telefon: ${phone}`, `Lokalizacja: ${locationName}`];
    if (note) descriptionLines.push(`Notatka klienta: ${note}`);

    const eventId = await google.createEvent({
      summary: `Rezerwacja: ${name} — ${locationName}`,
      description: descriptionLines.join('\n'),
      startISO: startDT.toISO(),
      endISO: endDT.toISO(),
      colorId: google.getLocationColorId(location),
    });

    const id = nanoid(10);
    db.prepare(`
      INSERT INTO bookings (id, date, time, duration_min, name, phone, location, note, google_event_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(id, date, time, cfg.slotDuration, name, phone, location, note || null, eventId);

    res.json({
      ok: true,
      booking: { id, date, time, name, phone, location: locationName },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

router.get('/blocked', (req, res) => {
  const rows = db.prepare(`
    SELECT id, date, time, reason, created_at
    FROM blocked_slots
    ORDER BY date ASC, (time IS NULL) DESC, time ASC
  `).all();
  res.json({ blocked: rows });
});

router.post('/blocked', express.json(), (req, res) => {
  const { date, time, reason } = req.body || {};

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'invalid_date' });
  }
  if (time && !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'invalid_time' });
  }

  const id = nanoid(10);
  db.prepare(`
    INSERT INTO blocked_slots (id, date, time, reason)
    VALUES (?, ?, ?, ?)
  `).run(id, date, time || null, reason || null);

  res.json({ ok: true, id });
});

router.delete('/blocked/:id', (req, res) => {
  const result = db.prepare('DELETE FROM blocked_slots WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

router.get('/bookings', (req, res) => {
  const rows = db.prepare(`
    SELECT id, date, time, duration_min, name, phone, location, note, status, created_at
    FROM bookings
    WHERE status = 'confirmed'
    ORDER BY date ASC, time ASC
  `).all();
  res.json({ bookings: rows });
});

router.post('/bookings/:id/cancel', express.json(), async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not_found' });

    if (row.google_event_id) {
      try {
        await google.deleteEvent(row.google_event_id);
      } catch (e) {
        console.warn('Nie udalo sie usunac wydarzenia w Google Calendar (mogl byc juz usuniety recznie):', e.message);
      }
    }

    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

module.exports = router;