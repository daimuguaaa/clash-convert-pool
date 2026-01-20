import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout: React.FC = () => {
    return (
        <div className="min-h-screen bg-white">
            <Sidebar />
            <main className="ml-64 min-h-screen p-8">
                <Outlet />
            </main>
        </div>
    );
};
