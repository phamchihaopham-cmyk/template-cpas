// ====== CẤU HÌNH DASHBOARD ======
// Dán link "Publish to web" dạng CSV của 2 tab trong Google Sheet vào đây (xem README).
window.CPAS_CONFIG = {
  // Tab Actual: file export Ads Manager (giữ nguyên tên cột).
  ACTUAL_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS1lUSK9CWrrKiJ7awzYDMP6vyp1APLzr_uQhvv_1wndAQiXbKgvzHBgHNKXipW14rBLvxpyr3PIgxD/pub?gid=0&single=true&output=csv',
  // Tab Plan: month | campaign_type | spend | impressions | clicks | add_to_cart | purchases | gmv
  PLAN_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS1lUSK9CWrrKiJ7awzYDMP6vyp1APLzr_uQhvv_1wndAQiXbKgvzHBgHNKXipW14rBLvxpyr3PIgxD/pub?gid=911520709&single=true&output=csv',

  // Khi tab Plan trống: tự dựng plan từ actual (TB N tháng trước + uplift).
  AUTO_PLAN_WHEN_EMPTY: true,
  PLAN_LOOKBACK_MONTHS: 3,
  PLAN_UPLIFT: 0.05,

  // Ngày dạng 01/10/2026 là ngày/tháng ('dmy') hay tháng/ngày ('mdy').
  DATE_ORDER: 'dmy',
  // Tự tải lại dữ liệu sau N phút khi để trang mở (0 = tắt).
  AUTO_REFRESH_MINUTES: 0,

  // Dữ liệu mẫu dùng khi ACTUAL_CSV_URL còn trống.
  SAMPLE_ACTUAL_CSV: 'data/sample_actual.csv',
};
