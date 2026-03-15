import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react'
import { Toaster } from 'sonner'

import { SetupWizard } from './components/SetupWizard'
import { AppShell } from './components/layout/AppShell'
import { Button } from './components/ui/Button'
import { desktopApi } from './lib/tauri'
import { DiscoverPage } from './pages/DiscoverPage'
import { InstalledPage } from './pages/InstalledPage'
import { PluginDetailsPage } from './pages/PluginDetailsPage'
import { SettingsPage } from './pages/SettingsPage'
import { UpdatesPage } from './pages/UpdatesPage'
import { useAppStore } from './stores/appStore'
import type { AccentColor, ThemeMode } from './types/desktop'

const accentColorMap: Record<AccentColor, string> = {
  purple: '78 121 255',
  blue: '78 121 255',
  emerald: '78 121 255',
  amber: '78 121 255',
  rose: '78 121 255',
  slate: '78 121 255',
}

function toHtmlLang(label: string) {
  switch (label) {
    case 'Deutsch':
      return 'de'
    case 'Español':
      return 'es'
    case 'Français':
      return 'fr'
    case '日本語':
      return 'ja'
    default:
      return 'en'
  }
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background-dark">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-4 shadow-panel">
        <div className="flex items-center gap-3 text-slate-300">
          <LoaderCircle className="size-5 animate-spin text-primary" />
          Loading OBS Plugin Installer…
        </div>
      </div>
    </div>
  )
}

function StartupErrorScreen({
  error,
  isRetrying,
  onRetry,
}: {
  error: string
  isRetrying: boolean
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background-dark px-4">
      <div className="w-full max-w-2xl rounded-xl border border-rose-400/20 bg-white/[0.03] p-6 shadow-panel">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-rose-500/10 p-3 text-rose-300">
            <AlertTriangle className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold tracking-tight text-white">
              OBS Plugin Installer could not finish loading
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              The backend returned this error during the initial bootstrap step.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-rose-100">
              {error}
            </pre>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button disabled={isRetrying} onClick={onRetry}>
                {isRetrying ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Retry startup
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const bootstrap = useAppStore((state) => state.bootstrap)
  const bootError = useAppStore((state) => state.bootError)
  const isBootstrapping = useAppStore((state) => state.isBootstrapping)
  const isSetupWorking = useAppStore((state) => state.isSetupWorking)
  const loadApp = useAppStore((state) => state.loadApp)
  const detectObs = useAppStore((state) => state.detectObs)
  const chooseObsDirectory = useAppStore((state) => state.chooseObsDirectory)
  const saveObsPath = useAppStore((state) => state.saveObsPath)
  const handleInstallProgress = useAppStore((state) => state.handleInstallProgress)
  const [systemPrefersLight, setSystemPrefersLight] = useState(() =>
    window.matchMedia('(prefers-color-scheme: light)').matches,
  )

  const themePreference: ThemeMode = bootstrap?.settings.theme ?? 'dark'
  const effectiveTheme =
    themePreference === 'system'
      ? systemPrefersLight
        ? 'light'
        : 'dark'
      : themePreference
  const toasterTheme = effectiveTheme === 'light' ? 'light' : 'dark'

  useEffect(() => {
    void loadApp()

    let unlisten: (() => void) | undefined
    let disposed = false

    void desktopApi.onInstallProgress((progress) => {
      handleInstallProgress(progress)
    }).then((cleanup) => {
      if (disposed) {
        cleanup()
        return
      }
      unlisten = cleanup
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [handleInstallProgress, loadApp])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystemPrefersLight(mediaQuery.matches)

    onChange()

    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const accentColor = bootstrap?.settings.accentColor ?? 'purple'
    const language = bootstrap?.settings.language ?? 'English (US)'

    document.documentElement.dataset.theme = effectiveTheme
    document.documentElement.dataset.accent = accentColor
    document.documentElement.lang = toHtmlLang(language)
    document.documentElement.classList.toggle('dark', effectiveTheme !== 'light')
    document.documentElement.style.setProperty(
      '--accent-rgb',
      accentColorMap[accentColor],
    )
  }, [bootstrap?.settings.accentColor, bootstrap?.settings.language, effectiveTheme])

  if (isBootstrapping) {
    return (
      <>
        <LoadingScreen />
        <Toaster position="top-right" richColors theme={toasterTheme} />
      </>
    )
  }

  if (!bootstrap && bootError) {
    return (
      <>
        <StartupErrorScreen
          error={bootError}
          isRetrying={isBootstrapping}
          onRetry={() => {
            void loadApp()
          }}
        />
        <Toaster position="top-right" richColors theme={toasterTheme} />
      </>
    )
  }

  if (!bootstrap) {
    return (
      <>
        <LoadingScreen />
        <Toaster position="top-right" richColors theme={toasterTheme} />
      </>
    )
  }

  const needsSetup =
    !bootstrap.settings.setupCompleted || !bootstrap.settings.obsPath

  return (
    <>
      {needsSetup ? (
        <SetupWizard
          detection={bootstrap.obsDetection}
          isBusy={isSetupWorking}
          onAcceptDetectedPath={saveObsPath}
          onChooseDirectory={chooseObsDirectory}
          onDetectAgain={detectObs}
        />
      ) : (
        <HashRouter>
          <Routes>
            <Route element={<AppShell />} path="/">
              <Route element={<DiscoverPage />} index />
              <Route element={<InstalledPage />} path="installed" />
              <Route element={<UpdatesPage />} path="updates" />
              <Route element={<SettingsPage />} path="settings" />
              <Route element={<PluginDetailsPage />} path="plugin/:pluginId" />
            </Route>
          </Routes>
        </HashRouter>
      )}
      <Toaster position="top-right" richColors theme={toasterTheme} />
    </>
  )
}

export default App
