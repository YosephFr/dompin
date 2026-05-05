document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar-list');
  if (!sidebar) return;

  sidebar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('sidebar-item')) return;

    sidebar.querySelectorAll('.sidebar-item').forEach((el) => el.classList.remove('is-active'));
    target.classList.add('is-active');
  });

  const form = document.getElementById('filter-form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    console.log('[demo] filter applied', Object.fromEntries(data.entries()));
  });
});
