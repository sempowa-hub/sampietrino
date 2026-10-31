// Effetti sonori di Sampietrino, sintetizzati al volo con Web Audio: niente file da scaricare.
// Onde quadre e triangolari, rumore filtrato per timbri e tonfi. Il silenzio si ricorda nel browser.
// L'audio parte solo dopo un gesto (DAJE!, un tocco): prima i browser lo bloccano.
// Sopra ai suoni sintetici c'e la voce di Themino: clip in audio/, tagliate da strumenti/taglia_vocali.py.

const CHIAVE = 'sampietrino:muto';
let ac = null;
let uscita = null;
let muto = (() => { try { return localStorage.getItem(CHIAVE) === '1'; } catch { return false; } })();
let ultimoTic = 0;

// Sblocca l'audio dentro un gesto vero (touchend, click, tasto): sui telefoni pointerdown non basta.
// Su iPhone (anche Chrome usa il motore di Safari) l'audio del gioco tace col telefono in silenzioso:
// si chiede la sessione "playback", come un video, e si suona un attimo di silenzio con <audio> e Web Audio.
// Torna una promessa che si risolve quando l'audio e partito davvero.
const SILENZIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
export function sblocca() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return Promise.resolve();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* non c'e: pazienza */ }
    ac = new Ctx();
    uscita = ac.createGain();
    uscita.gain.value = 0.9;
    uscita.connect(ac.destination);
    caricaVoci();
  }
  try {
    const muto = new Audio(SILENZIO);
    muto.setAttribute('playsinline', '');
    muto.play().catch(() => {});
    const b = ac.createBuffer(1, 1, 22050);
    const s = ac.createBufferSource();
    s.buffer = b; s.connect(ac.destination); s.start(0);
  } catch { /* niente */ }
  return ac.state === 'running' ? Promise.resolve() : ac.resume().catch(() => {});
}

// Voci di Themino: si scaricano tutte al primo gesto (sono poche centinaia di KB) e si decodificano.
const voci = {};
const ultimaVoce = {};
async function caricaVoci() {
  try {
    const conteggi = await (await fetch('audio/voci.json')).json();
    await Promise.all(Object.entries(conteggi).flatMap(([nome, n]) => Array.from({ length: n }, async (_, i) => {
      const buf = await (await fetch(`audio/${nome}-${i + 1}.mp3`)).arrayBuffer();
      (voci[nome] ||= [])[i] = await ac.decodeAudioData(buf);
    })));
  } catch { /* senza voci restano i suoni sintetici */ }
}

// Una variante a caso, mai la stessa due volte di fila. Torna false se la voce non c'e (ancora).
export function voce(nome, dopo = 0) {
  const lista = (voci[nome] || []).filter(Boolean);
  if (!pronto() || !lista.length) return false;
  let i = Math.floor(Math.random() * lista.length);
  if (lista.length > 1 && i === ultimaVoce[nome]) i = (i + 1) % lista.length;
  ultimaVoce[nome] = i;
  const s = ac.createBufferSource();
  s.buffer = lista[i];
  const g = ac.createGain();
  g.gain.value = 1.1;
  s.connect(g).connect(uscita);
  s.start(ac.currentTime + dopo);
  return true;
}

export const eMuto = () => muto;
export const audioAttivo = () => !!ac && ac.state === 'running';
export function cambiaMuto() {
  muto = !muto;
  try { localStorage.setItem(CHIAVE, muto ? '1' : '0'); } catch { /* resta per questa sessione */ }
  return muto;
}

const pronto = () => ac && !muto && ac.state === 'running';

// Una nota: frequenza (o glissando da..a), durata in secondi, forma d'onda, volume, ritardo.
function nota(freq, durata, { onda = 'square', vol = 0.06, a = freq, dopo = 0, attacco = 0.004 } = {}) {
  if (!pronto()) return;
  const t = ac.currentTime + dopo;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = onda;
  o.frequency.setValueAtTime(freq, t);
  if (a !== freq) o.frequency.exponentialRampToValueAtTime(a, t + durata);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attacco);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
  o.connect(g).connect(uscita);
  o.start(t);
  o.stop(t + durata + 0.02);
}

// Rumore filtrato: tonfi, fruscii, timbri.
function rumore(durata, { vol = 0.2, filtro = 'lowpass', freq = 800, a = freq, dopo = 0, q = 0.8 } = {}) {
  if (!pronto()) return;
  const t = ac.currentTime + dopo;
  const n = Math.ceil(ac.sampleRate * durata);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const dati = buf.getChannelData(0);
  for (let i = 0; i < n; i++) dati[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource();
  s.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = filtro;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (a !== freq) f.frequency.exponentialRampToValueAtTime(a, t + durata);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
  s.connect(f).connect(g).connect(uscita);
  s.start(t);
}

// Do maggiore, due ottave: le note delle fanfare.
const DO = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5, 1318.5, 1568, 2093];

export const suoni = {
  daje() {
    if (voce('daje')) return;
    [0, 4, 7].forEach((k, i) => nota(DO[k], 0.14, { dopo: i * 0.09, vol: 0.05 })); nota(DO[7], 0.3, { dopo: 0.27, vol: 0.05 });
  },
  // Passaggio del mouse: un ticchettio appena percettibile, non piu di uno ogni 60 ms.
  sopra() {
    if (!pronto() || ac.currentTime - ultimoTic < 0.06) return;
    ultimoTic = ac.currentTime;
    nota(1900, 0.025, { onda: 'triangle', vol: 0.012 });
  },
  scegli() { nota(660, 0.05, { vol: 0.04 }); nota(990, 0.07, { dopo: 0.05, vol: 0.04 }); },
  annulla() { nota(700, 0.06, { vol: 0.03, a: 420 }); },
  // Il timbro sul biglietto: tonfo sordo e un colpo secco di carta.
  timbro() {
    rumore(0.14, { vol: 0.55, freq: 420 });
    nota(110, 0.16, { onda: 'sine', a: 48, vol: 0.25 });
    rumore(0.05, { vol: 0.18, filtro: 'highpass', freq: 2500, dopo: 0.01 });
  },
  // Suspense mentre la camera vola: tic sempre piu fitti e piu acuti.
  attesa(durata = 1.3) {
    if (!pronto()) return;
    let t = 0;
    while (t < durata) {
      const p = t / durata;
      nota(420 + p * 520, 0.035, { dopo: t, vol: 0.022 + p * 0.02, onda: 'square' });
      t += 0.2 - p * 0.15;
    }
  },
  // Il sampietrino che cade, poi tocca terra.
  caduta() { rumore(0.4, { vol: 0.08, filtro: 'bandpass', freq: 2400, a: 380, q: 2 }); },
  tocco() { rumore(0.09, { vol: 0.5, freq: 260 }); nota(150, 0.12, { onda: 'triangle', a: 60, vol: 0.2 }); },
  // La rivelazione: piu la fascia e rara, piu la fanfara e lunga. Buca: un pernacchio a 8 bit.
  // Poi la voce di Themino che dice la fascia (o "buca"); con la voce la fanfara si abbassa.
  rivela(livello) {
    const parla = voce(livello === null || livello === undefined ? 'buca' : ['cartolina', 'ce-sta', 'romano', 'chicca', 'da-mino'][livello], 0.12);
    if (parla && uscita) { uscita.gain.setValueAtTime(0.45, ac.currentTime); uscita.gain.setValueAtTime(0.9, ac.currentTime + 0.7); }
    if (livello === null || livello === undefined) {
      nota(196, 0.18, { onda: 'sawtooth', a: 174, vol: 0.06 });
      nota(147, 0.4, { onda: 'sawtooth', a: 110, vol: 0.06, dopo: 0.17 });
      return;
    }
    const scale = [[0], [0, 2], [0, 2, 4], [0, 2, 4, 7], [0, 2, 4, 7, 9]][livello];
    scale.forEach((k, i) => nota(DO[k], 0.12, { dopo: i * 0.075, vol: 0.055 }));
    const fine = scale.length * 0.075;
    nota(DO[scale.at(-1)], 0.32 + livello * 0.08, { dopo: fine, vol: 0.05, onda: 'triangle' });
    if (livello >= 3) [8, 9, 10].forEach((k, i) => nota(DO[k], 0.08, { dopo: fine + 0.12 + i * 0.06, vol: 0.025, onda: 'triangle' }));
  },
  // Un punto che si somma: tic brevissimo, al massimo uno ogni 40 ms.
  conta() {
    if (!pronto() || ac.currentTime - ultimoTic < 0.04) return;
    ultimoTic = ac.currentTime;
    nota(1250, 0.03, { vol: 0.025 });
  },
  // Gli ultimi dieci secondi.
  tic(resto) { nota(resto <= 3 ? 1000 : 820, 0.05, { vol: 0.035 }); },
  scaduto() { nota(330, 0.5, { onda: 'sawtooth', a: 165, vol: 0.06 }); voce('capolinea', 0.25); },
  pagina() { rumore(0.12, { vol: 0.12, filtro: 'highpass', freq: 1800, a: 4000 }); },
  // Diario: ogni zona che si accende e una nota, piu acuta piu la fascia e rara.
  cascata(livello, dopo) { nota(DO[[0, 2, 4, 7, 9][livello]], 0.09, { dopo, vol: 0.02 + livello * 0.006, onda: 'triangle' }); },
  // Pacchetto del souvenir: carta che si strappa, poi un arpeggio che sale.
  carta() { rumore(0.22, { vol: 0.16, filtro: 'bandpass', freq: 3000, a: 1400, q: 0.7 }); },
  souvenir() { [0, 2, 4, 7, 9].forEach((i, k) => nota(DO[i] * 2, 0.12, { dopo: k * 0.07, vol: 0.035, onda: 'triangle' })); },
  copia() { nota(880, 0.06, { vol: 0.04 }); nota(1320, 0.1, { dopo: 0.06, vol: 0.04 }); },
};
