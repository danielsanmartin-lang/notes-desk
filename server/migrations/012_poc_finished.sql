-- PoC «Finalizada»: la prueba ha terminado pero el cliente aún no ha decidido (luego pasará a ganada o perdida).
-- Es un estado nuevo de status, con su fecha en finished_at, y un hecho nuevo en el historial ('finished').
-- SQLite no cambia un CHECK con ALTER, así que se rehacen pocs y activity (y la vista que las usa).
-- migrate() desactiva las claves foráneas mientras dura: así borrar la tabla vieja no arrastra sus tareas en cascada.
DROP VIEW IF EXISTS v_week_log;

CREATE TABLE pocs_new (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  company             TEXT,
  country             TEXT,                -- ISO-2, para la bandera
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused', 'finished', 'won', 'lost')),
  paused_until        TEXT,
  color               TEXT,
  hubspot_deal_id     TEXT,
  hubspot_url         TEXT,
  hubspot_name        TEXT,
  hubspot_stage       TEXT,
  hubspot_amount      REAL,
  hubspot_close_date  TEXT,
  hubspot_synced_at   TEXT,
  notes               TEXT,
  sort_order          REAL NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  closed_at           TEXT,
  owner               TEXT,
  start_date          TEXT,
  hubspot_currency    TEXT,
  amount              REAL,
  currency            TEXT,
  partner             TEXT,
  stale_snoozed_until TEXT,
  kind                TEXT NOT NULL DEFAULT 'poc' CHECK (kind IN ('poc', 'rfp')),
  submission_deadline TEXT,
  questions_deadline  TEXT,
  award_date          TEXT,
  submitted_at        TEXT,
  portal_url          TEXT,
  tender_ref          TEXT,
  close_reason        TEXT CHECK (close_reason IN ('declined')),
  finished_at         TEXT                 -- cuándo terminó la prueba ('YYYY-MM-DDTHH:MM:SS')
);

INSERT INTO pocs_new (id, name, company, country, status, paused_until, color, hubspot_deal_id, hubspot_url, hubspot_name,
                      hubspot_stage, hubspot_amount, hubspot_close_date, hubspot_synced_at, notes, sort_order, created_at,
                      updated_at, closed_at, owner, start_date, hubspot_currency, amount, currency, partner,
                      stale_snoozed_until, kind, submission_deadline, questions_deadline, award_date, submitted_at,
                      portal_url, tender_ref, close_reason)
SELECT id, name, company, country, status, paused_until, color, hubspot_deal_id, hubspot_url, hubspot_name,
       hubspot_stage, hubspot_amount, hubspot_close_date, hubspot_synced_at, notes, sort_order, created_at,
       updated_at, closed_at, owner, start_date, hubspot_currency, amount, currency, partner,
       stale_snoozed_until, kind, submission_deadline, questions_deadline, award_date, submitted_at,
       portal_url, tender_ref, close_reason
FROM pocs;

DROP TABLE pocs;
ALTER TABLE pocs_new RENAME TO pocs;

CREATE TABLE activity_new (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER REFERENCES items(id) ON DELETE CASCADE,
  poc_id      INTEGER REFERENCES pocs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('created', 'touch', 'reply', 'note', 'done', 'rescheduled',
                                            'paused', 'resumed', 'finished', 'won', 'lost', 'submitted', 'declined')),
  channel     TEXT,
  body        TEXT,
  meta        TEXT,
  occurred_at TEXT NOT NULL,
  company     TEXT
);

INSERT INTO activity_new (id, item_id, poc_id, kind, channel, body, meta, occurred_at, company)
SELECT id, item_id, poc_id, kind, channel, body, meta, occurred_at, company FROM activity;

DROP TABLE activity;
ALTER TABLE activity_new RENAME TO activity;

CREATE INDEX activity_item ON activity (item_id, occurred_at);
CREATE INDEX activity_poc  ON activity (poc_id, occurred_at);
CREATE INDEX activity_time ON activity (occurred_at);

CREATE VIEW v_week_log AS
SELECT strftime('%G-W%V', a.occurred_at) AS week,
       a.id, a.kind, a.channel, a.body, a.occurred_at,
       a.item_id, i.title, i.category, i.company, i.contact, i.parent_id,
       coalesce(a.poc_id, i.poc_id) AS poc_id, p.name AS poc_name, p.kind AS poc_kind
FROM activity a
LEFT JOIN items i ON i.id = a.item_id
LEFT JOIN pocs  p ON p.id = coalesce(a.poc_id, i.poc_id)
WHERE a.kind <> 'created';
