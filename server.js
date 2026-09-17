require('dotenv').config();
const path = require('path');
const express = require('express');
const basicAuth = require('express-basic-auth');

require('./db');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 8080;

const adminAuth = basicAuth({
  users: { [process.env.ADMIN_USER || 'admin']: process.env.ADMIN_PASSWORD || 'zmien_to_haslo' },
  challenge: true,
  realm: 'BookingAppAdmin',
});

app.use('/admin.html', adminAuth);
app.use('/auth', adminAuth, authRoutes);
app.get('/api/bookings', adminAuth);
app.post('/api/bookings/:id/cancel', adminAuth);
app.get('/api/blocked', adminAuth);
app.post('/api/blocked', adminAuth);
app.delete('/api/blocked/:id', adminAuth);

app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Booking app dziala na porcie ${PORT}`);
  console.log(`Strona rezerwacji: ${process.env.BASE_URL || 'http://localhost:' + PORT}`);
  console.log(`Panel admina:      ${process.env.BASE_URL || 'http://localhost:' + PORT}/admin.html`);
});
