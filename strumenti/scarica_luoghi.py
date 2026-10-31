"""Scarica da OpenStreetMap i luoghi delle categorie in dati/categorie.json.

Metro: le fermate delle relazioni route=subway con la sigla della linea (A, B, B1, C).
Elenco: un luogo per nome (Fontana di Trevi, Villa Ada...), con la fascia decisa a mano.
Altre categorie: il filtro Overpass scritto nella categoria.
Esce dati/fonti/luoghi-osm.geojson: un punto (o una linea, per il Tevere) per luogo,
con la categoria nelle proprieta.

Uso: python3 strumenti/scarica_luoghi.py   (serve accesso a overpass-api.de)
Si ferma con errore se una categoria non trova niente: niente silenzio verde.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import unary_union

RADICE = Path(__file__).resolve().parent.parent
USCITA = RADICE / 'dati' / 'fonti' / 'luoghi-osm.geojson'
GRA = RADICE / 'dati' / 'fonti' / 'gra-osm.geojson'
SERVER = 'https://overpass-api.de/api/interpreter'
ROMA = '(41.70,12.30,42.05,12.75)'
UNIONE_M = 300
RUMORE_CHIAVI = {'public_transport', 'shop', 'office', 'craft'}
RUMORE_VALORI = {('highway', 'bus_stop'), ('amenity', 'bicycle_rental'), ('amenity', 'restaurant'),
                 ('amenity', 'bar'), ('amenity', 'cafe'), ('amenity', 'pub'), ('amenity', 'fast_food'),
                 ('amenity', 'ice_cream'), ('amenity', 'pharmacy'), ('tourism', 'hotel'), ('tourism', 'guest_house')}


def chiedi(query, tentativi=4):
    """Overpass sotto carico risponde 429/502/504: riprova con attese crescenti prima di arrendersi."""
    corpo = urllib.parse.urlencode({'data': f'[out:json][timeout:120];{query}'}).encode()
    richiesta = urllib.request.Request(SERVER, data=corpo, headers={'User-Agent': 'sampietrino/0.1'})
    for n in range(tentativi):
        try:
            with urllib.request.urlopen(richiesta, timeout=180) as r:
                return json.load(r)['elements']
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or n == tentativi - 1:
                raise
            print(f'  Overpass {e.code}, riprovo tra {15 * (n + 1)} s')
            time.sleep(15 * (n + 1))


def fermate_metro(linee):
    regex = '|'.join(linee)
    elementi = chiedi(f'rel["route"="subway"]["ref"~"^({regex})$"]{ROMA}->.r;node(r.r)->.n;.n out;')
    punti = []
    for e in elementi:
        if e.get('type') == 'node':
            punti.append({'type': 'Point', 'coordinates': [e['lon'], e['lat']], 'nome': e.get('tags', {}).get('name', '')})
    return punti


def luoghi(filtro):
    """Geometrie GeoJSON con 'nome', 'tag' (i tag OSM) e '_forma' (shapely in metri, per le distanze).
    'tag' e '_forma' servono solo a scegliere tra omonimi e non finiscono nel file."""
    elementi = chiedi(f'{filtro}{ROMA};out geom;')
    geometrie = []
    for e in elementi:
        tag = e.get('tags', {})
        base = {'nome': tag.get('name', ''), 'tag': tag}
        if e['type'] == 'node':
            g = {'type': 'Point', 'coordinates': [e['lon'], e['lat']]}
            forma = Point(metri(e['lon'], e['lat']))
        elif e['type'] == 'way' and e.get('geometry'):
            coords = [[p['lon'], p['lat']] for p in e['geometry']]
            g = {'type': 'LineString', 'coordinates': coords}
            pts = [metri(*c) for c in coords]
            forma = Polygon(pts) if len(pts) > 3 and coords[0] == coords[-1] else LineString(pts)
        elif e['type'] == 'relation' and e.get('bounds'):
            b = e['bounds']
            g = {'type': 'Point', 'coordinates': [(b['minlon'] + b['maxlon']) / 2, (b['minlat'] + b['maxlat']) / 2]}
            forma = box(*metri(b['minlon'], b['minlat']), *metri(b['maxlon'], b['maxlat']))
        else:
            continue
        geometrie.append({**g, **base, '_forma': forma})
    return geometrie


def metri(lon, lat):
    """Coordinate piane approssimate in metri: a Roma basta per misurare distanze di qualche km."""
    return lon * 82830, lat * 111000


def regex_nome(nome):
    return re.sub(r'([.^$*+?()\[\]{}|\\])', r'\\\\\1', nome).replace('"', '\\"')


def rumore(tag):
    """Fermate, bike sharing, locali, negozi: portano il nome del luogo ma non sono il luogo."""
    return any(k in tag for k in RUMORE_CHIAVI) or any(tag.get(k) == v for k, v in RUMORE_VALORI)


def gruppi(candidati):
    """Raggruppa i candidati che stanno entro UNIONE_M l'uno dall'altro (i pezzi della stessa
    piazza o dello stesso parco). Due gruppi = due luoghi diversi con lo stesso nome."""
    insieme = []
    for c in candidati:
        vicini = [gr for gr in insieme if any(c['_forma'].distance(x['_forma']) <= UNIONE_M for x in gr)]
        for gr in vicini:
            insieme.remove(gr)
        insieme.append([c] + [x for gr in vicini for x in gr])
    return insieme


def scegli(voce, trovati, preferisci, dentro):
    """Tra gli elementi con quel nome tiene un solo luogo. Toglie il rumore e quello fuori dal GRA,
    poi preferisce i tag della categoria (una fontana vera, un parco vero) e, se la voce ha
    'vicino': [lat, lon], tiene solo cio che sta entro 500 m. Se restano luoghi distinti
    non sceglie a caso: torna None e la voce va sistemata in dati/categorie.json."""
    c = [g for g in trovati if not rumore(g['tag']) and dentro(g['_forma'])]
    c = [g for g in c if any(g['tag'].get(k) == v for k, v in preferisci.items())] or c
    if 'vicino' in voce:
        lat, lon = voce['vicino']
        c = [g for g in c if g['_forma'].distance(Point(metri(lon, lat))) <= 500]
    gr = gruppi(c)
    if len(gr) > 1:
        return None, [g['_forma'].representative_point() for g in (x[0] for x in gr)]
    return (gr[0] if gr else []), None


def da_elenco(elenco, preferisci, dentro):
    """Un luogo per nome. Se un nome non si trova, lo dice e va avanti: la costruzione lo segnala.
    Tutti i nomi senza filtro proprio in una sola richiesta: una ricerca per nome su Roma
    e pesante per Overpass, farne decine in fila vuol dire aspettare decine di minuti."""
    geometrie, mancanti = [], []
    per_nome = defaultdict(list)
    semplici = [v['nome'] for v in elenco if not v.get('osm')]
    if semplici:
        for g in luoghi(f'nwr["name"~"^({"|".join(regex_nome(n) for n in semplici)})$",i]'):
            per_nome[g['nome'].lower()].append(g)
    for voce in elenco:
        trovati = luoghi(voce['osm']) if voce.get('osm') else per_nome[voce['nome'].lower()]
        scelti, ambiguo = scegli(voce, trovati, preferisci, dentro)
        if ambiguo:
            dove = ' / '.join(f'[{p.y / 111000:.4f}, {p.x / 82830:.4f}]' for p in ambiguo)
            mancanti.append(f'{voce["nome"]} (AMBIGUO: {len(ambiguo)} luoghi, aggiungi "vicino": {dove})')
            continue
        if not scelti:
            mancanti.append(voce['nome'])
        for g in scelti:
            g['nome'] = voce['nome']
            g['fascia'] = voce['fascia']
            geometrie.append(g)
    return geometrie, mancanti


def main():
    categorie = json.loads((RADICE / 'dati' / 'categorie.json').read_text())['categorie']
    if not categorie:
        sys.exit('ERRORE: nessuna categoria in dati/categorie.json')
    if GRA.exists():
        anello = unary_union([shape(f['geometry']) for f in json.loads(GRA.read_text())['features']])
        gra = Polygon([metri(*c) for c in anello.exterior.coords]).buffer(500)
        dentro = gra.intersects
    else:
        print(f'ATTENZIONE: manca {GRA.relative_to(RADICE)}, gli omonimi fuori dal Raccordo non vengono scartati')
        dentro = lambda forma: True
    feature, vuote = [], []
    for c in categorie:
        mancanti = []
        if 'metro' in c:
            trovati = fermate_metro(c['metro'])
        elif 'elenco' in c:
            trovati, mancanti = da_elenco(c['elenco'], c.get('preferisci', {}), dentro)
        else:
            trovati = luoghi(c['osm'])
        print(f'{c["id"]}: {len(trovati)} luoghi' + (f'. NON TROVATI: {", ".join(mancanti)}' if mancanti else ''))
        if not trovati:
            vuote.append(c['id'])
        for g in trovati:
            g.pop('tag', None)
            g.pop('_forma', None)
            nome = g.pop('nome')
            proprieta = {'categoria': c['id'], 'nome': nome}
            if 'fascia' in g:
                proprieta['fascia'] = g.pop('fascia')
                proprieta['etichetta'] = nome
            feature.append({'type': 'Feature', 'properties': proprieta, 'geometry': g})
        time.sleep(1)
    if vuote:
        sys.exit(f'ERRORE: categorie senza nessun luogo: {", ".join(vuote)}. Controlla il filtro in dati/categorie.json')
    USCITA.write_text(json.dumps({'type': 'FeatureCollection', 'features': feature}, ensure_ascii=False))
    print(f'Scritti {len(feature)} luoghi in {USCITA.relative_to(RADICE)}')


if __name__ == '__main__':
    main()
