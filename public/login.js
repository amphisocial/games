'use strict';

const statusElement = document.getElementById('login-status');
const googleContainer = document.getElementById('google-signin');
const devButton = document.getElementById('dev-signin');

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('error', isError);
}

async function postJson(url, payload = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

async function handleGoogleCredential(response) {
  try {
    setStatus('Opening the maze…');
    await postJson('/api/auth/google', { credential: response.credential });
    window.location.assign('/game');
  } catch (error) {
    setStatus(error.message, true);
  }
}

function waitForGoogle(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        window.clearInterval(timer);
        resolve(window.google);
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer);
        reject(new Error('Google Sign-In could not load. Check your connection and content blockers.'));
      }
    }, 100);
  });
}

async function initialize() {
  try {
    const existing = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (existing.ok) {
      window.location.assign('/game');
      return;
    }

    const configResponse = await fetch('/api/config', { credentials: 'same-origin' });
    const config = await configResponse.json();

    if (config.devBypassAuth) {
      devButton.classList.remove('hidden');
      devButton.addEventListener('click', async () => {
        try {
          setStatus('Opening local development mode…');
          await postJson('/api/auth/dev');
          window.location.assign('/game');
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    }

    if (!config.googleClientId) {
      googleContainer.innerHTML = '<div class="config-error">Set GOOGLE_CLIENT_ID in your .env file.</div>';
      setStatus('Google Sign-In is not configured.', true);
      return;
    }

    const google = await waitForGoogle();
    google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    google.accounts.id.renderButton(googleContainer, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      width: Math.min(340, Math.max(240, window.innerWidth - 80)),
    });
    setStatus('Sign in to begin.');
  } catch (error) {
    setStatus(error.message, true);
  }
}

initialize();
