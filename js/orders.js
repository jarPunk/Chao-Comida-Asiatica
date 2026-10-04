/* CHAO · Pedidos — comandas, tablero, constructor de pedido y cobros (antes en app.js) */
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
  const status = { PENDIENTE: 'pendiente', EN_PREPARACION: 'preparacion', LISTO: 'listo', ENTREGADO: 'entregado' }[row.estado] || 'pendiente';
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

function scheduleOrdersReload() {
  window.clearTimeout(ordersReloadTimer);
  ordersReloadTimer = window.setTimeout(() => loadOrders(), 250);
}

function stopOrdersRealtime() {
  if (ordersRealtimeChannel && supabaseClient) supabaseClient.removeChannel(ordersRealtimeChannel);
  ordersRealtimeChannel = null;
  window.clearTimeout(ordersReloadTimer);
  ordersReloadTimer = null;
}

function startOrdersRealtime() {
  if (!supabaseClient || !isAuthenticated) return;
  stopOrdersRealtime();
  ordersRealtimeChannel = supabaseClient
    .channel('orders-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, scheduleOrdersReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'detalle_pedido' }, scheduleOrdersReload)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') console.error('No se pudo conectar la actualización en tiempo real de pedidos.');
    });
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
  if (quantityOnlyProduct(product) || isGyozaProduct(product)) return [];
  const names = isPlainFlavorProduct(product) ? ['Normal'] : defaultPreparations;
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
  const preparation = isPlainFlavorProduct(product)
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
  item.classList.add('just-added');
  window.setTimeout(() => item.classList.remove('just-added'), 650);
  item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
  const nameEl = item.querySelector('.line-name') || item.querySelector('.selected-order-label');
  if (nameEl) nameEl.textContent = `${item.dataset.quantity} × ${product.nombre}${size ? ` · ${size.nombre}` : ''}${variation && variation !== 'Normal' ? ` · ${variation}` : ''}`;
  const totalEl = item.querySelector('.line-total');
  if (totalEl) totalEl.textContent = `Bs ${(Number(item.dataset.quantity) * Number(item.dataset.price || 0)).toFixed(2)}`;
  updateOrderTotal();
}

async function togglePayment(id) {
  const order = orders.find((item) => item.id === id);
  if (!order || !supabaseClient || busyOrders.has(`pay:${id}`)) return;
  busyOrders.add(`pay:${id}`);
  try {
  const paid = order.payment !== 'PAGADO';
  const { error } = await supabaseClient.from('pedidos').update({ estado_pago: paid ? 'PAGADO' : 'PENDIENTE', pagado_at: paid ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', order.databaseId);
  if (error) { showToast('No se pudo actualizar el pago'); console.error(error); return; }
  order.payment = paid ? 'PAGADO' : 'PENDIENTE';
  renderHomeOrders();
  renderBoard(document.querySelector('.segmented-control button.active')?.dataset.filter || 'todos');
  showToast(paid ? `Pedido #${id} marcado como pagado` : `Pedido #${id} marcado como pendiente`);
  } finally {
    busyOrders.delete(`pay:${id}`);
  }
}


function orderItemsMarkup(order) {
  if (!order.details?.length) return `<span class="order-item-box"><span class="qty">•</span><span class="order-item-text"><strong>${menuEscape(order.items)}</strong></span></span>`;
  return order.details.map((detail) => {
    const productName = detail.productos?.nombre || 'Producto';
    const product = products.find((item) => item.nombre === productName);
    const size = findOrderSize(product, detail);
    const sizeName = size?.nombre && !isDefaultSizeName(size.nombre) ? size.nombre : '';
    const variation = detail.variaciones?.nombre && detail.variaciones.nombre !== 'Normal' ? detail.variaciones.nombre : '';
    const kind = product?.tipo === 'BEBIDA' ? ' is-drink' : ' is-dish';
    const sizeBadge = sizeName ? `<small class="opt opt-size" title="Tamaño: ${menuEscape(sizeName)}">${menuEscape(sizeName)}</small>` : '';
    const prepSlug = variation.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    const prepBadge = variation ? `<small class="opt opt-prep opt-${prepSlug}" title="Sabor: ${menuEscape(variation)}">${menuEscape(variation)}</small>` : '';
    return `<span class="order-item-box${kind}"><span class="qty">${menuEscape(detail.cantidad)}×</span><span class="order-item-text"><strong>${menuEscape(productName)}</strong>${sizeBadge}${prepBadge}</span></span>`;
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
  if (order.status === 'listo') {
    return `<article class="board-card listo-mini status-${order.status}" data-order-id="${order.id}">
    <button type="button" class="mini-main" data-read-order="${order.id}" aria-label="Ver pedido ${order.id} completo">
      <span class="mini-number">#${order.id}</span>
      <strong class="mini-customer">${order.customer}</strong>
      <span class="mini-total">${order.total}</span>
    </button>
    <button class="payment-status mini ${order.payment === 'PAGADO' ? 'paid' : 'unpaid'}" data-payment="${order.id}">${order.payment === 'PAGADO' ? 'Pagado' : 'S/pagar'}</button>
    <button class="check-button mini" data-advance="${order.id}"><i data-lucide="check"></i>Entregado</button>
    <button class="btn-action danger mini" data-delete-order-id="${order.databaseId}" title="Eliminar pedido"><i data-lucide="trash-2"></i></button>
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
      <button class="check-button" data-advance="${order.id}"><i data-lucide="check"></i>${order.status === 'listo' ? 'Entregado' : 'Avanzar'}</button>
    </div>
  </article>`;
}

function renderHomeOrders() {
  const active = orders.filter((order) => order.status !== 'entregado');
  document.querySelector('#orders-list').innerHTML = active.length
    ? active.slice(0, 5).map((order) => orderMarkup(order, true)).join('')
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
    const count = button.dataset.filter === 'todos' ? orders.filter((order) => order.status !== 'entregado').length : orders.filter((order) => order.status === button.dataset.filter).length;
    button.innerHTML = `${button.dataset.filter === 'todos' ? 'Todos' : statusLabels[button.dataset.filter]} <b>${count}</b>`;
  });
  refreshIcons();
}


const busyOrders = new Set();

async function advanceOrder(id) {
  const order = orders.find((item) => item.id === id);
  if (!order || !statusOrder.includes(order.status) || busyOrders.has(`adv:${id}`)) return;
  busyOrders.add(`adv:${id}`);
  try {
  const nextIndex = Math.min(statusOrder.indexOf(order.status) + 1, statusOrder.length - 1);
  if (order.status === 'listo') {
    if (supabaseClient) {
      let { error } = await supabaseClient.from('pedidos').update({ estado: 'ENTREGADO', entregado_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.databaseId);
      if (error?.message?.includes('entregado_at')) {
        ({ error } = await supabaseClient.from('pedidos').update({ estado: 'ENTREGADO', updated_at: new Date().toISOString() }).eq('id', order.databaseId));
      }
      if (error) { showToast('No se pudo marcar como entregado'); console.error(error); return; }
    }
    order.status = 'entregado';
    order.label = statusLabels.entregado;
    renderHomeOrders();
    renderBoard(document.querySelector('.segmented-control button.active')?.dataset.filter || 'todos');
    updateMetric();
    showToast(`Pedido #${id} entregado`);
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
  } finally {
    busyOrders.delete(`adv:${id}`);
  }
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
    syncClientClear(clientPicker);
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
    syncClientClear(clientPicker);
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


document.querySelector('#order-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector('[type="submit"]');
  if (submitBtn?.disabled) return;
  addOrderBuilder(form);
  const orderId = form.elements.id.value;
  if (supabaseClient) {
    const originalBtn = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = 'Guardando…'; }
    try {
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
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalBtn; refreshIcons(); }
    }
  }
  closeModal();
  if (supabaseClient) showSuccessConfirmation(orderId ? '¡Pedido actualizado!' : '¡Pedido registrado!', 'El pedido y sus productos se guardaron correctamente.');
});

