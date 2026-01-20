// Package services - 订阅导入服务
package services

import (
	"crypto/md5"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"mppm/database"
	"mppm/models"
	"net/http"
	"time"

	"gopkg.in/yaml.v3"
)

// FetchConfig 从 URL 抓取订阅配置
func FetchConfig(url string) (string, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}

	// 设置 User-Agent 为 ClashMeta
	req.Header.Set("User-Agent", "ClashMeta")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return string(body), nil
}

// ParseProxies 解析 YAML 配置中的 proxies 列表
func ParseProxies(content string) ([]map[string]interface{}, error) {
	var config models.SubscriptionConfig
	if err := yaml.Unmarshal([]byte(content), &config); err != nil {
		return nil, fmt.Errorf("YAML 解析错误: %v", err)
	}
	return config.Proxies, nil
}

// GenerateUID 生成节点唯一标识（基于 server:port:type）
func GenerateUID(proxy map[string]interface{}) string {
	server, _ := proxy["server"].(string)
	port := fmt.Sprintf("%v", proxy["port"])
	proxyType, _ := proxy["type"].(string)

	s := fmt.Sprintf("%s:%s:%s", server, port, proxyType)
	hash := md5.Sum([]byte(s))
	return hex.EncodeToString(hash[:])
}

// ImportResult 导入结果
type ImportResult struct {
	AddedCount   int
	SkippedCount int
	ErrorCount   int
}

// ProcessImport 处理导入逻辑
func ProcessImport(content *string, url *string, tag string) (*ImportResult, error) {
	var importContent string

	if url != nil && *url != "" {
		log.Printf("正在从 URL 抓取配置: %s", *url)
		var err error
		importContent, err = FetchConfig(*url)
		if err != nil {
			return nil, fmt.Errorf("无法获取订阅内容: %v", err)
		}
	} else if content != nil && *content != "" {
		importContent = *content
	} else {
		return nil, fmt.Errorf("没有可导入的内容")
	}

	proxiesData, err := ParseProxies(importContent)
	if err != nil {
		return nil, err
	}

	if len(proxiesData) == 0 {
		return nil, fmt.Errorf("未在配置中找到有效的代理节点")
	}

	db := database.GetDB()
	result := &ImportResult{}

	for _, pData := range proxiesData {
		// 基本验证
		server, _ := pData["server"].(string)
		port := pData["port"]
		name, _ := pData["name"].(string)

		if server == "" || port == nil || name == "" {
			result.ErrorCount++
			continue
		}

		uid := GenerateUID(pData)

		// 检查是否已存在
		var existing models.ProxyNode
		if err := db.Where("uid = ?", uid).First(&existing).Error; err == nil {
			// 已存在则跳过
			result.SkippedCount++
			continue
		}

		// 序列化配置为 YAML
		configData, err := yaml.Marshal(pData)
		if err != nil {
			log.Printf("序列化代理配置失败: %v", err)
			result.ErrorCount++
			continue
		}

		// 获取协议类型
		protocol, _ := pData["type"].(string)
		if protocol == "" {
			protocol = "unknown"
		}

		// 解析端口号
		var portNum int
		switch v := port.(type) {
		case int:
			portNum = v
		case float64:
			portNum = int(v)
		case string:
			fmt.Sscanf(v, "%d", &portNum)
		}

		// 创建新节点
		newNode := models.ProxyNode{
			UID:       uid,
			Name:      name,
			Tag:       tag,
			Server:    server,
			Port:      portNum,
			Config:    string(configData),
			Protocol:  protocol,
			Latency:   -1,
			IsEnabled: false,
		}

		if err := db.Create(&newNode).Error; err != nil {
			log.Printf("保存节点失败: %v", err)
			result.ErrorCount++
			continue
		}

		result.AddedCount++
	}

	log.Printf("成功导入 %d 个节点到标签 [%s]，跳过 %d 个，失败 %d 个",
		result.AddedCount, tag, result.SkippedCount, result.ErrorCount)

	return result, nil
}
