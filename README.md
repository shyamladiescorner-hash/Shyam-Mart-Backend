# Shyam OS Backend v2 — Database + Authentication

## Added in v2
- PostgreSQL connection pool
- Database migration script
- Password hashing with bcrypt
- JWT authentication
- Customer registration
- Login
- Protected `/api/v1/me`
- Role-aware auth middleware
- Admin/staff/customer role foundation

## Setup
1. Install Node.js 20+ and PostgreSQL.
2. Copy `.env.example` to `.env`.
3. Put a strong random value in `JWT_SECRET`.
4. Create database `shyam_os`.
5. Run `npm install`.
6. Run `npm run db:migrate`.
7. Run `npm run dev`.

## Test
Register:
POST `/api/v1/auth/register`
JSON:
`{"phone":"9999999999","name":"Demo Customer","password":"strong-password"}`

Login:
POST `/api/v1/auth/login`

Then call:
GET `/api/v1/me`
Header:
`Authorization: Bearer <token>`

## Security note
For production, OTP-based customer login, refresh-token/session strategy,
rate limiting, password reset, CSRF strategy where applicable, secret
management, audit logging and automated tests should be added before launch.


## v3 — Product & Category API
Added:
- Public category listing
- Admin/staff category creation
- Product listing with search, category filter, active filter, pagination
- Product detail
- Admin/staff product creation
- Admin/staff product update / hide-unhide
- Inventory quantity + low-stock threshold update
- Server-side validation and parameterized SQL

Example endpoints:
- `GET /api/v1/catalog/categories`
- `GET /api/v1/catalog/products?q=lipstick&limit=20&offset=0`
- `GET /api/v1/catalog/products?category=cosmetics`
- `POST /api/v1/catalog/products` (admin/staff)
- `PATCH /api/v1/catalog/products/:id` (admin/staff)
- `PATCH /api/v1/catalog/products/:id/inventory` (admin/staff)

All admin/staff write operations require:
`Authorization: Bearer <JWT>`


## v4 — Cart + Orders + Inventory Engine
Added:
- Server-side cart validation
- Live available-stock validation
- Transactional order creation
- Row locking (`FOR UPDATE`) to reduce overselling races
- Inventory deduction at order creation
- Delivery fee rule (demo business rule: free above ₹499, otherwise ₹40)
- Customer order list/detail
- Admin/staff order list
- Admin/staff order status updates
- Payment record creation (gateway integration still pending)

Endpoints:
- `POST /api/v1/commerce/cart/validate`
- `POST /api/v1/commerce/orders`
- `GET /api/v1/commerce/orders`
- `GET /api/v1/commerce/orders/:id`
- `GET /api/v1/commerce/admin/orders`
- `PATCH /api/v1/commerce/admin/orders/:id/status`

The order API validates prices and stock from PostgreSQL rather than trusting browser values.


## v5 — Admin Control APIs
Added:
- Admin/staff dashboard KPIs
- Revenue, orders and AOV
- Order status counts
- Active customer count
- Low-stock product alerts
- Customer search + lifetime order/spend summary
- Inventory list/search
- Safe stock adjustment with row locking
- Protection against reducing stock below reserved quantity

Endpoints:
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/customers?q=`
- `GET /api/v1/admin/inventory?q=`
- `PATCH /api/v1/admin/products/:id/inventory/adjust`

All admin endpoints require a JWT and `admin` or `staff` role.


## v6 — Customer Storefront API
Added:
- Customer home payload
- Live category/product catalogue
- Search API
- Product detail API
- Wishlist add/remove/list
- Coupon table foundation
- Customer-facing active-product filtering

Endpoints:
- `GET /api/v1/storefront/home`
- `GET /api/v1/storefront/search?q=...`
- `GET /api/v1/storefront/products/:id`
- `POST /api/v1/storefront/wishlist/:productId`
- `DELETE /api/v1/storefront/wishlist/:productId`
- `GET /api/v1/storefront/wishlist`

The customer storefront now has a clean backend boundary: UI clients can consume
these APIs without accessing PostgreSQL directly.


## v7 — Payment + Coupon Engine
Added:
- Server-side checkout quotes
- Coupon validation and expiry checks
- Percentage and flat discounts
- Maximum discount support
- Minimum order value support
- Delivery fee calculation after discount
- Transactional payment/order creation
- Demo payment verification disabled in production
- Signed webhook foundation
- Payment state handling
- Order confirmation on verified payment
- Order cancellation on failed payment

Endpoints:
- `POST /api/v1/payments/quote`
- `POST /api/v1/payments/create-order`
- `POST /api/v1/payments/verify-demo` (development only)
- `POST /api/v1/payments/webhook`

Real payment-provider SDK/webhook verification is intentionally not hard-coded
until the gateway is selected and credentials are configured.


## v8 — WhatsApp + Notifications Engine
Added:
- WhatsApp message template catalogue
- Order-specific WhatsApp previews
- Notification persistence
- Order status history
- Admin notification queue visibility
- Automatic notification queueing for confirmed/packed/shipped/delivered/cancelled
- Production-safe placeholder for official WhatsApp Business API
- Real message sending disabled until provider configuration exists

Endpoints:
- `GET /api/v1/notifications/templates`
- `POST /api/v1/notifications/orders/:id/whatsapp-preview`
- `GET /api/v1/notifications/admin/notifications`
- `POST /api/v1/notifications/admin/notifications/test`


## v9 — Shyam Intelligence + AI Foundation
Added:
- Live analytics summary from orders
- Revenue, orders, AOV, unique customers
- Top products and category performance
- Daily revenue/order trend
- Catalogue-aware recommendation endpoint
- Customer behaviour event collection
- JSON metadata for analytics events
- Explicit prototype boundary for deterministic recommendations

Endpoints:
- `GET /api/v1/intelligence/analytics/summary?days=30` (admin/staff)
- `GET /api/v1/intelligence/recommendations?q=gift`
- `POST /api/v1/intelligence/events`

The recommendation endpoint is intentionally a rules-based prototype. A real AI
provider/model can be connected after the catalogue and business rules are stable.


## v10 — Production Launch Foundation
Added:
- Production environment template
- Dockerfile
- Example Docker Compose infrastructure
- API documentation
- Go-live checklist
- Smoke-test specification
- Production start script

Important:
This is a deployment-ready foundation, not a claim that external infrastructure,
payment gateway, WhatsApp provider, domain, production database or monitoring
has already been configured. Those require real accounts/credentials and
deployment actions.
