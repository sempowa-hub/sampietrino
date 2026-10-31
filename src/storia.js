// La storia da condividere: il diario di oggi impaginato in 1080x1920 (formato storia Instagram), col giorno.
import { disegnaMiniMappa } from './minimappa.js';

const L = 1080, H = 1920;
const INCHIOSTRO = '#2a1f16', CARTA = '#f3e7c9', SCHEDA = '#fbf4e0', ROSSO = '#c43a28';

function carica(src) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
}

// Timbro: testo in un doppio filo del suo colore, un po' storto.
function timbro(ctx, testo, cx, cy, colore, dim = 30) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.05);
  ctx.font = `650 ${dim}px 'Pixelify Sans', sans-serif`;
  const w = ctx.measureText(testo.toUpperCase()).width + dim * 1.1, h = dim * 1.6;
  ctx.strokeStyle = colore;
  ctx.lineWidth = 4;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 2;
  ctx.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
  ctx.fillStyle = colore;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(testo.toUpperCase(), 0, 2);
  ctx.restore();
}

// righe: [{ n, zona, fascia, punti, colore, coloreTesto }]. Torna un Blob PNG.
export async function creaStoria({ dati, data, totale, massimo, frase, faccia, righe, colori }) {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = CARTA;
  ctx.fillRect(0, 0, L, H);
  // Grana della carta.
  for (let i = 0; i < 9000; i++) {
    const x = (i * 7919) % L, y = (i * 104729) % H;
    ctx.fillStyle = i % 3 ? 'rgba(120, 95, 55, 0.10)' : 'rgba(255, 250, 235, 0.5)';
    ctx.fillRect(x, y, 3, 3);
  }
  // Cornice a doppio filo.
  ctx.strokeStyle = INCHIOSTRO;
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, L - 80, H - 80);
  ctx.lineWidth = 2;
  ctx.strokeRect(54, 54, L - 108, H - 108);

  ctx.textAlign = 'center';
  ctx.fillStyle = INCHIOSTRO;
  ctx.font = "88px 'Silkscreen', monospace";
  ctx.fillText('SAMPIETRINO', L / 2, 190);
  ctx.fillStyle = ROSSO;
  ctx.font = "650 34px 'Pixelify Sans', sans-serif";
  ctx.fillText(`DIARIO DI ${data.toUpperCase()}`, L / 2, 250);

  // Mino e il totale, affiancati.
  const im = await carica(`img/mino-${faccia}.png`);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, 110, 300, 392, 392);
  ctx.textAlign = 'left';
  ctx.fillStyle = INCHIOSTRO;
  ctx.font = "220px 'Silkscreen', monospace";
  ctx.fillText(String(totale), 560, 560);
  ctx.font = "500 56px 'Pixelify Sans', sans-serif";
  ctx.fillText(`/ ${massimo} sampietrini`, 566, 640);

  // Frase della giornata, su due righe al massimo.
  ctx.textAlign = 'center';
  ctx.font = "500 42px 'Pixelify Sans', sans-serif";
  const parole = frase.split(' ');
  const linee = [''];
  for (const p of parole) {
    const prova = `${linee.at(-1)} ${p}`.trim();
    if (ctx.measureText(prova).width > 860) linee.push(p); else linee[linee.length - 1] = prova;
  }
  linee.slice(0, 2).forEach((l, i) => ctx.fillText(l, L / 2, 770 + i * 54));

  // La mappa con le zone di oggi.
  ctx.fillStyle = SCHEDA;
  ctx.fillRect(110, 880, L - 220, 560);
  ctx.strokeStyle = INCHIOSTRO;
  ctx.lineWidth = 3;
  ctx.strokeRect(110, 880, L - 220, 560);
  disegnaMiniMappa(ctx, dati, { x: 130, y: 896, w: L - 260, h: 528, colori, filo: 1.4, avvicina: true });

  // Le cinque tappe.
  righe.forEach((r, i) => {
    const y = 1500 + i * 64;
    ctx.textAlign = 'left';
    ctx.fillStyle = INCHIOSTRO;
    ctx.font = "34px 'Silkscreen', monospace";
    ctx.fillText(String(r.n), 130, y + 12);
    ctx.font = "600 36px 'Pixelify Sans', sans-serif";
    ctx.fillText(r.zona.length > 22 ? `${r.zona.slice(0, 21)}…` : r.zona, 180, y + 12);
    timbro(ctx, r.fascia, 760, y, r.coloreTesto, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = r.coloreTesto;
    ctx.font = "34px 'Silkscreen', monospace";
    ctx.fillText(r.punti ? `+${r.punti}` : '0', L - 130, y + 12);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = INCHIOSTRO;
  ctx.font = "600 34px 'Pixelify Sans', sans-serif";
  ctx.fillText('Gioca anche tu: sampietrino-roma.web.app', L / 2, H - 90);
  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}
