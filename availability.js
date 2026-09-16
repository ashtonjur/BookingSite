const { DateTime } = require('luxon');
const google = require('./google');
const db = require('./db');

function getConfig() {
  return {
    timezone: process.env.TIMEZONE || 'Europe/Warsaw',
    workStart: process.env.WORK_START || '09:00',
    workEnd: process.env.WORK_END || '17:00',
    workDays: (process.env.WORK_DAYS || '1,2,3,4,5').split(',').map(Number), // 0=niedziela
    slotDuration: parseInt(process.env.SLOT_DURATION_MIN || '30', 10),
    windowDays: parseInt(process.env.BOOKING_WINDOW_DAYS || '30', 10),
    minNoticeHours: parseInt(process.env.MIN_NOTICE_HOURS || '12', 10),
  };
}

function generateDaySlots(dateISO, cfg) {
  const [sh, sm] = cfg.workStart.split(':').map(Number);
  const [eh, em] = cfg.workEnd.split(':').map(Number);

  let cursor = DateTime.fromISO(dateISO, { zone: cfg.timezone }).set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
  const end = DateTime.fromISO(dateISO, { zone: cfg.timezone }).set({ hour: eh, minute: em, second: 0, millisecond: 0 });

  const slots = [];
  while (cursor.plus({ minutes: cfg.slotDuration }) <= end) {
    slots.push(cursor);
    cursor = cursor.plus({ minutes: cfg.slotDuration });
  }
  return slots;
}

function overlaps(slotStart, slotEnd, busyStart, busyEnd) {
  return slotStart < busyEnd && slotEnd > busyStart;
}

function isDateBlocked(dateISO) {
  const row = db.prepare(
    `SELECT 1 FROM blocked_slots WHERE date = ? AND time IS NULL LIMIT 1`
  ).get(dateISO);
  return !!row;
}

function getBlockedTimesForDate(dateISO) {
  const rows = db.prepare(
    `SELECT time FROM blocked_slots WHERE date = ? AND time IS NOT NULL`
  ).all(dateISO);
  return new Set(rows.map((r) => r.time));
}

async function getAvailableSlotsForDate(dateISO) {
  const cfg = getConfig();
  const dt = DateTime.fromISO(dateISO, { zone: cfg.timezone });

  if (!cfg.workDays.includes(dt.weekday % 7)) {
    return [];
  }
  if (isDateBlocked(dateISO)) {
    return [];
  }

  const daySlots = generateDaySlots(dateISO, cfg);
  if (daySlots.length === 0) return [];

  const dayStart = daySlots[0];
  const dayEnd = daySlots[daySlots.length - 1].plus({ minutes: cfg.slotDuration });

  const busy = await google.getBusyIntervals(dayStart.toISO(), dayEnd.toISO());

  const now = DateTime.now().setZone(cfg.timezone);
  const minStart = now.plus({ hours: cfg.minNoticeHours });

  const localBookings = db.prepare(
    `SELECT time FROM bookings WHERE date = ? AND status = 'confirmed'`
  ).all(dateISO);
  const localBookedTimes = new Set(localBookings.map((b) => b.time));
  const blockedTimes = getBlockedTimesForDate(dateISO);

  return daySlots.filter((slotStart) => {
    const timeStr = slotStart.toFormat('HH:mm');
    if (localBookedTimes.has(timeStr)) return false;
    if (blockedTimes.has(timeStr)) return false;
    if (slotStart < minStart) return false;

    const slotEnd = slotStart.plus({ minutes: cfg.slotDuration });
    const isBusy = busy.some((b) =>
      overlaps(slotStart.toJSDate(), slotEnd.toJSDate(), b.start, b.end)
    );
    return !isBusy;
  });
}

async function getAvailableDaysInRange(fromISO, toISO) {
  const cfg = getConfig();
  const from = DateTime.fromISO(fromISO, { zone: cfg.timezone }).startOf('day');
  const to = DateTime.fromISO(toISO, { zone: cfg.timezone }).endOf('day');

  const busy = await google.getBusyIntervals(from.toISO(), to.toISO());
  const localBookings = db.prepare(
    `SELECT date, time FROM bookings WHERE status = 'confirmed' AND date BETWEEN ? AND ?`
  ).all(fromISO, toISO);

  const now = DateTime.now().setZone(cfg.timezone);
  const minStart = now.plus({ hours: cfg.minNoticeHours });

  const availableDays = [];
  let cursor = from;
  while (cursor <= to) {
    const dateISO = cursor.toFormat('yyyy-MM-dd');
    if (cfg.workDays.includes(cursor.weekday % 7) && !isDateBlocked(dateISO)) {
      const daySlots = generateDaySlots(dateISO, cfg);
      const localBookedTimes = new Set(
        localBookings.filter((b) => b.date === dateISO).map((b) => b.time)
      );
      const blockedTimes = getBlockedTimesForDate(dateISO);
      const hasFree = daySlots.some((slotStart) => {
        const timeStr = slotStart.toFormat('HH:mm');
        if (localBookedTimes.has(timeStr)) return false;
        if (blockedTimes.has(timeStr)) return false;
        if (slotStart < minStart) return false;
        const slotEnd = slotStart.plus({ minutes: cfg.slotDuration });
        return !busy.some((b) => overlaps(slotStart.toJSDate(), slotEnd.toJSDate(), b.start, b.end));
      });
      if (hasFree) availableDays.push(dateISO);
    }
    cursor = cursor.plus({ days: 1 });
  }
  return availableDays;
}

module.exports = { getConfig, getAvailableSlotsForDate, getAvailableDaysInRange };