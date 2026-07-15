import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

async function main() {
const GRID_SIZE = 25;
const CELL_SIZE = 7;
const HALF_GRID = (GRID_SIZE - 1) / 2;
const EYE_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.52;
const WALK_SPEED = 4.15;
const SPRINT_SPEED = 6.7;
const LETHAL_PROGRESS = 0.8;

const root = document.getElementById('game-root');
const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const endOverlay = document.getElementById('end-overlay');
const enterButton = document.getElementById('enter-button');
const resumeButton = document.getElementById('resume-button');
const restartButton = document.getElementById('restart-button');
const progressFill = document.getElementById('haunted-progress-fill');
const progressPercent = document.getElementById('haunted-progress-percent');
const squadPanel = document.getElementById('haunted-squad');
const dangerNote = document.getElementById('haunted-danger');
const dangerMessage = document.getElementById('danger-message');
const damageVignette = document.getElementById('damage-vignette');
const jumpscareOverlay = document.getElementById('haunted-jumpscare');
const jumpscareName = document.getElementById('haunted-jumpscare-name');
const endKicker = document.getElementById('end-kicker');
const endTitle = document.getElementById('end-title');
const endCopy = document.getElementById('end-copy');

const matchResponse = await fetch('/api/haunted-ascension/match', { credentials: 'same-origin' });
if (!matchResponse.ok) {
  window.location.replace('/mode/haunted-ascension/queue');
  throw new Error('No active Haunted Ascension match.');
}
const match = await matchResponse.json();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17151b);
scene.fog = new THREE.FogExp2(0x17141a, 0.011);

const camera = new THREE.PerspectiveCamera(73, innerWidth / innerHeight, 0.08, 520);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = 0.72;
scene.add(camera);

scene.add(new THREE.AmbientLight(0x8e8792, 1.15));
scene.add(new THREE.HemisphereLight(0xb6afc0, 0x4b382d, 1.55));
const moon = new THREE.DirectionalLight(0xd4d0e4, 1.7);
moon.position.set(-50, 75, 32);
scene.add(moon);
const playerLight = new THREE.PointLight(0xe8d8bb, 2.6, 18, 2);
playerLight.position.set(0, 0.2, 0.5);
camera.add(playerLight);

const keys = new Set();
const pathVector = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const desired = new THREE.Vector3();
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();

let maze;
let startCell;
let exitCell;
let route;
let distanceFromExit;
let startRouteDistance = 1;
let started = false;
let paused = true;
let ended = false;
let jumpscaring = false;
let jumpscareElapsed = 0;
let caughtEntity = null;
let dangerTimer = 0;
let lastFrame = performance.now();
let elapsed = 0;
let localProgress = 0;
let stateTimer = 0;
let footstepTimer = 0;
let snapshotStates = {};
let lastSafePosition = new THREE.Vector3();

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(match.seed);

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function generateMaze(size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(1));
  const stack = [{ x: 1, y: 1 }];
  grid[1][1] = 0;
  const dirs = [{x:2,y:0},{x:-2,y:0},{x:0,y:2},{x:0,y:-2}];
  while (stack.length) {
    const current = stack[stack.length - 1];
    const options = shuffle([...dirs]).filter(({x,y}) => {
      const nx=current.x+x, ny=current.y+y;
      return nx>0 && ny>0 && nx<size-1 && ny<size-1 && grid[ny][nx]===1;
    });
    if (!options.length) { stack.pop(); continue; }
    const d=options[0], nx=current.x+d.x, ny=current.y+d.y;
    grid[current.y+d.y/2][current.x+d.x/2]=0;
    grid[ny][nx]=0;
    stack.push({x:nx,y:ny});
  }
  const loops=[];
  for(let y=2;y<size-2;y+=1) for(let x=2;x<size-2;x+=1) {
    if(grid[y][x]!==1) continue;
    if((grid[y][x-1]===0&&grid[y][x+1]===0)||(grid[y-1][x]===0&&grid[y+1][x]===0)) loops.push({x,y});
  }
  shuffle(loops).slice(0, Math.floor(size*0.28)).forEach(({x,y})=>{grid[y][x]=0;});
  return grid;
}

function worldFromCell(cell) {
  return new THREE.Vector3((cell.x-HALF_GRID)*CELL_SIZE,0,(cell.y-HALF_GRID)*CELL_SIZE);
}
function cellFromWorld(x,z) {
  return {x:Math.round(x/CELL_SIZE+HALF_GRID), y:Math.round(z/CELL_SIZE+HALF_GRID)};
}
function bfsDistances(grid, source) {
  const dist=Array.from({length:GRID_SIZE},()=>Array(GRID_SIZE).fill(-1));
  const q=[source]; let head=0; dist[source.y][source.x]=0;
  while(head<q.length){
    const c=q[head++];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=c.x+dx, ny=c.y+dy;
      if(nx<0||ny<0||nx>=GRID_SIZE||ny>=GRID_SIZE||grid[ny][nx]===1||dist[ny][nx]!==-1) continue;
      dist[ny][nx]=dist[c.y][c.x]+1; q.push({x:nx,y:ny});
    }
  }
  return dist;
}
function farthestCell(dist){
  let best={x:1,y:1,d:-1};
  for(let y=1;y<GRID_SIZE-1;y+=1) for(let x=1;x<GRID_SIZE-1;x+=1) if(dist[y][x]>best.d) best={x,y,d:dist[y][x]};
  return best;
}
function findPath(fromCell,toCell){
  const sourceKey=fromCell.y*GRID_SIZE+fromCell.x, targetKey=toCell.y*GRID_SIZE+toCell.x;
  const prev=new Int32Array(GRID_SIZE*GRID_SIZE); prev.fill(-1); prev[sourceKey]=sourceKey;
  const q=[fromCell]; let head=0;
  while(head<q.length){
    const c=q[head++];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=c.x+dx, ny=c.y+dy;
      if(maze[ny]?.[nx]!==0) continue;
      const k=ny*GRID_SIZE+nx; if(prev[k]!==-1) continue;
      prev[k]=c.y*GRID_SIZE+c.x;
      if(k===targetKey){
        const out=[{x:nx,y:ny}]; let cursor=prev[k];
        while(cursor!==sourceKey){out.push({x:cursor%GRID_SIZE,y:Math.floor(cursor/GRID_SIZE)});cursor=prev[cursor];}
        out.push(fromCell); out.reverse(); return out;
      }
      q.push({x:nx,y:ny});
    }
  }
  return [fromCell];
}
function nearestOpenCell(position){
  const c=cellFromWorld(position.x,position.z);
  if(maze[c.y]?.[c.x]===0) return c;
  for(let r=1;r<5;r+=1) for(let y=c.y-r;y<=c.y+r;y+=1) for(let x=c.x-r;x<=c.x+r;x+=1) if(maze[y]?.[x]===0) return {x,y};
  return startCell;
}

function createStoneTexture() {
  const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128;
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#655f5b'; ctx.fillRect(0,0,128,128);
  for(let y=0;y<128;y+=24){
    const offset=(Math.floor(y/24)%2)*18;
    for(let x=-offset;x<128;x+=36){
      ctx.fillStyle=`rgba(${70+Math.floor(random()*25)},${66+Math.floor(random()*20)},${64+Math.floor(random()*18)},.38)`;
      ctx.fillRect(x+1,y+1,34,22);
      ctx.strokeStyle='rgba(25,22,22,.42)'; ctx.strokeRect(x,y,36,24);
    }
  }
  const texture=new THREE.CanvasTexture(canvas); texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(1.4,1.4); return texture;
}

function buildCastle() {
  const stoneTexture=createStoneTexture();
  const floorMat=new THREE.MeshStandardMaterial({color:0x5b5149,roughness:0.98,map:stoneTexture});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE*CELL_SIZE,GRID_SIZE*CELL_SIZE),floorMat);
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

  const wallMat=new THREE.MeshStandardMaterial({color:0x716b67,roughness:0.96,map:stoneTexture});
  const wallGeo=new THREE.BoxGeometry(CELL_SIZE,CELL_SIZE*0.9,CELL_SIZE);
  for(let y=0;y<GRID_SIZE;y+=1){
    for(let x=0;x<GRID_SIZE;x+=1){
      if(maze[y][x]!==1) continue;
      const pos=worldFromCell({x,y});
      const wall=new THREE.Mesh(wallGeo,wallMat);
      wall.position.set(pos.x,CELL_SIZE*0.45,pos.z); wall.receiveShadow=true; wall.castShadow=true; scene.add(wall);
    }
  }

  // Gothic landmarks: towers, columns, banners, and warm braziers make the maze feel like a castle.
  const columnMat=new THREE.MeshStandardMaterial({color:0x817973,roughness:0.92});
  for(let i=0;i<34;i+=1){
    const cell={x:1+Math.floor(random()*(GRID_SIZE-2)),y:1+Math.floor(random()*(GRID_SIZE-2))};
    if(maze[cell.y][cell.x]!==0) continue;
    const pos=worldFromCell(cell);
    const column=new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.62,5.6,10),columnMat);
    column.position.set(pos.x+(random()-.5)*2.4,2.8,pos.z+(random()-.5)*2.4); scene.add(column);
    if(i%3===0){
      const light=new THREE.PointLight(0xff9a55,3.0,18,2);
      light.position.set(column.position.x,3.4,column.position.z); scene.add(light);
      const flame=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6),new THREE.MeshBasicMaterial({color:0xff7b32}));
      flame.position.copy(light.position); scene.add(flame);
    }
  }

  const exitPos=worldFromCell(exitCell);
  const gate=new THREE.Group(); gate.position.copy(exitPos); scene.add(gate);
  const archMat=new THREE.MeshStandardMaterial({color:0x312a31,emissive:0x24002e,emissiveIntensity:0.5,roughness:0.9});
  const leftPillar=new THREE.Mesh(new THREE.CylinderGeometry(0.65,0.8,5.8,10),archMat); leftPillar.position.set(-2.1,2.9,0); gate.add(leftPillar);
  const rightPillar=leftPillar.clone(); rightPillar.position.x=2.1; gate.add(rightPillar);
  const arch=new THREE.Mesh(new THREE.TorusGeometry(2.1,0.65,8,22,Math.PI),archMat); arch.rotation.z=Math.PI; arch.position.y=5.6; gate.add(arch);
  const portal=new THREE.Mesh(new THREE.CircleGeometry(1.9,32),new THREE.MeshBasicMaterial({color:0xd8d5ff,transparent:true,opacity:0.68,side:THREE.DoubleSide}));
  portal.position.set(0,2.4,0.08); gate.add(portal);
  const exitLight=new THREE.PointLight(0xc8b8ff,6,28,2); exitLight.position.set(0,3,1); gate.add(exitLight);
}

function isWalkable(x,z,radius=PLAYER_RADIUS){
  const c=cellFromWorld(x,z);
  for(let y=c.y-1;y<=c.y+1;y+=1) for(let gx=c.x-1;gx<=c.x+1;gx+=1){
    if(maze[y]?.[gx]!==1) continue;
    const p=worldFromCell({x:gx,y});
    if(Math.abs(x-p.x)<CELL_SIZE/2+radius && Math.abs(z-p.z)<CELL_SIZE/2+radius) return false;
  }
  return true;
}
function movePlayer(dx,dz){
  const nx=camera.position.x+dx; if(isWalkable(nx,camera.position.z)) camera.position.x=nx;
  const nz=camera.position.z+dz; if(isWalkable(camera.position.x,nz)) camera.position.z=nz;
}

class HauntedAudio {
  constructor(){this.context=null;this.master=null;this.ambience=null;}
  async start(){
    if(!this.context){
      this.context=new (window.AudioContext||window.webkitAudioContext)();
      this.master=this.context.createGain(); this.master.gain.value=.58; this.master.connect(this.context.destination);
      this.ambience=this.context.createGain(); this.ambience.gain.value=.18; this.ambience.connect(this.master);
      [31,41,53].forEach((freq,index)=>{const o=this.context.createOscillator();o.type=index===1?'sawtooth':'sine';o.frequency.value=freq;const g=this.context.createGain();g.gain.value=.12/(index+1);o.connect(g).connect(this.ambience);o.start();});
    }
    if(this.context.state==='suspended') await this.context.resume();
  }
  pulse(freq,duration,volume,type='sine'){
    if(!this.context)return; const now=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(volume,now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g).connect(this.master);o.start(now);o.stop(now+duration+.04);
  }
  noise(duration,volume,highpass=120){
    if(!this.context)return; const count=Math.floor(this.context.sampleRate*duration),buf=this.context.createBuffer(1,count,this.context.sampleRate),data=buf.getChannelData(0);for(let i=0;i<count;i+=1)data[i]=Math.random()*2-1;const src=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),g=this.context.createGain();src.buffer=buf;filter.type='highpass';filter.frequency.value=highpass;g.gain.setValueAtTime(volume,this.context.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.context.currentTime+duration);src.connect(filter).connect(g).connect(this.master);src.start();
  }
  footstep(sprint){this.pulse(sprint?65:52,.07,sprint?.11:.07,'triangle');}
  scream(index){
    if(!this.context)return; const now=this.context.currentTime;
    for(let i=0;i<3;i+=1){const o=this.context.createOscillator(),g=this.context.createGain(),f=this.context.createBiquadFilter();o.type=i===1?'square':'sawtooth';const base=[180,225,145,260,115][index%5];o.frequency.setValueAtTime(base*(1+i*.22),now);o.frequency.exponentialRampToValueAtTime((760+index*90)*(1+i*.12),now+.24);o.frequency.exponentialRampToValueAtTime(110+index*18,now+1.35);f.type='bandpass';f.frequency.value=900+index*150;f.Q.value=1.8;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.36/(i+1),now+.025);g.gain.exponentialRampToValueAtTime(.0001,now+1.45);o.connect(f).connect(g).connect(this.master);o.start(now);o.stop(now+1.5);}this.noise(1.3,.32,500);
  }
}
const audio=new HauntedAudio();

function showDanger(text,duration=1.8){dangerMessage.textContent=text;dangerMessage.classList.add('visible');dangerTimer=duration;}

function addTeeth(parent,y,z,material,count=7,width=.5,flip=false){
  for(let i=0;i<count;i+=1){const x=((i/(count-1))-.5)*width;const tooth=new THREE.Mesh(new THREE.ConeGeometry(.025,.16+(i%3)*.025,6),material);tooth.position.set(x,y,z);if(flip) tooth.rotation.x=Math.PI;parent.add(tooth);}
}

const ENTITY_SPECS = [
  { name:'THE VEILED WIDOW', skin:0xc9c5c7, accent:0x171419, height:1.18, speed:3.55 },
  { name:'THE ANTLERED MOURNER', skin:0x807d78, accent:0x2a1918, height:1.1, speed:3.75 },
  { name:'THE RED CHOIR', skin:0x6f1d22, accent:0x160305, height:1.0, speed:4.0 },
  { name:'THE BELL-FACED MAN', skin:0x9c958b, accent:0x111012, height:1.12, speed:3.65 },
  { name:'THE SKINLESS PRINCE', skin:0x9a3937, accent:0x260607, height:1.08, speed:4.15 },
];

function createScaryHumanoid(spec,index){
  const group=new THREE.Group();
  const skin=new THREE.MeshStandardMaterial({color:spec.skin,roughness:.92,emissive:index===2?0x240004:0x080709,emissiveIntensity:.2});
  const dark=new THREE.MeshStandardMaterial({color:spec.accent,roughness:1});
  const bone=new THREE.MeshStandardMaterial({color:0xded4c9,roughness:.55});
  const eyeMat=new THREE.MeshStandardMaterial({color:0x030303,emissive:index===4?0x6a0000:0x000000,emissiveIntensity:.8});
  const pupilMat=new THREE.MeshBasicMaterial({color:0xffffff});

  const pelvis=new THREE.Mesh(new THREE.CapsuleGeometry(.3,.55,5,9),skin);pelvis.position.y=2.55;group.add(pelvis);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.42,2.75,6,10),skin);torso.scale.set(.85,spec.height,.62);torso.position.y=4.55;group.add(torso);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.13,.2,1.15,9),skin);neck.position.y=6.75;group.add(neck);
  const headPivot=new THREE.Group();headPivot.position.y=7.55;group.add(headPivot);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.48,16,12),skin);head.scale.set(.82,1.05,.82);headPivot.add(head);
  const mouth=new THREE.Mesh(new THREE.SphereGeometry(.27,12,8),dark);mouth.scale.set(1.15,.38,.42);mouth.position.set(0,-.18,-.39);headPivot.add(mouth);
  addTeeth(headPivot,-.2,-.52,bone,7,.42,true);
  for(const x of [-.15,.15]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.08,10,8),eyeMat);eye.position.set(x,.12,-.4);headPivot.add(eye);const pupil=new THREE.Mesh(new THREE.SphereGeometry(.018,7,6),pupilMat);pupil.position.set(x,.12,-.475);headPivot.add(pupil);}

  function limb(x,y,arm){
    const pivot=new THREE.Group();pivot.position.set(x,y,0);group.add(pivot);
    const upperLen=arm?2.1:1.75,lowerLen=arm?2.15:1.9;
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(arm?.09:.14,arm?.15:.2,upperLen,8),skin);upper.position.y=-upperLen/2;pivot.add(upper);
    const lowerPivot=new THREE.Group();lowerPivot.position.y=-upperLen;pivot.add(lowerPivot);
    const lower=new THREE.Mesh(new THREE.CylinderGeometry(arm?.06:.1,arm?.1:.15,lowerLen,8),skin);lower.position.y=-lowerLen/2;lowerPivot.add(lower);
    const end=new THREE.Mesh(new THREE.SphereGeometry(arm?.14:.18,9,7),dark);end.position.y=-lowerLen;end.scale.set(1,arm?1.6:.65,arm?.75:1.5);lowerPivot.add(end);
    return {pivot,lowerPivot};
  }
  const leftArm=limb(-.62,5.65,true),rightArm=limb(.62,5.65,true),leftLeg=limb(-.24,2.65,false),rightLeg=limb(.24,2.65,false);

  if(index===0){
    const veil=new THREE.Mesh(new THREE.ConeGeometry(.72,2.4,18,1,true),dark);veil.position.set(0,6.9,.18);veil.rotation.x=Math.PI;group.add(veil);
    const crown=new THREE.Mesh(new THREE.TorusGeometry(.5,.05,6,16),bone);crown.rotation.x=Math.PI/2;crown.position.y=8.05;group.add(crown);
  } else if(index===1){
    for(const side of [-1,1]){const root=new THREE.Group();root.position.set(side*.24,.42,0);headPivot.add(root);for(let branch=0;branch<3;branch+=1){const antler=new THREE.Mesh(new THREE.CylinderGeometry(.025,.05,.8-branch*.12,7),bone);antler.position.set(side*branch*.12,.35+branch*.25,0);antler.rotation.z=side*(.35+branch*.32);root.add(antler);}}
  } else if(index===2){
    const jaw=new THREE.Mesh(new THREE.CapsuleGeometry(.16,.7,5,10),dark);jaw.position.set(0,-.55,-.18);headPivot.add(jaw);
    for(let i=0;i<6;i+=1){const rib=new THREE.Mesh(new THREE.TorusGeometry(.48-i*.035,.025,5,12,Math.PI*1.2),bone);rib.position.set(0,5.25-i*.27,.38);rib.rotation.set(Math.PI/2,0,Math.PI*.4);rib.scale.y=.45;group.add(rib);}
  } else if(index===3){
    const bell=new THREE.Mesh(new THREE.ConeGeometry(.68,1.25,18,1,true),dark);bell.position.set(0,.05,0);bell.rotation.x=Math.PI;headPivot.add(bell);
    const hole=new THREE.Mesh(new THREE.TorusGeometry(.24,.08,8,18),bone);hole.position.set(0,-.13,-.55);headPivot.add(hole);
  } else {
    for(let i=0;i<7;i+=1){const spine=new THREE.Mesh(new THREE.ConeGeometry(.07,.45+i*.025,7),bone);spine.position.set(0,4.1+i*.38,.36);spine.rotation.x=Math.PI/2;group.add(spine);}
  }

  group.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
  const aura=new THREE.PointLight(index===2?0x9e0712:0x301438,1.5,8,2);aura.position.y=6.7;group.add(aura);
  scene.add(group);
  return {group,headPivot,leftArm,rightArm,leftLeg,rightLeg,spec,index,path:[],pathTimer:random()*.5,repelCooldown:0};
}

function createPlayerAvatar(player){
  const group=new THREE.Group();
  const color=player.isBot?0x6ab6c8:[0x7fc8ff,0xffc77f,0xb69aff][player.slot%3];
  const mat=new THREE.MeshStandardMaterial({color,roughness:.75});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.8,5,9),mat);torso.position.y=1.25;group.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.25,12,9),mat);head.position.y=2.15;group.add(head);
  for(const x of [-.22,.22]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,.8,7),mat);leg.position.set(x,.4,0);group.add(leg);}
  const nameCanvas=document.createElement('canvas');nameCanvas.width=256;nameCanvas.height=64;const ctx=nameCanvas.getContext('2d');ctx.fillStyle='rgba(0,0,0,.62)';ctx.fillRect(0,0,256,64);ctx.fillStyle='#fff';ctx.font='bold 26px sans-serif';ctx.textAlign='center';ctx.fillText(player.name+(player.isBot?' · BOT':''),128,40);const tex=new THREE.CanvasTexture(nameCanvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sprite.scale.set(3.4,.85,1);sprite.position.y=2.8;group.add(sprite);
  scene.add(group); return group;
}

const avatars=new Map();
const botPlayers=[];
match.players.forEach(player=>{
  const row=document.createElement('div');row.className='haunted-squad-member';row.innerHTML='<span class="haunted-squad-dot"></span><span></span>';row.querySelector('span:last-child').textContent=`${player.name}${player.isBot?' · BOT':''}`;squadPanel.appendChild(row);
  if(player.id!==match.selfId){const avatar=createPlayerAvatar(player);avatars.set(player.id,avatar);if(player.isBot)botPlayers.push(player);}
});

maze=generateMaze(GRID_SIZE);
startCell={x:1,y:1};
const fromStart=bfsDistances(maze,startCell);
exitCell=farthestCell(fromStart);
distanceFromExit=bfsDistances(maze,exitCell);
startRouteDistance=Math.max(1,distanceFromExit[startCell.y][startCell.x]);
route=findPath(startCell,exitCell);
buildCastle();
const startPos=worldFromCell(startCell);camera.position.set(startPos.x,EYE_HEIGHT,startPos.z);camera.lookAt(startPos.x+CELL_SIZE,EYE_HEIGHT,startPos.z);lastSafePosition.copy(camera.position);

const entities=[];
const spawnCandidates=[];
for(let y=1;y<GRID_SIZE-1;y+=1) for(let x=1;x<GRID_SIZE-1;x+=1){if(maze[y][x]===0 && fromStart[y][x]>startRouteDistance*.35) spawnCandidates.push({x,y,d:fromStart[y][x]});}
spawnCandidates.sort((a,b)=>b.d-a.d);
for(let i=0;i<5;i+=1){
  const entity=createScaryHumanoid(ENTITY_SPECS[i],i);
  const cell=spawnCandidates[Math.min(spawnCandidates.length-1,Math.floor((i/(5))*spawnCandidates.length))]||exitCell;
  const pos=worldFromCell(cell);entity.group.position.set(pos.x,0,pos.z);entities.push(entity);
}

function botPosition(player){
  const elapsedSeconds=Math.max(0,(Date.now()-match.startedAt)/1000);
  const speed=2.7+player.slot*.18;
  const routeIndex=Math.min(route.length-1,Math.floor((elapsedSeconds*speed/CELL_SIZE)+player.slot*.7));
  const nextIndex=Math.min(route.length-1,routeIndex+1);
  const fraction=((elapsedSeconds*speed/CELL_SIZE)+player.slot*.7)%1;
  const a=worldFromCell(route[routeIndex]),b=worldFromCell(route[nextIndex]);
  return a.lerp(b,fraction);
}

function updateSquad(delta){
  match.players.forEach(player=>{
    if(player.id===match.selfId)return;
    const avatar=avatars.get(player.id);if(!avatar)return;
    let target=null;
    if(player.isBot) target=botPosition(player);
    else if(snapshotStates[player.id] && Date.now()-snapshotStates[player.id].updatedAt<5000) target=new THREE.Vector3(snapshotStates[player.id].x,0,snapshotStates[player.id].z);
    if(!target)return;
    const old=avatar.position.clone();avatar.position.lerp(target,Math.min(1,delta*6));
    const move=target.clone().sub(old);if(move.lengthSq()>.001)avatar.rotation.y=Math.atan2(move.x,move.z);
  });
}

function allTargetPositions(){
  const targets=[{id:match.selfId,position:camera.position,local:true}];
  match.players.forEach(player=>{
    if(player.id===match.selfId)return;
    const avatar=avatars.get(player.id);if(avatar)targets.push({id:player.id,position:avatar.position,local:false});
  });
  return targets;
}

function updateProgress(){
  const c=nearestOpenCell(camera.position);const remaining=distanceFromExit[c.y]?.[c.x];
  if(remaining>=0)localProgress=THREE.MathUtils.clamp(1-remaining/startRouteDistance,0,1);
  const pct=Math.round(localProgress*100);progressFill.style.transform=`scaleX(${localProgress})`;progressPercent.textContent=`${pct}%`;
  const lethal=localProgress>=LETHAL_PROGRESS;dangerNote.classList.toggle('lethal',lethal);dangerNote.textContent=lethal?'80% REACHED · THEY CAN TAKE YOU NOW. DO NOT LET THEM TOUCH YOU.':'THEY CAN FOLLOW YOU. THEY CANNOT TAKE YOU UNTIL 80%.';
  if(!lethal) lastSafePosition.copy(camera.position);
}

function updatePlayer(delta){
  const inputX=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));const inputZ=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
  footstepTimer=Math.max(0,footstepTimer-delta);
  if(!inputX&&!inputZ)return;
  camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,camera.up).normalize();desired.set(0,0,0).addScaledVector(forward,inputZ).addScaledVector(right,inputX);if(desired.lengthSq()>0)desired.normalize();const sprint=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&keys.has('KeyW');const speed=sprint?SPRINT_SPEED:WALK_SPEED;desired.multiplyScalar(speed*delta);movePlayer(desired.x,desired.z);
  if(footstepTimer<=0){audio.footstep(sprint);footstepTimer=sprint?.31:.48;}
}

function entityFaceWorld(entity){return entity.headPivot.getWorldPosition(new THREE.Vector3());}
function updateEntities(delta,now){
  const targets=allTargetPositions();
  entities.forEach(entity=>{
    entity.pathTimer-=delta;entity.repelCooldown=Math.max(0,entity.repelCooldown-delta);
    let target=targets[0];let best=Infinity;
    for(const candidate of targets){const d=Math.hypot(candidate.position.x-entity.group.position.x,candidate.position.z-entity.group.position.z);if(d<best){best=d;target=candidate;}}
    if(entity.pathTimer<=0){entity.path=findPath(nearestOpenCell(entity.group.position),nearestOpenCell(target.position));entity.pathTimer=.36+entity.index*.035;}
    let worldTarget=target.position;
    if(entity.path.length>1){worldTarget=worldFromCell(entity.path[1]);if(entity.group.position.distanceTo(worldTarget)<.6)entity.path.shift();}
    pathVector.set(worldTarget.x-entity.group.position.x,0,worldTarget.z-entity.group.position.z);if(pathVector.lengthSq()>.001){pathVector.normalize();entity.group.position.addScaledVector(pathVector,(entity.spec.speed+Math.min(1.1,elapsed/150))*delta);entity.group.rotation.y=Math.atan2(pathVector.x,pathVector.z);}
    const stride=now*(4.5+entity.index*.22);const leg=Math.sin(stride)*.58,arm=Math.sin(stride+Math.PI)*.68;entity.leftLeg.pivot.rotation.x=leg;entity.rightLeg.pivot.rotation.x=-leg;entity.leftArm.pivot.rotation.x=arm+.15;entity.rightArm.pivot.rotation.x=-arm+.15;entity.headPivot.rotation.z=Math.sin(now*(1.6+entity.index*.1))*.1+(Math.random()<.008?(Math.random()-.5)*.5:0);entity.headPivot.rotation.x=Math.sin(now*.9+entity.index)*.08;entity.group.position.y=Math.abs(Math.sin(stride))*.06;

    const localDistance=Math.hypot(entity.group.position.x-camera.position.x,entity.group.position.z-camera.position.z);
    if(localDistance<1.18){
      if(localProgress>=LETHAL_PROGRESS && !jumpscaring && !ended){beginJumpscare(entity);}
      else if(entity.repelCooldown<=0){entity.repelCooldown=2.2;entity.group.position.addScaledVector(pathVector,-CELL_SIZE*1.5);showDanger(`${entity.spec.name} CANNOT TAKE YOU YET.`,1.2);}
    }
  });
  const nearest=Math.min(...entities.map(e=>Math.hypot(e.group.position.x-camera.position.x,e.group.position.z-camera.position.z)));
  damageVignette.style.opacity=String(THREE.MathUtils.clamp(1-nearest/18,0,1)*.42);
}

function beginJumpscare(entity){
  jumpscaring=true;jumpscareElapsed=0;caughtEntity=entity;keys.clear();controls.unlock();jumpscareName.textContent=entity.spec.name;jumpscareOverlay.classList.add('active');audio.scream(entity.index);
}
function updateJumpscare(delta){
  jumpscareElapsed+=delta;if(!caughtEntity)return;
  const face=entityFaceWorld(caughtEntity);const dir=camera.position.clone().sub(face).setY(0);if(dir.lengthSq()<.001)dir.set(0,0,1);dir.normalize();const desiredPos=face.clone().addScaledVector(dir,Math.max(.28,2.3-jumpscareElapsed*1.55));desiredPos.y=face.y;camera.position.lerp(desiredPos,Math.min(1,delta*(5+jumpscareElapsed*5)));camera.lookAt(face);camera.fov=THREE.MathUtils.lerp(camera.fov,105,Math.min(1,delta*4));camera.updateProjectionMatrix();renderer.toneMappingExposure=1.35+Math.sin(jumpscareElapsed*35)*.25;
  if(jumpscareElapsed>1.7)finishCaught();
}
function finishCaught(){
  ended=true;jumpscaring=false;jumpscareOverlay.classList.remove('active');endKicker.textContent='THE CASTLE CLAIMED YOU';endTitle.textContent=`CAUGHT BY ${caughtEntity?.spec.name||'SOMETHING'}.`;endCopy.textContent='The scream is the last thing the castle lets you remember.';restartButton.textContent='QUEUE AGAIN';endOverlay.classList.add('visible');
}
function finishEscape(){
  if(ended)return;ended=true;keys.clear();controls.unlock();endKicker.textContent='ASCENSION COMPLETE';endTitle.textContent='YOU ESCAPED THE HAUNTED CASTLE.';endCopy.textContent='Your squad reached the gate. The five things remain inside.';restartButton.textContent='QUEUE AGAIN';endOverlay.classList.add('visible');
}

async function syncState(delta){
  stateTimer-=delta;if(stateTimer>0)return;stateTimer=.28;
  try{
    const response=await fetch('/api/haunted-ascension/state',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw:camera.rotation.y,progress:localProgress,finished:ended})});
    if(response.ok){const data=await response.json();snapshotStates=data.states||{};}
  }catch{/* transient network errors do not stop the local match */}
}

function checkExit(){const pos=worldFromCell(exitCell);if(Math.hypot(camera.position.x-pos.x,camera.position.z-pos.z)<2.2)finishEscape();}

controls.addEventListener('lock',()=>{if(ended||jumpscaring)return;started=true;paused=false;startOverlay.classList.remove('visible');pauseOverlay.classList.remove('visible');});
controls.addEventListener('unlock',()=>{if(started&&!ended&&!jumpscaring){paused=true;pauseOverlay.classList.add('visible');}});
enterButton.addEventListener('click',async()=>{await audio.start();controls.lock();});
resumeButton.addEventListener('click',async()=>{await audio.start();controls.lock();});
restartButton.addEventListener('click', async () => {
  await fetch('/api/haunted-ascension/match/leave', { method: 'POST', credentials: 'same-origin' });
  window.location.assign('/mode/haunted-ascension/queue');
});
document.querySelectorAll('a[href="/game"]').forEach((link) => {
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    await fetch('/api/haunted-ascension/match/leave', { method: 'POST', credentials: 'same-origin' });
    window.location.assign('/game');
  });
});
window.addEventListener('keydown',event=>{if(event.code==='Escape')return;if(!paused&&!ended&&!jumpscaring)keys.add(event.code);});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

function animate(nowMs){
  requestAnimationFrame(animate);const delta=Math.min(.05,(nowMs-lastFrame)/1000||0);lastFrame=nowMs;const now=nowMs/1000;
  if(dangerTimer>0){dangerTimer-=delta;if(dangerTimer<=0)dangerMessage.classList.remove('visible');}
  if(jumpscaring){updateJumpscare(delta);} else if(started&&!paused&&!ended){elapsed+=delta;updatePlayer(delta);updateSquad(delta);updateProgress();updateEntities(delta,now);checkExit();syncState(delta);}
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
}

main().catch((error) => {
  console.error('Haunted Ascension failed to start:', error);
  window.location.replace('/mode/haunted-ascension/queue');
});
