// SCRABBLE ENGINE — extracted from index.html
// Loaded lazily when game is first selected

const SCR_TILES = {
  A:9,B:2,C:2,D:4,E:12,F:2,G:3,H:2,I:9,J:1,K:1,L:4,M:2,
  N:6,O:8,P:2,Q:1,R:6,S:4,T:6,U:4,V:2,W:2,X:1,Y:2,Z:1,'_':2
};
const SCR_VALUES = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,
  N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10,'_':0
};

// ?? Board Premium Squares (15·15) ???????????????????????????
// Types: 0=normal,1=DLS,2=TLS,3=DWS,4=TWS,5=star
const SCR_BOARD_LAYOUT = (()=>{
  const b = Array(225).fill(0);
  const s=(r,c,t)=>{b[r*15+c]=t;};
  // TWS: corners and edges
  [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]].forEach(([r,c])=>s(r,c,4));
  // DWS: diagonals
  [[1,1],[2,2],[3,3],[4,4],[1,13],[2,12],[3,11],[4,10],
   [13,1],[12,2],[11,3],[10,4],[13,13],[12,12],[11,11],[10,10],
   [7,7]].forEach(([r,c])=>s(r,c,r===7&&c===7?5:3));
  // TLS
  [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]].forEach(([r,c])=>s(r,c,2));
  // DLS
  [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],
   [7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]].forEach(([r,c])=>s(r,c,1));
  b[7*15+7]=5; // center star
  return b;
})();

// ?? SCR State ????????????????????????????????????????????????
let SCR = {
  board: Array(225).fill(null), // null or {letter,value,locked}
  bag: [],
  rack: [],           // {letter,value,id} — player's tiles
  opRack: [],         // opponent / bot tiles
  scores: [0,0],      // [player,bot/opp]
  turn: 0,            // 0=player, 1=bot/opp
  isBot: false,
  botDifficulty: 'medium',
  playerName: 'PLAYER',
  opName: 'BOT',
  placed: [],         // {idx,letter,value,rackId} placed this turn (not locked)
  selectedRackId: null,
  consecutivePasses: 0,
  gameOver: false,
  unsubs: [],
  isMultiplayer: false,
  playerNum: 1,
  roomCode: null,
  exchangeMode: false,
  exchangeSelected: [],
  blanksOnBoard: {}, // idx -> chosen letter
};

// ?? Word List (curated ~4000 common valid words) ????????????
// We'll use the free Datamuse API for word validation
async function scrIsValidWord(word) {
  if (word.length < 2) return false;
  try {
    const r = await fetch(`https://api.datamuse.com`);
    const d = await r.json();
    return d.length > 0 && d[0].word.toLowerCase() === word.toLowerCase();
  } catch(e) {
    // fallback: allow all words if API fails
    return true;
  }
}

// Bot uses a curated word list for finding moves
const SCR_WORDLIST = 'AA AB AD AE AG AH AI AL AM AN AR AS AT AW AX AY BA BE BI BO BY DA DE DI DO ED EF EH EL EM EN ER ES ET EX FA FE GI GO HA HE HI HM HO ID IF IN IS IT JO KA KI LA LI LO MA ME MI MM MO MU MY NA NE NO NU OD OE OF OH OI OM ON OP OR OS OW OX OY PA PE PI PO QI RE SH SI SO TA TI TO UH UM UN UP UT WE WO XI XU YA YE ZA ACE ACT ADD ADO AGE AGO AID AIM AIR ALL AMP AND ANT APE APP APT ARC ARE ARK ARM ART ASH ASK ASS ATE AUK AWE AXE AYE BAA BAD BAG BAN BAR BAT BAY BED BEG BET BEY BIG BIT BOA BOG BOO BOP BOW BOX BOY BUD BUG BUN BUS BUT BUY CAB CAN CAP CAR CAT CAW COB COD COG COP COT COW COY CRY CUB CUD CUP CUR CUT DAB DAD DAM DAN DAP DAW DAY DEB DEN DEW DID DIG DIM DIN DIP DOC DOE DOG DOT DRY DUB DUD DUE DUG DUN DUO EAR EAT EEL EGG ELF ELK ELM EMU END ERA EVE EWE EYE FAD FAN FAR FAT FAX FED FEW FIG FIN FIT FLY FOB FOE FOG FOP FOR FOX FRY FUB FUN FUR GAB GAG GAP GAR GAS GAY GEL GEM GET GIG GIN GNU GOB GOD GOT GUM GUN GUT GUY GYM HAD HAG HAM HAS HAT HAW HAY HEP HER HEW HID HIM HIT HOB HOD HOG HOP HOT HOW HOY HUB HUG HUM HUT ICE ICY ILL IMP INN IRE IVY JAB JAM JAR JAW JAY JET JIB JIG JOB JOG JOT JOW JOY JUG JUT KEG KID KIT LAB LAD LAG LAM LAP LAW LAX LAY LEA LED LEG LET LID LIT LOB LOG LOO LOP LOT LOW LOX LUG MAD MAN MAP MAR MAT MAW MAY MET MOB MOD MOM MOP MOW MUD MUG NAB NAG NAP NAP NAY NET NEW NIB NIL NIP NOB NOD NOP NOR NOT NOW NUB NUN NUT OAF OAK OAR OAT OCA ODD ODE OHO OHM OHO OLD ONE OPT ORC ORE ORT OUR OUT OWE OWL OWN PAD PAL PAN PAP PAR PAS PAT PAW PAX PAY PEA PEE PEG PEN PEP PEW PIE PIG PIP PIT POP POT POW PRY PUB PUD PUN PUP PUS PUT RAG RAM RAN RAP RAT RAW RAY REB RED REF REP RIB RID RIG RIM RIP ROB ROD ROE ROT ROW RUB RUG RUM RUN RUT SAC SAD SAG SAP SAT SAW SAX SAY SEA SET SEW SKI SKY SLY SOB SOD SON SOP SOT SOW SOY SPA SPY STY SUB SUE SUM SUN SUP TAB TAD TAN TAP TAR TAT TAX TAV TEA TEN TIE TIN TIP TOE TON TOO TOP TOT TOW TOY TUB TUG TUN TUP TUT TWO UDO UGH UMP URN USE VAN VAT VAW VEX VIA VIE VOW WAD WAG WAN WAP WAR WAS WAW WAX WAY WEB WED WIG WIN WIT WOE WOG WON WOO WOP WOT YAK YAM YAP YAW YEA YEP YES YEW YOB YOD YOW ZAG ZAP ZED ZIT ZOO ABLE ACED ACES ACID ACME ACNE ACRE ACTS ADDS ADOS AGED AGES AIDE AIDS AIMS AIRS AIRY AJAR AKIN ALOE ALSO ALTO AMID AMOK AMPS ANEW ANTE ANTS ARCH ARCS AREA ARIA ARID ARMY ASHY ATOP AUNT AURA AVID AWED AXES AXIS BABE BACK BADE BAIL BALE BALK BALL BALM BAND BANE BANG BANK BARE BARK BARN BASK BASS BAST BATE BATH BAUD BAWL BAYS BEAD BEAK BEAM BEAN BEAT BEEN BEER BEES BEET BELT BEND BIAS BIDS BIFF BIKE BILL BIND BIRD BITE BITS BLAB BLED BLEW BLOB BLOC BLOG BLOW BLUE BLUR BOAR BOAT BODE BOLD BOLT BOND BONE BONG BOOK BOOM BOON BORE BOSS BOUT BOXY BRED BREW BRIM BROW BURL BURN BURP BURR BURS BUST BUSY BUZZ BYTE CAFE CAGE CAKE CALF CALL CALM CAME CAMP CANE CAPE CARE CART CASE CASH CAST CAVE CENT CHAD CHAR CHAT CHEF CHEW CHIC CHIN CHIP CHIT CHOP CHOW CITE CITY CLAD CLAM CLAP CLAY CLIP CLOD CLOG CLOP CLOT CLUE COAL COAT COAX COIL COIN COKE COLD COLE COLT COME CONE COPY CORD CORE CORK CORN COST COUP COZY CRAB CRAG CRAM CRAW CREW CRUX CUBE CUFF CULT CURE CURL CUTE CYAN DABS DAIS DAME DARE DARK DARN DART DASH DATO DAUB DAWN DAZE DEAD DEAL DEAR DECK DEED DEEP DEFT DELL DEMO DENT DENY DESK DICE DIKE DILL DINE DIRT DISC DISH DISK DIVE DOCK DOLE DOLL DOME DONE DONG DOOR DOSE DOTE DOTH DOVE DOWN DRAB DRAG DRAW DREW DRIP DROP DRUG DRUM DUAL DUCK DULL DUMB DUMP DUNK DUSK DUST EACH EARL EARN EASE EDIT EMIT ENVY EPIC EVEN EVER EXAM EXEC EXPO FACE FACT FADE FAIL FAIR FAKE FALL FAME FANG FARE FARM FAST FATE FAWN FAZE FEAT FEED FEEL FEET FELL FELT FEND FERN FEUD FILE FILL FILM FIND FINE FISH FIST FIZZ FLAG FLAP FLAT FLAW FLEA FLED FLOG FLOP FLOW FLUE FLUX FOAM FOIL FOLD FOND FOOL FOOT FORD FORE FORK FORM FORT FOUL FOUR FOWL FRAIL FREE FRET FROM FUEL FULL FUME FUND FUSE FUSS GALE GAME GANG GAPE GARB GASH GATE GAVE GAZE GEAR GELS GENE GILD GILL GIST GLIB GLOB GLOP GLOW GLUE GNAT GNAW GOLF GONE GOOF GOWN GRAB GRAD GRAM GRAY GREW GRID GRIM GRIN GRIP GRIT GRUB GULF GURU GUSH GUST HACK HAIL HAIR HALE HALL HALT HAND HANG HARD HARE HARM HASH HAVE HAZE HAZY HEED HEAD HEAL HEAP HEAR HEAT HEAVY HEEL HELP HEMP HERB HERO HEWN HICK HIDE HIGH HIKE HILL HILT HINT HISS HIVE HOAX HOSE HOWL HUMP HUNT HURL HUSH HUSK ICON IDEA IDLE IDOL INCH IRON ISLE ITEM JACK JADE JAIL JAPE JEER JEST JIVE JOLT JOTS JUMP JUNK JUST KEEN KEEP KNIT KNOB KNOT KNOW LACK LAID LAKE LAME LAND LANE LARD LARK LASH LASS LAST LATE LAUD LAVA LAWN LEAD LEAN LEAP LEND LENS LIEN LIEU LILT LIME LIMP LINE LINT LION LIST LIVE LOAD LOAF LOAN LOCK LOFT LONG LOOK LOOM LORE LOSE LOSS LOST LOUD LOVE LULL LUMP LURE LURK LUST MACE MADE MAIL MAIM MAKE MANE MARE MART MASH MASK MASS MAST MATE MAZE MEAD MEAL MEAN MEAT MELD MELT MEMO MEND MENU MERE MESH MILK MILL MIME MIND MINE MINT MIRE MISS MIST MODE MOLD MONK MONO MOOD MOOR MOPE MORN MOST MOUE MUCK MULL MUST MUTE MYTH NABS NAIL NAPE NAPS NARY NAVE NAVY NEAR NECK NEED NEST NICE NIGH NITE NODE NOEL NOIR NOOK NORM NOSE NOUN NOTE NUMB OATH OBOE ODDS ONCE ONES ONLY OPEN ORAL ORBS ORCA OVEN OVER OWED OWED PACE PACK PAGE PAIN PAIR PALM PANE PANG PANT PARA PARE PARK PART PAST PAVE PAWN PEAK PEAL PEAR PEAT PECK PEEL PEEN PEER PELT PENT PERM PEST PICK PIER PILE PILL PINE PINK PIPE PITY PLAN PLAY PLEA PLOD PLOP PLOT PLOW PLOY PLUM PLUS PODS POLL POLO POND PONY PORE PORK POUT PRAM PRAY PREP PREY PRIG PROP PROW PUFF PULP PUMP PURR PUSH PUTT QUIZ RACK RAGE RAID RAIL RAIN RAMP RANK RANT RARE RASH RATE RAVE REAL REAP REED REEF REEL REIN REND RENT REPU REST RICE RICH RIDE RIFE RIND RING RIOT RISE RISK RIVET ROAD ROAM ROAR ROBE RODE ROLE ROLL ROUT ROVE RUDE RUIN RULE RUSE RUST RUTS SACK SAFE SAGA SAGE SAKE SALE SALT SAME SAND SANE SANG SANK SAP SASH SATE SAVE SCAR SCOT SCOW SEAR SEAT SECT SEED SEEM SEEN SEEP SELF SELL SEND SERF SEWN SEXY SHED SHOE SHOT SHOW SHUN SHUT SICK SIDE SIGH SIGN SILK SILL SING SINK SIRE SITE SIZE SLAB SLAG SLAP SLAT SLEW SLID SLIM SLIP SLIT SLOB SLOP SLOW SLUG SLUM SLUR SMOG SNAP SNOB SNUB SOCK SOFT SOIL SOME SONG SOON SOOT SORE SORT SOUL SOUP SOUR SOWN SPAN SPAR SPED SPIN SPIT SPOT SPUR STAR STAY STEM STEP STEW STIR STOP STOW STUB STUN SUCH SUIT SULK SUNG SUNK SURE SURF SWAY SWIM SWUM SYNC TACK TAKE TALE TALK TALL TAME TANG TANK TAPE TARE TASK TAUT TEAM TEAR TEEM TEMP TEND TENT TERM TEST TEXT THAN THAT THEM THEN THEY THIN THIS THUS TICK TIDE TIDY TIER TILE TILL TILT TIME TINT TINY TIRE TOAD TOIL TOLL TOMB TOME TONG TOOT TORE TORN TOSS TOUR TOWN TREK TRIM TRIO TRIP TROD TROT TROY TRUE TRUNK TUBA TUCK TUFF TUFT TUMMY TUSK TUTU TYPE UGLY ULNA UNDO UNIT UPON URGE USED USER VAIN VALE VASE VAST VEIN VENT VERY VEST VETO VIBE VILE VINE VISE VOID VOTE WADE WAFT WAGE WAIF WAIST WAKE WANE WARD WARM WARY WAVE WEAN WEAR WEED WEEK WELD WELL WEND WEPT WHET WHIM WHIP WHIT WHOM WHOP WICK WIDE WILE WILL WILT WILY WIND WINE WING WINK WISE WISH WISP WITH WOKE WOMB WOOD WORD WORE WORM WOVE WREN WRIT YORE YOUR ZEAL ZERO ZEST ZINC ZONE ZOOM'.split(' ');

const SCR_WORD_SET = new Set(SCR_WORDLIST);

function scrWordValid(word) {
  return SCR_WORD_SET.has(word.toUpperCase());
}

// ?? Bag helpers ??????????????????????????????????????????????
function scrBuildBag() {
  const bag = [];
  for (const [letter, count] of Object.entries(SCR_TILES)) {
    for (let i = 0; i < count; i++) bag.push({ letter, value: SCR_VALUES[letter] });
  }
  // Fisher-Yates shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function scrDraw(n) {
  const drawn = [];
  for (let i = 0; i < n && SCR.bag.length > 0; i++) drawn.push(SCR.bag.pop());
  return drawn;
}

// ?? Board helpers ?????????????????????????????????????????????
function scrIdx(r, c) { return r * 15 + c; }
function scrRC(i) { return { r: Math.floor(i / 15), c: i % 15 }; }

const SCR_BONUS_LABELS = { 0:'', 1:'DLS', 2:'TLS', 3:'DWS', 4:'TWS', 5:'?' };
const SCR_BONUS_CLASS  = { 0:'sq-normal', 1:'sq-dls', 2:'sq-tls', 3:'sq-dws', 4:'sq-tws', 5:'sq-star' };

// ?? Init & Render ?????????????????????????????????????????????
function scrInitGame(playerName, opName, isBot, diff) {
  SCR.board = Array(225).fill(null);
  SCR.bag = scrBuildBag();
  SCR.rack = [];
  SCR.opRack = [];
  SCR.scores = [0, 0];
  SCR.turn = 0;
  SCR.isBot = isBot;
  SCR.botDifficulty = diff || 'medium';
  SCR.playerName = playerName;
  SCR.opName = opName;
  SCR.placed = [];
  SCR.selectedRackId = null;
  SCR.consecutivePasses = 0;
  SCR.gameOver = false;
  SCR.exchangeMode = false;
  SCR.exchangeSelected = [];
  SCR.blanksOnBoard = {};

  // Draw racks
  SCR.rack = scrDraw(7).map((t, i) => ({ ...t, id: 'p' + i + Date.now() }));
  SCR.opRack = scrDraw(7).map((t, i) => ({ ...t, id: 'b' + i + Date.now() }));

  scrBuildBoard();
  scrRenderRack();
  scrUpdateScores();
  scrUpdateTurnIndicator();
  scrUpdateTilesLeft();
  showScreen('scrabble-screen');
  scrLog('Game started — ' + playerName + ' vs ' + opName, 'sys');
}

function scrBuildBoard() {
  const el = document.getElementById('scrabble-board');
  el.innerHTML = '';
  for (let i = 0; i < 225; i++) {
    const sq = document.createElement('div');
    const type = SCR_BOARD_LAYOUT[i];
    sq.className = 'sq ' + SCR_BONUS_CLASS[type];
    sq.dataset.idx = i;
    sq.onclick = () => scrClickSquare(i);
    el.appendChild(sq);
  }
  scrRenderBoard();
}

function scrRenderBoard() {
  const el = document.getElementById('scrabble-board');
  for (let i = 0; i < 225; i++) {
    const sq = el.children[i];
    if (!sq) continue;
    const tile = SCR.board[i];
    const placed = SCR.placed.find(p => p.idx === i);
    const type = SCR_BOARD_LAYOUT[i];

    sq.className = 'sq ' + SCR_BONUS_CLASS[type];
    sq.innerHTML = '';

    if (tile) {
      sq.classList.add('has-tile');
      if (placed) sq.classList.add('placed-this-turn');
      const displayLetter = tile.letter === '_' ? (SCR.blanksOnBoard[i] || '?') : tile.letter;
      const letterSpan = document.createElement('span');
      letterSpan.className = 'tile-letter';
      letterSpan.textContent = displayLetter;
      const ptsSpan = document.createElement('span');
      ptsSpan.className = 'tile-pts';
      ptsSpan.textContent = tile.value > 0 ? tile.value : '';
      sq.appendChild(letterSpan);
      sq.appendChild(ptsSpan);
      if (placed) sq.onclick = () => scrRecallTile(i);
    } else {
      sq.onclick = () => scrClickSquare(i);
      if (SCR.selectedRackId !== null) {
        sq.classList.add('highlighted');
      }
      const label = SCR_BONUS_LABELS[type];
      if (label) {
        const lbl = document.createElement('span');
        lbl.className = 'sq-label';
        lbl.textContent = label;
        sq.appendChild(lbl);
      }
    }
  }
}

function scrRenderRack() {
  const el = document.getElementById('scrabble-rack');
  el.innerHTML = '';
  SCR.rack.forEach(tile => {
    if (SCR.placed.some(p => p.rackId === tile.id)) return; // on board
    const div = document.createElement('div');
    div.className = 'rack-tile' + (tile.letter === '_' ? ' blank-wild' : '') + (SCR.selectedRackId === tile.id ? ' selected' : '');
    div.dataset.id = tile.id;
    const l = document.createElement('span');
    l.className = 'rack-letter';
    l.textContent = tile.letter === '_' ? '?' : tile.letter;
    const p = document.createElement('span');
    p.className = 'rack-pts';
    p.textContent = tile.value;
    div.appendChild(l);
    div.appendChild(p);
    div.onclick = () => scrSelectTile(tile.id);
    el.appendChild(div);
  });
}

function scrUpdateScores() {
  const el = document.getElementById('scr-scores');
  if (!el) return;
  el.innerHTML = '';
  [[SCR.playerName, 0], [SCR.opName, 1]].forEach(([name, idx]) => {
    const row = document.createElement('div');
    row.className = 'scr-score-row' + (SCR.turn === idx ? ' active-turn' : '');
    row.innerHTML = `<span>${name}</span><span class="val">${SCR.scores[idx]}</span>`;
    el.appendChild(row);
  });
}

function scrUpdateTurnIndicator() {
  const el = document.getElementById('scr-turn-ind');
  if (!el) return;
  const myTurn = SCR.turn === 0;
  el.textContent = myTurn ? '🟢 YOUR TURN' : (SCR.isBot ? '🤖 BOT THINKING...' : `⏳ ${SCR.opName}'S TURN`);
  el.className = 'scr-turn-indicator ' + (myTurn ? 'your-turn' : 'their-turn');

  const btns = ['scr-play-btn','scr-recall-btn','scr-exchange-btn'];
  btns.forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = !myTurn;
  });
}

function scrUpdateTilesLeft() {
  const el = document.getElementById('scr-tiles-left');
  if (el) el.textContent = SCR.bag.length;
}

function scrLog(msg, type = '') {
  const log = document.getElementById('scr-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'scr-log-entry ' + type;
  div.textContent = '> ' + msg;
  log.prepend(div);
}

// ?? Tile interaction ??????????????????????????????????????????
function scrSelectTile(id) {
  if (SCR.turn !== 0 || SCR.gameOver) return;
  SCR.selectedRackId = SCR.selectedRackId === id ? null : id;
  scrRenderRack();
  scrRenderBoard();
}

function scrClickSquare(i) {
  if (SCR.turn !== 0 || SCR.gameOver || SCR.selectedRackId === null) return;
  if (SCR.board[i] !== null) return; // occupied
  // Find tile
  const tile = SCR.rack.find(t => t.id === SCR.selectedRackId);
  if (!tile) return;

  if (tile.letter === '_') {
    // Show blank modal
    scrShowBlankModal(i, tile);
    return;
  }
  scrPlaceTile(i, tile);
}

function scrPlaceTile(i, tile, chosenLetter) {
  const letter = chosenLetter || tile.letter;
  SCR.board[i] = { letter: tile.letter, value: tile.value };
  if (tile.letter === '_') SCR.blanksOnBoard[i] = chosenLetter;
  SCR.placed.push({ idx: i, rackId: tile.id, letter, value: tile.value });
  SCR.selectedRackId = null;
  scrRenderRack();
  scrRenderBoard();
}

function scrRecallTile(i) {
  if (SCR.turn !== 0 || SCR.gameOver) return;
  const pIdx = SCR.placed.findIndex(p => p.idx === i);
  if (pIdx === -1) return;
  SCR.placed.splice(pIdx, 1);
  SCR.board[i] = null;
  delete SCR.blanksOnBoard[i];
  scrRenderRack();
  scrRenderBoard();
}

window.scrRecall = function() {
  if (SCR.turn !== 0) return;
  // Recall all placed tiles
  SCR.placed.forEach(p => {
    SCR.board[p.idx] = null;
    delete SCR.blanksOnBoard[p.idx];
  });
  SCR.placed = [];
  SCR.selectedRackId = null;
  scrRenderRack();
  scrRenderBoard();
};

window.scrShuffle = function() {
  for (let i = SCR.rack.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [SCR.rack[i], SCR.rack[j]] = [SCR.rack[j], SCR.rack[i]];
  }
  scrRenderRack();
};

// ?? Blank modal ???????????????????????????????????????????????
let _blankPending = null;
function scrShowBlankModal(boardIdx, tile) {
  _blankPending = { boardIdx, tile };
  const modal = document.getElementById('blank-modal');
  const grid = document.getElementById('blank-letter-grid');
  grid.innerHTML = '';
  for (let c = 0; c < 26; c++) {
    const letter = String.fromCharCode(65 + c);
    const btn = document.createElement('button');
    btn.className = 'blank-letter-btn';
    btn.textContent = letter;
    btn.onclick = () => {
      modal.classList.remove('active');
      scrPlaceTile(_blankPending.boardIdx, _blankPending.tile, letter);
      _blankPending = null;
    };
    grid.appendChild(btn);
  }
  modal.classList.add('active');
}

// ?? Word validation helpers ????????????????????????????????????
function scrGetWordsFormed() {
  if (SCR.placed.length === 0) return null;

  // Determine direction
  const rows = [...new Set(SCR.placed.map(p => scrRC(p.idx).r))];
  const cols = [...new Set(SCR.placed.map(p => scrRC(p.idx).c))];
  const isHorizontal = rows.length === 1;
  const isVertical = cols.length === 1;

  if (!isHorizontal && !isVertical && SCR.placed.length > 1) return null; // not in a line

  // Check connectivity (no gaps)
  if (SCR.placed.length > 1) {
    if (isHorizontal) {
      const r = rows[0];
      const sortedCols = cols.sort((a,b)=>a-b);
      for (let c = sortedCols[0]; c <= sortedCols[sortedCols.length-1]; c++) {
        if (!SCR.board[scrIdx(r, c)]) return null; // gap
      }
    } else {
      const c = cols[0];
      const sortedRows = rows.sort((a,b)=>a-b);
      for (let r = sortedRows[0]; r <= sortedRows[sortedRows.length-1]; r++) {
        if (!SCR.board[scrIdx(r, c)]) return null;
      }
    }
  }

  const words = [];

  // Main word
  const mainWord = scrExtractWord(SCR.placed[0].idx, isHorizontal || SCR.placed.length === 1 ? 'H' : 'V');
  if (mainWord) words.push(mainWord);

  // Cross words for each placed tile
  SCR.placed.forEach(p => {
    const cross = scrExtractWord(p.idx, isHorizontal || SCR.placed.length === 1 ? 'V' : 'H');
    if (cross && cross.word.length > 1) words.push(cross);
  });

  // Deduplicate
  const seen = new Set();
  return words.filter(w => { const k = w.word+'@'+w.startIdx+'@'+w.dir; if(seen.has(k)) return false; seen.add(k); return true; });
}

function scrExtractWord(anchorIdx, dir) {
  const { r: ar, c: ac } = scrRC(anchorIdx);
  let start, end;
  if (dir === 'H') {
    let c = ac;
    while (c > 0 && SCR.board[scrIdx(ar, c - 1)]) c--;
    start = scrIdx(ar, c);
    while (c < 14 && SCR.board[scrIdx(ar, c + 1)]) c++;
    end = scrIdx(ar, c);
  } else {
    let r = ar;
    while (r > 0 && SCR.board[scrIdx(r - 1, ac)]) r--;
    start = scrIdx(r, ac);
    while (r < 14 && SCR.board[scrIdx(r + 1, ac)]) r++;
    end = scrIdx(r, ac);
  }
  if (start === end && SCR.placed.length === 1 && !SCR.placed.some(p => p.idx === anchorIdx)) return null;

  let word = '', indices = [];
  if (dir === 'H') {
    const r = scrRC(start).r;
    for (let c = scrRC(start).c; c <= scrRC(end).c; c++) {
      const i = scrIdx(r, c);
      const tile = SCR.board[i];
      if (!tile) return null;
      word += tile.letter === '_' ? (SCR.blanksOnBoard[i] || '?') : tile.letter;
      indices.push(i);
    }
  } else {
    const c = scrRC(start).c;
    for (let r = scrRC(start).r; r <= scrRC(end).r; r++) {
      const i = scrIdx(r, c);
      const tile = SCR.board[i];
      if (!tile) return null;
      word += tile.letter === '_' ? (SCR.blanksOnBoard[i] || '?') : tile.letter;
      indices.push(i);
    }
  }
  return { word, indices, startIdx: start, dir };
}

function scrScoreWord(wordObj) {
  let letterSum = 0;
  let wordMult = 1;
  wordObj.indices.forEach(i => {
    const tile = SCR.board[i];
    if (!tile) return;
    const isNew = SCR.placed.some(p => p.idx === i);
    const letterVal = tile.value;
    const bonus = isNew ? SCR_BOARD_LAYOUT[i] : 0;
    if (bonus === 1) letterSum += letterVal * 2;      // DLS
    else if (bonus === 2) letterSum += letterVal * 3;  // TLS
    else letterSum += letterVal;
    if (bonus === 3 || bonus === 5) wordMult *= 2;     // DWS
    else if (bonus === 4) wordMult *= 3;               // TWS
  });
  return letterSum * wordMult;
}

// ?? Play word ?????????????????????????????????????????????????
window.scrPlayWord = async function() {
  if (SCR.turn !== 0 || SCR.gameOver) return;
  if (SCR.placed.length === 0) { scrLog('Place some tiles first!', 'err'); return; }

  // First move must cover center (7,7)
  const isFirstMove = !SCR.board.some((t, i) => t && !SCR.placed.some(p => p.idx === i));
  if (isFirstMove && !SCR.placed.some(p => p.idx === scrIdx(7, 7))) {
    scrLog('First word must cover the center star!', 'err'); return;
  }

  // Must connect to existing tiles (unless first move)
  if (!isFirstMove) {
    const connected = SCR.placed.some(p => {
      const { r, c } = scrRC(p.idx);
      return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([nr,nc]) =>
        nr>=0&&nr<15&&nc>=0&&nc<15 && SCR.board[scrIdx(nr,nc)] && !SCR.placed.some(pp=>pp.idx===scrIdx(nr,nc))
      );
    });
    if (!connected) { scrLog('Word must connect to existing tiles!', 'err'); return; }
  }

  const words = scrGetWordsFormed();
  if (!words) { scrLog('Invalid tile placement — must be in a straight line with no gaps!', 'err'); return; }
  if (words.length === 0) { scrLog('No valid word formed!', 'err'); return; }

  // Validate all words
  for (const w of words) {
    if (!scrWordValid(w.word)) {
      scrLog(`"${w.word}" is not a valid word!`, 'err');
      window.scrRecall();
      return;
    }
  }

  // Score
  let totalScore = words.reduce((s, w) => s + scrScoreWord(w), 0);
  // Bingo bonus (7 tiles played)
  if (SCR.placed.length === 7) { totalScore += 50; scrLog('BINGO! +50 bonus!', 'sys'); }

  // Lock tiles
  SCR.placed.forEach(p => {
    if (SCR.board[p.idx]) SCR.board[p.idx].locked = true;
  });

  SCR.scores[0] += totalScore;
  SCR.consecutivePasses = 0;
  words.forEach(w => scrLog(`${SCR.playerName}: "${w.word}" +${scrScoreWord(w)}`, 'word'));
  scrLog(`Total: +${totalScore} pts`, 'sys');

  // Remove placed tiles from rack, draw new ones
  const usedIds = SCR.placed.map(p => p.rackId);
  SCR.rack = SCR.rack.filter(t => !usedIds.includes(t.id));
  const newTiles = scrDraw(usedIds.length).map((t, i) => ({ ...t, id: 'p' + Date.now() + i }));
  SCR.rack.push(...newTiles);
  SCR.placed = [];

  scrUpdateScores();
  scrUpdateTilesLeft();
  scrRenderBoard();
  scrRenderRack();

  if (scrCheckGameOver()) {
    if (SCR.isMultiplayer) await scrMultiSync(SCR.playerNum); // mark gameover
    return;
  }

  // Bot / opponent turn
  SCR.turn = 1;
  scrUpdateTurnIndicator();
  if (SCR.isBot) {
    setTimeout(scrBotTurn, 800 + Math.random() * 600);
  } else if (SCR.isMultiplayer) {
    const nextPlayer = SCR.playerNum === 1 ? 2 : 1;
    await scrMultiSync(nextPlayer);
  }
};

// ?? Pass & Exchange ????????????????????????????????????????????
window.scrPass = async function() {
  if (SCR.turn !== 0 || SCR.gameOver) return;
  scrRecall();
  SCR.consecutivePasses++;
  scrLog(`${SCR.playerName} passed.`, 'sys');
  if (SCR.consecutivePasses >= 6) {
    scrEndGame();
    if (SCR.isMultiplayer) await scrMultiSync(SCR.playerNum);
    return;
  }
  SCR.turn = 1;
  scrUpdateTurnIndicator();
  if (SCR.isBot) {
    setTimeout(scrBotTurn, 600);
  } else if (SCR.isMultiplayer) {
    const nextPlayer = SCR.playerNum === 1 ? 2 : 1;
    await scrMultiSync(nextPlayer);
  }
};

window.scrExchangeStart = function() {
  if (SCR.turn !== 0 || SCR.gameOver || SCR.bag.length < 7) {
    scrLog('Need at least 7 tiles in bag to exchange.', 'err'); return;
  }
  scrRecall();
  SCR.exchangeMode = true;
  SCR.exchangeSelected = [];
  document.getElementById('scr-exchange-zone').style.display = '';
  scrRenderExchangeRack();
};

function scrRenderExchangeRack() {
  const el = document.getElementById('scr-exchange-rack');
  el.innerHTML = '';
  SCR.rack.forEach(tile => {
    const div = document.createElement('div');
    const sel = SCR.exchangeSelected.includes(tile.id);
    div.className = 'rack-tile' + (sel ? ' selected' : '');
    const l = document.createElement('span'); l.className = 'rack-letter'; l.textContent = tile.letter === '_' ? '?' : tile.letter;
    const p = document.createElement('span'); p.className = 'rack-pts'; p.textContent = tile.value;
    div.appendChild(l); div.appendChild(p);
    div.onclick = () => {
      if (sel) SCR.exchangeSelected = SCR.exchangeSelected.filter(id => id !== tile.id);
      else SCR.exchangeSelected.push(tile.id);
      scrRenderExchangeRack();
    };
    el.appendChild(div);
  });
}

window.scrExchangeConfirm = async function() {
  if (SCR.exchangeSelected.length === 0) { scrLog('Select tiles to exchange.', 'err'); return; }
  const toReturn = SCR.rack.filter(t => SCR.exchangeSelected.includes(t.id));
  SCR.rack = SCR.rack.filter(t => !SCR.exchangeSelected.includes(t.id));
  const newTiles = scrDraw(toReturn.length).map((t, i) => ({ ...t, id: 'p' + Date.now() + i }));
  SCR.rack.push(...newTiles);
  // Put returned tiles back in bag
  toReturn.forEach(t => SCR.bag.unshift({ letter: t.letter, value: t.value }));
  SCR.consecutivePasses++;
  scrLog(`${SCR.playerName} exchanged ${toReturn.length} tile(s).`, 'sys');
  scrExchangeCancel();
  if (SCR.consecutivePasses >= 6) {
    scrEndGame();
    if (SCR.isMultiplayer) await scrMultiSync(SCR.playerNum);
    return;
  }
  SCR.turn = 1;
  scrUpdateTurnIndicator();
  scrUpdateTilesLeft();
  scrRenderRack();
  if (SCR.isBot) {
    setTimeout(scrBotTurn, 800);
  } else if (SCR.isMultiplayer) {
    const nextPlayer = SCR.playerNum === 1 ? 2 : 1;
    await scrMultiSync(nextPlayer);
  }
};

window.scrExchangeCancel = function() {
  SCR.exchangeMode = false;
  SCR.exchangeSelected = [];
  document.getElementById('scr-exchange-zone').style.display = 'none';
};

// ?? Bot AI ?????????????????????????????????????????????????????
function scrBotTurn() {
  if (SCR.gameOver) return;

  const move = scrFindBotMove();

  if (!move) {
    // Bot passes or exchanges
    if (SCR.bag.length >= 7 && Math.random() > 0.5) {
      const n = Math.min(SCR.opRack.length, 3 + Math.floor(Math.random() * 3));
      const toReturn = SCR.opRack.splice(0, n);
      toReturn.forEach(t => SCR.bag.unshift({ letter: t.letter, value: t.value }));
      const newTiles = scrDraw(n).map((t, i) => ({ ...t, id: 'b' + Date.now() + i }));
      SCR.opRack.push(...newTiles);
      SCR.consecutivePasses++;
      scrLog(`${SCR.opName} exchanged ${n} tile(s).`, 'sys');
    } else {
      SCR.consecutivePasses++;
      scrLog(`${SCR.opName} passed.`, 'sys');
    }
    if (SCR.consecutivePasses >= 6) { scrEndGame(); return; }
    SCR.turn = 0;
    scrUpdateTurnIndicator();
    scrUpdateTilesLeft();
    return;
  }

  // Place the move
  SCR.consecutivePasses = 0;
  move.tiles.forEach(({ idx, letter, value, blankAs }) => {
    SCR.board[idx] = { letter, value, locked: true };
    if (letter === '_') SCR.blanksOnBoard[idx] = blankAs;
  });
  // Remove from bot rack
  move.tiles.forEach(t => {
    const i = SCR.opRack.findIndex(r => r.letter === t.letter);
    if (i !== -1) SCR.opRack.splice(i, 1);
  });
  // Replenish
  const newTiles = scrDraw(move.tiles.length).map((t, i) => ({ ...t, id: 'b' + Date.now() + i }));
  SCR.opRack.push(...newTiles);

  SCR.scores[1] += move.score;
  scrLog(`${SCR.opName}: "${move.word}" +${move.score}`, 'word');
  scrUpdateScores();
  scrUpdateTilesLeft();
  scrRenderBoard();

  if (scrCheckGameOver()) return;
  SCR.turn = 0;
  scrUpdateTurnIndicator();
}

function scrFindBotMove() {
  const diff = SCR.botDifficulty;
  // Collect available letters from bot's rack
  const available = SCR.opRack.map(t => t.letter);
  const blanks = available.filter(l => l === '_').length;

  // Words to try (filtered by length and rack)
  let candidates = SCR_WORDLIST.filter(word => {
    if (diff === 'easy' && word.length > 4) return false;
    if (diff === 'medium' && word.length > 6) return false;
    return scrCanFormWord(word, available, blanks);
  });

  // Sort by length descending so we try longer words first
  candidates.sort((a, b) => b.length - a.length);
  if (diff === 'easy') candidates = candidates.slice(0, 20);
  else if (diff === 'medium') candidates = candidates.slice(0, 50);

  const isEmpty = !SCR.board.some(t => t && t.locked);
  let bestMove = null;

  for (const word of candidates) {
    if (isEmpty) {
      // Place at center horizontally
      const r = 7, startC = 7 - Math.floor(word.length / 2);
      if (startC < 0 || startC + word.length > 15) continue;
      const placement = scrTryBotPlacement(word, r, startC, 'H', available, blanks);
      if (placement && (!bestMove || placement.score > bestMove.score)) bestMove = placement;
    } else {
      // Try placing along rows and columns
      for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
          if (c + word.length <= 15) {
            const p = scrTryBotPlacement(word, r, c, 'H', available, blanks);
            if (p && (!bestMove || p.score > bestMove.score)) bestMove = p;
          }
          if (r + word.length <= 15) {
            const p = scrTryBotPlacement(word, r, c, 'V', available, blanks);
            if (p && (!bestMove || p.score > bestMove.score)) bestMove = p;
          }
        }
      }
    }
    // Early exit for easy bot
    if (bestMove && diff === 'easy') break;
  }
  return bestMove;
}

function scrCanFormWord(word, available, blanks) {
  const needed = {};
  for (const ch of word) { needed[ch] = (needed[ch] || 0) + 1; }
  const avail = {};
  available.forEach(l => { avail[l] = (avail[l] || 0) + 1; });
  let extraBlanks = blanks;
  for (const [ch, cnt] of Object.entries(needed)) {
    const have = avail[ch] || 0;
    if (have >= cnt) continue;
    extraBlanks -= (cnt - have);
    if (extraBlanks < 0) return false;
  }
  return true;
}

function scrTryBotPlacement(word, startR, startC, dir, available, blanks) {
  const tiles = [];
  let usedAvail = [...available];
  let blanksLeft = blanks;
  let newTilesCount = 0;
  let connectsToExisting = false;
  const isEmpty = !SCR.board.some(t => t && t.locked);

  for (let i = 0; i < word.length; i++) {
    const r = dir === 'H' ? startR : startR + i;
    const c = dir === 'H' ? startC + i : startC;
    if (r >= 15 || c >= 15) return null;
    const idx = scrIdx(r, c);
    const existing = SCR.board[idx];
    const ch = word[i];

    if (existing) {
      const exLetter = existing.letter === '_' ? (SCR.blanksOnBoard[idx] || '?') : existing.letter;
      if (exLetter !== ch) return null; // conflict
      connectsToExisting = true;
    } else {
      // Need this letter from rack
      const li = usedAvail.indexOf(ch);
      if (li !== -1) {
        usedAvail.splice(li, 1);
        tiles.push({ idx, letter: ch, value: SCR_VALUES[ch] || 0 });
      } else if (blanksLeft > 0) {
        blanksLeft--;
        const bi = usedAvail.indexOf('_');
        if (bi !== -1) usedAvail.splice(bi, 1);
        tiles.push({ idx, letter: '_', value: 0, blankAs: ch });
      } else {
        return null; // can't form
      }
      newTilesCount++;
      // Check adjacency
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr,nc]) => {
        if (nr>=0&&nr<15&&nc>=0&&nc<15 && SCR.board[scrIdx(nr,nc)]) connectsToExisting = true;
      });
    }
  }

  if (newTilesCount === 0) return null;
  if (!isEmpty && !connectsToExisting) return null;
  if (isEmpty && !tiles.some(t => t.idx === scrIdx(7, 7))) return null;

  // Simulate placement to score
  const savedBoard = [...SCR.board];
  const savedBlanks = { ...SCR.blanksOnBoard };
  const savedPlaced = [...SCR.placed];

  tiles.forEach(t => {
    SCR.board[t.idx] = { letter: t.letter, value: t.value };
    if (t.letter === '_') SCR.blanksOnBoard[t.idx] = t.blankAs;
  });
  SCR.placed = tiles.map(t => ({ idx: t.idx, rackId: 'bot' }));

  const words = scrGetWordsFormed();
  let score = 0;
  let allValid = true;
  if (words && words.length > 0) {
    for (const w of words) {
      if (!scrWordValid(w.word)) { allValid = false; break; }
      score += scrScoreWord(w);
    }
    if (tiles.length === 7) score += 50;
  } else {
    allValid = false;
  }

  // Restore
  SCR.board = savedBoard;
  SCR.blanksOnBoard = savedBlanks;
  SCR.placed = savedPlaced;

  if (!allValid || score === 0) return null;
  return { word, tiles, score };
}

// ?? Game over ?????????????????????????????????????????????????
function scrCheckGameOver() {
  // End if any player's rack is empty AND bag is empty
  if (SCR.bag.length === 0 && (SCR.rack.length === 0 || SCR.opRack.length === 0)) {
    scrEndGame();
    return true;
  }
  return false;
}

function scrEndGame() {
  SCR.gameOver = true;
  // Deduct remaining rack values
  const playerDeduct = SCR.rack.reduce((s, t) => s + t.value, 0);
  const opDeduct = SCR.opRack.reduce((s, t) => s + t.value, 0);
  SCR.scores[0] = Math.max(0, SCR.scores[0] - playerDeduct);
  SCR.scores[1] = Math.max(0, SCR.scores[1] - opDeduct);

  // Bonus: if you went out, you get opponent's deducted points
  if (SCR.rack.length === 0) SCR.scores[0] += opDeduct;
  if (SCR.opRack.length === 0) SCR.scores[1] += playerDeduct;

  scrUpdateScores();

  const won = SCR.scores[0] > SCR.scores[1];
  const draw = SCR.scores[0] === SCR.scores[1];
  const overlay = document.getElementById('scrabble-end-overlay');
  const title = document.getElementById('scr-end-title');
  const msg = document.getElementById('scr-end-msg');
  title.textContent = draw ? 'DRAW!' : (won ? 'VICTORY!' : 'DEFEATED');
  title.className = draw ? '' : (won ? 'win' : 'lose');
  msg.textContent = `${SCR.playerName}: ${SCR.scores[0]} pts   ${SCR.opName}: ${SCR.scores[1]} pts`;
  overlay.classList.add('active');
}

// ?? Multiplayer hooks (Firebase) ???????????????????????????????
window.scrabbleMultiStart = function(playerName, opName, playerNum, roomCode, isHost) {
  SCR.isMultiplayer = true;
  SCR.isBot = false;
  SCR.playerNum = playerNum;
  SCR.roomCode = roomCode;
  SCR.playerName = playerName;
  SCR.opName = opName;

  if (isHost) {
    // Host initializes the game state in Firebase
    const bag = scrBuildBag();
    const rack1 = bag.splice(0, 7);
    const rack2 = bag.splice(0, 7);
    set(ref(db, `scrabble/${roomCode}`), {
      bag: bag.map(t => t.letter).join(''),
      rack1: rack1.map(t => t.letter).join(''),
      rack2: rack2.map(t => t.letter).join(''),
      board: '',
      scores: [0, 0],
      turn: 1,
      log: [],
      status: 'playing',
    }).then(() => {
      scrLoadMultiState(roomCode, playerNum, playerName, opName);
    });
  } else {
    scrLoadMultiState(roomCode, playerNum, playerName, opName);
  }
};

function scrLoadMultiState(roomCode, playerNum, playerName, opName) {
  const unsub = onValue(ref(db, `scrabble/${roomCode}`), snap => {
    if (!snap.exists()) return;
    const d = snap.val();
    // Sync board
    if (d.board) {
      const entries = d.board ? JSON.parse(d.board) : [];
      SCR.board = Array(225).fill(null);
      entries.forEach(e => { SCR.board[e.i] = { letter: e.l, value: SCR_VALUES[e.l] || 0, locked: true }; });
    }
    if (d.blanks) {
      try { SCR.blanksOnBoard = JSON.parse(d.blanks); } catch(e) { SCR.blanksOnBoard = {}; }
    }
    if (typeof d.consecutivePasses === 'number') SCR.consecutivePasses = d.consecutivePasses;
    // Sync rack
    const rackKey = 'rack' + playerNum;
    const opRackKey = 'rack' + (playerNum === 1 ? 2 : 1);
    if (d[rackKey]) {
      SCR.rack = d[rackKey].split('').map((l, i) => ({ letter: l, value: SCR_VALUES[l] || 0, id: 'm' + i }));
    }
    // Sync opponent rack (letters hidden, but we need count for game-over detection)
    if (d[opRackKey]) {
      SCR.opRack = d[opRackKey].split('').map((l, i) => ({ letter: '?', value: 0, id: 'o' + i }));
    }
    // Sync bag
    if (typeof d.bag === 'string') {
      SCR.bag = d.bag.split('').map(l => ({ letter: l, value: SCR_VALUES[l] || 0 }));
    }
    if (d.scores) SCR.scores = d.scores;
    if (typeof d.turn === 'number') SCR.turn = d.turn === playerNum ? 0 : 1;
    scrUpdateScores();
    scrUpdateTurnIndicator();
    scrUpdateTilesLeft();
    scrRenderBoard();
    scrRenderRack();
    if (d.status === 'gameover') {
      unsub();
      scrEndGame();
    }
  });
  SCR.unsubs.push(unsub);
  // Watch for opponent leaving
  const abandonUnsub = watchForAbandoned(`scrabble/${roomCode}`, () => {
    showAbandonedNotice(() => scrabbleBackToLobby());
  });
  SCR.unsubs.push(abandonUnsub);
  // Start chat + header leave btn
  chatInit('scrabble', `chat/scrabble_${roomCode}`, playerName);
  showHeaderLeave('scrabble');
  showScreen('scrabble-screen');
}

// ?? Multiplayer sync helper — pushes full state to Firebase after each move
async function scrMultiSync(nextTurnPlayerNum) {
  if (!SCR.isMultiplayer || !SCR.roomCode) return;
  const rackKey = 'rack' + SCR.playerNum;
  const opRackKey = 'rack' + (SCR.playerNum === 1 ? 2 : 1);
  // Encode board as JSON array of {i, l} objects (only occupied cells)
  const boardEntries = [];
  SCR.board.forEach((t, i) => {
    if (t) boardEntries.push({ i, l: t.letter });
  });
  // Encode blanks-on-board
  const blanks = Object.keys(SCR.blanksOnBoard).length > 0
    ? JSON.stringify(SCR.blanksOnBoard) : '';
  const updateData = {
    [rackKey]: SCR.rack.map(t => t.letter).join(''),
    bag: SCR.bag.map(t => t.letter).join(''),
    board: JSON.stringify(boardEntries),
    scores: SCR.scores,
    turn: nextTurnPlayerNum,
    consecutivePasses: SCR.consecutivePasses,
  };
  if (blanks) updateData.blanks = blanks;
  if (SCR.gameOver) updateData.status = 'gameover';
  await update(ref(db, `scrabble/${SCR.roomCode}`), updateData);
}

// ?? Public API ?????????????????????????????????????????????????
window.scrabbleStartBot = function(diff) {
  const name = (document.getElementById('scrabble-player-name').value.trim().toUpperCase() || 'PLAYER');
  scrInitGame(name, 'A.I. BOT', true, diff);
};

window.scrabblePlayAgain = function() {
  document.getElementById('scrabble-end-overlay').classList.remove('active');
  scrRecall();
  const diff = SCR.botDifficulty;
  const name = SCR.playerName;
  scrInitGame(name, SCR.isBot ? 'A.I. BOT' : SCR.opName, SCR.isBot, diff);
};

window.scrabbleBackToLobby = function() {
  document.getElementById('scrabble-end-overlay').classList.remove('active');
  if (SCR.unsubs) { SCR.unsubs.forEach(u => typeof u === 'function' && u()); SCR.unsubs = []; }
  chatDestroy('scrabble');
  hideHeaderLeave();
  backToGameSelect();
};

// ?? Shared lobby integration ????????????????????????????????????
// Called from slLaunchGame for scrabble
function scrLaunchFromLobby(room, isHost, myName, oppName, gameCode) {
  SCR.isMultiplayer = true;
  SCR.isBot = false;
  SCR.playerNum = isHost ? 1 : 2;
  SCR.roomCode = gameCode;
  SCR.playerName = myName;
  SCR.opName = oppName;
  document.getElementById('main-subtitle').textContent = 'SCRABBLE — ONLINE MULTIPLAYER';
  document.getElementById('header-room-code').textContent = gameCode;
  document.getElementById('room-code-display').style.display = '';
  window.scrabbleMultiStart(myName, oppName, isHost ? 1 : 2, gameCode, isHost);
}

window.sharedLobbyClose = async function() {
  if (!SL.isHost || !SL.code) return;
  if (!confirm('Close this lobby? Any joined players will be returned to the arcade.')) return;
  const codeToClose = SL.code;
  // Clean up host side first
  SL.unsubs.forEach(u => typeof u === 'function' && u());
  SL.unsubs = [];
  SL.code = null;
  document.getElementById('shared-lobby-room').style.display = 'none';
  document.getElementById('shared-lobby-entry').style.display = '';
  document.getElementById('room-code-display').style.display = 'none';
  document.getElementById('shared-lobby-close-wrap').style.display = 'none';
  slSetStatus('LOBBY CLOSED', 'warning');
  // Mark closed then remove from Firebase so guests see it vanish
  try {
    await update(ref(db, `lobbies/${codeToClose}`), { status: 'closed' });
    await remove(ref(db, `lobbies/${codeToClose}`));
  } catch(e) {}
  lobbyBrowserStart();
};

window.sharedLobbyBack = function() {
  SL.unsubs.forEach(u => typeof u === 'function' && u());
  SL.unsubs = [];
  SL.code = null;
  lobbyBrowserStop();
  // Reset UI
  document.getElementById('shared-lobby-entry').style.display = '';
  document.getElementById('shared-lobby-room').style.display = 'none';
  document.getElementById('shared-lobby-game-select').style.display = 'none';
  document.getElementById('shared-lobby-waiting-msg').style.display = 'none';
  document.getElementById('room-code-display').style.display = 'none';
  slSetStatus('','');
  backToGameSelect();
};

// ============================================================
// ============================================================
