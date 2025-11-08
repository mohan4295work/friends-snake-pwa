
// Friends Snake - single-file game engine
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const musicToggle = document.getElementById('musicToggle');
const sfxToggle = document.getElementById('sfxToggle');
const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speedLevel');
const lenEl = document.getElementById('len');
const statusEl = document.getElementById('status');

const TILE = 20;
const COLS = canvas.width / TILE;
const ROWS = canvas.height / TILE;

let running = false;
let tickInterval = 120;
let tickTimer = null;

// Sound via WebAudio (no external file)
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let musicGain = null;
let sfxGain = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    musicGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();
    musicGain.gain.value = 0.12;
    sfxGain.gain.value = 0.6;
    musicGain.connect(audioCtx.destination);
    sfxGain.connect(audioCtx.destination);
    startBackgroundMusic();
  }
}

function startBackgroundMusic(){
  if (!audioCtx) return;
  // simple repeating arpeggio with noise pad
  const now = audioCtx.currentTime;
  // pad
  const pad = audioCtx.createOscillator();
  const padGain = audioCtx.createGain();
  pad.type = 'sine';
  pad.frequency.value = 110;
  padGain.gain.value = 0.02;
  pad.connect(padGain); padGain.connect(musicGain);
  pad.start(now);
  pad.stop(now + 20); // short life; restarted on next call

  // arpeggio
  const notes = [220, 277.18, 329.63, 196];
  notes.forEach((n,i)=>{
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = i%2===0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(n, now + i*0.25);
    g.gain.setValueAtTime(0.08, now + i*0.25);
    g.gain.exponentialRampToValueAtTime(0.001, now + i*0.25 + 0.22);
    osc.connect(g); g.connect(musicGain);
    osc.start(now + i*0.25);
    osc.stop(now + i*0.25 + 0.24);
  });

  // loop restart
  setTimeout(()=> {
    if (musicToggle.checked) startBackgroundMusic();
  }, 1000);
}

function playSfx(type='blip'){
  if (!audioCtx || !sfxToggle.checked) return;
  const now = audioCtx.currentTime;
  if (type==='eat'){
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square'; o.frequency.value = 660;
    g.gain.value = 0.25;
    o.connect(g); g.connect(sfxGain);
    g.gain.exponentialRampToValueAtTime(0.001, now+0.15);
    o.start(now); o.stop(now+0.15);
  } else if (type==='power'){
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 300;
    g.gain.value = 0.18;
    o.connect(g); g.connect(sfxGain);
    g.gain.exponentialRampToValueAtTime(0.001, now+0.28);
    o.start(now); o.stop(now+0.28);
  } else {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g); g.connect(sfxGain);
    g.gain.exponentialRampToValueAtTime(0.001, now+0.1);
    o.start(now); o.stop(now+0.1);
  }
}

// Game state
let snake = [{x:Math.floor(COLS/2), y:Math.floor(ROWS/2)}];
let dir = {x:1,y:0};
let pendingDir = null;
let food = null;
let friends = []; // little friend sprites (just colors)
let obstacles = [];
let powerups = [];
let score = 0;
let speedLevel = 1;
let invincibleUntil = 0;

// friends palette (theme)
const friendsPalette = ['#ff6b6b','#4ecdc4','#ffd166','#5f27cd'];

// utilities
function randCell(){return {x:Math.floor(Math.random()*COLS), y:Math.floor(Math.random()*ROWS)}}
function sameCell(a,b){return a.x===b.x && a.y===b.y}
function inBounds(c){return c.x>=0 && c.x<COLS && c.y>=0 && c.y<ROWS}

// spawn
function placeFood(){
  let tries=0;
  while(tries<200){
    const f=randCell();
    if (collidesWithAll(f)) { tries++; continue; }
    food=f; return;
  }
}
function collidesWithAll(c){
  if (snake.some(s=>sameCell(s,c))) return true;
  if (obstacles.some(o=>sameCell(o,c))) return true;
  if (powerups.some(p=>sameCell(p,c))) return true;
  if (food && sameCell(food,c)) return true;
  return false;
}
function spawnObstacles(n=6){
  obstacles=[];
  for(let i=0;i<n;i++){
    let o=randCell();
    if (collidesWithAll(o)) { i--; continue; }
    obstacles.push(o);
  }
}
function spawnPowerups(){
  powerups=[];
  const types=['grow','speed','shield','score'];
  for(let i=0;i<3;i++){
    let p=randCell();
    if (collidesWithAll(p)) { i--; continue; }
    p.type = types[Math.floor(Math.random()*types.length)];
    powerups.push(p);
  }
}

// input
window.addEventListener('keydown', e=>{
  const k=e.key;
  if (k==='ArrowUp' || k==='w') pendingDir={x:0,y:-1};
  if (k==='ArrowDown' || k==='s') pendingDir={x:0,y:1};
  if (k==='ArrowLeft' || k==='a') pendingDir={x:-1,y:0};
  if (k==='ArrowRight' || k==='d') pendingDir={x:1,y:0};
  if (k===' '){ togglePause(); }
});

// game loop
function start(){
  ensureAudio();
  running=true;
  tickInterval = Math.max(40, 140 - (speedLevel-1)*10);
  statusEl.textContent='Running';
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, tickInterval);
}
function stop(){
  running=false;
  if (tickTimer) { clearInterval(tickTimer); tickTimer=null; }
  statusEl.textContent='Paused';
}

function reset(){
  snake = [{x:Math.floor(COLS/2), y:Math.floor(ROWS/2)}];
  dir = {x:1,y:0};
  pendingDir=null;
  score=0; speedLevel=1; invincibleUntil=0;
  obstacles=[]; powerups=[];
  spawnObstacles(8);
  spawnPowerups();
  placeFood();
  friends = [];
  updateHUD();
}

function togglePause(){ if (running) { stop(); } else start(); }

startBtn.addEventListener('click', ()=> { reset(); start(); });
pauseBtn.addEventListener('click', ()=> togglePause());

musicToggle.addEventListener('change', ()=> {
  if (musicGain) musicGain.gain.value = musicToggle.checked ? 0.12 : 0;
  if (musicToggle.checked && audioCtx) startBackgroundMusic();
});
sfxToggle.addEventListener('change', ()=> { if (sfxGain) sfxGain.gain.value = sfxToggle.checked ? 0.6 : 0; });

// tick - update game state
function tick(){
  // update direction safely (prevent 180 turns)
  if (pendingDir){
    if (!(pendingDir.x === -dir.x && pendingDir.y === -dir.y)) {
      dir = pendingDir;
    }
    pendingDir = null;
  }

  const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};

  // wrap around edges
  if (head.x < 0) head.x = COLS-1;
  if (head.x >= COLS) head.x = 0;
  if (head.y < 0) head.y = ROWS-1;
  if (head.y >= ROWS) head.y = 0;

  // collisions
  if (!isInvincible()){
    // hit self?
    if (snake.slice(1).some(s=>sameCell(s,head))){
      gameOver();
      return;
    }
    // hit obstacle?
    if (obstacles.some(o=>sameCell(o,head))){
      gameOver();
      return;
    }
  }

  snake.unshift(head);

  // eat food
  if (food && sameCell(head, food)){
    score += 10 * (isScoreMultiplier() ? 2 : 1);
    playSfx('eat');
    // add friend (the segment gets a color from palette)
    friends.push({pos:{...head}, color: friendsPalette[Math.floor(Math.random()*friendsPalette.length)]});
    // place new food and maybe spawn a powerup
    placeFood();
    if (Math.random() < 0.4) spawnPowerups();
    // small chance obstacle spawn
    if (Math.random() < 0.35) spawnObstacles(obstacles.length + 1);
  } else {
    snake.pop();
  }

  // powerups pickup
  for(let i=powerups.length-1;i>=0;i--){
    if (sameCell(head, powerups[i])){
      const p = powerups.splice(i,1)[0];
      applyPowerup(p.type);
      playSfx('power');
    }
  }

  // speed influence
  tickInterval = Math.max(30, 140 - (speedLevel-1)*10);
  if (tickTimer) { clearInterval(tickTimer); tickTimer = setInterval(tick, tickInterval); }

  updateHUD();
  render();
}

function applyPowerup(type){
  if (type==='grow'){ // immediate grow
    for(let i=0;i<3;i++){ snake.push({...snake[snake.length-1]}); }
    score += 5;
  } else if (type==='speed'){
    speedLevel = Math.min(10, speedLevel+2);
    setTimeout(()=>{ speedLevel = Math.max(1, speedLevel-2); }, 7000);
  } else if (type==='shield'){
    invincibleUntil = Date.now() + 8000;
  } else if (type==='score'){
    // temporary double score
    powerups.push({x:-1,y:-1,type:'scoring_temp'}); // hacky marker
    setTimeout(()=>{ /* ends */ }, 7000);
    window._scoreMultiplier = Date.now() + 7000;
  }
}

function isInvincible(){ return Date.now() < invincibleUntil; }
function isScoreMultiplier(){ return window._scoreMultiplier && Date.now() < window._scoreMultiplier; }

function gameOver(){
  playSfx('blip');
  statusEl.textContent = 'Game Over — Press Start';
  running=false;
  if (tickTimer){ clearInterval(tickTimer); tickTimer=null; }
}

// render
function render(){
  // background
  ctx.fillStyle = '#02111b';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // grid (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for(let x=0;x<COLS;x++){
    ctx.beginPath(); ctx.moveTo(x*TILE,0); ctx.lineTo(x*TILE,canvas.height); ctx.stroke();
  }
  for(let y=0;y<ROWS;y++){
    ctx.beginPath(); ctx.moveTo(0,y*TILE); ctx.lineTo(canvas.width,y*TILE); ctx.stroke();
  }

  // obstacles
  obstacles.forEach(o=>{
    ctx.fillStyle = '#7b8a95';
    ctx.fillRect(o.x*TILE+2, o.y*TILE+2, TILE-4, TILE-4);
    // add crack
    ctx.strokeStyle = '#47525a'; ctx.beginPath();
    ctx.moveTo(o.x*TILE+4, o.y*TILE+TILE-6); ctx.lineTo(o.x*TILE+TILE-6, o.y*TILE+4);
    ctx.stroke();
  });

  // powerups
  powerups.forEach(p=>{
    if (p.type==='grow'){ drawStar(p.x, p.y, '#ffd166'); }
    if (p.type==='speed'){ drawStar(p.x, p.y, '#ff6b6b'); }
    if (p.type==='shield'){ drawStar(p.x, p.y, '#4ecdc4'); }
    if (p.type==='score'){ drawStar(p.x, p.y, '#5f27cd'); }
  });

  // food
  if (food){
    // draw as small gift box (friends theme)
    const x = food.x*TILE, y = food.y*TILE;
    ctx.fillStyle = '#ff6b6b'; ctx.fillRect(x+4,y+4,TILE-8,TILE-8);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(x+Math.floor(TILE/2)-2,y+3,4,TILE-6);
    ctx.fillRect(x+3,y+Math.floor(TILE/2)-2,TILE-6,4);
  }

  // snake body with friends colours
  for(let i=snake.length-1;i>=0;i--){
    const s = snake[i];
    const px = s.x*TILE, py=s.y*TILE;
    const color = friendsPalette[i % friendsPalette.length];
    ctx.fillStyle = color;
    ctx.fillRect(px+2,py+2,TILE-4,TILE-4);
    if (i===0){
      // head highlight
      ctx.strokeStyle = '#ffffff55'; ctx.strokeRect(px+2,py+2,TILE-4,TILE-4);
    }
  }

  // friends floating (visual only)
  friends.forEach((f,idx)=>{
    const p = f.pos;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc((p.x+0.5)*TILE, (p.y+0.5)*TILE - (idx%3), TILE/5, 0, Math.PI*2);
    ctx.fill();
  });

  // HUD overlay for invincibility
  if (isInvincible()){
    ctx.fillStyle = 'rgba(255, 209, 102, 0.06)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }
}

function drawStar(cx, cy, color){
  const x = cx*TILE, y = cy*TILE;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x+TILE/2, y+4);
  ctx.lineTo(x+TILE-4, y+TILE/2);
  ctx.lineTo(x+TILE/2, y+TILE-4);
  ctx.lineTo(x+4, y+TILE/2);
  ctx.closePath();
  ctx.fill();
}

function updateHUD(){
  scoreEl.textContent = score;
  speedEl.textContent = speedLevel;
  lenEl.textContent = snake.length;
}

// initial population
reset();
render();

// tiny help: touch controls
let touchStart = null;
canvas.addEventListener('touchstart', (e)=>{
  const t = e.touches[0];
  touchStart = {x:t.clientX, y:t.clientY};
});
canvas.addEventListener('touchend', (e)=>{
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  if (Math.abs(dx) > Math.abs(dy)){
    pendingDir = dx>0 ? {x:1,y:0} : {x:-1,y:0};
  } else {
    pendingDir = dy>0 ? {x:0,y:1} : {x:0,y:-1};
  }
  touchStart = null;
});
