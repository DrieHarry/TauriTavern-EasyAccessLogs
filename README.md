# TauriTavern Easy Access Logs

Adds a **Developer & API Logs** button to the TauriTavern top bar.

## What's New in v2.0.0

- **Immersive Fullscreen App Toggle**: Added a desktop action row in the top bar drawer to toggle the entire TauriTavern application into borderless immersive fullscreen without affecting custom wallpapers.
- **Role-Based Message Colorizing**: Dedicated colorize buttons in both Formatted Preview Request and Raw JSON Request to visually distinguish `[system]`, `[user]`, and `[assistant]` roles with high contrast, natural colors while preserving 100% exact raw text and copy fidelity.
- **Fullscreen Section Zoom Controls**: Zoom In (`+`) and Zoom Out (`−`) controls are now accessible directly inside fullscreen mode across all viewers.
- **Preference & Setting Persistence**: Automatically remembers your Raw Word Wrap and Role Color toggle selections across sessions via `localStorage`, while keeping default zoom behavior.

## What's New in v1.0.1

- **Expanded Desktop Viewer**: Larger, balanced desktop proportions with taller textareas for comfortable reading.
- **Section Zoom Controls**: Added synchronized Zoom In (`+`) and Zoom Out (`−`) controls for Formatted Preview and Raw JSON / SSE sections.
- **Instant Fullscreen Mode**: Added instant ($0\text{ms}$) edge-to-edge fullscreen for each viewer, integrated with native Tauri desktop window management.
- **Raw Word Wrap Toggle**: Added a shared word wrap toggle for the Raw section, plus a dedicated word wrap button inside fullscreen mode.
- **Enhanced Log Retention & Metadata**: Integrated `Keep Entries:` controls alongside connection metadata with clean input formatting.
- **Visual Copy Confirmation**: Copy buttons now provide a temporary checkmark confirmation upon copying to clipboard.
- **Streamlined UI**: Renamed viewer to "LLM API Logs" and cleaned up header descriptions.

## Features

- Immersive Fullscreen desktop app toggle
- Role-based message colorizing for Formatted Preview and Raw JSON / SSE requests
- LLM and image API request logs with synchronized section zoom and word wrap
- Frontend logs
- Backend logs
- Live updates, filters, search, and copy buttons
- Mobile-friendly layout

## Install

1. Open **Extensions** in TauriTavern.
2. Select **Install extension**.
3. Paste this URL:
   `https://github.com/DrieHarry/TauriTavern-EasyAccessLogs`
4. Reload TauriTavern when prompted.

## Use

Select the waveform icon in the top bar, then choose the log viewer you want to open.

## Compatibility

Requires a compatible TauriTavern build. It is intended for Windows and Android.

In regular SillyTavern, the extension stays inactive because TauriTavern logs are not available.

## Screenshots

Screenshots coming soon.
