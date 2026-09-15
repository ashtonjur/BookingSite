(() => {
  const monthLabel = document.getElementById('monthLabel');
  const calGrid = document.getElementById('calGrid');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const slotsSection = document.getElementById('slotsSection');
  const slotsTitle = document.getElementById('slotsTitle');
  const slotsGrid = document.getElementById('slotsGrid');
  const bookingForm = document.getElementById('bookingForm');
  const confirmBox = document.getElementById('confirmBox');
  const confirmText = document.getElementById('confirmText');
  const formError = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const durationLabel = document.getElementById('durationLabel');
  const notConnected = document.getElementById('notConnected');
  const mainLayout = document.getElementById('mainLayout');

  const DOW_LABELS = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];
  const MONTH_LABELS = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
  ];

  let viewYear, viewMonth; // viewMonth: 0-11
  let availableDaysSet = new Set();
  let selectedDate = null;
  let selectedTime = null;

  const todayStr = toISODate(new Date());

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function firstOfMonth(y, m) { return new Date(y, m, 1); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  async function init() {
    const res = await fetch('/api/status');
    const status = await res.json();
    if (!status.connected) {
      notConnected.style.display = 'block';
      mainLayout.style.display = 'none';
      return;
    }
    durationLabel.textContent = `Czas trwania: ${status.slotDurationMin} min`;

    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    await loadMonth();
  }

  async function loadMonth() {
    const from = toISODate(firstOfMonth(viewYear, viewMonth));
    const lastDay = new Date(viewYear, viewMonth, daysInMonth(viewYear, viewMonth));
    const to = toISODate(lastDay);

    const res = await fetch(`/api/available-days?from=${from}&to=${to}`);
    const data = await res.json();
    availableDaysSet = new Set(data.days || []);
    renderCalendar();
  }

  function renderCalendar() {
    monthLabel.textContent = `${MONTH_LABELS[viewMonth]} ${viewYear}`;
    calGrid.innerHTML = '';

    DOW_LABELS.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = d;
      calGrid.appendChild(el);
    });

    const first = firstOfMonth(viewYear, viewMonth);
    // JS getDay(): 0=niedziela...6=sobota -> przeliczamy na uklad pon..nd
    let leading = first.getDay() === 0 ? 6 : first.getDay() - 1;

    for (let i = 0; i < leading; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day empty';
      calGrid.appendChild(el);
    }

    const total = daysInMonth(viewYear, viewMonth);
    for (let day = 1; day <= total; day++) {
      const dateObj = new Date(viewYear, viewMonth, day);
      const iso = toISODate(dateObj);
      const el = document.createElement('div');
      el.className = 'cal-day';
      el.textContent = String(day);
      if (iso === todayStr) el.classList.add('today');
      if (availableDaysSet.has(iso)) {
        el.classList.add('available');
        el.addEventListener('click', () => selectDate(iso, el));
      }
      if (iso === selectedDate) el.classList.add('selected');
      calGrid.appendChild(el);
    }

    const now = new Date();
    const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
    prevBtn.disabled = isCurrentMonth;
  }

  async function selectDate(iso, el) {
    selectedDate = iso;
    selectedTime = null;
    document.querySelectorAll('.cal-day.selected').forEach((n) => n.classList.remove('selected'));
    el.classList.add('selected');

    bookingForm.classList.remove('visible');
    confirmBox.style.display = 'none';

    slotsSection.style.display = 'block';
    slotsTitle.textContent = 'Ładowanie godzin…';
    slotsGrid.innerHTML = '';

    const res = await fetch(`/api/available-slots?date=${iso}`);
    const data = await res.json();
    const slots = data.slots || [];

    if (slots.length === 0) {
      slotsTitle.textContent = 'Brak wolnych godzin tego dnia';
      return;
    }
    slotsTitle.textContent = 'Dostępne godziny';
    slots.forEach((time) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = time;
      btn.addEventListener('click', () => selectTime(time, btn));
      slotsGrid.appendChild(btn);
    });
  }

  function selectTime(time, btn) {
    selectedTime = time;
    document.querySelectorAll('.slot-btn.selected').forEach((n) => n.classList.remove('selected'));
    btn.classList.add('selected');
    bookingForm.classList.add('visible');
    formError.style.display = 'none';
  }

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Wysyłanie…';

    const payload = {
      date: selectedDate,
      time: selectedTime,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      note: document.getElementById('note').value.trim(),
    };

    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'slot_taken') {
          formError.textContent = 'Ten termin został właśnie zajęty. Wybierz proszę inną godzinę.';
          formError.style.display = 'block';
          await selectDate(selectedDate, document.querySelector('.cal-day.selected'));
          bookingForm.classList.remove('visible');
        } else if (data.error === 'invalid_phone') {
          formError.textContent = 'Podaj poprawny numer telefonu (min. 9 cyfr).';
          formError.style.display = 'block';
        } else {
          formError.textContent = 'Coś poszło nie tak. Spróbuj ponownie za chwilę.';
          formError.style.display = 'block';
        }
        return;
      }

      bookingForm.classList.remove('visible');
      slotsSection.style.display = 'none';
      confirmBox.style.display = 'block';
      confirmText.textContent =
        `${payload.name}, do zobaczenia ${selectedDate} o ${selectedTime}. Zarezerwowaliśmy termin na numer ${payload.phone}.`;

      await loadMonth();
    } catch (err) {
      formError.textContent = 'Błąd połączenia. Sprawdź internet i spróbuj ponownie.';
      formError.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Potwierdź termin';
    }
  });

  prevBtn.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    selectedDate = null;
    slotsSection.style.display = 'none';
    bookingForm.classList.remove('visible');
    loadMonth();
  });

  nextBtn.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    selectedDate = null;
    slotsSection.style.display = 'none';
    bookingForm.classList.remove('visible');
    loadMonth();
  });

  init();
})();
