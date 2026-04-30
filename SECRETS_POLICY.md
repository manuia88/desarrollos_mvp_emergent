# Secrets Policy — DesarrollosMX

**Non-negotiable.** Applies to every contributor (human or AI agent).

## Rules

1. **Real API tokens go ONLY in `.env` files.** Real values are never written in `.md`, `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.json`, `.yaml`, `.html`, `.css`, comments, README, seed data, tests, or commit messages.
2. **`.env` files are gitignored.** See `/app/.gitignore`. Do not remove those rules. Do not commit `frontend/.env`, `backend/.env`, `.env.local`, `.env.production`, etc.
3. **Code accesses secrets via `process.env.VARIABLE_NAME`** (frontend) or `os.environ.get("VARIABLE_NAME")` (backend). Never as string literals.
4. **Use `.env.example` files for documentation.** Each `.env.example` lists the required variable names with placeholder values (`REPLACE_WITH_REAL_TOKEN`, `your_token_here`, `REPLACE_WITH_RANDOM_48_BYTE_SECRET`). These ARE committed.
5. **In-code error messages** for missing tokens use the variable name, never the value: `"Missing REACT_APP_MAPBOX_TOKEN"` is OK; printing the partial token is NOT.

## Providers covered

Mapbox · Anthropic Claude · OpenAI · Google OAuth · Stripe · Twilio · ElevenLabs · SendGrid · Resend · Razorpay · PayPal · fal.ai · Mifiel · Meta WhatsApp Business · CoinGecko · Alpha Vantage · Discord · GitHub · HuggingFace — and any future provider.

## What to do if you see a token in code review

1. Replace the literal with `process.env.VAR_NAME` immediately.
2. Add the placeholder to the matching `.env.example` if missing.
3. **Rotate the leaked token at the provider** (Mapbox dashboard → Access tokens → Rotate; Anthropic console → API keys → Revoke; etc.).
4. Notify the maintainer.

## When GitHub push protection blocks a push

It means the secret is in **commit history**, not just the working tree. Two options:

- **Allow the secret** via the GitHub UI link in the error message (use this only if you've already rotated the leaked token, since it remains visible in history).
- **Rewrite history** with `git filter-repo` or `BFG` to scrub the secret from past commits, then force-push. Coordinate with the team because this rewrites SHAs.

After either resolution, **rotate the token** so the leaked value is invalidated.

## Required `.env.example` placeholders

Always use one of:
- `REPLACE_WITH_REAL_TOKEN`
- `REPLACE_WITH_<PROVIDER>_TOKEN`
- `your_<provider>_token_here`
- `xxx-replace-me`

Never use real-looking strings (no `pk.eyJ...`, `sk-...`, `AIza...`).
