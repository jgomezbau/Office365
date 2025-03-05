# Copilot Office 365® Desktop App

**Versión 1.0.0**

Esta es una aplicación de escritorio desarrollada utilizando **Electron**, que permite a los usuarios interactuar con **Office 365 WEB®** de manera independiente del navegador. El objetivo de este proyecto es proporcionar una experiencia de usuario más fluida y accesible para aquellos que prefieren tener Office 365® en su escritorio sin poder utilizar la aplicacion oficial (No hay aplicacion para Linux... :( ).

## Características

- **Interfaz Independiente**: Ejecuta Office 365 Web® directamente en el escritorio sin necesidad de un navegador web.
- **Permisos para cámara y micrófono**: La aplicación está configurada para solicitar permisos de acceso a la cámara y micrófono cuando sea necesario.
- **Menú contextual personalizado**: Se ha habilitado un menú contextual con opciones como cortar, copiar, pegar, recargar, imprimir, y más.
- **Recarga automática**: La aplicación permite recargar la página de Office 365 Web® fácilmente desde el menú contextual.
- **Pestañas independientes**: La aplicación genera pestañas independientes con cada archivo que se abre, de esta forma mantenemos una pestaña principal como organizador y pestañas al estilo navegador web con los archivos dentro editables.
- **xml basico de configuracion**: config.xml permite ingresar la URL de inicio donde de esta forma podemos elegir si utilizamos una cuenta personal o de empresa.
  
## Tecnologías utilizadas

- **Electron**: Framework para crear aplicaciones de escritorio utilizando tecnologías web.
- **Node.js**: Entorno de ejecución para JavaScript del lado del servidor.
- **JavaScript/HTML/CSS**: Para el desarrollo de la interfaz de usuario.

## Requisitos previos

Antes de comenzar, asegúrate de tener lo siguiente instalado:

- **Node.js** (Versión 12 o superior)
- **npm** (Node Package Manager)

## Instalación

### Pasos para instalar y ejecutar la aplicación:

1. **Clonar el repositorio**:

   ```bash
   git clone https://github.com/jgomezbau/chatgpt-app.git

# Uso
**Menú contextual**: 
	Al hacer clic derecho en cualquier parte de la ventana, podrás ver las opciones disponibles (Cortar, Copiar, Pegar, Recargar, Imprimir, y más).
**Recarga de página**: 
	Puedes recargar la aplicación para forzar la actualización de ChatGPT desde el menú contextual.
**Inspección de elementos**: 
	Se puede abrir DevTools desde el menú contextual para depurar o inspeccionar el contenido.

# Contribuciones
	Si deseas contribuir a este proyecto, por favor sigue estos pasos:

# Realiza un fork de este repositorio.
	Crea una nueva rama para tus modificaciones:

		bash
		git checkout -b feature/nueva-funcionalidad
		Realiza tus cambios y haz un commit:

		bash
		git commit -am 'Añadir nueva funcionalidad'
		Envía tus cambios a la rama:

		bash
		git push origin feature/nueva-funcionalidad
		Abre un pull request para revisar tu aporte.

# Licencia
	Este proyecto está licenciado bajo la MIT License.


**Este README refleja las características, el uso y las instrucciones de instalación de la aplicación de escritorio para **ChatGPT**, que se ejecuta dentro de **Electron** con funcionalidades como la recarga, inspección de elementos y un menú contextual personalizado.**

Si necesitas algún ajuste o quieres agregar más detalles, ¡solo dime!
