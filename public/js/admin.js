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
        <tr><th>Data</th><th>Godz.</th><th>Klient</th><th>Telefon</th><th>Notatka</th><th></th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    rows.forEach((b) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${b.date}</td>
        <td>${b.time}</td>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.phone)}</td>
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

  loadStatus();
  loadBookings();
})();
