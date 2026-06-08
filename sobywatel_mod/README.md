# sObywatel — Deployment Guide

## Struktura projektu

```
/server.js          ← Express backend (API + serwowanie plików)
/package.json
/render.yaml        ← Konfiguracja Render
/public/            ← Wszystkie pliki frontend (HTML, CSS, JS, assets)
  generator.html    ← Strona aktywacji kluczem (startowa)
  activate.html     ← Formularz wpisywania klucza
  login.html        ← Logowanie do mObywatela
  assistant.html    ← Asystent (komendy z DB)
  admin-panel.html  ← Panel admina (/admin-panel.html)
```

## 1. Neon DB — konfiguracja

1. Wejdź na https://neon.tech i stwórz projekt
2. W panelu kliknij **Connection Details** → skopiuj **Connection string (pooled)**
3. Zapisz jako `DATABASE_URL` w zmiennych środowiskowych

Tabele tworzą się automatycznie przy pierwszym uruchomieniu.

## 2. Render — deployment

### Opcja A: przez render.yaml (zalecane)
1. Wgraj ten folder jako repo na GitHub
2. Na https://render.com → New → Web Service → połącz z repo
3. Render wykryje `render.yaml` automatycznie

### Opcja B: ręczna konfiguracja
- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`

### Zmienne środowiskowe na Render:
| Zmienna | Wartość |
|---------|---------|
| `DATABASE_URL` | Connection string z Neon (pooled) |
| `ADMIN_TOKEN` | Twoje hasło do panelu admina |

## 3. Adresy

| Strona | URL |
|--------|-----|
| Start (aktywacja) | `https://twoja-domena.onrender.com/` |
| Panel admina | `https://twoja-domena.onrender.com/admin-panel.html` |

## 4. API Endpoints

### Publiczne
- `POST /api/activate` — aktywacja klucza przez użytkownika
- `POST /api/validate` — weryfikacja hasha przy wejściu do aplikacji
- `GET /api/assistant/commands` — pobieranie komend asystenta

### Admin (wymagają nagłówka `x-admin-token: TOKEN`)
- `POST /api/admin/login` — logowanie do panelu
- `GET /api/admin/keys` — lista kluczy
- `POST /api/admin/keys/generate` — generowanie kluczy
- `POST /api/admin/keys/:id/block` — blokowanie klucza
- `POST /api/admin/keys/:id/unblock` — odblokowywanie
- `DELETE /api/admin/keys/:id` — usuwanie klucza
- `GET /api/admin/commands` — lista komend asystenta
- `POST /api/admin/commands` — dodanie komendy
- `PUT /api/admin/commands/:id` — edycja komendy
- `DELETE /api/admin/commands/:id` — usuwanie komendy

## 5. Jak dodawać komendy asystenta

1. Wejdź na `twoja-domena/admin-panel.html`
2. Zaloguj się hasłem z `ADMIN_TOKEN`
3. Przejdź do zakładki **Komendy asystenta**
4. Wpisz komendę (np. `/cennik`), etykietę i odpowiedź (HTML dozwolony)
5. Kliknij **Dodaj komendę**

Komenda będzie od razu widoczna w menu asystenta u wszystkich użytkowników.
