import posthog from 'posthog-js'

import type { BootstrapPayload, InstalledPluginRecord } from '../types/desktop'
import type { PluginCatalogEntry } from '../types/plugin'

const POSTHOG_PROJECT_KEY =
  import.meta.env.VITE_POSTHOG_PROJECT_KEY ?? 'POSTHOG_PROJECT_KEY'

const POSTHOG_API_HOST =
  import.meta.env.VITE_POSTHOG_API_HOST ?? 'https://us.i.posthog.com'

if (typeof window !== 'undefined') {
  posthog.init(POSTHOG_PROJECT_KEY, {
    api_host: POSTHOG_API_HOST,
    capture_pageview: true,
    autocapture: true,
  })
}

function inferObsVersion(bootstrap?: BootstrapPayload | null) {
  const message = bootstrap?.obsDetection.message ?? ''
  const matchedVersion = message.match(/(?:OBS(?: Studio)?\s*v?)(\d+(?:\.\d+){0,2})/i)?.[1]
  return matchedVersion ?? 'unknown'
}

export function getAnalyticsContext(bootstrap?: BootstrapPayload | null) {
  return {
    platform: bootstrap?.currentPlatform ?? 'unknown',
    obsVersion: inferObsVersion(bootstrap),
    appVersion: bootstrap?.currentVersion ?? 'unknown',
    obsConfigured: Boolean(bootstrap?.settings.obsPath),
  }
}

export function getPluginAnalyticsProperties(
  plugin: PluginCatalogEntry | undefined | null,
  bootstrap?: BootstrapPayload | null,
  installedPlugin?: InstalledPluginRecord | null,
  extraProperties?: Record<string, unknown>,
) {
  return {
    ...getAnalyticsContext(bootstrap),
    pluginId: plugin?.id ?? installedPlugin?.pluginId ?? 'unknown',
    pluginName: plugin?.name ?? 'unknown',
    pluginVersion: plugin?.version ?? installedPlugin?.installedVersion ?? 'unknown',
    pluginCategory: plugin?.category ?? 'unknown',
    pluginAuthor: plugin?.author ?? 'unknown',
    installState: installedPlugin
      ? installedPlugin.managed
        ? 'managed'
        : 'external'
      : 'not-installed',
    ...extraProperties,
  }
}

export function trackEvent(
  eventName:
    | 'app_open'
    | 'plugin_search'
    | 'plugin_view'
    | 'plugin_install_start'
    | 'plugin_install_success'
    | 'plugin_install_fail'
    | 'update_check'
    | 'update_success',
  properties: Record<string, unknown> = {},
) {
  if (typeof window === 'undefined') {
    return
  }

  window.setTimeout(() => {
    try {
      posthog.capture(eventName, properties)
    } catch {
      // Analytics must never interrupt desktop workflows.
    }
  }, 0)
}
