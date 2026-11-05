# 7. Real Supabase Auth locally, without the full stack

**Status:** accepted

`docker-compose` runs only the Supabase Auth server, behind an nginx gateway that mimics the hosted
`/auth/v1` path. The code path matches production, including ES256 signing and JWKS, and needs no account.
The full Supabase CLI stack was rejected as too heavy for an 8 GB Docker allowance.
