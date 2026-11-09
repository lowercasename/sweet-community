/**
 * The light or dark choice for this device (architecture.md, Interface). The rule lives in public/theme.js, which runs
 * before the page is drawn. This module only reaches it from the app.
 */
export type ThemeChoice = 'device' | 'light' | 'dark'

declare global {
  interface Window {
    sweetTheme?: { get: () => ThemeChoice; set: (choice: ThemeChoice) => void }
  }
}

export const themeChoice = (): ThemeChoice => window.sweetTheme?.get() ?? 'device'
export const setThemeChoice = (choice: ThemeChoice) => window.sweetTheme?.set(choice)
