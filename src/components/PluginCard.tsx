import { ArrowDownToLine, ArrowUpCircle, ShieldCheck } from 'lucide-react'

import { PluginGlyph } from '../lib/pluginVisuals'
import {
  cn,
  formatSupportedPlatforms,
  getCatalogPluginState,
  getPluginCompatibility,
  getRecommendedPackage,
  hasGitHubReleaseSource,
  isScriptPlugin,
} from '../lib/utils'
import type { InstalledPluginRecord } from '../types/desktop'
import type { PluginCatalogEntry } from '../types/plugin'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'

type CatalogViewMode = 'list' | 'grid'

interface PluginCardProps {
  plugin: PluginCatalogEntry
  currentPlatform: string
  installedPlugin?: InstalledPluginRecord
  viewMode: CatalogViewMode
  onSelect: (pluginId: string) => void
  onInstall: (
    pluginId: string,
    options?: { overwrite?: boolean; packageId?: string | null },
  ) => void
}

function ActionControl({
  compatibilityLabel,
  isInstalledExternal,
  isInstalledManaged,
  isUnavailable,
  isUpdateAvailable,
  onInstall,
  viewMode,
}: {
  compatibilityLabel: string
  isInstalledExternal: boolean
  isInstalledManaged: boolean
  isUnavailable: boolean
  isUpdateAvailable: boolean
  onInstall: () => void
  viewMode: CatalogViewMode
}) {
  if (isInstalledManaged) {
    return (
      <Badge
        className={cn(
          'justify-center',
          viewMode === 'grid' ? 'w-full px-3 py-2 text-[12px]' : 'px-3 py-2 text-[12px]',
        )}
        tone="success"
      >
        Installed
      </Badge>
    )
  }

  if (isInstalledExternal) {
    return (
      <Badge
        className={cn(
          'justify-center',
          viewMode === 'grid' ? 'w-full px-3 py-2 text-[12px]' : 'px-3 py-2 text-[12px]',
        )}
        tone="warning"
      >
        Installed externally
      </Badge>
    )
  }

  if (isUnavailable) {
    return (
      <span
        className={cn(
          'rounded-lg border border-white/10 px-3 py-2 text-center text-[12px] text-slate-500',
          viewMode === 'grid' ? 'block w-full' : 'inline-flex items-center justify-center',
        )}
      >
        {compatibilityLabel}
      </span>
    )
  }

  return (
    <Button
      className={viewMode === 'grid' ? 'w-full justify-center' : undefined}
      size="sm"
      variant={isUpdateAvailable ? 'primary' : 'action'}
      onClick={onInstall}
    >
      {isUpdateAvailable ? (
        <>
          <ArrowUpCircle className="size-4" />
          Update
        </>
      ) : (
        <>
          <ArrowDownToLine className="size-4" />
          Install
        </>
      )}
    </Button>
  )
}

export function PluginCard({
  currentPlatform,
  installedPlugin,
  onInstall,
  onSelect,
  plugin,
  viewMode,
}: PluginCardProps) {
  const pluginState = getCatalogPluginState(plugin, installedPlugin)
  const compatibility = getPluginCompatibility(plugin, currentPlatform)
  const recommendedPackage = getRecommendedPackage(plugin, currentPlatform)
  const isScriptEntry = isScriptPlugin(plugin, installedPlugin)
  const isUnavailable = !compatibility.canInstall
  const isInstalledManaged = pluginState === 'installed'
  const isInstalledExternal = pluginState === 'installed-externally'
  const isUpdateAvailable = pluginState === 'update-available'
  const isAttachPending =
    installedPlugin?.status === 'manual-step' && installedPlugin.sourceType === 'script'

  const metaLine = `${plugin.author} • ${plugin.category} • v${plugin.version}`

  const handleInstall = () =>
    onInstall(plugin.id, {
      overwrite: Boolean(installedPlugin),
      packageId: hasGitHubReleaseSource(plugin)
        ? null
        : recommendedPackage?.id ?? null,
    })

  if (viewMode === 'grid') {
    return (
      <article
        className={cn(
          'flex h-full min-h-[248px] cursor-pointer flex-col rounded-xl border bg-white/[0.04] p-4 transition-colors',
          isUnavailable
            ? 'border-white/10 opacity-70'
            : 'border-white/10 hover:border-primary/30 hover:bg-white/[0.06]',
        )}
        onClick={() => onSelect(plugin.id)}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-primary/12 text-primary">
            {plugin.iconUrl ? (
              <img
                alt={`${plugin.name} icon`}
                className="size-full rounded-lg object-cover"
                loading="lazy"
                src={plugin.iconUrl}
              />
            ) : (
              <PluginGlyph className="size-5" iconKey={plugin.iconKey} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[16px] font-semibold text-white">{plugin.name}</h3>
            <p className="mt-1 truncate text-[12px] text-slate-500">{metaLine}</p>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-[13px] leading-6 text-slate-300">
          {plugin.description}
        </p>

        <div className="mt-3 flex min-h-[56px] flex-wrap content-start gap-2">
          {plugin.verified ? (
            <Badge tone="primary">
              <ShieldCheck className="size-3.5" />
              Verified
            </Badge>
          ) : null}
          {isScriptEntry ? <Badge tone="warning">Script Plugin</Badge> : null}
          {isAttachPending ? <Badge tone="warning">Needs OBS attach</Badge> : null}
          {isInstalledManaged ? <Badge tone="success">Installed</Badge> : null}
          {isInstalledExternal ? <Badge tone="warning">Installed externally</Badge> : null}
          {isUpdateAvailable ? <Badge tone="warning">Update available</Badge> : null}
          {isUnavailable ? <Badge tone="danger">Unsupported</Badge> : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <span className="truncate text-[12px] text-slate-500">
            {formatSupportedPlatforms(plugin.supportedPlatforms)}
          </span>
          <div className="w-[132px] shrink-0">
            <ActionControl
              compatibilityLabel={compatibility.disabledActionLabel || 'Unsupported'}
              isInstalledExternal={isInstalledExternal}
              isInstalledManaged={isInstalledManaged}
              isUnavailable={isUnavailable}
              isUpdateAvailable={isUpdateAvailable}
              onInstall={handleInstall}
              viewMode="grid"
            />
          </div>
        </div>
      </article>
    )
  }

  return (
    <article
      className={cn(
        'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-4 py-3 transition-colors',
        isUnavailable
          ? 'border-white/10 bg-white/[0.02] opacity-70'
          : 'border-white/10 bg-white/[0.04] hover:border-primary/30 hover:bg-white/[0.06]',
      )}
      onClick={() => onSelect(plugin.id)}
    >
      <div className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-primary/12 text-primary">
        {plugin.iconUrl ? (
          <img
            alt={`${plugin.name} icon`}
            className="size-full rounded-lg object-cover"
            loading="lazy"
            src={plugin.iconUrl}
          />
        ) : (
          <PluginGlyph className="size-5" iconKey={plugin.iconKey} />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[18px] font-semibold text-white">{plugin.name}</h3>
          {plugin.verified ? (
            <Badge tone="primary">
              <ShieldCheck className="size-3.5" />
              Verified
            </Badge>
          ) : null}
          {isScriptEntry ? <Badge tone="warning">Script Plugin</Badge> : null}
          {isAttachPending ? <Badge tone="warning">Needs OBS attach</Badge> : null}
          {isInstalledManaged ? <Badge tone="success">Installed (managed)</Badge> : null}
          {isInstalledExternal ? <Badge tone="warning">Installed externally</Badge> : null}
          {isUpdateAvailable ? <Badge tone="warning">Update available</Badge> : null}
          {isUnavailable ? (
            <Badge tone="danger">{compatibility.disabledActionLabel}</Badge>
          ) : null}
        </div>

        <p className="mt-1 text-[14px] text-slate-300">{plugin.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
          <span>{plugin.author}</span>
          <span>•</span>
          <span>{plugin.category}</span>
          <span>•</span>
          <span>v{plugin.version}</span>
          <span>•</span>
          <span>{formatSupportedPlatforms(plugin.supportedPlatforms)}</span>
        </div>
      </div>

      <div className="flex min-w-[168px] justify-end">
        <ActionControl
          compatibilityLabel={compatibility.disabledActionLabel || 'Unsupported'}
          isInstalledExternal={isInstalledExternal}
          isInstalledManaged={isInstalledManaged}
          isUnavailable={isUnavailable}
          isUpdateAvailable={isUpdateAvailable}
          onInstall={handleInstall}
          viewMode="list"
        />
      </div>
    </article>
  )
}
