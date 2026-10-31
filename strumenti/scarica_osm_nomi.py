"""Scarica da OpenStreetMap i nomi di tutte le strade di Roma (col punto centrale), i locali per marchio
e per cucina: servono alle famiglie "nomi", "marchi" e "cucine" di strumenti/genera_domande.py.
Esce dati/fonti/osm-nomi.json: {strade: [[nome, lon, lat]], marchi: [[marchio, nome, lon, lat, tipo]], cucine: [[cucina, nome, lon, lat]]}.

Uso: python3 strumenti/scarica_osm_nomi.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scarica_luoghi import chiedi, ROMA  # noqa: E402
from scarica_osm_extra import punto  # noqa: E402

USCITA = Path(__file__).resolve().parent.parent / 'dati' / 'fonti' / 'osm-nomi.json'


def main():
    out = {'strade': [], 'marchi': [], 'cucine': [], 'locali': []}
    visti = set()
    for e in chiedi(f'way["highway"]["name"]{ROMA};out center tags;'):
        c = punto(e)
        n = e['tags']['name']
        k = (n, round(c[0], 3), round(c[1], 3))
        if c and k not in visti:
            visti.add(k)
            out['strade'].append([n, round(c[0], 6), round(c[1], 6)])
    print(f'strade: {len(out["strade"])}')
    time.sleep(2)
    for e in chiedi(f'nwr["brand"]["amenity"~"restaurant|fast_food|cafe|ice_cream|bar|cinema|pub|theatre"]{ROMA};out center tags;'
                    f'nwr["brand"]["shop"~"bakery|pastry|books|confectionery|deli|wine|music|games|toys|chocolate|coffee|tea|ice_cream"]{ROMA};out center tags;'):
        c = punto(e)
        t = e['tags']
        if c:
            out['marchi'].append([t['brand'], t.get('name', ''), round(c[0], 6), round(c[1], 6), t.get('amenity') or t.get('shop')])
    print(f'marchi: {len(out["marchi"])}')
    time.sleep(2)
    for e in chiedi(f'nwr["cuisine"]["amenity"~"restaurant|fast_food|cafe|ice_cream|bar"]{ROMA};out center tags;'):
        c = punto(e)
        t = e['tags']
        if c:
            for cu in t['cuisine'].split(';'):
                out['cucine'].append([cu.strip().lower(), t.get('name', ''), round(c[0], 6), round(c[1], 6)])
    print(f'cucine: {len(out["cucine"])}')
    time.sleep(2)
    for e in chiedi(f'nwr["name"]["amenity"~"restaurant|fast_food|cafe|bar|pub|ice_cream"]{ROMA};out center tags;'
                    f'nwr["name"]["shop"~"bakery|pastry|butcher|deli|wine|confectionery"]{ROMA};out center tags;'):
        c = punto(e)
        t = e['tags']
        if c:
            out['locali'].append([t['name'], round(c[0], 6), round(c[1], 6), t.get('amenity') or t.get('shop')])
    print(f'locali: {len(out["locali"])}')
    USCITA.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(f'Scritto {USCITA}')


if __name__ == '__main__':
    main()
