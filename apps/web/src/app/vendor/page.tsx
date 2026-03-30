"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import styles from "./vendor.module.css";

type RequestStatus = "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";

interface VendorInfo {
  id: string;
  name: string;
  code: string;
}

interface RequestSummary {
  id: string;
  title: string;
  requestType: string;
  team: string;
  dueDate: string;
  description: string | null;
  status: RequestStatus;
  assignedVendor: VendorInfo | null;
}

interface RequestDetail extends RequestSummary {
  createdAt: string;
  completedAt: string | null;
  rejectedReason: string | null;
  attachments: Array<{ id: string; originalName: string; path: string; createdAt: string }>;
  histories: Array<{ id: string; toStatus: RequestStatus; reason: string | null; createdAt: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

async function requestJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export default function VendorPage() {
  const [email, setEmail] = useState("vendor@vlink.local");
  const [password, setPassword] = useState("vendor1234");
  const [token, setToken] = useState("");
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<RequestDetail | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedStatus = selected?.status ?? "PENDING";
  const canStart = selectedStatus === "APPROVED";
  const canComplete = selectedStatus === "APPROVED" || selectedStatus === "IN_PROGRESS";

  const selectedStatusClass = useMemo(() => {
    return `${styles.badge} ${styles[selectedStatus] ?? styles.PENDING}`;
  }, [selectedStatus]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadRequests(token);
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) {
      return;
    }

    void loadDetail(token, selectedId);
  }, [token, selectedId]);

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice("");

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error("로그인 실패: 계정 정보를 확인하세요.");
      }

      const data = (await response.json()) as { accessToken: string };
      setToken(data.accessToken);
      setNotice("로그인 성공. 배정 목록을 불러왔습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "로그인 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests(currentToken: string) {
    setLoading(true);
    try {
      const data = await requestJson<RequestSummary[]>("/requests", currentToken, { method: "GET" });
      setRequests(data);

      if (data.length === 0) {
        setSelectedId("");
        setSelected(null);
        setNotice("현재 배정된 작업이 없습니다.");
      } else if (!selectedId || !data.some((item) => item.id === selectedId)) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "목록 조회 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(currentToken: string, requestId: string) {
    try {
      const data = await requestJson<RequestDetail>(`/requests/${requestId}`, currentToken, { method: "GET" });
      setSelected(data);
      setNote("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "상세 조회 오류";
      setNotice(message);
    }
  }

  async function startWork() {
    if (!token || !selectedId) {
      return;
    }

    setLoading(true);
    try {
      await requestJson(`/requests/${selectedId}/start`, token, { method: "PATCH", body: JSON.stringify({}) });
      await loadRequests(token);
      await loadDetail(token, selectedId);
      setNotice("작업을 시작했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "작업 시작 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function completeWork() {
    if (!token || !selectedId) {
      return;
    }

    setLoading(true);
    try {
      await requestJson(`/requests/${selectedId}/complete`, token, {
        method: "PATCH",
        body: JSON.stringify({ note }),
      });
      await loadRequests(token);
      await loadDetail(token, selectedId);
      setNotice("작업을 완료 처리했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "작업 완료 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Vendor Work Console</h1>
        <p className={styles.subtitle}>배정된 VAS 작업 목록, 상세 확인, 시작/완료 처리를 수행합니다.</p>
      </header>

      {!token && (
        <section className={styles.card}>
          <form className={styles.loginForm} onSubmit={onLogin}>
            <div className={styles.field}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? "로그인 중..." : "업체 로그인"}
            </button>
          </form>
        </section>
      )}

      {token && (
        <section className={styles.grid}>
          <article className={styles.card}>
            <h2 className={styles.sectionTitle}>배정 목록</h2>
            {notice && <div className={styles.notice}>{notice}</div>}
            <div className={styles.list}>
              {requests.map((request) => {
                const activeClass = request.id === selectedId ? styles.itemActive : "";
                return (
                  <button
                    key={request.id}
                    type="button"
                    className={`${styles.item} ${activeClass}`}
                    onClick={() => setSelectedId(request.id)}
                  >
                    <div className={styles.rowTop}>
                      <p className={styles.requestTitle}>{request.title}</p>
                      <span className={`${styles.badge} ${styles[request.status]}`}>{request.status}</span>
                    </div>
                    <p className={styles.meta}>
                      {request.requestType} · {request.team} · 납기 {new Date(request.dueDate).toLocaleDateString()}
                    </p>
                  </button>
                );
              })}
            </div>
          </article>

          <article className={styles.card}>
            <h2 className={styles.sectionTitle}>작업 상세</h2>
            {!selected && <p>작업을 선택하세요.</p>}
            {selected && (
              <>
                <div className={styles.detailRows}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>제목</span>
                    {selected.title}
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>상태</span>
                    <span className={selectedStatusClass}>{selected.status}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>유형/팀</span>
                    {selected.requestType} / {selected.team}
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>납기</span>
                    {new Date(selected.dueDate).toLocaleString()}
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>배정업체</span>
                    {selected.assignedVendor?.name ?? "-"}
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>설명</span>
                    {selected.description ?? "-"}
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="note">완료 메모</label>
                  <textarea
                    id="note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="완료 시 전달할 메모를 입력하세요."
                  />
                </div>

                <div className={styles.actions}>
                  <button className={styles.button} type="button" onClick={() => void loadRequests(token)}>
                    목록 새로고침
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonAlt}`}
                    type="button"
                    onClick={startWork}
                    disabled={!canStart || loading}
                  >
                    시작 처리
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonGhost}`}
                    type="button"
                    onClick={completeWork}
                    disabled={!canComplete || loading}
                  >
                    완료 처리
                  </button>
                </div>

                <h3 className={styles.sectionTitle} style={{ marginTop: "16px" }}>
                  상태 이력
                </h3>
                <ol className={styles.timeline}>
                  {selected.histories.map((history) => (
                    <li key={history.id}>
                      {history.toStatus} · {new Date(history.createdAt).toLocaleString()}
                      {history.reason ? ` · ${history.reason}` : ""}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </article>
        </section>
      )}
    </main>
  );
}

