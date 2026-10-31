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

// Chi sta giocando: null finche Firebase non risponde.
export const utente = () => (io ? {
  uid: io.uid, anonimo: io.isAnonymous,
  nome: profilo?.nome || '', foto: profilo?.mostraFoto !== false ? (profilo?.foto || io.photoURL || '') : '', fotoGoogle: io.photoURL || '',
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
  io = auth.currentUser;
  profilo = await leggiProfilo(io.uid);
  // Primo login: nickname proposto dal nome Google, la foto si mostra.
  if (!profilo.nome) {
    const nome = pulisciNome((io.displayName || '').split(' ')[0]) || `Romano${Math.floor(Math.random() * 900 + 100)}`;
    await salvaProfilo({ nome, mostraFoto: true });
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
  dati.foto = io.photoURL || '';
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

const colPunteggi = (data) => fb.fs.collection(fb.db, 'partite', data, 'punteggi');

// Il punteggio di oggi, una volta sola. Se poi entri con Google, al punteggio si aggiungono nome e foto.
export async function pubblicaPunteggio(data, { tot, livelli }) {
  const u = await avviaConto();
  if (!u) return false;
  const { fs } = fb;
  const rif = fs.doc(colPunteggi(data), io.uid);
  const esiste = (await fs.getDoc(rif)).exists();
  if (esiste) { await aggiornaNomeInClassifica(data); return true; }
  const me = utente();
  await fs.setDoc(rif, {
    tot, livelli, ora: fs.serverTimestamp(),
    pubblico: !me.anonimo && !!me.nome, nome: me.anonimo ? '' : me.nome, foto: me.anonimo ? '' : me.foto,
  });
  return true;
}

export async function aggiornaNomeInClassifica(data) {
  const me = utente();
  if (!me || me.anonimo || !me.nome) return false;
  const { fs } = fb;
  const rif = fs.doc(colPunteggi(data), io.uid);
  try {
    if (!(await fs.getDoc(rif)).exists()) return false;
    await fs.updateDoc(rif, { pubblico: true, nome: me.nome, foto: me.foto });
    return true;
  } catch { return false; }
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
