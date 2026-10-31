# 字体文件说明

桌贴 / 打印 PDF 需要支持 **中文 + 越南文声调** 的单文件字体（`.otf` / `.ttf`）。

| 文件名 | 用途 | 下载地址 |
|--------|------|---------|
| `NotoSansSC-Regular.otf` | 中文 + 越南文 + 拉丁 | [Google Fonts · Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) |

服务端也会从 `apps/server/assets/fonts/NotoSansSC-Regular.otf` 加载同名字体。

## 重要

**不要使用 `.ttc`（如微软雅黑 `msyh.ttc`）**：PDFKit 无法正确子集化，会导致中文乱码。

## 回退策略

若本目录无字体文件，服务端按序尝试：

- **Windows**：`Noto Sans SC (TrueType).otf` → `simhei.ttf` → `arialuni.ttf`
- **Linux**：Noto / 文泉驿等单文件 TTF/OTF（跳过 `.ttc`）
