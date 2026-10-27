import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const config = { runtime: 'nodejs' };

export default {
  async fetch() {
    const candidates = [
      join(process.cwd(), 'intelligence.js'),
      join(process.cwd(), 'viabilidade', 'intelligence.js'),
      '/var/task/viabilidade/intelligence.js',
    ];
    let source = null;
    let selected = null;
    const failures = [];
    for (const path of candidates) {
      try {
        source = await readFile(path, 'utf8');
        selected = path;
        break;
      } catch (error) {
        failures.push({ path, error: error.code || error.message });
      }
    }
    if (source === null) {
      return new Response(JSON.stringify({ ok: false, error: 'source_not_found', failures }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    try {
      new Function(source);
      return new Response(JSON.stringify({ ok: true, bytes: source.length, path: selected }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message, stack: error.stack }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
  },
};
