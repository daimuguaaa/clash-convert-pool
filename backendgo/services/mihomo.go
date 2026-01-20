// Package services 提供核心业务服务
// Mihomo 进程管理和 API 调用服务
package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mppm/config"
	"mppm/models"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// MihomoManager Mihomo 进程管理器
type MihomoManager struct {
	binaryPath     string
	workDir        string
	configPath     string
	process        *exec.Cmd
	controllerHost string
	controllerPort int
	secret         string
	mu             sync.Mutex
}

// mihomoManager 全局单例
var mihomoManager *MihomoManager
var mihomoOnce sync.Once

// GetMihomoManager 获取 MihomoManager 单例
func GetMihomoManager() *MihomoManager {
	mihomoOnce.Do(func() {
		cfg := config.GetConfig()
		workDir := cfg.MihomoWorkDir

		// 确保工作目录存在
		os.MkdirAll(workDir, 0755)

		mihomoManager = &MihomoManager{
			binaryPath:     cfg.MihomoBinaryPath,
			workDir:        workDir,
			configPath:     filepath.Join(workDir, "config.yaml"),
			controllerHost: "127.0.0.1",
			controllerPort: 9090,
			secret:         "mppm_secret",
		}
	})
	return mihomoManager
}

// UpdateControllerPort 更新控制器端口
func (m *MihomoManager) UpdateControllerPort(port int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.controllerPort = port
}

// apiBaseURL 返回 API 基础 URL
func (m *MihomoManager) apiBaseURL() string {
	return fmt.Sprintf("http://%s:%d", m.controllerHost, m.controllerPort)
}

// apiHeaders 返回 API 请求头
func (m *MihomoManager) apiHeaders() map[string]string {
	return map[string]string{
		"Authorization": fmt.Sprintf("Bearer %s", m.secret),
	}
}

// IsPortAvailable 检查端口是否可用
func IsPortAvailable(port int) bool {
	address := fmt.Sprintf("127.0.0.1:%d", port)
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

// checkPortsAvailable 检查所有监听器端口是否可用
func checkPortsAvailable(listeners []ListenerConfig) []int {
	var occupiedPorts []int
	for _, listener := range listeners {
		if !IsPortAvailable(listener.Port) {
			occupiedPorts = append(occupiedPorts, listener.Port)
		}
	}
	return occupiedPorts
}

// MihomoConfig Mihomo 配置结构
type MihomoConfig struct {
	ExternalController string                   `yaml:"external-controller"`
	Secret             string                   `yaml:"secret"`
	LogLevel           string                   `yaml:"log-level"`
	Mode               string                   `yaml:"mode"`
	Proxies            []map[string]interface{} `yaml:"proxies"`
	Listeners          []ListenerConfig         `yaml:"listeners"`
	Rules              []string                 `yaml:"rules"`
}

// ListenerConfig 监听器配置
type ListenerConfig struct {
	Name   string         `yaml:"name"`
	Type   string         `yaml:"type"`
	Port   int            `yaml:"port"`
	Listen string         `yaml:"listen"`
	Proxy  string         `yaml:"proxy"`
	Users  []ListenerUser `yaml:"users,omitempty"`
}

// ListenerUser 监听器用户认证信息
type ListenerUser struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// GenerateConfig 生成 Mihomo 配置文件
// 返回配置的监听器数量
func (m *MihomoManager) GenerateConfig(proxies []models.ProxyNode, settings *models.Settings) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var listeners []ListenerConfig
	var proxyConfigs []map[string]interface{}

	// 从 settings 获取配置
	apiPort := 9090
	var authUsername, authPassword string
	if settings != nil {
		apiPort = settings.MihomoAPIPort
		if settings.AuthUsername != nil {
			authUsername = *settings.AuthUsername
		}
		if settings.AuthPassword != nil {
			authPassword = *settings.AuthPassword
		}
	}

	// 更新控制器端口
	m.controllerPort = apiPort

	for _, proxy := range proxies {
		// 解析存储的代理配置
		var proxyConfig map[string]interface{}
		if err := yaml.Unmarshal([]byte(proxy.Config), &proxyConfig); err != nil {
			log.Printf("解析代理 %s 配置失败: %v", proxy.Name, err)
			continue
		}
		proxyConfigs = append(proxyConfigs, proxyConfig)

		// 如果节点已启用且分配了端口，添加监听器
		if proxy.IsEnabled && proxy.LocalPort != nil {
			// 先检查端口是否可用
			if !IsPortAvailable(*proxy.LocalPort) {
				return 0, fmt.Errorf("端口 %d 已被占用，无法启动代理 %s", *proxy.LocalPort, proxy.Name)
			}

			proxyName, _ := proxyConfig["name"].(string)
			if proxyName == "" {
				proxyName = proxy.Name
			}

			listener := ListenerConfig{
				Name:   fmt.Sprintf("inbound_%d", *proxy.LocalPort),
				Type:   "mixed", // 同时支持 HTTP 和 SOCKS5
				Port:   *proxy.LocalPort,
				Listen: "0.0.0.0",
				Proxy:  proxyName,
			}

			// 添加认证
			if authUsername != "" && authPassword != "" {
				listener.Users = []ListenerUser{{Username: authUsername, Password: authPassword}}
				log.Printf("监听器 %s 添加认证: %s:***", listener.Name, authUsername)
			} else {
				log.Printf("监听器 %s 无认证 (用户名=%q, 密码=%q)", listener.Name, authUsername, authPassword)
			}

			listeners = append(listeners, listener)
		}
	}

	// 构建配置
	cfg := MihomoConfig{
		ExternalController: fmt.Sprintf("%s:%d", m.controllerHost, apiPort),
		Secret:             m.secret,
		LogLevel:           "info",
		Mode:               "rule",
		Proxies:            proxyConfigs,
		Listeners:          listeners,
		Rules:              []string{"MATCH,DIRECT"},
	}

	// 确保工作目录存在
	if err := os.MkdirAll(m.workDir, 0755); err != nil {
		return 0, fmt.Errorf("创建工作目录失败: %v", err)
	}

	// 写入配置文件
	data, err := yaml.Marshal(&cfg)
	if err != nil {
		return 0, fmt.Errorf("序列化配置失败: %v", err)
	}

	if err := os.WriteFile(m.configPath, data, 0644); err != nil {
		return 0, fmt.Errorf("写入配置文件失败: %v", err)
	}

	log.Printf("生成配置: %d 个代理, %d 个监听器, API端口: %d", len(proxyConfigs), len(listeners), apiPort)
	return len(listeners), nil
}

// Start 启动 Mihomo 进程
func (m *MihomoManager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 检查二进制文件是否存在
	if _, err := os.Stat(m.binaryPath); os.IsNotExist(err) {
		return fmt.Errorf("Mihomo 二进制文件不存在: %s", m.binaryPath)
	}

	// 检查是否已在运行
	if m.isRunningLocked() {
		log.Println("Mihomo 已在运行中")
		return nil
	}

	// 检查配置文件是否存在
	if _, err := os.Stat(m.configPath); os.IsNotExist(err) {
		return fmt.Errorf("Mihomo 配置文件不存在: %s", m.configPath)
	}

	// 构建命令
	cmd := exec.Command(m.binaryPath, "-d", m.workDir, "-f", m.configPath)

	// 跨平台处理：Windows 下隐藏控制台窗口
	setSysProcAttr(cmd)

	// 启动进程
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动 Mihomo 失败: %v", err)
	}

	m.process = cmd
	log.Printf("Mihomo 进程已启动, PID: %d, API端口: %d", cmd.Process.Pid, m.controllerPort)

	// 启动后台 goroutine 等待进程结束
	go func() {
		cmd.Wait()
		m.mu.Lock()
		if m.process == cmd {
			m.process = nil
			log.Println("Mihomo 进程已退出")
		}
		m.mu.Unlock()
	}()

	// 等待并验证 Mihomo 是否成功启动
	time.Sleep(500 * time.Millisecond)

	// 检查进程是否还在运行
	if m.process.ProcessState != nil && m.process.ProcessState.Exited() {
		return fmt.Errorf("Mihomo 启动后立即退出，可能是配置错误或端口被占用")
	}

	// 尝试连接 API 验证服务是否正常
	apiURL := fmt.Sprintf("%s/version", m.apiBaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err == nil {
		for k, v := range m.apiHeaders() {
			req.Header.Set(k, v)
		}
		client := &http.Client{}
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				log.Println("Mihomo API 验证成功")
				return nil
			}
		}
	}

	log.Println("警告: Mihomo 进程已启动但 API 验证失败，可能需要更多时间初始化")
	return nil
}

// Stop 停止 Mihomo 进程
func (m *MihomoManager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.process != nil && m.process.Process != nil {
		// 在 Windows 上直接 Kill，因为 SIGTERM 不被支持
		if err := m.process.Process.Kill(); err != nil {
			log.Printf("终止 Mihomo 进程失败: %v", err)
		}

		// 等待进程结束（最多3秒）
		done := make(chan error, 1)
		go func() {
			done <- m.process.Wait()
		}()

		select {
		case <-done:
			// 进程已结束
			log.Println("Mihomo 进程已正常退出")
		case <-time.After(3 * time.Second):
			log.Println("等待 Mihomo 进程结束超时")
		}

		// 额外等待一小段时间确保端口完全释放
		time.Sleep(200 * time.Millisecond)

		log.Println("Mihomo 已停止，端口已释放")
		m.process = nil
	}
}

// IsRunning 检查 Mihomo 是否在运行
func (m *MihomoManager) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.isRunningLocked()
}

// isRunningLocked 内部检查（需要已持有锁）
func (m *MihomoManager) isRunningLocked() bool {
	if m.process == nil || m.process.Process == nil {
		return false
	}
	// 检查进程是否还在运行
	if m.process.ProcessState != nil && m.process.ProcessState.Exited() {
		return false
	}
	return true
}

// Restart 使用新配置重启 Mihomo
func (m *MihomoManager) Restart(proxies []models.ProxyNode, settings *models.Settings) error {
	m.Stop()

	listenerCount, err := m.GenerateConfig(proxies, settings)
	if err != nil {
		return err
	}

	if listenerCount > 0 {
		if err := m.Start(); err != nil {
			return err
		}
		// 等待 Mihomo 启动完成
		time.Sleep(1 * time.Second)
	} else {
		log.Println("没有活跃的监听器，不启动 Mihomo")
	}

	return nil
}

// RestartForTest 重启 Mihomo 用于测速（无需监听器也可启动）
func (m *MihomoManager) RestartForTest(proxies []models.ProxyNode, settings *models.Settings) error {
	m.Stop()

	_, err := m.GenerateConfigForTest(proxies, settings)
	if err != nil {
		return err
	}

	if err := m.Start(); err != nil {
		return err
	}
	// 等待 Mihomo 启动完成
	time.Sleep(1 * time.Second)

	return nil
}

// GenerateConfigForTest 生成测速专用配置（只需要代理配置，不需要监听器）
func (m *MihomoManager) GenerateConfigForTest(proxies []models.ProxyNode, settings *models.Settings) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var proxyConfigs []map[string]interface{}

	// 从 settings 获取配置
	apiPort := 9090
	if settings != nil {
		apiPort = settings.MihomoAPIPort
	}

	// 更新控制器端口
	m.controllerPort = apiPort

	for _, proxy := range proxies {
		// 解析存储的代理配置
		var proxyConfig map[string]interface{}
		if err := yaml.Unmarshal([]byte(proxy.Config), &proxyConfig); err != nil {
			log.Printf("解析代理 %s 配置失败: %v", proxy.Name, err)
			continue
		}
		proxyConfigs = append(proxyConfigs, proxyConfig)
	}

	// 构建配置（不带监听器，用于测速）
	cfg := MihomoConfig{
		ExternalController: fmt.Sprintf("%s:%d", m.controllerHost, apiPort),
		Secret:             m.secret,
		LogLevel:           "info",
		Mode:               "rule",
		Proxies:            proxyConfigs,
		Listeners:          nil, // 测速时不需要监听器
		Rules:              []string{"MATCH,DIRECT"},
	}

	// 确保工作目录存在
	if err := os.MkdirAll(m.workDir, 0755); err != nil {
		return 0, fmt.Errorf("创建工作目录失败: %v", err)
	}

	// 写入配置文件
	data, err := yaml.Marshal(&cfg)
	if err != nil {
		return 0, fmt.Errorf("序列化配置失败: %v", err)
	}

	if err := os.WriteFile(m.configPath, data, 0644); err != nil {
		return 0, fmt.Errorf("写入配置文件失败: %v", err)
	}

	log.Printf("生成测速配置: %d 个代理, API端口: %d", len(proxyConfigs), apiPort)
	return len(proxyConfigs), nil
}

// StartWithProxies 启动 Mihomo 并加载指定的代理配置
func (m *MihomoManager) StartWithProxies(proxies []models.ProxyNode, settings *models.Settings) error {
	m.Stop()

	listenerCount, err := m.GenerateConfig(proxies, settings)
	if err != nil {
		return err
	}

	if listenerCount == 0 {
		return fmt.Errorf("没有需要启动的代理监听器")
	}

	if err := m.Start(); err != nil {
		return err
	}

	// 等待启动
	time.Sleep(1 * time.Second)
	return nil
}

// ProxyDelayResponse 延迟测试响应
type ProxyDelayResponse struct {
	Delay int `json:"delay"`
}

// TestProxyDelay 测试代理延迟
func (m *MihomoManager) TestProxyDelay(proxyName string, testURL string, timeoutMs int) (int, error) {
	if !m.IsRunning() {
		return -1, fmt.Errorf("Mihomo 未运行")
	}

	// URL 编码代理名称
	encodedName := url.PathEscape(proxyName)
	apiURL := fmt.Sprintf("%s/proxies/%s/delay?timeout=%d&url=%s",
		m.apiBaseURL(), encodedName, timeoutMs, url.QueryEscape(testURL))

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs+5000)*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return -1, err
	}

	for k, v := range m.apiHeaders() {
		req.Header.Set(k, v)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return -1, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return -1, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return -1, err
	}

	var result ProxyDelayResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return -1, err
	}

	return result.Delay, nil
}

// TestMultipleProxies 批量测试多个代理的延迟
func (m *MihomoManager) TestMultipleProxies(proxyNames []string, testURL string, timeoutMs int, concurrency int) map[string]int {
	results := make(map[string]int)
	resultsMu := sync.Mutex{}

	// 信号量控制并发
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for _, name := range proxyNames {
		wg.Add(1)
		go func(proxyName string) {
			defer wg.Done()
			sem <- struct{}{}        // 获取信号量
			defer func() { <-sem }() // 释放信号量

			delay, err := m.TestProxyDelay(proxyName, testURL, timeoutMs)
			if err != nil {
				delay = -1
			}

			resultsMu.Lock()
			results[proxyName] = delay
			resultsMu.Unlock()
		}(name)
	}

	wg.Wait()
	return results
}

// ProxyInfo Mihomo 代理信息
type ProxyInfo struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// GetAllProxies 获取 Mihomo 中所有代理的信息
func (m *MihomoManager) GetAllProxies() ([]ProxyInfo, error) {
	if !m.IsRunning() {
		return nil, nil
	}

	apiURL := fmt.Sprintf("%s/proxies", m.apiBaseURL())

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	for k, v := range m.apiHeaders() {
		req.Header.Set(k, v)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Proxies map[string]ProxyInfo `json:"proxies"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	// 过滤出实际的代理节点
	var proxies []ProxyInfo
	specialTypes := map[string]bool{
		"Direct":      true,
		"Reject":      true,
		"Selector":    true,
		"URLTest":     true,
		"Fallback":    true,
		"LoadBalance": true,
	}

	for _, p := range result.Proxies {
		if !specialTypes[p.Type] {
			proxies = append(proxies, p)
		}
	}

	return proxies, nil
}

// ReloadConfig 热重载 Mihomo 配置
func (m *MihomoManager) ReloadConfig() error {
	if !m.IsRunning() {
		return fmt.Errorf("Mihomo 未运行")
	}

	apiURL := fmt.Sprintf("%s/configs", m.apiBaseURL())

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	payload := map[string]string{"path": m.configPath}
	data, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, "PUT", apiURL, bytes.NewReader(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	for k, v := range m.apiHeaders() {
		req.Header.Set(k, v)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("重载失败: HTTP %d", resp.StatusCode)
	}

	return nil
}

// MihomoStatus Mihomo 状态信息
type MihomoStatus struct {
	Running    bool   `json:"running"`
	PID        *int   `json:"pid"`
	APIPort    int    `json:"api_port"`
	ConfigPath string `json:"config_path"`
}

// GetStatus 获取 Mihomo 运行状态
func (m *MihomoManager) GetStatus() MihomoStatus {
	m.mu.Lock()
	defer m.mu.Unlock()

	status := MihomoStatus{
		Running:    m.isRunningLocked(),
		APIPort:    m.controllerPort,
		ConfigPath: m.configPath,
	}

	if m.process != nil && m.process.Process != nil {
		pid := m.process.Process.Pid
		status.PID = &pid
	}

	return status
}

// ConnectionsResponse Mihomo 连接API响应（用于获取全局流量统计）
type ConnectionsResponse struct {
	DownloadTotal int64 `json:"downloadTotal"`
	UploadTotal   int64 `json:"uploadTotal"`
}

// GetGlobalTraffic 获取 Mihomo 的全局流量统计（downloadTotal/uploadTotal）
// 注意：不依赖 IsRunning() 检查，直接尝试调用 API，因为进程引用可能在后端重启后丢失
func (m *MihomoManager) GetGlobalTraffic() (int64, int64, error) {
	apiURL := fmt.Sprintf("%s/connections", m.apiBaseURL())

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return 0, 0, err
	}

	for k, v := range m.apiHeaders() {
		req.Header.Set(k, v)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		// API 调用失败，可能是 Mihomo 未运行，静默返回
		return 0, 0, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, 0, nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, 0, err
	}

	var result ConnectionsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, 0, err
	}

	return result.DownloadTotal, result.UploadTotal, nil
}
