// Package config 提供应用配置管理
package config

import (
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

// Config 应用配置结构
type Config struct {
	// 服务器配置
	ServerPort string

	// 数据库配置
	DataDir    string
	DBFileName string

	// Mihomo 配置
	MihomoBinaryPath string
	MihomoWorkDir    string
}

var (
	globalConfig *Config
	configOnce   sync.Once
)

// GetConfig 获取全局配置（懒加载）
func GetConfig() *Config {
	configOnce.Do(func() {
		globalConfig = initConfig()
	})
	return globalConfig
}

// initConfig 初始化配置
func initConfig() *Config {
	var baseDir string

	// 开发模式下使用当前工作目录
	devMode := os.Getenv("DEV_MODE")
	if devMode == "true" {
		// 获取当前工作目录
		cwd, err := os.Getwd()
		if err != nil {
			cwd = "."
		}
		baseDir = cwd
	} else {
		// 生产模式使用可执行文件所在目录
		execPath, _ := os.Executable()
		baseDir = filepath.Dir(execPath)
	}

	dataDir := filepath.Join(baseDir, "..", "data")
	mihomoWorkDir := filepath.Join(dataDir, "mihomo")

	// 确定 Mihomo 二进制文件名
	mihomoBinary := "mihomo"
	if runtime.GOOS == "windows" {
		mihomoBinary = "mihomo.exe"
	}

	// 搜索可能的路径（按优先级）
	possiblePaths := []string{
		// 1. 上级 bin 目录 (开发环境常用结构: backendgo/../bin)
		filepath.Join(baseDir, "..", "bin", mihomoBinary),
		// 2. bin 子目录 (发布包常用结构)
		filepath.Join(baseDir, "bin", mihomoBinary),
		// 3. 同级目录
		filepath.Join(baseDir, mihomoBinary),
	}

	mihomoBinaryPath := ""
	for _, path := range possiblePaths {
		// 转换为绝对路径以便调试
		absPath, _ := filepath.Abs(path)
		if _, err := os.Stat(absPath); err == nil {
			mihomoBinaryPath = absPath
			break
		}
	}

	// 如果都没找到，默认回退到上级 bin 目录
	if mihomoBinaryPath == "" {
		mihomoBinaryPath, _ = filepath.Abs(filepath.Join(baseDir, "..", "bin", mihomoBinary))
	}

	return &Config{
		ServerPort:       getEnv("SERVER_PORT", "8000"),
		DataDir:          getEnv("DATA_DIR", dataDir),
		DBFileName:       "database.db",
		MihomoBinaryPath: getEnv("MIHOMO_BINARY", mihomoBinaryPath),
		MihomoWorkDir:    getEnv("MIHOMO_WORK_DIR", mihomoWorkDir),
	}
}

// DBPath 返回数据库完整路径
func (c *Config) DBPath() string {
	return filepath.Join(c.DataDir, c.DBFileName)
}

// getEnv 获取环境变量，如果不存在则返回默认值
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// Global 提供向后兼容的访问方式
// 注意：这是一个 getter 函数伪装成变量，实际使用懒加载
var Global = struct {
	ServerPort       string
	DataDir          string
	DBFileName       string
	MihomoBinaryPath string
	MihomoWorkDir    string
}{} // 占位符，会被下面的 init 函数覆盖

func init() {
	// 延迟到 init 阶段再初始化
}

// 直接暴露配置获取函数供其他包使用
func ServerPort() string       { return GetConfig().ServerPort }
func DataDir() string          { return GetConfig().DataDir }
func DBFileName() string       { return GetConfig().DBFileName }
func MihomoBinaryPath() string { return GetConfig().MihomoBinaryPath }
func MihomoWorkDir() string    { return GetConfig().MihomoWorkDir }
func DBPath() string           { return GetConfig().DBPath() }
