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
  lastCommunity,
  loadCommunities,
  removeCommunity,
  setLastCommunity,
  toAddress,
  type Community,
} from './communities'

/**
 * The store app's own page. At start it opens the community used last. It shows the list when there is none, or
 * when the address has ?list, which the community's "Your communities" menu item uses.
 */
function StoreApp() {
  const [communities, setCommunities] = useState<Community[] | null>(null)

  const open = async (url: string) => {
    await setLastCommunity(url)
    window.location.assign(url)
  }

  useEffect(() => {
    void (async () => {
      const list = await loadCommunities()
      const last = await lastCommunity()
      const wantsList = new URLSearchParams(window.location.search).has('list')
      if (!wantsList && last && list.some((c) => c.url === last)) {
        await open(last)
        return
      }
      setCommunities(list)
    })()
  }, [])

  if (communities === null) return null
  return (
    <CommunityList
      communities={communities}
      onOpen={(c) => void open(c.url)}
      onAdd={async (typed) => {
        const url = toAddress(typed)
        if (!url) throw new Error('Enter the full address of the community, such as sweet.example.org.')
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
