# 🚀 Microsoft 365® Copilot Desktop App

> Una aplicación de escritorio moderna y potente para acceder a Microsoft 365® desde Linux, macOS y Windows.

[![Electron](https://img.shields.io/badge/Electron-41.2.0-blue)]()
[![Node](https://img.shields.io/badge/Node.js-18+-green)]()
[![License](https://img.shields.io/badge/License-MIT-orange)]()
[![Version](https://img.shields.io/badge/Version-2.6.0-brightgreen)]()

## 📋 Tabla de contenidos

- [Descripción](#descripción)
- [Características](#características)
- [Requisitos del sistema](#requisitos-del-sistema)
- [Instalación](#instalación)
- [Uso](#uso)
- [Configuración](#configuración)
- [Desarrollo](#desarrollo)
- [Scripts disponibles](#scripts-disponibles)
- [Solución de problemas](#solución-de-problemas)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

## 📝 Descripción

**Microsoft 365® Copilot Desktop App** es una aplicación de escritorio desarrollada con **Electron** que permite acceder a Microsoft 365® (Office 365®) directamente desde tu escritorio, sin depender de un navegador web. 

Es especialmente útil para usuarios de **Linux** que no tienen acceso a la aplicación oficial nativa de Microsoft Office. La aplicación proporciona una experiencia fluida e integrada con soporte para:

- ✅ Excel, Word, PowerPoint, OneNote, Outlook
- ✅ SharePoint y OneDrive
- ✅ Teams y Copilot
- ✅ Gestión de pestañas tipo navegador
- ✅ Cambio entre cuentas personal y corporativa

## ✨ Características principales

### 🎯 Funcionalidades de usuario

- **Interfaz de escritorio nativa**: Ejecuta Microsoft 365® Web directamente en tu escritorio sin navegador
- **Pestañas independientes**: Manipula varios documentos simultáneamente con pestañas tipo navegador
- **Detección automática de archivos**: Identifica automáticamente el tipo de archivo (Excel, Word, PowerPoint, etc.) y muestra el icono correspondiente
- **Navegación inteligente**: URLs de Microsoft 365 se abren en nuevas pestañas dentro de la aplicación
- **Soporte multi-cuenta**: Cambia fácilmente entre cuentas personal y corporativa
- **Configuración persistente**: Guarda tus preferencias (URL principal, tema, user agent)

### 🛠️ Características técnicas

- **Sistema de temas**: Modo claro, oscuro o automático según el sistema
- **Menú contextual personalizado**: Cortar, copiar, pegar, recargar, inspeccionar elementos
- **Permisos multimedia**: Soporte para cámara y micrófono
- **Interceptor de protocolos**: Manejo de protocolos especiales de Office (ms-word:, ms-excel:, etc.)
- **Panel de configuración**: Modifica URL principal, user agent y tema desde la interfaz
- **Bandeja del sistema** (Tray): Minimiza a bandeja y recarga rápida desde el menú

## 🖥️ Requisitos del sistema

### Mínimos
- **CPU**: Procesador de 2 GHz o superior
- **RAM**: 2 GB mínimo (4 GB recomendado)
- **Almacenamiento**: 200 MB de espacio libre
- **Conexión**: Internet requerida (obviamente)

### Software
- **Linux**: Ubuntu 18.04+, Debian 10+, Fedora, o cualquier distribución moderna
- **macOS**: 10.13+
- **Windows**: Windows 7+ (aunque se recomienda Windows 10+)

**Nota**: Para desarrollo local necesitas **Node.js 18+** y **npm 8+**

## 📦 Instalación

### Opción 1: Descargar paquete precompilado (Recomendado)

#### Linux
```bash
# AppImage (funciona en cualquier distro)
wget https://github.com/jgomezbau/Office365/releases/download/v2.6.0/Microsoft\ 365\ Copilot-2.6.0.AppImage
chmod +x Microsoft\ 365\ Copilot-2.6.0.AppImage
./Microsoft\ 365\ Copilot-2.6.0.AppImage

# O Debian/.deb (para Debian, Ubuntu, etc.)
sudo apt-get install ./Microsoft365Copilot-2.6.0.deb

# O tar.gz (extrae manualmente)
tar -xzf Microsoft365Copilot-2.6.0.tar.gz
cd Microsoft365Copilot-2.6.0
./microsoft-365-copilot
```

#### Windows
```bash
# Descargar el installer .exe desde releases
# O descargar el zip y ejecutar el .exe
```

#### macOS
```bash
# Descargar el .dmg desde releases
# O descargar el .zip y ejecutar la aplicación
```

### Opción 2: Instalar desde fuente (Desarrollo)

#### 1. Clonar repositorio
```bash
git clone https://github.com/jgomezbau/Office365.git
cd Office365
```

#### 2. Instalar dependencias
```bash
npm install
```

#### 3. Ejecutar en modo desarrollo
```bash
npm start
```

#### 4. Compilar (opcional)
```bash
# Compilar para todas las plataformas
npm run build

# Compilar solo para Linux
npm run build:linux

# Compilar solo AppImage
npm run build:appimage

# Compilar solo .deb
npm run build:deb
```

Los paquetes compilados se guardarán en la carpeta `dist/`.

## 🎮 Uso

### Interfaz principal

```
┌─────────────────────────────────────────┐
│ MS365 [+] [⚙] [-] [□] [×]              │  ← Barra de herramientas
├─────────────────────────────────────────┤
│  Pestaña1.xlsx | Pestaña2.docx | Pestaña3
│                                          │
│                                          │
│          Contenido de Microsoft 365      │
│                                          │
│                                          │
└─────────────────────────────────────────┘
```

### Operaciones básicas

#### Abrir nuevo documento
1. Desde Microsoft 365® web: Haz clic en cualquier archivo
2. Se abrirá automáticamente en una nueva pestaña
3. El tipo de archivo se detecta automáticamente (Excel, Word, etc.)

#### Cambiar entre pestañas
- Haz clic en la pestaña que deseas
- La pestaña activa se destaca

#### Cerrar pestaña
- Haz clic en la [×] de la pestaña

#### Recargar pestaña
- Haz clic en el botón de recarga [↻] de la pestaña

#### Crear nueva pestaña
- Haz clic en el botón [+] para abrir la URL principal configurada

### Menú contextual (Clic derecho)

| Opción | Descripción |
|--------|------------|
| **Inspeccionar elemento** | Abre DevTools para inspeccionar y depurar |
| **Recargar página** | Recarga la página actual |
| **Abrir en nueva pestaña** | Abre el enlace en una nueva pestaña |
| **Copiar dirección** | Copia la URL del enlace |
| **Copiar imagen** | Copia la imagen seleccionada |
| **Cortar/Copiar/Pegar** | Operaciones normales de portapapeles |

## ⚙️ Configuración

### Panel de configuración

Haz clic en el ícono de engranaje (⚙) en la barra de herramientas para acceder a:

#### URL principal
- **Corporativa**: `https://m365.cloud.microsoft/?auth=2`
- **Personal**: `https://m365.cloud.microsoft/?auth=1`

Puedes personalizar esta URL según tus necesidades.

#### User Agent personalizado (Opcional)
- Algunos servicios pueden requerir un User Agent específico
- Déjalo en blanco para usar el User Agent predeterminado de Electron

#### Tema
- **Predeterminado del sistema**: Sigue las preferencias del SO
- **Claro**: Interfaz blanca
- **Oscuro**: Interfaz oscura

### Archivo de configuración

La configuración se almacena en:
- **Linux**: `~/.config/Microsoft365Copilot/config.json`
- **macOS**: `~/Library/Application Support/Microsoft365Copilot/config.json`
- **Windows**: `%APPDATA%/Microsoft365Copilot/config.json`

## 🧠 Desarrollo

### Estructura del proyecto

```
Office365/
├── main.js                 # Punto de entrada Electron
├── preload.js             # Script de preload seguro
├── package.json           # Dependencias y scripts
├── src/
│   ├── index.html         # Interfaz HTML
│   ├── renderer.js        # Lógica del frontend (renderer)
│   ├── styles.css         # Estilos CSS
│   ├── config/
│   │   ├── configManager.js    # Gestión de configuración
│   │   └── createWindow.js     # Creación de ventanas
│   └── utils/
│       ├── urlHandler.js       # Manejo de URLs
│       └── nativeAppHandler.js # Gestión de aplicaciones nativas
├── icons/                 # Iconos de la aplicación
└── dist/                  # Paquetes compilados (después de build)
```

### Stack tecnológico

| Categoría | Tecnología |
|-----------|-----------|
| **Framework** | Electron 41.2.0 |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Node.js, Electron API |
| **Almacenamiento** | electron-store 11.0.2 |
| **Parsing XML** | fast-xml-parser 5.5.11 |
| **Build** | electron-builder 26.8.1 |

### Convenciones de código

- **Indentación**: 2 espacios
- **Estilo**: JavaScript moderno (ES6+)
- **Comentarios**: JSDoc donde sea necesario
- **Nombres**: camelCase para variables/funciones, PascalCase para clases

## 📚 Scripts disponibles

```bash
# Desarrollo
npm start                  # Ejecuta la aplicación en modo desarrollo

# Compilación
npm run build             # Compila para la plataforma actual
npm run build:linux       # Compila AppImage, .deb y tar.gz
npm run build:appimage    # Solo AppImage
npm run build:deb         # Solo .deb para Debian/Ubuntu

# Verificación
npm test                  # Ejecuta pruebas (si existen)
```

## 🐛 Solución de problemas

### La aplicación no inicia
```bash
# Verifica Node.js
node --version

# Reinstala las dependencias
rm -rf node_modules package-lock.json
npm install

# Ejecuta con debug
DEBUG=* npm start
```

### Problemas de GPU/Renderizado en Linux
```bash
# Si ves parpadeos o problemas de GPU:
npm start -- --disable-gpu
```

### La ventana no se refresca al maximizar
- Este problema está solucionado en versión 2.6.0
- Si persiste, intenta: `npm install` en versión actual

### No se detecta el tipo de archivo
- Verifica que el título de la pestaña contenga la extensión del archivo
- Comprueba en DevTools (`Inspeccionar elemento`) qué URL se está cargando

### Error "Store is not a constructor"
- Restablece la configuración: elimina el archivo de configuración
- Reinicia la aplicación

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor seguir estos pasos:

### 1. Fork del repositorio
```bash
# En GitHub, haz clic en "Fork"
```

### 2. Clona tu fork
```bash
git clone https://github.com/TU_USUARIO/Office365.git
cd Office365
```

### 3. Crea una rama para tu feature
```bash
git checkout -b feature/mi-nueva-funcionalidad
```

### 4. Haz cambios y commits
```bash
git add .
git commit -m "Añadir mi nueva funcionalidad"
```

### 5. Push a tu fork
```bash
git push origin feature/mi-nueva-funcionalidad
```

### 6. Crea un Pull Request
- Ve a GitHub y abre un PR desde tu rama
- Describe los cambios y proporciona contexto

### Guía de contribución
- El código debe seguir el estilo del proyecto
- Prueba tus cambios antes de hacer PR
- Actualiza la documentación si es necesario
- Sé descriptivo en los commits

## 📋 Historial de cambios

### v2.6.0 (Actual)
- ✅ Actualización a Electron 41.2.0
- ✅ Soporte para compilación a .deb
- ✅ Corrección de detección de iconos de archivo
- ✅ Soporte para maximizar/unmaximizar con doble clic
- ✅ Mejoras en la detección de URLs de Office 365

### v2.5.0
- Soporte para pestañas independientes
- Menú contextual personalizado
- Interceptor de URLs inteligente

## 📄 Licencia

Este proyecto está licenciado bajo la **MIT License** - ver archivo [LICENSE](LICENSE) para más detalles.

## 📞 Contacto y soporte

- **Autor**: Juan Bau (@jgomezbau)
- **Email**: jgomezbau@gmail.com
- **Issues/Bugs**: [GitHub Issues](https://github.com/jgomezbau/Office365/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jgomezbau/Office365/discussions)

## 🙏 Agradecimientos

- [Electron](https://www.electronjs.org/) - El framework base
- [electron-builder](https://www.electron.build/) - Para la compilación
- [Microsoft 365](https://www.microsoft365.com/) - Servicio que wrapeamos

---

**Nota**: Este proyecto no está afiliado con Microsoft. Microsoft 365® y Office 365® son marcas registradas de Microsoft Corporation.
