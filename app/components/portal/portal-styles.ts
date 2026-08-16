export const PORTAL_STYLES = `
.portal-root {
  min-height: 100vh;
  display: flex;
  background: #f4f5f7;
  color: #1a1c1e;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.portal-root * { box-sizing: border-box; }
.portal-sidebar {
  width: min(34vw, 420px);
  min-width: 280px;
  background: #1d1f21;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 36px 32px 24px;
  position: relative;
  transition: margin-left 180ms ease, min-width 180ms ease, width 180ms ease;
}
.portal-sidebar.collapsed {
  margin-left: calc(-1 * min(34vw, 420px));
  min-width: 0;
  width: min(34vw, 420px);
}
.portal-collapse {
  position: absolute;
  top: 50%;
  right: -14px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #1d1f21;
  box-shadow: 0 4px 12px rgba(0,0,0,.18);
  cursor: pointer;
  z-index: 3;
  display: grid;
  place-items: center;
}
.portal-clock-block { margin-top: 12px; }
.portal-dow {
  margin: 0;
  font-size: 13px;
  letter-spacing: .16em;
  font-weight: 700;
}
.portal-date {
  margin: 8px 0 0;
  font-size: 18px;
  font-weight: 500;
  color: rgba(255,255,255,.88);
}
.portal-time {
  margin: 18px 0 0;
  font-size: clamp(32px, 3.4vw, 48px);
  font-weight: 650;
  letter-spacing: .02em;
  line-height: 1.1;
}
.portal-brand {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 40px;
}
.portal-mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #7ed957, #2ea44f);
  display: grid;
  place-items: center;
  flex: none;
}
.portal-brand-name {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .04em;
  line-height: 1.25;
}
.portal-brand-name span { display: block; font-weight: 600; opacity: .85; }
.portal-meta {
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.portal-location {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255,255,255,.78);
  font-size: 13px;
}
.portal-lang {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: #2a2d31;
  color: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 13px;
}
.portal-main {
  flex: 1;
  min-width: 0;
  padding: 48px 40px 40px;
  overflow: auto;
}
.portal-kicker {
  margin: 0 0 8px;
  font-size: 34px;
  font-weight: 750;
  letter-spacing: -.03em;
}
.portal-sub {
  margin: 0 0 28px;
  color: #6b7280;
  font-size: 16px;
}
.portal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.portal-card {
  appearance: none;
  text-align: left;
  background: #fff;
  border: 0;
  border-radius: 16px;
  padding: 22px 20px 20px;
  min-height: 148px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, .06);
  cursor: pointer;
  color: inherit;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: transform 140ms ease, box-shadow 140ms ease;
}
.portal-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(16, 24, 40, .1);
}
.portal-card-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
}
.portal-card h3 {
  margin: 8px 0 0;
  font-size: 18px;
  font-weight: 750;
}
.portal-card p {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.4;
}
.portal-error {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  max-width: 520px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, .06);
}
.portal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.portal-home {
  border: 0;
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(16,24,40,.06);
  color: inherit;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.portal-panel {
  background: #fff;
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, .06);
}
.portal-actions, .portal-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.portal-btn {
  border: 0;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 650;
  cursor: pointer;
  background: #111827;
  color: #fff;
}
.portal-btn.secondary { background: #eef0f3; color: #111827; }
.portal-btn.danger { background: #c81e1e; }
.portal-btn:disabled { opacity: .6; cursor: default; }
.portal-tab {
  border: 0;
  background: #eef0f3;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 650;
  cursor: pointer;
  color: #374151;
  text-decoration: none;
}
.portal-tab.active { background: #111827; color: #fff; }
.portal-stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.portal-stat-row.five {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.portal-panel + .portal-panel,
.portal-panel + .portal-tabs {
  margin-top: 16px;
}
.portal-panel h2 {
  margin: 18px 0 8px;
  font-size: 16px;
  font-weight: 750;
}
.portal-panel h2:first-child { margin-top: 0; }
.portal-metric {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #eceff3;
  font-size: 14px;
}
.portal-metric:last-child { border-bottom: 0; }
.portal-metric span { color: #6b7280; }
.portal-range { display: grid; gap: 12px; }
.portal-range-dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.portal-range-dates label {
  display: grid;
  gap: 6px;
  font-weight: 650;
  font-size: 14px;
}
.portal-range-dates input {
  border: 1px solid #d5d9e0;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}
.portal-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}
.portal-row.cancelled strong,
.portal-row.cancelled .portal-muted {
  color: #991b1b;
  text-decoration: line-through;
}
.portal-stat {
  background: #f7f8fa;
  border-radius: 12px;
  padding: 14px;
}
.portal-stat span { display: block; color: #6b7280; font-size: 12px; }
.portal-stat strong { display: block; margin-top: 6px; font-size: 22px; }
.portal-table { width: 100%; border-collapse: collapse; }
.portal-table th, .portal-table td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid #eceff3;
  font-size: 14px;
}
.portal-table th { color: #6b7280; font-weight: 650; }
.portal-list { display: flex; flex-direction: column; gap: 10px; }
.portal-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #eceff3;
}
.portal-row:last-child { border-bottom: 0; }
.portal-muted { color: #6b7280; }
.portal-badge {
  display: inline-flex;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  background: #eef0f3;
}
.portal-badge.success { background: #dcfce7; color: #166534; }
.portal-badge.warning { background: #fef3c7; color: #92400e; }
.portal-badge.critical { background: #fee2e2; color: #991b1b; }
.portal-badge.info { background: #dbeafe; color: #1e40af; }
.portal-form { display: grid; gap: 12px; }
.portal-form label { display: grid; gap: 6px; font-weight: 650; font-size: 14px; }
.portal-form input, .portal-form select, .portal-form textarea {
  border: 1px solid #d5d9e0;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}
.portal-flash {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #ecfdf3;
  color: #166534;
  font-weight: 650;
}
.portal-flash.error { background: #fef2f2; color: #991b1b; }
.pin-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, .55);
  display: grid;
  place-items: center;
  z-index: 20;
  padding: 20px;
}
.pin-card {
  width: min(360px, 100%);
  background: #fff;
  border-radius: 20px;
  padding: 24px 22px 18px;
  box-shadow: 0 24px 60px rgba(0,0,0,.25);
}
.pin-card h2 { margin: 0 0 6px; font-size: 22px; }
.pin-dots { display: flex; justify-content: center; gap: 10px; margin: 18px 0 16px; }
.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e5e7eb;
}
.pin-dot.filled { background: #111827; }
.pin-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.pin-pad button {
  height: 56px;
  border: 0;
  border-radius: 12px;
  background: #f3f4f6;
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
}
.pin-pad button.ghost { background: transparent; font-size: 14px; }
.selfie-box video, .selfie-box img {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  border-radius: 12px;
  background: #111;
}
.ts-page { max-width: 920px; }
.ts-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.ts-name {
  margin: 4px 0 0;
  color: #4b5563;
  font-size: 16px;
  text-transform: lowercase;
}
.ts-monthly {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #e8f3ff;
  color: #2563eb;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}
.ts-month-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin: 18px 0 20px;
}
.ts-month-label {
  margin: 0;
  min-width: 180px;
  text-align: center;
  font-size: 20px;
  font-weight: 750;
}
.ts-nav-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #111827;
  display: grid;
  place-items: center;
  text-decoration: none;
  box-shadow: 0 1px 2px rgba(16,24,40,.04);
}
.ts-total-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 16px;
  color: #374151;
  font-size: 15px;
}
.ts-total-bar strong { font-size: 16px; }
.ts-cal {
  background: #fff;
  border: 1px solid #eceff3;
  border-radius: 14px;
  overflow: hidden;
}
.ts-cal-head, .ts-cal-row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr)) 72px;
}
.ts-cal-head {
  border-bottom: 1px solid #eceff3;
  color: #9ca3af;
  font-size: 13px;
  font-weight: 650;
}
.ts-cal-head > div, .ts-week-total {
  padding: 10px 8px;
  text-align: center;
}
.ts-cal-row + .ts-cal-row { border-top: 1px solid #eceff3; }
.ts-cell {
  min-height: 104px;
  padding: 8px 8px 8px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #eceff3;
  position: relative;
}
.ts-week-total {
  min-height: 88px;
  border-right: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  color: #6b7280;
}
.ts-daynum {
  align-self: flex-end;
  font-size: 13px;
  color: #111827;
}
.ts-cell-body {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ts-shift {
  display: block;
  border-radius: 6px;
  padding: 5px 6px;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.25;
  text-align: center;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-shift.cancelled {
  background: #fecaca;
  color: #991b1b;
  text-decoration: line-through;
}
.ts-hours {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
.ts-cell.has-time .ts-hours { color: #111827; font-weight: 650; }
.ts-cell.outside .ts-daynum,
.ts-cell.outside .ts-hours { color: #d1d5db; }
.ts-cell.today {
  outline: 2px solid #93c5fd;
  outline-offset: -2px;
  z-index: 1;
}
@media (max-width: 980px) {
  .portal-root { flex-direction: column; }
  .portal-sidebar, .portal-sidebar.collapsed {
    width: 100%;
    min-width: 0;
    margin-left: 0;
    padding: 24px;
  }
  .portal-collapse { display: none; }
  .portal-main { padding: 24px 18px 32px; }
  .portal-grid, .portal-stat-row, .portal-stat-row.five, .portal-range-dates { grid-template-columns: 1fr; }
  .portal-kicker { font-size: 28px; }
  .ts-cal-head, .ts-cal-row { grid-template-columns: repeat(7, minmax(0, 1fr)) 52px; }
  .ts-cell, .ts-week-total { min-height: 72px; padding: 6px; }
}
`;
