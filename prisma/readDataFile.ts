import * as fs from 'fs';

// Reads a prisma/seed-data file. Some snapshots (ENA and WC fixtures) are a
// single JSON-style quoted string with literal \t / \n escapes rather than raw
// TSV; those are unquoted and unescaped here.
export function readDataFile(filePath: string): string {
  try {
    let raw = fs.readFileSync(filePath, 'latin1').trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      raw = raw.slice(1, -1);
      raw = raw
        .replace(/\\r/g, '\r')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return raw;
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
    return '';
  }
}
