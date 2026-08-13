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

## Phase 2: Datentiefe (Enrichment)

### Ausführungs-Reihenfolge

```bash
# 1. DB migrieren (auf VPS)
mariadb -u root -p buedchen < backend/database/migrate-phase2.sql

# 2. Script-Dependencies installieren
cd scripts && npm install

# 3. POIs seeden (OSM + kuratierte Liste)
node scripts/seed-pois.mjs

# 4. Editorial-Quellen scrapen
node scripts/scrape-editorial.mjs

# 5. Bulk-Enrichment (Windows-PC via Invoke-TrackedTask)
# SSH-Tunnel vorher starten: ssh -L 13306:127.0.0.1:3306 -N hetzner
# DB_PORT=13306 in .env setzen für lokalen Tunnel
Invoke-TrackedTask -Name "buedchen-enrich" -Command "node scripts/bulk-enrich.mjs"

# 6. Review-Queue prüfen
curl -u dominik:PASSWORT https://buedchen.slightlymad.de/api/review-queue

# 7. enrich-buedchen.mjs testen (VPS-Script, noch nicht als Cron aktiviert)
node scripts/enrich-buedchen.mjs --dry-run
```

### Umgebungsvariablen (Phase 2)

Zusätzlich zu Phase 1 in `.env` eintragen:

```
OPENROUTER_API_KEY=      # für VPS-Cron-Script
OLLAMA_BASE_URL=http://localhost:11434/v1
CONFIDENCE_THRESHOLD=0.65
REVIEW_QUEUE_USER=dominik
REVIEW_QUEUE_PASS=       # sicheres Passwort wählen
```

Auf dem VPS: `REVIEW_QUEUE_USER` und `REVIEW_QUEUE_PASS` als Umgebungsvariablen in der
PHP-FPM-Konfiguration oder `nginx`-Proxy setzen.

### VPS-Cron (DEAKTIVIERT — erst nach Validierung aktivieren)

```
# DEAKTIVIERT — erst nach Validierung des Bulk-Enrichments aktivieren
# 30 3 * * 1 node /var/www/buedchen/scripts/enrich-buedchen.mjs \
#   >> /var/log/buedchen-enrich.log 2>&1
```

Den Cron aktivieren wenn:
- Bulk-Enrichment für alle bestehenden Büdchen erfolgreich durchgelaufen ist
- Review-Queue auf unter 10% der Büdchen-Zahl gesunken ist
- `enrich-buedchen.mjs --dry-run` fehlerfrei auf dem VPS läuft

---

## Wöchentlicher Import (Cron auf VPS)

```
0 3 * * 1 node /var/www/buedchen/scripts/import-buedchen.mjs >> /var/log/buedchen-import.log 2>&1
```
