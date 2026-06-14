# Zalo Shopee Cashback Bot MVP

MVP này biến repo thành nền tảng bot Zalo cho cộng đồng cashback Shopee Affiliate. Bot hỗ trợ cả chat riêng và nhóm Zalo, tạo link Shopee có tracking riêng, lưu đơn hàng, tính cashback theo hoa hồng thực nhận, và cung cấp admin dashboard tối giản để vận hành giai đoạn đầu.

## Phạm vi MVP

- Nhận webhook tin nhắn từ Zalo Bot Platform tại `POST /webhooks/zalo`.
- Tự động phát hiện link `shopee.vn`, `s.shopee.vn`, hoặc `shp.ee` trong chat riêng/nhóm.
- Sinh mã tracking theo user và group để đối soát cashback.
- Tạo affiliate URL có `af_id` và `sub_id` từ tracking code.
- Command `/start` hoặc `/help` để gửi hướng dẫn dùng bot theo flow giống banner cashback: gửi link, nhận link tracking, xem số dư, lưu tài khoản và rút tiền.
- Command `/cashback` để người dùng xem số dư.
- Command `/setbank momo 09xxxxxxxx` hoặc `/setbank bank VCB 0123456789 NGUYEN VAN A` để lưu thông tin nhận cashback.
- Command `/rut 50000 momo` hoặc `/rut 50000 bank` để rút bằng tài khoản đã lưu; vẫn có thể nhập đủ thông tin ngay trên lệnh `/rut 50000 bank VCB 0123456789 NGUYEN VAN A`.
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

Test nhanh webhook ở chế độ dry-run, không cần token Zalo:

```bash
curl -X POST http://localhost:3000/webhooks/zalo \
  -H 'Content-Type: application/json' \
  -d '{"message":{"text":"/start","from":{"id":"u1","name":"Demo"},"chat":{"id":"u1","type":"private"}}}'
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
