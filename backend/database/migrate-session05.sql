-- buedchen.app — Session 05: Datenintegrität
-- Ausführen nach Backup:
--   mysqldump -u root -p buedchen > backup-vor-session05.sql
--   mysql -u root -p buedchen < backend/database/migrate-session05.sql

USE buedchen;

-- 1. Anzeigename (destilliert aus Rohnamen für UI-Darstellung)
ALTER TABLE buedchen
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(120) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS name_source   ENUM('original','ai_shortened','address_fallback')
                                          NOT NULL DEFAULT 'original' AFTER display_name;

-- 2. Geo-Kontext (wird in Session 06 befüllt, sobald POI-Datenbasis vollständig)
ALTER TABLE buedchen
  ADD COLUMN IF NOT EXISTS location_context JSON NULL;

-- 3. Bayesian-Score für faire Rangfolge (viele Bewertungen > wenige)
ALTER TABLE buedchen
  ADD COLUMN IF NOT EXISTS bayesian_score DECIMAL(4,3) NULL;

CREATE INDEX IF NOT EXISTS idx_bayesian ON buedchen(bayesian_score DESC);

-- 4. Prüf-Queue für Import-Filter (Nicht-Büdchen-Kandidaten)
CREATE TABLE IF NOT EXISTS import_review_queue (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  google_place_id  VARCHAR(255) UNIQUE,
  name             VARCHAR(255),
  address          VARCHAR(512),
  google_types     JSON,
  exclusion_reason VARCHAR(128),
  decision         ENUM('pending','accepted','rejected') DEFAULT 'pending',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
