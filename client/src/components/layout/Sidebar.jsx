'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { useFetch } from '@/hooks/useFetch';
import { dashboardApi } from '@/lib/endpoints';
import {
  IconCart,
  IconChevronLeft,
  IconClipboard,
  IconDroplet,
  IconHome,
  IconReport,
  IconUsers,
} from '@/components/ui/Icons';

const NAV = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard', Icon: IconHome },
  { key: 'pos', href: '/point-of-sale', label: 'Point of Sale', Icon: IconCart },
  { key: 'inventory', href: '/inventory', label: 'Inventory', Icon: IconClipboard },
  { key: 'employees', href: '/employees', label: 'Employees', Icon: IconUsers },
  { key: 'reports', href: '/reports', label: 'Reports', Icon: IconReport },
];

export default function Sidebar({ open, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  // Alert count for the nav badge (low stock + unreturned containers).
  const { data: notif } = useFetch(() => dashboardApi.notifications(), []);

  const activeKey =
    NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))?.key ?? 'dashboard';

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <>
      {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <div className="sidebar__logo">
            <IconDroplet size={22} style={{ color: '#fff' }} />
          </div>
          <div>
            <div className="sidebar__name">Bluebill</div>
            <div className="sidebar__tag">Refilling Station</div>
          </div>
        </div>

        <nav className="sidebar__nav">
          <div className="sidebar__section">Operations</div>
          {NAV.map(({ key, href, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                router.push(href);
                onClose?.();
              }}
              className={`navlink ${activeKey === key ? 'navlink--active' : ''}`}
              style={{ border: 0, width: '100%', cursor: 'pointer' }}
            >
              <Icon size={19} />
              {label}
              {key === 'inventory' && notif?.stock > 0 && (
                <span className="navlink__badge">{notif.stock}</span>
              )}
            </button>
          ))}
        </nav>

        <ShiftCard />

        <button type="button" className="sidebar__collapse" onClick={onClose}>
          <IconChevronLeft size={15} />
          Collapse
        </button>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 16px 16px',
            color: 'var(--nav-text)',
            fontSize: 12.5,
            background: 'none',
            border: 0,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Sign out
        </button>
      </aside>
    </>
  );
}

/** The "Shift Active / Morning 06:00–14:00 / Operator" card from the design. */
function ShiftCard() {
  const { data } = useFetch(() => dashboardApi.summary(), []);

  if (!data?.shift) {
    return (
      <div className="shift-card">
        <div className="shift-card__title">
          <span className="dot" style={{ background: '#94a3b8', boxShadow: 'none' }} />
          No active shift
        </div>
        <div className="shift-card__meta">Start a shift from the Reports screen.</div>
      </div>
    );
  }

  return (
    <div className="shift-card">
      <div className="shift-card__title">
        <span className="dot" />
        Shift Active
      </div>
      <div className="shift-card__meta">
        {data.shift.name} · 06:00 – 14:00
        <br />
        Operator: {data.shift.operatorName || '—'}
      </div>
    </div>
  );
}
