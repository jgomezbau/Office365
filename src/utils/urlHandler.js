/**
 * Utilidad para manejar URLs y determinar cómo deben abrirse
 */

// Lista de dominios que deben abrirse dentro de la aplicación
const internalDomains = [
  'https://m365.cloud',
  'https://login.microsoftonline.com',
  'https://microsoft365.com',
  'https://office.com',
  'https://office365.com',
  'https://sharepoint.com',
  'https://onedrive.live.com',
  'https://*.sharepoint.com',
  'https://*.onmicrosoft.com',
  'https://outlook.office.com',
  'https://outlook.office365.com',
  'https://teams.microsoft.com',
  'https://teams.live.com',
  'https://*.teams.live.com',
  'https://officeapps.live.com',
  'https://live.com',
  'https://onenote.com',
  'https://www.onenote.com',
  'https://*.onenote.com',
  'https://onenote.officeapps.live.com',
  'https://*.onenote.officeapps.live.com',
  'https://office-online.com',
  'https://officeweb365.com',
  'https://*.officeapps.live.com',
  'https://*.sharepoint-df.com',
  'https://*.sharepointonline.com',
  'https://1drv.ms'
];

// Extensiones de archivo que deben abrirse internamente (archivos de Office y otros documentos)
const internalFileExtensions = [
  '.docx', '.doc', '.dotx', '.dot',  // Word
  '.xlsx', '.xls', '.xlsm', '.xltx',  // Excel
  '.pptx', '.ppt', '.potx', '.pot',  // PowerPoint
  '.pdf',                           // PDF
  '.txt', '.csv', '.rtf',           // Texto
  '.jpg', '.jpeg', '.png', '.gif',  // Imágenes
  '.mp4', '.mp3', '.wav',           // Medios
  '.one', '.onetoc2',               // OneNote
  '.vsdx', '.vsd',                  // Visio
  '.mpp',                           // Project
  '.zip', '.rar', '.7z',            // Archivos comprimidos
];

// Patrones de URL para archivos y carpetas de SharePoint/OneDrive
const internalPathPatterns = [
  '/Documents/',
  '/_layouts/',
  '/personal/',
  '/OneDrive%20',
  '/Shared%20Documents/',
  '/sites/',
  '/teams/',
  '/drives/',
  '/drive/',
  '/folders/',
  '/files/',
  '/group/',
  '/forms/',
  '/lists/',
  '/documents?',
  '/document?',
  '/edit?',
  '/view?',
  '/download?',
  '/SitePages/',
  '/Forms/'
];

/**
 * IMPORTANTE: Determina si una URL debe abrirse internamente en la aplicación
 * Hemos actualizado esta función considerando que debe ser más agresiva
 * para detectar archivos de SharePoint/OneDrive y asegurar que TODOS se 
 * abran dentro de la aplicación.
 * 
 * @param {string} url - URL a comprobar
 * @returns {boolean} - true si debe abrirse internamente
 */
function shouldOpenInternally(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    // Ignorar javascipt: y mailto: URLs
    if (url.startsWith('javascript:') || 
        url.startsWith('mailto:') ||
        url.startsWith('tel:')) {
      return false;
    }
    
    // Crear objeto URL para facilitar análisis
    const urlObj = new URL(url);
    
    // REGLA 1: Siempre abrir internamente los dominios de Microsoft 365
    const isOffice365Domain = urlObj.hostname.includes('office') || 
                              urlObj.hostname.includes('microsoft') ||
                              urlObj.hostname.includes('sharepoint') ||
                              urlObj.hostname.includes('onedrive') ||
                              urlObj.hostname.includes('office365') ||
                              urlObj.hostname.includes('m365') ||
                              urlObj.hostname.includes('live.com') ||
                              urlObj.hostname.includes('teams.live.com') ||
                              urlObj.hostname.includes('onenote');
                              
    if (isOffice365Domain) {
      return true;
    }
    
    // REGLA 2: Comprobar si la URL tiene una extensión de archivo de documentos Office
    const hasInternalExtension = internalFileExtensions.some(ext => 
      urlObj.pathname.toLowerCase().endsWith(ext)
    );
    
    if (hasInternalExtension) {
      return true;
    }
    
    // REGLA 3: Comprobar los dominios específicos de nuestra lista
    const isInternalDomain = internalDomains.some(domain => {
      if (domain.includes('*')) {
        // Para dominios con comodín (*.sharepoint.com)
        const pattern = domain.replace(/\./g, '\\.').replace('*', '.*');
        const regex = new RegExp(`^${pattern}`, 'i');
        return regex.test(urlObj.origin);
      }
      return urlObj.origin.toLowerCase().startsWith(domain);
    });
    
    if (isInternalDomain) {
      return true;
    }
    
    // REGLA 4: Comprobar si la ruta coincide con patrones específicos
    const hasInternalPath = internalPathPatterns.some(pattern => 
      urlObj.pathname.includes(pattern) || urlObj.search.includes(pattern)
    );
    
    if (hasInternalPath) {
      return true;
    }
    
    // REGLA 5: Detectar URLs con parámetros específicos de documentos
    if (urlObj.search.includes('sourcedoc=') || 
        urlObj.search.includes('file=') || 
        urlObj.search.includes('id=') ||
        urlObj.search.includes('action=view') || 
        urlObj.search.includes('action=edit')) {
      return true;
    }
    
    // Por defecto, URLs externas (dominios no reconocidos) se abren en navegador
    return false;
  } catch (error) {
    console.error('Error al analizar URL:', error);
    // En caso de error, abrimos internamente para prevenir posibles problemas
    return true;
  }
}

module.exports = {
  shouldOpenInternally
};
