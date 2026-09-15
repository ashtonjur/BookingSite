const express = require('express');
const google = require('../google');

const router = express.Router();

router.get('/google', (req, res) => {
  const url = google.getAuthUrl();
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`Logowanie anulowane lub odrzucone: ${error}`);
  }
  if (!code) {
    return res.status(400).send('Brak kodu autoryzacyjnego w odpowiedzi Google.');
  }

  try {
    const client = google.createOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const email = await google.getUserEmail(client);
    google.saveTokens(tokens, email);
    res.redirect('/admin.html?connected=1');
  } catch (err) {
    console.error('Blad podczas wymiany kodu na tokeny:', err);
    res.status(500).send('Nie udalo sie polaczyc z Google Calendar. Sprawdz logi serwera.');
  }
});

module.exports = router;
