"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./admin-requests.module.css";
import { apiJson } from "../../../lib/api";
import { requestStatusLabel, requestTypeLabel } from "../../../lib/display";
import { getRoleHome, getSession } from "../../../lib/session";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED";

interface VendorOption {
  id: string;
  name: string;
  code: string;
}

interface RequestItem {
  id: string;
  title: string;
  requestType: string;
  team: string;
  dueDate: string;
  description: string | null;
  status: RequestStatus;
  assignedVendor: VendorOption | null;
  rejectedReason: string | null;
}

export default function AdminRequestsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = useMemo(() => requests.find((item) => item.id === selectedId) ?? null, [requests, selectedId]);
  const canProcessSelected = selected?.status === "PENDING";
  const summary = useMemo(() => {
    const base = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
    };

    requests.forEach((item) => {
      base[item.status] += 1;
    });

    return base;
  }, [requests]);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    if (session.user.role !== "ADMIN") {
      router.replace(getRoleHome(session.user.role));
      return;
    }

    setToken(session.accessToken);
  }, [router]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadData(token);
  }, [token]);

  async function loadData(currentToken: string) {
    setLoading(true);
    setNotice("");
    try {
      const [requestData, vendorData] = await Promise.all([
        apiJson<RequestItem[]>("/requests", currentToken, { method: "GET" }),
        apiJson<VendorOption[]>("/calendar/vendors", currentToken, { method: "GET" }),
      ]);

      setRequests(requestData);
      setVendors(vendorData);

      if (requestData.length > 0) {
        const target = requestData.some((item) => item.id === selectedId) ? selectedId : requestData[0].id;
        setSelectedId(target);
      } else {
        setSelectedId("");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "데이터 조회에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function approveSelected() {
    if (!token || !selectedId || !selectedVendorId) {
      return;
    }

    setLoading(true);
    try {
      await apiJson(`/requests/${selectedId}/approve`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: selectedVendorId }),
      });
      await loadData(token);
      setRejectReason("");
      setNotice("요청 승인 및 업체 배정이 완료되었습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "승인 처리에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function rejectSelected() {
    if (!token || !selectedId || !rejectReason.trim()) {
      return;
    }

    setLoading(true);
    try {
      await apiJson(`/requests/${selectedId}/reject`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      await loadData(token);
      setRejectReason("");
      setNotice("요청 반려 처리가 완료되었습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "반려 처리에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>관리자 작업 화면</h1>
        <p className={styles.subtitle}>요청 검토, 승인/반려, 업체 배정을 한 화면에서 처리합니다.</p>
      </header>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.summaryRow}>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>대기</span>
          <strong>{summary.PENDING}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>승인</span>
          <strong>{summary.APPROVED}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>진행 중</span>
          <strong>{summary.IN_PROGRESS}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>완료</span>
          <strong>{summary.COMPLETED}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>반려</span>
          <strong>{summary.REJECTED}</strong>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>요청 목록</h2>
          <div className={styles.list}>
            {requests.map((item) => {
              const isActive = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.item} ${isActive ? styles.activeItem : ""}`}
                  onClick={() => {
                    setSelectedId(item.id);
                    setSelectedVendorId(item.assignedVendor?.id ?? "");
                  }}
                >
                  <div className={styles.topRow}>
                    <strong>{item.title}</strong>
                    <span className={styles.status}>{requestStatusLabel(item.status)}</span>
                  </div>
                  <div className={styles.meta}>
                    {requestTypeLabel(item.requestType)} / {item.team} / {new Date(item.dueDate).toLocaleDateString()}
                  </div>
                </button>
              );
            })}
            {requests.length === 0 && <p>조회된 요청이 없습니다.</p>}
          </div>
        </article>

        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>처리 패널</h2>
          {!selected && <p>왼쪽 목록에서 요청을 선택하세요.</p>}
          {selected && (
            <>
              <p>
                <strong>{selected.title}</strong>
              </p>
              <p>{selected.description ?? "-"}</p>
              <p>현재 상태: {requestStatusLabel(selected.status)}</p>
              <p>요청 유형: {requestTypeLabel(selected.requestType)}</p>
              <p>배정 업체: {selected.assignedVendor?.name ?? "-"}</p>
              <p>반려 사유: {selected.rejectedReason ?? "-"}</p>
              {!canProcessSelected && <p className={styles.meta}>대기 상태 요청만 승인/반려 처리할 수 있습니다.</p>}

              <div className={styles.field}>
                <label htmlFor="vendor">배정 업체</label>
                <select
                  id="vendor"
                  value={selectedVendorId}
                  onChange={(event) => setSelectedVendorId(event.target.value)}
                >
                  <option value="">선택</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="reject">반려 사유</label>
                <textarea
                  id="reject"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="반려 사유를 입력하세요"
                />
              </div>

              <div className={styles.actions}>
                <button className={styles.button} type="button" onClick={() => void loadData(token)} disabled={loading}>
                  새로고침
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={approveSelected}
                  disabled={loading || !selectedVendorId || !canProcessSelected}
                >
                  승인 및 배정
                </button>
                <button
                  className={`${styles.button} ${styles.danger}`}
                  type="button"
                  onClick={rejectSelected}
                  disabled={loading || !rejectReason.trim() || !canProcessSelected}
                >
                  반려
                </button>
              </div>
            </>
          )}
        </article>
      </section>
    </main>
  );
}
