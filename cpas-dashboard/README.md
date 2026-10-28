# CPAS Performance Report (Meta Collaborative Ads × Shopee)

Dashboard tĩnh (HTML + JS, không cần server), đọc trực tiếp **2 tab Google Sheet** mỗi lần mở trang:

| Tab | Nội dung | Ai cập nhật |
|---|---|---|
| **Actual** | File export Ads Manager theo ngày × ad, giữ nguyên tên cột | Paste số mới mỗi ngày/tuần |
| **Plan** | Plan theo tháng × loại chiến dịch | Cập nhật khi chốt plan |

Team cập nhật Sheet → mở lại dashboard (hoặc bấm **↻ Tải lại dữ liệu**) là có số mới. Không cần build hay commit lại.

---

## 1. Chuẩn bị Google Sheet

### Tab `Actual`
Dòng 1 là tên cột, giữ đúng các cột sau (thứ tự không quan trọng, cột thừa được bỏ qua):

| Cột bắt buộc | Ghi chú |
|---|---|
| `Day` | Ngày, dạng `2026-10-01` hoặc `01/10/2026` |
| `Impressions`, `Link clicks` | |
| `Adds to cart with shared items` | |
| `Purchases with shared items` | |
| `Purchases conversion value for shared items only` | = GMV |
| `Amount spent (VND)` | |
| `Campaign Type` | AWO / Promotion / Livestream… |
| `Type Audience` | Prospecting / Retargeting |
| `Ad format` | Carousel / Single / Collection / Video |
| `List Product` | Ngành hàng |
| `Angle Content` | Post code của creative |

Dashboard tự xử lý: dòng trống, dòng tiêu đề bị lặp khi nối nhiều lần export, lỗi chính tả hay gặp (`Caurousel`, `Minisipke`), và post code bị Excel đổi thành số (`46266-…` → `Sept-…`).

> **Mẹo:** định dạng cột `Day` là ngày, các cột số là số thường (Format → Number → Number). Nếu ngày hiển thị kiểu tháng/ngày (10/01/2026 = 1 tháng 10), đổi `DATE_ORDER: 'mdy'` trong `config.js`.

### Tab `Plan`
Dòng 1 đúng các cột sau, mỗi dòng là 1 tháng × 1 loại chiến dịch (xem mẫu `data/plan_template.csv`):

```
month,campaign_type,spend,impressions,clicks,add_to_cart,purchases,gmv
2026-10,AWO,65000000,3864073,29959,5666,391,5086698000
2026-10,Promotion,30000000,1661864,16050,4190,232,2986696000
```

- `month`: `2026-10`, `10/2026` hoặc `T10/2026` đều được.
- `campaign_type`: viết giống cột `Campaign Type` của tab Actual.
- Plan là **cả tháng**; tháng đang chạy dở được dashboard tự chia theo số ngày đã có dữ liệu.
- ROAS target = gmv / spend, CPP target = spend / purchases, CVR target = purchases / clicks.
- **Để trống tab Plan** → dashboard tự dựng plan từ actual (TB 3 tháng trước + 5%), chỉnh trong `config.js`.

### Publish 2 tab ra CSV
1. Google Sheet → **File → Share → Publish to web**.
2. Chọn tab **Actual**, định dạng **Comma-separated values (.csv)** → **Publish** → copy link.
3. Làm lại với tab **Plan**.
4. Dán 2 link vào `config.js`:

```js
ACTUAL_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv',
PLAN_CSV_URL:   'https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=123456&single=true&output=csv',
```

Google cache bản publish khoảng **5 phút**, nên số mới có thể trễ vài phút sau khi sửa Sheet.

---

## 2. Đưa lên GitHub Pages

1. Tạo repo mới trên GitHub (ví dụ `cpas-dashboard`).
2. Upload toàn bộ thư mục này (Add file → Upload files, hoặc `git push`).
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch `main`, thư mục `/ (root)` → Save.
4. Sau 1–2 phút có link dạng `https://<tên-github>.github.io/cpas-dashboard/`.

Mỗi khách hàng: copy repo (hoặc dùng **Template repository**), đổi 2 link trong `config.js`.

Chạy thử trên máy: `python3 -m http.server` trong thư mục này rồi mở `http://localhost:8000` (mở thẳng file `index.html` sẽ không tải được CSV).

---

## 3. ⚠️ Bảo mật dữ liệu khách hàng

- **Link "Publish to web" là công khai**: ai có link CSV đều đọc được số.
- **GitHub Pages ở gói thường là công khai**, kể cả khi repo private. Ai có link dashboard đều xem được.
- `data/sample_actual.csv` là dữ liệu mẫu bạn gửi. **Xoá file này trước khi đưa lên repo công khai** nếu đó là số thật của khách (dashboard vẫn chạy khi đã điền `ACTUAL_CSV_URL`).

Nếu cần giới hạn người xem:
- **Cloudflare Pages + Cloudflare Access** (miễn phí tới 50 người): kết nối repo GitHub, bật Access để chỉ email công ty mở được.
- **GitHub Enterprise Cloud**: có Pages riêng tư theo quyền repo.
- Thay "Publish to web" bằng Google Apps Script / service account (cần làm thêm backend nhỏ).

---

## 4. Cấu trúc

```
index.html            giao diện (header, các section, bảng)
config.js             link Google Sheet + tuỳ chọn plan
assets/data.js        tải CSV, làm sạch, gom nhóm, tự dựng plan
assets/runtime.js     bộ lọc tháng / khán giả, tính toán, vẽ lại khi đổi
assets/app.js         các phép tính KPI và toàn bộ chart, bảng, nhận xét
assets/theme.css      màu, font, sáng/tối
assets/page.css       bố cục dashboard
data/plan_template.csv  mẫu tab Plan
data/sample_actual.csv  dữ liệu mẫu khi chưa điền link
```

Quy tắc đánh giá post code (trong `assets/app.js`, calc `creative_table`): **Ít data** khi chi phí < 3% tổng tháng; **Tốt** khi ROAS ≥ 1,2× TB tháng và CVR ≥ TB; **Kém** khi ROAS < 0,8× TB; còn lại **Ổn**.
