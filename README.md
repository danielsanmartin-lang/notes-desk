# Zepo Desk

Seguimiento de las tareas en Zepo: **follow-ups**, **tareas pendientes** y las tareas de cada
**PoC en curso**.

Se usa como app de escritorio (`/Applications/Zepo Desk.app`). Todo se guarda en una base de datos
SQLite local.

## Cómo se usa

- **Hoy**: lo que vence hoy o antes, los follow-ups que toca volver a perseguir, lo destacado (★) y,
  en un grupo aparte, todo lo que no tiene fecha y te toca a ti (también las tareas de las PoCs
  activas, con el nombre de su PoC). El número de la barra lateral, del Dock y de la barra de menús
  cuenta solo lo que vence, no lo que no tiene fecha.
- **Próximos 7 días**: lo programado, agrupado por día.
- **Follow-ups**: dos grupos, *Me toca* y *Esperando respuesta*, con los días que llevas esperando
  (verde, ámbar, rojo).
  - **Registrar toque** (⌘T o el botón «Toque» de la fila): canal, nota y cuándo volver a perseguir
    (por defecto en 3 días, nunca en fin de semana). Queda en la bitácora y pasa a *Esperando*.
  - **Han respondido**: vuelve a *Me toca*, o se cierra.
  - Cuando llega la fecha y sigue sin respuesta, salta a *Hoy* como «Toca volver a perseguir».
- **Tareas pendientes**: lista libre, se reordena arrastrando.
- **PoCs en curso**: separadas en **Iberia** (España, Portugal y Andorra) arriba y **LATAM** debajo
  (y «Sin país» si falta), con el total de importe por moneda de cada región. Barra de filtros
  (búsqueda, estado, país, owner), orden (importe, inicio, creación, cierre previsto, progreso, último
  movimiento, nombre) y vista en **tarjetas o lista**. El importe es el del deal de HubSpot o, si no
  hay deal, uno a mano en la ficha. Las ganadas y perdidas pasan a **PoCs concluidas**, con su resumen.
- Cada PoC: una tarjeta (importe, progreso, siguiente tarea, etapa de HubSpot). Dentro, su
  checklist, notas, historial, el enlace al deal y **Pausar hasta…** (sus tareas desaparecen de Hoy y
  vuelven solas cuando termina la pausa). Al crearla se puede partir de una plantilla de checklist.
- **Cuentas**: salen solas de la empresa de cada tarea y de cada PoC (sin distinguir mayúsculas ni
  acentos). Cada cuenta reúne lo que te toca, lo que espera respuesta, sus PoCs, los contactos
  (incluidos los admins de sus PoCs), lo completado en 30 días y su historial.
- **Estadísticas** (filtrables por Todas / Iberia / LATAM): completadas, toques y respuestas por semana (con el periodo anterior), tasa y
  tiempo medio de respuesta, follow-ups esperando según antigüedad, toques por canal, cuentas con
  más actividad, actividad por región, PoCs por región y por país, días que lleva cada PoC y cierres
  previstos por mes. Periodo de 4 semanas a 1 año.
- **Semanas**: por cada semana ISO (W44 · 26 oct – 1 nov), lo completado, los toques y las respuestas.
  **Copiar resumen** lo deja en markdown en el portapapeles.
- **Papelera**: lo borrado se recupera hasta que la vacías.

Cada tarea tiene un panel de detalle con fecha, recordatorio con hora, empresa, contacto, canal,
notas, subtareas, una **plantilla de mensaje** (Copiar / abrir en WhatsApp / email) y su **bitácora**.

### Escribir rápido

En el campo «Añadir…» de cada lista, al empezar a escribir se abre debajo un menú con el **tipo**
(Tarea, Follow-up o una PoC) y la **fecha** (Sin fecha, Hoy, Mañana, viernes, próximo lunes… u
Otra). Lo que entiende del texto aparece ya marcado; lo que eliges en el menú manda. Tab cambia el
tipo. Por defecto una tarea nueva **no lleva fecha** (en Próximos 7 días, mañana). En la página de
una PoC el menú solo ofrece la fecha.

El tipo de una tarea ya creada se cambia en su panel, fila **Tipo** (Tarea / Follow-up / PoC).

Lo mismo se entiende en la **captura rápida** (⌥Espacio desde cualquier app):

| Escribes | Entiende |
| --- | --- |
| `FUP Catalina BCI el viernes` | follow-up, fecha viernes, empresa BCI |
| `Kickoff @cafam jueves 10:00` | tarea de la PoC Cafam, jueves, aviso a las 10:00 |
| `Preparar precio #tarea !` | tarea, destacada |
| `pasado mañana`, `en 3 días`, `30 oct`, `la semana que viene`, `el lunes que viene` | fechas |

`#fup` / `#tarea` / `#poc` fijan la categoría y `@nombre` la PoC (`@"Corporación América"` si lleva
espacios). En la captura rápida, Tab cambia el tipo, ↩ guarda y ⌘↩ guarda y abre la tarea.

### Atajos

⌘K buscar y acciones · ⌘N nueva tarea · ⌘1–9 secciones · ⌘, ajustes · ↑ ↓ moverse por la lista ·
Espacio completar · ⌘T registrar toque · ⌘⌫ a la papelera · Esc cerrar el panel. Arrastrar una tarea a
una PoC o categoría de la barra lateral la mueve allí.

### Barra de menús y avisos

El icono de la barra de menús muestra cuántas cosas tienes hoy y las lista para abrir cualquiera. El
mismo número sale en el Dock. Cerrar la ventana no cierra la app (⌘Q sí).

- **Resumen diario** a la hora de los ajustes (9:00 por defecto): «Hoy: 4 pendientes · Volver a
  perseguir: BCI · Follow-ups: IMQ, Eurecat».
- **Recordatorio** en cada tarea con hora (`… jueves 10:00` o desde el panel).

## Integraciones

- **HubSpot (solo lectura).** Cada PoC acepta el enlace o el ID de su deal y lo abre en el
  navegador. Si hay token, además sincroniza nombre, etapa, importe y fecha de cierre, y permite
  buscar entre tus deals del pipeline Sales. El token se lee igual que en
  `~/.hermes/scripts/hubspot_fechas.py`: variable `HUBSPOT_TOKEN` o la línea `HUBSPOT_TOKEN=…` de
  `~/.hermes/.env`. Nunca se escribe en HubSpot.
- **Importar PoCs de HubSpot.** `scripts/import-hubspot-pocs.js deals.json` crea o actualiza una PoC por
  cada deal en etapa PoC (nombre, empresa, país, owner, fecha de entrada en PoC, importe con su moneda,
  cierre y enlace) y añade sus tareas abiertas de HubSpot. Se puede repetir sin duplicar y no pisa lo
  editado a mano. El JSON se saca de HubSpot con Claude (formato en la cabecera del script).
- **Informe semanal.** `~/.claude/skills/informe-semanal/scripts/hechos_semana.py` lee esta base
  (solo lectura) y añade a los hechos de la semana los toques, respuestas, tareas completadas y
  cambios de estado de PoCs.
- **Copia de seguridad.** La skill `backup-sistema` incluye la base de datos.

## Datos

- Base de datos: `~/Library/Application Support/Zepo Desk/zepo-desk.db` (SQLite, modo WAL).
- Copias automáticas: una al día en `…/Zepo Desk/backups/`, se guardan las 14 últimas.
- Tablas: `items` (follow-ups, tareas y tareas de PoC; `state` = `todo` me toca, `waiting` esperando,
  `done`), `pocs`, `activity` (la bitácora: toques, respuestas, notas, completadas, pausas…),
  `settings`. La vista `v_week_log` da cada hecho con su semana ISO (`2026-W44`).
- Para leerla desde fuera sin riesgo: `sqlite3 "file:…/zepo-desk.db?mode=ro"`.

## Arquitectura

```
Electron (proceso principal)          electron/
 ├─ Ventana principal ──┐
 ├─ Captura rápida ─────┤  HTTP en 127.0.0.1 (puerto libre) + token por sesión
 ├─ Barra de menús      │
 ├─ Avisos              │
 └─ Servidor Express ◄──┘             server/   (index.js rutas, repo.js lógica, db.js SQLite)
        └─ better-sqlite3 → zepo-desk.db
UI: React 19 + TypeScript + Vite + Tailwind v4   src/
Lógica compartida (fechas, parser de captura)    shared/
```

Como en S1, el servidor va dentro de Electron y solo escucha en 127.0.0.1; la API exige un token que
cambia en cada arranque. La UI se habla con él por HTTP, así que en desarrollo se puede abrir en el
navegador con datos reales.

## Descargar

Cada versión publicada está en [Releases](https://github.com/danielsanmartin-lang/zepo-desk/releases) como
`Zepo-Desk-X.Y.Z-mac-arm64.zip` (Apple Silicon). Descomprime, arrastra **Zepo Desk.app** a Aplicaciones y,
la primera vez, clic derecho → **Abrir** (está firmada ad-hoc, no notarizada). Si macOS dice que está
dañada: `xattr -dr com.apple.quarantine "/Applications/Zepo Desk.app"`.

## Publicar una versión

1. Sube `version` en `package.json` y haz commit.
2. Escribe las notas en `docs/releases/vX.Y.Z.md` (si no, GitHub las genera con los commits).
3. `npm run release`: pasa los tests, empaqueta la app, la comprime con `ditto`, crea la etiqueta,
   la sube y publica la release con el zip.

Cada push a `main` pasa los tests y los tipos en GitHub Actions (`.github/workflows/test.yml`).

## Recompilar e instalar

```bash
npm run app:install
```

Compila la UI, empaqueta el `.app` con electron-builder, lo firma ad-hoc y lo copia a
`/Applications` (cierra antes la app si está abierta).

## Desarrollo

```bash
npm run seed       # crea data/dev.db con datos de ejemplo (las tareas del Google Doc de W44)
npm run dev        # Vite en :5173 + Electron con el servidor en :4100, usando data/dev.db
npm run dev:web    # lo mismo sin Electron: la UI en el navegador (http://localhost:5173)
npm test           # node:test bajo el Node de Electron: fechas, parser, flujo de follow-ups, PoCs, semanas
npm run icons      # regenera build/icon.icns y los iconos de la barra de menús
```

`better-sqlite3` está compilado para el Node de Electron (lo hace `postinstall`), por eso el servidor
de desarrollo y los tests corren con `ELECTRON_RUN_AS_NODE=1 electron …` y no con `node`.

El proyecto está en git; cada cambio, en su commit.
