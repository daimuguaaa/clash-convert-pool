// Package services 提供核心业务服务
// 代理健康检查服务
package services

import (
	"fmt"
	"io"
	"log"
	"mppm/database"
	"mppm/models"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

// HealthChecker 健康检查器
type HealthChecker struct {
	interval time.Duration
	testURL  string
	timeout  time.Duration
	running  bool
	stopChan chan struct{}
	mu       sync.Mutex
}

var (
	healthChecker     *HealthChecker
	healthCheckerOnce sync.Once
)

// GetHealthChecker 获取健康检查器单例
func GetHealthChecker() *HealthChecker {
	healthCheckerOnce.Do(func() {
		healthChecker = &HealthChecker{
			interval: 2 * time.Minute, // 每2分钟检查一次
			testURL:  "http://www.gstatic.com/generate_204",
			timeout:  10 * time.Second,
			stopChan: make(chan struct{}),
		}
	})
	return healthChecker
}

// Start 启动健康检查器
func (h *HealthChecker) Start() {
	h.mu.Lock()
	if h.running {
		h.mu.Unlock()
		return
	}
	h.running = true
	h.mu.Unlock()

	log.Println("代理健康检查器已启动，检查间隔: 2分钟")

	go func() {
		// 启动后立即执行一次检查
		h.checkAllProxies()

		ticker := time.NewTicker(h.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				h.checkAllProxies()
			case <-h.stopChan:
				log.Println("代理健康检查器已停止")
				return
			}
		}
	}()
}

// Stop 停止健康检查器
func (h *HealthChecker) Stop() {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.running {
		close(h.stopChan)
		h.running = false
		// 重新创建 stopChan 以便重启使用
		h.stopChan = make(chan struct{})
	}
}

// checkAllProxies 检查所有已启用的代理
func (h *HealthChecker) checkAllProxies() {
	db := database.GetDB()
	var proxies []models.ProxyNode

	// 只检查已启用且有本地端口的代理
	if err := db.Where("is_enabled = ? AND local_port IS NOT NULL", true).Find(&proxies).Error; err != nil {
		log.Printf("[健康检查] 查询代理失败: %v", err)
		return
	}

	if len(proxies) == 0 {
		return
	}

	log.Printf("[健康检查] 开始检查 %d 个代理...", len(proxies))

	// 获取测试URL和认证设置（从设置中读取）
	settings := GetOrCreateSettings()
	testURL := settings.TestURL
	if testURL == "" {
		testURL = h.testURL
	}

	// 获取认证信息
	var authUsername, authPassword string
	if settings.AuthUsername != nil {
		authUsername = *settings.AuthUsername
	}
	if settings.AuthPassword != nil {
		authPassword = *settings.AuthPassword
	}

	// 并发检查所有代理
	var wg sync.WaitGroup
	for i := range proxies {
		wg.Add(1)
		go func(proxy *models.ProxyNode) {
			defer wg.Done()
			h.checkSingleProxy(proxy, testURL, authUsername, authPassword)
		}(&proxies[i])
	}
	wg.Wait()

	log.Printf("[健康检查] 检查完成")
}

// checkSingleProxy 检查单个代理
func (h *HealthChecker) checkSingleProxy(proxy *models.ProxyNode, testURL string, authUsername string, authPassword string) {
	if proxy.LocalPort == nil {
		return
	}

	localPort := *proxy.LocalPort
	// 构建代理地址，如果配置了认证则添加认证信息
	var proxyAddr string
	if authUsername != "" && authPassword != "" {
		proxyAddr = fmt.Sprintf("http://%s:%s@127.0.0.1:%d",
			url.QueryEscape(authUsername),
			url.QueryEscape(authPassword),
			localPort)
	} else {
		proxyAddr = "http://127.0.0.1:" + strconv.Itoa(localPort)
	}

	latency, err := h.testProxyLatency(proxyAddr, testURL)

	now := time.Now()
	proxy.LastHealthCheck = &now

	// 健康判定阈值：延迟超过 5000ms 视为不健康
	const maxHealthyLatency = 5000

	if err != nil {
		proxy.HealthStatus = "unhealthy"
		proxy.ProxyLatency = -1
		log.Printf("[健康检查] 代理 %s (:%d) 不可用: %v", proxy.Name, localPort, err)
	} else if latency >= maxHealthyLatency {
		// 请求成功但延迟过高，视为不健康
		proxy.HealthStatus = "unhealthy"
		proxy.ProxyLatency = latency
		log.Printf("[健康检查] 代理 %s (:%d) 延迟过高 (%dms >= %dms), 标记为不健康", proxy.Name, localPort, latency, maxHealthyLatency)
	} else {
		proxy.HealthStatus = "healthy"
		proxy.ProxyLatency = latency
		log.Printf("[健康检查] 代理 %s (:%d) 正常, 延迟: %dms", proxy.Name, localPort, latency)
	}

	// 更新数据库
	db := database.GetDB()
	db.Model(proxy).Updates(map[string]interface{}{
		"health_status":     proxy.HealthStatus,
		"last_health_check": proxy.LastHealthCheck,
		"proxy_latency":     proxy.ProxyLatency,
	})
}

// testProxyLatency 测试代理延迟
func (h *HealthChecker) testProxyLatency(proxyAddr string, testURL string) (int, error) {
	proxyURL, err := url.Parse(proxyAddr)
	if err != nil {
		return 0, err
	}

	client := &http.Client{
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
		},
		Timeout: h.timeout,
	}

	start := time.Now()
	resp, err := client.Get(testURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	// 必须读取响应体以确保完整的代理请求完成
	_, _ = io.ReadAll(resp.Body)

	latency := int(time.Since(start).Milliseconds())

	// 验证响应状态码 (204 No Content 或 2xx 都视为成功)
	if resp.StatusCode != http.StatusNoContent && (resp.StatusCode < 200 || resp.StatusCode >= 300) {
		return latency, fmt.Errorf("代理返回非成功状态码: %d", resp.StatusCode)
	}

	return latency, nil
}

// TestProxyLatencyByIDs 根据 ID 列表测试代理延迟（通过本地端口测试）
func TestProxyLatencyByIDs(ids []int64) (map[int64]int, error) {
	results := make(map[int64]int)
	db := database.GetDB()

	// 获取代理节点
	var proxies []models.ProxyNode
	if err := db.Where("id IN ? AND is_enabled = ? AND local_port IS NOT NULL", ids, true).Find(&proxies).Error; err != nil {
		return results, err
	}

	if len(proxies) == 0 {
		return results, nil
	}

	// 获取测试 URL 和认证设置
	var settings models.Settings
	db.First(&settings)
	testURL := settings.TestURL
	if testURL == "" {
		testURL = "http://www.gstatic.com/generate_204"
	}

	// 获取认证信息
	var authUsername, authPassword string
	if settings.AuthUsername != nil {
		authUsername = *settings.AuthUsername
	}
	if settings.AuthPassword != nil {
		authPassword = *settings.AuthPassword
	}

	// 并发测试
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i := range proxies {
		wg.Add(1)
		go func(proxy *models.ProxyNode) {
			defer wg.Done()

			if proxy.LocalPort == nil {
				return
			}

			localPort := *proxy.LocalPort
			// 构建代理地址，如果配置了认证则添加认证信息
			var proxyAddr string
			if authUsername != "" && authPassword != "" {
				proxyAddr = fmt.Sprintf("http://%s:%s@127.0.0.1:%d",
					url.QueryEscape(authUsername),
					url.QueryEscape(authPassword),
					localPort)
			} else {
				proxyAddr = "http://127.0.0.1:" + strconv.Itoa(localPort)
			}

			latency, err := testProxyLatencyDirect(proxyAddr, testURL)

			now := time.Now()
			proxy.LastHealthCheck = &now

			// 健康判定阈值：延迟超过 5000ms 视为不健康
			const maxHealthyLatency = 5000

			if err != nil {
				proxy.HealthStatus = "unhealthy"
				proxy.ProxyLatency = -1
			} else if latency >= maxHealthyLatency {
				// 请求成功但延迟过高，视为不健康
				proxy.HealthStatus = "unhealthy"
				proxy.ProxyLatency = latency
			} else {
				proxy.HealthStatus = "healthy"
				proxy.ProxyLatency = latency
			}

			// 更新数据库
			db.Model(proxy).Updates(map[string]interface{}{
				"health_status":     proxy.HealthStatus,
				"last_health_check": proxy.LastHealthCheck,
				"proxy_latency":     proxy.ProxyLatency,
			})

			mu.Lock()
			results[proxy.ID] = proxy.ProxyLatency
			mu.Unlock()
		}(&proxies[i])
	}

	wg.Wait()
	return results, nil
}

// testProxyLatencyDirect 直接测试代理延迟（不依赖 HealthChecker 实例）
func testProxyLatencyDirect(proxyAddr string, testURL string) (int, error) {
	proxyURL, err := url.Parse(proxyAddr)
	if err != nil {
		return 0, err
	}

	client := &http.Client{
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
		},
		Timeout: 10 * time.Second,
	}

	start := time.Now()
	resp, err := client.Get(testURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	// 必须读取响应体以确保完整的代理请求完成
	_, _ = io.ReadAll(resp.Body)

	latency := int(time.Since(start).Milliseconds())

	// 验证响应状态码 (204 No Content 或 2xx 都视为成功)
	if resp.StatusCode != http.StatusNoContent && (resp.StatusCode < 200 || resp.StatusCode >= 300) {
		return latency, fmt.Errorf("代理返回非成功状态码: %d", resp.StatusCode)
	}

	return latency, nil
}
