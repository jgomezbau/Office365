# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `npm start` - Run the Electron application
- `npm run build` - Build the application using electron-builder
- `npm run linux` - Build specifically for Linux as an AppImage
- `./clean-start.sh` - Clean session data and start app with optimized options

## Code Style Guidelines
- **Imports**: Use Node.js require() style, group by type (core modules first)
- **Formatting**: 2-space indentation, clear spacing around operators
- **Types**: Prefer JSDoc comments for type documentation
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Error Handling**: Use try/catch blocks with descriptive console.error messages
- **Structure**: 
  - Main app code in main.js and preload.js
  - Configuration in src/config/
  - UI in src/index.html, renderer.js, styles.css
  - Utilities in src/utils/

## Best Practices
- Follow Electron security best practices
- Document functions with JSDoc style comments
- Use modern JavaScript features (arrow functions, template literals)
- Group related functionality into separate modules