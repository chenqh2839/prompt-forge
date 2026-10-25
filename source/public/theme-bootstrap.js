(() => {
  const root = document.documentElement;
  const fallback = {
    mode: "dark",
    backgroundColor: "#080a0e",
    textColor: "#e8edf2",
    accentColor: "#70e1b6",
    baseFontSize: 16,
  };
  try {
    const raw = localStorage.getItem("prompt-forge-theme-v1");
    const theme = raw ? JSON.parse(raw) : fallback;
    const validHex = (value) =>
      typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
    const backgroundColor = validHex(theme.backgroundColor)
      ? theme.backgroundColor
      : fallback.backgroundColor;
    const textColor = validHex(theme.textColor)
      ? theme.textColor
      : fallback.textColor;
    const accentColor = validHex(theme.accentColor)
      ? theme.accentColor
      : fallback.accentColor;

    const luminance = (hex) => {
      const channels = [1, 3, 5].map((offset) => {
        const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.03928
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return (
        channels[0] * 0.2126 +
        channels[1] * 0.7152 +
        channels[2] * 0.0722
      );
    };

    root.style.setProperty("--bg-color", backgroundColor);
    root.style.setProperty("--text-color", textColor);
    root.style.setProperty("--text-main", textColor);
    root.style.setProperty("--accent-color", accentColor);
    root.style.setProperty("--primary-color", accentColor);
    root.style.setProperty(
      "--on-accent",
      luminance(accentColor) > 0.48 ? "#07100D" : "#FFFFFF",
    );
    root.style.backgroundColor = backgroundColor;
    const fontSize = Number(theme.baseFontSize);
    if (fontSize >= 14 && fontSize <= 24) {
      root.style.setProperty("--base-font-size", `${fontSize}px`);
    }
    root.style.colorScheme =
      luminance(backgroundColor) > 0.48 ? "light" : "dark";
    if (["dark", "light", "custom"].includes(theme.mode)) {
      root.dataset.theme = theme.mode;
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", backgroundColor);
  } catch {
    root.style.setProperty("--bg-color", fallback.backgroundColor);
    root.style.setProperty("--text-main", fallback.textColor);
    root.style.setProperty("--primary-color", fallback.accentColor);
    root.style.backgroundColor = fallback.backgroundColor;
    root.style.colorScheme = "dark";
    root.dataset.theme = "dark";
  }
})();
