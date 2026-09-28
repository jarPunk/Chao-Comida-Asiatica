/* CHAO · Clientes — carga, listado, buscador y modal de cliente (antes en app.js) */
let clientDateFilter = '';

function clientCreatedDay(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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

function syncClientClear(picker) {
  const search = picker?.querySelector('[data-client-search]');
  const clear = picker?.querySelector('[data-client-clear]');
  if (search && clear) clear.hidden = !search.value;
}

function setupClientSearch() {
  const form = document.querySelector('#order-form');
  if (!form || form.querySelector('[data-client-picker]')) return;
  const clientLabel = form.querySelector('label');
  const picker = document.createElement('div');
  picker.dataset.clientPicker = 'true';
  picker.className = 'client-picker';
  picker.innerHTML = '<input type="search" data-client-search placeholder="Buscar nombre o celular" autocomplete="off" /><button type="button" class="client-clear" data-client-clear aria-label="Limpiar búsqueda" hidden>×</button><input type="hidden" name="cliente_id" value="" /><div class="client-results"></div>';
  clientLabel.replaceChildren(document.createTextNode('Cliente'), picker);
  const search = picker.querySelector('[data-client-search]');
  const clear = picker.querySelector('[data-client-clear]');
  search.addEventListener('focus', () => picker.querySelector('.client-results').classList.add('open'));
  search.addEventListener('input', (event) => {
    const term = event.target.value.trim().toLowerCase();
    picker.querySelector('.client-results').classList.add('open');
    picker.querySelectorAll('.client-results button').forEach((button) => { button.hidden = Boolean(term) && !button.textContent.toLowerCase().includes(term); });
    syncClientClear(picker);
  });
  clear.addEventListener('click', () => {
    search.value = '';
    picker.querySelector('[name="cliente_id"]').value = '';
    picker.querySelectorAll('.client-results button').forEach((button) => { button.hidden = false; });
    picker.querySelector('.client-results').classList.add('open');
    search.focus();
    syncClientClear(picker);
    updateOrderDetailsSummary();
  });
  picker.querySelector('.client-results').addEventListener('click', (event) => {
    const option = event.target.closest('[data-client-id]');
    if (!option) return;
    picker.querySelector('[name="cliente_id"]').value = option.dataset.clientId;
    search.value = option.dataset.clientId ? option.querySelector('strong').textContent : '';
    picker.querySelector('.client-results').classList.remove('open');
    syncClientClear(picker);
    updateOrderDetailsSummary();
  });
  if (!picker.querySelector('[data-quick-client]')) picker.insertAdjacentHTML('beforeend', '<button type="button" class="secondary-button quick-client-button" data-quick-client>＋ Nuevo cliente</button>');
  renderClientPicker();
}

function formatClientDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function renderClients() {
  const clientView = document.querySelector('#view-clientes');
  const body = clientView?.querySelector('table tbody');
  if (!body) return;
  const active = clients.filter((client) => client.activo).length;
  clientView.querySelector('.client-summary > div:first-child strong').textContent = active;
  clientView.querySelector('.client-summary > div:nth-child(2) strong').textContent = new Set(clients.filter((client) => client.familia_id).map((client) => client.familia_id)).size;
  clientView.querySelector('.client-summary > div:nth-child(3) strong').textContent = clients.filter((client) => String(client.telefono || '').trim()).length;
  const term = clientView.querySelector('.table-toolbar .search-field input')?.value.trim().toLowerCase() || '';
  const filtered = clients.filter((client) => {
    if (clientDateFilter && clientCreatedDay(client.created_at) !== clientDateFilter) return false;
    if (term && !`${client.nombres} ${client.apellidos} ${client.telefono || ''}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const clearBtn = clientView.querySelector('[data-clear-client-date]');
  if (clearBtn) clearBtn.hidden = !clientDateFilter && !term;
  body.innerHTML = filtered.length
    ? filtered.map((client) => `<tr>
        <td><div class="table-person"><span class="avatar peach">${(client.nombres[0] || '').toUpperCase()}${(client.apellidos[0] || '').toUpperCase()}</span><strong>${client.nombres} ${client.apellidos}</strong></div></td>
        <td>${families.find((family) => family.id === client.familia_id)?.nombre || '—'}</td>
        <td>${client.relacion_familiar || '—'}</td>
        <td>${client.telefono || '—'}</td>
        <td>${formatClientDate(client.created_at)}</td>
        <td><span class="status-tag ${client.activo ? 'active-tag' : 'inactive-tag'}">${client.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn-action" data-edit-client="${client.id}" title="Editar cliente" aria-label="Editar cliente"><i data-lucide="pencil"></i></button>
            <button class="btn-action danger" data-delete-client="${client.id}" title="Eliminar permanentemente" aria-label="Eliminar cliente"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      </tr>`).join('')
    : clients.length
      ? '<tr><td colspan="7"><div class="empty-state"><i data-lucide="users"></i><strong>Sin resultados</strong><span>Ajusta la búsqueda o la fecha.</span></div></td></tr>'
      : '<tr><td colspan="7"><div class="empty-state"><i data-lucide="users"></i><strong>No hay clientes registrados</strong><span>Registra el primero para empezar.</span></div></td></tr>';
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

