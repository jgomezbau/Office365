#!/bin/bash
# Script para limpiar datos de sesión y arrancar la aplicación con opciones optimizadas

echo "Microsoft 365 Copilot - Clean Start Script"
echo "=========================================="

# Determinar el directorio de datos de la aplicación
APP_DATA_DIR="$HOME/.config/Microsoft365Copilot"

# Verificar que el directorio existe
if [ -d "$APP_DATA_DIR" ]; then
  echo "🧹 Limpiando datos de sesión en $APP_DATA_DIR"
  
  # Eliminar caché y cookies, pero preservar la configuración principal
  find "$APP_DATA_DIR" -type d -name "Cache" -exec rm -rf {} \; 2>/dev/null || true
  find "$APP_DATA_DIR" -type d -name "Code Cache" -exec rm -rf {} \; 2>/dev/null || true
  find "$APP_DATA_DIR" -type d -name "Session Storage" -exec rm -rf {} \; 2>/dev/null || true
  find "$APP_DATA_DIR" -type d -name "Local Storage" -exec rm -rf {} \; 2>/dev/null || true
  find "$APP_DATA_DIR" -name "Cookies*" -exec rm -f {} \; 2>/dev/null || true
  
  echo "✅ Limpieza completada"
else
  echo "ℹ️ Primera ejecución. No hay datos para limpiar."
fi

# Iniciar la aplicación con opciones optimizadas
echo "🚀 Iniciando Microsoft 365 Copilot con opciones optimizadas..."

# Opciones para mejorar el rendimiento
OPTIMIZE_OPTIONS="--disable-background-timer-throttling --disable-renderer-backgrounding"

# Opciones para GPU
GPU_OPTIONS="--enable-gpu-rasterization --enable-zero-copy"

# Opciones para memoria
MEMORY_OPTIONS="--js-flags='--max_old_space_size=4096'"

# Opciones de seguridad
SECURITY_OPTIONS="--disable-features=Translate"

# Comprobar si estamos en desarrollo o producción
if [ -f "./node_modules/.bin/electron" ]; then
  # Desarrollo
  echo "🛠️ Modo desarrollo"
  ./node_modules/.bin/electron . $OPTIMIZE_OPTIONS $GPU_OPTIONS $MEMORY_OPTIONS $SECURITY_OPTIONS
else
  # Producción (binario instalado)
  echo "🏢 Modo producción"
  
  # Intentar encontrar el binario
  if [ -f "./Microsoft365Copilot" ]; then
    ./Microsoft365Copilot $OPTIMIZE_OPTIONS $GPU_OPTIONS $MEMORY_OPTIONS $SECURITY_OPTIONS
  elif [ -f "./dist/linux-unpacked/Microsoft365Copilot" ]; then
    ./dist/linux-unpacked/Microsoft365Copilot $OPTIMIZE_OPTIONS $GPU_OPTIONS $MEMORY_OPTIONS $SECURITY_OPTIONS
  else
    echo "⚠️ No se encuentra el binario. Ejecutando con npm..."
    npm start -- $OPTIMIZE_OPTIONS $GPU_OPTIONS $MEMORY_OPTIONS $SECURITY_OPTIONS
  fi
fi