# Zalo Shopee Cashback Bot MVP

MVP này biến repo thành nền tảng bot Zalo cho cộng đồng cashback Shopee Affiliate. Bot hỗ trợ cả chat riêng và nhóm Zalo, tạo link Shopee có tracking riêng, lưu đơn hàng, tính cashback theo hoa hồng thực nhận, và cung cấp admin dashboard tối giản để vận hành giai đoạn đầu.

## Phạm vi MVP

- Nhận webhook tin nhắn từ Zalo Bot Platform tại `POST /webhooks/zalo`.
- Tự động phát hiện link `shopee.vn`, `s.shopee.vn`, hoặc `shp.ee` trong chat riêng/nhóm.
- Sinh mã tracking theo user và group để đối soát cashback.
- Tạo affiliate URL có `af_id` và `sub_id` từ tracking code, đồng thời trả tỷ lệ cashback sau khi trừ phí nền tảng.
- Command `/cashback` để người dùng xem số dư.
- Command `/rut 50000 momo 09xxxxxxxx` hoặc `/rut 50000 bank VCB 0123456789 NGUYEN VAN A` để tạo yêu cầu rút tiền.
- Admin dashboard tại `/` để xem metric, đơn hàng, yêu cầu rút tiền và import order JSON từ Shopee Affiliate report.

## Cấu hình môi trường

Sao chép `.env.example` thành `.env` và cập nhật giá trị thật:

```bash
cp .env.example .env
```

Các biến quan trọng:

- `ZALO_BOT_TOKEN`: token bot Zalo dùng để gửi tin nhắn.
- `ZALO_WEBHOOK_SECRET`: secret để verify header `X-Bot-Api-Secret-Token` từ Zalo.
- `SHOPEE_AFFILIATE_ID`: affiliate ID từ tài khoản Shopee Affiliate của bạn.
- `SHOPEE_DEFAULT_CASHBACK_RATE`: tỷ lệ chia lại hoa hồng cho user, mặc định `0.7` tức 70%.
- `ADMIN_API_KEY`: key để admin dashboard gọi API.
- `DATA_DIR`: thư mục chứa JSON store, mặc định `./data`.

## Chạy local

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Mở admin dashboard:

```text
http://localhost:3000/
```

## Webhook Zalo

Đăng ký webhook production trỏ về endpoint HTTPS:

```text
https://your-domain.example/webhooks/zalo
```

Server sẽ từ chối request nếu `ZALO_WEBHOOK_SECRET` được cấu hình nhưng header `X-Bot-Api-Secret-Token` không khớp.

## Import đơn hàng Shopee Affiliate

Trong dashboard, dán JSON theo format:

```json
{
  "orders": [
    {
      "trackingId": "zu123_g456_labcxyz",
      "shopeeOrderId": "250101ABC",
      "orderAmount": 250000,
      "commissionAmount": 10000,
      "status": "approved",
      "orderedAt": "2026-06-14T08:00:00.000Z"
    }
  ]
}
```

Cashback được tính bằng:

```text
cashbackAmount = floor(commissionAmount * cashbackShareRate)
```

## Roadmap sau MVP

1. Tích hợp trực tiếp API Shopee Affiliate để tạo deeplink/shortlink và sync conversion report tự động.
2. Thêm database PostgreSQL thay cho JSON store.
3. Thêm đăng nhập admin, phân quyền group owner và audit log.
4. Thêm duyệt/đánh dấu đã thanh toán withdrawal trên dashboard.
5. Thêm chống spam link, hạn mức rút tiền nâng cao và cảnh báo gian lận.

## Build/test trước khi đưa lên VPS

Chạy toàn bộ kiểm tra local:

```bash
npm test
```

Lệnh này chạy `node --check` cho các module chính và smoke test end-to-end gồm health check, kiểm tra admin auth, webhook Zalo giả lập, tạo link Shopee affiliate có `af_id`/`sub_id`, xác nhận tin nhắn trả tỷ lệ cashback sau khi trừ phí nền tảng, import đơn hàng, tính cashback, tạo withdrawal MoMo và admin summary.

## Triển khai VPS bằng Docker Compose

1. Cài Docker và Docker Compose plugin trên VPS.
2. Clone repo vào VPS, ví dụ:

```bash
git clone <repo-url> /opt/zalo-shopee-cashback-bot
cd /opt/zalo-shopee-cashback-bot
cp .env.example .env
nano .env
```

3. Cập nhật các biến thật trong `.env`, đặc biệt `ZALO_BOT_TOKEN`, `ZALO_WEBHOOK_SECRET`, `SHOPEE_AFFILIATE_ID`, `ADMIN_API_KEY`.
4. Build và chạy service:

```bash
docker compose up -d --build
```

5. Kiểm tra service:

```bash
curl http://127.0.0.1:3000/health
```

6. Trỏ Nginx/reverse proxy domain HTTPS về `127.0.0.1:3000`, sau đó đăng ký webhook Zalo:

```text
https://cashback.example.com/webhooks/zalo
```

## Triển khai VPS bằng systemd

Nếu không dùng Docker, có thể dùng service mẫu tại `deploy/zalo-shopee-cashback.service`:

```bash
sudo cp deploy/zalo-shopee-cashback.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zalo-shopee-cashback
sudo systemctl status zalo-shopee-cashback
```

File Nginx mẫu nằm tại `deploy/nginx.conf.example`. Khi chạy production, nên bật HTTPS bằng Certbot hoặc reverse proxy có TLS trước khi cấu hình webhook Zalo.

## Triển khai nhanh qua SSH

Có thể dùng script `scripts/deploy-vps.sh` để upload source, chạy `npm test`, rồi tự khởi động bằng Docker Compose, systemd hoặc `nohup` tùy môi trường VPS.

Ví dụ dùng password SSH tạm thời:

```bash
APP_HOST=35.184.40.197 \
APP_USER=dichvuvpsntk \
APP_DIR=/opt/zalo-shopee-cashback-bot \
SSH_PASS='your-temporary-password' \
scripts/deploy-vps.sh
```

Khuyến nghị production: đổi password VPS sau khi chia sẻ, dùng SSH key thay cho password, điền token thật trong `.env`, rồi bật HTTPS cho domain trước khi đăng ký webhook Zalo.

## Triển khai trên Windows VPS bằng RDP

Nếu VPS là Windows Server, hãy remote bằng RDP, copy repo vào máy, mở **PowerShell as Administrator**, rồi chạy:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
cd path\to\zalo-shopee-cashback-bot
.\deploy\windows-service.ps1 -AppDir "C:\zalo-shopee-cashback-bot" -Port 3000
```

Script Windows sẽ kiểm tra Node.js/npm, copy source vào `C:\zalo-shopee-cashback-bot`, tạo `.env` nếu chưa có, chạy `npm test`, đăng ký Scheduled Task tên `ZaloShopeeCashbackBot`, start bot và kiểm tra `http://127.0.0.1:3000/health`.

Sau khi script chạy xong, mở file:

```text
C:\zalo-shopee-cashback-bot\.env
```

Điền token thật cho `ZALO_BOT_TOKEN`, `ZALO_WEBHOOK_SECRET`, `SHOPEE_AFFILIATE_ID`, `ADMIN_API_KEY`, rồi restart task:

```powershell
Stop-ScheduledTask -TaskName ZaloShopeeCashbackBot
Start-ScheduledTask -TaskName ZaloShopeeCashbackBot
```

Nếu dùng IIS làm reverse proxy, có thể tham khảo `deploy/windows-iis-webconfig.xml`; Windows Server cần bật IIS URL Rewrite và ARR trước, sau đó proxy domain HTTPS về `http://127.0.0.1:3000`.

## Command khách hàng trong Zalo

- Gửi link Shopee bất kỳ: bot trả link cashback/affiliate có tracking.
- `/cashback`: xem số dư khả dụng, đang chờ rút và đã thanh toán.
- `/stk momo 09xxxxxxxx`: lưu ví MoMo mặc định để rút tiền.
- `/stk bank VCB 0123456789 NGUYEN VAN A`: lưu STK ngân hàng mặc định để rút tiền.
- `/rut 50000`: rút về tài khoản mặc định đã lưu bằng `/stk`.
- `/rut 50000 momo 09xxxxxxxx`: rút nhanh về ví MoMo khác mà không cần lưu trước.
- `/rut 50000 bank VCB 0123456789 NGUYEN VAN A`: rút nhanh về STK ngân hàng khác mà không cần lưu trước.

## Cấu hình webhook, affiliate id và admin MVP

1. Tạo file `.env` từ mẫu:

```bash
cp .env.example .env
```

2. Điền các giá trị chính:

```text
PORT=3000
APP_BASE_URL=https://domain-cua-ban.example
ZALO_BOT_TOKEN=token_bot_zalo
ZALO_WEBHOOK_SECRET=secret_webhook_zalo
SHOPEE_AFFILIATE_ID=id_aff_shopee_cua_ban
SHOPEE_DEFAULT_CASHBACK_RATE=0.7
ADMIN_API_KEY=admin_key_tu_dat
DATA_DIR=./data
```

3. Đăng ký webhook Zalo trỏ về endpoint:

```text
https://domain-cua-ban.example/webhooks/zalo
```

4. Header secret webhook phải khớp với biến:

```text
X-Bot-Api-Secret-Token: ZALO_WEBHOOK_SECRET
```

5. Vào MVP admin bằng trình duyệt:

```text
https://domain-cua-ban.example/
```

6. Nhập giá trị `ADMIN_API_KEY` vào ô **Admin API key** trên dashboard để xem summary, orders, withdrawals và import order JSON.

## Không có domain và không có Shopee API thì dùng thế nào?

### Vào MVP admin khi chưa có domain

Nếu chạy trên máy cá nhân:

```text
http://localhost:3000/
```

Nếu chạy trên VPS nhưng chưa có domain, mở firewall port `3000` tạm thời rồi vào bằng IP:

```text
http://IP-VPS:3000/
```

Khi dùng IP public, vẫn nhập `ADMIN_API_KEY` trên dashboard để truy cập dữ liệu admin. Production nên đặt Nginx/IIS reverse proxy và HTTPS trước khi dùng thật.

### Webhook Zalo khi chưa có domain

Zalo webhook cần URL public HTTPS. Nếu chưa mua domain, có thể dùng tunnel tạm thời:

```text
Cloudflare Tunnel / ngrok / local tunnel HTTPS URL
```

Sau đó lấy URL HTTPS tunnel và đăng ký webhook:

```text
https://random-tunnel-url.example/webhooks/zalo
```

### Không có Shopee API

MVP không bắt buộc có Shopee API. Bạn có thể vận hành thủ công bằng cách tải/export báo cáo đơn từ Shopee Affiliate rồi import trong admin dashboard bằng JSON hoặc CSV.

CSV cần header:

```csv
trackingId,shopeeOrderId,orderAmount,commissionAmount,status,orderedAt
zu123_g456_xxx,ORDER-1,250000,100000,approved,2026-06-14T08:00:00.000Z
```

Điều bắt buộc để cashback chạy đúng là báo cáo đơn phải có `trackingId` khớp với `sub_id` mà bot đã tạo trong link affiliate.
