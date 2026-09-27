// Builds dist/artifact.html: the page body without its document skeleton,
// for hosts that wrap the page themselves. The src/ modules ship alongside it.
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../dist/artifact.html', import.meta.url), head.trim() + '\n' + body.trim() + '\n');
console.log('wrote dist/artifact.html');
