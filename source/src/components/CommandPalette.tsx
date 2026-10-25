import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Command,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";

export interface PaletteAction {
  id: string;
  label: string;
  detail: string;
  group: string;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  actions: PaletteAction[];
  onClose: () => void;
}

export function CommandPalette({ actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.detail} ${action.group} ${action.keywords ?? ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [actions, query]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) =>
          filtered.length ? (current + 1) % filtered.length : 0,
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          filtered.length
            ? (current - 1 + filtered.length) % filtered.length
            : 0,
        );
      } else if (event.key === "Enter" && filtered[activeIndex]) {
        event.preventDefault();
        const action = filtered[activeIndex];
        onClose();
        action.run();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, onClose]);

  let lastGroup = "";
  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="快捷操作"
      >
        <div className="palette-search">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索功能、场景或操作…"
            aria-label="搜索快捷操作"
          />
          <kbd>ESC</kbd>
          <button onClick={onClose} aria-label="关闭快捷操作">
            <X size={16} />
          </button>
        </div>
        <div className="palette-list">
          {filtered.length ? (
            filtered.map((action, index) => {
              const showGroup = action.group !== lastGroup;
              lastGroup = action.group;
              return (
                <div key={action.id}>
                  {showGroup && (
                    <div className="palette-group">{action.group}</div>
                  )}
                  <button
                    className={`palette-item ${
                      index === activeIndex ? "active" : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onClose();
                      action.run();
                    }}
                  >
                    <span className="palette-item-icon">
                      {action.group === "系统" ? (
                        <Settings2 size={15} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                    </span>
                    <span>
                      <strong>{action.label}</strong>
                      <small>{action.detail}</small>
                    </span>
                    {action.shortcut ? (
                      <kbd>{action.shortcut}</kbd>
                    ) : (
                      <ArrowRight size={14} />
                    )}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="palette-empty">
              <Command size={22} />
              <span>没有匹配的操作</span>
            </div>
          )}
        </div>
        <footer className="palette-footer">
          <span>↑↓ 选择</span>
          <span>Enter 执行</span>
          <span>Ctrl / ⌘ K 随时打开</span>
        </footer>
      </section>
    </div>
  );
}
