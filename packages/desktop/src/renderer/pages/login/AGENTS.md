<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# login

## Purpose
The username/password login screen for AionUi's authenticated mode. `LoginPage` collects credentials, calls `useAuth().login`, and redirects to `/guid` once `status === 'authenticated'`. It also offers a language switcher and "remember me" credential persistence.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | `LoginPage` component (default export). Local form state via `useState`/`useRef`; submits to `useAuth().login` and maps result codes (`invalidCredentials`, `tooManyAttempts`, `networkError`, `serverError`, `unknown`) to i18n error strings. Persists/restores credentials in `localStorage` under `rememberMe`/`rememberedUsername`/`rememberedPassword`, obfuscated via reversed `btoa(encodeURIComponent(...))`. Renders `AppLoader` while `status === 'checking'`. |
| `LoginPage.css` | Plain global CSS (BEM-style `login-page__*` classes), gradient background, card slide-up/pulse/spin keyframe animations, and a `@media (max-width: 600px)` responsive block. Imported directly by `index.tsx`. |

## For AI Agents
- Renderer process: no Node.js APIs. Uses browser globals (`localStorage`, `btoa`/`atob`, `document.body.classList`, `window.setTimeout`) intentionally — these are renderer-only.
- This page deliberately breaks the usual UI conventions: it uses raw `<input>`, `<select>`, `<button>`, inline SVG icons, and a standalone `.css` file (not Arco components, `@icon-park/react`, UnoCSS, or CSS Modules). Match the existing plain-HTML/BEM style when editing here rather than introducing Arco.
- All user-facing text already goes through `t('login.*')` keys — keep that. `document.title` is set from `login.pageTitle`; `document.documentElement.lang` tracks `i18n.language`.
- `supportedLanguages` is a hardcoded list inside the component; add new locales there and via `changeLanguage` from `@/renderer/services/i18n`.
- Credential obfuscation is explicitly NOT cryptographically secure (see comment). Do not treat it as encryption.
- `document.body` gets/removes the `login-page-active` class (locks scroll) on mount/unmount — preserve that cleanup.

## Dependencies
### Internal
- `@renderer/assets/logos/brand/app.png` (logo)
- `@/renderer/services/i18n` (`changeLanguage`)
- `@renderer/components/layout/AppLoader`
- `../../hooks/context/AuthContext` (`useAuth`)

### External
- `react`, `react-i18next` (`useTranslation`), `react-router-dom` (`useNavigate`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
