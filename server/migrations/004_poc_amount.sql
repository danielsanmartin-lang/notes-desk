-- Importe a mano para las PoCs sin deal de HubSpot (si tienen deal, manda el de HubSpot).
ALTER TABLE pocs ADD COLUMN amount REAL;
ALTER TABLE pocs ADD COLUMN currency TEXT;
