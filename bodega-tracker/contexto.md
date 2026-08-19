# Contexto — Bodega Tracker

## Qué es

Aplicación web (React + Vite, PWA) para controlar el inventario de cafetería y aseo de la bodega de **Inversiones en Salud - Coosalud Inversa S.A.** Reemplaza el seguimiento manual en Excel por una app que varios usuarios pueden usar desde distintos dispositivos (celular, PC) al mismo tiempo, manteniendo los datos sincronizados.

No tiene backend propio: el estado se guarda en `localStorage` de cada dispositivo y se sincroniza entre dispositivos a través de una tabla compartida en Supabase (Postgres + realtime).

## Para quién / qué problema resuelve

- Quien recibe/entrega insumos de cafetería y aseo necesita registrar cada salida (y a veces entrada) del día sin depender de estar frente al Excel corporativo.
- Varias personas pueden registrar desde su propio celular y ver el stock actualizado en tiempo real, sin pisarse los cambios entre sí.
- El Excel corporativo (`Matriz de Consumo (2)`) sigue siendo el documento oficial: la app puede leerlo (para tomar el stock inicial de un ciclo) y escribirle de vuelta el consumo diario, pero **la app nunca confía en el Excel como la verdad del stock actual** — solo lo usa para fijar el "ancla" desde la que empieza a contar.

## Cómo se usa (las 5 pestañas)

1. **Registro** — entrada rápida (texto libre tipo `"5 detergente 2 cloro"` o manual) de las salidas/entradas del día.
2. **Dashboard** — tabla de stock actual por producto, con edición manual de stock actual/inicial y umbrales de alerta (crítico/bajo).
3. **Historial** — días registrados, con edición y borrado (borrado lógico, no se pierde el rastro entre dispositivos).
4. **Exportar** — importar/exportar el Excel corporativo, sincronizar el stock inicial desde el Excel, detectar productos nuevos, y análisis con IA (Claude) del inventario.
5. **Buzón** — bandeja de solo lectura con notas/hallazgos que un agente puede dejar desde el CLI (`bodega queja`); desde la web solo se pueden descartar, no crear.

## Dos formas de usar los mismos datos

- **App web** (`bodega-tracker/`): la interfaz normal para el día a día.
- **CLI** (`bodega-tracker/cli/`, comando `bodega`): cliente de terminal que lee/escribe los mismos datos de Supabase (registrar consumo, ver stock, ajustar umbrales, sincronizar el Excel) sin necesidad de navegador. Útil para automatizar o para que un agente de Claude Code opere el inventario — ver `plugins/bodega/skills/bodega/SKILL.md`, distribuido como plugin desde el marketplace del repo (`.claude-plugin/marketplace.json`).

## Regla de oro del stock

El stock **no se guarda**, se calcula:

```
stock = valor_ancla − Σ salidas desde la fecha del ancla + Σ entradas desde la fecha del ancla
```

El "ancla" es el stock que había en una fecha concreta (por ejemplo, el día que llegó una compra). Mientras no se fije un ancla con fecha, el valor se muestra congelado (en amarillo/alerta) para que no se confunda con un número real. Esto evita que el número de stock se desincronice entre dispositivos, algo que sí pasaba con el diseño anterior (un contador guardado y editable en tres sitios distintos).

## Stack técnico

- **Frontend**: React 19 + Vite, Tailwind, PWA (`vite-plugin-pwa`).
- **Datos compartidos**: Supabase (tabla `app_data`, clave/valor JSON), sincronización por fusión (merge) campo a campo con marca de tiempo (`updatedAt`), nunca reemplazo total del blob — así un dispositivo desactualizado no borra cambios más recientes de otro.
- **Excel**: librería `xlsx`, coincidencia de nombres de producto por substring (sin fuzzy matching) contra `excelNames` definidos en `src/utils/products.js`.
- **IA**: análisis opcional del inventario vía API de Anthropic (`VITE_ANTHROPIC_KEY`), degrada con gracia si no está configurada.
- **CLI**: Node, mismo store y misma lógica de negocio que la web (`src/core/`), sin estado local propio.
- **Tests**: `node --test` sobre `src/core/` (la lógica de merge/stock/catálogo, sin React).

## Dónde está la lógica importante

- `src/core/` — funciones puras (merge, cálculo de stock, catálogo/matching, notas). Cualquier cambio de comportamiento de sincronización o cálculo de stock va aquí, no en los hooks.
- `src/hooks/` — conectan esas funciones puras a React (`useState`/`useEffect`) y a Supabase (`useSync.js`).
- `cli/lib/store.js` — el mismo patrón lectura-fusión-escritura que `useSync.js`, pero para el CLI.

Detalle técnico completo (decisiones de diseño, bugs históricos evitados, contrato de cada tab) está en `CLAUDE.md`.

## Estado actual

Proyecto funcional en uso interno. No hay autenticación (herramienta interna pequeña, credenciales de Supabase públicas/anon a propósito). El README raíz por ahora es el de la plantilla de Vite; la documentación real del proyecto vive en este archivo y en `CLAUDE.md`.
