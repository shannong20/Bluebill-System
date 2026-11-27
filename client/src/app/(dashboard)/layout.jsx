'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';

const TITLES = {
  '/dashboard': 'Dashboard Overview',
  '/point-of-sale': 'Point of Sale',
  '/inventory': 'Inventory & Stock',
  '/employees': 'Employee Quota & Performance',
  '/reports': 'Daily Reports & Shift Summary',
};

/**
 * Authenticated shell shared by every screen: sidebar + topbar + content.
 * Redirects to /login when there is no valid session, and shows a
 * full-page state while the stored token is revalidated.
 */
export default function DashboardLayout({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // `replace` rather than `push` so Back doesn't loop on /login.
      router.replace('/login');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="state" style={{ minHeight: '100vh' }}>
        <span className="spinner spinner--dark" />
        <div>Loading your station…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={`shell ${pathname === '/point-of-sale' ? 'shell--pos' : ''}`}>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="main">
        <Topbar
          title={TITLES[pathname] || 'BlueBill'}
          onMenu={() => setMenuOpen((v) => !v)}
        />
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
