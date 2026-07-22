import * as React from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Service-worker lifecycle UI: offers a one-tap refresh when a new version
 * is deployed, and confirms when the app is ready to work offline.
 */
export function PwaReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error)
    },
  })

  React.useEffect(() => {
    if (offlineReady) {
      toast.success('StudentOS is ready to work offline')
      setOfflineReady(false)
    }
  }, [offlineReady, setOfflineReady])

  React.useEffect(() => {
    if (needRefresh) {
      toast('A new version is available', {
        duration: Infinity,
        action: {
          label: 'Refresh',
          onClick: () => void updateServiceWorker(true),
        },
        onDismiss: () => setNeedRefresh(false),
      })
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
