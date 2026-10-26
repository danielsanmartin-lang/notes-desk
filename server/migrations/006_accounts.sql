-- Datos propios de cada cuenta (las cuentas salen de la empresa de las tareas y PoCs): de momento, su
-- empresa en HubSpot. key = nombre normalizado (sin mayúsculas ni acentos), como en la vista de cuentas.
CREATE TABLE accounts (
  key                TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  hubspot_company_id TEXT,
  hubspot_url        TEXT,
  updated_at         TEXT NOT NULL
);
