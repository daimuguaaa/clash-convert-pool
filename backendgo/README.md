# MPPM Go Backend

Mihomo Proxy-Pool Manager 的 Go 后端实现。

## 项目结构

```
backendgo/
├── main.go              # 主入口
├── go.mod               # Go 模块定义
├── Dockerfile           # Docker 构建文件
├── config/              # 配置管理
│   └── config.go
├── database/            # 数据库初始化
│   └── database.go
├── models/              # 数据模型
│   └── proxy.go
├── handlers/            # API 处理器
│   └── handlers.go
└── services/            # 业务服务
    ├── mihomo.go        # Mihomo 进程管理
    ├── importer.go      # 订阅导入
    └── tester.go        # 代理测速
```

## 技术栈

- **Web 框架**: Gin
- **ORM**: GORM + SQLite
- **YAML 解析**: gopkg.in/yaml.v3
- **CORS**: gin-contrib/cors

## 开发

### 本地运行

```bash
cd backendgo
go mod tidy
go run .
```

或使用 PowerShell 脚本：

```powershell
.\scripts\dev_backend_go.ps1
```

### 构建

```bash
cd backendgo
go build -o mppm-backend .
```

### Docker 构建

```bash
cd backendgo
docker build -t mppm-backend:latest .
```

## API 端点

与 Python 版本完全兼容：

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /api/proxies | 获取代理列表 |
| GET | /api/proxies/tags | 获取所有标签 |
| PUT | /api/proxies/tags/:old_tag | 重命名标签 |
| POST | /api/proxies/import | 导入节点 |
| POST | /api/proxies/test | 批量测速 |
| PUT | /api/proxies/:id | 更新代理 |
| DELETE | /api/proxies | 删除代理 |
| POST | /api/proxies/batch-enable | 批量启用 |
| POST | /api/proxies/batch-disable | 批量禁用 |
| GET | /api/settings | 获取设置 |
| PUT | /api/settings | 更新设置 |
| GET | /api/mihomo/status | Mihomo 状态 |
| POST | /api/mihomo/stop | 停止 Mihomo |

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| SERVER_PORT | 8000 | API 服务端口 |
| DATA_DIR | ../data | 数据目录 |
| MIHOMO_BINARY | ../bin/mihomo | Mihomo 二进制路径 |
| MIHOMO_WORK_DIR | ../data/mihomo | Mihomo 工作目录 |
| DEV_MODE | false | 开发模式 |
| GIN_MODE | release | Gin 运行模式 |

## 与 Python 版本的兼容性

- 使用相同的 SQLite 数据库结构
- API 端点完全兼容
- 可无缝切换使用
