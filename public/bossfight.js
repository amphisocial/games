import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const root = document.getElementById('game-root');
const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const endOverlay = document.getElementById('end-overlay');
const enterButton = document.getElementById('enter-button');
const resumeButton = document.getElementById('resume-button');
const restartPauseButton = document.getElementById('restart-pause-button');
const restartButton = document.getElementById('restart-button');
const pauseButton = document.getElementById('pause-button');
const bossName = document.getElementById('boss-name');
const bossHealthText = document.getElementById('boss-health-text');
const bossHealthFill = document.getElementById('boss-health-fill');
const playerHealthText = document.getElementById('player-health-text');
const playerHealthFill = document.getElementById('player-health-fill');
const weaponName = document.getElementById('weapon-name');
const weaponStatus = document.getElementById('weapon-status');
const ammoStatus = document.getElementById('ammo-status');
const dangerMessage = document.getElementById('danger-message');
const endKicker = document.getElementById('end-kicker');
const endTitle = document.getElementById('end-title');
const endCopy = document.getElementById('end-copy');
const damageVignette = document.getElementById('damage-vignette');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x211727);
scene.fog = new THREE.FogExp2(0x24182a, 0.008);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 260);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.48;
renderer.shadowMap.enabled = true;
root.appendChild(renderer.domElement);
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(camera);

scene.add(new THREE.AmbientLight(0x6f5977, 0.7));
scene.add(new THREE.HemisphereLight(0xc6aadd, 0x3d2734, 2.15));
const moon = new THREE.DirectionalLight(0xd6b7ee, 2.35); moon.position.set(-30, 45, 20); scene.add(moon);

const keys = new Set();
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
let selectedWeapon = 'minigun';
let started = false, paused = true, ended = false, firing = false;
let playerHealth = 100, bossHealth = 100, nextAttackAt = 0, bossHitCooldown = 0;
let fireCooldown = 0, swordSwing = 0, dangerTimer = 0;
const move = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3();

const weapons = {
  minigun: { name: 'MINIGUN', interval: 0.065, damage: 1.15, range: 90, label: 'HOLD SPACE OR LEFT CLICK · RAPID FIRE' },
  rifle: { name: 'ASSAULT RIFLE', interval: 0.13, damage: 2.4, range: 90, label: 'HOLD SPACE OR LEFT CLICK · AUTOMATIC' },
  sword: { name: 'SWORD', interval: 0.48, damage: 13, range: 4.2, label: 'SPACE OR LEFT CLICK · GET CLOSE' },
};

const bossTypes = [
  { name: 'THE HOLLOW KING', health: 130, speed: 3.25, color: 0x22141f, glow: 0x9400ff, shape: 'king' },
  { name: 'THE GLASS WARDEN', health: 115, speed: 3.8, color: 0x8b9da4, glow: 0x51e7ff, shape: 'warden' },
  { name: 'THE ROT HOUND', health: 320, speed: 4.15, color: 0x3d2a18, glow: 0xff5a16, shape: 'hound' },
];
const bossConfig = bossTypes[Math.floor(Math.random() * bossTypes.length)];
bossHealth = bossConfig.health;
bossName.textContent = bossConfig.name;

function buildArena() {
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 0.8, 64), new THREE.MeshStandardMaterial({ color: 0x211c22, roughness: 0.94 }));
  floor.position.y = -0.45; floor.receiveShadow = true; scene.add(floor);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x2d1d31, roughness: 0.9 });
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 9, 9), ringMat);
    pillar.position.set(Math.cos(a) * 31, 4.5, Math.sin(a) * 31); scene.add(pillar);
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const fire = new THREE.PointLight(i % 2 ? 0xa64dff : 0xff5a2a, 8.5, 25, 2);
    fire.position.set(Math.cos(a) * 25, 3, Math.sin(a) * 25); scene.add(fire);
  }
}

function limb(material, length, radius = 0.22) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius, length, 7), material);
  mesh.position.y = -length / 2; g.add(mesh); return g;
}

function makeBoss() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: bossConfig.color, roughness: 0.82, metalness: bossConfig.shape === 'warden' ? 0.45 : 0.04 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x060307, roughness: 1 });
  const glow = new THREE.MeshStandardMaterial({ color: bossConfig.glow, emissive: bossConfig.glow, emissiveIntensity: 4 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(bossConfig.shape === 'hound' ? 0.9 : 0.72, bossConfig.shape === 'king' ? 4.5 : 3.6, 7, 12), material);
  torso.position.y = bossConfig.shape === 'king' ? 5.7 : 4.9;
  torso.scale.z = bossConfig.shape === 'hound' ? 1.5 : 0.75; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(bossConfig.shape === 'hound' ? 0.85 : 0.72, 14, 10), material);
  head.position.set(0, bossConfig.shape === 'king' ? 8.5 : 7.3, bossConfig.shape === 'hound' ? -0.6 : 0); group.add(head);
  for (const x of [-0.23, 0.23]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glow); eye.position.set(x, head.position.y + 0.08, head.position.z - 0.65); group.add(eye); }
  if (bossConfig.shape === 'king') {
    for (let i = 0; i < 7; i++) { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.6 + (i % 2) * 0.5, 7), material); spike.position.set((i - 3) * 0.23, 9.5 + Math.abs(i - 3) * 0.05, 0); group.add(spike); }
  } else if (bossConfig.shape === 'warden') {
    for (let i = 0; i < 10; i++) { const shard = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.3, 5), glow); const a = i / 10 * Math.PI * 2; shard.position.set(Math.cos(a) * 0.8, 5.5 + Math.sin(a) * 1.4, Math.sin(a) * 0.8); shard.rotation.z = a; group.add(shard); }
  } else {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.8), dark); jaw.position.set(0, 6.9, -1.25); group.add(jaw);
    for (let i = 0; i < 6; i++) { const spine = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.2, 6), material); spine.position.set(0, 5.4, 0.2 + i * 0.45); spine.rotation.x = -0.35; group.add(spine); }
  }
  const arms = [], legs = [];
  for (const x of [-1, 1]) {
    const arm = limb(material, bossConfig.shape === 'king' ? 5.5 : 4.4, 0.28); arm.position.set(x * 0.9, 7.1, 0); arm.rotation.z = x * 0.18; group.add(arm); arms.push(arm);
    const leg = limb(material, bossConfig.shape === 'hound' ? 4.1 : 4.5, 0.34); leg.position.set(x * 0.48, 3.6, 0.2); group.add(leg); legs.push(leg);
  }
  const aura = new THREE.PointLight(bossConfig.glow, 4.2, 14, 2); aura.position.y = 6; group.add(aura);
  group.position.set(0, 0, -20);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.boss = true; } });
  scene.add(group); return { group, torso, head, arms, legs, aura };
}

buildArena();
const boss = makeBoss();
const allies = [];
function makeAlly(index) {
  const group = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x536472, roughness: 0.72, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2228, roughness: 0.58, metalness: 0.55 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb58b72, roughness: 0.88 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.05, 5, 8), armor); torso.position.y = 1.55; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin); head.position.y = 2.42; group.add(head);
  for (const x of [-0.3, 0.3]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.1,1.25,6), dark); leg.position.set(x*0.55,0.58,0); group.add(leg); }
  const rifle = new THREE.Group(); const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.15,0.85),dark); rifleBody.position.set(0.34,1.62,-0.35); rifle.add(rifleBody); const rifleBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.8,6),dark); rifleBarrel.rotation.x=Math.PI/2; rifleBarrel.position.set(0.34,1.62,-1.12); rifle.add(rifleBarrel); group.add(rifle);
  group.position.set(Math.cos(index/4*Math.PI*2)*12,0,Math.sin(index/4*Math.PI*2)*12+5);
  group.userData = { shootCooldown: 0.25 + index * 0.17, orbitAngle: index/4*Math.PI*2, orbitRadius: 12 + (index%2)*3, rifle };
  group.traverse(o=>{if(o.isMesh)o.castShadow=true;}); scene.add(group); allies.push(group);
}
if (bossConfig.shape === 'hound') for (let i = 0; i < 4; i++) makeAlly(i);
camera.position.set(0, 1.72, 18);

const weaponFill = new THREE.PointLight(0xffefd8, 3.2, 5, 2); weaponFill.position.set(0, -0.1, -0.8); camera.add(weaponFill);
const weaponView = new THREE.Group(); camera.add(weaponView);
function rebuildWeaponView() {
  weaponView.clear();
  weaponView.position.set(0,0,0);
  const metal = new THREE.MeshStandardMaterial({ color: selectedWeapon === 'sword' ? 0xb9c3c8 : 0x4d555b, roughness: 0.38, metalness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171b1f, roughness: 0.55, metalness: 0.62 });
  const hand = new THREE.MeshStandardMaterial({ color: 0xb88e74, roughness: 0.86 });
  if (selectedWeapon === 'sword') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.15, 0.16), metal); blade.position.set(0.68, -0.58, -1.25); blade.rotation.z = -0.4; weaponView.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.75,0.08,0.12),dark); guard.position.set(0.48,-1.4,-1.06); guard.rotation.z=-0.4; weaponView.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.7,8),dark); grip.position.set(0.26,-1.68,-0.9); grip.rotation.z=-0.4; weaponView.add(grip);
    const handMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17,10,8),hand); handMesh.position.set(0.3,-1.54,-0.94); weaponView.add(handMesh);
  } else {
    const bodyWidth = selectedWeapon === 'minigun' ? 0.72 : 0.52;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, 0.38, 1.35), metal); body.position.set(0.62, -0.48, -1.28); weaponView.add(body);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.5,0.25),dark); grip.position.set(0.58,-0.77,-1.02); grip.rotation.x=-0.24; weaponView.add(grip);
    const barrelCount = selectedWeapon === 'minigun' ? 6 : 1;
    for (let i = 0; i < barrelCount; i++) { const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.4, 7), dark); barrel.rotation.x = Math.PI / 2; const a = i / barrelCount * Math.PI * 2; barrel.position.set(0.62 + Math.cos(a) * (selectedWeapon==='minigun'?0.1:0), -0.46 + Math.sin(a) * (selectedWeapon==='minigun'?0.1:0), -2.22); weaponView.add(barrel); }
    for (const x of [0.4,0.82]) { const handMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8),hand); handMesh.scale.set(1,.72,1.2); handMesh.position.set(x,-0.68,x<.5?-1.78:-.9); weaponView.add(handMesh); }
  }
  weaponName.textContent = weapons[selectedWeapon].name; weaponStatus.textContent = weapons[selectedWeapon].label;
}
rebuildWeaponView();

document.querySelectorAll('.weapon-choice').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.weapon-choice').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); selectedWeapon = btn.dataset.weapon; rebuildWeaponView();
}));

function showDanger(text, seconds = 1.5) { dangerMessage.textContent = text; dangerMessage.classList.add('visible'); dangerTimer = seconds; }
function updateHud() {
  playerHealthFill.style.transform = `scaleX(${Math.max(0, playerHealth / 100)})`; playerHealthText.textContent = `${Math.ceil(Math.max(0, playerHealth))}%`;
  const ratio = Math.max(0, bossHealth / bossConfig.health); bossHealthFill.style.transform = `scaleX(${ratio})`; bossHealthText.textContent = `${Math.ceil(ratio * 100)}%`;
}
function tracer(from, to, color = 0xffd37a) {
  const geom = new THREE.BufferGeometry().setFromPoints([from, to]); const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })); scene.add(line); setTimeout(() => { scene.remove(line); geom.dispose(); line.material.dispose(); }, 65);
}
function attack() {
  if (!started || paused || ended || fireCooldown > 0) return;
  const w = weapons[selectedWeapon]; fireCooldown = w.interval;
  if (selectedWeapon === 'sword') {
    swordSwing = 0.22; const d = camera.position.distanceTo(boss.group.position);
    camera.getWorldDirection(forward); const toBoss = boss.group.position.clone().sub(camera.position).setY(0).normalize();
    if (d < w.range && forward.setY(0).normalize().dot(toBoss) > 0.55) { bossHealth -= w.damage; showDanger('BLADE CONNECTED.', 0.5); }
  } else {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); raycaster.far = w.range;
    const hits = raycaster.intersectObjects(boss.group.children, true);
    const from = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.8));
    const to = hits.length ? hits[0].point : from.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(65)); tracer(from, to, selectedWeapon === 'minigun' ? 0xffb04a : 0xffe1a1);
    if (hits.length && hits[0].object.userData.boss) bossHealth -= w.damage;
  }
  if (bossHealth <= 0) finish(true);
  updateHud();
}

function allyTracer(from, to) {
  const geom = new THREE.BufferGeometry().setFromPoints([from,to]);
  const line = new THREE.Line(geom,new THREE.LineBasicMaterial({color:0x9fe8ff,transparent:true,opacity:0.82}));
  scene.add(line); setTimeout(()=>{scene.remove(line);geom.dispose();line.material.dispose();},75);
}
function updateAllies(delta,t) {
  if (bossConfig.shape !== 'hound' || ended) return;
  for (let i=0;i<allies.length;i++) {
    const ally=allies[i];
    ally.userData.orbitAngle += delta * (0.2 + i*0.025);
    const desired = new THREE.Vector3(Math.cos(ally.userData.orbitAngle)*ally.userData.orbitRadius,0,Math.sin(ally.userData.orbitAngle)*ally.userData.orbitRadius);
    const away = desired.clone().sub(boss.group.position); if (away.length()<7) desired.add(away.normalize().multiplyScalar(7-away.length()));
    const moveDir=desired.sub(ally.position); moveDir.y=0; if(moveDir.length()>0.35){moveDir.normalize();ally.position.addScaledVector(moveDir,3.2*delta);}
    const toBoss=boss.group.position.clone().sub(ally.position); toBoss.y=0; ally.rotation.y=Math.atan2(toBoss.x,toBoss.z);
    ally.position.y=Math.abs(Math.sin(t*7+i))*0.04;
    ally.userData.shootCooldown-=delta;
    const distance=toBoss.length();
    if(distance<42&&ally.userData.shootCooldown<=0){
      ally.userData.shootCooldown=0.48+Math.random()*0.34;
      const from=ally.position.clone().add(new THREE.Vector3(0.34,1.62,0));
      const to=boss.torso.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3((Math.random()-.5)*0.45,(Math.random()-.5)*0.5,(Math.random()-.5)*0.45));
      allyTracer(from,to); bossHealth-=0.9; updateHud();
      if(bossHealth<=0){finish(true);return;}
    }
  }
}

function updateBoss(delta, t) {
  if (ended) return;
  const toPlayer = camera.position.clone().sub(boss.group.position); const distance = toPlayer.length(); toPlayer.y = 0;
  if (distance > 2.8) { toPlayer.normalize(); boss.group.position.addScaledVector(toPlayer, bossConfig.speed * delta); boss.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z); }
  const stride = t * 4.2; boss.arms[0].rotation.x = Math.sin(stride) * 0.5; boss.arms[1].rotation.x = -Math.sin(stride) * 0.5; boss.legs[0].rotation.x = -Math.sin(stride) * 0.35; boss.legs[1].rotation.x = Math.sin(stride) * 0.35; boss.head.rotation.z = Math.sin(t * 2.1) * 0.08; boss.aura.intensity = 3.6 + Math.sin(t * 9) * 0.8;
  bossHitCooldown -= delta;
  if (distance < 3.1 && bossHitCooldown <= 0) { bossHitCooldown = 1.15; playerHealth -= bossConfig.shape === 'hound' ? 18 : 22; damageVignette.style.opacity = '0.8'; setTimeout(() => damageVignette.style.opacity = '0', 180); showDanger(`${bossConfig.name} HIT YOU.`, 1); updateHud(); if (playerHealth <= 0) finish(false); }
}

function updatePlayer(delta) {
  const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA')); const z = Number(keys.has('KeyW')) - Number(keys.has('KeyS')); if (!x && !z) return;
  camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, camera.up).normalize();
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7.2 : 4.5; move.set(0,0,0).addScaledVector(forward,z).addScaledVector(right,x); if (move.lengthSq() > 1) move.normalize(); camera.position.addScaledVector(move, speed * delta);
  const r = Math.hypot(camera.position.x, camera.position.z); if (r > 28.5) { camera.position.x *= 28.5 / r; camera.position.z *= 28.5 / r; }
}

function finish(won) { ended = true; paused = true; controls.unlock(); firing = false; endKicker.textContent = won ? 'ENTITY DESTROYED' : 'YOU WERE CLAIMED'; endTitle.textContent = won ? `${bossConfig.name} IS DEAD.` : `${bossConfig.name} KILLED YOU.`; endCopy.textContent = won ? `You survived with the ${weapons[selectedWeapon].name.toLowerCase()}.` : 'Choose another weapon. Or become better prey.'; endOverlay.classList.add('visible'); }

enterButton.addEventListener('click', () => controls.lock()); resumeButton.addEventListener('click', () => controls.lock()); restartPauseButton.addEventListener('click', () => location.reload()); restartButton.addEventListener('click', () => location.reload()); pauseButton.addEventListener('click', () => { if (started && !ended) controls.unlock(); });
controls.addEventListener('lock', () => { const firstStart=!started; started = true; paused = false; startOverlay.classList.remove('visible'); pauseOverlay.classList.remove('visible'); if(firstStart&&bossConfig.shape==='hound')showDanger('AI FIRETEAM DEPLOYED · 4 RIFLEMEN',2.4); });
controls.addEventListener('unlock', () => { if (started && !ended) { paused = true; pauseOverlay.classList.add('visible'); } });
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'Space') { e.preventDefault(); firing = true; } }); addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') firing = false; });
addEventListener('mousedown', e => { if (e.button === 0) firing = true; }); addEventListener('mouseup', e => { if (e.button === 0) firing = false; });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function animate() { requestAnimationFrame(animate); const delta = Math.min(clock.getDelta(), 0.05); const t = performance.now() / 1000; if (!paused && !ended) { fireCooldown -= delta; if (firing) attack(); updatePlayer(delta); updateAllies(delta,t); updateBoss(delta,t); if (swordSwing > 0) { swordSwing -= delta; weaponView.rotation.z = -0.8 * (swordSwing / 0.22); } else weaponView.rotation.z *= 0.8; if (dangerTimer > 0) { dangerTimer -= delta; if (dangerTimer <= 0) dangerMessage.classList.remove('visible'); } } renderer.render(scene,camera); }
updateHud(); animate();
