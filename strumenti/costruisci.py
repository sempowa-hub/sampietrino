"""Costruisce dati/gioco.json dalle fonti geografiche.

Zone: le localita della mappa ufficiale 2026 accorpate a una via di mezzo (dati/fonti/zone-gioco.geojson, da
strumenti/scarica_quartieri.py e strumenti/accorpa_zone.py: rioni, quartieri, poche zone funzionali), solo quelle
che stanno almeno per il 40% dentro il Grande Raccordo Anulare (cosi entra il Parco dell'Appia Antica, al 48%) (dati/fonti/gra-osm.geojson,
da strumenti/scarica_gra.py). Il gioco e la Roma dentro il Raccordo.
Domande: calcolate dalla geometria, mai scritte a mano.
  - Categorie (dati/categorie.json): "Una zona con una fermata della Metro A", "con un
    Trapizzino"... Zone giuste: quelle che contengono almeno un luogo della categoria
    (dati/fonti/luoghi-osm.geojson, da strumenti/scarica_luoghi.py).
  Riserva, usate solo se mancano domande di categoria:
  - "Confina con X": zone che condividono con X almeno 100 m di confine.
  - "Nel Municipio N": zone che stanno per piu di meta nel municipio.
  - "Arriva fino al Raccordo": zone che toccano il GRA.
  - "Confina col Vaticano".

Catalogo: ogni risposta giusta di ogni domanda sta in una fascia della scala (0-4,
da Da cartolina a Da Mino), dalla notorieta della zona rispetto alle altre risposte.
Correzioni a mano in dati/correzioni-fasce.json. Il catalogo leggibile esce in dati/catalogo.csv.

Uso: pip install shapely pyproj && python3 strumenti/costruisci.py
     python3 strumenti/costruisci.py --provvisorio   senza GRA e senza luoghi, solo domande
       di riserva su tutta Roma. Lo scrive nei dati e lo stampa: non e la versione vera.
Si ferma con errore se un dato manca: niente silenzio verde.
"""
import csv
import json

import numpy as np
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely import transform as trasforma
from shapely.geometry import Polygon, Point, shape, mapping
from shapely.ops import linemerge, unary_union

RADICE = Path(__file__).resolve().parent.parent
FONTI = RADICE / 'dati' / 'fonti'
USCITA = RADICE / 'dati' / 'gioco.json'
CONFINE_MINIMO_M = 100
QUOTA_DENTRO_GRA = 0.4
MIN_RISPOSTE, MAX_RISPOSTE = 5, 40
# Le domande di riserva (confina con X, municipio, Vaticano, Raccordo) dal 1/11/2026 non escono piu (src/motore.js,
# DATA_NUOVE), ma restano nei dati: servono a rigiocare e rivedere i giorni d'archivio fino al 31 ottobre, identici.
CON_RISERVA = True
GENERATE = RADICE / 'dati' / 'domande-generate.json'
LINEA_MINIMA_M = 150  # una strada o una linea vale per la zona se ci corre dentro almeno 150 m
FASCE = ['Da cartolina', 'Ce sta', 'Da romano de Roma', 'Chicca', 'Da Mino']
PUNTI = [1, 2, 3, 5, 8]
CATALOGO_CSV = RADICE / 'dati' / 'catalogo.csv'
# Nome mostrato in gioco quando la gente chiama la zona in un altro modo. L'id resta quello del nome ufficiale (partite gia giocate).
NOMI_DI_GIOCO = {'Ripa': 'Aventino'}
ROMANI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']

utm = Transformer.from_crs(4326, 32633, always_xy=True)


def senza_trattini(testo):
    return testo.replace(' \u2013 ', ' - ').replace(' \u2014 ', ' - ').replace('\u2013', '-').replace('\u2014', '-')


def in_metri(geom):
    return trasforma(geom, lambda c: np.column_stack(utm.transform(c[:, 0], c[:, 1])))


def slug(testo):
    t = unicodedata.normalize('NFKD', testo).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def errore(msg):
    sys.exit(f'ERRORE: {msg}')


def carica(nome):
    f = FONTI / nome
    if not f.exists():
        errore(f'manca {f}')
    feats = json.loads(f.read_text())['features']
    if not feats:
        errore(f'{f} non ha nessun poligono')
    return feats


def cataloga(ids_giusti, notorieta):
    """Fascia 0-4 per ogni risposta, per posizione in classifica di notorieta: le piu note Da cartolina,
    le meno note Da Mino, a quinti. Con almeno 5 risposte ogni fascia ha almeno una zona, cosi il punteggio
    massimo e sempre possibile. A parita di notorieta decide il nome, per avere sempre lo stesso risultato."""
    ordine = sorted(ids_giusti, key=lambda z: (-notorieta[z], z))
    n = len(ordine)
    return {z: min(4, i * 5 // n) for i, z in enumerate(ordine)}


def percorso_linee(geom, origine):
    """Path SVG aperto (Tevere, reti dei confini) in km, stesso riferimento di percorso_svg."""
    x0, y1 = origine
    parti = geom.geoms if hasattr(geom, 'geoms') else [geom]
    return ''.join('M' + 'L'.join(f'{(x - x0) / 1000:.3f} {(y1 - y) / 1000:.3f}' for x, y in p.coords) for p in parti if p.length)


def percorso_svg(geom, origine):
    """Path SVG in km, y verso il basso, origine in alto a sinistra."""
    x0, y1 = origine
    parti = geom.geoms if geom.geom_type == 'MultiPolygon' else [geom]
    pezzi = []
    for p in parti:
        for anello in [p.exterior, *p.interiors]:
            pts = [f'{(x - x0) / 1000:.3f} {(y1 - y) / 1000:.3f}' for x, y in anello.coords[:-1]]
            pezzi.append('M' + 'L'.join(pts) + 'Z')
    return ''.join(pezzi)


PROVVISORIO = '--provvisorio' in sys.argv


def main():
    avvisi = []
    notorieta = json.loads((RADICE / 'dati' / 'notorieta.json').read_text())['valori']

    per_nome = defaultdict(list)
    tipo_di = {}
    for f in carica('zone-gioco.geojson'):
        per_nome[f['properties']['nome']].append(in_metri(shape(f['geometry'])).buffer(0))
        tipo_di[f['properties']['nome']] = f['properties'].get('tipo', 'quartiere')
        notorieta.setdefault(f['properties']['nome'], f['properties'].get('notorieta', 20))
    zone = {n: unary_union(g) for n, g in per_nome.items()}

    mancanti = sorted(n for n in zone if n not in notorieta)
    if mancanti:
        errore(f'notorieta mancante per {len(mancanti)} zone: {", ".join(mancanti)}')

    municipi = {}
    for f in carica('municipi-osm.geojson'):
        municipi[f['properties']['num']] = in_metri(shape(f['geometry'])).buffer(0)
    if sorted(municipi) != list(range(1, 16)):
        errore(f'attesi 15 municipi, letti {sorted(municipi)}')
    comune = unary_union(list(municipi.values()))

    gra_file = FONTI / 'gra-osm.geojson'
    if gra_file.exists():
        gra = unary_union([in_metri(shape(f['geometry'])).buffer(0) for f in carica('gra-osm.geojson')])
    elif PROVVISORIO:
        avvisi.append('PROVVISORIO: senza GRA, tutta Roma (manca dati/fonti/gra-osm.geojson)')
        gra = None
    else:
        errore(f'manca {gra_file.relative_to(RADICE)}: lancia prima python3 strumenti/scarica_gra.py')
    if gra is None:
        gra = comune
    if gra_file.exists() and not 250e6 < gra.area < 500e6:
        errore(f'area dentro il GRA di {gra.area / 1e6:.0f} km2: attesa tra 250 e 500, il file e sbagliato')
    tutte = len(zone)
    quota = {n: g.intersection(gra).area / g.area for n, g in zone.items()}
    fuori = sorted(n for n in zone if quota[n] < QUOTA_DENTRO_GRA)
    a_cavallo = sorted(n for n in zone if 0.05 < quota[n] < 0.95)
    tocca_gra = {n for n, g in zone.items() if quota[n] >= QUOTA_DENTRO_GRA and g.intersects(gra.boundary.buffer(100))}
    zone = {n: g.intersection(gra) for n, g in zone.items() if quota[n] >= QUOTA_DENTRO_GRA}
    if not zone:
        errore('nessuna zona dentro il GRA')
    municipi = {k: m.intersection(gra) for k, m in municipi.items()}

    ids = {n: slug(n) for n in zone}
    if len(set(ids.values())) != len(ids):
        errore('due zone hanno lo stesso id')

    # Vicini: confine in comune di almeno CONFINE_MINIMO_M metri.
    vicini = defaultdict(set)
    nomi = sorted(zone)
    for i, a in enumerate(nomi):
        for b in nomi[i + 1:]:
            if zone[a].distance(zone[b]) > 5:
                continue
            comune_ab = zone[a].buffer(5).intersection(zone[b].buffer(5))
            if comune_ab.length / 2 >= CONFINE_MINIMO_M or comune_ab.area >= CONFINE_MINIMO_M * 10:
                vicini[a].add(b)
                vicini[b].add(a)

    domande = []
    for n in nomi:
        domande.append({
            'id': f'confina-{ids[n]}',
            'tipo': 'confina', 'riserva': True,
            'testo': f'Una zona che confina con {NOMI_DI_GIOCO.get(n, n)}',
            'evidenzia': [ids[n]],
            'risposte': sorted(ids[v] for v in vicini[n]),
        })

    # mun_di: municipio solo se la zona ci sta per piu di meta (domanda "Nel Municipio N").
    # casa_di: il municipio con la parte piu grande, per sfogliare il passaporto: ogni zona ne ha uno.
    mun_di, casa_di = {}, {}
    for n in nomi:
        quote = {k: zone[n].intersection(m).area / zone[n].area for k, m in municipi.items()}
        k, q = max(quote.items(), key=lambda kv: kv[1])
        mun_di[n] = k if q > 0.5 else None
        casa_di[n] = k
    for k in range(1, 16):
        if not municipi[k].area:
            continue
        domande.append({
            'id': f'municipio-{k}',
            'tipo': 'municipio', 'riserva': True,
            'testo': f'Una zona del Municipio {ROMANI[k]}',
            'evidenziaMunicipio': k,
            'risposte': sorted(ids[n] for n in nomi if mun_di[n] == k),
        })

    # Dentro il GRA l'unico confine del Comune e quello col Vaticano.
    vaticano = comune.boundary.buffer(150)
    domande.append({
        'id': 'vaticano',
        'tipo': 'vaticano', 'riserva': True,
        'testo': 'Una zona che confina col Vaticano',
        'risposte': sorted(ids[n] for n in nomi if zone[n].intersects(vaticano)),
    })
    domande.append({
        'id': 'raccordo',
        'tipo': 'raccordo', 'riserva': True,
        'testo': 'Una zona che arriva fino al Raccordo',
        'risposte': sorted(ids[n] for n in nomi if n in tocca_gra),
    })

    # Domande di categoria: zone che contengono almeno un luogo.
    categorie = json.loads((RADICE / 'dati' / 'categorie.json').read_text())['categorie']
    if not categorie and not PROVVISORIO:
        errore('nessuna categoria in dati/categorie.json')
    per_categoria = defaultdict(list)
    luoghi_file = FONTI / 'luoghi-osm.geojson'
    if not luoghi_file.exists():
        if not PROVVISORIO:
            errore(f'manca {luoghi_file.relative_to(RADICE)}: lancia prima python3 strumenti/scarica_luoghi.py')
        avvisi.append('PROVVISORIO: nessuna domanda di categoria (manca dati/fonti/luoghi-osm.geojson)')
        categorie = []
    trovati_per_nome = defaultdict(set)
    tevere_linee = []
    for f in (carica('luoghi-osm.geojson') if luoghi_file.exists() else []):
        pr = f['properties']
        g = in_metri(shape(f['geometry']))
        per_categoria[pr['categoria']].append((g.buffer(25), pr.get('fascia'), pr.get('etichetta') or pr.get('nome', '')))
        trovati_per_nome[pr['categoria']].add(pr.get('etichetta') or pr.get('nome', ''))
        if pr['categoria'] == 'tevere':
            tevere_linee.append(g)
    resoconto = []
    def fasce_e_perche(luoghi):
        """Luoghi con la fascia decisa a mano: la zona prende la fascia del suo luogo piu scontato,
        e si ricorda quali luoghi la rendono giusta."""
        fasce, perche = {}, defaultdict(list)
        for g, fascia_luogo, etichetta in luoghi:
            for n in nomi:
                if zone[n].intersects(g):
                    fasce[ids[n]] = min(fasce.get(ids[n], 4), int(fascia_luogo))
                    if etichetta not in perche[ids[n]]:
                        perche[ids[n]].append(etichetta)
        return fasce, dict(perche)

    # Parchi e ville come aree vere (strumenti/scarica_parchi.py). Regola "cuore": una zona vale se e quella
    # con la parte piu grande dell'area, o se ne ha almeno la quota indicata, o almeno tot ettari.
    # Cosi Villa Ada vale per Villa Ada e non per i quartieri che il suo recinto sfiora.
    parchi_file = FONTI / 'parchi-osm.geojson'
    parchi = [(f['properties'], in_metri(shape(f['geometry'])).buffer(0)) for f in (carica('parchi-osm.geojson') if parchi_file.exists() else [])]
    luoghi_osm = defaultdict(list)
    for f in (carica('luoghi-osm.geojson') if luoghi_file.exists() else []):
        luoghi_osm[(f['properties']['categoria'], f['properties'].get('etichetta') or f['properties'].get('nome', ''))].append(shape(f['geometry']))

    def zone_del_cuore(g, regola):
        pezzi = [(zone[n].intersection(g).area, n) for n in nomi if zone[n].intersects(g)]
        pezzi = [(a, n) for a, n in pezzi if a > 0]
        if not pezzi:
            return []
        tot = sum(a for a, _ in pezzi)
        prima = max(pezzi)[1]
        return [n for a, n in pezzi if n == prima or a / tot >= regola.get('quota', 2) or a / 1e4 >= regola.get('ettari', 1e9)]

    for c in categorie:
        if 'aree' in c:
            r = c['aree']
            if not parchi:
                errore(f'categoria {c["id"]}: manca dati/fonti/parchi-osm.geojson. Lancia strumenti/scarica_parchi.py')
            scelti = []  # (geometria, fascia, nome)
            if 'elenco' in c:
                for x in c['elenco']:
                    cerca = x.get('osm_nome', x['nome']).lower()
                    trovati = [g for pr, g in parchi if pr['nome'].lower() == cerca or pr['nome'].lower() == f'parco di {cerca}']
                    if not trovati:
                        # Non e tra le aree (in OSM manca il tag leisure=park): il suo recinto da luoghi-osm, chiuso.
                        trovati = [in_metri(Polygon(l.coords)).buffer(0) for l in luoghi_osm.get((c['id'], x['nome']), [])
                                   if l.geom_type == 'LineString' and l.coords[0] == l.coords[-1]]
                    if not trovati:
                        resoconto.append(f'  ATTENZIONE {c["id"]}: {x["nome"]} non trovata tra i parchi')
                        continue
                    scelti.append((unary_union(trovati), x['fascia'], x['nome']))
            else:
                escludi = set(r.get('escludi', []))
                for pr, g in parchi:
                    if pr['ettari'] < r.get('minimo_ha', 0) or pr['nome'] in escludi:
                        continue
                    scelti.append((g, r.get('fasce', {}).get(pr['nome'], r.get('fascia_base', 3)), pr['nome']))
            fasce, perche = {}, defaultdict(list)
            for g, fascia_luogo, nome in scelti:
                for n in zone_del_cuore(g, r.get('regola', {})):
                    fasce[ids[n]] = min(fasce.get(ids[n], 4), int(fascia_luogo))
                    if nome not in perche[ids[n]]:
                        perche[ids[n]].append(nome)
            resoconto.append(f'  {c["id"]}: {len(scelti)} aree, {len(fasce)} zone giuste')
            domande.append({'id': c['id'], 'tipo': c['tipo'], 'testo': c['testo'], 'fasce_a_mano': fasce, 'perche': dict(perche),
                            '_luoghi': [(nome, g.representative_point()) for g, _, nome in scelti],
                            **({'contesto': c['contesto']} if c.get('contesto') else {})})
            continue
        if 'punti' in c:
            # Luoghi con le coordinate scritte nella categoria (la guida di Themino): niente OpenStreetMap.
            # Un luogo vale per la zona in cui cade; sui confini veri (un ponte, un incrocio tra due rioni)
            # la categoria elenca le altre zone in zone_anche, a mano: un raggio fisso prenderebbe anche
            # le zone sbagliate (l'ingresso di Villa Borghese sta in Flaminio).
            luoghi = [(in_metri(Point(x['lon'], x['lat'])).buffer(5), x['fascia'], x['nome']) for x in c['punti']]
            fasce, perche = fasce_e_perche(luoghi)
            per_nome_zona = {n: ids[n] for n in nomi}
            for x in c['punti']:
                for altra in x.get('zone_anche', []):
                    if altra not in per_nome_zona:
                        errore(f'categoria {c["id"]}: zona_anche "{altra}" per {x["nome"]} non e una zona in gioco')
                    z = per_nome_zona[altra]
                    fasce[z] = min(fasce.get(z, 4), int(x['fascia']))
                    if x['nome'] not in perche.setdefault(z, []):
                        perche[z].append(x['nome'])
            for (g, _, nome), x in zip(luoghi, c['punti']):
                atteso = x.get('zona_attesa')
                if atteso and atteso not in x.get('zone_anche', []) and not (atteso in zone and zone[atteso].intersects(g)):
                    dove = [n for n in nomi if zone[n].intersects(g)] or ['nessuna zona in gioco']
                    resoconto.append(f'  ATTENZIONE {c["id"]}: {nome} cade in {", ".join(dove)}, non in {atteso}')
            resoconto.append(f'  {c["id"]}: {len(luoghi)} luoghi a mano, {len(fasce)} zone giuste')
            domande.append({'id': c['id'], 'tipo': c['tipo'], 'testo': c['testo'], 'fasce_a_mano': fasce, 'perche': perche,
                            '_luoghi': [(e, g.centroid) for g, _, e in luoghi], **({'contesto': c['contesto']} if c.get('contesto') else {})})
            continue
        luoghi = per_categoria.get(c['id'], [])
        if not luoghi:
            errore(f'categoria {c["id"]}: nessun luogo in luoghi-osm.geojson. Rilancia strumenti/scarica_luoghi.py')
        if 'elenco' in c:
            # Elenco di luoghi con la fascia decisa a mano: la zona prende la fascia del suo luogo
            # piu scontato, e si ricorda quali luoghi la rendono giusta.
            mancanti = [x['nome'] for x in c['elenco'] if x['nome'] not in trovati_per_nome[c['id']]]
            if mancanti:
                resoconto.append(f'  ATTENZIONE {c["id"]}: non trovati in OpenStreetMap: {", ".join(mancanti)}')
            fasce, perche = fasce_e_perche(luoghi)
            resoconto.append(f'  {c["id"]}: {len(luoghi)} luoghi su {len(c["elenco"])} in elenco, {len(fasce)} zone giuste')
            domande.append({'id': c['id'], 'tipo': c['tipo'], 'testo': c['testo'], 'fasce_a_mano': fasce, 'perche': perche,
                            '_luoghi': [(e, g.centroid) for g, _, e in luoghi]})
        else:
            tutti = unary_union([g for g, _, _ in luoghi])
            giuste = sorted(ids[n] for n in nomi if zone[n].intersects(tutti))
            # Perche e giusta: i nomi dei luoghi nella zona (fermate, sedi...), al massimo tre.
            # Non per il Tevere: "Tevere" non spiega niente.
            perche = {}
            if c['tipo'] != 'acqua':
                for n in nomi:
                    if ids[n] not in giuste:
                        continue
                    trovati = sorted({e for g, _, e in luoghi if e and zone[n].intersects(g)})
                    if trovati:
                        perche[ids[n]] = trovati[:3] + (['...'] if len(trovati) > 3 else [])
            resoconto.append(f'  {c["id"]}: {len(luoghi)} luoghi, {len(giuste)} zone giuste')
            domande.append({'id': c['id'], 'tipo': c['tipo'], 'testo': c['testo'], 'risposte': giuste,
                            **({} if c['tipo'] == 'acqua' else {'_luoghi': [(e, g.centroid) for g, _, e in luoghi]}),
                            **({'perche': perche} if perche else {})})

    # Chicche dei follower approvate da Simone e Themino (strumenti/proposte.py): ogni 8 zone diverse una domanda nuova.
    # Un gruppo si chiude solo a 8 zone, cosi una domanda gia uscita non cambia piu. Fasce per notorieta della zona.
    f_foll = RADICE / 'dati' / 'proposte-follower.json'
    if f_foll.exists():
        per_nome_zona = {n: n for n in nomi}
        gruppo, zone_gruppo, n_gruppo = [], [], 0
        def chiudi(gruppo, n_gruppo):
            perche = defaultdict(list)
            for x in gruppo:
                perche[ids[x['zona']]].append(f"{x['luogo']} (segnalata da {x['nome']})")
            chi = sorted({x['nome'] for x in gruppo})
            domande.append({'id': f'follower-{n_gruppo}', 'tipo': 'follower', 'testo': 'Una zona con una chicca segnalata da voi',
                            'risposte': sorted(perche), 'perche': dict(perche),
                            'contesto': f"Le risposte di questa domanda le avete segnalate voi, una per una: grazie a {', '.join(chi[:-1]) + ' e ' + chi[-1] if len(chi) > 1 else chi[0]}."})
        for x in json.loads(f_foll.read_text()):
            if x.get('zona') not in per_nome_zona:
                resoconto.append(f"  ATTENZIONE follower: zona \"{x.get('zona')}\" non in gioco ({x.get('luogo')})")
                continue
            gruppo.append(x)
            if x['zona'] not in zone_gruppo:
                zone_gruppo.append(x['zona'])
            if len(zone_gruppo) >= 8:
                n_gruppo += 1
                chiudi(gruppo, n_gruppo)
                gruppo, zone_gruppo = [], []
        resoconto.append(f'  follower: {n_gruppo} domande, {len(zone_gruppo)} zone in attesa del prossimo gruppo')

    # Domande generate (strumenti/genera_domande.py): luoghi e linee con la loro fama (voci Wikipedia).
    # Fascia per zona a quinti: la zona col luogo piu famoso e Da cartolina, a parita decide la notorieta della zona.
    if GENERATE.exists():
        gen = json.loads(GENERATE.read_text())['domande']
        # Domande scartate da Simone e Themino nella pagina di revisione (docs/revisione-domande.html, voto No).
        f_scart = RADICE / 'dati' / 'domande-scartate.json'
        scartate = set(json.loads(f_scart.read_text())['ids']) if f_scart.exists() else set()
        gen = [x for x in gen if x['id'] not in scartate]
        # In gioco solo le approvate (voto Si). Le altre restano proposte, nella pagina di revisione.
        f_appr = RADICE / 'dati' / 'domande-approvate.json'
        approvate = set(json.loads(f_appr.read_text())['ids']) if f_appr.exists() else None
        # Le approvate per prime: tra due domande con le stesse zone resta quella gia approvata.
        gen.sort(key=lambda x: approvate is not None and x['id'] not in approvate)
        firme = set()
        testi = {d['testo'].lower() for d in domande if not d.get('riserva')}
        for g in gen:
            fama = defaultdict(int)
            perche = defaultdict(list)
            punti = []
            elementi = []
            for x in g['elementi']:
                forma = in_metri(shape(x['geom']))
                if forma.geom_type in ('Point', 'MultiPoint'):
                    dove = [n for n in nomi if zone[n].intersects(forma.buffer(5))]
                else:
                    dove = [n for n in nomi if zone[n].intersects(forma) and zone[n].intersection(forma).length >= LINEA_MINIMA_M]
                elementi.append((x, forma, dove))
            # Troppe zone giuste: se c'e la variante "famosa", restano solo i luoghi piu noti, il massimo che sta in 40 zone.
            testo = g['testo']
            if len({n for _, _, d in elementi for n in d}) > MAX_RISPOSTE and g.get('famoso'):
                soglie = sorted({x.get('fama', 0) for x, _, _ in elementi if x.get('fama', 0) > 0}, reverse=True)
                scelta = None
                for t in soglie:
                    if len({n for x, _, d in elementi if x.get('fama', 0) >= t for n in d}) > MAX_RISPOSTE:
                        break
                    scelta = t
                if scelta:
                    elementi = [e for e in elementi if e[0].get('fama', 0) >= scelta]
                    testo = g['famoso']
            for x, forma, dove in elementi:
                for n in dove:
                    fama[n] = max(fama[n], x.get('fama', 0))
                    if x['nome'] and x['nome'] not in perche[n]:
                        perche[n].append(x['nome'])
                if x['nome']:
                    punti.append((x['nome'], forma.representative_point() if forma.geom_type != 'Point' else forma))
            if not fama:
                continue
            firma = tuple(sorted(fama))
            if firma in firme or testo.lower() in testi:
                continue  # stesse zone o stesso testo di un'altra domanda: doppione
            firme.add(firma)
            testi.add(testo.lower())
            ordine = sorted(fama, key=lambda n: (-fama[n], -notorieta[n], n))
            k = len(ordine)
            domande.append({
                'id': g['id'], 'tipo': g['tipo'], 'testo': testo, 'famiglia': g['famiglia'], 'generata': True,
                **({} if approvate is None or g['id'] in approvate else {'proposta': True}),
                'fasce_a_mano': {ids[n]: min(4, i * 5 // k) for i, n in enumerate(ordine)},
                'perche': {ids[n]: v[:3] + (['...'] if len(v) > 3 else []) for n, v in perche.items()},
                '_luoghi': punti[:400],
                **({'manca': g['manca']} if g.get('manca') else {}),
                **({'contesto': g['contesto']} if g.get('contesto') else {}),
            })
        resoconto.append(f'  generate: {len(gen)} proposte, {sum(1 for d in domande if d.get("generata"))} dopo i doppioni')
    if not CON_RISERVA:
        domande = [d for d in domande if not d.get('riserva')]

    # Catalogo: fascia di ogni risposta, poi le correzioni a mano.
    notorieta_id = {ids[n]: notorieta[n] for n in nomi}
    for d in domande:
        d['catalogo'] = d.pop('fasce_a_mano') if 'fasce_a_mano' in d else cataloga(d.pop('risposte'), notorieta_id)
    f_corr = RADICE / 'dati' / 'correzioni-fasce.json'
    correzioni = json.loads(f_corr.read_text()) if f_corr.exists() else {}
    per_id = {d['id']: d for d in domande}
    id_zone = {ids[n] for n in nomi}
    for did, zone_corr in correzioni.items():
        if did.startswith('_'):
            continue
        if did not in per_id:
            errore(f'correzioni-fasce.json: domanda "{did}" non esiste')
        d = per_id[did]
        for zid, livello in zone_corr.items():
            if zid.startswith('_'):
                continue
            # null toglie la zona (luogo messo nella zona sbagliata dalle fonti).
            if livello is None:
                if zid not in d['catalogo']:
                    errore(f'correzioni-fasce.json: "{zid}" da togliere non e una risposta di "{did}"')
                del d['catalogo'][zid]
                d.get('perche', {}).pop(zid, None)
                continue
            # {"fascia": n, "perche": [...]} aggiunge una zona che le fonti non trovano (Roma Ostiense non e in OSM).
            if isinstance(livello, dict):
                if zid not in id_zone:
                    errore(f'correzioni-fasce.json: zona "{zid}" non in gioco ("{did}")')
                d.setdefault('perche', {})[zid] = livello['perche']
                livello = livello['fascia']
            elif zid not in d['catalogo']:
                errore(f'correzioni-fasce.json: "{zid}" non e una risposta giusta di "{did}"')
            if livello not in range(5):
                errore(f'correzioni-fasce.json: fascia {livello} fuori scala per "{zid}" in "{did}"')
            d['catalogo'][zid] = livello

    # Giocabile: abbastanza risposte, non troppe, e almeno una zona per ogni fascia (il massimo si puo fare).
    giocabili = [d for d in domande if MIN_RISPOSTE <= len(d['catalogo']) <= MAX_RISPOSTE and set(d['catalogo'].values()) == set(range(5))]
    for d in domande:
        mancano = sorted(set(range(5)) - set(d['catalogo'].values()))
        if mancano and not d.get('riserva') and MIN_RISPOSTE <= len(d['catalogo']) <= MAX_RISPOSTE:
            print(f'ATTENZIONE {d["id"]}: nessuna risposta in {", ".join(FASCE[m] for m in mancano)}: domanda fuori gioco')
    nome_di = {ids[n]: NOMI_DI_GIOCO.get(n, n) for n in nomi}
    with CATALOGO_CSV.open('w', newline='') as fcsv:
        w = csv.writer(fcsv)
        w.writerow(['domanda', 'testo', 'giocabile', 'zona', 'fascia', 'punti', 'perche'])
        for d in domande:
            ok = 'si' if d in giocabili else 'no'
            for zid, liv in sorted(d['catalogo'].items(), key=lambda kv: (kv[1], nome_di[kv[0]])):
                w.writerow([d['id'], d['testo'], ok, nome_di[zid], FASCE[liv], PUNTI[liv], ' / '.join(d.get('perche', {}).get(zid, []))])

    if len(giocabili) < 5:
        errore(f'solo {len(giocabili)} domande giocabili su {len(domande)}')

    minx, miny, maxx, maxy = gra.buffer(500).bounds
    origine = (minx, maxy)
    # 8 m: a zoom stretto i confini restano curvi, e il file resta piccolo.
    semplifica = lambda g: g.simplify(8, preserve_topology=True)
    # Reti dei confini, ciascun tratto una volta sola: tra zone (tratteggiati sulla mappa) e tra
    # municipi (pieni). Disegnati per zona, i confini in comune uscirebbero doppi e il tratteggio sporco.
    bordo_gra = gra.boundary.buffer(5)
    rete_mun = unary_union([m.boundary for m in municipi.values() if m.area]).difference(bordo_gra)
    rete_zone = unary_union([z.boundary for z in zone.values()]).difference(bordo_gra).difference(rete_mun.buffer(5))
    # Luoghi di ogni domanda in km, per spiegare una risposta sbagliata ("il piu vicino e...").
    # Stesso nome entro 300 m = stesso luogo (le fermate hanno banchina e punto di fermata).
    for d in giocabili:
        visti, punti = [], []
        for nome, c in d.pop('_luoghi', []):
            if not nome or any(n == nome and c.distance(v) < 300 for n, v in visti):
                continue
            visti.append((nome, c))
            punti.append([nome, round((c.x - minx) / 1000, 2), round((maxy - c.y) / 1000, 2)])
        if punti:
            d['luoghi'] = punti
    for d in domande:
        d.pop('_luoghi', None)
    dati = {
        'nota': 'Generato da strumenti/costruisci.py. Non modificare a mano. Zone: mappa ufficiale dei quartieri di Roma Capitale (2026). Luoghi: OpenStreetMap (ODbL). Solo dentro il GRA.',
        'attribuzione': 'Quartieri © Roma Capitale · Luoghi © OpenStreetMap contributors',
        'dimensioni': [round((maxx - minx) / 1000, 2), round((maxy - miny) / 1000, 2)],
        'comune': percorso_svg(semplifica(gra), origine),
        'municipi': [{'num': k, 'nome': f'Municipio {ROMANI[k]}', 'd': percorso_svg(semplifica(m), origine)}
                     for k, m in sorted(municipi.items()) if m.area],
        'zone': [{
            'id': ids[n], 'nome': NOMI_DI_GIOCO.get(n, n), 'notorieta': notorieta[n], 'municipio': mun_di[n],
            'casa': casa_di[n], 'tipo': tipo_di.get(n, 'quartiere'),
            'km2': round(zone[n].area / 1e6, 1), 'd': percorso_svg(semplifica(zone[n]), origine),
            'centro': [round((zone[n].representative_point().x - minx) / 1000, 2),
                       round((maxy - zone[n].representative_point().y) / 1000, 2)],
            'vicini': sorted(ids[v] for v in vicini[n]),
        } for n in nomi],
        'domande': [d for d in giocabili if not d.get('proposta')],
        'avvisi': avvisi,
        'confini': percorso_linee(linemerge(rete_zone).simplify(8), origine),
        'confini_municipi': percorso_linee(linemerge(rete_mun).simplify(8), origine),
        'tevere': percorso_linee(unary_union(tevere_linee).intersection(gra.buffer(2000)).simplify(8), origine) if tevere_linee else None,
    }
    # Le proposte (generate, da approvare) vanno in un file a parte per la pagina di revisione, non nel gioco.
    (RADICE / 'dati' / 'domande-proposte.json').write_text(json.dumps([d for d in giocabili if d.get('proposta')], ensure_ascii=False, separators=(',', ':')))
    # Niente trattini lunghi nei testi del gioco (i nomi di OpenStreetMap a volte li hanno): diventano trattini corti.
    USCITA.write_text(senza_trattini(json.dumps(dati, ensure_ascii=False, separators=(',', ':'))))

    coperta = unary_union(list(zone.values())).area / gra.area
    for a in avvisi:
        print(f'ATTENZIONE: {a}')
    print(f'Zone lette: {tutte} (da {sum(len(g) for g in per_nome.values())} poligoni)')
    if gra_file.exists():
        print(f'Dentro il GRA: {len(zone)}. Fuori: {len(fuori)}')
        print(f'A cavallo del GRA (decide la quota del {QUOTA_DENTRO_GRA:.0%}): {", ".join(f"{n} {quota[n]:.0%}" for n in a_cavallo)}')
        print(f'Area dentro il GRA: {gra.area / 1e6:.0f} km2, coperta dalle zone: {coperta:.1%}')
    else:
        print(f'GRA assente: in gioco tutte le {len(zone)} zone, copertura del Comune {coperta:.1%}')
    print(f'Domande: {len(giocabili)} giocabili su {len(domande)} '
          f'(scartate perche con meno di {MIN_RISPOSTE} o piu di {MAX_RISPOSTE} risposte, o senza tutte le fasce: {len(domande) - len(giocabili)})')
    print('Domande di categoria:')
    print('\n'.join(resoconto))
    di_categoria = [d for d in giocabili if not d.get('riserva')]
    print(f'Di categoria giocabili: {len(di_categoria)}. Di riserva giocabili: {len(giocabili) - len(di_categoria)}')
    print(f'Catalogo leggibile: {CATALOGO_CSV.relative_to(RADICE)}')
    senza_vicini = [n for n in nomi if not vicini[n]]
    if senza_vicini:
        print(f'ATTENZIONE: zone senza vicini: {", ".join(senza_vicini)}')
    print(f'Scritto {USCITA.relative_to(RADICE)} ({USCITA.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
