export default function HomePage() {
  return (
    <main style={{ padding: "24px", fontFamily: "\"Pretendard\", \"Noto Sans KR\", sans-serif" }}>
      <h1>V-Link</h1>
      <p>로그인 후 역할별 작업 화면으로 이동하세요.</p>
      <ul>
        <li>
          <a href="/login">Login</a>
        </li>
        <li>
          <a href="/admin/requests">Admin Requests</a>
        </li>
        <li>
          <a href="/requester">Requester Console</a>
        </li>
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
