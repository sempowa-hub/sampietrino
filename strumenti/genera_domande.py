"""Genera domande nuove sul modello delle 25 di categoria, dai dati di Wikidata e OpenStreetMap.

Famiglie:
  tipi        "Una zona con un tempio romano", "...con delle catacombe"         (Wikidata, tipo del luogo)
  architetti  "Una zona con un edificio di Carlo Maderno"                      (Wikidata, architetto)
  artisti     "Una zona dove vedi un'opera di Raffaello"                       (Wikidata, autore di luoghi e opere)
  stili       "Una zona con un edificio barocco"                               (Wikidata, stile)
  dediche     "Una zona con una chiesa dedicata a Sant'Andrea"                 (Wikidata, dedica)
  epoche      "Una zona con una chiesa del Seicento"                           (Wikidata, anno di fondazione)
  sepolture   "Una zona dove e sepolto un papa"                                (Wikidata, luogo di sepoltura)
  set         "Una zona dove ha girato Fellini"                                (Wikidata, luoghi delle riprese)
  strade      "Una zona con una strada dedicata a un poeta"                    (OSM + Wikidata, dedica delle strade)
  linee       "Una zona attraversata dalla Via Tiburtina", "...dove passa il tram 8"   (OSM)
  luoghi      "Una zona con un forte del Campo trincerato", "...con una madonnella"    (OSM)

Ogni elemento porta la sua fama (voci Wikipedia): costruisci.py da le fasce per zona a quinti, la zona col
luogo piu famoso e Da cartolina. Qui non si filtra niente: le domande con meno di 5 o piu di 40 zone giuste,
o doppioni di altre, le scarta costruisci.py.
Esce dati/domande-generate.json.

Uso: python3 strumenti/genera_domande.py   (dopo scarica_wikidata.py e scarica_osm_extra.py)
"""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
FONTI = RADICE / 'dati' / 'fonti'
USCITA = RADICE / 'dati' / 'domande-generate.json'
# Temi gia coperti dalle 25 di categoria: niente doppioni.
# Luoghi che su Wikidata ci sono ma a Roma non esistono (progetti mai realizzati): via da tutte le domande.
MAI_COSTRUITI = {'Stadio della AS Roma'}
# Luoghi che il tipo Wikidata non prende ma la gente conta: tipo cercato -> nomi in piu (richiesta di Simone e Mino).
IN_PIU = {'stadio': {'stadio Tre Fontane'}}
GIA_FATTI = {'Gian Lorenzo Bernini', 'Francesco Borromini', 'Caravaggio', 'Michelangelo Merisi da Caravaggio'}


def slug(t):
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:60]


def punto(lon, lat):
    return {'type': 'Point', 'coordinates': [lon, lat]}


def parti(s):
    return [x for x in (s or '').split('|') if x]


domande = []


def aggiungi(famiglia, tipo, testo, manca, elementi, chiave=None, famoso=None):
    """famoso: testo della variante coi soli luoghi piu noti, se la domanda ha troppe zone giuste (la sceglie costruisci.py)."""
    if not elementi:
        return
    domande.append({'id': f'gen-{famiglia}-{slug(chiave or testo)}', 'famiglia': famiglia, 'tipo': f'{famiglia}-{tipo}',
                    'testo': testo, 'manca': manca, 'elementi': elementi, **({'famoso': famoso} if famoso else {})})


def famosa(chi):
    """'un poeta' -> 'un poeta famoso', 'una chiesa' -> 'una chiesa famosa'; niente per 'X o Y'."""
    if ' o ' in chi:
        return None
    return f"{chi} {'famosa' if chi.startswith(('una ', "un'")) else 'famoso'}"


def el(nome, fama, geom):
    return {'nome': nome, 'fama': int(fama or 0), 'geom': geom}


# --- Wikidata ---

TIPI = [  # (cerca nel tipo, testo dopo "Una zona con", testo dopo "non c'e")
    ('tempio romano', 'un tempio romano', 'nessun tempio romano'),
    ('tempio', 'un tempio antico', 'nessun tempio antico'),
    ('tomba', 'una tomba antica', 'nessuna tomba antica'),
    ('mausoleo', 'un mausoleo', 'nessun mausoleo'),
    ('sito archeologico', 'un sito archeologico', 'nessun sito archeologico'),
    ('rovine', 'delle rovine antiche', 'nessuna rovina antica'),
    ('domus', 'una domus romana', 'nessuna domus romana'),
    ('villa romana', 'i resti di una villa romana', 'nessuna villa romana antica'),
    ('edificio romano', 'un edificio di epoca romana', 'nessun edificio di epoca romana'),
    ('arco trionfale', 'un arco antico', 'nessun arco antico'),
    ('porta cittadina', 'una porta delle mura', 'nessuna porta delle mura'),
    ('catacombe', 'delle catacombe', 'nessuna catacomba'),
    ('obelisco', 'un obelisco', 'nessun obelisco'),
    ('torre', 'una torre', 'nessuna torre'),
    ('forte', 'un forte', 'nessun forte'),
    ('basilica', 'una basilica', 'nessuna basilica'),
    ('Chiesa nazionale', 'la chiesa nazionale di un paese straniero', 'nessuna chiesa nazionale'),
    ('titolo cardinalizio', 'una chiesa che è titolo di un cardinale', 'nessuna chiesa titolo cardinalizio'),
    ('cappella', 'una cappella', 'nessuna cappella'),
    ('oratorio', 'un oratorio', 'nessun oratorio'),
    ('convento', 'un convento', 'nessun convento'),
    ('monastero', 'un monastero', 'nessun monastero'),
    ('abbazia', "un'abbazia", "nessuna abbazia"),
    ('Collegi pontifici', 'un collegio pontificio', 'nessun collegio pontificio'),
    ('palazzo', 'un palazzo storico', 'nessun palazzo storico'),
    ('piazza', 'una piazza famosa', 'nessuna piazza famosa'),
    ('monumento', 'un monumento', 'nessun monumento'),
    ('statua', 'una statua', 'nessuna statua'),
    ('teatro', 'un teatro', 'nessun teatro'),
    ("museo d'arte", "un museo d'arte", "nessun museo d'arte"),
    ('museo archeologico', 'un museo archeologico', 'nessun museo archeologico'),
    ('casa museo', 'una casa museo', 'nessuna casa museo'),
    ('museo storico', 'un museo di storia', 'nessun museo di storia'),
    ('museo', 'un museo', 'nessun museo'),
    ('albergo', 'un albergo storico', 'nessun albergo storico'),
    ('archivio', 'un archivio', 'nessun archivio'),
    ('istituto di ricerca', 'un istituto di ricerca', 'nessun istituto di ricerca'),
    ('accademia', "un'accademia", "nessuna accademia"),
    ('università', "un'università", "nessuna università"),
    ('ospedale', 'un ospedale', 'nessun ospedale'),
    ('ambasciata', "un'ambasciata", "nessuna ambasciata"),
    ('ponte', 'un ponte', 'nessun ponte'),
    ('cimitero', 'un cimitero', 'nessun cimitero'),
    ('mercato', 'un mercato', 'nessun mercato'),
    ('stadio', 'uno stadio', 'nessuno stadio'),
    ('impianto sportivo', 'un impianto sportivo storico', 'nessun impianto sportivo storico'),
    ('liceo', 'un liceo storico', 'nessun liceo storico'),
    ('scuola', 'una scuola storica', 'nessuna scuola storica'),
    ('biblioteca pubblica', 'una biblioteca pubblica', 'nessuna biblioteca pubblica'),
    ('galleria', "una galleria d'arte", "nessuna galleria d'arte"),
    ('caserma', 'una caserma', 'nessuna caserma'),
    ('ninfeo', 'un ninfeo', 'nessun ninfeo'),
    ('terme', 'delle terme antiche', 'nessuna terma antica'),
    ('circo', 'un circo romano', 'nessun circo romano'),
    ('acquedotto', 'un acquedotto', 'nessun acquedotto'),
    ('colombario', 'un colombario', 'nessun colombario'),
    ('sinagoga', 'una sinagoga', 'nessuna sinagoga'),
    ('moschea', 'una moschea', 'nessuna moschea'),
    ('chiesa ortodossa', 'una chiesa ortodossa', 'nessuna chiesa ortodossa'),
    ('chiesa protestante', 'una chiesa protestante', 'nessuna chiesa protestante'),
    ('casale', 'un casale storico', 'nessun casale storico'),
    ('fontana', 'una fontana', 'nessuna fontana'),
    ('scalinata', 'una scalinata', 'nessuna scalinata'),
    ('colle', 'uno dei colli di Roma', 'nessun colle'),
    ('collina', 'una collina', 'nessuna collina'),
    ('pianta monumentale', 'un albero monumentale', 'nessun albero monumentale'),
    ('organo a canne', 'un organo a canne storico', 'nessun organo storico'),
    ('quartiere fieristico', 'una fiera', 'nessuna fiera'),
    ('centro commerciale', 'un centro commerciale', 'nessun centro commerciale'),
    ('grattacielo', 'un grattacielo', 'nessun grattacielo'),
    ('villa', 'una villa', 'nessuna villa'),
    ('chiesa', 'una chiesa', 'nessuna chiesa'),
    ('edificio', 'un edificio storico', 'nessun edificio storico'),
    ('scultura', "una scultura all'aperto", 'nessuna scultura'),
    ('strada urbana', 'una strada famosa', 'nessuna strada famosa'),
    ('mitreo', 'un mitreo', 'nessun mitreo'),
    ('necropoli', 'una necropoli', 'nessuna necropoli'),
    ('colonna trionfale', 'una colonna antica', 'nessuna colonna antica'),
    ('cisterna', 'una cisterna antica', 'nessuna cisterna antica'),
    ('ipogeo', 'un ipogeo', 'nessun ipogeo'),
    ('santuario', 'un santuario', 'nessun santuario'),
    ('seminario', 'un seminario', 'nessun seminario'),
    ('Università pontificie', "un'università pontificia", "nessuna università pontificia"),
    ('giardino', 'un giardino storico', 'nessun giardino storico'),
    ('parco archeologico', 'un parco archeologico', 'nessun parco archeologico'),
    ('biblioteca', 'una biblioteca', 'nessuna biblioteca'),
    ('Ministero', 'un ministero', 'nessun ministero'),
    ('casa', 'una casa storica', 'nessuna casa storica'),
    ('battaglia', 'il luogo di una battaglia', 'nessun luogo di battaglia'),
    ('assedio', 'il luogo di un assedio', 'nessun luogo di assedio'),
    ('impianto di calcio', 'un campo da calcio storico', 'nessun campo da calcio storico'),
    ('fondazione', 'una fondazione', 'nessuna fondazione'),
]

STILI = [
    (('barocc', 'rococò'), 'un edificio barocco', 'nessun edificio barocco'),
    (('rinasciment',), 'un edificio del Rinascimento', 'nessun edificio rinascimentale'),
    (('neorinasciment',), 'un edificio neorinascimentale', 'nessun edificio neorinascimentale'),
    (('razionalismo', 'movimento moderno'), 'un edificio razionalista', 'nessun edificio razionalista'),
    (('neoromanic',), 'una chiesa neoromanica', 'nessun edificio neoromanico'),
    (('architettura romanica',), 'un edificio romanico', 'nessun edificio romanico'),
    (('neoclassic',), 'un edificio neoclassico', 'nessun edificio neoclassico'),
    (('neogotic',), 'un edificio neogotico', 'nessun edificio neogotico'),
    (('art nouveau', 'liberty'), 'un edificio liberty', 'nessun edificio liberty'),
    (('paleocristian',), 'una chiesa paleocristiana', 'nessuna chiesa paleocristiana'),
    (('eclettic',), 'un edificio eclettico', 'nessun edificio eclettico'),
    (('neobarocc',), 'un edificio neobarocco', 'nessun edificio neobarocco'),
    (('brutalis',), 'un edificio brutalista', 'nessun edificio brutalista'),
    (('postmodern',), 'un edificio postmoderno', 'nessun edificio postmoderno'),
    (('gotic',), 'un edificio gotico', 'nessun edificio gotico'),
]

DEDICHE = {
    'Maria': 'alla Madonna', 'Gesù': 'a Gesù', 'Andrea': "a Sant'Andrea", 'Giovanni Battista': 'a San Giovanni Battista',
    'Pietro': 'a San Pietro', 'Giuseppe': 'a San Giuseppe', 'Sacro Cuore di Gesù': 'al Sacro Cuore', 'San Lorenzo': 'a San Lorenzo',
    'Nicola di Bari': 'a San Nicola', 'Paolo di Tarso': 'a San Paolo', 'papa Silvestro I': 'a San Silvestro', 'Trinità': 'alla Trinità',
    'Santissimo Sacramento': 'al Santissimo Sacramento', 'Nostra Signora del Monte Carmelo': 'alla Madonna del Carmine',
    'Santa Lucia': 'a Santa Lucia', 'Bartolomeo': 'a San Bartolomeo', 'Maria Addolorata': "all'Addolorata",
    'Madonna delle Grazie': 'alla Madonna delle Grazie', 'Antonio di Padova': "a Sant'Antonio", 'Carlo Borromeo': 'a San Carlo',
    'san Girolamo': 'a San Girolamo', 'Stefano': 'a Santo Stefano', "Caterina d'Alessandria": 'a Santa Caterina',
    "Sant'Ambrogio": "a Sant'Ambrogio", 'Giacomo il Maggiore': 'a San Giacomo', "Chiara d'Assisi": 'a Santa Chiara',
    'Madonna del Rosario': 'alla Madonna del Rosario', 'Vincenzo di Saragozza': 'a San Vincenzo', 'papa Gregorio I': 'a San Gregorio',
    'san Sebastiano': 'a San Sebastiano', "Sant'Agata": "a Sant'Agata", 'Spirito Santo': 'allo Spirito Santo',
    'Francesco d\'Assisi': 'a San Francesco', 'Agnese': "a Sant'Agnese", 'Cecilia': 'a Santa Cecilia', 'Michele arcangelo': 'a San Michele',
    'Marco evangelista': 'a San Marco', 'Benedetto da Norcia': 'a San Benedetto', 'Filippo Neri': 'a San Filippo Neri',
    'Ignazio di Loyola': "a Sant'Ignazio", 'Rita da Cascia': 'a Santa Rita', 'Pio da Pietrelcina': 'a Padre Pio',
    'Giovanni Bosco': 'a Don Bosco', 'Anna': "a Sant'Anna", 'Croce': 'alla Croce', 'Vera Croce': 'alla Croce',
}

EPOCHE = [  # (da, a, testo per chiese, testo per palazzi)
    (-1000, 999, 'paleocristiana o altomedievale (prima del Mille)', None),
    (1000, 1399, 'medievale', 'medievale'),
    (1400, 1499, 'del Quattrocento', 'del Quattrocento'),
    (1500, 1599, 'del Cinquecento', 'del Cinquecento'),
    (1600, 1699, 'del Seicento', 'del Seicento'),
    (1700, 1799, 'del Settecento', 'del Settecento'),
    (1800, 1899, "dell'Ottocento", "dell'Ottocento"),
    (1900, 1945, 'del primo Novecento', 'del primo Novecento'),
    (1946, 2100, 'moderna (dopo la guerra)', 'moderno (dopo la guerra)'),
]

SEPOLTURE = [
    ('papa', None, 'un papa'), ('poeta', ('poeta', 'poetessa'), 'un poeta'), ('scrittore', ('scrittore', 'scrittrice', 'romanziere'), 'uno scrittore'),
    ('pittore', ('pittore', 'pittrice'), 'un pittore'), ('scultore', ('scultore',), 'uno scultore'), ('architetto', ('architetto',), 'un architetto'),
    ('musicista', ('compositore', 'musicista', 'cantante'), 'un musicista'), ('attore', ('attore', 'attrice'), 'un attore'),
    ('regista', ('regista',), 'un regista'), ('politico', ('politico',), 'un politico'), ('cardinale', ('cardinale',), 'un cardinale'),
    ('santo', ('santo', 'martire'), 'un santo'), ('militare', ('militare', 'generale'), 'un militare'), ('filosofo', ('filosofo',), 'un filosofo'),
    ('scienziato', ('fisico', 'chimico', 'matematico', 'medico', 'astronomo'), 'uno scienziato'), ('nobile', ('nobile', 'aristocratico'), 'un nobile'),
    ('imperatore', ('imperatore',), 'un imperatore'), ('re', ('monarca', 'sovrano', 'regina', 're '), 'un re o una regina'),
]

PERSONE = [  # strade: (chiave, parole nei mestieri, testo dopo "dedicata a")
    ('poeta', ('poeta', 'poetessa'), 'un poeta'), ('scrittore', ('scrittore', 'scrittrice', 'romanziere', 'novellista', 'drammaturgo'), 'uno scrittore'),
    ('pittore', ('pittore', 'pittrice'), 'un pittore'), ('scultore', ('scultore', 'scultrice'), 'uno scultore'),
    ('architetto', ('architetto',), 'un architetto'), ('musicista', ('compositore', 'musicista', "direttore d'orchestra", 'pianista', 'violinista'), 'un musicista'),
    ('cantante', ('cantante', 'cantautore', 'tenore', 'soprano'), 'un cantante'), ('attore', ('attore', 'attrice'), "un attore o un'attrice"),
    ('regista', ('regista',), 'un regista'), ('scienziato', ('fisico', 'chimico', 'matematico', 'astronomo', 'biologo', 'scienziato', 'naturalista', 'geologo', 'botanico'), 'uno scienziato'),
    ('medico', ('medico', 'chirurgo'), 'un medico'), ('filosofo', ('filosofo',), 'un filosofo'),
    ('esploratore', ('esploratore', 'navigatore', 'viaggiatore'), 'un esploratore o un navigatore'),
    ('militare', ('militare', 'generale', 'ammiraglio', 'ufficiale', 'condottiero'), 'un militare'),
    ('partigiano', ('partigiano', 'partigiana', 'antifascista', 'resistente'), 'un partigiano'),
    ('politico', ('politico',), 'un politico'), ('giornalista', ('giornalista',), 'un giornalista'),
    ('storico', ('storico', 'archeologo'), 'uno storico o un archeologo'), ('ingegnere', ('ingegnere', 'inventore'), 'un ingegnere o un inventore'),
    ('sportivo', ('calciatore', 'ciclista', 'atleta', 'pugile', 'allenatore', 'pilota automobilistico', 'nuotatore'), 'uno sportivo'),
    ('aviatore', ('aviatore', 'pilota'), 'un aviatore'), ('giurista', ('giurista', 'avvocato', 'magistrato'), 'un giurista'),
    ('religioso', ('presbitero', 'sacerdote', 'religioso', 'monaco', 'vescovo', 'frate', 'missionario'), 'un prete o un religioso'),
    ('patriota', ('patriota', 'rivoluzionario', 'carbonaro'), 'un patriota del Risorgimento'),
    ('economista', ('economista', 'imprenditore', 'banchiere'), 'un economista o un imprenditore'),
    ('educatore', ('pedagogista', 'insegnante', 'educatore'), 'un insegnante o un pedagogista'),
    ('letterato', ('letterato', 'umanista', 'linguista', 'filologo'), 'un letterato'),
    ('sindacalista', ('sindacalista',), 'un sindacalista'), ('fotografo', ('fotografo',), 'un fotografo'),
    ('poliziotto', ('poliziotto', 'carabiniere'), 'un carabiniere o un poliziotto'), ('diplomatico', ('diplomatico',), 'un diplomatico'),
    ('imperatore', ('imperatore',), 'un imperatore'), ('papa', ('papa',), 'un papa'), ('santo', ('santo', 'martire'), 'un santo'),
    ('re', ('monarca', 'sovrano', 'regina'), 'un re o una regina'), ('astronauta', ('astronauta',), 'un astronauta'),
    ('stilista', ('stilista', 'designer'), 'uno stilista o un designer'), ('fumettista', ('fumettista', 'illustratore'), 'un fumettista o un illustratore'),
]
COSE = [  # strade: (chiave, parole nel tipo del dedicatario, testo dopo "dedicata a", testo manca)
    ('regione', ("regione d'Italia",), 'una regione italiana'),
    ('capoluogo', ('capoluogo di provincia', 'capoluogo di regione'), 'un capoluogo di provincia'),
    ('comune', ("comune d'Italia", 'comune italiano'), 'un comune italiano'),
    ('capitale', ('capitale',), 'una capitale straniera'),
    ('paese', ('stato sovrano', 'paese'), 'un paese straniero'),
    ('citta-estera', ('città', 'grande città', 'metropoli'), 'una città'),
    ('fiume', ('fiume',), 'un fiume'), ('lago', ('lago',), 'un lago'),
    ('monte', ('montagna', 'monte', 'vulcano', 'gruppo montuoso', 'catena montuosa'), 'un monte'),
    ('isola', ('isola',), "un'isola"), ('mare', ('mare',), 'un mare'),
    ('battaglia', ('battaglia', 'assedio'), 'una battaglia'),
    ('divinita', ('divinità',), 'una divinità antica'), ('mito', ('personaggio mitologico', 'figura della mitologia'), 'un personaggio del mito'),
    ('popolo', ('popolo', 'popolazione', 'gruppo etnico', 'tribù'), 'un popolo antico'),
    ('mestiere', ('professione', 'occupazione', 'mestiere'), 'un antico mestiere'),
    ('famiglia', ('famiglia nobile', 'famiglia', 'casata', 'dinastia'), 'una famiglia nobile'),
    ('pianta', ('taxon', 'specie'), 'una pianta o un animale'),
    ('astro', ('costellazione', 'pianeta', 'stella'), 'una stella o un pianeta'),
    ('evento', ('evento', 'data', 'ricorrenza', 'festa'), 'una data o un evento storico'),
    ('ordine', ('ordine religioso', 'congregazione'), 'un ordine religioso'),
    ('chiesa', ('chiesa', 'basilica'), 'una chiesa'),
    ('universita', ('università',), "un'università"),
    ('colle', ('colle', 'collina'), 'un colle'),
    ('nave', ('nave',), 'una nave'),
    ('opera', ('opera lirica', 'opera letteraria', 'poema'), "un'opera famosa"),
]
PAESI = {'Francia': 'un francese', 'Germania': 'un tedesco', 'Regno Unito': 'un inglese', 'Spagna': 'uno spagnolo', 'Stati Uniti d\'America': 'un americano',
         'Russia': 'un russo', 'Unione Sovietica': 'un russo', 'Grecia': 'un greco', 'Polonia': 'un polacco', 'Argentina': 'un argentino', 'Brasile': 'un brasiliano'}

CONSOLARI = {'Via Flaminia': 'dalla Via Flaminia', 'Via Salaria': 'dalla Via Salaria', 'Via Nomentana': 'dalla Via Nomentana', 'Via Tiburtina': 'dalla Via Tiburtina',
             'Via Prenestina': 'dalla Via Prenestina', 'Via Casilina': 'dalla Casilina', 'Via Tuscolana': 'dalla Tuscolana', 'Via Appia Nuova': "dall'Appia Nuova",
             'Via Appia Antica': "dall'Appia Antica", 'Via Ardeatina': "dall'Ardeatina", 'Via Ostiense': "dall'Ostiense", 'Via Portuense': 'dalla Portuense',
             'Via Aurelia': "dall'Aurelia", 'Via Cassia': 'dalla Cassia', 'Via Collatina': 'dalla Collatina', 'Via Laurentina': 'dalla Laurentina',
             'Via Trionfale': 'dalla Trionfale', 'Via Cristoforo Colombo': 'dalla Cristoforo Colombo', 'Via del Corso': 'da Via del Corso', 'Via Nazionale': 'da Via Nazionale'}

POI = {  # chiave OSM -> (testo dopo "Una zona con", manca)
    'forte': ('un forte del Campo trincerato', 'nessun forte'), 'madonnella': ('una madonnella (edicola sacra) censita', 'nessuna madonnella censita'),
    'inciampo': ("una pietra d'inciampo", "nessuna pietra d'inciampo"), 'moschea': ('una moschea o una sala di preghiera islamica', 'nessuna moschea'),
    'sinagoga': ('una sinagoga', 'nessuna sinagoga'), 'ortodossa': ('una chiesa ortodossa', 'nessuna chiesa ortodossa'),
    'evangelica': ('una chiesa protestante', 'nessuna chiesa protestante'), 'buddista': ('un tempio buddista, induista o sikh', 'nessun tempio orientale'),
    'obelisco': ('un obelisco', 'nessun obelisco'), 'torre': ('una torre storica', 'nessuna torre storica'), 'mausoleo': ('una tomba antica con un nome', 'nessuna tomba antica'),
    'acquedotto-resti': ('i resti di un acquedotto', 'nessun resto di acquedotto'), 'serbatoio': ("un serbatoio dell'acqua", "nessun serbatoio dell'acqua"),
    'stadio': ('uno stadio', 'nessuno stadio'), 'piscina': ('una piscina', 'nessuna piscina'), 'ippica': ('un maneggio', 'nessun maneggio'),
    'golf': ('un campo da golf', 'nessun campo da golf'), 'orti': ('degli orti urbani', 'nessun orto urbano'), 'vigna': ('una vigna', 'nessuna vigna'),
    'cimitero': ('un cimitero', 'nessun cimitero'), 'centro-sociale': ('un centro sociale', 'nessun centro sociale'),
    'osservatorio': ('un osservatorio', 'nessun osservatorio'), 'ambasciata': ("un'ambasciata", "nessuna ambasciata"), 'museo': ('un museo', 'nessun museo'),
    'mercato': ('un mercato rionale', 'nessun mercato rionale'), 'skatepark': ('uno skatepark', 'nessuno skatepark'), 'teatro-tenda': ('un teatro', 'nessun teatro'),
    'ponte': ('un ponte con un nome', 'nessun ponte con un nome'), 'fontanella': ('una fontana con un nome', 'nessuna fontana con un nome'),
    'gelateria': ('una gelateria', 'nessuna gelateria'), 'birreria': ('un pub', 'nessun pub'), 'libreria': ('una libreria', 'nessuna libreria'),
    'vinile': ('un negozio di dischi', 'nessun negozio di dischi'), 'fumetti': ('una fumetteria', 'nessuna fumetteria'), 'cartoleria-storica': ("un negozio d'antiquariato", "nessun antiquario"),
    'galleria-arte': ("una galleria d'arte", "nessuna galleria d'arte"), 'hotel-lusso': ('un hotel a cinque stelle', 'nessun cinque stelle'),
    'ostello': ('un ostello', 'nessun ostello'), 'campeggio': ('un campeggio', 'nessun campeggio'), 'zoo': ('uno zoo', 'nessuno zoo'),
    'parco-giochi-grande': ('un parco acquatico', 'nessun parco acquatico'), 'cinema-aperto': ("un cinema all'aperto", "nessun cinema all'aperto"),
    'circolo-tennis': ('un circolo del tennis', 'nessun circolo del tennis'), 'canottaggio': ('un circolo di canottaggio', 'nessun circolo di canottaggio'),
    'bocce': ('un campo da bocce', 'nessun campo da bocce'), 'padel': ('un campo da padel', 'nessun campo da padel'), 'rugby': ('un campo da rugby', 'nessun campo da rugby'),
    'basket-playground': ('un campetto da basket con un nome', 'nessun campetto da basket'), 'scuola-lingue': ('una scuola di lingue', 'nessuna scuola di lingue'),
    'conservatorio': ('una scuola di musica', 'nessuna scuola di musica'), 'accademia-straniera': ("un'accademia o un istituto straniero", "nessuna accademia straniera"),
    'carcere': ('un carcere', 'nessun carcere'), 'caserma': ('una caserma', 'nessuna caserma'), 'ospedale': ('un ospedale', 'nessun ospedale'),
    'universita': ("una sede universitaria", "nessuna sede universitaria"), 'mattatoio-fabbrica': ('una vecchia fabbrica', 'nessuna vecchia fabbrica'),
    'tram-deposito': ('un deposito dei tram o dei treni', 'nessun deposito'), 'murale': ('un murale', 'nessun murale'), 'statua': ('una statua con un nome', 'nessuna statua'),
    'busto': ('un busto commemorativo', 'nessun busto'), 'lapide': ('una lapide storica', 'nessuna lapide'), 'monumento-caduti': ('un monumento ai caduti', 'nessun monumento ai caduti'),
    'faro': ('un faro', 'nessun faro'),
}


NOMI = [  # strade per come si chiamano: (regex sul nome, testo dopo "Una zona con", manca)
    (r'^Clivo ', 'un clivo (una strada che si chiama Clivo)', 'nessun clivo'),
    (r'^Salita ', 'una strada che si chiama Salita', 'nessuna Salita'),
    (r'^Vicolo ', 'un vicolo', 'nessun vicolo'),
    (r'^(Scalinata|Scala|Scalea) ', 'una strada che è una scalinata', 'nessuna scalinata con un nome'),
    (r'^Borgo ', 'una strada che si chiama Borgo', 'nessun Borgo'),
    (r'^Rampa ', 'una strada che si chiama Rampa', 'nessuna Rampa'),
    (r'^Passeggiata ', 'una passeggiata', 'nessuna passeggiata'),
    (r'^Galleria ', 'una galleria (un tunnel o un passaggio con un nome)', 'nessuna galleria'),
    (r'^Circonvallazione ', 'una circonvallazione', 'nessuna circonvallazione'),
    (r'^Largo ', 'un largo', 'nessun largo'),
    (r'^Piazzale ', 'un piazzale', 'nessun piazzale'),
    (r'^Discesa ', 'una strada che si chiama Discesa', 'nessuna Discesa'),
    (r'^Traversa ', 'una strada che si chiama Traversa', 'nessuna Traversa'),
    (r'^Strada ', 'una strada che si chiama proprio Strada', 'nessuna Strada'),
    (r'^Viottolo |^Sentiero |^Stradone ', 'un viottolo o uno stradone', 'nessun viottolo'),
    (r'\b(\d+|[IVXL]+) (Gennaio|Febbraio|Marzo|Aprile|Maggio|Giugno|Luglio|Agosto|Settembre|Ottobre|Novembre|Dicembre)\b', 'una strada che porta una data', 'nessuna strada con una data'),
    (r'Madonna', 'una strada col nome della Madonna', 'nessuna strada della Madonna'),
    (r'\b(Fosso|Marrana|Rio) ', 'una strada col nome di un fosso o di una marrana', 'nessuna strada di un fosso'),
    (r'\b(Casale|Tenuta) ', 'una strada col nome di un casale o di una tenuta', 'nessuna strada di un casale'),
    (r'\bTor(re)? ', 'una strada col nome di una torre', 'nessuna strada di una torre'),
    (r'\bPorta ', 'una strada col nome di una porta', 'nessuna strada di una porta'),
    (r'\bPonte ', 'una strada col nome di un ponte', 'nessuna strada di un ponte'),
    (r'\bFontan', 'una strada col nome di una fontana', 'nessuna strada di una fontana'),
    (r'\bVigna ', 'una strada col nome di una vigna', 'nessuna strada di una vigna'),
    (r'\bValle ', 'una strada col nome di una valle', 'nessuna strada di una valle'),
    (r'\bGrott', 'una strada col nome di una grotta', 'nessuna strada di una grotta'),
    (r'\bAcqua ', "una strada col nome di un'acqua (una sorgente)", "nessuna strada di un'acqua"),
    (r'\bArco ', 'una strada col nome di un arco', 'nessuna strada di un arco'),
    (r'\b(Gatt[ao]|Lup[ao]|Orso|Cavall[oi]|Pavone|Leone|Elefante|Aquila|Colomba|Gallo|Pecor|Capr[ae]|Vacca|Bufal|Cervo|Volpe|Civetta|Merlo|Passer|Rondin|Delfin|Pesce|Lepre|Asin|Mulo|Biscion|Serpent|Scimmi|Formic|Ap[ei] )', 'una strada col nome di un animale', 'nessuna strada di un animale'),
    (r'\b(Rosa|Rose|Viol|Gigli|Garofan|Tulipan|Margherit|Gelsomin|Glicin|Ortensi|Mughett|Ciclamin|Camelie|Azalee|Papaver|Iris|Lill[aà]|Orchide)', 'una strada col nome di un fiore', 'nessuna strada di un fiore'),
    (r'\b(Querc|Pin[io] |Olm[io]|Platan|Castagn|Cipress|Ulivo|Olivi|Eucalipt|Tigl|Fagg|Acer[io]|Pioppi|Salic|Mandorl|Cilieg|Fic[ho]|Gels[io]|Nocci|Nespol|Melograni|Arancio|Limon)', 'una strada col nome di un albero', 'nessuna strada di un albero'),
    (r'\b(Santa Maria|Madonna)\b', 'una strada intitolata a Santa Maria', 'nessuna strada di Santa Maria'),
    (r'\bCampo\b', 'una strada col nome di un campo', 'nessuna strada di un campo'),
    (r'\b(Pozzo|Pozzi|Cisterna)\b', 'una strada col nome di un pozzo', 'nessuna strada di un pozzo'),
    (r'\b(Mol[ei]no|Mulin[oi])\b', 'una strada col nome di un mulino', 'nessuna strada di un mulino'),
    (r'\b(Osteria|Taverna|Locanda)\b', "una strada col nome di un'osteria", "nessuna strada di un'osteria"),
    (r'\b(Chiavari|Cappellari|Coronari|Funari|Giubbonari|Baullari|Falegnami|Sediari|Canestrari|Chiodaroli|Catinari|Vaccinari|Pettinari|Barbieri|Calderari|Staderari|Cartari|Leutari|Orefici|Fornaci|Vetrari|Ramaroli|Spadari|Bottegh)', 'una strada col nome di un antico mestiere', 'nessuna strada di un antico mestiere'),
    (r'\b(Tre|Quattro|Cinque|Sette|Dodici) ', 'una strada con un numero nel nome', 'nessuna strada con un numero'),
    (r'\b(Re|Regina|Principe|Principessa|Duca|Conte|Marchese|Papa|Cardinale)\b', 'una strada col titolo di un nobile (re, duca, conte, cardinale...)', 'nessuna strada di un titolo nobile'),
    (r'\b(Lago|Laghetto)\b', 'una strada col nome di un lago', 'nessuna strada di un lago'),
    (r'\b(Mare|Isola|Isole|Spiaggia|Porto)\b', 'una strada che sa di mare', 'nessuna strada col mare nel nome'),
    (r'\b(Sole|Luna|Stelle|Stella|Cielo|Pianeti|Costellazion)', 'una strada col nome di un astro', 'nessuna strada di un astro'),
    (r'\b(Vento|Venti|Pioggia|Neve|Nuvol|Tramontana|Libeccio|Scirocco|Maestrale)', 'una strada col nome del tempo che fa', 'nessuna strada del meteo'),
]
COMMITTENTI = {'Ministero delle poste e telegrafi': 'Una zona con un palazzo delle Poste storico', 'Benito Mussolini': 'Una zona con un luogo voluto da Mussolini',
               'Ordine di Malta': "Una zona con un luogo dell'Ordine di Malta", 'Compagnia di Gesù': 'Una zona con un luogo dei Gesuiti'}
PROPRIETARI = {'Santa Sede': 'Una zona con una proprietà della Santa Sede', 'Italia': 'Una zona con un bene dello Stato italiano',
               'Roma Capitale': 'Una zona con un bene di Roma Capitale', 'Sovrano Militare Ordine di Malta': "Una zona con un luogo dell'Ordine di Malta",
               'Compagnia di Gesù': 'Una zona con un luogo dei Gesuiti', 'Fondo Edifici di Culto': 'Una zona con una chiesa del Fondo Edifici di Culto'}
FAMIGLIE = ['Colonna', 'Orsini', 'Borghese', 'Barberini', 'Chigi', 'Farnese', 'Pamphilj', 'Doria', 'Massimo', 'Torlonia', 'Odescalchi', 'Altieri',
            'Rospigliosi', 'Ludovisi', 'Caetani', 'Corsini', 'Sciarra', 'Spada', 'Mattei', 'Altemps', 'Savelli', 'Medici', 'Aldobrandini',
            'Boncompagni', 'Ruspoli', 'Lancellotti', 'Cenci', 'Giustiniani', 'Patrizi', 'Muti', 'Sacchetti', 'Falconieri', 'Riario', 'Pallavicini',
            'Del Drago', 'Theodoli', 'Grazioli', 'Brancaccio', 'Lante', 'Ricci', 'Salviati', 'Della Rovere', 'Borgia', 'Cesi', 'Capranica']
SANTI = ['San Giovanni', 'San Pietro', 'San Paolo', 'San Lorenzo', 'San Sebastiano', 'San Francesco', "Sant'Antonio", 'San Marco', "Sant'Agnese",
         'Santa Croce', 'San Giuseppe', 'San Martino', 'San Nicola', 'San Gregorio', 'San Clemente', "Sant'Andrea", 'Santa Cecilia', 'San Michele',
         'San Basilio', 'San Benedetto', 'San Vito', 'Santo Stefano', 'San Bartolomeo', 'San Silvestro', 'San Carlo', 'San Filippo', "Sant'Ignazio",
         'San Tommaso', 'Santa Caterina', "Sant'Anna", 'Santa Lucia', 'San Giorgio', 'San Biagio', 'San Cosimato', 'San Saba', 'San Teodoro']
GENERICI = {'Roma', 'Europa', 'Italia', 'Lazio', 'Città del Vaticano', 'Stato Pontificio', 'Roma antica', 'Impero romano', 'Provincia di Roma',
            'Città metropolitana di Roma Capitale', 'Agro romano', 'Tevere'}
TROPPO_SPECIFICI = ['mitreo', 'ipogeo', 'colombario', 'ninfeo', 'cisterna', 'necropoli', 'oratorio', 'titolo di un cardinale', 'collegio pontificio',
                    'seminario', 'università pontificia', 'organo a canne', 'archivio', 'istituto di ricerca', 'fondazione', 'ministero', 'clivo',
                    'rampa', 'traversa', 'viottolo', 'proprio strada', 'galleria (un tunnel', 'discesa', 'eclettico', 'neobarocco', 'neorinascimentale',
                    'brutalista', 'postmoderno', 'neoromanica', 'fondo edifici', 'di proprietà', 'bene dello stato', 'bene di roma capitale',
                    'cappella', 'convento', 'monastero', 'casa storica', 'assedio', 'mausoleo', 'santissimo sacramento', 'addolorata', 'madonna del carmine',
                    'san silvestro', 'palazzo delle poste', 'scuola storica', 'liceo storico', 'biblioteca', 'caserma', 'accademia', 'impianto sportivo']
ARCHITETTI_FAMOSI = ['Michelangelo', 'Bramante', 'Raffaello', 'Maderno', 'Della Porta', 'Domenico Fontana', 'Valadier', 'Pietro da Cortona',
                     'Nervi', 'Fuksas', 'Hadid', 'Renzo Piano', 'Meier', 'Apollodoro']
ARTISTI_FAMOSI = ['Raffaello', 'Michelangelo']  # gli altri (Rubens, Reni...) sono troppo specifici per una zona
SEPOLTI_OK = ['un papa']
CINEMA_FAMOSI = ['Alberto Sordi', 'Anna Magnani', 'Carlo Verdone', 'Gigi Proietti', 'Nino Manfredi', 'Marcello Mastroianni', 'Vittorio Gassman', 'Totò',
                 'Sophia Loren', 'Monica Vitti', 'Aldo Fabrizi', 'Claudia Cardinale', 'Audrey Hepburn', 'Gregory Peck', 'Toni Servillo', 'Elio Germano',
                 'Federico Fellini', 'Pier Paolo Pasolini', 'Paolo Sorrentino', 'Nanni Moretti', 'Roberto Rossellini', 'Vittorio De Sica', 'Mario Monicelli',
                 'Ettore Scola', 'Matteo Garrone', 'Ferzan Özpetek', 'Woody Allen', 'William Wyler', 'Bernardo Bertolucci', 'Sergio Leone', 'Dino Risi',
                 'Luchino Visconti', 'Michelangelo Antonioni', 'Gabriele Muccino', 'Claudio Santamaria', 'Pierfrancesco Favino', 'Kim Rossi Stuart', 'Enrico Montesano']
PAPI_FAMOSI = ['Sisto V', 'Giulio II', 'Urbano VIII', 'Alessandro VII', 'Innocenzo X', 'Leone X', 'Paolo III', 'Pio IX', 'Gregorio XIII', 'Clemente VII',
               'Sisto IV', 'Paolo V', 'Benedetto XIV', 'Pio VI', 'Pio VII']
LOCALI_ROMANI = ['fraschetta', 'norcineria', 'un forno', 'cornetteria', 'friggitoria', 'grattachecca', 'maritozzi', 'Sora']  # osteria, trattoria: troppo vaghe
STORICI = {  # locali storici romani per nome (OSM), al posto delle catene
    'un caffè storico (Sant\'Eustachio, Tazza d\'Oro, Greco, Rosati...)': ["Sant'Eustachio", "Tazza d'Oro", 'Caffè Greco', 'Rosati', 'Canova', 'Sciascia',
                                                                      'Bar del Fico', 'Bar San Calisto', 'Babington', 'Antico Caffè', 'Caffè Camerino', 'Faggiani'],
    'una gelateria storica (Giolitti, Fassi, San Crispino...)': ['Giolitti', 'Fassi', 'Palazzo del Freddo', 'San Crispino', 'Tre Scalini',
                                                              'Alberto Pica', 'Duse', 'Mondi', 'Pellacchia', 'Petrini'],
    'un forno o una pasticceria storica (Roscioli, Regoli, Boccione...)': ['Roscioli', 'Regoli', 'Boccione', 'Innocenti', 'Panella', 'Forno Campo de',
                                                                        'Antico Forno', 'Dolce Maniera', 'Cristalli di Zucchero', 'Andreotti', 'Bonci', 'Castroni', 'Volpetti'],
    "una trattoria storica (Sora Lella, Checchino, Armando...)": ['Sora Lella', 'Checchino', 'Armando al Pantheon', 'Da Felice', 'Velavevodetto', 'Cesare al Casaletto',
                                                                   'Da Enzo', 'Sora Margherita', 'Piperno', 'Nonna Betta', 'Da Danilo', 'Da Cesare', 'Da Augusto',
                                                                   'Tram Tram', "Checco er Carettiere", 'Dal Toscano', 'Da Teo', 'Da Gino', 'Da Oio', 'Pommidoro', 'Da Lucia', 'Agustarello'],
    'una pizzeria storica (Baffetto, Ai Marmi, Remo...)': ['Baffetto', 'Ai Marmi', 'Da Remo', 'Ivo a Trastevere', 'Dar Poeta', 'Gatta Mangiona', 'Da Francesco',
                                                         'Pizzarium', 'Emma', 'Pizzeria Ostiense', 'Seu', 'Montecarlo', 'Sforno', 'Da Ennio', 'Pizza Re'],
}
MARCHI_NOMI = {'Alice': "un'Alice Pizza", 'Alice Pizza': "un'Alice Pizza", 'La Feltrinelli': 'una libreria Feltrinelli', 'Feltrinelli': 'una libreria Feltrinelli',
               'La Piadineria': 'una Piadineria', 'Mondadori': 'una libreria Mondadori', 'Grom': 'una gelateria Grom', 'Trapizzino': 'un Trapizzino',
               'Venchi': 'un Venchi', 'Starbucks': 'uno Starbucks', 'Rosati': 'un bar Rosati', 'Fassi': 'una gelateria Fassi'}
MARCHI_NO = {'eni', 'q8', 'ip', 'tamoil', 'esso', 'agip', 'conad', 'carrefour', 'coop', 'lidl', 'eurospin', 'pam', 'tigre', 'todis', 'despar', 'sigma',
             'md', 'penny', 'crai', 'elite', 'mcdonald\'s', 'burger king'}
CUCINE = {
    'japanese': 'un ristorante giapponese', 'sushi': 'un sushi', 'chinese': 'un ristorante cinese', 'indian': 'un ristorante indiano',
    'kebab': 'un kebab', 'mexican': 'un ristorante messicano', 'ethiopian': 'un ristorante etiope o eritreo', 'eritrean': 'un ristorante etiope o eritreo',
    'peruvian': 'un ristorante peruviano', 'lebanese': 'un ristorante libanese', 'greek': 'un ristorante greco', 'thai': 'un ristorante thailandese',
    'korean': 'un ristorante coreano', 'vietnamese': 'un ristorante vietnamita', 'turkish': 'un ristorante turco', 'burger': 'un burger',
    'jewish': 'una cucina ebraica', 'kosher': 'una cucina kosher', 'vegan': 'un ristorante vegano', 'vegetarian': 'un ristorante vegetariano',
    'seafood': 'un ristorante di pesce', 'fish': 'un ristorante di pesce', 'steak_house': 'una bisteccheria', 'ramen': 'un ramen',
    'poke': 'un poke', 'crepe': 'una creperia', 'donut': 'un posto di ciambelle', 'bagel': 'un bagel', 'sicilian': 'una cucina siciliana',
    'neapolitan': 'una pizzeria napoletana', 'regional': 'una cucina regionale', 'roman': 'una trattoria romana', 'brazilian': 'un ristorante brasiliano',
    'argentinian': 'una griglieria argentina', 'american': 'un locale americano', 'spanish': 'un ristorante spagnolo', 'french': 'un ristorante francese',
    'african': 'un ristorante africano', 'arab': 'un ristorante arabo', 'pakistani': 'un ristorante pakistano', 'bangladeshi': 'un ristorante bengalese',
    'filipino': 'un ristorante filippino', 'georgian': 'un ristorante georgiano', 'russian': 'un ristorante russo', 'ukrainian': 'un ristorante ucraino',
    'romanian': 'un ristorante romeno', 'moroccan': 'un ristorante marocchino', 'tunisian': 'un ristorante tunisino', 'egyptian': 'un ristorante egiziano',
    'persian': 'un ristorante persiano', 'falafel': 'un falafel', 'piadina': 'una piadineria', 'friture': 'una friggitoria', 'pasta': 'un locale di pasta fresca',
    'bubble_tea': 'un bubble tea', 'frozen_yogurt': 'uno yogurt gelato', 'chicken': 'un pollo fritto', 'fish_and_chips': 'un fish and chips',
    'tapas': 'un bar di tapas', 'hawaiian': 'un locale hawaiano', 'nepalese': 'un ristorante nepalese', 'sri_lankan': 'un ristorante cingalese',
    'pizza_al_taglio': 'una pizza al taglio', 'apulian': 'una cucina pugliese', 'sardinian': 'una cucina sarda', 'abruzzese': 'una cucina abruzzese',
    'tuscan': 'una cucina toscana', 'calabrian': 'una cucina calabrese', 'emilian': 'una cucina emiliana', 'ligurian': 'una cucina ligure',
}
LOCALI = [  # locali per come si chiamano
    (r'^(Trattoria|Tratt\.)', 'una trattoria', 'nessuna trattoria'),
    (r'^(Osteria|Hostaria|Hosteria)', "un'osteria", "nessuna osteria"),
    (r'Fraschett', 'una fraschetta', 'nessuna fraschetta'),
    (r'Enoteca|Vineria|Bottiglieria|Fiaschetteria|Mescita', "un'enoteca o una vineria", "nessuna enoteca"),
    (r'Norcineria|Salumeria|Porchett', 'una norcineria o una porchetteria', 'nessuna norcineria'),
    (r'^(Antico )?Forno', 'un forno', 'nessun forno'),
    (r'Pasticceria', 'una pasticceria', 'nessuna pasticceria'),
    (r'Cornett', 'una cornetteria', 'nessuna cornetteria'),
    (r'Friggitoria|Suppl[iì]', 'una friggitoria o un posto di supplì', 'nessuna friggitoria'),
    (r'Bistecc|Braceria|Griglieria', 'una bisteccheria o una braceria', 'nessuna braceria'),
    (r'^(Taverna|Locanda)', 'una taverna o una locanda', 'nessuna taverna'),
    (r'Grattachecca|Chiosco', 'un chiosco o una grattachecca', 'nessun chiosco'),
    (r'Maritozz', 'un posto di maritozzi', 'nessun posto di maritozzi'),
    (r'^Bar Tabacchi|Tabaccheria', 'un bar tabacchi', 'nessun bar tabacchi'),
    (r'Pizzeria', 'una pizzeria (che si chiama Pizzeria)', 'nessuna pizzeria'),
    (r'Gelateria', 'una gelateria (che si chiama Gelateria)', 'nessuna gelateria'),
    (r'Birreria|Brewpub|Birrificio', 'una birreria', 'nessuna birreria'),
    (r'Caff[eè] Letterario|Libreria Caff', 'un caffè letterario', 'nessun caffè letterario'),
    (r'Cantina|Cantinetta', 'una cantina', 'nessuna cantina'),
    (r'Pinseria|Pinsa', 'una pinseria', 'nessuna pinseria'),
    (r'Panific', 'un panificio', 'nessun panificio'),
    (r'Latteria|Cremeria', 'una latteria o una cremeria', 'nessuna latteria'),
    (r'\bda (Mario|Enzo|Franco|Gigi|Peppe|Giggetto|Checco|Sora|Nonna|Zi\b)', 'un locale "da qualcuno" (da Mario, da Enzo, dalla Sora...)', 'nessun locale da qualcuno'),
    (r'\b(Sora|Sor) ', 'un locale della Sora o del Sor', 'nessun locale della Sora'),
    (r'Roma|Romano|Romana', 'un locale con Roma nel nome', 'nessun locale con Roma nel nome'),
]


def ha(testo, parole):
    t = testo.lower()
    return any(p.lower() in t for p in parole)


def main():
    wd = json.loads((FONTI / 'wikidata-roma.json').read_text())
    # Luoghi generici (Roma, Europa, Italia...): le loro coordinate cadono a caso nel centro, via.
    generico = lambda x: x.get('nome') in GENERICI or x.get('nome') in MAI_COSTRUITI
    for k in ('luoghi', 'opere', 'sepolture', 'set', 'cast', 'committenti'):
        wd[k] = [x for x in wd.get(k, []) if not generico(x)]
    luoghi, opere, sepolture, film = wd['luoghi'], wd['opere'], wd['sepolture'], wd['set']
    geo = lambda x: punto(x['lon'], x['lat'])

    # tipi
    for cerca, testo, manca in TIPI:
        els = [el(x['nome'], x['sl'], geo(x)) for x in luoghi if any(cerca.lower() in t.lower() for t in parti(x.get('tipi'))) or x['nome'] in IN_PIU.get(cerca, ())]
        aggiungi('tipi', slug(cerca), f'Una zona con {testo}', manca, els, cerca, famoso=f'Una zona con {famosa(testo)}' if famosa(testo) else None)

    # architetti
    per_arch = defaultdict(list)
    for x in luoghi:
        for a in parti(x.get('architetti')):
            per_arch[a].append(el(x['nome'], x['sl'], geo(x)))
    for a, els in per_arch.items():
        if a not in GIA_FATTI and len(els) >= 3:
            aggiungi('architetti', 'arch', f'Una zona con un edificio di {a}', f'nessun edificio di {a}', els, a)

    # artisti: autori di luoghi (fontane, statue) e di opere che stanno in un luogo di Roma
    per_art = defaultdict(list)
    for x in luoghi:
        for a in parti(x.get('autori')):
            per_art[a].append(el(x['nome'], x['sl'], geo(x)))
    for o in opere:
        per_art[o['autoreL']].append(el(o['nome'], max(o['sl'], o.get('osl', 0)), geo(o)))
    for a, els in per_art.items():
        if a not in GIA_FATTI and len(els) >= 3 and not a.lower().startswith(('anonimo', 'sconosciuto', 'ignoto')):
            aggiungi('artisti', 'arte', f"Una zona dove vedi un'opera di {a}", f'nessuna opera di {a}', els, a)

    # stili
    for parole, testo, manca in STILI:
        els = [el(x['nome'], x['sl'], geo(x)) for x in luoghi if any(ha(s, parole) for s in parti(x.get('stili')))
               and not (parole == ('rinasciment',) and any('neorinasc' in s for s in parti(x.get('stili'))))
               and not (parole == ('barocc', 'rococò') and any('neobarocc' in s for s in parti(x.get('stili'))))
               and not (parole == ('gotic',) and any('neogotic' in s for s in parti(x.get('stili'))))
               and not (parole == ('architettura romanica',) and any('neoromanic' in s for s in parti(x.get('stili'))))]
        aggiungi('stili', 'stile', f'Una zona con {testo}', manca, els, testo)

    # dediche delle chiese
    per_ded = defaultdict(list)
    for x in luoghi:
        for d in parti(x.get('dediche')):
            if d in DEDICHE:
                per_ded[DEDICHE[d]].append(el(x['nome'], x['sl'], geo(x)))
    for a, els in per_ded.items():
        aggiungi('dediche', 'dedica', f'Una zona con una chiesa dedicata {a}', f'nessuna chiesa dedicata {a}', els, a)

    # epoche: chiese e palazzi per secolo di fondazione
    for da, a, chiesa, palazzo in EPOCHE:
        dentro = [x for x in luoghi if x.get('inizio') is not None and da <= x['inizio'] <= a]
        ch = [el(x['nome'], x['sl'], geo(x)) for x in dentro if any(ha(t, ('chiesa', 'basilica')) for t in parti(x.get('tipi')))]
        aggiungi('epoche', 'chiesa', f'Una zona con una chiesa {chiesa}', f'nessuna chiesa {chiesa}', ch, f'chiesa {chiesa}')
        if palazzo:
            pa = [el(x['nome'], x['sl'], geo(x)) for x in dentro if any(ha(t, ('palazzo', 'villa', 'edificio')) for t in parti(x.get('tipi')))]
            aggiungi('epoche', 'palazzo', f'Una zona con un palazzo {palazzo}', f'nessun palazzo {palazzo}', pa, f'palazzo {palazzo}')
    for cerca, chi, femm in [(('fontana',), 'fontana', True), (('villa',), 'villa', True), (('torre',), 'torre', True), (('ponte',), 'ponte', False),
                             (('monumento', 'statua'), 'monumento', False), (('piazza',), 'piazza', True)]:
        for da, a, chiesa, palazzo in EPOCHE:
            testo_ep = (chiesa if femm else palazzo) or chiesa
            if not testo_ep:
                continue
            els = [el(x['nome'], x['sl'], geo(x)) for x in luoghi if x.get('inizio') is not None and da <= x['inizio'] <= a
                   and any(ha(t, cerca) for t in parti(x.get('tipi')))]
            articolo = 'una' if femm else 'un'
            aggiungi('epoche', slug(chi), f'Una zona con {articolo} {chi} {testo_ep}', f'nessun{"a" if femm else ""} {chi} {testo_ep}', els, f'{chi} {testo_ep}')
    for parole, agg_m, agg_f in [(('barocc',), 'barocco', 'barocca'), (('rinasciment',), 'rinascimentale', 'rinascimentale'), (('architettura romanica',), 'romanico', 'romanica'),
                                 (('neoclassic',), 'neoclassico', 'neoclassica'), (('neogotic',), 'neogotico', 'neogotica'), (('art nouveau', 'liberty'), 'liberty', 'liberty'),
                                 (('razionalismo', 'movimento moderno'), 'razionalista', 'razionalista')]:
        for cerca, chi, femm in [(('chiesa', 'basilica'), 'chiesa', True), (('palazzo',), 'palazzo', False), (('villa', 'villino'), 'villa', True), (('fontana',), 'fontana', True)]:
            els = [el(x['nome'], x['sl'], geo(x)) for x in luoghi if any(ha(t, cerca) for t in parti(x.get('tipi'))) and any(ha(st, parole) for st in parti(x.get('stili')))
                   and not any(n in st for st in parti(x.get('stili')) for n in ('neorinasc', 'neobarocc', 'neoromanic'))]
            agg = agg_f if femm else agg_m
            aggiungi('stili', slug(chi), f"Una zona con {'una' if femm else 'un'} {chi} {agg}", f"nessun{'a' if femm else ''} {chi} {agg}", els, f'{chi} {agg}')
    antichi = [el(x['nome'], x['sl'], geo(x)) for x in luoghi if x.get('inizio') is not None and x['inizio'] < 476]
    aggiungi('epoche', 'antico', "Una zona con un monumento dell'antica Roma (prima del 476)", "nessun monumento dell'antica Roma", antichi, 'antica roma')
    for da, a, testo in [(1922, 1943, 'costruito durante il fascismo'), (1960, 1960, 'costruito per le Olimpiadi del 1960'), (1990, 1990, 'costruito per i Mondiali del 1990')]:
        els = [el(x['nome'], x['sl'], geo(x)) for x in luoghi if x.get('inizio') is not None and da <= x['inizio'] <= a]
        aggiungi('epoche', 'evento', f'Una zona con un edificio {testo}', f'nessun edificio {testo}', els, testo)

    # sepolture
    for chiave, parole, chi in SEPOLTURE:
        els = [el(f"{s['pL']} ({s['nome']})", s['psl'], geo(s)) for s in sepolture
               if (s.get('papa') if chiave == 'papa' else ha(s.get('mestieri', ''), parole))]
        aggiungi('sepolture', 'sepolto', f'Una zona dove è sepolto {chi}', f'nessuna tomba di {chi}', els, chiave)

    # set dei film, per regista
    per_reg = defaultdict(list)
    for f in film:
        per_reg[f['registaL']].append(el(f"{f['nome']} ({f.get('filmL') or 'film'})", max(f['sl'], f.get('fsl', 0)), geo(f)))
    for r, els in per_reg.items():
        if len(els) >= 3:
            aggiungi('set', 'film', f'Una zona dove ha girato {r}', f'nessun set di {r}', els, r)
    tutti_set = [el(f"{f['nome']} ({f.get('filmL') or 'film'})", f.get('fsl', 0), geo(f)) for f in film]
    aggiungi('set', 'film', 'Una zona dove è stato girato un film famoso', 'nessun set famoso', [e for e in tutti_set if e['fama'] >= 40], 'film famoso')

    # committenti (papi, famiglie) e proprietari
    comm = wd.get('committenti', [])
    per_comm, per_prop, papi = defaultdict(list), defaultdict(list), []
    for x in comm:
        for c in parti(x.get('committenti')):
            per_comm[c].append(el(x['nome'], x['sl'], geo(x)))
            if c.lower().startswith('papa '):
                papi.append(el(x['nome'], x['sl'], geo(x)))
        for c in parti(x.get('proprietari')):
            per_prop[c].append(el(x['nome'], x['sl'], geo(x)))
    for c, els in per_comm.items():
        if c.lower().startswith('papa '):
            aggiungi('committenti', 'committente', f'Una zona con un luogo voluto da {c}', f'niente voluto da {c}', els, c)
        elif c in COMMITTENTI:
            aggiungi('committenti', 'committente', COMMITTENTI[c], f'niente: {COMMITTENTI[c][12:]}', els, c)
    aggiungi('committenti', 'papa', 'Una zona con un luogo voluto da un papa', 'niente voluto da un papa', papi, 'un papa',
             famoso='Una zona con un luogo famoso voluto da un papa')
    for c, els in per_prop.items():
        if c in PROPRIETARI:
            aggiungi('committenti', 'proprieta', PROPRIETARI[c], f'niente: {PROPRIETARI[c][12:]}', els, f'proprieta {c}')
    # famiglie nobili, dai nomi dei luoghi (Palazzo Colonna, Villa Torlonia, Cappella Chigi...)
    tutti_luoghi = {x['loc']: x for x in luoghi}
    for x in comm:
        tutti_luoghi.setdefault(x['loc'], x)
    for fam in FAMIGLIE:
        r_ = re.compile(rf"\b{fam}\b")
        els = [el(x['nome'], x['sl'], geo(x)) for x in tutti_luoghi.values() if r_.search(x['nome']) or r_.search(x.get('committenti', '')) or r_.search(x.get('proprietari', ''))]
        aggiungi('famiglie', 'famiglia', f'Una zona con un palazzo, una villa o una cappella dei {fam}', f'nessun luogo dei {fam}', els, fam)

    # opere per tipo
    for tipo, testo in [('mosaico', 'un mosaico'), ('affresco', 'un affresco'), ('scultura', 'una scultura famosa'), ('dipinto', 'un dipinto famoso'),
                        ('pala', "una pala d'altare")]:
        els = [el(o['nome'], o.get('osl', 0), geo(o)) for o in opere if tipo in o.get('tipoL', '').lower()]
        aggiungi('artisti', 'tipo-opera', f'Una zona dove vedi {testo}', f'nessuna opera: {testo}', els, f'opera {tipo}',
                 famoso=f'Una zona dove vedi {testo} famoso' if tipo in ('mosaico', 'affresco') else None)

    # cast dei film girati a Roma, e decenni
    cast = wd.get('cast', [])
    per_att = defaultdict(dict)
    per_dec = defaultdict(dict)
    for c in cast:
        k = (c['film'], c['loc'])
        e_ = el(f"{c['nome']} ({c.get('filmL') or 'film'})", max(c['sl'], c.get('fsl', 0)), geo(c))
        per_att[c['attoreL']][k] = e_
        if c.get('anno'):
            per_dec[(int(c['anno']) // 10) * 10][k] = e_
    for a, d in per_att.items():
        if len(d) >= 5:
            aggiungi('set', 'attore', f'Una zona dove è stato girato un film con {a}', f'nessun set di un film con {a}', list(d.values()), f'attore {a}')
    NOMI_DEC = {1940: 'degli anni Quaranta', 1950: 'degli anni Cinquanta', 1960: 'degli anni Sessanta', 1970: 'degli anni Settanta',
                1980: 'degli anni Ottanta', 1990: 'degli anni Novanta', 2000: 'degli anni Duemila', 2010: 'degli anni Dieci', 2020: 'degli anni Venti'}
    for dec, d in per_dec.items():
        if dec in NOMI_DEC:
            aggiungi('set', 'decennio', f'Una zona dove è stato girato un film {NOMI_DEC[dec]}', f'nessun set di un film {NOMI_DEC[dec]}',
                     list(d.values()), f'decennio {dec}', famoso=f'Una zona dove è stato girato un film famoso {NOMI_DEC[dec]}')

    # --- OSM ---
    if not (FONTI / 'osm-extra.geojson').exists():
        print('ATTENZIONE: manca dati/fonti/osm-extra.geojson (strumenti/scarica_osm_extra.py): niente strade, linee e luoghi OSM')
        osm, dediche = [], {}
    else:
        osm = json.loads((FONTI / 'osm-extra.geojson').read_text())['features']
        dediche = json.loads((FONTI / 'dediche-wikidata.json').read_text())
    strade = [f for f in osm if f['properties']['gruppo'] == 'strade']

    def strade_dove(filtro):
        out = []
        for f in strade:
            q = dediche.get(f['properties']['chiave'])
            if q and filtro(q):
                out.append(el(f['properties']['nome'], q.get('sl', 0), f['geometry']))
        return out
    umano = lambda q: 'essere umano' in q.get('tipi', '')
    for chiave, parole, chi in PERSONE:
        aggiungi('strade', chiave, f'Una zona con una strada dedicata a {chi}', f'nessuna strada dedicata a {chi}',
                 strade_dove(lambda q, p=parole: umano(q) and ha(q.get('mestieri', ''), p)), chiave,
                 famoso=f'Una zona con una strada dedicata a {famosa(chi)}' if famosa(chi) else None)
    for chiave, parole, chi in COSE:
        aggiungi('strade', chiave, f'Una zona con una strada dedicata a {chi}', f'nessuna strada dedicata a {chi}',
                 strade_dove(lambda q, p=parole: not umano(q) and ha(q.get('tipi', ''), p)), chiave,
                 famoso=f'Una zona con una strada dedicata a {famosa(chi)}' if famosa(chi) else None)
    # La stessa persona con strade in piu zone: "Una zona con una strada dedicata a Garibaldi".
    per_ded = defaultdict(list)
    for f in strade:
        q = dediche.get(f['properties']['chiave'])
        if q and q.get('l'):
            per_ded[q['l']].append(el(f['properties']['nome'], q.get('sl', 0), f['geometry']))
    for chi, els in per_ded.items():
        if len({e['nome'] for e in els}) >= 5:
            aggiungi('strade', 'persona', f'Una zona con una strada dedicata a {chi}', f'nessuna strada dedicata a {chi}', els, f'dedicata {chi}')
    aggiungi('strade', 'donna', 'Una zona con una strada dedicata a una donna', 'nessuna strada dedicata a una donna',
             strade_dove(lambda q: umano(q) and q.get('s', '').endswith('Q6581072')), 'donna', famoso='Una zona con una strada dedicata a una donna famosa')
    for paese, chi in PAESI.items():
        aggiungi('strade', 'paese', f'Una zona con una strada dedicata a {chi}', f'nessuna strada dedicata a {chi}',
                 strade_dove(lambda q, p=paese: umano(q) and p in parti(q.get('paesi'))), chi)
    for da, a, testo in [(-2000, 476, "un personaggio dell'antichità"), (476, 1450, 'un personaggio del Medioevo'), (1450, 1600, 'un personaggio del Rinascimento'),
                         (1600, 1750, 'un personaggio del Seicento'), (1750, 1850, 'un personaggio del Settecento'), (1800, 1870, 'un personaggio del Risorgimento'),
                         (1900, 2100, 'un personaggio nato nel Novecento'), (1940, 2100, 'un personaggio nato dopo il 1940')]:
        aggiungi('strade', 'epoca', f'Una zona con una strada dedicata a {testo}', f'nessuna strada dedicata a {testo}',
                 strade_dove(lambda q, d=da, b=a: umano(q) and q.get('nascita') and d <= int(q['nascita']) < b), testo)

    for f in osm:
        p = f['properties']
        if p['gruppo'] == 'consolari' and p['chiave'] in CONSOLARI:
            aggiungi('linee', 'consolare', f"Una zona attraversata {CONSOLARI[p['chiave']]}", f"niente {p['chiave']}", [el(p['nome'], 0, f['geometry'])], p['chiave'])
        elif p['gruppo'] == 'tram':
            aggiungi('linee', 'tram', f"Una zona dove passa il tram {p['chiave']}", f"nessuna fermata del tram {p['chiave']}", [el(f"tram {p['chiave']}", 0, f['geometry'])], f"tram {p['chiave']}")
        elif p['gruppo'] == 'treni':
            nome = {'RMV': 'la Roma-Viterbo', 'RL': 'la Roma-Lido'}.get(p['chiave'], f"la linea {p['chiave']}" if re.match(r'^FL\d', p['chiave']) else p['chiave'])
            aggiungi('linee', 'treno', f'Una zona dove passa il treno {nome}' if nome.startswith('la linea') else f'Una zona dove passa {nome}', f'niente {nome}',
                     [el(nome, 0, f['geometry'])], p['chiave'])
    linee = defaultdict(list)
    for f in osm:
        if f['properties']['gruppo'] == 'linee':
            linee[f['properties']['chiave']].append(el(f['properties']['nome'], 0, f['geometry']))
    aggiungi('linee', 'acqua', "Una zona attraversata dall'Aniene", "niente Aniene", linee.get('aniene', []), 'aniene')
    aggiungi('linee', 'acquedotto', 'Una zona attraversata da un acquedotto antico', 'nessun acquedotto', linee.get('acquedotti', []), 'acquedotti')
    aggiungi('linee', 'mura', 'Una zona attraversata dalle mura antiche', 'nessun tratto di mura', linee.get('mura', []), 'mura')
    aggiungi('linee', 'marrana', 'Una zona attraversata da una marrana', 'nessuna marrana', linee.get('marrana', []), 'marrana')
    for nome in {e['nome'] for e in linee.get('acquedotti', [])}:
        aggiungi('linee', 'acquedotto', f"Una zona attraversata dall'{nome}", f"niente {nome}", [e for e in linee['acquedotti'] if e['nome'] == nome], nome)
    for nome in {e['nome'] for e in linee.get('mura', [])}:
        if nome != 'mura':
            aggiungi('linee', 'mura', f'Una zona attraversata dalle {nome}', f'niente {nome}', [e for e in linee['mura'] if e['nome'] == nome], nome)

    per_poi = defaultdict(list)
    for f in osm:
        p = f['properties']
        if p['gruppo'] == 'poi':
            per_poi[p['chiave']].append(el(p['nome'], 0, f['geometry']))
    for chiave, (testo, manca) in POI.items():
        aggiungi('luoghi', chiave, f'Una zona con {testo}', manca, per_poi.get(chiave, []), chiave)

    # --- Nomi delle strade, marchi, cucine, locali (strumenti/scarica_osm_nomi.py) ---
    nomi_file = FONTI / 'osm-nomi.json'
    if nomi_file.exists():
        on = json.loads(nomi_file.read_text())
        for regex, testo, manca in NOMI:
            r_ = re.compile(regex)
            els = [el(n, 0, punto(lon, lat)) for n, lon, lat in on['strade'] if r_.search(n)]
            aggiungi('nomi', slug(testo), f'Una zona con {testo}', manca, els, testo)
        for santo in SANTI:
            r_ = re.compile(rf"\b{santo}\b")
            els = [el(n, 0, punto(lon, lat)) for n, lon, lat in on['strade'] if r_.search(n)]
            aggiungi('nomi', 'santo', f'Una zona con una strada che porta il nome di {santo}', f'nessuna strada di {santo}', els, santo)
        per_marchio = defaultdict(list)
        for marchio, nome, lon, lat, tipo in on['marchi']:
            per_marchio[marchio.strip()].append(el(nome or marchio, 0, punto(lon, lat)))
        for marchio, els in per_marchio.items():
            if len(els) >= 5 and marchio.lower() not in MARCHI_NO:
                chi = MARCHI_NOMI.get(marchio, f'un {marchio}')
                aggiungi('marchi', 'marchio', f'Una zona con {chi}', f'nessun locale {marchio}', els, marchio)
        per_cucina = defaultdict(list)
        for cu, nome, lon, lat in on['cucine']:
            if cu in CUCINE:
                per_cucina[CUCINE[cu]].append(el(nome, 0, punto(lon, lat)))
        for testo, els in per_cucina.items():
            aggiungi('cucine', 'cucina', f'Una zona con {testo}', f'nessun posto con {testo.split(" ", 1)[1]}', els, testo)
        for regex, testo, manca in LOCALI:
            r_ = re.compile(regex, re.I)
            els = [el(n, 0, punto(lon, lat)) for n, lon, lat, _ in on['locali'] if r_.search(n)]
            aggiungi('locali', slug(testo), f'Una zona con {testo}', manca, els, testo)

    # Linee degli autobus note (strumenti/scarica_bus.py).
    bus_file = FONTI / 'osm-bus.geojson'
    if bus_file.exists():
        for f in json.loads(bus_file.read_text())['features']:
            ref = f['properties']['linea']
            aggiungi('linee', 'bus', f'Una zona dove passa il {ref}' if ref[0].isdigit() else f"Una zona dove passa l'autobus {ref}",
                     f'niente autobus {ref}', [el(f'autobus {ref}', 0, f['geometry'])], f'bus {ref}')

    # Criteri di Simone (31/10/2026): niente termini da specialisti, niente catene o cucine generiche,
    # nomi propri (architetti, artisti, attori, registi, papi) solo se famosi.
    f_appr = RADICE / 'dati' / 'domande-approvate.json'
    approvate = set(json.loads(f_appr.read_text())['ids']) if f_appr.exists() else set()
    tenute = []
    for d in domande:
        if d['famiglia'] == 'nomi' and d['id'] not in approvate:
            continue  # "basta strade": restano solo quelle gia approvate
        chiave = d['id'].split('-', 2)[-1]
        f = d['famiglia']
        if f in ('cucine', 'marchi', 'strade', 'set'):
            continue  # bocciate nella revisione del 31/10 (e "basta strade")
        if f == 'linee' and d['tipo'] == 'linee-consolare':
            continue
        if f == 'dediche' and not any(t in d['testo'] for t in ('alla Madonna', 'a Gesù')):
            continue
        if f == 'nomi' and d['tipo'] == 'nomi-santo':
            continue
        if f == 'luoghi' and d['tipo'] == 'luoghi-forte':
            continue
        if any(t in d['testo'].lower() for t in TROPPO_SPECIFICI):
            continue
        if f == 'architetti' and not any(n in d['testo'] for n in ARCHITETTI_FAMOSI):
            continue
        if f == 'artisti' and "un'opera di" in d['testo'] and not any(n in d['testo'] for n in ARTISTI_FAMOSI):
            continue
        if f == 'sepolture' and not any(t in d['testo'] for t in SEPOLTI_OK):
            continue
        if f == 'set' and ('film con' in d['testo'] or 'ha girato' in d['testo']) and not any(n in d['testo'] for n in CINEMA_FAMOSI):
            continue
        if f == 'committenti' and 'voluto da papa' in d['testo'] and not any(n in d['testo'] for n in PAPI_FAMOSI):
            continue
        if f == 'locali' and not any(t in d['testo'] for t in LOCALI_ROMANI):
            continue
        tenute.append(d)
    domande[:] = tenute
    # Locali storici di Roma, per nome (al posto delle catene).
    if nomi_file.exists():
        for testo, nomi in STORICI.items():
            r_ = re.compile(r'\b(' + '|'.join(re.escape(n) for n in nomi) + r')\b', re.I)
            els = [el(n, 0, punto(lon, lat)) for n, lon, lat, _ in on['locali'] if r_.search(n)]
            aggiungi('storici', slug(testo), f'Una zona con {testo}', f'nessun {testo.split(" ", 1)[1]}', els, testo)

    # Id unici.
    visti = defaultdict(int)
    for d in domande:
        visti[d['id']] += 1
        if visti[d['id']] > 1:
            d['id'] += f"-{visti[d['id']]}"
    USCITA.write_text(json.dumps({'nota': 'Generato da strumenti/genera_domande.py. Proposte: da approvare con Themino.', 'domande': domande},
                                 ensure_ascii=False, separators=(',', ':')))
    per_fam = defaultdict(int)
    for d in domande:
        per_fam[d['famiglia']] += 1
    print(f'Proposte: {len(domande)} ({", ".join(f"{k} {v}" for k, v in sorted(per_fam.items()))}). Scritto {USCITA.relative_to(RADICE)}')


if __name__ == '__main__':
    main()
