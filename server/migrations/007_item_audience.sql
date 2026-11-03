-- A quién va cada tarea en una PoC con partner: al cliente (NULL) o al partner (Fujitsu, TRC…).
ALTER TABLE items ADD COLUMN audience TEXT CHECK (audience IN ('client', 'partner'));

-- Lo ya apuntado va al partner si lo nombra: «partner» o el nombre del partner de su PoC (o de la PoC de su cuenta).
UPDATE items SET audience = 'partner'
WHERE EXISTS (
  SELECT 1 FROM pocs p
  WHERE p.partner IS NOT NULL
    AND (p.id = items.poc_id OR (items.poc_id IS NULL AND lower(trim(p.company)) = lower(trim(items.company))))
    AND (lower(items.title || ' ' || coalesce(items.contact, '')) LIKE '%partner%'
         OR lower(items.title || ' ' || coalesce(items.contact, '')) LIKE '%' || lower(p.partner) || '%')
);
