const AUTH0_CONFIG = {
  domain: 'dev-uiz6yvagbhljjd7v.us.auth0.com',
  clientId: 'CTfLuGG2XLuSHaumSrADumGFXy3i3LS5',
  redirectUri: window.location.origin + '/login.html',
};

let auth0Client = null;

function displayView(name) {
  const loadingDiv = document.getElementById('view-loading');
  const errorDiv   = document.getElementById('view-error');
  const authDiv    = document.getElementById('view-authenticated');
  const unauthDiv  = document.getElementById('view-unauthenticated');
  if (loadingDiv) loadingDiv.hidden = name !== 'loading';
  if (errorDiv)   errorDiv.hidden   = name !== 'error';
  if (authDiv)    authDiv.hidden    = name !== 'authenticated';
  if (unauthDiv)  unauthDiv.hidden  = name !== 'unauthenticated';
}

function setTextContent(id, content) {
  const el = document.getElementById(id);
  if (el) el.textContent = content;
}

function showError(message) {
  setTextContent('view-error', message);
  displayView('error');
  console.error('Auth0 error:', message);
}

async function initAuth0() {
  try {
    if (typeof window.auth0 === 'undefined') {
      throw new Error('Auth0 SDK not loaded. Check your internet connection or script tag.');
    }

    auth0Client = await window.auth0.createAuth0Client({
      domain: AUTH0_CONFIG.domain,
      clientId: AUTH0_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: AUTH0_CONFIG.redirectUri,
      },
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
    });

    window.auth0Client = auth0Client;

    if (location.search.includes('error=')) {
      const params  = new URLSearchParams(location.search);
      const errorMsg = `Error: ${params.get('error')} — ${params.get('error_description')}`;
      showError(errorMsg);
      history.replaceState({}, '', location.pathname);
      return;
    }

    if (location.search.includes('code=') && location.search.includes('state=')) {
      displayView('loading');
      try {
        await auth0Client.handleRedirectCallback();
        history.replaceState({}, '', location.pathname);
      } catch (err) {
        console.error('Callback error', err);
        showError('Login failed. Please try again.');
        return;
      }
    }

    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
      const user = await auth0Client.getUser();
      setTextContent('user-email', user.email || user.name || 'User');
      displayView('authenticated');

      sessionStorage.setItem('kejani_user', JSON.stringify(user));

      try {
        const token = await auth0Client.getTokenSilently();
        sessionStorage.setItem('kejani_token', token);
      } catch (tokenErr) {
        console.warn('Could not retrieve token silently:', tokenErr.message);
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

      const goToListingBtn = document.getElementById('btn-go-to-listing');
      if (goToListingBtn) {
        goToListingBtn.onclick = () => {
          window.location.href = 'new-listing-form.html';
        };
      }

      const redirect = sessionStorage.getItem('auth_redirect');
      if (redirect) {
        sessionStorage.removeItem('auth_redirect');
        window.location.href = redirect;
      }

      return;
    }

    displayView('unauthenticated');

    const loginBtn  = document.getElementById('btn-login');
    const signupBtn = document.getElementById('btn-signup');
    const signupLink = document.getElementById('signup-link');

    if (loginBtn) {
      loginBtn.onclick = () => auth0Client.loginWithRedirect({
        authorizationParams: { redirect_uri: AUTH0_CONFIG.redirectUri },
      });
    }
    if (signupBtn) {
      signupBtn.onclick = () => auth0Client.loginWithRedirect({
        authorizationParams: {
          redirect_uri: AUTH0_CONFIG.redirectUri,
          screen_hint: 'signup',
        },
      });
    }
    if (signupLink) {
      signupLink.onclick = (e) => {
        e.preventDefault();
        auth0Client.loginWithRedirect({
          authorizationParams: {
            redirect_uri: AUTH0_CONFIG.redirectUri,
            screen_hint: 'signup',
          },
        });
      };
    }

  } catch (err) {
    console.error('Auth0 initialization failed:', err);
    showError('Authentication service unavailable. Please try again later. Details: ' + err.message);
  }
}

document.addEventListener('DOMContentLoaded', initAuth0);