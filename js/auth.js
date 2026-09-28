/* CHAO · Sesión — login y carga inicial de datos (antes en app.js) */
function setAuthUI(authenticated) {
  document.querySelector('#login-screen').classList.toggle('open', !authenticated);
  document.querySelector('#login-screen').setAttribute('aria-hidden', String(authenticated));
  document.querySelector('#app-shell').classList.toggle('locked', !authenticated);
}

async function initAuth() {
  if (!supabaseClient) { setAuthUI(true); return; }
  const { data } = await supabaseClient.auth.getSession();
  isAuthenticated = Boolean(data.session);
  setAuthUI(isAuthenticated);
  if (isAuthenticated && !initialLoadDone) {
    initialLoadDone = true;
    await loadAuthenticatedData();
  }
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    isAuthenticated = Boolean(session);
    setAuthUI(isAuthenticated);
    if (event === 'SIGNED_IN' && isAuthenticated && !initialLoadDone) {
      initialLoadDone = true;
      await loadAuthenticatedData();
    } else if (event === 'SIGNED_OUT') {
      initialLoadDone = false;
    }
  });
}

async function loadAuthenticatedData() {
  await loadProducts();
  await Promise.all([loadOrders(), loadClients()]);
}


document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorElement = document.querySelector('#login-error');
  errorElement.textContent = '';
  if (!supabaseClient) { errorElement.textContent = 'Configura Supabase para iniciar sesión.'; return; }
  const { error } = await supabaseClient.auth.signInWithPassword({ email: form.elements.email.value, password: form.elements.password.value });
  if (error) errorElement.textContent = 'Correo o contraseña incorrectos.';
});

updateCurrentDate();
renderHomeOrders();
renderClients();
renderProducts();
updateMetric();
refreshIcons();
initAuth();

