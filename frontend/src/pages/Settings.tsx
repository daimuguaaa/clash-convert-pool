import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

interface SettingsData {
    portRangeStart: number;
    portRangeEnd: number;
    authUsername: string;
    authPassword: string;
    testUrl: string;
    testTimeout: number;
    mihomoApiPort: number;
}

interface MihomoStatus {
    running: boolean;
    pid: number | null;
    api_port: number;
}

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': token } : {})
    };
};

export const SettingsPage: React.FC = () => {
    const [activeSection, setActiveSection] = useState('proxy');
    const [settings, setSettings] = useState<SettingsData>({
        portRangeStart: 10000,
        portRangeEnd: 11000,
        authUsername: '',
        authPassword: '',
        testUrl: 'http://www.gstatic.com/generate_204',
        testTimeout: 10,
        mihomoApiPort: 9090
    });
    const [mihomoStatus, setMihomoStatus] = useState<MihomoStatus | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // 管理员密码修改
    const [currentPassword, setCurrentPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [showToken, setShowToken] = useState(false);

    // 加载设置
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch('/api/settings', {
                    headers: getAuthHeaders()
                });
                if (response.ok) {
                    const data = await response.json();
                    setSettings({
                        portRangeStart: data.portRangeStart,
                        portRangeEnd: data.portRangeEnd,
                        authUsername: data.authUsername || '',
                        authPassword: data.authPassword || '',
                        testUrl: data.testUrl,
                        testTimeout: data.testTimeout || 10,
                        mihomoApiPort: data.mihomoApiPort || 9090
                    });
                    // 设置当前管理员用户名
                    setNewUsername(data.admin_username || '');
                }
            } catch (error) {
                console.error('加载设置失败:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    // 加载 Mihomo 状态
    useEffect(() => {
        const fetchMihomoStatus = async () => {
            try {
                const response = await fetch('/api/mihomo/status', {
                    headers: getAuthHeaders()
                });
                if (response.ok) {
                    const data = await response.json();
                    setMihomoStatus(data);
                }
            } catch (error) {
                console.error('加载 Mihomo 状态失败:', error);
            }
        };
        fetchMihomoStatus();

        // 每 5 秒刷新一次状态
        const interval = setInterval(fetchMihomoStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);

        try {
            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    port_range_start: settings.portRangeStart,
                    port_range_end: settings.portRangeEnd,
                    test_url: settings.testUrl,
                    test_timeout: settings.testTimeout,
                    mihomo_api_port: settings.mihomoApiPort,
                    auth_username: settings.authUsername,
                    auth_password: settings.authPassword
                }),
            });

            if (response.ok) {
                setMessage({ type: 'success', text: '设置已保存' });
            } else {
                const error = await response.json();
                setMessage({ type: 'error', text: error.detail || '保存失败' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: '网络错误，保存失败' });
        } finally {
            setIsSaving(false);
            // 3秒后清除消息
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleStopMihomo = async () => {
        try {
            const response = await fetch('/api/mihomo/stop', {
                method: 'POST',
                headers: getAuthHeaders()
            });
            if (response.ok) {
                setMihomoStatus({ running: false, pid: null, api_port: settings.mihomoApiPort });
                setMessage({ type: 'success', text: '代理服务已停止' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: '停止代理服务失败' });
        }
        setTimeout(() => setMessage(null), 3000);
    };

    // 修改管理员密码
    const handleChangePassword = async () => {
        setPasswordMessage(null);

        // 验证
        if (!currentPassword) {
            setPasswordMessage({ type: 'error', text: '请输入当前密码' });
            return;
        }
        if (!newPassword) {
            setPasswordMessage({ type: 'error', text: '请输入新密码' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMessage({ type: 'error', text: '两次输入的密码不一致' });
            return;
        }
        if (newPassword.length < 4) {
            setPasswordMessage({ type: 'error', text: '密码长度至少为4位' });
            return;
        }

        setIsChangingPassword(true);

        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_username: newUsername || undefined,
                    new_password: newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                setPasswordMessage({ type: 'success', text: '密码修改成功，请重新登录' });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                // 标记首次登录已完成
                localStorage.setItem('isFirstLogin', 'false');
                // 3秒后跳转到登录页
                setTimeout(() => {
                    localStorage.removeItem('token');
                    window.location.href = '/login';
                }, 2000);
            } else {
                setPasswordMessage({ type: 'error', text: data.error || '修改失败' });
            }
        } catch (error) {
            setPasswordMessage({ type: 'error', text: '网络错误' });
        } finally {
            setIsChangingPassword(false);
        }
    };

    const menuItems = [
        { id: 'proxy', label: '代理设置' },
        { id: 'auth', label: '认证配置' },
        { id: 'advanced', label: '高级选项' },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-secondary">加载设置中...</div>
            </div>
        );
    }

    return (
        <div className="flex gap-12">
            {/* 左侧纯文字菜单 */}
            <nav className="w-48 flex-shrink-0">
                <h2 className="text-xl font-medium tracking-tight mb-6">系统设置</h2>
                <ul className="space-y-1">
                    {menuItems.map(item => (
                        <li key={item.id}>
                            <button
                                onClick={() => setActiveSection(item.id)}
                                className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${activeSection === item.id
                                    ? 'bg-gray-200 text-black font-medium'
                                    : 'text-secondary hover:text-black hover:bg-gray-100'
                                    }`}
                            >
                                {item.label}
                            </button>
                        </li>
                    ))}
                </ul>

                {/* Mihomo 状态显示 */}
                <div className="mt-8 pt-6 border-t border-border">
                    <h3 className="text-sm font-medium mb-2">代理服务状态</h3>
                    {mihomoStatus ? (
                        <div className="text-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`w-2 h-2 rounded-full ${mihomoStatus.running ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                <span className={mihomoStatus.running ? 'text-green-600' : 'text-secondary'}>
                                    {mihomoStatus.running ? '运行中' : '已停止'}
                                </span>
                            </div>
                            {mihomoStatus.running && mihomoStatus.pid && (
                                <>
                                    <div className="text-xs text-secondary">PID: {mihomoStatus.pid}</div>
                                    <button
                                        onClick={handleStopMihomo}
                                        className="mt-2 text-xs text-red-600 hover:text-red-800"
                                    >
                                        停止服务
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-secondary">加载中...</div>
                    )}
                </div>
            </nav>

            {/* 右侧表单内容 - 上下平铺，不分块装盒 */}
            <div className="flex-1 max-w-xl">
                {activeSection === 'proxy' && (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-medium mb-1">端口范围</h3>
                            <p className="text-sm text-secondary mb-4">为每个启用的节点分配独立的本地端口</p>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium mb-1">起始端口</label>
                                    <input
                                        type="number"
                                        className="input-base"
                                        value={settings.portRangeStart}
                                        onChange={e => setSettings({ ...settings, portRangeStart: parseInt(e.target.value) || 10000 })}
                                    />
                                </div>
                                <span className="text-secondary mt-6">—</span>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium mb-1">结束端口</label>
                                    <input
                                        type="number"
                                        className="input-base"
                                        value={settings.portRangeEnd}
                                        onChange={e => setSettings({ ...settings, portRangeEnd: parseInt(e.target.value) || 11000 })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-border pt-8">
                            <h3 className="text-lg font-medium mb-1">测速配置</h3>
                            <p className="text-sm text-secondary mb-4">用于检测节点延迟的目标地址</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">测速 URL</label>
                                    <input
                                        type="text"
                                        className="input-base"
                                        value={settings.testUrl}
                                        onChange={e => setSettings({ ...settings, testUrl: e.target.value })}
                                        placeholder="http://www.gstatic.com/generate_204"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">超时时间（秒）</label>
                                    <input
                                        type="number"
                                        className="input-base w-32"
                                        value={settings.testTimeout}
                                        onChange={e => setSettings({ ...settings, testTimeout: parseInt(e.target.value) || 10 })}
                                        min="1"
                                        max="60"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'auth' && (
                    <div className="space-y-8">
                        {/* 代理认证 */}
                        <div>
                            <h3 className="text-lg font-medium mb-1">代理认证</h3>
                            <p className="text-sm text-secondary mb-4">所有开启的代理端口将强制使用此认证凭据</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">用户名</label>
                                    <input
                                        type="text"
                                        className="input-base"
                                        value={settings.authUsername}
                                        onChange={e => setSettings({ ...settings, authUsername: e.target.value })}
                                        placeholder="留空则不启用认证"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">密码</label>
                                    <input
                                        type="password"
                                        className="input-base"
                                        value={settings.authPassword}
                                        onChange={e => setSettings({ ...settings, authPassword: e.target.value })}
                                        placeholder="••••••••"
                                    />
                                    <p className="text-xs text-secondary mt-1">建议使用强密码以保护代理服务</p>
                                </div>
                            </div>
                        </div>

                        {/* 当前 Token */}
                        <div className="border-t border-border pt-8">
                            <h3 className="text-lg font-medium mb-1">当前 Token</h3>
                            <p className="text-sm text-secondary mb-4">用于 API 调用的认证凭据</p>

                            <div>
                                <label className="block text-sm font-medium mb-1">API Token</label>
                                <div className="relative">
                                    <input
                                        type={showToken ? 'text' : 'password'}
                                        className="input-base pr-10 font-mono text-sm"
                                        value={localStorage.getItem('token') || ''}
                                        readOnly
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-secondary mt-1">请妥善保管 Token，不要泄露给他人</p>
                            </div>
                        </div>

                        {/* 管理员账号 */}
                        <div className="border-t border-border pt-8">
                            <h3 className="text-lg font-medium mb-1">管理员账号</h3>
                            <p className="text-sm text-secondary mb-4">修改管理后台的登录账号密码</p>

                            {passwordMessage && (
                                <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${passwordMessage.type === 'success'
                                    ? 'bg-green-50 border border-green-200 text-green-600'
                                    : 'bg-red-50 border border-red-200 text-red-600'
                                    }`}>
                                    {passwordMessage.type === 'success'
                                        ? <CheckCircle className="w-4 h-4" />
                                        : <AlertCircle className="w-4 h-4" />
                                    }
                                    {passwordMessage.text}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">当前密码</label>
                                    <div className="relative">
                                        <input
                                            type={showCurrentPassword ? 'text' : 'password'}
                                            className="input-base pr-10"
                                            value={currentPassword}
                                            onChange={e => setCurrentPassword(e.target.value)}
                                            placeholder="请输入当前密码"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">新用户名（可选）</label>
                                    <input
                                        type="text"
                                        className="input-base"
                                        value={newUsername}
                                        onChange={e => setNewUsername(e.target.value)}
                                        placeholder="留空则不修改用户名"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">新密码</label>
                                    <div className="relative">
                                        <input
                                            type={showNewPassword ? 'text' : 'password'}
                                            className="input-base pr-10"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            placeholder="请输入新密码"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">确认新密码</label>
                                    <input
                                        type="password"
                                        className="input-base"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="请再次输入新密码"
                                    />
                                </div>
                                <button
                                    onClick={handleChangePassword}
                                    disabled={isChangingPassword}
                                    className="btn-primary disabled:opacity-50"
                                >
                                    {isChangingPassword ? '修改中...' : '修改密码'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'advanced' && (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-medium mb-1">Mihomo 配置</h3>
                            <p className="text-sm text-secondary mb-4">Mihomo 代理核心的高级配置</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">API 控制端口</label>
                                    <input
                                        type="number"
                                        className="input-base w-32"
                                        value={settings.mihomoApiPort}
                                        onChange={e => setSettings({ ...settings, mihomoApiPort: parseInt(e.target.value) || 9090 })}
                                        min="1024"
                                        max="65535"
                                    />
                                    <p className="text-xs text-secondary mt-1">Mihomo 内部 API 通信端口，默认 9090</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 保存按钮和消息提示 */}
                <div className="mt-10 pt-6 border-t border-border">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="btn-primary disabled:opacity-50"
                        >
                            {isSaving ? '保存中...' : '保存设置'}
                        </button>

                        {message && (
                            <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                {message.text}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
