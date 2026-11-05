import { QueryClient } from '@tanstack/react-query'

/**
 * The one cache for server data (architecture.md, Client data). Nothing
 * goes stale on its own: the event stream keeps it current, and a
 * reconnect invalidates everything. So no refetch on focus or interval.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 30 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  })
}
