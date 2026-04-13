import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  fetchCatalog,
  getTotalVram,
  getDevicesForOs,
  PLATFORMS,
  type CatalogModel,
  type DeviceInfo,
  type DeviceCount,
  type Platform,
} from './lib/catalog'
import { groupModels, buildCatalogEntries, buildFamilyEntries, entryHasOs, type ModelGroup, type CatalogEntry, type FamilyEntry } from './lib/group-models'
import { parseUrlState, syncUrlState, type ModelParam } from './lib/url-state'
import {
  createDefaultPlatformDrafts,
  createEmptyPlatformDraft,
  DEFAULT_PLATFORM,
  loadPlatformState,
  savePlatformState,
  type PlatformDraft,
  type PlatformDrafts,
} from './lib/platform-state'
import ModelCatalog from './components/ModelCatalog'
import ConfigPanel from './components/ConfigPanel'
import { DEFAULT_FRAMEWORK, FRAMEWORKS, type AgentFramework } from './lib/frameworks'
import { FrameworkPill } from './components/FrameworkSelector'

function resolveFramework(id: string | null | undefined): AgentFramework {
  return FRAMEWORKS.find((framework) => framework.id === id && framework.available) ?? DEFAULT_FRAMEWORK
}

function sanitizeDraft(
  draft: PlatformDraft,
  models: CatalogModel[],
  devices: DeviceInfo[],
  platform: Platform,
): PlatformDraft {
  const availableModels = models.filter((model) => model.os.includes(platform))
  const modelById = new Map(availableModels.map((model) => [model.id, model]))
  const selectedModelIds: string[] = []
  const selectedTypes = new Set<CatalogModel['type']>()

  for (const id of draft.selectedModelIds) {
    const model = modelById.get(id)
    if (!model || selectedTypes.has(model.type)) continue
    selectedTypes.add(model.type)
    selectedModelIds.push(id)
  }

  const selectedDeviceId = draft.selectedDeviceId && devices.some(
    (device) => device.id === draft.selectedDeviceId && device.os.includes(platform),
  )
    ? draft.selectedDeviceId
    : null

  return {
    selectedModelIds,
    selectedDeviceId,
    deviceCount: Math.min(8, Math.max(1, Math.trunc(draft.deviceCount || 1))) as DeviceCount,
    selectedVramGb: draft.selectedVramGb,
    contextOverride: draft.contextOverride,
    frameworkId: resolveFramework(draft.frameworkId).id,
    engineFilter: draft.engineFilter ?? null,
  }
}

function sanitizeDrafts(
  drafts: PlatformDrafts,
  models: CatalogModel[],
  devices: DeviceInfo[],
): PlatformDrafts {
  return {
    mac: sanitizeDraft(drafts.mac, models, devices, 'mac'),
    linux: sanitizeDraft(drafts.linux, models, devices, 'linux'),
    windows: sanitizeDraft(drafts.windows, models, devices, 'windows'),
  }
}

function findModelForParam(
  models: CatalogModel[],
  platform: Platform,
  type: CatalogModel['type'],
  param: ModelParam | null,
): CatalogModel | null {
  if (!param) return null
  return models.find((model) =>
    model.type === type
    && model.os.includes(platform)
    && model.repo.toLowerCase() === param.repo.toLowerCase()
    && (param.bits == null || model.bits === param.bits),
  ) ?? null
}

type ModelRole = CatalogModel['type']

interface LogicalSelection {
  type: ModelRole
  family: string
  preferredCatalogKey: string
  preferredEntryIndex: number
  preferredSubVariantLabel: string
}

const MODEL_ROLES: ModelRole[] = ['llm', 'image', 'audio']

function buildDraftFromUrl(
  models: CatalogModel[],
  devices: DeviceInfo[],
  platform: Platform,
  urlState: ReturnType<typeof parseUrlState>,
  frameworkId: string,
): PlatformDraft {
  const nextDraft = createEmptyPlatformDraft(resolveFramework(urlState.agent ?? frameworkId).id)

  for (const type of ['llm', 'image', 'audio'] as const) {
    const match = findModelForParam(models, platform, type, urlState[type])
    if (match) nextDraft.selectedModelIds.push(match.id)
  }

  if (urlState.device && devices.some((device) => device.id === urlState.device && device.os.includes(platform))) {
    nextDraft.selectedDeviceId = urlState.device
  }
  if (urlState.deviceCount != null) nextDraft.deviceCount = urlState.deviceCount as DeviceCount
  if (urlState.vram != null) nextDraft.selectedVramGb = urlState.vram
  if (urlState.ctx != null) nextDraft.contextOverride = urlState.ctx

  return sanitizeDraft(nextDraft, models, devices, platform)
}

function App() {
  const [allModels, setAllModels] = useState<CatalogModel[]>([])
  const [allDevices, setAllDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activePlatform, setActivePlatform] = useState<Platform | null>(null)
  const [drafts, setDrafts] = useState<PlatformDrafts>(() => createDefaultPlatformDrafts())

  const hydrated = useRef(false)

  useEffect(() => {
    fetchCatalog()
      .then(({ models, devices }) => {
        setAllModels(models)
        setAllDevices(devices)

        const url = parseUrlState()
        const persisted = loadPlatformState()
        const persistedDrafts = persisted?.drafts ?? createDefaultPlatformDrafts()
        const urlPlatform = url.platform && ['mac', 'linux', 'windows'].includes(url.platform) ? url.platform as Platform : null
        const persistedPlatform = persisted?.activePlatform && ['mac', 'linux', 'windows'].includes(persisted.activePlatform) ? persisted.activePlatform as Platform : null
        const nextPlatform = urlPlatform ?? persistedPlatform ?? null
        const nextDrafts = sanitizeDrafts(persistedDrafts, models, devices)

        if (url.hasState && nextPlatform) {
          nextDrafts[nextPlatform] = buildDraftFromUrl(
            models,
            devices,
            nextPlatform,
            url,
            nextDrafts[nextPlatform].frameworkId,
          )
        }

        setActivePlatform(nextPlatform)
        setDraftPlatform(nextPlatform ?? DEFAULT_PLATFORM)
        setDrafts(nextDrafts)

        hydrated.current = true
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  // draftPlatform is always set — used as draft key even when activePlatform is null (show all)
  const [draftPlatform, setDraftPlatform] = useState<Platform>(DEFAULT_PLATFORM)
  const activeDraft = drafts[draftPlatform]

  const selectedModelIds = useMemo(
    () => new Set(activeDraft.selectedModelIds),
    [activeDraft.selectedModelIds],
  )

  const modelById = useMemo(
    () => new Map(allModels.map((model) => [model.id, model])),
    [allModels],
  )

  const framework = useMemo(
    () => resolveFramework(activeDraft.frameworkId),
    [activeDraft.frameworkId],
  )

  const selectedDevice = useMemo(() => {
    if (!activeDraft.selectedDeviceId) return null
    return allDevices.find((device) =>
      device.id === activeDraft.selectedDeviceId && device.os.includes(draftPlatform),
    ) ?? null
  }, [activeDraft.selectedDeviceId, allDevices, draftPlatform])

  const selectedModels = useMemo(
    () => allModels.filter((model) => selectedModelIds.has(model.id)),
    [allModels, selectedModelIds],
  )

  const filteredDevices = useMemo(
    () => getDevicesForOs(activePlatform, allDevices),
    [activePlatform, allDevices],
  )

  const allGroups = useMemo(() => groupModels(allModels), [allModels])
  const allEntries = useMemo(() => buildCatalogEntries(allGroups), [allGroups])
  const allFamilyEntries = useMemo(() => buildFamilyEntries(allEntries), [allEntries])

  const modelIdToGroup = useMemo(() => {
    const map = new Map<string, ModelGroup>()
    for (const group of allGroups) {
      for (const variant of group.variants) {
        map.set(variant.model.id, group)
      }
    }
    return map
  }, [allGroups])

  const modelIdToEntry = useMemo(() => {
    const map = new Map<string, CatalogEntry>()
    for (const entry of allEntries) {
      for (const group of entry.groups) {
        for (const variant of group.variants) {
          map.set(variant.model.id, entry)
        }
      }
    }
    return map
  }, [allEntries])

  const modelIdToFamilyEntry = useMemo(() => {
    const map = new Map<string, FamilyEntry>()
    for (const familyEntry of allFamilyEntries) {
      for (const entry of familyEntry.entries) {
        for (const group of entry.groups) {
          for (const variant of group.variants) {
            map.set(variant.model.id, familyEntry)
          }
        }
      }
    }
    return map
  }, [allFamilyEntries])

  const getDraftModelForRole = useCallback((draft: PlatformDraft, role: ModelRole): CatalogModel | null => {
    for (const id of draft.selectedModelIds) {
      const model = modelById.get(id)
      if (model?.type === role) return model
    }
    return null
  }, [modelById])

  const getSubVariantLabelForModel = useCallback((modelId: string): string => {
    const entry = modelIdToEntry.get(modelId)
    if (!entry) return ''
    const subVariant = entry.subVariants.find((candidate) =>
      candidate.groups.some((group) =>
        group.variants.some((variant) => variant.model.id === modelId),
      ),
    )
    return subVariant?.label ?? ''
  }, [modelIdToEntry])

  const buildLogicalSelection = useCallback((model: CatalogModel): LogicalSelection | null => {
    const entry = modelIdToEntry.get(model.id)
    const familyEntry = modelIdToFamilyEntry.get(model.id)
    if (!entry || !familyEntry) return null

    return {
      type: model.type,
      family: familyEntry.family,
      preferredCatalogKey: entry.catalogKey,
      preferredEntryIndex: Math.max(0, familyEntry.entries.findIndex((candidate) => candidate.catalogKey === entry.catalogKey)),
      preferredSubVariantLabel: getSubVariantLabelForModel(model.id),
    }
  }, [getSubVariantLabelForModel, modelIdToEntry, modelIdToFamilyEntry])

  const setDraftRoleModel = useCallback((draft: PlatformDraft, role: ModelRole, modelId: string | null): PlatformDraft => {
    const nextIds = draft.selectedModelIds.filter((id) => modelById.get(id)?.type !== role)
    if (modelId) nextIds.push(modelId)
    return {
      ...draft,
      selectedModelIds: nextIds,
    }
  }, [modelById])

  const resolveEquivalentModel = useCallback((
    selection: LogicalSelection,
    platform: Platform,
    existingModelId: string | null,
  ): CatalogModel | null => {
    const familyEntry = allFamilyEntries.find((entry) => entry.family === selection.family && entry.type === selection.type)
    if (!familyEntry) return null

    const availableEntries = familyEntry.entries.filter((entry) => entryHasOs(entry, platform))
    if (availableEntries.length === 0) return null

    const desiredEntry = availableEntries.find((entry) => entry.catalogKey === selection.preferredCatalogKey)
      ?? availableEntries.reduce((best, candidate) => {
        const bestIndex = familyEntry.entries.findIndex((entry) => entry.catalogKey === best.catalogKey)
        const candidateIndex = familyEntry.entries.findIndex((entry) => entry.catalogKey === candidate.catalogKey)
        return Math.abs(candidateIndex - selection.preferredEntryIndex) < Math.abs(bestIndex - selection.preferredEntryIndex)
          ? candidate
          : best
      }, availableEntries[0])

    const availableSubVariants = desiredEntry.subVariants.filter((subVariant) =>
      subVariant.groups.some((group) => group.variants.some((variant) => variant.os.includes(platform))),
    )
    if (availableSubVariants.length === 0) return null

    const desiredSubVariant = availableSubVariants.find((subVariant) => subVariant.label === selection.preferredSubVariantLabel)
      ?? availableSubVariants[0]

    if (existingModelId) {
      const existingModel = modelById.get(existingModelId)
      if (existingModel?.os.includes(platform)) {
        const existingEntry = modelIdToEntry.get(existingModel.id)
        if (existingEntry?.catalogKey === desiredEntry.catalogKey && getSubVariantLabelForModel(existingModel.id) === desiredSubVariant.label) {
          return existingModel
        }
      }
    }

    const group = desiredSubVariant.groups.find((candidate) =>
      candidate.variants.some((variant) => variant.os.includes(platform)),
    )
    return group ? group.variants.find((variant) => variant.os.includes(platform))?.model ?? null : null
  }, [allFamilyEntries, getSubVariantLabelForModel, modelById, modelIdToEntry])

  const syncDraftsFromSource = useCallback((draftsToSync: PlatformDrafts, sourceDraft: PlatformDraft): PlatformDrafts => {
    let nextDrafts: PlatformDrafts = { ...draftsToSync }

    for (const role of MODEL_ROLES) {
      const sourceModel = getDraftModelForRole(sourceDraft, role)
      if (!sourceModel) {
        for (const platform of PLATFORMS) {
          nextDrafts = {
            ...nextDrafts,
            [platform]: setDraftRoleModel(nextDrafts[platform], role, null),
          }
        }
        continue
      }

      const logicalSelection = buildLogicalSelection(sourceModel)
      if (!logicalSelection) continue

      for (const platform of PLATFORMS) {
        const existingModel = getDraftModelForRole(nextDrafts[platform], role)
        const resolvedModel = resolveEquivalentModel(logicalSelection, platform, existingModel?.id ?? null)
        nextDrafts = {
          ...nextDrafts,
          [platform]: setDraftRoleModel(nextDrafts[platform], role, resolvedModel?.id ?? null),
        }
      }
    }

    return sanitizeDrafts(nextDrafts, allModels, allDevices)
  }, [allDevices, allModels, buildLogicalSelection, getDraftModelForRole, resolveEquivalentModel, setDraftRoleModel])

  const contextOverride = activeDraft.contextOverride
  const selectedVramGb = activeDraft.selectedVramGb
  const deviceCount = activeDraft.deviceCount as DeviceCount
  const totalVramMb = useMemo(
    () => getTotalVram(selectedModels, contextOverride),
    [selectedModels, contextOverride],
  )

  const updateActiveDraft = useCallback((updater: (draft: PlatformDraft) => PlatformDraft) => {
    setDrafts((previousDrafts) => ({
      ...previousDrafts,
      [draftPlatform]: sanitizeDraft(
        updater(previousDrafts[draftPlatform]),
        allModels,
        allDevices,
        draftPlatform,
      ),
    }))
  }, [draftPlatform, allDevices, allModels])

  const updateGlobalSelectionFromActiveDraft = useCallback((updater: (draft: PlatformDraft) => PlatformDraft) => {
    setDrafts((previousDrafts) => {
      const nextActiveDraft = sanitizeDraft(
        updater(previousDrafts[draftPlatform]),
        allModels,
        allDevices,
        draftPlatform,
      )

      return syncDraftsFromSource(
        {
          ...previousDrafts,
          [draftPlatform]: nextActiveDraft,
        },
        nextActiveDraft,
      )
    })
  }, [draftPlatform, allDevices, allModels, syncDraftsFromSource])

  useEffect(() => {
    if (!hydrated.current) return
    savePlatformState({
      version: 1,
      activePlatform,
      drafts,
    })
  }, [activePlatform, drafts])

  useEffect(() => {
    if (!hydrated.current) return

    function toModelParam(model: CatalogModel | undefined): ModelParam | null {
      if (!model) return null
      return { repo: model.repo, bits: model.bits ?? null }
    }

    syncUrlState({
      platform: activePlatform,
      llm: toModelParam(selectedModels.find((model) => model.type === 'llm')),
      image: toModelParam(selectedModels.find((model) => model.type === 'image')),
      audio: toModelParam(selectedModels.find((model) => model.type === 'audio')),
      device: selectedDevice?.id ?? null,
      deviceCount: deviceCount > 1 ? deviceCount : null,
      vram: selectedVramGb,
      ctx: contextOverride,
      agent: framework.id,
      hasState: true,
    })
  }, [activePlatform, selectedModels, selectedDevice, deviceCount, selectedVramGb, contextOverride, framework])

  const toggleModel = useCallback((model: CatalogModel) => {
    updateGlobalSelectionFromActiveDraft((draft) => {
      const nextIds = new Set(draft.selectedModelIds)
      if (nextIds.has(model.id)) {
        nextIds.delete(model.id)
      } else {
        for (const existingModel of allModels) {
          if (existingModel.type === model.type) nextIds.delete(existingModel.id)
        }
        nextIds.add(model.id)
      }

      return {
        ...draft,
        selectedModelIds: Array.from(nextIds),
        contextOverride: model.type === 'llm' ? null : draft.contextOverride,
      }
    })
  }, [allModels, updateGlobalSelectionFromActiveDraft])

  const swapModelVariant = useCallback((oldModel: CatalogModel, newModel: CatalogModel) => {
    const oldLogical = buildLogicalSelection(oldModel)
    const newLogical = buildLogicalSelection(newModel)
    const isSameLogicalSelection = oldLogical && newLogical
      && oldLogical.family === newLogical.family
      && oldLogical.preferredCatalogKey === newLogical.preferredCatalogKey
      && oldLogical.preferredSubVariantLabel === newLogical.preferredSubVariantLabel

    // Cross-engine swaps (e.g. GGUF→MLX when clicking macOS tab) should be local-only
    // to avoid the global sync clearing selections on other platforms
    const isCrossEngine = oldModel.engineCategory !== newModel.engineCategory

    const updater = (draft: PlatformDraft) => ({
      ...draft,
      selectedModelIds: draft.selectedModelIds
        .filter((id) => id !== oldModel.id)
        .concat(newModel.id),
    })

    if (isCrossEngine) {
      // Cross-engine swap (e.g. GGUF→MLX via tab/engine switch): update draft directly
      // without sanitizing by platform, since the new model may be on a different OS.
      setDrafts((prev) => ({
        ...prev,
        [draftPlatform]: updater(prev[draftPlatform]),
      }))
    } else if (isSameLogicalSelection) {
      updateActiveDraft(updater)
    } else {
      updateGlobalSelectionFromActiveDraft(updater)
    }
  }, [buildLogicalSelection, updateActiveDraft, updateGlobalSelectionFromActiveDraft, draftPlatform])

  const handleDeviceSelect = useCallback((device: DeviceInfo) => {
    updateActiveDraft((draft) => ({
      ...draft,
      selectedDeviceId: draft.selectedDeviceId === device.id ? null : device.id,
      deviceCount: draft.selectedDeviceId === device.id ? 1 : draft.deviceCount,
      selectedVramGb: null,
    }))
  }, [updateActiveDraft])

  const handleDeviceCountChange = useCallback((count: DeviceCount) => {
    updateActiveDraft((draft) => ({
      ...draft,
      deviceCount: count,
    }))
  }, [updateActiveDraft])

  const handleVramPreset = useCallback((gb: number) => {
    updateActiveDraft((draft) => ({
      ...draft,
      selectedVramGb: draft.selectedVramGb === gb ? null : gb,
      selectedDeviceId: null,
      deviceCount: 1,
    }))
  }, [updateActiveDraft])

  const handlePlatformChange = useCallback((platform: Platform | null) => {
    setActivePlatform(platform)
    if (platform) setDraftPlatform(platform)
  }, [])

  const handleClearAll = useCallback(() => {
    setActivePlatform(null)
    updateActiveDraft((draft) => ({
      ...createEmptyPlatformDraft(draft.frameworkId),
      frameworkId: draft.frameworkId,
    }))
  }, [updateActiveDraft])

  const handleFrameworkSelect = useCallback((nextFramework: AgentFramework) => {
    updateActiveDraft((draft) => ({
      ...draft,
      frameworkId: nextFramework.id,
    }))
  }, [updateActiveDraft])

  const handleContextChange = useCallback((ctx: number | null) => {
    updateActiveDraft((draft) => ({
      ...draft,
      contextOverride: ctx,
    }))
  }, [updateActiveDraft])

  const effectiveVramGb = selectedVramGb ?? (selectedDevice ? (selectedDevice.vramMb * deviceCount) / 1024 : 0)
  const effectiveVramMb = effectiveVramGb * 1024
  const remainingVramMb = effectiveVramMb > 0 ? effectiveVramMb - totalVramMb : 0

  const hasSelections = selectedModels.length > 0 || selectedDevice !== null || deviceCount > 1 || selectedVramGb !== null

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-2 font-mono text-sm tracking-wider text-destructive">error</div>
          <p className="text-sm text-foreground/40">{error}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="animate-pulse-subtle font-mono text-xs tracking-wider text-foreground/20">loading registry</p>
        </div>
      </div>
    )
  }

  return (
    <div className="noise-bg flex min-h-screen w-screen flex-col bg-background lg:h-screen lg:flex-row lg:overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-foreground/[0.06] px-4 py-2 lg:hidden">
        <a
          href="https://github.com/runpod-labs/a2go"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <img
            src={`${import.meta.env.BASE_URL}a2go_logo_nobg.png`}
            alt="agent2go"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="font-mono text-[11px] font-bold tracking-tight text-foreground/70">
            agent2go
          </span>
        </a>
        <FrameworkPill selected={framework} onSelect={handleFrameworkSelect} />
      </div>

      <ModelCatalog
        familyEntries={allFamilyEntries}
        platform={activePlatform}
        onPlatformChange={handlePlatformChange}
        selectedModelIds={selectedModelIds}
        selectedModels={selectedModels}
        onToggleModel={toggleModel}
        remainingVramMb={remainingVramMb}
        effectiveVramMb={effectiveVramMb}
        onClearAll={handleClearAll}
        hasSelections={hasSelections}
        framework={framework}
        onFrameworkSelect={handleFrameworkSelect}
      />
      <ConfigPanel
        selectedModels={selectedModels}
        selectedVramGb={selectedVramGb}
        selectedDevice={selectedDevice}
        devices={filteredDevices}
        deviceCount={deviceCount}
        onDeviceCountChange={handleDeviceCountChange}
        onDeviceSelect={handleDeviceSelect}
        onVramPreset={handleVramPreset}
        onToggleModel={toggleModel}
        onClearAll={handleClearAll}
        modelIdToGroup={modelIdToGroup}
        modelIdToEntry={modelIdToEntry}
        modelIdToFamilyEntry={modelIdToFamilyEntry}
        platform={activePlatform}
        hasSelections={hasSelections}
        contextOverride={contextOverride}
        onContextChange={handleContextChange}
        swapModelVariant={swapModelVariant}
        framework={framework}
      />
    </div>
  )
}

export default App
