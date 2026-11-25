-- Deal abierto con una cuenta: se marca desde la ficha de cualquier tarea (o desde la cuenta) y vale para toda la
-- cuenta, aunque luego se completen o borren sus tareas. Si una cuenta tiene deal y lleva los días de Ajustes sin
-- nada nuevo, sale en Inicio como «Deal sin movimiento». key = nombre normalizado, como en accounts.
-- Una fila = deal abierto; cerrarlo borra la fila.
CREATE TABLE IF NOT EXISTS account_deals (
  key           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  opened_at     TEXT NOT NULL,        -- cuándo se marcó ('YYYY-MM-DDTHH:MM:SS'): cuenta como último movimiento
  snoozed_until TEXT                  -- «Silenciar»: no sale en Inicio hasta esta fecha ('YYYY-MM-DD')
);
