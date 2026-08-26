# Changelog

All notable changes to the **TauriTavern Easy Access Logs** extension are documented in this file.

## [2.1.0]

### Added
- **Customizable Keyboard Shortcuts**: Fully configurable keybindings for all developer actions:
  - **LLM API Logs** (Default: `F10`)
  - **Frontend Logs** (Default: `Ctrl + F10`)
  - **Backend Logs** (Default: `Alt + F10`)
  - **Immersive Fullscreen** (Default: `F11`)
- **Interactive Hotkey Recorder**: Click-to-bind interface with instant key combo detection, <kbd>Backspace</kbd> / <kbd>Delete</kbd> to unbind (`None`), <kbd>Esc</kbd> to cancel, and one-click "Reset Defaults".
- **User Settings Launcher Dropdown**: Optional setting to transform the top bar User Settings button into an all-in-one launcher for User Settings, Developer Logs, and Fullscreen.
- **Unified Floating Dropdown Design**: Sleek frosted-glass menu design (`backdrop-filter: blur(16px)`) with pixel-perfect positioning, shortcut badges, subtle dividers, and consistent typography across both launcher modes.
- **Bidirectional Toggle-to-Close**: Pressing an active log hotkey or launcher button again cleanly closes the open modal window.
- **Extension Settings Panel**: Dedicated `Easy Access Logs` section in the Extensions settings tab to manage launcher modes and keyboard shortcuts with persistent `localStorage` synchronization.

---

## [2.0.1]

### Fixed
- **Streaming Auto-Scroll**: Fixed auto-scroll tracking during live LLM request streaming.
- **Tauri ACL Warning Silence**: Silenced benign IPC access warnings in desktop environments.
- **Drawer Menu Polish**: Removed redundant drawer header elements for a cleaner menu appearance.

---

## [2.0.0]

### Added
- **Immersive Fullscreen App Toggle**: Added a desktop action row in the top bar drawer to toggle the entire TauriTavern application into borderless immersive fullscreen without affecting custom wallpapers.
- **Role-Based Message Colorizing**: Dedicated colorize buttons in both Formatted Preview Request and Raw JSON Request to visually distinguish `[system]`, `[user]`, and `[assistant]` roles with high contrast, natural colors while preserving 100% exact raw text and copy fidelity.
- **Fullscreen Section Zoom Controls**: Zoom In (`+`) and Zoom Out (`−`) controls accessible directly inside fullscreen mode across all viewers.
- **Preference & Setting Persistence**: Automatically remembers Raw Word Wrap and Role Color toggle selections across sessions via `localStorage`.

---

## [1.0.1]

### Added
- **Expanded Desktop Viewer**: Larger, balanced desktop proportions with taller textareas for comfortable reading.
- **Section Zoom Controls**: Synchronized Zoom In (`+`) and Zoom Out (`−`) controls for Formatted Preview and Raw JSON / SSE sections.
- **Instant Fullscreen Mode**: Added instant ($0\text{ms}$) edge-to-edge fullscreen for each viewer, integrated with native Tauri desktop window management.
- **Raw Word Wrap Toggle**: Shared word wrap toggle for the Raw section, plus a dedicated word wrap button inside fullscreen mode.
- **Enhanced Log Retention & Metadata**: Integrated `Keep Entries:` controls alongside connection metadata with clean input formatting.
- **Visual Copy Confirmation**: Copy buttons now provide a temporary checkmark confirmation upon copying to clipboard.
- **Streamlined UI**: Renamed viewer to "LLM API Logs" and cleaned up header descriptions.

---

## [1.0.0]

### Added
- Initial release of TauriTavern Easy Access Logs.
- Direct access to LLM API Logs, Frontend Logs, and Backend Logs.
