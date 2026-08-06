# pagdedoações

Build a full-stack white label web platform for managing religious establishments and their communities. Use Supabase as the backend (auth, database, storage, realtime) and build a responsive, mobile-first UI with a clean, modern design system that supports custom branding (logo, colors, domain) per tenant.



---



## ARCHITECTURE



- Multi-tenant (white label) architecture: each "establishment" is an isolated tenant

- Role-based access control with 3 roles: `member`, `manager`, `admin`

- JWT authentication via Supabase Auth

- Row-Level Security (RLS) on all tables

- LGPD compliance: consent capture on signup, data anonymization option, data export for users



---



## DATABASE SCHEMA (Supabase)



Tables to create:



**tenants** – id, name, slug, logo_url, primary_color, secondary_color, custom_domain, active, created_at



**profiles** – id (FK auth.users), tenant_id, full_name, phone, email, role (member | manager | admin), status (pending | approved | blocked), avatar_url, lgpd_consent, lgpd_consent_at, created_at



**events** – id, tenant_id, title, description, date, location, capacity, ticket_price, type (event | campaign | donation), status (draft | active | closed), created_at



**tickets** – id, event_id, profile_id, tenant_id, qr_code_data, status (active | used | cancelled), payment_id, created_at



**payments** – id, tenant_id, profile_id, amount, method (pix | credit_card | debit_card), status (pending | confirmed | failed | refunded), reference_type (ticket | donation), reference_id, gateway_id, created_at



**donations** – id, tenant_id, profile_id, amount, campaign_id, payment_id, receipt_url, created_at



**groups** – id, tenant_id, name, description, created_by, created_at



**group_members** – id, group_id, profile_id, added_at



**messages** – id, tenant_id, sender_id, channel (sms | whatsapp | in_app), target_type (individual | group | broadcast), target_id, content, status (queued | sent | failed), sent_at, created_at



**notifications** – id, tenant_id, profile_id, title, body, read, type, created_at



**audit_logs** – id, tenant_id, user_id, action, entity, entity_id, metadata (jsonb), created_at



**api_keys** – id, tenant_id, label, key_hash, service (sms | whatsapp | payments), active, created_at



---

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/58aa89bc-a4b9-48a6-9f7b-c22d031a0a90).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
