import React, { useState, useEffect } from 'react';
import { Server, Zap, Clock, CheckCircle, XCircle, TrendingUp, ArrowDownCircle, ArrowUpCircle, Globe } from 'lucide-react';

interface Stats {
    total: number;
    active: number;
    avgLatency: number;
    healthy: number;
    timeout: number;
}

interface TrafficStats {
    upload: number;
    download: number;
    total_traffic: number;
    last_update: string;
}

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': token } : {};
};

// 格式化字节数为人类可读格式
const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const DashboardPage: React.FC = () => {
    const [stats, setStats] = useState<Stats>({
        total: 0,
        active: 0,
        avgLatency: 0,
        healthy: 0,
        timeout: 0
    });
    const [traffic, setTraffic] = useState<TrafficStats>({
        upload: 0,
        download: 0,
        total_traffic: 0,
        last_update: ''
    });
    const [recentNodes, setRecentNodes] = useState<any[]>([]);

    useEffect(() => {
        // 获取节点统计数据
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/proxies', { headers: getAuthHeaders() });
                const data = await res.json();
                if (Array.isArray(data)) {
                    const total = data.length;
                    const active = data.filter((n: any) => n.is_enabled).length;
                    const validLatencies = data.filter((n: any) => n.latency > 0);
                    const avgLatency = validLatencies.length > 0
                        ? Math.round(validLatencies.reduce((sum: number, n: any) => sum + n.latency, 0) / validLatencies.length)
                        : 0;
                    const healthy = data.filter((n: any) => n.latency > 0 && n.latency < 300).length;
                    const timeout = data.filter((n: any) => n.latency <= 0).length;

                    setStats({ total, active, avgLatency, healthy, timeout });
                    // 按ID倒序排列，取最近添加的5个节点
                    const sortedData = [...data].sort((a: any, b: any) => b.id - a.id);
                    setRecentNodes(sortedData.slice(0, 5));
                }
            } catch (error) {
                console.error('获取统计数据失败:', error);
            }
        };

        // 获取全局流量统计
        const fetchTraffic = async () => {
            try {
                const res = await fetch('/api/traffic', { headers: getAuthHeaders() });
                const data = await res.json();
                if (res.ok) {
                    setTraffic({
                        upload: data.upload || 0,
                        download: data.download || 0,
                        total_traffic: data.total_traffic || 0,
                        last_update: data.last_update || ''
                    });
                }
            } catch (error) {
                console.error('获取流量统计失败:', error);
            }
        };

        fetchStats();
        fetchTraffic();

        // 定时刷新流量统计（每1分钟）
        const interval = setInterval(fetchTraffic, 60000);
        return () => clearInterval(interval);
    }, []);

    const StatBlock = ({ icon: Icon, label, value, subtext, valueClassName }: { icon: any, label: string, value: string | number, subtext?: string, valueClassName?: string }) => (
        <div className="flex items-center gap-4 py-4">
            <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center">
                <Icon className="w-5 h-5 text-secondary" />
            </div>
            <div>
                <p className={`text-2xl font-semibold tracking-tight ${valueClassName || ''}`}>{value}</p>
                <p className="text-sm text-secondary">{label}</p>
            </div>
            {subtext && <span className="text-xs text-secondary ml-auto">{subtext}</span>}
        </div>
    );

    return (
        <div className="space-y-8">
            {/* 页面标题 */}
            <div>
                <h2 className="text-xl font-medium tracking-tight">工作台</h2>
                <p className="text-sm text-secondary">系统运行状态概览</p>
            </div>

            {/* 统计条 - 平铺式，无卡片包裹 */}
            <div className="grid grid-cols-5 gap-6 border-b border-border pb-6">
                <StatBlock icon={Server} label="节点总数" value={stats.total} />
                <StatBlock icon={Zap} label="已启用" value={stats.active} />
                <StatBlock icon={Clock} label="平均延迟" value={stats.avgLatency > 0 ? `${stats.avgLatency}ms` : '-'} />
                <StatBlock icon={CheckCircle} label="健康节点" value={stats.healthy} />
                <StatBlock icon={XCircle} label="超时节点" value={stats.timeout} />
            </div>

            {/* 流量统计卡片 */}
            <div>
                <h3 className="text-sm font-medium text-secondary uppercase tracking-wider mb-4">全局流量统计</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div className="border border-border rounded-lg p-4 bg-white">
                        <div className="flex items-center gap-2">
                            <ArrowDownCircle className="w-5 h-5 text-green-500" />
                            <p className="text-sm text-secondary">累计下载</p>
                        </div>
                        <p className="text-2xl font-semibold mt-2 text-green-600">{formatBytes(traffic.download)}</p>
                    </div>
                    <div className="border border-border rounded-lg p-4 bg-white">
                        <div className="flex items-center gap-2">
                            <ArrowUpCircle className="w-5 h-5 text-blue-500" />
                            <p className="text-sm text-secondary">累计上传</p>
                        </div>
                        <p className="text-2xl font-semibold mt-2 text-blue-600">{formatBytes(traffic.upload)}</p>
                    </div>
                    <div className="border border-border rounded-lg p-4 bg-white">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-purple-500" />
                            <p className="text-sm text-secondary">总流量</p>
                        </div>
                        <p className="text-2xl font-semibold mt-2 text-purple-600">{formatBytes(traffic.total_traffic)}</p>
                    </div>
                </div>
                {traffic.last_update && (
                    <p className="text-xs text-secondary mt-2">
                        最后更新: {new Date(traffic.last_update).toLocaleString()}
                    </p>
                )}
            </div>

            {/* 左右分栏布局 */}
            <div className="grid grid-cols-3 gap-8">
                {/* 左侧 - 最近节点列表 */}
                <div className="col-span-2">
                    <h3 className="text-sm font-medium text-secondary uppercase tracking-wider mb-4">最近添加的节点</h3>
                    <div className="divide-y divide-border">
                        {recentNodes.length === 0 ? (
                            <p className="py-8 text-center text-secondary text-sm">暂无节点数据</p>
                        ) : (
                            recentNodes.map((node: any, i: number) => (
                                <div key={node.id || i} className="flex items-center justify-between py-3">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-2 h-2 rounded-full ${node.is_enabled ? 'bg-success' : 'bg-gray-300'}`} />
                                        <span className="font-medium">{node.name || node.remark || '未命名节点'}</span>
                                        <span className="text-xs text-secondary uppercase bg-gray-100 px-1.5 py-0.5 rounded">{node.protocol}</span>
                                    </div>
                                    <div className="text-sm text-secondary font-mono">
                                        {node.latency > 0 ? `${node.latency}ms` : '未测速'}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 右侧 - 快速操作 */}
                <div>
                    <h3 className="text-sm font-medium text-secondary uppercase tracking-wider mb-4">快速操作</h3>
                    <div className="space-y-3">
                        <a href="/nodes" className="block w-full text-left px-4 py-3 border border-border rounded hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <Server className="w-4 h-4 text-secondary" />
                                <span className="text-sm font-medium">管理代理节点</span>
                            </div>
                            <p className="text-xs text-secondary mt-1 ml-7">导入、测速、启用/禁用</p>
                        </a>
                        <a href="/proxies" className="block w-full text-left px-4 py-3 border border-border rounded hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <Globe className="w-4 h-4 text-secondary" />
                                <span className="text-sm font-medium">代理管理</span>
                            </div>
                            <p className="text-xs text-secondary mt-1 ml-7">查看运行中的代理、分组管理</p>
                        </a>
                        <a href="/settings" className="block w-full text-left px-4 py-3 border border-border rounded hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <TrendingUp className="w-4 h-4 text-secondary" />
                                <span className="text-sm font-medium">系统配置</span>
                            </div>
                            <p className="text-xs text-secondary mt-1 ml-7">端口范围、认证设置</p>
                        </a>
                    </div>
                </div>
            </div>

            {/* API 文档 */}
            <div>
                <h3 className="text-sm font-medium text-secondary uppercase tracking-wider mb-4">API 文档</h3>
                <div className="bg-white border border-border rounded-lg p-6 space-y-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded">GET</span>
                            <code className="text-sm font-semibold text-gray-800">/api/proxies/active</code>
                        </div>
                        <p className="text-sm text-secondary mb-3">获取所有可用的代理节点列表（延迟小于5秒的健康代理）。返回包含服务器IP、本地端口、认证信息等详细数据的JSON数组。</p>
                        <div className="bg-gray-900 rounded-md p-4 group relative">
                            <pre className="text-xs font-mono text-gray-300 overflow-x-auto">
                                {`curl -X GET "${window.location.origin}/api/proxies/active" \\
  -H "Authorization: <token>"`}
                            </pre>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded">GET</span>
                            <code className="text-sm font-semibold text-gray-800">/api/proxies/active/random</code>
                        </div>
                        <p className="text-sm text-secondary mb-3">随机获取一个可用的代理节点（延迟小于5秒的健康代理）。返回单个节点详情。</p>
                        <div className="bg-gray-900 rounded-md p-4 group relative">
                            <pre className="text-xs font-mono text-gray-300 overflow-x-auto">
                                {`curl -X GET "${window.location.origin}/api/proxies/active/random" \\
  -H "Authorization: <token>"`}
                            </pre>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded">GET</span>
                            <code className="text-sm font-semibold text-gray-800">/api/proxies/all</code>
                        </div>
                        <p className="text-sm text-secondary mb-3">获取所有已开启的代理节点（不管健康状态）。返回包含延迟和健康状态的完整信息。</p>
                        <div className="bg-gray-900 rounded-md p-4 group relative">
                            <pre className="text-xs font-mono text-gray-300 overflow-x-auto">
                                {`curl -X GET "${window.location.origin}/api/proxies/all" \\
  -H "Authorization: <token>"`}
                            </pre>
                        </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <h4 className="text-sm font-medium text-gray-900">响应数据结构示例</h4>
                            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                Token 可在系统设置 - 认证配置中查看
                            </span>
                        </div>
                        <p className="text-xs text-secondary mb-2">/api/proxies/active 和 /api/proxies/active/random 响应格式：</p>
                        <pre className="text-xs font-mono text-secondary overflow-x-auto whitespace-pre-wrap mb-4">
                            {`{
  "host_ip": "192.168.1.100",      // 当前服务器IP
  "local_port": 10001,             // 代理监听端口
  "remark": "美国节点01",           // 备注
  "server_info": "us.example.com", // 节点服务器地址
  "auth_username": "user",         // 认证用户名
  "auth_password": "pass",         // 认证密码
  "group_name": "默认分组",         // 分组名称
  "tag_name": "VIP",               // 标签名称
  "node_name": "US Node 01",       // 节点名称
  "protocol": "vmess"              // 原协议
}`}
                        </pre>
                        <p className="text-xs text-secondary mb-2">/api/proxies/all 响应格式（额外包含延迟和状态）：</p>
                        <pre className="text-xs font-mono text-secondary overflow-x-auto whitespace-pre-wrap">
                            {`{
  "host_ip": "192.168.1.100",
  "local_port": 10001,
  "remark": "美国节点01",
  "server_info": "us.example.com",
  "auth_username": "user",
  "auth_password": "pass",
  "group_name": "默认分组",
  "tag_name": "VIP",
  "node_name": "US Node 01",
  "protocol": "vmess",
  "latency": 256,                  // 延迟（毫秒），-1 表示未检测
  "health_status": "healthy"       // 健康状态：healthy/unhealthy/unknown
}`}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
};
