// TRIVIA ENGINE — extracted from index.html
// Loaded lazily when game is first selected

// TRIVIA ENGINE
// ============================================================

const TRV_QUESTIONS = [
  { cat:'GEOGRAPHY',    q:'What is the capital of Australia?',                                          a:['Sydney','Melbourne','Canberra','Brisbane'],              correct:2 },
  { cat:'SCIENCE',      q:'What is the chemical symbol for gold?',                                      a:['Go','Gd','Au','Ag'],                                    correct:2 },
  { cat:'HISTORY',      q:'In which year did World War II end?',                                        a:['1943','1944','1946','1945'],                             correct:3 },
  { cat:'POP CULTURE',  q:'Which band performed "Bohemian Rhapsody"?',                                  a:['Led Zeppelin','Queen','The Beatles','Pink Floyd'],       correct:1 },
  { cat:'SCIENCE',      q:'How many bones are in the adult human body?',                                a:['206','196','216','186'],                                 correct:0 },
  { cat:'GEOGRAPHY',    q:'Which country has the longest coastline in the world?',                      a:['Russia','Norway','Canada','Australia'],                  correct:2 },
  { cat:'HISTORY',      q:'Who was the first person to walk on the Moon?',                              a:['Buzz Aldrin','Yuri Gagarin','Neil Armstrong','John Glenn'], correct:2 },
  { cat:'LITERATURE',   q:'Who wrote "Pride and Prejudice"?',                                           a:['Charlotte Bront—','Jane Austen','George Eliot','Mary Shelley'], correct:1 },
  { cat:'SCIENCE',      q:'What planet is known as the Red Planet?',                                    a:['Venus','Jupiter','Saturn','Mars'],                       correct:3 },
  { cat:'SPORT',        q:'How many players are on a standard football (soccer) team?',                 a:['10','12','11','9'],                                      correct:2 },
  { cat:'FOOD & DRINK', q:'From which country does Gouda cheese originate?',                            a:['France','Belgium','Netherlands','Germany'],              correct:2 },
  { cat:'SCIENCE',      q:'What is the hardest natural substance on Earth?',                            a:['Quartz','Diamond','Titanium','Corundum'],                correct:1 },
  { cat:'HISTORY',      q:'Which empire was ruled by Julius Caesar?',                                   a:['Greek','Ottoman','Roman','Byzantine'],                   correct:2 },
  { cat:'GEOGRAPHY',    q:'What is the largest ocean on Earth?',                                        a:['Atlantic','Indian','Arctic','Pacific'],                  correct:3 },
  { cat:'POP CULTURE',  q:'In which fictional city does Batman operate?',                               a:['Metropolis','Star City','Gotham City','Central City'],   correct:2 },
  { cat:'SCIENCE',      q:'What gas do plants absorb from the atmosphere?',                             a:['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'],         correct:2 },
  { cat:'HISTORY',      q:'The Great Wall of China was primarily built to protect against which group?', a:['Mongols','Japanese','Persians','Russians'],             correct:0 },
  { cat:'LITERATURE',   q:'Who wrote "1984"?',                                                          a:['Aldous Huxley','Ray Bradbury','George Orwell','H.G. Wells'], correct:2 },
  { cat:'SPORT',        q:'In which sport would you perform a "slam dunk"?',                            a:['Volleyball','Basketball','Tennis','Handball'],           correct:1 },
  { cat:'GEOGRAPHY',    q:'What is the smallest country in the world by area?',                         a:['Monaco','San Marino','Liechtenstein','Vatican City'],    correct:3 },
  { cat:'SCIENCE',      q:'What is the speed of light (approximately)?',                                a:['200,000 km/s','400,000 km/s','300,000 km/s','150,000 km/s'], correct:2 },
  { cat:'HISTORY',      q:'In what year did the Berlin Wall fall?',                                     a:['1987','1991','1989','1985'],                             correct:2 },
  { cat:'POP CULTURE',  q:'How many Infinity Stones are there in the Marvel universe?',                 a:['5','7','4','6'],                                        correct:3 },
  { cat:'FOOD & DRINK', q:'What is the main ingredient in hummus?',                                     a:['Lentils','Black beans','Chickpeas','Edamame'],           correct:2 },
  { cat:'SCIENCE',      q:'What is the powerhouse of the cell?',                                        a:['Nucleus','Ribosome','Mitochondria','Vacuole'],           correct:2 },
  { cat:'GEOGRAPHY',    q:'Which river is the longest in the world?',                                   a:['Amazon','Congo','Yangtze','Nile'],                       correct:3 },
  { cat:'HISTORY',      q:'Who painted the Sistine Chapel ceiling?',                                    a:['Leonardo da Vinci','Raphael','Donatello','Michelangelo'], correct:3 },
  { cat:'SPORT',        q:'How many Grand Slam tennis tournaments are held each year?',                 a:['3','5','2','4'],                                        correct:3 },
  { cat:'LITERATURE',   q:'What is the name of Harry Potter\'s owl?',                                   a:['Crookshanks','Hedwig','Fawkes','Scabbers'],             correct:1 },
  { cat:'SCIENCE',      q:'Which planet has the most moons in our solar system?',                       a:['Jupiter','Uranus','Neptune','Saturn'],                   correct:3 },
  { cat:'HISTORY',      q:'What year did the Titanic sink?',                                            a:['1914','1910','1908','1912'],                             correct:3 },
  { cat:'POP CULTURE',  q:'What is the name of Tony Stark\'s AI assistant?',                            a:['WALL-E','HAL 9000','JARVIS','R2-D2'],                    correct:2 },
  { cat:'FOOD & DRINK', q:'Which country invented pizza?',                                              a:['Greece','Spain','Italy','France'],                      correct:2 },
  { cat:'GEOGRAPHY',    q:'What is the tallest mountain in the world?',                                 a:['K2','Kangchenjunga','Lhotse','Mount Everest'],           correct:3 },
  { cat:'SCIENCE',      q:'What is the atomic number of hydrogen?',                                     a:['2','3','4','1'],                                        correct:3 },
  { cat:'HISTORY',      q:'Which country was the first to give women the right to vote?',               a:['United Kingdom','New Zealand','Sweden','USA'],           correct:1 },
  { cat:'SPORT',        q:'How many holes are on a standard golf course?',                              a:['16','20','18','14'],                                    correct:2 },
  { cat:'LITERATURE',   q:'In "The Lion, the Witch and the Wardrobe", what is the name of the lion?',   a:['Leo','Simba','Aslan','Mufasa'],                         correct:2 },
  { cat:'POP CULTURE',  q:'Which TV show features the fictional Dunder Mifflin paper company?',        a:['Parks and Recreation','Brooklyn Nine-Nine','The Office','Arrested Development'], correct:2 },
  { cat:'GEOGRAPHY',    q:'What is the capital of Japan?',                                              a:['Kyoto','Osaka','Hiroshima','Tokyo'],                     correct:3 },
  { cat:'SCIENCE',      q:'DNA stands for what?',                                                       a:['Deoxyribonucleic Acid','Dinitrogen Acid','Dynamic Nuclear Array','Deoxynitrous Acid'], correct:0 },
  { cat:'HISTORY',      q:'Who was the first President of the United States?',                          a:['Thomas Jefferson','John Adams','Benjamin Franklin','George Washington'], correct:3 },
  { cat:'FOOD & DRINK', q:'What is the national dish of Spain?',                                        a:['Tapas','Churros','Gazpacho','Paella'],                   correct:3 },
  { cat:'SPORT',        q:'In which city were the first modern Olympic Games held in 1896?',            a:['Rome','Paris','London','Athens'],                        correct:3 },
  { cat:'POP CULTURE',  q:'Which element has the symbol "Fe"?',                                        a:['Fluorine','Iron','Francium','Fermium'],                  correct:1 },
  { cat:'GEOGRAPHY',    q:'How many continents are there on Earth?',                                    a:['5','8','6','7'],                                        correct:3 },
  { cat:'LITERATURE',   q:'Who wrote "The Great Gatsby"?',                                              a:['Ernest Hemingway','John Steinbeck','F. Scott Fitzgerald','William Faulkner'], correct:2 },
  { cat:'SCIENCE',      q:'What is the largest planet in our solar system?',                            a:['Saturn','Neptune','Uranus','Jupiter'],                   correct:3 },
  { cat:'HISTORY',      q:'The Eiffel Tower was built for which World\'s Fair?',                        a:['1889 Paris','1900 Paris','1876 Philadelphia','1893 Chicago'], correct:0 },
  { cat:'SPORT',        q:'What sport is played at Wimbledon?',                                         a:['Badminton','Squash','Table Tennis','Tennis'],             correct:3 },
];

const TRV_TOTAL_QUESTIONS = 10;
const TRV_POINTS_CORRECT = 1;

let TRV = {
  roomCode: null,
  playerNum: 1,    // 1 or 2
  myName: '',
  oppName: '',
  scores: [0, 0],
  currentQ: 0,
  questions: [],   // shuffled subset of TRV_QUESTIONS
  myAnswer: null,
  oppAnswer: null,
  revealed: false,
  myNextReady: false,
  unsubs: [],
  isLocal: false,  // true = pass-and-play on one device
};

function trvShuffleQuestions() {
  const pool = [...TRV_QUESTIONS];
  for (let i = pool.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]] = [pool[j],pool[i]];
  }
  return pool.slice(0, TRV_TOTAL_QUESTIONS);
}

// ?? Lobby helpers ?????????????????????????????????????????????
function trvSetLobbyStatus(msg, type='') {
  const el = document.getElementById('trivia-lobby-status');
  el.style.display = msg ? '' : 'none';
  el.className = 'status-bar ' + type;
  el.textContent = msg;
}

function trvRenderWaitingPlayers(room) {
  const el = document.getElementById('trivia-lobby-players');
  if (!el) return;
  const rows = [
    { num:1, data: room.p1, isHost: true },
    { num:2, data: room.p2, isHost: false },
  ];
  el.innerHTML = rows.map(r => {
    const filled = r.data && r.data.name;
    const badge = !filled
      ? '<span class="slot-badge waiting">WAITING...</span>'
      : r.isHost ? '<span class="slot-badge host">HOST</span>'
                 : '<span class="slot-badge guest">GUEST</span>';
    return `<div class="lobby-player-row">
      <span class="slot-num">${r.num}.</span>
      <span class="slot-name">${filled ? r.data.name : '—'}</span>
      ${badge}
    </div>`;
  }).join('');
}

// ?? Create / Join ?????????????????????????????????????????????
window.triviaCreate = async function() {
  if (!window._firebaseReady) { trvSetLobbyStatus('CONNECTING—',''); await new Promise(r=>window.addEventListener('firebaseReady',r,{once:true})); }
  const name = (document.getElementById('trivia-player-name').value.trim().toUpperCase() || 'PLAYER1');
  const code = Math.random().toString(36).substring(2,6).toUpperCase();
  TRV.roomCode = code;
  TRV.playerNum = 1;
  TRV.myName = name;
  TRV.unsubs.forEach(u=>typeof u==='function'&&u()); TRV.unsubs=[];

  const questions = trvShuffleQuestions();
  await set(ref(db, `trivia/${code}`), {
    status: 'waiting',
    p1: { name, answer: -1, nextReady: false },
    p2: null,
    scores: [0,0],
    currentQ: 0,
    questions: questions.map(q=>({ cat:q.cat, q:q.q, a:q.a, correct:q.correct })),
  });

  document.getElementById('trivia-room-code-display').textContent = code;
  document.getElementById('trivia-wait-msg').textContent = '⏳ Waiting for Player 2—';
  trvRenderWaitingPlayers({ p1:{name}, p2:null });
  trvSetLobbyStatus('','');
  showScreen('trivia-wait-screen');
  trvListenWaiting(code);
};

window.triviaJoin = async function() {
  if (!window._firebaseReady) { trvSetLobbyStatus('CONNECTING—',''); await new Promise(r=>window.addEventListener('firebaseReady',r,{once:true})); }
  const code = (document.getElementById('trivia-join-code').value.trim().toUpperCase());
  const name = (document.getElementById('trivia-player-name').value.trim().toUpperCase() || 'PLAYER2');
  if (!code) { trvSetLobbyStatus('ENTER A GAME CODE','error'); return; }
  trvSetLobbyStatus('CONNECTING—','');
  const snap = await get(ref(db, `trivia/${code}`));
  if (!snap.exists()) { trvSetLobbyStatus('GAME NOT FOUND','error'); return; }
  const room = snap.val();
  if (room.status !== 'waiting') { trvSetLobbyStatus('GAME ALREADY IN PROGRESS','error'); return; }
  if (room.p2) { trvSetLobbyStatus('GAME IS FULL','error'); return; }

  TRV.roomCode = code;
  TRV.playerNum = 2;
  TRV.myName = name;
  TRV.oppName = room.p1.name;
  TRV.unsubs.forEach(u=>typeof u==='function'&&u()); TRV.unsubs=[];

  await update(ref(db, `trivia/${code}`), { p2: { name, answer: -1, nextReady: false }, status: 'playing' });
  trvSetLobbyStatus('','');
  document.getElementById('trivia-room-code-display').textContent = code;
  trvRenderWaitingPlayers({ p1:{name:room.p1.name}, p2:{name} });
  showScreen('trivia-wait-screen');
  // Guest goes straight in after a brief moment
  setTimeout(() => trvStartGame(), 600);
};

function trvListenWaiting(code) {
  const unsub = onValue(ref(db, `trivia/${code}/status`), snap => {
    if (!snap.exists()) return;
    if (snap.val() === 'playing') {
      unsub();
      TRV.unsubs = TRV.unsubs.filter(u=>u!==unsub);
      trvStartGame();
    }
  });
  TRV.unsubs.push(unsub);
  // Also listen for p2 joining to update UI
  const unsub2 = onValue(ref(db, `trivia/${code}`), snap => {
    if (!snap.exists()) return;
    const room = snap.val();
    if (room.p2) {
      TRV.oppName = room.p2.name;
      trvRenderWaitingPlayers(room);
      document.getElementById('trivia-wait-msg').textContent = room.p2 ? `? ${room.p2.name} joined — starting—` : '⏳ Waiting for Player 2—';
    }
  });
  TRV.unsubs.push(unsub2);
}

async function trvStartGame() {
  TRV.unsubs.forEach(u=>typeof u==='function'&&u()); TRV.unsubs=[];
  const snap = await get(ref(db, `trivia/${TRV.roomCode}`));
  if (!snap.exists()) return;
  const room = snap.val();
  TRV.questions = room.questions;
  TRV.scores = room.scores || [0,0];
  TRV.currentQ = room.currentQ || 0;
  if (TRV.playerNum === 1) {
    TRV.myName = room.p1.name;
    TRV.oppName = room.p2 ? room.p2.name : 'PLAYER 2';
  } else {
    TRV.myName = room.p2.name;
    TRV.oppName = room.p1.name;
  }
  document.getElementById('main-subtitle').textContent = '2-PLAYER GENERAL KNOWLEDGE';
  trvRenderGame();
  showScreen('trivia-screen');
  trvListenGame();
}

// ?? Game screen rendering ?????????????????????????????????????
function trvRenderGame() {
  const q = TRV.questions[TRV.currentQ];
  const myIdx = TRV.playerNum - 1;
  const oppIdx = 1 - myIdx;

  // Scores
  document.getElementById('trv-p1-name').textContent = TRV.playerNum === 1 ? TRV.myName : TRV.oppName;
  document.getElementById('trv-p2-name').textContent = TRV.playerNum === 2 ? TRV.myName : TRV.oppName;
  document.getElementById('trv-p1-score').textContent = TRV.scores[0];
  document.getElementById('trv-p2-score').textContent = TRV.scores[1];
  document.getElementById('trv-round-info').textContent = `Q ${TRV.currentQ+1}/${TRV_TOTAL_QUESTIONS}`;

  // Highlight my panel
  document.getElementById('trv-p1-panel').classList.remove('answered','active-player');
  document.getElementById('trv-p2-panel').classList.remove('answered','active-player');
  const myPanel = document.getElementById(TRV.playerNum===1 ? 'trv-p1-panel' : 'trv-p2-panel');
  myPanel.classList.add('active-player');

  document.getElementById('trv-p1-status').textContent = '';
  document.getElementById('trv-p2-status').textContent = '';

  // Question
  document.getElementById('trv-category').textContent = q.cat;
  document.getElementById('trv-question').textContent = q.q;

  // Answers
  const container = document.getElementById('trv-answers');
  container.innerHTML = '';
  const letters = ['A','B','C','D'];
  q.a.forEach((ans, i) => {
    const btn = document.createElement('button');
    btn.className = 'trv-answer-btn';
    btn.innerHTML = `<span class="trv-answer-letter">${letters[i]}</span>${ans}`;
    btn.onclick = () => trvSelectAnswer(i);
    container.appendChild(btn);
  });

  document.getElementById('trv-status-msg').textContent = 'Choose your answer—';
  document.getElementById('trv-status-msg').className = 'trv-status-msg';
  document.getElementById('trv-next-btn').classList.remove('visible');

  TRV.myAnswer = null;
  TRV.oppAnswer = null;
  TRV.revealed = false;
  TRV.myNextReady = false;
}

function trvSelectAnswer(idx) {
  if (TRV.myAnswer !== null || TRV.revealed) return;
  TRV.myAnswer = idx;

  // Highlight selected
  const btns = document.querySelectorAll('.trv-answer-btn');
  btns.forEach((b,i) => {
    b.disabled = true;
    if (i === idx) b.classList.add('selected');
  });

  // Mark my panel as answered
  const myPanel = document.getElementById(TRV.playerNum===1 ? 'trv-p1-panel' : 'trv-p2-panel');
  const myStatus = document.getElementById(TRV.playerNum===1 ? 'trv-p1-status' : 'trv-p2-status');
  myPanel.classList.add('answered');
  myStatus.textContent = '✅ ANSWERED';

  const msg = document.getElementById('trv-status-msg');
  msg.textContent = '⏳ WAITING FOR OPPONENT—';
  msg.className = 'trv-status-msg waiting';

  // Write answer to Firebase
  const pKey = `p${TRV.playerNum}`;
  update(ref(db, `trivia/${TRV.roomCode}/${pKey}`), { answer: idx });
}

function trvReveal(p1ans, p2ans) {
  if (TRV.revealed) return;
  TRV.revealed = true;
  const q = TRV.questions[TRV.currentQ];
  const correct = q.correct;

  const myAns  = TRV.playerNum === 1 ? p1ans : p2ans;
  const oppAns = TRV.playerNum === 1 ? p2ans : p1ans;
  TRV.myAnswer  = myAns;
  TRV.oppAnswer = oppAns;

  // Colour the answer buttons
  const btns = document.querySelectorAll('.trv-answer-btn');
  btns.forEach((b,i) => {
    b.disabled = true;
    b.classList.remove('selected');
    if (i === correct) b.classList.add('correct');
    else if (i === myAns && i !== correct) b.classList.add('wrong');
    else if (i === oppAns && i !== correct) b.classList.add('wrong');
  });

  // Update statuses
  const p1correct = p1ans === correct;
  const p2correct = p2ans === correct;
  document.getElementById('trv-p1-status').textContent = p1correct ? '✅ CORRECT' : '❌ WRONG';
  document.getElementById('trv-p2-status').textContent = p2correct ? '✅ CORRECT' : '❌ WRONG';
  document.getElementById('trv-p1-panel').classList.toggle('answered', p1correct);
  document.getElementById('trv-p2-panel').classList.toggle('answered', p2correct);

  const msg = document.getElementById('trv-status-msg');
  if (myAns === correct) {
    msg.textContent = '✅ CORRECT!';
    msg.className = 'trv-status-msg reveal';
  } else {
    msg.textContent = `❌ WRONG — Correct: ${q.a[correct]}`;
    msg.className = 'trv-status-msg';
  }

  // Both players update scores locally immediately for instant UI feedback
  const newScores = [
    TRV.scores[0] + (p1correct ? TRV_POINTS_CORRECT : 0),
    TRV.scores[1] + (p2correct ? TRV_POINTS_CORRECT : 0),
  ];
  TRV.scores = newScores;
  document.getElementById('trv-p1-score').textContent = TRV.scores[0];
  document.getElementById('trv-p2-score').textContent = TRV.scores[1];
  // Only host writes to Firebase to avoid race condition
  if (TRV.playerNum === 1) {
    update(ref(db, `trivia/${TRV.roomCode}`), { scores: newScores });
  }

  // Show NEXT button to both players — question advances when both click it
  const nextBtn = document.getElementById('trv-next-btn');
  nextBtn.textContent = TRV.currentQ + 1 < TRV_TOTAL_QUESTIONS ? 'NEXT QUESTION ▶' : 'SEE RESULTS ▶';
  nextBtn.classList.add('visible');
  TRV.myNextReady = false;
}

window.triviaNext = async function() {
  if (TRV.myNextReady) return;   // already clicked
  TRV.myNextReady = true;

  // Hide next button and show waiting status for this player
  document.getElementById('trv-next-btn').classList.remove('visible');
  const msg = document.getElementById('trv-status-msg');
  msg.textContent = '⏳ WAITING FOR OPPONENT—';
  msg.className = 'trv-status-msg waiting';

  // Write our "ready for next" flag
  const pKey = `p${TRV.playerNum}`;
  await update(ref(db, `trivia/${TRV.roomCode}/${pKey}`), { nextReady: true });
  // Host checks if both are ready and advances (avoids race condition)
  if (TRV.playerNum === 1) {
    const snap = await get(ref(db, `trivia/${TRV.roomCode}`));
    if (!snap.exists()) return;
    const room = snap.val();
    const p1ready = room.p1 && room.p1.nextReady;
    const p2ready = room.p2 && room.p2.nextReady;
    if (p1ready && p2ready) {
      await trvAdvanceQuestion(room);
    }
  }
};

async function trvAdvanceQuestion(room) {
  const nextQ = TRV.currentQ + 1;
  if (nextQ >= TRV_TOTAL_QUESTIONS) {
    const scores = room.scores || TRV.scores;
    await update(ref(db, `trivia/${TRV.roomCode}`), { status: 'gameover', scores });
  } else {
    await update(ref(db, `trivia/${TRV.roomCode}`), {
      currentQ: nextQ,
      'p1/answer': -1,
      'p1/nextReady': false,
      'p2/answer': -1,
      'p2/nextReady': false,
    });
  }
}

// ?? Firebase listener ?????????????????????????????????????????
function trvListenGame() {
  const unsub = onValue(ref(db, `trivia/${TRV.roomCode}`), snap => {
    if (!snap.exists()) return;
    const room = snap.val();

    // Update scores display
    TRV.scores = room.scores || [0,0];
    document.getElementById('trv-p1-score').textContent = TRV.scores[0];
    document.getElementById('trv-p2-score').textContent = TRV.scores[1];

    // Game over
    if (room.status === 'gameover') {
      unsub();
      TRV.unsubs = TRV.unsubs.filter(u=>u!==unsub);
      trvShowResults(room.scores);
      return;
    }

    // Question advanced — render new question
    if (room.currentQ !== TRV.currentQ) {
      TRV.currentQ = room.currentQ;
      TRV.myNextReady = false;
      trvRenderGame();
      return;
    }

    // Both answers in — reveal
    const p1ans = room.p1 ? room.p1.answer : -1;
    const p2ans = room.p2 ? room.p2.answer : -1;
    if (p1ans !== -1 && p2ans !== -1 && !TRV.revealed) {
      trvReveal(p1ans, p2ans);
    }

    // Show opponent's "answered" status before reveal
    const oppKey = TRV.playerNum === 1 ? 'p2' : 'p1';
    const oppPanel = document.getElementById(TRV.playerNum===1 ? 'trv-p2-panel' : 'trv-p1-panel');
    const oppStatus = document.getElementById(TRV.playerNum===1 ? 'trv-p2-status' : 'trv-p1-status');
    const oppAns = room[oppKey] ? room[oppKey].answer : -1;
    if (oppAns !== -1 && !TRV.revealed) {
      oppPanel.classList.add('answered');
      oppStatus.textContent = '✅ ANSWERED';
    }

    // Show opponent's "ready for next" status after reveal
    if (TRV.revealed) {
      const oppNextReady = room[oppKey] && room[oppKey].nextReady;
      if (oppNextReady && !TRV.myNextReady) {
        const msg = document.getElementById('trv-status-msg');
        const currentText = msg.textContent;
        if (!currentText.includes('opponent is ready')) {
          msg.textContent = currentText + ' — opponent is ready!';
        }
      }
      // If both nextReady flags set and we are host, advance now
      // (catches the case where guest clicked next first)
      if (TRV.playerNum === 1 && TRV.myNextReady) {
        const p1ready = room.p1 && room.p1.nextReady;
        const p2ready = room.p2 && room.p2.nextReady;
        if (p1ready && p2ready) {
          trvAdvanceQuestion(room);
        }
      }
    }

    // Abandoned check
    if (room.abandoned) {
      unsub();
      TRV.unsubs = TRV.unsubs.filter(u=>u!==unsub);
      return;
    }
  });
  TRV.unsubs.push(unsub);
  // Watch for opponent leaving
  const abandonUnsub = watchForAbandoned(`trivia/${TRV.roomCode}`, () => {
    showAbandonedNotice(() => triviaLeave());
  });
  TRV.unsubs.push(abandonUnsub);
  // Start chat + header leave btn
  chatInit('trivia', `chat/trivia_${TRV.roomCode}`, TRV.myName);
  showHeaderLeave('trivia');
}

function trvShowResults(scores) {
  TRV.unsubs.forEach(u=>typeof u==='function'&&u()); TRV.unsubs=[];
  const s0 = scores[0], s1 = scores[1];
  const p1name = TRV.playerNum===1 ? TRV.myName : TRV.oppName;
  const p2name = TRV.playerNum===2 ? TRV.myName : TRV.oppName;
  const myScore = scores[TRV.playerNum-1];
  const oppScore = scores[2-TRV.playerNum];
  const won = myScore > oppScore;
  const draw = myScore === oppScore;

  const overlay = document.getElementById('trivia-end-overlay');
  const title = document.getElementById('trv-end-title');
  const msg = document.getElementById('trv-end-msg');

  title.textContent = draw ? 'IT\'S A DRAW!' : (won ? 'VICTORY!' : 'DEFEATED');
  title.className = draw ? '' : (won ? 'win' : 'lose');
  msg.textContent = `${p1name}: ${s0} / ${TRV_TOTAL_QUESTIONS}\n${p2name}: ${s1} / ${TRV_TOTAL_QUESTIONS}`;
  overlay.classList.add('active');
  // Offer high score submit for the local player's score
  if (myScore > 0) setTimeout(() => window.HS?.promptSubmit('trivia', myScore, `${myScore}/${TRV_TOTAL_QUESTIONS}`), 500);
}

window.triviaPlayAgain = async function() {
  document.getElementById('trivia-end-overlay').classList.remove('active');
  if (TRV.playerNum === 1) {
    // Host resets the game
    const questions = trvShuffleQuestions();
    await set(ref(db, `trivia/${TRV.roomCode}`), {
      status: 'playing',
      p1: { name: TRV.myName, answer: -1, nextReady: false },
      p2: { name: TRV.oppName, answer: -1, nextReady: false },
      scores: [0,0],
      currentQ: 0,
      questions: questions.map(q=>({ cat:q.cat, q:q.q, a:q.a, correct:q.correct })),
    });
  }
  // Both players re-enter game view
  if (TRV.playerNum !== 1) {
    // Guest: wait for host's fresh questions to be written
    for (let attempts = 0; attempts < 20; attempts++) {
      const snap = await get(ref(db, `trivia/${TRV.roomCode}/currentQ`));
      const qsnap = await get(ref(db, `trivia/${TRV.roomCode}/questions`));
      if (snap.exists() && snap.val() === 0 && qsnap.exists()) break;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  await trvStartGame();
};

window.triviaLeave = function() {
  TRV.unsubs.forEach(u=>typeof u==='function'&&u()); TRV.unsubs=[];
  if (!TRV.isLocal) { chatDestroy('trivia'); hideHeaderLeave(); }
  document.getElementById('trivia-end-overlay').classList.remove('active');
  // Restore UI overrides set during solo mode
  document.getElementById('trv-p2-panel').style.display = '';
  document.getElementById('trv-p1-panel').style.flex = '';
  const vsEl = document.querySelector('#trivia-screen .trv-scoreboard > div:nth-child(2)');
  if (vsEl) vsEl.style.display = '';
  document.getElementById('chat-trivia').style.display = '';
  TRV.isLocal = false;
  backToGameSelect();
};

// ── SOLO TRIVIA ────────────────────────────────────────────────────────────────
window.triviaSoloStart = function() {
  const name = (document.getElementById('trivia-solo-player-name').value.trim().toUpperCase() || 'PLAYER');
  TRV.isLocal  = true;
  TRV.playerNum = 1;
  TRV.myName   = name;
  TRV.oppName  = '';
  TRV.scores   = [0, 0];
  TRV.currentQ = 0;
  TRV.questions = trvShuffleQuestions();
  TRV.myAnswer  = null;
  TRV.oppAnswer = null;
  TRV.revealed  = false;
  TRV.myNextReady = false;
  TRV.unsubs.forEach(u=>typeof u==='function'&&u()); TRV.unsubs=[];

  // Adapt UI for solo: hide opponent panel, show score as fraction
  document.getElementById('trv-p2-panel').style.display = 'none';
  document.getElementById('trv-p1-panel').style.flex = '1';
  const vsEl = document.querySelector('#trivia-screen .trv-scoreboard > div:nth-child(2)');
  if (vsEl) vsEl.style.display = 'none';
  document.getElementById('chat-trivia').style.display = 'none';
  document.getElementById('main-subtitle').textContent = 'SOLO GENERAL KNOWLEDGE';

  trvSoloRenderGame();
  showScreen('trivia-screen');
};

function trvSoloRenderGame() {
  const q = TRV.questions[TRV.currentQ];

  document.getElementById('trv-p1-name').textContent  = TRV.myName;
  document.getElementById('trv-p1-score').textContent = TRV.scores[0];
  document.getElementById('trv-round-info').textContent = `Q ${TRV.currentQ+1}/${TRV_TOTAL_QUESTIONS}`;
  document.getElementById('trv-p1-panel').classList.remove('answered','active-player');
  document.getElementById('trv-p1-panel').classList.add('active-player');
  document.getElementById('trv-p1-status').textContent = '';

  document.getElementById('trv-category').textContent   = q.cat;
  document.getElementById('trv-question').textContent   = q.q;

  const container = document.getElementById('trv-answers');
  container.innerHTML = '';
  const letters = ['A','B','C','D'];
  q.a.forEach((ans, i) => {
    const btn = document.createElement('button');
    btn.className = 'trv-answer-btn';
    btn.innerHTML = `<span class="trv-answer-letter">${letters[i]}</span>${ans}`;
    btn.onclick = () => trvSoloSelectAnswer(i);
    container.appendChild(btn);
  });

  document.getElementById('trv-status-msg').textContent = 'Choose your answer—';
  document.getElementById('trv-status-msg').className = 'trv-status-msg';
  document.getElementById('trv-next-btn').classList.remove('visible');
  TRV.myAnswer = null;
  TRV.revealed = false;
}

function trvSoloSelectAnswer(idx) {
  if (TRV.myAnswer !== null || TRV.revealed) return;
  TRV.revealed = true;
  TRV.myAnswer = idx;
  const q = TRV.questions[TRV.currentQ];
  const correct = q.correct;
  const isCorrect = idx === correct;

  const btns = document.querySelectorAll('.trv-answer-btn');
  btns.forEach((b,i) => {
    b.disabled = true;
    if (i === correct) b.classList.add('correct');
    else if (i === idx && !isCorrect) b.classList.add('wrong');
  });

  if (isCorrect) {
    TRV.scores[0]++;
    document.getElementById('trv-p1-score').textContent = TRV.scores[0];
    document.getElementById('trv-p1-status').textContent = '✅ CORRECT';
    document.getElementById('trv-p1-panel').classList.add('answered');
  } else {
    document.getElementById('trv-p1-status').textContent = '❌ WRONG';
  }

  const msg = document.getElementById('trv-status-msg');
  msg.textContent = isCorrect ? '✅ CORRECT!' : `❌ Wrong — Correct: ${q.a[correct]}`;
  msg.className = 'trv-status-msg' + (isCorrect ? ' reveal' : '');

  const nextBtn = document.getElementById('trv-next-btn');
  nextBtn.textContent = TRV.currentQ + 1 < TRV_TOTAL_QUESTIONS ? 'NEXT QUESTION ▶' : 'SEE RESULTS ▶';
  nextBtn.classList.add('visible');
  nextBtn.onclick = trvSoloNext;
}

function trvSoloNext() {
  TRV.currentQ++;
  if (TRV.currentQ >= TRV_TOTAL_QUESTIONS) {
    trvSoloShowResults();
  } else {
    trvSoloRenderGame();
  }
}

function trvSoloShowResults() {
  const score = TRV.scores[0];
  const overlay = document.getElementById('trivia-end-overlay');
  const title   = document.getElementById('trv-end-title');
  const msg     = document.getElementById('trv-end-msg');

  let grade = score >= 9 ? '🏆 OUTSTANDING!' : score >= 7 ? '🎉 GREAT SCORE!' : score >= 5 ? '👍 NOT BAD!' : '📚 KEEP PRACTISING!';
  title.textContent = grade;
  title.className = score >= 7 ? 'win' : '';
  msg.textContent = `${TRV.myName}: ${score} / ${TRV_TOTAL_QUESTIONS}`;
  overlay.classList.add('active');

  // Swap play again button to solo replay
  document.getElementById('trv-end-title').textContent = grade;
  const playAgainBtn = overlay.querySelector('.btn.solid');
  playAgainBtn.onclick = triviaSoloPlayAgain;

  if (score > 0) setTimeout(() => window.HS?.promptSubmit('trivia', score, `${score}/${TRV_TOTAL_QUESTIONS}`), 500);
}

window.triviaSoloPlayAgain = function() {
  document.getElementById('trivia-end-overlay').classList.remove('active');
  TRV.scores   = [0, 0];
  TRV.currentQ = 0;
  TRV.questions = trvShuffleQuestions();
  trvSoloRenderGame();
};

// Patch selectGame to handle trivia-solo
const _origSelectGame = window.selectGame;
window.selectGame = function(game) {
  if (game === 'trivia-solo') {
    // Reset solo UI overrides from previous sessions
    document.getElementById('trv-p2-panel').style.display = '';
    document.getElementById('trv-p1-panel').style.flex = '';
    const vsEl = document.querySelector('#trivia-screen .trv-scoreboard > div:nth-child(2)');
    if (vsEl) vsEl.style.display = '';
    document.getElementById('chat-trivia').style.display = '';
    TRV.isLocal = false;
    showScreen('trivia-solo-lobby-screen');
    return;
  }
  _origSelectGame(game);
};

// ?? Launch from shared lobby ???????????????????????????????????
function triviaLaunchFromLobby(isHost, myName, oppName, gameCode) {
  TRV.roomCode = gameCode;
  TRV.playerNum = isHost ? 1 : 2;
  TRV.myName = myName;
  TRV.oppName = oppName;
  TRV.unsubs.forEach(u=>typeof u==='function'&&u()); TRV.unsubs=[];

  document.getElementById('main-subtitle').textContent = '2-PLAYER GENERAL KNOWLEDGE';
  document.getElementById('header-room-code').textContent = gameCode;
  document.getElementById('room-code-display').style.display = '';

  if (isHost) {
    const questions = trvShuffleQuestions();
    set(ref(db, `trivia/${gameCode}`), {
      status: 'playing',
      p1: { name: myName, answer: -1, nextReady: false },
      p2: { name: oppName, answer: -1, nextReady: false },
      scores: [0,0],
      currentQ: 0,
      questions: questions.map(q=>({ cat:q.cat, q:q.q, a:q.a, correct:q.correct })),
    }).then(() => trvStartGame());
  } else {
    // Guest: wait for host's game data to be written before starting
    // Poll until questions are present in Firebase
    const waitForQuestions = async () => {
      for (let attempts = 0; attempts < 20; attempts++) {
        const snap = await get(ref(db, `trivia/${gameCode}/questions`));
        if (snap.exists() && snap.val() && snap.val().length > 0) {
          trvStartGame();
          return;
        }
        await new Promise(r => setTimeout(r, 300));
      }
      trvStartGame(); // fallback after timeout
    };
    waitForQuestions();
  }
}


// ============================================================
// SOLITAIRE ENGINE (Klondike)
// ============================================================
const SOL = {
  stock: [], waste: [],
  foundations: [[],[],[],[]],
  tableau: [[],[],[],[],[],[],[]],
  moves: 0,
  score: 0,
  startTime: 0,
  selected: null,  // {source, idx, cards}
};

const SUITS = ['\u2660','\u2663','\u2665','\u2666'];
const SUIT_COLOR = {'\u2660':'black','\u2663':'black','\u2665':'red','\u2666':'red'};
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VAL = Object.fromEntries(RANKS.map((r,i)=>[r,i+1]));

function solBuildDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, faceUp: false });
  // Shuffle
  for (let i = deck.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [deck[i],deck[j]] = [deck[j],deck[i]];
  }
  return deck;
}

