const AUTH0_CONFIG = {
  domain:      'dev-uiz6yvagbhljjd7v.us.auth0.com',
  clientId:    'CTfLuGG2XLuSHaumSrADumGFXy3i3LS5',
  redirectUri: window.location.origin + '/login.html',
};

let auth0Client = null;

function showView(name) {
  ['loading', 'error', 'authenticated', 'unauthenticated'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== name);
  });
}

function showFieldError(msg) {
  const el = document.getElementById('lc-field-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearFieldError() {
  const el = document.getElementById('lc-field-error');
  if (el) el.classList.add('hidden');
}

function showErrorView(msg) {
  const box = document.getElementById('view-error-msg');
  if (box) box.textContent = msg;
  showView('error');
  console.error('Auth0 error:', msg);
}

function setUserDisplay(user) {
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = user.email || user.name || 'User';

  const avatarEl = document.getElementById('lc-avatar-initials');
  if (avatarEl) {
    const name = user.name || user.email || 'KF';
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    avatarEl.textContent = initials;
  }
}

async function initAuth0() {
  try {
    if (typeof window.auth0 === 'undefined') {
      throw new Error('Auth0 SDK not loaded. Check your internet connection.');
    }

    auth0Client = await window.auth0.createAuth0Client({
      domain:      AUTH0_CONFIG.domain,
      clientId:    AUTH0_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: AUTH0_CONFIG.redirectUri,
      },
      cacheLocation:    'localstorage',
      useRefreshTokens: true,
    });

    window.auth0Client = auth0Client;

    if (location.search.includes('error=')) {
      const params = new URLSearchParams(location.search);
      showErrorView(`${params.get('error_description') || params.get('error')}`);
      history.replaceState({}, '', location.pathname);
      return;
    }

    if (location.search.includes('code=') && location.search.includes('state=')) {
      showView('loading');
      try {
        await auth0Client.handleRedirectCallback();
        history.replaceState({}, '', location.pathname);
      } catch (err) {
        showErrorView('Login failed. Please try again.');
        return;
      }
    }

    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
      const user = await auth0Client.getUser();
      setUserDisplay(user);
      showView('authenticated');

      sessionStorage.setItem('kejani_user', JSON.stringify(user));
      try {
        const token = await auth0Client.getTokenSilently();
        sessionStorage.setItem('kejani_token', token);
      } catch (e) {
        console.warn('Token silent refresh failed:', e.message);
      }

      const logoutBtn = document.getElementById('btn-logout');
      if (logoutBtn) {
        logoutBtn.onclick = () => {
          sessionStorage.removeItem('kejani_user');
          sessionStorage.removeItem('kejani_token');
          auth0Client.logout({
            logoutParams: { returnTo: window.location.origin + '/login.html' },
          });
        };
      }

      const goBtn = document.getElementById('btn-go-to-listing');
      if (goBtn) {
        goBtn.onclick = () => { window.location.href = 'new-listing-form.html'; };
      }

      const redirect = sessionStorage.getItem('auth_redirect');
      if (redirect) {
        sessionStorage.removeItem('auth_redirect');
        window.location.href = redirect;
      }

      return;
    }

    showView('unauthenticated');
    bindUnauthenticatedButtons();

  } catch (err) {
    console.error('Auth0 init failed:', err);
    showErrorView('Authentication service unavailable. Details: ' + err.message);
  }
}

function bindUnauthenticatedButtons() {

  const googleBtn = document.getElementById('btn-google');
  if (googleBtn) {
    googleBtn.onclick = () => auth0Client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: AUTH0_CONFIG.redirectUri,
        connection:   'google-oauth2',
      },
    });
  }

  const appleBtn = document.getElementById('btn-apple');
  if (appleBtn) {
    appleBtn.onclick = () => auth0Client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: AUTH0_CONFIG.redirectUri,
        connection:   'apple',
      },
    });
  }

  const loginBtn = document.getElementById('btn-login');
  if (loginBtn) {
    loginBtn.onclick = () => handleEmailPasswordLogin();
  }

  const emailInput = document.getElementById('lc-email-input');
  const passInput  = document.getElementById('lc-password-input');

  if (emailInput) {
    emailInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (passInput) passInput.focus();
      }
    });
    emailInput.addEventListener('input', clearFieldError);
  }

  if (passInput) {
    passInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEmailPasswordLogin();
      }
    });
    passInput.addEventListener('input', clearFieldError);
  }

  const forgotBtn = document.getElementById('btn-forgot');
  if (forgotBtn) {
    forgotBtn.onclick = (e) => {
      e.preventDefault();
      handleForgotPassword();
    };
  }

  const signupLink = document.getElementById('signup-link');
  if (signupLink) {
    signupLink.onclick = (e) => {
      e.preventDefault();
      auth0Client.loginWithRedirect({
        authorizationParams: {
          redirect_uri: AUTH0_CONFIG.redirectUri,
          screen_hint:  'signup',
        },
      });
    };
  }
}

async function handleEmailPasswordLogin() {
  clearFieldError();

  const emailEl = document.getElementById('lc-email-input');
  const passEl  = document.getElementById('lc-password-input');
  const email   = emailEl ? emailEl.value.trim() : '';
  const password = passEl ? passEl.value : '';

  if (!email) {
    showFieldError('Please enter your email address.');
    emailEl && emailEl.focus();
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    showFieldError('Please enter a valid email address.');
    emailEl && emailEl.focus();
    return;
  }

  if (!password) {
    showFieldError('Please enter your password.');
    passEl && passEl.focus();
    return;
  }

  const loginBtn = document.getElementById('btn-login');
  if (loginBtn) {
    loginBtn.disabled    = true;
    loginBtn.textContent = 'Signing in...';
  }

  try {
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        redirect_uri:  AUTH0_CONFIG.redirectUri,
        login_hint:    email,
        connection:    'Username-Password-Authentication',
      },
    });
  } catch (err) {
    console.error('Email login error:', err);
    showFieldError('Sign in failed. Please check your credentials and try again.');
    if (loginBtn) {
      loginBtn.disabled    = false;
      loginBtn.textContent = 'Sign in';
    }
  }
}

async function handleForgotPassword() {
  const emailEl = document.getElementById('lc-email-input');
  const email   = emailEl ? emailEl.value.trim() : '';

  if (!email) {
    showFieldError('Enter your email address above, then click "Forgot password?"');
    emailEl && emailEl.focus();
    return;
  }

  try {
    await fetch(`https://${AUTH0_CONFIG.domain}/dbconnections/change_password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:  AUTH0_CONFIG.clientId,
        email:      email,
        connection: 'Username-Password-Authentication',
      }),
    });
    showFieldError('If this email exists, a reset link has been sent. Check your inbox.');
  } catch (err) {
    showFieldError('Could not send reset email. Please try again later.');
  }
}

document.addEventListener('DOMContentLoaded', initAuth0);