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
- **`useInventory.js`** — owns `stock`, `history` (registered salidas/entradas), and `thresholds` (per-product critical/low levels). This is the most important file in the codebase; read it before changing any cross-device sync behavior.

Both hooks are thin React wrappers: the actual merge/reducer/status logic lives in `src/core/` (`merge.js`, `inventory.js`, `status.js`, `catalog.js`) as plain functions with no React and no browser APIs, so the CLI (`cli/`) can import the exact same logic instead of re-implementing it. **Any change to sync/merge/status behavior belongs in `src/core/`, not in the hooks** — the hooks should only ever glue core functions to `useState`/`useEffect`. `src/core/__tests__/` covers this layer with `node:test`; run it after touching anything there.

### Cross-device sync — the core design constraint

There is no backend logic — Supabase's `app_data` table (`key`/`value` JSON blob) is just a shared bucket, and `useSync.js` is a generic hook every stateful piece of data goes through: `useSync(key, localValue, onCloudUpdate, mergeFn)`. It handles initial load, realtime subscription (Postgres changes via `supabase.channel`), and debounced writes.

**All synced data must use a merge function**, not raw last-write-wins-on-the-whole-blob. The pattern (see `mergeStock`, `mergeHistory`, `mergeThresholds`, `mergeProducts` in their respective hooks) is per-record last-writer-wins keyed by an `updatedAt` timestamp on each entry — never replace the whole object wholesale, because one device being briefly stale must not blow away another device's more recent edits. `stock` historically was the *one* exception (synced as a plain `{id: qty}` map with no merge, causing real data loss when Excel-syncing on one device and editing on another) — it was migrated to the same `{id: {qty, updatedAt}}` per-entry pattern. If you add new synced state, follow this pattern from day one.

Practical implication: never bump `STOCK_VERSION` (in `utils/products.js`) to force a migration — that wipes the stored stock for every device back to each product's `initialStock` and has caused real incidents. Any format migration must happen losslessly inside the hook (see `toEntries()` in `useInventory.js`, which normalizes both old plain-number and new timestamped-entry formats without a version bump).

`history` entries use tombstones (`{ deleted: true, updatedAt }`) instead of real deletion, so a delete on one device doesn't get resurrected by a stale device's history still holding the old entry.

### Product catalog and Excel matching

`utils/products.js` defines `PRODUCTS`/`BASE_PRODUCTS`, each with an `excelNames` list — substrings expected to appear in the corporate Excel's product-name column. `utils/excelExport.js` (`matchProduct`, `normalize`) is the shared fuzzy-matching logic (accent stripping, substring containment, then Levenshtein fallback) used both for writing consumption back into the Excel (`writeToExcel`) and for `utils/excelDetect.js` (finding brand-new product names not yet in the catalog) and `utils/excelStockSync.js` (`detectStockSync` — reads a "Restantes/Saldo/Stock actual" column from the sheet named `Matriz de Consumo (2)` and diffs it against current app stock, feeding `applyStockSync` in `useInventory.js`). All three of these expect that exact sheet name and its fixed column layout (name in column B, dates starting column F, data starting row 3).

`utils/parser.js` is a separate, simpler matcher used for free-text quick-entry in the Registro tab (`"5 detergente 2 cloro"` style input) — keyword/bigram matching plus Levenshtein, independent of the Excel matching path.

### Tabs

- **Registro** — free-text or manual entry of a day's salidas/entradas, calls `saveDay`.
- **Dashboard** — per-product stock table with expandable rows; each row has manual stock +/-/input editing (`updateStock`) and a threshold editor (`setThreshold`), both writing through the same sync-safe hook functions.
- **Historial** — lists past registered days, supports edit (routes back to Registro via `onEditEntry`) and delete (`deleteDay`, tombstoned).
- **Exportar** — Excel import/export (writing consumption, syncing stock from Excel, detecting new products) and the Claude-powered inventory analysis (`useAI.js`).

### Supabase credentials

`utils/supabase.js` hardcodes the Supabase URL and a publishable (anon) key — this is intentional for this app's design (a small internal tool with no auth), not an oversight to "fix" by moving to env vars unless asked.
