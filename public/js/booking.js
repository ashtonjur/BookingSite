(() => {
  const monthLabel = document.getElementById('monthLabel');
  const calGrid = document.getElementById('calGrid');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const slotsSection = document.getElementById('slotsSection');
  const slotsTitle = document.getElementById('slotsTitle');
  const slotsGrid = document.getElementById('slotsGrid');
  const reserveBtn = document.getElementById('reserveBtn');
  const durationOptionsEl = document.getElementById('durationOptions');
  const locationOptionsEl = document.getElementById('locationOptions');

  const modalOverlay = document.getElementById('modalOverlay');
  const modalSummary = document.getElementById('modalSummary');
  const modalCancel = document.getElementById('modalCancel');
  const bookingForm = document.getElementById('bookingForm');
  const confirmBox = document.getElementById('confirmBox');
  const confirmText = document.getElementById('confirmText');
  const formError = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const notConnected = document.getElementById('notConnected');
  const mainLayout = document.getElementById('mainLayout');

  const DOW_LABELS = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];
  const MONTH_LABELS = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
  ];

  function formatDuration(min) {
    if (min === 60) return '1 godzina';
    if (min === 90) return '1,5 godziny';
    if (min % 60 === 0) return `${min / 60} godz.`;
    return `${min} min`;
  }

  let viewYear, viewMonth;
  let availableDaysSet = new Set();
  let selectedDate = null;
  let selectedTime = null;
  let selectedLocation = null;
  let selectedDuration = null;
  let locations = [];
  let durationOptions = [];
  let maxBookableDate = null;

  const todayStr = toISODate(new Date());

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function firstOfMonth(y, m) { return new Date(y, m, 1); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  function currentLocationName() {
    const loc = locations.find((l) => l.id === selectedLocation);
    return loc ? loc.name : '';
  }

  async function init() {
    const [statusRes, locationsRes] = await Promise.all([
      fetch('/api/status'),
      fetch('/api/locations'),
    ]);
    const status = await statusRes.json();
    if (!status.connected) {
      notConnected.style.display = 'block';
      mainLayout.style.display = 'none';
      return;
    }

    durationOptions = status.durationOptionsMin || [60, 90];
    selectedDuration = durationOptions[0];
    maxBookableDate = status.maxBookableDate || null;
    renderDurationOptions();

    const locData = await locationsRes.json();
    locations = locData.locations || [];
    selectedLocation = locations.length ? locations[0].id : null;
    renderLocationOptions();

    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    await loadMonth();
  }

  function resetSelectionAndReload() {
    selectedDate = null;
    selectedTime = null;
    slotsSection.style.display = 'none';
    reserveBtn.style.display = 'none';
    confirmBox.style.display = 'none';
    loadMonth();
  }

  function renderDurationOptions() {
    durationOptionsEl.innerHTML = '';
    durationOptions.forEach((min) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'duration-btn';
      if (min === selectedDuration) btn.classList.add('selected');
      btn.textContent = formatDuration(min);
      btn.addEventListener('click', () => {
        if (selectedDuration === min) return;
        selectedDuration = min;
        document.querySelectorAll('#durationOptions .duration-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        resetSelectionAndReload();
      });
      durationOptionsEl.appendChild(btn);
    });
  }

  function renderLocationOptions() {
    locationOptionsEl.innerHTML = '';
    locations.forEach((loc) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'location-btn';
      btn.dataset.color = loc.color;
      btn.dataset.id = loc.id;
      if (loc.id === selectedLocation) btn.classList.add('selected');
      btn.innerHTML = `<span class="dot"></span>${loc.name}`;
      btn.addEventListener('click', () => {
        if (selectedLocation === loc.id) return;
        selectedLocation = loc.id;
        document.querySelectorAll('#locationOptions .location-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        resetSelectionAndReload();
      });
      locationOptionsEl.appendChild(btn);
    });
  }

  async function loadMonth() {
    const from = toISODate(firstOfMonth(viewYear, viewMonth));
    const lastDay = new Date(viewYear, viewMonth, daysInMonth(viewYear, viewMonth));
    const to = toISODate(lastDay);

    const res = await fetch(`/api/available-days?from=${from}&to=${to}&duration=${selectedDuration}&location=${selectedLocation}`);
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

    if (maxBookableDate) {
      const nextMonthFirstDay = toISODate(new Date(viewYear, viewMonth + 1, 1));
      nextBtn.disabled = nextMonthFirstDay > maxBookableDate;
    }
  }

  async function selectDate(iso, el) {
    selectedDate = iso;
    selectedTime = null;
    document.querySelectorAll('.cal-day.selected').forEach((n) => n.classList.remove('selected'));
    el.classList.add('selected');

    reserveBtn.style.display = 'none';
    slotsSection.style.display = 'block';
    slotsTitle.textContent = 'Ładowanie godzin…';
    slotsGrid.innerHTML = '';
    confirmBox.style.display = 'none';

    const res = await fetch(`/api/available-slots?date=${iso}&duration=${selectedDuration}&location=${selectedLocation}`);
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
    reserveBtn.style.display = 'inline-block';
  }

  function openModal() {
    modalSummary.textContent = `${selectedDate} o ${selectedTime} · ${formatDuration(selectedDuration)} · ${currentLocationName()}`;
    formError.style.display = 'none';
    bookingForm.reset();
    modalOverlay.style.display = 'flex';
  }

  function closeModal() {
    modalOverlay.style.display = 'none';
  }

  reserveBtn.addEventListener('click', openModal);
  modalCancel.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.style.display = 'none';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Wysyłanie…';

    const payload = {
      date: selectedDate,
      time: selectedTime,
      duration: selectedDuration,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      location: selectedLocation,
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
          closeModal();
          await selectDate(selectedDate, document.querySelector('.cal-day.selected'));
        } else if (data.error === 'invalid_phone') {
          formError.textContent = 'Podaj poprawny numer telefonu (min. 9 cyfr).';
          formError.style.display = 'block';
        } else if (data.error === 'missing_fields') {
          formError.textContent = 'Wypełnij wszystkie wymagane pola.';
          formError.style.display = 'block';
        } else {
          formError.textContent = 'Coś poszło nie tak. Spróbuj ponownie za chwilę.';
          formError.style.display = 'block';
        }
        return;
      }

      closeModal();
      slotsSection.style.display = 'none';
      confirmBox.style.display = 'block';
      confirmText.textContent =
        `${payload.name}, do zobaczenia ${selectedDate} o ${selectedTime} (${formatDuration(selectedDuration)}, ${data.booking.location}). Zarezerwowaliśmy termin na numer ${payload.phone}.`;

      await loadMonth();
    } catch (err) {
      formError.textContent = 'Błąd połączenia. Sprawdź internet i spróbuj ponownie.';
      formError.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Zatwierdź';
    }
  });

  prevBtn.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    selectedDate = null;
    slotsSection.style.display = 'none';
    reserveBtn.style.display = 'none';
    loadMonth();
  });

  nextBtn.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    selectedDate = null;
    slotsSection.style.display = 'none';
    reserveBtn.style.display = 'none';
    loadMonth();
  });

  init();
})();