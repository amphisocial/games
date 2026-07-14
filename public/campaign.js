'use strict';

const intro = document.getElementById('campaign-intro');
const levelSelect = document.getElementById('level-select');
const showLevelsButton = document.getElementById('show-levels-button');
const backButton = document.getElementById('back-to-title');
const logoutButton = document.getElementById('campaign-logout');

showLevelsButton.addEventListener('click', () => {
  intro.classList.add('hidden');
  levelSelect.classList.remove('hidden');
});

backButton.addEventListener('click', () => {
  levelSelect.classList.add('hidden');
  intro.classList.remove('hidden');
});

logoutButton.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.assign('/');
});

const levelsTab = document.getElementById('levels-tab');
const gamemodesTab = document.getElementById('gamemodes-tab');
const levelsPanel = document.getElementById('levels-panel');
const gamemodesPanel = document.getElementById('gamemodes-panel');

function setContentTab(tab) {
  const showLevels = tab === 'levels';
  levelsTab.classList.toggle('active', showLevels);
  gamemodesTab.classList.toggle('active', !showLevels);
  levelsTab.setAttribute('aria-selected', String(showLevels));
  gamemodesTab.setAttribute('aria-selected', String(!showLevels));
  levelsPanel.classList.toggle('hidden', !showLevels);
  gamemodesPanel.classList.toggle('hidden', showLevels);
}

levelsTab.addEventListener('click', () => setContentTab('levels'));
gamemodesTab.addEventListener('click', () => setContentTab('gamemodes'));
