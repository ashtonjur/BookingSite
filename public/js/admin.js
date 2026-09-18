(() => {
  const connStatus = document.getElementById('connStatus');
  const connectBtn = document.getElementById('connectBtn');
  const bookingsWrap = document.getElementById('bookingsWrap');
  const publicLink = document.getElementById('publicLink');

  publicLink.textContent = `${window.location.origin}/`;

  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') === '1') {
    connStatus.textContent = 'Połączono pomyślnie! Sprawdzam status…';
  }

  async function loadStatus() {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      connStatus.innerHTML = '<span class="status-pill on">Połączono</span>';
      connectBtn.style.display = 'none';
    } else {
      connStatus.innerHTML = '<span class="status-pill off">Nie połączono</span> — połącz swoje konto Google, żeby zacząć przyjmować rezerwacje.';
      connectBtn.style.display = 'inline-block';
    }
  }

  let locationsById = {};
  let locationsList = [];

  async function loadLocations() {
    const res = await fetch('/api/locations');
    const data = await res.json();
    locationsList = data.locations || [];
    locationsList.forEach((loc) => {
      locationsById[loc.id] = loc;
    });
  }

  async function loadBookings() {
    const res = await fetch('/api/bookings');
    if (!res.ok) {
      bookingsWrap.innerHTML = '<p class="empty-note">Nie udało się pobrać rezerwacji.</p>';
      return;
    }
    const data = await res.json();
    const rows = data.bookings || [];

    if (rows.length === 0) {
      bookingsWrap.innerHTML = '<p class="empty-note">Brak rezerwacji.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'bookings';
    table.innerHTML = `
      <thead>
        <tr><th>Data</th><th>Godz.</th><th>Klient</th><th>Telefon</th><th>Lokalizacja</th><th>Notatka</th><th></th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    rows.forEach((b) => {
      const tr = document.createElement('tr');
      const loc = locationsById[b.location];
      const locColor = loc?.color === 'green' ? '#3f8a4c' : '#3b6fd6';
      const locLabel = loc?.name || b.location;
      tr.innerHTML = `
        <td>${b.date}</td>
        <td>${b.time}</td>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.phone)}</td>
        <td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${locColor};margin-right:6px;"></span>${locLabel}</td>
        <td>${escapeHtml(b.note || '—')}</td>
        <td><button class="cancel-link" data-id="${b.id}">Anuluj</button></td>
      `;
      tbody.appendChild(tr);
    });

    bookingsWrap.innerHTML = '';
    bookingsWrap.appendChild(table);

    tbody.querySelectorAll('.cancel-link').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Na pewno anulować tę rezerwację? Wydarzenie zostanie usunięte z kalendarza.')) return;
        btn.disabled = true;
        btn.textContent = 'Anulowanie…';
        const res = await fetch(`/api/bookings/${btn.dataset.id}/cancel`, { method: 'POST' });
        if (res.ok) {
          loadBookings();
        } else {
          btn.disabled = false;
          btn.textContent = 'Anuluj';
          alert('Nie udało się anulować rezerwacji.');
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  const blockForm = document.getElementById('blockForm');
  const blockDate = document.getElementById('blockDate');
  const blockTime = document.getElementById('blockTime');
  const blockReason = document.getElementById('blockReason');
  const blockError = document.getElementById('blockError');
  const blockedWrap = document.getElementById('blockedWrap');

  async function loadBlocked() {
    const res = await fetch('/api/blocked');
    if (!res.ok) {
      blockedWrap.innerHTML = '<p class="empty-note">Nie udało się pobrać zablokowanych terminów.</p>';
      return;
    }
    const data = await res.json();
    const rows = data.blocked || [];

    if (rows.length === 0) {
      blockedWrap.innerHTML = '<p class="empty-note">Brak zablokowanych terminów.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'bookings';
    table.innerHTML = `
      <thead>
        <tr><th>Data</th><th>Godzina</th><th>Powód</th><th></th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    rows.forEach((b) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${b.date}</td>
        <td>${b.time || 'cały dzień'}</td>
        <td>${escapeHtml(b.reason || '—')}</td>
        <td><button class="cancel-link" data-id="${b.id}">Odblokuj</button></td>
      `;
      tbody.appendChild(tr);
    });

    blockedWrap.innerHTML = '';
    blockedWrap.appendChild(table);

    tbody.querySelectorAll('.cancel-link').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Odblokowuję…';
        const res = await fetch(`/api/blocked/${btn.dataset.id}`, { method: 'DELETE' });
        if (res.ok) {
          loadBlocked();
        } else {
          btn.disabled = false;
          btn.textContent = 'Odblokuj';
          alert('Nie udało się odblokować terminu.');
        }
      });
    });
  }

  blockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    blockError.style.display = 'none';

    const payload = {
      date: blockDate.value,
      time: blockTime.value || null,
      reason: blockReason.value.trim() || null,
    };

    if (!payload.date) {
      blockError.textContent = 'Podaj datę.';
      blockError.style.display = 'block';
      return;
    }

    const res = await fetch('/api/blocked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      blockError.textContent = 'Nie udało się dodać blokady. Sprawdź datę i godzinę.';
      blockError.style.display = 'block';
      return;
    }

    blockForm.reset();
    loadBlocked();
  });

  loadBlocked();

  const dayLockForm = document.getElementById('dayLockForm');
  const dayLockDate = document.getElementById('dayLockDate');
  const dayLockLocation = document.getElementById('dayLockLocation');
  const dayLockError = document.getElementById('dayLockError');
  const dayLocksWrap = document.getElementById('dayLocksWrap');

  function populateDayLockSelect() {
    dayLockLocation.innerHTML = '';
    locationsList.forEach((loc) => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = loc.name;
      dayLockLocation.appendChild(opt);
    });
  }

  async function loadDayLocks() {
    const res = await fetch('/api/day-locks');
    if (!res.ok) {
      dayLocksWrap.innerHTML = '<p class="empty-note">Nie udało się pobrać ograniczeń.</p>';
      return;
    }
    const data = await res.json();
    const rows = data.locks || [];

    if (rows.length === 0) {
      dayLocksWrap.innerHTML = '<p class="empty-note">Brak dni ograniczonych do jednej lokalizacji.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'bookings';
    table.innerHTML = `
      <thead>
        <tr><th>Data</th><th>Dostępna lokalizacja</th><th></th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const locColor = r.location === '2' ? '#3f8a4c' : '#3b6fd6';
      tr.innerHTML = `
        <td>${r.date}</td>
        <td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${locColor};margin-right:6px;"></span>${escapeHtml(r.locationName)}</td>
        <td><button class="cancel-link" data-id="${r.id}">Usuń</button></td>
      `;
      tbody.appendChild(tr);
    });

    dayLocksWrap.innerHTML = '';
    dayLocksWrap.appendChild(table);

    tbody.querySelectorAll('.cancel-link').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Usuwanie…';
        const res = await fetch(`/api/day-locks/${btn.dataset.id}`, { method: 'DELETE' });
        if (res.ok) {
          loadDayLocks();
        } else {
          btn.disabled = false;
          btn.textContent = 'Usuń';
          alert('Nie udało się usunąć ograniczenia.');
        }
      });
    });
  }

  dayLockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    dayLockError.style.display = 'none';

    const payload = {
      date: dayLockDate.value,
      location: dayLockLocation.value,
    };

    if (!payload.date) {
      dayLockError.textContent = 'Podaj datę.';
      dayLockError.style.display = 'block';
      return;
    }

    const res = await fetch('/api/day-locks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      dayLockError.textContent = 'Nie udało się ustawić ograniczenia.';
      dayLockError.style.display = 'block';
      return;
    }

    dayLockForm.reset();
    loadDayLocks();
  });

  loadStatus();
  loadLocations().then(() => {
    populateDayLockSelect();
    loadBookings();
    loadDayLocks();
  });
})();