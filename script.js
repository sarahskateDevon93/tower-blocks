// --- PROFILO & CLASSIFICA ---
let selectedAvatar = localStorage.getItem('tower_avatar') || '🤖';
let currentUser = {
  nickname: localStorage.getItem('tower_nickname') || '',
  avatar: selectedAvatar
};

window.addEventListener('DOMContentLoaded', () => {
  if (!currentUser.nickname) {
    openModal('profileModal');
  } else {
    updateProfileUI();
  }
  updateLeaderboardUI();
  initEngine();
});

function updateProfileUI() {
  const btn = document.getElementById('profileBtn');
  if (btn) {
    btn.innerHTML = currentUser.nickname ? `${currentUser.avatar} ${currentUser.nickname}` : '👤 Profile';
  }
  const nickInput = document.getElementById('userNickname');
  if (nickInput) nickInput.value = currentUser.nickname;
  
  document.querySelectorAll('.avatar-item').forEach(el => {
    el.classList.toggle('selected', el.textContent === currentUser.avatar);
  });
}

function openModal(id) {
  if (id === 'profileModal') {
    const nickInput = document.getElementById('userNickname');
    if (nickInput) nickInput.value = currentUser.nickname;
  }
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
}

function selectAvatar(emoji, element) {
  selectedAvatar = emoji;
  document.querySelectorAll('.avatar-item').forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');
}

function saveProfile() {
  const nickInput = document.getElementById('userNickname');
  const nick = nickInput ? nickInput.value.trim() : '';
  if (!nick) {
    alert('Please enter a valid nickname!');
    return;
  }
  currentUser.nickname = nick;
  currentUser.avatar = selectedAvatar;
  localStorage.setItem('tower_nickname', nick);
  localStorage.setItem('tower_avatar', selectedAvatar);
  updateProfileUI();
  closeModal('profileModal');
}

function saveScore(score) {
  if (!currentUser.nickname || score <= 0) return;
  let scores = JSON.parse(localStorage.getItem('tower_leaderboard') || '[]');
  scores.push({ nickname: currentUser.nickname, avatar: currentUser.avatar, score: score });
  scores.sort((a, b) => b.score - a.score);
  scores = scores.slice(0, 10);
  localStorage.setItem('tower_leaderboard', JSON.stringify(scores));
  updateLeaderboardUI();
}

function updateLeaderboardUI() {
  const listEl = document.getElementById('leaderboardList');
  if (!listEl) return;
  const scores = JSON.parse(localStorage.getItem('tower_leaderboard') || '[]');
  if (scores.length === 0) {
    listEl.innerHTML = '<p style="text-align:center; color:#666">No scores yet!</p>';
    return;
  }
  listEl.innerHTML = scores.map(s => `
    <div class="leaderboard-row">
      <span>${s.avatar} ${s.nickname}</span>
      <span><strong>${s.score} Pts</strong></span>
    </div>
  `).join('');
}

// --- SUONI SICURI (WEB AUDIO API) ---
let audioCtx = null;
function playSound(freq, duration = 0.15, type = 'sine') {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Ignora errori audio
  }
}

// --- MOTORE DI GIOCO 3D ---
let scene, camera, renderer, world;
let stack = [];
let overhangs = [];
const boxHeight = 0.6;
const originalSize = 3;
let gameState = 'START';
let score = 0;
let combo = 0;

function initEngine() {
  scene = new THREE.Scene();

  world = new CANNON.World();
  world.gravity.set(0, -10, 0);

  const aspect = window.innerWidth / window.innerHeight;
  const d = 5;
  camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 100);
  camera.position.set(4, 5, 4);
  camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointerdown', handleTap);

  resetGame();
  animate();
}

function getHueColor(index) {
  return new THREE.Color(`hsl(${(index * 12) % 360}, 80%, 60%)`);
}

function addLayer(x, z, width, depth, direction) {
  const y = stack.length * boxHeight;
  const layer = createBox(x, y, z, width, depth, false, getHueColor(stack.length));
  layer.direction = direction;
  stack.push(layer);
}

function createBox(x, y, z, width, depth, falls, color) {
  const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  let body = null;
  if (falls) {
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2));
    body = new CANNON.Body({ mass: 5, shape });
    body.position.set(x, y, z);
    world.addBody(body);
  }

  return { mesh, body, width, depth };
}

function resetGame() {
  stack.forEach(b => scene.remove(b.mesh));
  overhangs.forEach(o => {
    scene.remove(o.mesh);
    if (o.body) world.remove(o.body);
  });
  stack = [];
  overhangs = [];
  score = 0;
  combo = 0;

  const scoreEl = document.getElementById('score-display');
  if (scoreEl) scoreEl.innerText = '0';
  
  const startScreen = document.getElementById('start-screen');
  if (startScreen) startScreen.style.display = 'flex';
  
  const gameOverScreen = document.getElementById('game-over-screen');
  if (gameOverScreen) gameOverScreen.style.display = 'none';

  addLayer(0, 0, originalSize, originalSize, 'x');
  addLayer(-5, 0, originalSize, originalSize, 'x');

  camera.position.set(4, 5, 4);
  camera.lookAt(0, 0, 0);
  gameState = 'START';
}

function handleTap(e) {
  if (e.target.closest('.gui-overlay') || e.target.closest('.gui-modal') || e.target.closest('#game-over-screen')) {
    return;
  }

  if (gameState === 'START') {
    gameState = 'PLAYING';
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    return;
  }

  if (gameState === 'PLAYING') {
    splitTopBlock();
  }
}

function splitTopBlock() {
  const topLayer = stack[stack.length - 1];
  const prevLayer = stack[stack.length - 2];
  const direction = topLayer.direction;

  const delta = topLayer.mesh.position[direction] - prevLayer.mesh.position[direction];
  const overhangSize = Math.abs(delta);
  const size = direction === 'x' ? topLayer.width : topLayer.depth;
  const overlap = size - overhangSize;

  if (overlap > 0) {
    let newWidth = topLayer.width;
    let newDepth = topLayer.depth;

    if (direction === 'x') newWidth = overlap;
    else newDepth = overlap;

    topLayer.width = newWidth;
    topLayer.depth = newDepth;

    if (overhangSize < 0.