"""Scarica da OpenStreetMap quello che serve alle domande generate (strumenti/genera_domande.py).

Gruppi:
  strade     vie e piazze con la dedica in Wikidata (name:etymology:wikidata): "una via dedicata a un poeta"
  consolari  le vie consolari e le grandi radiali, per nome
  tram       le linee del tram (relazioni route=tram), per numero
  treni      le ferrovie urbane e regionali (FL1..FL8, Roma-Lido, Roma-Viterbo, Termini-Centocelle)
  linee      Aniene, acquedotti, mura
  poi        luoghi per tag: forti, madonnelle, pietre d'inciampo, moschee, sinagoghe...
Esce dati/fonti/osm-extra.geojson; per le strade anche dati/fonti/dediche-wikidata.json (chi sono i dedicatari).

Uso: python3 strumenti/scarica_osm_extra.py
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scarica_luoghi import chiedi, ROMA  # noqa: E402
from scarica_wikidata import sparql  # noqa: E402

RADICE = Path(__file__).resolve().parent.parent
USCITA = RADICE / 'dati' / 'fonti' / 'osm-extra.geojson'
DEDICHE = RADICE / 'dati' / 'fonti' / 'dediche-wikidata.json'

CONSOLARI = ['Via Flaminia', 'Via Salaria', 'Via Nomentana', 'Via Tiburtina', 'Via Prenestina', 'Via Casilina', 'Via Tuscolana',
             'Via Appia Nuova', 'Via Appia Antica', 'Via Ardeatina', 'Via Ostiense', 'Via Portuense', 'Via Aurelia', 'Via Cassia',
             'Via Collatina', 'Via Laurentina', 'Via Trionfale', 'Via Cristoforo Colombo', 'Via del Corso', 'Via Nazionale']
POI = {
    'forte': 'nwr["historic"="fort"]',
    'madonnella': 'nwr["historic"="wayside_shrine"]',
    'inciampo': 'nwr["memorial"="stolperstein"]',
    'moschea': 'nwr["amenity"="place_of_worship"]["religion"="muslim"]',
    'sinagoga': 'nwr["amenity"="place_of_worship"]["religion"="jewish"]',
    'ortodossa': 'nwr["amenity"="place_of_worship"]["denomination"~"orthodox"]',
    'evangelica': 'nwr["amenity"="place_of_worship"]["denomination"~"protestant|evangelical|lutheran|anglican|methodist|baptist|waldensian|adventist"]',
    'buddista': 'nwr["amenity"="place_of_worship"]["religion"~"buddhist|hindu|sikh"]',
    'obelisco': 'nwr["man_made"="obelisk"]',
    'torre': 'nwr["historic"~"tower"]',
    'mausoleo': 'nwr["historic"="tomb"]["name"]',
    'acquedotto-resti': 'nwr["historic"="aqueduct"]',
    'serbatoio': 'nwr["man_made"="water_tower"]',
    'stadio': 'nwr["leisure"="stadium"]',
    'piscina': 'nwr["leisure"="sports_centre"]["sport"="swimming"]',
    'ippica': 'nwr["leisure"~"horse_riding"]',
    'golf': 'nwr["leisure"="golf_course"]',
    'orti': 'nwr["landuse"="allotments"]',
    'vigna': 'nwr["landuse"="vineyard"]',
    'cimitero': 'nwr["landuse"="cemetery"]["name"]',
    'centro-sociale': 'nwr["amenity"="social_centre"]',
    'osservatorio': 'nwr["man_made"="observatory"]',
    'ambasciata': 'nwr["office"="diplomatic"]["diplomatic"="embassy"]',
    'museo': 'nwr["tourism"="museum"]',
    'mercato': 'nwr["amenity"="marketplace"]',
    'skatepark': 'nwr["leisure"="pitch"]["sport"="skateboard"]',
    'teatro-tenda': 'nwr["amenity"="theatre"]',
    'faro': 'nwr["man_made"="lighthouse"]',
    'ponte': 'way["bridge"]["name"~"^Ponte"]["highway"]',
    'fontanella': 'nwr["amenity"="fountain"]["name"]',
    'gelateria': 'nwr["amenity"="ice_cream"]',
    'birreria': 'nwr["amenity"="pub"]',
    'libreria': 'nwr["shop"="books"]',
    'vinile': 'nwr["shop"="music"]',
    'fumetti': 'nwr["shop"="books"]["books"~"comic"]',
    'cartoleria-storica': 'nwr["shop"="antiques"]',
    'galleria-arte': 'nwr["tourism"="gallery"]',
    'hotel-lusso': 'nwr["tourism"="hotel"]["stars"="5"]',
    'ostello': 'nwr["tourism"="hostel"]',
    'campeggio': 'nwr["tourism"="camp_site"]',
    'zoo': 'nwr["tourism"="zoo"]',
    'parco-giochi-grande': 'nwr["leisure"="water_park"]',
    'cinema-aperto': 'nwr["amenity"="cinema"]["open_air"="yes"]',
    'circolo-tennis': 'nwr["leisure"="sports_centre"]["sport"="tennis"]',
    'canottaggio': 'nwr["sport"~"rowing|canoe"]',
    'bocce': 'nwr["sport"="boules"]',
    'padel': 'nwr["sport"="padel"]',
    'rugby': 'nwr["sport"="rugby_union"]',
    'basket-playground': 'nwr["leisure"="pitch"]["sport"="basketball"]["name"]',
    'scuola-lingue': 'nwr["amenity"="language_school"]',
    'conservatorio': 'nwr["amenity"="music_school"]',
    'accademia-straniera': 'nwr["amenity"="college"]["name"~"Accademia|Academy|Académie|Akademie|Istituto"]',
    'carcere': 'nwr["amenity"="prison"]',
    'caserma': 'nwr["military"="barracks"]',
    'ospedale': 'nwr["amenity"="hospital"]["name"]',
    'universita': 'nwr["amenity"="university"]["name"]',
    'mattatoio-fabbrica': 'nwr["historic"="industrial"]',
    'tram-deposito': 'nwr["landuse"="railway"]["name"~"[Dd]eposito"]',
    'murale': 'nwr["artwork_type"="mural"]',
    'statua': 'nwr["artwork_type"="statue"]["name"]',
    'busto': 'nwr["memorial"="bust"]',
    'lapide': 'nwr["memorial"="plaque"]["name"]',
    'monumento-caduti': 'nwr["memorial"="war_memorial"]',
}


def linee(elementi):
    """Elementi Overpass (out geom) in liste di coordinate [lon, lat], per way o per membri di relazione."""
    out = []
    for e in elementi:
        if e['type'] == 'way' and e.get('geometry'):
            out.append([[p['lon'], p['lat']] for p in e['geometry']])
        for m in e.get('members', []):
            if m.get('type') == 'way' and m.get('geometry'):
                out.append([[p['lon'], p['lat']] for p in m['geometry']])
    return out


def punto(e):
    if e['type'] == 'node':
        return [e['lon'], e['lat']]
    if e.get('center'):
        return [e['center']['lon'], e['center']['lat']]
    if e.get('geometry'):
        g = e['geometry']
        return [sum(p['lon'] for p in g) / len(g), sum(p['lat'] for p in g) / len(g)]
    if e.get('bounds'):
        b = e['bounds']
        return [(b['minlon'] + b['maxlon']) / 2, (b['minlat'] + b['maxlat']) / 2]
    return None


def feat(gruppo, chiave, nome, geom, **altro):
    return {'type': 'Feature', 'properties': {'gruppo': gruppo, 'chiave': chiave, 'nome': nome, **altro}, 'geometry': geom}


def main():
    f = []
    # Strade con la dedica: una feature per nome di strada, con tutti i suoi tratti.
    tratti, dedica = defaultdict(list), {}
    for e in chiedi(f'way["highway"]["name"]["name:etymology:wikidata"]{ROMA};out geom;'):
        t = e['tags']
        q = t['name:etymology:wikidata'].split(';')[0].strip()
        tratti[t['name']].append([[p['lon'], p['lat']] for p in e.get('geometry', [])])
        dedica[t['name']] = q
    for nome, ls in tratti.items():
        f.append(feat('strade', dedica[nome], nome, {'type': 'MultiLineString', 'coordinates': ls}))
    print(f'strade con dedica: {len(tratti)}')
    time.sleep(2)
    # Chi sono i dedicatari: tipo, mestieri, sesso, nazionalita, fama.
    qids = sorted(set(dedica.values()))
    info = {}
    for i in range(0, len(qids), 300):
        blocco = ' '.join(f'wd:{q}' for q in qids[i:i + 300])
        righe = sparql(f'''SELECT ?q ?l ?sl (GROUP_CONCAT(DISTINCT ?tL; separator="|") AS ?tipi) (GROUP_CONCAT(DISTINCT ?mL; separator="|") AS ?mestieri)
          (SAMPLE(?sesso) AS ?s) (GROUP_CONCAT(DISTINCT ?nL; separator="|") AS ?paesi) (MIN(?nato) AS ?nascita) WHERE {{
          VALUES ?q {{ {blocco} }}
          ?q wikibase:sitelinks ?sl . OPTIONAL {{ ?q rdfs:label ?l . FILTER(LANG(?l)="it") }}
          OPTIONAL {{ ?q wdt:P31 ?t . ?t rdfs:label ?tL . FILTER(LANG(?tL)="it") }}
          OPTIONAL {{ ?q wdt:P106 ?m . ?m rdfs:label ?mL . FILTER(LANG(?mL)="it") }}
          OPTIONAL {{ ?q wdt:P21 ?sesso }}
          OPTIONAL {{ ?q wdt:P27 ?n . ?n rdfs:label ?nL . FILTER(LANG(?nL)="it") }}
          OPTIONAL {{ ?q wdt:P569 ?nd . BIND(YEAR(?nd) AS ?nato) }}
        }} GROUP BY ?q ?l ?sl''')
        for r in righe:
            q = r['q']['value'].rsplit('/', 1)[-1]
            info[q] = {k: r[k]['value'] for k in r if k != 'q'}
        time.sleep(1)
    DEDICHE.write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))
    print(f'dedicatari: {len(info)}')
    # Consolari e grandi strade.
    filtro = '|'.join(CONSOLARI)
    per_nome = defaultdict(list)
    for e in chiedi(f'way["highway"]["name"~"^({filtro})$"]{ROMA};out geom;'):
        per_nome[e['tags']['name']].append([[p['lon'], p['lat']] for p in e['geometry']])
    for nome, ls in per_nome.items():
        f.append(feat('consolari', nome, nome, {'type': 'MultiLineString', 'coordinates': ls}))
    print(f'consolari: {len(per_nome)}')
    time.sleep(2)
    # Tram e treni.
    for gruppo, q in [('tram', f'relation["route"="tram"]["ref"]{ROMA};out geom;'),
                      ('treni', f'relation["route"~"^(train|light_rail)$"]["ref"~"^(FL[0-9]|RL|RMV|RMG)"]{ROMA};out geom;'),
                      ('treni', f'relation["route"~"^(train|light_rail)$"]["name"~"Roma.?Lido|Roma.?Viterbo|Roma.?Giardinetti|Termini.?Centocelle"]{ROMA};out geom;')]:
        per_ref = defaultdict(list)
        for e in chiedi(q):
            t = e.get('tags', {})
            ref = t.get('ref') or t.get('name')
            per_ref[ref] += linee([e])
        for ref, ls in per_ref.items():
            f.append(feat(gruppo, ref, ref, {'type': 'MultiLineString', 'coordinates': ls}))
        print(f'{gruppo}: {sorted(per_ref)}')
        time.sleep(2)
    # Aniene, acquedotti, mura.
    for chiave, q in [('aniene', f'way["waterway"="river"]["name"="Aniene"]{ROMA};out geom;'),
                      ('acquedotti', f'way["name"~"^Acquedotto"]{ROMA};out geom;'),
                      ('mura', f'way["historic"="citywalls"]{ROMA};out geom;'),
                      ('marrana', f'way["waterway"]["name"~"[Mm]arrana"]{ROMA};out geom;')]:
        per_nome = defaultdict(list)
        for e in chiedi(q):
            n = e.get('tags', {}).get('name', chiave)
            per_nome[n].append([[p['lon'], p['lat']] for p in e['geometry']])
        for nome, ls in per_nome.items():
            f.append(feat('linee', chiave, nome, {'type': 'MultiLineString', 'coordinates': ls}))
        print(f'{chiave}: {len(per_nome)} nomi')
        time.sleep(2)
    # Luoghi per tag.
    for chiave, filtro in POI.items():
        try:
            el = chiedi(f'{filtro}{ROMA};out center tags;')
        except Exception as e:
            print(f'  {chiave}: errore {e}')
            continue
        n = 0
        for e in el:
            c = punto(e)
            if not c:
                continue
            t = e.get('tags', {})
            f.append(feat('poi', chiave, t.get('name', ''), {'type': 'Point', 'coordinates': c}, wikidata=t.get('wikidata', '')))
            n += 1
        print(f'poi {chiave}: {n}')
        time.sleep(1)
    USCITA.write_text(json.dumps({'type': 'FeatureCollection', 'features': f}, ensure_ascii=False, separators=(',', ':')))
    print(f'Scritte {len(f)} feature in {USCITA.relative_to(RADICE)}')


if __name__ == '__main__':
    main()
