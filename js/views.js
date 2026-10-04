/* CHAO · Vistas — navegación, métricas y estadísticas (antes en app.js) */
function renderStats() {
  const sales = orders.reduce((sum, order) => sum + Number(order.total.replace('Bs ', '')), 0);
  const chartTitle = document.querySelector('.chart-panel h2');
  if (chartTitle) chartTitle.innerHTML = `Bs ${sales.toFixed(2)}`;
  const statsList = document.querySelector('.stats-list');
  if (statsList) statsList.innerHTML = '<div class="empty-state"><strong>Preferencias en preparación</strong><span>Las variaciones se mostrarán con estadísticas detalladas.</span></div>';
  const chart = document.querySelector('.chart');
  if (chart) chart.innerHTML = '<div class="empty-state"><strong>Historial de ventas en preparación</strong><span>El gráfico estará disponible cuando se conecten los datos históricos.</span></div>';
  const chartPeriod = document.querySelector('.chart-period');
  if (chartPeriod) chartPeriod.textContent = 'Día seleccionado';
}


function updateMetric() {
  const metricValues = document.querySelectorAll('.metric-card>strong');
  if (metricValues.length >= 4) {
    metricValues[0].textContent = orders.length;
    const sales = orders.reduce((sum, order) => sum + Number(order.total.replace('Bs ', '')), 0);
    metricValues[1].textContent = `Bs ${sales.toFixed(2)}`;
    metricValues[3].textContent = `Bs ${orders.length ? (sales / orders.length).toFixed(2) : '0.00'}`;
    const navCount = document.querySelector('.nav-count');
    if (navCount) navCount.textContent = orders.length;
    const dineIn = orders.filter((order) => order.type.startsWith('Mesa')).length;
    const donutStrong = document.querySelector('.donut strong');
    if (donutStrong) donutStrong.textContent = orders.length;
    const legendBs = document.querySelectorAll('.donut-legend b');
    if (legendBs.length >= 2) {
      legendBs[0].textContent = dineIn;
      legendBs[1].textContent = orders.length - dineIn;
    }
    const donut = document.querySelector('.donut');
    if (donut) donut.style.background = orders.length ? `conic-gradient(var(--coral) 0 ${(dineIn / orders.length) * 100}%, var(--chart-secondary) ${(dineIn / orders.length) * 100}% 100%)` : 'var(--paper-subtle)';
    const bestSellers = document.querySelector('.best-sellers');
    if (bestSellers) bestSellers.innerHTML = '<div class="empty-state"><strong>Ranking en preparación</strong><span>Los productos más vendidos aparecerán con estadísticas detalladas.</span></div>';
    document.querySelectorAll('.metric-trend').forEach((trend) => { trend.textContent = 'Datos actuales'; });
  }
  const pending = document.querySelector('#pending-metric');
  if (pending) pending.textContent = orders.filter((order) => order.status === 'pendiente' || order.status === 'preparacion').length;
  renderStats();
}

function switchView(view) {
  const validViews = ['inicio', 'pedidos', 'clientes', 'menu', 'estadisticas'];
  if (!validViews.includes(view)) view = 'inicio';
  document.documentElement.removeAttribute('data-initial-view');
  try { localStorage.setItem('chao.current-view', view); } catch { /* Keep the view in memory if storage is unavailable. */ }
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${view}`);
  document.querySelectorAll('.page-view').forEach((page) => page.classList.toggle('active', page.id === `view-${view}`));
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const viewLabel = document.querySelector('#current-view-label');
  if (viewLabel) viewLabel.textContent = { inicio: 'Inicio', pedidos: 'Pedidos', clientes: 'Clientes', menu: 'Menú', estadisticas: 'Estadísticas' }[view] || 'Inicio';
  if (view === 'pedidos') renderBoard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restoreSavedView() {
  const validViews = ['inicio', 'pedidos', 'clientes', 'menu', 'estadisticas'];
  let savedView = window.location.hash.slice(1);
  if (!validViews.includes(savedView)) {
    savedView = 'inicio';
    try { savedView = localStorage.getItem('chao.current-view') || savedView; } catch { /* Use Inicio when storage is unavailable. */ }
  }
  switchView(savedView);
}

