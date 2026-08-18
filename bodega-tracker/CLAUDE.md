# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Bodega Tracker — a React + Vite PWA for tracking cafetería/aseo (breakroom/cleaning supplies) inventory for Inversiones en Salud - Coosalud Inversa S.A. Single-page app, no backend of its own; state is persisted to `localStorage` and synced peer-to-peer between devices via a shared Supabase table.

## Commands

Run from `bodega-tracker/` (the actual app root — the repo root has no package.json):

```bash
npm run dev       # start Vite dev server
npm run build     # production build (outputs to dist/)
npm run lint      # eslint .
npm run preview   # preview a production build
```

```bash
npm test          # node --test src/core — unit tests for the merge/reducer core
```

`.env` needs `VITE_ANTHROPIC_KEY` for the AI analysis feature (`useAI.js`); see `.env.example`. Without it, that one feature degrades gracefully with an error message — nothing else depends on it.

### CLI (`cli/`)

`bodega` (bin: `cli/bin/bodega.js`, `npm link` to install) is a terminal client for the same Supabase data the web app reads — read/write inventory, register consumption, adjust thresholds, run the Excel import/export, all without a browser. It has **no local state**: every command does a read-merge-write against Supabase (`cli/lib/store.js`), the same pattern `useSync.js` uses. Write commands show a preview and ask for confirmation unless `--yes` is passed; `--dry-run` never writes. See `plugins/bodega/skills/bodega/SKILL.md` for the Claude Code skill that drives this CLI, distributed as a plugin from the repo-root marketplace (`.claude-plugin/marketplace.json`).

## Architecture

### State ownership and data flow

`App.jsx` is the single owner of app state: it calls `useProducts()` and `useInventory(products, productMap)` once, then spreads the combined state/handlers as props into the four tab components (`TabRegistro`, `TabDashboard`, `TabHistorial`, `TabExportar`). Tabs are swapped by simple `activeTab` state, not routing — all four are cheap to construct but only one is rendered.

- **`useProducts.js`** — merges the hardcoded `BASE_PRODUCTS` (from `utils/products.js`) with user-added custom products (`bodega_custom_products` in localStorage, synced to cloud key `custom_products`).
- **`useInventory.js`** — owns `history` (registered salidas/entradas), `initialStocks` (the stock anchor — see below), and `thresholds` (per-product critical/low levels). `stock` (current stock) is **not** state here — it's a `useMemo` that calls `getCurrentStock` fresh from `initialStocks` + `history` on every render. This is the most important file in the codebase; read it before changing any cross-device sync behavior.

Both hooks are thin React wrappers: the actual merge/reducer/status logic lives in `src/core/` (`merge.js`, `inventory.js`, `status.js`, `catalog.js`) as plain functions with no React and no browser APIs, so the CLI (`cli/`) can import the exact same logic instead of re-implementing it. **Any change to sync/merge/status behavior belongs in `src/core/`, not in the hooks** — the hooks should only ever glue core functions to `useState`/`useEffect`. `src/core/__tests__/` covers this layer with `node:test`; run it after touching anything there.

### Stock is computed, not stored

`stock` used to be its own synced counter (`stockEntries`, bumped on every registro, editable by hand, synced under cloud key `'stock'`) — three independent ways for the number to drift, and it repeatedly did (see git history: a product with real registered salidas kept reverting to a stale value every time anyone synced an Excel). It was replaced with a pure computation, `getCurrentStock(productId, { initialStocks, history, productMap })` in `core/status.js`:

```
stock = ancla.value  − Σ qty de salidas en history con date ≥ ancla.date
                      + Σ qty de entradas en history con date ≥ ancla.date
```

The "ancla" (anchor) is `initialStocks[id] = { value, date, updatedAt }` — the stock the product had on a specific day, and the date from which registros start counting against it. Without a `date` (never synced from an Excel, never corrected by hand) the value is returned as-is, frozen — nothing gets subtracted until a real anchor date exists; the Dashboard flags that state in warning color so it's visible rather than looking like a wrong number. `getCurrentStock` also skips any history entry whose `type` is neither `salida` nor `entrada`: legacy `type: 'sync'` entries carry `{oldStock, newStock}` items with no `qty`, and summing them yielded `NaN` for the whole product. Because `stock` is derived entirely from two things that already sync correctly on their own (`initialStocks`, `history`), it **cannot itself drift** — there's no third state to fall out of sync. Never reintroduce a stored `stock`/`stockEntries` counter; if a bug looks like "stock is wrong," the bug is in `initialStocks` or `history`, not in some cache that needs recomputing.

Setting the anchor has two flavors, both really the same call (`setInitialStock(id, value, date)` in the hook, `applySetInitialStock` in `core/inventory.js`):
- **"Editar stock actual"** in the Dashboard is sugar for `date = hoy` — "this is what's on the shelf right now, start counting from here." Nothing before today counts anymore for that product.
- **"Editar stock inicial"** lets you set both `value` and an arbitrary `date` — used when backdating to a real cycle start (e.g. the day a purchase arrived), most commonly via Excel sync (see below).

### Cross-device sync — the core design constraint

There is no backend logic — Supabase's `app_data` table (`key`/`value` JSON blob) is just a shared bucket, and `useSync.js` is a generic hook every stateful piece of data goes through: `useSync(key, localValue, onCloudUpdate, mergeFn)`. It handles initial load, realtime subscription (Postgres changes via `supabase.channel`), and debounced writes.

**All synced data must use a merge function**, not raw last-write-wins-on-the-whole-blob. The pattern (see `mergeHistory`, `mergeThresholds`, `mergeProducts` in their respective hooks) is per-record last-writer-wins keyed by an `updatedAt` timestamp on each entry — never replace the whole object wholesale, because one device being briefly stale must not blow away another device's more recent edits. `initialStocks` reuses `mergeThresholds` as-is for its `{value, date, updatedAt}` shape: `value` and `date` always get written together under the same `updatedAt` (they're one fact — "on this day, there were this many"), so whole-object LWW is correct; don't split them into separately-mergeable fields. If you add new synced state, follow this pattern from day one.

A legacy cloud key `'stock'` still exists from the old stored-counter model. **Nothing reads or writes it — leave it that way.** There was briefly a startup migration that read it to seed anchors with `date = today`, and it caused a real bug worth not repeating: the migration decided whether to run from `initialStocks` as loaded from `localStorage`, while `useSync`'s cloud fetch for `initial_stocks` was still in flight (two parallel `loadFromCloud` calls, no ordering guarantee, no "cloud loaded" flag anywhere). On a device whose local copy was stale it would "migrate" a product that had *already* been anchored from the Excel elsewhere, writing `date = today` with a fresh `Date.now()` — which then beat the real anchor under `mergeThresholds`' last-writer-wins. Result: the anchor date silently snapped back to today, no registro was old enough to count against it, and the stock froze at the anchor value forever.

The general lesson, which applies to any future automatic write: **`updatedAt` LWW cannot distinguish "more recent clock reading" from "more trustworthy data."** Any code that writes synced state on mount with a fresh timestamp can outrank real user data it never saw. The anchor now changes only through explicit user action — Excel sync, "editar stock inicial", "editar stock actual" — and both `useInventory.js` and `cli/lib/store.js` carry a comment saying not to add automatic seeding back.

`history` entries use tombstones (`{ deleted: true, updatedAt }`) instead of real deletion, so a delete on one device doesn't get resurrected by a stale device's history still holding the old entry.

### Product catalog and Excel matching

`utils/products.js` defines `PRODUCTS`/`BASE_PRODUCTS`, each with an `excelNames` list — substrings expected to appear in the corporate Excel's product-name column. `core/catalog.js` (`matchProduct`, `normalize`) is the shared matching logic, re-exported from `utils/excelExport.js` for the callers that historically imported it from there. It is **accent-stripped substring containment only — there is no fuzzy/Levenshtein fallback**: a product matches only if one of its `excelNames` appears verbatim inside the cell text, with the longest matching `excelNames` winning. That makes `excelNames` the single most failure-prone part of the Excel path in both directions:

- Too specific (`'azucar manuelita'`) and a cell reading `AZUCAR X 200 SOBRES` silently matches nothing — the product lands in `newProducts` and **its stock is never corrected**, which is exactly how the app ended up showing sugar in stock that had long since run out.
- Too generic (`'esponjas'`, `'axion'`) and it steals another product's row.

`src/core/__tests__/catalogMatch.test.js` guards both directions across the whole catalog (every product matches its own name and its own `excelNames`, and no two `excelNames` normalize to the same string). Run it after touching `excelNames`.

`matchProduct` is used for writing consumption back into the Excel (`writeToExcel`), for `utils/excelDetect.js` (finding brand-new product names not yet in the catalog), and for `utils/excelStockSync.js` (`detectInitialStockSync`). All of these expect the sheet named `Matriz de Consumo (2)` and its fixed layout (name in column B, dates starting column F, data starting row 3).

**The Excel is never the source of truth for the app's live stock — only for the anchor.** `detectInitialStockSync` (`utils/excelStockSync.js`) reads **only** product names and the `Stock inicial` column, never `Restantes` (which is a formula over the Excel's own daily-consumption columns that the user never fills in, since they track consumption in the app instead — it just echoes the opening stock, stale, forever; an earlier version of this feature read it and silently clobbered real registered consumption). It also parses the **date** embedded in that column's header text (real corporate format: `"Stock inicial \n30/06/2026"`, via `parseInitialDate`) — that date becomes the anchor's `date`, i.e. the day the sync's `Stock inicial` value starts counting from. If the header doesn't contain a parseable date, `detectInitialStockSync` returns `initialDate: null` and the caller (`TabExportar.jsx`, `cli/commands/excel.js --fecha`) must ask the user for it explicitly — never default to "today" silently, since a wrong anchor date silently wrongs every subsequent stock calculation for that product. The sync writes exclusively to `initialStocks` (via `setInitialStock`/`applyInitialStockSync`), never to `stock` — there is no path from Excel to the computed stock number.

`utils/parser.js` is a separate, simpler matcher used for free-text quick-entry in the Registro tab (`"5 detergente 2 cloro"` style input) — keyword/bigram matching plus Levenshtein, independent of the Excel matching path.

Some devices' synced `history` may still contain legacy entries with `type: 'sync'` (old Excel-driven stock overwrites, before this was fixed) — `TabHistorial.jsx` still renders and can delete them (as an oldStock→newStock audit line, distinct styling); nothing creates new entries of this type anymore.

### Tabs

- **Registro** — free-text or manual entry of a day's salidas/entradas, calls `saveDay`. Each product card also shows its (computed) current stock for quick reference while registering.
- **Dashboard** — per-product stock table with expandable rows; each row shows computed stock + the anchor ("inicial: N · vigente desde: fecha") and has manual editors for both (`correctCurrentStock` for a quick "this is what's on the shelf now", `setInitialStock` with a date picker for backdating) plus a threshold editor (`setThreshold`), all writing through the same sync-safe hook functions.
- **Historial** — lists past registered days, supports edit (routes back to Registro via `onEditEntry`) and delete (`deleteDay`, tombstoned).
- **Exportar** — Excel import/export (writing consumption, syncing the stock anchor from Excel, detecting new products) and the Claude-powered inventory analysis (`useAI.js`).

### Supabase credentials

`utils/supabase.js` hardcodes the Supabase URL and a publishable (anon) key — this is intentional for this app's design (a small internal tool with no auth), not an oversight to "fix" by moving to env vars unless asked.
