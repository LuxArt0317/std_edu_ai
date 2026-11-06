# Nexus authentication

`SchoolAuth.tsx` owns `/signin`, `/signup`, password recovery, and protected `/app` entry. `/login` and `/crm` remain compatibility routes. Nexus student registration requires email confirmation; School Affairs uses a separate Google session at `/school-affairs/login`.

Keep trusted role assignment in the server and database. See [role permissions](../../../docs/security/roles.md) and [client setup](../../../docs/operations/SETUP.md).
