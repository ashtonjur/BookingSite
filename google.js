const { google } = require('googleapis');
const db = require('./db');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // wazne: zeby dostac refresh_token
    prompt: 'consent',      // wymusza ponowne wydanie refresh_token
    scope: SCOPES,
  });
}

function saveTokens(tokens, email) {
  const existing = db.prepare('SELECT * FROM google_tokens WHERE id = 1').get();
  const merged = {
    access_token: tokens.access_token || existing?.access_token,
    refresh_token: tokens.refresh_token || existing?.refresh_token,
    scope: tokens.scope || existing?.scope,
    token_type: tokens.token_type || existing?.token_type,
    expiry_date: tokens.expiry_date || existing?.expiry_date,
    connected_email: email || existing?.connected_email,
  };

  db.prepare(`
    INSERT INTO google_tokens (id, access_token, refresh_token, scope, token_type, expiry_date, connected_email)
    VALUES (1, @access_token, @refresh_token, @scope, @token_type, @expiry_date, @connected_email)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      scope = excluded.scope,
      token_type = excluded.token_type,
      expiry_date = excluded.expiry_date,
      connected_email = excluded.connected_email
  `).run(merged);
}

function loadTokens() {
  return db.prepare('SELECT * FROM google_tokens WHERE id = 1').get();
}

function isConnected() {
  const row = loadTokens();
  return !!(row && row.refresh_token);
}

async function getAuthorizedClient() {
  const row = loadTokens();
  if (!row || !row.refresh_token) {
    throw new Error('Kalendarz Google nie jest jeszcze polaczony. Wejdz na /admin.html i kliknij "Polacz Google Calendar".');
  }
  const client = createOAuthClient();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    scope: row.scope,
    token_type: row.token_type,
    expiry_date: row.expiry_date,
  });

  client.on('tokens', (tokens) => {
    saveTokens(tokens, row.connected_email);
  });

  return client;
}

async function getUserEmail(client) {
  const oauth2 = google.oauth2({ auth: client, version: 'v2' });
  const { data } = await oauth2.userinfo.get();
  return data.email;
}

async function getBusyIntervals(timeMin, timeMax) {
  const client = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: process.env.TIMEZONE || 'UTC',
      items: [{ id: calendarId }],
    },
  });

  const busy = res.data.calendars?.[calendarId]?.busy || [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}


const LOCATION_COLOR_IDS = { '1': '9', '2': '10' };

function getLocationColorId(locationKey) {
  return LOCATION_COLOR_IDS[locationKey] || null;
}

async function createEvent({ summary, description, startISO, endISO, colorId }) {
  const client = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  const event = {
    summary,
    description,
    start: { dateTime: startISO, timeZone: process.env.TIMEZONE || 'UTC' },
    end: { dateTime: endISO, timeZone: process.env.TIMEZONE || 'UTC' },
    reminders: { useDefault: true },
  };
  if (colorId) event.colorId = colorId;

  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });

  return res.data.id;
}

async function deleteEvent(eventId) {
  const client = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  await calendar.events.delete({ calendarId, eventId });
}

module.exports = {
  createOAuthClient,
  getAuthUrl,
  saveTokens,
  loadTokens,
  isConnected,
  getAuthorizedClient,
  getUserEmail,
  getBusyIntervals,
  createEvent,
  deleteEvent,
  getLocationColorId,
};