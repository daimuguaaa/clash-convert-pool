# 开发环境启动脚本
# 设置开发模式环境变量
$env:DEV_MODE = "true"
$env:GIN_MODE = "debug"

# 切换到 backendgo 目录
Set-Location -Path $PSScriptRoot\..\backendgo

# 下载依赖
Write-Host "正在下载依赖..." -ForegroundColor Cyan
go mod tidy

# 启动服务
Write-Host "启动 Go 后端服务..." -ForegroundColor Green
go run .
