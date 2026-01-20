# 编译发布脚本
# 设置错误时停止
$ErrorActionPreference = "Stop"

Write-Host "1. 开始构建前端..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot/../frontend"
npm install
npm run build
Pop-Location

Write-Host "2. 复制前端静态文件到后端..." -ForegroundColor Cyan
$BackendStaticDir = "$PSScriptRoot/../backendgo/static"
# 清理旧文件 (保留 .gitkeep 等如果是为了占位，但这里直接全覆盖)
if (Test-Path $BackendStaticDir) {
    Remove-Item -Path "$BackendStaticDir/*" -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $BackendStaticDir
}
Copy-Item -Path "$PSScriptRoot/../frontend/dist/*" -Destination $BackendStaticDir -Recurse -Force

Write-Host "3. 开始交叉编译 Go 后端..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot/../backendgo"

# 创建输出目录
$OutDir = "$PSScriptRoot/../build"
if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir
}

# 3.1 Windows AMD64
Write-Host "-> 打包 Windows (amd64)..."
$WinDir = "$OutDir/windows-amd64"
New-Item -ItemType Directory -Path "$WinDir/bin" -Force | Out-Null
$env:CGO_ENABLED="0"
$env:GOOS="windows"
$env:GOARCH="amd64"
go build -ldflags "-s -w" -o "$WinDir/mppm.exe" .
if (Test-Path "$PSScriptRoot/../bin/mihomo.exe") {
    Copy-Item "$PSScriptRoot/../bin/mihomo.exe" "$WinDir/bin/mihomo.exe"
}

# 3.2 Linux AMD64
Write-Host "-> 打包 Linux (amd64)..."
$LinDir = "$OutDir/linux-amd64"
New-Item -ItemType Directory -Path "$LinDir/bin" -Force | Out-Null
$env:CGO_ENABLED="0"
$env:GOOS="linux"
$env:GOARCH="amd64"
go build -ldflags "-s -w" -o "$LinDir/mppm" .
if (Test-Path "$PSScriptRoot/../bin/mihomo-linux-amd64") {
    Copy-Item "$PSScriptRoot/../bin/mihomo-linux-amd64" "$LinDir/bin/mihomo"
}

# 3.3 macOS AMD64 (Intel)
Write-Host "-> 打包 macOS (amd64)..."
$MacIntelDir = "$OutDir/macos-amd64"
New-Item -ItemType Directory -Path "$MacIntelDir/bin" -Force | Out-Null
$env:CGO_ENABLED="0"
$env:GOOS="darwin"
$env:GOARCH="amd64"
go build -ldflags "-s -w" -o "$MacIntelDir/mppm" .
if (Test-Path "$PSScriptRoot/../bin/mihomo-darwin-amd64") {
    Copy-Item "$PSScriptRoot/../bin/mihomo-darwin-amd64" "$MacIntelDir/bin/mihomo"
}

# 3.4 macOS ARM64 (Apple Silicon)
Write-Host "-> 打包 macOS (arm64)..."
$MacArmDir = "$OutDir/macos-arm64"
New-Item -ItemType Directory -Path "$MacArmDir/bin" -Force | Out-Null
$env:CGO_ENABLED="0"
$env:GOOS="darwin"
$env:GOARCH="arm64"
go build -ldflags "-s -w" -o "$MacArmDir/mppm" .
if (Test-Path "$PSScriptRoot/../bin/mihomo-darwin-arm64") {
    Copy-Item "$PSScriptRoot/../bin/mihomo-darwin-arm64" "$MacArmDir/bin/mihomo"
}

Pop-Location

Write-Host "4. 清理临时文件..." -ForegroundColor Cyan
# 清理可能生成的临时文件
$TempFiles = @(
    "$PSScriptRoot/../backendgo/test_build",
    "$PSScriptRoot/../backendgo/test_build.exe"
)
foreach ($TempFile in $TempFiles) {
    if (Test-Path $TempFile) {
        Remove-Item -Path $TempFile -Force
        Write-Host "   已删除: $TempFile"
    }
}

Write-Host "5. 压缩发布包..." -ForegroundColor Cyan
$Platforms = @("windows-amd64", "linux-amd64", "macos-amd64", "macos-arm64")
foreach ($Platform in $Platforms) {
    $SourceDir = "$OutDir/$Platform"
    if (Test-Path $SourceDir) {
        $ZipFile = "$OutDir/mppm-$Platform.zip"
        # 如果已存在先删除
        if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }
        
        Write-Host "   正在压缩: $Platform -> $ZipFile"
        Compress-Archive -Path "$SourceDir/*" -DestinationPath $ZipFile
    }
}

Write-Host "构建完成！Zip 包文件已生成在 build 目录。" -ForegroundColor Green
Write-Host "注意：部署时请确保下载对应平台的 mihomo 二进制文件并放置在 bin 目录中。" -ForegroundColor Yellow

