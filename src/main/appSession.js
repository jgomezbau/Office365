function configureAppSession({
  appSession,
  desktopCapturer,
  shell,
  shouldOpenInternally
}) {
  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = [
      'media',
      'notifications',
      'clipboard-read',
      'clipboard-sanitized-write',
      'clipboard-write',
      'fullscreen'
    ];
    callback(allowedPermissions.includes(permission));
  });

  appSession.setPermissionCheckHandler((webContents, permission) => {
    const allowedPermissions = [
      'media',
      'notifications',
      'clipboard-read',
      'clipboard-sanitized-write',
      'clipboard-write',
      'fullscreen'
    ];
    return allowedPermissions.includes(permission);
  });

  appSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true
        });

        if (!sources.length) {
          callback({ video: null, audio: null });
          return;
        }

        const preferredSource =
          sources.find((source) => source.display_id && source.id.startsWith('screen:')) ||
          sources.find((source) => source.id.startsWith('screen:')) ||
          sources[0];

        callback({
          video: preferredSource,
          audio: 'loopback'
        });
      } catch (error) {
        console.error('Error al solicitar captura de pantalla:', error);
        callback({ video: null, audio: null });
      }
    },
    {
      useSystemPicker: true
    }
  );

  appSession.webRequest.onBeforeRequest({
    urls: ['*://*/*']
  }, (details, callback) => {
    if (details.resourceType === 'mainFrame' && details.method === 'GET') {
      const url = details.url;

      if (!shouldOpenInternally(url)) {
        shell.openExternal(url);
        callback({ cancel: true });
        return;
      }
    }

    callback({ cancel: false });
  });
}

module.exports = {
  configureAppSession
};
