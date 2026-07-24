# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。  
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### 计划

- 仅抽取音频（mp3 / aac）
- 任务持久化
- macOS VideoToolbox 硬件加速

### 新增

- 自动更新：`electron-updater` + GitHub Releases（启动检查 / 手动检查 / 下载进度 / 重启安装）

## [1.0.0] - 2026-07-24

### 新增

- 基于 Electron + Vue 3 + TypeScript + Element Plus 的本地视频压缩桌面应用
- 内置 `ffmpeg-static` / `ffprobe-static`，无需系统安装 FFmpeg
- 多文件添加：按钮选择 + 拖拽添加（真实本地路径）
- 压缩预设：高清存档 / 标准压缩 / 微信社交 / 自定义
- 硬件加速：自动 / libx264 / NVENC / QSV / AMF
- 并行编码：可配置并发数 1–4
- 体积对比：原始 / 输出 / 节省比例与汇总
- 多格式输出：mp4 / mkv / mov / webm
- 实时进度（百分比、时间、速度）
- 单任务 / 全部取消
- Windows / macOS 打包配置（electron-builder）
- GitHub Actions：CI 校验与 tag 发版打包

### 说明

- WebM 使用软件 VP9 + Opus，不支持硬件加速
- 硬件编码器依赖本机驱动与 FFmpeg 编译支持

[Unreleased]: https://github.com/example/ffmpeg_tool/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/example/ffmpeg_tool/releases/tag/v1.0.0
