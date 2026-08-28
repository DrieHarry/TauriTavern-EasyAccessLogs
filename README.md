# TauriTavern Easy Access Logs

Adds quick-access **Developer & API Logs** launchers and customizable global hotkeys to [TauriTavern](https://github.com/Darkatse/TauriTavern).

📖 Changelogs: [Here](changelog.md)

## Features

- **Global Keyboard Shortcuts**: Configurable keybindings:
  - **LLM API Logs** (`F10`)
  - **Frontend Logs** (`Ctrl + F10`)
  - **Backend Logs** (`Alt + F10`)
- **Multiple Launcher Modes**:
  - **Standalone Top Bar Icon**: Displays a dedicated waveform launcher icon in the navigation bar with a sleek dropdown menu.
  - **User Settings Dropdown Integration**: Consolidates User Settings and Developer Logs into the native top bar User Settings button.
- **Rich Request & Response Inspection**:
  - Role-based colorizing for `[system]`, `[user]`, and `[assistant]` message segments in both Formatted Preview and Raw JSON / SSE requests while preserving 100% exact raw text and copy fidelity.
  - Synchronized section zoom controls (`+` / `−`).
  - Raw word wrap toggling.
- **Frontend & Backend System Logs**: Real-time log streaming, log level filtering, instant text search, retention controls, and one-click clipboard copying with visual confirmation.
- **Session Persistence**: Remembers all user preferences, wrap states, colorizing toggles, launcher visibility, and custom hotkeys across app restarts.

## Install

1. Open **Extensions** in TauriTavern.
2. Select **Install extension**.
3. Paste the repository URL:
   `https://github.com/DrieHarry/TauriTavern-EasyAccessLogs`
4. Reload TauriTavern when prompted.

## Use

- **Hotkeys**: Press `F10` for LLM API Logs, `Ctrl+F10` for Frontend Logs, or `Alt+F10` for Backend Logs. Press the same hotkey again (or <kbd>Esc</kbd>) to close.
- **Top Bar Launcher**: Click the waveform icon (or User Settings button if launcher integration is enabled) to open the quick-access menu.
- **Customization**: Go to **Extensions** $\rightarrow$ **Easy Access Logs** to customize keyboard shortcuts, toggle the top bar icon, or switch to the User Settings launcher dropdown.

## Compatibility

Requires [TauriTavern](https://github.com/Darkatse/TauriTavern) (Windows and Android supported).

In standard web-only SillyTavern builds, the extension gracefully deactivates because Tauri host log APIs are unavailable.

## Screenshots

Screenshots coming soon.
