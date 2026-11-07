/* CHAO · Menú — productos, tamaños, variaciones, ilustraciones y modal de producto (antes en app.js) */
const menuOrderStorageKey = 'chao-menu-order';
let menuOrder = readMenuOrder();
let menuOrderEditing = false;
let draggedMenuProductId = '';
let menuDragScrollFrame = 0;
let menuDragScrollDirection = 0;

function readMenuOrder() {
  try {
    const stored = JSON.parse(localStorage.getItem(menuOrderStorageKey) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch (error) {
    console.warn('No se pudo leer el orden guardado del menú', error);
    return {};
  }
}

function productOrderKey(product) {
  if (product.tipo === 'BEBIDA') return 'BEBIDA';
  if (product.tipo === 'PLATO' && !isChickenExtra(product)) return 'PLATO';
  return '';
}

function sortProductsBySavedOrder(list) {
  const positions = new Map();
  Object.entries(menuOrder).forEach(([type, ids]) => {
    if (Array.isArray(ids)) ids.forEach((id, index) => positions.set(`${type}:${id}`, index));
  });
  return [...list].sort((a, b) => {
    const typeA = productOrderKey(a);
    const typeB = productOrderKey(b);
    if (typeA !== typeB) return 0;
    const positionA = positions.get(`${typeA}:${a.id}`);
    const positionB = positions.get(`${typeB}:${b.id}`);
    if (positionA === undefined && positionB === undefined) return 0;
    if (positionA === undefined) return 1;
    if (positionB === undefined) return -1;
    return positionA - positionB;
  });
}

function updateMenuOrderFromGrid() {
  const cards = [...document.querySelectorAll('#view-menu .menu-item-card[data-product-id]')];
  const visibleIdsByType = {};
  cards.forEach((card) => {
    const product = products.find((item) => String(item.id) === card.dataset.productId);
    const type = product && productOrderKey(product);
    if (type) (visibleIdsByType[type] ||= []).push(card.dataset.productId);
  });
  Object.entries(visibleIdsByType).forEach(([type, ids]) => {
    const existing = Array.isArray(menuOrder[type]) ? menuOrder[type] : [];
    menuOrder[type] = [...ids, ...existing.filter((id) => !ids.includes(id))];
  });
}

function stopMenuDragScroll() {
  if (menuDragScrollFrame) cancelAnimationFrame(menuDragScrollFrame);
  menuDragScrollFrame = 0;
  menuDragScrollDirection = 0;
  document.querySelector('#view-menu')?.classList.remove('dragging-near-top', 'dragging-near-bottom');
}

function runMenuDragScroll() {
  if (!menuDragScrollDirection || !draggedMenuProductId) {
    menuDragScrollFrame = 0;
    return;
  }
  window.scrollBy(0, menuDragScrollDirection * 12);
  menuDragScrollFrame = requestAnimationFrame(runMenuDragScroll);
}

function updateMenuDragScroll(clientY) {
  const edgeSize = 110;
  const height = window.innerHeight;
  const direction = clientY < edgeSize ? -1 : clientY > height - edgeSize ? 1 : 0;
  menuDragScrollDirection = direction;
  const view = document.querySelector('#view-menu');
  view?.classList.toggle('dragging-near-top', direction < 0);
  view?.classList.toggle('dragging-near-bottom', direction > 0);
  if (direction && !menuDragScrollFrame) menuDragScrollFrame = requestAnimationFrame(runMenuDragScroll);
  if (!direction && menuDragScrollFrame) {
    cancelAnimationFrame(menuDragScrollFrame);
    menuDragScrollFrame = 0;
  }
}

function setMenuOrderEditing(active) {
  menuOrderEditing = active;
  const view = document.querySelector('#view-menu');
  const toggle = document.querySelector('#toggle-menu-order');
  const save = document.querySelector('#save-menu-order');
  view?.classList.toggle('is-order-editing', active);
  toggle?.setAttribute('aria-pressed', String(active));
  if (toggle) toggle.querySelector('span').textContent = active ? 'Terminar organización' : 'Organizar orden';
  if (save) save.hidden = !active;
  document.querySelectorAll('#view-menu .menu-item-card[data-product-id]').forEach((card) => {
    card.draggable = active;
    let controls = card.querySelector('.menu-order-controls');
    if (active && !controls) {
      controls = document.createElement('div');
      controls.className = 'menu-order-controls';
      controls.innerHTML = `<span>Orden</span><button type="button" data-order-move="up" data-order-id="${card.dataset.productId}" aria-label="Subir ${card.querySelector('h3')?.textContent || 'producto'}" title="Subir"><i data-lucide="arrow-up"></i></button><button type="button" data-order-move="down" data-order-id="${card.dataset.productId}" aria-label="Bajar ${card.querySelector('h3')?.textContent || 'producto'}" title="Bajar"><i data-lucide="arrow-down"></i></button>`;
      card.append(controls);
    } else if (!active) {
      controls?.remove();
    }

  });
  if (active) refreshIcons();
}

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

function noodleDishProfile(name) {
  if (/ramen/.test(name)) return 'ramen';
  if (/tallarin.*salt(e?ad)o?|salt(e?ad)o?.*tallarin/.test(name)) return 'tallarin-saltado';
  if (/tallarin.*camaron|camaron.*tallarin/.test(name)) return 'tallarin-camaron';
  if (/kung\s*pao/.test(name)) return 'kung-pao';
  if (/chicharron/.test(name)) return 'chicharrones';
  if (/yakisoba/.test(name)) return 'yakisoba';
  return 'noodle-default';
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
  const fineVegetables = '<span class="fine-vegetable fine-onion"></span><span class="fine-vegetable fine-carrot"></span><span class="fine-vegetable fine-cabbage"></span><span class="fine-vegetable fine-pepper"></span>';
  const chaufaChicken = /chaufa/.test(name) ? '<span class="chaufa-chicken chaufa-chicken-one"></span><span class="chaufa-chicken chaufa-chicken-two"></span><span class="chaufa-chicken chaufa-chicken-three"></span><span class="chaufa-chicken chaufa-chicken-four"></span><span class="chaufa-chicken chaufa-chicken-five"></span><span class="chaufa-chicken chaufa-chicken-six"></span><span class="chaufa-chicken chaufa-chicken-seven"></span>' : '';
  if (gyoza) {
    const pieces = Array.from({ length: 6 }, (_, i) => `<span class="gyoza-piece gyoza-${i + 1}"></span>`).join('');
    return `<div class="menu-visual dish-gyoza" aria-hidden="true"><div class="food-art"><span class="chopstick chopstick-one"></span><span class="chopstick chopstick-two"></span><div class="food-plate"><div class="food-serving">${pieces}</div><span class="gyoza-sauce"></span></div></div></div>`;
  }
  if (isMixedDish(product)) {
    return `<div class="menu-visual dish-rice dish-mixed" aria-hidden="true"><div class="food-art"><span class="chopstick chopstick-one"></span><span class="chopstick chopstick-two"></span><div class="food-plate"><span class="mixed-broth"></span><div class="food-serving">${grains}<span class="food-greens"></span>${shrimpMarkup}</div><div class="mixed-chicken crispy-chicken"><span class="food-piece piece-one"></span><span class="food-piece piece-two"></span><span class="food-piece piece-three"></span><span class="food-piece piece-four"></span></div></div></div></div>`;
  }
  const noodles = Array.from({ length: 13 }, (_, i) => `<span class="noodle-strand" style="--x:${5 + (i * 19 % 46)}%;--y:${8 + (i * 29 % 60)}%;--r:${(i * 37 % 120) - 60}deg"></span>`).join('');
  const profile = extra ? 'chicken-extra' : kind === 'noodles' ? noodleDishProfile(name) : 'noodle-default';
  const profileMarkup = {
    'chicken-extra': '<span class="food-piece piece-one"></span><span class="food-piece piece-two"></span><span class="food-piece piece-three"></span><span class="food-piece piece-four"></span><span class="food-piece piece-five"></span><span class="food-piece piece-six"></span>',
    'kung-pao': '<span class="noodle-nest">' + noodles + '</span><span class="square-vegetable kung-vegetable kung-veg-one"></span><span class="square-vegetable kung-vegetable kung-veg-two"></span><span class="square-vegetable kung-vegetable kung-veg-three"></span><span class="square-vegetable kung-vegetable kung-veg-four"></span><span class="square-vegetable kung-vegetable kung-veg-five"></span><span class="square-vegetable kung-vegetable kung-veg-six"></span><span class="kung-chicken kung-chicken-one"></span><span class="kung-chicken kung-chicken-two"></span><span class="kung-chicken kung-chicken-three"></span><span class="kung-chicken kung-chicken-four"></span><span class="kung-chicken kung-chicken-five"></span><span class="kung-chicken kung-chicken-six"></span><span class="basil basil-one"></span><span class="basil basil-two"></span><span class="basil basil-three"></span>',
    ramen: '<span class="dish-broth"></span><span class="noodle-nest">' + noodles + '</span><span class="ramen-egg"></span><span class="ramen-chard"></span><span class="ramen-pork pork-one"></span><span class="ramen-pork pork-two"></span><span class="ramen-pork pork-three"></span>',
      'tallarin-saltado': '<span class="dish-broth"></span><span class="noodle-nest noodle-nest-full">' + noodles + noodles + '</span><span class="long-vegetable vegetable-one"></span><span class="long-vegetable vegetable-two"></span><span class="long-vegetable vegetable-three"></span><span class="long-vegetable vegetable-four"></span><span class="long-vegetable vegetable-five"></span><span class="long-vegetable vegetable-six"></span><span class="long-vegetable vegetable-seven"></span><span class="saltado-vegetable saltado-onion onion-one"></span><span class="saltado-vegetable saltado-onion onion-two"></span><span class="saltado-vegetable saltado-pepper pepper-one"></span><span class="saltado-vegetable saltado-pepper pepper-two"></span><span class="saltado-vegetable saltado-cabbage cabbage-one"></span><span class="saltado-vegetable saltado-cabbage cabbage-two"></span><span class="saltado-vegetable saltado-carrot carrot-one"></span><span class="saltado-vegetable saltado-carrot carrot-two"></span><span class="long-chicken chicken-one"></span><span class="long-chicken chicken-two"></span><span class="long-chicken chicken-three"></span><span class="long-chicken chicken-four"></span><span class="long-chicken chicken-five"></span><span class="long-chicken chicken-six"></span><span class="long-chicken chicken-seven"></span><span class="long-chicken chicken-eight"></span>' + shrimpMarkup,
      'tallarin-camaron': '<span class="dish-broth"></span><span class="noodle-nest noodle-nest-full">' + noodles + noodles + '</span><span class="long-vegetable vegetable-one"></span><span class="long-vegetable vegetable-two"></span><span class="long-vegetable vegetable-three"></span><span class="long-vegetable vegetable-four"></span><span class="long-vegetable vegetable-five"></span><span class="long-vegetable vegetable-six"></span>' + shrimpMarkup + '<span class="saltado-vegetable saltado-onion onion-one"></span><span class="saltado-vegetable saltado-pepper pepper-one"></span><span class="saltado-vegetable saltado-cabbage cabbage-one"></span><span class="saltado-vegetable saltado-carrot carrot-one"></span>',
    chicharrones: '<span class="dish-broth"></span><span class="noodle-nest">' + noodles + '</span><span class="square-vegetable square-one"></span><span class="square-vegetable square-two"></span><span class="square-vegetable square-three"></span><span class="square-vegetable square-four"></span><span class="square-vegetable square-five"></span><span class="square-vegetable square-six"></span><span class="square-vegetable square-seven"></span><span class="square-vegetable square-eight"></span><span class="food-piece piece-one"></span><span class="food-piece piece-two"></span><span class="food-piece piece-three"></span><span class="food-piece piece-four"></span><span class="food-piece piece-five"></span><span class="food-piece piece-six"></span>',
    yakisoba: '<span class="noodle-nest noodle-nest-abundant">' + noodles + noodles + '</span><span class="yakisoba-vegetable yakisoba-cabbage cabbage-one"></span><span class="yakisoba-vegetable yakisoba-cabbage cabbage-two"></span><span class="yakisoba-vegetable yakisoba-cabbage cabbage-three"></span><span class="yakisoba-vegetable yakisoba-carrot carrot-one"></span><span class="yakisoba-vegetable yakisoba-carrot carrot-two"></span><span class="yakisoba-vegetable yakisoba-onion onion-one"></span><span class="yakisoba-vegetable yakisoba-onion onion-two"></span><span class="yakisoba-vegetable yakisoba-pepper pepper-one"></span><span class="yakisoba-vegetable yakisoba-pepper pepper-two"></span><span class="small-chicken small-one"></span><span class="small-chicken small-two"></span><span class="small-chicken small-three"></span><span class="small-chicken small-four"></span>',
    'noodle-default': `<span class="noodle-nest">${noodles}</span><span class="square-vegetable square-one"></span><span class="square-vegetable square-two"></span><span class="square-vegetable square-three"></span><span class="square-vegetable square-four"></span>${extra ? '<span class="food-piece piece-one"></span><span class="food-piece piece-two"></span><span class="food-piece piece-three"></span><span class="food-piece piece-four"></span>' : ''}`
  }[profile];
  const profileMarkupWithShrimp = profileMarkup + (profile === 'tallarin-camaron' || profile === 'tallarin-saltado' ? '' : shrimpMarkup);
  return `<div class="menu-visual dish-${kind}${!extra ? ' deep-dish' : ''}${chicken ? ' crispy-chicken' : ''} dish-profile-${profile}" aria-hidden="true"><div class="food-art"><span class="chopstick chopstick-one"></span><span class="chopstick chopstick-two"></span><div class="food-plate"><div class="food-serving">${kind === 'rice' ? grains + fineVegetables + chaufaChicken + shrimpMarkup : profileMarkupWithShrimp}</div></div></div></div>`;
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
  return `<article class="menu-item-card ${product.activo ? '' : 'unavailable'}" data-product-id="${product.menuOnly ? '' : product.id}" draggable="false">${illustration}<div class="menu-card-content"><div class="menu-card-meta"><span class="menu-category ${isDrink ? 'drink' : ''}">${isDrink ? 'Bebida' : isExtra ? 'Extra' : 'Plato'}</span><span class="menu-availability">${product.activo ? 'Disponible' : 'No disponible'}</span></div><h3>${product.nombre}</h3><div class="variation-row">${sizeMarkup}</div>${product.descripcion ? `<p>${product.descripcion}</p>` : ''}${serving ? `<p class="serving-note">${serving}</p>` : ''}${!isDrink && !isExtra && preparations.length ? (preparations.length > 1 ? `<details class="menu-preparations"><summary>${preparations.length} preparaciones disponibles</summary><div class="preparation-list">${prepMarkup}</div></details>` : `<div class="preparation-list">${prepMarkup}</div>`) : ''}<div class="menu-actions" ${product.menuOnly ? 'hidden' : ''}><button class="edit-button" data-edit-product="${product.id}" title="Editar ${product.nombre}" aria-label="Editar ${product.nombre}"><i data-lucide="pencil"></i><span>Editar</span></button><button class="delete-item-button" data-delete-product="${product.id}" title="Eliminar ${product.nombre}" aria-label="Eliminar ${product.nombre}"><i data-lucide="trash-2"></i></button></div></div></article>`;
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
  const filteredProducts = sortProductsBySavedOrder(visibleProducts.filter((product) => {
    if (menuSearch && !normalizeMenuText(`${product.nombre} ${product.descripcion || ''}`).includes(normalizeMenuText(menuSearch))) return false;
    if (menuFilter === 'variaciones') return product.tipo === 'PLATO' && !isChickenExtra(product) && preparationNames(product).length > 1;
    if (menuFilter.startsWith('c:')) return customerFolderOf(product) === menuFilter.slice(2);
    return true;
  }));
  const count = document.querySelector('#menu-result-count');
  if (count) count.textContent = `${filteredProducts.length} ${filteredProducts.length === 1 ? 'producto' : 'productos'}`;
  grid.innerHTML = filteredProducts.length ? filteredProducts.map(productMarkup).join('') : '<div class="empty-state"><i data-lucide="search"></i><strong>No encontramos productos</strong><span>Prueba con otro nombre o categoría.</span><button type="button" class="secondary-button" data-reset-menu>Ver toda la carta</button></div>';
  setMenuOrderEditing(menuOrderEditing);
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
  { key: 'platos', label: 'Platos' },
  { key: 'extras', label: 'Extras' },
  { key: 'bebidas', label: 'Bebidas' },
];

function customerFolderOf(product) {
  const name = normalizeMenuText(product.nombre || '');
  if (product.tipo === 'BEBIDA') return 'bebidas';
  if (product.tipo === 'EXTRA' || isChickenExtra(product)) return 'extras';
  return 'platos';
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
  const moveButton = event.target.closest('[data-order-move]');
  if (moveButton && menuOrderEditing) {
    event.preventDefault();
    event.stopPropagation();
    updateMenuOrderFromGrid();
    const card = moveButton.closest('.menu-item-card[data-product-id]');
    const product = products.find((item) => String(item.id) === card?.dataset.productId);
    const type = product && productOrderKey(product);
    const cardsOfType = [...document.querySelectorAll('#view-menu .menu-item-card[data-product-id]')].filter((item) => {
      const itemProduct = products.find((productItem) => String(productItem.id) === item.dataset.productId);
      return itemProduct && productOrderKey(itemProduct) === type;
    });
    const currentIndex = cardsOfType.indexOf(card);
    const targetIndex = currentIndex + (moveButton.dataset.orderMove === 'up' ? -1 : 1);
    if (type && currentIndex >= 0 && targetIndex >= 0 && targetIndex < cardsOfType.length) {
      const ids = cardsOfType.map((item) => item.dataset.productId);
      [ids[currentIndex], ids[targetIndex]] = [ids[targetIndex], ids[currentIndex]];
      menuOrder[type] = [...ids, ...menuOrder[type].filter((id) => !ids.includes(id))];
      renderProducts();
    }
    return;
  }
  if (event.target.closest('#toggle-menu-order')) {
    setMenuOrderEditing(!menuOrderEditing);
    return;
  }
  if (event.target.closest('#save-menu-order')) {
    updateMenuOrderFromGrid();
    localStorage.setItem(menuOrderStorageKey, JSON.stringify(menuOrder));
    setMenuOrderEditing(false);
    showToast('Orden del menú guardado');
    renderProducts();
    return;
  }
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

document.querySelector('#view-menu')?.addEventListener('dragstart', (event) => {
  if (!menuOrderEditing) return;
  const card = event.target.closest('.menu-item-card[data-product-id]');
  if (!card) return;
  draggedMenuProductId = card.dataset.productId;
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedMenuProductId);
});

document.querySelector('#view-menu')?.addEventListener('dragover', (event) => {
  if (!menuOrderEditing || !draggedMenuProductId) return;
  updateMenuDragScroll(event.clientY);
  const card = event.target.closest('.menu-item-card[data-product-id]');
  if (!card || card.dataset.productId === draggedMenuProductId) return;
  event.preventDefault();
  const grid = card.parentElement;
  const dragged = grid.querySelector(`[data-product-id="${CSS.escape(draggedMenuProductId)}"]`);
  if (!dragged) return;
  const before = event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2;
  grid.insertBefore(dragged, before ? card : card.nextElementSibling);
});

document.querySelector('#view-menu')?.addEventListener('dragend', (event) => {
  const card = event.target.closest('.menu-item-card[data-product-id]');
  card?.classList.remove('is-dragging');
  draggedMenuProductId = '';
  stopMenuDragScroll();
});

document.querySelector('#view-menu')?.addEventListener('drop', stopMenuDragScroll);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('customer-menu')) toggleCustomerMenu(false);
});


function sizeRowsMarkup(sizes = []) {
  return sizes.map((size) => `<div class="size-row" data-size-id="${menuEscape(size.id || '')}"><input class="size-name" value="${menuEscape(size.nombre)}" placeholder="Tamaño" /><input class="size-price" type="number" min="0" step="0.01" value="${Number(size.precio)}" placeholder="Precio" /><button type="button" class="remove-size" aria-label="Quitar tamaño"><i data-lucide="minus"></i></button></div>`).join('');
}

function readSizeRows() {
  return [...document.querySelectorAll('#product-form .size-row')].map((row) => ({
    id: row.dataset.sizeId || '',
    nombre: row.querySelector('.size-name').value.trim(),
    precio: Number(row.querySelector('.size-price').value)
  })).filter((size) => size.nombre && size.precio >= 0);
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
    const existingSizeIds = new Set((products.find((product) => String(product.id) === String(productId))?.producto_tamanos || []).map((size) => String(size.id)));
    const savedSizeIds = new Set(sizes.filter((size) => size.id).map((size) => String(size.id)));
    const removedSizeIds = [...existingSizeIds].filter((sizeId) => !savedSizeIds.has(sizeId));
    if (removedSizeIds.length) {
      const sizeDelete = await supabaseClient.from('producto_tamanos').delete().in('id', removedSizeIds);
      if (sizeDelete.error) { showProductError('El producto se guardó, pero no se pudieron eliminar los tamaños retirados. Revisa los permisos RLS.'); console.error(sizeDelete.error); return; }
    }
    if (sizes.length) {
      const sizeResponse = await supabaseClient.from('producto_tamanos').upsert(sizes.map(({ id, ...size }) => id ? { id, ...size } : size));
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
