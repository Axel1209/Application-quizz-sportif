// Prototype de simulation de tournoi
// Charge questions depuis questions.json (fichier local) via fetch.
// Logique : bracket single-elimination. Le joueur "Toi" est toujours présent et commence en position 0.
// Seuil de qualification : >69%

const THRESHOLD = 0.69; // strictement supérieur
let questionsPool = [];
let players = [];
let bracket = [];
let currentMatch = null;
let historyEl = document.getElementById('history');
let bracketEl = document.getElementById('bracket');
let matchArea = document.getElementById('matchArea');
let matchTitle = document.getElementById('matchTitle');
let questionText = document.getElementById('questionText');
let answersEl = document.getElementById('answers');
let progressEl = document.getElementById('progress');
let matchResult = document.getElementById('matchResult');
let nextMatchBtn = document.getElementById('nextMatchBtn');

document.getElementById('startBtn').addEventListener('click', startTournament);
nextMatchBtn.addEventListener('click', runNextMatch);

fetch('questions.json')
  .then(r => r.json())
  .then(data => { questionsPool = data; })
  .catch(err => {
    console.warn('Impossible de charger questions.json, utilisation d\'un pool réduit intégré.');
    // fallback minimal
    questionsPool = [
      {id:1,difficulty:1,question:"Quel tournoi se joue sur terre battue ?",choices:["Wimbledon","Roland-Garros","US Open","Australian Open"],answer:1}
    ];
  });

function startTournament() {
  const n = parseInt(document.getElementById('playersCount').value,10) || 8;
  players = generatePlayers(n);
  bracket = buildBracket(players);
  renderBracket();
  clearHistory();
  // commencer le premier match
  runNextMatch();
}

function generatePlayers(n) {
  const baseNames = ['Toi','A.Kova','B.Rossi','C.Smith','D.NadalFan','E.Muller','F.Ito','G.Perez','H.Lee','I.Kim','J.Ochoa','K.Popov','L.Garcia','M.Santos','N.Harris','O.Zhou'];
  const players = [];
  for (let i=0;i<n;i++) {
    players.push({
      id: i,
      name: baseNames[i % baseNames.length] + (i===0 ? '' : ` #${i}`),
      skill: randBetween(0.45, 0.95) // CPU skill baseline (probabilité de succès sur diff facile)
    });
  }
  // ensure "Toi" is player 0
  players[0].name = 'Toi';
  players[0].skill = 0.85; // joueur humain virtuel: sa "skill" n'est pas utilisé (tu réponds)
  return players;
}

function buildBracket(players) {
  // Bracket represented as array of rounds, each round is array of matches [ {a,b,winner} ]
  let roundPlayers = players.slice();
  const rounds = [];
  while (roundPlayers.length > 1) {
    const matches = [];
    for (let i=0;i<roundPlayers.length;i+=2) {
      matches.push({ a: roundPlayers[i], b: roundPlayers[i+1], winner: null });
    }
    rounds.push(matches);
    // placeholder winners array for next round
    roundPlayers = new Array(matches.length).fill(null).map((_,i)=>({id:`winner-r${rounds.length}-${i}`, name:`Winner ${i}`}))
  }
  return rounds;
}

function renderBracket() {
  bracketEl.innerHTML = '';
  bracket.forEach((round, idx) => {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'round';
    const title = document.createElement('div');
    title.innerHTML = `<strong>Tour ${idx+1}</strong>`;
    roundDiv.appendChild(title);
    round.forEach((m,i) => {
      const p = document.createElement('div');
      p.className = 'player';
      p.textContent = `${m.a.name} vs ${m.b.name}`;
      roundDiv.appendChild(p);
    });
    bracketEl.appendChild(roundDiv);
  });
}

function clearHistory() {
  historyEl.innerHTML = '';
}

function logLine(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} - ${text}`;
  historyEl.prepend(li);
}

/* Match flow controller:
   - Find next unresolved match in first round with null winner.
   - Present questions for the human player if they are in that match, otherwise simulate CPU vs CPU.
   - After match result, write winner into match and prepare winner object for next round.
*/
function runNextMatch() {
  matchResult.classList.add('hidden');
  nextMatchBtn.classList.add('hidden');

  const next = findNextMatch();
  if (!next) {
    // tournoi terminé
    const champ = findChampion();
    matchArea.classList.add('hidden');
    renderChampion(champ);
    return;
  }
  currentMatch = next;
  // determine round number (index in bracket)
  const roundIndex = next.roundIndex;
  const matchIndex = next.matchIndex;
  const match = bracket[roundIndex][matchIndex];
  matchArea.classList.remove('hidden');
  matchTitle.textContent = `Tour ${roundIndex+1} - Match: ${match.a.name} vs ${match.b.name}`;

  // difficulty scaling : plus le round est élevé, plus il y a de questions et plus on monte en difficulté
  const difficultyLevel = Math.min(3, roundIndex + 1); // 1..3
  const nQuestions = 3 + roundIndex * 2; // ex: 3,5,7,...

  // if human is present -> ask questions to human; otherwise simulate CPU vs CPU
  if (match.a.name === 'Toi' || match.b.name === 'Toi') {
    startHumanMatch(match, difficultyLevel, nQuestions, roundIndex, matchIndex);
  } else {
    simulateCPUMatch(match, difficultyLevel, nQuestions, roundIndex, matchIndex);
  }
}

function findNextMatch() {
  for (let r=0;r<bracket.length;r++) {
    for (let m=0;m<bracket[r].length;m++) {
      if (!bracket[r][m].winner) {
        return { roundIndex: r, matchIndex: m, match: bracket[r][m] };
      }
    }
  }
  return null;
}

function startHumanMatch(match, difficultyLevel, nQuestions, roundIndex, matchIndex) {
  const qs = sampleQuestions(difficultyLevel, nQuestions);
  let idx = 0;
  let correct = 0;

  progressEl.textContent = `Question ${idx+1}/${qs.length}`;
  showQuestion(qs[idx]);

  function showQuestion(q) {
    questionText.textContent = q.question;
    answersEl.innerHTML = '';
    q.choices.forEach((c,ci) => {
      const btn = document.createElement('button');
      btn.textContent = c;
      btn.addEventListener('click', () => {
        const ok = ci === q.answer;
        if (ok) correct++;
        idx++;
        progressEl.textContent = `Question ${Math.min(idx+1, qs.length)}/${qs.length}`;
        if (idx < qs.length) {
          showQuestion(qs[idx]);
        } else {
          // finish
          const pct = correct / qs.length;
          const humanWon = pct > THRESHOLD;
          const humanName = (match.a.name==='Toi') ? match.a : match.b;
          const other = (match.a.name==='Toi') ? match.b : match.a;
          if (humanWon) {
            finishMatch(match, humanName, roundIndex, matchIndex, `Toi a obtenu ${Math.round(pct*100)}% (${correct}/${qs.length}) — QUALIFIÉ`);
          } else {
            finishMatch(match, other, roundIndex, matchIndex, `Toi a obtenu ${Math.round(pct*100)}% (${correct}/${qs.length}) — ÉLIMINÉ`);
          }
        }
      });
      answersEl.appendChild(btn);
    });
  }
}

function simulateCPUMatch(match, difficultyLevel, nQuestions, roundIndex, matchIndex) {
  const qs = sampleQuestions(difficultyLevel, nQuestions);
  const chanceA = match.a.skill * (1 - (difficultyLevel-1)*0.12);
  const chanceB = match.b.skill * (1 - (difficultyLevel-1)*0.12);
  const correctA = binomialSim(nQuestions, chanceA);
  const correctB = binomialSim(nQuestions, chanceB);
  const pctA = correctA / nQuestions;
  const pctB = correctB / nQuestions;
  let winner = null;
  if (pctA > THRESHOLD && pctB <= THRESHOLD) winner = match.a;
  else if (pctB > THRESHOLD && pctA <= THRESHOLD) winner = match.b;
  else if (pctA > THRESHOLD && pctB > THRESHOLD) winner = pctA >= pctB ? match.a : match.b;
  else winner = pctA >= pctB ? match.a : match.b;

  const summary = `${match.a.name} ${Math.round(pctA*100)}% (${correctA}/${nQuestions}) vs ${match.b.name} ${Math.round(pctB*100)}% (${correctB}/${nQuestions}) → Vainqueur: ${winner.name}`;
  setTimeout(() => {
    finishMatch(match, winner, roundIndex, matchIndex, summary);
  }, 600);
}

function finishMatch(match, winnerObj, roundIndex, matchIndex, summaryText) {
  bracket[roundIndex][matchIndex].winner = winnerObj;
  logLine(`Tour ${roundIndex+1} - ${match.a.name} vs ${match.b.name} → ${winnerObj.name} (${summaryText})`);
  matchResult.classList.remove('hidden');
  matchResult.textContent = summaryText;

  const nextRound = roundIndex + 1;
  if (nextRound < bracket.length) {
    const idxNext = Math.floor(matchIndex / 2);
    const slot = (matchIndex % 2 === 0) ? 'a' : 'b';
    const nextMatch = bracket[nextRound][idxNext];
    if (slot === 'a') nextMatch.a = winnerObj;
    else nextMatch.b = winnerObj;
  }
  renderBracket();
  nextMatchBtn.classList.remove('hidden');
  matchArea.scrollIntoView({behavior:'smooth'});
}

function findChampion() {
  const lastRound = bracket[bracket.length -1];
  if (!lastRound || lastRound.length === 0) return null;
  const finalMatch = lastRound[0];
  return finalMatch.winner || finalMatch.a || finalMatch.b;
}

function renderChampion(champ) {
  bracketEl.innerHTML = `<div class="round"><strong>Tournoi terminé</strong><div class="player">Champion : ${champ ? champ.name : '—'}</div></div>`;
  logLine(`Champion: ${champ ? champ.name : '—'}`);
}

function sampleQuestions(difficulty, n) {
  let pool = questionsPool.filter(q => q.difficulty === difficulty);
  if (pool.length < n) {
    pool = questionsPool.filter(q => q.difficulty <= difficulty+1);
  }
  const copy = pool.slice();
  for (let i=copy.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [copy[i],copy[j]] = [copy[j],copy[i]];
  }
  return copy.slice(0,n);
}

function binomialSim(n, p) {
  let correct = 0;
  for (let i=0;i<n;i++) {
    if (Math.random() < p) correct++;
  }
  return correct;
}

function randBetween(a,b) {
  return a + Math.random()*(b-a);
       }
