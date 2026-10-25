import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Paintbrush,
  Moon,
  Palette,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Type,
  Sun,
  X,
} from "lucide-react";
import { bridge } from "../lib/bridge";
import type { AppSettings, ProviderId, SettingsInput } from "../types";
import {
  DEFAULT_THEME,
  DARK_THEME,
  LIGHT_THEME,
  normalizeHexColor,
  sanitizeTheme,
  useTheme,
  type ThemeSettings,
} from "../theme/ThemeContext";

interface SettingsDialogProps {
  settings: AppSettings;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
}

const providers: Array<{
  id: ProviderId;
  label: string;
  endpoint: string;
  model: string;
}> = [
  {
    id: "openai",
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    id: "claude-gateway",
    label: "Claude 兼容网关",
    endpoint: "",
    model: "claude-sonnet-4-5",
  },
  {
    id: "ollama",
    label: "本地 Ollama",
    endpoint: "http://localhost:11434/v1",
    model: "llama3.1",
  },
];

function errorText(error: unknown) {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "未知错误";
}

export function SettingsDialog({
  settings,
  onClose,
  onSaved,
}: SettingsDialogProps) {
  const {
    theme,
    previewTheme,
    saveTheme,
    clearPreview,
  } = useTheme();
  const [activeTab, setActiveTab] = useState<"model" | "appearance">("model");
  const [draft, setDraft] = useState<SettingsInput>({
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [appearanceDraft, setAppearanceDraft] =
    useState<ThemeSettings>(theme);

  const closeDialog = () => {
    clearPreview();
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPreview();
    };
  }, [clearPreview, onClose]);

  const selectProvider = (provider: (typeof providers)[number]) => {
    setDraft({
      provider: provider.id,
      baseUrl: provider.endpoint,
      model: provider.model,
      apiKey: "",
    });
    setMessage("");
    setError("");
  };

  const handleSave = async () => {
    if (!draft.baseUrl.trim() || !draft.model.trim()) {
      setError("Base URL 和模型名称不能为空。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next = await bridge.saveSettings({
        ...draft,
        baseUrl: draft.baseUrl.trim().replace(/\/+$/, ""),
        model: draft.model.trim(),
        apiKey: draft.apiKey?.trim() || undefined,
      });
      onSaved(next);
    } catch (saveError) {
      setError(`保存失败：${errorText(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError("");
    setMessage("");
    try {
      const reply = await bridge.testConnection({
        ...draft,
        baseUrl: draft.baseUrl.trim().replace(/\/+$/, ""),
        model: draft.model.trim(),
        apiKey: draft.apiKey?.trim() || undefined,
      });
      setMessage(`连接成功：${reply}`);
    } catch (testError) {
      setError(`连接失败：${errorText(testError)}`);
    } finally {
      setTesting(false);
    }
  };

  const handleClearKey = async () => {
    if (!window.confirm("从系统凭据库中删除当前服务的 API Key？")) return;
    try {
      const next = await bridge.clearApiKey();
      onSaved(next);
    } catch (clearError) {
      setError(`删除 Key 失败：${errorText(clearError)}`);
    }
  };

  const keyAlreadySaved =
    settings.hasApiKey && settings.provider === draft.provider;

  const switchTab = (tab: "model" | "appearance") => {
    setActiveTab(tab);
    setMessage("");
    setError("");
  };

  const updateAppearance = (
    key: keyof ThemeSettings,
    value: string | number,
  ) => {
    const nextTheme = {
      ...appearanceDraft,
      mode:
        key === "mode"
          ? (value as ThemeSettings["mode"])
          : ("custom" as const),
      [key]: value,
    } as ThemeSettings;
    setAppearanceDraft(nextTheme);
    setMessage("");
    setError("");
    const normalized = sanitizeTheme(nextTheme);
    if (normalized) previewTheme(normalized);
  };

  const selectThemeMode = (mode: ThemeSettings["mode"]) => {
    const preset =
      mode === "light"
        ? LIGHT_THEME
        : mode === "dark"
          ? DARK_THEME
          : { ...appearanceDraft, mode };
    const nextTheme = {
      ...preset,
      baseFontSize: appearanceDraft.baseFontSize,
    };
    setAppearanceDraft(nextTheme);
    previewTheme(nextTheme);
    setMessage("");
    setError("");
  };

  const normalizeColorField = (
    key: "backgroundColor" | "textColor" | "accentColor",
  ) => {
    const normalized = normalizeHexColor(appearanceDraft[key]);
    if (!normalized) {
      setError("请输入有效的 Hex 颜色，例如 #1A2B3C。");
      return;
    }
    updateAppearance(key, normalized);
  };

  const resetAppearance = () => {
    setAppearanceDraft(DEFAULT_THEME);
    previewTheme(DEFAULT_THEME);
    setMessage("已恢复默认外观，点击“保存外观”后持久化。");
    setError("");
  };

  const handleAppearanceSave = () => {
    const normalized = saveTheme(appearanceDraft);
    if (!normalized) {
      setError("请检查 Hex 颜色和字号范围。");
      return;
    }
    setAppearanceDraft(normalized);
    setMessage("外观设置已保存，重启后仍会保留。");
    setError("");
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="模型配置"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">PREFERENCES / 02</span>
            <h2>应用设置</h2>
            <p>连接模型服务，或实时调整界面外观。</p>
          </div>
          <button className="icon-button" onClick={closeDialog} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="settings-tabs">
          <button
            className={activeTab === "model" ? "active" : ""}
            onClick={() => switchTab("model")}
          >
            <ServerCog size={14} />
            模型连接
          </button>
          <button
            className={activeTab === "appearance" ? "active" : ""}
            onClick={() => switchTab("appearance")}
          >
            <Paintbrush size={14} />
            外观设置
          </button>
        </div>

        {activeTab === "model" ? (
          <>
        <div className="provider-grid">
          {providers.map((provider) => (
            <button
              key={provider.id}
              className={draft.provider === provider.id ? "active" : ""}
              onClick={() => selectProvider(provider)}
            >
              <span>{provider.label}</span>
              {draft.provider === provider.id && <CheckCircle2 size={15} />}
            </button>
          ))}
        </div>

        <div className="settings-form">
          <label>
            <span>
              <ServerCog size={14} />
              OpenAI 兼容 Base URL
            </span>
            <input
              value={draft.baseUrl}
              onChange={(event) =>
                setDraft({ ...draft, baseUrl: event.target.value })
              }
              placeholder="https://api.example.com/v1"
            />
            <small>
              可填写到 <code>/v1</code>，应用会自动请求
              <code>/chat/completions</code>。
            </small>
          </label>

          <label>
            <span>模型名称</span>
            <input
              value={draft.model}
              onChange={(event) =>
                setDraft({ ...draft, model: event.target.value })
              }
              placeholder="模型 ID"
            />
          </label>

          <label>
            <span>
              <KeyRound size={14} />
              API Key
              {keyAlreadySaved && (
                <em className="key-saved">
                  <ShieldCheck size={12} />
                  已存入系统凭据库
                </em>
              )}
            </span>
            <div className="password-field">
              <input
                type={showKey ? "text" : "password"}
                value={draft.apiKey ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, apiKey: event.target.value })
                }
                placeholder={
                  keyAlreadySaved ? "留空则继续使用已保存的 Key" : "输入 API Key"
                }
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "隐藏 Key" : "显示 Key"}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <small>
              Ollama 等本地服务通常无需 Key。密钥保存在 Windows
              凭据管理器、macOS 钥匙串或 Linux Secret Service。
            </small>
          </label>
        </div>
          </>
        ) : (
          <div className="appearance-panel">
            <div className="theme-mode-tabs" aria-label="主题模式">
              <button
                className={appearanceDraft.mode === "dark" ? "active" : ""}
                onClick={() => selectThemeMode("dark")}
              >
                <Moon size={14} />
                深色
              </button>
              <button
                className={appearanceDraft.mode === "light" ? "active" : ""}
                onClick={() => selectThemeMode("light")}
              >
                <Sun size={14} />
                浅色
              </button>
              <button
                className={appearanceDraft.mode === "custom" ? "active" : ""}
                onClick={() => selectThemeMode("custom")}
              >
                <Palette size={14} />
                自定义
              </button>
            </div>
            <div className="appearance-preview">
              <span className="eyebrow">LIVE PREVIEW</span>
              <h3>从模糊意图，到精确指令。</h3>
              <p>
                这是正文预览。背景、文字、强调色和全部字号会随设置实时变化。
              </p>
              <span className="preview-accent">强调色按钮</span>
            </div>

            <div className="appearance-section-heading">
              <span>页面颜色</span>
              <small>通过 CSS 变量统一应用到全局</small>
            </div>

            <div className="color-setting-list">
              {(
                [
                  {
                    key: "backgroundColor",
                    label: "背景色",
                    variable: "--bg-color",
                  },
                  {
                    key: "textColor",
                    label: "主文字颜色",
                    variable: "--text-color",
                  },
                  {
                    key: "accentColor",
                    label: "强调色",
                    variable: "--accent-color",
                  },
                ] as const
              ).map((setting) => (
                <label className="color-setting" key={setting.key}>
                  <span>
                    {setting.label}
                    <code>{setting.variable}</code>
                  </span>
                  <div className="color-control">
                    <input
                      type="color"
                      value={
                        normalizeHexColor(appearanceDraft[setting.key]) ??
                        DEFAULT_THEME[setting.key]
                      }
                      onChange={(event) =>
                        updateAppearance(setting.key, event.target.value)
                      }
                      aria-label={`选择${setting.label}`}
                    />
                    <input
                      type="text"
                      value={appearanceDraft[setting.key]}
                      maxLength={7}
                      spellCheck={false}
                      onChange={(event) =>
                        updateAppearance(setting.key, event.target.value)
                      }
                      onBlur={() => normalizeColorField(setting.key)}
                      aria-label={`${setting.label} Hex 值`}
                    />
                    <button
                      type="button"
                      title={`恢复默认${setting.label}`}
                      onClick={() =>
                        updateAppearance(
                          setting.key,
                          DEFAULT_THEME[setting.key],
                        )
                      }
                    >
                      默认
                    </button>
                  </div>
                </label>
              ))}
            </div>

            <div className="appearance-section-heading font-heading">
              <span>字体大小</span>
              <small>所有界面字号按比例缩放</small>
            </div>

            <div className="font-size-setting">
              <div className="font-size-label">
                <span>
                  <Type size={14} />
                  基础字号
                </span>
                <output>{appearanceDraft.baseFontSize}px</output>
              </div>
              <input
                type="range"
                min="14"
                max="24"
                step="1"
                value={appearanceDraft.baseFontSize}
                onChange={(event) =>
                  updateAppearance("baseFontSize", Number(event.target.value))
                }
                aria-label="基础字号"
              />
              <div className="font-size-scale">
                <span>14 紧凑</span>
                <input
                  type="number"
                  min="14"
                  max="24"
                  step="1"
                  value={appearanceDraft.baseFontSize}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      updateAppearance(
                        "baseFontSize",
                        Math.min(24, Math.max(14, value)),
                      );
                    }
                  }}
                  aria-label="基础字号数值"
                />
                <span>24 特大</span>
              </div>
            </div>
          </div>
        )}

        {(message || error) && (
          <div className={`connection-message ${error ? "error" : "success"}`}>
            {message || error}
          </div>
        )}

        {activeTab === "model" ? (
          <>
            <div className="modal-foot">
              {keyAlreadySaved ? (
                <button className="danger-text" onClick={handleClearKey}>
                  删除已保存的 Key
                </button>
              ) : (
                <span />
              )}
              <div>
                <button
                  className="secondary-button"
                  onClick={handleTest}
                  disabled={testing || !draft.baseUrl || !draft.model}
                >
                  {testing && <LoaderCircle className="spin" size={14} />}
                  测试连接
                </button>
                <button
                  className="primary-button"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving && <LoaderCircle className="spin" size={14} />}
                  保存配置
                </button>
              </div>
            </div>

            <div className="token-warning">
              TOKEN NOTICE：多轮追问与重新生成都会消耗模型 Token，费用由所选服务商结算。
            </div>
          </>
        ) : (
          <div className="modal-foot">
            <button className="danger-text" onClick={resetAppearance}>
              <RotateCcw size={13} />
              恢复默认外观
            </button>
            <div>
              <button className="secondary-button" onClick={closeDialog}>
                取消预览
              </button>
              <button className="primary-button" onClick={handleAppearanceSave}>
                保存外观
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
