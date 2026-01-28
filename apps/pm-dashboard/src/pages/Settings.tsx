import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPreset, deletePreset, fetchPresets, updatePreset } from '@/api/client';
import type { PresetConfig, PresetDto } from '@/api/types';
import type { AsyncState } from '@/stores/types';
import { errorState, idleState, loadingState, successState } from '@/stores/types';

type PresetDraft = {
  name: string;
  description: string;
  isDefault: boolean;
  configText: string;
  error?: string | null;
};

type AgentSettings = {
  maxConcurrent: number;
  autoAssign: boolean;
  fallbackModel: string;
};

type ProjectSettings = {
  repoUrl: string;
  defaultBranch: string;
  reviewerGroup: string;
};

const DEFAULT_CONFIG: PresetConfig = {
  stages: ['CONTEXT_PACK', 'SPEC', 'IMPLEMENT', 'PR_REVIEW', 'TESTING'],
  models: {
    default: 'gpt-4o',
  },
};

export function Settings() {
  const [presetsState, setPresetsState] = useState<AsyncState<PresetDto[]>>(idleState);
  const [drafts, setDrafts] = useState<Record<string, PresetDraft>>({});
  const [newPreset, setNewPreset] = useState<PresetDraft>({
    name: '',
    description: '',
    isDefault: false,
    configText: JSON.stringify(DEFAULT_CONFIG, null, 2),
    error: null,
  });
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({
    maxConcurrent: 6,
    autoAssign: true,
    fallbackModel: 'gpt-4o',
  });
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    repoUrl: 'https://github.com/example/falcon-ai',
    defaultBranch: 'main',
    reviewerGroup: 'core-reviewers',
  });

  const loadPresets = useCallback(async () => {
    setPresetsState(loadingState);
    try {
      const presets = await fetchPresets();
      setPresetsState(successState(presets));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load presets';
      setPresetsState(errorState(message));
    }
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  useEffect(() => {
    if (presetsState.status !== 'success') {
      return;
    }
    setDrafts((prev: Record<string, PresetDraft>) => {
      const next: Record<string, PresetDraft> = { ...prev };
      presetsState.data.forEach((preset: PresetDto) => {
        if (!next[preset.id]) {
          next[preset.id] = {
            name: preset.name,
            description: preset.description ?? '',
            isDefault: preset.isDefault ?? false,
            configText: JSON.stringify(preset.config, null, 2),
            error: null,
          };
        }
      });
      Object.keys(next).forEach((key) => {
        if (!presetsState.data.some((preset: PresetDto) => preset.id === key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [presetsState]);

  const presets = useMemo(() => (presetsState.status === 'success' ? presetsState.data : []), [presetsState]);

  const parseConfig = (text: string): PresetConfig | null => {
    try {
      return JSON.parse(text) as PresetConfig;
    } catch {
      return null;
    }
  };

  const handlePresetChange = (id: string, updates: Partial<PresetDraft>) => {
    setDrafts((prev: Record<string, PresetDraft>) => ({
      ...prev,
      [id]: { ...prev[id], ...updates },
    }));
  };

  const handleUpdatePreset = async (id: string) => {
    const draft = drafts[id];
    if (!draft) {
      return;
    }
    const config = parseConfig(draft.configText);
    if (!config) {
      handlePresetChange(id, { error: 'Config must be valid JSON' });
      return;
    }
    handlePresetChange(id, { error: null });
    try {
      const updated = await updatePreset(id, {
        name: draft.name,
        description: draft.description.trim() ? draft.description.trim() : null,
        config,
        isDefault: draft.isDefault,
      });
      setPresetsState((state: AsyncState<PresetDto[]>) => {
        if (state.status !== 'success') {
          return state;
        }
        return successState(state.data.map((preset) => (preset.id === id ? updated : preset)));
      });
    } catch (error) {
      handlePresetChange(id, { error: error instanceof Error ? error.message : 'Unable to update preset' });
    }
  };

  const handleCreatePreset = async () => {
    const config = parseConfig(newPreset.configText);
    if (!config) {
      setNewPreset((prev: PresetDraft) => ({ ...prev, error: 'Config must be valid JSON' }));
      return;
    }
    if (!newPreset.name.trim()) {
      setNewPreset((prev: PresetDraft) => ({ ...prev, error: 'Name is required' }));
      return;
    }
    setNewPreset((prev: PresetDraft) => ({ ...prev, error: null }));
    try {
      const created = await createPreset({
        name: newPreset.name.trim(),
        description: newPreset.description.trim() ? newPreset.description.trim() : null,
        config,
        isDefault: newPreset.isDefault,
      });
      setPresetsState((state: AsyncState<PresetDto[]>) =>
        state.status === 'success' ? successState([...state.data, created]) : successState([created]),
      );
      setNewPreset({
        name: '',
        description: '',
        isDefault: false,
        configText: JSON.stringify(DEFAULT_CONFIG, null, 2),
        error: null,
      });
    } catch (error) {
      setNewPreset((prev: PresetDraft) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unable to create preset',
      }));
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deletePreset(id);
      setPresetsState((state: AsyncState<PresetDto[]>) => {
        if (state.status !== 'success') {
          return state;
        }
        return successState(state.data.filter((preset) => preset.id !== id));
      });
    } catch (error) {
      handlePresetChange(id, { error: error instanceof Error ? error.message : 'Unable to delete preset' });
    }
  };

  const handleSaveSettings = () => {
    setSettingsNotice('Settings saved locally for this session.');
    window.setTimeout(() => setSettingsNotice(null), 2000);
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-steel">Settings</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">Operational Controls</h2>
      </div>

      {settingsNotice && (
        <div className="rounded-2xl border border-[rgba(31,111,100,0.3)] bg-[rgba(31,111,100,0.08)] px-5 py-3 text-sm text-[var(--teal)]">
          {settingsNotice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface rounded-3xl p-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-steel">Agents</h3>
          <div className="mt-4 space-y-4 text-sm">
            <label className="flex flex-col gap-2">
              Max concurrent agents
              <input
                className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                type="number"
                value={agentSettings.maxConcurrent}
                onChange={(event) =>
                  setAgentSettings((prev: AgentSettings) => ({
                    ...prev,
                    maxConcurrent: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={agentSettings.autoAssign}
                onChange={(event) =>
                  setAgentSettings((prev: AgentSettings) => ({ ...prev, autoAssign: event.target.checked }))
                }
              />
              Auto-assign agents to new issues
            </label>
            <label className="flex flex-col gap-2">
              Fallback model
              <input
                className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                value={agentSettings.fallbackModel}
                onChange={(event) =>
                  setAgentSettings((prev: AgentSettings) => ({ ...prev, fallbackModel: event.target.value }))
                }
              />
            </label>
          </div>
        </div>

        <div className="surface rounded-3xl p-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-steel">Project Config</h3>
          <div className="mt-4 space-y-4 text-sm">
            <label className="flex flex-col gap-2">
              Repository URL
              <input
                className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                value={projectSettings.repoUrl}
                onChange={(event) =>
                  setProjectSettings((prev: ProjectSettings) => ({ ...prev, repoUrl: event.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-2">
              Default branch
              <input
                className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                value={projectSettings.defaultBranch}
                onChange={(event) =>
                  setProjectSettings((prev: ProjectSettings) => ({
                    ...prev,
                    defaultBranch: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-2">
              Reviewer group
              <input
                className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                value={projectSettings.reviewerGroup}
                onChange={(event) =>
                  setProjectSettings((prev: ProjectSettings) => ({
                    ...prev,
                    reviewerGroup: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-full bg-[var(--teal)] px-6 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          onClick={handleSaveSettings}
        >
          Save Settings
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-steel">Presets</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">Pipeline Presets</h3>
          </div>
          <button
            type="button"
            className="rounded-full border border-[rgba(27,27,22,0.2)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel"
            onClick={loadPresets}
          >
            Refresh
          </button>
        </div>

        {presetsState.status === 'loading' && (
          <div className="rounded-3xl border border-dashed border-[rgba(27,27,22,0.2)] p-6 text-sm text-steel">
            Loading presets...
          </div>
        )}

        {presetsState.status === 'error' && (
          <div className="rounded-3xl border border-dashed border-[rgba(198,92,74,0.4)] bg-[rgba(198,92,74,0.08)] p-6 text-sm text-[var(--rose)]">
            {presetsState.error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {presets.map((preset: PresetDto) => {
            const draft = drafts[preset.id];
            if (!draft) {
              return null;
            }
            return (
              <div key={preset.id} className="surface rounded-3xl p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-steel">Preset</p>
                    <h4 className="mt-2 text-lg font-semibold text-ink">{preset.name}</h4>
                  </div>
                  {preset.isDefault && (
                    <span className="badge bg-[rgba(31,111,100,0.15)] text-[var(--teal)]">Default</span>
                  )}
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <label className="flex flex-col gap-2">
                    Name
                    <input
                      className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                      value={draft.name}
                      onChange={(event) => handlePresetChange(preset.id, { name: event.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    Description
                    <input
                      className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                      value={draft.description}
                      onChange={(event) => handlePresetChange(preset.id, { description: event.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draft.isDefault}
                      onChange={(event) => handlePresetChange(preset.id, { isDefault: event.target.checked })}
                    />
                    Set as default
                  </label>
                  <label className="flex flex-col gap-2">
                    Config JSON
                    <textarea
                      className="min-h-[160px] rounded-2xl border border-[rgba(27,27,22,0.15)] bg-white px-4 py-3 text-xs"
                      value={draft.configText}
                      onChange={(event) => handlePresetChange(preset.id, { configText: event.target.value })}
                    />
                  </label>
                  {draft.error && <p className="text-xs text-[var(--rose)]">{draft.error}</p>}
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-[var(--teal)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                    onClick={() => handleUpdatePreset(preset.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[rgba(198,92,74,0.5)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--rose)]"
                    onClick={() => handleDeletePreset(preset.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="surface rounded-3xl p-6">
          <h4 className="text-lg font-semibold text-ink">Create new preset</h4>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              Name
              <input
                className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                value={newPreset.name}
                onChange={(event) => setNewPreset((prev: PresetDraft) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Description
              <input
                className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2"
                value={newPreset.description}
                onChange={(event) => setNewPreset((prev: PresetDraft) => ({
                  ...prev,
                  description: event.target.value,
                }))}
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={newPreset.isDefault}
              onChange={(event) => setNewPreset((prev: PresetDraft) => ({
                ...prev,
                isDefault: event.target.checked,
              }))}
            />
            Set as default
          </label>
          <label className="mt-4 flex flex-col gap-2 text-sm">
            Config JSON
            <textarea
              className="min-h-[180px] rounded-2xl border border-[rgba(27,27,22,0.15)] bg-white px-4 py-3 text-xs"
              value={newPreset.configText}
              onChange={(event) => setNewPreset((prev: PresetDraft) => ({
                ...prev,
                configText: event.target.value,
              }))}
            />
          </label>
          {newPreset.error && <p className="mt-2 text-xs text-[var(--rose)]">{newPreset.error}</p>}
          <div className="mt-4">
            <button
              type="button"
              className="rounded-full bg-[var(--clay)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
              onClick={handleCreatePreset}
            >
              Create preset
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
