# Database TLS trust

`prod-ca-2021.crt` is Supabase's public database root certificate, obtained from the client dashboard's Download certificate link at https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt. Migration and live-verification commands trust this CA while requiring certificate and hostname verification. This file is public trust material, not a credential.
