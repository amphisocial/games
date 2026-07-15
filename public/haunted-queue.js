'use strict';

const timer = document.getElementById('queue-timer');
const statusCopy = document.getElementById('queue-status-copy');
const slots = [...document.querySelectorAll('.queue-slot')];
const quitButton = document.getElementById('quit-queue');
let stopped = false;
let pollHandle = 0;

function renderRoom(room) {
  const seconds = Math.max(0, Math.ceil((room.remainingMs || 0) / 1000));
  timer.textContent = String(seconds).padStart(2, '0');
  const humans = room.humans || [];
  slots.forEach((slot, index) => {
    const human = humans[index];
    slot.classList.toggle('filled', Boolean(human));
    slot.classList.toggle('waiting', !human);
    slot.querySelector('span').textContent = human ? human.name : 'Searching…';
  });
  statusCopy.textContent = room.humanCount === 1
    ? 'You are in the queue. Waiting for two more players…'
    : room.humanCount === 2
      ? 'Another player joined. One slot remains…'
      : 'Squad found. Entering the castle…';

  if (room.status === 'playing' && room.matchId) {
    stopped = true;
    window.clearTimeout(pollHandle);
    window.location.replace(`/mode/haunted-ascension/play?match=${encodeURIComponent(room.matchId)}`);
  }
}

async function joinQueue() {
  const response = await fetch('/api/haunted-ascension/queue/join', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error('Could not join matchmaking.');
  renderRoom(await response.json());
}

async function poll() {
  if (stopped) return;
  try {
    const response = await fetch('/api/haunted-ascension/queue/status', { credentials: 'same-origin' });
    if (response.status === 404) {
      await joinQueue();
    } else if (!response.ok) {
      throw new Error('Matchmaking status unavailable.');
    } else {
      renderRoom(await response.json());
    }
  } catch (error) {
    statusCopy.textContent = error.message;
  }
  if (!stopped) pollHandle = window.setTimeout(poll, 700);
}

quitButton.addEventListener('click', async () => {
  stopped = true;
  window.clearTimeout(pollHandle);
  quitButton.disabled = true;
  try {
    await fetch('/api/haunted-ascension/queue/quit', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.assign('/game');
  }
});

joinQueue().then(poll).catch((error) => {
  statusCopy.textContent = error.message;
  quitButton.disabled = false;
});
