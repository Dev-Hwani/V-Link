"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg, EventInput } from "@fullcalendar/core/index.js";
import FullCalendar from "@fullcalendar/react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./calendar.module.css";
import { apiJson } from "../../lib/api";
import { getRoleHome, getSession } from "../../lib/session";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED";

interface VendorOption {
  id: string;
  code: string;
  name: string;
}

interface SelectedEventInfo {
  title: string;
  start: string;
  status: RequestStatus | "";
  requestType: string;
  team: string;
  description: string;
  vendorName: string;
  requesterName: string;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: formatDateInput(from), to: formatDateInput(to) };
}

export default function CalendarPage() {
  const router = useRouter();
  const initialRange = useMemo(() => defaultRange(), []);
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SelectedEventInfo | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    if (session.user.role === "VENDOR") {
      router.replace("/vendor");
      return;
    }

    setToken(session.accessToken);
  }, [router]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadVendors(token);
  }, [token]);

  useEffect(() => {
    if (!token || !from || !to) {
      return;
    }
    void loadEvents(token);
  }, [token, from, to, vendorId, status]);

  async function loadVendors(currentToken: string) {
    try {
      const data = await apiJson<VendorOption[]>("/calendar/vendors", currentToken, { method: "GET" });
      setVendors(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "업체 목록 조회 오류";
      setNotice(message);
    }
  }

  async function loadEvents(currentToken: string) {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("from", from);
      query.set("to", to);
      if (vendorId) {
        query.set("vendorId", vendorId);
      }
      if (status) {
        query.set("status", status);
      }

      const data = await apiJson<EventInput[]>(`/calendar/events?${query.toString()}`, currentToken, {
        method: "GET",
      });
      setEvents(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "캘린더 조회 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  function onDatesSet(arg: DatesSetArg) {
    const start = formatDateInput(arg.start);
    const end = new Date(arg.end);
    end.setDate(end.getDate() - 1);
    const endDate = formatDateInput(end);
    setFrom(start);
    setTo(endDate);
  }

  function onEventClick(arg: EventClickArg) {
    const props = arg.event.extendedProps as {
      status?: RequestStatus;
      requestType?: string;
      team?: string;
      description?: string;
      vendor?: { name?: string };
      requester?: { name?: string };
    };

    setSelectedEvent({
      title: arg.event.title,
      start: arg.event.start?.toLocaleString() ?? "",
      status: props.status ?? "",
      requestType: props.requestType ?? "",
      team: props.team ?? "",
      description: props.description ?? "",
      vendorName: props.vendor?.name ?? "-",
      requesterName: props.requester?.name ?? "-",
    });
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>VAS Calendar</h1>
        <p className={styles.subtitle}>업체/일자/상태 필터로 작업 일정을 확인합니다.</p>
      </header>

      <section className={styles.topGrid}>
        <div className={styles.card}>
          {notice && <div className={styles.notice}>{notice}</div>}
          <div className={styles.filters}>
            <div className={styles.field}>
              <label htmlFor="from">From</label>
              <input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="to">To</label>
              <input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="vendor">Vendor</label>
              <select id="vendor" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
                <option value="">All</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(event) => setStatus(event.target.value as RequestStatus | "")}>
                <option value="">All</option>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
          </div>
        </div>
        <aside className={styles.card}>
          <h2 className={styles.selectedTitle}>선택 일정</h2>
          {!selectedEvent && <p className={styles.selectedItem}>일정을 클릭하면 상세를 확인할 수 있습니다.</p>}
          {selectedEvent && (
            <div className={styles.selected}>
              <p className={styles.selectedItem}>{selectedEvent.title}</p>
              <p className={styles.selectedItem}>일자: {selectedEvent.start}</p>
              <p className={styles.selectedItem}>상태: {selectedEvent.status || "-"}</p>
              <p className={styles.selectedItem}>유형: {selectedEvent.requestType || "-"}</p>
              <p className={styles.selectedItem}>팀: {selectedEvent.team || "-"}</p>
              <p className={styles.selectedItem}>업체: {selectedEvent.vendorName}</p>
              <p className={styles.selectedItem}>요청자: {selectedEvent.requesterName}</p>
              <p className={styles.selectedItem}>설명: {selectedEvent.description || "-"}</p>
            </div>
          )}
        </aside>
      </section>

      <section className={`${styles.card} ${styles.calendarWrap}`}>
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          eventClick={onEventClick}
          datesSet={onDatesSet}
          height="auto"
          locale="ko"
        />
      </section>
    </main>
  );
}
