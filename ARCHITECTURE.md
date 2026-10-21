# Field Management Dashboard — Architecture

A browser dashboard for the field teams, hosted on GitHub Pages, that reads the **TSG Field Tracker** workbook from
the viewer's own computer (the OneDrive/SharePoint-synced copy). The field admin also uses it to mark jobs as
uploaded to Katapult, which writes back to the workbook. Coordinators and managers use it to see how their teams
are doing.

Status: planned, not built. Decisions below were settled on 2026-10-21.

---

## 1. Constraints and decisions

| Topic | Decision |
|---|---|
| Hosting | GitHub Pages: static files only, no server, no database |
| Data | The synced yearly master trackers (`TSG Field Tracker - Master 2025.xlsx`, `… 2026.xlsx`, …) in one folder, opened by each viewer from their own OneDrive sync folder and combined into one history (see §3a) |
| Browsers | Chrome or Edge on Windows (the File System Access API isn't in Firefox, Safari or on phones). Everyone is on Windows, so this is fine. |
| Data privacy | The workbook never leaves the viewer's computer. The repo holds only app code: **never commit the workbook or any exported data** (`*.xlsx`, `*.csv` in `.gitignore`). |
| How data gets in | Techs submit time on a Smartsheet form; the field admin copies it into the tracker by hand the next morning. The dashboard never adds rows. |
| Who edits | Only the field admin. Coordinators and managers view. Enforced by SharePoint library permissions (see §7). |
| What gets written | Only the **Uploaded to Katapult** column (set to `Yes`). Nothing else in the workbook is changed. |
| Tech app / Microsoft Graph / Power Apps | Out of scope (decided). |
| Look | Layout and colors of the v0 "Cyberpunk dashboard design" template, with KPI cards and tables following Tremor's dense, clean style |

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + React + TypeScript | Builds to static files; deployed by a GitHub Actions workflow |
| Styling | Tailwind CSS, cyberpunk design tokens | The v0 template is Tailwind/shadcn. Exact colors and fonts come from the template's source code (it wouldn't render in a preview during planning). |
| KPI cards and charts | Tremor copy-in components (built on Recharts), restyled with the theme | Tremor's density and structure, cyberpunk look |
| Tables | TanStack Table + TanStack Virtual | Sorting, grouping, column pinning; 20k+ rows scroll smoothly |
| Search | Own permit-ID matcher (no library) | Exact → starts with → contains → close spellings (typo distance), plus field filters (`opco:aep tech:smith`). A general text-search library split IDs into tiny pieces and missed close spellings. |
| Reading the workbook | SheetJS, run in a Web Worker | Parsing a ~4 MB workbook doesn't freeze the page |
| Writing the workbook | JSZip, editing cells in the sheet XML (see §8) | Every other part of the file stays byte-for-byte the same |
| State | Zustand | Small and simple |
| Saved settings | idb-keyval (IndexedDB) | Remembers the folder handle, the viewer's pins and preferences |
| Routing | Hash router (`#/permit/...`) | GitHub Pages has no server-side routing, so normal URLs would 404 on refresh |

---

## 3. The workbook

Only these sheets are read. The rest of the workbook is ignored, and none of it is written except column N of
Table1.

### `TSG Field Tracker` → table `Table1` (production data, ~20.5k rows)

| Column | Used as |
|---|---|
| A `OPCO` | Client / project (see umbrellas, §5) |
| B `Permit ID` | Job. `Coordinator` and `Drive Time` are placeholder entries, not permits. |
| C `Tech Name` | The person who logged the row (the team's logger) |
| D `Paired With` | Partner, or `N/A` when solo |
| E `Date` | Work date |
| F `Task` | KATAPULT, PCI, GO BACKS, POWER PCI, STAKING, DRIVE TIME (MOB/DEMOB), Coordination, MISC, QA/QC, … |
| G `Status` | Complete / In Progress |
| H `Poles Collected` | Production |
| I `Hours on Permit` | Productive hours |
| J `Drive Time Over 30 min - Mob/Demob` | Drive hours |
| K `Total` | Total hours |
| L `Mileage` | Miles |
| M `Notes` | Free text |
| N `Uploaded to Katapult` | **The one column the app writes.** `Yes` = uploaded. |
| O–U | Formula, helper or empty columns (Entergy, AEP, GIGAPOWER, Column1, TOTAL HOURS, PROJECT, Team Hours). **Not used.** The app does its own calculations. |

### `Validations` (hidden) → hitch schedule
Column C `Hitch Start Dates` and column E `Hitch End Dates`. Each hitch runs 8 days (Thursday to Thursday) and a
new one starts every 14 days. About 94% of logged rows fall inside a hitch, so everyone is on one rotation.

### Field schedules (not used for now)
`RM1 CNP`, `RM4 CNP`, `RM16 CNP` (Circuit, Status, Pole Count, Field Priority, Received Date, Field Due Date) and
`Entergy Eng Field Schedule` / `EntergyJU Field Schedule` list work waiting to be fielded (a snapshot, no history).
**Decided 2026-10-21: the data isn't polished enough to use yet**, so the dashboard doesn't read them. The reader,
circuit-to-permit matching and queue-vs-pace math are kept behind `READ_FIELD_SCHEDULES` in `src/data/parse.ts`
(off) with tests, so the field queue can come back to the Projects pages later. Everything below that mentions
scope, burn-down or due dates is deferred.

### What's in the file that a save must not damage
Power Query connections and query tables, 2 pivot tables and their cache, a chart, `calcChain.xml`, an add-in
(webextension), named sheet views, SharePoint `customXml` metadata, data validation and conditional formatting.
The main sheet XML is ~45 MB uncompressed.

---

## 3a. Yearly trackers (added 2026-10-21)

A new master tracker is started every year, so the dashboard combines all of them into one history.

- **Which files:** every workbook in the connected folder whose name contains "Field Tracker", ordered by the year in
  its name. The newest is the **current** tracker; older ones are history. A new year's workbook dropped into the
  folder is picked up on the next check (every 30 s) with no setup.
- **Same layout every year:** columns are found by header name, so small layout changes between years are fine.
  The 2025 tracker has the same columns plus extra helper columns, which are ignored.
- **Overlap at New Year:** trackers run a little past Dec 31 (2025's has rows into Jan 2026), and the next one starts
  Jan 1. A row in an older tracker that the newer one also has (same date, permit, tech and task) is dropped and the
  newer copy used; it's logged as "Also in the next year's tracker". Rows only in the older tracker are kept.
  2025 + 2026: 21 rows replaced.
- **Hitches:** the Validations lists of all years are combined. 2025's list has start dates only; ends are filled in
  from the usual 8-day length.
- **Current year only:** the upload queue, upload backlog and "uploaded" counts use the current tracker's rows only
  (2025 marked Uploaded to Katapult on only ~10% of rows), and write-back only ever touches the current tracker.
  Data-quality flags default to the current tracker, with past years one click away.
- **Row numbers repeat across years,** so every row and issue carries its workbook, and rows show as "2026 · 1157".
- **Speed:** past years don't change, so their parsed rows are cached in the browser (IndexedDB), keyed by file
  name, size, last-saved time and `PARSER_VERSION` (bump it whenever parsing changes). Only the current year is
  parsed on each load. First load with 2025 + 2026: ~5 s measured; later loads should be about the current year's
  ~2 s (the cache path hasn't been timed on a real folder yet).
- **2025 spellings handled:** tasks `QC / OTHER` (→ QA/QC), `PCI GO BACK` (→ GO BACKS), `FINAL STAKING` (→ STAKING);
  OPCO `ONCOR SRP` joins the Oncor umbrella. Timesheet codes logged as tasks (e.g. "TS- 0011- ADMINISTRATION") are
  flagged as unrecognized tasks.

---

## 4. Data flow

```
Synced .xlsx ──► Web Worker: SheetJS parse ──► Clean-up ──► Data model ──► Indexes + metrics ──► Pages
                                                                                    ▲
Admin marks jobs ──► Pending-changes tray ──► Save checks ──► JSZip cell edit ──► .xlsx  (then reload)
```

- **File access:** the viewer grants access to the tracker's **folder** once (folder access lets the app keep backups
  and a log next to the file). The handle is saved in IndexedDB; each new session needs one click to allow access
  again.
- **Staying current:** while the page is open it checks the file's last-modified time every 30 s and reloads
  when it changes (the admin's morning paste, or another person's save arriving through OneDrive).
- **Data freshness:** rows arrive the morning after the work, so the header shows **"Data through <latest date>"**
  and current-hitch numbers are understood to be a day behind.

---

## 5. Data model and clean-up

### Clean-up (done once, while loading)
- **OPCO:** trim and fix capitalization (`apco` → `APCO`, `Georgia power` → `Georgia Power`).
- **Task:** fix capitalization and merge variants (`pci` → PCI, `Staking` → STAKING, `GO BACK`/`go back`/`Go-Back` →
  GO BACKS, `Katapult` → KATAPULT, `Drive`/`DRIVE TIME (MOB/DEMOB) 0` → DRIVE TIME).
- **Status:** `in progress` → In Progress; blank, `0` → Unknown.
- **Uploaded to Katapult:** `Yes` → true; blank, `0`, `Na`, `n/a` → false.
- **Permit ID:** a comparison key ignoring capitalization, repeated spaces and `_x000D_` line-break characters;
  values Excel turned into numbers or dates go back to text. Spelling variants merge into one permit.
- **Numbers:** numbers stored as text are converted; anything unreadable is flagged, never guessed.
- Every fix is recorded so it can be shown on the **Data Quality** page.

### Entities
| Entity | Built from |
|---|---|
| **Record** | One cleaned row, keeping its Excel row number (needed for saving and for "find it in Excel") |
| **Permit** | All records with the same Permit ID key |
| **OPCO** | Each cleaned OPCO value; production is **always reported per OPCO** |
| **Umbrella** | Parent label for search and filtering only, never used to add production together (below) |
| **Person** | Anyone in Tech Name **or** Paired With (some people only ever appear as partners and still get a profile) |
| **Team** | Tech Name + Paired With for a given hitch (see below) |
| **Hitch** | Start and end dates from Validations, continued at the 14-day pattern after the list runs out |

### Teams
- One row = one team's work. The partner almost never logs the same job separately (191 of 10,396 paired rows),
  so **both people get credit for the row's poles**. Those few duplicates are flagged on the Data Quality page so
  they aren't counted twice.
- Pairs change between hitches (388 different pairs this year), so a team is defined **per hitch**: the logger
  plus their partner(s) in that hitch. Solo days stay solo.
- Person stats break production into **solo**, **as logger** and **as partner**.

### OPCO umbrellas (a config file in the repo; client names only, no data)
| Umbrella | OPCO values |
|---|---|
| AEP | AEP TX, AEP OHIO, AEP SRP, AEP Resiliency (SRP), AEP REJECT, AEP TEXAS REJECT POLE, AEP TX SMALL WIRE, APCO, PSO, SWEPCO, SWEPCO REJECT POLE, SWEPCO SMALL WIRE |
| Entergy | ENTERGY, ENTERGY POLE INSPECTION |
| Oncor | ONCOR, ONCOR ENGINEERING |

Any OPCO not listed shows under its own name.

### Hitch logic
- Current hitch = the hitch containing today's date; otherwise "Off hitch: next starts <date>".
- Each hitch shows "day X of 8"; rows outside every hitch are tagged **off-hitch**.
- Picking a period: the Command Center always shows the current hitch (compared with the same days of the last
  one). The Hitches page selects a hitch (`?h=`), and Production has its own period picker (any hitch, last 4
  hitches, year to date, all data), each kept in the URL so views can be shared. A single header-wide picker
  was planned, but per-page pickers turned out clearer; revisit if People/Teams need the same control.

---

## 6. Pages

| Page | Route | Contents |
|---|---|---|
| **Command center** | `#/` | Current-hitch banner (day X of 8, data-through date); KPI cards (poles this hitch vs. last, poles per tech per day, active teams, upload backlog, off-hitch rows); production trend; team leaderboard; alerts (stalled permits, data-quality count) |
| **Hitches** | `#/hitches` | Hitch schedule timeline; pick any hitch to see its totals, teams and who was paired with whom |
| **Production** | `#/production` | By OPCO / umbrella / team / person / task / hitch, with drill-down into the rows behind each number |
| **Projects** | `#/projects`, `#/projects/:opco` | Every OPCO and umbrella: poles this hitch, pace (last 4 hitches), permits by status, task mix, top teams. (Field queue, projected finish and due-date risk deferred with the field schedules.) |
| **Teams** | `#/teams` | Current pairs as cards, team totals for the hitch, pinned teams first |
| **People** | `#/people`, `#/people/:name` | Profile: most-worked OPCO, average poles per day, days worked, best hitch, consistency, solo/logger/partner split, most frequent partners, task mix, trend over hitches |
| **Permit** | `#/permit/:id` | Full permit detail (§6.1) |
| **Search** | Ctrl+K anywhere, `#/search` | Permits, people, OPCOs, umbrellas and notes, with field filters |
| **Upload queue** | `#/queue` | The admin's queue (§6.2) |
| **Data quality** | `#/quality` | Everything clean-up fixed or flagged, linked to Excel row numbers |
| **Settings** | `#/settings` | Folder connection, "I am…" (default view), pins, edit mode |

### 6.1 Permit search and detail

**Search:** ranks permit matches as exact → starts with → contains → close spellings (`0735` finds
`2025-031-0735`); capitalization, extra spaces and `_x000D_` are ignored. Each result shows the permit ID, OPCO,
last field date, overall status and total poles. Every permit has a shareable link (`#/permit/<id>`).

**Detail page:**
1. **Summary:** Permit ID, OPCO and umbrella, overall status (*In progress* / *Field complete – awaiting upload*
   / *Complete*, worked out from all its rows), first and last field dates, days open, total poles, hours
   (permit + drive), mileage, people involved, uploads done (e.g. 3 of 4 rows).
2. **Task cards:** one per task on the permit (PCI, KATAPULT, GO BACKS, POWER PCI, STAKING, drive time), showing
   latest status, poles, hours, days worked, date range, who worked it, and upload status. Multi-day work is
   added up.
3. **Timeline:** every row in date order, labeled with its hitch. Gaps longer than a hitch are marked, so it's
   visible when a permit stalled and restarted. (Multi-row permits are worked over a median of ~28 days; up to
   287.)
4. **All rows table:** every column plus the Excel row number. In edit mode, uploads can be marked from here into
   the pending-changes tray.
5. **Scope link (deferred with the field schedules):** when the permit matches a CNP circuit: scoped pole count, field priority, due date, percent
   collected, days until due.
6. **Data-quality flags:** spelling variants, more than one OPCO (44 permits), possible duplicate rows, In Progress
   with no later completion.

Clicking through goes to the people, the OPCO, or any hitch the permit was worked in.

### 6.2 Upload queue (field admin)
- **Rule:** `Status = Complete` **and** `Task ∈ {KATAPULT, PCI, GO BACKS, POWER PCI}` **and** Uploaded to Katapult
  is not `Yes`. **STAKING is left out** (decided).
- Sorted by age; filters for hitch, OPCO, umbrella, team and task. Many old rows may never have been marked, so
  the queue also offers a "show older than N hitches" filter.
- Check jobs off → they go into the **pending-changes tray** → **Save** (§8).

### 6.3 Metrics
- Poles per person per day, poles per hour on permit, productive vs. drive time, miles per pole.
- Solo vs. paired output; hitch-over-hitch trend per person and team; leaderboards; consistency (how much daily
  output varies).
- Production by hitch day (whether output drops on days 6–8).
- Task mix per person and per OPCO; off-hitch work.
- Upload backlog by age (field date until marked uploaded).
- *(Deferred with the field schedules:)* OPCO field queue vs. pace, projected finish dates, due-date risk.
- Stalled permits (In Progress with no row for more than one hitch).

---

## 7. Roles and permissions

| Role | Access | Default view |
|---|---|---|
| Field admin | **Edit** access to the tracker's SharePoint library | Upload queue |
| Coordinator | **Read** access | Their pinned people and teams |
| Manager | **Read** access | Command center, all teams |

- The app can't tell who someone is, so **SharePoint permissions do the enforcing**: a Read-only synced copy
  can't be written, so saves fail even if edit mode is switched on.
- When the app opens, it checks whether it can write to the folder. If it can't: edit mode is hidden and a
  **View only** badge is shown. If it can: edit mode is still a deliberate switch.
- "I am…" and pins (people and teams a coordinator follows) are stored in the viewer's browser. There's no roster
  sheet.

---

## 8. Write-back (saving uploads)

Only the field admin saves, so the local file is safe to write. The save:

1. **Reload if changed.** If the file's last-modified time differs from when it was loaded, re-read it first.
2. **Check it isn't open in Excel.** Excel locks the file; if the write is refused, stop with *"Close the
   tracker in Excel, then save."*
3. **Check each row.** For every marked job, confirm Excel row number + Date + Tech Name + Permit ID still match.
   A mismatch is skipped and reported, never guessed.
4. **Back up.** Keep a timestamped copy in `.dashboard-backups/` next to the tracker (keep the last 10).
5. **Edit only the needed cells.** Unzip with JSZip; in `xl/worksheets/sheet1.xml`, set each `N{row}` cell to the
   existing shared-string index for `Yes` (create the cell in column order if it's missing). All other zip
   entries are copied unchanged.
6. **Make Excel recalculate on open.** Set `fullCalcOnLoad="1"` in `xl/workbook.xml`, so the formula columns that
   depend on column N update the next time the file is opened. The pivot cache stays stale until refreshed in Excel, as
   it is today.
7. **Log it.** Add an entry to `dashboard-log.json` next to the tracker: when, which rows, before and after values.
8. **Confirm.** Re-read the saved file and check the cells now say `Yes`; then reload the dashboard.

**Testing before it touches the real tracker:** an automated test compares the original and saved files piece by
piece, and only `sheet1.xml` and `workbook.xml` may differ. Then open the result in Excel to confirm it's clean
(no repair prompt, Power Query and pivots still work).

**Admin's morning routine:** paste the Smartsheet rows in Excel → save → close Excel → work the upload queue
in the dashboard → Save.

---

## 9. Look and feel

- Taken from the v0 "Cyberpunk dashboard design" template: near-black panels, neon accent colors, monospace numbers,
  uppercase labels with wide letter spacing, thin borders. Exact colors and fonts come from the template's source
  code and are defined once as design tokens.
- **KPI cards (Tremor style):** label, large number, change vs. previous hitch (with color and arrow), sparkline.
- **Tables (Tremor style):** compact rows, numbers right-aligned in a fixed-width font, sticky header, status chips.
- Charts use one set of colors with a fixed color per series across every page; the chart colors are checked for
  contrast.
- Desktop first, but layouts still work in a narrow window.

---

## 10. Project layout

```
src/
  app/            routes, layout, header, Ctrl+K search
  data/
    worker.ts     SheetJS parse (Web Worker)
    clean.ts      clean-up rules + data-quality log
    model.ts      records, permits, people, teams, hitches
    hitches.ts    hitch list, continuing the 14-day pattern
    umbrellas.ts  OPCO → umbrella config
    search.ts     permit-ID matching and ranking, people/OPCO/notes search
    metrics.ts    all calculations
  file/
    access.ts     folder handle, permission, change checks
    writeback.ts  JSZip cell edits, checks, backups, log
  components/     Tremor-style KPI cards, tables, charts, themed UI
  pages/          Command, Hitches, Production, Projects, Teams, People, Permit, Search, Queue, Quality, Settings
  theme/          design tokens
tests/            clean-up, hitch logic, metrics, write-back file comparison
.github/workflows/deploy.yml
```

---

## 11. Build order

1. Scaffold the project, theme tokens and GitHub Pages deploy.
2. Folder access, parse in the background, clean-up, data model, hitch logic, plus tests against the real workbook.
3. Search and the permit detail page.
4. Command center, Hitches, Production.
5. People, Teams, Projects (field schedules deferred).
6. Data quality page.
7. Upload queue and write-back, with the file-comparison test and an Excel check on a copy of the tracker.
8. Roles (write check, View only badge), "I am…", pins.
