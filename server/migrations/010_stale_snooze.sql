-- «Silenciar» el aviso de PoC sin movimiento: no vuelve a salir en Inicio hasta esta fecha ('YYYY-MM-DD').
ALTER TABLE pocs ADD COLUMN stale_snoozed_until TEXT;
