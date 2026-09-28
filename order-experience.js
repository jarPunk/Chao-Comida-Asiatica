function setupOrderTypeSelection() {
  const select = document.querySelector('#order-form select[name="tipo_pedido"]');
  if (!select) return;
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'order-type-selection';
  fieldset.innerHTML = '<legend>Tipo de pedido</legend><div class="order-type-options"><label class="order-type-option"><input type="radio" name="tipo_pedido" value="Para llevar" checked><span><strong>Para llevar</strong><small>Recoger en el local</small></span></label><label class="order-type-option"><input type="radio" name="tipo_pedido" value="En mesa"><span><strong>En mesa</strong><small>Servir en el local</small></span></label></div>';
  select.closest('label').replaceWith(fieldset);
  const form = document.querySelector('#order-form');
  const details = form.querySelector('.order-details');
  const paid = form.querySelector('.payment-check');
  if (!details || !paid || form.querySelector('.order-sticky-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'order-sticky-bar';
  details.before(bar);
  bar.append(fieldset, paid);
}

setupOrderTypeSelection();

function orderQuantity(value) {
  return Math.min(9999, Math.max(1, Math.floor(Number(value) || 1)));
}

function showOrderReading(id) {
  const order = orders.find(o => o.id === id);
  if (!order) return;
  let backdrop = document.querySelector('#order-reading-modal');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'order-reading-modal';
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="order-reading-title" tabindex="-1"><header class="modal-header"><button class="modal-close" type="button" aria-label="Cerrar detalle">×</button><p class="eyebrow">Detalle del pedido</p><h2 id="order-reading-title"></h2></header><dl class="reading-status-bar" aria-label="Entrega y pago"></dl><div class="modal-body"></div><footer class="modal-footer"><div class="reading-total"><span>Total del pedido</span><strong></strong></div><button type="button" class="primary-button" data-modal-cancel>Cerrar</button></footer></div>';
    document.body.append(backdrop);
  }
  backdrop.querySelector('h2').textContent = `Pedido #${order.id}`;
  const isDineIn = /^(mesa\b|en mesa\b)/i.test(order.type || '');
  const serviceLabel = isDineIn ? (order.type === 'Mesa' ? 'En mesa' : order.type) : order.type;
  const paid = order.payment === 'PAGADO';
  const serviceIcon = isDineIn ? '<path d="M4 10h16M6 10v10m12-10v10M8 10V4h8v6"/>' : '<path d="M5 7h14l1 13H4L5 7Zm4 0V5a3 3 0 0 1 6 0v2"/>';
  const paymentIcon = paid ? '<path d="m7 12 3 3 7-7"/>' : '<path d="M12 7v6m0 3h.01"/>';
  backdrop.querySelector('.reading-status-bar').innerHTML = `<div class="reading-status reading-service"><dt>Tipo de pedido</dt><dd><svg viewBox="0 0 24 24" aria-hidden="true">${serviceIcon}</svg><span>${menuEscape(serviceLabel)}</span></dd></div><div class="reading-status ${paid ? 'reading-paid' : 'reading-unpaid'}"><dt>Estado de pago</dt><dd><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>${paymentIcon}</svg><span>${paid ? 'Pagado' : 'Sin pagar'}</span></dd></div>`;
  const lines = order.details?.length ? order.details.map(d => { const productName = d.productos?.nombre || 'Producto'; const product = products.find(item => item.nombre === productName); const size = findOrderSize(product, d); return `<li><strong>${menuEscape(d.cantidad)} × ${menuEscape(productName)}${size?.nombre ? ` · ${menuEscape(size.nombre)}` : ''}</strong>${d.variaciones?.nombre ? `<span>${menuEscape(d.variaciones.nombre)}</span>` : ''}${d.precio_unitario != null ? `<span>Bs ${(Number(d.cantidad) * Number(d.precio_unitario)).toFixed(2)}</span>` : ''}</li>`; }).join('') : `<li>${menuEscape(order.items)}</li>`;
  backdrop.querySelector('.modal-body').innerHTML = `<div class="reading-customer"><strong>${menuEscape(order.customer)}</strong><p>Estado de cocina: <strong>${menuEscape(order.label)}</strong></p></div><ul class="reading-items">${lines}</ul>${order.notes ? `<section class="reading-notes"><h3>Notas</h3><p>${menuEscape(order.notes)}</p></section>` : ''}`;
  backdrop.querySelector('.reading-total strong').textContent = order.total;
  showDialog('order-reading-modal');
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-read-order]');
  if (button) showOrderReading(button.dataset.readOrder);
});

function renderOrderCatalog() {
  const grid = document.querySelector('.order-catalog-grid');
  if (!grid) return;
  const category = document.querySelector('[data-order-category].active')?.dataset.orderCategory || 'todos';
  const list = products.filter(p => p.activo && !p.menuOnly && (category === 'todos' || (category === 'extras' ? isChickenExtra(p) || p.tipo === 'EXTRA' : category === 'bebidas' ? p.tipo === 'BEBIDA' : p.tipo === 'PLATO' && !isChickenExtra(p))));
  grid.innerHTML = list.map(p => `<button type="button" class="order-product-card" data-order-card="${menuEscape(p.id)}" aria-label="Añadir ${menuEscape(p.nombre)}">${menuIllustration(p)}<span class="order-card-name">${menuEscape(p.nombre)}</span><span class="order-card-price">${!quantityOnlyProduct(p) && p.producto_tamanos?.length ? 'Desde ' : ''}Bs ${Number(!quantityOnlyProduct(p) && p.producto_tamanos?.length ? Math.min(...p.producto_tamanos.map(s => Number(s.precio))) : p.precio).toFixed(2)} <span aria-hidden="true">＋</span></span></button>`).join('') || '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
}

function setupOrderCatalog(field) {
  field.insertAdjacentHTML('afterbegin', '<div class="order-catalog"><div class="order-category-filters" role="group" aria-label="Categorías">'+[['todos','Todos'],['platos','Platos'],['bebidas','Bebidas'],['extras','Extras']].map(([key,label])=>`<button type="button" data-order-category="${key}" class="${key==='todos'?'active':''}" aria-pressed="${key==='todos'}">${label}</button>`).join('')+'</div><div class="order-catalog-grid"></div><p class="order-catalog-hint">Toca un producto para añadirlo. Ajusta sus opciones en la comanda.</p></div><h3 class="comanda-title">Tu comanda</h3>');
  field.querySelector('.order-item-row').hidden = true;
  renderOrderCatalog();
}

let orderOptionGroup = 0;

function enhanceOrderItem(item) {
  const product = products.find(p => String(p.id) === item.dataset.productId);
  if (!product) return;
  const choices = preparationOptions(product);
  const sizes = quantityOnlyProduct(product) ? [] : product.producto_tamanos || [];
  const quantity = orderQuantity(item.dataset.quantity);
  const group = ++orderOptionGroup;
  item.dataset.quantity = quantity;
  if (quantityOnlyProduct(product)) { item.dataset.sizeId = ''; item.dataset.variationId = ''; }
  const selectedSize = sizes.find(s => String(s.id) === String(item.dataset.sizeId));
  const selectedPreparation = choices.find(p => String(p.id) === item.dataset.variationId) || (!item.dataset.variationId ? choices[0] : null);
  const sizeOptions = sizes.length ? `<fieldset class="order-option-group"><legend>Tamaño</legend><div class="order-option-buttons">${sizes.map(s => `<label class="order-option-button"><input class="order-option-input selected-order-size" type="radio" name="order-size-${group}" value="${menuEscape(s.id)}" data-size-price="${Number(s.precio)}" ${String(s.id) === String(selectedSize?.id) ? 'checked' : ''}><span class="order-option-label"><span class="order-option-text">${menuEscape(s.nombre)}<span class="order-option-price">Bs ${Number(s.precio).toFixed(2)}</span></span></span></label>`).join('')}</div></fieldset>` : '';
  const preparationOptionsMarkup = choices.length > 1 ? `<fieldset class="order-option-group"><legend>Preparación</legend><div class="order-option-buttons">${choices.map(p => `<label class="order-option-button"><input class="order-option-input selected-order-preparation" type="radio" name="order-preparation-${group}" value="${menuEscape(p.id)}" data-preparation-name="${menuEscape(p.nombre)}" ${p === selectedPreparation ? 'checked' : ''}><span class="order-option-label"><span class="order-option-text">${menuEscape(p.nombre)}</span></span></label>`).join('')}</div></fieldset>` : '';
  item.innerHTML = `<span class="selected-order-label"></span><div class="quantity-stepper"><button type="button" data-quantity-step="-1" aria-label="Reducir cantidad de ${menuEscape(product.nombre)}">−</button><input class="selected-order-quantity" type="text" inputmode="numeric" pattern="[0-9]+" maxlength="4" required value="${quantity}" aria-label="Cantidad de ${menuEscape(product.nombre)}"><button type="button" data-quantity-step="1" aria-label="Aumentar cantidad de ${menuEscape(product.nombre)}">+</button></div><div class="order-line-options">${sizeOptions}${preparationOptionsMarkup}</div><button type="button" class="remove-order-item" aria-label="Quitar ${menuEscape(product.nombre)}">×</button>`;
  updateEditableOrderItem(item);
}

document.addEventListener('click', event => {
  const card = event.target.closest('[data-order-card]');
  if (card) {
    const select = document.querySelector('.order-product');
    select.value = card.dataset.orderCard;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('.order-quantity').value = '1';
    addSelectedOrderItem();
    showOrderError('');
    document.querySelector('.order-details').open = false;
    showToast('Producto añadido a la comanda');
  }
  const category = event.target.closest('[data-order-category]');
  if (category) {
    document.querySelectorAll('[data-order-category]').forEach(b=> { b.classList.toggle('active', b===category); b.setAttribute('aria-pressed', String(b===category)); });
    renderOrderCatalog();
  }
  const step = event.target.closest('[data-quantity-step]');
  if (step) {
    const item = step.closest('.selected-order-item');
    const input = item.querySelector('.selected-order-quantity');
    input.value = orderQuantity(Number(input.value) + Number(step.dataset.quantityStep));
    updateEditableOrderItem(item);
  }
  if (event.target.closest('[data-quick-client]')) {
    document.querySelector('#quick-client-form').reset();
    document.querySelector('#quick-client-error').textContent = '';
    showDialog('quick-client-modal', { nested: true });
  }
});
document.addEventListener('input', event => {
  if (event.target.closest('#order-form')) updateOrderDetailsSummary();
  if (event.target.matches('.selected-order-quantity, .order-quantity')) {
    event.target.value = event.target.value.replace(/[^0-9]/g, '').slice(0,4);
    const item = event.target.closest('.selected-order-item');
    if (item) updateEditableOrderItem(item);
  }
});
document.addEventListener('beforeinput', event => {
  if (event.target.matches('.selected-order-quantity, .order-quantity') && event.data && /[^0-9]/.test(event.data)) event.preventDefault();
});
document.addEventListener('focusout', event => {
  if (event.target.matches('.selected-order-quantity, .order-quantity')) event.target.value = orderQuantity(event.target.value);
});
document.addEventListener('change', event => {
  if (event.target.matches('.selected-order-size:checked')) {
    const item = event.target.closest('.selected-order-item');
    const p = products.find(p=>String(p.id)===item.dataset.productId);
    const size = p?.producto_tamanos?.find(s=>String(s.id)===event.target.value);
    if (size) { item.dataset.sizeId = String(size.id); item.dataset.price = size.precio; updateEditableOrderItem(item); }
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'quick-client-form') return;
  event.preventDefault();
  const form = event.target, button = form.querySelector('[type="submit"]'), error = document.querySelector('#quick-client-error');
  if (button.disabled) return;
  error.textContent = '';
  if (!supabaseClient) { error.textContent = 'Conecta la base de datos para guardar el cliente.'; return; }
  button.disabled = true;
  try {
    const nombre = form.elements.nombres.value.trim();
    if (!nombre) throw new Error('Escribe el nombre del cliente.');
    const apellidos = form.elements.apellidos.value.trim();
    if (!apellidos) throw new Error('Escribe los apellidos del cliente.');
    const payload = { nombres: nombre, apellidos, telefono: form.elements.telefono.value.trim() || null, activo: true };
    const response = await supabaseClient.from('clientes').insert(payload).select('id, nombres, apellidos, telefono, activo').single();
    if (response.error) throw new Error('No se pudo guardar el cliente. Revisa tu conexión y permisos e intenta otra vez.');
    if (!response.data?.id) throw new Error('No se recibió el cliente guardado. Revisa la lista de clientes antes de reintentar.');
    clients = clients.filter(client => String(client.id) !== String(response.data.id));
    clients.push(response.data);
    renderClients(); renderClientPicker();
    const order = document.querySelector('#order-form');
    order.elements.cliente_id.value = response.data.id;
    order.querySelector('[data-client-search]').value = `${nombre} ${apellidos}`;
    hideDialog('quick-client-modal');
    const search = order.querySelector('[data-client-search]');
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.focus({ preventScroll: true });
    order.querySelector('.client-results').classList.remove('open');
    updateOrderDetailsSummary();
    showSuccessConfirmation('¡Cliente registrado!', 'Ya está seleccionado en tu pedido.', { brief: true });
  } catch (err) { error.textContent = err.message; }
  finally { button.disabled = false; }
});

function updateOrderDetailsSummary() {
  const form = document.querySelector('#order-form');
  if (!form?.querySelector('[data-order-summary]')) return;
  const client = clients.find(c => String(c.id) === form.elements.cliente_id?.value);
  const name = client ? `${client.nombres} ${client.apellidos}`.trim() : 'Cliente ocasional';
  form.querySelector('[data-order-summary]').textContent = `${name} · ${form.elements.tipo_pedido.value}${form.elements.pagado.checked ? ' · Pagado' : ''}`;
  form.querySelector('[data-notes-summary]').textContent = form.querySelector('textarea').value.trim() ? 'Con indicaciones' : 'Opcional';
}
document.addEventListener('change', event => {
  if (event.target.closest('#order-form')) updateOrderDetailsSummary();
});
