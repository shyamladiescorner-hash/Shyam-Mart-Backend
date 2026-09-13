# Shyam OS API v1

Base URL: `/api/v1`

## Auth
- POST `/auth/register`
- POST `/auth/login`
- GET `/me`

## Catalogue
- GET `/catalog/categories`
- GET `/catalog/products`
- GET `/catalog/products/:id`
- POST `/catalog/products` — admin/staff
- PATCH `/catalog/products/:id` — admin/staff
- PATCH `/catalog/products/:id/inventory` — admin/staff

## Storefront
- GET `/storefront/home`
- GET `/storefront/search?q=...`
- GET `/storefront/products/:id`
- GET `/storefront/wishlist` — authenticated
- POST `/storefront/wishlist/:productId` — authenticated
- DELETE `/storefront/wishlist/:productId` — authenticated

## Commerce
- POST `/commerce/cart/validate`
- POST `/commerce/orders`
- GET `/commerce/orders`
- GET `/commerce/orders/:id`
- GET `/commerce/admin/orders` — admin/staff
- PATCH `/commerce/admin/orders/:id/status` — admin/staff

## Payments
- POST `/payments/quote`
- POST `/payments/create-order`
- POST `/payments/verify-demo` — development only
- POST `/payments/webhook`

## Notifications
- GET `/notifications/templates` — admin/staff
- POST `/notifications/orders/:id/whatsapp-preview` — admin/staff
- GET `/notifications/admin/notifications` — admin/staff

## Intelligence
- GET `/intelligence/analytics/summary?days=30` — admin/staff
- GET `/intelligence/recommendations?q=gift`
- POST `/intelligence/events`

All authenticated endpoints use:
`Authorization: Bearer <JWT>`

Real payment/WhatsApp provider credentials are required before production use.
