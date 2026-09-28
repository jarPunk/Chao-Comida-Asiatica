/* CHAO · Núcleo — estado global, config Supabase, constantes y utilidades (antes en app.js) */
let orders = [];

const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseClient = window.supabase && supabaseConfig.url && supabaseConfig.anonKey
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
let isAuthenticated = !supabaseClient;
const statusOrder = ['pendiente', 'preparacion', 'listo'];
const statusLabels = { pendiente: 'Pendiente', preparacion: 'En preparación', listo: 'Listo', entregado: 'Entregado' };
const iconForType = (type) => type.startsWith('Mesa') ? 'armchair' : 'shopping-bag';
let products = [];
let clients = [];
let families = [];
let variations = [];
let menuFilter = 'todos';
let menuSearch = '';
const chickenExtra = {
  id: 'menu-extra-chicharron', nombre: 'Extra de chicharrón de pollo',
  descripcion: 'Trocitos de pechuga de pollo rebozados y fritos.',
  tipo: 'EXTRA', precio: 5, activo: true, menuOnly: true
};
const mixedDish = {
  id: 'menu-mixto-chaufa', nombre: 'Mixto',
  descripcion: 'Arroz chaufa con chicharrones de pollo y un poco de caldo.',
  tipo: 'PLATO', precio: 35, activo: true, menuOnly: true
};
let selectedOrdersDate = '';
let initialLoadDone = false;
const defaultPreparations = ['Normal', 'Semi picante', 'Picante', 'Súper picante', 'Agridulce'];
const mixedPreparations = ['Normal', 'Semi picante', 'Picante', 'Súper picante', 'Agridulce'];
const onlyNormalProducts = ['Arroz Chaufa', 'Kung Pao'];

function isGyozaProduct(product) {
  const name = String(product?.nombre ?? product ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /gyoza|giosa|gyosa/.test(name);
}
function isPlainFlavorProduct(product) {
  if (isGyozaProduct(product)) return true;
  const name = String(product?.nombre ?? product ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return onlyNormalProducts.some((item) => String(item).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() === name);
}

function getBoliviaDateValue(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function updateCurrentDate() {
  const now = new Date();
  const longDate = new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(now);
  const dateLabel = document.querySelector('#current-date-label');
  const ordersDatePicker = document.querySelector('#orders-date-picker');
  selectedOrdersDate = selectedOrdersDate || getBoliviaDateValue(now);
  if (dateLabel) dateLabel.textContent = longDate.charAt(0).toUpperCase() + longDate.slice(1);
  if (ordersDatePicker) ordersDatePicker.value = selectedOrdersDate;
}

function getBoliviaDayRange(dateValue = selectedOrdersDate || getBoliviaDateValue()) {
  const start = new Date(`${dateValue}T00:00:00-04:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}


function menuEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function normalizeMenuText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isChickenExtra(product) {
  const name = String(product.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /extra/.test(name) && /chicharron/.test(name);
}

function isMixedDish(product) {
  const name = normalizeMenuText(product.nombre);
  return /\bmixto\b/.test(name) || (/arroz|chaufa/.test(name) && /chicharron/.test(name));
}


function isDefaultSizeName(name) {
  return ['normal', 'regular', 'clasico', 'clásico', 'personal', 'base'].includes(String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim());
}

function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function showToast(message = 'Pedido actualizado') {
  const toast = document.querySelector('#toast');
  toast.querySelector('span').textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 2300);
}
