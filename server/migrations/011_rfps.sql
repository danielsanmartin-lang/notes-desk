-- RFPs: van en la misma tabla que las PoCs (kind = 'rfp') y reutilizan sus tareas, contactos e historial.
-- Estados de una RFP sin tocar el CHECK de status:
--   En preparación = 'active' sin submitted_at · Presentada = 'active' con submitted_at
--   Adjudicada = 'won' · Perdida = 'lost' · Descartada (no nos presentamos) = 'lost' con close_reason 'declined'.

ALTER TABLE pocs ADD COLUMN kind TEXT NOT NULL DEFAULT 'poc' CHECK (kind IN ('poc', 'rfp'));
ALTER TABLE pocs ADD COLUMN submission_deadline TEXT;  -- fecha límite de entrega
ALTER TABLE pocs ADD COLUMN questions_deadline TEXT;   -- fecha límite de preguntas / aclaraciones
ALTER TABLE pocs ADD COLUMN award_date TEXT;           -- adjudicación prevista
ALTER TABLE pocs ADD COLUMN submitted_at TEXT;         -- cuándo se presentó
ALTER TABLE pocs ADD COLUMN portal_url TEXT;           -- portal de licitación
ALTER TABLE pocs ADD COLUMN tender_ref TEXT;           -- nº de expediente
ALTER TABLE pocs ADD COLUMN close_reason TEXT CHECK (close_reason IN ('declined'));

-- El historial admite dos hechos nuevos: RFP presentada y RFP descartada. SQLite no cambia un CHECK con ALTER,
-- así que se rehace la tabla (nadie la referencia, no hay cascadas) y, con ella, la vista que la usa.
DROP VIEW IF EXISTS v_week_log;

CREATE TABLE activity_new (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER REFERENCES items(id) ON DELETE CASCADE,
  poc_id      INTEGER REFERENCES pocs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('created', 'touch', 'reply', 'note', 'done', 'rescheduled',
                                            'paused', 'resumed', 'won', 'lost', 'submitted', 'declined')),
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
