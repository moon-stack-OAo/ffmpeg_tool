# 轻影

本地视频压缩与音频抽取桌面应用。

**版本说明**以 [CHANGELOG.md](./CHANGELOG.md) 为准（与 `package.json` 的 `version` 对齐）；README 不单独维护版本号。

基于 **Electron + Vue 3 + TypeScript + Element Plus**。  
通过内置 `ffmpeg-static` / `ffprobe-static` 调用 FFmpeg，无需系统预先安装 FFmpeg。

## 功能

- **多文件添加**：按钮选择 + **拖拽添加**（支持**文件夹递归**，深度 8 / 最多 500）
- **任务模式**：视频压缩 / **仅抽取音频**（m4a / mp3 / opus，可设码率）
- **压缩预设**：高清存档 / 标准压缩 / 微信社交 / 自定义
- **目标体积（MB）**：码率估算约达目标；可选 **两遍编码**（软件 x264/VP9，更准更慢；硬件自动单遍）
- **暗色模式**：浅色 / 深色 / 跟随系统（`Ctrl/Cmd+D` 切换浅深）
- **帮助中心**：使用说明 + 快捷键（标题栏 `?` / `F1` / `Ctrl+/`）
- **全局快捷键**：开始、取消、选文件/目录、清完成、主题、打开帮助
- **硬件加速**：自动 / 软件 x264 / NVIDIA NVENC / Intel QSV / AMD AMF / **Apple VideoToolbox**
- **硬件试编探测**：列表探测后对 NVENC/QSV/AMF/VideoToolbox 做 lavfi 短片验证
- **硬件失败回退**：硬件编码失败时自动回退软件 x264，并提示
- **时间段裁剪**：可选开始/结束秒（压缩与抽音频均支持；与两遍可叠加）
- **并行编码**：可配置并发数 1–4（默认 2），单任务/全部取消
- **输出命名模板**：预设 + **自定义**字符串（`{name}` `{preset}` `{date}` `{time}`）
- **输出位置**：固定目录 / 源文件同目录 / 输出目录下按日期
- **设置记忆**：输出目录、预设、编码器、并发、命名、目标体积、两遍、主题、任务模式等自动持久化
- **任务列表持久化**：重启恢复待处理/失败/完成任务；源文件缺失自动标失败
- **任务详情**：输入/输出、参数摘要、完整 ffmpeg 命令行
- **体积对比**：原始大小 / 输出大小 / 节省比例 + 汇总
- **多格式输出**：mp4 / mkv / mov（H.264 + AAC）、webm（VP9 + Opus）
- **结果操作**：打开文件 / 在文件夹中显示；队列完成后系统通知
- **应用到待处理**：一键把当前选项同步到待处理任务
- 实时进度（百分比、时间、速度、**ETA**；两遍时 pass1≈0–45%、pass2≈45–100%）
- 错误信息中文产品化映射；抽音频前无音轨预检
- 检测 FFmpeg 与本机硬件编码器是否可用
- **自动更新**：GitHub Releases + electron-updater（检查 / 下载 / 重启安装）
- 预留 Windows / macOS 打包配置（electron-builder）；发版见 `docs/RELEASE.md`

### 快捷键简表

| 快捷键                                           | 动作        |
|-----------------------------------------------|-----------|
| `Ctrl/Cmd + Enter`                            | 全部开始      |
| `Ctrl/Cmd + Shift + Enter` / `Ctrl/Cmd + Esc` | 全部取消      |
| `Ctrl/Cmd + O`                                | 添加视频      |
| `Ctrl/Cmd + Shift + O`                        | 选择输出目录    |
| `Ctrl/Cmd + L`                                | 清除已完成     |
| `Ctrl/Cmd + D`                                | 切换浅色 / 深色 |
| `F1` 或 `Ctrl + /`                             | 打开帮助      |

## 环境要求

- Node.js 18+（推荐 20/22）
- Windows 10/11（当前以 Windows 为主；结构兼容 macOS）

## 安装依赖

```bash
cd qingying
npm install
```

> `ffmpeg-static` / `ffprobe-static` 会下载对应平台二进制，需可访问 npm 与 GitHub/相关 CDN。  
> 若网络失败，可配置国内镜像后重试：
>
> ```bash
> npm config set registry https://registry.npmmirror.com
> npm install
> ```

## 开发

```bash
# 开发启动
npm run dev

# 类型检查
npm run typecheck

# 单元测试（vitest）
npm test

# 仅编译主进程/渲染进程
npm run build
```

## 构建与打包

```bash
# Windows 安装包
npm run dist:win

# macOS（需在 mac 上执行）
npm run dist:mac
```

打包产物目录：`release/`

### macOS 说明

- 需在 macOS 上执行 `npm run dist:mac` 并实测路径与签名
- **VideoToolbox** 已接入：auto 在 darwin 优先 `h264_videotoolbox`（需本机探测/试编成功）
- GitHub Actions 中 macOS 打包 job 默认关闭，配置签名与公证后再开启

#### 未签名构建（当前）

当前 macOS 为**未签名**构建，首次打开可能被系统拦截：

1. **「无法验证开发者」**：在 Finder 中对 `轻影.app` / `qingying.app` **右键 → 打开**，再在提示中确认打开
2. **「应用已损坏」**（常见于隔离属性 quarantine）：在终端执行（按实际安装路径修改）：

```bash
xattr -cr "/Applications/轻影.app"
# 若应用名为 ASCII 产物名：
# xattr -cr "/Applications/qingying.app"
```

完成签名与公证后，上述步骤通常不再需要。

## 目录结构

```
qingying/
├── .github/workflows/  # CI / Release
├── docs/               # 发版等文档
├── electron/
│   ├── main/           # 主进程（窗口、IPC、FFmpeg、任务队列）
│   └── preload/        # 预加载脚本（contextBridge + webUtils）
├── src/                # Vue 3 渲染进程
├── shared/             # 主/渲染共享类型与常量
├── tests/              # vitest 单测
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## 持续集成与发版

| 工作流       | 触发条件                          | 作用                                  |
|-----------|-------------------------------|-------------------------------------|
| `CI`      | push / PR 到 `main` 或 `master` | `npm ci` → typecheck → test → build |
| `Release` | 推送 tag `v*`（如 `v1.0.0`）       | Windows 打包并上传 GitHub Release        |

详细发版步骤见 [docs/RELEASE.md](./docs/RELEASE.md)。

发版示例：

```bash
# 1. 更新 CHANGELOG.md；授权后更新 package.json version
# 2. 提交后打 tag 并推送
git tag v1.0.0
git push origin v1.0.0
```

> macOS 打包 job 默认关闭（`if: false`），需在 mac 上实测或配置签名后再开启。  
> 更新日志见 [CHANGELOG.md](./CHANGELOG.md)。

## 代码签名

### Windows

- 未配置代码签名时，安装/启动可能触发 **SmartScreen**「未知发布者」提示，自动更新仍可工作但体验较差
- 使用 electron-builder 时，可在 CI 或本机配置（勿将证书与密码提交到仓库）：
    - `CSC_LINK`：证书文件路径或 base64
    - `CSC_KEY_PASSWORD`：证书密码
- 详见 [docs/RELEASE.md](./docs/RELEASE.md)

### macOS

- 正式分发需 Apple 开发者证书与公证（Notarization）
- 常见环境变量：`CSC_LINK` / `CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` 等
- 当前 Release 工作流以 Windows 为主，macOS 完整签名与公证链路尚未接入
- **未签名包使用说明**见上文「构建与打包 → macOS 说明 → 未签名构建」

## 自动更新

基于 **electron-updater**，从 **GitHub Releases** 检查新版本。

### 更新源

当前仓库：`moon-stack-OAo/qingying`（与 `package.json` / `electron-builder.yml` 一致）。

### 行为说明

| 场景            | 行为                   |
|---------------|----------------------|
| 打包后启动         | 约 4 秒后静默检查；有新版本弹出对话框 |
| 手动「检查更新」      | 立即检查，展示结果            |
| 发现新版本         | 用户确认后下载，显示进度         |
| 下载完成          | 「重启并安装」退出并覆盖安装       |
| `npm run dev` | 不检查真实更新，仅提示开发模式      |

### 发版注意

- 版本号必须递增（`package.json` 的 `version`）；**未打 tag 前不要随意改版本号**
- Release 产物需包含 NSIS 安装包与 `latest.yml`（electron-builder 自动生成）
- 仓库建议 **Public**；Private 需额外配置 token 才能让客户端拉更新
- 未配置代码签名时，Windows 可能提示未知发布者

## 使用说明

1. 启动后确认顶部 **FFmpeg 就绪**
2. 点击 **输出目录** 选择保存位置
3. **添加视频**（按钮多选，或拖入虚线区域）
4. 选择任务模式（压缩 / 抽音频）、预设 / 编码器 / 并发 / 命名模板
5. **全部开始** 或单条 **开始**
6. 可随时 **取消** / **全部取消**
7. 完成后查看「原始 / 输出 / 节省」与底部汇总；可打开文件或在文件夹中显示

输出文件名默认：`原文件名_compressed.<格式>`（音频模式常用 `_audio`；重名自动追加序号）。

### 编码器说明

| 选项           | 说明                                                   |
|--------------|------------------------------------------------------|
| 自动           | Win：NVENC→QSV→AMF；mac：VideoToolbox 优先；均不可用则 libx264  |
| 软件 x264      | 兼容最好，速度较慢                                            |
| NVENC        | NVIDIA 硬件，`-c:v h264_nvenc -preset p4 -cq <CRF映射>`   |
| QSV          | Intel 硬件，`-c:v h264_qsv -global_quality <CRF映射>`     |
| AMF          | AMD 硬件，`-c:v h264_amf -rc cqp -qp_* <CRF映射>`         |
| VideoToolbox | Apple 硬件，`-c:v h264_videotoolbox -q:v` 或目标体积时 `-b:v` |

> **WebM** 固定使用软件 `libvpx-vp9` + Opus，硬件加速不适用。  
> 软件 CRF 与硬件 cq/qp/q:v 为近似映射，非严格等价。  
> 目标体积开启时改为单遍 ABR（`-b:v`），约达目标、非精确两遍。  
> 硬件编码失败时默认回退软件 x264（可配置）。

### 输出格式

| 格式   | 视频         | 音频   | 备注                           |
|------|------------|------|------------------------------|
| mp4  | H.264（软/硬） | AAC  | `+faststart`                 |
| mkv  | H.264（软/硬） | AAC  | matroska                     |
| mov  | H.264（软/硬） | AAC  | `+faststart`                 |
| webm | VP9（软件）    | Opus | `-deadline good -cpu-used 4` |

音频模式：m4a（AAC）/ mp3 / opus，默认码率 192k。

## 技术说明

| 项     | 说明                                                 |
|-------|----------------------------------------------------|
| 脚手架   | electron-vite                                      |
| UI    | Element Plus（中文）                                   |
| 安全    | `contextIsolation: true`，`nodeIntegration: false`  |
| 拖拽路径  | preload `webUtils.getPathForFile`                  |
| 并行队列  | `taskQueue` 支持 concurrency，进度按 taskId 推送           |
| 进度    | ffmpeg `-progress pipe:1` + stderr 兜底解析            |
| 测试    | vitest（`npm test`）                                 |
| 打包二进制 | `asarUnpack` 解包 `ffmpeg-static` / `ffprobe-static` |

## 已知限制

- 硬件编码器依赖本机驱动与 FFmpeg 编译支持；已做列表探测 + 短片试编，仍可能因驱动/会话状态在实编时失败（已支持回退软件）
- 并发过高可能占满 GPU/CPU，硬件编码建议 1–2，综合建议 2–3
- **目标体积**为单遍码率估算，非真·两遍，实际体积可能偏离
- macOS 签名/公证与路径需在 macOS 上实测；VideoToolbox 依赖本机 FFmpeg 编译与系统支持
- 文件夹递归最多 500 个视频、深度 8
- Windows 未签名时可能触发 SmartScreen（见下方代码签名说明）
- 体积「节省」为负表示变小，正表示变大（失败/取消不显示对比）

## 许可证

[MIT](./LICENSE)
