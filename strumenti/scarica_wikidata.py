"""Scarica da Wikidata i luoghi di Roma che servono a generare domande nuove (strumenti/genera_domande.py).

Quattro elenchi, tutti con coordinate dentro un riquadro attorno al Raccordo e il numero di voci
Wikipedia (sitelinks), che serve a capire quanto e famoso un luogo:
  luoghi    edifici, monumenti, fontane...: tipo, architetto, autore, stile, dedica, anno
  opere     dipinti, sculture, affreschi, mosaici: autore e luogo dove stanno
  sepolture persone sepolte a Roma: luogo, mestiere, se papa
  set       film girati in un luogo di Roma: regista
Esce dati/fonti/wikidata-roma.json.

Uso: python3 strumenti/scarica_wikidata.py   (serve accesso a query.wikidata.org)
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

USCITA = Path(__file__).resolve().parent.parent / 'dati' / 'fonti' / 'wikidata-roma.json'
BOX = '''SERVICE wikibase:box { ?loc wdt:P625 ?c .
  bd:serviceParam wikibase:cornerSouthWest "Point(12.37 41.79)"^^geo:wktLiteral .
  bd:serviceParam wikibase:cornerNorthEast "Point(12.62 41.99)"^^geo:wktLiteral . }'''
LABEL = lambda v, p: f'OPTIONAL {{ {v} {p} ?_{p[4:]} . ?_{p[4:]} rdfs:label ?{p[4:]}L . FILTER(LANG(?{p[4:]}L)="it") }}'

QUERY = {
    'luoghi': f'''SELECT ?loc ?nome ?c ?sl
      (GROUP_CONCAT(DISTINCT ?tL; separator="|") AS ?tipi) (GROUP_CONCAT(DISTINCT ?aL; separator="|") AS ?architetti)
      (GROUP_CONCAT(DISTINCT ?crL; separator="|") AS ?autori) (GROUP_CONCAT(DISTINCT ?sL; separator="|") AS ?stili)
      (GROUP_CONCAT(DISTINCT ?dL; separator="|") AS ?dediche) (MIN(?anno) AS ?inizio) WHERE {{
      {BOX}
      ?loc rdfs:label ?nome . FILTER(LANG(?nome) = "it")
      ?loc wikibase:sitelinks ?sl .
      OPTIONAL {{ ?loc wdt:P31 ?t . ?t rdfs:label ?tL . FILTER(LANG(?tL)="it") }}
      OPTIONAL {{ ?loc wdt:P84 ?a . ?a rdfs:label ?aL . FILTER(LANG(?aL)="it") }}
      OPTIONAL {{ ?loc wdt:P170 ?cr . ?cr rdfs:label ?crL . FILTER(LANG(?crL)="it") }}
      OPTIONAL {{ ?loc wdt:P149 ?s . ?s rdfs:label ?sL . FILTER(LANG(?sL)="it") }}
      OPTIONAL {{ ?loc wdt:P825 ?d . ?d rdfs:label ?dL . FILTER(LANG(?dL)="it") }}
      OPTIONAL {{ ?loc wdt:P571 ?inc . BIND(YEAR(?inc) AS ?anno) }}
    }} GROUP BY ?loc ?nome ?c ?sl''',
    'opere': f'''SELECT ?opera ?operaL ?osl ?autoreL ?loc ?nome ?c ?sl ?tipoL WHERE {{
      VALUES ?tipo {{ wd:Q3305213 wd:Q860861 wd:Q134194 wd:Q133067 wd:Q179700 }}
      ?opera wdt:P31 ?tipo ; wdt:P276 ?loc ; wdt:P170 ?autore ; wikibase:sitelinks ?osl .
      {BOX}
      ?loc rdfs:label ?nome . FILTER(LANG(?nome) = "it") ?loc wikibase:sitelinks ?sl .
      ?autore rdfs:label ?autoreL . FILTER(LANG(?autoreL) = "it")
      ?tipo rdfs:label ?tipoL . FILTER(LANG(?tipoL) = "it")
      OPTIONAL {{ ?opera rdfs:label ?operaL . FILTER(LANG(?operaL) = "it") }}
    }}''',
    'sepolture': f'''SELECT ?p ?pL ?psl ?loc ?nome ?c ?sl (GROUP_CONCAT(DISTINCT ?mL; separator="|") AS ?mestieri) (SAMPLE(?papa) AS ?papa) WHERE {{
      ?p wdt:P119 ?loc ; wikibase:sitelinks ?psl . FILTER(?psl >= 5)
      {BOX}
      ?loc rdfs:label ?nome . FILTER(LANG(?nome) = "it") ?loc wikibase:sitelinks ?sl .
      ?p rdfs:label ?pL . FILTER(LANG(?pL) = "it")
      OPTIONAL {{ ?p wdt:P106 ?m . ?m rdfs:label ?mL . FILTER(LANG(?mL)="it") }}
      OPTIONAL {{ ?p wdt:P39 wd:Q19546 . BIND(1 AS ?papa) }}
    }} GROUP BY ?p ?pL ?psl ?loc ?nome ?c ?sl''',
    'set': f'''SELECT ?film ?filmL ?fsl ?registaL ?loc ?nome ?c ?sl WHERE {{
      ?film wdt:P915 ?loc ; wdt:P57 ?regista ; wikibase:sitelinks ?fsl .
      {BOX}
      ?loc rdfs:label ?nome . FILTER(LANG(?nome) = "it") ?loc wikibase:sitelinks ?sl .
      ?regista rdfs:label ?registaL . FILTER(LANG(?registaL) = "it")
      OPTIONAL {{ ?film rdfs:label ?filmL . FILTER(LANG(?filmL) = "it") }}
    }}''',
    'committenti': f'''SELECT ?loc ?nome ?c ?sl (GROUP_CONCAT(DISTINCT ?cL; separator="|") AS ?committenti) (GROUP_CONCAT(DISTINCT ?pL; separator="|") AS ?proprietari) WHERE {{
      {BOX}
      ?loc rdfs:label ?nome . FILTER(LANG(?nome) = "it") ?loc wikibase:sitelinks ?sl .
      {{ ?loc wdt:P88 ?cm . ?cm rdfs:label ?cL . FILTER(LANG(?cL)="it") }} UNION {{ ?loc wdt:P127 ?pr . ?pr rdfs:label ?pL . FILTER(LANG(?pL)="it") }}
    }} GROUP BY ?loc ?nome ?c ?sl''',
    'cast': f'''SELECT ?film ?filmL ?fsl ?attoreL ?anno ?loc ?nome ?c ?sl WHERE {{
      ?film wdt:P915 ?loc ; wdt:P161 ?attore ; wikibase:sitelinks ?fsl .
      {BOX}
      ?loc rdfs:label ?nome . FILTER(LANG(?nome) = "it") ?loc wikibase:sitelinks ?sl .
      ?attore rdfs:label ?attoreL . FILTER(LANG(?attoreL) = "it")
      OPTIONAL {{ ?film rdfs:label ?filmL . FILTER(LANG(?filmL) = "it") }}
      OPTIONAL {{ ?film wdt:P577 ?data . BIND(YEAR(?data) AS ?anno) }}
    }}''',
}


def sparql(q):
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q, 'format': 'json'})
    r = urllib.request.Request(url, headers={'User-Agent': 'sampietrino/0.2 (gioco quotidiano su Roma)'})
    for n in range(4):
        try:
            with urllib.request.urlopen(r, timeout=300) as f:
                return json.load(f)['results']['bindings']
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and n < 3:
                print(f'  Wikidata {e.code}, riprovo tra {20 * (n + 1)} s')
                time.sleep(20 * (n + 1))
                continue
            raise


def piatto(riga):
    out = {}
    for k, v in riga.items():
        x = v['value']
        if k == 'c':
            lon, lat = x.replace('Point(', '').rstrip(')').split()
            out['lon'], out['lat'] = round(float(lon), 6), round(float(lat), 6)
        elif k in ('loc', 'opera', 'p', 'film'):
            out[k] = x.rsplit('/', 1)[-1]
        elif v.get('datatype', '').endswith(('integer', 'decimal')):
            out[k] = int(float(x))
        else:
            out[k] = x
    return out


def main():
    # Con dei nomi sulla riga di comando scarica solo quegli elenchi e tiene gli altri gia scaricati.
    solo = sys.argv[1:]
    dati = json.loads(USCITA.read_text()) if solo and USCITA.exists() else {}
    for nome, q in QUERY.items():
        if solo and nome not in solo:
            continue
        dati[nome] = [piatto(r) for r in sparql(q)]
        print(f'{nome}: {len(dati[nome])}')
        time.sleep(2)
    USCITA.write_text(json.dumps(dati, ensure_ascii=False, separators=(',', ':')))
    print(f'Scritto {USCITA}')


if __name__ == '__main__':
    main()
