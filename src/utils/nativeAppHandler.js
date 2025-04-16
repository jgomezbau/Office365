/**
 * Utilidad para gestionar aplicaciones nativas y su integración
 */
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mapeo de extensiones de archivo a aplicaciones
const fileTypeToAppCommand = {
  // Documentos de texto
  '.doc': { name: 'Word', apps: ['libreoffice --writer', 'onlyoffice-desktopeditors', 'abiword'] },
  '.docx': { name: 'Word', apps: ['libreoffice --writer', 'onlyoffice-desktopeditors', 'abiword'] },
  '.odt': { name: 'Writer', apps: ['libreoffice --writer', 'onlyoffice-desktopeditors', 'abiword'] },
  '.rtf': { name: 'Rich Text', apps: ['libreoffice --writer', 'onlyoffice-desktopeditors', 'abiword'] },
  '.txt': { name: 'Texto', apps: ['kate', 'kwrite', 'gedit', 'nano', 'vim'] },
  
  // Hojas de cálculo
  '.xls': { name: 'Hoja de cálculo', apps: ['libreoffice --calc', 'onlyoffice-desktopeditors', 'gnumeric'] },
  '.xlsx': { name: 'Hoja de cálculo', apps: ['libreoffice --calc', 'onlyoffice-desktopeditors', 'gnumeric'] },
  '.ods': { name: 'Calc', apps: ['libreoffice --calc', 'onlyoffice-desktopeditors', 'gnumeric'] },
  '.csv': { name: 'CSV', apps: ['libreoffice --calc', 'onlyoffice-desktopeditors', 'gnumeric'] },
  
  // Presentaciones
  '.ppt': { name: 'PowerPoint', apps: ['libreoffice --impress', 'onlyoffice-desktopeditors'] },
  '.pptx': { name: 'PowerPoint', apps: ['libreoffice --impress', 'onlyoffice-desktopeditors'] },
  '.odp': { name: 'Impress', apps: ['libreoffice --impress', 'onlyoffice-desktopeditors'] },
  
  // PDF
  '.pdf': { name: 'PDF', apps: ['okular', 'evince', 'atril', 'xreader', 'firefox'] },
  
  // Imágenes
  '.jpg': { name: 'Imagen', apps: ['gwenview', 'eog', 'gimp'] },
  '.jpeg': { name: 'Imagen', apps: ['gwenview', 'eog', 'gimp'] },
  '.png': { name: 'Imagen', apps: ['gwenview', 'eog', 'gimp'] },
  '.gif': { name: 'Imagen', apps: ['gwenview', 'eog', 'gimp'] },
  
  // Otros
  '.zip': { name: 'Archivo ZIP', apps: ['ark', 'file-roller'] },
  '.rar': { name: 'Archivo RAR', apps: ['ark', 'file-roller'] },
  '.7z': { name: 'Archivo 7z', apps: ['ark', 'file-roller'] },
};

// Caché de aplicaciones detectadas
let detectedAppsCache = null;

/**
 * Detecta qué aplicaciones están instaladas en el sistema
 * @returns {Promise<Object>} - Objeto con las aplicaciones disponibles
 */
async function detectInstalledApps() {
  // Si ya tenemos el caché, lo devolvemos
  if (detectedAppsCache) {
    return detectedAppsCache;
  }

  // Comprobar si estamos en Linux
  if (process.platform !== 'linux') {
    console.warn('La detección de aplicaciones solo está soportada en Linux');
    return {};
  }

  const result = {};
  
  try {
    // Buscar todas las aplicaciones posibles
    const allApps = new Set();
    Object.values(fileTypeToAppCommand).forEach(typeInfo => {
      typeInfo.apps.forEach(app => {
        // Extraer solo el nombre del comando (sin parámetros)
        const appName = app.split(' ')[0];
        allApps.add(appName);
      });
    });

    // Comprobar cada aplicación si está instalada
    for (const appName of allApps) {
      try {
        const { stdout } = await execAsync(`which ${appName}`);
        if (stdout.trim()) {
          result[appName] = stdout.trim();
        }
      } catch (err) {
        // La aplicación no está instalada, continuar
      }
    }

    // Verificar LibreOffice específicamente (podría tener diferentes rutas)
    if (result['libreoffice']) {
      result['libreoffice --writer'] = result['libreoffice'];
      result['libreoffice --calc'] = result['libreoffice'];
      result['libreoffice --impress'] = result['libreoffice'];
    }

    console.log('Aplicaciones detectadas:', result);
    
    // Guardar en caché
    detectedAppsCache = result;
    return result;
  } catch (error) {
    console.error('Error al detectar aplicaciones:', error);
    return {};
  }
}

/**
 * Obtiene las aplicaciones disponibles para abrir un tipo de archivo
 * @param {string} filePath - Ruta o URL del archivo
 * @returns {Promise<Array>} - Lista de aplicaciones disponibles
 */
async function getAvailableAppsForFile(filePath) {
  try {
    // Detectar extensión del archivo
    const extension = path.extname(filePath).toLowerCase();
    
    if (!extension) {
      return [];
    }
    
    // Buscar aplicaciones para esta extensión
    const fileType = fileTypeToAppCommand[extension];
    if (!fileType) {
      return [];
    }
    
    // Conseguir lista de aplicaciones instaladas
    const installedApps = await detectInstalledApps();
    
    // Filtrar solo las que están instaladas
    const availableApps = fileType.apps
      .filter(appCmd => {
        const appName = appCmd.split(' ')[0];
        return !!installedApps[appName] || !!installedApps[appCmd];
      })
      .map(appCmd => {
        const appName = appCmd.split(' ')[0];
        const displayName = appName.charAt(0).toUpperCase() + appName.slice(1);
        return {
          name: displayName,
          command: appCmd,
          path: installedApps[appName] || installedApps[appCmd]
        };
      });
      
    return availableApps;
  } catch (error) {
    console.error('Error al obtener aplicaciones disponibles:', error);
    return [];
  }
}

/**
 * Descarga un archivo de una URL y lo abre con una aplicación nativa
 * @param {string} url - URL del archivo a descargar
 * @param {string} appCommand - Comando de la aplicación para abrir el archivo
 * @returns {Promise<boolean>} - Resultado de la operación
 */
async function downloadAndOpenWithApp(url, appCommand) {
  try {
    // Extraer nombre del archivo de la URL
    let fileName = path.basename(url).split('?')[0];
    
    // Si no hay un nombre de archivo válido, usar uno genérico
    if (!fileName || fileName.length < 3) {
      // Intentar determinar el tipo de archivo desde la URL
      const extension = url.match(/\.(docx|xlsx|pptx|pdf|txt|jpg|png)(\?|$)/i);
      fileName = `file-${Date.now()}${extension ? `.${extension[1]}` : ''}`;
    }
    
    // Crear directorio temporal si no existe
    const tempDir = path.join(os.tmpdir(), 'ms365app');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filePath = path.join(tempDir, fileName);
    
    console.log(`Descargando ${url} a ${filePath}...`);
    
    // Usar curl para descargar el archivo (más confiable para archivos de SharePoint)
    await execAsync(`curl -L -o "${filePath}" "${url}"`);
    
    console.log(`Archivo descargado. Abriendo con: ${appCommand}`);
    
    // Ejecutar la aplicación con el archivo
    const cmd = `${appCommand} "${filePath}"`;
    const { stdout, stderr } = await execAsync(cmd);
    
    if (stderr) {
      console.error(`Error al abrir archivo: ${stderr}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error al descargar y abrir archivo:', error);
    return false;
  }
}

/**
 * Detecta el tipo de archivo basado en la URL y extensión
 * @param {string} url - URL del archivo
 * @returns {string} - Tipo de archivo o vacío si no se reconoce
 */
function detectFileType(url) {
  if (!url) return '';
  
  try {
    // Extraer la extensión
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const extension = path.extname(pathname);
    
    if (extension && fileTypeToAppCommand[extension]) {
      return fileTypeToAppCommand[extension].name;
    }
    
    // Intentar detectar por parámetros o patrones en la URL
    if (url.includes('/download?') || url.includes('/Download?')) {
      // Buscar parámetros que indiquen tipo
      if (url.includes('docx') || url.includes('document')) {
        return 'Word';
      } else if (url.includes('xlsx') || url.includes('spreadsheet')) {
        return 'Hoja de cálculo';
      } else if (url.includes('pptx') || url.includes('presentation')) {
        return 'PowerPoint';
      } else if (url.includes('pdf')) {
        return 'PDF';
      }
    }
    
    return '';
  } catch (error) {
    console.error('Error al detectar tipo de archivo:', error);
    return '';
  }
}

module.exports = {
  detectInstalledApps,
  getAvailableAppsForFile,
  downloadAndOpenWithApp,
  detectFileType
};