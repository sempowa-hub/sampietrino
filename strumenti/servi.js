// Server statico minimo per giocare in locale: npm run gioca, poi http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = fileURLToPath(new URL('..', import.meta.url));
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
const PORTA = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
  try {
    // Dentro il try: un indirizzo scritto male (% a meta) risponde 404 invece di fermare il server.
    const percorso = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(RADICE, percorso.endsWith('/') ? `${percorso}index.html` : percorso);
    if (!file.startsWith(RADICE)) { res.writeHead(403).end(); return; }
    const corpo = await readFile(file);
    res.writeHead(200, { 'Content-Type': TIPI[extname(file)] || 'application/octet-stream' }).end(corpo);
  } catch {
    res.writeHead(404).end('non trovato');
  }
}).listen(PORTA, () => console.log(`Sampietrino su http://localhost:${PORTA}`));
