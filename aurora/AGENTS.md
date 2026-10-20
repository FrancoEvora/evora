# Aurora implementation rules

- Preserve tenant isolation and server-side authorization. Roles come from current `aurora_members`, never editable user metadata.
- Keep all new database objects in the Aurora namespace. Do not modify other apps' business data or global Auth settings as a side effect.
- Protect every API independently. Do not accept client-supplied evidence as an authorized server context.
- Never commit credentials, service-role keys, `.env.local`, deployment runtime files or test-user sessions.
- Preserve the former browser vault at `/legacy/`; never delete or overwrite IndexedDB without an explicit migration request.
- Keep Portuguese copy clear; use only real records and mark missing data. No fake KPIs or simulated AI responses.
- Use current installed-library docs. Pin versions and commit package-lock.json.
- Before releasing changes, run `npm run build`, `npm test`, and focused RLS verification when permissions change.
- Do not send invitations or external messages automatically unless the user specifically requests sending.
- No deployment secrets in preview environments. Production scope: Vercel `aurora-territorial`.
