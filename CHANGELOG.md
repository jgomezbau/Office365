# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

## [2.6.1] - 2026-04-10

### Added
- Sistema de overflow horizontal para pestañas con navegación por flechas.
- Desacople de pestañas a ventanas separadas desde la tarjeta contextual y mediante drag fuera de la barra.
- Tarjeta contextual flotante para pestañas con icono, servicio, ubicación inferida, último guardado, favorito y acción de desacople.
- Persistencia de favoritos y submenú `Favoritos` en la bandeja del sistema.
- Submenú `Aplicaciones` en la bandeja con accesos a Word, Excel, PowerPoint, Outlook, OneDrive, Teams y OneNote.
- Restauración opcional de pestañas/documentos al iniciar.
- Persistencia del tamaño, posición y estado maximizado de la ventana principal.
- Soporte para compartir pantalla mediante `desktopCapturer`.
- Ventanas flotantes dedicadas para configuración, lanzador de aplicaciones y tarjeta de información de pestaña.

### Changed
- Migración del contenido principal a `WebContentsView`.
- Ejecución de desarrollo alineada con X11 mediante `--ozone-platform=x11`.
- Mejora del menú contextual para enlaces, imágenes y apertura con aplicaciones nativas en Linux.
- Normalización de títulos, iconos y metadatos visibles para pestañas y favoritos.
- La pestaña principal queda fijada visualmente como `M365 Copilot` y no participa en drag ni en la tarjeta de información.
- El README se actualizó para reflejar el comportamiento real actual de la aplicación.

### Fixed
- Restauración más estable de pestañas al iniciar, con reapertura secuencial.
- Mejor manejo de popups internos de Microsoft 365, incluyendo flujos de Outlook.
- Validación de bounds para evitar reabrir la ventana fuera de pantalla en configuraciones multi-monitor.
- Integración más consistente de portapapeles y atajos heredados como `Shift+Insert` y `Shift+Delete`.

### Maintenance
- Limpieza conservadora de código legado, utilidades huérfanas y trazas residuales.
- Simplificación del preload expuesto al renderer.
- Alineación de branding, documentación y metadata del proyecto con `O365 Linux Desktop`.
