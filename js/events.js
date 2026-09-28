/* CHAO · Eventos globales delegados (click/change/input) (antes en app.js) */
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
    menuFilter = menuButton.dataset.folder || 'todos';
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
  if (event.target.matches('#product-form [name="nombre"]')) syncGyozaProductFields(event.target.form);
  if (event.target.matches('.selected-order-preparation, .selected-order-quantity')) {
    updateEditableOrderItem(event.target.closest('.selected-order-item'));
    return;
  }
  if (event.target.matches('#orders-date-picker')) {
    selectedOrdersDate = event.target.value || getBoliviaDateValue();
    loadOrders();
    return;
  }
  if (event.target.matches('#client-date-filter')) {
    clientDateFilter = event.target.value;
    renderClients();
    return;
  }
  if (event.target.closest('[data-clear-client-date]')) {
    clientDateFilter = '';
    const dateInput = document.querySelector('#client-date-filter');
    if (dateInput) dateInput.value = '';
    const searchInput = document.querySelector('#view-clientes .table-toolbar .search-field input');
    if (searchInput) searchInput.value = '';
    renderClients();
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
  const isOnlyNormal = product && isPlainFlavorProduct(product);
  const quantityOnly = !product || quantityOnlyProduct(product);
  const hasPrepOptions = product && preparationOptions(product).length > 0;
  sizeControl.hidden = quantityOnly;
  preparationControl.hidden = quantityOnly || isOnlyNormal || !hasPrepOptions;
  preparationSelect.disabled = quantityOnly || isOnlyNormal || !hasPrepOptions;
  sizeSelect.innerHTML = (quantityOnly ? [] : product?.producto_tamanos)?.map((size) => `<option value="${size.id}">${size.nombre} · Bs ${Number(size.precio).toFixed(2)}</option>`).join('') || '<option value="">Sin tamaños</option>';
  sizeSelect.disabled = quantityOnly || !product?.producto_tamanos?.length;
  preparationSelect.innerHTML = (product && !quantityOnly && !isOnlyNormal ? preparationOptions(product) : []).map((variation, index) => `<option value="${variation.id}" ${index === 0 ? 'selected' : ''}>${variation.nombre}</option>`).join('');
});

document.addEventListener('input', (event) => {
  if (event.target.matches('#product-form [name="nombre"]')) syncGyozaProductFields(event.target.form);
  const search = event.target.closest('#view-clientes .table-toolbar .search-field input');
  if (search) { renderClients(); return; }
});

