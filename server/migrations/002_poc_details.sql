-- Ficha de la PoC: quién la lleva, cuándo empieza y los admins del cliente que usarán la plataforma.

ALTER TABLE pocs ADD COLUMN owner TEXT;
ALTER TABLE pocs ADD COLUMN start_date TEXT;

CREATE TABLE poc_admins (
  id         INTEGER PRIMARY KEY,
  poc_id     INTEGER NOT NULL REFERENCES pocs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT,
  role       TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX poc_admins_poc ON poc_admins (poc_id, sort_order);
