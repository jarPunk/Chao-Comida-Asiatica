let orders = [];

const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseClient = window.supabase && supabaseConfig.url && supabaseConfig.anonKey
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
let isAuthenticated = !supabaseClient;
const statusOrder = ['pendiente', 'preparacion', 'listo'];
const statusLabels = { pendiente: 'Pendiente', preparacion: 'En preparación', listo: 'Listo' };
const iconForType = (type) => type.startsWith('Mesa') ? 'armchair' : 'shopping-bag';
let products = [];
let clients = [];
let families = [];
let variations = [];
let menuFilter = 'todos';
let menuSearch = '';
const menuFilters = ['todos', 'platos', 'bebidas', 'variaciones', 'extras'];
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

function preparationNames(product) {
  const saved = product.producto_variaciones?.map((item) => item.variaciones?.nombre).filter(Boolean) || [];
  if (isMixedDish(product)) return [...new Set([...mixedPreparations, ...saved])].filter((name) => normalizeMenuText(name).trim() !== 'dulce');
  if (saved.length) return saved;
  return onlyNormalProducts.includes(product.nombre) ? ['Normal'] : defaultPreparations;
}

function allowedPreparationIds(product) {
  const saved = product.producto_variaciones?.map((item) => item.variacion_id) || [];
  if (saved.length) return saved;
  const names = onlyNormalProducts.includes(product.nombre) ? ['Normal'] : defaultPreparations;
  return variations.filter((variation) => names.includes(variation.nombre)).map((variation) => variation.id);
}

function mapOrder(row) {
  const customer = row.clientes ? `${row.clientes.nombres} ${row.clientes.apellidos}` : 'Cliente ocasional';
  const items = (row.detalle_pedido || []).map((detail) => {
    const product = detail.productos?.nombre || 'Producto';
    const productData = products.find((item) => item.nombre === product);
    const size = findOrderSize(productData, detail);
    const sizeLabel = size?.nombre ? ` · ${size.nombre}` : '';
    const variation = detail.variaciones?.nombre && detail.variaciones.nombre !== 'Normal' ? ` ${detail.variaciones.nombre}` : '';
    return `${detail.cantidad} ${product}${sizeLabel}${variation}`;
  }).join(' · ') || 'Sin productos registrados';
  const status = { PENDIENTE: 'pendiente', EN_PREPARACION: 'preparacion', LISTO: 'listo' }[row.estado] || 'pendiente';
  return {
    id: String(row.numero_ticket || row.id).padStart(6, '0'),
    databaseId: row.id,
    customer,
    type: row.tipo_pedido === 'MESA' ? `Mesa ${row.mesas?.numero || ''}`.trim() : 'Para llevar',
    items,
    details: row.detalle_pedido || [],
    notes: row.notas || '',
    total: `Bs ${Number(row.total || 0).toFixed(2)}`,
    status,
    label: statusLabels[status],
    payment: row.estado_pago
  };
}

function findOrderSize(product, detail) {
  const sizes = product?.producto_tamanos || [];
  return sizes.find((item) => String(item.id) === String(detail.tamano_id))
    || sizes.find((item) => Number(item.precio) === Number(detail.precio_unitario));
}

async function loadOrders() {
  if (!supabaseClient || !isAuthenticated) return;
  selectedOrdersDate = selectedOrdersDate || getBoliviaDateValue();
  const { start, end } = getBoliviaDayRange();
  const orderQuery = (includeSize) => supabaseClient
    .from('pedidos')
    .select(`id, numero_ticket, tipo_pedido, estado, estado_pago, total, notas, created_at, clientes(nombres, apellidos), mesas(numero), detalle_pedido(cantidad, ${includeSize ? 'tamano_id, ' : ''}precio_unitario, productos(nombre), variaciones(nombre))`)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false });
  let { data, error } = await orderQuery(true);
  if (error) ({ data, error } = await orderQuery(false));
  if (error) { showToast('No se pudieron cargar los pedidos'); console.error(error); return; }
  orders = (data || []).map(mapOrder);
  renderHomeOrders();
  renderBoard();
  updateMetric();
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

function servingLabel(product) {
  if (product.tipo === 'BEBIDA' || product.tipo === 'EXTRA' || isChickenExtra(product)) return '';
  if (isMixedDish(product)) return 'Plato llano · Poco caldo';
  return /arroz|chaufa/.test(normalizeMenuText(product.nombre)) ? 'Plato hondo · Sin caldo' : 'Plato hondo · Con caldo';
}

// Decorative illustrations use only markup and CSS; no media is stored or requested.
function menuIllustration(product) {
  const name = String(product.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (product.tipo === 'BEBIDA') {
    const palette = /limon|sprite/.test(name) ? 'lime' : /naranja|mango|maracuy/.test(name) ? 'orange' : /cola|cafe/.test(name) ? 'cola' : /frutilla|fresa|jamaica/.test(name) ? 'berry' : 'fresh';
    return `<div class="menu-visual beverage-${palette}" style="${drinkColorStyle(product)}" aria-hidden="true"><div class="drink-art"><span class="drink-straw"></span><span class="drink-glass"><span class="drink-liquid"></span><span class="drink-ice ice-one"></span><span class="drink-ice ice-two"></span><span class="drink-ice ice-three"></span></span><span class="drink-garnish"></span></div></div>`;
  }
  const extra = isChickenExtra(product);
  const chicken = /chicharron/.test(name);
  const hasShrimp = /\bcamaron(?:es)?\b/.test(name);
  const shrimpMarkup = hasShrimp ? '<span class="shrimp shrimp-one"></span><span class="shrimp shrimp-two"></span><span class="shrimp shrimp-three"></span>' : '';
  const kind = extra ? 'chicken-extra' : /arroz|chaufa/.test(name) ? 'rice' : 'noodles';
  const grains = Array.from({ length: 50 }, (_, i) => `<span class="rice-grain" style="--x:${9 + (i * 23 % 80)}%;--y:${8 + (i * 37 % 81)}%;--r:${i * 47}deg"></span>`).join('');
  if (isMixedDish(product)) {
    return `<div class="menu-visual dish-rice dish-mixed" aria-hidden="true"><div class="food-art"><span class="chopstick chopstick-one"></span><span class="chopstick chopstick-two"></span><div class="food-plate"><span class="mixed-broth"></span><div class="food-serving">${grains}<span class="food-greens"></span>${shrimpMarkup}</div><div class="mixed-chicken crispy-chicken"><span class="food-piece piece-one"></span><span class="food-piece piece-two"></span><span class="food-piece piece-three"></span><span class="food-piece piece-four"></span></div></div></div></div>`;
  }
  const noodles = Array.from({ length: 13 }, (_, i) => `<span class="noodle-strand" style="--x:${5 + (i * 19 % 46)}%;--y:${8 + (i * 29 % 60)}%;--r:${(i * 37 % 120) - 60}deg"></span>`).join('');
  return `<div class="menu-visual dish-${kind}${!extra ? ' deep-dish' : ''}${chicken ? ' crispy-chicken' : ''}${/yakisoba/.test(name) ? ' yakisoba' : ''}" aria-hidden="true"><div class="food-art"><span class="chopstick chopstick-one"></span><span class="chopstick chopstick-two"></span><div class="food-plate"><div class="food-serving">${kind === 'rice' ? grains : ''}${kind === 'noodles' ? `<span class="noodle-nest">${noodles}</span>` : ''}${hasShrimp ? shrimpMarkup : '<span class="food-piece piece-one"></span><span class="food-piece piece-two"></span><span class="food-piece piece-three"></span><span class="food-piece piece-four"></span>'}${extra ? '<span class="food-piece piece-five"></span><span class="food-piece piece-six"></span>' : '<span class="food-greens"></span>'}</div></div></div></div>`;
}

function productMarkup(product) {
  const illustration = menuIllustration(product);
  const isExtra = product.tipo === 'EXTRA' || isChickenExtra(product);
  const preparations = product.tipo === 'BEBIDA' || isExtra ? [] : preparationNames(product);
  const serving = servingLabel(product);
  product = { ...product, nombre: menuEscape(product.nombre), descripcion: menuEscape(product.descripcion), id: menuEscape(product.id) };
  const isDrink = product.tipo === 'BEBIDA';
  const sizes = isDrink || isExtra ? [] : product.producto_tamanos || [];
  const sizeMarkup = sizes.map((size) => `<span>${menuEscape(size.nombre)}: Bs ${Number(size.precio).toFixed(2)}</span>`).join('') || `<span>Bs ${Number(product.precio || 0).toFixed(2)}</span>`;
  const prepMarkup = preparations.map((p) => {
    const slug = p.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    return `<span class="prep-badge prep-${menuEscape(slug)}">${menuEscape(p)}</span>`;
  }).join('') || '<span class="prep-badge">Sin preparación definida</span>';
  return `<article class="menu-item-card ${product.activo ? '' : 'unavailable'}">${illustration}<div class="menu-card-content"><div class="menu-card-meta"><span class="menu-category ${isDrink ? 'drink' : ''}">${isDrink ? 'Bebida' : isExtra ? 'Extra' : 'Plato'}</span><span class="menu-availability">${product.activo ? 'Disponible' : 'No disponible'}</span></div><h3>${product.nombre}</h3><div class="variation-row">${sizeMarkup}</div>${product.descripcion ? `<p>${product.descripcion}</p>` : ''}${serving ? `<p class="serving-note">${serving}</p>` : ''}${!isDrink && !isExtra && preparations.length ? (preparations.length > 1 ? `<details class="menu-preparations"><summary>${preparations.length} preparaciones disponibles</summary><div class="preparation-list">${prepMarkup}</div></details>` : `<div class="preparation-list">${prepMarkup}</div>`) : ''}<div class="menu-actions" ${product.menuOnly ? 'hidden' : ''}><button class="edit-button" data-edit-product="${product.id}" title="Editar ${product.nombre}" aria-label="Editar ${product.nombre}"><i data-lucide="pencil"></i><span>Editar</span></button><button class="delete-item-button" data-delete-product="${product.id}" title="Eliminar ${product.nombre}" aria-label="Eliminar ${product.nombre}"><i data-lucide="trash-2"></i></button></div></div></article>`;
}

function renderProducts() {
  const grid = document.querySelector('#view-menu .menu-grid');
  if (!grid) return;
  const menuProducts = [...products];
  if (!products.some(isMixedDish)) menuProducts.push(mixedDish);
  if (!products.some(isChickenExtra)) menuProducts.push(chickenExtra);
  const visibleProducts = document.body.classList.contains('customer-menu') ? menuProducts.filter((product) => product.activo) : menuProducts;
  const menuButtons = document.querySelectorAll('#view-menu .menu-tabs button');
  if (menuButtons.length >= 3) {
    menuButtons[0].innerHTML = `Todos <b>${visibleProducts.length}</b>`;
    menuButtons[1].innerHTML = `Platos <b>${visibleProducts.filter((product) => product.tipo === 'PLATO' && !isChickenExtra(product)).length}</b>`;
    menuButtons[2].innerHTML = `Bebidas <b>${visibleProducts.filter((product) => product.tipo === 'BEBIDA').length}</b>`;
  }
  const filteredProducts = visibleProducts.filter((product) => {
    if (menuSearch && !normalizeMenuText(`${product.nombre} ${product.descripcion || ''}`).includes(normalizeMenuText(menuSearch))) return false;
    if (menuFilter === 'extras') return product.tipo === 'EXTRA' || isChickenExtra(product);
    if (menuFilter === 'platos') return product.tipo === 'PLATO' && !isChickenExtra(product);
    if (menuFilter === 'bebidas') return product.tipo === 'BEBIDA';
    if (menuFilter === 'variaciones') return product.tipo === 'PLATO' && !isChickenExtra(product) && preparationNames(product).length > 1;
    return true;
  });
  menuButtons.forEach((button, index) => {
    const selected = menuFilters[index] === menuFilter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const count = document.querySelector('#menu-result-count');
  if (count) count.textContent = `${filteredProducts.length} ${filteredProducts.length === 1 ? 'producto' : 'productos'}`;
  grid.innerHTML = filteredProducts.length ? filteredProducts.map(productMarkup).join('') : '<div class="empty-state"><i data-lucide="search"></i><strong>No encontramos productos</strong><span>Prueba con otro nombre o categoría.</span><button type="button" class="secondary-button" data-reset-menu>Ver toda la carta</button></div>';
  refreshIcons();
}

function toggleCustomerMenu(force) {
  const active = typeof force === 'boolean' ? force : !document.body.classList.contains('customer-menu');
  document.body.classList.toggle('customer-menu', active);
  const button = document.querySelector('#show-customer-menu');
  button?.setAttribute('aria-pressed', String(active));
  if (button) button.querySelector('span').textContent = active ? 'Volver a administrar' : 'Mostrar menú';
  renderProducts();
}

document.querySelector('#show-customer-menu')?.addEventListener('click', () => toggleCustomerMenu());
document.querySelector('#menu-search')?.addEventListener('input', (event) => {
  menuSearch = event.target.value.trim();
  renderProducts();
});
document.querySelector('#view-menu')?.addEventListener('click', (event) => {
  const layout = event.target.closest('[data-menu-layout]');
  if (layout) {
    document.querySelector('#view-menu').classList.toggle('menu-list-view', layout.dataset.menuLayout === 'list');
    document.querySelectorAll('[data-menu-layout]').forEach((button) => button.setAttribute('aria-pressed', String(button === layout)));
  }
  if (event.target.closest('[data-reset-menu]')) {
    menuSearch = '';
    menuFilter = 'todos';
    document.querySelector('#menu-search').value = '';
    renderProducts();
    document.querySelector('#menu-search').focus();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('customer-menu')) toggleCustomerMenu(false);
});

function sizeRowsMarkup(sizes = []) {
  return sizes.map((size) => `<div class="size-row"><input class="size-name" value="${size.nombre}" placeholder="Tamaño" /><input class="size-price" type="number" min="0" step="0.01" value="${size.precio}" placeholder="Precio" /><button type="button" class="remove-size" aria-label="Quitar tamaño"><i data-lucide="minus"></i></button></div>`).join('');
}

function readSizeRows() {
  return [...document.querySelectorAll('#product-form .size-row')].map((row) => ({ nombre: row.querySelector('.size-name').value.trim(), precio: Number(row.querySelector('.size-price').value) })).filter((size) => size.nombre && size.precio >= 0);
}

function updateProductTypeFields(form) {
  const sizesField = form.querySelector('[data-sizes-field]');
  if (!sizesField) return;
  const isDrink = form.elements.tipo.value === 'BEBIDA';
  updateDrinkColorPreview(form);
  sizesField.hidden = isDrink;
  sizesField.style.display = isDrink ? 'none' : 'grid';
}

async function loadProducts() {
  if (!supabaseClient || !isAuthenticated) return;
  try {
    const [prodRes, varRes, catRes] = await Promise.all([
      supabaseClient.from('productos').select('id, nombre, descripcion, precio, tipo, activo, producto_tamanos(id, nombre, precio, activo)').order('nombre'),
      supabaseClient.from('producto_variaciones').select('producto_id, variacion_id, variaciones(id, nombre)'),
      supabaseClient.from('variaciones').select('id, nombre').eq('activa', true).order('id')
    ]);

    if (prodRes.error) throw prodRes.error;
    products = (prodRes.data || []).map(decodeDrinkProduct);
    if (!varRes.error && varRes.data) {
      products.forEach((product) => {
        product.producto_variaciones = varRes.data.filter((item) => item.producto_id === product.id);
      });
    }
    variations = catRes.data || [];
    if (!variations.length && !varRes.error && varRes.data) {
      variations = varRes.data.map((item) => item.variaciones).filter(Boolean).filter((v, i, list) => list.findIndex((x) => x.id === v.id) === i);
    }
  } catch (err) {
    console.error(err);
    showToast('No se pudo cargar el menú');
  } finally {
    renderProducts();
    renderOrderProductOptions();
  }
}

async function loadClients() {
  if (!supabaseClient || !isAuthenticated) return;
  try {
    const [cliRes, famRes] = await Promise.all([
      supabaseClient.from('clientes').select('id, nombres, apellidos, telefono, familia_id, relacion_familiar, activo, created_at').order('apellidos'),
      supabaseClient.from('familias').select('id, nombre').order('nombre')
    ]);
    if (cliRes.error) throw cliRes.error;
    clients = cliRes.data || [];
    families = famRes.data || [];
  } catch (err) {
    console.error(err);
    showToast('No se pudieron cargar los clientes');
  } finally {
    renderClientPicker();
    renderClients();
  }
}

function renderClientPicker() {
  const picker = document.querySelector('[data-client-picker]');
  if (!picker) return;
  picker.querySelector('.client-results').innerHTML = '<button type="button" data-client-id="">Cliente ocasional</button>' + clients.filter((client) => client.activo).map((client) => `<button type="button" data-client-id="${client.id}"><strong>${client.nombres} ${client.apellidos}</strong><small>${client.telefono || 'Sin celular registrado'}</small></button>`).join('');
}

function setupClientSearch() {
  const form = document.querySelector('#order-form');
  if (!form || form.querySelector('[data-client-picker]')) return;
  const clientLabel = form.querySelector('label');
  const picker = document.createElement('div');
  picker.dataset.clientPicker = 'true';
  picker.className = 'client-picker';
  picker.innerHTML = '<input type="search" data-client-search placeholder="Buscar nombre o celular" autocomplete="off" /><input type="hidden" name="cliente_id" value="" /><div class="client-results"></div>';
  clientLabel.replaceChildren(document.createTextNode('Cliente'), picker);
  const search = picker.querySelector('[data-client-search]');
  search.addEventListener('focus', () => picker.querySelector('.client-results').classList.add('open'));
  search.addEventListener('input', (event) => {
    const term = event.target.value.trim().toLowerCase();
    picker.querySelector('.client-results').classList.add('open');
    picker.querySelectorAll('.client-results button').forEach((button) => { button.hidden = Boolean(term) && !button.textContent.toLowerCase().includes(term); });
  });
  picker.querySelector('.client-results').addEventListener('click', (event) => {
    const option = event.target.closest('[data-client-id]');
    if (!option) return;
    picker.querySelector('[name="cliente_id"]').value = option.dataset.clientId;
    search.value = option.dataset.clientId ? option.querySelector('strong').textContent : '';
    picker.querySelector('.client-results').classList.remove('open');
    updateOrderDetailsSummary();
  });
  if (!picker.querySelector('[data-quick-client]')) picker.insertAdjacentHTML('beforeend', '<button type="button" class="secondary-button quick-client-button" data-quick-client>＋ Nuevo cliente</button>');
  renderClientPicker();
}

function renderClients() {
  const clientView = document.querySelector('#view-clientes');
  const body = clientView?.querySelector('table tbody');
  if (!body) return;
  const active = clients.filter((client) => client.activo).length;
  clientView.querySelector('.client-summary > div:first-child strong').textContent = active;
  clientView.querySelector('.client-summary > div:nth-child(2) strong').textContent = new Set(clients.filter((client) => client.familia_id).map((client) => client.familia_id)).size;
  clientView.querySelector('.client-summary > div:nth-child(3) strong').textContent = clients.filter((client) => String(client.telefono || '').trim()).length;
  body.innerHTML = clients.length
    ? clients.map((client) => `<tr>
        <td><div class="table-person"><span class="avatar peach">${(client.nombres[0] || '').toUpperCase()}${(client.apellidos[0] || '').toUpperCase()}</span><strong>${client.nombres} ${client.apellidos}</strong></div></td>
        <td>${families.find((family) => family.id === client.familia_id)?.nombre || '—'}</td>
        <td>${client.relacion_familiar || '—'}</td>
        <td>${client.telefono || '—'}</td>
        <td><span class="status-tag ${client.activo ? 'active-tag' : 'inactive-tag'}">${client.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn-action" data-edit-client="${client.id}" title="Editar cliente" aria-label="Editar cliente"><i data-lucide="pencil"></i></button>
            <button class="btn-action danger" data-delete-client="${client.id}" title="Eliminar permanentemente" aria-label="Eliminar cliente"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="6"><div class="empty-state"><i data-lucide="users"></i><strong>No hay clientes registrados</strong><span>Registra el primero para empezar.</span></div></td></tr>';
  refreshIcons();
}

function openClientModal(client = null) {
  const form = document.querySelector('#client-form');
  form.reset();
  form.elements.id.value = client?.id || '';
  form.elements.nombres.value = client?.nombres || '';
  form.elements.apellidos.value = client?.apellidos || '';
  form.elements.telefono.value = client?.telefono || '';
  form.elements.familia.innerHTML = '<option value="">Sin familia</option>' + families.map((family) => `<option value="${family.id}">${family.nombre}</option>`).join('');
  form.elements.familia.value = client?.familia_id || '';
  form.elements.relacion_familiar.value = client?.relacion_familiar || '';
  form.elements.activo.checked = client?.activo ?? true;
  document.querySelector('#client-modal-title').textContent = client ? 'Editar cliente' : 'Nuevo cliente';
  const deactivate = document.querySelector('[data-deactivate-client]');
  const deletePerm = document.querySelector('[data-delete-client-perm]');
  if (deactivate) deactivate.hidden = !client || !client.activo;
  if (deletePerm) deletePerm.hidden = !client;
  showDialog('client-modal');
}

function closeClientModal() { hideDialog('client-modal'); }

async function deactivateClient(id) {
  if (!window.confirm('¿Cerrar/Desactivar este cliente? Se conservará su historial.')) return;
  const { error } = await supabaseClient.from('clientes').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('No se pudo desactivar el cliente'); console.error(error); return; }
  closeClientModal();
  await loadClients();
  showToast('Cliente desactivado');
}

async function deleteClientPermanently(id) {
  const client = clients.find((c) => String(c.id) === String(id));
  const name = client ? `${client.nombres} ${client.apellidos}` : 'este cliente';
  if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente a "${name}" de la base de datos?\n\nEsta acción no se puede deshacer.`)) return;
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('clientes').delete().eq('id', id);
  if (error) {
    console.error(error);
    if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
      alert(`No se puede eliminar permanentemente a "${name}" porque tiene pedidos asociados en la base de datos.\n\nPuedes marcarlo como "Inactivo" en su lugar.`);
    } else {
      showToast('No se pudo eliminar el cliente. Revisa las políticas de permisos RLS.');
    }
    return;
  }
  closeClientModal();
  await loadClients();
  showToast('Cliente eliminado permanentemente');
}

function openProductModal(product = null) {
  if (product) product = decodeDrinkProduct(product);
  const modal = document.querySelector('#product-modal');
  const form = document.querySelector('#product-form');
  form.reset();
  const previousError = form.querySelector('.form-error');
  if (previousError) previousError.textContent = '';
  form.elements.id.value = product?.id || '';
  form.elements.nombre.value = product?.nombre || '';
  form.elements.descripcion.value = product?.descripcion || '';
  form.elements.precio.value = product?.precio ?? '';
  form.elements.tipo.value = product?.tipo || 'PLATO';
  form.elements.activo.checked = product?.activo ?? true;
  let sizesField = form.querySelector('[data-sizes-field]');
  if (!sizesField) {
    sizesField = document.createElement('div');
    sizesField.dataset.sizesField = 'true';
    sizesField.innerHTML = '<span class="field-title">Tamaños y precios</span><div class="sizes-editor"></div><button type="button" class="secondary-button add-size"><i data-lucide="plus"></i>Añadir tamaño</button><span class="preparation-label">Preparaciones permitidas</span><div class="preparations-editor"></div>';
    form.querySelector('.modal-body').insertBefore(sizesField, form.querySelector('.checkbox-label'));
  }
  sizesField.querySelector('.sizes-editor').innerHTML = sizeRowsMarkup(product?.producto_tamanos || []);
  if (!product) sizesField.querySelector('.add-size').click();
  const isDrink = product?.tipo === 'BEBIDA';
  sizesField.querySelector('.add-size').hidden = isDrink;
  sizesField.querySelector('.sizes-editor').hidden = isDrink;
  sizesField.querySelector('.preparation-label').hidden = isDrink;
  sizesField.querySelector('.preparations-editor').hidden = isDrink;
  setupDrinkColorField(form, product);
  updateProductTypeFields(form);
  const allowed = product ? allowedPreparationIds(product) : variations.filter((variation) => !onlyNormalProducts.includes(form.elements.nombre.value.trim()) || variation.nombre === 'Normal').map((variation) => variation.id);
  sizesField.querySelector('.preparations-editor').innerHTML = variations.map((variation) => `<label class="preparation-option"><input type="checkbox" value="${variation.id}" ${allowed.includes(variation.id) ? 'checked' : ''} />${variation.nombre}</label>`).join('');
  if (product && ['Arroz Chaufa', 'Kung Pao'].includes(product.nombre)) {
    sizesField.querySelectorAll('.preparation-option input').forEach((input) => {
      const variation = variations.find((item) => String(item.id) === input.value);
      if (variation?.nombre !== 'Normal') { input.checked = false; input.disabled = true; }
    });
  }
  refreshIcons();
  let deleteButton = form.querySelector('[data-delete-product]');
  if (!deleteButton && product) {
    deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'secondary-button delete-button';
    deleteButton.dataset.deleteProduct = product.id;
    deleteButton.innerHTML = '<i data-lucide="trash-2"></i>Eliminar producto';
    form.querySelector('.modal-body').appendChild(deleteButton);
  }
  if (deleteButton) deleteButton.hidden = !product;
  document.querySelector('#product-modal-title').textContent = product ? 'Editar producto' : 'Nuevo producto';
  showDialog('product-modal');
}

function closeProductModal() { hideDialog('product-modal'); }

async function deleteProduct(id) {
  const product = products.find((p) => String(p.id) === String(id));
  const name = product ? product.nombre : 'este producto';
  if (!supabaseClient || !window.confirm(`¿Estás seguro de que deseas eliminar permanentemente "${name}" del menú?\n\nEsta acción eliminará sus precios y variaciones.`)) return;
  await supabaseClient.from('producto_tamanos').delete().eq('producto_id', id);
  await supabaseClient.from('producto_variaciones').delete().eq('producto_id', id);
  const { error } = await supabaseClient.from('productos').delete().eq('id', id);
  if (error) { showProductError('No se pudo eliminar el producto. Revisa los permisos RLS.'); console.error(error); return; }
  closeProductModal();
  await loadProducts();
  showToast('Producto eliminado del menú');
}

function showProductError(message) {
  let errorElement = document.querySelector('#product-form .form-error');
  if (!errorElement) {
    errorElement = document.createElement('p');
    errorElement.className = 'form-error';
    document.querySelector('#product-form .modal-body').prepend(errorElement);
  }
  errorElement.textContent = message;
}

function showOrderError(message) {
  const errorElement = document.querySelector('.order-form-error');
  if (errorElement) errorElement.textContent = message;
}

function addOrderBuilder(form) {
  if (form.querySelector('[data-order-items]')) return;
  const field = document.createElement('div');
  field.dataset.orderItems = 'true';
  field.className = 'order-items-builder';
  field.innerHTML = '<div class="order-item-row"><label>Producto<select class="order-product"><option value="">Selecciona un producto</option></select></label><label data-size-control hidden>Tamaño<select class="order-size" disabled><option>Selecciona</option></select></label><label data-preparation-control hidden>Preparación<select class="order-preparation"><option value="">Opcional</option></select></label><label>Cantidad<input class="order-quantity" type="number" min="1" value="1" /></label><button type="button" class="secondary-button add-order-item" aria-label="Añadir producto"><i data-lucide="plus"></i></button></div><div class="selected-order-items"></div><div class="order-total-box"><span>Total del pedido</span><strong>Bs 0.00</strong></div><p class="form-error order-form-error"></p>';
  form.querySelector('.modal-body').insertBefore(field, form.querySelector('.order-notes'));
  setupOrderCatalog(field);
  renderOrderProductOptions();
  refreshIcons();
}

function renderOrderProductOptions() {
  const select = document.querySelector('.order-product');
  if (!select) return;
  renderOrderCatalog();
  const activeProducts = products.filter((product) => product.activo);
  select.innerHTML = '<option value="">Selecciona un producto</option><optgroup label="Platos">' + activeProducts.filter((product) => product.tipo === 'PLATO' || product.tipo === 'EXTRA').map((product) => `<option value="${product.id}">${product.nombre}</option>`).join('') + '</optgroup><optgroup label="Bebidas / refrescos">' + activeProducts.filter((product) => product.tipo === 'BEBIDA').map((product) => `<option value="${product.id}">${product.nombre}</option>`).join('') + '</optgroup>';
}

function quantityOnlyProduct(product) {
  return product?.tipo === 'BEBIDA' || product?.tipo === 'EXTRA' || (product && isChickenExtra(product));
}

function databaseVariationId(value) {
  if (!value || value === 'null') return null;
  if (/^\d+$/.test(String(value))) return String(value);
  const found = variations.find(v => normalizeMenuText(v.nombre) === normalizeMenuText(value) && /^\d+$/.test(String(v.id)));
  if (found) return String(found.id);
  if (normalizeMenuText(value) === 'normal') return null;
  throw new Error('La preparación seleccionada no está disponible en la base de datos. Vuelve a seleccionar el producto.');
}

function preparationOptions(product) {
  if (quantityOnlyProduct(product)) return [];
  const names = onlyNormalProducts.some(name => normalizeMenuText(name) === normalizeMenuText(product.nombre)) ? ['Normal'] : defaultPreparations;
  return names.map(nombre => {
    const saved = variations.find(v => normalizeMenuText(v.nombre) === normalizeMenuText(nombre) && /^\d+$/.test(String(v.id)));
    return saved || (nombre === 'Normal' ? { id: '', nombre } : null);
  }).filter(Boolean);
}

function addSelectedOrderItem() {
  const productSelect = document.querySelector('.order-product');
  const product = products.find((item) => String(item.id) === productSelect.value);
  if (!product) { showOrderError('Selecciona un producto antes de añadirlo.'); return; }
  const sizeSelect = document.querySelector('.order-size');
  const size = quantityOnlyProduct(product) ? null : product.producto_tamanos?.find((item) => String(item.id) === sizeSelect.value);
  const preparationSelect = document.querySelector('.order-preparation');
  const preparation = onlyNormalProducts.includes(product.nombre)
    ? preparationOptions(product)[0]
    : variations.find((item) => String(item.id) === preparationSelect.value || item.nombre === preparationSelect.options[preparationSelect.selectedIndex]?.textContent) || { id: null, nombre: preparationSelect.options[preparationSelect.selectedIndex]?.textContent || '' };
  const quantity = Number(document.querySelector('.order-quantity').value) || 1;
  const item = document.createElement('div');
  item.className = 'selected-order-item';
  item.dataset.productId = product.id;
  item.dataset.sizeId = size?.id || '';
  item.dataset.variationId = quantityOnlyProduct(product) ? '' : preparation?.id || '';
  item.dataset.quantity = quantity;
  item.dataset.price = size?.precio || product.precio || 0;
  item.innerHTML = `<span>${quantity} × ${product.nombre}${size && !quantityOnlyProduct(product) ? ` · ${size.nombre}` : ''}${preparation && !quantityOnlyProduct(product) ? ` · ${preparation.nombre}` : ''}</span><button type="button" class="remove-order-item" aria-label="Quitar producto"><i data-lucide="x"></i></button>`;
  document.querySelector('.selected-order-items').appendChild(item);
  enhanceOrderItem(item);
  document.querySelector('.order-quantity').value = '1';
  productSelect.value = '';
  sizeSelect.innerHTML = '<option>Tamaño</option>';
  sizeSelect.disabled = true;
  document.querySelector('[data-size-control]').hidden = true;
  document.querySelector('[data-preparation-control]').hidden = true;
  preparationSelect.innerHTML = preparationOptions(product).map((variation, index) => `<option value="${variation.id}" ${index === 0 ? 'selected' : ''}>${variation.nombre}</option>`).join('');
  refreshIcons();
  updateOrderTotal();
}

function updateOrderTotal() {
  const totalElement = document.querySelector('.order-total-box strong');
  if (!totalElement) return;
  const total = [...document.querySelectorAll('.selected-order-item')].reduce((sum, item) => sum + Number(item.dataset.quantity) * Number(item.dataset.price), 0);
  totalElement.textContent = `Bs ${total.toFixed(2)}`;
}

function updateEditableOrderItem(item) {
  const product = products.find((entry) => String(entry.id) === String(item.dataset.productId));
  if (!product) return;
  const quantity = item.querySelector('.selected-order-quantity');
  const preparation = item.querySelector('.selected-order-preparation:checked');
  item.dataset.quantity = orderQuantity(quantity?.value);
  const minus = item.querySelector('[data-quantity-step="-1"]');
  if (minus) minus.disabled = Number(item.dataset.quantity) <= 1;
  if (preparation) item.dataset.variationId = preparation.value || '';
  const size = product.producto_tamanos?.find((entry) => String(entry.id) === String(item.dataset.sizeId));
  const variation = preparation?.dataset.preparationName || '';
  item.querySelector('.selected-order-label').textContent = `${item.dataset.quantity} × ${product.nombre}${size ? ` · ${size.nombre}` : ''}${variation && variation !== 'Normal' ? ` · ${variation}` : ''}`;
  updateOrderTotal();
}

async function togglePayment(id) {
  const order = orders.find((item) => item.id === id);
  if (!order || !supabaseClient) return;
  const paid = order.payment !== 'PAGADO';
  const { error } = await supabaseClient.from('pedidos').update({ estado_pago: paid ? 'PAGADO' : 'PENDIENTE', pagado_at: paid ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', order.databaseId);
  if (error) { showToast('No se pudo actualizar el pago'); console.error(error); return; }
  order.payment = paid ? 'PAGADO' : 'PENDIENTE';
  renderHomeOrders();
  renderBoard(document.querySelector('.segmented-control button.active')?.dataset.filter || 'todos');
  showToast(paid ? `Pedido #${id} marcado como pagado` : `Pedido #${id} marcado como pendiente`);
}

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

function orderItemsMarkup(order) {
  if (!order.details?.length) return `<span class="order-item-box"><strong>${menuEscape(order.items)}</strong></span>`;
  return order.details.map((detail) => {
    const productName = detail.productos?.nombre || 'Producto';
    const product = products.find((item) => item.nombre === productName);
    const size = findOrderSize(product, detail);
    const variation = detail.variaciones?.nombre && detail.variaciones.nombre !== 'Normal' ? detail.variaciones.nombre : '';
    const options = [size?.nombre, variation].filter(Boolean).join(' · ');
    return `<span class="order-item-box"><strong>${menuEscape(detail.cantidad)} × ${menuEscape(productName)}</strong>${options ? `<small>${menuEscape(options)}</small>` : ''}</span>`;
  }).join('');
}

function orderMarkup(order, compact = false) {
  if (compact) {
    return `<article class="order-row" data-order-id="${order.id}">
      <span class="order-number">#${order.id.slice(-3)}</span>
      <div class="order-customer"><strong>${order.customer}</strong><div class="order-items">${orderItemsMarkup(order)}</div></div>
      <span class="order-type"><i data-lucide="${iconForType(order.type)}"></i>${order.type}</span>
      <strong class="order-total">${order.total}</strong>
      <button class="order-status status-${order.status}" data-advance="${order.id}">${order.label}</button>
      <button class="payment-status ${order.payment === 'PAGADO' ? 'paid' : 'unpaid'}" data-payment="${order.id}">${order.payment === 'PAGADO' ? 'Pagado' : 'Sin pagar'}</button>
      <div class="row-actions">
        <button class="btn-action" data-edit-order="${order.databaseId}" title="Editar pedido"><i data-lucide="pencil"></i></button>
        <button class="btn-action danger" data-delete-order-id="${order.databaseId}" title="Eliminar pedido"><i data-lucide="trash-2"></i></button>
      </div>
    </article>`;
  }
  return `<article class="board-card status-${order.status}" data-order-id="${order.id}">
    <div class="board-card-top">
      <span>#${order.id}</span>
      <div class="card-actions">
        <span>${order.type}</span>
        <button class="btn-action" data-edit-order="${order.databaseId}" title="Editar pedido"><i data-lucide="pencil"></i></button>
        <button class="btn-action danger" data-delete-order-id="${order.databaseId}" title="Eliminar pedido"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
    <h4>${order.customer}</h4><div class="order-items">${orderItemsMarkup(order)}</div><button type="button" class="order-open-button" data-read-order="${order.id}" aria-label="Ver pedido ${order.id} completo">Ver pedido completo</button>
    <div class="board-card-bottom">
      <strong>${order.total}</strong>
      <button class="payment-status ${order.payment === 'PAGADO' ? 'paid' : 'unpaid'}" data-payment="${order.id}">${order.payment === 'PAGADO' ? 'Pagado' : 'Sin pagar'}</button>
      <button class="check-button" data-advance="${order.id}"><i data-lucide="check"></i>${order.status === 'listo' ? 'Entregar' : 'Avanzar'}</button>
    </div>
  </article>`;
}

function renderHomeOrders() {
  document.querySelector('#orders-list').innerHTML = orders.length
    ? orders.slice(0, 5).map((order) => orderMarkup(order, true)).join('')
    : '<div class="empty-state"><i data-lucide="receipt-text"></i><strong>Aún no hay pedidos</strong><span>Registra el primero para verlo aquí.</span></div>';
  refreshIcons();
}

function renderBoard(filter = 'todos') {
  const visible = filter === 'todos' ? orders : orders.filter((order) => order.status === filter);
  const columns = filter === 'todos' ? statusOrder : [filter];
  document.querySelector('#orders-board').innerHTML = columns.map((status) => {
    const columnOrders = visible.filter((order) => order.status === status);
    return `<section class="order-column"><h3>${statusLabels[status]} <span>${columnOrders.length}</span></h3>${columnOrders.length ? columnOrders.map((order) => orderMarkup(order)).join('') : '<p class="empty-column">No hay pedidos aquí</p>'}</section>`;
  }).join('');
  document.querySelectorAll('.segmented-control button[data-filter]').forEach((button) => {
    const count = button.dataset.filter === 'todos' ? orders.length : orders.filter((order) => order.status === button.dataset.filter).length;
    button.innerHTML = `${button.dataset.filter === 'todos' ? 'Todos' : statusLabels[button.dataset.filter]} <b>${count}</b>`;
  });
  refreshIcons();
}

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

function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function showToast(message = 'Pedido actualizado') {
  const toast = document.querySelector('#toast');
  toast.querySelector('span').textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 2300);
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
  if (pending) pending.textContent = orders.filter((order) => order.status !== 'listo').length;
  renderStats();
}
async function advanceOrder(id) {
  const order = orders.find((item) => item.id === id);
  if (!order) return;
  const nextIndex = Math.min(statusOrder.indexOf(order.status) + 1, statusOrder.length - 1);
  if (order.status === 'listo') {
    if (supabaseClient) {
      const { error } = await supabaseClient.from('pedidos').update({ estado: 'ENTREGADO', entregado_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.databaseId);
      if (error) { showToast('No se pudo actualizar el pedido'); return; }
    }
    showToast(`Pedido #${id} marcado como entregado`);
    return;
  }
  const nextStatus = statusOrder[nextIndex];
  const databaseStatus = { pendiente: 'PENDIENTE', preparacion: 'EN_PREPARACION', listo: 'LISTO' }[nextStatus];
  if (supabaseClient) {
    const { error } = await supabaseClient.from('pedidos').update({ estado: databaseStatus, updated_at: new Date().toISOString() }).eq('id', order.databaseId);
    if (error) { showToast('No se pudo actualizar el pedido'); return; }
  }
  order.status = nextStatus;
  order.label = statusLabels[nextStatus];
  renderHomeOrders();
  renderBoard(document.querySelector('.segmented-control button.active')?.dataset.filter || 'todos');
  updateMetric();
  showToast(`Pedido #${id} ahora está ${order.label.toLowerCase()}`);
}

function switchView(view) {
  document.querySelectorAll('.page-view').forEach((page) => page.classList.toggle('active', page.id === `view-${view}`));
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const viewLabel = document.querySelector('#current-view-label');
  if (viewLabel) viewLabel.textContent = { inicio: 'Inicio', pedidos: 'Pedidos', clientes: 'Clientes', menu: 'Menú', estadisticas: 'Estadísticas' }[view] || 'Inicio';
  if (view === 'pedidos') renderBoard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal() {
  const form = document.querySelector('#order-form');
  setupClientSearch();
  addOrderBuilder(form);
  form.reset();
  form.elements.id.value = '';
  const clientPicker = form.querySelector('[data-client-picker]');
  if (clientPicker) {
    clientPicker.querySelector('[name="cliente_id"]').value = '';
    const search = clientPicker.querySelector('[data-client-search]');
    if (search) search.value = '';
  }
  form.querySelector('.selected-order-items').innerHTML = '';
  renderOrderCatalog();
  updateOrderTotal();
  const titleEl = document.querySelector('#order-modal-title');
  const eyebrowEl = document.querySelector('#order-modal-eyebrow');
  const submitBtn = document.querySelector('#save-order-submit');
  const deleteBtn = form.querySelector('[data-delete-order]');
  if (titleEl) titleEl.textContent = 'Registrar pedido';
  if (eyebrowEl) eyebrowEl.textContent = 'Nuevo ticket';
  if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check"></i>Crear pedido';
  if (deleteBtn) deleteBtn.hidden = true;
  refreshIcons();
  updateOrderDetailsSummary();
  form.querySelector('.order-details').open = !form.elements.id.value;
  form.querySelector('.order-notes').open = false;
  showDialog('order-modal');
}

function closeModal() { hideDialog('order-modal'); }

async function openEditOrderModal(databaseId) {
  const form = document.querySelector('#order-form');
  setupClientSearch();
  addOrderBuilder(form);

  const localOrder = orders.find((o) => String(o.databaseId) === String(databaseId));
  let orderRaw = null;
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('pedidos')
      .select('id, numero_ticket, cliente_id, tipo_pedido, estado, estado_pago, notas, total, clientes(id, nombres, apellidos)')
      .eq('id', databaseId)
      .single();
    if (!error && data) {
      let detailsResponse = await supabaseClient
        .from('detalle_pedido')
        .select('id, producto_id, tamano_id, variacion_id, cantidad, precio_unitario')
        .eq('pedido_id', databaseId);
      if (detailsResponse.error?.message?.includes('tamano_id')) {
        detailsResponse = await supabaseClient
          .from('detalle_pedido')
          .select('id, producto_id, variacion_id, cantidad, precio_unitario')
          .eq('pedido_id', databaseId);
      }
      const { data: details, error: detailsError } = detailsResponse;
      if (!detailsError) {
        data.detalle_pedido = details || [];
        orderRaw = data;
      } else {
        console.error('No se pudieron cargar los productos del pedido:', detailsError);
        showOrderError(`No se pudieron cargar los productos: ${detailsError.message || 'revisa los permisos de detalle_pedido en Supabase'}`);
      }
    } else if (error) {
      console.error('No se pudo cargar el pedido:', error);
      showOrderError('No se pudo cargar este pedido para modificarlo.');
    }
  }

  form.reset();
  form.elements.id.value = databaseId;

  const titleEl = document.querySelector('#order-modal-title');
  const eyebrowEl = document.querySelector('#order-modal-eyebrow');
  const submitBtn = document.querySelector('#save-order-submit');
  const deleteBtn = form.querySelector('[data-delete-order]');

  const ticketNumber = orderRaw?.numero_ticket || localOrder?.id || databaseId;
  if (titleEl) titleEl.textContent = `Editar pedido #${String(ticketNumber).padStart(6, '0')}`;
  if (eyebrowEl) eyebrowEl.textContent = 'Modificación de ticket';
  if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check"></i>Guardar cambios';
  if (deleteBtn) deleteBtn.hidden = false;

  const targetClientId = orderRaw?.cliente_id;
  const foundClient = clients.find((c) => String(c.id) === String(targetClientId));
  const clientObj = Array.isArray(orderRaw?.clientes) ? orderRaw.clientes[0] : orderRaw?.clientes;
  
  let clientDisplayName = '';
  if (foundClient) {
    clientDisplayName = `${foundClient.nombres} ${foundClient.apellidos}`;
  } else if (clientObj && clientObj.nombres) {
    clientDisplayName = `${clientObj.nombres} ${clientObj.apellidos}`;
  } else if (localOrder?.customer && localOrder.customer !== 'Cliente ocasional') {
    clientDisplayName = localOrder.customer;
  }

  const clientPicker = form.querySelector('[data-client-picker]');
  if (clientPicker) {
    clientPicker.querySelector('[name="cliente_id"]').value = targetClientId || foundClient?.id || '';
    const clientSearch = clientPicker.querySelector('[data-client-search]');
    if (clientSearch) {
      clientSearch.value = clientDisplayName;
    }
  }

  const currentOrder = orderRaw || localOrder;
  if (currentOrder) {
    form.elements.pagado.checked = (orderRaw ? orderRaw.estado_pago : localOrder.payment) === 'PAGADO';
    const typeSelect = form.elements.tipo_pedido;
    if (typeSelect) {
      const isMesa = orderRaw ? orderRaw.tipo_pedido === 'MESA' : localOrder.type.startsWith('Mesa');
      typeSelect.value = isMesa ? 'En mesa' : 'Para llevar';
    }
    const notesTextarea = form.querySelector('textarea');
    if (notesTextarea) notesTextarea.value = orderRaw?.notas || '';

    const itemsContainer = form.querySelector('.selected-order-items');
    itemsContainer.innerHTML = '';

    if (orderRaw?.detalle_pedido && orderRaw.detalle_pedido.length) {
      orderRaw.detalle_pedido.forEach((detail) => {
        const product = products.find((p) => String(p.id) === String(detail.producto_id)) || { nombre: 'Producto', tipo: 'PLATO' };
        const size = quantityOnlyProduct(product) ? null : findOrderSize(product, detail);
        const sizeName = size?.nombre || '';
        const prepName = quantityOnlyProduct(product) ? '' : variations.find((variation) => String(variation.id) === String(detail.variacion_id))?.nombre || '';
        const item = document.createElement('div');
        item.className = 'selected-order-item';
        item.dataset.productId = detail.producto_id;
        item.dataset.sizeId = quantityOnlyProduct(product) ? '' : size?.id || detail.tamano_id || '';
        item.dataset.variationId = quantityOnlyProduct(product) ? '' : detail.variacion_id || '';
        item.dataset.quantity = detail.cantidad;
        item.dataset.price = detail.precio_unitario;
        const preparationChoices = preparationOptions(product);
        const preparationMarkup = preparationChoices.length
          ? `<select class="selected-order-preparation" aria-label="Preparación">${preparationChoices.map((preparation) => `<option value="${preparation.id}" ${String(preparation.id) === String(detail.variacion_id) || preparation.nombre === prepName ? 'selected' : ''}>${preparation.nombre}</option>`).join('')}</select>`
          : '';
        item.innerHTML = `<span class="selected-order-label">${detail.cantidad} × ${product.nombre}${sizeName ? ` · ${sizeName}` : ''}${prepName && prepName !== 'Normal' ? ` · ${prepName}` : ''}</span><input class="selected-order-quantity" type="number" min="1" value="${detail.cantidad}" aria-label="Cantidad" />${preparationMarkup}<button type="button" class="remove-order-item" aria-label="Quitar producto"><i data-lucide="x"></i></button>`;
        itemsContainer.appendChild(item);
        enhanceOrderItem(item);
      });
    }
    updateOrderTotal();
  }

  refreshIcons();
  updateOrderDetailsSummary();
  form.querySelector('.order-details').open = !form.elements.id.value;
  form.querySelector('.order-notes').open = false;
  showDialog('order-modal');
}

async function deleteOrder(databaseId) {
  if (!databaseId) {
    showToast('No se encontró el ID del pedido');
    return;
  }
  const order = orders.find((o) => String(o.databaseId) === String(databaseId) || String(o.id) === String(databaseId));
  const targetId = order?.databaseId || databaseId;
  const ticketLabel = order ? `#${order.id}` : '';
  if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el pedido ${ticketLabel}?\n\nEsta acción eliminará el ticket y todos sus detalles.`)) return;
  if (!supabaseClient) return;

  try {
    const { error: detailErr } = await supabaseClient.from('detalle_pedido').delete().eq('pedido_id', targetId);
    if (detailErr) console.warn('Error al eliminar detalles:', detailErr);

    const { error: orderErr } = await supabaseClient.from('pedidos').delete().eq('id', targetId);
    if (orderErr) {
      console.error('Error al eliminar pedido:', orderErr);
      if (orderErr.code === '42501' || orderErr.message?.toLowerCase().includes('policy')) {
        alert('Supabase bloqueó la eliminación por políticas RLS.\n\nPor favor ejecuta en Supabase SQL Editor:\n\nCREATE POLICY "Permitir delete en pedidos" ON public.pedidos FOR DELETE USING (true);\nCREATE POLICY "Permitir delete en detalle_pedido" ON public.detalle_pedido FOR DELETE USING (true);');
      } else {
        alert(`No se pudo eliminar el pedido: ${orderErr.message || 'Error en la base de datos'}`);
      }
      return;
    }

    closeModal();
    await loadOrders();
    showToast(`Pedido ${ticketLabel} eliminado permanentemente`);
  } catch (err) {
    console.error(err);
    showToast('Error al procesar la eliminación');
  }
}

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-view], [data-view-link]');
  if (nav) switchView(nav.dataset.view || nav.dataset.viewLink);
  const advance = event.target.closest('[data-advance]');
  if (advance) advanceOrder(advance.dataset.advance);
  if (event.target.closest('#new-order-button, #new-order-button-2')) openModal();
  if (event.target.closest('#new-client-button')) openClientModal();
  if (event.target.closest('#view-menu .primary-button')) openProductModal();
  const menuButton = event.target.closest('#view-menu .menu-tabs button');
  if (menuButton) {
    const menuButtons = [...document.querySelectorAll('#view-menu .menu-tabs button')];
    menuFilter = menuFilters[menuButtons.indexOf(menuButton)] || 'todos';
    renderProducts();
  }
  if (event.target.closest('.add-size')) {
    const editor = event.target.closest('[data-sizes-field]').querySelector('.sizes-editor');
    editor.insertAdjacentHTML('beforeend', sizeRowsMarkup([{ nombre: '', precio: 0 }]));
    refreshIcons();
  }
  if (event.target.closest('.remove-size')) event.target.closest('.size-row').remove();
  if (event.target.closest('.add-order-item')) addSelectedOrderItem();
  if (event.target.closest('.remove-order-item')) {
    event.target.closest('.selected-order-item').remove();
    updateOrderTotal();
  }
  if (event.target.closest('[data-logout]')) supabaseClient?.auth.signOut();
  const profileButton = event.target.closest('[data-profile-menu]');
  if (profileButton) {
    const dropdown = document.querySelector('.account-dropdown');
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    profileButton.setAttribute('aria-expanded', String(!isOpen));
  }
  const paymentButton = event.target.closest('[data-payment]');
  if (paymentButton) togglePayment(paymentButton.dataset.payment);
  
  const editProduct = event.target.closest('[data-edit-product]');
  if (editProduct) openProductModal(products.find((product) => String(product.id) === String(editProduct.dataset.editProduct)));
  const deleteProductButton = event.target.closest('[data-delete-product]');
  if (deleteProductButton) deleteProduct(deleteProductButton.dataset.deleteProduct);
  
  const editClient = event.target.closest('[data-edit-client]');
  if (editClient) openClientModal(clients.find((client) => String(client.id) === String(editClient.dataset.editClient)));
  if (event.target.closest('[data-deactivate-client]')) deactivateClient(document.querySelector('#client-form [name="id"]').value);
  const deleteClientBtn = event.target.closest('[data-delete-client], [data-delete-client-perm]');
  if (deleteClientBtn) deleteClientPermanently(deleteClientBtn.dataset.deleteClient || document.querySelector('#client-form [name="id"]').value);
  
  const editOrderBtn = event.target.closest('[data-edit-order]');
  if (editOrderBtn) openEditOrderModal(editOrderBtn.dataset.editOrder);
  const deleteOrderBtn = event.target.closest('[data-delete-order], [data-delete-order-id]');
  if (deleteOrderBtn) deleteOrder(deleteOrderBtn.dataset.deleteOrderId || document.querySelector('#order-form [name="id"]').value);

  const filter = event.target.closest('[data-filter]');
  if (filter) { document.querySelectorAll('[data-filter]').forEach((button) => button.classList.remove('active')); filter.classList.add('active'); renderBoard(filter.dataset.filter); }
});

document.addEventListener('click', (event) => {
  if (event.target.closest('.profile-menu')) return;
  const dropdown = document.querySelector('.account-dropdown');
  const profileButton = document.querySelector('[data-profile-menu]');
  if (dropdown && !dropdown.hidden) dropdown.hidden = true;
  if (profileButton) profileButton.setAttribute('aria-expanded', 'false');
});

document.addEventListener('change', (event) => {
  if (event.target.matches('#product-form [name="tipo"]')) updateProductTypeFields(event.target.form);
  if (event.target.matches('.selected-order-preparation, .selected-order-quantity')) {
    updateEditableOrderItem(event.target.closest('.selected-order-item'));
    return;
  }
  if (event.target.matches('#orders-date-picker')) {
    selectedOrdersDate = event.target.value || getBoliviaDateValue();
    loadOrders();
    return;
  }
  if (!event.target.matches('.order-product')) return;
  const product = products.find((item) => String(item.id) === event.target.value);
  document.querySelector('.order-quantity').value = '1';
  const sizeControl = document.querySelector('[data-size-control]');
  const sizeSelect = document.querySelector('.order-size');
  const preparationControl = document.querySelector('[data-preparation-control]');
  const preparationSelect = document.querySelector('.order-preparation');
  const isDrink = product?.tipo === 'BEBIDA';
  const isOnlyNormal = product && onlyNormalProducts.includes(product.nombre);
  const quantityOnly = !product || quantityOnlyProduct(product);
  sizeControl.hidden = quantityOnly;
  preparationControl.hidden = quantityOnly || isOnlyNormal;
  preparationSelect.disabled = quantityOnly || isOnlyNormal;
  sizeSelect.innerHTML = (quantityOnly ? [] : product?.producto_tamanos)?.map((size) => `<option value="${size.id}">${size.nombre} · Bs ${Number(size.precio).toFixed(2)}</option>`).join('') || '<option value="">Sin tamaños</option>';
  sizeSelect.disabled = quantityOnly || !product?.producto_tamanos?.length;
  preparationSelect.innerHTML = (product && !quantityOnly && !isOnlyNormal ? preparationOptions(product) : []).map((variation, index) => `<option value="${variation.id}" ${index === 0 ? 'selected' : ''}>${variation.nombre}</option>`).join('');
});

document.addEventListener('input', (event) => {
  const search = event.target.closest('#view-clientes .table-toolbar input');
  if (!search) return;
  const term = search.value.trim().toLowerCase();
  document.querySelectorAll('#view-clientes tbody tr').forEach((row) => {
    row.hidden = Boolean(term) && !row.textContent.toLowerCase().includes(term);
  });
});

document.querySelector('#order-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  addOrderBuilder(form);
  const orderId = form.elements.id.value;
  if (supabaseClient) {
    const type = form.elements.tipo_pedido.value === 'En mesa' ? 'MESA' : 'PARA_LLEVAR';
    const selectedItems = [...form.querySelectorAll('.selected-order-item')];
    if (!selectedItems.length) { showOrderError('Añade al menos un producto al pedido.'); return; }
    try { selectedItems.forEach(item => { item.dataset.variationId = databaseVariationId(item.dataset.variationId) || ''; }); }
    catch (error) { showOrderError(error.message); return; }
    const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.dataset.quantity) * Number(item.dataset.price), 0);
    const clientId = form.elements.cliente_id.value || null;
    const paid = form.elements.pagado.checked;
    const notesTextarea = form.querySelector('textarea');
    const notes = notesTextarea ? notesTextarea.value.trim() : null;

    if (orderId) {
      const { error } = await supabaseClient.from('pedidos').update({
        cliente_id: clientId,
        tipo_pedido: type,
        estado_pago: paid ? 'PAGADO' : 'PENDIENTE',
        pagado_at: paid ? new Date().toISOString() : null,
        notas: notes,
        subtotal,
        total: subtotal,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      if (error) { showOrderError(`No se pudo actualizar el pedido: ${error.message}`); console.error(error); return; }

      await supabaseClient.from('detalle_pedido').delete().eq('pedido_id', orderId);
      const details = selectedItems.map((item) => ({
        pedido_id: orderId,
        producto_id: item.dataset.productId,
        tamano_id: item.dataset.sizeId || null,
        variacion_id: item.dataset.variationId || null,
        cantidad: Number(item.dataset.quantity),
        precio_unitario: Number(item.dataset.price),
        subtotal: Number(item.dataset.quantity) * Number(item.dataset.price)
      }));
      let detailResponse = await supabaseClient.from('detalle_pedido').insert(details);
      if (detailResponse.error?.message?.includes('tamano_id')) {
        detailResponse = await supabaseClient.from('detalle_pedido').insert(details.map(({ tamano_id, ...detail }) => detail));
      }
      if (detailResponse.error) { showOrderError(`El pedido se actualizó, pero no se guardaron los productos: ${detailResponse.error.message}`); console.error(detailResponse.error); return; }

    } else {
      const { data: order, error } = await supabaseClient.from('pedidos').insert({
        cliente_id: clientId,
        tipo_pedido: type,
        estado: 'PENDIENTE',
        estado_pago: paid ? 'PAGADO' : 'PENDIENTE',
        pagado_at: paid ? new Date().toISOString() : null,
        notas: notes,
        subtotal,
        total: subtotal
      }).select('id').single();

      if (error) { showOrderError(`No se pudo crear el pedido: ${error.message}`); console.error(error); return; }

      if (order?.id) form.elements.id.value = order.id;
      if (order && selectedItems.length) {
        const details = selectedItems.map((item) => ({
          pedido_id: order.id,
          producto_id: item.dataset.productId,
          tamano_id: item.dataset.sizeId || null,
          variacion_id: item.dataset.variationId || null,
          cantidad: Number(item.dataset.quantity),
          precio_unitario: Number(item.dataset.price),
          subtotal: Number(item.dataset.quantity) * Number(item.dataset.price)
        }));
        let detailResponse = await supabaseClient.from('detalle_pedido').insert(details);
        if (detailResponse.error?.message?.includes('tamano_id')) {
          detailResponse = await supabaseClient.from('detalle_pedido').insert(details.map(({ tamano_id, ...detail }) => detail));
        }
        if (detailResponse.error) { showOrderError(`El pedido se creó, pero no se guardaron sus productos: ${detailResponse.error.message}`); console.error(detailResponse.error); return; }
      }

    }
    await loadOrders();
  }
  closeModal();
  if (supabaseClient) showSuccessConfirmation(orderId ? '¡Pedido actualizado!' : '¡Pedido registrado!', 'El pedido y sus productos se guardaron correctamente.');
});

document.querySelector('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabaseClient) { showToast('Configura Supabase para guardar productos'); return; }
  const form = event.currentTarget;
  const payload = { nombre: form.elements.nombre.value.trim(), descripcion: encodeDrinkDescription(form.elements.descripcion.value.trim(), form.elements.tipo.value === 'BEBIDA' ? selectedDrinkColor(form) : null), precio: Number(form.elements.precio.value), tipo: form.elements.tipo.value, activo: form.elements.activo.checked, updated_at: new Date().toISOString() };
  const id = form.elements.id.value;
  showProductError('');
  const response = id ? await supabaseClient.from('productos').update(payload).eq('id', id) : await supabaseClient.from('productos').insert(payload).select('id').single();
  if (response.error) { showProductError('Supabase no permitió guardar el producto. Revisa las políticas RLS de productos.'); console.error(response.error); return; }
  const productId = id || response.data?.id;
  if (productId) {
    const isDrink = form.elements.tipo.value === 'BEBIDA';
    const sizes = isDrink ? [] : readSizeRows().map((size) => ({ producto_id: productId, nombre: size.nombre, precio: size.precio, activo: true, updated_at: new Date().toISOString() }));
    if (isDrink) {
      const sizeDelete = await supabaseClient.from('producto_tamanos').delete().eq('producto_id', productId);
      if (sizeDelete.error) { showProductError('La bebida se guardó, pero no se pudieron limpiar sus tamaños. Revisa los permisos RLS.'); console.error(sizeDelete.error); return; }
    }
    if (sizes.length) {
      const sizeResponse = await supabaseClient.from('producto_tamanos').upsert(sizes, { onConflict: 'producto_id,nombre' });
      if (sizeResponse.error) { showProductError('El producto se guardó, pero Supabase bloqueó sus tamaños. Revisa las políticas RLS de producto_tamanos.'); console.error(sizeResponse.error); return; }
    }
    const variationDelete = await supabaseClient.from('producto_variaciones').delete().eq('producto_id', productId);
    if (variationDelete.error) { showProductError('El producto se guardó, pero no se pudieron actualizar sus preparaciones.'); console.error(variationDelete.error); return; }
    const selectedVariations = [...form.querySelectorAll('.preparations-editor input:checked')].map((input) => ({ producto_id: productId, variacion_id: input.value }));
    if (selectedVariations.length) {
      const variationResponse = await supabaseClient.from('producto_variaciones').insert(selectedVariations);
      if (variationResponse.error) { showProductError('El producto se guardó, pero no se pudieron guardar sus preparaciones.'); console.error(variationResponse.error); return; }
    }
  }
  closeProductModal();
  await loadProducts();
  showSuccessConfirmation(id ? '¡Producto actualizado!' : '¡Producto registrado!');
});

document.querySelector('#client-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { nombres: form.elements.nombres.value.trim(), apellidos: form.elements.apellidos.value.trim(), telefono: form.elements.telefono.value.trim() || null, familia_id: form.elements.familia.value.trim() || null, relacion_familiar: form.elements.relacion_familiar.value.trim() || null, activo: form.elements.activo.checked, updated_at: new Date().toISOString() };
  const id = form.elements.id.value;
  const response = id ? await supabaseClient.from('clientes').update(payload).eq('id', id) : await supabaseClient.from('clientes').insert(payload);
  if (response.error) { showToast('No se pudo guardar el cliente'); console.error(response.error); return; }
  closeClientModal();
  await loadClients();
  showSuccessConfirmation(id ? '¡Cliente actualizado!' : '¡Cliente registrado!', 'Los datos se guardaron correctamente.', { brief: !id });
});

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
