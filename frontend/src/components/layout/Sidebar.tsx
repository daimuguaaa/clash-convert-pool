import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, Settings, Radio, LogOut } from 'lucide-react';

export const Sidebar: React.FC = () => {
    const navItems = [
        { name: '概览', path: '/', icon: LayoutDashboard },
        { name: '节点管理', path: '/nodes', icon: Server },
        { name: '代理管理', path: '/proxies', icon: Radio },
        { name: '系统设置', path: '/settings', icon: Settings },
    ];

    const username = localStorage.getItem('username') || '管理员';

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('isFirstLogin');
        window.location.href = '/login';
    };

    return (
        <aside className="w-64 h-screen bg-sidebar border-r border-border flex flex-col fixed left-0 top-0">
            <div className="p-6">
                <h1 className="text-lg font-semibold tracking-tight">MPPM</h1>
                <p className="text-xs text-secondary mt-1">代理池管理器</p>
            </div>

            <nav className="flex-1 px-4 space-y-1">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `sidebar-link group ${isActive ? 'active' : ''}`
                        }
                    >
                        <item.icon className="w-4 h-4 mr-3 text-secondary group-hover:text-black transition-colors" />
                        {item.name}
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-xs font-medium text-primary uppercase">
                            {username.charAt(0)}
                        </div>
                        <div>
                            <p className="text-sm font-medium">{username}</p>
                            <p className="text-xs text-secondary">本地系统</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-2 text-secondary hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="退出登录"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
};
