// Package database 提供数据库初始化和连接管理
package database

import (
	"log"
	"mppm/config"
	"mppm/models"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB 全局数据库连接
var DB *gorm.DB

// Init 初始化数据库连接
func Init() error {
	cfg := config.GetConfig()

	// 确保数据目录存在
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		return err
	}

	dbPath := cfg.DBPath()
	log.Printf("数据库路径: %s", dbPath)

	// 配置 GORM 日志
	gormConfig := &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Warn),
		DisableForeignKeyConstraintWhenMigrating: true, // 禁用外键约束以便更安全地迁移
	}

	// 打开 SQLite 数据库
	db, err := gorm.Open(sqlite.Open(dbPath), gormConfig)
	if err != nil {
		return err
	}

	// 检查表是否存在，只对新表进行迁移
	migrator := db.Migrator()

	// ProxyNode 表迁移
	if !migrator.HasTable(&models.ProxyNode{}) {
		if err := migrator.CreateTable(&models.ProxyNode{}); err != nil {
			return err
		}
		log.Println("创建 proxies 表")
	} else {
		// 使用原生 SQL 检查并添加 last_port 列
		var count int
		db.Raw("SELECT COUNT(*) FROM pragma_table_info('proxies') WHERE name='last_port'").Scan(&count)
		if count == 0 {
			if err := db.Exec("ALTER TABLE proxies ADD COLUMN last_port INTEGER").Error; err != nil {
				log.Printf("添加 last_port 列失败: %v", err)
			} else {
				log.Println("添加 last_port 列到 proxies 表")
			}
		}

		// 检查并添加 group 列
		var groupCount int
		db.Raw("SELECT COUNT(*) FROM pragma_table_info('proxies') WHERE name='group'").Scan(&groupCount)
		if groupCount == 0 {
			if err := db.Exec("ALTER TABLE proxies ADD COLUMN `group` TEXT DEFAULT '默认分组'").Error; err != nil {
				log.Printf("添加 group 列失败: %v", err)
			} else {
				log.Println("添加 group 列到 proxies 表")
			}
		}

		// 检查并添加 server 列
		var serverCount int
		db.Raw("SELECT COUNT(*) FROM pragma_table_info('proxies') WHERE name='server'").Scan(&serverCount)
		if serverCount == 0 {
			if err := db.Exec("ALTER TABLE proxies ADD COLUMN server TEXT DEFAULT ''").Error; err != nil {
				log.Printf("添加 server 列失败: %v", err)
			} else {
				log.Println("添加 server 列到 proxies 表")
			}
		}

		// 检查并添加 port 列
		var portCount int
		db.Raw("SELECT COUNT(*) FROM pragma_table_info('proxies') WHERE name='port'").Scan(&portCount)
		if portCount == 0 {
			if err := db.Exec("ALTER TABLE proxies ADD COLUMN port INTEGER DEFAULT 0").Error; err != nil {
				log.Printf("添加 port 列失败: %v", err)
			} else {
				log.Println("添加 port 列到 proxies 表")
			}
		}
	}

	// Settings 表迁移
	if !migrator.HasTable(&models.Settings{}) {
		if err := migrator.CreateTable(&models.Settings{}); err != nil {
			return err
		}
		log.Println("创建 settings 表")
	} else {
		// 检查并添加 admin_username 列
		var adminUsernameCount int
		db.Raw("SELECT COUNT(*) FROM pragma_table_info('settings') WHERE name='admin_username'").Scan(&adminUsernameCount)
		if adminUsernameCount == 0 {
			if err := db.Exec("ALTER TABLE settings ADD COLUMN admin_username TEXT DEFAULT 'admin'").Error; err != nil {
				log.Printf("添加 admin_username 列失败: %v", err)
			} else {
				log.Println("添加 admin_username 列到 settings 表")
			}
		}

		// 检查并添加 admin_password 列
		var adminPasswordCount int
		db.Raw("SELECT COUNT(*) FROM pragma_table_info('settings') WHERE name='admin_password'").Scan(&adminPasswordCount)
		if adminPasswordCount == 0 {
			if err := db.Exec("ALTER TABLE settings ADD COLUMN admin_password TEXT DEFAULT 'admin'").Error; err != nil {
				log.Printf("添加 admin_password 列失败: %v", err)
			} else {
				log.Println("添加 admin_password 列到 settings 表")
			}
		}

		// 检查并添加 is_first_login 列
		var isFirstLoginCount int
		db.Raw("SELECT COUNT(*) FROM pragma_table_info('settings') WHERE name='is_first_login'").Scan(&isFirstLoginCount)
		if isFirstLoginCount == 0 {
			if err := db.Exec("ALTER TABLE settings ADD COLUMN is_first_login INTEGER DEFAULT 1").Error; err != nil {
				log.Printf("添加 is_first_login 列失败: %v", err)
			} else {
				log.Println("添加 is_first_login 列到 settings 表")
			}
		}
	}

	// GlobalTrafficStats 表迁移
	if !migrator.HasTable(&models.GlobalTrafficStats{}) {
		if err := migrator.CreateTable(&models.GlobalTrafficStats{}); err != nil {
			return err
		}
		log.Println("创建 global_traffic_stats 表")
	}

	log.Println("数据库表已初始化")
	DB = db

	// 重置所有代理状态：服务重启后代理应处于关闭状态
	// 用户需要手动启用代理
	resetResult := db.Model(&models.ProxyNode{}).
		Where("is_enabled = ?", true).
		Updates(map[string]interface{}{
			"is_enabled": false,
			"local_port": nil,
		})
	if resetResult.Error != nil {
		log.Printf("重置代理状态失败: %v", resetResult.Error)
	} else if resetResult.RowsAffected > 0 {
		log.Printf("已重置 %d 个代理的状态为关闭", resetResult.RowsAffected)
	}

	return nil
}

// GetDB 获取数据库连接
func GetDB() *gorm.DB {
	return DB
}

// Close 关闭数据库连接
func Close() error {
	if DB != nil {
		sqlDB, err := DB.DB()
		if err != nil {
			return err
		}
		return sqlDB.Close()
	}
	return nil
}

// EnsureDataDir 确保数据目录存在
func EnsureDataDir() error {
	cfg := config.GetConfig()
	dirs := []string{
		cfg.DataDir,
		filepath.Join(cfg.DataDir, "mihomo"),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	return nil
}
