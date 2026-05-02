# DMX Build Standards (referenced by every batch prompt)

## Code patterns to reuse (no re-explanation needed)

### audit_log
Use `await audit_log.log_mutation(db, entity_type, entity_id, before, after, actor, request, action='update'|'create'|'delete'|'read')` after every state change. Fire-and-forget pattern.

### emit_ml_event
Use `await emit_ml_event(db, event_type, user_id, org_id, role, context)` for ML training corpus. Mirror to PostHog with `dmx_ml_*` prefix automatically.

### Role guards
- Reuse `routes_dev_batch4_2.get_user_permission_level(user)` — returns canonical level: superadmin | developer_director | developer_member | inmobiliaria_director | inmobiliaria_member | asesor_freelance
- Reuse `can_view_kanban`, `can_move_lead`, `can_view_full_client_data`, `can_view_conversation`, `can_view_ai_summary` from same file

### Resend email
Pattern: `await send_resend(to, subject, html, attachments?)`. Branded templates use `dev_org.branding` for logo + colors. Always Spanish unless founder spec says otherwise.

### Design system (NO violations)
- Colors: `var(--navy)`, `var(--cream)`, gradient único `linear-gradient(135deg, var(--gradient-from), var(--gradient-to))`
- NO indigo, NO purple, NO custom rgba unless atom-defined
- Fonts: Outfit (display), DM Sans (body)
- Atoms only — reuse `<Card>`, `<Badge>`, `<PageHeader>` from `components/advisor/primitives.js` and `components/icons/index.js`

### Frontend structure
- Components shared: `frontend/src/components/shared/`
- Per-portal: `frontend/src/components/{advisor,developer,inmobiliaria,public}/`
- Pages: `frontend/src/pages/{advisor,developer,inmobiliaria,public}/`

### Testing requirements (every batch)
1. `lint` backend (pyflakes + isort)
2. `lint` frontend (eslint)
3. `curl` smoke each new endpoint with multiple roles
4. `playwright` smoke at least 1 main user flow
5. Backend startup clean
6. Report SHA after Save to GitHub

### Conventions
- New backend route file naming: `routes_dev_batch{N}.py`
- Schema collections: snake_case
- Endpoints: `/api/{scope}/{resource}` (scope: dev/advisor/inmobiliaria/public)
- Spanish UI copy, English code identifiers
