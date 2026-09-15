# README

Co robi ta aplikacja:
- musisz mieć domene `/` (np. `https://twoja-domena.pl/`), którą wysyłasz klientom,
- klient widzi kalendarz, wybiera wolny dzień i godzinę, podaje imię i numer telefonu,
- aplikacja tworzy wydarzenie w Twoim Google Calendar i wysyła klientowi zaproszenie SMS,
- masz panel `/admin.html` (chroniony hasłem), gdzie łączysz swoje konto Google i widzisz listę rezerwacji.

Poniżej masz instrukcję krok po kroku — od zera do działającej aplikacji w internecie.

---

## Krok 1 — zainstaluj Node.js (jeśli jeszcze nie masz)

Wejdź na https://nodejs.org i zainstaluj wersję **LTS** (18 lub nowszą). Sprawdź w terminalu:

```bash
node -v
npm -v
```

---

## Krok 2 — zainstaluj zależności projektu

W folderze projektu:

```bash
npm install
```

---

## Krok 3 — skonfiguruj projekt w Google Cloud Console

To jednorazowa konfiguracja, żeby aplikacja mogła łączyć się z Twoim kalendarzem.

1. Wejdź na https://console.cloud.google.com i zaloguj się swoim kontem Google.
2. W górnym pasku kliknij listę projektów → **New Project** (Nowy projekt). Nadaj nazwę np. `moja-aplikacja-rezerwacji` → **Create**.
3. Upewnij się, że nowy projekt jest wybrany (górny pasek).
4. W menu po lewej: **APIs & Services → Library**. Wyszukaj **Google Calendar API** → kliknij **Enable**.
5. W menu po lewej: **APIs & Services → OAuth consent screen**.
   - User type: **External** → **Create**.
   - Wypełnij tylko wymagane pola (nazwa aplikacji, e-mail wsparcia, e-mail kontaktowy) → **Save and Continue**.
   - Na ekranie Scopes kliknij **Save and Continue** (nic nie trzeba dodawać ręcznie).
   - Na ekranie **Test users** kliknij **Add users** i dodaj **swój własny adres Gmail** (ten, którego kalendarz ma być używany) → **Save and Continue**.
   - Aplikacja może zostać w trybie **Testing** — nie musisz jej publikować. W trybie testowym login przez Google działa bez ograniczeń dla adresów dodanych jako "Test users", a to jedyne konto, które się loguje (Ty, w panelu admina). Klienci nigdy się nie logują przez Google.
6. W menu po lewej: **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Nazwa: dowolna, np. `booking-app`.
   - **Authorized redirect URIs** → **Add URI** → wpisz na razie:
     ```
     http://localhost:3000/auth/google/callback
     ```
     (adres produkcyjny dodasz w Kroku 6, po wdrożeniu).
   - Kliknij **Create**. Zobaczysz **Client ID** i **Client Secret** — skopiuj je, będą potrzebne za chwilę.

---

## Krok 4 — uzupełnij plik `.env`

Skopiuj wzorzec i uzupełnij dane:

```bash
cp .env.example .env
```

Otwórz `.env` i wpisz:
- `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET` — z Kroku 3.6.
- `ADMIN_PASSWORD` — ustaw własne, trudne hasło do panelu `/admin.html`.
- `WORK_START`, `WORK_END`, `WORK_DAYS`, `SLOT_DURATION_MIN` — dopasuj do swoich godzin pracy.
- `TIMEZONE` — zostaw `Europe/Warsaw`, jeśli działasz w Polsce.

Resztę na razie zostaw domyślną.

---

## Krok 5 — uruchom lokalnie i przetestuj

```bash
npm start
```

W terminalu zobaczysz `Booking app dziala na porcie 3000`.

1. Wejdź na `http://localhost:3000/admin.html`. Przeglądarka poprosi o login/hasło — użyj `ADMIN_USER` / `ADMIN_PASSWORD` z `.env`.
2. Kliknij **Połącz Google Calendar**, zaloguj się kontem, które dodałeś jako "Test user". Zaakceptuj uprawnienia (Google pokaże ostrzeżenie "Google hasn't verified this app" — to normalne dla trybu testowego, kliknij **Continue/Advanced → Go to booking-app**).
3. Po powrocie na `/admin.html` powinieneś zobaczyć status **Połączono**.
4. Wejdź na `http://localhost:3000/` (strona kliencka) i spróbuj umówić testowy termin. Sprawdź, czy wydarzenie pojawiło się w Twoim Google Calendar.

Jeśli działa lokalnie — jesteś gotowy do wdrożenia.

---

## Krok 6 — wdrożenie w internecie (Railway.app)

Polecam **Railway.app** — ma darmowy plan startowy i (co ważne) trwały dysk, żeby plik bazy SQLite nie znikał po restarcie serwera.

1. Załóż konto na https://railway.app (możesz zalogować się przez GitHub).
2. Wrzuć projekt na GitHub (jeśli jeszcze go tam nie masz):
   ```bash
   git init
   git add .
   git commit -m "Pierwsza wersja aplikacji rezerwacji"
   ```
   Utwórz nowe puste repozytorium na github.com i wypchnij kod (`git remote add origin ...`, `git push -u origin main`).
3. W Railway: **New Project → Deploy from GitHub repo** → wybierz swoje repozytorium.
4. Po utworzeniu usługi wejdź w jej ustawienia:
   - **Variables** — dodaj wszystkie zmienne z Twojego `.env` (Client ID, Client Secret, ADMIN_PASSWORD, WORK_START, itd.). **`GOOGLE_REDIRECT_URI` i `BASE_URL` uzupełnisz w kroku 6b**, po tym jak Railway nada Ci domenę.
   - **Settings → Networking → Generate Domain** — Railway nada Ci adres typu `https://twoja-apka.up.railway.app`.
   - **Settings → Volumes → New Volume** — zamontuj wolumin w ścieżce `/app/data` (to tu SQLite trzyma plik bazy — dzięki temu dane przetrwają restart/redeploy).
5. Wróć do **Variables** i ustaw:
   ```
   GOOGLE_REDIRECT_URI=https://twoja-apka.up.railway.app/auth/google/callback
   BASE_URL=https://twoja-apka.up.railway.app
   ```
6. Wróć do Google Cloud Console → **APIs & Services → Credentials** → kliknij swój OAuth Client ID → w **Authorized redirect URIs** dodaj:
   ```
   https://twoja-apka.up.railway.app/auth/google/callback
   ```
   Zapisz.
7. W Railway poczekaj, aż aplikacja się zbuduje i uruchomi (zakładka **Deployments**).
8. Wejdź na `https://twoja-apka.up.railway.app/admin.html`, zaloguj się (ADMIN_USER/ADMIN_PASSWORD), połącz Google Calendar ponownie (tokeny są zapisane w bazie na serwerze, więc to jednorazowa czynność na produkcji).

*(Render.com działa analogicznie, tylko trwały dysk — "Persistent Disk" — jest dostępny od płatnego planu. Railway ma to w darmowym planie startowym, dlatego go polecam na start.)*

---

## Krok 7 — wyślij link klientom

Link, który wysyłasz klientom, to po prostu:

```
https://twoja-apka.up.railway.app/
```

Panel do zarządzania (tylko dla Ciebie, chroniony hasłem):

```
https://twoja-apka.up.railway.app/admin.html
```

---

## Najczęstsze problemy

- **"redirect_uri_mismatch"** przy logowaniu w Google → adres w `GOOGLE_REDIRECT_URI` w Railway musi być **identyczny co do znaku** z tym wpisanym w Google Cloud Console (w tym `https://` i brak/obecność `/` na końcu).
- **"Google hasn't verified this app"** → normalne w trybie Testing, klikasz "Advanced/Zaawansowane" → "Go to (nazwa) (unsafe)". Dotyczy tylko Ciebie jako admina — klienci tego nigdy nie widzą.
- **Rezerwacje znikają po redeployu** → upewnij się, że w Railway dodałeś **Volume** zamontowany w `/app/data`.
- **Chcesz zmienić godziny pracy albo długość wizyty** → edytuj zmienne `WORK_START`, `WORK_END`, `WORK_DAYS`, `SLOT_DURATION_MIN` w Variables (Railway) lub `.env` (lokalnie) i zrestartuj aplikację.

---

## Struktura projektu

```
booking-app/
  server.js          - punkt startowy serwera
  db.js               - baza SQLite (tokeny + rezerwacje)
  google.js           - integracja z Google Calendar API
  availability.js     - liczenie wolnych terminów
  routes/
    auth.js           - logowanie OAuth do Google
    api.js            - API dla strony klienta i panelu admina
  public/
    index.html         - strona rezerwacji dla klienta
    admin.html          - panel administracyjny
    css/style.css
    js/booking.js       - logika strony klienta
    js/admin.js          - logika panelu admina
```
