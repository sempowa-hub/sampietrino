// Il taccuino di bordo: la scrivania con diario di bordo (calendario, archivio degli ultimi 7 giorni,
// statistiche), passaporto dei quartieri sfogliato per municipio, scatola dei souvenir e il pacchetto da scartare.
// Tutto dallo storico nel browser (src/storico.js), senza login.
import { SCALA } from './motore.js';
import { pixel } from './pixel.js';
import { disegnaMiniMappa } from './minimappa.js';
import { SOUVENIR, GRUPPI } from './souvenir.js';
import { leggi, scrivi, serie, serieMigliore, contesto, partita, giocabile, sposta, oggi, dataIt, GRADI, gradoDi, GIORNI_INDIETRO, PRIMO_GIORNO } from './storico.js';
import { avviaConto, utente, quandoCambia, entraConGoogle, esci, salvaProfilo, pulisciNome, nomeValido, classifica, classificaSettimana, settimanaDi } from './conto.js';

const $ = (id) => document.getElementById(id);
const ROMANI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
const MUNICIPI = {
  1: 'Centro Storico', 2: 'Parioli, Nomentano', 3: 'Monte Sacro', 4: 'Tiburtino', 5: 'Prenestino, Centocelle',
  6: 'Roma delle Torri', 7: 'Appio-Latino, Tuscolano, Cinecittà', 8: 'Appia Antica', 9: 'EUR', 10: 'Ostia, Acilia',
  11: 'Arvalia, Portuense', 12: 'Monteverde', 13: 'Aurelio', 14: 'Monte Mario', 15: 'Cassia, Flaminia',
};
const ROSSO = '#c43a28';
const el = (tag, classe, testo) => { const e = document.createElement(tag); if (classe) e.className = classe; if (testo != null) e.textContent = testo; return e; };
const plurale = (n, uno, tanti) => `${n} ${n === 1 ? uno : tanti}`;

export function creaTaccuino({ dati, colori, suoni, gioca, regole, giorno, dopoLogin }) {
  const zonePerId = Object.fromEntries(dati.zone.map((z) => [z.id, z]));
  const coloreGrado = (g) => (g.livello < 0 ? ROSSO : colori[g.livello]);
  const coloreLiv = (l) => (l == null || l < 0 ? ROSSO : colori[l]);
  let daTaccuino = false;

  // Le icone a pixel dichiarate nell'HTML con data-icona.
  for (const e of document.querySelectorAll('[data-icona]')) e.innerHTML = pixel(e.dataset.icona);

  // --- Navigazione tra i fogli del taccuino ---

  const FOGLI = ['taccuino', 'diario-bordo', 'passaporto', 'souvenir', 'account', 'classifica'];
  const PREPARA = { taccuino: preparaTaccuino, 'diario-bordo': preparaDiario, passaporto: preparaPassaporto, souvenir: preparaSouvenir, account: preparaAccount, classifica: preparaClassifica };
  function apri(id, { da = false } = {}) {
    if (id === 'regole') { chiudiTutti(); regole(); return; }
    daTaccuino = da;
    chiudiTutti(id);
    PREPARA[id]?.();
    for (const b of $(id).querySelectorAll('[data-indietro]')) b.hidden = !da;
    suoni.pagina();
    if (!$(id).open) $(id).showModal();
    $(id).scrollTop = 0;
  }
  function chiudiTutti(tranne) {
    for (const d of FOGLI) if (d !== tranne && $(d).open) $(d).close();
  }
  for (const d of FOGLI) {
    const dlg = $(d);
    // Tocco fuori dal foglio: si chiude, come un foglio che torna nel taccuino. Solo se pressione e rilascio
    // sono tutti e due fuori dalla scheda: trascinare per selezionare il nickname non deve chiudere niente.
    let premutoFuori = false;
    const fuori = (e) => {
      const r = dlg.getBoundingClientRect();
      return e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    };
    dlg.addEventListener('pointerdown', (e) => { premutoFuori = fuori(e); });
    dlg.addEventListener('click', (e) => { if (premutoFuori && fuori(e)) dlg.close(); premutoFuori = false; });
    dlg.addEventListener('close', aggiornaSegno);
    for (const b of dlg.querySelectorAll('[data-chiudi]')) b.addEventListener('click', () => dlg.close());
    for (const b of dlg.querySelectorAll('[data-indietro]')) b.addEventListener('click', () => apri('taccuino'));
  }
  for (const b of document.querySelectorAll('[data-apri]')) {
    b.addEventListener('click', () => apri(b.dataset.apri, { da: !!b.closest('#taccuino') }));
  }

  // Il pallino rosso sul tasto del taccuino: timbri nuovi da vedere o pacchetti da scartare.
  function aggiornaSegno() {
    const s = leggi();
    const nuovi = nuoviTimbri(s).length + daScartare(s).length;
    $('segno-taccuino').hidden = !nuovi;
  }
  const nuoviTimbri = (s) => Object.keys(s.timbri).filter((id) => zonePerId[id] && !s.visti.includes(id));
  const daScartare = (s) => SOUVENIR.filter((sv) => s.souvenir[sv.id] && !s.souvenir[sv.id].scartato).map((sv) => sv.id);

  // --- Scrivania ---

  function preparaTaccuino() {
    const s = leggi();
    const c = contesto(s, dati.zone);
    const n = serie(s.giorni);
    $('t-diario').textContent = n ? `Serie ${n} · ${plurale(c.finiti, 'giorno', 'giorni')}` : plurale(c.finiti, 'partita finita', 'partite finite');
    $('t-passaporto').textContent = `${c.timbrati} di ${c.zone} timbrate`;
    $('t-souvenir').textContent = `${Object.keys(s.souvenir).length} di ${SOUVENIR.length} presi`;
    const nt = nuoviTimbri(s).length, ns = daScartare(s).length;
    $('t-pass-nuovi').hidden = !nt;
    $('t-pass-nuovi').textContent = nt;
    $('t-souv-nuovi').hidden = !ns;
    $('t-souv-nuovi').textContent = ns;
    aggiornaConto();
  }

  // --- Account ---

  // Avatar: la foto Google se il giocatore la mostra, altrimenti la faccia di Mino.
  const avatar = (img, foto, faccia = 'neutro') => { img.src = foto || `img/mino-${faccia}.png`; img.classList.toggle('faccia', !foto); };

  function aggiornaConto() {
    const u = utente();
    const dentro = u && !u.anonimo;
    avatar($('t-account-foto'), dentro ? u.foto : '', dentro ? 'sorriso' : 'neutro');
    $('t-account-nome').textContent = dentro ? u.nome || 'Il tuo account' : 'Il tuo account';
    $('t-account').textContent = dentro ? 'Nickname, foto, partite salvate' : 'Entra con Google';
  }
  quandoCambia(() => { aggiornaConto(); if ($('account').open) preparaAccount(); });

  let mostraFoto = true;
  function preparaAccount() {
    const u = utente();
    const dentro = u && !u.anonimo;
    $('acc-fuori').hidden = dentro;
    $('acc-dentro').hidden = !dentro;
    $('acc-errore').hidden = true;
    if (!dentro) return;
    mostraFoto = u.mostraFoto;
    $('acc-nome').value = u.nome;
    $('acc-nome-vista').textContent = u.nome;
    avatar($('acc-foto'), mostraFoto ? u.fotoGoogle : '', 'sorriso');
    $('acc-mostra-foto').setAttribute('aria-pressed', String(mostraFoto));
    $('acc-mostra-foto').hidden = !u.fotoGoogle;
    controllaNome();
  }
  function errore(testo) { $('acc-errore').textContent = testo; $('acc-errore').hidden = false; }
  function controllaNome() {
    const v = $('acc-nome').value;
    const ok = nomeValido(v);
    $('acc-aiuto').classList.toggle('no', !ok && v.length > 0);
    $('acc-aiuto').textContent = ok || !v ? 'Da 3 a 20 caratteri: lettere, numeri, spazi.' : pulisciNome(v).length < 3 ? 'Almeno 3 caratteri.' : 'Solo lettere, numeri, spazi e . _ \' -';
    $('acc-salva').disabled = !ok;
  }
  $('acc-nome').addEventListener('input', controllaNome);
  $('acc-nome').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('acc-salva').disabled) $('acc-salva').click(); });
  $('acc-mostra-foto').addEventListener('click', () => {
    mostraFoto = !mostraFoto;
    $('acc-mostra-foto').setAttribute('aria-pressed', String(mostraFoto));
    avatar($('acc-foto'), mostraFoto ? utente()?.fotoGoogle : '', 'sorriso');
    suoni.scegli();
  });
  $('acc-salva').addEventListener('click', async () => {
    const b = $('acc-salva');
    b.disabled = true;
    b.textContent = 'Salvo…';
    try {
      await salvaProfilo({ nome: $('acc-nome').value.trim(), mostraFoto });
      await dopoLogin?.();
      suoni.copia();
      b.textContent = 'Salvato';
      setTimeout(() => { b.textContent = 'Salva'; controllaNome(); }, 1200);
    } catch {
      b.textContent = 'Salva';
      b.disabled = false;
      errore('Non riesco a salvare: controlla la connessione e riprova.');
    }
  });
  $('acc-google').addEventListener('click', async () => {
    const b = $('acc-google');
    b.disabled = true;
    b.querySelector('span').textContent = 'Apro Google…';
    try {
      await entraConGoogle();
      await dopoLogin?.();
      suoni.souvenir();
      preparaAccount();
    } catch (e) {
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
        errore(e?.code === 'auth/popup-blocked' ? 'Il browser ha bloccato la finestra di Google: consentila e riprova.'
          : e?.code === 'auth/operation-not-allowed' || e?.code === 'auth/configuration-not-found' ? 'Il login con Google non è ancora attivo. Torna tra poco!'
            : 'Non sono riuscito a entrare: riprova tra un attimo.');
      }
    } finally {
      b.disabled = false;
      b.querySelector('span').textContent = 'Entra con Google';
    }
  });
  $('acc-esci').addEventListener('click', async () => { await esci(); suoni.annulla(); preparaAccount(); });

  // --- Classifica: oggi e settimana (da lunedi a domenica) ---

  let vista = 'oggi';
  for (const b of $('cl-schede').querySelectorAll('button')) {
    b.addEventListener('click', () => { if (vista === b.dataset.cl) return; vista = b.dataset.cl; suoni.scegli(); preparaClassifica(); });
  }

  async function preparaClassifica() {
    for (const b of $('cl-schede').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.cl === vista));
    const lunedi = settimanaDi(oggi);
    const domenica = sposta(lunedi, 6);
    $('cl-data').textContent = vista === 'oggi' ? dataIt(oggi, { weekday: 'long', day: 'numeric', month: 'long' })
      : `Dal ${dataIt(lunedi, { day: 'numeric', month: 'long' })} al ${dataIt(domenica, { day: 'numeric', month: 'long' })}`;
    $('cl-mio').replaceChildren(el('p', 'cl-carico', 'Carico la classifica…'));
    $('cl-elenco').replaceChildren();
    const chiesta = vista;
    let c = null;
    try { c = chiesta === 'oggi' ? await classifica(oggi, 50) : await classificaSettimana(oggi, 50); } catch (e) { console.warn(e); }
    if (chiesta !== vista) return;
    if (!c) { $('cl-mio').replaceChildren(el('p', 'cl-carico', 'Classifica non disponibile ora: riprova tra poco.')); return; }
    const u = utente();
    const g = leggi().giorni[oggi];
    const mio = $('cl-mio');
    mio.replaceChildren();
    if (c.mio) {
      const riga = el('p', 'cl-pos');
      riga.innerHTML = `<b>${c.posizione}°</b> ${chiesta === 'oggi' ? 'oggi' : 'questa settimana'}`;
      mio.append(riga);
      if (chiesta === 'oggi') {
        if (c.percento > 0) mio.append(el('p', 'cl-meglio', `Meglio del ${c.percento}% di chi ha giocato oggi`));
        else if (c.percento === 0) mio.append(el('p', 'cl-meglio', 'Oggi è andata così: domani se riparte'));
        else mio.append(el('p', 'cl-meglio', 'Sei tra i primi a giocare oggi'));
      } else {
        mio.append(el('p', 'cl-meglio', `${c.mio.tot} sampietrini in ${plurale(c.mio.n, 'partita', 'partite')}: ogni giorno che giochi conta`));
      }
      if (u?.anonimo || !c.mio.pubblico) {
        mio.append(el('p', 'cl-nota', 'In classifica compari col tuo nome se entri con Google.'));
        const b = el('button', 'secondario largo', 'Entra e metti il nome');
        b.addEventListener('click', () => apri('account', { da: daTaccuino }));
        mio.append(b);
      }
    } else {
      mio.append(el('p', 'cl-nota', g?.finita && g.recupero ? 'Oggi hai giocato solo partite arretrate: la classifica è per la partita del giorno.'
        : chiesta === 'oggi' ? 'Finisci la partita di oggi per entrare in classifica.' : 'Finisci la partita di oggi per entrare nella classifica della settimana.'));
      if (!g?.finita) {
        const b = el('button', 'primario piccolo', 'Gioca oggi');
        b.addEventListener('click', () => { chiudiTutti(); gioca(oggi); });
        mio.append(b);
      }
    }
    if (!c.righe.length) {
      $('cl-elenco').replaceChildren(el('li', 'vuoto', chiesta === 'oggi' ? 'Ancora nessun nome in classifica oggi: il primo posto è libero.' : 'Ancora nessun nome in classifica questa settimana: il primo posto è libero.'));
      return;
    }
    const giorniSettimana = Array.from({ length: 7 }, (_, k) => sposta(lunedi, k));
    let pos = 0, prima = null;
    $('cl-elenco').replaceChildren(...c.righe.map((r, k) => {
      if (r.tot !== prima) { pos = k + 1; prima = r.tot; }
      const li = el('li');
      if (r.uid === u?.uid) li.classList.add('io');
      if (pos <= 3) li.classList.add(`podio-${pos}`);
      li.style.animationDelay = `${Math.min(k, 15) * 30}ms`;
      li.append(el('span', 'cl-n', `${pos}`));
      const img = el('img', 'cl-foto');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.loading = 'lazy';
      const media = chiesta === 'oggi' ? r.tot : Math.round(r.tot / Math.max(1, r.n));
      avatar(img, r.foto, gradoDi(media).faccia);
      img.addEventListener('error', () => avatar(img, '', gradoDi(media).faccia), { once: true });
      li.append(img);
      const nome = el('span', 'cl-nome');
      nome.append(el('b', null, r.nome || 'Anonimo'));
      const tappe = el('span', 'cl-tappe');
      if (chiesta === 'oggi') {
        for (const l of r.livelli || []) {
          const i = el('i');
          i.style.setProperty('--colore', coloreLiv(l));
          if (l == null || l < 0) i.classList.add('buca');
          tappe.append(i);
        }
      } else {
        // Un quadratino per giorno della settimana, col colore del grado di quel giorno.
        tappe.classList.add('cl-sett');
        for (const d of giorniSettimana) {
          const i = el('i');
          const t = r.giorni?.[d];
          if (t == null) i.classList.add('vuoto');
          else { const gr = gradoDi(t); i.style.setProperty('--colore', coloreGrado(gr)); if (gr.livello < 0) i.classList.add('buca'); }
          i.title = `${dataIt(d, { weekday: 'short', day: 'numeric' })}: ${t ?? 'non giocato'}`;
          tappe.append(i);
        }
      }
      nome.append(tappe);
      li.append(nome, el('span', 'cl-tot', r.tot));
      return li;
    }));
  }

  // --- Diario di bordo: calendario, archivio, statistiche ---

  let mese = oggi.slice(0, 7), scelto = null;
  const primoGiorno = () => {
    const giocati = Object.keys(leggi().giorni).sort();
    const finestra = [sposta(oggi, -GIORNI_INDIETRO), PRIMO_GIORNO].sort()[1];
    return giocati[0] && giocati[0] < finestra ? giocati[0] : finestra;
  };

  function preparaDiario() {
    mese = giorno().slice(0, 7);
    scelto = giorno();
    const s = leggi();
    const finiti = Object.values(s.giorni).filter((g) => g.finita);
    $('db-serie').textContent = serie(s.giorni);
    $('db-migliore').textContent = serieMigliore(s.giorni);
    $('db-giocati').textContent = finiti.length;
    $('db-media').textContent = finiti.length ? Math.round(finiti.reduce((a, g) => a + g.tot, 0) / finiti.length) : 0;
    disegnaCalendario();
    $('legenda').replaceChildren(...GRADI.map((g) => {
      const li = el('li', null, g.nome);
      li.style.setProperty('--colore', coloreGrado(g));
      return li;
    }));
    // Come sono andati i giorni: quante partite per grado.
    barre($('barre-giorni'), GRADI.map((g) => ({ nome: g.nome, colore: coloreGrado(g), n: finiti.filter((x) => gradoDi(x.tot) === g).length, faccia: g.faccia })));
    // Le tue risposte: tappa per tappa, buche comprese.
    const livelli = Object.values(s.giorni).flatMap((g) => g.livelli || []);
    barre($('barre-risposte'), [
      ...[...SCALA].map((f, i) => ({ nome: f.nome, colore: colori[i], n: livelli.filter((l) => l === i).length })).reverse(),
      { nome: 'Buca', colore: ROSSO, n: livelli.filter((l) => l === -1 || l === null).length, buca: true },
    ]);
  }

  function barre(ol, righe) {
    const max = Math.max(1, ...righe.map((r) => r.n));
    ol.replaceChildren(...righe.map((r, i) => {
      const li = el('li');
      li.style.setProperty('--colore', r.colore);
      li.style.setProperty('--quota', r.n / max);
      li.style.animationDelay = `${i * 50}ms`;
      if (r.buca) li.classList.add('buca');
      li.append(el('span', 'b-nome', r.nome), Object.assign(el('span', 'b-barra'), { innerHTML: '<i></i>' }), el('b', 'b-n', r.n));
      return li;
    }));
  }

  // anima: le caselle entrano a cascata solo aprendo il diario o cambiando mese, non a ogni tocco.
  function disegnaCalendario(anima = true) {
    const s = leggi();
    const [a, m] = mese.split('-').map(Number);
    const primo = `${mese}-01`;
    const giorni = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const vuoti = (new Date(`${primo}T12:00:00Z`).getUTCDay() + 6) % 7;
    $('cal-mese').textContent = dataIt(primo, { month: 'long', year: 'numeric' });
    $('cal-prima').disabled = primo <= primoGiorno().slice(0, 7) + '-01';
    $('cal-dopo').disabled = mese >= oggi.slice(0, 7);
    const celle = Array.from({ length: vuoti }, () => el('li', 'vuoto'));
    for (let i = 1; i <= giorni; i++) {
      const d = `${mese}-${String(i).padStart(2, '0')}`;
      const g = s.giorni[d];
      const iniziata = !!g || !!partita(d)?.stati?.some((x) => x.pin);
      const li = el('li');
      const b = el('button', 'giorno');
      b.dataset.data = d;
      b.append(el('span', 'g-num', i));
      if (g?.finita) {
        const gr = gradoDi(g.tot);
        b.classList.add('fatto');
        b.style.setProperty('--colore', coloreGrado(gr));
        b.append(Object.assign(el('img', 'faccia g-faccia'), { src: `img/mino-${gr.faccia}.png`, alt: '' }), el('b', 'g-tot', g.tot));
        if (g.recupero) b.classList.add('recupero');
        b.setAttribute('aria-label', `${dataIt(d, { day: 'numeric', month: 'long' })}: ${g.tot} punti, ${gr.nome}`);
      } else if (iniziata) {
        b.classList.add('iniziato');
        b.append(el('span', 'g-stato', '…'));
        b.setAttribute('aria-label', `${dataIt(d, { day: 'numeric', month: 'long' })}: partita a metà`);
      } else if (giocabile(d)) {
        b.classList.add('aperto');
        b.append(el('span', 'g-stato', 'gioca'));
        b.setAttribute('aria-label', `${dataIt(d, { day: 'numeric', month: 'long' })}: da giocare`);
      } else {
        b.disabled = true;
      }
      if (d > oggi) b.classList.add('futuro');
      if (d === oggi) b.classList.add('oggi');
      if (d === scelto) b.classList.add('scelto');
      b.addEventListener('click', () => { scelto = d; suoni.scegli(); disegnaCalendario(false); });
      if (anima) li.style.animationDelay = `${(vuoti + i) * 12}ms`;
      else li.style.animation = 'none';
      li.append(b);
      celle.push(li);
    }
    $('calendario').replaceChildren(...celle);
    schedaGiorno(s);
  }

  function schedaGiorno(s) {
    const box = $('cal-scheda');
    if (!scelto || scelto.slice(0, 7) !== mese) { box.hidden = true; return; }
    const d = scelto;
    const g = s.giorni[d];
    const p = partita(d);
    const fatte = p?.stati?.filter((x) => x.pin).length ?? 0;
    box.hidden = false;
    box.replaceChildren();
    box.append(el('p', 'cs-data', d === oggi ? `Oggi, ${dataIt(d, { day: 'numeric', month: 'long' })}` : dataIt(d, { weekday: 'long', day: 'numeric', month: 'long' })));
    let azione = null, testo = '';
    if (g?.finita) {
      const gr = gradoDi(g.tot);
      const riga = el('div', 'cs-riga');
      const t = el('span', 'timbro', gr.nome);
      t.style.setProperty('--colore-t', gr.livello < 0 ? 'var(--rosso)' : `var(--f${gr.livello}-t)`);
      riga.append(Object.assign(el('span', 'cs-tot'), { innerHTML: `${g.tot}<small>/40</small>` }), t);
      box.append(riga);
      if (g.livelli) {
        const ol = el('ol', 'cs-tappe');
        for (const l of g.livelli) {
          const li = el('li');
          li.style.setProperty('--colore', coloreLiv(l));
          if (l == null || l < 0) li.classList.add('buca');
          ol.append(li);
        }
        box.append(ol);
      }
      testo = g.recupero ? 'Giocata in recupero: non conta per la serie.' : '';
      azione = ['Rivedi il diario', () => gioca(d)];
    } else if (fatte && giocabile(d)) {
      testo = `Partita a metà: ${fatte} di 5 tappe.`;
      azione = ['Continua', () => gioca(d)];
    } else if (giocabile(d)) {
      testo = d === oggi ? 'La partita di oggi ti aspetta.' : 'Giorno arretrato: si gioca uguale, ma non conta per la serie.';
      azione = [d === oggi ? 'Gioca oggi' : 'Gioca questo giorno', () => gioca(d)];
    } else if (fatte) {
      testo = 'Partita lasciata a metà: il giorno ormai è chiuso.';
    } else {
      testo = d > oggi ? 'Questo giorno deve ancora arrivare.' : d < PRIMO_GIORNO ? `Sampietrino è nato il ${dataIt(PRIMO_GIORNO, { day: 'numeric', month: 'long', year: 'numeric' })}.`
        : 'Giorno chiuso: si giocano solo oggi e i 7 giorni prima.';
    }
    if (testo) box.append(el('p', 'cs-testo', testo));
    if (azione) {
      const b = el('button', 'primario piccolo', azione[0]);
      if (d === giorno() && !g?.finita) b.textContent = 'Torna alla partita';
      b.addEventListener('click', () => { chiudiTutti(); azione[1](); });
      box.append(b);
    }
  }

  $('cal-prima').addEventListener('click', () => { mese = sposta(`${mese}-01`, -1).slice(0, 7); suoni.pagina(); disegnaCalendario(); });
  $('cal-dopo').addEventListener('click', () => { mese = sposta(`${mese}-01`, 32).slice(0, 7); suoni.pagina(); disegnaCalendario(); });

  // --- Passaporto per municipio ---

  const municipi = [...new Set(dati.zone.map((z) => z.casa))].filter(Boolean).sort((a, b) => a - b);
  let mun = 0, filtro = 'tutte', fascia = null;

  function preparaPassaporto() {
    const s = leggi();
    const nuovi = nuoviTimbri(s);
    // Si apre sul municipio dell'ultimo timbro nuovo, o su quello con piu timbri.
    const casaDi = (id) => zonePerId[id].casa;
    if (nuovi.length) mun = municipi.indexOf(casaDi(nuovi[nuovi.length - 1]));
    else {
      const presi = (m) => dati.zone.filter((z) => z.casa === m && z.id in s.timbri).length;
      mun = municipi.indexOf([...municipi].sort((a, b) => presi(b) - presi(a))[0]);
    }
    mun = Math.max(0, mun);
    filtro = 'tutte';
    fascia = null;
    const n = Object.keys(s.timbri).filter((id) => zonePerId[id]).length;
    $('pass-numero').textContent = n;
    $('pass-totale').textContent = `di ${dati.zone.length} zone timbrate`;
    $('pass-riempi').style.transform = `scaleX(${n / dati.zone.length})`;
    $('pass-nuovi').hidden = !nuovi.length;
    $('pass-nuovi').textContent = `${nuovi.length} ${nuovi.length === 1 ? 'nuovo' : 'nuovi'}`;
    disegnaMunicipio();
  }

  function disegnaMunicipio(anima = false) {
    const s = leggi();
    const m = municipi[mun];
    const zone = dati.zone.filter((z) => z.casa === m).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const trovate = zone.filter((z) => z.id in s.timbri);
    $('mun-num').textContent = `Municipio ${ROMANI[m]}`;
    $('mun-nome').textContent = MUNICIPI[m] || '';
    $('mun-conto').innerHTML = `<b>${trovate.length}</b> di ${zone.length}`;
    $('mun-pagina').textContent = `${ROMANI[m]} · ${mun + 1} di ${municipi.length}`;
    // Mappa del municipio: timbrate col colore della fascia, le altre del municipio in chiaro, il resto spento.
    const cv = $('pass-mappa');
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const tinte = Object.fromEntries(zone.map((z) => [z.id, z.id in s.timbri ? colori[s.timbri[z.id]] : '#fbf4e0']));
    disegnaMiniMappa(ctx, dati, { x: 0, y: 0, w: cv.width, h: cv.height, colori: tinte, avvicina: true, fuoco: zone.map((z) => z.id), fondo: '#ddd0ad', municipio: m, filo: 1.4, contorno: false });
    if (anima) { cv.classList.remove('gira'); void cv.offsetWidth; cv.classList.add('gira'); }
    // Schede e fasce.
    const conti = { tutte: zone.length, trovate: trovate.length, mancanti: zone.length - trovate.length };
    for (const b of $('pass-schede').querySelectorAll('button')) {
      b.setAttribute('aria-selected', String(b.dataset.filtro === filtro));
      b.querySelector('b').textContent = conti[b.dataset.filtro];
    }
    $('pass-chip').replaceChildren(...SCALA.map((f, i) => {
      const b = el('button', 'chip');
      const quante = trovate.filter((z) => s.timbri[z.id] === i).length;
      b.style.setProperty('--colore', colori[i]);
      b.style.setProperty('--colore-t', `var(--f${i}-t)`);
      b.setAttribute('aria-pressed', String(fascia === i));
      b.disabled = !quante;
      b.innerHTML = `<i></i>${f.nome}<b>${quante}</b>`;
      b.addEventListener('click', () => { fascia = fascia === i ? null : i; if (fascia !== null && filtro === 'mancanti') filtro = 'tutte'; suoni.scegli(); disegnaMunicipio(); });
      return b;
    }));
    const lista = zone.filter((z) => {
      const presa = z.id in s.timbri;
      if (filtro === 'trovate' && !presa) return false;
      if (filtro === 'mancanti' && presa) return false;
      if (fascia !== null && s.timbri[z.id] !== fascia) return false;
      return true;
    });
    $('pass-elenco').replaceChildren(...(lista.length ? lista.map((z, k) => {
      const li = el('li');
      const presa = z.id in s.timbri;
      li.classList.toggle('presa', presa);
      li.style.animationDelay = `${Math.min(k, 20) * 18}ms`;
      if (presa) {
        li.style.setProperty('--colore', colori[s.timbri[z.id]]);
        li.style.setProperty('--colore-t', `var(--f${s.timbri[z.id]}-t)`);
      }
      li.append(el('i', 'sello'), el('span', 'p-nome', z.nome));
      if (z.tipo === 'rione') li.append(el('small', 'p-tag', 'rione'));
      if (presa && !s.visti.includes(z.id)) li.append(el('small', 'p-tag nuovo', 'nuovo'));
      if (presa) li.append(el('small', 'p-fascia', SCALA[s.timbri[z.id]].nome));
      return li;
    }) : [el('li', 'vuoto', filtro === 'trovate' || fascia !== null ? 'Ancora nessun timbro qui: indovina una zona di questo municipio e finisce nel passaporto.' : 'Tutte timbrate: municipio completo!')]));
  }

  for (const b of $('pass-schede').querySelectorAll('button')) {
    b.addEventListener('click', () => { filtro = b.dataset.filtro; if (filtro === 'mancanti') fascia = null; suoni.scegli(); disegnaMunicipio(); });
  }
  const sfoglia = (n) => { mun = (mun + n + municipi.length) % municipi.length; suoni.pagina(); disegnaMunicipio(true); };
  $('mun-prima').addEventListener('click', () => sfoglia(-1));
  $('mun-dopo').addEventListener('click', () => sfoglia(1));
  // Chiudendo il passaporto i timbri nuovi diventano visti.
  $('passaporto').addEventListener('close', () => {
    const s = leggi();
    s.visti = Object.keys(s.timbri);
    scrivi(s);
    aggiornaSegno();
  });

  // --- Scatola dei souvenir ---

  function preparaSouvenir(apertoId = null) {
    const s = leggi();
    const c = contesto(s, dati.zone);
    const presi = SOUVENIR.filter((sv) => s.souvenir[sv.id]);
    $('souv-numero').textContent = presi.length;
    $('souv-totale').textContent = `di ${SOUVENIR.length} souvenir`;
    $('souv-gruppi').replaceChildren(...GRUPPI.map((nome, gi) => {
      const sez = el('section', 'souv-gruppo');
      sez.append(el('h3', 'q-sotto', nome));
      const griglia = el('div', 'souv-griglia');
      SOUVENIR.filter((sv) => sv.gruppo === gi).forEach((sv, k) => {
        const mio = s.souvenir[sv.id];
        const b = el('button', `souv${mio ? ' preso' : ''}${mio && !mio.scartato ? ' nuovo' : ''}`);
        b.style.animationDelay = `${(gi * 3 + k) * 30}ms`;
        b.innerHTML = `<span class="souv-icona">${mio && mio.scartato ? pixel(sv.icona) : mio ? pixel('scatola') : pixel(sv.icona, { buio: true })}</span>`;
        b.append(el('span', 'souv-nome', mio && !mio.scartato ? 'Da scartare' : sv.nome));
        b.setAttribute('aria-pressed', String(apertoId === sv.id));
        b.addEventListener('click', () => {
          if (mio && !mio.scartato) { scarta([sv.id], true); return; }
          suoni.scegli();
          preparaSouvenir(sv.id);
        });
        griglia.append(b);
      });
      sez.append(griglia);
      return sez;
    }));
    schedaSouvenir(apertoId, s, c);
    // Quasi fatto: i tre souvenir mancanti piu vicini.
    const quasi = SOUVENIR.filter((sv) => !s.souvenir[sv.id])
      .map((sv) => { const [a, b] = sv.avanzamento(c); return { sv, a: Math.min(a, b), b }; })
      .sort((x, y) => y.a / y.b - x.a / x.b).slice(0, 3);
    $('souv-quasi').replaceChildren(...(quasi.length ? quasi.map(({ sv, a, b }) => {
      const li = el('li');
      li.innerHTML = `<span class="q-icona">${pixel(sv.icona, { buio: true })}</span>`;
      const testo = el('div', 'q-testo');
      testo.append(el('b', null, sv.nome), el('span', null, sv.come));
      const barra = el('div', 'q-barra');
      barra.innerHTML = `<i style="transform:scaleX(${a / b})"></i>`;
      testo.append(barra);
      li.append(testo, el('span', 'q-conto', `${a}/${b}`));
      return li;
    }) : [el('li', 'vuoto', 'Li hai presi tutti. Mino si inchina.')]));
  }

  function schedaSouvenir(id, s, c) {
    const box = $('souv-scheda');
    const sv = SOUVENIR.find((x) => x.id === id);
    if (!sv) { box.hidden = true; return; }
    const mio = s.souvenir[sv.id];
    box.hidden = false;
    box.classList.remove('entra'); void box.offsetWidth; box.classList.add('entra');
    box.replaceChildren();
    const icona = el('div', 'ss-icona');
    icona.innerHTML = pixel(sv.icona, { buio: !mio });
    const testa = el('div', 'ss-testa');
    testa.append(el('p', 'etichetta', GRUPPI[sv.gruppo]), el('h3', 'ss-nome', sv.nome));
    if (mio) testa.append(el('p', 'ss-come', `Preso il ${dataIt(mio.data, { day: 'numeric', month: 'long' })}: ${sv.come.charAt(0).toLowerCase()}${sv.come.slice(1)}.`));
    else {
      const [a, b] = sv.avanzamento(c);
      testa.append(el('p', 'ss-come', `Come si prende: ${sv.come.charAt(0).toLowerCase()}${sv.come.slice(1)}. Sei a ${Math.min(a, b)} di ${b}.`));
    }
    box.append(icona, testa);
    const q = el('blockquote', 'esito-contesto');
    q.append(el('small', null, 'Mino dice'), el('span', null, mio ? sv.chicca : 'La chicca la leggi quando lo prendi.'));
    box.append(q);
  }

  // --- Pacchetto da scartare ---

  // Scartato dalla scatola, il souvenir torna nella scatola: si riapre lei.
  let coda = [], tornaAScatola = false;
  function scarta(ids, daScatola = false) {
    coda = [...ids];
    tornaAScatola = daScatola;
    chiudiTutti();
    $('scarta').showModal();
    prossimoPacco();
  }
  function prossimoPacco() {
    const id = coda[0];
    const sv = SOUVENIR.find((x) => x.id === id);
    const tot = coda.length;
    $('scarta-conto').textContent = tot > 1 ? `Hai ${tot} pacchetti da scartare` : 'Hai un pacchetto da scartare';
    $('pacco').hidden = false;
    $('pacco').classList.remove('apre');
    $('scartato').hidden = true;
    $('scarta-aiuto').hidden = false;
    $('scarta-avanti').hidden = true;
    $('scarta-salta').hidden = false;
    $('scartato-icona').innerHTML = pixel(sv.icona);
    $('scartato-nome').textContent = sv.nome;
    $('scartato-come').textContent = `${sv.come}.`;
    $('scartato-chicca').textContent = sv.chicca;
    $('scarta-avanti').textContent = coda.length > 1 ? 'Prossimo pacchetto' : 'Metti nella scatola';
  }
  function segnaScartato(ids) {
    const s = leggi();
    for (const id of ids) if (s.souvenir[id]) s.souvenir[id].scartato = true;
    scrivi(s);
    aggiornaSegno();
  }
  $('pacco').addEventListener('click', () => {
    if ($('pacco').classList.contains('apre')) return;
    suoni.carta();
    $('pacco').classList.add('apre');
    segnaScartato([coda[0]]);
    setTimeout(() => {
      $('pacco').hidden = true;
      $('scartato').hidden = false;
      $('scarta-aiuto').hidden = true;
      $('scarta-salta').hidden = true;
      $('scarta-avanti').hidden = false;
      suoni.souvenir();
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 380);
  });
  $('scarta-avanti').addEventListener('click', () => {
    coda.shift();
    if (coda.length) { suoni.pagina(); prossimoPacco(); return; }
    $('scarta').close();
    if (tornaAScatola) apri('souvenir');
  });
  $('scarta-salta').addEventListener('click', () => {
    segnaScartato(coda);
    coda = [];
    $('scarta').close();
  });

  // Alla fine della partita: se ci sono souvenir nuovi, arrivano i pacchetti. Torna true se si e aperto.
  function scartaNuovi() {
    const ids = daScartare(leggi());
    if (!ids.length) return false;
    scarta(ids);
    return true;
  }

  aggiornaSegno();
  avviaConto().then(aggiornaConto);
  return { apri, scartaNuovi, aggiornaSegno, aggiornaConto };
}
