---
name: bodega
description: "Consultar y registrar el inventario EN VIVO de cafetería y aseo de Inversiones en Salud - Coosalud Inversa S.A., sincronizado en Supabase entre todos los dispositivos. Usa esta skill SIEMPRE que el usuario pregunte 'qué hay en bodega', 'cuánto queda de X', 'qué está crítico o por acabarse', 'qué necesito comprar', o pida 'registra la salida/entrada de hoy', 'saqué X de bodega', 'ajusta el stock de X', 'pon el umbral de X', 'agrega X al catálogo de bodega'. También úsala para sincronizar o exportar el Excel corporativo de consumo contra el stock en vivo ('sincroniza el stock con este Excel', 'detecta productos nuevos en este Excel'). NO usar para los formatos de compra/solicitud de Excel — esas siguen siendo generar-solicitud-pedido-cafeteria-y-aseo, actualizar-inventario-cafeteria-y-aseo y llenar-consumo-inventario; esta skill es el inventario en vivo que ve la app web, no esos formatos periódicos."
---

# Bodega — inventario en vivo de cafetería y aseo

Esta skill le da a Claude acceso al mismo inventario que ve la app web `bodega-tracker`, vía el CLI `bodega`. El CLI lee y escribe directo contra la base compartida de Supabase — **no** es un archivo local, es la misma fuente de verdad que usan todos los dispositivos.

## Preflight (antes de cualquier otro paso)

```bash
bodega --version
```

Si falla ("command not found"), el CLI no está enlazado en este entorno. Dile al usuario que corra esto dentro del repo y detente:

```bash
cd bodega-tracker && npm install && npm link
```

## Comandos

**Lectura** — siempre seguros, sin confirmación:
```
bodega stock [--categoria cafeteria|aseo] [--estado critico|bajo|ok] --json
bodega estado --json                       # resumen + lista de compras sugerida
bodega producto <id|nombre> --json         # detalle, días restantes, historial reciente
bodega historial [--desde F] [--hasta F] [--limite N] --json
bodega quejas --json                       # notas/hallazgos ya dejados en el buzón
```

**Escritura** — piden confirmación por defecto; usa `--yes` solo después de que el usuario aprobó la vista previa (ver "Regla de seguridad" abajo):
```
bodega registrar "<texto libre>" [--fecha YYYY-MM-DD] [--tipo salida|entrada]
bodega registrar --item <id>=<qty> [--item <id>=<qty> ...] [--fecha F] [--tipo T]
bodega borrar-dia <fecha> [--tipo salida|entrada]
bodega set-stock <producto> <cantidad>
bodega umbral <producto> --critico N --bajo N   |   bodega umbral <producto> --quitar
bodega producto-nuevo "<nombre>" [--stock N]
bodega queja "<texto>" [--de "<autor>"]
```

**Excel** (el archivo corporativo de consumo, hoja "Matriz de Consumo (2)"):
```
bodega excel exportar <archivo.xlsx> [-o salida.xlsx]   # vuelca el historial de salidas al Excel
bodega excel sync-stock <archivo.xlsx>                   # compara "Restantes" del Excel contra el stock en vivo
bodega excel detectar <archivo.xlsx>                     # productos del Excel que no están en el catálogo
```

Siempre usa `--json` cuando vayas a leer el resultado para razonar sobre él — la salida de tabla es para que la lea una persona, no para parsear.

## Buzón (`queja`/`quejas`)

`bodega queja "<texto>"` deja una nota visible en la pestaña Buzón de la app web — úsala para dejarle al usuario un hallazgo, una anomalía detectada, o cualquier cosa que valga la pena que vea aunque no esté en esta conversación (p. ej. si otra sesión de Claude, como Claude Desktop, operó el inventario y quiere avisarle algo). Pasa `--de "Claude Desktop"` (o el nombre que corresponda) para identificar el origen de la nota. Sigue la misma regla de vista previa + confirmación que cualquier otra escritura. No la uses para lo que ya tiene su propio canal (una escritura normal de stock/registro no necesita además una queja explicándola).

## Regla de oro: nunca inventes un id de producto

Los ids del catálogo (`detergente`, `aromatica_manz`, `custom_vasos`, etc.) no son adivinables desde el nombre coloquial que use el usuario. Antes de cualquier escritura que necesite un id exacto (`--item id=qty`, `set-stock`, `umbral`, `producto-nuevo` para evitar duplicar), corre primero `bodega stock --json` (o `bodega producto <nombre>` si ya tienes un candidato claro) para resolver el nombre real. `bodega registrar "<texto libre>"` y `set-stock`/`umbral`/`producto` ya aceptan nombres en texto libre y los resuelven solos —úsalos en vez de adivinar un id a mano.

## Regla de seguridad: vista previa antes de `--yes`

Todo comando de escritura imprime una vista previa de lo que va a cambiar antes de tocar la base compartida (la misma que usan tus compañeros desde la app web — no hay ambiente de pruebas). El flujo correcto es:

1. Corre el comando **con `--dry-run`** primero si hay cualquier duda sobre qué va a hacer, o simplemente muéstrale al usuario la vista previa que imprime el comando.
2. Espera la confirmación explícita del usuario sobre esa vista previa concreta (no una aprobación genérica de "sí regístralo" dada antes de saber qué se va a registrar).
3. Solo entonces vuelve a correr el comando con `--yes` para aplicarlo.

Nunca encadenes `--yes` a una escritura cuyo contenido exacto (productos, cantidades, fecha) el usuario no haya visto y aprobado.

## Delimitación con otras skills de este workspace

- Esta skill es el **inventario en vivo** (Supabase, lo que ve la app web ahora mismo).
- `generar-solicitud-pedido-cafeteria-y-aseo`, `actualizar-inventario-cafeteria-y-aseo` y `llenar-consumo-inventario` trabajan sobre los **formatos Excel corporativos periódicos** (F-GBS-GC-01, controles quincenales) — un proceso distinto, aunque relacionado. Si el usuario pide explícitamente uno de esos formatos, usa esa skill en vez de esta.
