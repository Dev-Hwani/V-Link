"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./admin-requests.module.css";
import { API_BASE, apiJson } from "../../../lib/api";
import { requestStatusLabel, requestTypeLabel } from "../../../lib/display";
import { getRoleHome, getSession } from "../../../lib/session";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED";
type ExportFormat = "csv" | "xlsx";

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
  createdAt: string;
  completedAt: string;
  description: string;
  status: RequestStatus;
  assignedVendor: VendorOption | null;
  requester: {
    id: string;
    name: string;
    email: string;
  };
  rejectedReason: string;
  attachmentCount: number;
  historyCount: number;
}

interface AdminTableResponse {
  count: number;
  items: RequestItem[];
}

interface AdminFilters {
  search: string;
  statusFilter: RequestStatus | "";
  vendorFilter: string;
  dueFrom: string;
  dueTo: string;
}

function filenameFromDisposition(disposition: string | null, fallback: string) {
  if (!disposition) {
    return fallback;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallback;
}

function statusBadgeClass(status: RequestStatus) {
  if (status === "PENDING") {
    return `${styles.statusBadge} ${styles.statusPending}`;
  }
  if (status === "APPROVED") {
    return `${styles.statusBadge} ${styles.statusApproved}`;
  }
  if (status === "IN_PROGRESS") {
    return `${styles.statusBadge} ${styles.statusInProgress}`;
  }
  if (status === "COMPLETED") {
    return `${styles.statusBadge} ${styles.statusCompleted}`;
  }
  if (status === "REJECTED") {
    return `${styles.statusBadge} ${styles.statusRejected}`;
  }
  return styles.statusBadge;
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
  const [exporting, setExporting] = useState<ExportFormat | "">("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "">("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<AdminFilters>({
    search: "",
    statusFilter: "",
    vendorFilter: "",
    dueFrom: "",
    dueTo: "",
  });

  const selected = useMemo(() => requests.find((item) => item.id === selectedId) ?? null, [requests, selectedId]);
  const canProcessSelected = selected?.status === "PENDING";

  const summary = useMemo(() => {
    const base = {
      total: requests.length,
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      overdueOpen: 0,
      unassigned: 0,
    };

    const now = new Date();
    requests.forEach((item) => {
      base[item.status] += 1;
      if (!item.assignedVendor && item.status !== "REJECTED") {
        base.unassigned += 1;
      }
      const dueDate = new Date(item.dueDate);
      if (dueDate < now && (item.status === "PENDING" || item.status === "APPROVED" || item.status === "IN_PROGRESS")) {
        base.overdueOpen += 1;
      }
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

  function buildQuery(filters: AdminFilters, includeFormat?: ExportFormat) {
    const query = new URLSearchParams();
    if (filters.search.trim()) {
      query.set("search", filters.search.trim());
    }
    if (filters.statusFilter) {
      query.set("status", filters.statusFilter);
    }
    if (filters.vendorFilter) {
      query.set("vendorId", filters.vendorFilter);
    }
    if (filters.dueFrom) {
      query.set("from", filters.dueFrom);
    }
    if (filters.dueTo) {
      query.set("to", filters.dueTo);
    }
    if (includeFormat) {
      query.set("format", includeFormat);
    }
    return query.toString();
  }

  function currentFilters(): AdminFilters {
    return { search, statusFilter, vendorFilter, dueFrom, dueTo };
  }

  async function loadData(currentToken: string, filters = currentFilters()) {
    setLoading(true);
    setNotice("");
    try {
      const query = buildQuery(filters);
      const [requestData, vendorData] = await Promise.all([
        apiJson<AdminTableResponse>(`/requests/admin/table?${query}`, currentToken, { method: "GET" }),
        apiJson<VendorOption[]>("/calendar/vendors", currentToken, { method: "GET" }),
      ]);

      setRequests(requestData.items);
      setVendors(vendorData);
      setAppliedFilters(filters);

      if (requestData.items.length > 0) {
        const target = requestData.items.some((item) => item.id === selectedId) ? selectedId : requestData.items[0].id;
        setSelectedId(target);
        const found = requestData.items.find((item) => item.id === target);
        setSelectedVendorId(found?.assignedVendor?.id ?? "");
      } else {
        setSelectedId("");
        setSelectedVendorId("");
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
      await loadData(token, appliedFilters);
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
      await loadData(token, appliedFilters);
      setRejectReason("");
      setNotice("요청 반려 처리가 완료되었습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "반려 처리에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function exportTable(format: ExportFormat) {
    if (!token) {
      return;
    }

    setExporting(format);
    setNotice("");
    try {
      const query = buildQuery(appliedFilters, format);
      const response = await fetch(`${API_BASE}/requests/admin/export?${query}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `내보내기 실패 (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const defaultName = `vas-requests.${format}`;
      const fileName = filenameFromDisposition(response.headers.get("content-disposition"), defaultName);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "파일 내보내기에 실패했습니다.";
      setNotice(message);
    } finally {
      setExporting("");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>관리자 작업 화면</h1>
        <p className={styles.subtitle}>VAS 작업 현황을 KPI와 상세 표로 동시에 확인하고 즉시 승인/반려를 처리합니다.</p>
      </header>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.summaryRow}>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>조회 건수</span>
          <strong>{summary.total}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>승인 대기</span>
          <strong>{summary.PENDING}</strong>
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
          <span className={styles.summaryLabel}>미배정</span>
          <strong>{summary.unassigned}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>지연 건</span>
          <strong>{summary.overdueOpen}</strong>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>필터 및 내보내기</h2>
          <div className={styles.filterGrid}>
            <div className={styles.field}>
              <label htmlFor="search">검색어</label>
              <input
                id="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="제목/요청유형/요청자/업체/설명"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="status">상태</label>
              <select id="status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RequestStatus | "")}>
                <option value="">전체</option>
                <option value="PENDING">대기</option>
                <option value="APPROVED">승인</option>
                <option value="IN_PROGRESS">진행 중</option>
                <option value="COMPLETED">완료</option>
                <option value="REJECTED">반려</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="vendorFilter">업체</label>
              <select id="vendorFilter" value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
                <option value="">전체</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="dueFrom">마감 시작일</label>
              <input id="dueFrom" type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="dueTo">마감 종료일</label>
              <input id="dueTo" type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
            </div>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.button}
              type="button"
              onClick={() => void loadData(token, currentFilters())}
              disabled={loading}
            >
              {loading ? "불러오는 중..." : "필터 적용"}
            </button>
            <button
              className={`${styles.button} ${styles.secondary}`}
              type="button"
              onClick={() => {
                const resetFilters: AdminFilters = {
                  search: "",
                  statusFilter: "",
                  vendorFilter: "",
                  dueFrom: "",
                  dueTo: "",
                };
                setSearch("");
                setStatusFilter("");
                setVendorFilter("");
                setDueFrom("");
                setDueTo("");
                void loadData(token, resetFilters);
              }}
              disabled={loading}
            >
              필터 초기화
            </button>
            <button
              className={`${styles.button} ${styles.secondary}`}
              type="button"
              onClick={() => void exportTable("xlsx")}
              disabled={loading || exporting !== ""}
            >
              {exporting === "xlsx" ? "XLSX 생성 중..." : "XLSX 내보내기"}
            </button>
            <button
              className={`${styles.button} ${styles.secondary}`}
              type="button"
              onClick={() => void exportTable("csv")}
              disabled={loading || exporting !== ""}
            >
              {exporting === "csv" ? "CSV 생성 중..." : "CSV 내보내기"}
            </button>
          </div>
        </article>

        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>요청 상세 표</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>상태</th>
                  <th>요청유형</th>
                  <th>요청자</th>
                  <th>현재 배정 업체</th>
                  <th>마감일</th>
                  <th>상세 설명</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <tr
                      key={item.id}
                      className={`${styles.tableRow} ${active ? styles.tableRowActive : ""}`}
                      onClick={() => {
                        setSelectedId(item.id);
                        setSelectedVendorId(item.assignedVendor?.id ?? "");
                      }}
                    >
                      <td>{item.title}</td>
                      <td>
                        <span className={statusBadgeClass(item.status)}>{requestStatusLabel(item.status)}</span>
                      </td>
                      <td>{requestTypeLabel(item.requestType)}</td>
                      <td>{item.requester.name}</td>
                      <td>{item.assignedVendor?.name ?? "-"}</td>
                      <td>{new Date(item.dueDate).toLocaleDateString()}</td>
                      <td className={styles.descriptionCell}>{item.description || "-"}</td>
                    </tr>
                  );
                })}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={7} className={styles.emptyRow}>
                      조회된 요청이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>처리 패널</h2>
          {!selected && <p>상세 표에서 요청을 선택하세요.</p>}
          {selected && (
            <>
              <div className={styles.detailGrid}>
                <div>
                  <span className={styles.detailLabel}>제목</span>
                  <p>{selected.title}</p>
                </div>
                <div>
                  <span className={styles.detailLabel}>상태</span>
                  <p>{requestStatusLabel(selected.status)}</p>
                </div>
                <div>
                  <span className={styles.detailLabel}>요청 유형</span>
                  <p>{requestTypeLabel(selected.requestType)}</p>
                </div>
                <div>
                  <span className={styles.detailLabel}>요청자</span>
                  <p>
                    {selected.requester.name} ({selected.requester.email})
                  </p>
                </div>
                <div>
                  <span className={styles.detailLabel}>현재 배정 업체</span>
                  <p>{selected.assignedVendor?.name ?? "-"}</p>
                </div>
                <div>
                  <span className={styles.detailLabel}>마감일</span>
                  <p>{new Date(selected.dueDate).toLocaleString()}</p>
                </div>
                <div>
                  <span className={styles.detailLabel}>상세 설명</span>
                  <p>{selected.description || "-"}</p>
                </div>
                <div>
                  <span className={styles.detailLabel}>반려 사유</span>
                  <p>{selected.rejectedReason || "-"}</p>
                </div>
              </div>

              {!canProcessSelected && <p className={styles.meta}>대기 상태 요청만 승인/반려를 처리할 수 있습니다.</p>}

              <div className={styles.field}>
                <label htmlFor="vendor">배정 업체</label>
                <select id="vendor" value={selectedVendorId} onChange={(event) => setSelectedVendorId(event.target.value)}>
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
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => void loadData(token, appliedFilters)}
                  disabled={loading}
                >
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
