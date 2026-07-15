import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const GRID = 15, CELL = 7, HALF = (GRID - 1) / 2, EYE = 7.4;
const root = document.getElementById('game-root');
const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const endOverlay = document.getElementById('end-overlay');
const enterButton = document.getElementById('enter-button');
const resumeButton = document.getElementById('resume-button');
const restartPauseButton = document.getElementById('restart-pause-button');
const restartButton = document.getElementById('restart-button');
const pauseButton = document.getElementById('pause-button');
const scentDistance = document.getElementById('scent-distance');
const scentFill = document.getElementById('scent-fill');
const dangerMessage = document.getElementById('danger-message');
const jumpscare = document.getElementById('feed-jumpscare');

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2b1816); scene.fog = new THREE.FogExp2(0x2a1715, 0.009);
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.08, 250);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.5; root.appendChild(renderer.domElement);
const controls = new PointerLockControls(camera, renderer.domElement); scene.add(camera);
scene.add(new THREE.AmbientLight(0x7e6258, 0.75)); scene.add(new THREE.HemisphereLight(0xd2b9a9, 0x4a2c24, 2.35)); const moon = new THREE.DirectionalLight(0xf1d6c4, 2.45); moon.position.set(-30,45,25); scene.add(moon);
const redGlow = new THREE.PointLight(0x7d0000, 2.8, 18, 2); camera.add(redGlow); redGlow.position.set(0, -1, -1);

const keys = new Set(), clock = new THREE.Clock();
let started = false, paused = true, ended = false, feeding = false, feedTime = 0, dangerTimer = 0, feedStartCamera = null, feedStartHumanScale = null;
let maze, human, humanCell, humanTargetPath = [], humanPathTimer = 0;
const forward = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();


class MonsterModeAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.heartbeatTimer = 0;
    this.footTimer = 0;
    this.whisperTimer = 3 + Math.random() * 4;
  }

  async start() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.gain.value = 0.52;
      this.master.connect(this.context.destination);
      this.startAmbience();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    root.dataset.audioState = 'ready';
  }

  startAmbience() {
    const bus = this.context.createGain();
    bus.gain.value = 0.055;
    bus.connect(this.master);
    [29, 41, 53].forEach((f, i) => {
      const osc = this.context.createOscillator();
      osc.type = i === 1 ? 'sawtooth' : 'sine';
      osc.frequency.value = f;
      osc.detune.value = (i - 1) * 10;
      osc.connect(bus);
      osc.start();
    });
  }

  pulse(frequency, duration, volume, type = 'sine') {
    if (!this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  noise(duration, volume, highpass = 80) {
    if (!this.context) return;
    const count = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, count, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < count; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  update(delta, distance, moving) {
    if (!this.context || paused || feeding || ended) return;
    this.heartbeatTimer -= delta;
    this.footTimer -= delta;
    this.whisperTimer -= delta;
    const close = Math.max(0, Math.min(1, 1 - distance / 45));
    if (this.heartbeatTimer <= 0 && close > 0.12) {
      this.pulse(42, 0.12, 0.07 + close * 0.13, 'sine');
      setTimeout(() => this.pulse(38, 0.11, 0.05 + close * 0.09, 'sine'), 115);
      this.heartbeatTimer = 1.25 - close * 0.55;
    }
    if (moving && this.footTimer <= 0) {
      this.pulse(38, 0.1, 0.12, 'triangle');
      this.noise(0.08, 0.04, 120);
      this.footTimer = 0.44;
    }
    if (this.whisperTimer <= 0) {
      this.noise(0.7, 0.035, 750);
      this.pulse(31, 0.8, 0.055, 'sawtooth');
      this.whisperTimer = 5 + Math.random() * 7;
    }
  }

  beginFeed() {
    if (!this.context) return;
    this.noise(0.8, 0.2, 500);
    this.pulse(620, 0.5, 0.18, 'sawtooth');
    setTimeout(() => { this.pulse(66, 0.38, 0.24, 'square'); this.noise(0.3, 0.22, 90); }, 520);
    setTimeout(() => { this.pulse(49, 0.48, 0.26, 'sawtooth'); this.noise(0.4, 0.25, 80); }, 1150);
    setTimeout(() => { this.pulse(36, 0.9, 0.22, 'sawtooth'); this.noise(0.7, 0.18, 65); }, 1900);
  }
}

const audio = new MonsterModeAudio();

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function generateMaze(){const g=Array.from({length:GRID},()=>Array(GRID).fill(1));const stack=[{x:1,y:1}];g[1][1]=0;const dirs=[[2,0],[-2,0],[0,2],[0,-2]];while(stack.length){const c=stack[stack.length-1];const choices=shuffle([...dirs]).filter(([dx,dy])=>{const x=c.x+dx,y=c.y+dy;return x>0&&y>0&&x<GRID-1&&y<GRID-1&&g[y][x]===1;});if(!choices.length){stack.pop();continue;}const [dx,dy]=choices[0];g[c.y+dy/2][c.x+dx/2]=0;g[c.y+dy][c.x+dx]=0;stack.push({x:c.x+dx,y:c.y+dy});}return g;}
function world(cell){return new THREE.Vector3((cell.x-HALF)*CELL,0,(cell.y-HALF)*CELL);}
function cellFrom(pos){return {x:Math.round(pos.x/CELL+HALF),y:Math.round(pos.z/CELL+HALF)};}
function neighbors(c){return [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:c.x+dx,y:c.y+dy})).filter(n=>maze[n.y]?.[n.x]===0);}
function pathfind(start,end){const q=[start], prev=new Map([[`${start.x},${start.y}`,null]]);for(let h=0;h<q.length;h++){const c=q[h];if(c.x===end.x&&c.y===end.y)break;for(const n of neighbors(c)){const k=`${n.x},${n.y}`;if(!prev.has(k)){prev.set(k,c);q.push(n);}}}const out=[];let cur=end;while(cur){out.push(cur);cur=prev.get(`${cur.x},${cur.y}`);}return out.reverse();}
function farCell(from){const q=[from],dist=new Map([[`${from.x},${from.y}`,0]]);let best=from;for(let h=0;h<q.length;h++){const c=q[h],d=dist.get(`${c.x},${c.y}`);if(d>(dist.get(`${best.x},${best.y}`)||0))best=c;for(const n of neighbors(c)){const k=`${n.x},${n.y}`;if(!dist.has(k)){dist.set(k,d+1);q.push(n);}}}return best;}
function walkable(x,z){const c=cellFrom({x,z});return maze[c.y]?.[c.x]===0;}

function buildMaze(){maze=generateMaze();const wallMat=new THREE.MeshStandardMaterial({color:0x776b62,roughness:0.98});const floorMat=new THREE.MeshStandardMaterial({color:0x62564d,roughness:1});const floor=new THREE.Mesh(new THREE.PlaneGeometry(GRID*CELL,GRID*CELL),floorMat);floor.rotation.x=-Math.PI/2;scene.add(floor);for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++)if(maze[y][x]===1){const w=new THREE.Mesh(new THREE.BoxGeometry(CELL,4.5,CELL),wallMat);const p=world({x,y});w.position.set(p.x,2.25,p.z);scene.add(w);}for(let i=0;i<16;i++){const l=new THREE.PointLight(i%2?0xc83d25:0x7b4634,3.6,23,2);const c={x:1+Math.floor(Math.random()*(GRID-2)),y:1+Math.floor(Math.random()*(GRID-2))};const p=world(c);l.position.set(p.x,4.2,p.z);scene.add(l);}}

function makeHuman(){const g=new THREE.Group();const skin=new THREE.MeshStandardMaterial({color:0xd7b59a,roughness:0.9});const shirt=new THREE.MeshStandardMaterial({color:0x6f7880,roughness:0.95});const torso=new THREE.Mesh(new THREE.CapsuleGeometry(0.26,1.1,5,8),shirt);torso.position.y=1.55;g.add(torso);const head=new THREE.Mesh(new THREE.SphereGeometry(0.28,12,9),skin);head.position.y=2.45;g.add(head);for(const x of[-0.32,0.32]){const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,1.25,7),skin);arm.position.set(x,1.55,0);g.add(arm);const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,1.45,7),shirt);leg.position.set(x*0.55,0.65,0);g.add(leg);}g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);return g;}

buildMaze();
const start={x:1,y:1};const far=farCell(start);camera.position.copy(world(start)).setY(EYE);human=makeHuman();humanCell=far;human.position.copy(world(far));

function chooseHumanDestination(){const monsterCell=cellFrom(camera.position);const candidates=[];for(let y=1;y<GRID-1;y++)for(let x=1;x<GRID-1;x++)if(maze[y][x]===0){const d=Math.abs(x-monsterCell.x)+Math.abs(y-monsterCell.y);if(d>8)candidates.push({x,y});}const target=candidates[Math.floor(Math.random()*candidates.length)]||farCell(monsterCell);humanTargetPath=pathfind(cellFrom(human.position),target);}
function showDanger(text,time=1.4){dangerMessage.textContent=text;dangerMessage.classList.add('visible');dangerTimer=time;}
function updateHuman(delta,t){humanPathTimer-=delta;const d=human.position.distanceTo(camera.position);if(humanPathTimer<=0||humanTargetPath.length<2||d<16){chooseHumanDestination();humanPathTimer=3+Math.random()*2;}if(humanTargetPath.length>1){const target=world(humanTargetPath[1]);const dir=target.clone().sub(human.position);dir.y=0;if(dir.length()<0.4)humanTargetPath.shift();else{dir.normalize();human.position.addScaledVector(dir,(d<18?4.5:2.8)*delta);human.rotation.y=Math.atan2(dir.x,dir.z);}}human.position.y=Math.abs(Math.sin(t*7))*0.05;}
function updatePlayer(delta){const x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));if(!x&&!z)return;camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,camera.up).normalize();move.set(0,0,0).addScaledVector(forward,z).addScaledVector(right,x);if(move.lengthSq()>1)move.normalize();const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?7.1:4.7;const nx=camera.position.x+move.x*speed*delta,nz=camera.position.z+move.z*speed*delta;if(walkable(nx,camera.position.z))camera.position.x=nx;if(walkable(camera.position.x,nz))camera.position.z=nz;}
function updateScent(){const d=Math.hypot(camera.position.x-human.position.x,camera.position.z-human.position.z);const strength=Math.max(0,Math.min(1,1-d/70));scentFill.style.transform=`scaleX(${strength})`;scentDistance.textContent=d<8?'VERY CLOSE':d<18?'CLOSE':d<35?'FRESH':'FAINT';if(d<2.1&&!feeding)beginFeed();}
function beginFeed(){
  if(feeding||ended)return;
  feeding=true;feedTime=0;paused=true;keys.clear();
  feedStartCamera=camera.position.clone();feedStartHumanScale=human.scale.clone();
  pauseButton.disabled=true;document.body.classList.add('feeding-lock');
  jumpscare.setAttribute('aria-hidden','false');jumpscare.classList.remove('finished');jumpscare.classList.add('active');
  pauseOverlay.classList.remove('visible');showDanger('YOU CAUGHT THEM.',1.2); audio.beginFeed();
  if(controls.isLocked)controls.unlock();
}
function updateFeed(delta){
  feedTime+=delta;
  const target=human.position.clone().add(new THREE.Vector3(0,1.45,0));
  const approach=target.clone().add(new THREE.Vector3(0,1.35,1.25));
  const progress=Math.min(1,feedTime/2.6);
  camera.position.lerpVectors(feedStartCamera,approach,1-Math.pow(1-progress,3));
  camera.lookAt(target);
  const shrink=Math.max(.12,1-progress*.88);human.scale.copy(feedStartHumanScale).multiplyScalar(shrink);
  if(feedTime>=3.15){
    feeding=false;ended=true;paused=true;pauseButton.disabled=false;
    jumpscare.classList.remove('active');jumpscare.classList.add('finished');
    document.body.classList.remove('feeding-lock');
    setTimeout(()=>{jumpscare.setAttribute('aria-hidden','true');endOverlay.classList.add('visible');},180);
  }
}
function blockFeedingInput(event){if(!feeding)return;event.preventDefault();event.stopImmediatePropagation();}
['click','mousedown','mouseup','pointerdown','pointerup','contextmenu'].forEach(type=>window.addEventListener(type,blockFeedingInput,true));
window.addEventListener('keydown',event=>{if(feeding){event.preventDefault();event.stopImmediatePropagation();}},true);

enterButton.addEventListener('click',()=>{audio.start().catch(console.warn);controls.lock();});resumeButton.addEventListener('click',()=>{audio.start().catch(console.warn);controls.lock();});restartPauseButton.addEventListener('click',()=>location.reload());restartButton.addEventListener('click',()=>location.reload());pauseButton.addEventListener('click',()=>{if(started&&!ended&&!feeding)controls.unlock();});
controls.addEventListener('lock',()=>{started=true;paused=false;startOverlay.classList.remove('visible');pauseOverlay.classList.remove('visible');});controls.addEventListener('unlock',()=>{if(started&&!ended&&!feeding){paused=true;pauseOverlay.classList.add('visible');}});
addEventListener('keydown',e=>{if(!feeding)keys.add(e.code);});addEventListener('keyup',e=>{if(!feeding)keys.delete(e.code);});addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function animate(){requestAnimationFrame(animate);const delta=Math.min(clock.getDelta(),0.05),t=performance.now()/1000;if(feeding)updateFeed(delta);else if(!paused&&!ended){updatePlayer(delta);updateHuman(delta,t);updateScent();audio.update(delta,Math.hypot(camera.position.x-human.position.x,camera.position.z-human.position.z),keys.has('KeyW')||keys.has('KeyA')||keys.has('KeyS')||keys.has('KeyD'));if(dangerTimer>0){dangerTimer-=delta;if(dangerTimer<=0)dangerMessage.classList.remove('visible');}}renderer.render(scene,camera);}animate();
