function orderQuantity(value) {
  return Math.min(9999, Math.max(1, Math.floor(Number(value) || 1)));
}

function renderOrderCatalog() {
  const grid = document.querySelector('.order-catalog-grid');
  if (!grid) return;
  const term = normalizeMenuText(document.querySelector('[data-order-search]').value.trim());
  const category = document.querySelector('[data-order-category].active')?.dataset.orderCategory || 'todos';
  const list = products.filter(p => p.activo && !p.menuOnly && normalizeMenuText(p.nombre).includes(term) && (category === 'todos' || (category === 'extras' ? isChickenExtra(p) || p.tipo === 'EXTRA' : category === 'bebidas' ? p.tipo === 'BEBIDA' : p.tipo === 'PLATO' && !isChickenExtra(p))));
  grid.innerHTML = list.map(p => `<button type="button" class="order-product-card" data-order-card="${menuEscape(p.id)}" aria-label="Añadir ${menuEscape(p.nombre)}">${menuIllustration(p)}<span class="order-card-name">${menuEscape(p.nombre)}</span><span class="order-card-price">${!quantityOnlyProduct(p) && p.producto_tamanos?.length ? 'Desde ' : ''}Bs ${Number(!quantityOnlyProduct(p) && p.producto_tamanos?.length ? Math.min(...p.producto_tamanos.map(s => Number(s.precio))) : p.precio).toFixed(2)} <span aria-hidden="true">＋</span></span></button>`).join('') || '<p class="catalog-empty">No hay productos disponibles con ese nombre.</p>';
}

function setupOrderCatalog(field) {
  field.insertAdjacentHTML('afterbegin', '<div class="order-catalog"><label>Buscar en la carta<input type="search" data-order-search placeholder="Nombre del plato o refresco" /></label><div class="order-category-filters" role="group" aria-label="Categorías">'+[['todos','Todos'],['platos','Platos'],['bebidas','Bebidas'],['extras','Extras']].map(([key,label])=>`<button type="button" data-order-category="${key}" class="${key==='todos'?'active':''}" aria-pressed="${key==='todos'}">${label}</button>`).join('')+'</div><div class="order-catalog-grid"></div><p class="order-catalog-hint">Toca un producto para añadirlo. Ajusta sus opciones en la comanda.</p></div><h3 class="comanda-title">Tu comanda</h3>');
  field.querySelector('.order-item-row').hidden = true;
  renderOrderCatalog();
}

function enhanceOrderItem(item) {
  const product = products.find(p => String(p.id) === item.dataset.productId);
  if (!product) return;
  const choices = preparationOptions(product);
  const sizes = quantityOnlyProduct(product) ? [] : product.producto_tamanos || [];
  const quantity = orderQuantity(item.dataset.quantity);
  item.dataset.quantity = quantity;
  if (quantityOnlyProduct(product)) { item.dataset.sizeId = ''; item.dataset.variationId = ''; }
  item.innerHTML = `<span class="selected-order-label"></span><div class="quantity-stepper"><button type="button" data-quantity-step="-1" aria-label="Reducir cantidad de ${menuEscape(product.nombre)}">−</button><input class="selected-order-quantity" type="text" inputmode="numeric" pattern="[0-9]+" maxlength="4" required value="${quantity}" aria-label="Cantidad de ${menuEscape(product.nombre)}"><button type="button" data-quantity-step="1" aria-label="Aumentar cantidad de ${menuEscape(product.nombre)}">+</button></div><div class="order-line-options">${sizes.length ? `<label>Tamaño<select class="selected-order-size">${sizes.map(s=>`<option value="${menuEscape(s.id)}" ${String(s.id)===item.dataset.sizeId?'selected':''}>${menuEscape(s.nombre)} · Bs ${Number(s.precio).toFixed(2)}</option>`).join('')}</select></label>` : ''}${choices.length>1 ? `<label>Preparación<select class="selected-order-preparation">${choices.map(p=>`<option value="${menuEscape(p.id)}" ${String(p.id)===item.dataset.variationId?'selected':''}>${menuEscape(p.nombre)}</option>`).join('')}</select></label>` : ''}</div><button type="button" class="remove-order-item" aria-label="Quitar ${menuEscape(product.nombre)}">×</button>`;
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
  if (event.target.matches('[data-order-search]')) renderOrderCatalog();
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
  if (event.target.matches('.selected-order-size')) {
    const item = event.target.closest('.selected-order-item');
    const p = products.find(p=>String(p.id)===item.dataset.productId);
    const size = p?.producto_tamanos?.find(s=>String(s.id)===event.target.value);
    if (size) { item.dataset.sizeId=size.id; item.dataset.price=size.precio; updateEditableOrderItem(item); }
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
    showSuccessConfirmation('¡Cliente registrado!', `${nombre} ${apellidos} ya está seleccionado en tu pedido. Puedes continuar con la comanda.`);
  } catch (err) { error.textContent = err.message; }
  finally { button.disabled = false; }
});
