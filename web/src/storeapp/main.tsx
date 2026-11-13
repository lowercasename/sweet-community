import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/ubuntu/400.css'
import '@fontsource/ubuntu/500.css'
import '@fontsource/ubuntu/700.css'
import '../global.css'
import { CommunityList } from '../components/CommunityList'
import {
  addCommunity,
  findCommunity,
  loadCommunities,
  removeCommunity,
  setLastCommunity,
  toAddress,
  type Community,
} from './communities'
import { openCommunity, unreachableCommunity } from './native'

/**
 * The store app's own page, with the list of communities on this device. The app opens the community used last by
 * itself at start, so this page shows when no community is open, when Your communities is chosen in a community, or
 * in place of a community that could not be loaded.
 */
function StoreApp() {
  const [communities, setCommunities] = useState<Community[] | null>(null)
  const [unreachable, setUnreachable] = useState<Community | null>(null)

  const open = async (url: string) => {
    await setLastCommunity(url)
    await openCommunity(url)
  }

  useEffect(() => {
    void (async () => {
      const list = await loadCommunities()
      const failed = await unreachableCommunity()
      setUnreachable(list.find((c) => c.url === failed) ?? null)
      setCommunities(list)
    })()
  }, [])

  if (communities === null) return null
  return (
    <CommunityList
      communities={communities}
      unreachable={unreachable}
      onOpen={(c) => void open(c.url)}
      onAdd={async (typed) => {
        const url = toAddress(typed)
        if (!url) throw new Error('Enter the full address of the community, such as example.sweet.community.')
        const found = await findCommunity(url)
        setCommunities(await addCommunity(found))
        await open(found.url)
      }}
      onRemove={async (c) => setCommunities(await removeCommunity(c.url))}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreApp />
  </React.StrictMode>,
)
