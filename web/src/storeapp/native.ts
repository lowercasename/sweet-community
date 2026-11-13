import { registerPlugin } from '@capacitor/core'
import { isStoreApp } from '../install'

/**
 * The store app's own plugin, SweetApp, written for the iOS and Android projects in ios/App/App/SweetApp.swift and
 * android/app/src/main/java/community/sweet/app. It switches the app between a community and the app's own page.
 * Switching restarts the web view, so the open community is the only site the app treats as its own.
 */
interface SweetAppPlugin {
  open(options: { url: string }): Promise<void>
  showList(): Promise<void>
  unreachable(): Promise<{ url?: string | null }>
  forget(options: { url: string }): Promise<void>
}

const SweetApp = registerPlugin<SweetAppPlugin>('SweetApp')

/** Opens a community. Outside the store app, in a browser during development, the page goes there. */
export async function openCommunity(url: string) {
  if (isStoreApp()) await SweetApp.open({ url })
  else window.location.assign(url)
}

/** Shows the app's own page with the list of communities. */
export async function showCommunityList() {
  await SweetApp.showList()
}

/** The address of the community that could not be loaded, when the app's own page is shown in its place. */
export async function unreachableCommunity(): Promise<string | null> {
  if (!isStoreApp()) return null
  return (await SweetApp.unreachable()).url ?? null
}

/** Signs this device out of a community by deleting the web view's cookies for its address. */
export async function forgetCommunity(url: string) {
  if (isStoreApp()) await SweetApp.forget({ url })
}
