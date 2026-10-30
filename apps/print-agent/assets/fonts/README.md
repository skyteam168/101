# 字体文件说明

请将以下字体文件下载后放置于本目录（`assets/fonts/`）：

| 文件名 | 用途 | 下载地址 |
|--------|------|---------|
| `NotoSansSC-Regular.otf` | 中文 + 越南文 + 拉丁 | [Google Fonts · Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) |
| `NotoSans-Regular.ttf` | 拉丁辅助字体 | [Google Fonts · Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) |

## 回退策略

若本目录无字体文件，程序将按以下顺序查找系统字体：

- **Windows**：`C:\Windows\Fonts\msyh.ttc`（微软雅黑）→ `arial.ttf`
- **Linux**：`/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` → `DejaVuSans.ttf`

建议在正式部署时放置 Noto 字体，以确保越南文（含声调符号）正确渲染。
