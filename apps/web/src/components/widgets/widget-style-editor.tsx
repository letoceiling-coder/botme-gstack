import { useState } from 'react';
import {
  DEFAULT_LAUNCHER_CONFIG,
  WIDGET_DESIGN_PRESETS,
  type LauncherConfig,
  type WidgetDesignPreset,
} from '@botme/shared';
import { Button, Input, Select, SelectOption } from '@botme/ui';

interface WidgetStyleEditorProps {
  value: LauncherConfig;
  disabled?: boolean;
  onChange: (value: LauncherConfig) => void;
  onUploadLauncherIcon?: (file: File) => Promise<string>;
}

const QUICK_ACTIONS_PLACEHOLDER = 'Например:\nУслуги\nЦены\nЗаписаться\nСвязаться с менеджером';

export function WidgetStyleEditor({
  value,
  disabled = false,
  onChange,
  onUploadLauncherIcon,
}: WidgetStyleEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const update = (patch: Partial<LauncherConfig>) => {
    onChange({ ...DEFAULT_LAUNCHER_CONFIG, ...value, ...patch });
  };

  const applyPreset = (presetId: WidgetDesignPreset) => {
    const preset = WIDGET_DESIGN_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    onChange({
      ...value,
      ...preset.config,
      widgetTitle: value.widgetTitle,
      welcomeMessage: value.welcomeMessage,
      avatarUrl: value.avatarUrl,
      launcherIconUrl: value.launcherIconUrl,
      quickActions: value.quickActions,
    });
  };

  const handleIconUpload = async (file: File | undefined) => {
    if (!file || !onUploadLauncherIcon) return;
    setUploadError(null);
    if (file.type !== 'image/png' && file.type !== 'image/svg+xml') {
      setUploadError('Загрузите SVG или PNG');
      return;
    }
    setUploading(true);
    try {
      const url = await onUploadLauncherIcon(file);
      update({ launcherIconUrl: url });
    } catch {
      setUploadError('Не удалось загрузить иконку');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-[#39ff14]">Дизайн виджета</h3>
            <p className="text-xs text-muted-foreground">10 готовых вариантов: Telegram, WhatsApp и другие стили.</p>
          </div>
          <Select
            className="max-w-[220px]"
            value={value.designPreset}
            disabled={disabled}
            onChange={(event) => applyPreset(event.target.value as WidgetDesignPreset)}
          >
            {WIDGET_DESIGN_PRESETS.map((preset) => (
              <SelectOption key={preset.id} value={preset.id}>
                {preset.name}
              </SelectOption>
            ))}
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {WIDGET_DESIGN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(preset.id)}
              className={`rounded-2xl border p-3 text-left transition ${
                value.designPreset === preset.id
                  ? 'border-[#39ff14] bg-[#39ff14]/10'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <div
                className="mb-3 h-14 rounded-xl"
                style={{
                  background: `linear-gradient(135deg, ${preset.config.secondaryColor}, ${preset.config.primaryColor})`,
                }}
              />
              <p className="text-sm font-semibold text-white">{preset.name}</p>
              <p className="mt-1 text-xs text-zinc-400">{preset.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Primary color"
          value={value.primaryColor}
          disabled={disabled}
          onChange={(event) => update({ primaryColor: event.target.value })}
        />
        <Input
          label="Secondary color"
          value={value.secondaryColor}
          disabled={disabled}
          onChange={(event) => update({ secondaryColor: event.target.value })}
        />
        <Input
          label="Text color"
          value={value.textColor}
          disabled={disabled}
          onChange={(event) => update({ textColor: event.target.value })}
        />
        <Input
          label="Launcher icon text"
          value={value.launcherIcon}
          disabled={disabled}
          onChange={(event) => update({ launcherIcon: event.target.value.slice(0, 10) })}
        />
        <Input
          label="Widget title"
          value={value.widgetTitle ?? ''}
          disabled={disabled}
          onChange={(event) => update({ widgetTitle: event.target.value })}
        />
        <Input
          label="Avatar URL"
          value={value.avatarUrl ?? ''}
          disabled={disabled}
          onChange={(event) => update({ avatarUrl: event.target.value })}
        />
        <Input
          label="Welcome"
          value={value.welcomeMessage ?? ''}
          disabled={disabled}
          onChange={(event) => update({ welcomeMessage: event.target.value })}
          className="sm:col-span-2"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input
          label="Launcher icon URL (SVG/PNG)"
          value={value.launcherIconUrl ?? ''}
          disabled={disabled}
          onChange={(event) => update({ launcherIconUrl: event.target.value })}
        />
        <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-white/10 px-4 text-sm text-white hover:border-white/25">
          {uploading ? 'Загрузка…' : 'Загрузить SVG/PNG'}
          <input
            type="file"
            accept="image/svg+xml,image/png"
            className="sr-only"
            disabled={disabled || uploading}
            onChange={(event) => void handleIconUpload(event.target.files?.[0])}
          />
        </label>
      </div>
      {uploadError && <p className="text-xs text-red-300">{uploadError}</p>}
      {value.launcherIconUrl && (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <img src={value.launcherIconUrl} alt="" className="h-10 w-10 rounded-full object-contain" />
          <p className="text-xs text-zinc-400">Эта иконка заменит текстовый символ launcher.</p>
        </div>
      )}

      <label className="block text-sm text-zinc-400">
        Быстрые ответы
        <textarea
          className="mt-1 min-h-28 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#39ff14]/60"
          value={(value.quickActions ?? []).join('\n')}
          disabled={disabled}
          placeholder={QUICK_ACTIONS_PLACEHOLDER}
          onChange={(event) =>
            update({
              quickActions: event.target.value
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 8),
            })
          }
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.darkMode}
            onChange={(event) => update({ darkMode: event.target.checked })}
          />
          Dark theme
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.animations}
            onChange={(event) => update({ animations: event.target.checked })}
          />
          Animations
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.compactMode}
            onChange={(event) => update({ compactMode: event.target.checked })}
          />
          Compact
        </label>
      </div>
    </div>
  );
}
