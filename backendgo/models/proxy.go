// Package models 定义数据模型
package models

import (
	"time"
)

// ProxyNode 代理节点模型
type ProxyNode struct {
	ID        int64     `json:"id" gorm:"primaryKey;autoIncrement"`
	UID       string    `json:"uid" gorm:"uniqueIndex;size:64"` // MD5 哈希
	Name      string    `json:"name" gorm:"size:255"`           // 原始名称
	Remark    *string   `json:"remark" gorm:"size:255"`         // 用户重命名
	Tag       string    `json:"tag" gorm:"index;size:100;default:默认"`
	Group     string    `json:"group" gorm:"index;size:100;default:默认分组"`
	Server    string    `json:"server" gorm:"size:255"`  // 原始服务器地址
	Port      int       `json:"port" gorm:"default:0"`   // 原始服务器端口
	Config    string    `json:"config" gorm:"type:text"` // YAML 格式的完整配置
	Latency   int       `json:"latency" gorm:"default:-1"`
	LocalPort *int      `json:"local_port"` // 当前分配的本地端口（启用时有值）
	LastPort  *int      `json:"last_port"`  // 最后使用的端口（停止后保留）
	IsEnabled bool      `json:"is_enabled" gorm:"default:false"`
	Protocol  string    `json:"protocol" gorm:"size:50"` // ss, vmess, vless, trojan 等
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime"`
	// 健康检查相关字段（通过代理端口实际测试，与 Latency 节点延迟不同）
	HealthStatus    string     `json:"health_status" gorm:"size:20;default:unknown"` // healthy/unhealthy/unknown
	LastHealthCheck *time.Time `json:"last_health_check"`                            // 最后健康检查时间
	ProxyLatency    int        `json:"proxy_latency" gorm:"default:-1"`              // 代理实际延迟（毫秒）
}

// TableName 指定表名（与 Python 版本兼容）
func (ProxyNode) TableName() string {
	return "proxies"
}

// Settings 系统设置模型
type Settings struct {
	ID             int64     `json:"id" gorm:"primaryKey;autoIncrement"`
	PortRangeStart int       `json:"port_range_start" gorm:"default:10000"`
	PortRangeEnd   int       `json:"port_range_end" gorm:"default:11000"`
	TestURL        string    `json:"test_url" gorm:"size:512;default:http://www.gstatic.com/generate_204"`
	TestTimeout    int       `json:"test_timeout" gorm:"default:10"` // 秒
	MihomoAPIPort  int       `json:"mihomo_api_port" gorm:"default:9090"`
	AuthUsername   *string   `json:"auth_username" gorm:"size:100"`                // 代理服务认证用户名
	AuthPassword   *string   `json:"auth_password" gorm:"size:100"`                // 代理服务认证密码
	AdminUsername  string    `json:"admin_username" gorm:"size:100;default:admin"` // 管理员用户名
	AdminPassword  string    `json:"-" gorm:"size:255;default:admin"`              // 管理员密码（不返回给前端）
	IsFirstLogin   bool      `json:"is_first_login" gorm:"default:true"`           // 是否首次登录
	UpdatedAt      time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}

// TableName 指定表名
func (Settings) TableName() string {
	return "settings"
}

// ProxyConfig 代理配置结构（从 YAML 解析）
type ProxyConfig struct {
	Name     string      `yaml:"name" json:"name"`
	Type     string      `yaml:"type" json:"type"`
	Server   string      `yaml:"server" json:"server"`
	Port     interface{} `yaml:"port" json:"port"` // 可能是 int 或 string
	Password string      `yaml:"password,omitempty" json:"password,omitempty"`
	Cipher   string      `yaml:"cipher,omitempty" json:"cipher,omitempty"`
	UUID     string      `yaml:"uuid,omitempty" json:"uuid,omitempty"`
	// 其他可选字段根据协议类型不同而变化，使用 map 存储原始配置
}

// SubscriptionConfig Clash 订阅配置结构
type SubscriptionConfig struct {
	Proxies []map[string]interface{} `yaml:"proxies"`
}

// GlobalTrafficStats 全局流量统计模型（持久化存储）
type GlobalTrafficStats struct {
	ID           int64     `json:"id" gorm:"primaryKey;autoIncrement"`
	Upload       int64     `json:"upload" gorm:"default:0"`           // 累计上传流量（字节）
	Download     int64     `json:"download" gorm:"default:0"`         // 累计下载流量（字节）
	TotalTraffic int64     `json:"total_traffic" gorm:"default:0"`    // 总流量（上传+下载）
	LastUpdate   time.Time `json:"last_update" gorm:"autoUpdateTime"` // 最后更新时间
	CreatedAt    time.Time `json:"created_at" gorm:"autoCreateTime"`  // 创建时间
}

// TableName 指定表名
func (GlobalTrafficStats) TableName() string {
	return "global_traffic_stats"
}
