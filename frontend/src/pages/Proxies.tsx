import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, StopCircle, Edit3, X, CheckSquare, Square, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Info, Power, Copy } from 'lucide-react';

interface EnabledProxy {
    id: number;
    uid: string;
    name: string;
    tag: string;
    group: string;
    remark?: string;
    protocol: string;
    local_port?: number;
    last_port?: number;  // 最后使用的端口
    is_enabled: boolean;
    latency: number;  // 节点延迟（来自节点测速）
    proxy_latency?: number;  // 代理延迟（来自健康检查）
    health_status?: string;  // 健康状态: healthy/unhealthy/unknown
    server?: string;
    port?: number;
}

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': token } : {})
    };
};

export const ProxiesPage: React.FC = () => {
    const [proxies, setProxies] = useState<EnabledProxy[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");

    // 分组相关
    const [groups, setGroups] = useState<string[]>([]);
    const [currentGroup, setCurrentGroup] = useState<string>("全部");
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [groupInput, setGroupInput] = useState("");
    const [groupModalError, setGroupModalError] = useState<string>("");

    // 筛选相关
    const [filterGroup, setFilterGroup] = useState<string>("");
    const [filterTag, setFilterTag] = useState<string>("");
    const [tags, setTags] = useState<string[]>([]);

    // 更新分组和标签列表
    useEffect(() => {
        const uniqueGroups = Array.from(new Set(proxies.map(p => p.group || "默认分组"))).sort();
        const uniqueTags = Array.from(new Set(proxies.map(p => p.tag))).filter(Boolean).sort();
        setGroups(uniqueGroups);
        setTags(uniqueTags);
    }, [proxies]);

    // 认证设置
    const [authUsername, setAuthUsername] = useState("");
    const [authPassword, setAuthPassword] = useState("");

    // 多选
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // 分页
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // 编辑备注
    const [editingProxy, setEditingProxy] = useState<EnabledProxy | null>(null);
    const [editRemark, setEditRemark] = useState("");
    const [editPort, setEditPort] = useState<number | "">(0);
    const [editGroup, setEditGroup] = useState("");

    // 确认对话框
    const [confirmDialog, setConfirmDialog] = useState<{
        visible: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        confirmText?: string;
        cancelText?: string;
        type?: 'danger' | 'warning' | 'info';
    }>({
        visible: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    const showConfirm = (options: {
        title: string;
        message: string;
        onConfirm: () => void;
        confirmText?: string;
        cancelText?: string;
        type?: 'danger' | 'warning' | 'info';
    }) => {
        setConfirmDialog({ visible: true, ...options });
    };

    const hideConfirm = () => {
        setConfirmDialog(prev => ({ ...prev, visible: false }));
    };

    // Toast 通知
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; visible: boolean }>({
        type: 'info',
        message: '',
        visible: false
    });

    const showToast = (type: 'success' | 'error' | 'info', message: string) => {
        setToast({ type, message, visible: true });
        setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings', { headers: getAuthHeaders() });
            const data = await res.json();
            console.log("获取设置:", data);
            // 后端返回的是驼峰命名: authUsername, authPassword
            setAuthUsername(data.authUsername ?? "");
            setAuthPassword(data.authPassword ?? "");
        } catch (error) {
            console.error("获取设置失败:", error);
        }
    };

    const fetchProxies = async () => {
        setIsLoading(true);
        try {
            // 获取所有曾经开启过代理的节点（有 last_port 的）
            const res = await fetch('/api/proxies', { headers: getAuthHeaders() });
            const data = await res.json();
            if (Array.isArray(data)) {
                // 筛选有 last_port 的节点（曾经开启过代理的）
                setProxies(data.filter((p: EnabledProxy) => p.last_port || (p.is_enabled && p.local_port)));
            }
        } catch (error) {
            console.error("获取代理列表失败:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
        fetchProxies();
    }, []);

    // 筛选
    const filtered = proxies.filter(p => {
        // 分组标签栏筛选
        if (currentGroup !== "全部" && (p.group || "默认分组") !== currentGroup) return false;

        // 下拉框分组筛选
        if (filterGroup && (p.group || "默认分组") !== filterGroup) return false;
        // 下拉框标签筛选
        if (filterTag && p.tag !== filterTag) return false;

        const searchLower = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(searchLower) ||
            (p.remark && p.remark.toLowerCase().includes(searchLower));
        const matchPort = String(p.local_port).includes(search);
        const matchServer = p.server && p.server.toLowerCase().includes(searchLower);
        return matchName || matchPort || matchServer;
    });

    // 分页
    const totalPages = Math.ceil(filtered.length / pageSize);
    const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, currentGroup, filterGroup, filterTag]);

    // 停止代理
    const handleStop = async (id: number) => {
        try {
            const res = await fetch(`/api/proxies/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ is_enabled: false })
            });
            if (res.ok) {
                showToast('success', '代理已停止');
                fetchProxies();
            } else {
                const data = await res.json();
                showToast('error', data.error || '停止失败');
            }
        } catch (e) {
            showToast('error', '操作失败');
        }
    };

    // 批量停止
    const handleBatchStop = () => {
        if (selectedIds.size === 0) {
            showToast('info', '请先选择要停止的代理');
            return;
        }
        showConfirm({
            title: '批量停止代理',
            message: `确定要停止选中的 ${selectedIds.size} 个代理吗？`,
            type: 'warning',
            confirmText: '停止',
            onConfirm: async () => {
                hideConfirm();
                try {
                    const res = await fetch('/api/proxies/batch-disable', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ ids: Array.from(selectedIds) })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        showToast('success', data.message || `已停止 ${data.disabled} 个代理`);
                        setSelectedIds(new Set());
                        fetchProxies();
                    } else {
                        showToast('error', data.error || '停止失败');
                    }
                } catch (e) {
                    showToast('error', '批量停止失败');
                }
            }
        });
    };

    // 批量启用
    const handleBatchEnable = async () => {
        if (selectedIds.size === 0) {
            showToast('info', '请先选择要启用的代理');
            return;
        }

        try {
            // 逐个启用选中的代理
            const ids = Array.from(selectedIds);
            let successCount = 0;
            for (const id of ids) {
                const res = await fetch(`/api/proxies/${id}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ is_enabled: true })
                });
                if (res.ok) successCount++;
            }
            showToast('success', `已启用 ${successCount} 个代理`);
            setSelectedIds(new Set());
            fetchProxies();
        } catch (e) {
            showToast('error', '批量启用失败');
        }
    };

    // 批量修改分组
    const handleBatchUpdateGroup = async () => {
        if (!groupInput.trim()) {
            setGroupModalError("请输入分组名称");
            return;
        }
        setGroupModalError("");
        try {
            const res = await fetch('/api/proxies/batch-group', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ ids: Array.from(selectedIds), group: groupInput.trim() })
            });

            const data = await res.json();
            if (res.ok) {
                showToast('success', data.message || '分组更新成功');
                setIsGroupModalOpen(false);
                setGroupInput("");
                setGroupModalError("");
                setSelectedIds(new Set());
                fetchProxies();
            } else {
                setGroupModalError(data.error || '更新失败');
            }
        } catch (e) {
            setGroupModalError('请求失败，请检查网络连接');
        }
    };

    // 批量删除
    const handleBatchDelete = () => {
        if (selectedIds.size === 0) {
            showToast('info', '请先选择要删除的节点');
            return;
        }
        showConfirm({
            title: '批量删除节点',
            message: `确定要删除选中的 ${selectedIds.size} 个节点吗？此操作不可恢复！`,
            type: 'danger',
            confirmText: '删除',
            onConfirm: async () => {
                hideConfirm();
                try {
                    const res = await fetch('/api/proxies', {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ ids: Array.from(selectedIds) })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        showToast('success', data.message || `已删除 ${data.deleted} 个节点`);
                        setSelectedIds(new Set());
                        fetchProxies();
                    } else {
                        showToast('error', data.error || '删除失败');
                    }
                } catch (e) {
                    showToast('error', '批量删除失败');
                }
            }
        });
    };

    // 启用单个代理
    const handleEnable = async (id: number) => {
        try {
            const res = await fetch(`/api/proxies/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ is_enabled: true })
            });
            if (res.ok) {
                showToast('success', '代理已启用');
                fetchProxies();
            } else {
                const data = await res.json();
                showToast('error', data.error || '启用失败');
            }
        } catch (e) {
            showToast('error', '操作失败');
        }
    };

    // 重命名
    const handleRename = async () => {
        if (!editingProxy) return;

        // 验证端口
        if (editPort && (editPort < 1024 || editPort > 65535)) {
            showToast('error', '端口号必须在1024-65535之间');
            return;
        }

        try {
            const updateData: any = { remark: editRemark };
            // 更新分组
            if (editGroup && editGroup !== (editingProxy.group || "默认分组")) {
                updateData.group = editGroup;
            }
            // 使用与表格显示相同的逻辑来比较端口
            const currentPort = editingProxy.is_enabled ? editingProxy.local_port : editingProxy.last_port;
            if (editPort && editPort !== currentPort) {
                updateData.local_port = editPort;
            }

            const res = await fetch(`/api/proxies/${editingProxy.id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(updateData)
            });

            if (res.ok) {
                showToast('success', '更新成功');
                setEditingProxy(null);
                await fetchProxies(); // 等待刷新完成
            } else {
                const data = await res.json();
                showToast('error', data.error || '更新失败');
            }
        } catch (e) {
            showToast('error', '操作失败');
        }
    };

    // 多选
    const toggleSelect = (id: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(p => p.id)));
        }
    };

    // 根据健康状态和延迟显示状态点
    const StatusDot = ({ proxy }: { proxy: EnabledProxy }) => {
        let color = "bg-gray-300";
        const latency = proxy.proxy_latency ?? -1;
        if (proxy.health_status === 'healthy' && latency > 0) {
            color = latency < 200 ? "bg-success" : (latency < 500 ? "bg-warning" : "bg-error");
        } else if (proxy.health_status === 'unhealthy') {
            color = "bg-error";
        }
        return <span className={`w-2 h-2 rounded-full ${color} inline-block mr-2 flex-shrink-0`} />;
    };

    // 测试单个代理延迟（通过本地端口测试）
    const handleTestLatency = async (id: number) => {
        try {
            const res = await fetch('/api/proxies/proxy-test', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ ids: [id] })
            });
            if (res.ok) {
                showToast('success', '测速完成');
                fetchProxies();
            } else {
                showToast('error', '测速失败');
            }
        } catch (e) {
            showToast('error', '测速请求失败');
        }
    };

    // 批量测试代理延迟（通过本地端口测试）
    const handleBatchTestLatency = async () => {
        if (selectedIds.size === 0) {
            showToast('info', '请先选择要测速的代理');
            return;
        }
        try {
            const res = await fetch('/api/proxies/proxy-test', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('success', data.message || '测速完成');
                fetchProxies();
            } else {
                showToast('error', '测速失败');
            }
        } catch (e) {
            showToast('error', '测速请求失败');
        }
    };

    return (
        <div className="space-y-5">
            {/* 页眉 */}
            <header className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-medium tracking-tight">代理管理</h2>
                    <p className="text-sm text-secondary">管理已启用的代理服务 · <span className="text-blue-500">系统每2分钟自动检测代理健康状态</span></p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Toast 通知 - 内联显示 */}
                    {toast.visible && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-300 ${toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' :
                            toast.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' :
                                'bg-blue-50 border border-blue-200 text-blue-700'
                            }`}>
                            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                            {toast.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
                            <span>{toast.message}</span>
                            <button onClick={() => setToast(prev => ({ ...prev, visible: false }))} className="ml-1 opacity-60 hover:opacity-100">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={fetchProxies}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        刷新
                    </button>
                </div>
            </header>

            {/* 分组标签栏 */}
            <div className="flex items-center gap-2 flex-wrap border-b border-border pb-3">
                <button
                    onClick={() => setCurrentGroup("全部")}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${currentGroup === "全部"
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-secondary hover:bg-gray-200'
                        }`}
                >
                    全部
                </button>
                {groups.map(group => (
                    <button
                        key={group}
                        onClick={() => setCurrentGroup(group)}
                        className={`px-3 py-1.5 text-sm rounded transition-colors select-none ${currentGroup === group
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-secondary hover:bg-gray-200'
                            }`}
                    >
                        {group}
                    </button>
                ))}
            </div>

            {/* 统计信息 */}
            <div className="grid grid-cols-3 gap-4">
                <div className="border border-border rounded-lg p-4 bg-white">
                    <p className="text-2xl font-semibold">{proxies.filter(p => p.is_enabled && p.local_port).length}</p>
                    <p className="text-sm text-secondary">运行中的代理</p>
                </div>
                <div className="border border-border rounded-lg p-4 bg-white">
                    <p className="text-2xl font-semibold text-green-600">
                        {proxies.filter(p => p.is_enabled && p.health_status === 'healthy').length}
                    </p>
                    <p className="text-sm text-secondary">健康良好</p>
                </div>
                <div className="border border-border rounded-lg p-4 bg-white">
                    <p className="text-2xl font-semibold text-orange-600">
                        {proxies.filter(p => p.is_enabled && (p.health_status === 'unhealthy' || p.health_status === 'unknown')).length}
                    </p>
                    <p className="text-sm text-secondary">不健康/未检测</p>
                </div>
            </div>

            {/* 工具栏 */}
            <div className="flex justify-between items-center py-3">
                <div className="flex items-center gap-4">
                    {/* 搜索框 */}
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-secondary pointer-events-none" />
                        <input
                            type="text"
                            placeholder="搜索端口、备注、IP..."
                            className="py-2 pr-3 pl-10 bg-sidebar border border-transparent text-sm focus:outline-none focus:bg-white focus:border-border transition-colors rounded-full w-60"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    {/* 分组筛选 */}
                    <select
                        className="input-base py-2 px-3 text-sm w-32"
                        value={filterGroup}
                        onChange={e => setFilterGroup(e.target.value)}
                    >
                        <option value="">全部分组</option>
                        {groups.map(g => (
                            <option key={g} value={g}>{g}</option>
                        ))}
                    </select>

                    {/* 标签筛选 */}
                    <select
                        className="input-base py-2 px-3 text-sm w-32"
                        value={filterTag}
                        onChange={e => setFilterTag(e.target.value)}
                    >
                        <option value="">全部标签</option>
                        {tags.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-3 text-sm">
                    {selectedIds.size > 0 && (
                        <>
                            <span className="text-secondary">已选 {selectedIds.size} 项</span>
                            <button
                                onClick={() => setIsGroupModalOpen(true)}
                                className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
                            >
                                <Edit3 className="w-3.5 h-3.5" />
                                修改分组
                            </button>
                            <button
                                onClick={() => {
                                    // 获取选中的代理
                                    const selectedProxies = proxies.filter(p => selectedIds.has(p.id));
                                    console.log("复制 HTTP, 认证:", { authUsername, authPassword });
                                    // 生成 HTTP 格式
                                    // 格式: 127.0.0.1:port:用户名:密码{备注} 或 127.0.0.1:port{备注}
                                    const httpList = selectedProxies.map(p => {
                                        const remark = p.remark || p.name;
                                        let line = `127.0.0.1:${p.local_port}`;
                                        if (authUsername && authPassword) {
                                            line += `:${authUsername}:${authPassword}`;
                                        }
                                        line += `{${remark}}`;
                                        return line;
                                    }).join('\n');
                                    navigator.clipboard.writeText(httpList).then(() => {
                                        showToast('success', `已复制 ${selectedProxies.length} 个 HTTP 代理地址`);
                                    }).catch(() => {
                                        showToast('error', '复制失败');
                                    });
                                }}
                                className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                复制 HTTP
                            </button>
                            <button
                                onClick={() => {
                                    // 获取选中的代理
                                    const selectedProxies = proxies.filter(p => selectedIds.has(p.id));
                                    console.log("复制 SOCKS5, 认证:", { authUsername, authPassword });
                                    // 生成 SOCKS5 格式
                                    // 格式: socks5://用户名:密码@127.0.0.1:port{备注} 或 socks5://127.0.0.1:port{备注}
                                    const socks5List = selectedProxies.map(p => {
                                        const remark = p.remark || p.name;
                                        let line = 'socks5://';
                                        if (authUsername && authPassword) {
                                            line += `${authUsername}:${authPassword}@`;
                                        }
                                        line += `127.0.0.1:${p.local_port}{${remark}}`;
                                        return line;
                                    }).join('\n');
                                    navigator.clipboard.writeText(socks5List).then(() => {
                                        showToast('success', `已复制 ${selectedProxies.length} 个 SOCKS5 代理地址`);
                                    }).catch(() => {
                                        showToast('error', '复制失败');
                                    });
                                }}
                                className="px-3 py-1.5 bg-purple-50 text-purple-600 border border-purple-200 rounded hover:bg-purple-100 transition-colors flex items-center gap-1"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                复制 SOCKS5
                            </button>
                            <button
                                onClick={handleBatchTestLatency}
                                className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                批量测速
                            </button>
                            <button
                                onClick={handleBatchStop}
                                className="px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded hover:bg-orange-100 transition-colors flex items-center gap-1"
                            >
                                <StopCircle className="w-3.5 h-3.5" />
                                批量停止
                            </button>
                            <button
                                onClick={handleBatchEnable}
                                className="px-3 py-1.5 bg-green-50 text-green-600 border border-green-200 rounded hover:bg-green-100 transition-colors flex items-center gap-1"
                            >
                                <Power className="w-3.5 h-3.5" />
                                批量启用
                            </button>
                            <button
                                onClick={handleBatchDelete}
                                className="px-3 py-1.5 bg-red-50 text-error border border-red-200 rounded hover:bg-red-100 transition-colors flex items-center gap-1"
                            >
                                <X className="w-3.5 h-3.5" />
                                批量删除
                            </button>
                        </>
                    )}
                    <span className="text-secondary">共 {filtered.length} 个代理</span>
                </div>
            </div>

            {/* 表格 */}
            <div className="w-full text-left">
                <div className="grid grid-cols-11 gap-4 px-4 py-3 border-y border-border bg-sidebar text-xs font-medium text-secondary uppercase tracking-wider">
                    <div className="col-span-1 flex items-center">
                        <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-200 rounded">
                            {selectedIds.size === filtered.length && filtered.length > 0 ?
                                <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="col-span-1">本地端口</div>
                    <div className="col-span-2">服务器</div>
                    <div className="col-span-1">分组</div>
                    <div className="col-span-1">标签</div>
                    <div className="col-span-2">节点名称</div>
                    <div className="col-span-1">状态</div>
                    <div className="col-span-1">延迟</div>
                    <div className="col-span-1 text-right">操作</div>
                </div>

                <div className="divide-y divide-border">
                    {isLoading ? (
                        <div className="py-12 text-center text-secondary">加载中...</div>
                    ) : filtered.length === 0 ? (
                        <div className="py-12 text-center text-secondary">
                            暂无符合条件的代理
                        </div>
                    ) : (
                        paginatedData.map(proxy => (
                            <div key={proxy.id} className="grid grid-cols-11 gap-4 px-4 py-3 items-center hover:bg-gray-50 transition-colors group">
                                <div className="col-span-1">
                                    <button onClick={() => toggleSelect(proxy.id)} className="p-1 hover:bg-gray-200 rounded">
                                        {selectedIds.has(proxy.id) ?
                                            <CheckSquare className="w-4 h-4 text-primary" /> :
                                            <Square className="w-4 h-4 text-secondary" />}
                                    </button>
                                </div>
                                <div className="col-span-1">
                                    {proxy.is_enabled && proxy.local_port ? (
                                        <span className="text-primary font-mono font-semibold text-xs border border-green-300 px-2 py-1 rounded bg-green-50 inline-flex items-center gap-1 whitespace-nowrap">
                                            <Power className="w-3 h-3 text-green-500 flex-shrink-0" />
                                            :{proxy.local_port}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400 font-mono text-xs border border-gray-200 px-2 py-1 rounded bg-gray-50 inline-flex items-center gap-1 whitespace-nowrap">
                                            <StopCircle className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                            :{proxy.last_port || '-'}
                                        </span>
                                    )}
                                </div>

                                <div
                                    className="col-span-2 text-xs font-mono text-secondary truncate cursor-pointer hover:text-primary transition-colors"
                                    title={`点击复制: ${proxy.server}:${proxy.port}`}
                                    onClick={() => {
                                        if (proxy.server) {
                                            const text = `${proxy.server}:${proxy.port}`;
                                            navigator.clipboard.writeText(text).then(() => {
                                                const el = document.createElement('div');
                                                el.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in';
                                                el.textContent = `已复制: ${text}`;
                                                document.body.appendChild(el);
                                                setTimeout(() => el.remove(), 1500);
                                            });
                                        }
                                    }}
                                >
                                    {proxy.server ? (
                                        <span className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-200">
                                            {proxy.server}:{proxy.port}
                                        </span>
                                    ) : '-'}
                                </div>
                                <div className="col-span-1 text-sm text-secondary truncate" title={proxy.group}>
                                    <span className="bg-gray-50 px-1.5 py-0.5 rounded text-xs border border-gray-200">
                                        {proxy.group || "默认分组"}
                                    </span>
                                </div>
                                <div className="col-span-1 text-sm text-secondary truncate" title={proxy.tag}>
                                    <span className="bg-gray-50 px-1.5 py-0.5 rounded text-xs border border-gray-200">
                                        {proxy.tag}
                                    </span>
                                </div>
                                <div className="col-span-2 text-sm font-medium truncate flex items-center" title={proxy.name}>
                                    <StatusDot proxy={proxy} />
                                    <span className="truncate">{proxy.name}</span>
                                    <span className="ml-1 text-[10px] uppercase bg-gray-100 text-secondary px-1 py-0.5 rounded border border-gray-200 flex-shrink-0">
                                        {proxy.protocol}
                                    </span>
                                </div>
                                <div className="col-span-1">
                                    {proxy.is_enabled ? (
                                        proxy.health_status === 'healthy' ? (
                                            <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-200">健康</span>
                                        ) : proxy.health_status === 'unhealthy' ? (
                                            <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-200">异常</span>
                                        ) : (
                                            <span className="text-xs bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">未检测</span>
                                        )
                                    ) : (
                                        <span className="text-xs bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200">已停止</span>
                                    )}
                                </div>
                                <div className="col-span-1 text-sm font-mono text-secondary">
                                    {(proxy.proxy_latency ?? -1) > 0 ? `${proxy.proxy_latency}ms` : <span className="text-gray-300">-</span>}
                                </div>
                                <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {proxy.is_enabled && (
                                        <button
                                            onClick={() => handleTestLatency(proxy.id)}
                                            className="p-1.5 hover:bg-gray-200 rounded text-secondary hover:text-blue-600 transition-colors"
                                            title="测试延迟"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setEditingProxy(proxy);
                                            setEditRemark(proxy.remark || proxy.name);
                                            setEditGroup(proxy.group || "默认分组");
                                            const displayPort = proxy.is_enabled ? proxy.local_port : proxy.last_port;
                                            setEditPort(displayPort || 0);
                                        }}
                                        className="p-1.5 hover:bg-gray-200 rounded text-secondary hover:text-primary transition-colors"
                                        title="编辑备注"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    {proxy.is_enabled ? (
                                        <button
                                            onClick={() => handleStop(proxy.id)}
                                            className="p-1.5 hover:bg-gray-200 rounded text-secondary hover:text-error transition-colors"
                                            title="停止代理"
                                        >
                                            <StopCircle className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleEnable(proxy.id)}
                                            className="p-1.5 hover:bg-gray-200 rounded text-secondary hover:text-green-600 transition-colors"
                                            title="启用代理"
                                        >
                                            <Power className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 分页 */}
            {
                filtered.length > 0 && (
                    <div className="flex justify-between items-center py-4 border-t border-border">
                        <div className="flex items-center gap-2 text-sm text-secondary">
                            <span>每页显示</span>
                            <select
                                className="input-base w-20 py-1"
                                value={pageSize}
                                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={30}>30</option>
                                <option value={50}>50</option>
                            </select>
                            <span>条</span>
                        </div>

                        <div className="flex items-center gap-1">
                            <span className="text-sm text-secondary mr-3">
                                第 {currentPage} / {totalPages || 1} 页，共 {filtered.length} 条
                            </span>
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-2 py-1.5 border border-border rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium"
                            >
                                首页
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 border border-border rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="p-1.5 border border-border rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="px-2 py-1.5 border border-border rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium"
                            >
                                末页
                            </button>
                        </div>
                    </div>
                )
            }

            {/* 修改分组弹窗 */}
            {
                isGroupModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                        <div className="bg-white rounded-lg shadow-modal w-[400px] border border-border">
                            <div className="flex justify-between items-center p-4 border-b border-border">
                                <h3 className="font-semibold text-lg">修改分组</h3>
                                <button onClick={() => { setIsGroupModalOpen(false); setGroupModalError(""); }} className="text-secondary hover:text-primary">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6">
                                <label className="block text-sm font-medium mb-2">新的分组名称</label>
                                <input
                                    type="text"
                                    className="input-base"
                                    value={groupInput}
                                    onChange={e => setGroupInput(e.target.value)}
                                    placeholder="输入分组名称..."
                                />
                                <p className="mt-2 text-xs text-secondary">
                                    将为选中的 {selectedIds.size} 个代理设置新的分组。
                                </p>
                                {groupModalError && (
                                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600 flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        {groupModalError}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                                <button onClick={() => { setIsGroupModalOpen(false); setGroupModalError(""); }} className="btn-secondary">取消</button>
                                <button onClick={handleBatchUpdateGroup} className="btn-primary">保存</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 编辑备注弹窗 */}
            {
                editingProxy && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                        <div className="bg-white rounded-lg shadow-modal w-[400px] border border-border">
                            <div className="flex justify-between items-center p-4 border-b border-border">
                                <h3 className="font-semibold text-lg">编辑备注</h3>
                                <button onClick={() => setEditingProxy(null)} className="text-secondary hover:text-primary">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="mb-4">
                                    <label className="block text-sm font-medium mb-2">本地端口</label>
                                    <input
                                        type="number"
                                        className="input-base"
                                        value={editPort}
                                        onChange={e => setEditPort(e.target.value ? parseInt(e.target.value) : "")}
                                        min="1024"
                                        max="65535"
                                        placeholder="1024-65535"
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium mb-2">备注名称</label>
                                    <input
                                        type="text"
                                        className="input-base"
                                        value={editRemark}
                                        onChange={e => setEditRemark(e.target.value)}
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium mb-2">分组</label>
                                    <input
                                        type="text"
                                        className="input-base"
                                        value={editGroup}
                                        onChange={e => setEditGroup(e.target.value)}
                                        placeholder="输入分组名称..."
                                        list="group-suggestions"
                                    />
                                    <datalist id="group-suggestions">
                                        {groups.map(g => (
                                            <option key={g} value={g} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>
                            <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                                <button onClick={() => setEditingProxy(null)} className="btn-secondary">取消</button>
                                <button onClick={handleRename} className="btn-primary">保存</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 确认对话框 */}
            {
                confirmDialog.visible && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] backdrop-blur-sm">
                        <div className="bg-white rounded-lg shadow-modal w-[400px] border border-border animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center p-4 border-b border-border">
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    {confirmDialog.type === 'danger' && <AlertCircle className="w-5 h-5 text-red-500" />}
                                    {confirmDialog.type === 'warning' && <AlertCircle className="w-5 h-5 text-orange-500" />}
                                    {confirmDialog.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                                    {confirmDialog.title}
                                </h3>
                                <button onClick={hideConfirm} className="text-secondary hover:text-primary">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6">
                                <p className="text-secondary">{confirmDialog.message}</p>
                            </div>
                            <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                                <button onClick={hideConfirm} className="btn-secondary">
                                    {confirmDialog.cancelText || '取消'}
                                </button>
                                <button
                                    onClick={confirmDialog.onConfirm}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${confirmDialog.type === 'danger'
                                        ? 'bg-red-500 text-white hover:bg-red-600'
                                        : confirmDialog.type === 'warning'
                                            ? 'bg-orange-500 text-white hover:bg-orange-600'
                                            : 'btn-primary'
                                        }`}
                                >
                                    {confirmDialog.confirmText || '确定'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
