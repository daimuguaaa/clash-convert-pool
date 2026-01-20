# 下载 Mihomo 内核脚本
# 自动从 GitHub 下载并解压对应的内核文件
$ErrorActionPreference = "Stop"

# Version identified from screenshots
$Version = "v1.19.19"
$BaseUrl = "https://github.com/MetaCubeX/mihomo/releases/download/$Version"

# 目标目录
$BinDir = "$PSScriptRoot/../bin"
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir
}

# 需要下载的文件映射
$FilesToDownload = @{
    "mihomo-linux-amd64"  = "mihomo-linux-amd64-v1-$Version.gz"
    "mihomo-darwin-amd64" = "mihomo-darwin-amd64-$Version.gz"
    "mihomo-darwin-arm64" = "mihomo-darwin-arm64-$Version.gz"
    "mihomo-windows-amd64.exe" = "mihomo-windows-amd64-v1-$Version.zip"
}

Write-Host "开始下载 Mihomo $Version 内核..." -ForegroundColor Cyan

foreach ($Key in $FilesToDownload.Keys) {
    $FileName = $FilesToDownload[$Key]
    $Url = "$BaseUrl/$FileName"
    $OutputFile = "$BinDir/$FileName"
    $FinalFile = "$BinDir/$Key"

    # 如果目标文件不存在，则下载
    if (-not (Test-Path $FinalFile)) {
        if (-not (Test-Path $OutputFile)) {
            Write-Host "-> 下载 $FileName ..."
            try {
                Invoke-WebRequest -Uri $Url -OutFile $OutputFile
            } catch {
                Write-Error "下载失败: $_"
                continue
            }
        }

        # 解压
        Write-Host "-> 解压 $FileName ..."
        
        if ($FileName.EndsWith(".zip")) {
            # ZIP 解压 (Windows)
            try {
                $TempExtractDir = Join-Path $BinDir "temp_extract_$Version"
                Expand-Archive -Path $OutputFile -DestinationPath $TempExtractDir -Force
                
                # 查找解压后的 exe 文件 (因为 zip 里面通常还有一层目录或文件名不固定)
                $ExeFile = Get-ChildItem -Path $TempExtractDir -Recurse -Filter "*.exe" | Select-Object -First 1
                if ($ExeFile) {
                    Move-Item -Path $ExeFile.FullName -Destination $FinalFile -Force
                    Write-Host "-> 已保存为 $Key" -ForegroundColor Green
                } else {
                    Write-Error "在 ZIP 中未找到 exe 文件"
                }
                
                # 清理临时目录
                Remove-Item -Path $TempExtractDir -Recurse -Force
                Remove-Item $OutputFile
            } catch {
                Write-Error "ZIP 解压失败: $_"
            }
        } else {
            # GZIP 解压 (Linux/Mac)
            try {
                $InputStream = [System.IO.File]::OpenRead($OutputFile)
                $GzipStream = New-Object System.IO.Compression.GZipStream($InputStream, [System.IO.Compression.CompressionMode]::Decompress)
                $OutputStream = [System.IO.File]::Create($FinalFile)
                $GzipStream.CopyTo($OutputStream)
                
                $OutputStream.Dispose()
                $GzipStream.Dispose()
                $InputStream.Dispose()
                
                Write-Host "-> 已保存为 $Key" -ForegroundColor Green
                
                # 清理 .gz 文件
                Remove-Item $OutputFile
            } catch {
                Write-Error "GZIP 解压失败: $_"
            }
        }
    } else {
        Write-Host "-> $Key 已存在，跳过。" -ForegroundColor Gray
    }
}

Write-Host "下载完成！内核文件位于 bin 目录。" -ForegroundColor Green
