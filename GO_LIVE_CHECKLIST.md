# Shyam OS — Go-Live Checklist

## Infrastructure
- [ ] Production PostgreSQL created
- [ ] Automated backups enabled
- [ ] Recovery test completed
- [ ] API deployed over HTTPS
- [ ] Domain and DNS configured
- [ ] Secrets stored outside source control
- [ ] Production CORS allowlist configured

## Security
- [ ] Strong JWT secret
- [ ] Rate limiting enabled
- [ ] Admin accounts protected
- [ ] Least-privilege database user
- [ ] Payment webhooks signature-verified
- [ ] Admin actions audited
- [ ] Error logs do not expose secrets
- [ ] Dependency/security scan completed

## Commerce
- [ ] Catalogue imported
- [ ] Prices verified
- [ ] Stock verified against physical shop
- [ ] Order lifecycle tested
- [ ] Cancellation/refund rules tested
- [ ] Coupon rules tested

## Payments
- [ ] Merchant account approved
- [ ] Production keys configured securely
- [ ] Success/failure webhook tested
- [ ] Refund flow tested
- [ ] Reconciliation process defined

## WhatsApp
- [ ] Official WhatsApp Business setup completed
- [ ] Approved templates configured
- [ ] Opt-in/communication rules reviewed
- [ ] Delivery/failure handling tested

## Quality
- [ ] API integration tests
- [ ] Checkout tests
- [ ] Inventory concurrency tests
- [ ] Mobile UI tests
- [ ] Backup restore test
- [ ] Monitoring/alerts
- [ ] Staging sign-off
- [ ] Production smoke test
