const drinkColors = [
  ['Coco', '#eee6d5', /coco/],
  ['Jamaica con piña', '#9f2946', /jamaica|jamica/],
  ['Lima', '#c7d98b', /lima|limon|sprite/],
  ['Tumbo', '#efcf70', /tumbo/],
  ['Naranja con mango', '#f3a23b', /naranja/],
  ['Maracuyá con mango', '#efc33c', /maracuya|mango/],
  ['Kiwi', '#8eb650', /kiwi/],
  ['Frutos rojos', '#ce6480', /frutilla|fresa|frutos rojos/],
  ['Cola', '#78503c', /cola|cafe/]
];
const validDrinkColor = (value) => /^#[0-9a-f]{6}$/i.test(value || '');
// Store a small, versioned metadata suffix in the existing description column.
// Decode it at the data boundary so it never appears in the menu or editor.
function decodeDrinkProduct(product) {
  const match = (product.descripcion || '').match(/\n?<!--chao-drink-color:v1:(#[0-9a-f]{6})-->$/i);
  return match ? { ...product, descripcion: product.descripcion.slice(0, match.index), drinkColor: match[1] } : product;
}
function encodeDrinkDescription(description, color) {
  const clean = decodeDrinkProduct({ descripcion: description }).descripcion || '';
  return validDrinkColor(color) ? `${clean}\n<!--chao-drink-color:v1:${color}-->` : clean || null;
}
function resolvedDrinkColor(product) {
  if (validDrinkColor(product.drinkColor)) return product.drinkColor;
  return drinkColors.find(([, , pattern]) => pattern.test(normalizeMenuText(product.nombre)))?.[1] || '#efcf70';
}
function drinkColorStyle(product) {
  const color = resolvedDrinkColor(product);
  const dark = '#' + color.slice(1).match(/../g).map((hex) => Math.round(parseInt(hex, 16) * .82).toString(16).padStart(2, '0')).join('');
  return `--juice:${color};--juice-dark:${dark}`;
}
function setupDrinkColorField(form, product) {
  let field = form.querySelector('[data-drink-colors]');
  if (!field) {
    field = document.createElement('fieldset');
    field.dataset.drinkColors = '';
    field.innerHTML = `<legend>Color del refresco</legend><p>Elige un tono para el vaso del menú.</p><div class="drink-color-options"><label class="drink-color-option"><input type="radio" name="drink_palette" value="auto" checked><span>Según el nombre</span></label>${drinkColors.map(([label, color]) => `<label class="drink-color-option"><input type="radio" name="drink_palette" value="${color}"><span class="drink-color-dot" style="background:${color}"></span><span>${label}</span></label>`).join('')}<label class="drink-color-option"><input type="radio" name="drink_palette" value="custom"><span>Otro color</span></label></div><label class="drink-custom-color" hidden>Elige tu color<input type="color" name="drink_custom_color" value="#efcf70"></label><div class="drink-color-preview"></div>`;
    form.querySelector('.modal-body').insertBefore(field, form.querySelector('.checkbox-label'));
  }
  const color = product?.drinkColor;
  form.elements.drink_palette.value = validDrinkColor(color) ? (drinkColors.some(([, value]) => value === color) ? color : 'custom') : 'auto';
  form.elements.drink_custom_color.value = validDrinkColor(color) ? color : '#efcf70';
  updateDrinkColorPreview(form);
}
function selectedDrinkColor(form) {
  const choice = form.elements.drink_palette?.value;
  return choice === 'custom' ? form.elements.drink_custom_color.value : validDrinkColor(choice) ? choice : null;
}
function updateDrinkColorPreview(form) {
  const field = form.querySelector('[data-drink-colors]');
  if (!field) return;
  field.hidden = form.elements.tipo.value !== 'BEBIDA';
  field.querySelector('.drink-custom-color').hidden = form.elements.drink_palette.value !== 'custom';
  field.querySelector('.drink-color-preview').innerHTML = menuIllustration({ tipo: 'BEBIDA', nombre: form.elements.nombre.value, drinkColor: selectedDrinkColor(form) }) + '<span>Así se verá en tu menú</span>';
}
document.addEventListener('input', (event) => {
  if (event.target.closest('#product-form') && ['nombre', 'drink_palette', 'drink_custom_color', 'tipo'].includes(event.target.name)) updateDrinkColorPreview(event.target.form);
});
