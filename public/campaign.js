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
