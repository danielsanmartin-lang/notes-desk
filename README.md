# Notes Desk

A local-first desktop app for macOS that keeps your **notes, tasks, follow-ups and projects** in one
place. Everything is stored in a local SQLite database: no account, no cloud.

## Features

- **Home**: what is due today or earlier, the follow-ups to chase again, starred items (★) and, in a
  separate group, everything without a date that is on you. Dated items stay hidden until their day.
  A **search box** (⌘F) finds open and finished items by title, notes, company, contact, project or
  history, with the matches highlighted.
- **Next 7 days**: everything scheduled, grouped by day.
- **Follow-ups**: two groups, *My turn* and *Waiting for reply*, with how long you have been waiting
  (green, amber, red).
  - **Log a touch** (⌘T): channel, note and when to chase again (3 days by default, never on a
    weekend). It goes into the log and moves to *Waiting*.
  - **They replied**: back to *My turn*, or closed.
  - When the date arrives with no reply, it shows up on Home as "Chase again".
- **Tasks**: a free list, reordered by dragging.
- **Projects** (PoCs), split by region, with filters (search, status, country, owner), sorting and
  a **cards or list** view. Each project has its checklist, notes, history, contacts (main contact,
  client admins and partner contact), an optional amount and **Pause** (its tasks leave Home until you
  resume it). Won and lost projects move to **Closed projects**.
  - The project page also shows what you wrote down for its **account** without putting it in the
    project, with a one-click **Move into project**.
  - Each task can be marked as going to the **client or the partner**; the project card says who has
    gone without answering, and for how long.
  - The header shows the **next step**, with its date.
  - Suggested project tasks (set in Settings) are added with one click.
- **Accounts**: built automatically from the company of each task and project (ignoring case and
  accents). Each account gathers what is on you, what is waiting, its projects, contacts, what was
  done in the last 30 days and its history.
- **Stats**: completed items, touches and replies per week, reply rate and time, follow-ups by age,
  touches by channel, most active accounts and projects by region. Periods from 4 weeks to 1 year.
- **Weeks**: for each ISO week, what was completed, touched and answered. **Copy summary** puts it on
  the clipboard as Markdown.
- **Trash**: deleted items can be restored until you empty it.

Every item has a detail panel with date, timed reminder, company, contact, channel, notes, subtasks,
a **message template** (copy / open in WhatsApp / email) and its **log**.

### Quick entry

In each list's "Add…" field, a menu opens as you type with the **type** (Task, Follow-up or a
project) and the **date** (No date, Today, Tomorrow, In 3 working days, Friday, next Monday… or
another one). What the text already says is preselected; what you pick in the menu wins. Tab cycles
the type. If the company has an active project, the field asks whether the task belongs in it.

The same parsing works in **quick capture** (⌥Space from any app). Dates are understood in Spanish:

| You type | It understands |
| --- | --- |
| `FUP Catalina BCI el viernes` | follow-up, due Friday, company BCI |
| `Kickoff @acme jueves 10:00` | task of the Acme project, Thursday, reminder at 10:00 |
| `Preparar precio #tarea !` | task, starred |
| `pasado mañana`, `en 3 días`, `en 3 días laborables`, `30 oct`, `la semana que viene` | dates |

`#fup` / `#tarea` / `#poc` set the category and `@name` the project (`@"Two words"` with spaces). In
quick capture, Tab changes the type, ↩ saves and ⌘↩ saves and opens the item.

**Appearance** (Settings): System, Light or Dark mode and six colour themes, each with a light and a
dark version.

### Shortcuts

⌘K search and actions · ⌘F Home search · ⌘N new task · ⌘1–9 sections · ⌘, settings · ↑ ↓ move
through the list · Space complete · ⌘T log a touch · ⌘⌫ move to trash · Esc close the panel. Dragging
an item onto a project or category in the sidebar moves it there.

### Menu bar and notifications

The menu bar icon shows how many things you have today and lists them. The same number appears on
the Dock. Closing the window does not quit the app (⌘Q does).

- **Daily digest** at the time set in Settings (9:00 by default).
- **Reminders** for any item with a time.

## Integrations

- **HubSpot (read-only, optional).** A project accepts the link or ID of its deal and opens it in the
  browser. With a `HUBSPOT_TOKEN` it also syncs the deal's name, stage, amount and close date. Nothing
  is ever written to HubSpot.
- **Import projects from HubSpot.** `scripts/import-hubspot-pocs.js deals.json` creates or updates
  one project per deal and adds its open tasks. It can be run again without duplicating anything and
  never overwrites what you edited by hand.

## Data

- Database: `~/Library/Application Support/Notes Desk/notes-desk.db` (SQLite, WAL mode).
- Automatic backups: one per day in the `backups/` folder next to it, keeping the last 14.
- Tables: `items` (follow-ups, tasks and project tasks; `state` = `todo`, `waiting`, `done`), `pocs`,
  `activity` (the log: touches, replies, notes, completions, pauses…), `accounts` and `settings`.
  The `v_week_log` view gives every event with its ISO week (`2026-W44`).
- To read it safely from outside, open it read-only: `sqlite3 "file:/path/to/the.db?mode=ro"`.

## Architecture

```
Electron (main process)               electron/
 ├─ Main window ────────┐
 ├─ Quick capture ──────┤  HTTP on 127.0.0.1 (free port) + per-session token
 ├─ Menu bar            │
 ├─ Notifications       │
 └─ Express server ◄────┘             server/   (index.js routes, repo.js logic, db.js SQLite)
        └─ better-sqlite3 → notes-desk.db
UI: React 19 + TypeScript + Vite + Tailwind v4   src/
Shared logic (dates, quick-entry parser)         shared/
```

The server runs inside Electron and only listens on 127.0.0.1; the API requires a token that changes
on every launch. The UI talks to it over HTTP, so in development it can also run in a browser.

## Download

Every published version is in [Releases](../../releases) as
`Notes-Desk-X.Y.Z-mac-arm64.zip` (Apple Silicon). Unzip it, drag **Notes Desk.app** into Applications and, the first time, right-click → **Open** (it is
ad-hoc signed, not notarized). If macOS says it is damaged:
`xattr -dr com.apple.quarantine "/Applications/Notes Desk.app"`.

## Publishing a version

1. Bump `version` in `package.json` and commit.
2. Write the notes in `docs/releases/vX.Y.Z.md` (otherwise GitHub generates them from the commits).
3. `npm run release`: runs the tests, packages the app, zips it with `ditto`, creates and pushes the
   tag and publishes the release with the zip.

Every push to `main` runs the tests and the type check in GitHub Actions (`.github/workflows/test.yml`).

## Build and install locally

```bash
npm run app:install
```

Builds the UI, packages the `.app` with electron-builder, signs it ad-hoc and copies it to
`/Applications` (quitting the app first if it is open).

## Development

```bash
npm run seed       # creates data/dev.db with sample data
npm run dev        # Vite on :5173 + Electron with the server on :4100, using data/dev.db
npm run dev:web    # the same without Electron: the UI in the browser (http://localhost:5173)
npm test           # node:test under Electron's Node: dates, parser, follow-up flow, projects, weeks
npm run icons      # regenerates build/icon.icns and the menu bar icons
```

`better-sqlite3` is compiled for Electron's Node (done by `postinstall`), so the dev server and the
tests run with `ELECTRON_RUN_AS_NODE=1 electron …` instead of `node`.
