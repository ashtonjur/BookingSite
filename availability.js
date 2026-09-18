const { DateTime } = require('luxon');
const google = require('./google');
const db = require('./db');

function getConfig() {
  return {
    timezone: process.env.TIMEZONE || 'Europe/Warsaw',
    workStart: process.env.WORK_START || '09:00',
    workEnd: process.env.WORK_END || '17:00',
    satWorkStart: process.env.SAT_WORK_START || null,
    satWorkEnd: process.env.SAT_WORK_END || null,
    workDays: (process.env.WORK_DAYS || '1,2,3,4,5,6').split(',').map(Number),
    slotStep: parseInt(process.env.SLOT_STEP_MIN || '15', 10),
    durationOptions: (process.env.DURATION_OPTIONS_MIN || '60,90').split(',').map(Number),
    windowDays: parseInt(process.env.BOOKING_WINDOW_DAYS || '30', 10),
    minNoticeHours: parseInt(process.env.MIN_NOTICE_HOURS || '12', 10),
    locationBufferMin: parseInt(process.env.LOCATION_SWITCH_BUFFER_MIN || '60', 10),
  };
}

function isValidDuration(durationMin, cfg) {
  return cfg.durationOptions.includes(Number(durationMin));
}

function getBookingWindowEnd(cfg) {
  const now = DateTime.now().setZone(cfg.timezone);
  const daysToSunday = 7 - now.weekday; // luxon: weekday 1=pon...7=nd
  return now.plus({ days: daysToSunday + 7 }).endOf('day');
}

function getWorkBounds(dateISO, cfg) {
  const dt = DateTime.fromISO(dateISO, { zone: cfg.timezone });
  const isSaturday = dt.weekday % 7 === 6;

  const startStr = (isSaturday && cfg.satWorkStart) ? cfg.satWorkStart : cfg.workStart;
  const endStr = (isSaturday && cfg.satWorkEnd) ? cfg.satWorkEnd : cfg.workEnd;

  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);

  const start = dt.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
  const end = dt.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
  return { start, end };
}

function generateCandidateStarts(dateISO, cfg, durationMin) {
  const { start, end } = getWorkBounds(dateISO, cfg);
  const slots = [];
  let cursor = start;
  while (cursor.plus({ minutes: durationMin }) <= end) {
    slots.push(cursor);
    cursor = cursor.plus({ minutes: cfg.slotStep });
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

function getDayLocationLock(dateISO) {
  const row = db.prepare(`SELECT location FROM day_location_locks WHERE date = ?`).get(dateISO);
  return row ? row.location : null;
}

function getLocalBookingIntervals(dateISO, cfg) {
  const rows = db.prepare(
    `SELECT time, duration_min, location FROM bookings WHERE date = ? AND status = 'confirmed'`
  ).all(dateISO);
  return rows.map((r) => {
    const start = DateTime.fromISO(`${dateISO}T${r.time}`, { zone: cfg.timezone });
    return {
      start: start.toJSDate(),
      end: start.plus({ minutes: r.duration_min }).toJSDate(),
      location: r.location,
    };
  });
}

function getBlockedIntervals(dateISO, cfg) {
  const rows = db.prepare(
    `SELECT time FROM blocked_slots WHERE date = ? AND time IS NOT NULL`
  ).all(dateISO);
  return rows.map((r) => {
    const start = DateTime.fromISO(`${dateISO}T${r.time}`, { zone: cfg.timezone });
    return { start: start.toJSDate(), end: start.plus({ minutes: cfg.slotStep }).toJSDate() };
  });
}


function buildBusyIntervals(dateISO, cfg, googleBusy, location) {
  const localBookings = getLocalBookingIntervals(dateISO, cfg);
  const blocked = getBlockedIntervals(dateISO, cfg);

  const bufferMs = cfg.locationBufferMin * 60000;
  const bufferedForOtherLocation = localBookings
    .filter((b) => b.location !== location)
    .map((b) => ({
      start: new Date(b.start.getTime() - bufferMs),
      end: new Date(b.end.getTime() + bufferMs),
    }));

  return [...googleBusy, ...localBookings, ...blocked, ...bufferedForOtherLocation];
}

async function getAvailableSlotsForDate(dateISO, durationMin, location) {
  const cfg = getConfig();
  const dt = DateTime.fromISO(dateISO, { zone: cfg.timezone });

  if (!cfg.workDays.includes(dt.weekday % 7)) return [];
  if (isDateBlocked(dateISO)) return [];
  if (dt > getBookingWindowEnd(cfg)) return [];

  const lock = getDayLocationLock(dateISO);
  if (lock && lock !== location) return [];

  const candidates = generateCandidateStarts(dateISO, cfg, durationMin);
  if (candidates.length === 0) return [];

  const { start: workStart, end: workEnd } = getWorkBounds(dateISO, cfg);
  const googleBusy = await google.getBusyIntervals(workStart.toISO(), workEnd.toISO());

  const now = DateTime.now().setZone(cfg.timezone);
  const minStart = now.plus({ hours: cfg.minNoticeHours });

  const allBusy = buildBusyIntervals(dateISO, cfg, googleBusy, location);

  return candidates.filter((slotStart) => {
    if (slotStart < minStart) return false;
    const slotEnd = slotStart.plus({ minutes: durationMin });
    return !allBusy.some((b) => overlaps(slotStart.toJSDate(), slotEnd.toJSDate(), b.start, b.end));
  });
}

async function getAvailableDaysInRange(fromISO, toISO, durationMin, location) {
  const cfg = getConfig();
  const windowEnd = getBookingWindowEnd(cfg);
  const from = DateTime.fromISO(fromISO, { zone: cfg.timezone }).startOf('day');
  const requestedTo = DateTime.fromISO(toISO, { zone: cfg.timezone }).endOf('day');
  const to = requestedTo > windowEnd ? windowEnd : requestedTo;
  if (to < from) return [];

  const googleBusy = await google.getBusyIntervals(from.toISO(), to.toISO());

  const now = DateTime.now().setZone(cfg.timezone);
  const minStart = now.plus({ hours: cfg.minNoticeHours });

  const availableDays = [];
  let cursor = from;
  while (cursor <= to) {
    const dateISO = cursor.toFormat('yyyy-MM-dd');
    const lock = getDayLocationLock(dateISO);
    const dayUsable = cfg.workDays.includes(cursor.weekday % 7) && !isDateBlocked(dateISO) && !(lock && lock !== location);

    if (dayUsable) {
      const candidates = generateCandidateStarts(dateISO, cfg, durationMin);
      const dayBusy = buildBusyIntervals(dateISO, cfg, googleBusy, location);
      const hasFree = candidates.some((slotStart) => {
        if (slotStart < minStart) return false;
        const slotEnd = slotStart.plus({ minutes: durationMin });
        return !dayBusy.some((b) => overlaps(slotStart.toJSDate(), slotEnd.toJSDate(), b.start, b.end));
      });
      if (hasFree) availableDays.push(dateISO);
    }
    cursor = cursor.plus({ days: 1 });
  }
  return availableDays;
}

module.exports = {
  getConfig,
  isValidDuration,
  getBookingWindowEnd,
  getDayLocationLock,
  getAvailableSlotsForDate,
  getAvailableDaysInRange,
};