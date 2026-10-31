// Mappa piccola e ferma, disegnata su un canvas qualsiasi: per la storia da condividere e per il passaporto.
// Stesso linguaggio della mappa grande: carta, confini sottili, Raccordo d'inchiostro, Tevere.

// Riquadro [x0, y0, x1, y1] in km di un percorso SVG fatto di M/L/Z.
function riquadro(d) {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n.length; i += 2) {
    b[0] = Math.min(b[0], n[i]); b[1] = Math.min(b[1], n[i + 1]); b[2] = Math.max(b[2], n[i]); b[3] = Math.max(b[3], n[i + 1]);
  }
  return b;
}

// colori: id zona -> colore di riempimento. Le altre zone restano carta.
// avvicina: inquadra solo le zone colorate (con margine, almeno 7 km), invece di tutta Roma.
export function disegnaMiniMappa(ctx, dati, { x, y, w, h, colori = {}, filo = 1, avvicina = false }) {
  const [LW, LH] = dati.dimensioni;
  let vista = [0, 0, LW, LH];
  const scelte = dati.zone.filter((z) => colori[z.id]);
  if (avvicina && scelte.length) {
    const b = scelte.map((z) => riquadro(z.d)).reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])]);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const lato = Math.max(7, (b[2] - b[0]) * 1.5, (b[3] - b[1]) * 1.5 * (w / h));
    vista = [cx - lato / 2, cy - lato / 2 / (w / h), cx + lato / 2, cy + lato / 2 / (w / h)];
  }
  const vw = vista[2] - vista[0], vh = vista[3] - vista[1];
  const s = Math.min(w / vw, h / vh);
  const ox = x + (w - vw * s) / 2 - vista[0] * s, oy = y + (h - vh * s) / 2 - vista[1] * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.setTransform(s, 0, 0, s, ox, oy);
  const px = filo / s;
  const comune = new Path2D(dati.comune);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#faf3de';
  ctx.lineWidth = 8 * px;
  ctx.stroke(comune);
  ctx.fillStyle = '#d6d0b8';
  ctx.fill(comune, 'evenodd');
  for (const z of dati.zone) {
    ctx.fillStyle = colori[z.id] || '#f1e6c6';
    ctx.fill(new Path2D(z.d), 'evenodd');
  }
  if (dati.tevere) {
    ctx.strokeStyle = '#4f7f92';
    ctx.lineWidth = Math.max(0.1, 3 * px);
    ctx.stroke(new Path2D(dati.tevere));
    ctx.strokeStyle = '#86b0c0';
    ctx.lineWidth = Math.max(0.1 - 1.5 * px, 1.6 * px);
    ctx.stroke(new Path2D(dati.tevere));
  }
  ctx.strokeStyle = 'rgba(42, 31, 22, 0.55)';
  ctx.lineWidth = 0.8 * px;
  if (dati.confini) ctx.stroke(new Path2D(dati.confini));
  ctx.strokeStyle = '#2a1f16';
  ctx.lineWidth = 1.2 * px;
  if (dati.confini_municipi) ctx.stroke(new Path2D(dati.confini_municipi));
  // Le zone colorate col filo pieno, cosi si vedono anche piccole.
  for (const z of dati.zone) {
    if (!colori[z.id]) continue;
    ctx.strokeStyle = '#2a1f16';
    ctx.lineWidth = 2 * px;
    ctx.stroke(new Path2D(z.d));
  }
  ctx.lineWidth = 2.4 * px;
  ctx.stroke(comune);
  ctx.restore();
}
