// API 工具函数，自动添加认证头

const API_BASE = '/api';

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': token } : {})
    };
};

// 处理未认证响应
const handleUnauthorized = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('isFirstLogin');
    window.location.href = '/login';
};

// 封装 fetch
export const apiFetch = async (
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> => {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {})
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    // 处理 401 未授权
    if (response.status === 401) {
        handleUnauthorized();
        throw new Error('未登录或登录已过期');
    }

    return response;
};

// GET 请求
export const apiGet = async (endpoint: string): Promise<Response> => {
    return apiFetch(endpoint, { method: 'GET' });
};

// POST 请求
export const apiPost = async (endpoint: string, data?: any): Promise<Response> => {
    return apiFetch(endpoint, {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined
    });
};

// PUT 请求
export const apiPut = async (endpoint: string, data?: any): Promise<Response> => {
    return apiFetch(endpoint, {
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined
    });
};

// DELETE 请求
export const apiDelete = async (endpoint: string, data?: any): Promise<Response> => {
    return apiFetch(endpoint, {
        method: 'DELETE',
        body: data ? JSON.stringify(data) : undefined
    });
};

// 登出
export const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('isFirstLogin');
    window.location.href = '/login';
};
