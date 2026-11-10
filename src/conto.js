// Account e classifica, su Firebase (Auth + Firestore), caricato dal CDN solo dopo che il gioco e partito:
// se la rete o Firebase non rispondono, si gioca lo stesso con lo storico nel browser.
//
// Tutti entrano in anonimo, senza chiedere niente: cosi il punteggio di oggi conta per il "meglio del X%".
// Con Google l'account anonimo si collega (stesso uid): nickname, foto, classifica, partite su ogni dispositivo.
//
// Firestore:
//   giocatori/{uid}                  nome, foto, mostraFoto, storico (giorni, timbri, souvenir, visti, partite)
//   partite/{data}/punteggi/{uid}    tot, livelli, ora, pubblico, nome, foto: uno per giocatore al giorno
const CONFIG = {
  apiKey: 'AIzaSyAp1Pt1M2TQb6GkeVPJgW9TRUpeqwT2l9A',
  authDomain: 'sampietrino-roma.firebaseapp.com',
  projectId: 'sampietrino-roma',
  appId: '1:1021524777046:web:63166e00b3acc0beb303f7',
};
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';

let fb = null, pronto = null, io = null, profilo = null;
const ascoltatori = new Set();

async function carica() {
  const [a, au, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = a.initializeApp(CONFIG);
  return { au, fs, auth: au.getAuth(app), db: fs.getFirestore(app) };
}

// Nome e foto di Google: collegando un account anonimo restano nei dati del provider, non sull'utente.
const google = (u) => u?.providerData?.find((p) => p.providerId === 'google.com') || {};
const fotoGoogle = (u) => u?.photoURL || google(u).photoURL || '';
const nomeGoogle = (u) => u?.displayName || google(u).displayName || '';

// Chi sta giocando: null finche Firebase non risponde.
export const utente = () => (io ? {
  uid: io.uid, anonimo: io.isAnonymous,
  nome: profilo?.nome || '', foto: profilo?.mostraFoto !== false ? (profilo?.foto || fotoGoogle(io)) : '', fotoGoogle: fotoGoogle(io),
  mostraFoto: profilo?.mostraFoto !== false,
} : null);
export const quandoCambia = (fn) => { ascoltatori.add(fn); return () => ascoltatori.delete(fn); };
const avvisa = () => ascoltatori.forEach((fn) => fn(utente()));

// Avvio: carica Firebase, aspetta l'utente (entra in anonimo se nessuno). Promessa unica, la si puo attendere ovunque.
export function avviaConto() {
  pronto ??= (async () => {
    fb = await carica();
    const { au, auth } = fb;
    await new Promise((fatto) => {
      au.onAuthStateChanged(auth, async (u) => {
        if (!u) {
          try { await au.signInAnonymously(auth); } catch { io = null; fatto(); }
          return;
        }
        io = u;
        profilo = u.isAnonymous ? null : await leggiProfilo(u.uid);
        // Profili nati senza nome o foto di Google (account anonimo collegato): si sistemano da soli.
        if (profilo && /^Romano\d{3}$/.test(profilo.nome || '') && nomeGoogle(u)) {
          await salvaProfilo({ nome: pulisciNome(nomeGoogle(u).split(' ')[0]) }).catch(() => {});
        } else if (profilo && !profilo.foto && fotoGoogle(u)) {
          await salvaProfilo({}).catch(() => {});
        }
        avvisa();
        fatto();
      });
    });
    return utente();
  })().catch((e) => { console.warn('Account non disponibile:', e?.code || e?.message); return null; });
  return pronto;
}

async function leggiProfilo(uid) {
  const { fs, db } = fb;
  try { return (await fs.getDoc(fs.doc(db, 'giocatori', uid))).data() || {}; } catch { return {}; }
}

// Entra con Google. Da anonimo si collega l'account (le partite restano); se quel Google ha gia un account
// (altro dispositivo), si entra in quello e lo storico del browser si fonde col suo.
export async function entraConGoogle() {
  await avviaConto();
  const { au, auth } = fb;
  const google = new au.GoogleAuthProvider();
  google.setCustomParameters({ prompt: 'select_account' });
  try {
    if (auth.currentUser?.isAnonymous) await au.linkWithPopup(auth.currentUser, google);
    else await au.signInWithPopup(auth, google);
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') {
      const cred = au.GoogleAuthProvider.credentialFromError(e);
      if (!cred) throw e;
      await au.signInWithCredential(auth, cred);
    } else throw e;
  }
  // Collegando un anonimo il token puo restare quello anonimo, e le regole della classifica vogliono Google: si rinnova.
  await auth.currentUser.getIdToken(true).catch(() => {});
  io = auth.currentUser;
  profilo = await leggiProfilo(io.uid);
  // Primo login: nickname proposto dal nome Google, la foto si mostra.
  // Primo login, o profilo nato senza nome Google (Romano123): nickname dal nome Google.
  if (!profilo.nome || (/^Romano\d{3}$/.test(profilo.nome) && nomeGoogle(io))) {
    const nome = pulisciNome(nomeGoogle(io).split(' ')[0]) || `Romano${Math.floor(Math.random() * 900 + 100)}`;
    await salvaProfilo({ nome, mostraFoto: true });
  } else if (!profilo.foto && fotoGoogle(io)) {
    await salvaProfilo({});
  }
  avvisa();
  return utente();
}

export async function esci() {
  await avviaConto();
  const { au, auth } = fb;
  profilo = null;
  await au.signOut(auth); // onAuthStateChanged rientra in anonimo da solo
}

export const pulisciNome = (n) => (n || '').normalize('NFC').replace(/[^\p{L}\p{N} ._'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
export const nomeValido = (n) => pulisciNome(n).length >= 3 && pulisciNome(n) === n.trim();

export async function salvaProfilo({ nome, mostraFoto }) {
  const { fs, db } = fb;
  const dati = { aggiornato: fs.serverTimestamp() };
  if (nome != null) dati.nome = pulisciNome(nome);
  if (mostraFoto != null) dati.mostraFoto = !!mostraFoto;
  dati.foto = fotoGoogle(io);
  await fs.setDoc(fs.doc(db, 'giocatori', io.uid), dati, { merge: true });
  profilo = { ...profilo, ...dati };
  avvisa();
}

// --- Storico sull'account ---

// Fonde due storici: per ogni giorno vince la partita finita (o quella piu avanti), i timbri tengono la fascia
// migliore, i souvenir si sommano.
export function fondi(a = {}, b = {}) {
  const giorni = { ...(a.giorni || {}) };
  for (const [d, g] of Object.entries(b.giorni || {})) {
    const x = giorni[d];
    const avanti = (y) => (y?.finita ? 10 : 0) + (y?.livelli || []).filter((l) => l !== null).length;
    // Recupero solo se lo e da entrambe le parti: giocata nel suo giorno su un dispositivo vale per la serie.
    const recupero = x ? !!(x.recupero && g.recupero) : !!g.recupero;
    giorni[d] = { ...(!x || avanti(g) > avanti(x) ? g : x) };
    if (recupero) giorni[d].recupero = true; else delete giorni[d].recupero;
  }
  const timbri = { ...(a.timbri || {}) };
  for (const [z, l] of Object.entries(b.timbri || {})) timbri[z] = Math.max(timbri[z] ?? -1, l);
  const souvenir = { ...(a.souvenir || {}) };
  for (const [id, s] of Object.entries(b.souvenir || {})) {
    const x = souvenir[id];
    souvenir[id] = x ? { data: x.data < s.data ? x.data : s.data, scartato: x.scartato || s.scartato } : s;
  }
  const visti = [...new Set([...(a.visti || []), ...(b.visti || [])])];
  const partite = { ...(b.partite || {}), ...(a.partite || {}) };
  return { giorni, timbri, souvenir, visti, partite };
}

// Porta lo storico del browser sull'account e quello dell'account nel browser. Solo per chi e entrato con Google.
export async function sincronizza(locale) {
  if (!io || io.isAnonymous) return null;
  const { fs, db } = fb;
  const rif = fs.doc(db, 'giocatori', io.uid);
  const remoto = (await fs.getDoc(rif)).data()?.storico || {};
  const unito = fondi(locale, remoto);
  await fs.setDoc(rif, { storico: unito, aggiornato: fs.serverTimestamp() }, { merge: true });
  return unito;
}

let attesaSalva = null;
export function salvaStorico(storico) {
  if (!io || io.isAnonymous) return;
  clearTimeout(attesaSalva);
  attesaSalva = setTimeout(() => {
    const { fs, db } = fb;
    fs.setDoc(fs.doc(db, 'giocatori', io.uid), { storico, aggiornato: fs.serverTimestamp() }, { merge: true }).catch(() => {});
  }, 1500);
}

// --- Classifica ---

// Scrittura in classifica rifiutata: un secondo tentativo col token rinnovato (dopo il collegamento a Google il
// token puo dire ancora "anonimo"). Se fallisce di nuovo, l'errore resta sul profilo per capire cosa e successo.
async function conRiprova(data, fn) {
  try { return await fn(); } catch (e) {
    if (e?.code !== 'permission-denied') throw e;
    await io.getIdToken(true).catch(() => {});
    try { return await fn(); } catch (e2) { await segnalaErrore(data, e2); throw e2; }
  }
}

async function segnalaErrore(data, e) {
  try {
    const { fs, db } = fb;
    const provider = (await io.getIdTokenResult().catch(() => null))?.signInProvider || '';
    await fs.setDoc(fs.doc(db, 'giocatori', io.uid), { erroreClassifica: { data, codice: String(e?.code || e?.message || e).slice(0, 80), provider, quando: fs.serverTimestamp() } }, { merge: true });
  } catch { /* senza rete non si registra niente */ }
}

// --- Contatore: quante partite si giocano davvero, anche da anonimi (la classifica vede solo chi entra con Google) ---
// contatori/{giorno in cui si gioca}: iniziate e finite (partita del giorno), arretrati (giorni passati finiti).
export async function conta(giornoDiGioco, campo) {
  try {
    const u = await avviaConto();
    if (!u) return;
    const { fs, db } = fb;
    await fs.setDoc(fs.doc(db, 'contatori', giornoDiGioco), { [campo]: fs.increment(1) }, { merge: true });
  } catch { /* un conteggio perso non ferma il gioco */ }
}

// Cosa cambiare nel punteggio del giorno gia pubblicato, o null se e gia giusto. Solo verso l'alto: chi ha gia
// giocato prende i punti delle zone aggiunte, ma non perde quelli che aveva se le fasce vengono ridistribuite.
export function correzioneGiorno(pubblicato, { tot, livelli }) {
  const uguali = pubblicato?.tot === tot && JSON.stringify(pubblicato?.livelli) === JSON.stringify(livelli);
  return uguali || tot < (pubblicato?.tot ?? 0) ? null : { tot, livelli };
}

// Cosa cambiare nella settimana se il giorno c'e gia con un totale diverso, o null. "corretto" dice alle regole
// quale giorno si sta correggendo: devono controllare che valga quanto il punteggio del giorno.
export function correzioneSettimana(v, data, tot) {
  const vecchio = v?.giorni?.[data];
  if (vecchio === undefined || vecchio === tot || tot < vecchio) return null; // mai in giu, come il giorno
  return { giorni: { ...v.giorni, [data]: tot }, tot: v.tot - vecchio + tot, corretto: data };
}

const colPunteggi = (data) => fb.fs.collection(fb.db, 'partite', data, 'punteggi');

// Il punteggio di oggi: si crea una volta, poi cambia solo se le domande vengono corrette. Se poi entri con Google, al punteggio si aggiungono nome e foto.
// In classifica va solo chi e entrato con Google: gli anonimi non pubblicano niente (lo fanno quando entrano).
export async function pubblicaPunteggio(data, { tot, livelli }) {
  const u = await avviaConto();
  if (!u || u.anonimo) return false;
  const { fs } = fb;
  const rif = fs.doc(colPunteggi(data), io.uid);
  const prima = await fs.getDoc(rif);
  if (prima.exists()) {
    // Domande corrette a giornata in corso: il totale ricalcolato sul telefono prende il posto di quello vecchio.
    const nuovo = correzioneGiorno(prima.data(), { tot, livelli });
    if (nuovo) await conRiprova(data, () => fs.updateDoc(rif, nuovo));
    await aggiornaNomeInClassifica(data);
    return true;
  }
  const me = utente();
  await conRiprova(data, () => fs.setDoc(rif, { tot, livelli, ora: fs.serverTimestamp(), pubblico: !!me.nome, nome: me.nome || '', foto: me.foto || '' }));
  return true;
}

export async function aggiornaNomeInClassifica(data) {
  const me = utente();
  if (!me || me.anonimo || !me.nome) return false;
  const { fs } = fb;
  let fatto = false;
  for (const rif of [fs.doc(colPunteggi(data), io.uid), fs.doc(colSettimana(settimanaDi(data)), io.uid)]) {
    try {
      if (!(await fs.getDoc(rif)).exists()) continue;
      await fs.updateDoc(rif, { pubblico: true, nome: me.nome, foto: me.foto });
      fatto = true;
    } catch { /* la prossima volta */ }
  }
  return fatto;
}

// --- Settimana: da lunedi a domenica, somma dei punteggi del giorno ---

// Lunedi della settimana di una data (AAAA-MM-GG).
export function settimanaDi(data) {
  const t = Date.parse(`${data}T12:00:00Z`);
  const dal = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dal * 864e5).toISOString().slice(0, 10);
}
const colSettimana = (lunedi) => fb.fs.collection(fb.db, 'settimane', lunedi, 'punteggi');

// Aggiunge il punteggio di un giorno alla settimana, una volta sola (le regole controllano che sia quello vero).
// Se il giorno c'e gia con un totale diverso (domande corrette), lo corregge.
export async function pubblicaSettimana(data, tot) {
  const u = await avviaConto();
  if (!u || u.anonimo) return false;
  const { fs } = fb;
  const rif = fs.doc(colSettimana(settimanaDi(data)), io.uid);
  const me = utente();
  const chi = { pubblico: !me.anonimo && !!me.nome, nome: me.anonimo ? '' : me.nome, foto: me.anonimo ? '' : me.foto };
  const prima = await fs.getDoc(rif);
  if (!prima.exists()) {
    await conRiprova(data, () => fs.setDoc(rif, { giorni: { [data]: tot }, tot, n: 1, ultimo: data, ora: fs.serverTimestamp(), ...chi }));
    return true;
  }
  const v = prima.data();
  if (data in (v.giorni || {})) {
    const c = correzioneSettimana(v, data, tot);
    if (c) await conRiprova(data, () => fs.updateDoc(rif, new fs.FieldPath('giorni', data), tot, 'tot', c.tot, 'corretto', data));
    return true;
  }
  await conRiprova(data, () => fs.updateDoc(rif, new fs.FieldPath('giorni', data), tot, 'tot', v.tot + tot, 'n', v.n + 1, 'ultimo', data,
    'ora', fs.serverTimestamp(), 'pubblico', chi.pubblico, 'nome', chi.nome, 'foto', chi.foto));
  return true;
}

// Primi n della settimana, la tua riga e quanti hanno giocato.
export async function classificaSettimana(data, n = 50) {
  const u = await avviaConto();
  if (!u) return null;
  const { fs } = fb;
  const col = colSettimana(settimanaDi(data));
  const [primi, mio, tutti] = await Promise.all([
    fs.getDocs(fs.query(col, fs.where('pubblico', '==', true), fs.orderBy('tot', 'desc'), fs.orderBy('ora', 'asc'), fs.limit(n))),
    fs.getDoc(fs.doc(col, io.uid)),
    fs.getCountFromServer(col),
  ]);
  let posizione = null;
  if (mio.exists()) posizione = (await fs.getCountFromServer(fs.query(col, fs.where('tot', '>', mio.data().tot)))).data().count + 1;
  return { lunedi: settimanaDi(data), righe: primi.docs.map((d) => ({ uid: d.id, ...d.data() })), mio: mio.exists() ? { uid: io.uid, ...mio.data() } : null, posizione, totale: tutti.data().count };
}

// Primi n della classifica pubblica del giorno, piu la tua riga e quanti hanno giocato.
export async function classifica(data, n = 50) {
  const u = await avviaConto();
  if (!u) return null;
  const { fs } = fb;
  const col = colPunteggi(data);
  const [primi, mio, tutti] = await Promise.all([
    fs.getDocs(fs.query(col, fs.where('pubblico', '==', true), fs.orderBy('tot', 'desc'), fs.orderBy('ora', 'asc'), fs.limit(n))),
    fs.getDoc(fs.doc(col, io.uid)),
    fs.getCountFromServer(col),
  ]);
  const righe = primi.docs.map((d) => ({ uid: d.id, ...d.data() }));
  let posizione = null, meglio = null;
  if (mio.exists()) {
    const m = mio.data();
    const [sopra, sotto] = await Promise.all([
      fs.getCountFromServer(fs.query(col, fs.where('tot', '>', m.tot))),
      fs.getCountFromServer(fs.query(col, fs.where('tot', '<', m.tot))),
    ]);
    posizione = sopra.data().count + 1;
    meglio = { sotto: sotto.data().count };
  }
  const totale = tutti.data().count;
  return { righe, mio: mio.exists() ? { uid: io.uid, ...mio.data() } : null, posizione, totale, percento: meglio && totale > 1 ? Math.round((meglio.sotto / (totale - 1)) * 100) : null };
}

// --- Chicche proposte dai follower ---

// Amministratore (Simone, Themino): ha un documento admin/{uid}, creato a mano dalla console.
export async function sonoAdmin() {
  const u = await avviaConto();
  if (!u || u.anonimo) return false;
  try { return (await fb.fs.getDoc(fb.fs.doc(fb.db, 'admin', io.uid))).exists(); } catch { return false; }
}

export async function proponi({ luogo, zona, perche, domanda }) {
  const u = await avviaConto();
  if (!u || u.anonimo) throw new Error('serve il login');
  const { fs, db } = fb;
  await fs.addDoc(fs.collection(db, 'proposte'), {
    uid: io.uid, nome: utente().nome || 'Anonimo', luogo: luogo.trim(), zona, perche: perche.trim(), domanda: (domanda || '').trim(),
    quando: fs.serverTimestamp(), stato: 'nuova',
  });
}

export async function mieProposte() {
  const u = await avviaConto();
  if (!u || u.anonimo) return [];
  const { fs, db } = fb;
  const q = fs.query(fs.collection(db, 'proposte'), fs.where('uid', '==', io.uid), fs.orderBy('quando', 'desc'), fs.limit(30));
  return (await fs.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function proposteDaDecidere(stato = 'nuova') {
  const { fs, db } = fb;
  const q = fs.query(fs.collection(db, 'proposte'), fs.where('stato', '==', stato), fs.orderBy('quando', 'desc'), fs.limit(100));
  return (await fs.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function decidiProposta(id, stato, nota = '') {
  const { fs, db } = fb;
  await fs.updateDoc(fs.doc(db, 'proposte', id), { stato, nota: nota.slice(0, 300), decisa: fs.serverTimestamp() });
}
