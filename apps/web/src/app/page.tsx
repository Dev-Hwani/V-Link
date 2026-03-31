export default function HomePage() {
  return (
    <main style={{ padding: "24px", fontFamily: "\"Pretendard\", \"Noto Sans KR\", sans-serif" }}>
      <h1>V-Link</h1>
      <p>Frontend scaffold is ready.</p>
      <ul>
        <li>
          <a href="/dashboard">Dashboard</a>
        </li>
        <li>
          <a href="/vendor">Vendor Work Console</a>
        </li>
        <li>
          <a href="/calendar">VAS Calendar</a>
        </li>
      </ul>
    </main>
  );
}
