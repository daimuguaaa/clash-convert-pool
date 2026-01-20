# MPPM Docker 部署指南

## 快速开始

### 前提条件
- 安装 [Docker](https://docs.docker.com/get-docker/)
- 安装 [Docker Compose](https://docs.docker.com/compose/install/)（Docker Desktop 已包含）

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/proxypool.git
cd proxypool

# 2. 构建并启动（后台运行）
docker compose up -d --build

# 3. 查看运行状态
docker compose ps

# 4. 查看日志
docker compose logs -f
```

### 访问服务
- **Web 界面**: http://localhost:8000
- **默认账号**: admin
- **默认密码**: admin

---

## 配置说明

### docker-compose.yml

```yaml
services:
  mppm:
    build: .
    container_name: mppm
    restart: unless-stopped    # 支持自动重启
    ports:
      - "8000:8000"            # Web 界面
      # 代理端口根据需要添加：
      # - "30000:30000"
      # - "30001:30001"
    volumes:
      - ./docker-data:/app/data   # 数据持久化
    environment:
      - TZ=Asia/Shanghai
      - GIN_MODE=release
```

### 关于代理端口

代理端口是动态配置的，有两种方式暴露：

**方式一：手动指定端口（推荐）**
```yaml
ports:
  - "8000:8000"
  - "30000:30000"
  - "30001:30001"
  - "30002:30002"
```

**方式二：使用 host 网络模式**
```yaml
services:
  mppm:
    build: .
    container_name: mppm
    restart: unless-stopped
    network_mode: host         # 直接使用宿主机网络
    volumes:
      - ./docker-data:/app/data
    environment:
      - TZ=Asia/Shanghai
      - GIN_MODE=release
```
> 注意：host 模式下不需要配置 ports，所有端口直接暴露

---

## 常用命令

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose down

# 重启服务
docker compose restart

# 查看日志
docker compose logs -f

# 重新构建（代码更新后）
docker compose up -d --build

# 进入容器调试
docker exec -it mppm sh
```

---

## 数据备份与恢复

数据存储在 `./docker-data` 目录中，包含：
- `database.db` - SQLite 数据库（节点配置、设置等）
- `mihomo/` - Mihomo 运行时配置

### 备份
```bash
# 停止服务
docker compose down

# 备份数据目录
tar -czvf mppm-backup-$(date +%Y%m%d).tar.gz docker-data/

# 重新启动
docker compose up -d
```

### 恢复
```bash
# 停止服务
docker compose down

# 恢复数据
tar -xzvf mppm-backup-20260120.tar.gz

# 启动服务
docker compose up -d
```

---

## 更新升级

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker compose up -d --build
```
> 数据不会丢失，因为数据存储在 volume 挂载的目录中

---

## 自动启动配置

`docker-compose.yml` 中已配置 `restart: unless-stopped`：
- 容器会在 Docker 服务启动时自动启动
- 容器崩溃后会自动重启
- 只有手动执行 `docker compose down` 才会停止

确保 Docker 服务开机自启：
```bash
# Linux
sudo systemctl enable docker

# Windows/Mac
# Docker Desktop 设置中勾选 "Start Docker Desktop when you log in"
```

---

## 故障排查

### 端口被占用
```bash
# 查看端口占用
netstat -tlnp | grep 8000

# 修改 docker-compose.yml 中的端口映射
ports:
  - "9000:8000"  # 外部使用 9000 端口
```

### 容器无法启动
```bash
# 查看详细日志
docker compose logs mppm

# 查看容器状态
docker ps -a
```

### 重置所有数据
```bash
docker compose down
rm -rf docker-data/
docker compose up -d --build
```
