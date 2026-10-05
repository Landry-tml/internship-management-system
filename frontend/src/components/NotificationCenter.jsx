import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Loader2, X } from 'lucide-react';
import api from '../services/api';
import './NotificationCenter.css';

export default function NotificationCenter({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const unreadCount = notifications.filter((notification) => !notification.read_at && !notification.is_read).length;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data.notifications || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const intervalId = window.setInterval(fetchNotifications, 60000);
    return () => window.clearInterval(intervalId);
  }, [fetchNotifications, user]);

  async function markRead(notification) {
    if (notification.read_at || notification.is_read) return;
    try {
      await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((items) => items.map((item) => item.id === notification.id
        ? { ...item, is_read: true, read_at: new Date().toISOString() }
        : item));
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to mark notification as read.');
    }
  }

  return (
    <div className="notification-center">
      <button
        type="button"
        className="notification-center__trigger"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={19} aria-hidden="true" />
        {unreadCount > 0 && <span className="notification-center__count" aria-hidden="true">{unreadCount}</span>}
      </button>

      {open && (
        <section
          id="notification-panel"
          className="notification-center__panel"
          aria-label="Notifications"
        >
          <header className="notification-center__header">
            <div>
              <h2>Notifications</h2>
              <p>{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'You’re up to date'}</p>
            </div>
            <button
              type="button"
              className="notification-center__close"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          {error && <p className="notification-center__error" role="alert">{error}</p>}

          <div className="notification-center__list" aria-live="polite">
            {loading && notifications.length === 0 ? (
              <div className="notification-center__loading" role="status" aria-label="Loading notifications">
                <Loader2 size={23} className="notification-center__spinner" aria-hidden="true" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="notification-center__empty">
                <span className="notification-center__empty-icon"><Bell size={19} aria-hidden="true" /></span>
                <p>You&apos;re all caught up.</p>
                <span>New updates will appear here.</span>
              </div>
            ) : notifications.map((notification) => {
              const read = Boolean(notification.read_at || notification.is_read);
              return (
                <button
                  type="button"
                  key={notification.id}
                  className={`notification-center__item${read ? ' is-read' : ' is-unread'}`}
                  onClick={() => markRead(notification)}
                >
                  <span className="notification-center__item-icon" aria-hidden="true">
                    {read ? <Check size={16} /> : <Bell size={16} />}
                  </span>
                  <span className="notification-center__item-content">
                    <strong>{notification.title || notification.type || 'Update'}</strong>
                    <span>{notification.message || notification.body}</span>
                    {notification.created_at && (
                      <time dateTime={notification.created_at}>
                        {new Date(notification.created_at).toLocaleString()}
                      </time>
                    )}
                  </span>
                  {!read && <span className="notification-center__unread-dot" aria-label="Unread" />}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
