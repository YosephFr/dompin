document.addEventListener('DOMContentLoaded', () => {
  setupSidebar();
  setupForm();
  setupModal();
});

function setupSidebar() {
  const sidebar = document.querySelector('.sidebar-list');
  if (!sidebar) return;
  sidebar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('sidebar-item')) return;
    sidebar.querySelectorAll('.sidebar-item').forEach((el) => el.classList.remove('is-active'));
    target.classList.add('is-active');
  });
}

function setupForm() {
  const form = document.getElementById('filter-form');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    console.log('[demo] filter applied', Object.fromEntries(data.entries()));
  });
}

function setupModal() {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
    if (action === 'open-modal') {
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
    } else if (action === 'close-modal') {
      modal.hidden = true;
      document.body.style.overflow = '';
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  });
}
