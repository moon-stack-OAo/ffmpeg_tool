# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。  
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### 计划

- Windows 代码签名、macOS 公证完整链路（配置与证书就绪后启用）

## [1.0.0] - 2026-08-10

本地视频压缩桌面应用完整 1.0 能力整合版（Electron + Vue 3 + TypeScript + Element Plus）。

### 新增

#### 核心能力

- 内置 `ffmpeg-static` / `ffprobe-static`，无需系统安装 FFmpeg
- 多文件添加：按钮选择 + 拖拽（真实本地路径）；**文件夹递归**（深度 8 / 最多 500）
- **任务模式**：视频压缩 / 仅抽取音频（m4a / mp3 / opus + 码率）
- 压缩预设：高清存档 / 标准压缩 / 微信社交 / 自定义
- 多格式输出：mp4 / mkv / mov（H.264 + AAC）、webm（VP9 + Opus）
- 并行编码：并发 1–4；单任务 / 全部取消
- 体积对比：原始 / 输出 / 节省比例与汇总
- 实时进度：百分比、时间、速度、**ETA**
- **时间段裁剪**（开始/结束秒，压缩与抽音频均支持）
- **目标体积（MB）**：码率估算约达目标；可选 **真·两遍编码**（libx264 / VP9；硬件自动单遍 ABR）

#### 硬件加速

- 自动 / 软件 x264 / NVIDIA NVENC / Intel QSV / AMD AMF / **Apple VideoToolbox**
- 列表探测 + **lavfi 短片试编**验证
- 硬件编码失败自动回退软件 x264，并提示
- auto 在 macOS（darwin）优先 VideoToolbox

#### 体验与界面

- **暗色模式**：浅色 / 深色 / 跟随系统
- **全局快捷键**与帮助对话框（`F1` / 工具栏 `?`）
- 输出命名模板：预设 + 自定义（`{name}` `{preset}` `{date}` `{time}`）
- 输出位置：固定目录 / 源文件同目录 / 按日期子目录
- 设置持久化（输出目录、预设、编码器、并发、命名、目标体积、两遍、主题、任务模式、通知等）
- **任务列表持久化**（重启恢复；运行中回落待处理；源文件缺失标失败；已完成最多 100 条）
- **任务详情**：路径、参数摘要、完整 ffmpeg 命令行、错误全文
- 队列完成后系统通知；打开文件 / 在文件夹中显示
- 应用到待处理；错误信息中文产品化映射
- 抽音频前无音轨预检
- 品牌图标（窗口 / 安装包 / favicon）

#### 工程与分发

- 架构：main / preload / renderer；`shared` 类型与 FFmpeg 纯逻辑
- UI：composables + 组件拆分
- vitest 单元测试；CI：`typecheck` + `test` + `build`
- 自动更新：`electron-updater` + GitHub Releases
- Windows / macOS 打包配置（electron-builder）；发版说明见 `docs/RELEASE.md`

### 说明

- WebM 使用软件 VP9 + Opus，不支持硬件加速
- 两遍编码仅 libx264 / libvpx-vp9；NVENC / QSV / AMF / VideoToolbox 在目标体积下使用单遍 ABR
- 硬件编码器依赖本机驱动与 FFmpeg 编译支持；试编通过不保证长时间任务一定成功（已支持回退）
- Windows 未代码签名时可能触发 SmartScreen；macOS 公证链路需证书后启用

### 快捷键

| 快捷键                                           | 动作        |
|-----------------------------------------------|-----------|
| `Ctrl/Cmd + Enter`                            | 全部开始      |
| `Ctrl/Cmd + Shift + Enter` / `Ctrl/Cmd + Esc` | 全部取消      |
| `Ctrl/Cmd + O`                                | 添加视频      |
| `Ctrl/Cmd + Shift + O`                        | 选择输出目录    |
| `Ctrl/Cmd + L`                                | 清除已完成     |
| `Ctrl/Cmd + D`                                | 切换浅色 / 深色 |
| `F1` 或 `Ctrl + /`                             | 快捷键帮助     |

[Unreleased]: https://github.com/moon-stack-OAo/ffmpeg_tool/compare/v1.0.0...HEAD

[1.0.0]: https://github.com/moon-stack-OAo/ffmpeg_tool/releases/tag/v1.0.0
