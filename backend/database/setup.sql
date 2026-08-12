-- buedchen.app — Datenbank-Setup
-- Ausführen als: mariadb -u root -p < backend/database/setup.sql

CREATE DATABASE IF NOT EXISTS buedchen
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'buedchen'@'localhost'
  IDENTIFIED BY 'DEIN_PASSWORT_HIER_ERSETZEN';

GRANT ALL PRIVILEGES ON buedchen.* TO 'buedchen'@'localhost';
FLUSH PRIVILEGES;

USE buedchen;

CREATE TABLE IF NOT EXISTS buedchen (
  id                    VARCHAR(128)     PRIMARY KEY,
  name                  VARCHAR(255)     NOT NULL,
  address               VARCHAR(512),
  veedel                VARCHAR(128),
  postcode              VARCHAR(10),
  lat                   DECIMAL(9,6)     NOT NULL,
  lng                   DECIMAL(9,6)     NOT NULL,
  google_place_id       VARCHAR(255)     UNIQUE,
  google_rating         DECIMAL(2,1),
  google_review_count   INT,
  opening_hours         JSON,
  phone                 VARCHAR(64),
  website               VARCHAR(512),
  photo_path            VARCHAR(512),
  photo_attribution     VARCHAR(255),
  feature_seating       BOOLEAN          DEFAULT FALSE,
  feature_coffee        BOOLEAN          DEFAULT FALSE,
  tags                  JSON,
  editorial_badges      JSON,
  untappd_venue_id      VARCHAR(128),
  last_synced_at        TIMESTAMP        NULL,
  created_at            TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tours (
  id              VARCHAR(128)  PRIMARY KEY,
  slug            VARCHAR(128)  UNIQUE NOT NULL,
  title           VARCHAR(255),
  description     TEXT,
  estimated_time  VARCHAR(64),
  sort_order      INT           DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tour_buedchen (
  tour_id       VARCHAR(128),
  buedchen_id   VARCHAR(128),
  sort_order    INT DEFAULT 0,
  PRIMARY KEY (tour_id, buedchen_id),
  FOREIGN KEY (tour_id)     REFERENCES tours(id)    ON DELETE CASCADE,
  FOREIGN KEY (buedchen_id) REFERENCES buedchen(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Demo-Touren für Entwicklung
INSERT IGNORE INTO tours (id, slug, title, description, estimated_time, sort_order) VALUES
('tour-01', 'bruessel-bogen',   'Brüsseler Bogen',    'Vom Rathenauplatz durchs Belgische bis zur Aachener. Sechs Buden, ein Nachmittag.', '2–3 Std', 1),
('tour-02', 'nippeser-runde',   'Nippeser Runde',     'Wilhelmplatz, Neusser Straße, zurück. Kaffee vorne, Kölsch hinten.',              '2 Std',   2),
('tour-03', 'suedstadt-klassiker', 'Südstadt Klassiker', 'Chlodwigplatz aufwärts. Die Buden, die es schon immer gab.',                 '3 Std',   3);
