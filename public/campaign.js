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
const multiplayerTab = document.getElementById('multiplayer-tab');
const levelsPanel = document.getElementById('levels-panel');
const gamemodesPanel = document.getElementById('gamemodes-panel');
const multiplayerPanel = document.getElementById('multiplayer-panel');

function setContentTab(tab) {
  const tabs = {
    levels: [levelsTab, levelsPanel],
    gamemodes: [gamemodesTab, gamemodesPanel],
    multiplayer: [multiplayerTab, multiplayerPanel],
  };
  Object.entries(tabs).forEach(([name, [button, panel]]) => {
    const active = name === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    panel.classList.toggle('hidden', !active);
  });
}

levelsTab.addEventListener('click', () => setContentTab('levels'));
gamemodesTab.addEventListener('click', () => setContentTab('gamemodes'));
multiplayerTab.addEventListener('click', () => setContentTab('multiplayer'));
