// Mappa di Roma come una carta stampata: si ridisegna a vettori a ogni fotogramma, quindi resta
// nitida a qualunque zoom. I tratti hanno spessore fisso in pixel di schermo (un confine e sempre
// un filo sottile), la grana della carta e il tratteggio della campagna sono a scala di schermo.
// A pixel restano solo i segni sopra la carta: cartellini, sampietrini, scala grafica.
// Tutto si muove in un solo ciclo di animazione: camera, macchie di colore, sampietrini che cadono.

// Contrasto da stampa: dentro il Raccordo crema chiaro, fuori campagna grigio-verde spenta,
// confini d'inchiostro.
const C = {
  carta: [241, 230, 198],
  buco: [214, 208, 184],
  campagna: '#c4c4aa', tratteggio: 'rgba(120, 122, 92, 0.22)',
  confine: 'rgba(42, 31, 22, 0.72)', municipio: '#2a1f16',
  anello: '#2a1f16', anelloLuce: '#faf3de',
  reticolo: 'rgba(42, 31, 22, 0.09)',
  fiume: '#86b0c0', argine: '#4f7f92',
  scelta: [196, 58, 40], sceltaScura: [120, 30, 18],
};

// Fasce della scala, dalla Scontata alla Da sampietrino: peperino, pino, fontanella, cocciopesto, oro.
// Stessi colori dell'interfaccia (stile.css).
export const COLORI_FASCE = ['#a9a397', '#6e9a5a', '#5b8fb8', '#d0663f', '#e8b33a'];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luce = (c, d) => c.map((v) => Math.max(0, Math.min(255, v + d)));
const css = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
// Verso il crema: la tinta chiara di una zona col contorno pieno (risultato, scelta).
const sbiadisci = (c, q) => c.map((v, i) => Math.round(v + (C.carta[i] - v) * q));
const TINTE = {
  normale: C.carta,
  sopra: [250, 243, 222],
  scelta: sbiadisci(C.scelta, 0.74),
  spento: [218, 212, 188],
  sbagliata: sbiadisci(C.scelta, 0.6),
  bersaglio: [204, 197, 172],
  attesa: [232, 220, 188],
  ...Object.fromEntries(COLORI_FASCE.map((h, i) => [`f${i}`, rgb(h)])),
  ...Object.fromEntries(COLORI_FASCE.map((h, i) => [`r${i}`, sbiadisci(rgb(h), 0.62)])),
};
// Contorni pieni: [orlo interno, filo]. Il filo e la tinta scurita.
const CONTORNI = {
  scelta: [C.scelta, C.sceltaScura],
  attesa: [[120, 98, 70], [42, 31, 22]],
  sbagliata: [C.scelta, C.sceltaScura],
  ...Object.fromEntries(COLORI_FASCE.map((h, i) => [`r${i}`, [rgb(h), luce(rgb(h), -75)]])),
};

const MOTO_RIDOTTO = matchMedia('(prefers-reduced-motion: reduce)');
const ora = () => performance.now();
const easeOut = (t) => 1 - Math.pow(1 - t, 5);
const easeInOut = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
const limita = (t) => Math.max(0, Math.min(1, t));

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Riquadro [x0, y0, x1, y1] in km di un percorso SVG fatto di M/L/Z.
function riquadroDi(d) {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n.length; i += 2) {
    b[0] = Math.min(b[0], n[i]); b[1] = Math.min(b[1], n[i + 1]);
    b[2] = Math.max(b[2], n[i]); b[3] = Math.max(b[3], n[i + 1]);
  }
  return b;
}

// Grana della carta e tratteggio della campagna: piccoli motivi a scala di schermo, uguali per tutti.
function motivo(lato, disegna) {
  const c = document.createElement('canvas');
  c.width = c.height = lato;
  disegna(c.getContext('2d'), lato);
  return c;
}
const GRANA = motivo(96, (g, l) => {
  for (let y = 0; y < l; y++) for (let x = 0; x < l; x++) {
    const h = hash(x, y) % 100;
    if (h < 6) { g.fillStyle = 'rgba(90, 70, 40, 0.10)'; g.fillRect(x, y, 1, 1); }
    else if (h < 9) { g.fillStyle = 'rgba(255, 250, 235, 0.35)'; g.fillRect(x, y, 1, 1); }
  }
});
const TRATTEGGIO = motivo(8, (g, l) => {
  g.fillStyle = C.tratteggio;
  for (let i = 0; i < l; i++) g.fillRect(i, l - 1 - i, 1, 1);
});

// onSopra(id): il mouse e entrato in una zona sceglibile (per il suono).
export function creaMappa(canvas, dati, { onTocca, onSopra = () => {} }) {
  const [LW, LH] = dati.dimensioni;
  const N = dati.zone.length;
  const ctx = canvas.getContext('2d');
  const prova = document.createElement('canvas').getContext('2d');
  const forme = dati.zone.map((z) => new Path2D(z.d));
  const riqZone = dati.zone.map((z) => riquadroDi(z.d));
  const formeMun = dati.municipi.map((m) => new Path2D(m.d));
  const riqMun = dati.municipi.map((m) => riquadroDi(m.d));
  const comune = new Path2D(dati.comune);
  const tevere = dati.tevere ? new Path2D(dati.tevere) : null;
  const confini = dati.confini ? new Path2D(dati.confini) : null;
  const confiniMun = dati.confini_municipi ? new Path2D(dati.confini_municipi) : null;
  const indiceZona = Object.fromEntries(dati.zone.map((z, i) => [z.id, i]));
  // Raggio di ogni zona dal suo centro: fin dove deve arrivare la macchia per coprirla tutta.
  const raggio = dati.zone.map((z, i) => {
    const [x0, y0, x1, y1] = riqZone[i];
    const [cx, cy] = z.centro;
    return Math.hypot(Math.max(cx - x0, x1 - cx), Math.max(cy - y0, y1 - cy)) * 1.05;
  });

  // Stato delle zone: tinta attuale e, se si sta colorando, la macchia che si allarga dal centro.
  const tinta = new Array(N).fill(TINTE.normale);
  const macchia = new Array(N).fill(null);
  let statoZona = () => 'normale';
  let sceglibile = false;
  let sopra = -1, scelta = -1, municipioAcceso = -1;
  let etichette = [];
  let pins = [];
  let vista = { x: 0, y: 0, w: LW, h: LH };
  let volo = null;
  let fotogramma = 0, battito = 0;
  let grana = null, tratteggio = null;

  function tintaDi(z) {
    const s = statoZona(dati.zone[z].id);
    if (s === 'normale' && sceglibile && z === sopra) return TINTE.sopra;
    return TINTE[s] || TINTE.normale;
  }

  function richiedi() {
    if (!fotogramma) fotogramma = requestAnimationFrame(passo);
  }

  function passo(t) {
    fotogramma = 0;
    let ancora = false;
    if (volo) {
      const p = limita((t - volo.t0) / volo.durata);
      const e = easeInOut(p);
      vista = Object.fromEntries(['x', 'y', 'w', 'h'].map((k) => [k, volo.da[k] + (volo.a[k] - volo.da[k]) * e]));
      if (p >= 1) volo = null; else ancora = true;
    }
    for (let z = 0; z < N; z++) {
      const m = macchia[z];
      if (!m) continue;
      if (t >= m.t0 + m.durata) { macchia[z] = null; tinta[z] = m.a; } else ancora = true;
    }
    if (disegna(t)) ancora = true;
    clearTimeout(battito);
    if (ancora) richiedi();
    // La zona scelta lampeggia a due passi: basta un fotogramma ogni 420 ms.
    else if (scelta >= 0) battito = setTimeout(richiedi, 420 - (t % 420) + 5);
  }

  function scala() {
    const s = Math.min(canvas.width / vista.w, canvas.height / vista.h);
    return { s, ox: (canvas.width - vista.w * s) / 2 - vista.x * s, oy: (canvas.height - vista.h * s) / 2 - vista.y * s };
  }

  // Disegna la carta e i segni sopra. Torna true se qualcosa si sta ancora muovendo.
  function disegna(t = ora()) {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    grana ||= ctx.createPattern(GRANA, 'repeat');
    tratteggio ||= ctx.createPattern(TRATTEGGIO, 'repeat');
    const { s, ox, oy } = scala();
    const px = dpr / s; // un pixel di schermo, in km
    let muove = false;

    // Campagna fuori dal Raccordo, tratteggiata.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.campagna;
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = tratteggio;
    ctx.fillRect(0, 0, cw, ch);

    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Anello del Raccordo: due aloni chiari fuori, come la costa di una carta nautica, poi il filo d'inchiostro.
    ctx.strokeStyle = 'rgba(250, 243, 222, 0.45)';
    ctx.lineWidth = 16 * px;
    ctx.stroke(comune);
    ctx.strokeStyle = C.anelloLuce;
    ctx.lineWidth = 7 * px;
    ctx.stroke(comune);
    ctx.fillStyle = css(C.buco);
    ctx.fill(comune, 'evenodd');

    // Zone: tinta piena o macchia che si allarga, con un bordo d'inchiostro bagnato.
    for (let z = 0; z < N; z++) {
      const m = macchia[z];
      if (!m || t < m.t0) {
        ctx.fillStyle = css(m ? m.da : tinta[z]);
        ctx.fill(forme[z], 'evenodd');
        continue;
      }
      const p = easeOut(limita((t - m.t0) / m.durata));
      const rr = p * raggio[z];
      ctx.save();
      ctx.clip(forme[z], 'evenodd');
      ctx.fillStyle = css(m.da);
      ctx.fill(forme[z], 'evenodd');
      ctx.beginPath();
      ctx.arc(m.cx, m.cy, rr, 0, Math.PI * 2);
      ctx.fillStyle = css(m.a);
      ctx.fill();
      ctx.strokeStyle = css(luce(m.a, -45));
      ctx.lineWidth = 3 * px;
      ctx.stroke();
      ctx.restore();
    }

    // Reticolo di un chilometro, a puntini.
    ctx.save();
    ctx.clip(comune, 'evenodd');
    ctx.strokeStyle = C.reticolo;
    ctx.lineWidth = px;
    ctx.setLineDash([px, 4 * px]);
    ctx.beginPath();
    for (let x = Math.ceil(vista.x - vista.w); x < vista.x + vista.w * 2; x++) { ctx.moveTo(x, -1); ctx.lineTo(x, LH + 1); }
    for (let y = Math.ceil(vista.y - vista.h); y < vista.y + vista.h * 2; y++) { ctx.moveTo(-1, y); ctx.lineTo(LW + 1, y); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Il Tevere: acqua piatta con un filo appena piu scuro ai lati. Circa 100 m, mai meno di 3 px.
    if (tevere) {
      const largo = Math.max(0.1, 3 * px);
      ctx.strokeStyle = C.argine;
      ctx.lineWidth = largo + 1.5 * px;
      ctx.stroke(tevere);
      ctx.strokeStyle = C.fiume;
      ctx.lineWidth = largo;
      ctx.stroke(tevere);
    }

    // Confini: tratteggio sottile tra zone, filo pieno tra municipi. Sempre lo stesso spessore a schermo.
    // Le reti hanno ogni tratto una volta sola, cosi il tratteggio esce regolare.
    ctx.strokeStyle = C.confine;
    ctx.lineWidth = 1 * px;
    ctx.lineCap = 'butt';
    ctx.setLineDash([4 * px, 3 * px]);
    if (confini) ctx.stroke(confini);
    else for (const f of forme) ctx.stroke(f);
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.municipio;
    ctx.lineWidth = 1.3 * px;
    if (confiniMun) ctx.stroke(confiniMun);
    else for (const f of formeMun) ctx.stroke(f);
    if (municipioAcceso >= 0) {
      ctx.strokeStyle = css(C.scelta);
      ctx.lineWidth = 3 * px;
      ctx.stroke(formeMun[municipioAcceso]);
    }

    // Contorni pieni (zona scelta, risultato): alone fuori, orlo e filo dentro.
    for (let z = 0; z < N; z++) {
      const contorno = CONTORNI[statoZona(dati.zone[z].id)];
      const m = macchia[z];
      if (!contorno || (m && t < m.t0 + m.durata * 0.6)) continue;
      const [pieno, scuro] = contorno;
      const entra = m ? limita((t - m.t0 - m.durata * 0.6) / (m.durata * 0.4)) : 1;
      ctx.globalAlpha = entra;
      ctx.strokeStyle = css(pieno, 0.32);
      ctx.lineWidth = 9 * px;
      ctx.stroke(forme[z]);
      ctx.save();
      ctx.clip(forme[z], 'evenodd');
      ctx.strokeStyle = css(pieno);
      ctx.lineWidth = 7 * px;
      ctx.stroke(forme[z]);
      const acceso = z === scelta && Math.floor(t / 420) % 2;
      ctx.strokeStyle = css(acceso ? pieno : scuro);
      ctx.lineWidth = 3.5 * px;
      ctx.stroke(forme[z]);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = C.anello;
    ctx.lineWidth = 2 * px;
    ctx.stroke(comune);

    // Grana della carta sopra tutto, a scala di schermo.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = grana;
    ctx.fillRect(0, 0, cw, ch);

    // Sampietrini: cadono dall'alto, toccano terra con un po' di polvere.
    const u = Math.max(3, Math.round(3 * dpr));
    for (const p of pins) {
      const z = dati.zone[indiceZona[p.id]];
      if (!z) continue;
      const tx = Math.round(ox + z.centro[0] * s), ty = Math.round(oy + z.centro[1] * s);
      const q = limita((t - p.t0) / 420);
      if (q < 1) muove = true;
      const caduta = q < 1 ? (1 - q * q) * 90 * dpr : 0;
      const schiaccia = q >= 1 && t - p.t0 < 520;
      disegnaSampietrino(tx, ty - caduta, u, schiaccia, p.livello);
      const polvere = (t - p.t0 - 420) / 380;
      if (polvere > 0 && polvere < 1) {
        muove = true;
        ctx.fillStyle = `rgba(86, 67, 45, ${0.7 * (1 - polvere)})`;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          const d = (6 + polvere * 16) * u / 2;
          ctx.fillRect(Math.round(tx + Math.cos(a) * d * 1.6), Math.round(ty + 2 * u + Math.sin(a) * d * 0.5), u, u);
        }
      }
    }

    // Cartellini: carta, filo d'inchiostro, ombra piena. Entrano con un piccolo scatto.
    const fs = Math.round(14 * dpr);
    ctx.font = `600 ${fs}px 'Pixelify Sans', sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${dpr}px`;
    ctx.textBaseline = 'middle';
    const messi = [];
    for (const e of etichette) {
      const z = dati.zone[indiceZona[e.id]];
      if (!z) continue;
      const q = limita((t - e.t0) / 160);
      if (t < e.t0) { muove = true; continue; }
      if (q < 1) muove = true;
      const k = 0.86 + 0.14 * easeOut(q);
      const testo = z.nome.toUpperCase();
      const conPin = pins.some((p) => p.id === e.id);
      const tx = ox + z.centro[0] * s, ty = oy + z.centro[1] * s - (conPin ? 40 * dpr : 0);
      const w = (ctx.measureText(testo).width + (e.colore ? 28 : 16) * dpr) * k, h = (fs + 11 * dpr) * k;
      const box = [Math.round(tx - w / 2), Math.round(ty - h / 2), Math.round(w), Math.round(h)];
      if (messi.some((b) => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) continue;
      messi.push(box);
      ctx.globalAlpha = easeOut(q);
      const l = Math.max(1, Math.round(dpr));
      ctx.fillStyle = '#2a1f16';
      ctx.fillRect(box[0] - l, box[1] - l, box[2] + 2 * l, box[3] + 2 * l);
      ctx.fillRect(box[0] + l, box[1] + box[3] + l, box[2], 2 * l);
      ctx.fillStyle = e.inverso ? '#2a1f16' : '#f8efd8';
      ctx.fillRect(...box);
      let x0 = box[0] + 7 * dpr * k;
      if (e.colore) {
        ctx.fillStyle = e.colore;
        const q2 = Math.round(8 * dpr * k);
        ctx.fillRect(Math.round(x0), Math.round(box[1] + box[3] / 2 - q2 / 2), q2, q2);
        x0 += 12 * dpr * k;
      }
      ctx.fillStyle = e.inverso ? '#f8efd8' : '#2a1f16';
      if (k < 1) { ctx.save(); ctx.translate(x0, box[1] + box[3] / 2); ctx.scale(k, k); ctx.fillText(testo, 0, dpr); ctx.restore(); }
      else ctx.fillText(testo, Math.round(x0), Math.round(box[1] + box[3] / 2 + dpr));
      ctx.globalAlpha = 1;
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    // Scala grafica in basso a destra: un chilometro (o 500 m da vicino), a pixel.
    const passoKm = s / dpr > 260 ? 0.5 : 1;
    const km = Math.round(s * passoKm);
    if (km > 12) {
      const l = Math.max(1, Math.round(dpr));
      const x1 = cw - Math.round(16 * dpr), x0 = x1 - km, y0 = ch - Math.round(16 * dpr);
      ctx.fillStyle = '#2a1f16';
      ctx.fillRect(x0, y0, km, l * 2);
      ctx.fillRect(x0, y0 - 4 * l, l * 2, 6 * l);
      ctx.fillRect(x1 - 2 * l, y0 - 4 * l, l * 2, 6 * l);
      ctx.fillRect(x0 + Math.round(km / 2) - l, y0 - 2 * l, l * 2, 4 * l);
      ctx.font = `600 ${Math.round(12 * dpr)}px 'Pixelify Sans', sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(passoKm === 1 ? '1 KM' : '500 M', x0, y0 - 5 * l);
    }
    return muove;
  }

  // Un sampietrino visto di tre quarti: faccia di sopra chiara, fianco scuro, filo d'inchiostro.
  // Una tacca del colore della fascia (rossa per la buca) sulla faccia.
  function disegnaSampietrino(cx, cy, u, schiaccia, livello) {
    const w = 7, h = schiaccia ? 5 : 6;
    const x = Math.round(cx - (w * u) / 2), y = Math.round(cy - h * u);
    ctx.fillStyle = 'rgba(42, 31, 22, 0.25)';
    ctx.fillRect(Math.round(cx - 4 * u), Math.round(cy + u), 8 * u, u);
    ctx.fillStyle = '#2a1f16';
    ctx.fillRect(x - u, y - u, (w + 2) * u, (h + 2) * u);
    ctx.fillStyle = '#5d564c';
    ctx.fillRect(x, y, w * u, h * u);
    ctx.fillStyle = '#8f877a';
    ctx.fillRect(x, y, w * u, (h - 2) * u);
    ctx.fillStyle = '#b7af9f';
    ctx.fillRect(x + u, y + u, 2 * u, u);
    if (livello !== undefined) {
      ctx.fillStyle = livello === null ? '#c43a28' : COLORI_FASCE[livello];
      ctx.fillRect(x + 4 * u, y + u, 2 * u, 2 * u);
    }
  }

  function kmInPunto(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    const { s, ox, oy } = scala();
    return [((clientX - r.left) * dpr - ox) / s, ((clientY - r.top) * dpr - oy) / s, dpr / s];
  }

  function zonaInPunto(clientX, clientY) {
    const [kx, ky, px] = kmInPunto(clientX, clientY);
    for (let z = 0; z < N; z++) {
      const b = riqZone[z];
      if (kx < b[0] || kx > b[2] || ky < b[1] || ky > b[3]) continue;
      if (prova.isPointInPath(forme[z], kx, ky, 'evenodd')) return z;
    }
    // Su un confine (le zone semplificate lasciano fessure di pochi metri): la zona piu vicina entro 6 px.
    prova.lineWidth = 12 * px;
    for (let z = 0; z < N; z++) if (prova.isPointInStroke(forme[z], kx, ky)) return z;
    return -1;
  }

  function zoomA(fattore, cx, cy) {
    volo = null;
    const nw = Math.min(LW * 1.1, Math.max(0.6, vista.w * fattore));
    const k = nw / vista.w;
    vista = { x: cx - (cx - vista.x) * k, y: cy - (cy - vista.y) * k, w: nw, h: vista.h * k };
    richiedi();
  }

  function aggiornaSopra(z) {
    if (z === sopra) return;
    sopra = z;
    for (let i = 0; i < N; i++) if (!macchia[i]) tinta[i] = tintaDi(i);
    canvas.style.cursor = z >= 0 && sceglibile ? 'pointer' : 'grab';
    etichette = etichette.filter((e) => !e.sopra);
    if (z >= 0 && sceglibile && z !== scelta) { etichette.push({ id: dati.zone[z].id, sopra: true, t0: ora() }); onSopra(dati.zone[z].id); }
    richiedi();
  }

  // Gesti: trascina, pizzica, rotella. Un tocco senza movimento sceglie la zona.
  const tocchi = new Map();
  let mosso = false, distanza0 = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    tocchi.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    mosso = false;
    if (tocchi.size === 2) { const [a, b] = [...tocchi.values()]; distanza0 = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const t = tocchi.get(e.pointerId);
    if (!t) {
      if (e.pointerType === 'mouse') aggiornaSopra(zonaInPunto(e.clientX, e.clientY));
      return;
    }
    if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 6) mosso = true;
    if (tocchi.size === 1 && mosso) {
      volo = null;
      const [, , kmPx] = kmInPunto(e.clientX, e.clientY);
      vista.x -= (e.clientX - t.x) * kmPx;
      vista.y -= (e.clientY - t.y) * kmPx;
      canvas.style.cursor = 'grabbing';
      richiedi();
    }
    t.x = e.clientX; t.y = e.clientY;
    if (tocchi.size === 2) {
      const [a, b] = [...tocchi.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (distanza0 > 0) { const [cx, cy] = kmInPunto((a.x + b.x) / 2, (a.y + b.y) / 2); zoomA(distanza0 / d, cx, cy); }
      distanza0 = d;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const t = tocchi.get(e.pointerId);
    tocchi.delete(e.pointerId);
    if (t && !mosso && tocchi.size === 0) {
      const z = zonaInPunto(e.clientX, e.clientY);
      if (z >= 0) onTocca(dati.zone[z].id);
    }
    if (e.pointerType === 'mouse') aggiornaSopra(zonaInPunto(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointercancel', (e) => tocchi.delete(e.pointerId));
  canvas.addEventListener('pointerleave', () => aggiornaSopra(-1));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [cx, cy] = kmInPunto(e.clientX, e.clientY);
    zoomA(Math.exp(Math.max(-1, Math.min(1, e.deltaY / 100)) * 0.18), cx, cy);
  }, { passive: false });

  // alza: quota della vista da lasciare libera in basso (il cartellino dell'esito copre quella parte).
  function vistaPer({ zone = [], municipio = null, alza = 0 } = {}) {
    const riq = [...zone.map((id) => riqZone[indiceZona[id]]), ...(municipio ? [riqMun[dati.municipi.findIndex((m) => m.num === municipio)]] : [])].filter(Boolean);
    const r = canvas.getBoundingClientRect();
    const aspetto = r.width / r.height || LW / LH;
    if (!riq.length) {
      const w = Math.max(LW, LH * aspetto) * 1.02;
      return { x: LW / 2 - w / 2, y: LH / 2 - w / aspetto / 2, w, h: w / aspetto };
    }
    const x0 = Math.min(...riq.map((b) => b[0])), y0 = Math.min(...riq.map((b) => b[1]));
    const x1 = Math.max(...riq.map((b) => b[2])), y1 = Math.max(...riq.map((b) => b[3]));
    const margine = (zone.length > 1 || municipio ? 1.2 : 1.8) + alza * 2;
    const w = Math.min(LW, Math.max(2.5, (x1 - x0) * margine, (y1 - y0) * margine * aspetto));
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w / aspetto / 2 + (w / aspetto) * alza, w, h: w / aspetto };
  }

  document.fonts?.ready.then(richiedi);
  richiedi();

  return {
    // stato: id -> normale | scelta | attesa | sbagliata | spento | bersaglio | f0-f4 | r0-r4.
    // selezione: la zona il cui contorno lampeggia (scelta, o attesa della rivelazione).
    // macchia: { ritardo(id) ms, durata ms } colora le zone cambiate allargando la tinta dal loro
    // centro, con un ritardo per zona: e la rivelazione. Senza macchia cambiano subito.
    imposta({ stato, etichette: nuove = [], municipio = null, pins: nuoviPin = [], scegli = false, selezione = null, macchia: anima = null }) {
      statoZona = stato;
      sceglibile = scegli;
      scelta = selezione ? indiceZona[selezione] : -1;
      const t = ora();
      const veloce = MOTO_RIDOTTO.matches;
      for (let z = 0; z < N; z++) {
        const nuova = tintaDi(z);
        const vecchia = macchia[z] ? macchia[z].a : tinta[z];
        if (nuova === vecchia) continue;
        if (anima && !veloce && stato(dati.zone[z].id) !== 'normale') {
          const [cx, cy] = dati.zone[z].centro;
          macchia[z] = { da: vecchia, a: nuova, cx, cy, t0: t + (anima.ritardo?.(dati.zone[z].id) ?? 0), durata: anima.durata ?? 700 };
        } else {
          macchia[z] = null;
          tinta[z] = nuova;
        }
      }
      municipioAcceso = municipio === null ? -1 : dati.municipi.findIndex((m) => m.num === municipio);
      // Cartellini e sampietrini gia presenti non rientrano: si anima solo cio che e nuovo.
      const t0Di = (lista, chiave) => Object.fromEntries(lista.map((e) => [chiave(e), e.t0]));
      const chiaveE = (e) => `${e.id}:${!!e.inverso}:${e.colore || ''}`;
      const vecchieE = t0Di(etichette, chiaveE);
      etichette = nuove.map((e) => ({ ...e, t0: vecchieE[chiaveE(e)] ?? t + (veloce ? 0 : e.ritardo ?? 0) }));
      if (sopra >= 0 && sceglibile && sopra !== scelta) etichette.push({ id: dati.zone[sopra].id, sopra: true, t0: t });
      const vecchiP = t0Di(pins, (p) => p.id);
      pins = nuoviPin.map((p) => ({ ...p, t0: vecchiP[p.id] ?? (p.cade && !veloce ? t + (p.ritardo ?? 0) : t - 2000) }));
      canvas.style.cursor = sceglibile ? (sopra >= 0 ? 'pointer' : 'grab') : 'grab';
      richiedi();
    },
    // Senza argomenti: tutta la mappa. Con zone o municipio: inquadra quelli, volando se anima.
    inquadra(opzioni = {}, anima = false) {
      const a = vistaPer(opzioni);
      if (anima && !MOTO_RIDOTTO.matches) volo = { da: { ...vista }, a, t0: ora(), durata: opzioni.durata ?? 900 };
      else { volo = null; vista = a; }
      richiedi();
    },
    zoom(fattore) { zoomA(fattore, vista.x + vista.w / 2, vista.y + vista.h / 2); },
    // Dove cade sullo schermo il centro di una zona (coordinate client). Per animazioni e prove.
    centroSchermo(id) {
      const z = dati.zone[indiceZona[id]];
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / r.width;
      const { s, ox, oy } = scala();
      return [r.left + (ox + z.centro[0] * s) / dpr, r.top + (oy + z.centro[1] * s) / dpr];
    },
    disegna: richiedi,
  };
}
