// Grove productfamilie per product (brood, kaas, melk, cola, ...), afgeleid uit winkelcategorie + titel.
// "Komkommer is komkommer": de winkelcategorie is vaak te smal (AH heeft een eigen categorie voor desembrood met alleen
// AH-broden), dus vergelijk.mjs valt terug op deze familie als de smalle categorie te weinig vergelijkbaars heeft.
// Volgorde van zoeken: 1) CATEGORIE_EXACT (vage winkelcategorieen als "wit" of "plakken"), 2) categorieregels,
// 3) titelregels (alleen regels met een derde veld). Regels staan van specifiek naar algemeen: de eerste die past wint.
// Reguliere expressies zonder accenten (die worden gestript).

// Elk alternatief matcht aan het begin van een woord; een voorloop-'*' betekent: ook midden in een woord (samenstellingen).
const R = (s) => {
  const alts = []; let d = 0, cur = '';
  for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === '|' && !d) { alts.push(cur); cur = ''; } else cur += ch; }
  alts.push(cur);
  return new RegExp(alts.map((a) => (a.startsWith('*') ? a.slice(1) : a.startsWith('^') || a.startsWith('\\b') || a.startsWith('(') ? a : '\\b' + a)).join('|'));
};

// Vage categorienamen die per winkel iets anders betekenen: direct naar een familie (of null = op titel beslissen).
const CATEGORIE_EXACT = {
  'wit': 'wasmiddel', 'zwart': 'wasmiddel', 'kleur': 'wasmiddel', 'gel': 'haarverzorging',
  'zoet': 'wijn', 'droog': 'wijn', 'robuust': 'wijn', 'soepel': 'wijn', 'vol droog': 'wijn', 'fris droog': 'wijn',
  'plakken': 'kaas', 'stukken': 'kaas', 'kaas': 'kaas',
  'blik': 'bier', 'fles': 'bier', 'krat': 'bier', 'blond': 'bier', 'dubbel': 'bier',
  'groenten': 'groente', 'groente': 'groente', 'zakken': 'fruit', 'schaal': 'fruit', 'fruit': 'fruit',
  'vlees': 'worst-vleeswaren', 'snacks': 'borrelsnacks', 'suikervrij': 'siroop', 'vis': 'vis',
};

// [familie, categorieregel, titelregel?]
const REGELS = [
  // --- niet-eten en grabbelbakken ---
  ['huisdiervoer', R('(kat|hond|huisdieren|huisdieraccessoires|kattenvoer)$')],
  ['luiers-hygiene', R('luier|tampon|maandverband|inlegkruisjes|incontinentie|billendoekjes|menstruatie|dameshygiene|panty|damesverzorging')],
  ['wasmiddel', R('wasmiddel|waspoeder|waspods|wasverzachter|wasparfum|vlekverwijderaar|wasmachine'), R('wasmiddel|waspoeder|wasverzachter|waspods')],
  ['afwasmiddel', R('afwasmiddel|vaatwas'), R('afwasmiddel|vaatwas')],
  ['schoonmaak', R('allesreiniger|reiniger|schoonmaak|ontstopper|anti-kalk|schuurmiddel|schimmel|poetsmiddel|toiletblok|toilet.*verfrisser|dweil|glasreiniger|keukenreiniger|badkamerreiniger|kalkreiniger|raamreiniger|toiletreiniger'), R('allesreiniger|reiniger|schoonmaak')],
  ['luchtverfrisser', R('luchtverfrisser|geurstokjes|textielverfrisser|kaars|theelichten|constante luchtverfrisser')],
  ['tandverzorging', R('tandpasta|tandenborstel|mondwater|mondverzorging|flosdraad|tandenstoker|mondspray|kindertandpasta|keelpastilles'), R('tandpasta|tandenborstel|mondwater')],
  ['haarverzorging', R('shampoo|conditioner|haarspray|haarmasker|haarmousse|haarverzorging|haarserum|droogshampoo|styling|haarstyling|wax$|haarpoeder|gelspray|haarkleur|sprays, maskers|anti-klit'), R('shampoo|conditioner|haarspray')],
  ['douche-zeep', R('douche|handzeep|vloeibare zeep|blok zeep|badschuim|badolie|bad voor|doucheolie|handgel|badkamer')],
  ['deodorant', R('deo(spray|roller|stick|dorant)'), R('deodorant|deospray|deoroller')],
  ['lichaamsverzorging', R('creme|bodycreme|gezicht|bodylotion|handcreme|lipverzorging|scheer|aftershave|make-up|dagcreme|nachtcreme|zelfzorg|verzorging|parfum|zonne|oog make')],
  ['papier', R('toiletpapier|keukenpapier|tissues|zakdoekjes|toilet-, keukenpapier|vochtig toilet|doekjes'), R('toiletpapier|keukenpapier')],
  ['non-food', R('(non food|wonen|huishouden|kleding|keukenaccessoires|elektronica|speelgoed|outdoor|apparatuur|bestek|borden|koffers|meubel|bureaus|dekbed|hoeslakens|hoofdkussens|handdoeken|keukentextiel|tuinmeubelen|buiten en tuin|fietsen|fitness|smart home|kookpannen|keukenmessen|stofzuiger|strijkijzer|waterkokers|airfryer|keukenmachines|koelkasten|ventilatoren|verwarming|zwembaden|bbq tools|barbecues|houtskool|warmteproducten|installatie|uitjes|thuis energie|dakdragers|statafels|stoelen|bedden|gourmetsets|ijsmachines|rijstkokers|contactgrills|koffiezetapparaten|scheerapparaten|schaar|bloemen|halloween|kerst|sport, spel|gaming|kampeer|geluidsapparaten|kousenvoetjes|groendak|airco|luchtontvochtigers|koelboxen|vaatwassers|wonen en seizoen|wonen, koken|tuingereedschap|vloer- en tapijt|pre workout|sportsupplementen|voedingssupplementen|natuurlijke zelfzorg|baby en kind|baby persoonlijke|bbq, gourmet|overig assortiment|huisdier)')],

  // --- samengestelde producten eerst, zodat "kipsalade" geen kip is en "tomatensoep" geen tomaat ---
  // Kant-en-klaar is geen "X is X": maaltijden krijgen geen familie (GEEN_VERGELIJKING), maar worden wel vroeg afgevangen.
  ['maaltijd', R('*maaltijd|kant en klare|keuken$|wereldgerecht|ovenschotel|pannenkoeken|poffertjes|diepvriesmaaltijden|diepvries pizza.s & maaltijden|hartige taart|verse pasta|diepvries$')],
  ['soep', R('*soep(en|je|jes)?\\b|*bouillon|^basis voor'), R('\\b(soep|bouillon)\\b')],
  ['salades', R('(?<!fruit)(?<!fruit)salade|salades|huzarensalade|kaassalade'), R('\\b(salade|huzarensalade)\\b')],
  ['vega', R('vega|vegetarisch|tofu|plantaardige (plakken|vlees)|vleesvervanger|tempeh|seitan|garden gourmet'), R('\\b(vegetarische?|vega|vegan)\\b')],
  ['pizza', R('pizza|pizzadeeg|flammkuchen'), R('\\b(pizza|pizza.s)\\b')],
  ['peulvruchten', R('kikkererwten|linzen|(witte|bruine|zwarte|kidney|cannellini|chili|tuin|snij|sperzie)bonen|bonen|kapucijners|doperwten|erwten|bonenschotel|bonenmix|edamame|peulvruchten')],
  ['kruiden', R('kruiden &|kruiden$|kruiden\\b|specerijen|peper$|peper mix|zwarte peper|witte peper|zeezout|^zout$|zout mix|kerrie|curry|kaneel|nootmuskaat|kruidnagel|paprikapoeder|komijn|oregano|rozemarijn|laurier|knoflookpoeder|vanillestokje|steranijs|cajun|kardemom|dille|foelie|laos|^munt en|kervel|aromat|vleeskruiden|kipkruiden|viskruiden|speculaaskruiden|koek- en speculaas|sesamzaad|mosterdzaad|venkelzaad|anijszaad|komijnzaad|koriander|gemberkruiden|cayenne|chilipeper|italiaanse kruiden|provencaal|aardappelkruiden|kruidenmix|kruidenmixen|maaltijdkruiden|maaltijd kruiden|dipmix|boemboe|smaakmakers|seroendeng|bieslook|peterselie en selderij|uienpoeder|peterselie')],
  ['sauzen', R('*saus|*sauzen|mayonaise|ketchup|mosterd\\b|dressing|sambal|ketjap|marinade|pesto|aioli|*dip$|dips\\b|tomatenpuree|passata|gezeefde tomaten|tomatenpulp|gepelde tomaten|tomatenblokjes|pastasaus|woksaus|sriracha|bijgerechten en|guacamole|tzatziki|salsa|meer sauzen|dipsaus|tapenade|^jus$|^jus |curry$|jus\\b'), R('\\b(mayonaise|ketchup|mosterd|saus|pesto|dressing|sambal|tomatenpuree)\\b')],
  ['pickles', R('olijven|augurken|peppadews|verse olijven|zuurkool|ingemaakte')],
  ['wraps', R('taco, tortilla|wrap|burrito|naan|pitabroodjes|flatbread|bao buns|tortilla$|tortillas|groentewraps'), R('\\b(wraps?|naan|tortilla.s)\\b')],
  ['repen', R('proteine repen|proteinerepen|mueslirepen|notenrepen|haverrepen|biscuits en ontbijtkoek')],
  ['eiwitdrank', R('proteine shake|proteineshake|high protein drinks|proteine dranken|proteine toetjes|eiwitpoeder')],
  ['energydrank', R('energy|energiedrank|sportdrank|isotone'), R('\\b(energy drink|red bull|monster)\\b')],

  // --- brood en bakkerij ---
  ['broodjes', R('broodjes|bolletjes|croissants|afbakbroodjes|vers klein gebak|bapao|verse broodjes|bolletjes & croissants|broodjes & snacks'), R('\\b(bol|bollen|broodje|broodjes|croissant|croissants|pistolet|pistolets)\\b')],
  ['brood', R('desembrood|vloerbrood|bakkersbrood|vers brood|dagvers brood|maisbrood|^brood$|afbakbrood|^brood en gebak|gebak, brood|broodmix|^meergranen|toast & houdbare bakkerij|vriesvers desembrood'), R('\\b(brood|volkorenbrood|roggebrood|tarwebrood|waldkorn|desembrood|stokbrood|bruinbrood|witbrood|boerenbrood|casinobrood)\\b')],
  ['beschuit-toast', R('toast|beschuit|crackers|knackebrod|rijstwafels|maiswafels|rijstzoutjes|zoutjes|kaaszoutjes|kroepoek|toastjes'), R('beschuit|toast|knackebrod|cracker')],
  ['bakken', R('bak\\b(?!-)|bakmix|bakproducten|bakbenodigdheden|suiker$|bloem\\b|cakemix|taartmix|browniemix|cupcake|gist|dadelstroop|gembersiroop|toppings|zoetstof|griesmeel|maizena|koekjesmix|muffin, scones'), R('\\b(bloem|suiker|bakmix|griesmeel|gist)\\b')],
  ['koek', R('koekjes|koek$|koek |koeken|biscuit|speculaas|kinderkoek|ontbijtkoek|stroopwafel|wafels|taart|gebak|cake|speculoos|kruidnoten|pepernoten|banket|brownie|muffin|scones|snoep, koek|snoep en koek|alledaagse'), R('koekje|koekjes|stroopwafel|speculaas|biscuit|cake')],

  // --- dranken en zuivel op samenstellingen ---
  ['zuiveldrank', R('chocolademelk|drinkyoghurt|zuiveldranken|ontbijtdranken|cacao|kefir drink|yoghurt drink|lactosevrije drinkyoghurt'), R('\\b(chocolademelk|chocomel|drinkyoghurt)\\b')],
  ['plantaardige-zuivel', R('plantaardig(e)? (zuivel|drank|drink|yoghurt|kwark|toetjes|dranken|romige|kookalt|bakalt|smeeralt|spreads)|sojadrink|amandel, cashewdrink|rijstdrank|haverdrink|plantaardige dranken|plantaardige drink|plantaardig smeer|plantaardig kook|plantaardig bak')],
  ['koffie', R('koffie|espresso|nespresso|dolce gusto|cappuccino|senseo|koffiepads|koffiecups|koffiebonen|oploskoffie|filterkoffie|koffiecapsules|oploscappuccino|starbucks'), R('\\b(koffie|espresso|koffiebonen|koffiecups|koffiepads)\\b')],
  ['thee', R('*thee\\b|rooibos|pickwick|zonnatura|variatiebox thee'), R('\\b(thee|rooibos)\\b')],
  ['cola', R('cola|^cola'), R('\\b(cola|coca-cola|pepsi)\\b')],
  ['bier', R('bier|pils|ipa|blond|dubbel|tripel|quadrupel|weizen|witbier|radler|speciaalbier|amber en|bockbier|cider|wit en weizen|alcoholvrij (wit|blond|pils|ipa)|alcoholvrij$|mexicaans bier|brown ale'), R('\\b(bier|pils|radler|weizen|ipa)\\b')],
  ['wijn', R('wijn|prosecco|chardonnay|sauvignon|merlot|cabernet|pinot|syrah|tempranillo|malbec|riesling|grenache|sangiovese|verdejo|viognier|chenin|carmenere|corvina|vermentino|gruner|mousserende|meer bubbels|cava|champagne|overige (rode|witte)|rode wijn|witte wijn'), R('\\b(wijn|prosecco|chardonnay|merlot|cabernet sauvignon|sauvignon blanc|rose)\\b')],
  ['gedistilleerd', R('gedistilleerd|whisky|wodka|vodka|jenever|rum$|gin$|likeur|advocaat'), R('\\b(whisky|wodka|vodka|jenever|rum|gin|likeur)\\b')],
  ['water', R('water zonder|koolzuurvrij water|koolzuurhoudend water|^water$|mineraal|waterflessen|bronwater'), R('\\b(mineraalwater|bronwater)\\b')],
  ['sap', R('*sappen\\b|*sap\\b|jus d.?orange|smoothie|groentesap|puursap|fruit en groenteshots|cranberry|kokoswater|aloe vera dranken|fruit en groente smoothies'), R('\\b(sinaasappelsap|appelsap|vruchtensap|multivruchtensap)\\b')],
  ['siroop', R('siroop|limonadesiroop|cassis|diksap|flessen (sinas|cassis|lemon)')],
  ['frisdrank', R('fris|frisdrank|limonade|sinas|ice tea|ijsthee|ginger|tonic|bitter lemon|rivella|soda|vitamin water|water met smaak|fruitwater|kombucha|lemon en lime|flessen|blikjes|ice-tea|surinaams, antiliaans|ijskoffie|craft en speciaal|frisse|cola met smaak|limonade en'), R('\\b(frisdrank|limonade|sinas|ice tea|fanta|sprite|7up|7-up|tonic|ginger ale)\\b')],

  // --- zuivel, ei, vlees, vis ---
  ['eieren', R('^eieren|eieren$|\\beieren\\b'), R('\\b(eieren|scharreleieren|kippeneieren)\\b')],
  ['room', R('kookroom|slagroom|room$|^room\\b(?! handijs)')],
  ['melk', R('*melk\\b|melk &|^zuivel$|^houdbare zuivel|lactosevrije (zuivel|melk)|geitenmelk'), R('\\b(halfvolle melk|volle melk|magere melk|karnemelk)\\b')],
  ['toetjes', R('pudding|mousse|toetjes|dessert|vanillevla|chocoladevla|dubbelvla|fruitvla|^vla|vla$|vlaflip|kindertoetjes|luxe toetjes|tussendoortjes'), R('\\b(vla|pudding)\\b')],
  ['yoghurt', R('yoghurt|kwark|skyr|^pap$|probiotica|^pap |pap$|havermout en pap'), R('\\b(yoghurt|kwark|skyr)\\b')],
  ['boter', R('boter|boter &|margarine|halvarine|smeer|roomboter|borrelboter|kruidenboter|plantaardige spreads|plantaardig smeer'), R('\\b(roomboter|margarine|halvarine)\\b')],
  ['kaas', R('kaas|kazen|brie|camembert|roomkaas|cheddar|geitenkaas|schapenkaas|rookkaas|gatenkaas|zuivelspread|kaas in plakken|geraspte|roomkaas en|buitenlandse harde|regio .* kaas|roodflora|overige blauwe|kaasplank|kaasfondue|kaasdip|kaasblokjes|kaashapjes|kaas hapjes'), R('\\b(kaas|goudse|gouda|edammer|maasdammer|emmentaler|brie|camembert|mozzarella|feta|parmezaan|jong belegen|extra belegen)\\b')],
  ['gehakt', R('*gehakt'), R('\\b(gehakt|rundergehakt|half om half|kipgehakt)\\b')],
  ['kip', R('^kip|kip$|kip &|kip,|kipfilet|kippenpoten|kipvleugels|kipspiesjes|kipburger|gevogelte|kalkoen|halal kip|kipdelen|gebraden kip|gerookte kip|kipschnitzel|schnitzel \\(kip|cordon bleu|kipnuggets|kipsnacks|^halal$'), R('\\b(kipfilet|kippendij|kippenpoot|drumsticks|kipvleugels|kalkoen)\\b')],
  ['vleeswaren', R('vleeswaren|boterham|lever|droge worst|^ham\\b|ham,|ham \\(|salami|spek\\b|spek,|bacon|rookvlees|^pate|filet americain|cervelaat|ossenworst|tartaar|hamreepjes|hamblokjes|gebraden|ham, spek|vlees$|spek en bacon|borrel vleeswaren|^borrel$|^tapas$'), R('\\b(ham|salami|spekjes|bacon|leverworst|filet americain|cervelaat)\\b')],
  ['worst', R('*worst|saucijs|hotdog|^worst'), R('\\b(rookworst|knakworst|worst|worstjes|braadworst)\\b')],
  ['rundvlees', R('rund|biefstuk|rosbief|ribeye|entrecote|stooflap|hamburgers|burgers|bbq vlees|luxe rundvlees|steak|filetlappen|hamlappen'), R('\\b(biefstuk|rundvlees|entrecote|ribeye|stooflappen|hamburger|steak)\\b')],
  ['varkensvlees', R('varkens|karbonade|speklappen|spekken$|slavink|ribs|haas|schnitzel\\b|schnitzels|balletjes|^vlees,'), R('\\b(varkens|karbonade|speklappen|varkenshaas|slavink|braadworst)\\b')],
  ['vis', R('^vis|visfilet|zalm|haring|kibbeling|lekkerbek|schaal- en schelp|vissticks|visfriet|gerookte forel|visconserven|tonijn|garnalen|vis tapas|vissnacks|\\bvis\\b|vis \\(|vis,|luxe vis'), R('\\b(zalm|tonijn|garnalen|kibbeling|haring|makreel|pangasius|kabeljauw|visfilet|vissticks|mosselen)\\b')],

  // --- snoep, snacks, ontbijt, beleg ---
  ['chocolade', R('chocolade|chocolade bites|candybars|pralines|bonbons|melkchocolade|chocoladenoten|chocoladegeschenken|^choco|fairtrade'), R('\\b(chocolade|chocoladereep|tony.s|milka|snickers|twix|bounty)\\b')],
  ['snoep', R('snoep|drop|kauwgom|pepermunt|winegums|gums|keelsnoep|lollies|spekken en schuimpjes|schuimpjes|uitdeelsnoep|fun snoep|zacht snoep|hard snoep|snoepmix|snoepjes|fruitgummies|mini snoepjes|zure|toffee|snoepgroente|keelpastilles'), R('\\b(snoep|drop|winegums|kauwgom|haribo)\\b')],
  ['chips', R('chips|paprika chips|vormpjes|tortilla chips|naturel chips|borrelmix|nacho|popcorn|borrelballetjes|hartige hapjes|snacks$'), R('\\b(chips|nacho.s|popcorn|doritos|lays)\\b')],
  ['noten', R('noten|pinda|cashew|amandelen|walnoten|pecan|pistache|macadamia|notenmix|zout mix|gedroogd fruit|borrel noten'), R('\\b(pinda.s|cashewnoten|amandelen|walnoten|notenmix|borrelnoten)\\b')],
  ['borrelsnacks', R('oven|frituur|diepvries snacks|diepvries hapjes|frikandel|kroket|bitterbal|loempia|kaassouffle|snacks \\(diepvries|snackballetjes|gyoza|empanadas|nuggets|snackworstjes|mini snacks|halal snacks|snacks'), R('\\b(frikandel|kroket|bitterballen|loempia)\\b')],
  ['ontbijt', R('muesli|cereals|granola|havermout|ontbijtgranen|krokante muesli|kinderontbijt|pops|ontbijt|cornflakes'), R('\\b(muesli|granola|havermout|cornflakes|cruesli)\\b')],
  ['beleg', R('broodbeleg|beleg|jam|pindakaas|hagelslag|honing|hummus|appelstroop|chocopasta|chocoladepasta|vruchtenhagel|fruitspread|vegetarische spreads|stroop|aardbeienjam|vijgenjam|hazelnootpasta|zoete beleg|tapenade|vissalade|eiersalade|spread'), R('\\b(pindakaas|hagelslag|jam|honing|hazelnootpasta|chocoladepasta)\\b')],

  // --- groente, fruit, aardappel (na de samenstellingen) ---
  ['aardappel', R('aardappel|krieltjes|stamppot aardappelen|frites|aardappelpartjes|aardappelschijfjes|geschilde aardappelen'), R('\\b(aardappelen|krieltjes)\\b')],
  ['fruit', R('fruit$|^fruit\\b|fruit en|fruitsalade|fruitmix|aardbeien|appels|peren|bananen|druiven|sinaasappel|mandarijn|mango|meloen|ananas|avocado|blauwe bessen|citroen|kiwi|appel$|^peren|frambozen|appelmoes|appelcompote|fruitpotjes|knijphapjes|vruchten'), R('\\b(appels?|peren|bananen|druiven|sinaasappels?|mandarijnen|mango|aardbeien|bosbessen|frambozen|kiwi|avocado|ananas|meloen|citroenen|limoenen)\\b')],
  ['groente', R('groente|paprika|komkommer|tomaat|tomaten|courgette|champignon|sla$|^sla$|rucola|veldsla|prei|ui$|uien|wortel|wortelen|peen|spinazie|andijvie|witlof|spruit|broccoli|bloemkool|^kool|koolgroenten|rode kool|pompoen|aubergine|radijs|selderij|rauwkost|knolgroenten|boerenkool|bietjes|paddenstoelen|asperges|ovengroente|wokgroente|roerbakgroente|snoepgroente|haricots|slaverrijkers|mais|rijst, pasta|tomaat, paprika|doperwten|peterselie'), R('\\b(paprika|komkommer|tomaten|tomaat|courgette|champignons|sla|ijsbergsla|ui|uien|wortelen|wortel|spinazie|broccoli|bloemkool|prei|spruiten|pompoen)\\b')],

  // --- rest ---
  ['pasta-rijst', R('pasta|rijst|noedels|mie |^mie|couscous|gnocchi|orzo|instant noedels|spaghetti|macaroni|quinoa|bulgur|^meer rijst|^meer pasta'), R('\\b(spaghetti|penne|macaroni|fusilli|tagliatelle|rijst|noedels|couscous)\\b')],
  ['olie-azijn', R('olie|oliën|azijn|bak- en braad|kookvet'), R('\\b(olijfolie|zonnebloemolie|azijn|olie)\\b')],
  ['ijs', R('^ijs|handijs|room handijs|ijs$|waterijs|ijsjes'), R('\\b(ijs|ijsjes|magnum|cornetto)\\b')],
  ['conserven', R('conserven|blik$|groentemix|vleesconserven|compote|mais|maiskorrels')],
  ['babyvoeding', R('baby|kindertoetjes|peutervoeding')],
];

// Grabbelbak-families: niet "X is X", dus tellen niet als vergelijkbaar en geven geen familie (alleen de smalle categorie telt).
export const GEEN_VERGELIJKING = new Set(['non-food', 'lichaamsverzorging', 'huisdiervoer', 'luchtverfrisser', 'maaltijd', 'conserven', 'babyvoeding']);

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const FAMILIES = [...new Set(REGELS.map((r) => r[0]))].filter((f) => !GEEN_VERGELIJKING.has(f));
// Families waarvoor "per stuk" over de hele familie zinvol vergelijkbaar is (een brood is een brood, een ei is een ei).
export const STUK_FAMILIES = new Set(['brood', 'broodjes', 'eieren']);
// Families waar "per stuk" alleen binnen dezelfde winkelcategorie telt: ananas is geen banaan, avocado geen paprika.
export const STUK_CATEGORIE_FAMILIES = new Set(['groente', 'fruit']);
// Families waar de familie-terugval onzin geeft (kervel tegen zwarte peper, Aromat tegen MSG): alleen vergelijken binnen de winkelcategorie.
export const GEEN_TERUGVAL = new Set(['kruiden']);

const cache = new Map();
// -> familienaam of null (grabbelbakken en onduidelijke categorieen krijgen geen familie)
export function familieVan(p) {
  const cat = strip(p?.categorie), tit = strip(p?.titel);
  const k = cat + '\u0001' + tit;
  if (cache.has(k)) return cache.get(k);
  let f = null;
  if (Object.hasOwn(CATEGORIE_EXACT, cat)) f = CATEGORIE_EXACT[cat];
  if (!f && cat) for (const [naam, c] of REGELS) if (c.test(cat)) { f = naam; break; }
  if (!f) for (const [naam, , t] of REGELS) if (t && t.test(tit)) { f = naam; break; }
  // Winkelcategorieen mengen hele broden, broodjes, halve broden en gebak: de titel verfijnt dat.
  if (f === 'brood' || f === 'broodjes') {
    if (/donut|muffin|carre|tongen|koggetjes|gebak|taart|vlaai/.test(tit)) f = 'koek';
    else if (/\bhalf\b|\bhalve\b/.test(tit)) f = 'brood-half'; // een half brood is niet te vergelijken met een heel brood
    else if (f === 'brood' && !/brood|vloer|rond|tijger|desem|bruin|wit|volkoren|meergranen|waldkorn|afbak|boule|baguette|ciabatta|casino|pistolet|gesneden|petit|batard|heel|pains|bastille|boulogne|triomphe|molen|spelt|rogge/.test(tit)) f = 'koek';
    else if (f === 'brood' && /broodje|bollen|bolletje|croissant|puntje|\bbol\b/.test(tit)) f = 'broodjes';
  }
  // Te grove families (kip, kaas, sauzen, toetjes): de titel splitst af wat geen gelijkwaardig alternatief is. Alleen voor de
  // familie-terugval; de winkelcategorie blijft de eerste keus. De deelfamilies tonen op de pagina onder dezelfde naam (SUBFAMILIE).
  if (f === 'kip') {
    if (/gebraden|gerookt|gegaard|gegrild|roasted|cordon|schnitzel|nugget|gyoza|krokant|rollade|kebab|shoarma|doner|worst|spies|saté|sate|ontbijt|kipkorn|vleeswaar|flakes|wings|teriyaki|kiprol/.test(tit)) f = 'kip-bereid';
  } else if (f === 'kaas') {
    if (/geraspt|rasp/.test(tit)) f = 'kaas-snack';
    else if (/smeer|spread|cream cheese|creamy|boursin|roomkaas|ricotta|mascarpone|cottage|mozzarella|feta|apetina|brie|camembert|geit|schaap|blauw|bleu|blue\b|fondue|fondu|hut?tenkase|paneer|halloumi|burrata/.test(tit)) f = 'kaas-zacht';
    else if (/blokjes|kaasblokje|hapjes|snack|(?<!& )bites|schijfjes|sticks/.test(tit)) f = 'kaas-snack';
  } else if (f === 'sauzen') {
    if (/(?<!mayo)mix\b|dipmix|poeder|kruidenmix|maaltijdmix|bouillon|jus\b|\bdroog\b|fond\b|bindmiddel|roux/.test(tit)) f = 'sauzen-mix';
    else if (/pesto|tapenade|spread|dip|guacamole|hummus|tzatziki|salsa|aioli|sambal|sriracha/.test(tit)) f = 'sauzen-dip';
    else if (!/ketchup|boter|ravioli|tomatenpuree|concentraat/.test(tit) && /tomaat|tomaten|passata|pizzasaus|pastasaus|pulp|puree|besciamella|bolognese|carbonara/.test(tit)) f = 'sauzen-pasta';
  } else if (f === 'toetjes') {
    if (/yoghurt|kwark|skyr|knijp|activia|danoontje/.test(tit) || /yoghurt/.test(cat)) f = 'yoghurt';
    else if (/tiramisu|trifle|dessert|cheesecake|panna cotta|miljonair|\bijs\b|mousse|creme brulee|tarte|taart/.test(tit)) f = 'toetjes-luxe';
    else if (/pudding|griesmeel|rijstebrij|rijstpap/.test(tit)) f = 'toetjes-pudding';
  }
  if (f && GEEN_VERGELIJKING.has(f)) f = null;
  if (cache.size > 200000) cache.clear();
  cache.set(k, f);
  return f;
}

const NAMEN = {
  'wasmiddel': 'Wasmiddel', 'afwasmiddel': 'Afwasmiddel', 'schoonmaak': 'Schoonmaak', 'tandverzorging': 'Tandverzorging',
  'haarverzorging': 'Haarverzorging', 'douche-zeep': 'Douche en zeep', 'deodorant': 'Deodorant', 'papier': 'Papier',
  'luiers-hygiene': 'Luiers en hygiene', 'soep': 'Soep', 'salades': 'Salades', 'vega': 'Vegetarisch', 'pizza': 'Pizza',
  'peulvruchten': 'Peulvruchten', 'kruiden': 'Kruiden', 'sauzen': 'Sauzen', 'pickles': 'Olijven en augurken', 'wraps': 'Wraps en naan',
  'repen': 'Repen', 'eiwitdrank': 'Eiwitdrank', 'energydrank': 'Energydrank', 'broodjes': 'Broodjes', 'brood': 'Brood',
  'brood-half': 'Half brood', 'beschuit-toast': 'Beschuit en crackers', 'bakken': 'Bakken', 'koek': 'Koek en gebak',
  'zuiveldrank': 'Zuiveldrank', 'plantaardige-zuivel': 'Plantaardige zuivel', 'koffie': 'Koffie', 'thee': 'Thee', 'cola': 'Cola',
  'bier': 'Bier', 'wijn': 'Wijn', 'gedistilleerd': 'Sterke drank', 'water': 'Water', 'sap': 'Sap', 'siroop': 'Siroop',
  'frisdrank': 'Frisdrank', 'eieren': 'Eieren', 'room': 'Room', 'melk': 'Melk', 'toetjes': 'Toetjes', 'yoghurt': 'Yoghurt en kwark',
  'boter': 'Boter en margarine', 'kaas': 'Kaas', 'gehakt': 'Gehakt', 'kip': 'Kip', 'vleeswaren': 'Vleeswaren', 'worst': 'Worst',
  'rundvlees': 'Rundvlees', 'varkensvlees': 'Varkensvlees', 'vis': 'Vis', 'chocolade': 'Chocolade', 'snoep': 'Snoep', 'chips': 'Chips',
  'noten': 'Noten', 'borrelsnacks': 'Borrelsnacks', 'ontbijt': 'Ontbijt', 'beleg': 'Broodbeleg', 'aardappel': 'Aardappelen',
  'fruit': 'Fruit', 'groente': 'Groente', 'pasta-rijst': 'Pasta en rijst', 'olie-azijn': 'Olie en azijn', 'ijs': 'IJs',
};
// Nette naam voor de pagina; producten zonder familie heten 'Overig'.
const SUBFAMILIE = { 'kip-bereid': 'kip', 'kaas-zacht': 'kaas', 'kaas-snack': 'kaas', 'sauzen-mix': 'sauzen', 'sauzen-dip': 'sauzen', 'sauzen-pasta': 'sauzen', 'toetjes-luxe': 'toetjes', 'toetjes-pudding': 'toetjes' };
export const familieNaam = (f) => (f ? NAMEN[SUBFAMILIE[f] ?? f] ?? NAMEN[f] ?? f[0].toUpperCase() + f.slice(1) : 'Overig');
