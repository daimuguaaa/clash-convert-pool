// Package handlers 提供 API 处理器
package handlers

import (
	"io"
	"log"
	"math/rand"
	"mppm/database"
	"mppm/models"
	"mppm/services"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// ========== 代理节点 API ==========

// GetProxies 获取代理节点列表
func GetProxies(c *gin.Context) {
	db := database.GetDB()
	tag := c.Query("tag")
	activeOnly := c.Query("active_only") == "true"

	var proxies []models.ProxyNode
	query := db.Model(&models.ProxyNode{})

	if tag != "" && tag != "全部" {
		query = query.Where("tag = ?", tag)
	}
	if activeOnly {
		query = query.Where("is_enabled = ?", true)
	}

	if err := query.Find(&proxies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, proxies)
}

// GetTags 获取所有标签
func GetTags(c *gin.Context) {
	db := database.GetDB()
	var tags []string

	if err := db.Model(&models.ProxyNode{}).Distinct("tag").Pluck("tag", &tags).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, tags)
}

// RenameTagRequest 重命名标签请求
type RenameTagRequest struct {
	NewTag string `json:"new_tag" binding:"required"`
}

// RenameTag 重命名标签
func RenameTag(c *gin.Context) {
	oldTag := c.Param("old_tag")
	var req RenameTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新标签不能为空"})
		return
	}

	db := database.GetDB()
	result := db.Model(&models.ProxyNode{}).Where("tag = ?", oldTag).Update("tag", req.NewTag)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该标签的节点"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "成功将标签 '" + oldTag + "' 重命名为 '" + req.NewTag + "'",
		"count":   result.RowsAffected,
	})
}

// ImportNodes 导入节点
func ImportNodes(c *gin.Context) {
	url := c.PostForm("url")
	content := c.PostForm("content")
	tag := c.DefaultPostForm("tag", "默认")

	// 检查是否上传了文件
	file, _, err := c.Request.FormFile("file")
	var fileContent string
	if err == nil {
		defer file.Close()
		data, err := io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "读取文件失败"})
			return
		}
		fileContent = string(data)
	}

	// 优先使用文件内容，其次是直接提供的内容，最后是URL
	importContent := fileContent
	if importContent == "" {
		importContent = content
	}

	var importURL *string
	var importContentPtr *string

	if importContent != "" {
		importContentPtr = &importContent
	} else if url != "" {
		importURL = &url
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供订阅链接、配置内容或上传配置文件"})
		return
	}

	result, err := services.ProcessImport(importContentPtr, importURL, tag)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "成功导入 " + strconv.Itoa(result.AddedCount) + " 个节点到标签 [" + tag + "]",
		"count":   result.AddedCount,
		"tag":     tag,
	})
}

// TestRequest 测速请求
type TestRequest struct {
	IDs []int64 `json:"ids" binding:"required"`
}

// TestLatency 测速
func TestLatency(c *gin.Context) {
	var req TestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	results, err := services.TestMultipleProxies(req.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "测速失败: " + err.Error()})
		return
	}

	successCount := 0
	for _, v := range results {
		if v > 0 {
			successCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "测速完成: " + strconv.Itoa(successCount) + "/" + strconv.Itoa(len(results)) + " 个节点可用",
		"results": results,
	})
}

// TestProxyLatency 测试代理延迟（通过本地端口测试）
func TestProxyLatency(c *gin.Context) {
	var req TestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	results, err := services.TestProxyLatencyByIDs(req.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "测速失败: " + err.Error()})
		return
	}

	successCount := 0
	for _, v := range results {
		if v > 0 {
			successCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "代理测速完成: " + strconv.Itoa(successCount) + "/" + strconv.Itoa(len(results)) + " 个代理可用",
		"results": results,
	})
}

// UpdateProxy 更新代理节点
func UpdateProxy(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的ID"})
		return
	}

	db := database.GetDB()
	var proxy models.ProxyNode
	if err := db.First(&proxy, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "节点不存在"})
		return
	}

	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	needRestartMihomo := false

	// 判断是否包含启用指令
	willEnable := false
	if v, ok := updates["is_enabled"].(bool); ok && v {
		willEnable = true
	}

	// 处理端口修改（独立于启用状态）
	if userPort, hasPort := updates["local_port"]; hasPort && !proxy.IsEnabled && !willEnable {
		// 代理未启用时，只更新 last_port
		var portNum int
		switch v := userPort.(type) {
		case float64:
			portNum = int(v)
		case int:
			portNum = v
		}

		if portNum < 1024 || portNum > 65535 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "端口号必须在1024-65535之间"})
			return
		}

		// 检查端口是否已被其他代理使用
		var count int64
		db.Model(&models.ProxyNode{}).Where("local_port = ? AND id != ?", portNum, id).Count(&count)
		if count > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "端口已被其他代理使用"})
			return
		}

		// 更新 last_port，不更新 local_port（因为代理未启用）
		updates["last_port"] = portNum
		delete(updates, "local_port") // 移除 local_port 更新
	}

	// 处理启用状态变化
	if isEnabled, ok := updates["is_enabled"].(bool); ok {
		if isEnabled {
			// 检查用户是否传入了端口号
			if userPort, hasPort := updates["local_port"]; hasPort {
				// 用户指定了端口号，验证端口是否可用
				var portNum int
				switch v := userPort.(type) {
				case float64:
					portNum = int(v)
				case int:
					portNum = v
				}

				if portNum < 1024 || portNum > 65535 {
					c.JSON(http.StatusBadRequest, gin.H{"error": "端口号必须在1024-65535之间"})
					return
				}

				// 检查端口是否已被其他代理使用
				var count int64
				db.Model(&models.ProxyNode{}).Where("local_port = ? AND id != ?", portNum, id).Count(&count)
				if count > 0 {
					c.JSON(http.StatusBadRequest, gin.H{"error": "端口已被其他代理使用"})
					return
				}

				// 检查端口是否被系统占用
				if !services.IsPortAvailable(portNum) {
					c.JSON(http.StatusBadRequest, gin.H{"error": "端口已被系统占用"})
					return
				}

				updates["local_port"] = portNum
				updates["last_port"] = portNum // 同时更新 LastPort
				needRestartMihomo = true

			} else if proxy.LocalPort == nil {
				// 用户没有传入端口，检查是否有 LastPort 可以复用
				needAllocate := true
				if proxy.LastPort != nil {
					// 检查 LastPort 是否被其他代理使用
					var count int64
					db.Model(&models.ProxyNode{}).Where("local_port = ? AND id != ?", *proxy.LastPort, id).Count(&count)
					if count == 0 {
						// LastPort 可用，直接复用
						updates["local_port"] = *proxy.LastPort
						needRestartMihomo = true
						needAllocate = false
					}
				}

				if needAllocate {
					// 自动分配新端口
					settings := services.GetOrCreateSettings()
					portStart := settings.PortRangeStart
					portEnd := settings.PortRangeEnd

					// 获取已使用的端口
					var usedPorts []int
					db.Model(&models.ProxyNode{}).Where("local_port IS NOT NULL").Pluck("local_port", &usedPorts)
					usedPortsMap := make(map[int]bool)
					for _, p := range usedPorts {
						usedPortsMap[p] = true
					}

					// 找到下一个可用端口
					newPort := portStart
					for usedPortsMap[newPort] && newPort < portEnd {
						newPort++
					}

					if newPort >= portEnd {
						c.JSON(http.StatusBadRequest, gin.H{"error": "端口范围已用尽"})
						return
					}

					updates["local_port"] = newPort
					updates["last_port"] = newPort // 同时更新 LastPort
					needRestartMihomo = true
				}
			} else {
				// 代理已有端口，只需要启用
				needRestartMihomo = true
			}
		} else {
			// 禁用代理：保留 LastPort，清除 LocalPort 和健康检查数据
			if proxy.LocalPort != nil {
				updates["last_port"] = *proxy.LocalPort // 保存当前端口到 LastPort
			}
			updates["local_port"] = nil
			updates["health_status"] = "unknown" // 清空健康状态
			updates["proxy_latency"] = -1        // 清空代理延迟
			needRestartMihomo = true
		}
	}

	updates["updated_at"] = time.Now()
	if err := db.Model(&proxy).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新获取更新后的数据
	db.First(&proxy, id)

	// 如果启用状态变化，需要重启 Mihomo
	if needRestartMihomo {
		// 获取所有已启用的代理
		var allEnabledProxies []models.ProxyNode
		db.Where("is_enabled = ?", true).Find(&allEnabledProxies)

		mihomo := services.GetMihomoManager()
		settings := services.GetOrCreateSettings()

		if len(allEnabledProxies) == 0 {
			// 没有活跃代理了，停止 Mihomo
			mihomo.Stop()
		} else {
			// 重启 Mihomo 以应用新配置
			if err := mihomo.StartWithProxies(allEnabledProxies, settings); err != nil {
				// 启动失败，回滚数据库状态
				proxy.IsEnabled = false
				proxy.LocalPort = nil
				db.Save(&proxy)
				c.JSON(http.StatusBadRequest, gin.H{"error": "启动代理失败: " + err.Error()})
				return
			}
		}
	}

	c.JSON(http.StatusOK, proxy)
}

// DeleteRequest 删除请求
type DeleteRequest struct {
	IDs []int64 `json:"ids" binding:"required"`
}

// DeleteProxies 删除代理节点
func DeleteProxies(c *gin.Context) {
	var req DeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db := database.GetDB()
	mihomo := services.GetMihomoManager()

	// 1. 查询要删除的节点中是否有已启用的
	var enabledCount int64
	db.Model(&models.ProxyNode{}).Where("id IN ? AND is_enabled = ?", req.IDs, true).Count(&enabledCount)
	needRestart := enabledCount > 0

	// 2. 从数据库删除
	result := db.Delete(&models.ProxyNode{}, req.IDs)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	// 3. 如果删除了已启用的节点，需要重启 Mihomo 以应用更改
	if needRestart {
		// 获取剩余的所有节点和设置
		var allProxies []models.ProxyNode
		db.Find(&allProxies)

		var settings models.Settings
		db.First(&settings)

		// 异步重启，避免阻塞 API 响应
		go func() {
			if err := mihomo.Restart(allProxies, &settings); err != nil {
				log.Printf("删除节点后重启 Mihomo 失败: %v", err)
			}
		}()
	}

	c.JSON(http.StatusOK, gin.H{"deleted": result.RowsAffected})
}

// BatchEnableRequest 批量启用请求
type BatchEnableRequest struct {
	IDs       []int64 `json:"ids" binding:"required"`
	PortStart int     `json:"port_start"`
	PortEnd   int     `json:"port_end"`
}

// BatchEnableProxies 批量启用代理
func BatchEnableProxies(c *gin.Context) {
	var req BatchEnableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 默认端口范围
	if req.PortStart == 0 {
		req.PortStart = 10000
	}
	if req.PortEnd == 0 {
		req.PortEnd = 10100
	}

	if req.PortStart >= req.PortEnd {
		c.JSON(http.StatusBadRequest, gin.H{"error": "端口范围无效"})
		return
	}

	availablePorts := req.PortEnd - req.PortStart
	if availablePorts < len(req.IDs) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "端口范围不足，需要 " + strconv.Itoa(len(req.IDs)) + " 个端口"})
		return
	}

	db := database.GetDB()

	// 获取已使用的端口
	var usedPorts []int
	db.Model(&models.ProxyNode{}).Where("local_port IS NOT NULL").Pluck("local_port", &usedPorts)
	usedPortsMap := make(map[int]bool)
	for _, p := range usedPorts {
		usedPortsMap[p] = true
	}

	// 查找请求的节点
	var proxies []models.ProxyNode
	if err := db.Where("id IN ?", req.IDs).Find(&proxies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(proxies) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到指定的节点"})
		return
	}

	// 分配端口
	enabledCount := 0
	var errors []string
	currentPort := req.PortStart

	for i := range proxies {
		// 找到下一个可用端口（同时检查数据库和系统占用）
		for currentPort < req.PortEnd {
			if !usedPortsMap[currentPort] && services.IsPortAvailable(currentPort) {
				break
			}
			currentPort++
		}

		if currentPort >= req.PortEnd {
			errors = append(errors, "端口用尽，无法为节点 "+proxies[i].Name+" 分配端口")
			break
		}

		proxies[i].IsEnabled = true
		proxies[i].LocalPort = &currentPort
		proxies[i].LastPort = &currentPort
		usedPortsMap[currentPort] = true
		currentPort++
		enabledCount++
		db.Save(&proxies[i])
	}

	// 获取所有已启用的代理节点
	var allEnabledProxies []models.ProxyNode
	db.Where("is_enabled = ?", true).Find(&allEnabledProxies)

	// 获取系统设置
	settings := services.GetOrCreateSettings()

	// 启动 Mihomo
	mihomo := services.GetMihomoManager()
	if err := mihomo.StartWithProxies(allEnabledProxies, settings); err != nil {
		// 启动失败，回滚所有已启用的代理
		for i := range proxies {
			if proxies[i].IsEnabled {
				proxies[i].IsEnabled = false
				proxies[i].LocalPort = nil
				db.Save(&proxies[i])
			}
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "启动代理失败: " + err.Error()})
		return
	}

	if len(errors) > 0 {
		c.JSON(http.StatusOK, gin.H{
			"message":        "部分成功: 已开启 " + strconv.Itoa(enabledCount) + " 个代理",
			"enabled":        enabledCount,
			"mihomo_running": true,
			"errors":         errors,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "已开启 " + strconv.Itoa(enabledCount) + " 个代理",
		"enabled":        enabledCount,
		"mihomo_running": true,
	})
}

// BatchDisableRequest 批量禁用请求
type BatchDisableRequest struct {
	IDs []int64 `json:"ids" binding:"required"`
}

// BatchDisableProxies 批量禁用代理
func BatchDisableProxies(c *gin.Context) {
	var req BatchDisableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db := database.GetDB()

	// 禁用选中的代理
	disabledCount := 0
	for _, id := range req.IDs {
		var proxy models.ProxyNode
		if err := db.First(&proxy, id).Error; err != nil {
			continue
		}
		if proxy.IsEnabled {
			proxy.IsEnabled = false
			proxy.LocalPort = nil
			proxy.HealthStatus = "unknown" // 清空健康状态
			proxy.ProxyLatency = -1        // 清空代理延迟
			db.Save(&proxy)
			disabledCount++
		}
	}

	// 检查是否还有其他已启用的代理
	var remainingProxies []models.ProxyNode
	db.Where("is_enabled = ?", true).Find(&remainingProxies)

	mihomo := services.GetMihomoManager()

	if len(remainingProxies) == 0 {
		// 没有活跃代理了，停止 Mihomo
		mihomo.Stop()
		c.JSON(http.StatusOK, gin.H{
			"message":        "已停止 " + strconv.Itoa(disabledCount) + " 个代理 (代理服务已关闭)",
			"disabled":       disabledCount,
			"mihomo_running": false,
		})
		return
	}

	// 还有其他活跃代理，重新加载配置
	settings := services.GetOrCreateSettings()
	mihomo.StartWithProxies(remainingProxies, settings)

	c.JSON(http.StatusOK, gin.H{
		"message":        "已停止 " + strconv.Itoa(disabledCount) + " 个代理",
		"disabled":       disabledCount,
		"mihomo_running": mihomo.IsRunning(),
	})
}

// BatchUpdateGroupRequest 批量修改分组请求
type BatchUpdateGroupRequest struct {
	IDs   []int64 `json:"ids" binding:"required"`
	Group string  `json:"group" binding:"required"`
}

// BatchUpdateGroup 批量修改代理分组
func BatchUpdateGroup(c *gin.Context) {
	var req BatchUpdateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db := database.GetDB()
	// 使用 map 更新，避免 group 作为 SQL 保留字的问题
	result := db.Model(&models.ProxyNode{}).Where("id IN ?", req.IDs).Updates(map[string]interface{}{
		"group": req.Group,
	})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "批量更新分组失败: " + result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "已更新 " + strconv.FormatInt(result.RowsAffected, 10) + " 个代理的分组",
		"updated": result.RowsAffected,
	})
}

// ========== 系统设置 API ==========

// GetSettings 获取系统设置
func GetSettings(c *gin.Context) {
	settings := services.GetOrCreateSettings()

	authUsername := ""
	authPassword := ""
	if settings.AuthUsername != nil {
		authUsername = *settings.AuthUsername
	}
	if settings.AuthPassword != nil {
		authPassword = *settings.AuthPassword
	}

	c.JSON(http.StatusOK, gin.H{
		"portRangeStart": settings.PortRangeStart,
		"portRangeEnd":   settings.PortRangeEnd,
		"testUrl":        settings.TestURL,
		"testTimeout":    settings.TestTimeout,
		"mihomoApiPort":  settings.MihomoAPIPort,
		"authUsername":   authUsername,
		"authPassword":   authPassword,
	})
}

// SettingsUpdate 设置更新请求
type SettingsUpdate struct {
	PortRangeStart *int    `json:"port_range_start"`
	PortRangeEnd   *int    `json:"port_range_end"`
	TestURL        *string `json:"test_url"`
	TestTimeout    *int    `json:"test_timeout"`
	MihomoAPIPort  *int    `json:"mihomo_api_port"`
	AuthUsername   *string `json:"auth_username"`
	AuthPassword   *string `json:"auth_password"`
}

// UpdateSettings 更新系统设置
func UpdateSettings(c *gin.Context) {
	var update SettingsUpdate
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	settings := services.GetOrCreateSettings()
	db := database.GetDB()

	// 更新非空字段
	if update.PortRangeStart != nil {
		settings.PortRangeStart = *update.PortRangeStart
	}
	if update.PortRangeEnd != nil {
		settings.PortRangeEnd = *update.PortRangeEnd
	}
	if update.TestURL != nil {
		settings.TestURL = *update.TestURL
	}
	if update.TestTimeout != nil {
		settings.TestTimeout = *update.TestTimeout
	}
	if update.MihomoAPIPort != nil {
		settings.MihomoAPIPort = *update.MihomoAPIPort
	}
	if update.AuthUsername != nil {
		if *update.AuthUsername == "" {
			settings.AuthUsername = nil
		} else {
			settings.AuthUsername = update.AuthUsername
		}
	}
	if update.AuthPassword != nil {
		if *update.AuthPassword == "" {
			settings.AuthPassword = nil
		} else {
			settings.AuthPassword = update.AuthPassword
		}
	}

	settings.UpdatedAt = time.Now()
	db.Save(settings)

	// 如果有活跃的代理，重启 Mihomo 以应用新设置（如认证信息）
	var enabledProxies []models.ProxyNode
	db.Where("is_enabled = ?", true).Find(&enabledProxies)
	if len(enabledProxies) > 0 {
		mihomo := services.GetMihomoManager()
		go func() {
			if err := mihomo.StartWithProxies(enabledProxies, settings); err != nil {
				log.Printf("重启 Mihomo 失败: %v", err)
			} else {
				log.Println("设置已更新，Mihomo 已重启以应用新配置")
			}
		}()
	}

	c.JSON(http.StatusOK, gin.H{"message": "设置已保存"})
}

// ========== Mihomo 状态 API ==========

// GetMihomoStatus 获取 Mihomo 状态
func GetMihomoStatus(c *gin.Context) {
	mihomo := services.GetMihomoManager()
	status := mihomo.GetStatus()
	c.JSON(http.StatusOK, status)
}

// StopMihomo 停止 Mihomo
func StopMihomo(c *gin.Context) {
	mihomo := services.GetMihomoManager()
	mihomo.Stop()
	c.JSON(http.StatusOK, gin.H{
		"message": "代理服务已停止",
		"running": false,
	})
}

// GetGlobalTrafficStats 获取全局流量统计
func GetGlobalTrafficStats(c *gin.Context) {
	stat, err := services.GetGlobalTrafficStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload":        stat.Upload,
		"download":      stat.Download,
		"total_traffic": stat.TotalTraffic,
		"last_update":   stat.LastUpdate,
	})
}

// ========== 认证 API ==========

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login 登录
func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名和密码不能为空"})
		return
	}

	settings := services.GetOrCreateSettings()

	// 验证用户名和密码
	if settings.AdminUsername != req.Username || settings.AdminPassword != req.Password {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	// 生成简单的 token（实际项目中应使用 JWT）
	token := generateToken(req.Username)

	c.JSON(http.StatusOK, gin.H{
		"message":        "登录成功",
		"token":          token,
		"username":       settings.AdminUsername,
		"is_first_login": settings.IsFirstLogin,
	})
}

// 生成简单 token（用于演示，实际项目中应使用 JWT）
func generateToken(username string) string {
	// 使用时间戳和用户名生成简单 token
	return strconv.FormatInt(time.Now().UnixNano(), 36) + "-" + username
}

// ChangePasswordRequest 修改密码请求
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewUsername     string `json:"new_username"`
	NewPassword     string `json:"new_password" binding:"required"`
}

// ChangePassword 修改管理员密码
func ChangePassword(c *gin.Context) {
	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	db := database.GetDB()
	settings := services.GetOrCreateSettings()

	// 验证当前密码
	if settings.AdminPassword != req.CurrentPassword {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "当前密码错误"})
		return
	}

	// 准备更新数据
	updates := map[string]interface{}{
		"admin_password": req.NewPassword,
		"is_first_login": false,
	}

	// 如果提供了新用户名，也更新用户名
	if req.NewUsername != "" {
		updates["admin_username"] = req.NewUsername
	}

	// 更新数据库
	result := db.Model(&models.Settings{}).Where("id = ?", settings.ID).Updates(updates)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "密码修改成功",
	})
}

// AuthMiddleware 认证中间件
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			c.Abort()
			return
		}

		// 简单验证 token 格式（实际项目中应验证 JWT）
		if len(token) < 10 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "无效的 token"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// CheckAuth 检查认证状态
func CheckAuth(c *gin.Context) {
	settings := services.GetOrCreateSettings()
	c.JSON(http.StatusOK, gin.H{
		"authenticated":  true,
		"username":       settings.AdminUsername,
		"is_first_login": settings.IsFirstLogin,
	})
}

// ========== 导出 API ==========

// ExportProxyNode 导出节点模型
type ExportProxyNode struct {
	HostIP       string `json:"host_ip"`
	LocalPort    int    `json:"local_port"`
	Remark       string `json:"remark"`
	ServerInfo   string `json:"server_info"`
	AuthUsername string `json:"auth_username"`
	AuthPassword string `json:"auth_password"`
	GroupName    string `json:"group_name"`
	TagName      string `json:"tag_name"`
	NodeName     string `json:"node_name"`
	Protocol     string `json:"protocol"`
}

// getHostIP 获取当前服务器IP
func getHostIP(c *gin.Context) string {
	host := c.Request.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		return h
	}
	return host
}

// toExportNode 转换为导出模型
func toExportNode(node models.ProxyNode, settings models.Settings, hostIP string) ExportProxyNode {
	remark := ""
	if node.Remark != nil {
		remark = *node.Remark
	}

	authUser := ""
	if settings.AuthUsername != nil {
		authUser = *settings.AuthUsername
	}

	authPass := ""
	if settings.AuthPassword != nil {
		authPass = *settings.AuthPassword
	}

	localPort := 0
	if node.LocalPort != nil {
		localPort = *node.LocalPort
	}

	return ExportProxyNode{
		HostIP:       hostIP,
		LocalPort:    localPort,
		Remark:       remark,
		ServerInfo:   node.Server,
		AuthUsername: authUser,
		AuthPassword: authPass,
		GroupName:    node.Group,
		TagName:      node.Tag,
		NodeName:     node.Name,
		Protocol:     node.Protocol,
	}
}

// GetAvailableProxies 获取所有可用代理节点
func GetAvailableProxies(c *gin.Context) {
	db := database.GetDB()
	var proxies []models.ProxyNode

	// 查询所有已启用且健康的节点
	// health_status = 'healthy' 或者 health_status = 'unknown'（尚未检查的也返回）
	if err := db.Where("is_enabled = ? AND (health_status = ? OR health_status = ?)", true, "healthy", "unknown").Find(&proxies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	settings := services.GetOrCreateSettings()
	hostIP := getHostIP(c)

	exportList := make([]ExportProxyNode, 0, len(proxies))
	for _, p := range proxies {
		exportList = append(exportList, toExportNode(p, *settings, hostIP))
	}

	c.JSON(http.StatusOK, exportList)
}

// GetRandomAvailableProxy 获取随机可用代理节点
func GetRandomAvailableProxy(c *gin.Context) {
	db := database.GetDB()
	var proxies []models.ProxyNode

	// 查询所有已启用且健康的节点
	if err := db.Where("is_enabled = ? AND (health_status = ? OR health_status = ?)", true, "healthy", "unknown").Find(&proxies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(proxies) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "没有可用的代理节点"})
		return
	}

	// 随机选择一个
	rand.Seed(time.Now().UnixNano())
	randomProxy := proxies[rand.Intn(len(proxies))]

	settings := services.GetOrCreateSettings()
	hostIP := getHostIP(c)

	c.JSON(http.StatusOK, toExportNode(randomProxy, *settings, hostIP))
}
