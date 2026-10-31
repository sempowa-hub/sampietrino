// La storia da condividere: il risultato di oggi come un trofeo, 1080x1920 (formato storia Instagram).
// Fondo scuro coi raggi nel colore del grado, Mino grande, il grado in un timbro enorme, il punteggio gigante,
// le cinque tappe in caselle colorate (si leggono al volo), serie e passaporto, e la sfida a chi guarda.

const L = 1080, H = 1920;
const INCHIOSTRO = '#2a1f16', NOTTE = '#1d1611', CREMA = '#f3e7c9', ROSSO = '#c43a28';

function carica(src) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
}

// Il grado della giornata, dal totale: e la parola da sbandierare.
export function grado(totale) {
  if (totale >= 32) return { nome: 'Da Mino', livello: 4 };
  if (totale >= 24) return { nome: 'Chicca', livello: 3 };
  if (totale >= 16) return { nome: 'Romano de Roma', livello: 2 };
  if (totale >= 8) return { nome: 'Ce sta', livello: 1 };
  if (totale > 0) return { nome: 'Da cartolina', livello: 0 };
  return { nome: 'Buca totale', livello: null };
}

// Raggi a pixel dal centro: alternati in due toni del colore del grado.
function raggi(ctx, cx, cy, colore, scuro) {
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * 2200, cy + Math.sin(a0) * 2200);
    ctx.lineTo(cx + Math.cos(a1) * 2200, cy + Math.sin(a1) * 2200);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? colore : scuro;
    ctx.fill();
  }
}

// Un sampietrino a pixel (coriandolo): faccia chiara, fianco scuro, filo d'inchiostro.
function sampietrino(ctx, x, y, u, tacca) {
  ctx.fillStyle = NOTTE; ctx.fillRect(x - u, y - u, 9 * u, 8 * u);
  ctx.fillStyle = '#5d564c'; ctx.fillRect(x, y, 7 * u, 6 * u);
  ctx.fillStyle = '#8f877a'; ctx.fillRect(x, y, 7 * u, 4 * u);
  ctx.fillStyle = '#b7af9f'; ctx.fillRect(x + u, y + u, 2 * u, u);
  if (tacca) { ctx.fillStyle = tacca; ctx.fillRect(x + 4 * u, y + u, 2 * u, 2 * u); }
}

function testo(ctx, t, x, y, { font, colore = CREMA, allinea = 'center', ombra = null, spazio = 0 }) {
  ctx.font = font;
  ctx.textAlign = allinea;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spazio}px`;
  if (ombra) { ctx.fillStyle = ombra; ctx.fillText(t, x + 8, y + 8); }
  ctx.fillStyle = colore;
  ctx.fillText(t, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

// Timbro: doppio filo storto, testo pieno, un po' di "inchiostro mancante" come un timbro vero.
function timbro(ctx, t, cx, cy, colore, dim, giro = -0.08) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(giro);
  ctx.font = `700 ${dim}px 'Pixelify Sans', sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(dim * 0.06)}px`;
  const w = ctx.measureText(t).width + dim * 1.2, h = dim * 1.75;
  ctx.fillStyle = 'rgba(243, 231, 201, 0.92)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = colore;
  ctx.lineWidth = dim * 0.12;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = dim * 0.05;
  ctx.strokeRect(-w / 2 + dim * 0.22, -h / 2 + dim * 0.22, w - dim * 0.44, h - dim * 0.44);
  ctx.fillStyle = colore;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, 0, dim * 0.06);
  // Inchiostro che non ha preso: puntini di carta sopra il timbro.
  ctx.fillStyle = 'rgba(243, 231, 201, 0.85)';
  for (let i = 0; i < 70; i++) {
    const px = ((i * 7919) % 1000) / 1000 * w - w / 2, py = ((i * 3571) % 1000) / 1000 * h - h / 2;
    ctx.fillRect(px, py, 4, 4);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

// tappe: [{ livello (0-4 o null), punti }]. colori/testi: palette delle fasce. Torna un Blob PNG.
// chicca: una curiosita sulle domande di oggi, estratta a caso (ogni storia e diversa).
export async function creaStoria({ data, totale, massimo, faccia, tappe, colori, serie = 0, timbrati = 0, chicca = '' }) {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const ctx = c.getContext('2d');
  const g = grado(totale);
  const tema = g.livello === null ? ROSSO : colori[g.livello];

  // Fondo: notte, raggi nel colore del grado dietro Mino, velo scuro in basso per leggere bene.
  ctx.fillStyle = NOTTE;
  ctx.fillRect(0, 0, L, H);
  ctx.globalAlpha = 0.55;
  raggi(ctx, L / 2, 690, tema, NOTTE);
  ctx.globalAlpha = 1;
  const velo = ctx.createLinearGradient(0, 900, 0, H);
  velo.addColorStop(0, 'rgba(29, 22, 17, 0)');
  velo.addColorStop(0.35, 'rgba(29, 22, 17, 0.92)');
  velo.addColorStop(1, NOTTE);
  ctx.fillStyle = velo;
  ctx.fillRect(0, 900, L, H - 900);
  // Grana a pixel.
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(243, 231, 201, 0.05)' : 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect((i * 7919) % L, (i * 104729) % H, 4, 4);
  }
  // Coriandoli: sampietrini sparsi, qualcuno con la tacca del colore del grado.
  [[90, 330, 6], [930, 280, 5], [150, 1010, 4], [900, 960, 6], [60, 640, 4], [980, 610, 4], [820, 160, 3], [210, 170, 3]]
    .forEach(([x, y, u], i) => sampietrino(ctx, x, y, u, i % 2 ? tema : null));

  // Testata.
  testo(ctx, 'SAMPIETRINO', L / 2, 150, { font: "92px 'Silkscreen', monospace", ombra: INCHIOSTRO, spazio: 6 });
  testo(ctx, data.toUpperCase(), L / 2, 215, { font: "700 34px 'Pixelify Sans', sans-serif", colore: tema, spazio: 4 });

  // Mino grande, su una pedana d'inchiostro.
  const mino = await carica(`img/mino-${faccia}.png`);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(L / 2 - 250, 900, 500, 26);
  ctx.drawImage(mino, L / 2 - 280, 330, 560, 560);

  // Il grado, timbro enorme e storto sopra la pancia di Mino.
  timbro(ctx, g.nome.toUpperCase(), L / 2, 880, tema, g.nome.length > 12 ? 74 : 92);

  // Il punteggio gigante.
  testo(ctx, String(totale), L / 2 - 30, 1230, { font: "300px 'Silkscreen', monospace", allinea: 'right', ombra: tema });
  testo(ctx, `/${massimo}`, L / 2 - 10, 1150, { font: "110px 'Silkscreen', monospace", allinea: 'left', colore: 'rgba(243, 231, 201, 0.55)' });
  testo(ctx, 'SAMPIETRINI', L / 2 - 4, 1225, { font: "700 44px 'Pixelify Sans', sans-serif", allinea: 'left', colore: CREMA, spazio: 6 });

  // Le cinque tappe in caselle: colore della fascia, punti grandi, la buca a righe rosse.
  const lato = 160, gap = 22, x0 = (L - (5 * lato + 4 * gap)) / 2, y0 = 1282;
  tappe.forEach((t, i) => {
    const x = x0 + i * (lato + gap);
    ctx.fillStyle = INCHIOSTRO;
    ctx.fillRect(x - 6, y0 - 6, lato + 12, lato + 18);
    if (t.livello === null || t.livello === undefined) {
      ctx.fillStyle = '#3a2b22';
      ctx.fillRect(x, y0, lato, lato);
      ctx.fillStyle = ROSSO;
      for (let k = -lato; k < lato; k += 24) {
        ctx.save(); ctx.beginPath(); ctx.rect(x, y0, lato, lato); ctx.clip();
        ctx.beginPath(); ctx.moveTo(x + k, y0 + lato); ctx.lineTo(x + k + 12, y0 + lato); ctx.lineTo(x + k + lato + 12, y0); ctx.lineTo(x + k + lato, y0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else {
      ctx.fillStyle = colori[t.livello];
      ctx.fillRect(x, y0, lato, lato);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(x, y0, lato, 14);
    }
    testo(ctx, t.punti ? `+${t.punti}` : '0', x + lato / 2, y0 + lato / 2 + 26, { font: "72px 'Silkscreen', monospace", colore: t.livello === null || t.livello === undefined ? CREMA : NOTTE });
    testo(ctx, String(i + 1), x + 16, y0 + 40, { font: "28px 'Silkscreen', monospace", allinea: 'left', colore: 'rgba(29, 22, 17, 0.6)' });
  });

  // Serie e passaporto, due bollini.
  const bollini = [serie > 0 ? `${serie} ${serie === 1 ? 'GIORNO' : 'GIORNI DI FILA'}` : null, timbrati > 0 ? `${timbrati} QUARTIERI TIMBRATI` : null].filter(Boolean);
  ctx.font = "700 34px 'Pixelify Sans', sans-serif";
  const larghi = bollini.map((b) => ctx.measureText(b).width + 56);
  let bx = (L - (larghi.reduce((a, b) => a + b, 0) + (bollini.length - 1) * 24)) / 2;
  bollini.forEach((b, i) => {
    ctx.strokeStyle = tema; ctx.lineWidth = 4;
    ctx.strokeRect(bx, 1478, larghi[i], 62);
    testo(ctx, b, bx + larghi[i] / 2, 1521, { font: "700 34px 'Pixelify Sans', sans-serif", colore: CREMA, spazio: 2 });
    bx += larghi[i] + 24;
  });

  // La chicca del giorno: una curiosita sulle domande di oggi, diversa per ogni storia.
  if (chicca) {
    ctx.font = "600 32px 'Pixelify Sans', sans-serif";
    const righe = [''];
    for (const p of chicca.split(' ')) {
      const prova = `${righe.at(-1)} ${p}`.trim();
      if (ctx.measureText(prova).width > 800) righe.push(p); else righe[righe.length - 1] = prova;
    }
    const mostrate = righe.slice(0, 4);
    if (righe.length > 4) mostrate[3] = `${mostrate[3].replace(/[.,;:]?$/, '')}…`;
    const alto = 76 + mostrate.length * 42;
    ctx.fillStyle = 'rgba(243, 231, 201, 0.08)';
    ctx.fillRect(110, 1570, L - 220, alto);
    ctx.fillStyle = tema;
    ctx.fillRect(110, 1570, 8, alto);
    testo(ctx, 'MINO DICE', 146, 1618, { font: "700 28px 'Pixelify Sans', sans-serif", allinea: 'left', colore: tema, spazio: 4 });
    mostrate.forEach((r, i) => testo(ctx, r, 146, 1664 + i * 42, { font: "600 32px 'Pixelify Sans', sans-serif", allinea: 'left', colore: CREMA }));
  }

  // La sfida, su un biglietto.
  ctx.fillStyle = CREMA;
  ctx.fillRect(110, 1782, L - 220, 104);
  ctx.fillStyle = NOTTE;
  ctx.beginPath(); ctx.arc(110, 1834, 18, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.beginPath(); ctx.arc(L - 110, 1834, 18, Math.PI / 2, Math.PI * 1.5); ctx.fill();
  testo(ctx, 'BATTI IL MIO PUNTEGGIO', L / 2, 1828, { font: "40px 'Silkscreen', monospace", colore: NOTTE, spazio: 2 });
  testo(ctx, 'sampietrino-roma.web.app', L / 2, 1870, { font: "700 32px 'Pixelify Sans', sans-serif", colore: ROSSO });
  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}
