// GW game module
// Auto-extracted from monolithic index.html

export default (function() {

  // ── 24 Pop-culture characters ──────────────────────────────
  // Each has: name, face (emoji), and trait tags used for yes/no questions
  const CHARS = [
    { id:0,  name:'Sherlock Holmes',  face:'🕵️',  hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:1,  name:'Wonder Woman',     face:'🦸‍♀️', hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:2,  name:'Indiana Jones',    face:'🤠',   hair:'brown',  gender:'male',   glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:3,  name:'Hermione Granger', face:'🧙‍♀️', hair:'brown',  gender:'female', glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:4,  name:'Iron Man',         face:'🤖',   hair:'dark',   gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:5,  name:'Lara Croft',       face:'🏹',   hair:'brown',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:6,  name:'Gandalf',          face:'🧙',   hair:'grey',   gender:'male',   glasses:false, facial_hair:true,  hat:true,  music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:7,  name:'Black Widow',      face:'🕷️',  hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:8,  name:'James Bond',       face:'🎩',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:9,  name:'Elsa',             face:'👸',   hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:false, royalty:true,  age:'young'  },
    { id:10, name:'Yoda',             face:'👽',   hair:'grey',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:11, name:'Katniss Everdeen', face:'🎯',   hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:12, name:'The Joker',        face:'🃏',   hair:'green',  gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:13, name:'Daenerys',         face:'🐉',   hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:true,  age:'young'  },
    { id:14, name:'Captain America',  face:'🛡️',  hair:'blonde', gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:15, name:'Maleficent',       face:'🦇',   hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:false, royalty:true,  age:'older'  },
    { id:16, name:'Wolverine',        face:'🦾',   hair:'dark',   gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:17, name:'Ariel',            face:'🧜‍♀️', hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:false, royalty:true,  age:'young'  },
    { id:18, name:'The Mandalorian',  face:'🪖',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:19, name:'Moana',            face:'🌊',   hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:20, name:'Doctor Strange',   face:'✨',   hair:'grey',   gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:21, name:'Mulan',            face:'⚔️',  hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:true,  royalty:false, age:'young'  },
    { id:22, name:'Thor',             face:'⚡',   hair:'blonde', gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:23, name:'Cruella De Vil',   face:'🐾',   hair:'white',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:24, name:'Batman',           face:'🦇',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:25, name:'Rapunzel',         face:'👱‍♀️', hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:false, royalty:true,  age:'young'  },
    { id:26, name:'Spiderman',        face:'🕸️',  hair:'brown',  gender:'male',   glasses:true,  facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:27, name:'Catwoman',         face:'🐱',   hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:28, name:'Dumbledore',       face:'🌟',   hair:'white',  gender:'male',   glasses:false, facial_hair:true,  hat:true,  music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:29, name:'Bellatrix',        face:'🌑',   hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:30, name:'Deadpool',         face:'💀',   hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:31, name:'Poison Ivy',       face:'🌿',   hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:32, name:'Aragorn',          face:'👑',   hair:'dark',   gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'middle' },
    { id:33, name:'Éowyn',            face:'⚔️',  hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:34, name:'Darth Vader',      face:'🌑',   hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:35, name:'Princess Leia',    face:'🌠',   hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:36, name:'Gollum',           face:'💍',   hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:37, name:'Black Panther',    face:'🐆',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:38, name:'Scarlet Witch',    face:'🔮',   hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:39, name:'Jack Sparrow',     face:'🏴‍☠️', hair:'dark',  gender:'male',   glasses:false, facial_hair:true,  hat:true,  music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:40, name:'Ursula',           face:'🐙',   hair:'white',  gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:false, royalty:false, age:'older'  },
    { id:41, name:'Zorro',            face:'🗡️',  hair:'dark',   gender:'male',   glasses:true,  facial_hair:true,  hat:true,  music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:42, name:'Merida',           face:'🏹',   hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:43, name:'The Hulk',         face:'💚',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:44, name:'Cruella 2',        face:'🎭',   hair:'white',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:45, name:'Magneto',          face:'🧲',   hair:'white',  gender:'male',   glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:46, name:'Mystique',         face:'💙',   hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:47, name:'Thanos',           face:'💜',   hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:48, name:'Rey',              face:'☀️',   hair:'brown',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:49, name:'Kylo Ren',         face:'🌒',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:50, name:'Shrek',            face:'🟢',   hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:false, royalty:false, age:'middle' },
    { id:51, name:'Fiona',            face:'👸',   hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:52, name:'Professor X',      face:'🧠',   hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:53, name:'Storm',            face:'⛈️',  hair:'white',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:54, name:'Hannibal Lecter',  face:'🍷',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:55, name:'Clarice Starling', face:'🦋',   hair:'brown',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:56, name:'Lex Luthor',       face:'🔬',   hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:57, name:'Harley Quinn',     face:'🔨',   hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:58, name:'Obi-Wan Kenobi',   face:'☮️',   hair:'brown',  gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:59, name:'Ahsoka Tano',      face:'🌀',   hair:'white',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:60, name:'Doomslayer',       face:'🔱',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:61, name:'Loki',             face:'🐍',   hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:false, royalty:true,  age:'young'  },
    { id:62, name:'Nebula',           face:'🔵',   hair:'bald',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:63, name:'Voldemort',        face:'🐍',   hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:64, name:'Buffy Summers',    face:'🌙', hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:65, name:'Willy Wonka',       face:'🎩', hair:'brown',  gender:'male',   glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:66, name:'Kaiju',             face:'🦖', hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:67, name:'Morticia Addams',   face:'🖤', hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
    { id:68, name:'Zorro 2',           face:'🗡️', hair:'dark',  gender:'male',   glasses:true,  facial_hair:true,  hat:true,  music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:69, name:'Élan Brightwater',  face:'🧝‍♀️', hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:true,  royalty:false, age:'young'  },
    { id:70, name:'Draco Malfoy',      face:'🥀', hair:'blonde', gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:71, name:'Wednesday Addams',  face:'✂️', hair:'dark',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:72, name:'Legolas',           face:'🏹', hair:'blonde', gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:73, name:'Galadriel',         face:'🌟', hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:true,  age:'older'  },
    { id:74, name:'Gimli',             face:'🪓', hair:'red',    gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:true,  royalty:false, age:'older'  },
    { id:75, name:'Tauriel',           face:'🍃', hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:76, name:'Hanzo',             face:'🏯', hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:77, name:'Samus Aran',        face:'🚀', hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:78, name:'Link',              face:'🗡️', hair:'blonde', gender:'male',  glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:79, name:'Zelda',             face:'👑', hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:true,  age:'young'  },
    { id:80, name:'Geralt of Rivia',   face:'⚔️', hair:'white', gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:81, name:'Ciri',              face:'🌀', hair:'white',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:82, name:'Master Chief',      face:'🪖', hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:true,  music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:83, name:'Cortana',           face:'💠', hair:'blue',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:84, name:'Kratos',            face:'🩸', hair:'bald',   gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:true,  royalty:false, age:'older'  },
    { id:85, name:'Aloy',              face:'🌿', hair:'red',    gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:86, name:'Arthur Morgan',     face:'🤠', hair:'dark',   gender:'male',   glasses:false, facial_hair:true,  hat:true,  music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:87, name:'Ellie',             face:'🎸', hair:'brown',  gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:true,  royalty:false, age:'young'  },
    { id:88, name:'Joel',              face:'🪵', hair:'grey',   gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:true,  royalty:false, age:'older'  },
    { id:89, name:'Commander Shepard', face:'🌌', hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:90, name:'Liara T\'Soni',     face:'💙', hair:'bald',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'young'  },
    { id:91, name:'GLaDOS',            face:'🤍', hair:'bald',   gender:'female', glasses:false, facial_hair:false, hat:false, music:true,  actor:false, sport:false, royalty:false, age:'older'  },
    { id:92, name:'Cave Johnson',      face:'🔬', hair:'grey',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'older'  },
    { id:93, name:'Solid Snake',       face:'🎮', hair:'dark',   gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:true,  royalty:false, age:'middle' },
    { id:94, name:'Lara 2.0',          face:'🏔️', hair:'dark',  gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:95, name:'Noctis Lucis',      face:'🌃', hair:'dark',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:true,  age:'young'  },
    { id:96, name:'Lightning',         face:'⚡', hair:'pink',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:97, name:'Cloud Strife',      face:'🌩️', hair:'blonde', gender:'male',  glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:98, name:'Tifa Lockhart',     face:'🥊', hair:'dark',   gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:99, name:'Sephiroth',         face:'🌫️', hair:'white',  gender:'male',  glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:100, name:'Aerith Gainsborough', face:'🌸', hair:'brown', gender:'female', glasses:false, facial_hair:false, hat:false, music:true, actor:false, sport:false, royalty:false, age:'young'  },
    { id:101, name:'Nathan Drake',     face:'🗺️', hair:'brown',  gender:'male',   glasses:false, facial_hair:true,  hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:102, name:'Elena Fisher',     face:'📷', hair:'blonde', gender:'female', glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:true,  royalty:false, age:'young'  },
    { id:103, name:'Agent 47',         face:'🔫', hair:'bald',   gender:'male',   glasses:false, facial_hair:false, hat:false, music:false, actor:false, sport:false, royalty:false, age:'middle' },
  ];

  // ── Questions ─────────────────────────────────────────────
  const QUESTIONS = [
    { id:'gender_f',    text:'Is your person female?',          test: c => c.gender==='female' },
    { id:'music',       text:'Are they a musician?',            test: c => c.music },
    { id:'actor',       text:'Are they an actor?',              test: c => c.actor },
    { id:'sport',       text:'Are they a sportsperson?',        test: c => c.sport },
    { id:'hair_blonde', text:'Do they have blonde hair?',       test: c => c.hair==='blonde' },
    { id:'hair_dark',   text:'Do they have dark hair?',         test: c => c.hair==='dark' },
    { id:'hair_bald',   text:'Are they bald?',                  test: c => c.hair==='bald' },
    { id:'facial_hair', text:'Do they have facial hair?',       test: c => c.facial_hair },
    { id:'hat',         text:'Are they known for wearing hats?',test: c => c.hat },
    { id:'royalty',     text:'Are they royalty?',               test: c => c.royalty },
    { id:'age_young',   text:'Are they under 35?',              test: c => c.age==='young' },
    { id:'age_older',   text:'Are they over 55?',               test: c => c.age==='older' },
  ];

  // ── State ─────────────────────────────────────────────────
  let mode = null;        // 'ai' | 'online'
  let activeChars = [];    // 40-char random subset for this game
  let mySecret = null;    // my character index
  let oppSecret = null;   // opponent's character (known in AI mode)
  let eliminated = new Set();      // ids I've eliminated on my board
  let oppEliminated = new Set();   // ids opponent has eliminated (AI mode)
  let myTurn = true;
  let guessMode = false;
  let pendingQuestion = null;      // question waiting for answer
  let pendingQuestionText = null;
  let gameOver = false;
  let aiThinkTimer = null;

  // Firebase / online
  let roomCode = null, isHost = false, fbUnsubs = [], myName = '', oppName = '';
  let pendingOnlineAnswer = null;

  // ── Pick random 40-char subset ──────────────────────────
  function pickActiveChars(seedIds) {
    // seedIds: optional array of ids (for online — host shares with guest)
    if (seedIds) {
      activeChars = seedIds.map(id => CHARS.find(c => c.id === id)).filter(Boolean);
    } else {
      const shuffled = [...CHARS].sort(() => Math.random() - 0.5);
      activeChars = shuffled.slice(0, 40);
    }
  }

  // ── DOM helpers ───────────────────────────────────────────
  const $ = id => document.getElementById(id);

  function log(text, cls='') {
    const el = $('gw-log');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'gw-log-entry ' + cls;
    d.textContent = text;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function setStatus(msg) {
    const el = $('gw-status');
    if (el) el.textContent = msg;
  }

  function setTurnBadges() {
    const my = $('gw-my-badge'), opp = $('gw-opp-badge');
    if (!my || !opp) return;
    if (myTurn) {
      my.classList.remove('opponent'); opp.classList.add('opponent');
    } else {
      my.classList.add('opponent'); opp.classList.remove('opponent');
    }
  }

  // ── Board rendering ───────────────────────────────────────
  function renderBoard() {
    const board = $('gw-board');
    if (!board) return;
    board.innerHTML = '';
    activeChars.forEach(c => {
      const div = document.createElement('div');
      div.className = 'gw-card' + (eliminated.has(c.id) ? ' gw-eliminated' : '');
      if (guessMode && !eliminated.has(c.id)) div.classList.add('gw-selected');
      div.dataset.id = c.id;
      div.innerHTML = `
        <div class="gw-card-face">${c.face}</div>
        <div class="gw-card-name">${c.name}</div>
        <div class="gw-card-tag">${[c.music?'🎵':'',c.actor?'🎬':'',c.sport?'⚽':'',c.royalty?'👑':''].filter(Boolean).join('')||'🌟'}</div>
        <div class="gw-x">✕</div>
      `;
      div.addEventListener('click', () => onCardClick(c.id));
      board.appendChild(div);
    });
  }

  function updateBoard() {
    const cards = document.querySelectorAll('.gw-card');
    cards.forEach(card => {
      const id = parseInt(card.dataset.id);
      if (eliminated.has(id)) {
        card.classList.add('gw-eliminated');
      } else {
        card.classList.remove('gw-eliminated');
        if (guessMode) card.classList.add('gw-selected');
        else card.classList.remove('gw-selected');
      }
    });
  }

  function renderSecretCard() {
    if (mySecret === null) return;
    const c = activeChars.find(x => x.id === mySecret) || CHARS.find(x => x.id === mySecret);
    $('gw-my-face').textContent = c.face;
    $('gw-my-name').textContent = c.name;
  }

  // ── Question buttons ──────────────────────────────────────
  function renderQuestionButtons(enabled) {
    const grid = $('gw-q-grid');
    if (!grid) return;
    grid.innerHTML = '';
    QUESTIONS.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'gw-q-btn';
      btn.textContent = q.text;
      btn.disabled = !enabled;
      btn.addEventListener('click', () => askQuestion(q));
      grid.appendChild(btn);
    });
  }

  function setControlsMode(m) {
    // m: 'ask' | 'wait' | 'answer' | 'guess' | 'disabled'
    const qGrid = $('gw-q-grid');
    const ansRow = $('gw-answer-row');
    const guessBtn = $('gw-guess-btn');
    const label = $('gw-ctrl-label');
    if (!qGrid) return;

    qGrid.style.display = (m === 'ask') ? 'grid' : 'none';
    ansRow.style.display = (m === 'answer') ? 'grid' : 'none';
    if (guessBtn) guessBtn.disabled = (m !== 'ask');

    const msgs = {
      ask: 'ASK A QUESTION',
      wait: 'WAITING FOR OPPONENT...',
      answer: 'OPPONENT ASKS:',
      disabled: '—',
    };
    if (label) label.textContent = msgs[m] || '—';
  }

  // ── Card click ────────────────────────────────────────────
  function onCardClick(id) {
    if (gameOver) return;
    if (guessMode) {
      // Make the final guess
      makeGuess(id);
    } else if (myTurn) {
      // Toggle elimination manually (right-click style — click while holding shift)
      // Actually: just allow players to manually flip down cards by clicking
      if (eliminated.has(id)) {
        eliminated.delete(id);
      } else {
        eliminated.add(id);
      }
      updateBoard();
    }
  }

  // ── Ask question ──────────────────────────────────────────
  function askQuestion(q) {
    if (!myTurn || gameOver || guessMode) return;
    pendingQuestion = q;
    pendingQuestionText = q.text;
    log('You: ' + q.text, 'q');

    if (mode === 'ai') {
      setControlsMode('wait');
      setStatus('AI is thinking...');
      setTimeout(() => {
        const answer = q.test(CHARS[oppSecret]);
        receiveAnswer(answer);
      }, 800 + Math.random()*600);
    } else {
      // Online: push question to Firebase
      setControlsMode('wait');
      setStatus('Question sent — waiting for answer...');
      update(ref(db, `gw_rooms/${roomCode}/question`), {
        text: q.text, id: q.id, from: isHost ? 'host' : 'guest', answered: false
      });
    }
  }

  function receiveAnswer(yes) {
    if (!pendingQuestion) return;
    const q = pendingQuestion;
    log('Answer: ' + (yes ? 'YES ✓' : 'NO ✗'), yes ? 'yes' : 'no');

    // Auto-eliminate based on answer
    activeChars.forEach(c => {
      if (eliminated.has(c.id)) return;
      const matches = q.test(c);
      if (yes && !matches) eliminated.add(c.id);
      if (!yes && matches) eliminated.add(c.id);
    });
    updateBoard();

    pendingQuestion = null;
    pendingQuestionText = null;

    // Check if only one left
    const remaining = activeChars.filter(c => !eliminated.has(c.id));
    if (remaining.length === 1) {
      log('Only one left — make your guess!', 'sys');
    }

    // Pass turn
    myTurn = false;
    setTurnBadges();
    setStatus("Opponent's turn");
    setControlsMode('wait');

    if (mode === 'ai') {
      setTimeout(aiTakeTurn, 1200 + Math.random()*800);
    }
  }

  // ── Guess mode ────────────────────────────────────────────
  function enterGuessMode() {
    if (!myTurn || gameOver) return;
    guessMode = true;
    setStatus('Click the person you think is your opponent\'s mystery person!');
    log('You: MAKING A GUESS...', 'sys');
    updateBoard();
    $('gw-guess-btn').disabled = true;
    renderQuestionButtons(false);
  }

  function makeGuess(id) {
    guessMode = false;
    const guessedChar = activeChars.find(x=>x.id===id);
    log(`You guessed: ${guessedChar.name}`, 'q');

    if (mode === 'ai') {
      const correct = id === oppSecret;
      endGame(correct, correct ? `Correct! It was ${guessedChar.name}!` : `Wrong! It was ${(activeChars.find(x=>x.id===oppSecret)||{name:'?'}).name}.`);
    } else {
      // Online: send guess
      setControlsMode('wait');
      update(ref(db, `gw_rooms/${roomCode}/guess`), {
        guessedId: id, from: isHost ? 'host' : 'guest'
      });
    }
  }

  // ── AI logic ──────────────────────────────────────────────
  function aiTakeTurn() {
    if (gameOver) return;
    const remaining = activeChars.filter(c => !oppEliminated.has(c.id));

    // If AI has narrowed to 1 or 2, guess
    if (remaining.length <= 2) {
      const guess = remaining[Math.floor(Math.random() * remaining.length)];
      log(`AI guesses: ${guess.name}`, 'q');
      setTimeout(() => {
        const correct = guess.id === mySecret;
        endGame(!correct, correct ? `AI guessed right! You lose.` : `AI guessed wrong! You win!`);
      }, 800);
      return;
    }

    // Pick question that best splits remaining chars
    let bestQ = null, bestScore = -1;
    QUESTIONS.forEach(q => {
      const yes = remaining.filter(c => q.test(c)).length;
      const no  = remaining.length - yes;
      const score = Math.min(yes, no); // maximize balance
      if (score > bestScore) { bestScore = score; bestQ = q; }
    });

    if (!bestQ) bestQ = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];

    log(`AI asks: ${bestQ.text}`, 'q');
    setStatus('Answer the AI\'s question:');
    setControlsMode('answer');
    pendingQuestion = bestQ;

    // Store for AI to process when answer received
    window._gwAiPendingQ = bestQ;
  }

  function answerQuestion(yes) {
    const q = window._gwAiPendingQ || pendingQuestion;
    if (!q) return;
    log('You answered: ' + (yes ? 'YES ✓' : 'NO ✗'), yes ? 'yes' : 'no');

    // AI processes the answer — update oppEliminated
    activeChars.forEach(c => {
      if (oppEliminated.has(c.id)) return;
      const matches = q.test(c);
      if (yes && !matches) oppEliminated.add(c.id);
      if (!yes && matches) oppEliminated.add(c.id);
    });

    window._gwAiPendingQ = null;
    pendingQuestion = null;

    // Back to my turn
    myTurn = true;
    setTurnBadges();
    setStatus('Your turn — ask a question or make a guess');
    setControlsMode('ask');
    renderQuestionButtons(true);
  }

  // ── End game ──────────────────────────────────────────────
  function endGame(won, msg) {
    gameOver = true;
    setControlsMode('disabled');
    $('gw-end-title').textContent = won ? '🎉 YOU WIN!' : '💀 YOU LOSE';
    $('gw-end-msg').textContent = msg;
    $('gw-end-overlay').classList.add('active');
    if (window.FX) {
      if (won) {
        FX.confetti(window.innerWidth/2, window.innerHeight*0.3);
        FX.screenFlash('#f472b6', 0.2);
      } else {
        FX.screenFlash('#ff4444', 0.15);
      }
    }
  }

  // ── Start game ────────────────────────────────────────────
  function startGame(secretId, oppSecretId) {
    mySecret = secretId;
    oppSecret = oppSecretId; // null in online
    eliminated.clear();
    oppEliminated.clear();
    gameOver = false;
    guessMode = false;
    pendingQuestion = null;
    window._gwAiPendingQ = null;

    renderBoard();
    renderSecretCard();
    renderQuestionButtons(myTurn);
    setTurnBadges();
    $('gw-end-overlay').classList.remove('active');
    $('gw-log').innerHTML = '';

    if (myTurn) {
      setStatus('Your turn — ask a question!');
      setControlsMode('ask');
    } else {
      setStatus("Opponent goes first");
      setControlsMode('wait');
      if (mode === 'ai') setTimeout(aiTakeTurn, 1000);
    }

    log(`Your secret person: ${(activeChars.find(x=>x.id===mySecret)||{name:'?'}).name}`, 'sys');
    showScreen('guesswho-screen');
    document.getElementById('main-title').textContent = '🎭 GUESS WHO';
    document.getElementById('main-subtitle').textContent = 'WHO IS YOUR MYSTERY PERSON?';
  }

  // ── VS AI ─────────────────────────────────────────────────
  function startVsAI() {
    mode = 'ai';
    myTurn = true;
    pickActiveChars();
    const myChar = activeChars[Math.floor(Math.random() * activeChars.length)];
    let aiChar = activeChars[Math.floor(Math.random() * activeChars.length)];
    while (aiChar.id === myChar.id) aiChar = activeChars[Math.floor(Math.random() * activeChars.length)];
    startGame(myChar.id, aiChar.id);
  }

  // ── Online ────────────────────────────────────────────────
  function getName() {
    return ($('gw-name')?.value.trim() || 'PLAYER').toUpperCase().slice(0,12);
  }

  async function hostOnline() {
    if (!window._firebaseReady) { if($('gw-lobby-status')) $('gw-lobby-status').textContent='CONNECTING...'; await new Promise(r=>window.addEventListener('firebaseReady',r,{once:true})); }
    mode = 'online';
    isHost = true;
    myName = getName();
    const code = Math.random().toString(36).slice(2,7).toUpperCase();
    roomCode = code;
    pickActiveChars();
    const hostChar = activeChars[Math.floor(Math.random() * activeChars.length)];
    mySecret = hostChar.id;
    myTurn = true;

    $('gw-lobby-entry').style.display = 'none';
    $('gw-lobby-room').style.display = '';
    $('gw-room-code').textContent = code;
    $('gw-lobby-status').textContent = 'WAITING FOR OPPONENT...';

    await set(ref(db, `gw_rooms/${code}`), {
      host: myName,
      hostSecret: mySecret,
      activeCharIds: activeChars.map(c => c.id),
      status: 'waiting',
      created: Date.now(),
    });

    // Wait for guest to join
    const unsub = onValue(ref(db, `gw_rooms/${code}/guest`), snap => {
      if (!snap.exists()) return;
      const guestData = snap.val();
      oppName = guestData.name;
      oppSecret = null; // unknown in online
      $('gw-lobby-status').textContent = `${oppName} joined! Starting...`;
      setTimeout(() => {
        startGame(mySecret, null);
        listenOnline();
      }, 800);
    });
    fbUnsubs.push(unsub);
    startLobbyBrowse();
  }

  async function joinOnline(code) {
    if (!window._firebaseReady) { await new Promise(r=>window.addEventListener('firebaseReady',r,{once:true})); }
    mode = 'online';
    isHost = false;
    myName = getName();
    roomCode = code;
    myTurn = false;

    const snap = await get(ref(db, `gw_rooms/${code}`));
    if (!snap.exists()) { alert('Room not found'); return; }
    const data = snap.val();
    oppName = data.host;

    // Use same 40-char subset the host picked
    pickActiveChars(data.activeCharIds || null);
    const guestChar = activeChars[Math.floor(Math.random() * activeChars.length)];
    mySecret = guestChar.id;

    await update(ref(db, `gw_rooms/${code}/guest`), { name: myName, guestSecret: mySecret });

    $('gw-lobby-entry').style.display = 'none';
    $('gw-lobby-room').style.display = '';
    $('gw-room-code').textContent = code;
    $('gw-lobby-status').textContent = 'Joined! Waiting for host to start...';

    setTimeout(() => {
      startGame(mySecret, null);
      listenOnline();
    }, 1200);
  }

  function listenOnline() {
    const myRole = isHost ? 'host' : 'guest';
    const oppRole = isHost ? 'guest' : 'host';

    // Listen for questions directed at me
    const qUnsub = onValue(ref(db, `gw_rooms/${roomCode}/question`), snap => {
      if (!snap.exists()) return;
      const q = snap.val();
      if (q.answered || q.from === myRole) return;
      // Opponent asked me a question
      const qObj = QUESTIONS.find(x => x.id === q.id);
      if (!qObj) return;
      pendingQuestion = qObj;
      log(`Opponent asks: ${q.text}`, 'q');
      setStatus('Answer your opponent\'s question:');
      setControlsMode('answer');
      window._gwAiPendingQ = qObj;
    });
    fbUnsubs.push(qUnsub);

    // Listen for answers to my question
    const aUnsub = onValue(ref(db, `gw_rooms/${roomCode}/answer`), snap => {
      if (!snap.exists()) return;
      const a = snap.val();
      if (a.for !== myRole || a.processed) return;
      update(ref(db, `gw_rooms/${roomCode}/answer`), { processed: true });
      receiveAnswer(a.yes);
    });
    fbUnsubs.push(aUnsub);

    // Listen for opponent's guess
    const gUnsub = onValue(ref(db, `gw_rooms/${roomCode}/guess`), snap => {
      if (!snap.exists()) return;
      const g = snap.val();
      if (g.from === myRole || g.processed) return;
      update(ref(db, `gw_rooms/${roomCode}/guess`), { processed: true });
      const correct = g.guessedId === mySecret;
      log(`Opponent guessed: ${CHARS[g.guessedId].name}`, 'q');
      endGame(!correct, correct ? `Opponent guessed right — you lose! It was ${(activeChars.find(x=>x.id===mySecret)||{name:'?'}).name}.` : `Opponent guessed wrong — you win!`);
    });
    fbUnsubs.push(gUnsub);
  }

  function answerOnlineQuestion(yes) {
    const q = window._gwAiPendingQ;
    if (!q) return;
    log('You answered: ' + (yes ? 'YES ✓' : 'NO ✗'), yes ? 'yes' : 'no');
    const myRole = isHost ? 'host' : 'guest';
    update(ref(db, `gw_rooms/${roomCode}/question`), { answered: true });
    update(ref(db, `gw_rooms/${roomCode}/answer`), { yes, for: isHost ? 'guest' : 'host', processed: false });
    window._gwAiPendingQ = null;
    pendingQuestion = null;
    myTurn = true;
    setTurnBadges();
    setStatus('Your turn — ask a question or make a guess');
    setControlsMode('ask');
    renderQuestionButtons(true);
  }

  // Patch answerQuestion to handle both modes
  function answerQuestion(yes) {
    if (mode === 'online') { answerOnlineQuestion(yes); return; }
    // AI mode
    const q = window._gwAiPendingQ || pendingQuestion;
    if (!q) return;
    log('You answered: ' + (yes ? 'YES ✓' : 'NO ✗'), yes ? 'yes' : 'no');
    CHARS.forEach(c => {
      if (oppEliminated.has(c.id)) return;
      const matches = q.test(c);
      if (yes && !matches) oppEliminated.add(c.id);
      if (!yes && matches) oppEliminated.add(c.id);
    });
    window._gwAiPendingQ = null;
    pendingQuestion = null;
    myTurn = true;
    setTurnBadges();
    setStatus('Your turn — ask a question or make a guess');
    setControlsMode('ask');
    renderQuestionButtons(true);
  }

  // ── Lobby browsing ─────────────────────────────────────────
  let _lobbyUnsub = null;
  function startLobbyBrowse() {
    if (!window._firebaseReady) { window.addEventListener('firebaseReady', ()=>startLobbyBrowse(), {once:true}); return; }
    _lobbyUnsub = onValue(ref(db, 'gw_rooms'), snap => {
      const list = $('gw-lobby-list');
      if (!list) return;
      list.innerHTML = '';
      if (!snap.exists()) { list.innerHTML = '<div class="lobby-list-loading">NO OPEN GAMES</div>'; return; }
      const rooms = snap.val();
      let found = 0;
      Object.entries(rooms).forEach(([code, room]) => {
        if (room.status !== 'waiting' || room.guest) return;
        found++;
        const btn = document.createElement('button');
        btn.className = 'lobby-list-item';
        btn.innerHTML = `<span>${room.host}</span><span class="lobby-join-badge">JOIN</span>`;
        btn.onclick = () => { stopLobbyBrowse(); joinOnline(code); };
        list.appendChild(btn);
      });
      if (!found) list.innerHTML = '<div class="lobby-list-loading">NO OPEN GAMES</div>';
    });
  }
  function stopLobbyBrowse() {
    if (_lobbyUnsub) { _lobbyUnsub(); _lobbyUnsub = null; }
  }

  // ── New game ──────────────────────────────────────────────
  function newGame() {
    $('gw-end-overlay').classList.remove('active');
    if (mode === 'ai') startVsAI();
    else { destroy(); showScreen('guesswho-lobby-screen'); }
  }

  // ── Destroy / cleanup ─────────────────────────────────────
  function destroy() {
    gameOver = true;
    stopLobbyBrowse();
    fbUnsubs.forEach(u => typeof u === 'function' && u());
    fbUnsubs = [];
    if (roomCode) {
      try { remove(ref(db, `gw_rooms/${roomCode}`)); } catch(e) {}
      roomCode = null;
    }
    if (aiThinkTimer) { clearTimeout(aiThinkTimer); aiThinkTimer = null; }
    $('gw-end-overlay')?.classList.remove('active');
    $('gw-lobby-entry').style.display = '';
    $('gw-lobby-room').style.display = 'none';
  }

  // ── Init lobby on screen show ─────────────────────────────
  let _lobbyInitDone = false;
  const lobbyObs = new MutationObserver(() => {
    const screen = document.getElementById('guesswho-lobby-screen');
    if (screen && screen.classList.contains('active') && !_lobbyInitDone) {
      _lobbyInitDone = true;
      startLobbyBrowse();
    }
    if (screen && !screen.classList.contains('active')) {
      _lobbyInitDone = false;
    }
  });
  const gwLobbyEl = document.getElementById('guesswho-lobby-screen');
  if (gwLobbyEl) lobbyObs.observe(gwLobbyEl, { attributes: true, attributeFilter: ['class'] });

  // ── Public API ────────────────────────────────────────────
  return {
    startVsAI,
    hostOnline,
    joinOnline,
    answerQuestion,
    enterGuessMode,
    newGame,
    destroy,
    startLobbyBrowse,
    stopLobbyBrowse,
  };
})();
