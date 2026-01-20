
<div align="center">
  <h1 align="center">Mihomo Proxy-Pool Manager</h1>
  <p align="center">如果这个项目对你有帮助，请在右上角帮我点个 star</p>
</div>

## ✨ 项目简介

**Mihomo Proxy-Pool Manager (MPPM)** 是一个基于 Go 和 React 开发的轻量级代理池管理工具，专为 Mihomo (Clash Meta) 内核设计。它提供了一个美观的 Web 界面，帮助你轻松管理、测速和优选大量代理节点，并支持 Docker 一键部署。

<img width="100%" alt="主界面" src="https://github.com/user-attachments/assets/cd147c49-1b52-43ae-b944-81117492c6ac" />

## 🚀 核心功能

- **🚀 轻量级架构**: Go 后端 + React 前端，资源占用极低。
- **🐳 一键部署**: 完善的 Docker 支持，开箱即用。
- **⚡ 自动测速**: 基于 Mihomo 内核的真实延迟测试 (URL Test)。
- **🌐 多平台支持**: 完美支持 Windows, macOS, Linux (amd64/arm64)。
- **📦 订阅管理**: 支持多种方式的订阅连接导入，自动解析节点。
- **🔍 节点优选**: 强大的筛选、分组和批量操作功能。
- ⚙️ **API支持**：支持通过api获取可用代理。

## 📸 界面预览

<details>
<summary>点击展开查看更多截图</summary>

### 节点管理
<img width="100%" alt="节点管理" src="https://github.com/user-attachments/assets/5695546a-8534-44c1-b3b6-45e01f13d400" />

### 代理管理
<img width="100%" alt="代理管理" src="https://github.com/user-attachments/assets/f42809ca-c914-4eab-a91e-853972d57091" />

### 系统设置
<img width="100%" alt="系统设置" src="https://github.com/user-attachments/assets/426a7718-1915-4f4d-ac20-d8d0f4ae9f05" />

### 导入节点
<img width="300" alt="导入节点" src="https://github.com/user-attachments/assets/15316937-2554-465e-9543-3842cedba8b0" />

### 启用代理
<img width="300" alt="启用代理" src="https://github.com/user-attachments/assets/93a5425f-1e5b-4b1a-8abc-54491c6d2e4a" />

</details>

## 🛠️ 部署方式

### 方法一：Docker 部署 (推荐)

下载源码，直接使用 Docker Compose 启动：

```
docker compose up -d
```

```yaml
services:
  mppm:
    build: .
    container_name: mppm
    restart: unless-stopped
    ports:
      - "8000:8000" # Web 界面和 API
      # 代理端口需要根据你的配置添加，例如：
      # - "30000:30000"
      # - "30001:30001"
      # 或者使用 network_mode: host 来暴露所有端口
    volumes:
      - ./docker-data:/app/data # 数据持久化
    environment:
      - TZ=Asia/Shanghai
      - GIN_MODE=release
```

### 方法二：直接运行 (Windows/Linux/macOS)

1. 在 [Releases](https://github.com/yourusername/mppm/releases) 页面下载对应系统的压缩包。
2. 解压后，确保 `mppm` (或 `mppm.exe`) 和 `bin/` 目录在同一层级。
3. 运行程序，访问 `http://localhost:8000`。
   - 默认账号: `admin`
   - 默认密码: `admin`

## 📡 API 文档

### `GET` /api/proxies/active

获取所有可用的代理节点列表（延迟小于5秒的健康代理），返回包含服务器IP、本地端口、认证信息等详细数据的JSON数组。

```bash
curl -X GET "http://localhost:8000/api/proxies/active" \
  -H "Authorization: <token>"
```

### `GET` /api/proxies/active/random

随机获取一个可用的代理节点（延迟小于5秒的健康代理），返回单个节点详情。

```bash
curl -X GET "http://localhost:8000/api/proxies/active/random" \
  -H "Authorization: <token>"
```

### `GET` /api/proxies/all

获取所有已开启的代理节点（不管健康状态），返回包含延迟和健康状态的完整信息。

```bash
curl -X GET "http://localhost:8000/api/proxies/all" \
  -H "Authorization: <token>"
```

### 响应数据结构示例

> Token 可在系统设置 - 认证配置中查看

**`/api/proxies/active` 和 `/api/proxies/active/random` 响应格式：**

```json
{
  "host_ip": "192.168.1.100",      // 连接服务器IP
  "local_port": 10001,             // 代理监听端口
  "remark": "香港节点01",           // 备注
  "server_info": "us.example.com", // 节点服务器地址
  "auth_username": "user",         // 认证用户名
  "auth_password": "pass",         // 认证密码
  "group_name": "默认分组",         // 分组名称
  "tag_name": "VIP",               // 标签名称
  "node_name": "US Node 01",       // 节点名称
  "protocol": "vmess"              // 原协议
}
```

**`/api/proxies/all` 响应格式（额外包含延迟和状态）：**

```json
{
  "host_ip": "192.168.1.100",
  "local_port": 10001,
  "remark": "香港节点01",
  "server_info": "us.example.com",
  "auth_username": "user",
  "auth_password": "pass",
  "group_name": "默认分组",
  "tag_name": "VIP",
  "node_name": "US Node 01",
  "protocol": "vmess",
  "latency": 256,                  // 延迟（毫秒），-1 表示未检测
  "health_status": "healthy"       // 健康状态：healthy/unhealthy/unknown
}
```

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
$env:DEV_MODE = "true"
go run .
```

## 📜 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
