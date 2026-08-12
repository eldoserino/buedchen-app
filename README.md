# buedchen.app

Kölner Büdchen-Verzeichnis — PWA mit Karte, Liste, Detailseiten und kuratierten Touren.

## Tech Stack

| Schicht  | Technologie                              |
|----------|------------------------------------------|
| Frontend | React 19 + Vite 6, CSS Custom Properties |
| Backend  | PHP 8.5 + Slim 4                         |
| Datenbank| MariaDB                                  |
| Karte    | react-leaflet 5 + leaflet.markercluster  |
| Icons    | @phosphor-icons/react (Solid)            |
| Deploy   | Hetzner VPS via GitHub Actions + nginx   |

## Setup

### Voraussetzungen

- Node.js 22+
- PHP 8.5 + Composer
- MariaDB

### Datenbank

```bash
# Auf dem Server als root:
mariadb -u root -p < backend/database/setup.sql
# Passwort in setup.sql vorher anpassen!
```

### Backend (PHP)

```bash
cd backend
cp config.example.php config.php
# config.php ausfüllen (DB-Credentials)
composer install
php -S localhost:3009 -t public   # lokaler Dev-Server
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # Dev-Server auf Port 3008 (proxied /api → 3009)
npm run build  # Produktions-Build nach dist/
```

### Büdchen importieren

```bash
cp .env.example .env
# GOOGLE_PLACES_API_KEY + DB_* in .env eintragen

cd scripts && npm install
cd ..
node scripts/import-buedchen.mjs
```

## Deploy

Push auf `main` → GitHub Actions baut Frontend + Backend und deployt per rsync auf den VPS.

**GitHub Secrets** (einmalig setzen):

```bash
gh secret set VPS_HOST  # 167.235.130.243
gh secret set VPS_USER  # root
gh secret set VPS_SSH_KEY < ~/.ssh/hetzner_key
```

**Nginx-Config** auf dem VPS einrichten:

```bash
scp nginx/buedchen.slightlymad.de.conf hetzner:/etc/nginx/sites-available/
ssh hetzner "ln -sf /etc/nginx/sites-available/buedchen.slightlymad.de.conf /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
```

**Verzeichnis auf VPS anlegen:**

```bash
ssh hetzner "mkdir -p /var/www/buedchen/frontend/dist /var/www/buedchen/frontend/dist/photos"
```

## Projektstruktur

```
frontend/   React + Vite PWA
backend/    PHP Slim 4 API
scripts/    Büdchen-Import (Google Places API)
nginx/      nginx vhost config
```

## Wöchentlicher Import (Cron auf VPS)

```
0 3 * * 1 node /var/www/buedchen/scripts/import-buedchen.mjs >> /var/log/buedchen-import.log 2>&1
```
