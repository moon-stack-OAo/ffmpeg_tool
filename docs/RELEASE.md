# 发版说明

面向维护者的简短发版清单。勿在仓库中提交证书、密码或 token。

## 当前版本

- **1.0.1**：设置抽屉、自定义标题栏、关闭托盘、主界面精简、字号优化、竖屏旋转 90°（见 `CHANGELOG.md` / `package.json` 的 `version`）
- 未完成项仅保留在 `[Unreleased]` 计划（如代码签名 / 公证）

## 步骤

1. **更新变更说明**  
   将 `CHANGELOG.md` 中 `[Unreleased]` 已完成项整理进即将发布的版本小节，并保留未完成项在「计划」。  
   若仍以 **1.0.0** 发首发 tag，确认 `[1.0.0]` 小节已覆盖全部能力。

2. **版本号（需授权）**  
   按语义化版本修改 `package.json` 的 `version`。  
   **约定：未打 tag 前不随意改版本号。**  
   当前整合目标为 `1.0.0`，无需递增，除非此前已发布过同 tag。

3. **本地校验（推荐）**

   ```bash
   npm ci
   npm run typecheck
   npm test
   npm run build
   ```

4. **提交并打 tag（需授权）**

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   也可先 `git push` 再推送 tag。tag 需匹配 `v*`（如 `v1.0.0`）。  
   若远程已存在 `v1.0.0`，需协商是否覆盖或改为 `1.0.1`（勿擅自 force）。

5. **GitHub Actions Release**  
   推送 tag 后触发 `Release` 工作流：在 Windows 上打包并上传 GitHub Release（含安装包与 `latest.yml`，供自动更新使用）。  
   **Release 正文**由 `scripts/extract-changelog.mjs` 从 `CHANGELOG.md` 对应 `## [x.y.z]` 小节生成（`release-notes.md` / 产物旁 `RELEASE_NOTES.md`），不再仅依赖 GitHub 自动生成的 commit 列表。  
   Windows 与 **macOS** 两个 job 都会打包并上传到同一 GitHub Release（mac 未签名时 `CSC_IDENTITY_AUTO_DISCOVERY=false`）。

6. **发布后检查**
    - Release 页产物与说明是否完整
    - 客户端「检查更新」能否发现新版本
    - 安装与启动是否正常（未签名时可能有 SmartScreen 提示）

## 代码签名（占位）

### Windows

| 项    | 说明                                          |
|------|---------------------------------------------|
| 现象   | 未签名时 SmartScreen 可能提示「未知发布者」                |
| 环境变量 | `CSC_LINK`（证书路径或 base64）、`CSC_KEY_PASSWORD` |
| 注意   | 仅在 CI Secrets 或本机安全环境配置；勿写入仓库               |

### macOS

| 项    | 说明                                                                                       |
|------|------------------------------------------------------------------------------------------|
| 需求   | Apple 开发者证书 + 公证（Notarization）                                                           |
| 常见变量 | `CSC_LINK` / `CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` |
| 现状   | Release 以 Windows 为主；macOS 完整签名与公证链路尚未接入                                                 |

## 相关文档

- [CHANGELOG.md](../CHANGELOG.md)
- [README.md](../README.md)（功能、限制、自动更新）
