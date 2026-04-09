"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./notifications.module.css";
import { apiJson } from "../../lib/api";
import { getRoleHome, getSession } from "../../lib/session";

interface NotificationItem {
  id: string;
  category: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!session.user.role) {
      router.replace(getRoleHome("REQUESTER"));
      return;
    }
    setToken(session.accessToken);
  }, [router]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadNotifications(token, unreadOnly);
    void loadUnreadCount(token);
  }, [token, unreadOnly]);

  async function loadNotifications(currentToken: string, nextUnreadOnly: boolean) {
    setLoading(true);
    setNotice("");
    try {
      const query = new URLSearchParams();
      query.set("limit", "100");
      if (nextUnreadOnly) {
        query.set("unreadOnly", "true");
      }
      const data = await apiJson<NotificationItem[]>(`/notifications?${query.toString()}`, currentToken, { method: "GET" });
      setItems(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알림 조회에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadUnreadCount(currentToken: string) {
    try {
      const data = await apiJson<{ count: number }>("/notifications/unread-count", currentToken, { method: "GET" });
      setUnreadCount(data.count ?? 0);
      window.dispatchEvent(new Event("vlink-notification-updated"));
    } catch {
      // noop
    }
  }

  async function markAsRead(id: string) {
    if (!token) {
      return;
    }
    try {
      await apiJson(`/notifications/${id}/read`, token, { method: "PATCH" });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                isRead: true,
                readAt: item.readAt ?? new Date().toISOString(),
              }
            : item,
        ),
      );
      await loadUnreadCount(token);
      if (unreadOnly) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "읽음 처리에 실패했습니다.";
      setNotice(message);
    }
  }

  async function markAllAsRead() {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      await apiJson<{ updatedCount: number }>("/notifications/read-all", token, { method: "PATCH" });
      await loadNotifications(token, unreadOnly);
      await loadUnreadCount(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "전체 읽음 처리에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>알림센터</h1>
        <p className={styles.subtitle}>요청/연동 상태 알림을 확인하고 읽음 처리할 수 있습니다.</p>
      </header>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${!unreadOnly ? styles.tabActive : ""}`}
              onClick={() => setUnreadOnly(false)}
            >
              전체
            </button>
            <button
              type="button"
              className={`${styles.tab} ${unreadOnly ? styles.tabActive : ""}`}
              onClick={() => setUnreadOnly(true)}
            >
              안읽음
            </button>
          </div>

          <div className={styles.actions}>
            <span className={styles.unreadLabel}>안읽음 {unreadCount}</span>
            <button className={styles.button} type="button" onClick={markAllAsRead} disabled={loading || unreadCount === 0}>
              전체 읽음
            </button>
            <button
              className={`${styles.button} ${styles.secondary}`}
              type="button"
              onClick={() => {
                void loadNotifications(token, unreadOnly);
                void loadUnreadCount(token);
              }}
              disabled={loading}
            >
              새로고침
            </button>
          </div>
        </div>

        <div className={styles.list}>
          {items.map((item) => (
            <article
              key={item.id}
              className={`${styles.item} ${item.isRead ? styles.read : styles.unread}`}
              onClick={() => {
                if (!item.isRead) {
                  void markAsRead(item.id);
                }
              }}
            >
              <div className={styles.itemTop}>
                <span className={styles.category}>{item.category}</span>
                <span className={styles.time}>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <h2 className={styles.itemTitle}>{item.title}</h2>
              <p className={styles.itemMessage}>{item.message}</p>
              <div className={styles.itemBottom}>
                <span className={item.isRead ? styles.readBadge : styles.unreadBadge}>
                  {item.isRead ? "읽음" : "안읽음"}
                </span>
                {!item.isRead && (
                  <button
                    type="button"
                    className={styles.inlineButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      void markAsRead(item.id);
                    }}
                  >
                    읽음 처리
                  </button>
                )}
              </div>
            </article>
          ))}

          {!loading && items.length === 0 && <p className={styles.empty}>표시할 알림이 없습니다.</p>}
        </div>
      </section>
    </main>
  );
}

