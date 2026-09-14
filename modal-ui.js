// One dialog lifecycle for product, order and client forms.
let activeDialog = null;
let dialogOpener = null;
let backgroundWasInert = false;
const dialogStack = [];

function showSuccessConfirmation(message, detail = 'Los datos se guardaron correctamente.') {
  let backdrop = document.querySelector('#success-modal');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'success-modal';
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = '<div class="modal success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-title" aria-describedby="success-description" tabindex="-1"><header class="modal-header"><button type="button" class="modal-close" aria-label="Cerrar confirmación">×</button><span class="success-symbol" aria-hidden="true">✓</span><h2 id="success-title"></h2></header><div class="modal-body"><p id="success-description"></p></div><footer class="modal-footer"><button type="button" class="primary-button" data-modal-cancel>Continuar</button></footer></div>';
    document.body.append(backdrop);
  }
  backdrop.querySelector('#success-title').textContent = message;
  backdrop.querySelector('#success-description').textContent = detail;
  document.querySelector('#toast')?.classList.remove('show');
  showDialog('success-modal', { nested: Boolean(activeDialog) });
  window.clearTimeout(showSuccessConfirmation.timeout);
  showSuccessConfirmation.timeout = window.setTimeout(() => hideDialog('success-modal'), 3000);
}

function showDialog(id, { nested = false } = {}) {
  const backdrop = document.getElementById(id);
  if (!backdrop) return;
  if (activeDialog === backdrop) return;
  if (activeDialog && nested) {
    dialogStack.push({ backdrop: activeDialog, opener: dialogOpener, backgroundWasInert, focus: document.activeElement });
    activeDialog.classList.remove('open');
    activeDialog.setAttribute('aria-hidden', 'true');
    activeDialog = null;
  } else if (activeDialog) hideDialog(activeDialog.id);
  dialogOpener = document.activeElement;
  activeDialog = backdrop;
  backgroundWasInert = document.querySelector('#app-shell').inert;
  document.querySelector('#app-shell').inert = true;
  document.body.classList.add('dialog-open');
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  backdrop.querySelector('.modal-body').scrollTop = 0;
  updateDialogSelectLabels(backdrop);
  backdrop.querySelector('.modal').focus({ preventScroll: true });
}

function hideDialog(id) {
  const backdrop = document.getElementById(id);
  if (!backdrop || activeDialog !== backdrop) return;
  if (id === 'success-modal') window.clearTimeout(showSuccessConfirmation.timeout);
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.querySelectorAll('.client-results.open').forEach((result) => result.classList.remove('open'));
  activeDialog = null;
  if (dialogStack.length) {
    const previous = dialogStack.pop();
    activeDialog = previous.backdrop;
    dialogOpener = previous.opener;
    backgroundWasInert = previous.backgroundWasInert;
    activeDialog.classList.add('open');
    activeDialog.setAttribute('aria-hidden', 'false');
    (previous.focus?.isConnected ? previous.focus : activeDialog.querySelector('.modal')).focus({ preventScroll: true });
    return;
  }
  document.body.classList.remove('dialog-open');
  document.querySelector('#app-shell').inert = backgroundWasInert;
  const target = dialogOpener?.isConnected && dialogOpener.getClientRects().length ? dialogOpener : document.querySelector('.nav-item.active');
  target?.focus({ preventScroll: true });
  dialogOpener = null;
}

function updateDialogSelectLabels(backdrop) {
  backdrop.querySelectorAll('select').forEach((select) => {
    const text = select.selectedOptions[0]?.textContent.trim() || '';
    select.title = text;
    let preview = select.nextElementSibling;
    if (!preview?.classList.contains('select-value-preview')) {
      preview = document.createElement('small');
      preview.className = 'select-value-preview';
      select.after(preview);
    }
    preview.textContent = text;
    preview.hidden = text.length < 38;
  });
}

document.addEventListener('click', (event) => {
  if (!activeDialog) return;
  const close = event.target.closest('.modal-close, [data-modal-cancel]');
  if (event.target === activeDialog || (close && activeDialog.contains(close))) hideDialog(activeDialog.id);
});

document.addEventListener('change', () => {
  if (activeDialog) updateDialogSelectLabels(activeDialog);
});

document.addEventListener('keydown', (event) => {
  if (!activeDialog) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    hideDialog(activeDialog.id);
    return;
  }
  if (event.key !== 'Tab') return;
  const dialog = activeDialog.querySelector('.modal');
  const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]')]
    .filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}, true);

document.addEventListener('invalid', (event) => {
  if (activeDialog?.contains(event.target)) event.target.scrollIntoView({ block: 'center' });
}, true);
