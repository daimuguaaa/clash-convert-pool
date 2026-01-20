import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, RefreshCw, Trash2, PlayCircle, StopCircle, Edit3, X, Upload, CheckSquare, Square, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Info, Power } from 'lucide-react';

interface ProxyNode {
    id: number;
    uid: string;
    name: string;
    remark?: string;
    tag: string;
    server: string;  // 原始服务器地址
    port: number;    // 原始服务器端口
    protocol: string;
    latency: number;
    is_enabled: boolean;
    local_port?: number;
    last_port?: number;  // 历史端口
}

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': token } : {})
    };
};

export const NodesPage: React.FC = () => {
    const [proxies, setProxies] = useState<ProxyNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [latencyFilter, setLatencyFilter] = useState<string>("");
    const [sortBy, setSortBy] = useState<'name' | 'latency' | 'protocol' | 'tag' | 'is_enabled'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // 标签相关
    const [tags, setTags] = useState<string[]>([]);
    const [currentTag, setCurrentTag] = useState<string>("全部");

    // 多选相关
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // 弹窗状态
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importUrl, setImportUrl] = useState("");
    const [importTag, setImportTag] = useState("默认");
    const [newTagInput, setNewTagInput] = useState("");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importText, setImportText] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const [editingNode, setEditingNode] = useState<ProxyNode | null>(null);
    const [editRemark, setEditRemark] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 标签重命名
    const [renameTagModal, setRenameTagModal] = useState<{ open: boolean; oldName: string; newName: string }>({ open: false, oldName: '', newName: '' });

    // 测速状态
    const [isTesting, setIsTesting] = useState(false);

    // 批量开启代理弹窗
    const [isEnableModalOpen, setIsEnableModalOpen] = useState(false);
    const [portStart, setPortStart] = useState(10000);
    const [portEnd, setPortEnd] = useState(10100);
    const [isEnabling, setIsEnabling] = useState(false);

    // 单个开启代理弹窗
    const [singleEnableNode, setSingleEnableNode] = useState<ProxyNode | null>(null);
    const [singlePort, setSinglePort] = useState(10000);

    // 分页相关
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

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

    const fetchTags = async () => {
        try {
            const res = await fetch('/api/proxies/tags', { headers: getAuthHeaders() });
            const data = await res.json();
            if (Array.isArray(data)) {
                setTags(data);
            }
        } catch (error) {
            console.error("获取标签列表失败:", error);
        }
    };

    const fetchProxies = async (tag?: string) => {
        setIsLoading(true);
        try {
            const tagParam = (tag || currentTag) !== "全部" ? `?tag=${encodeURIComponent(tag || currentTag)}` : "";
            const res = await fetch(`/api/proxies${tagParam}`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (Array.isArray(data)) {
                setProxies(data);
            }
        } catch (error) {
            console.error("获取节点列表失败:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings', { headers: getAuthHeaders() });
            const data = await res.json();
            setPortStart(data.portRangeStart || 10000);
            setPortEnd(data.portRangeEnd || 11000);
        } catch (error) {
            console.error("获取设置失败:", error);
        }
    };

    useEffect(() => {
        fetchTags();
        fetchProxies();
        fetchSettings();
    }, []);

    useEffect(() => {
        fetchProxies(currentTag);
    }, [currentTag]);

    // 点击表头排序
    const handleSort = (column: 'name' | 'latency' | 'protocol' | 'tag' | 'is_enabled') => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortBy !== column) return null;
        return sortOrder === 'asc'
            ? <ChevronUp className="w-3 h-3 inline ml-1" />
            : <ChevronDown className="w-3 h-3 inline ml-1" />;
    };

    // 筛选与排序
    let filtered = proxies.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.remark && p.remark.toLowerCase().includes(search.toLowerCase()));
        if (!matchSearch) return false;

        // 延迟过滤
        const latencyMs = parseInt(latencyFilter);
        if (!isNaN(latencyMs) && latencyMs > 0) {
            if (p.latency <= 0 || p.latency > latencyMs) return false;
        }
        return true;
    });

    filtered = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortBy === 'latency') cmp = (a.latency <= 0 ? 99999 : a.latency) - (b.latency <= 0 ? 99999 : b.latency);
        else if (sortBy === 'protocol') cmp = a.protocol.localeCompare(b.protocol);
        else if (sortBy === 'tag') cmp = a.tag.localeCompare(b.tag);
        else if (sortBy === 'is_enabled') cmp = (a.is_enabled === b.is_enabled) ? 0 : (a.is_enabled ? -1 : 1);
        return sortOrder === 'asc' ? cmp : -cmp;
    });

    // 分页计算
    const totalPages = Math.ceil(filtered.length / pageSize);
    const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // 当筛选条件变化时重置页码
    useEffect(() => {
        setCurrentPage(1);
    }, [search, latencyFilter, currentTag, sortBy, sortOrder]);

    // 导入
    const handleImport = async () => {
        const tagToUse = newTagInput.trim() || importTag;
        if (!tagToUse) {
            alert('请输入或选择一个标签');
            return;
        }
        if (!importUrl.trim() && !importFile && !importText.trim()) {
            alert('请输入订阅链接、选择配置文件或粘贴配置内容');
            return;
        }

        setIsImporting(true);
        try {
            const formData = new FormData();
            if (importFile) {
                formData.append('file', importFile);
            } else if (importUrl.trim()) {
                formData.append('url', importUrl);
            } else if (importText.trim()) {
                // 将文本内容作为文件上传
                const blob = new Blob([importText], { type: 'text/yaml' });
                formData.append('file', blob, 'pasted_config.yaml');
            }
            formData.append('tag', tagToUse);

            const token = localStorage.getItem('token');
            const res = await fetch('/api/proxies/import', {
                method: 'POST',
                headers: token ? { 'Authorization': token } : {},
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                alert(`导入成功: ${data.message}`);
                setIsImportModalOpen(false);
                setImportUrl("");
                setImportFile(null);
                setImportText("");
                setNewTagInput("");
                setCurrentTag(tagToUse);
                fetchTags();
                fetchProxies(tagToUse);
            } else {
                alert(`导入失败: ${data.detail || '未知错误'}`);
            }
        } catch (e) {
            alert("导入失败: " + e);
        } finally {
            setIsImporting(false);
        }
    };

    // 测速
    const handleTestLatency = async (ids?: number[]) => {
        const targetIds = ids || Array.from(selectedIds);
        if (targetIds.length === 0) {
            const allIds = filtered.map(p => p.id);
            if (allIds.length === 0) {
                showToast('info', '没有可测速的节点');
                return;
            }
            if (!confirm(`将测试当前列表中的 ${allIds.length} 个节点，继续吗？`)) return;
            return handleTestLatency(allIds);
        }

        setIsTesting(true);
        try {
            const res = await fetch('/api/proxies/test', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ ids: targetIds })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('success', data.message || '测速完成');
                fetchProxies();
            } else {
                showToast('error', `测速失败: ${data.detail || '未知错误'}`);
            }
        } catch (e) {
            showToast('error', '测速请求失败');
        } finally {
            setIsTesting(false);
        }
    };

    // 删除确认弹窗状态
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; ids: number[] }>({ open: false, ids: [] });

    // 确认删除逻辑
    const confirmDelete = async () => {
        const ids = deleteConfirm.ids;
        if (ids.length === 0) return;

        try {
            const res = await fetch('/api/proxies', {
                method: 'DELETE',
                headers: getAuthHeaders(),
                body: JSON.stringify({ ids })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('success', `已删除 ${data.deleted} 个节点`);
                setSelectedIds(new Set());
                fetchProxies();
                fetchTags();
            } else {
                showToast('error', `删除失败: ${data.error || '未知错误'}`);
            }
        } catch (e) {
            showToast('error', '删除请求失败');
        } finally {
            setDeleteConfirm({ open: false, ids: [] });
        }
    };

    // 批量删除
    const handleBatchDelete = () => {
        if (selectedIds.size === 0) {
            showToast('info', '请先选择要删除的节点');
            return;
        }
        setDeleteConfirm({ open: true, ids: Array.from(selectedIds) });
    };

    // 批量开启代理
    const handleBatchEnable = async () => {
        if (selectedIds.size === 0) {
            showToast('info', '请先选择要开启的节点');
            return;
        }
        setIsEnableModalOpen(true);
    };

    const confirmBatchEnable = async () => {
        if (portStart >= portEnd) {
            showToast('error', '端口范围无效，结束端口必须大于开始端口');
            return;
        }
        const availablePorts = portEnd - portStart;
        if (availablePorts < selectedIds.size) {
            showToast('error', `端口范围不足，需要 ${selectedIds.size} 个端口，但只有 ${availablePorts} 个可用`);
            return;
        }

        setIsEnabling(true);
        try {
            const res = await fetch('/api/proxies/batch-enable', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ids: Array.from(selectedIds),
                    port_start: portStart,
                    port_end: portEnd
                })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('success', data.message || `已开启 ${data.enabled} 个代理`);
                setIsEnableModalOpen(false);
                setSelectedIds(new Set());
                fetchProxies();
            } else {
                showToast('error', `开启失败: ${data.detail || '未知错误'}`);
            }
        } catch (e) {
            showToast('error', '开启请求失败');
        } finally {
            setIsEnabling(false);
        }
    };

    // 开启单个代理
    const handleSingleEnable = (node: ProxyNode) => {
        // 优先使用 last_port（上次使用的端口），如果没有则自动分配
        if (node.last_port) {
            // 检查 last_port 是否被其他节点占用
            const isUsed = proxies.some(p => p.id !== node.id && p.local_port === node.last_port);
            if (!isUsed) {
                setSinglePort(node.last_port);
            } else {
                // 被占用，分配新端口
                const usedPorts = new Set(proxies.filter(p => p.local_port).map(p => p.local_port));
                let nextPort = portStart;
                while (usedPorts.has(nextPort) && nextPort < portEnd) {
                    nextPort++;
                }
                setSinglePort(nextPort);
            }
        } else {
            // 没有 last_port，找到下一个可用端口
            const usedPorts = new Set(proxies.filter(p => p.local_port).map(p => p.local_port));
            let nextPort = portStart;
            while (usedPorts.has(nextPort) && nextPort < portEnd) {
                nextPort++;
            }
            setSinglePort(nextPort);
        }
        setSingleEnableNode(node);
    };

    const confirmSingleEnable = async () => {
        if (!singleEnableNode) return;
        if (singlePort < 1024 || singlePort > 65535) {
            showToast('error', '端口号必须在1024-65535之间');
            return;
        }

        try {
            const res = await fetch(`/api/proxies/${singleEnableNode.id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ is_enabled: true, local_port: singlePort })
            });
            if (res.ok) {
                showToast('success', `代理已开启，端口: ${singlePort}`);
                setSingleEnableNode(null);
                fetchProxies();
            } else {
                const data = await res.json();
                showToast('error', data.detail || '开启失败');
            }
        } catch (e) {
            showToast('error', '操作失败');
        }
    };

    // 关闭代理
    const handleDisable = async (node: ProxyNode) => {
        try {
            const res = await fetch(`/api/proxies/${node.id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ is_enabled: false })
            });
            if (res.ok) {
                showToast('success', '代理已停止');
                fetchProxies();
            }
        } catch (e) {
            showToast('error', '操作失败');
        }
    };

    // 切换节点启用状态 - 已弃用，改用单独开启/关闭
    const handleToggleEnable = async (node: ProxyNode) => {
        if (node.is_enabled) {
            handleDisable(node);
        } else {
            handleSingleEnable(node);
        }
    };

    // 重命名
    const handleRename = async () => {
        if (!editingNode) return;
        try {
            const res = await fetch(`/api/proxies/${editingNode.id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ remark: editRemark })
            });
            if (res.ok) {
                setEditingNode(null);
                fetchProxies();
            }
        } catch (e) {
            alert('重命名失败');
        }
    };

    // 多选操作
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

    // 标签重命名处理
    const handleRenameTag = async () => {
        const { oldName, newName } = renameTagModal;
        if (!newName.trim() || newName === oldName) {
            setRenameTagModal({ ...renameTagModal, open: false });
            return;
        }

        try {
            const res = await fetch(`/api/proxies/tags/${encodeURIComponent(oldName)}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ new_tag: newName })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('success', `标签已重命名为 "${newName}"`);
                setRenameTagModal({ open: false, oldName: '', newName: '' });
                if (currentTag === oldName) setCurrentTag(newName);
                fetchTags();
                fetchProxies(currentTag === oldName ? newName : currentTag);
            } else {
                showToast('error', data.detail || '重命名失败');
            }
        } catch (e) {
            showToast('error', '重命名请求失败');
        }
    };

    const StatusDot = ({ latency }: { latency: number }) => {
        let color = "bg-gray-300";
        if (latency > 0) {
            color = latency < 200 ? "bg-success" : (latency < 500 ? "bg-warning" : "bg-error");
        }
        return <span className={`w-2 h-2 rounded-full ${color} inline-block mr-2 flex-shrink-0`} />;
    };

    return (
        <div className="space-y-5">
            {/* 页眉 */}
            <header className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-medium tracking-tight">节点管理</h2>
                    <p className="text-sm text-secondary">导入、管理并测试您的订阅节点</p>
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
                        onClick={() => handleTestLatency()}
                        disabled={isTesting}
                        className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
                        {isTesting ? '测速中...' : '批量测速'}
                    </button>
                    <button onClick={() => setIsImportModalOpen(true)} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        导入节点
                    </button>
                </div>
            </header>

            {/* 标签栏 - 平铺显示 */}
            <div className="flex items-center gap-2 flex-wrap border-b border-border pb-3">
                <button
                    onClick={() => setCurrentTag("全部")}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${currentTag === "全部"
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-secondary hover:bg-gray-200'
                        }`}
                >
                    全部
                </button>
                {tags.map(tag => (
                    <button
                        key={tag}
                        onClick={() => setCurrentTag(tag)}
                        onDoubleClick={() => setRenameTagModal({ open: true, oldName: tag, newName: tag })}
                        title="双击重命名"
                        className={`px-3 py-1.5 text-sm rounded transition-colors select-none ${currentTag === tag
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-secondary hover:bg-gray-200'
                            }`}
                    >
                        {tag}
                    </button>
                ))}
            </div>

            {/* 工具栏 */}
            <div className="flex justify-between items-center py-3">
                <div className="flex items-center gap-4">
                    {/* 搜索框 */}
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-secondary pointer-events-none" />
                        <input
                            type="text"
                            placeholder="搜索节点名称..."
                            className="py-2 pr-3 pl-10 bg-sidebar border border-transparent text-sm focus:outline-none focus:bg-white focus:border-border transition-colors rounded-full w-72"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    {/* 延迟过滤 - 输入框 */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-secondary">延迟 ≤</span>
                        <input
                            type="number"
                            placeholder="不限"
                            className="input-base w-20 text-center"
                            value={latencyFilter}
                            onChange={e => setLatencyFilter(e.target.value)}
                        />
                        <span className="text-sm text-secondary">ms</span>
                    </div>

                    {/* 选中超时节点按钮 */}
                    <button
                        onClick={() => {
                            // 超时节点：测速失败(latency=0)或延迟>1000ms
                            const timeoutNodes = filtered.filter(p => p.latency === 0 || p.latency > 1000);
                            if (timeoutNodes.length === 0) {
                                showToast('info', '没有超时节点');
                                return;
                            }
                            setSelectedIds(new Set(timeoutNodes.map(n => n.id)));
                            showToast('success', `已选中 ${timeoutNodes.length} 个超时节点`);
                        }}
                        className="px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded hover:bg-orange-100 transition-colors text-sm"
                    >
                        选中超时节点
                    </button>
                </div>

                <div className="flex items-center gap-3 text-sm">
                    {selectedIds.size > 0 && (
                        <>
                            <span className="text-secondary">已选 {selectedIds.size} 项</span>
                            <button
                                onClick={handleBatchDelete}
                                className="px-3 py-1.5 bg-red-50 text-error border border-red-200 rounded hover:bg-red-100 transition-colors flex items-center gap-1"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                批量删除
                            </button>
                            <button
                                onClick={handleBatchEnable}
                                className="px-3 py-1.5 bg-green-50 text-green-600 border border-green-200 rounded hover:bg-green-100 transition-colors flex items-center gap-1"
                            >
                                <Power className="w-3.5 h-3.5" />
                                批量开启代理
                            </button>
                        </>
                    )}
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                        端口范围: {portStart} - {portEnd}
                    </span>
                    <span className="text-secondary ml-2">共 {filtered.length} 个节点</span>
                </div>
            </div>

            {/* 表格 */}
            <div className="w-full text-left">
                {/* 表头 - 可点击排序 */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 border-y border-border bg-sidebar text-xs font-medium text-secondary uppercase tracking-wider">
                    <div className="col-span-1 flex items-center">
                        <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-200 rounded">
                            {selectedIds.size === filtered.length && filtered.length > 0 ?
                                <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                    </div>
                    <div
                        className="col-span-2 cursor-pointer hover:text-primary select-none whitespace-nowrap"
                        onClick={() => handleSort('name')}
                    >
                        节点名称 <SortIcon column="name" />
                    </div>
                    <div className="col-span-1 whitespace-nowrap">备注</div>
                    <div
                        className="col-span-1 cursor-pointer hover:text-primary select-none whitespace-nowrap"
                        onClick={() => handleSort('tag')}
                    >
                        标签 <SortIcon column="tag" />
                    </div>
                    <div className="col-span-2 whitespace-nowrap">服务器</div>
                    <div
                        className="col-span-1 cursor-pointer hover:text-primary select-none whitespace-nowrap"
                        onClick={() => handleSort('protocol')}
                    >
                        协议 <SortIcon column="protocol" />
                    </div>
                    <div
                        className="col-span-1 cursor-pointer hover:text-primary select-none whitespace-nowrap"
                        onClick={() => handleSort('latency')}
                    >
                        延迟 <SortIcon column="latency" />
                    </div>
                    <div
                        className="col-span-1 cursor-pointer hover:text-primary select-none whitespace-nowrap"
                        onClick={() => handleSort('is_enabled')}
                    >
                        状态 <SortIcon column="is_enabled" />
                    </div>
                    <div className="col-span-1 whitespace-nowrap">本地端口</div>
                    <div className="col-span-1 text-right whitespace-nowrap">操作</div>
                </div>

                {/* 数据行 */}
                <div className="divide-y divide-border">
                    {isLoading ? (
                        <div className="py-12 text-center text-secondary">加载中...</div>
                    ) : filtered.length === 0 ? (
                        <div className="py-12 text-center text-secondary">
                            暂无节点数据，请点击右上角导入
                        </div>
                    ) : (
                        paginatedData.map(proxy => (
                            <div key={proxy.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50 transition-colors group">
                                <div className="col-span-1">
                                    <button onClick={() => toggleSelect(proxy.id)} className="p-1 hover:bg-gray-200 rounded">
                                        {selectedIds.has(proxy.id) ?
                                            <CheckSquare className="w-4 h-4 text-primary" /> :
                                            <Square className="w-4 h-4 text-secondary" />}
                                    </button>
                                </div>
                                <div className="col-span-2 font-medium flex items-center pr-4">
                                    <StatusDot latency={proxy.latency} />
                                    <span className="truncate" title={proxy.name}>
                                        {proxy.name}
                                    </span>
                                </div>
                                <div className="col-span-1 text-sm text-secondary truncate" title={proxy.remark || '-'}>
                                    {proxy.remark && proxy.remark !== proxy.name ? (
                                        <span className="text-primary">{proxy.remark}</span>
                                    ) : (
                                        <span className="text-gray-300">-</span>
                                    )}
                                </div>
                                <div className="col-span-1 text-sm text-secondary truncate" title={proxy.tag}>
                                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs border border-gray-200">
                                        {proxy.tag}
                                    </span>
                                </div>
                                <div
                                    className="col-span-2 text-xs font-mono text-secondary truncate cursor-pointer hover:text-primary transition-colors"
                                    title={`点击复制: ${proxy.server}:${proxy.port}`}
                                    onClick={() => {
                                        if (proxy.server) {
                                            const text = `${proxy.server}:${proxy.port}`;
                                            navigator.clipboard.writeText(text).then(() => {
                                                // 显示临时提示
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
                                    ) : (
                                        <span className="text-gray-300">-</span>
                                    )}
                                </div>
                                <div className="col-span-1">
                                    <span className="text-[10px] uppercase bg-gray-100 text-secondary px-1.5 py-0.5 rounded border border-gray-200">
                                        {proxy.protocol}
                                    </span>
                                </div>
                                <div className="col-span-1 text-sm font-mono text-secondary">
                                    {proxy.latency > 0 ? `${proxy.latency}ms` : <span className="text-gray-300">-</span>}
                                </div>
                                <div className="col-span-1">
                                    {proxy.is_enabled ? (
                                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                                            运行中
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200">
                                            已停止
                                        </span>
                                    )}
                                </div>
                                <div className="col-span-1 text-sm font-mono">
                                    {proxy.is_enabled && proxy.local_port ? (
                                        <span className="text-green-600 font-semibold text-xs border border-green-200 px-2 py-1 rounded bg-green-50">
                                            :{proxy.local_port}
                                        </span>
                                    ) : proxy.last_port ? (
                                        <span className="text-gray-400 text-xs border border-gray-200 px-2 py-1 rounded bg-gray-50 bg-opacity-50" title="上次使用的端口">
                                            :{proxy.last_port}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300 text-xs">-</span>
                                    )}
                                </div>
                                <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleToggleEnable(proxy)}
                                        className="p-1.5 hover:bg-gray-200 rounded text-secondary hover:text-primary transition-colors"
                                        title={proxy.is_enabled ? "禁用" : "启用"}
                                    >
                                        {proxy.is_enabled ? <StopCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                                    </button>
                                    <button
                                        onClick={() => { setEditingNode(proxy); setEditRemark(proxy.remark || proxy.name); }}
                                        className="p-1.5 hover:bg-gray-200 rounded text-secondary hover:text-primary transition-colors"
                                        title="重命名"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleTestLatency([proxy.id])}
                                        className="p-1.5 hover:bg-gray-200 rounded text-secondary hover:text-primary transition-colors"
                                        title="测速"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm({ open: true, ids: [proxy.id] })}
                                        className="p-1.5 hover:bg-gray-200 rounded text-secondary hover:text-error transition-colors"
                                        title="删除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 分页控件 */}
            {filtered.length > 0 && (
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
                            第 {currentPage} / {totalPages} 页，共 {filtered.length} 条
                        </span>
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="px-2 py-1.5 border border-border rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium"
                            title="首页"
                        >
                            首页
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 border border-border rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="上一页"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        {/* 页码按钮 */}
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (currentPage <= 3) {
                                pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                            } else {
                                pageNum = currentPage - 2 + i;
                            }
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`w-8 h-8 text-sm border rounded ${currentPage === pageNum
                                        ? 'bg-primary text-white border-primary'
                                        : 'border-border hover:bg-gray-100'
                                        }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}

                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1.5 border border-border rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="下一页"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="px-2 py-1.5 border border-border rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium"
                            title="末页"
                        >
                            末页
                        </button>
                    </div>
                </div>
            )}

            {/* 导入弹窗 */}
            {isImportModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-modal w-[550px] border border-border">
                        <div className="flex justify-between items-center p-4 border-b border-border">
                            <h3 className="font-semibold text-lg">导入订阅</h3>
                            <button onClick={() => setIsImportModalOpen(false)} className="text-secondary hover:text-primary">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            {/* 标签选择 */}
                            <div>
                                <label className="block text-sm font-medium mb-2">导入标签</label>
                                <div className="flex gap-2">
                                    <select
                                        className="input-base flex-1"
                                        value={importTag}
                                        onChange={e => { setImportTag(e.target.value); setNewTagInput(""); }}
                                    >
                                        <option value="默认">默认</option>
                                        {tags.filter(t => t !== "默认").map(tag => (
                                            <option key={tag} value={tag}>{tag}</option>
                                        ))}
                                    </select>
                                    <span className="text-secondary self-center">或</span>
                                    <input
                                        type="text"
                                        className="input-base flex-1"
                                        placeholder="新建标签..."
                                        value={newTagInput}
                                        onChange={e => setNewTagInput(e.target.value)}
                                    />
                                </div>
                                <p className="text-xs text-secondary mt-1">标签用于区分不同批次的导入，方便管理</p>
                            </div>

                            {/* URL导入 */}
                            <div>
                                <label className="block text-sm font-medium mb-2">方式一：订阅链接</label>
                                <input
                                    type="text"
                                    className="input-base"
                                    placeholder="https://example.com/api/v1/client/subscribe..."
                                    value={importUrl}
                                    onChange={e => { setImportUrl(e.target.value); setImportFile(null); }}
                                    disabled={!!importFile}
                                />
                            </div>

                            {/* 文件上传 */}
                            <div>
                                <label className="block text-sm font-medium mb-2">方式二：上传配置文件</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".yaml,.yml,.txt"
                                    className="hidden"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setImportFile(file);
                                            setImportUrl("");
                                            setImportText("");
                                        }
                                    }}
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${importFile ? 'border-success bg-green-50' : 'border-border hover:border-gray-400'
                                        }`}
                                >
                                    {importFile ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Upload className="w-5 h-5 text-success" />
                                            <span className="text-success font-medium">{importFile.name}</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setImportFile(null); }}
                                                className="ml-2 text-secondary hover:text-error"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 text-secondary mx-auto mb-2" />
                                            <p className="text-sm text-secondary">点击上传 YAML 配置文件</p>
                                            <p className="text-xs text-gray-400 mt-1">支持 .yaml, .yml, .txt 格式</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* 文本粘贴 */}
                            <div>
                                <label className="block text-sm font-medium mb-2">方式三：粘贴配置内容</label>
                                <textarea
                                    className="input-base h-32 font-mono text-xs"
                                    placeholder="直接粘贴 YAML 或 Base64 内容..."
                                    value={importText}
                                    onChange={e => {
                                        setImportText(e.target.value);
                                        setImportUrl("");
                                        setImportFile(null);
                                    }}
                                    disabled={!!importFile || !!importUrl}
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                            <button onClick={() => setIsImportModalOpen(false)} className="btn-secondary">取消</button>
                            <button
                                onClick={handleImport}
                                disabled={isImporting || (!importUrl.trim() && !importFile && !importText.trim())}
                                className="btn-primary disabled:opacity-50"
                            >
                                {isImporting ? '导入中...' : '确认导入'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 修改备注弹窗 */}
            {editingNode && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-modal w-[400px] border border-border">
                        <div className="flex justify-between items-center p-4 border-b border-border">
                            <h3 className="font-semibold text-lg">修改备注</h3>
                            <button onClick={() => setEditingNode(null)} className="text-secondary hover:text-primary">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-medium mb-2">备注内容</label>
                            <input
                                type="text"
                                className="input-base"
                                value={editRemark}
                                onChange={e => setEditRemark(e.target.value)}
                            />
                        </div>
                        <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                            <button onClick={() => setEditingNode(null)} className="btn-secondary">取消</button>
                            <button onClick={handleRename} className="btn-primary">保存</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 批量开启代理弹窗 */}
            {isEnableModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-modal w-[450px] border border-border">
                        <div className="flex justify-between items-center p-4 border-b border-border">
                            <h3 className="font-semibold text-lg">批量开启代理</h3>
                            <button onClick={() => setIsEnableModalOpen(false)} className="text-secondary hover:text-primary">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    将为选中的 <strong>{selectedIds.size}</strong> 个节点分配本地端口并启动代理服务
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">端口范围</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        className="input-base w-28 text-center"
                                        value={portStart}
                                        onChange={e => setPortStart(Number(e.target.value))}
                                        min={1024}
                                        max={65535}
                                    />
                                    <span className="text-secondary">至</span>
                                    <input
                                        type="number"
                                        className="input-base w-28 text-center"
                                        value={portEnd}
                                        onChange={e => setPortEnd(Number(e.target.value))}
                                        min={1024}
                                        max={65535}
                                    />
                                </div>
                                <p className="text-xs text-secondary mt-2">
                                    可用端口数: {Math.max(0, portEnd - portStart)}，需要端口数: {selectedIds.size}
                                </p>
                            </div>
                            <div className="text-sm text-secondary bg-gray-50 rounded p-3">
                                <p>💡 提示：端口将按顺序分配给选中的节点</p>
                            </div>
                        </div>
                        <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                            <button onClick={() => setIsEnableModalOpen(false)} className="btn-secondary">取消</button>
                            <button
                                onClick={confirmBatchEnable}
                                disabled={isEnabling || portEnd - portStart < selectedIds.size}
                                className="btn-primary disabled:opacity-50 flex items-center gap-2"
                            >
                                {isEnabling ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        开启中...
                                    </>
                                ) : (
                                    <>
                                        <Power className="w-4 h-4" />
                                        确认开启
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 单个开启代理弹窗 */}
            {singleEnableNode && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-modal w-[400px] border border-border">
                        <div className="flex justify-between items-center p-4 border-b border-border">
                            <h3 className="font-semibold text-lg">开启代理</h3>
                            <button onClick={() => setSingleEnableNode(null)} className="text-secondary hover:text-primary">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="text-sm">
                                <span className="text-secondary">节点：</span>
                                <span className="font-medium">{singleEnableNode.remark || singleEnableNode.name}</span>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">本地端口</label>
                                <input
                                    type="number"
                                    className="input-base w-full text-center font-mono"
                                    value={singlePort}
                                    onChange={e => setSinglePort(Number(e.target.value))}
                                    min={1024}
                                    max={65535}
                                />
                                <p className="text-xs text-secondary mt-2">
                                    端口范围: 1024-65535
                                </p>
                            </div>
                        </div>
                        <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                            <button onClick={() => setSingleEnableNode(null)} className="btn-secondary">取消</button>
                            <button
                                onClick={confirmSingleEnable}
                                className="btn-primary flex items-center gap-2"
                            >
                                <Power className="w-4 h-4" />
                                开启代理
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* 标签重命名弹窗 */}
            {renameTagModal.open && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-modal w-[400px] border border-border">
                        <div className="flex justify-between items-center p-4 border-b border-border">
                            <h3 className="font-semibold text-lg">重命名标签</h3>
                            <button onClick={() => setRenameTagModal({ ...renameTagModal, open: false })} className="text-secondary hover:text-primary">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-medium mb-2">新标签名称</label>
                            <input
                                type="text"
                                className="input-base"
                                value={renameTagModal.newName}
                                onChange={e => setRenameTagModal({ ...renameTagModal, newName: e.target.value })}
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleRenameTag()}
                            />
                        </div>
                        <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                            <button onClick={() => setRenameTagModal({ ...renameTagModal, open: false })} className="btn-secondary">取消</button>
                            <button onClick={handleRenameTag} className="btn-primary">保存</button>
                        </div>
                    </div>
                </div>
            )}
            {/* 删除确认弹窗 */}
            {deleteConfirm.open && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-modal w-[400px] border border-border">
                        <div className="flex justify-between items-center p-4 border-b border-border">
                            <h3 className="font-semibold text-lg text-error flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                确认删除
                            </h3>
                            <button onClick={() => setDeleteConfirm({ open: false, ids: [] })} className="text-secondary hover:text-primary">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <p className="text-base mb-4">
                                确定要删除选中的 <span className="font-bold">{deleteConfirm.ids.length}</span> 个节点吗？
                            </p>

                            {/* 检查是否有运行中的节点 */}
                            {(() => {
                                const runningNodes = proxies.filter(p => deleteConfirm.ids.includes(p.id) && p.is_enabled);
                                if (runningNodes.length > 0) {
                                    return (
                                        <div className="bg-orange-50 border border-orange-200 rounded-md p-3 text-sm text-orange-800">
                                            <p className="font-bold flex items-center gap-1 mb-1">
                                                <AlertCircle className="w-4 h-4" />
                                                注意：包含 {runningNodes.length} 个运行中的节点
                                            </p>
                                            <ul className="list-disc list-inside ml-1 opacity-80">
                                                {runningNodes.slice(0, 3).map(n => (
                                                    <li key={n.id} className="truncate">{n.name}</li>
                                                ))}
                                                {runningNodes.length > 3 && <li>...等 {runningNodes.length} 个</li>}
                                            </ul>
                                            <p className="mt-2 text-xs font-semibold">
                                                确认删除将自动关闭对应端口并停止服务。
                                            </p>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
                            <button onClick={() => setDeleteConfirm({ open: false, ids: [] })} className="btn-secondary">取消</button>
                            <button onClick={confirmDelete} className="px-4 py-2 bg-error text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm font-medium">
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
