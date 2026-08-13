-- buedchen.app — Phase 2 Migration
-- Ausführen als: mariadb -u root -p buedchen < backend/database/migrate-phase2.sql

USE buedchen;

-- Neue Spalten in bestehender buedchen-Tabelle
ALTER TABLE buedchen
  ADD COLUMN IF NOT EXISTS buedchen_type      VARCHAR(32)   NULL,
  ADD COLUMN IF NOT EXISTS character_tags     JSON          NULL,
  ADD COLUMN IF NOT EXISTS editorial_sources  JSON          NULL,
  ADD COLUMN IF NOT EXISTS poi_distances      JSON          NULL,
  ADD COLUMN IF NOT EXISTS ai_summary         TEXT          NULL,
  ADD COLUMN IF NOT EXISTS ai_confidence      DECIMAL(3,2)  NULL,
  ADD COLUMN IF NOT EXISTS enriched_at        TIMESTAMP     NULL;

-- Review-Queue für manuelle Nachprüfung bei niedrigem Confidence-Score
CREATE TABLE IF NOT EXISTS enrichment_queue (
  id            INT           AUTO_INCREMENT PRIMARY KEY,
  buedchen_id   VARCHAR(128)  NOT NULL,
  reason        VARCHAR(255),
  ai_output     JSON,
  resolved      BOOLEAN       DEFAULT FALSE,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buedchen_id) REFERENCES buedchen(id)
) ENGINE=InnoDB;

-- Büdchen-unabhängige Tour-POIs (Plätze, Parks, Aussichten, Denkmäler etc.)
CREATE TABLE IF NOT EXISTS tour_pois (
  id              VARCHAR(128)    PRIMARY KEY,
  name            VARCHAR(255)    NOT NULL,
  description     TEXT,
  category        VARCHAR(32)     NOT NULL,
  lat             DECIMAL(9,6)    NOT NULL,
  lng             DECIMAL(9,6)    NOT NULL,
  address         VARCHAR(512),
  veedel          VARCHAR(128),
  photo_path      VARCHAR(512),
  osm_id          VARCHAR(64),
  tags            JSON,
  is_active       BOOLEAN         DEFAULT TRUE,
  created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
