'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useFetch } from '@/hooks/useFetch';
import { dashboardApi } from '@/lib/endpoints';
import { shortDate, time } from '@/lib/format';
import { Avatar } from '@/components/ui';
import { IconBell, IconMenu, IconRefresh, IconSearch } from '@/components/ui/Icons';

/**
 * Sticky page header: title, live clock, global search, alert bell and the
 * signed-in user chip.
 */
export default function Topbar({ title, onMenu, onSearch }) {
  const { user } = useAuth();
  const [term, setTerm] = useState('');
  const { data: notif, reload } = useFetch(() => dashboardApi.notifications(), []);

  const badge = notif?.total ?? 0;

  return (
    <header className="topbar">
      <button type="button" className="burger" onClick={onMenu} aria-label="Open menu">
        <IconMenu size={22} />
      </button>

      <div className="topbar__title">{title}</div>
      <div className="topbar__divider" />
      <div className="topbar__date">
        {shortDate(new Date())} · {time(new Date())}
      </div>

      <div className="topbar__right">
        <div className="search">
          <span className="search__icon">
            <IconSearch size={16} />
          </span>
          <input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              onSearch?.(e.target.value);
            }}
            placeholder="Search orders, items…"
            aria-label="Search"
          />
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={reload}
          title="Refresh alerts"
          aria-label="Refresh alerts"
        >
          <IconRefresh size={17} />
        </button>

        <button
          type="button"
          className="icon-btn"
          title={
            badge
              ? `${notif.stock} low-stock items · ${notif.containers} containers out`
              : 'No alerts'
          }
          aria-label={`Alerts (${badge})`}
        >
          <IconBell size={17} />
          {badge > 0 && <span className="icon-btn__dot">{badge > 9 ? '9+' : badge}</span>}
        </button>

        <div className="user-chip">
          <Avatar name={user?.name || '?'} />
          <div>
            <div className="user-chip__name">{user?.name}</div>
            <div className="user-chip__role">
              {user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : 'Operator'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
