"""Calendario delle domande dal 1 novembre 2026: 5 domande al giorno, mai la stessa domanda in due giorni,
e nello stesso giorno domande il piu diverse possibile (famiglia, tipo, zone giuste, parole del testo).

Regole:
- una domanda scritta a mano al giorno finche ce ne sono (le prime 9 e le chicche di Mino), le altre dalle approvate;
- i giorni gia passati e domani restano fermi: si ripianificano solo i giorni dopo, con le domande non ancora usate;
- le domande nuove approvate allungano il calendario.
Scrive dati/calendario.json e lo copia dentro dati/gioco.json ("calendario": {data: [id, ...]}).

Uso: python3 strumenti/calendario.py   (dopo strumenti/costruisci.py)
     python3 strumenti/calendario.py --fermi-fino-a 2026-11-11   (tiene fermi anche i giorni gia rivisti in anteprima)
"""
import json
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

RADICE = Path(__file__).resolve().parent.parent
GIOCO = RADICE / 'dati' / 'gioco.json'
CALENDARIO = RADICE / 'dati' / 'calendario.json'
INIZIO = date(2026, 11, 1)
# Il primo giorno di Sampietrino (31/10/2026) ha le sue 5 domande, scelte col sistema di prima: contano come gia usate.
FISSI = {'2026-10-31': ['movida', 'metro-a', 'belvedere-themino', 'estero', 'scalinate']}
AL_GIORNO = 5
# Temi: due domande dello stesso tema nello stesso giorno si somigliano anche se le parole sono diverse.
TEMI = {
    'sport': ['stadio', 'calcio', 'mondiali', 'olimpiadi', 'sport'],
    'sacro': ['chiesa', 'basilica', 'cappella', 'madonna', 'gesù', 'papa', 'santa sede', 'catacomb', 'santuario', 'morti', 'cimitero', 'cupolone'],
    'antico': ['antic', 'roman', 'tempio', 'terme', 'circo', 'domus', 'arco', 'acquedotto', 'rovine', 'archeolog', 'tomba', 'obelisco', 'porta delle mura', 'colle'],
    'arte': ['affresco', 'dipinto', 'scultura', "un'opera di", 'galleria', 'museo', 'caravaggio', 'bernini', 'borromini', 'murales', 'statua', 'illusion'],
    'cibo': ['forno', 'gelat', 'cornett', 'locale', 'fraschetta', 'trapizzino', 'pizzeria', 'trattoria', 'caffè', 'grattachecca', 'supplì', 'friggitoria', 'maritozz', 'movida', 'pasticceria'],
    'strade': ['strada', 'scalinata', 'salita', 'vicolo', 'passeggiata', 'circonvallazione'],
    'architetti': ['edificio di', 'architett'],
    'palazzi': ['palazzo', 'edificio', 'villa', 'albergo', 'casa museo'],
    'epoca': ['cinquecento', 'seicento', 'settecento', 'ottocento', 'novecento', 'quattrocento', 'medieval', 'paleocristian', 'dopo la guerra', 'mille', '476'],
    'stile': ['barocc', 'rinasc', 'liberty', 'neoclassic', 'neogotic', 'romanic', 'razionalist'],
    'trasporti': ['metro', 'stazione', 'treno', 'tram', 'autobus', 'fermata', 'raccordo'],
    'acqua': ['fontana', 'acqua', 'tevere', 'aniene', 'nasone', 'ponte', 'mare', 'lago'],
    'verde': ['parco', 'giardino', 'albero', 'collina', 'verde'],
    'vista': ['si vede', 'belvedere', 'panoram', 'cupolone'],
    'mistero': ['mistero', 'leggenda', 'sotto', 'sotterrane', 'estero', 'straniero', 'nazionale'],
    **{n.lower(): [n.lower()] for n in ['Raffaello', 'Michelangelo', 'Bramante', 'Bernini', 'Borromini', 'Caravaggio', 'Valadier', 'Maderno',
                                         'Della Porta', 'Fontana', 'Piacentini']},
}


def chiave(d):
    t = d['testo'].lower()
    return {tema for tema, parole in TEMI.items() if any(p in t for p in parole)}


def simile(a, b):
    """Quanto due domande si somigliano: stessa famiglia o tipo, zone in comune, parole in comune."""
    s = 0.0
    if a.get('famiglia') and a.get('famiglia') == b.get('famiglia'):
        s += 3
    if a.get('tipo') == b.get('tipo'):
        s += 5
    za, zb = set(a['catalogo']), set(b['catalogo'])
    s += 6 * len(za & zb) / max(1, len(za | zb))
    s += 3 * len(chiave(a) & chiave(b))
    return s


def pianifica(domande, giorni_dopo, prima, semi=60):
    """Divide le domande in giorni da AL_GIORNO, cercando la divisione con le domande di ogni giorno piu diverse.
    prima: le domande del giorno precedente (per non ripetere il tema da un giorno all'altro)."""
    migliore, costo_migliore = None, float('inf')
    for seme in range(semi):
        caso = random.Random(seme)
        a_mano = [d for d in domande if not d.get('generata')]
        altre = [d for d in domande if d.get('generata')]
        caso.shuffle(a_mano)
        caso.shuffle(altre)
        piano, costo, ieri = [], 0.0, prima
        while len(a_mano) + len(altre) >= AL_GIORNO and len(piano) < giorni_dopo:
            oggi = []
            if a_mano:
                d = min(a_mano, key=lambda x: sum(simile(x, y) for y in ieri))
                a_mano.remove(d)
                oggi.append(d)
            while len(oggi) < AL_GIORNO:
                pool = altre if altre else a_mano
                d = min(pool, key=lambda x: sum(simile(x, y) for y in oggi) * 2 + sum(simile(x, y) for y in ieri) * 1.2 + caso.random() * 0.3)
                pool.remove(d)
                oggi.append(d)
            costo += sum(simile(x, y) for i, x in enumerate(oggi) for y in oggi[i + 1:])
            piano.append(oggi)
            ieri = oggi
        if costo < costo_migliore:
            migliore, costo_migliore = piano, costo
    return migliore or []


def main():
    g = json.loads(GIOCO.read_text())
    per_id = {d['id']: d for d in g['domande']}
    pool = [d for d in g['domande'] if not d.get('riserva') and not d.get('proposta')]
    vecchio = json.loads(CALENDARIO.read_text())['giorni'] if CALENDARIO.exists() else {}
    # Fermi: i giorni fino a domani (ora di Roma). Gli altri si rifanno con le domande non ancora usate.
    domani = (datetime.now(ZoneInfo('Europe/Rome')) + timedelta(days=1)).date()
    # Ogni correzione alle zone rimescola i giorni dopo: chi sta correggendo la settimana in anteprima la tiene ferma.
    if '--fermi-fino-a' in sys.argv:
        domani = max(domani, date.fromisoformat(sys.argv[sys.argv.index('--fermi-fino-a') + 1]))
    fermi = {k: v for k, v in vecchio.items() if date.fromisoformat(k) <= domani and all(i in per_id for i in v)}
    fermi.update(FISSI)
    usate = {i for v in fermi.values() for i in v}
    libere = [d for d in pool if d['id'] not in usate]
    ultimo = max((date.fromisoformat(k) for k in fermi), default=INIZIO - timedelta(days=1))
    prima = [per_id[i] for i in fermi.get(ultimo.isoformat(), [])]
    piano = pianifica(libere, 10_000, prima)
    giorni = dict(sorted(fermi.items()))
    for n, oggi in enumerate(piano, 1):
        giorni[(ultimo + timedelta(days=n)).isoformat()] = [d['id'] for d in oggi]
    tutte = [i for v in giorni.values() for i in v]
    assert len(tutte) == len(set(tutte)), 'una domanda in due giorni'
    avanzano = [d['id'] for d in pool if d['id'] not in set(tutte)]
    CALENDARIO.write_text(json.dumps({'nota': 'Generato da strumenti/calendario.py: 5 domande al giorno, mai ripetute.',
                                      'giorni': giorni, 'avanzano': avanzano}, ensure_ascii=False, indent=1) + '\n')
    g['calendario'] = giorni
    GIOCO.write_text(json.dumps(g, ensure_ascii=False, separators=(',', ':')).replace(' \u2013 ', ' - ').replace('\u2013', '-').replace('\u2014', '-'))
    fine = max(giorni) if giorni else '-'
    print(f'Calendario: {len(giorni)} giorni, dal {min(giorni)} al {fine}. Avanzano {len(avanzano)} domande. Scritto {CALENDARIO.relative_to(RADICE)}')
    for k in list(giorni)[:5]:
        print(f'  {k}: ' + ' / '.join(per_id[i]['testo'] for i in giorni[k]))


if __name__ == '__main__':
    main()
