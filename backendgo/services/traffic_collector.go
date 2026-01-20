// Package services 提供核心业务服务
// 全局流量统计采集服务
package services

import (
	"log"
	"mppm/database"
	"mppm/models"
	"sync"
	"time"
)

// TrafficCollector 全局流量采集器
type TrafficCollector struct {
	mihomo          *MihomoManager
	interval        time.Duration
	stopChan        chan struct{}
	mu              sync.Mutex
	running         bool
	lastDownload    int64     // Mihomo 上次报告的累计下载
	lastUpload      int64     // Mihomo 上次报告的累计上传
	lastCollectTime time.Time // 上次采集时间
}

// trafficCollector 全局单例
var trafficCollector *TrafficCollector
var collectorOnce sync.Once

// GetTrafficCollector 获取流量采集器单例
func GetTrafficCollector() *TrafficCollector {
	collectorOnce.Do(func() {
		trafficCollector = &TrafficCollector{
			mihomo:   GetMihomoManager(),
			interval: 5 * time.Second, // 每5秒采集一次
			stopChan: make(chan struct{}),
		}
	})
	return trafficCollector
}

// Start 启动流量采集
func (tc *TrafficCollector) Start() {
	tc.mu.Lock()
	if tc.running {
		tc.mu.Unlock()
		return
	}
	tc.running = true
	tc.stopChan = make(chan struct{})
	tc.mu.Unlock()

	log.Println("全局流量采集器已启动")

	go tc.collectLoop()
}

// Stop 停止流量采集
func (tc *TrafficCollector) Stop() {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	if !tc.running {
		return
	}

	tc.running = false
	close(tc.stopChan)
	log.Println("全局流量采集器已停止")
}

// IsRunning 检查采集器是否在运行
func (tc *TrafficCollector) IsRunning() bool {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	return tc.running
}

// collectLoop 采集循环
func (tc *TrafficCollector) collectLoop() {
	ticker := time.NewTicker(tc.interval)
	defer ticker.Stop()

	for {
		select {
		case <-tc.stopChan:
			return
		case <-ticker.C:
			tc.collectOnce()
		}
	}
}

// collectOnce 执行一次流量采集
func (tc *TrafficCollector) collectOnce() {
	// 直接尝试获取 Mihomo 的全局流量统计（不检查 IsRunning，因为进程引用可能丢失）
	downloadTotal, uploadTotal, err := tc.mihomo.GetGlobalTraffic()
	if err != nil {
		// 出错时静默处理，可能是 Mihomo 未运行
		return
	}

	// 如果获取到的值都是0，说明 Mihomo 可能未运行或刚启动
	if downloadTotal == 0 && uploadTotal == 0 {
		return
	}

	tc.mu.Lock()
	defer tc.mu.Unlock()

	now := time.Now()

	// 第一次采集，只记录基准值
	if tc.lastCollectTime.IsZero() {
		tc.lastDownload = downloadTotal
		tc.lastUpload = uploadTotal
		tc.lastCollectTime = now
		log.Printf("[流量采集] 初始化基准: 下载=%d, 上传=%d", downloadTotal, uploadTotal)
		return
	}

	// 计算增量（需要处理 Mihomo 重启后计数器重置的情况）
	downloadDelta := downloadTotal - tc.lastDownload
	uploadDelta := uploadTotal - tc.lastUpload

	// 如果 Mihomo 重启，计数器会重置，这时候直接使用当前值作为增量
	if downloadDelta < 0 {
		downloadDelta = downloadTotal
	}
	if uploadDelta < 0 {
		uploadDelta = uploadTotal
	}

	// 更新基准值
	tc.lastDownload = downloadTotal
	tc.lastUpload = uploadTotal
	tc.lastCollectTime = now

	// 如果有增量，更新数据库
	if downloadDelta > 0 || uploadDelta > 0 {
		tc.updateGlobalTraffic(downloadDelta, uploadDelta)
	}
}

// updateGlobalTraffic 更新全局流量统计
func (tc *TrafficCollector) updateGlobalTraffic(downloadDelta, uploadDelta int64) {
	db := database.GetDB()
	now := time.Now()

	// 查找或创建全局流量统计记录（只有一条记录，ID=1）
	var trafficStat models.GlobalTrafficStats
	result := db.First(&trafficStat)

	if result.Error != nil {
		// 记录不存在，创建新记录
		trafficStat = models.GlobalTrafficStats{
			Upload:       uploadDelta,
			Download:     downloadDelta,
			TotalTraffic: uploadDelta + downloadDelta,
			LastUpdate:   now,
		}
		if err := db.Create(&trafficStat).Error; err != nil {
			log.Printf("创建全局流量统计失败: %v", err)
		} else {
			log.Printf("[流量采集] 创建全局记录: 下载=%d, 上传=%d", downloadDelta, uploadDelta)
		}
	} else {
		// 记录已存在，累加流量
		trafficStat.Upload += uploadDelta
		trafficStat.Download += downloadDelta
		trafficStat.TotalTraffic = trafficStat.Upload + trafficStat.Download
		trafficStat.LastUpdate = now
		if err := db.Save(&trafficStat).Error; err != nil {
			log.Printf("更新全局流量统计失败: %v", err)
		}
	}
}

// GetGlobalTrafficStats 获取全局流量统计（供 API 调用）
func GetGlobalTrafficStats() (*models.GlobalTrafficStats, error) {
	db := database.GetDB()
	var stat models.GlobalTrafficStats
	result := db.First(&stat)
	if result.Error != nil {
		// 如果没有记录，返回零值
		return &models.GlobalTrafficStats{
			Upload:       0,
			Download:     0,
			TotalTraffic: 0,
		}, nil
	}
	return &stat, nil
}

// ResetGlobalTrafficStats 重置全局流量统计（可选功能）
func ResetGlobalTrafficStats() error {
	db := database.GetDB()
	return db.Exec("DELETE FROM global_traffic_stats").Error
}
