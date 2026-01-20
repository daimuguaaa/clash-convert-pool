
<div align="center">
  <h1 align="center">Mihomo Proxy-Pool Manager</h1>
  <p align="center">如果这个项目对你有帮助，请在右上角帮我点个 star</p>
  <img src="https://img.shields.io/github/stars/yourusername/mppm?style=flat-square" alt="stars">
  <img src="https://img.shields.io/github/forks/yourusername/mppm?style=flat-square" alt="forks">
  <img src="https://img.shields.io/github/issues/yourusername/mppm?style=flat-square" alt="issues">
  <img src="https://img.shields.io/github/license/yourusername/mppm?style=flat-square" alt="license">
</div>

## ✨ 项目简介

**Mihomo Proxy-Pool Manager (MPPM)** 是一个基于 Go 和 React 开发的轻量级代理池管理工具，专为 Mihomo (Clash Meta) 内核设计。它提供了一个美观的 Web 界面，帮助你轻松管理、测速和优选大量代理节点，并支持 Docker 一键部署。

![image](https://github.com/user-attachments/assets/placeholder)

## 🚀 核心功能

- **🚀 轻量级架构**: Go 后端 + React 前端，资源占用极低。
- **🐳 一键部署**: 完善的 Docker 支持，开箱即用。
- **⚡ 自动测速**: 基于 Mihomo 内核的真实延迟测试 (URL Test)。
- **🌐 多平台支持**: 完美支持 Windows, macOS, Linux (amd64/arm64)。
- **📦 订阅管理**: 支持导入各种格式的订阅链接，自动解析节点。
- **🔍 节点优选**: 强大的筛选、分组和批量操作功能。

## 🛠️ 部署方式

### 方法一：Docker 部署 (推荐)

无需下载源码，直接使用 Docker Compose 启动：

```yaml
services:
  mppm:
    image: yourusername/mppm:latest
    container_name: mppm
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
```

### 方法二：直接运行 (Windows/Linux/macOS)

1. 在 [Releases](https://github.com/yourusername/mppm/releases) 页面下载对应系统的压缩包。
2. 解压后，确保 `mppm` (或 `mppm.exe`) 和 `bin/` 目录在同一层级。
3. 运行程序，访问 `http://localhost:8000`。
   - 默认账号: `admin`
   - 默认密码: `admin`

## ⚙️ 开发指南

如果你想参与开发或二次修改：

### 环境要求
- Go 1.22+
- Node.js 20+

### 运行
```bash
# 1. 前端
cd frontend
npm install
npm run dev

# 2. 后端
cd backendgo
go run .
```

## 📜 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

## Star History

<a href="https://star-history.com/#yourusername/mppm&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=yourusername/mppm&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=yourusername/mppm&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=yourusername/mppm&type=Date" />
 </picture>
</a>
