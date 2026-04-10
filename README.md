# O365 Linux Desktop

Aplicación de escritorio basada en Electron para trabajar con Microsoft 365 desde Linux con una interfaz de pestañas propia, integración con bandeja del sistema y soporte para abrir documentos y aplicaciones de Microsoft 365 sin depender de un navegador tradicional.

## Resumen

O365 Linux Desktop abre Microsoft 365 dentro de una ventana nativa con una barra de pestañas personalizada. La aplicación está orientada principalmente a Linux y en la configuración actual de desarrollo arranca usando X11 (`--ozone-platform=x11`).

El proyecto incluye:
- una pestaña principal fija para Microsoft 365
- apertura de documentos y aplicaciones en pestañas internas
- desacople de pestañas a ventanas separadas
- menú de bandeja con accesos rápidos y favoritos
- modales flotantes para configuración, lanzador de aplicaciones y tarjeta contextual de pestaña

## Funcionalidades actuales

### Navegación y pestañas
- Barra de pestañas personalizada con una pestaña principal fija (`M365 Copilot`).
- Creación de nuevas pestañas desde el botón `+`.
- Cambio, recarga y cierre de pestañas.
- Reordenamiento de pestañas mediante drag and drop.
- Desacople de pestañas a una ventana separada:
  - desde la tarjeta de información de pestaña
  - o arrastrando una pestaña fuera de la barra
- Sistema de overflow horizontal para pestañas con navegación por flechas cuando no entran todas en pantalla.
- La pestaña activa se mantiene visible dentro de la ventana de overflow.

### Integración con Microsoft 365
- Apertura interna de enlaces y documentos de Microsoft 365, Office, OneDrive, SharePoint, Outlook, Teams y OneNote.
- Normalización de URLs de lanzamiento para aplicaciones de Microsoft 365.
- Manejo de popups internos para flujos de Outlook y otras ventanas necesarias.
- Apertura de enlaces externos en el navegador del sistema cuando no corresponden al dominio/flujo interno.

### Tarjeta de información de pestaña
- Tarjeta contextual flotante al pasar el mouse sobre una pestaña.
- Muestra icono, título, servicio, ubicación inferida y dato de “Última vez guardado”.
- Permite:
  - marcar o desmarcar favoritos
  - desacoplar la pestaña a una ventana
- La pestaña principal no muestra esta tarjeta.

### Favoritos y bandeja del sistema
- Los favoritos se guardan de forma persistente.
- El menú de bandeja incluye:
  - mostrar/ocultar la ventana principal
  - recargar la aplicación
  - submenú `Favoritos`
  - submenú `Aplicaciones`
  - salir
- Los favoritos del tray se agrupan por tipo usando iconos y separadores entre grupos no vacíos.
- El submenú `Aplicaciones` abre accesos directos a:
  - Word
  - Excel
  - PowerPoint
  - Outlook
  - OneDrive
  - Teams
  - OneNote

### Configuración y estado persistente
- Modal flotante de configuración.
- Configuración persistente para:
  - URL principal
  - User-Agent personalizado
  - tema (`system`, `light`, `dark`)
  - reapertura de pestañas/documentos al iniciar
- Restauración opcional de pestañas al arrancar.
- Persistencia del tamaño, posición y estado maximizado de la ventana principal.
- Validación de bounds para evitar reabrir la ventana fuera de pantalla en cambios de monitor.

### Interacción del sistema
- Soporte de permisos para:
  - cámara y micrófono
  - notificaciones
  - portapapeles
  - fullscreen
- Soporte para `getDisplayMedia` / compartir pantalla mediante `desktopCapturer`.
- Atajos de portapapeles manejados también a nivel de vista:
  - `Ctrl+C`, `Ctrl+V`
  - `Shift+Insert`
  - `Shift+Delete`
- Registro del protocolo personalizado `ms365://`.
- Bloqueo de múltiples instancias con recuperación de foco en la ventana existente.

### Menú contextual y apertura con aplicaciones nativas
- Menú contextual personalizado dentro de las vistas web.
- Para enlaces a documentos compatibles, el menú contextual puede ofrecer apertura con aplicaciones nativas detectadas en Linux.
- Para imágenes se ofrecen acciones como copiar y guardar.
- En desarrollo, también se expone inspección de elementos desde el menú contextual.

## Plataforma objetivo

### Soportada en la configuración actual
- Linux
- Entornos X11 para la ejecución recomendada actual

### Notas importantes
- El script `npm start` fuerza `--ozone-platform=x11`.
- La configuración de empaquetado actual genera artefactos Linux:
  - `AppImage`
  - `deb`
  - `tar.gz`
- Aunque parte del código es portable por Electron, este repositorio está preparado y documentado actualmente como objetivo Linux.

## Requisitos

- Node.js 18 o superior
- npm 8 o superior
- Linux moderno con entorno gráfico compatible con Electron

## Desarrollo

### Instalar dependencias

```bash
npm install
```

### Ejecutar la aplicación

```bash
npm start
```

Esto ejecuta:

```bash
electron . --ozone-platform=x11
```

### Scripts disponibles

```bash
npm start
npm run build
npm run build:linux
npm run build:appimage
npm run build:deb
```

## Empaquetado

La configuración de `electron-builder` actual genera builds Linux con estos formatos:
- AppImage
- deb
- tar.gz

Los artefactos se escriben en `dist/`.

## Estructura principal del proyecto

```text
O365LinuxDesktop/
├── main.js
├── preload.js
├── modal-preload.js
├── package.json
├── icons/
├── src/
│   ├── index.html
│   ├── renderer.js
│   ├── styles.css
│   ├── modal.html
│   ├── modal.js
│   ├── modal.css
│   ├── config/
│   │   └── configManager.js
│   └── utils/
│       ├── nativeAppHandler.js
│       └── urlHandler.js
└── dist/
```

## Configuración persistente

La aplicación almacena configuración y estado mediante `electron-store`, incluyendo:
- preferencias de tema
- URL principal
- User-Agent
- favoritos
- pestañas restaurables
- estado y bounds de ventana

## Limitaciones y alcance actual

- La documentación y el empaquetado están orientados a Linux.
- La restauración de pestañas depende de URLs restaurables; si un documento ya no está disponible, la aplicación lo omite en sesiones posteriores.
- La información mostrada en la tarjeta de pestaña se infiere desde título, URL y metadatos disponibles; no todas las fuentes exponen la misma calidad de datos.
- La detección de aplicaciones nativas para “Abrir con…” está orientada a Linux.

## Licencia

MIT

## Aviso

Este proyecto no está afiliado oficialmente con Microsoft. Microsoft 365, Office 365, OneDrive, Outlook, Teams, Word, Excel, PowerPoint y OneNote son marcas de sus respectivos propietarios.
