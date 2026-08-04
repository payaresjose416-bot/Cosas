# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Cosas** — monorepo para **Bodega Tracker**, una PWA React de inventario de cafetería y aseo de Inversiones en Salud - Coosalud Inversa S.A., más su ecosistema de herramientas complementarias:

- **`bodega-tracker/`** — app web React + Vite, CLI terminal (`bodega`), y tests del núcleo compartido (`node:test`).
- **`plugins/bodega/`** — plugin de Claude Code que enseña a Claude a operar el CLI `bodega` desde conversaciones naturales.
- **`.claude-plugin/marketplace.json`** — registro local que distribu e el plugin via `/plugin marketplace add .`.

## Quick Start

```bash
# Bodega Tracker (app + CLI)
cd bodega-tracker
npm install                # instala dependencias
npm run dev               # inicia Vite dev server (http://localhost:5173)
npm run build             # build de producción
npm run lint              # ESLint
npm test                  # tests del núcleo (node --test)
npm link                  # instala CLI `bodega` globalmente

# Plugin de Claude Code
# En Claude Code: /plugin marketplace add . → /plugin install bodega@cosas
```

## Architecture

### Bodega Tracker — monolito con núcleo compartido

**State management**: `App.jsx` es el único propietario de estado — llama `useProducts()` y `useInventory()` una sola vez, pasa todo como props a las 4 tabs (`TabRegistro`, `TabDashboard`, `TabHistorial`, `TabExportar`).

**Cross-device sync** (el constraint de diseño):
- Supabase `app_data` table (`key`/`value` JSON) es un bucket compartido.
- `useSync.js` — genérico, `useSync(key, localValue, onCloudUpdate, mergeFn)` — maneja carga inicial, suscripción realtime (Postgres changes), y escritura debounced.
- **Todos los merges usan per-record last-writer-wins** por `updatedAt`, nunca reemplazan el blob completo — un dispositivo stale no borra edits más recientes de otro.
- `history` usa tombstones (`{deleted: true, updatedAt}`) en vez de borrado real.

**Núcleo puro** — `src/core/`:
- `merge.js` — `toEntries`, `mergeStock`, `mergeHistory`, `mergeThresholds`, `mergeProducts`
- `inventory.js` — reducers puros para mutaciones de estado (`applySaveDay`, `applyDeleteDay`, `applyUpdateStock`, `applySetThreshold`, `applyStockSyncChanges`)
- `status.js` — `getDaysRemaining`, `getStatus`
- `catalog.js` — `slugify`, `titleCase`, `buildCustomProducts`

Sin React, sin `localStorage`, sin APIs de navegador — solo funciones puras. Ambos los hooks (`useInventory.js`, `useProducts.js`) e importa el CLI (Node.js) este código sin duplicación.

**CLI** (`cli/`) — Node.js ESM puro:
- No replica `localStorage`. Cada comando hace read-merge-write contra Supabase directamente, reutilizando `src/core/*` y patrones de `src/utils/`.
- Comandos: `stock`, `estado`, `producto`, `historial` (lectura); `registrar`, `borrar-dia`, `set-stock`, `umbral`, `producto-nuevo` (escritura con `--yes`/`--dry-run`); `excel exportar|sync-stock|detectar` (Excel).
- `--json` en todos → Claude puede parsear, no solo raspar tablas humanas.
- Instalación: `npm link` lo pone en el PATH como `bodega`.

**Plugin de Claude Code** — marketplace local:
- `.claude-plugin/marketplace.json` registra el plugin `bodega` desde `plugins/bodega/`.
- `plugins/bodega/skills/bodega/SKILL.md` — instrucciones para Claude: cuándo usar cada comando, regla de oro (resolver nombres a ids con `bodega stock --json` antes de escribir), regla de seguridad (vista previa + confirmación del usuario antes de `--yes`).
- Preflight: corre `bodega --version`; si falta, le pide al usuario `npm link`.

### Productos y Excel

`utils/products.js` define `PRODUCTS`/`BASE_PRODUCTS` con listas `excelNames` — substrings esperados en la columna de productos del Excel corporativo.

`utils/excelExport.js` (`matchProduct`, `normalize`) — matching difuso compartido (diacríticos, substring, Levenshtein fallback) usado por:
- `writeToExcel` — escribe consumo registrado de vuelta al Excel.
- `excelDetect.js` (`detectNewProducts`) — encuentra productos nuevos en el Excel no en el catálogo.
- `excelStockSync.js` (`detectStockSync` → `applyStockSyncChanges`) — lee columna "Restantes" de "Matriz de Consumo (2)" y aplica cambios.

`utils/parser.js` — matcher independiente para entrada libre en Registro tab ("5 detergente 2 cloro") — bigrams + Levenshtein, separado del path de Excel.

### Peligros conocidos (documentados en `bodega-tracker/CLAUDE.md`)

- **STOCK_VERSION**: nunca subirlo. Borra stock de todos los dispositivos — ha causado incidentes reales. Migraciones de formato van dentro del hook (`toEntries()` normaliza números planos y entradas timestamped sin un version bump).
- **Reemplazar blobs completos en merge**: pisaría edits recientes de otros dispositivos. Siempre per-record LWW.
- **Tombstones en history**: no borrar realmente; un dispositivo stale realmente puede resucitar entradas si las marcas se pierden.

## Files Structure

```
bodega-tracker/
├── src/
│   ├── core/                # Núcleo puro (sin React, sin browser APIs)
│   │   ├── merge.js
│   │   ├── inventory.js
│   │   ├── status.js
│   │   ├── catalog.js
│   │   └── __tests__/        # 32 tests con node:test
│   ├── hooks/
│   │   ├── useSync.js        # genérico read-merge-write
│   │   ├── useInventory.js   # thin wrapper sobre src/core/
│   │   ├── useProducts.js    # thin wrapper sobre src/core/
│   │   └── useAI.js          # AI analysis feature (requiere VITE_ANTHROPIC_KEY)
│   ├── utils/
│   │   ├── products.js       # PRODUCTS, BASE_PRODUCTS
│   │   ├── supabase.js       # loadFromCloud, saveToCloud
│   │   ├── excelExport.js    # matchProduct, writeToExcel
│   │   ├── excelDetect.js    # detectNewProducts
│   │   ├── excelStockSync.js # detectStockSync
│   │   └── parser.js         # parseInput para Registro tab
│   └── components/
│       ├── App.jsx           # state owner
│       └── Tab*.jsx          # Registro, Dashboard, Historial, Exportar
├── cli/
│   ├── bin/bodega.js         # entry point, command routing
│   ├── commands/             # 10 command modules
│   └── lib/
│       ├── store.js          # read-merge-write contra Supabase
│       ├── confirm.js        # preview + confirm pattern
│       ├── format.js
│       └── resolveProduct.js
├── package.json
├── vite.config.js
├── .env.example
└── CLAUDE.md                 # documentación de bodega-tracker

plugins/bodega/
├── .claude-plugin/plugin.json
└── skills/bodega/SKILL.md    # instrucciones para Claude Code

.claude-plugin/
└── marketplace.json          # registro de plugins locales
```

## Common Development Tasks

### Cambios en el núcleo (merge/reducers/status)

1. Edita `src/core/*.js`.
2. Escribe tests en `src/core/__tests__/` (cubre formatos históricos, migraciones, edge cases — ya pasó pérdida de datos).
3. `npm test` — todos pasan.
4. Hooks (`useInventory.js`, `useProducts.js`) se reescriben como thin wrappers — **nunca toques la lógica de estado dentro de ellos**.

### Agregar un comando al CLI

1. Crea `cli/commands/mycommand.js` exportando `{ name, describe, builder, handler }` (estilo yargs).
2. Importa desde `cli/lib/store.js` y `src/core/*`.
3. Para escritura: usa `confirm.preview()` + `--yes`/`--dry-run`.
4. Exporta resultado con `--json` cuando tenga sentido.
5. Importa en `cli/bin/bodega.js` y agrégalo al `yargs.command()`.

### Cambios en Excel matching

- `utils/excelExport.js` es la única fuente de verdad.
- Si tocas `matchProduct`/`normalize`, verifica que:
  - `writeToExcel` sigue escribiendo al sitio correcto.
  - `detectStockSync` sigue leyendo "Restantes" de "Matriz de Consumo (2)".
  - `detectNewProducts` sigue encontrando productos nuevos.

### Cambios en la app web

- Edita componentes en `src/components/`.
- Si tocas state: **edita los hooks (`useInventory.js`, `useProducts.js`) como thin wrappers sobre `src/core/*`**; la lógica va en `core/`.
- `npm run dev` → abre http://localhost:5173.
- Verifica que `localStorage` y Supabase sync sigan funcionando (abre las DevTools Network + realtime).

### Cambios en el plugin

1. Edita `plugins/bodega/skills/bodega/SKILL.md`.
2. `claude plugin validate ./plugins/bodega --strict`.
3. En Claude Code: `/reload-plugins` o cierra y reabre la sesión.

## Environment

`.env` necesita `VITE_ANTHROPIC_KEY` para la feature de análisis con Claude (`useAI.js`). Sin él, degrada gracefully con un error. Ver `.env.example`.

Supabase creds están hardcodeadas en `utils/supabase.js` — es intencional (pequeña herramienta interna sin auth). No moverlas a env vars a menos que se pida.

## Testing

```bash
npm test                  # node --test src/core/__tests__
```

Cubre: formatos viejo/nuevo de stock mezclados, read-merge-write sin encogimiento de nube, tombstones de history que no resucitan, `applySaveDay` que revierte días previos, `getStatus` con umbrales explícitos vs. cálculo por días.

## Deployment

```bash
npm run build             # output a dist/
npm run preview           # preview del build local
```

El build es servible estáticamente. Supabase realtime llega por WebSocket desde el navegador.

---

Para detalles de bodega-tracker específicamente, lee `bodega-tracker/CLAUDE.md`.
