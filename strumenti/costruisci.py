"""Costruisce dati/gioco.json dalle fonti geografiche.

Zone: i poligoni di dati/fonti/quartieri-osm.geojson, uniti per nome, solo quelle
che stanno almeno per meta dentro il Grande Raccordo Anulare (dati/fonti/gra-osm.geojson,
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
da Scontata a Da sampietrino), dalla notorieta della zona rispetto alle altre risposte.
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
from shapely.geometry import shape, mapping
from shapely.ops import linemerge, unary_union

RADICE = Path(__file__).resolve().parent.parent
FONTI = RADICE / 'dati' / 'fonti'
USCITA = RADICE / 'dati' / 'gioco.json'
CONFINE_MINIMO_M = 100
QUOTA_DENTRO_GRA = 0.5
MIN_RISPOSTE, MAX_RISPOSTE = 4, 25
FASCE = ['Scontata', 'Nota', 'Da romano', 'Da tassinaro', 'Da sampietrino']
PUNTI = [1, 2, 3, 5, 8]
CATALOGO_CSV = RADICE / 'dati' / 'catalogo.csv'
ROMANI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']

utm = Transformer.from_crs(4326, 32633, always_xy=True)


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
    """Fascia 0-4 per ogni risposta: la piu nota 0, la meno nota 4, le altre distribuite.
    A parita di notorieta, rango medio e stessa fascia."""
    n = len(ids_giusti)
    if n == 1:
        return {ids_giusti[0]: 2}
    fasce = {}
    for z in ids_giusti:
        piu_note = sum(1 for a in ids_giusti if notorieta[a] > notorieta[z])
        pari = sum(1 for a in ids_giusti if notorieta[a] == notorieta[z])
        rango = piu_note + (pari - 1) / 2
        fasce[z] = round(4 * rango / (n - 1))
    return fasce


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
    for f in carica('quartieri-osm.geojson'):
        per_nome[f['properties']['name']].append(in_metri(shape(f['geometry'])).buffer(0))
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
            'testo': f'Una zona che confina con {n}',
            'evidenzia': [ids[n]],
            'risposte': sorted(ids[v] for v in vicini[n]),
        })

    mun_di = {}
    for n in nomi:
        quote = {k: zone[n].intersection(m).area / zone[n].area for k, m in municipi.items()}
        k, q = max(quote.items(), key=lambda kv: kv[1])
        mun_di[n] = k if q > 0.5 else None
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
    for c in categorie:
        luoghi = per_categoria.get(c['id'], [])
        if not luoghi:
            errore(f'categoria {c["id"]}: nessun luogo in luoghi-osm.geojson. Rilancia strumenti/scarica_luoghi.py')
        if 'elenco' in c:
            # Elenco di luoghi con la fascia decisa a mano: la zona prende la fascia del suo luogo
            # piu scontato, e si ricorda quali luoghi la rendono giusta.
            mancanti = [x['nome'] for x in c['elenco'] if x['nome'] not in trovati_per_nome[c['id']]]
            if mancanti:
                resoconto.append(f'  ATTENZIONE {c["id"]}: non trovati in OpenStreetMap: {", ".join(mancanti)}')
            fasce, perche = {}, defaultdict(list)
            for g, fascia_luogo, etichetta in luoghi:
                for n in nomi:
                    if zone[n].intersects(g):
                        fasce[ids[n]] = min(fasce.get(ids[n], 4), int(fascia_luogo))
                        if etichetta not in perche[ids[n]]:
                            perche[ids[n]].append(etichetta)
            resoconto.append(f'  {c["id"]}: {len(luoghi)} luoghi su {len(c["elenco"])} in elenco, {len(fasce)} zone giuste')
            domande.append({'id': c['id'], 'tipo': c['tipo'], 'testo': c['testo'], 'fasce_a_mano': fasce, 'perche': dict(perche),
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

    # Catalogo: fascia di ogni risposta, poi le correzioni a mano.
    notorieta_id = {ids[n]: notorieta[n] for n in nomi}
    for d in domande:
        d['catalogo'] = d.pop('fasce_a_mano') if 'fasce_a_mano' in d else cataloga(d.pop('risposte'), notorieta_id)
    f_corr = RADICE / 'dati' / 'correzioni-fasce.json'
    correzioni = json.loads(f_corr.read_text()) if f_corr.exists() else {}
    per_id = {d['id']: d for d in domande}
    for did, zone_corr in correzioni.items():
        if did.startswith('_'):
            continue
        if did not in per_id:
            errore(f'correzioni-fasce.json: domanda "{did}" non esiste')
        for zid, livello in zone_corr.items():
            if zid not in per_id[did]['catalogo']:
                errore(f'correzioni-fasce.json: "{zid}" non e una risposta giusta di "{did}"')
            if livello not in range(5):
                errore(f'correzioni-fasce.json: fascia {livello} fuori scala per "{zid}" in "{did}"')
            per_id[did]['catalogo'][zid] = livello

    giocabili = [d for d in domande if MIN_RISPOSTE <= len(d['catalogo']) <= MAX_RISPOSTE]
    nome_di = {ids[n]: n for n in nomi}
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
        'nota': 'Generato da strumenti/costruisci.py. Non modificare a mano. Confini: OpenStreetMap (ODbL), vecchia suddivisione toponomastica. Solo dentro il GRA.',
        'attribuzione': 'Confini © OpenStreetMap contributors',
        'dimensioni': [round((maxx - minx) / 1000, 2), round((maxy - miny) / 1000, 2)],
        'comune': percorso_svg(semplifica(gra), origine),
        'municipi': [{'num': k, 'nome': f'Municipio {ROMANI[k]}', 'd': percorso_svg(semplifica(m), origine)}
                     for k, m in sorted(municipi.items()) if m.area],
        'zone': [{
            'id': ids[n], 'nome': n, 'notorieta': notorieta[n], 'municipio': mun_di[n],
            'km2': round(zone[n].area / 1e6, 1), 'd': percorso_svg(semplifica(zone[n]), origine),
            'centro': [round((zone[n].representative_point().x - minx) / 1000, 2),
                       round((maxy - zone[n].representative_point().y) / 1000, 2)],
            'vicini': sorted(ids[v] for v in vicini[n]),
        } for n in nomi],
        'domande': giocabili,
        'avvisi': avvisi,
        'confini': percorso_linee(linemerge(rete_zone).simplify(8), origine),
        'confini_municipi': percorso_linee(linemerge(rete_mun).simplify(8), origine),
        'tevere': percorso_linee(unary_union(tevere_linee).intersection(gra.buffer(2000)).simplify(8), origine) if tevere_linee else None,
    }
    USCITA.write_text(json.dumps(dati, ensure_ascii=False, separators=(',', ':')))

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
          f'(scartate perche con meno di {MIN_RISPOSTE} o piu di {MAX_RISPOSTE} risposte: {len(domande) - len(giocabili)})')
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
