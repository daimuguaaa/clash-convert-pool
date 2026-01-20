# 多阶段构建 - 精简版
# Stage 1: 构建前端
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# Stage 2: 构建后端
FROM golang:1.22-alpine AS backend-builder
WORKDIR /app
# 安装必要工具
RUN apk add --no-cache git

# 复制 Go 模块文件并下载依赖
COPY backendgo/go.mod backendgo/go.sum ./backendgo/
WORKDIR /app/backendgo
RUN go mod download

# 复制前端构建产物到 static 目录
COPY --from=frontend-builder /app/frontend/dist ./static/

# 复制后端源代码
COPY backendgo/ ./

# 编译后端
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/mppm .

# Stage 3: 最终运行镜像
FROM alpine:3.19
WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache ca-certificates tzdata wget

# 创建目录结构（必须在下载文件之前）
RUN mkdir -p /app/bin /app/data

# 下载 mihomo 内核 (Linux amd64)
ARG MIHOMO_VERSION=v1.19.19
RUN wget -q "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-amd64-v1-${MIHOMO_VERSION}.gz" -O /tmp/mihomo.gz \
    && gunzip /tmp/mihomo.gz \
    && mv /tmp/mihomo /app/bin/mihomo \
    && chmod +x /app/bin/mihomo

# 从构建阶段复制二进制文件
COPY --from=backend-builder /app/mppm /app/mppm

# 设置时区
ENV TZ=Asia/Shanghai
# 设置 Gin 为发布模式
ENV GIN_MODE=release

# 暴露端口
EXPOSE 8000

# 数据持久化
VOLUME ["/app/data"]

# 启动命令
CMD ["/app/mppm"]
