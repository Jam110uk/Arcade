// WRD game module
// Auto-extracted from monolithic index.html

export default (() => {
  // ~500 common 5-letter words used as answers + valid guesses
  const ANSWERS = [
    'APPLE','BRAVE','CHAIR','DANCE','EAGLE','FAINT','GRACE','HEART','INNER','JUDGE',
    'KNIFE','LARGE','MONTH','NIGHT','OCEAN','PLACE','QUEEN','RIVER','STONE','TRAIN',
    'ULTRA','VIVID','WASTE','YOUNG','ZEBRA','PLANT','GHOST','FROST','CLOUD','BLEND',
    'CRISP','DRAWN','EXACT','FLUTE','GROWN','HONEY','IVORY','KNEEL','MAGIC','NERVE',
    'OFTEN','PRIDE','QUIET','RALLY','SMITH','THINK','UNDER','VIRAL','WHEAT','YUMMY',
    'ABOUT','BELOW','CABLE','DAIRY','EARTH','FIERY','GLOBE','HAPPY','INPUT','JOKER',
    'LEARN','MODAL','NOBLE','OLIVE','PRISM','READY','SHELF','TOWER','UNITY','VALUE',
    'WORLD','YEAST','BUILD','CORAL','DEVIL','EVENT','FLAME','GRAIL','HABIT','IDEAL',
    'JOINT','LEMON','MAKER','NOVEL','ORBIT','PASTA','REALM','SALAD','TREND','UPPER',
    'VINYL','WALTZ','EXTRA','YACHT','ZESTY','ALARM','BLANK','CURRY','DWARF','ELBOW',
    'FERRY','GLOOM','HUMAN','IMAGE','JEWEL','KNACK','LOBBY','MANOR','NICHE','ONION',
    'PIXEL','RADAR','SCOUT','TEMPO','VAPOR','WITCH','EXILE','YIELD','ARROW','BARON',
    'CABIN','DAILY','EXIST','FAVOR','IRONY','KITTY','LINER','MANGO','NOTCH','OPERA',
    'PHOTO','REMIX','SALVO','THORN','USHER','VENOM','WRATH','OXIDE','YODEL','AMBLE',
    'COMBO','DIGIT','EAGER','FUDGE','GUSTO','HATCH','INLET','KARMA','LATHE','MERCY',
    'NUDGE','POUND','RISKY','SWEPT','TIDAL','UPEND','VALID','WITTY','YEARN','BRINE',
    'CLOAK','DODGE','ETHOS','FROTH','GUILE','HEIST','JOUST','KNAVE','LUNAR','MIMIC',
    'OVERT','PLANK','QUERY','ROAST','CHASM','BLOOM','CRIMP','DRAPE','EMBER','FLANK',
    'GROAN','HINGE','TAUNT','BLUNT','CHURN','DECOY','ADORE','BLAZE','CIDER','DELTA',
    'ENVOY','FOYER','GRIME','HYENA','IMPEL','JAZZY','KIOSK','LLAMA','MIRTH','NASAL',
    'OUTDO','PENAL','QUAFF','RELIC','SCRUB','TRAWL','UNZIP','VERGE','WHIRL','EXPAT',
    'ZONAL','ABIDE','BIRCH','CINCH','DOWRY','EQUIP','FRUGAL','GRUFF','HIPPO','ICILY',
    'KAPOW','LEAPT','MOTIF','NEXUS','OUTGO','PROXY','SQUAT','TABOO','ULCER','VOILA',
    'WINCH','EXPEL','ZAPPY','ABBOT','BEIGE','CLASP','DONOR','EIGHT','FINCH','GLOAT',
    'HOVEL','INEPT','JUNTA','KOALA','LUSTY','MANLY','NEWTS','OFFAL','PARKA','QUEST',
    'RIVET','SADLY','TULIP','UNWED','VOUCH','WALRUS','EXTOL','ZONED','AGILE','BROOD',
    'CINCH','DEPOT','EPOCH','FETID','GAVEL','HEADY','IRKED','JOKEY','KUDOS','LEAKY',
    'MOODY','NUTTY','OPTIC','PERCH','QUIRK','REBUS','SNAKY','TEPID','UNFIT','VAUNT',
    'WEARY','EXPUNGE','ZONAL','ACUTE','BOAST','CAULK','DOWEL','ETHYL','FLAIR','GAUZE',
    'HORDE','IDYLL','JUMBO','KINKY','LOFTY','MOSSY','NOISY','OUTDO','PETTY','RABID',
    'SHOWY','TANGY','UNFED','VIVID','WHACK','TACKY','ZAPPY','ABASH','BAULK','CHIMP',
    'DIMLY','EDIFY','FELON','GRIMY','HAIKU','ICING','JOIST','KAYAK','LOFTY','MINTY',
    'NADIR','OUTFOX','PLUMB','QUOTA','RANDY','SKIMP','TAWNY','UNCUT','VYING','WOOZY',
    'YEOMAN','ZILCH','ADAPT','BUXOM','CANNY','DODGY','ELDER','FLOSS','GAUDY','HILLY',
    'INBOX','JAZZY','KHAKI','LUSTY','MARVY','NIFTY','OUTDO','PEPPY','RITZY','SAVVY',
    'TIPSY','UNFAIR','VERVE','WACKY','EXACT','ZAPPY','ADEPT','BOSSY','CATTY','DAFFY',
    'EERIE','FUNKY','GIDDY','HUFFY','ITCHY','JUMPY','LANKY','LOOPY','MUGGY','NUTSO',
    'PERKY','SASSY','TACKY','ZINGY','FIZZY','BUZZY','DIZZY','FUZZY','JAZZY','ZIPPY',
  ];

  // Extended valid guess list (includes answers + more common words)
  const VALID_EXTRA = [
    'ZONAL','ZILCH','ZONES','VOTER','VOTES','VYING','WARTY','WEEDY','WIELD','WIMPY',
    'WINDY','WITTY','WOMEN','WORMY','WORSE','WORST','WOULD','WOUND','WOVEN','WRECK',
    'WRIST','WROTE','XEROX','SKIMP','ANGEL','ANGER','ANGLE','ANGRY','ANIME','ANNEX',
    'ANNOY','ANTIC','ANVIL','AORTA','APHID','APPLE','ARBOR','ARDOR','ARENA','ARGUE',
    'ARIAN','ARID','ARISE','ARMOR','ARMY','AROMA','AROSE','ARSON','ARTSY','ASCOT',
    'AUNTS','AVAIL','AVID','AVOID','AWARD','AWASH','AWFUL','BENCH','BERTH','BIRCH',
    'BITCH','BLIMP','BLINK','BLOAT','BLOCK','BLOKE','BLOND','BLOOD','BLOOM','BLOWN',
    'BLUES','BLUNT','BLURB','BLURT','BLUSH','BOARD','BOOBY','BOOST','BOOTH','BOTCH',
    'BREAD','BREAK','BREED','BREVE','BRICK','BRIDE','BRINK','BRISK','BROIL','BROKE',
    'BROOM','BROTH','BROWN','BRUNT','BRUSH','BRUTE','BUDDY','BUGGY','BUILD','BULGE',
    'BUMPY','BUNCH','BUNNY','BUSHY','BUTCH','BUTTS','CHEWY','CHIEF','CHILD','CHILL',
    'CHIMP','CHIPS','CHOIR','CHOKE','CHOMP','CHOSE','CHUNK','CIVIC','CIVIL','CLAMP',
    'CLANG','CLANK','CLASH','CLASP','CLASS','CLEAT','CLEFT','CLERK','CLICK','CLIFF',
    'CLING','CLINK','CLOCK','CLOMP','CLONE','CLOSE','CLUMP','COILS','COMET','COMIC',
    'COMMA','CORNY','COULD','COUNT','COVER','COVET','CRACK','CRAFT','CRAMP','CRANE',
    'CRASH','CREAK','CREEK','CREEP','CREST','CROAK','CROOK','CROSS','CROUP','CROWD',
    'CROWN','CRUDE','CRUEL','CRUSH','CRUST','CRYPT','CURLY','CURSE','CUTER','DYING',
    'EARLY','EIGHT','EMCEE','EMPTY','ENEMY','ENJOY','ENSUE','ENTER','ENVY','EPOXY',
    'EQUAL','ERUPT','ESSAY','EVADE','EVOKE','EWERS','FACED','FADED','FAILS','FALSE',
    'FANCY','FANGS','FARCE','FAULT','FEAST','FECAL','FEMUR','FERAL','FEVER','FEWER',
    'FILED','FILLY','FILTH','FINED','FIRST','FIXED','FLAKY','FLARE','FLASH','FLASK',
    'FLESH','FLIES','FLOCK','FLOOD','FLOOR','FLUNG','FLURRY','FOAMY','FOGGY','FOLLY',
    'FORCE','FORGE','FOUND','FRANK','FRAUD','FREAK','FREED','FRESH','FRISK','FRONT',
    'FROZE','FULLY','FUNDS','FUNNY','GAMUT','GAUZE','GAVEL','GAWKY','GIPSY','GIRLY',
    'GIVEN','GLAND','GLARE','GLEAN','GLIDE','GLINT','GLOAT','GLOSS','GLOVE','GLOZE',
    'GODLY','GOING','GORGE','GOURD','GRAIN','GRAND','GRANT','GRAPE','GRASP','GRASS',
    'GRATE','GRAZE','GREED','GREET','GRIEF','GRIPE','GRIPS','GRIST','GRITS','GROIN',
    'GROVE','GROWL','GRUEL','GRUMP','GRUNT','GUAVA','GUILE','GULLY','GUMMY','GUSTO',
    'HASTY','HATCH','HAULM','HAUNT','HAVEN','HAVOC','HEADBAND','HEAVY','HERBS','HOVER',
    'HUNCH','HURRY','HUSKY','HYMEN','ICING','ICILY','IMPLY','INANE','INCUR','INDEX',
    'INDIE','INFER','INFIX','IONIC','IRATE','ITCHY','IVORY','JAZZY','JERKY','JIFFY',
    'JOKEY','JOLLY','LUMPY','LUSTY','MANIC','MANLY','MOODY','MORPH','MUGGY','MULCH',
    'MUMMY','MUSTY','NERVE','NIFTY','NINETY','NIPPY','NOISY','NONCE','NOOKS','NORTH',
    'NUTTY','OBESE','OFFAL','OFTEN','ONLOOKER','OPTIC','ORION','OVARY','OWING','OXIDE',
    'OZONE','PACED','PANIC','PATSY','PAUSE','PESKY','PICKY','PINEY','PINCH','PINEY',
    'PITCH','PIXEL','PIXIE','PLACE','PLAID','PLAIN','PLAIT','PLANK','PLASM','PLATE',
    'PLAZA','PLEAD','PLUCK','PLUNK','PLUSH','POACH','POINT','POLAR','POLLY','POPPY',
    'POTTY','POUTY','PRANK','PRICY','PRIVY','PROBE','PRONE','PROOF','PROSE','PROVE',
    'PROWL','PRUDE','PUFFIN','PULPY','PUNCH','PUNKY','PUPIL','PURGE','PUSHY','RAVEN',
    'REACH','REGAL','REIGN','REPAY','REPEL','RESIN','RETRO','RETRY','RHYME','RIGID',
    'RISKY','ROBIN','ROCKY','ROOMY','RUDDY','RUGBY','RUNNY','RUSTY','SADLY','SASSY',
    'SCAMP','SCANT','SCONE','SCOOP','SCOOT','SCOPE','SCORE','SCORN','SCOUR','SCOUT',
    'SCOWL','SCRAM','SCRAP','SCRATCH','SCREW','SCRUB','SEAMY','SEEDY','SEIZE','SHACK',
    'SHADE','SHADY','SHALE','SHALL','SHAME','SHAPE','SHARD','SHARE','SHARP','SHAVE',
    'SHEAR','SHEEN','SHEEP','SHEER','SHELL','SHIFT','SHIRE','SHOAL','SHOCK','SHONE',
    'SHOOK','SHOOT','SHORT','SHOUT','SHOVE','SHOWN','SHOWY','SHRUB','SHUCK','SHUNT',
    'SIEGE','SIGMA','SILLY','SKIMP','SLANG','SLANT','SLASH','SLATE','SLEET','SLEPT',
    'SLICE','SLIDE','SLIME','SLIMY','SLING','SLINK','SLOPE','SLOTH','SLUMP','SLUNG',
    'SLURP','SMACK','SMALL','SMEAR','SMELL','SMELT','SMILE','SMIRK','SMITE','SMOKE',
    'SMOTE','SNACK','SNAIL','SNAKE','SNARE','SNARL','SNEAK','SNIFF','SNORE','SNORT',
    'SNOUT','SOAPY','SOGGY','SOLAR','SOLID','SOLVE','SONIC','SORRY','SOUTH','SPACE',
    'SPARE','SPARK','SPAWN','SPECK','SPEED','SPELL','SPEND','SPICY','SPILL','SPINE',
    'SPITE','SPLAT','SPOIL','SPOKE','SPOOK','SPOOL','SPOUT','SPRAY','SPREE','SPRIG',
    'SPUNK','SQUAD','STACK','STAIN','STAIR','STAKE','STALE','STALL','STAMP','STAND',
    'STANK','STARK','START','STASH','STAVE','STEAK','STEAL','STEAM','STEEP','STEER',
    'STERN','STICK','STIFF','STING','STINK','STOMP','STOOD','STOOL','STOOP','STORE',
    'STORK','STORM','STORY','STOUT','STOVE','STRAP','STRAW','STRAY','STRIP','STRUT',
    'STUCK','STUDY','STUMP','STUNG','STUNT','STYLE','SUGAR','SUITE','SULKY','SUNNY',
    'SUPER','SURGE','SURLY','SWAMP','SWEAR','SWEAT','SWEPT','SWIFT','SWILL','SWIPE',
    'SWIRL','SWOOP','TABLE','TAFFY','TASTE','TASTY','TAUNT','TAWNY','TEACH','TENSE',
    'TENTH','TEPID','TERSE','THANK','THIEF','THONG','THREW','THREE','THREW','THROW',
    'THRUM','THUMP','TIARA','TIGER','TIGHT','TIMID','TIPSY','TIRED','TOADY','TOPAZ',
    'TOTAL','TOUCH','TOUGH','TOWEL','TOXIC','TRICK','TRILL','TROOP','TROTH','TRUCE',
    'TRUMP','TRUNK','TRUSS','TRUST','TUMID','TUMOR','TUNER','TUNIC','TURBO','TUTOR',
    'TWERP','TWILL','TWIRL','TWIST','TYPED','UDDER','ULCER','ULTRA','UNARM','UNCLE',
    'UNDID','UNDUE','UNFED','UNFIT','UNIFY','UNION','UNTIE','UNTIL','UNZIP','URBAN',
    'USAGE','USURP','UTTER','VALVE','VAPID','VEINY','VICAR','VIGOR','VIOLA','VIPER',
    'VIRAL','VIRUS','VISOR','VISTA','VITAL','VIVID','VOCAL','VODKA','VOILA','VOMIT',
    'WADER','WAFER','WAGED','WAGER','WADGE','WAILS','WAIST','WALTZ','WATCH','WATER',
    'WEARY','WEDGE','WEIRD','MERCY','WHELP','WHIFF','WHILE','WHINE','WHINY','WHISK',
    'WIMPY','WINDY','WITCH','WITTY','WOODY','WORDY','WORLD','WORMY','WORRY','WOULD',
    'WRATH','WREAK','WREST','WRING','WRONG','YOUNG','YOUTH','YUCKY','ZAPPY','ZIPPY',
    // High-frequency 5-letter words commonly used as Wordle starters/guesses
    'HOUSE','STARE','RAISE','CRATE','AUDIO','TEARS','RATES','STORE','SNARE','CRANE',
    'IRONS','SIREN','AROSE','NOTES','STONE','TONES','INERT','INTER','TRIES','TIRED',
    'RIOTS','TRIOS','RESIN','RINSE','REINS','LINER','ELBOW','BELOW','BOWEL','REBEL',
    'BELLS','BELLE','TELLS','YELLS','SELLS','CELLS','WELLS','FALLS','CALLS','BALLS',
    'WALLS','HALLS','BULLS','PULLS','NULLS','HULLS','ROLLS','TOLLS','POLLS','DOLLS',
    'FOLLY','HOLLY','MOLLY','POLLY','DOLLY','JELLY','BELLY','TELLY','DELLY','RALLY',
    'SALLY','TALLY','BALLY','WALLY','RALLY','EARLY','LAYER','RELAY','REGAL','LEGAL',
    'LEARN','RENAL','PANEL','PENAL','PLANE','PLANT','PLAIN','PLAID','CLAIM','CLAMP',
    'CLAMS','CLANS','PLANS','PLAYS','CLAYS','FLAYS','SLAYS','STAYS','TRAYS','GRAYS',
    'PRAYS','STRAYS','GRAIN','GROIN','GROAN','GROWN','BROWN','FROWN','CROWN','DROWN',
    'BRAWN','DRAWN','SPAWN','PRAWN','SWARM','SWORE','SHORE','SNORE','SCORE','SPORE',
    'STORE','ADORE','SMORE','HORSE','WORSE','PURSE','NURSE','CURSE','VERSE','TERSE',
    'THESE','THOSE','WHOSE','CHOSE','CLOSE','PROSE','AROSE','FROZE','OZONE','ALONE',
    'ATONE','STONE','PHONE','SHONE','DRONE','OZONE','PRONE','SCONE','GROOM','BLOOM',
    'BROOM','GLOOM','ZOOM','LOOM','BOOM','ROOM','DOOM','ZOOM','WHOM','WORM','WORD',
    'WORE','GORE','SORE','BORE','CORE','FORE','MORE','PORE','TORE','LORE','YORE',
    'SHORE','CHORE','SNORE','SCORE','SPORE','ADORE','SWORE','BEFORE','STORE','RESTORE',
    'HOUSE','LOUSE','MOUSE','GROUSE','BLOUSE','SPOUSE','ROUSE','DOUSE','GORSE',
    'HORSE','MORSE','WORSE','TORSE','FORCE','FORGE','GORGE','FORGE','JORGE','LARGE',
    'BARGE','CARGO','LARGO','TANGO','MANGO','RANGE','MANGE','MANGE','GANJA','PANDA',
    'SANER','LINER','MINER','DINER','FINER','TONER','LONER','BONER','HONER','STONER',
    'SHALE','STALE','WHALE','FLAKE','SNAKE','STAKE','SHAKE','QUAKE','BRAKE','CRAKE',
    'DRAKE','FLAKE','GRADE','TRADE','BLADE','SHADE','SPADE','SUEDE','THOSE','PROSE',
    'RAISE','GRAZE','BLAZE','GLAZE','CRAZE','MAIZE','GAUZE','CAUSE','PAUSE','FALSE',
    'PULSE','PURSE','PARSE','SPARSE','TERSE','VERSE','NURSE','CURSE','WORSE','HORSE',
    'FORCE','FORGE','GORGE','SHORE','CHORE','SNORE','SCORE','STORE','ADORE','SPORE',
    'TRACE','GRACE','PLACE','BRACE','SPACE','PEACE','FLEECE','NIECE','PIECE','TWICE',
    'PRICE','TRICE','SLICE','SPICE','VOICE','POISE','NOISE','MOIST','HOIST','FOIST',
    'EXIST','TWIST','WRIST','GRIST','HEIST','JOUST','ROUST','OUST','GUST','MUST',
    'BURST','CURST','FIRST','WORST','THIRST','THIRSTS','TWIST','FISTS','LISTS','MISTS',
    'NESTS','BESTS','TESTS','VESTS','RESTS','JESTS','PESTS','ZESTS','BESTS','GUESTS',
    'TASTE','WASTE','HASTE','PASTE','CHASTE','BASTE','CASTE','LAST','FAST','PAST',
    'MAST','CAST','VAST','BLAST','CLASH','FLASH','SLASH','CRASH','BRASH','GNASH',
    'SMASH','TRASH','STASH','FRESH','FLESH','BLESS','DRESS','PRESS','STRESS','TRESS',
    'CHESS','GUESS','BLESS','FESS','LESS','MESS','MISS','KISS','HISS','BLISS',
    'SWISS','TRUSS','FUSS','MUSS','BUSS','CUSS','PLUS','THUS','GUSH','HUSH','LUSH',
    'MUSH','RUSH','GUST','HUSK','DUSK','MUSK','DUST','BUST','RUST','LUST','JUST',
    'GUST','MUST','CRUST','TRUST','TRYST','CRISP','BRISK','WHISK','FRISK','DRISK',
    'DRINK','BRINK','THINK','SLINK','BLINK','STINK','CLINK','FLING','CLING','SWING',
    'STING','BRING','THING','WRING','WRING','TYING','LYING','DYING','OYING','VYING',
    'PLYING','FRYING','PRYING','DRYING','TRYING','CRYING','GRAYING','PRAYING','STRAYING',
    'CHAIN','PLAIN','TRAIN','DRAIN','BRAIN','GRAIN','STRAIN','SPRAIN','OBTAIN','CONTAIN',
    'REUSE','ABUSE','BLUES','CLUES','GLUES','HUES','CUES','DUES','FOES','GOES','HOES',
    'JOES','TOES','WOES','DOES','JOES','NOES','ROES','SOLES','HOLES','MOLES','POLES',
    'ROLES','VOLES','STOLE','WHOLE','SHOAL','GOAL','COAL','FOAL','OPAL','OVAL','NAVAL',
    'REGAL','LEGAL','FETAL','METAL','PETAL','TOTAL','FATAL','NATAL','VITAL','TRIAL',
    'VIRAL','TIDAL','FERAL','FERAL','PENAL','RENAL','VENAL','BANAL','CANAL','FINAL',
    'TONAL','MORAL','CORAL','BORAL','FLORAL','CHORAL','AURAL','MURAL','RURAL','PLURAL',
    'SWEAR','SHEAR','SPEAR','SMEAR','CLEAR','BLEAT','CHEAT','PLEAT','TREAT','WHEAT',
    'GREAT','DREAD','TREAD','BREAD','BREAM','CREAM','DREAM','STEAM','SCREAM','STREAM',
    'TEARS','BEARS','FEARS','GEARS','HEARS','NEARS','PEARS','REARS','SEARS','WEARS',
    'YEARS','DEARS','SHEARS','CLEARS','SMEARS','SPEARS','SWEARS','STEERS','BEERS','JEERS',
    'LEERS','PEERS','SEERS','VEERS','STEERS','CHEERS','SHEER','STEER','FREER','THREE',
  ];

  // Combined valid set (answers are always valid guesses too)
  const ALL_VALID = new Set([...ANSWERS, ...VALID_EXTRA].map(w => w.toUpperCase()).filter(w => w.length === 5));

  const KEYBOARD_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', ['ENTER','Z','X','C','V','B','N','M','BKSP']];
  const MAX_GUESSES   = 6;
  const WORD_LEN      = 5;

  let answer, currentRow, currentCol, gameOver, grid, keyState;
  let streak, best, played;
  let animating = false;
  let _keyHandler = null;  // track to avoid duplicate listeners

  function init() {
    streak = parseInt(localStorage.getItem('wrd-streak') || '0');
    best   = parseInt(localStorage.getItem('wrd-best')   || '0');
    played = parseInt(localStorage.getItem('wrd-played') || '0');
    buildGrid();
    buildKeyboard();
    updateStats();
    showOverlay();
  }

  function showOverlay() {
    const ov = document.getElementById('wrd-overlay');
    if (ov) ov.classList.add('active');
  }

  function newGame() {
    answer     = ANSWERS[Math.floor(Math.random() * ANSWERS.length)].toUpperCase();
    currentRow = 0;
    currentCol = 0;
    gameOver   = false;
    grid       = Array.from({length: MAX_GUESSES}, () => Array(WORD_LEN).fill(''));
    keyState   = {};
    animating  = false;

    // Clear grid tiles
    for (let r = 0; r < MAX_GUESSES; r++) {
      for (let c = 0; c < WORD_LEN; c++) {
        const tile = getTile(r, c);
        if (!tile) continue;
        tile.textContent = '';
        tile.className   = 'wrd-tile';
        tile.style.removeProperty('--tile-bg');
        tile.style.removeProperty('--tile-border');
      }
    }
    // Reset keyboard
    document.querySelectorAll('.wrd-key').forEach(k => {
      k.className = k.dataset.wide ? 'wrd-key wide' : 'wrd-key';
      k.disabled  = false;
    });
    setMsg('');
    const ov = document.getElementById('wrd-overlay');
    if (ov) ov.classList.remove('active');
  }

  function buildGrid() {
    const g = document.getElementById('wrd-grid');
    if (!g) return;
    // Remove existing rows only (leave the overlay element)
    g.querySelectorAll('.wrd-row').forEach(r => r.remove());
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = document.createElement('div');
      row.className = 'wrd-row';
      for (let c = 0; c < WORD_LEN; c++) {
        const tile = document.createElement('div');
        tile.className = 'wrd-tile';
        tile.id = `wrd-tile-${r}-${c}`;
        row.appendChild(tile);
      }
      g.appendChild(row);
    }
  }

  function buildKeyboard() {
    KEYBOARD_ROWS.forEach((row, i) => {
      const rowEl = document.getElementById('wrd-row-' + (i+1));
      if (!rowEl) return;
      rowEl.innerHTML = '';
      const tokens = Array.isArray(row) ? row : [...row];
      tokens.forEach(token => {
        const btn = document.createElement('button');
        if (token === 'ENTER') {
          btn.className    = 'wrd-key wide';
          btn.textContent  = 'ENT';
          btn.dataset.key  = 'Enter';
          btn.dataset.wide = '1';
          btn.onclick = () => handleKey('Enter');
        } else if (token === 'BKSP') {
          btn.className    = 'wrd-key wide';
          btn.textContent  = '\u232B';
          btn.dataset.key  = 'Backspace';
          btn.dataset.wide = '1';
          btn.onclick = () => handleKey('Backspace');
        } else if (token.length === 1 && /^[A-Z]$/.test(token)) {
          btn.className   = 'wrd-key';
          btn.textContent = token;
          btn.dataset.key = token;
          btn.onclick = () => handleKey(token);
        }
        rowEl.appendChild(btn);
      });
    });
    // Remove old listener before adding new one (prevents duplicates)
    if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
    _keyHandler = onKeyDown;
    document.addEventListener('keydown', _keyHandler);
  }

  function onKeyDown(e) {
    const screen = document.getElementById('wordle-screen');
    if (!screen || !screen.classList.contains('active')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter')          { e.preventDefault(); handleKey('Enter'); }
    else if (e.key === 'Backspace') { e.preventDefault(); handleKey('Backspace'); }
    else if (/^[a-zA-Z]$/.test(e.key)) { handleKey(e.key.toUpperCase()); }
  }

  function handleKey(key) {
    if (gameOver || animating) return;
    if (key === 'Backspace') {
      if (currentCol > 0) {
        currentCol--;
        grid[currentRow][currentCol] = '';
        const tile = getTile(currentRow, currentCol);
        tile.textContent = '';
        tile.classList.remove('filled');
      }
    } else if (key === 'Enter') {
      submitGuess();
    } else if (/^[A-Z]$/.test(key) && currentCol < WORD_LEN) {
      grid[currentRow][currentCol] = key;
      const tile = getTile(currentRow, currentCol);
      tile.textContent = key;
      tile.classList.add('filled');
      tile.classList.remove('pop');
      void tile.offsetWidth;
      tile.classList.add('pop');
      currentCol++;
    }
  }


  function submitGuess() {
    if (currentCol < WORD_LEN) {
      shakeRow(currentRow);
      setMsg('NOT ENOUGH LETTERS', 'error');
      setTimeout(() => setMsg(''), 1400);
      return;
    }
    const guess = grid[currentRow].join('');

    // Accept if in answers list OR extended valid list (real Wordle accepts any known word)
    if (!ALL_VALID.has(guess)) {
      shakeRow(currentRow);
      setMsg('NOT IN WORD LIST', 'error');
      setTimeout(() => setMsg(''), 1400);
      return;
    }

    // Evaluate — two-pass algorithm (same as NYT Wordle)
    const result   = Array(WORD_LEN).fill('absent');
    const ansArr   = answer.split('');
    const guessArr = guess.split('');
    // Pass 1: correct (green)
    guessArr.forEach((ch, i) => {
      if (ch === ansArr[i]) { result[i] = 'correct'; ansArr[i] = null; guessArr[i] = null; }
    });
    // Pass 2: present (yellow) — only unmatched letters
    guessArr.forEach((ch, i) => {
      if (!ch) return; // already matched
      const idx = ansArr.indexOf(ch);
      if (idx !== -1) { result[i] = 'present'; ansArr[idx] = null; }
    });

    // Block input during flip animation
    animating = true;

    const row = currentRow;
    result.forEach((state, i) => {
      const tile = getTile(row, i);
      setTimeout(() => {
        tile.classList.add('flip');
        tile.style.setProperty('--tile-bg',     state === 'correct' ? '#16a34a' : state === 'present' ? '#a16207' : '#1e3a4a');
        tile.style.setProperty('--tile-border', state === 'correct' ? '#22c55e' : state === 'present' ? '#ca8a04' : '#2a5470');
        tile.classList.add(state);
        // Update keyboard — only upgrade colour (correct > present > absent)
        const letter = guess[i];
        const prev = keyState[letter];
        if (!prev || prev === 'absent' || (prev === 'present' && state === 'correct')) {
          keyState[letter] = state;
          const btn = document.querySelector(`.wrd-key[data-key="${letter}"]`);
          if (btn) { btn.className = 'wrd-key'; btn.classList.add(state); }
        }
      }, i * 150);
    });

    const won = result.every(r => r === 'correct');
    setTimeout(() => {
      animating = false;
      if (won) {
        gameOver = true; streak++; played++;
        if (streak > best) best = streak;
        localStorage.setItem('wrd-streak', streak);
        localStorage.setItem('wrd-best',   best);
        localStorage.setItem('wrd-played', played);
        updateStats();
        const msgs = ['GENIUS!','MAGNIFICENT!','IMPRESSIVE!','SPLENDID!','GREAT!','PHEW!'];
        setMsg(msgs[Math.min(row, msgs.length-1)], 'success');
        setTimeout(() => {
          showEndOverlay('win', '\uD83D\uDFE9 SOLVED!', answer, `${row+1}/6 guesses`);
          if (window.HS) HS.promptSubmit('wordle', streak, `${streak} word streak`);
        }, 900);
      } else if (row === MAX_GUESSES - 1) {
        gameOver = true; streak = 0; played++;
        localStorage.setItem('wrd-streak', 0);
        localStorage.setItem('wrd-played', played);
        updateStats();
        setMsg(`The word was ${answer}`, 'info');
        setTimeout(() => {
          showEndOverlay('lose', 'GAME OVER', answer, 'Better luck next time');
        }, 900);
      }
      if (!gameOver) {
        currentRow++;
        currentCol = 0;
      }
    }, WORD_LEN * 150 + 250);
  }

  function showEndOverlay(type, title, word, sub) {
    const ov = document.getElementById('wrd-overlay');
    if (!ov) return;
    ov.classList.add('active');
    const t = document.getElementById('wrd-ov-title');
    if (t) { t.textContent = title; t.className = 'wrd-ov-title ' + type; }
    const w = document.getElementById('wrd-ov-word');
    if (w) w.textContent = word;
    const m = document.getElementById('wrd-ov-msg');
    if (m) m.textContent = sub;
    const btns = ov.querySelector('.wrd-ov-btns');
    if (btns) btns.innerHTML = `<button class="wrd-btn" onclick="wrdNewGame()">🔄 NEW WORD</button><button class="arcade-back-btn" onclick="backToGameSelect()">🕹 ARCADE</button>`;
  }

  function shakeRow(r) {
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = getTile(r, c);
      if (!tile) continue;
      tile.classList.remove('shake');
      void tile.offsetWidth;
      tile.classList.add('shake');
    }
  }

  function getTile(r, c) { return document.getElementById(`wrd-tile-${r}-${c}`); }

  function setMsg(msg, type = '') {
    const el = document.getElementById('wrd-msg');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'wrd-msg' + (type ? ' ' + type : '');
  }

  function updateStats() {
    const s = document.getElementById('wrd-streak');
    const b = document.getElementById('wrd-best');
    const p = document.getElementById('wrd-played');
    if (s) s.textContent = streak;
    if (b) b.textContent = best;
    if (p) p.textContent = played;
  }

  function destroy() {
    if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  }

  return { init, newGame, destroy };
})();

window.wrdNewGame = () => WRD.newGame();

// ??????????????????????????????????????????????
//  CONNECT FOUR ENGINE
// ??????????????????????????????????????????????
const C4 = (() => {
