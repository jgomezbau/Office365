const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { app } = require('electron');

// Clase para manejar la configuración
class ConfigManager {
  constructor() {
    this.config = {};
    // Valor por defecto que se usará solo si no se encuentra en config.xml
    this.defaultUrl = 'https://m365.cloud.microsoft/?auth=2';
    this.configPath = null;
    this.loadConfig();
  }

  // Obtiene posibles rutas para el archivo de configuración
  getPossibleConfigPaths() {
    const paths = [];
    
    // 1. Buscar en el directorio actual de ejecución (donde está el AppImage)
    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    paths.push(path.join(exeDir, 'config.xml'));
    
    // 2. Buscar en el directorio de la aplicación (para desarrollo)
    const appPath = app.getAppPath();
    paths.push(path.join(appPath, 'config.xml'));
    
    // 3. Buscar en el directorio de datos de la aplicación
    // Esto permite una configuración por usuario en sistemas multiusuario
    const userDataPath = app.getPath('userData');
    paths.push(path.join(userDataPath, 'config.xml'));

    // 4. Si estamos en desarrollo, también buscar en el directorio del proyecto
    if (!app.isPackaged) {
      paths.push(path.join(__dirname, '..', 'config.xml'));
    }
    
    return paths;
  }

  loadConfig() {
    // Obtener posibles rutas de configuración
    const configPaths = this.getPossibleConfigPaths();
    
    let configLoaded = false;
    
    // Intentar cargar el archivo de configuración desde cualquiera de las rutas posibles
    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const xmlData = fs.readFileSync(configPath, 'utf8');
          
          // Parsear el XML
          const parser = new XMLParser();
          const result = parser.parse(xmlData);
          
          // Guardar la configuración y la ruta usada
          this.config = result.configuration;
          this.configPath = configPath;
          
          console.log(`Configuración cargada correctamente desde: ${configPath}`);
          
          // Verificar si tenemos la URL principal
          if (this.config?.settings?.mainUrl) {
            console.log(`URL principal cargada: ${this.config.settings.mainUrl}`);
            configLoaded = true;
            // Una vez encontrado un archivo válido, detenemos la búsqueda
            break;
          } else {
            console.warn('El archivo existe pero no contiene la URL principal');
          }
        }
      } catch (error) {
        console.error(`Error al cargar la configuración desde ${configPath}:`, error);
      }
    }

    if (!configLoaded) {
      console.error('No se pudo cargar ningún archivo de configuración, se usarán valores por defecto');
      
      // Si no hay configuración cargada, crear un archivo en userData
      try {
        const defaultConfig = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <application>
    <name>Office365</name>
    <version>1.0.0</version>
  </application>
  <settings>
    <mainUrl>${this.defaultUrl}</mainUrl> <!-- URL to open in the browser auth=1 Personal auth=2 Empresa-->
  </settings>
</configuration>`;
        
        const userDataPath = app.getPath('userData');
        const newConfigPath = path.join(userDataPath, 'config.xml');
        
        fs.writeFileSync(newConfigPath, defaultConfig);
        console.log(`Se ha creado un archivo de configuración por defecto en: ${newConfigPath}`);
        
        // Intentar cargar este archivo
        this.loadConfig();
      } catch (error) {
        console.error('Error al crear archivo de configuración por defecto:', error);
      }
    }
  }

  // Obtener la URL principal
  getMainUrl() {
    const configUrl = this.config?.settings?.mainUrl;
    if (configUrl) {
      return configUrl;
    } else {
      console.log('Usando URL por defecto');
      return this.defaultUrl;
    }
  }

  // Obtener toda la configuración
  getAllConfig() {
    return this.config;
  }
  
  // Obtener la ruta del archivo de configuración actualmente utilizado
  getConfigPath() {
    return this.configPath;
  }
}

module.exports = new ConfigManager();
