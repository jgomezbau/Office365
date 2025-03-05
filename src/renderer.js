// Escucha las actualizaciones de pestañas enviadas desde el proceso principal
window.electronAPI.onTabsUpdated((data) => {
  const tabsContainer = document.getElementById('tabs');
  tabsContainer.innerHTML = ''; // Limpiar la UI de pestañas
  data.tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.classList.add('tab');
    if (tab.id === data.activeTabId) tabEl.classList.add('active');
    // Muestra el título o, si no está disponible, la URL
    tabEl.textContent = tab.title || tab.url;

    // Al hacer clic, cambia a esa pestaña
    tabEl.addEventListener('click', () => {
      window.electronAPI.switchTab(tab.id);
    });

    // Botón de recargar
    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = '⟳';
    reloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI.reloadTab(tab.id);
    });
    // Botón de cerrar
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI.closeTab(tab.id);
    });

    // Agregar botones a la pestaña
    tabEl.appendChild(reloadBtn);
    tabEl.appendChild(closeBtn);

    tabsContainer.appendChild(tabEl);
  });
});

// Maneja el clic en el botón "nueva pestaña"
document.getElementById('new-tab-btn').addEventListener('click', async () => {
  // Obtiene la URL principal desde la configuración
  const mainUrl = await window.electronAPI.getMainUrl();
  // Abre una nueva pestaña con la URL principal
  window.electronAPI.createTab(mainUrl);
});