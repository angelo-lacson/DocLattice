# Authentication Configuration

OpenContracts supports two authentication methods:

1. **Password authentication** (Django-based) -- simple, no external dependencies
2. **Auth0 authentication** (OAuth2/OIDC) -- supports self-registration, SSO, and social logins

Both methods work for the main frontend application and the Django admin dashboard.
You choose one method per deployment via environment variables.

---

## Option 1: Password Authentication (Default)

Password auth uses Django's built-in authentication system. Users are created manually
by an administrator -- there is no self-registration.

### Backend Configuration

Set the following in your backend environment file (`.envs/.local/.django` or `.envs/.production/.django`):

```bash
USE_AUTH0=False

# Initial admin account (set BEFORE first boot)
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_PASSWORD=<choose-a-strong-password>
DJANGO_SUPERUSER_EMAIL=admin@example.com
```

If you don't set these before first boot, the defaults are used:
username `admin`, password `Openc0ntracts_def@ult`. Change the password immediately
if you use the defaults.

### Frontend Configuration

Set in your frontend environment file (`.envs/.local/.frontend` or `.envs/.production/.frontend`):

**Local development** (Vite, `VITE_*` prefix):

```bash
VITE_USE_AUTH0=false
VITE_API_ROOT_URL=http://localhost:8000
```

**Production** (Docker, `OPEN_CONTRACTS_*` prefix):

```bash
OPEN_CONTRACTS_REACT_APP_USE_AUTH0=false
OPEN_CONTRACTS_REACT_APP_API_ROOT_URL=https://your-domain.com
```

### Managing Users

With password auth, all user management is done through the Django admin dashboard
at `/admin/`. Log in with your superuser account and use the Users section to
create, modify, or deactivate users.

### Admin Dashboard Access

The Django admin is available at `/admin/`. Log in with any user that has
`is_staff=True`. The initial superuser account has both `is_staff` and `is_superuser`
set automatically.

---

## Option 2: Auth0 Authentication

Auth0 provides OAuth2/OIDC authentication with support for social logins (Google,
GitHub, etc.), SSO, and self-registration. New users who authenticate via Auth0
automatically get a Django account created.

### Auth0 Dashboard Setup

You need to create **three applications** in your [Auth0 dashboard](https://manage.auth0.com/):

#### Step 1: Create a Single Page Application (SPA)

This is used by the React frontend to authenticate users.

1. Go to **Applications > Create Application**
2. Choose **Single Page Web Applications**
3. Name it (e.g., "OpenContracts Frontend")
4. In the **Settings** tab, note the:
    - **Domain** -- e.g., `dev-xxxxx.auth0.com` (this is your `AUTH0_DOMAIN`)
    - **Client ID** -- (this is your `AUTH0_CLIENT_ID`)
5. Configure **Allowed Callback URLs**:
    - Local: `http://localhost:3000, http://localhost:8000/admin/login/`
    - Production: `https://your-domain.com, https://your-domain.com/admin/login/`
6. Configure **Allowed Logout URLs**:
    - Local: `http://localhost:3000, http://localhost:8000/admin/login/`
    - Production: `https://your-domain.com, https://your-domain.com/admin/login/`
7. Configure **Allowed Web Origins**:
    - Local: `http://localhost:3000, http://localhost:8000`
    - Production: `https://your-domain.com`
8. Save changes

#### Step 2: Create an API

This represents your OpenContracts backend and defines the audience for access tokens.

1. Go to **Applications > APIs > Create API**
2. Name it (e.g., "OpenContracts API")
3. Set the **Identifier** (audience) -- e.g., `https://your-domain.com/contracts`
    - This is your `AUTH0_API_AUDIENCE`
    - It does not need to be a real URL, just a unique identifier
4. Leave signing algorithm as **RS256**
5. Save

#### Step 3: Create a Machine-to-Machine (M2M) Application

This is used by the Django backend to call the Auth0 Management API (to fetch user
profiles like email, name, etc.).

1. Go to **Applications > Create Application**
2. Choose **Machine to Machine Applications**
3. Name it (e.g., "OpenContracts Backend M2M")
4. **Authorize** it for the **Auth0 Management API** (`https://<your-domain>.auth0.com/api/v2/`)
5. Grant the following **permissions/scopes**:
    - `read:users`
    - `read:user_idp_tokens`
6. Note the:
    - **Client ID** -- this is your `AUTH0_M2M_MANAGEMENT_API_ID`
    - **Client Secret** -- this is your `AUTH0_M2M_MANAGEMENT_API_SECRET`

#### Step 4: Create a Post-Login Action (for Admin Claims)

This Action adds custom claims to access tokens so the Django backend can grant
`is_staff` and `is_superuser` permissions to specific Auth0 users.

1. Go to **Actions > Flows > Login**
2. Click **Add Action > Build Custom**
3. Name it (e.g., "Add Admin Claims")
4. Replace the code with:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://opencontracts.opensource.legal/';

  // Read admin flags from user's app_metadata
  const isStaff = event.user.app_metadata?.is_staff || false;
  const isSuperuser = event.user.app_metadata?.is_superuser || false;

  // Add claims to the access token
  api.accessToken.setCustomClaim(`${namespace}is_staff`, isStaff);
  api.accessToken.setCustomClaim(`${namespace}is_superuser`, isSuperuser);
};
```

5. Click **Deploy**
6. Back in the Login Flow, **drag your Action** into the flow between "Start" and "Complete"
7. Click **Apply**

!!! warning "The Action must be active in the flow"
    Creating and deploying the Action is not enough. You must drag it into the
    Login Flow and click Apply, otherwise it will not execute.

#### Step 5: Grant Admin Access to Auth0 Users

To give an Auth0 user admin access:

1. Go to **User Management > Users**
2. Find the user and click on them
3. Scroll to **app_metadata** and set:

```json
{
  "is_staff": true,
  "is_superuser": true
}
```

4. Save

- `is_staff` grants access to the Django admin dashboard
- `is_superuser` grants full permissions within Django admin
- Users without these flags can still use the main frontend application

### Backend Configuration

Set the following in your backend environment file:

```bash
USE_AUTH0=True

# From Step 1 (SPA Application)
AUTH0_CLIENT_ID=<your-spa-client-id>
AUTH0_DOMAIN=<your-tenant>.auth0.com

# From Step 2 (API)
AUTH0_API_AUDIENCE=https://your-domain.com/contracts

# From Step 3 (M2M Application)
AUTH0_M2M_MANAGEMENT_API_ID=<your-m2m-client-id>
AUTH0_M2M_MANAGEMENT_API_SECRET=<your-m2m-client-secret>
AUTH0_M2M_MANAGEMENT_GRANT_TYPE=client_credentials

# Optional: custom namespace for admin claims (default shown below)
# Only change this if you use a different namespace in your Auth0 Action
# AUTH0_ADMIN_CLAIM_NAMESPACE=https://opencontracts.opensource.legal/
```

### Frontend Configuration

**Local development** (Vite):

```bash
VITE_USE_AUTH0=true
VITE_APPLICATION_DOMAIN=<your-tenant>.auth0.com
VITE_APPLICATION_CLIENT_ID=<your-spa-client-id>
VITE_AUDIENCE=https://your-domain.com/contracts
VITE_API_ROOT_URL=http://localhost:8000
```

**Production** (Docker):

```bash
OPEN_CONTRACTS_REACT_APP_USE_AUTH0=true
OPEN_CONTRACTS_REACT_APP_APPLICATION_DOMAIN=<your-tenant>.auth0.com
OPEN_CONTRACTS_REACT_APP_APPLICATION_CLIENT_ID=<your-spa-client-id>
OPEN_CONTRACTS_REACT_APP_AUDIENCE=https://your-domain.com/contracts
OPEN_CONTRACTS_REACT_APP_API_ROOT_URL=https://your-domain.com
```

### Admin Dashboard Access with Auth0

When Auth0 is enabled, the admin login page at `/admin/login/` displays both:

- A **"Sign in with Auth0"** button
- A standard **username/password form** (fallback)

The Auth0 login flow:

1. User clicks "Sign in with Auth0"
2. Browser redirects to Auth0 for authentication
3. Auth0 redirects back to `/admin/login/` with an authorization code
4. The frontend JS SDK exchanges the code for an access token
5. The access token is posted to Django
6. Django decodes the token, syncs `is_staff`/`is_superuser` from the token claims,
   and creates a Django session

Users need `is_staff: true` in their Auth0 `app_metadata` (and the Post-Login Action
must be active) to access the admin dashboard. Users without this flag are denied
even if they authenticate successfully.

### How Auth0 User Creation Works

When a user authenticates via Auth0 for the first time:

1. A Django user account is created automatically with the Auth0 user ID
   (e.g., `google-oauth2|123456`) as the username
2. A random password is set (prevents password-based login for Auth0 users)
3. A background Celery task fetches the user's email, name, and other profile data
   from the Auth0 Management API (this is why the M2M application is required)
4. Admin claims (`is_staff`, `is_superuser`) are synced from the access token

This means the user's email may not appear immediately in Django -- it is populated
asynchronously within a few seconds of first login.

---

## Environment Variable Reference

### Backend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `USE_AUTH0` | Yes | `False` | Enable Auth0 authentication |
| `AUTH0_CLIENT_ID` | If Auth0 | -- | SPA application client ID |
| `AUTH0_DOMAIN` | If Auth0 | -- | Auth0 tenant domain (e.g., `dev-xxxxx.auth0.com`) |
| `AUTH0_API_AUDIENCE` | If Auth0 | -- | API identifier/audience |
| `AUTH0_M2M_MANAGEMENT_API_ID` | If Auth0 | -- | M2M application client ID |
| `AUTH0_M2M_MANAGEMENT_API_SECRET` | If Auth0 | -- | M2M application client secret |
| `AUTH0_M2M_MANAGEMENT_GRANT_TYPE` | If Auth0 | -- | Always `client_credentials` |
| `AUTH0_ADMIN_CLAIM_NAMESPACE` | No | `https://opencontracts.opensource.legal/` | Namespace prefix for admin claims in tokens |
| `DJANGO_SUPERUSER_USERNAME` | No | `admin` | Initial admin username |
| `DJANGO_SUPERUSER_PASSWORD` | No | `Openc0ntracts_def@ult` | Initial admin password |
| `DJANGO_SUPERUSER_EMAIL` | No | `support@opensource.legal` | Initial admin email |

### Frontend Variables

| Variable (Production) | Variable (Local/Vite) | Required | Description |
|-----------------------|----------------------|----------|-------------|
| `OPEN_CONTRACTS_REACT_APP_USE_AUTH0` | `VITE_USE_AUTH0` | Yes | Enable Auth0 on frontend |
| `OPEN_CONTRACTS_REACT_APP_APPLICATION_DOMAIN` | `VITE_APPLICATION_DOMAIN` | If Auth0 | Auth0 tenant domain |
| `OPEN_CONTRACTS_REACT_APP_APPLICATION_CLIENT_ID` | `VITE_APPLICATION_CLIENT_ID` | If Auth0 | SPA client ID |
| `OPEN_CONTRACTS_REACT_APP_AUDIENCE` | `VITE_AUDIENCE` | If Auth0 | API audience |
| `OPEN_CONTRACTS_REACT_APP_API_ROOT_URL` | `VITE_API_ROOT_URL` | Yes | Backend URL |

---

## Troubleshooting

### Auth0 login redirects back to login page

**Symptom**: After Auth0 authentication, you're redirected back to `/admin/login/`
with an error message.

**Likely causes**:

1. **Post-Login Action not active**: The Action must be deployed AND dragged into
   the Login Flow. Check Actions > Flows > Login in your Auth0 dashboard.
2. **Missing `app_metadata`**: The user needs `is_staff: true` in their
   `app_metadata`. Check User Management > Users > (your user) > app_metadata.
3. **Wrong claim namespace**: The Action must use the namespace
   `https://opencontracts.opensource.legal/` (with trailing slash) unless you've
   overridden `AUTH0_ADMIN_CLAIM_NAMESPACE`.

### "Authentication failed" error

**Likely causes**:

1. **Mismatched audience**: The `AUTH0_API_AUDIENCE` backend variable must match
   the API identifier in Auth0 and the frontend `AUDIENCE` variable.
2. **Wrong domain**: `AUTH0_DOMAIN` must match your Auth0 tenant domain exactly.
3. **Expired or invalid token**: Check browser console for Auth0 SDK errors.

### User created but has no email

This is expected. The email is fetched asynchronously via a Celery background task
after first login. Check that:

1. Your M2M application credentials are correct
2. The M2M application has `read:users` permission on the Auth0 Management API
3. Celery workers are running

### Callback URL mismatch

Auth0 requires exact callback URL matching. Ensure your Auth0 SPA application's
**Allowed Callback URLs** includes:

- For frontend: `http://localhost:3000` (local) or `https://your-domain.com` (production)
- For admin: `http://localhost:8000/admin/login/` (local) or `https://your-domain.com/admin/login/` (production)

### Debug token claims

To see what claims are in an Auth0 access token, temporarily set the Django log
level for `config.graphql_auth0_auth.utils` to `DEBUG`. The `sync_admin_claims`
function logs the payload keys and claim values at debug level.
