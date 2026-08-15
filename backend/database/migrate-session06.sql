-- buedchen.app — Session 06: POI-Anreicherung & Geo-Kontext
-- Backup: mysqldump -u root -p buedchen > backup-vor-session06.sql
-- Ausführen: mysql -u root -p buedchen < backend/database/migrate-session06.sql

USE buedchen;

ALTER TABLE tour_pois
  ADD COLUMN IF NOT EXISTS importance    TINYINT      NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS tour_eligible BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS opening_info  VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS source        ENUM('osm','curated','manual') NOT NULL DEFAULT 'osm';

-- Bestehende kuratierte POIs nachträglich markieren (keine osm_id = manuell kuratiert)
UPDATE tour_pois SET source = 'curated', importance = 3 WHERE osm_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_poi_geo      ON tour_pois(lat, lng);
CREATE INDEX IF NOT EXISTS idx_poi_category ON tour_pois(category, tour_eligible);
