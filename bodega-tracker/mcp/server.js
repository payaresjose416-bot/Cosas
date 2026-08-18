#!/usr/bin/env node
// Servidor MCP de bodega — expone el mismo inventario (Supabase compartido)
// que el CLI `bodega` y la app web, para usarlo desde Claude Code o Claude
// Desktop sin pasar por una terminal. Ver bodega-tracker/CLAUDE.md para cómo
// registrarlo en cada uno.
//
// IMPORTANTE: este proceso usa stdout SOLO para el framing JSON-RPC del
// transporte stdio. Por eso ningún módulo de aquí importa cli/commands/*.js
// (esos usan console.log/console.error para imprimir tablas) — solo las
// piezas de bajo nivel de cli/lib/ y src/core/ y src/utils/, que son puras.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerReadTools } from './tools/read.js'
import { registerWriteTools } from './tools/write.js'
import { registerExcelTools } from './tools/excel.js'

const server = new McpServer({ name: 'bodega', version: '0.1.0' })

registerReadTools(server)
registerWriteTools(server)
registerExcelTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)
