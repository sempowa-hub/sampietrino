// Mappa di Roma in pixel art: ogni zona diventa un prato, i confini stradine,
// i confini dei municipi strade grandi, fuori dal Comune il mare con la spiaggia.
// Una cella della griglia = CELLA km. Alberi e casette sono decisi da un hash
// della cella: la stessa mappa per tutti, a ogni apertura.

const CELLA = 0.08;

const COLORI = {
  mare: [31, 78, 140], mareProfondo: [24, 63, 117], mareChiaro: [61, 127, 196], luccichio: [150, 196, 235],
  sabbia: [232, 212, 154],
  campagna: [125, 143, 69], campagnaRiga: [110, 127, 60],
  strada: [205, 182, 139], stradaGrande: [170, 146, 104], stradaAccesa: [255, 210, 63],
  albero: [47, 107, 42], alberoLuce: [70, 140, 56],
  tetto: [226, 104, 60], tettoOmbra: [185, 71, 42], muro: [243, 234, 216],
  fiore: [242, 228, 107],
};

// Prato per stato della zona: [base, macchia].
const PRATI = {
  normale: [[99, 165, 66], [113, 180, 76]],
  scelta: [[255, 206, 63], [255, 226, 120]],
  giusta: [[143, 209, 106], [163, 221, 127]],
  sbagliata: [[216, 80, 63], [228, 110, 92]],
  soluzione: [[236, 176, 74], [245, 196, 110]],
  bersaglio: [[138, 143, 153], [158, 163, 172]],
};

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Disegna una serie di forme su una griglia e legge chi occupa ogni cella.
// Colore = indice+1 nel canale rosso, 255 nel blu come firma: i bordi sfumati non hanno la firma.
function rasterizza(forme, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(1 / CELLA, 0, 0, 1 / CELLA, 0, 0);
  forme.forEach((d, i) => {
    ctx.fillStyle = `rgb(${i + 1},0,255)`;
    ctx.fill(new Path2D(d), 'evenodd');
  });
  const px = ctx.getImageData(0, 0, W, H).data;
  const griglia = new Int16Array(W * H).fill(-1);
  for (let k = 0; k < W * H; k++) {
    const r = px[k * 4], g = px[k * 4 + 1], b = px[k * 4 + 2];
    if (b === 255 && g === 0 && r > 0 && r <= forme.length) griglia[k] = r - 1;
  }
  return griglia;
}

export function creaMappa(canvas, dati, { onTocca }) {
  const [LW, LH] = dati.dimensioni;
  const W = Math.ceil(LW / CELLA), H = Math.ceil(LH / CELLA);
  const zona = rasterizza(dati.zone.map((z) => z.d), W, H);
  const mun = rasterizza(dati.municipi.map((m) => m.d), W, H);
  const terra = rasterizza([dati.comune], W, H).map((v) => (v === 0 ? 1 : 0));
  const idx = (x, y) => y * W + x;
  const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // Strade: una cella e strada se un vicino ha un'altra zona. Grande se cambia municipio.
  const strada = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = idx(x, y);
      if (!terra[k]) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!dentro(nx, ny)) continue;
        const j = idx(nx, ny);
        if (!terra[j]) continue;
        if (mun[j] !== mun[k] && mun[j] >= 0 && mun[k] >= 0) strada[k] = 2;
        else if (zona[j] !== zona[k] && strada[k] < 2) strada[k] = 1;
      }
    }
  }

  // Distanza dalla terra per l'acqua (spiaggia, acqua bassa, mare aperto), fino a 3 celle.
  const riva = new Uint8Array(W * H).fill(9);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (terra[idx(x, y)]) continue;
      let d = 9;
      for (let dy = -3; dy <= 3 && d > 1; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx, ny = y + dy;
          if (dentro(nx, ny) && terra[idx(nx, ny)]) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
        }
      }
      riva[idx(x, y)] = d;
    }
  }

  // Alberi e casette: solo su prato pieno, lontano dalle strade.
  const decoro = new Uint8Array(W * H); // 1 albero, 2 luce albero, 3 tetto, 4 tetto ombra, 5 muro
  const libero = (x, y, z) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!dentro(nx, ny)) return false;
      const j = idx(nx, ny);
      if (zona[j] !== z || strada[j] || decoro[j]) return false;
    }
    return true;
  };
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const z = zona[idx(x, y)];
      if (z < 0) continue;
      const h = hash(x, y) % 1000;
      if (h < 9 && libero(x, y, z)) {
        for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) decoro[idx(x + dx, y + dy)] = 1;
        decoro[idx(x, y - 1)] = 2; decoro[idx(x - 1, y)] = 2;
      } else if (h >= 9 && h < 14 && libero(x, y, z)) {
        decoro[idx(x - 1, y - 1)] = 3; decoro[idx(x, y - 1)] = 3; decoro[idx(x + 1, y - 1)] = 3;
        decoro[idx(x - 1, y)] = 4; decoro[idx(x, y)] = 4; decoro[idx(x + 1, y)] = 4;
        decoro[idx(x - 1, y + 1)] = 5; decoro[idx(x, y + 1)] = 5; decoro[idx(x + 1, y + 1)] = 5;
      }
    }
  }

  // Riquadri in km di zone e municipi, per inquadrare le soluzioni.
  const riquadro = (griglia, n) => {
    const r = Array.from({ length: n }, () => [Infinity, Infinity, -Infinity, -Infinity]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = griglia[idx(x, y)];
      if (v < 0) continue;
      const b = r[v];
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x + 1); b[3] = Math.max(b[3], y + 1);
    }
    return r.map((b) => b.map((v) => v * CELLA));
  };
  const riqZone = riquadro(zona, dati.zone.length);
  const riqMun = riquadro(mun, dati.municipi.length);
  const indiceZona = Object.fromEntries(dati.zone.map((z, i) => [z.id, i]));

  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const bctx = base.getContext('2d');
  const immagine = bctx.createImageData(W, H);
  const ctx = canvas.getContext('2d');

  let vista = { x: 0, y: 0, w: LW, h: LH };
  let statoZona = () => 'normale';
  let etichette = [];
  let municipioAcceso = null;

  function dipingiBase() {
    const px = immagine.data;
    const statoPerIndice = dati.zone.map((z) => PRATI[statoZona(z.id)] || PRATI.normale);
    const accesoIdx = municipioAcceso === null ? -1 : dati.municipi.findIndex((m) => m.num === municipioAcceso);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = idx(x, y);
        const h = hash(x, y);
        let c;
        if (!terra[k]) {
          const d = riva[k];
          c = d === 1 ? COLORI.sabbia : d === 2 ? COLORI.mareChiaro : d === 3 ? COLORI.mare
            : (h % 97 === 0 ? COLORI.luccichio : ((x >> 2) + (y >> 3)) % 7 === 0 ? COLORI.mare : COLORI.mareProfondo);
        } else if (strada[k] === 2) {
          c = accesoIdx >= 0 && mun[k] === accesoIdx ? COLORI.stradaAccesa : COLORI.stradaGrande;
        } else if (strada[k] === 1) {
          c = COLORI.strada;
        } else if (zona[k] < 0) {
          c = (x + y) % 6 === 0 ? COLORI.campagnaRiga : COLORI.campagna;
        } else if (decoro[k]) {
          c = [null, COLORI.albero, COLORI.alberoLuce, COLORI.tetto, COLORI.tettoOmbra, COLORI.muro][decoro[k]];
        } else {
          const [pieno, macchia] = statoPerIndice[zona[k]];
          c = h % 1000 < 4 ? COLORI.fiore : h % 11 === 0 ? macchia : pieno;
        }
        px[k * 4] = c[0]; px[k * 4 + 1] = c[1]; px[k * 4 + 2] = c[2]; px[k * 4 + 3] = 255;
      }
    }
    bctx.putImageData(immagine, 0, 0);
  }

  function scala() {
    const s = Math.min(canvas.width / vista.w, canvas.height / vista.h);
    return { s, ox: (canvas.width - vista.w * s) / 2 - vista.x * s, oy: (canvas.height - vista.h * s) / 2 - vista.y * s };
  }

  function disegna() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = `rgb(${COLORI.mareProfondo})`;
    ctx.fillRect(0, 0, cw, ch);
    const { s, ox, oy } = scala();
    ctx.drawImage(base, Math.round(ox), Math.round(oy), Math.round(W * CELLA * s), Math.round(H * CELLA * s));

    // Cartelli: riquadro nero, testo bianco pixel. Il bersaglio al contrario.
    const fs = Math.round(17 * dpr);
    ctx.font = `${fs}px 'Jersey 10', monospace`;
    ctx.textBaseline = 'middle';
    const messi = [];
    for (const { id, inverso } of etichette) {
      const z = dati.zone[indiceZona[id]];
      if (!z) continue;
      const tx = ox + z.centro[0] * s, ty = oy + z.centro[1] * s;
      const testo = z.nome.toUpperCase();
      const w = ctx.measureText(testo).width + 12 * dpr, h = fs + 8 * dpr;
      const box = [Math.round(tx - w / 2), Math.round(ty - h / 2), Math.round(w), Math.round(h)];
      if (messi.some((b) => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) continue;
      messi.push(box);
      ctx.fillStyle = inverso ? '#ffffff' : '#000000';
      ctx.fillRect(...box);
      ctx.fillStyle = inverso ? '#000000' : '#ffffff';
      ctx.fillText(testo, box[0] + 6 * dpr, box[1] + h / 2 + dpr);
    }
  }

  function zonaInPunto(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    const { s, ox, oy } = scala();
    const kx = ((clientX - r.left) * dpr - ox) / s, ky = ((clientY - r.top) * dpr - oy) / s;
    const cx = Math.floor(kx / CELLA), cy = Math.floor(ky / CELLA);
    if (!dentro(cx, cy)) return null;
    // Su una stradina vince la zona piu presente intorno.
    const conta = {};
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dentro(cx + dx, cy + dy)) continue;
      const v = zona[idx(cx + dx, cy + dy)];
      if (v >= 0) conta[v] = (conta[v] || 0) + (dx === 0 && dy === 0 ? 3 : 1);
    }
    const migliore = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
    return migliore ? dati.zone[Number(migliore[0])].id : null;
  }

  function kmInPunto(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    const { s, ox, oy } = scala();
    return [((clientX - r.left) * dpr - ox) / s, ((clientY - r.top) * dpr - oy) / s, dpr / s];
  }

  function zoomA(fattore, cx, cy) {
    const nw = Math.min(LW * 1.05, Math.max(1.5, vista.w * fattore));
    const k = nw / vista.w;
    vista = { x: cx - (cx - vista.x) * k, y: cy - (cy - vista.y) * k, w: nw, h: vista.h * k };
    disegna();
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
    if (!t) return;
    if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 6) mosso = true;
    if (tocchi.size === 1 && mosso) {
      const [, , kmPx] = kmInPunto(e.clientX, e.clientY);
      vista.x -= (e.clientX - t.x) * kmPx;
      vista.y -= (e.clientY - t.y) * kmPx;
      disegna();
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
      const id = zonaInPunto(e.clientX, e.clientY);
      if (id) onTocca(id);
    }
  });
  canvas.addEventListener('pointercancel', (e) => tocchi.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [cx, cy] = kmInPunto(e.clientX, e.clientY);
    zoomA(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy);
  }, { passive: false });

  dipingiBase();
  document.fonts?.ready.then(disegna);

  return {
    // stato: funzione id -> normale | scelta | giusta | sbagliata | soluzione | bersaglio
    imposta(nuovo) {
      statoZona = nuovo.stato;
      etichette = nuovo.etichette || [];
      municipioAcceso = nuovo.municipio ?? null;
      dipingiBase();
      disegna();
    },
    // Senza argomenti: tutta la mappa. Con zone o municipio: inquadra quelli.
    inquadra({ zone = [], municipio = null } = {}) {
      const riq = [...zone.map((id) => riqZone[indiceZona[id]]), ...(municipio ? [riqMun[dati.municipi.findIndex((m) => m.num === municipio)]] : [])].filter(Boolean);
      const r = canvas.getBoundingClientRect();
      const aspetto = r.width / r.height || LW / LH;
      if (!riq.length) {
        const w = Math.max(LW, LH * aspetto);
        vista = { x: LW / 2 - w / 2, y: LH / 2 - w / aspetto / 2, w, h: w / aspetto };
      } else {
        const x0 = Math.min(...riq.map((b) => b[0])), y0 = Math.min(...riq.map((b) => b[1]));
        const x1 = Math.max(...riq.map((b) => b[2])), y1 = Math.max(...riq.map((b) => b[3]));
        const margine = municipio ? 1.25 : 3;
        const w = Math.min(LW, Math.max(5, (x1 - x0) * margine, (y1 - y0) * margine * aspetto));
        vista = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w / aspetto / 2, w, h: w / aspetto };
      }
      disegna();
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
    disegna,
  };
}
