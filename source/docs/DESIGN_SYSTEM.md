# Prompt Forge Design System

## 品牌方向

Prompt Forge 采用“现代铸造工作台”视觉语言：

- 石墨黑与雾白作为两种基础主题
- 薄荷绿作为唯一主操作强调色
- 冷蓝仅用于辅助信息与变量
- 轻玻璃、细边框和低层级阴影代替厚重拟物效果
- 等宽字体承担状态、模型和元数据标签

## 语义 Token

主要 Token 位于 `src/design-system.css`：

```css
:root {
  --bg-color: #080a0e;
  --text-main: #e8edf2;
  --primary-color: #70e1b6;
  --surface-1: ...;
  --surface-2: ...;
  --surface-3: ...;
  --text-muted: ...;
  --border-color: ...;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --shadow-sm: ...;
  --shadow-md: ...;
}
```

组件优先引用语义变量，不再直接绑定固定主题色。主题切换时由
`ThemeContext` 更新根节点变量：

- `dark`：内置深色主题
- `light`：内置浅色主题
- `custom`：用户颜色与字号

配置存储在 WebView `localStorage`，并由 `public/theme-bootstrap.js`
在 React 挂载前恢复。

## 布局

桌面布局：

```text
顶部品牌 / 命令入口 / 工作区操作
┌──────────────┬───────────────────────────┬────────────────┐
│ 场景/项目/历史 │ 输入、背景、澄清、生成状态 │ 结果与继续修改   │
└──────────────┴───────────────────────────┴────────────────┘
```

侧栏通过三个页签收纳，不再平铺所有功能。窗口小于 `980px` 时，侧栏变为抽屉；
主工作区与结果区改为纵向布局。窗口最小宽度为 `760px`，使用
ResizeObserver 与 CSS Container Queries 检测可用空间。

## 导航与快捷键

- `Ctrl/⌘ K`：打开 Command Palette
- `Ctrl/⌘ N`：新建提示词任务
- `Ctrl/⌘ ,`：打开应用设置
- `Alt 1`：提示词工坊
- `Alt 2`：日常对话助手
- `Esc`：关闭命令面板或移动端侧栏

Command Palette 支持模糊搜索、方向键选择、Enter 执行和焦点恢复。

## 交互状态

主要交互元素覆盖默认、悬停、键盘焦点、按下和禁用状态。全局焦点环至少 2px，
错误状态同时使用图标、颜色和文本。动画集中在 150–260ms，并遵循
`prefers-reduced-motion`。

## 响应式验收

- 1360px：三栏工作台
- 980px 以下：侧栏抽屉，主区可纵向滚动
- 760px：紧凑工具栏、单列输入/结果
- 页面 `scrollWidth === clientWidth`，无横向溢出
- 浅色与深色主题均通过实际截图检查
