import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const EYE_HEIGHT = 1.72;
const ARENA_RADIUS = 38;
const PLAYER_RADIUS = 0.55;
const WALK_SPEED = 4.0;
const SPRINT_SPEED = 7.2;
const MAX_STAMINA = 10;
const BOSS_MAX_HEALTH = 175;
const FIRE_INTERVAL = 0.065;
const BOSS_SPEED = 2.65;
const HIT_AIM_DOT = 0.94;

const root = document.getElementById('game-root');
const staminaFill = document.getElementById('stamina-fill');
const staminaSeconds = document.getElementById('stamina-seconds');
const staminaState = document.getElementById('stamina-state');
const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const endOverlay = document.getElementById('end-overlay');
const enterButton = document.getElementById('enter-button');
const resumeButton = document.getElementById('resume-button');
const pauseButton = document.getElementById('pause-button');
const restartButton = document.getElementById('restart-button');
const restartPauseButton = document.getElementById('restart-pause-button');
const userBadge = document.getElementById('user-badge');
const damageVignette = document.getElementById('damage-vignette');
const dangerMessage = document.getElementById('danger-message');
const crosshair = document.getElementById('crosshair');
const bossHealthFill = document.getElementById('boss-health-fill');
const bossHealthText = document.getElementById('boss-health-text');
const hitCount = document.getElementById('hit-count');
const minigunStatus = document.getElementById('minigun-status');
const endKicker = document.getElementById('end-kicker');
const endTitle = document.getElementById('end-title');
const endCopy = document.getElementById('end-copy');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x170707);
scene.fog = new THREE.FogExp2(0x210807, 0.0075);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 500);
camera.position.set(0, EYE_HEIGHT, 24);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = 0.72;
scene.add(camera);

scene.add(new THREE.AmbientLight(0x5f3028, 0.72));
scene.add(new THREE.HemisphereLight(0xffa36f, 0x160706, 0.95));
const fireLight = new THREE.DirectionalLight(0xff7a42, 2.15);
fireLight.position.set(-20, 45, 18);
scene.add(fireLight);

const flashlight = new THREE.SpotLight(0xffd7bc, 58, 72, Math.PI / 5.2, 0.62, 1.3);
flashlight.position.set(0.2, -0.08, 0.08);
flashlight.target.position.set(0, -0.15, -10);
camera.add(flashlight, flashlight.target);

const keys = new Set();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const toBoss = new THREE.Vector3();
const bossTarget = new THREE.Vector3();
const muzzleWorld = new THREE.Vector3();
const tracerEffects = [];
let started = false;
let paused = true;
let ended = false;
let dying = false;
let firing = false;
let lastFrame = performance.now();
let stamina = MAX_STAMINA;
let exhausted = false;
let bobPhase = 0;
let fireAccumulator = 0;
let bossHealth = BOSS_MAX_HEALTH;
let hitsLanded = 0;
let dangerTimer = 0;
let deathElapsed = 0;
let roarTimer = 2.5;
let boss;
let bossParts;

class ArenaAudio {
  constructor() {
    this.context = null;
    this.master = null;
  }
  async start() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.context.destination);
      const drone = this.context.createGain();
      drone.gain.value = 0.035;
      drone.connect(this.master);
      [34, 45, 51].forEach((frequency, index) => {
        const osc = this.context.createOscillator();
        osc.type = index === 1 ? 'sawtooth' : 'sine';
        osc.frequency.value = frequency;
        osc.connect(drone);
        osc.start();
      });
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  pulse(frequency, duration, volume, type = 'square') {
    if (!this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
  shot() {
    this.pulse(88 + Math.random() * 25, 0.045, 0.08, 'square');
    this.pulse(190 + Math.random() * 70, 0.025, 0.035, 'sawtooth');
  }
  hit() { this.pulse(48, 0.12, 0.06, 'triangle'); }
  roar(strength = 1) {
    if (!this.context) return;
    const now = this.context.currentTime;
    [42, 56, 71].forEach((frequency, index) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = index === 1 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, now + 1.15);
      gain.gain.setValueAtTime(0.08 * strength / (index + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + 1.22);
    });
  }
}
const audio = new ArenaAudio();

function showDanger(text, duration = 1.4) {
  dangerMessage.textContent = text;
  dangerMessage.classList.add('visible');
  dangerTimer = duration;
}

function buildArena() {
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4438, roughness: 1, emissive: 0x160906, emissiveIntensity: 0.2 });
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x66544b, roughness: 0.96, emissive: 0x150805, emissiveIntensity: 0.18 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x332622, roughness: 1 });
  const emberMaterial = new THREE.MeshBasicMaterial({ color: 0xff3a14, toneMapped: false });

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 0.7, 72), floorMaterial);
  floor.position.y = -0.42;
  floor.receiveShadow = true;
  scene.add(floor);

  const innerWall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_RADIUS + 2.4, ARENA_RADIUS + 2.4, 9.5, 72, 1, true), stoneMaterial);
  innerWall.position.y = 4.4;
  innerWall.material.side = THREE.BackSide;
  scene.add(innerWall);

  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2;
    const radius = ARENA_RADIUS + 1.1;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.95, 8.5, 8), darkStone);
    pillar.position.set(Math.sin(angle) * radius, 4.1, Math.cos(angle) * radius);
    pillar.castShadow = true;
    scene.add(pillar);

    if (i % 4 === 0) {
      const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.8, 10), darkStone);
      brazier.position.set(Math.sin(angle) * 31, 0.35, Math.cos(angle) * 31);
      scene.add(brazier);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.7, 8), emberMaterial);
      flame.position.set(brazier.position.x, 1.55, brazier.position.z);
      scene.add(flame);
      const light = new THREE.PointLight(0xff4b1f, 4.8, 18, 2);
      light.position.set(brazier.position.x, 2.1, brazier.position.z);
      scene.add(light);
    }
  }

  const sandMarks = new THREE.Group();
  const markMaterial = new THREE.MeshBasicMaterial({ color: 0x2a1713, transparent: true, opacity: 0.45, depthWrite: false });
  for (let i = 0; i < 45; i += 1) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + Math.random() * 0.24, 2 + Math.random() * 4), markMaterial);
    const radius = Math.sqrt(Math.random()) * 31;
    const angle = Math.random() * Math.PI * 2;
    mark.position.set(Math.sin(angle) * radius, -0.04, Math.cos(angle) * radius);
    mark.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
    sandMarks.add(mark);
  }
  scene.add(sandMarks);
}

function buildMinigun() {
  const group = new THREE.Group();
  group.position.set(0.36, -0.34, -0.78);
  const metal = new THREE.MeshStandardMaterial({ color: 0x273036, metalness: 0.8, roughness: 0.27, depthTest: false, depthWrite: false });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101416, metalness: 0.55, roughness: 0.5, depthTest: false, depthWrite: false });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.72), metal);
  group.add(body);
  const barrelGroup = new THREE.Group();
  barrelGroup.position.z = -0.58;
  group.add(barrelGroup);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(Math.cos(angle) * 0.095, Math.sin(angle) * 0.095, -0.28);
    barrelGroup.add(barrel);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 20), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -0.62;
  group.add(ring);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -1.22);
  group.add(muzzle);
  const flash = new THREE.PointLight(0xffb36a, 0, 8, 2);
  flash.position.copy(muzzle.position);
  group.add(flash);
  group.traverse(object => {
    if (object.isMesh) { object.frustumCulled = false; object.renderOrder = 1002; }
  });
  group.userData = { barrelGroup, muzzle, flash };
  camera.add(group);
  return group;
}
const minigun = buildMinigun();

function buildDemon() {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x210808, emissive: 0x240000, emissiveIntensity: 0.35, roughness: 0.88 });
  const armor = new THREE.MeshStandardMaterial({ color: 0x120a09, roughness: 0.65, metalness: 0.25 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x7d1510, emissive: 0x430500, emissiveIntensity: 0.55, roughness: 0.8 });
  const horn = new THREE.MeshStandardMaterial({ color: 0x211711, roughness: 0.75 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff2200, emissiveIntensity: 7 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.65, 5.4, 7, 12), hide);
  torso.scale.set(1.25, 1.08, 0.78);
  torso.position.y = 7.4;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(4.3, 2.2, 2.2), armor);
  chest.position.set(0, 8.7, 0);
  group.add(chest);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 11.5, 0);
  group.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), hide);
  head.scale.set(1.0, 0.9, 1.15);
  headPivot.add(head);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.4), flesh);
  jaw.position.set(0, -0.75, -0.45);
  headPivot.add(jaw);
  for (const x of [-0.42, 0.42]) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), eye);
    orb.position.set(x, 0.15, -1.02);
    headPivot.add(orb);
  }
  for (const side of [-1, 1]) {
    const hornMesh = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.4, 10), horn);
    hornMesh.position.set(side * 0.85, 1.65, -0.05);
    hornMesh.rotation.z = side * -0.48;
    headPivot.add(hornMesh);
  }

  function limb(x, y, length, radius, leg = false) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    group.add(pivot);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius, length, 9), hide);
    upper.position.y = -length / 2;
    pivot.add(upper);
    const lowerPivot = new THREE.Group();
    lowerPivot.position.y = -length;
    pivot.add(lowerPivot);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.52, radius * 0.75, length * 0.9, 9), armor);
    lower.position.y = -(length * 0.9) / 2;
    lowerPivot.add(lower);
    const end = new THREE.Mesh(new THREE.BoxGeometry(leg ? 1.2 : 0.9, 0.55, leg ? 1.8 : 1.2), flesh);
    end.position.set(0, -length * 0.9, leg ? -0.35 : -0.15);
    lowerPivot.add(end);
    return { pivot, lowerPivot };
  }
  const leftArm = limb(-2.2, 9.2, 3.4, 0.5, false);
  const rightArm = limb(2.2, 9.2, 3.4, 0.5, false);
  const leftLeg = limb(-0.82, 5.4, 3.2, 0.62, true);
  const rightLeg = limb(0.82, 5.4, 3.2, 0.62, true);

  const spines = [];
  for (let i = 0; i < 7; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.8 + i * 0.08, 8), horn);
    spike.position.set((i % 2 ? 0.28 : -0.28), 9.3 - i * 0.7, 1.05);
    spike.rotation.x = Math.PI / 2.7;
    group.add(spike);
    spines.push(spike);
  }

  const aura = new THREE.PointLight(0xff2b0a, 7.5, 22, 2);
  aura.position.set(0, 8.5, 0);
  group.add(aura);
  group.position.set(0, 0, -14);
  group.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  scene.add(group);
  return { group, torso, headPivot, leftArm, rightArm, leftLeg, rightLeg, aura };
}

function updateBossHealth() {
  const ratio = Math.max(0, bossHealth / BOSS_MAX_HEALTH);
  bossHealthFill.style.transform = `scaleX(${ratio})`;
  bossHealthText.textContent = `${bossHealth} / ${BOSS_MAX_HEALTH}`;
  hitCount.textContent = `${hitsLanded} / ${BOSS_MAX_HEALTH} HITS`;
}

function isBossTargeted() {
  if (!boss || ended || dying) return false;
  bossParts.torso.getWorldPosition(bossTarget);
  camera.getWorldDirection(forward);
  toBoss.copy(bossTarget).sub(camera.position);
  const distance = toBoss.length();
  if (distance < 0.001 || distance > 95) return false;
  toBoss.normalize();
  return forward.dot(toBoss) >= HIT_AIM_DOT;
}

function addTracer(hit) {
  minigun.userData.muzzle.getWorldPosition(muzzleWorld);
  const end = hit ? bossTarget.clone() : muzzleWorld.clone().add(forward.clone().multiplyScalar(70));
  if (hit) {
    end.x += (Math.random() - 0.5) * 1.4;
    end.y += (Math.random() - 0.5) * 2.0;
    end.z += (Math.random() - 0.5) * 1.4;
  }
  const geometry = new THREE.BufferGeometry().setFromPoints([muzzleWorld.clone(), end]);
  const material = new THREE.LineBasicMaterial({ color: hit ? 0xffd58a : 0xff7a35, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  tracerEffects.push({ line, life: 0.085 });
}

function fireBullet() {
  if (!started || paused || ended || dying) return;
  camera.getWorldDirection(forward);
  const hit = isBossTargeted();
  minigun.userData.flash.intensity = 5.8;
  audio.shot();
  addTracer(hit);
  if (hit) {
    bossHealth = Math.max(0, bossHealth - 1);
    hitsLanded += 1;
    audio.hit();
    bossParts.aura.intensity = 12;
    updateBossHealth();
    if (bossHealth === 75 || bossHealth === 50 || bossHealth === 25) showDanger(`THE ASH DEMON HAS ${bossHealth} HEALTH LEFT.`, 1.5);
    if (bossHealth <= 0) defeatBoss();
  }
}

function updateWeapon(delta, nowSeconds) {
  minigun.userData.barrelGroup.rotation.z -= delta * (firing ? 28 : 4.2);
  minigun.userData.flash.intensity = THREE.MathUtils.lerp(minigun.userData.flash.intensity, 0, Math.min(1, delta * 24));
  minigun.position.y = -0.34 + Math.sin(nowSeconds * 2.2) * 0.008;
  crosshair.classList.toggle('stun-ready', isBossTargeted());
  if (!firing) { fireAccumulator = 0; return; }
  fireAccumulator += delta;
  while (fireAccumulator >= FIRE_INTERVAL && !ended) {
    fireAccumulator -= FIRE_INTERVAL;
    fireBullet();
  }
}

function updatePlayer(delta) {
  const w = keys.has('KeyW'), s = keys.has('KeyS'), a = keys.has('KeyA'), d = keys.has('KeyD');
  const sprintWanted = w && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  const sprinting = sprintWanted && !exhausted && stamina > 0;
  if (sprinting) {
    stamina = Math.max(0, stamina - delta);
    if (stamina <= 0) exhausted = true;
  } else {
    stamina = Math.min(MAX_STAMINA, stamina + delta * (exhausted ? 1.2 : 1.75));
    if (exhausted && stamina >= 2.4) exhausted = false;
  }
  const ratio = stamina / MAX_STAMINA;
  staminaFill.style.transform = `scaleX(${ratio})`;
  staminaSeconds.textContent = `${stamina.toFixed(1)}s`;
  staminaState.textContent = exhausted ? 'EXHAUSTED — KEEP MOVING' : stamina < MAX_STAMINA ? 'RECOVERING' : 'W + SHIFT TO SPRINT';

  const inputX = Number(d) - Number(a);
  const inputZ = Number(w) - Number(s);
  const length = Math.hypot(inputX, inputZ);
  if (length <= 0) return;
  camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  move.set(0,0,0).addScaledVector(forward,inputZ/length).addScaledVector(right,inputX/length).multiplyScalar((sprinting?SPRINT_SPEED:WALK_SPEED)*delta);
  const next = camera.position.clone().add(move);
  const radial = Math.hypot(next.x, next.z);
  if (radial < ARENA_RADIUS - PLAYER_RADIUS) {
    camera.position.x = next.x; camera.position.z = next.z;
  }
  bobPhase += delta * (sprinting ? 13 : 8.5);
  camera.position.y = EYE_HEIGHT + Math.sin(bobPhase) * (sprinting ? 0.055 : 0.03);
}

function updateBoss(delta, nowSeconds) {
  if (ended || dying) return;
  const position = boss.position;
  const direction = new THREE.Vector3(camera.position.x - position.x, 0, camera.position.z - position.z);
  const distance = direction.length();
  if (distance > 0.001) {
    direction.normalize();
    const speed = BOSS_SPEED + (1 - bossHealth / BOSS_MAX_HEALTH) * 1.35;
    position.addScaledVector(direction, speed * delta);
    boss.rotation.y = Math.atan2(direction.x, direction.z);
  }
  const stride = nowSeconds * (3.2 + (1 - bossHealth / BOSS_MAX_HEALTH) * 2.2);
  bossParts.leftLeg.pivot.rotation.x = Math.sin(stride) * 0.46;
  bossParts.rightLeg.pivot.rotation.x = -Math.sin(stride) * 0.46;
  bossParts.leftArm.pivot.rotation.x = -Math.sin(stride) * 0.55 + 0.2;
  bossParts.rightArm.pivot.rotation.x = Math.sin(stride) * 0.55 + 0.2;
  bossParts.headPivot.rotation.z = Math.sin(nowSeconds * 1.6) * 0.08;
  bossParts.aura.intensity = THREE.MathUtils.lerp(bossParts.aura.intensity, 6.5, Math.min(1, delta * 6));
  roarTimer -= delta;
  if (roarTimer <= 0) {
    audio.roar(distance < 15 ? 1.2 : 0.8);
    showDanger(distance < 15 ? 'THE ASH DEMON IS ON TOP OF YOU.' : 'THE COLOSSEUM SHAKES.', 1.5);
    roarTimer = 4 + Math.random() * 5;
  }
  const threat = THREE.MathUtils.clamp(1 - distance / 22, 0, 1);
  damageVignette.style.opacity = String(threat * 0.55);
  if (distance < 2.25) beginDeath();
}

function defeatBoss() {
  if (ended) return;
  ended = true;
  firing = false;
  controls.unlock();
  bossParts.aura.intensity = 16;
  boss.rotation.z = -0.55;
  document.body.classList.add('survived');
  endKicker.textContent = 'CAMPAIGN COMPLETE';
  endTitle.textContent = 'THE ASH DEMON IS DEAD.';
  endCopy.textContent = 'One hundred rounds found their mark. The coliseum finally goes quiet.';
  restartButton.textContent = 'PLAY LEVEL 3 AGAIN';
  endOverlay.classList.add('visible');
  sessionStorage.setItem('timberCampaignLevel', 'complete');
}

function beginDeath() {
  if (dying || ended) return;
  dying = true;
  firing = false;
  deathElapsed = 0;
  controls.unlock();
  audio.roar(1.4);
}

function updateDeath(delta) {
  deathElapsed += delta;
  bossParts.headPivot.getWorldPosition(bossTarget);
  camera.lookAt(bossTarget);
  damageVignette.style.opacity = String(Math.min(1, 0.4 + deathElapsed * 0.5));
  if (deathElapsed >= 1.6) {
    ended = true;
    dying = false;
    document.body.classList.add('consumed');
    endKicker.textContent = 'THE FINAL ARENA';
    endTitle.textContent = 'THE ASH DEMON CRUSHED YOU.';
    endCopy.textContent = 'Keep moving and keep the minigun on target.';
    restartButton.textContent = 'TRY LEVEL 3 AGAIN';
    endOverlay.classList.add('visible');
  }
}

function pauseGame() {
  if (!started || paused || ended || dying) return;
  paused = true; firing = false; keys.clear(); controls.unlock(); pauseOverlay.classList.add('visible');
}
function resumeGame() { if (!ended && !dying) controls.lock(); }
function restartGame() { window.location.reload(); }

async function loadUser() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!response.ok) { window.location.assign('/'); return; }
  const data = await response.json();
  if (data.user.picture) {
    const image=document.createElement('img'); image.src=data.user.picture; image.alt=''; image.referrerPolicy='no-referrer'; userBadge.appendChild(image);
  }
  const name=document.createElement('span'); name.textContent=data.user.givenName||data.user.name||'Player'; userBadge.appendChild(name);
}

controls.addEventListener('lock',()=>{
  if(ended||dying)return; started=true; paused=false; startOverlay.classList.remove('visible'); pauseOverlay.classList.remove('visible');
});
controls.addEventListener('unlock',()=>{
  if(started&&!ended&&!dying&&!paused){ paused=true; firing=false; keys.clear(); pauseOverlay.classList.add('visible'); }
});
window.addEventListener('keydown',event=>{
  if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(event.code)){keys.add(event.code);event.preventDefault();}
  if(event.code==='Space'){firing=true;event.preventDefault();}
  if(event.code==='KeyP')pauseGame();
});
window.addEventListener('keyup',event=>{keys.delete(event.code);if(event.code==='Space')firing=false;});
renderer.domElement.addEventListener('mousedown',event=>{if(event.button===0){firing=true;event.preventDefault();}});
window.addEventListener('mouseup',event=>{if(event.button===0)firing=false;});
window.addEventListener('blur',pauseGame);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});

enterButton.addEventListener('click',()=>{audio.start().catch(()=>{});controls.lock();});
resumeButton.addEventListener('click',resumeGame);
pauseButton.addEventListener('click',pauseGame);
restartButton.addEventListener('click',restartGame);
restartPauseButton.addEventListener('click',restartGame);

function animate(frameTime) {
  requestAnimationFrame(animate);
  const delta=Math.min((frameTime-lastFrame)/1000,0.05); lastFrame=frameTime;
  const nowSeconds=frameTime/1000;
  if(dangerTimer>0){dangerTimer-=delta;if(dangerTimer<=0)dangerMessage.classList.remove('visible');}
  tracerEffects.forEach(effect=>{effect.life-=delta;effect.line.material.opacity=Math.max(0,effect.life/0.085);});
  for(let i=tracerEffects.length-1;i>=0;i-=1){if(tracerEffects[i].life<=0){scene.remove(tracerEffects[i].line);tracerEffects[i].line.geometry.dispose();tracerEffects[i].line.material.dispose();tracerEffects.splice(i,1);}}
  if(dying&&!ended)updateDeath(delta);
  else if(started&&!paused&&!ended){updatePlayer(delta);updateWeapon(delta,nowSeconds);updateBoss(delta,nowSeconds);}
  renderer.render(scene,camera);
}

async function initialize() {
  await loadUser();
  buildArena();
  bossParts=buildDemon(); boss=bossParts.group;
  updateBossHealth();
  minigunStatus.textContent='HOLD SPACE OR LEFT CLICK · RAPID FIRE';
  requestAnimationFrame(animate);
}
initialize().catch(error=>{console.error(error);endKicker.textContent='THE ARENA COULD NOT OPEN';endTitle.textContent='STARTUP ERROR';endCopy.textContent=error.message||'Level 3 failed to initialize.';endOverlay.classList.add('visible');});
