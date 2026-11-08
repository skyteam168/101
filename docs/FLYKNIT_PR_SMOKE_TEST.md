# FlyknitBuddy 自动开 PR 冒烟测试

本文件用于验证 FlyknitBuddy 的「独立分支 / 自动开 PR」能力，**不包含任何业务代码**，
合并与否都不影响系统运行，验证完成后可直接删除。

## 验证目标

| 步骤 | 期望结果 |
| --- | --- |
| 建独立分支 | 从 `main` 拉出测试分支，不影响 `main` |
| 提交 | 只包含本文件，提交说明写清用途 |
| 推送 | 分支推送到 `origin`，`main` 保持不动 |
| 开 PR | PR 可直接在 GitHub 上看到，描述由 AI 生成 |

## 执行记录

- 远程仓库：`https://github.com/skyteam168/101.git`
- 源分支：`test/flyknitbuddy-pr-smoke`
- 目标分支：`main`
- 执行人：FlyknitBuddy（受 IT Manager 委托）

## 清理方式

在 GitHub 上关闭 PR，并删除 `test/flyknitbuddy-pr-smoke` 分支即可；
本地可用 `git switch main && git branch -D test/flyknitbuddy-pr-smoke` 回收。