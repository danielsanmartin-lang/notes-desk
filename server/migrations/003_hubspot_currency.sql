-- Moneda del importe del deal (los deals de LATAM van en USD y los de España en EUR).
ALTER TABLE pocs ADD COLUMN hubspot_currency TEXT;
