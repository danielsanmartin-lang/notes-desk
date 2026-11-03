-- Esquema inicial de Notes Desk. Fechas en hora local: 'YYYY-MM-DD' y 'YYYY-MM-DDTHH:MM:SS'.

CREATE TABLE pocs (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  company            TEXT,
  country            TEXT,                -- ISO-2, para la bandera
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'won', 'lost')),
  paused_until       TEXT,
  color              TEXT,
  hubspot_deal_id    TEXT,
  hubspot_url        TEXT,
  hubspot_name       TEXT,
  hubspot_stage      TEXT,
  hubspot_amount     REAL,
  hubspot_close_date TEXT,
  hubspot_synced_at  TEXT,
  notes              TEXT,
  sort_order         REAL NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  closed_at          TEXT
);

-- Follow-ups, tareas y tareas de PoC. state: todo = me toca; waiting = la pelota está en su tejado.
CREATE TABLE items (
  id               INTEGER PRIMARY KEY,
  category         TEXT NOT NULL CHECK (category IN ('followup', 'task', 'poc')),
  poc_id           INTEGER REFERENCES pocs(id) ON DELETE CASCADE,
  parent_id        INTEGER REFERENCES items(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  notes            TEXT,
  company          TEXT,
  contact          TEXT,
  channel          TEXT CHECK (channel IN ('email', 'whatsapp', 'call', 'linkedin', 'meeting')),
  state            TEXT NOT NULL DEFAULT 'todo' CHECK (state IN ('todo', 'waiting', 'done')),
  due_date         TEXT,
  remind_at        TEXT,
  notified_at      TEXT,
  waiting_since    TEXT,
  touch_count      INTEGER NOT NULL DEFAULT 0,
  last_touch_at    TEXT,
  message_template TEXT,
  flagged          INTEGER NOT NULL DEFAULT 0,
  sort_order       REAL NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT,
  deleted_at       TEXT,
  CHECK (category <> 'poc' OR poc_id IS NOT NULL)
);

CREATE INDEX items_list      ON items (category, state) WHERE deleted_at IS NULL;
CREATE INDEX items_due       ON items (due_date) WHERE deleted_at IS NULL AND state <> 'done';
CREATE INDEX items_poc       ON items (poc_id);
CREATE INDEX items_parent    ON items (parent_id);
CREATE INDEX items_completed ON items (completed_at);
CREATE INDEX items_remind    ON items (remind_at) WHERE notified_at IS NULL;

-- Bitácora. meta guarda, en toques y respuestas, el estado anterior para poder deshacerlos.
CREATE TABLE activity (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER REFERENCES items(id) ON DELETE CASCADE,
  poc_id      INTEGER REFERENCES pocs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('created', 'touch', 'reply', 'note', 'done', 'rescheduled',
                                            'paused', 'resumed', 'won', 'lost')),
  channel     TEXT,
  body        TEXT,
  meta        TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX activity_item ON activity (item_id, occurred_at);
CREATE INDEX activity_poc  ON activity (poc_id, occurred_at);
CREATE INDEX activity_time ON activity (occurred_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Búsqueda ⌘K, sin distinguir acentos.
CREATE VIRTUAL TABLE items_fts USING fts5(
  title, notes, company, contact,
  content = 'items', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (rowid, title, notes, company, contact)
  VALUES (new.id, new.title, new.notes, new.company, new.contact);
END;

CREATE TRIGGER items_fts_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts (items_fts, rowid, title, notes, company, contact)
  VALUES ('delete', old.id, old.title, old.notes, old.company, old.contact);
END;

CREATE TRIGGER items_fts_au AFTER UPDATE OF title, notes, company, contact ON items BEGIN
  INSERT INTO items_fts (items_fts, rowid, title, notes, company, contact)
  VALUES ('delete', old.id, old.title, old.notes, old.company, old.contact);
  INSERT INTO items_fts (rowid, title, notes, company, contact)
  VALUES (new.id, new.title, new.notes, new.company, new.contact);
END;

-- Hechos fechados por semana ISO (mismo formato '2026-W44' que el informe semanal).
CREATE VIEW v_week_log AS
SELECT strftime('%G-W%V', a.occurred_at) AS week,
       a.id, a.kind, a.channel, a.body, a.occurred_at,
       a.item_id, i.title, i.category, i.company, i.contact, i.parent_id,
       coalesce(a.poc_id, i.poc_id) AS poc_id, p.name AS poc_name
FROM activity a
LEFT JOIN items i ON i.id = a.item_id
LEFT JOIN pocs  p ON p.id = coalesce(a.poc_id, i.poc_id)
WHERE a.kind <> 'created';
