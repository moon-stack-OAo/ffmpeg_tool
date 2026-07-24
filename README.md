# FFmpeg 视频压缩工具

基于 **Electron + Vue 3 + TypeScript + Element Plus** 的本地视频压缩桌面应用。  
通过内置 `ffmpeg-static` / `ffprobe-static` 调用 FFmpeg，无需系统预先安装 FFmpeg。

## 功能

- **多文件添加**：按钮选择 + **拖拽添加**（`webUtils.getPathForFile` 获取真实本地路径）
- **压缩预设**：高清存档 / 标准压缩 / 微信社交 / 自定义
- **硬件加速**：自动 / 软件 x264 / NVIDIA NVENC / Intel QSV / AMD AMF
- **并行编码**：可配置并发数 1–4（默认 2），单任务/全部取消
- **体积对比**：原始大小 / 输出大小 / 节省比例 + 汇总
- **多格式输出**：mp4 / mkv / mov（H.264 + AAC）、webm（VP9 + Opus）
- 实时进度（百分比、时间、速度）
- 检测 FFmpeg 与本机硬件编码器是否可用
- **自动更新**：GitHub Releases + electron-updater（检查 / 下载 / 重启安装）
- 预留 Windows / macOS 打包配置（electron-builder）

## 环境要求

- Node.js 18+（推荐 20/22）
- Windows 10/11（当前以 Windows 为主；结构兼容 macOS）

## 安装依赖

```bash
cd D:\Moon\tools\ffmpeg_tool
npm install
```

> `ffmpeg-static` / `ffprobe-static` 会下载对应平台二进制，需可访问 npm 与 GitHub/相关 CDN。  
> 若网络失败，可配置国内镜像后重试：
>
> ```bash
> npm config set registry https://registry.npmmirror.com
> npm install
> ```

## 开发启动

```bash
npm run dev
```

## 类型检查

```bash
npm run typecheck
```

## 构建与打包

```bash
# 仅编译主进程/渲染进程
npm run build

# Windows 安装包
npm run dist:win

# macOS（需在 mac 上执行）
npm run dist:mac
```

打包产物目录：`release/`

## 目录结构

```
ffmpeg_tool/
├── .github/workflows/  # CI / Release
├── electron/
│   ├── main/           # 主进程（窗口、IPC、FFmpeg、任务队列）
│   └── preload/        # 预加载脚本（contextBridge + webUtils）
├── src/                # Vue 3 渲染进程
├── shared/             # 主/渲染共享类型与常量
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## 持续集成与发版

| 工作流 | 触发条件 | 作用 |
| --- | --- | --- |
| `CI` | push / PR 到 `main` 或 `master` | `npm ci` → typecheck → build |
| `Release` | 推送 tag `v*`（如 `v1.0.0`） | Windows 打包并上传 GitHub Release |

发版示例：

```bash
# 1. 更新 package.json version 与 CHANGELOG.md
# 2. 提交后打 tag 并推送
git tag v1.0.0
git push origin v1.0.0
```

> macOS 打包 job 默认关闭（`if: false`），需在 mac 上实测或配置签名后再开启。  
> 更新日志见 [CHANGELOG.md](./CHANGELOG.md)。

## 自动更新

基于 **electron-updater**，从 **GitHub Releases** 检查新版本。

### 更新源

当前仓库：`moon-stack-OAo/ffmpeg_tool`（与 `package.json` / `electron-builder.yml` 一致）。

### 行为说明

| 场景 | 行为 |
| --- | --- |
| 打包后启动 | 约 4 秒后静默检查；有新版本弹出对话框 |
| 手动「检查更新」 | 立即检查，展示结果 |
| 发现新版本 | 用户确认后下载，显示进度 |
| 下载完成 | 「重启并安装」退出并覆盖安装 |
| `npm run dev` | 不检查真实更新，仅提示开发模式 |

### 发版注意

- 版本号必须递增（`package.json` 的 `version`）
- Release 产物需包含 NSIS 安装包与 `latest.yml`（electron-builder 自动生成）
- 仓库建议 **Public**；Private 需额外配置 token 才能让客户端拉更新
- 未配置代码签名时，Windows 可能提示未知发布者，自动更新仍可工作但体验较差

## 使用说明

1. 启动后确认顶部 **FFmpeg 就绪**
2. 点击 **输出目录** 选择保存位置
3. **添加视频**（按钮多选，或拖入虚线区域）
4. 选择预设 / 编码器 / 并发数（自定义可改 CRF、最长边、格式）
5. **全部开始** 或单条 **开始**
6. 可随时 **取消** / **全部取消**
7. 完成后查看「原始 / 输出 / 节省」与底部汇总

输出文件名默认：`原文件名_compressed.<格式>`（重名自动追加序号）。

### 编码器说明

| 选项 | 说明 |
| --- | --- |
| 自动 | 探测 NVENC → QSV → AMF，均不可用则 libx264 |
| 软件 x264 | 兼容最好，速度较慢 |
| NVENC | NVIDIA 硬件，参数 `-c:v h264_nvenc -preset p4 -cq <CRF映射>` |
| QSV | Intel 硬件，`-c:v h264_qsv -global_quality <CRF映射>` |
| AMF | AMD 硬件，`-c:v h264_amf -rc cqp -qp_* <CRF映射>` |

> **WebM** 固定使用软件 `libvpx-vp9` + Opus，硬件加速不适用。  
> 软件 CRF 与硬件 cq/qp 为近似映射（注释见 `electron/main/ffmpeg.ts`），非严格等价。

### 输出格式

| 格式 | 视频 | 音频 | 备注 |
| --- | --- | --- | --- |
| mp4 | H.264（软/硬） | AAC | `+faststart` |
| mkv | H.264（软/硬） | AAC | matroska |
| mov | H.264（软/硬） | AAC | `+faststart` |
| webm | VP9（软件） | Opus | `-deadline good -cpu-used 4` |

## 技术说明

| 项 | 说明 |
| --- | --- |
| 脚手架 | electron-vite |
| UI | Element Plus（中文） |
| 安全 | `contextIsolation: true`，`nodeIntegration: false` |
| 拖拽路径 | preload `webUtils.getPathForFile` |
| 并行队列 | `taskQueue` 支持 concurrency，进度按 taskId 推送 |
| 进度 | ffmpeg `-progress pipe:1` + stderr 兜底解析 |
| 打包二进制 | `asarUnpack` 解包 `ffmpeg-static` / `ffprobe-static` |

## 已知限制

- 硬件编码器依赖本机驱动与 FFmpeg 编译支持；探测基于 `ffmpeg -encoders`，实际编码仍可能因驱动失败
- 并发过高可能占满 GPU/CPU，建议 2–3
- 未做任务持久化、仅抽取音频（mp3/aac）
- mac 需在 macOS 上实际验证签名与路径（VideoToolbox 未接入）
- 体积「节省」为负表示变小，正表示变大（失败/取消不显示对比）

## 许可证

[MIT](./LICENSE)
