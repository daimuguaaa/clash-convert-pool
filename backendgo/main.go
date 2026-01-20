// Mihomo Proxy-Pool Manager (MPPM) - Go 后端
// 主入口文件
package main

import (
	"embed"
	"io"
	"io/fs"
	"log"
	"mppm/config"
	"mppm/database"
	"mppm/handlers"
	"mppm/services"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

//go:embed static
var staticFiles embed.FS

func main() {
	log.Println("启动 Mihomo Proxy-Pool Manager (MPPM) 后端服务...")

	// 初始化数据库
	if err := database.EnsureDataDir(); err != nil {
		log.Fatalf("创建数据目录失败: %v", err)
	}

	if err := database.Init(); err != nil {
		log.Fatalf("初始化数据库失败: %v", err)
	}
	defer database.Close()

	// 启动流量采集器
	collector := services.GetTrafficCollector()
	collector.Start()
	defer collector.Stop()

	// 启动代理健康检查器
	healthChecker := services.GetHealthChecker()
	healthChecker.Start()
	defer healthChecker.Stop()

	// 创建 Gin 引擎
	r := gin.Default()

	// 配置 CORS - 允许前端跨域请求
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowAllOrigins = true
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
	r.Use(cors.New(corsConfig))

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "MPPM Backend (Go)",
		})
	})

	// API 路由组
	api := r.Group("/api")
	{
		// 认证路由（公开）
		api.POST("/auth/login", handlers.Login)

		// 需要认证的路由
		authApi := api.Group("")
		authApi.Use(handlers.AuthMiddleware())
		{
			// 认证检查
			authApi.GET("/auth/check", handlers.CheckAuth)
			authApi.POST("/auth/change-password", handlers.ChangePassword)

			// 代理节点管理
			authApi.GET("/proxies", handlers.GetProxies)
			authApi.GET("/proxies/tags", handlers.GetTags)
			authApi.PUT("/proxies/tags/:old_tag", handlers.RenameTag)
			authApi.POST("/proxies/import", handlers.ImportNodes)
			authApi.POST("/proxies/test", handlers.TestLatency)            // 节点测速
			authApi.POST("/proxies/proxy-test", handlers.TestProxyLatency) // 代理测速（通过本地端口）
			authApi.PUT("/proxies/:id", handlers.UpdateProxy)
			authApi.DELETE("/proxies", handlers.DeleteProxies)
			authApi.GET("/proxies/active", handlers.GetAvailableProxies)
			authApi.GET("/proxies/active/random", handlers.GetRandomAvailableProxy)
			authApi.GET("/proxies/all", handlers.GetAllEnabledProxies) // 获取所有已开启的代理（含延迟信息）
			authApi.POST("/proxies/batch-enable", handlers.BatchEnableProxies)
			authApi.POST("/proxies/batch-disable", handlers.BatchDisableProxies)
			authApi.PUT("/proxies/batch-group", handlers.BatchUpdateGroup)

			// 系统设置
			authApi.GET("/settings", handlers.GetSettings)
			authApi.PUT("/settings", handlers.UpdateSettings)

			// Mihomo 状态
			authApi.GET("/mihomo/status", handlers.GetMihomoStatus)
			authApi.POST("/mihomo/stop", handlers.StopMihomo)

			// 全局流量统计
			authApi.GET("/traffic", handlers.GetGlobalTrafficStats)
		}
	}

	// 优雅关闭
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		log.Println("正在关闭服务...")
		// 先停止 Mihomo 进程
		services.GetMihomoManager().Stop()
		database.Close()
		os.Exit(0)
	}()

	// 启动服务器
	port := config.GetConfig().ServerPort
	log.Printf("服务器监听端口: %s", port)

	// 静态文件服务
	// 在非开发模式下，或者如果 static 目录中有内容，则提供静态服务
	// 注意：go:embed 会在编译时打包文件，运行时始终可用
	// 我们在这里配置一个 fallback 处理所有非 API 请求

	// 从嵌入的文件系统中获取 static 子目录
	staticFS, _ := fs.Sub(staticFiles, "static")

	// 处理静态文件请求
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// 如果是 API 路径但未匹配到路由，返回 404
		if len(path) >= 4 && path[:4] == "/api" {
			c.JSON(404, gin.H{"error": "API route not found"})
			return
		}

		// 尝试从静态文件系统中查找文件
		// 注意：path 通常以 / 开头，我们需要去掉它
		filePath := path
		if len(filePath) > 0 && filePath[0] == '/' {
			filePath = filePath[1:]
		}

		// 如果是根路径，服务 index.html
		if filePath == "" {
			filePath = "index.html"
		}

		f, err := staticFS.Open(filePath)
		if err == nil {
			defer f.Close()
			stat, _ := f.Stat()
			// 如果是文件，直接服务
			if !stat.IsDir() {
				// 获取文件扩展名以设置 Content-Type
				// http.FileServer 会自动处理，但手动通过 ServeContent 需要注意
				http.FileServer(http.FS(staticFS)).ServeHTTP(c.Writer, c.Request)
				return
			}
		}

		// 如果文件不存在，或者是目录，对于 SPA 应用，应该返回 index.html
		// 这样前端路由 (如 /proxies) 才能被 React Router 正确处理
		indexFile, err := staticFS.Open("index.html")
		if err != nil {
			c.String(404, "Page not found")
			return
		}
		defer indexFile.Close()

		indexStat, _ := indexFile.Stat()
		http.ServeContent(c.Writer, c.Request, "index.html", indexStat.ModTime(), indexFile.(io.ReadSeeker))
	})

	if err := r.Run(":" + port); err != nil {
		log.Fatalf("启动服务器失败: %v", err)
	}
}
