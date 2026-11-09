import { QueryClient } from '@tanstack/react-query'

/**
 * The one cache for server data. Nothing
 * goes stale on its own. The event stream keeps the cache current, and a
 * reconnect invalidates every query. So there is no refetch on focus or on
 * an interval.
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
