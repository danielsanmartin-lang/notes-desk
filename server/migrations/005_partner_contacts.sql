-- Partner de la PoC (Fujitsu, TRC, Sofistic…) y tipos de contacto: además de los admins del cliente,
-- el contacto principal y el contacto del partner.
ALTER TABLE pocs ADD COLUMN partner TEXT;
ALTER TABLE poc_admins ADD COLUMN kind TEXT NOT NULL DEFAULT 'admin' CHECK (kind IN ('admin', 'main', 'partner'));
