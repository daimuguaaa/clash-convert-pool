// Package services - 代理节点测速服务
package services

import (
	"fmt"
	"log"
	"mppm/database"
	"mppm/models"
	"net"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// GetTestSettings 获取测速配置
func GetTestSettings() (string, int) {
	db := database.GetDB()
	var settings models.Settings

	if err := db.First(&settings).Error; err != nil {
		// 默认值
		return "http://www.gstatic.com/generate_204", 10
	}

	return settings.TestURL, settings.TestTimeout
}

// GetSettings 获取系统设置
func GetSettings() *models.Settings {
	db := database.GetDB()
	var settings models.Settings

	if err := db.First(&settings).Error; err != nil {
		return nil
	}

	return &settings
}

// GetOrCreateSettings 获取或创建系统设置
func GetOrCreateSettings() *models.Settings {
	db := database.GetDB()
	var settings models.Settings

	if err := db.First(&settings).Error; err != nil {
		// 创建默认设置
		settings = models.Settings{
			PortRangeStart: 10000,
			PortRangeEnd:   11000,
			TestURL:        "http://www.gstatic.com/generate_204",
			TestTimeout:    10,
			MihomoAPIPort:  9090,
		}
		db.Create(&settings)
	}

	return &settings
}

// TestTCPLatency 测试 TCP 连接延迟（备用方案）
func TestTCPLatency(host string, port int, timeout time.Duration) int {
	start := time.Now()

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, string(rune(port))), timeout)
	if err != nil {
		return -1
	}
	defer conn.Close()

	latency := int(time.Since(start).Milliseconds())
	return latency
}

// TestTCPLatencyString 测试 TCP 连接延迟（端口为字符串）
func TestTCPLatencyString(host string, port string, timeout time.Duration) int {
	start := time.Now()

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), timeout)
	if err != nil {
		return -1
	}
	defer conn.Close()

	latency := int(time.Since(start).Milliseconds())
	return latency
}

// EnsureMihomoRunning 确保 Mihomo 正在运行（用于测速）
// 优化：如果已运行则尝试热重载配置，避免频繁重启
func EnsureMihomoRunning(proxyIDs []int64) error {
	db := database.GetDB()

	// 获取要测速的代理
	var proxies []models.ProxyNode
	if err := db.Where("id IN ?", proxyIDs).Find(&proxies).Error; err != nil {
		return err
	}

	if len(proxies) == 0 {
		return nil
	}

	// 获取系统设置
	settings := GetSettings()
	mihomo := GetMihomoManager()

	// 优化：如果 Mihomo 已经运行，尝试热重载
	if mihomo.IsRunning() {
		// 生成新配置
		_, err := mihomo.GenerateConfigForTest(proxies, settings)
		if err != nil {
			return err
		}
		// 尝试热重载
		if err := mihomo.ReloadConfig(); err != nil {
			// 热重载失败，重启
			if err := mihomo.RestartForTest(proxies, settings); err != nil {
				return err
			}
			time.Sleep(1 * time.Second)
		} else {
			// 热重载成功，短暂等待
			time.Sleep(500 * time.Millisecond)
		}
	} else {
		// Mihomo 未运行，启动它
		if err := mihomo.RestartForTest(proxies, settings); err != nil {
			return err
		}
		// 首次启动等待时间长一些
		time.Sleep(2 * time.Second)
	}

	return nil
}

// TestSingleProxy 测试单个代理节点的延迟
func TestSingleProxy(proxyID int64) (int, error) {
	db := database.GetDB()

	var proxy models.ProxyNode
	if err := db.First(&proxy, proxyID).Error; err != nil {
		return -1, err
	}

	// 获取测速配置
	testURL, testTimeout := GetTestSettings()

	// 解析配置获取代理名称
	var config map[string]interface{}
	if err := yaml.Unmarshal([]byte(proxy.Config), &config); err != nil {
		return -1, err
	}

	proxyName, _ := config["name"].(string)
	if proxyName == "" {
		proxyName = proxy.Name
	}

	// 确保 Mihomo 运行
	if err := EnsureMihomoRunning([]int64{proxyID}); err != nil {
		log.Printf("Mihomo 启动失败，回退到 TCP 测试: %v", err)
		// 回退到 TCP 测试
		server, _ := config["server"].(string)
		port, _ := config["port"].(string)
		if server != "" && port != "" {
			return TestTCPLatencyString(server, port, time.Duration(testTimeout)*time.Second), nil
		}
		return -1, nil
	}

	// 使用 Mihomo API 测速
	mihomo := GetMihomoManager()
	latency, err := mihomo.TestProxyDelay(proxyName, testURL, testTimeout*1000)
	if err != nil {
		latency = -1
	}

	// 更新数据库
	proxy.Latency = latency
	db.Save(&proxy)

	return latency, nil
}

// TestMultipleProxiesResult 批量测速结果
type TestMultipleProxiesResult struct {
	Results map[int64]int
}

// TestMultipleProxies 批量测试多个代理节点的延迟
func TestMultipleProxies(proxyIDs []int64) (map[int64]int, error) {
	results := make(map[int64]int)
	resultsMu := sync.Mutex{}

	db := database.GetDB()

	// 获取测速配置
	testURL, testTimeout := GetTestSettings()

	// 获取所有需要测试的节点
	var proxies []models.ProxyNode
	if err := db.Where("id IN ?", proxyIDs).Find(&proxies).Error; err != nil {
		return results, err
	}

	if len(proxies) == 0 {
		return results, nil
	}

	// 构建代理名称到 ID 的映射
	proxyNameToID := make(map[string]int64)
	for _, proxy := range proxies {
		var config map[string]interface{}
		if err := yaml.Unmarshal([]byte(proxy.Config), &config); err != nil {
			log.Printf("解析代理 %s 配置失败: %v", proxy.Name, err)
			results[proxy.ID] = -1
			continue
		}
		proxyName, _ := config["name"].(string)
		if proxyName == "" {
			proxyName = proxy.Name
		}
		proxyNameToID[proxyName] = proxy.ID
	}

	settings := GetSettings()
	mihomo := GetMihomoManager()

	// 优化：如果 Mihomo 已经运行，尝试热重载配置
	if mihomo.IsRunning() {
		// 更新配置并热重载
		_, err := mihomo.GenerateConfigForTest(proxies, settings)
		if err != nil {
			log.Printf("生成测速配置失败: %v", err)
		} else {
			// 尝试热重载
			if err := mihomo.ReloadConfig(); err != nil {
				log.Printf("热重载失败，将重启 Mihomo: %v", err)
				// 热重载失败，重启
				if err := mihomo.RestartForTest(proxies, settings); err != nil {
					log.Printf("Mihomo 重启失败，回退到 TCP 测试: %v", err)
					return fallbackTCPTest(proxies, testTimeout)
				}
				time.Sleep(1 * time.Second)
			} else {
				// 热重载成功，等待配置生效
				time.Sleep(500 * time.Millisecond)
			}
		}
	} else {
		// Mihomo 未运行，启动它
		if err := mihomo.RestartForTest(proxies, settings); err != nil {
			log.Printf("Mihomo 启动失败，回退到 TCP 测试: %v", err)
			return fallbackTCPTest(proxies, testTimeout)
		}
		// 首次启动等待时间长一些
		time.Sleep(2 * time.Second)
	}

	if !mihomo.IsRunning() {
		log.Println("Mihomo 未运行，回退到 TCP 测试")
		return fallbackTCPTest(proxies, testTimeout)
	}

	// 使用 Mihomo API 批量测速
	proxyNames := make([]string, 0, len(proxyNameToID))
	for name := range proxyNameToID {
		proxyNames = append(proxyNames, name)
	}

	delayResults := mihomo.TestMultipleProxies(proxyNames, testURL, testTimeout*1000, 10)

	// 更新数据库
	for _, proxy := range proxies {
		var config map[string]interface{}
		if err := yaml.Unmarshal([]byte(proxy.Config), &config); err != nil {
			continue
		}
		proxyName, _ := config["name"].(string)
		if proxyName == "" {
			proxyName = proxy.Name
		}

		latency, ok := delayResults[proxyName]
		if !ok {
			latency = -1
		}

		proxy.Latency = latency
		db.Save(&proxy)

		resultsMu.Lock()
		results[proxy.ID] = latency
		resultsMu.Unlock()
	}

	// 注意：测速完成后不停止 Mihomo，保持运行状态以便后续测速更快
	return results, nil
}

// fallbackTCPTest TCP 测试回退方案
func fallbackTCPTest(proxies []models.ProxyNode, timeout int) (map[int64]int, error) {
	results := make(map[int64]int)
	resultsMu := sync.Mutex{}
	db := database.GetDB()

	// 并发控制
	sem := make(chan struct{}, 20)
	var wg sync.WaitGroup

	for _, proxy := range proxies {
		wg.Add(1)
		go func(p models.ProxyNode) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			var config map[string]interface{}
			if err := yaml.Unmarshal([]byte(p.Config), &config); err != nil {
				resultsMu.Lock()
				results[p.ID] = -1
				resultsMu.Unlock()
				return
			}

			server, _ := config["server"].(string)
			port := config["port"]

			if server == "" || port == nil {
				resultsMu.Lock()
				results[p.ID] = -1
				resultsMu.Unlock()
				return
			}

			portStr := fmt.Sprintf("%v", port)
			latency := TestTCPLatencyString(server, portStr, time.Duration(timeout)*time.Second)

			p.Latency = latency
			db.Save(&p)

			resultsMu.Lock()
			results[p.ID] = latency
			resultsMu.Unlock()
		}(proxy)
	}

	wg.Wait()
	return results, nil
}
