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
const defaultPreparations = ['Normal', 'Picante', 'Agridulce'];
const onlyNormalProducts = ['Arroz Chaufa', 'Kung Pao'];

function updateCurrentDate() {
  const now = new Date();
  const longDate = new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(now);
  const shortDate = new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(now).replace('.', '');
  const dateLabel = document.querySelector('#current-date-label');
  const ordersDateLabel = document.querySelector('#orders-date-label');
  if (dateLabel) dateLabel.textContent = longDate.charAt(0).toUpperCase() + longDate.slice(1);
  if (ordersDateLabel) ordersDateLabel.append(document.createTextNode(shortDate));
}

function getBoliviaDayRange() {
  const boliviaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const start = new Date(`${boliviaDate}T00:00:00-04:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function preparationNames(product) {
  const saved = product.producto_variaciones?.map((item) => item.variaciones?.nombre).filter(Boolean) || [];
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
    const variation = detail.variaciones?.nombre && detail.variaciones.nombre !== 'Normal' ? ` ${detail.variaciones.nombre}` : '';
    return `${detail.cantidad} ${product}${variation}`;
  }).join(' · ') || 'Sin productos registrados';
  const status = { PENDIENTE: 'pendiente', EN_PREPARACION: 'preparacion', LISTO: 'listo' }[row.estado] || 'pendiente';
  return {
    id: String(row.numero_ticket || row.id).padStart(6, '0'),
    databaseId: row.id,
    customer,
    type: row.tipo_pedido === 'MESA' ? `Mesa ${row.mesas?.numero || ''}`.trim() : 'Para llevar',
    items,
    total: `Bs ${Number(row.total || 0).toFixed(2)}`,
    status,
    label: statusLabels[status],
    payment: row.estado_pago
  };
}

async function loadOrders() {
  if (!supabaseClient || !isAuthenticated) return;
  const { start, end } = getBoliviaDayRange();
  const { data, error } = await supabaseClient
    .from('pedidos')
    .select('id, numero_ticket, tipo_pedido, estado, estado_pago, total, created_at, clientes(nombres, apellidos), mesas(numero), detalle_pedido(cantidad, productos(nombre), variaciones(nombre))')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false });
  if (error) { showToast('No se pudieron cargar los pedidos'); console.error(error); return; }
  orders = (data || []).map(mapOrder);
  renderHomeOrders();
  renderBoard();
  updateMetric();
}

function productMarkup(product) {
  const isDrink = product.tipo === 'BEBIDA';
  const sizes = isDrink ? [] : product.producto_tamanos || [];
  const preparations = isDrink ? [] : preparationNames(product);
  const sizeMarkup = sizes.map((size) => `<span>${size.nombre}: Bs ${Number(size.precio).toFixed(2)}</span>`).join('') || `<span>Bs ${Number(product.precio || 0).toFixed(2)}</span>`;
  return `<article class="menu-item-card"><span class="menu-category ${isDrink ? 'drink' : ''}">${product.tipo}</span><h3>${product.nombre}</h3><p>${product.descripcion || 'Sin descripción'}</p><strong>${product.activo ? 'Disponible' : 'No disponible'}</strong><div class="variation-row">${sizeMarkup}</div>${!isDrink ? `<div class="preparation-list">${preparations.join(' · ') || 'Sin preparación definida'}</div>` : ''}<div class="menu-actions"><button class="edit-button" data-edit-product="${product.id}" aria-label="Editar ${product.nombre}"><i data-lucide="pencil"></i></button><button class="delete-item-button" data-delete-product="${product.id}" aria-label="Eliminar ${product.nombre}"><i data-lucide="trash-2"></i></button></div></article>`;
}

function renderProducts() {
  const grid = document.querySelector('#view-menu .menu-grid');
  if (!grid || !supabaseClient) return;
  const menuButtons = document.querySelectorAll('#view-menu .menu-tabs button');
  if (menuButtons.length >= 3) {
    menuButtons[0].innerHTML = `Todos <b>${products.length}</b>`;
    menuButtons[1].innerHTML = `Platos <b>${products.filter((product) => product.tipo === 'PLATO').length}</b>`;
    menuButtons[2].innerHTML = `Bebidas <b>${products.filter((product) => product.tipo === 'BEBIDA').length}</b>`;
  }
  const filteredProducts = products.filter((product) => {
    if (menuFilter === 'platos') return product.tipo === 'PLATO';
    if (menuFilter === 'bebidas') return product.tipo === 'BEBIDA';
    if (menuFilter === 'variaciones') return product.tipo === 'PLATO' && preparationNames(product).length > 1;
    return true;
  });
  menuButtons.forEach((button, index) => button.classList.toggle('active', ['todos', 'platos', 'bebidas', 'variaciones'][index] === menuFilter));
  grid.innerHTML = filteredProducts.length ? filteredProducts.map(productMarkup).join('') : '<div class="empty-state"><i data-lucide="utensils"></i><strong>No hay productos en este filtro</strong><span>Prueba con otra categoría del menú.</span></div>';
  refreshIcons();
}

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
  sizesField.hidden = isDrink;
  sizesField.style.display = isDrink ? 'none' : 'grid';
}

async function loadProducts() {
  if (!supabaseClient || !isAuthenticated) return;
  products = [];
  renderProducts();
  const { data, error } = await supabaseClient.from('productos').select('id, nombre, descripcion, precio, tipo, activo, producto_tamanos(id, nombre, precio, activo)').order('nombre');
  if (error) { showToast('No se pudo cargar el menú'); console.error(error); return; }
  products = data || [];
  const variationResponse = await supabaseClient.from('producto_variaciones').select('producto_id, variacion_id, variaciones(id, nombre)');
  if (!variationResponse.error) products.forEach((product) => { product.producto_variaciones = variationResponse.data.filter((item) => item.producto_id === product.id); });
  const catalogResponse = await supabaseClient.from('variaciones').select('id, nombre').eq('activa', true).order('id');
  variations = catalogResponse.data || [];
  if (!variations.length && !variationResponse.error) {
    variations = variationResponse.data.map((item) => item.variaciones).filter(Boolean).filter((variation, index, list) => list.findIndex((item) => item.id === variation.id) === index);
  }
  renderProducts();
  renderOrderProductOptions();
}

async function loadClients() {
  if (!supabaseClient || !isAuthenticated) return;
  const { data, error } = await supabaseClient.from('clientes').select('id, nombres, apellidos, telefono, familia_id, relacion_familiar, activo, created_at').order('apellidos');
  if (error) { console.error(error); return; }
  clients = data || [];
  const familyResponse = await supabaseClient.from('familias').select('id, nombre').order('nombre');
  families = familyResponse.data || [];
  renderClientPicker();
  renderClients();
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
    });
    renderClientPicker();
  }

function renderClients() {
  const clientView = document.querySelector('#view-clientes');
  const body = clientView?.querySelector('table tbody');
  if (!body) return;
  const active = clients.filter((client) => client.activo).length;
  clientView.querySelector('.client-summary > div:first-child strong').textContent = active;
  clientView.querySelector('.client-summary > div:nth-child(2) strong').textContent = new Set(clients.filter((client) => client.familia_id).map((client) => client.familia_id)).size;
  body.innerHTML = clients.length ? clients.map((client) => `<tr><td><div class="table-person"><span class="avatar peach">${client.nombres[0] || ''}${client.apellidos[0] || ''}</span><strong>${client.nombres} ${client.apellidos}</strong></div></td><td>${families.find((family) => family.id === client.familia_id)?.nombre || '—'}</td><td>${client.relacion_familiar || '—'}</td><td>${client.telefono || '—'}</td><td><span class="status-tag ${client.activo ? 'active-tag' : 'inactive-tag'}">${client.activo ? 'Activo' : 'Inactivo'}</span></td><td><button class="icon-button small" data-edit-client="${client.id}" aria-label="Editar cliente"><i data-lucide="ellipsis"></i></button></td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state"><strong>No hay clientes registrados</strong><span>Registra el primero para empezar.</span></div></td></tr>';
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
  deactivate.hidden = !client || !client.activo;
  document.querySelector('#client-modal').classList.add('open');
}

function closeClientModal() { document.querySelector('#client-modal').classList.remove('open'); }

async function deactivateClient(id) {
  if (!window.confirm('¿Cerrar este cliente? Se conservará su historial.')) return;
  const { error } = await supabaseClient.from('clientes').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('No se pudo cerrar el cliente'); console.error(error); return; }
  closeClientModal();
  await loadClients();
  showToast('Cliente cerrado');
}

function openProductModal(product = null) {
  const modal = document.querySelector('#product-modal');
  const form = document.querySelector('#product-form');
  form.reset();
  form.elements.id.value = product?.id || '';
  form.elements.nombre.value = product?.nombre || '';
  form.elements.descripcion.value = product?.descripcion || '';
  form.elements.precio.value = product?.precio ?? '';
  form.elements.tipo.value = product?.tipo || 'PLATO';
  form.elements.activo.checked = product?.activo ?? true;
  let sizesField = form.querySelector('[data-sizes-field]');
  if (!sizesField) {
    sizesField = document.createElement('label');
    sizesField.dataset.sizesField = 'true';
    sizesField.innerHTML = '<span class="field-title">Tamaños y precios</span><div class="sizes-editor"></div><button type="button" class="secondary-button add-size"><i data-lucide="plus"></i>Añadir tamaño</button><span class="preparation-label">Preparaciones permitidas</span><div class="preparations-editor"></div>';
    form.insertBefore(sizesField, form.querySelector('.checkbox-label'));
  }
  sizesField.querySelector('.sizes-editor').innerHTML = sizeRowsMarkup(product?.producto_tamanos || []);
  if (!product) sizesField.querySelector('.add-size').click();
  const isDrink = product?.tipo === 'BEBIDA';
  sizesField.querySelector('.add-size').hidden = isDrink;
  sizesField.querySelector('.sizes-editor').hidden = isDrink;
  sizesField.querySelector('.preparation-label').hidden = isDrink;
  sizesField.querySelector('.preparations-editor').hidden = isDrink;
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
    form.appendChild(deleteButton);
  }
  if (deleteButton) deleteButton.hidden = !product;
  document.querySelector('#product-modal-title').textContent = product ? 'Editar producto' : 'Nuevo producto';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeProductModal() {
  const modal = document.querySelector('#product-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

async function deleteProduct(id) {
  if (!supabaseClient || !window.confirm('¿Seguro que quieres eliminar este producto?')) return;
  const { error } = await supabaseClient.from('productos').delete().eq('id', id);
  if (error) { showProductError('No se pudo eliminar el producto. Revisa los permisos RLS.'); console.error(error); return; }
  closeProductModal();
  await loadProducts();
  showToast('Producto eliminado');
}

function showProductError(message) {
  let errorElement = document.querySelector('#product-form .form-error');
  if (!errorElement) {
    errorElement = document.createElement('p');
    errorElement.className = 'form-error';
    document.querySelector('#product-form').prepend(errorElement);
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
  form.insertBefore(field, form.querySelector('label:last-of-type'));
  renderOrderProductOptions();
  refreshIcons();
}

function renderOrderProductOptions() {
  const select = document.querySelector('.order-product');
  if (!select) return;
  const activeProducts = products.filter((product) => product.activo);
  select.innerHTML = '<option value="">Selecciona un producto</option><optgroup label="Platos">' + activeProducts.filter((product) => product.tipo === 'PLATO').map((product) => `<option value="${product.id}">${product.nombre}</option>`).join('') + '</optgroup><optgroup label="Bebidas / refrescos">' + activeProducts.filter((product) => product.tipo === 'BEBIDA').map((product) => `<option value="${product.id}">${product.nombre}</option>`).join('') + '</optgroup>';
}

function preparationOptions(product) {
  const allowedIds = allowedPreparationIds(product);
  const available = allowedIds.map((id) => variations.find((variation) => variation.id === id)).filter(Boolean);
  return available.length ? available : defaultPreparations.filter((name) => !onlyNormalProducts.includes(product.nombre) || name === 'Normal').map((name) => ({ id: name, nombre: name }));
}

function addSelectedOrderItem() {
  const productSelect = document.querySelector('.order-product');
  const product = products.find((item) => String(item.id) === productSelect.value);
  if (!product) { showOrderError('Selecciona un producto antes de añadirlo.'); return; }
  const sizeSelect = document.querySelector('.order-size');
  const size = product.producto_tamanos?.find((item) => String(item.id) === sizeSelect.value);
  const preparationSelect = document.querySelector('.order-preparation');
  const preparation = onlyNormalProducts.includes(product.nombre)
    ? variations.find((item) => item.nombre === 'Normal')
    : variations.find((item) => String(item.id) === preparationSelect.value) || { id: null, nombre: preparationSelect.options[preparationSelect.selectedIndex]?.textContent || '' };
  const quantity = Number(document.querySelector('.order-quantity').value) || 1;
  const item = document.createElement('div');
  item.className = 'selected-order-item';
  item.dataset.productId = product.id;
  item.dataset.sizeId = size?.id || '';
  item.dataset.variationId = product.tipo === 'BEBIDA' ? '' : Number.isInteger(preparation?.id) ? preparation.id : '';
  item.dataset.quantity = quantity;
  item.dataset.price = size?.precio || product.precio || 0;
  item.innerHTML = `<span>${quantity} × ${product.nombre}${size && product.tipo !== 'BEBIDA' ? ` · ${size.nombre}` : ''}${preparation && product.tipo !== 'BEBIDA' ? ` · ${preparation.nombre}` : ''}</span><button type="button" class="remove-order-item" aria-label="Quitar producto"><i data-lucide="x"></i></button>`;
  document.querySelector('.selected-order-items').appendChild(item);
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
  if (isAuthenticated) await loadAuthenticatedData();
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    isAuthenticated = Boolean(session);
    setAuthUI(isAuthenticated);
    if (event === 'SIGNED_IN' && isAuthenticated) await loadAuthenticatedData();
  });
}

async function loadAuthenticatedData() {
  await Promise.all([loadOrders(), loadProducts(), loadClients()]);
}

function orderMarkup(order, compact = false) {
  if (compact) {
    return `<article class="order-row" data-order-id="${order.id}">
      <span class="order-number">#${order.id.slice(-3)}</span>
      <div class="order-customer"><strong>${order.customer}</strong><span>${order.items}</span></div>
      <span class="order-type"><i data-lucide="${iconForType(order.type)}"></i>${order.type}</span>
      <strong class="order-total">${order.total}</strong>
      <button class="order-status status-${order.status}" data-advance="${order.id}">${order.label}</button><button class="payment-status ${order.payment === 'PAGADO' ? 'paid' : 'unpaid'}" data-payment="${order.id}">${order.payment === 'PAGADO' ? 'Pagado' : 'Sin pagar'}</button>
    </article>`;
  }
  return `<article class="board-card" data-order-id="${order.id}">
    <div class="board-card-top"><span>#${order.id}</span><span>${order.type}</span></div>
    <h4>${order.customer}</h4><p>${order.items}</p>
    <div class="board-card-bottom"><strong>${order.total}</strong><button class="payment-status ${order.payment === 'PAGADO' ? 'paid' : 'unpaid'}" data-payment="${order.id}">${order.payment === 'PAGADO' ? 'Pagado' : 'Sin pagar'}</button><button class="check-button" data-advance="${order.id}"><i data-lucide="check"></i>${order.status === 'listo' ? 'Entregar' : 'Avanzar'}</button></div>
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
  document.querySelectorAll('.chart svg, .chart-lines, .chart-labels').forEach((element) => { element.hidden = true; });
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
  if (supabaseClient) {
    metricValues[0].textContent = orders.length;
    const sales = orders.reduce((sum, order) => sum + Number(order.total.replace('Bs ', '')), 0);
    metricValues[1].textContent = `Bs ${sales.toFixed(2)}`;
    metricValues[3].textContent = `Bs ${orders.length ? (sales / orders.length).toFixed(2) : '0.00'}`;
    document.querySelector('.nav-count').textContent = orders.length;
    const dineIn = orders.filter((order) => order.type.startsWith('Mesa')).length;
    document.querySelector('.donut strong').textContent = orders.length;
    document.querySelectorAll('.donut-legend b')[0].textContent = dineIn;
    document.querySelectorAll('.donut-legend b')[1].textContent = orders.length - dineIn;
    document.querySelector('.donut').style.background = orders.length ? `conic-gradient(var(--coral) 0 ${(dineIn / orders.length) * 100}%, #f3c66d ${(dineIn / orders.length) * 100}% 100%)` : '#eee7df';
    document.querySelector('.best-sellers').innerHTML = '<div class="empty-state"><strong>Ranking en preparación</strong><span>Los productos más vendidos aparecerán con estadísticas detalladas.</span></div>';
    document.querySelectorAll('.metric-trend').forEach((trend) => { trend.textContent = 'Datos actuales'; });
  }
  document.querySelector('#pending-metric').textContent = orders.filter((order) => order.status !== 'listo').length;
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
  if (view === 'pedidos') renderBoard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal() { const form = document.querySelector('#order-form'); setupClientSearch(); addOrderBuilder(form); form.querySelector('.selected-order-items').innerHTML = ''; updateOrderTotal(); document.querySelector('#order-modal').classList.add('open'); document.querySelector('#order-modal').setAttribute('aria-hidden', 'false'); }
function closeModal() { document.querySelector('#order-modal').classList.remove('open'); document.querySelector('#order-modal').setAttribute('aria-hidden', 'true'); }

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
    menuFilter = ['todos', 'platos', 'bebidas', 'variaciones'][menuButtons.indexOf(menuButton)] || 'todos';
    renderProducts();
  }
  if (event.target.closest('.add-size')) {
    const editor = event.target.closest('[data-sizes-field]').querySelector('.sizes-editor');
    editor.insertAdjacentHTML('beforeend', sizeRowsMarkup([{ nombre: '', precio: 0 }]));
    refreshIcons();
  }
  if (event.target.closest('.remove-size')) event.target.closest('.size-row').remove();
  if (event.target.closest('.add-order-item')) addSelectedOrderItem();
  if (event.target.closest('.remove-order-item')) event.target.closest('.selected-order-item').remove();
  if (event.target.closest('.remove-order-item')) updateOrderTotal();
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
  if (editProduct) openProductModal(products.find((product) => String(product.id) === editProduct.dataset.editProduct));
  const deleteProductButton = event.target.closest('[data-delete-product]');
  if (deleteProductButton) deleteProduct(deleteProductButton.dataset.deleteProduct);
  const editClient = event.target.closest('[data-edit-client]');
  if (editClient) openClientModal(clients.find((client) => String(client.id) === editClient.dataset.editClient));
  if (event.target.closest('[data-deactivate-client]')) deactivateClient(document.querySelector('#client-form [name="id"]').value);
  if (event.target.closest('.modal-close') || event.target.id === 'order-modal') closeModal();
  if (event.target.closest('[data-close-product]') || event.target.id === 'product-modal') closeProductModal();
  if (event.target.closest('[data-close-client]') || event.target.id === 'client-modal') closeClientModal();
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
  if (!event.target.matches('.order-product')) return;
  const product = products.find((item) => String(item.id) === event.target.value);
  const sizeControl = document.querySelector('[data-size-control]');
  const sizeSelect = document.querySelector('.order-size');
  const preparationControl = document.querySelector('[data-preparation-control]');
  const preparationSelect = document.querySelector('.order-preparation');
  const isDrink = product?.tipo === 'BEBIDA';
  const isOnlyNormal = product && onlyNormalProducts.includes(product.nombre);
  sizeControl.hidden = isDrink;
  preparationControl.hidden = isDrink || isOnlyNormal;
  sizeSelect.innerHTML = product?.producto_tamanos?.map((size) => `<option value="${size.id}">${size.nombre} · Bs ${Number(size.precio).toFixed(2)}</option>`).join('') || '<option value="">Sin tamaños</option>';
  sizeSelect.disabled = isDrink || !product?.producto_tamanos?.length;
  preparationSelect.innerHTML = (product && !isDrink && !isOnlyNormal ? preparationOptions(product) : []).map((variation, index) => `<option value="${variation.id}" ${index === 0 ? 'selected' : ''}>${variation.nombre}</option>`).join('');
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
  if (supabaseClient) {
    const type = form.querySelector('select').value === 'En mesa' ? 'MESA' : 'PARA_LLEVAR';
    const selectedItems = [...form.querySelectorAll('.selected-order-item')];
      if (!selectedItems.length) { showOrderError('Añade al menos un producto al pedido.'); return; }
    const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.dataset.quantity) * Number(item.dataset.price), 0);
    const clientId = form.elements.cliente_id.value || null;
    const paid = form.elements.pagado.checked;
    const { data: order, error } = await supabaseClient.from('pedidos').insert({ cliente_id: clientId, tipo_pedido: type, estado: 'PENDIENTE', estado_pago: paid ? 'PAGADO' : 'PENDIENTE', pagado_at: paid ? new Date().toISOString() : null, subtotal, total: subtotal }).select('id').single();
    if (error) { showOrderError(`No se pudo crear el pedido: ${error.message}`); console.error(error); return; }
    if (order && selectedItems.length) {
      const details = selectedItems.map((item) => ({ pedido_id: order.id, producto_id: item.dataset.productId, tamano_id: item.dataset.sizeId || null, variacion_id: item.dataset.variationId || null, cantidad: Number(item.dataset.quantity), precio_unitario: Number(item.dataset.price), subtotal: Number(item.dataset.quantity) * Number(item.dataset.price) }));
      let detailResponse = await supabaseClient.from('detalle_pedido').insert(details);
      if (detailResponse.error?.message?.includes('tamano_id')) {
        detailResponse = await supabaseClient.from('detalle_pedido').insert(details.map(({ tamano_id, ...detail }) => detail));
      }
      if (detailResponse.error) { showOrderError(`El pedido se creó, pero no se guardaron sus productos: ${detailResponse.error.message}`); console.error(detailResponse.error); return; }
    }
    await loadOrders();
  }
  closeModal();
  showToast('Nuevo pedido creado');
});

document.querySelector('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabaseClient) { showToast('Configura Supabase para guardar productos'); return; }
  const form = event.currentTarget;
  const payload = { nombre: form.elements.nombre.value.trim(), descripcion: form.elements.descripcion.value.trim() || null, precio: Number(form.elements.precio.value), tipo: form.elements.tipo.value, activo: form.elements.activo.checked, updated_at: new Date().toISOString() };
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
  showToast(id ? 'Producto actualizado' : 'Producto creado');
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
  showToast(id ? 'Cliente actualizado' : 'Cliente registrado');
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