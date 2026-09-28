/* CHAO · Menú — productos, tamaños, variaciones, ilustraciones y modal de producto (antes en app.js) */
function preparationNames(product) {
  if (isGyozaProduct(product)) return [];
  const saved = product.producto_variaciones?.map((item) => item.variaciones?.nombre).filter(Boolean) || [];
  if (isMixedDish(product)) return [...new Set([...mixedPreparations, ...saved])].filter((name) => normalizeMenuText(name).trim() !== 'dulce');
  if (saved.length) return saved;
  return isPlainFlavorProduct(product) ? ['Normal'] : defaultPreparations;
}

function allowedPreparationIds(product) {
  const saved = product.producto_variaciones?.map((item) => item.variacion_id) || [];
  if (saved.length) return saved;
  const names = isPlainFlavorProduct(product) ? ['Normal'] : defaultPreparations;
  return variations.filter((variation) => names.includes(variation.nombre)).map((variation) => variation.id);
}


function servingLabel(product) {
  if (product.tipo === 'BEBIDA' || product.tipo === 'EXTRA' || isChickenExtra(product)) return '';
  if (isGyozaProduct(product)) return 'Plato llano · 6 piezas';
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
  const gyoza = isGyozaProduct(product);
  const chicken = /chicharron/.test(name);
  const hasShrimp = /\bcamaron(?:es)?\b/.test(name);
  const shrimpMarkup = hasShrimp ? '<span class="shrimp shrimp-one"></span><span class="shrimp shrimp-two"></span><span class="shrimp shrimp-three"></span>' : '';
  const kind = extra ? 'chicken-extra' : /arroz|chaufa/.test(name) ? 'rice' : 'noodles';
  const grains = Array.from({ length: 50 }, (_, i) => `<span class="rice-grain" style="--x:${9 + (i * 23 % 80)}%;--y:${8 + (i * 37 % 81)}%;--r:${i * 47}deg"></span>`).join('');
  if (gyoza) {
    const pieces = Array.from({ length: 6 }, (_, i) => `<span class="gyoza-piece gyoza-${i + 1}"></span>`).join('');
    return `<div class="menu-visual dish-gyoza" aria-hidden="true"><div class="food-art"><span class="chopstick chopstick-one"></span><span class="chopstick chopstick-two"></span><div class="food-plate"><div class="food-serving">${pieces}</div><span class="gyoza-sauce"></span></div></div></div>`;
  }
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
  const isCustomer = document.body.classList.contains('customer-menu');
  const menuProducts = [...products];
  if (!products.some(isMixedDish)) menuProducts.push(mixedDish);
  if (!products.some(isChickenExtra)) menuProducts.push(chickenExtra);
  const visibleProducts = isCustomer ? menuProducts.filter((product) => product.activo) : menuProducts;
  renderMenuTabs(visibleProducts, isCustomer);
  const filteredProducts = visibleProducts.filter((product) => {
    if (menuSearch && !normalizeMenuText(`${product.nombre} ${product.descripcion || ''}`).includes(normalizeMenuText(menuSearch))) return false;
    if (menuFilter === 'variaciones') return product.tipo === 'PLATO' && !isChickenExtra(product) && preparationNames(product).length > 1;
    if (menuFilter.startsWith('c:')) return customerFolderOf(product) === menuFilter.slice(2);
    return true;
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
  menuFilter = 'todos';
  renderProducts();
}

const customerFolders = [
  { key: 'arroces', label: 'Arroces' },
  { key: 'tallarines', label: 'Tallarines' },
  { key: 'pollos', label: 'Pollos' },
  { key: 'extras', label: 'Gyozas y extras' },
  { key: 'bebidas', label: 'Bebidas' },
  { key: 'otros', label: 'Otros' },
];

function customerFolderOf(product) {
  const name = normalizeMenuText(product.nombre || '');
  if (product.tipo === 'BEBIDA') return 'bebidas';
  if (/gyoza|giosa|gyosa/.test(name)) return 'extras';
  if (product.tipo === 'EXTRA' || isChickenExtra(product)) return 'extras';
  if (/arroz|chaufa/.test(name)) return 'arroces';
  if (/tallarin|yakisoba|fideo/.test(name)) return 'tallarines';
  if (/pollo|chicharron|kung|mixto/.test(name)) return 'pollos';
  return 'otros';
}

function menuTabButton(folder, label, count) {
  const active = menuFilter === folder;
  return `<button type="button" class="${active ? 'active' : ''}" data-folder="${folder}" aria-pressed="${active}">${label} <b>${count}</b></button>`;
}

function renderMenuTabs(visibleProducts, isCustomer) {
  const tabs = document.querySelector('#view-menu .menu-tabs');
  if (!tabs) return;
  const counts = {};
  visibleProducts.forEach((product) => {
    const key = customerFolderOf(product);
    counts[key] = (counts[key] || 0) + 1;
  });
  let html = menuTabButton('todos', 'Todos', visibleProducts.length);
  html += customerFolders.filter((folder) => counts[folder.key]).map((folder) => menuTabButton(`c:${folder.key}`, folder.label, counts[folder.key])).join('');
  if (!isCustomer) {
    const varCount = visibleProducts.filter((product) => product.tipo === 'PLATO' && !isChickenExtra(product) && preparationNames(product).length > 1).length;
    html += menuTabButton('variaciones', 'Variaciones', varCount);
  }
  tabs.innerHTML = html;
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
  syncGyozaProductFields(form);
}

function syncGyozaProductFields(form) {
  const sizesField = form?.querySelector('[data-sizes-field]');
  if (!sizesField) return;
  const isGyoza = isGyozaProduct(form.elements.nombre?.value || '');
  const hide = form.elements.tipo?.value === 'BEBIDA' || isGyoza;
  const addSize = sizesField.querySelector('.add-size');
  const sizesEditor = sizesField.querySelector('.sizes-editor');
  const prepLabel = sizesField.querySelector('.preparation-label');
  const prepEditor = sizesField.querySelector('.preparations-editor');
  if (addSize) addSize.hidden = hide;
  if (sizesEditor) sizesEditor.hidden = hide;
  if (prepLabel) prepLabel.hidden = hide;
  if (prepEditor) prepEditor.hidden = hide;
  if (isGyoza) sizesField.querySelectorAll('.preparation-option input').forEach((input) => { input.checked = false; });
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
  const isGyoza = isGyozaProduct(product?.nombre || form.elements.nombre.value);
  const hideSinglePrice = isDrink || isGyoza;
  sizesField.querySelector('.add-size').hidden = hideSinglePrice;
  sizesField.querySelector('.sizes-editor').hidden = hideSinglePrice;
  sizesField.querySelector('.preparation-label').hidden = hideSinglePrice;
  sizesField.querySelector('.preparations-editor').hidden = hideSinglePrice;
  setupDrinkColorField(form, product);
  updateProductTypeFields(form);
  const allowed = isGyoza ? [] : product ? allowedPreparationIds(product) : variations.filter((variation) => !onlyNormalProducts.includes(form.elements.nombre.value.trim()) || variation.nombre === 'Normal').map((variation) => variation.id);
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
    const isGyoza = isGyozaProduct(form.elements.nombre.value);
    const singlePrice = isDrink || isGyoza;
    const sizes = singlePrice ? [] : readSizeRows().map((size) => ({ producto_id: productId, nombre: size.nombre, precio: size.precio, activo: true, updated_at: new Date().toISOString() }));
    if (singlePrice) {
      const sizeDelete = await supabaseClient.from('producto_tamanos').delete().eq('producto_id', productId);
      if (sizeDelete.error) { showProductError('Se guardó, pero no se pudieron limpiar sus tamaños. Revisa los permisos RLS.'); console.error(sizeDelete.error); return; }
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

