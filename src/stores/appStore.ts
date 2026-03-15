import { create } from 'zustand'
import { toast } from 'sonner'

import { getErrorMessage } from '../lib/errors'
import { desktopApi } from '../lib/tauri'
import type {
  AppSettings,
  BootstrapPayload,
  InstallProgressEvent,
  InstallResponse,
  ObsDetectionState,
  UninstallResponse,
} from '../types/desktop'

type CatalogViewMode = 'list' | 'grid'

const CATALOG_VIEW_MODE_STORAGE_KEY = 'obs-plugin-installer.catalog-view-mode'

function readCatalogViewMode(): CatalogViewMode {
  if (typeof window === 'undefined') {
    return 'list'
  }

  const stored = window.localStorage.getItem(CATALOG_VIEW_MODE_STORAGE_KEY)
  return stored === 'grid' ? 'grid' : 'list'
}

interface AppStoreState {
  bootstrap: BootstrapPayload | null
  bootError: string | null
  isBootstrapping: boolean
  isSetupWorking: boolean
  isSettingsWorking: boolean
  uninstallingPluginId: string | null
  adoptingPluginId: string | null
  searchQuery: string
  selectedCategory: string
  catalogViewMode: CatalogViewMode
  installProgress: InstallProgressEvent | null
  lastInstallResponse: InstallResponse | null
  loadApp: () => Promise<void>
  applyDetection: (detection: ObsDetectionState) => void
  detectObs: () => Promise<void>
  chooseObsDirectory: () => Promise<void>
  saveObsPath: (path: string) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  clearCache: () => Promise<void>
  exportLogs: () => Promise<void>
  resetAppData: () => Promise<void>
  installPlugin: (
    pluginId: string,
    options?: {
      packageId?: string | null
      overwrite?: boolean
      githubAssetName?: string | null
      githubAssetUrl?: string | null
    },
  ) => Promise<InstallResponse | undefined>
  adoptInstallation: (pluginId: string) => Promise<void>
  uninstallPlugin: (pluginId: string) => Promise<UninstallResponse | undefined>
  openExternal: (url: string) => Promise<void>
  revealPath: (path: string) => Promise<void>
  setSearchQuery: (query: string) => void
  setSelectedCategory: (category: string) => void
  setCatalogViewMode: (mode: CatalogViewMode) => void
  clearInstallProgress: () => void
  handleInstallProgress: (progress: InstallProgressEvent) => void
}

let bootstrapRequest: Promise<void> | null = null

export const useAppStore = create<AppStoreState>((set, get) => ({
  bootstrap: null,
  bootError: null,
  isBootstrapping: true,
  isSetupWorking: false,
  isSettingsWorking: false,
  uninstallingPluginId: null,
  adoptingPluginId: null,
  searchQuery: '',
  selectedCategory: 'Compatible',
  catalogViewMode: readCatalogViewMode(),
  installProgress: null,
  lastInstallResponse: null,

  async loadApp() {
    if (bootstrapRequest) {
      return bootstrapRequest
    }

    set({ isBootstrapping: true, bootError: null })

    bootstrapRequest = (async () => {
      try {
        const bootstrap = await desktopApi.bootstrap()
        set({ bootstrap, bootError: null, isBootstrapping: false })
      } catch (error) {
        const message = getErrorMessage(error, 'Failed to load the desktop app state.')
        set({ bootError: message, isBootstrapping: false })
        toast.error(message)
      } finally {
        bootstrapRequest = null
      }
    })()

    return bootstrapRequest
  },

  applyDetection(detection) {
    set((state) => {
      if (!state.bootstrap) {
        return state
      }

      return {
        bootstrap: {
          ...state.bootstrap,
          obsDetection: detection,
          settings: {
            ...state.bootstrap.settings,
            obsPath: detection.storedPath,
            setupCompleted: Boolean(detection.storedPath),
          },
        },
      }
    })
  },

  async detectObs() {
    set({ isSetupWorking: true })

    try {
      const detection = await desktopApi.detectObs()
      get().applyDetection(detection)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Automatic detection could not be completed.'))
    } finally {
      set({ isSetupWorking: false })
    }
  },

  async chooseObsDirectory() {
    set({ isSetupWorking: true })

    try {
      const detection = await desktopApi.chooseObsDirectory()
      get().applyDetection(detection)

      if (detection.storedPath) {
        await get().loadApp()
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open the folder chooser.'))
    } finally {
      set({ isSetupWorking: false })
    }
  },

  async saveObsPath(path) {
    set({ isSetupWorking: true })

    try {
      const detection = await desktopApi.saveObsPath(path)
      get().applyDetection(detection)

      if (detection.storedPath) {
        await get().loadApp()
      } else {
        toast.error(detection.message)
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save the OBS folder.'))
    } finally {
      set({ isSetupWorking: false })
    }
  },

  async updateSettings(patch) {
    const currentSettings = get().bootstrap?.settings
    if (!currentSettings) {
      return
    }

    const nextSettings: AppSettings = {
      ...currentSettings,
      ...patch,
    }

    set((state) => ({
      isSettingsWorking: true,
      bootstrap: state.bootstrap
        ? {
            ...state.bootstrap,
            settings: nextSettings,
          }
        : state.bootstrap,
    }))

    try {
      const savedSettings = await desktopApi.saveAppSettings(nextSettings)
      set((state) => ({
        isSettingsWorking: false,
        bootstrap: state.bootstrap
          ? {
              ...state.bootstrap,
              settings: savedSettings,
            }
          : state.bootstrap,
      }))

      if (Object.prototype.hasOwnProperty.call(patch, 'installScope')) {
        const detection = await desktopApi.detectObs()
        get().applyDetection(detection)
      }
    } catch (error) {
      set((state) => ({
        isSettingsWorking: false,
        bootstrap: state.bootstrap
          ? {
              ...state.bootstrap,
              settings: currentSettings,
            }
          : state.bootstrap,
      }))
      toast.error(getErrorMessage(error, 'Could not save these app settings.'))
    }
  },

  async clearCache() {
    set({ isSettingsWorking: true })

    try {
      const response = await desktopApi.clearAppCache()
      set({ isSettingsWorking: false })
      toast.success(response.message)
    } catch (error) {
      set({ isSettingsWorking: false })
      toast.error(getErrorMessage(error, 'Could not clear the app cache.'))
    }
  },

  async exportLogs() {
    set({ isSettingsWorking: true })

    try {
      const response = await desktopApi.exportLogs()
      set({ isSettingsWorking: false })
      toast.success(response.message)

      if (response.path) {
        await desktopApi.revealPath(response.path)
      }
    } catch (error) {
      set({ isSettingsWorking: false })
      toast.error(getErrorMessage(error, 'Could not export diagnostics.'))
    }
  },

  async resetAppData() {
    set({ isSettingsWorking: true })

    try {
      const response = await desktopApi.resetAppState()
      set({
        isSettingsWorking: false,
        searchQuery: '',
        selectedCategory: 'Compatible',
        catalogViewMode: 'list',
        installProgress: null,
        lastInstallResponse: null,
      })
      window.localStorage.setItem(CATALOG_VIEW_MODE_STORAGE_KEY, 'list')
      toast.success(response.message)
      await get().loadApp()
    } catch (error) {
      set({ isSettingsWorking: false })
      toast.error(getErrorMessage(error, 'Could not reset the local app data.'))
    }
  },

  async installPlugin(pluginId, options) {
    set({
      installProgress: {
        pluginId,
        stage: 'downloading',
        progress: 4,
        message: 'Preparing installation',
        detail: 'Starting plugin install workflow.',
      },
      lastInstallResponse: null,
    })

    try {
      const response = await desktopApi.installPlugin({
        pluginId,
        packageId: options?.packageId,
        overwrite: options?.overwrite,
        githubAssetName: options?.githubAssetName,
        githubAssetUrl: options?.githubAssetUrl,
      })

      set({ lastInstallResponse: response })

      if (!response.success) {
        if (response.code === 'MANUAL_ONLY') {
          const plugin = get().bootstrap?.plugins.find((entry) => entry.id === pluginId)
          if (plugin) {
            await get().openExternal(plugin.manualInstallUrl ?? plugin.homepageUrl)
          }
          return response
        }

        if (response.code === 'FILE_CONFLICT' && !options?.overwrite) {
          const preview = response.conflicts?.slice(0, 6).join('\n') ?? ''
          const accepted = window.confirm(
            `${response.message}\n\n${preview}\n\nContinue and overwrite these files?`,
          )

          if (accepted) {
            return get().installPlugin(pluginId, {
              ...options,
              overwrite: true,
            })
          }
        }

        if (response.code === 'REVIEW_REQUIRED') {
          return response
        }

        toast.error(response.message)
        return response
      }

      if (response.manualInstallerPath) {
        toast.success(response.message)
      } else if (response.installedPlugin) {
        toast.success(response.message)
      }

      await get().loadApp()
      return response
    } catch (error) {
      const message = getErrorMessage(error, 'Unexpected plugin install failure.')

      set({
        installProgress: {
          pluginId,
          stage: 'error',
          progress: 100,
          message: 'Installation failed',
          detail: message,
          terminal: true,
        },
      })
      toast.error(message)
      return undefined
    }
  },

  async uninstallPlugin(pluginId) {
    set({ uninstallingPluginId: pluginId })

    try {
      const response = await desktopApi.uninstallPlugin(pluginId)
      set({ uninstallingPluginId: null })
      toast.success(response.message)
      await get().loadApp()
      return response
    } catch (error) {
      set({ uninstallingPluginId: null })
      toast.error(getErrorMessage(error, 'Could not remove the installed plugin.'))
      return undefined
    }
  },

  async adoptInstallation(pluginId) {
    set({ adoptingPluginId: pluginId })

    try {
      await desktopApi.adoptInstallation(pluginId)
      set({ adoptingPluginId: null })
      toast.success('This installation is now managed by OBS Plugin Installer.')
      await get().loadApp()
    } catch (error) {
      set({ adoptingPluginId: null })
      toast.error(getErrorMessage(error, 'Could not adopt that installation.'))
    }
  },

  async openExternal(url) {
    try {
      await desktopApi.openExternal(url)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open the external link.'))
    }
  },

  async revealPath(path) {
    try {
      await desktopApi.revealPath(path)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open that folder in your file manager.'))
    }
  },

  setSearchQuery(query) {
    set({ searchQuery: query })
  },

  setSelectedCategory(category) {
    set({ selectedCategory: category })
  },

  setCatalogViewMode(mode) {
    window.localStorage.setItem(CATALOG_VIEW_MODE_STORAGE_KEY, mode)
    set({ catalogViewMode: mode })
  },

  clearInstallProgress() {
    set({ installProgress: null, lastInstallResponse: null })
  },

  handleInstallProgress(progress) {
    set({ installProgress: progress })
  },
}))
