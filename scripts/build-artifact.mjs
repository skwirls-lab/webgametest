// Builds dist/artifact.html: the page body without its document skeleton,
// for hosts that wrap the page themselves. The src/ modules ship alongside it.
import fs from 'node:fs';

// usage: node scripts/build-artifact.mjs [input.html] [output.html]
const input = process.argv[2] ? new URL(process.argv[2], `file://${process.cwd()}/`) : new URL('../index.html', import.meta.url);
const output = process.argv[3] ? new URL(process.argv[3], `file://${process.cwd()}/`) : new URL('../dist/artifact.html', import.meta.url);
const html = fs.readFileSync(input, 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.mkdirSync(new URL('./', output), { recursive: true });
fs.writeFileSync(output, head.trim() + '\n' + body.trim() + '\n');
console.log('wrote', output.pathname);
