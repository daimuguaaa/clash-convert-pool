import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/Dashboard';
import { NodesPage } from './pages/Nodes';
import { ProxiesPage } from './pages/Proxies';
import { SettingsPage } from './pages/Settings';
import { LoginPage } from './pages/Login';
import { type ReactNode, useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';



// 路由保护组件
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// 首次登录提示组件
const FirstLoginPrompt = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-modal w-[450px] border border-border">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            安全提醒
          </h3>
          <button onClick={onClose} className="text-secondary hover:text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-gray-600 mb-4">
            检测到您正在使用默认账号密码登录，为了系统安全，请立即修改管理员密码。
          </p>
          <p className="text-sm text-secondary">
            您可以在 <span className="font-medium text-primary">系统设置</span> → <span className="font-medium text-primary">认证配置</span> 中修改管理员账号和密码。
          </p>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-3 bg-gray-50/50">
          <button onClick={onClose} className="btn-secondary">稍后再说</button>
          <a href="/settings" className="btn-primary">前往设置</a>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [showFirstLoginPrompt, setShowFirstLoginPrompt] = useState(false);

  useEffect(() => {
    // 检查是否首次登录
    const isFirstLogin = localStorage.getItem('isFirstLogin') === 'true';
    const token = localStorage.getItem('token');
    if (token && isFirstLogin) {
      setShowFirstLoginPrompt(true);
    }
  }, []);

  const handleClosePrompt = () => {
    setShowFirstLoginPrompt(false);
    // 可以选择不再显示
    // localStorage.setItem('isFirstLogin', 'false');
  };

  return (
    <BrowserRouter>
      {showFirstLoginPrompt && <FirstLoginPrompt onClose={handleClosePrompt} />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<DashboardPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="proxies" element={<ProxiesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
