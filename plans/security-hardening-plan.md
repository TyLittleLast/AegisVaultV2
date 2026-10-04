# AegisVault — Hardening « local-first » et crédibilité recruteur

> Ce document est la feuille de route d'`AegisVault`. Il accompagne le code et fait partie du
> repo à dessein : exposer son modèle de menace et ses décisions fait partie du travail.

## Contexte

AegisVault est un coffre-fort de mots de passe 100 % navigateur (React 18 + Vite + Tailwind + Web Crypto + hash-wasm), sans backend. L'utilisateur veut (a) l'utiliser personnellement et (b) le présenter à des recruteurs via un repo GitHub.

État actuel : les primitives cryptographiques sont correctes (Argon2id m=64 MiB/t=3/p=1, conforme RFC 9106 2e option ; clé AES non extractible ; canary type Bitwarden), mais le modèle de données ne chiffre que le mot de passe, la sécurité de session est incomplète, et le repo ne contient ni README, ni tests, ni linter.

**Décisions actées :**
- **Distribution : PWA pure, zéro backend.** Pas de Tauri/Rust. URL vivante déployée gratuitement.
- **HIBP : réseau, mais opt-in explicite.** Aucune requête automatique ; activé par un réglage. `connect-src` limité à `api.pwnedpasswords.com`.
- **Chiffrement par champ** (modèle Bitwarden), et non un blob JSON par entrée.
- **Tailwind v4 : oui. React 19 : différé** (18.3 est stable, aucun besoin fonctionnel — argument d'ingénierie assumé en entretien).

## Modèle de données cible

```ts
export interface EncryptedPayload { iv: string; ciphertext: string }

export interface KdfParams {
  algo: 'argon2id'; m: number; t: number; p: number; dkLen: 32
}

export interface VaultEntry {
  id: string
  // clair — strict minimum pour tri/affichage sans déchiffrer les mots de passe
  favorite?: boolean
  updatedAt?: string
  entropy?: number
  // chiffrés, champ par champ (comme Bitwarden)
  service: EncryptedPayload
  username: EncryptedPayload
  url?: EncryptedPayload
  password: EncryptedPayload
}

export interface VaultStore {
  v: 2
  kdf: KdfParams
  salt: string
  canary: EncryptedPayload
  entries: VaultEntry[]
}

export interface AppSettings {
  autoLockMinutes: number
  hibpEnabled: boolean
}
```

**Invariant central :** les mots de passe ne vivent jamais dans un état React global. Au déverrouillage, on ne déchiffre que `service` + `username` dans un `searchIndex`. Les mots de passe sont déchiffrés à la demande (panneau de détail) ou lors d'un audit explicitement déclenché par l'utilisateur.

## Phases

| Phase | Branche | Contenu |
|---|---|---|
| 0 | `chore/repo-hygiene` | `git init`, `.gitignore`, `LICENSE`, suppression code mort |
| 1-2 | `feat/per-field-encryption` | Modèle v2, chiffrement par champ, `searchIndex` |
| 3 | `feat/session-security` | Presse-papiers TTL, auto-lock inactivité, lock sur blur, limite d'échecs |
| 4 | `feat/master-password-rotation` | Changement de mot de passe maître |
| 5-6 | `feat/privacy-hardening` | Suppression favicon/CDN, UI honnête, CSP, `hibpService` robuste |
| 7 | `refactor/dry-and-modules` | `utils/password.ts`, hooks, découpage, `ErrorBoundary` |
| 8 | `test/vitest-suite` | Tests crypto, k-anonymat, URL, clipboard |
| 9 | `chore/tooling-and-ci` | ESLint 9, Prettier, CI |
| 10 | `build/tailwind-v4-vite-7` | Migration Tailwind v4 / Vite 7 |
| 11 | `feat/pwa-offline` | Manifest, service worker, `storage.persist` |
| 12 | `docs/threat-model-readme` | README, modèle de menace |

### Phase 0 — Hygiène du repo
- `git init`, `.gitignore`, `LICENSE` (MIT), `.gitattributes`, `.editorconfig`.
- Supprimer `src/components/VaultCard.tsx` (code mort, remplacé par `VaultRow`).
- Supprimer les exports de contournement du compilateur : `export { KeyRound, LockKeyhole }`, `export { ExternalLink, RefreshCw }`.
- `package.json` : ajouter `lint`, `typecheck`, `test`, `check`.

### Phase 1-2 — Noyau crypto + chiffrement par champ
- `src/types/vault.ts` : nouveau modèle ci-dessus.
- `cryptoService` : lire les params KDF depuis le store au lieu de constantes ; conserver le canary.
- Détection de format : si `stored.v !== 2`, message explicite + réinitialisation proposée. **Jamais de migration silencieuse.**
- `src/utils/url.ts` : `safeExternalUrl(raw)` — liste blanche `http:`/`https:`.
- Au déverrouillage : `searchIndex: Record<id, { service: string; username: string }>`. Aucun mot de passe déchiffré.
- `VaultDetailPanel` : déchiffre le mot de passe à l'ouverture de l'entrée.
- `HealthTab` : l'audit déchiffre au moment de l'action utilisateur.
- Export/import : document versionné + validation de schéma stricte.

### Phase 3 — Sécurité de session
Répond à la préoccupation « quelqu'un d'autre utilise l'ordi ».

- `src/utils/clipboard.ts` : `copySecret(value, ttlMs)` — écrit puis **écrase** le presse-papiers après le TTL.
- Auto-lock **basé sur l'inactivité réelle** — réarmer sur `pointerdown`/`keydown`/`wheel`/`touchstart`.
- Verrouillage sur `visibilitychange` (hidden) et `blur`.
- Limite d'échecs de déverrouillage : compteur persistant, blocage après N tentatives.
- `clearKey` documenté honnêtement comme best-effort (aucun zeroing réel en JS).

### Phase 4 — Changement de mot de passe maître
- Vérifier l'ancien, dériver une nouvelle clé + nouveau salt, re-chiffrer **tous** les champs, préserver `v`/`kdf`.
- Chemin de récupération documenté : exporter → changer → réimporter.

### Phase 5-6 — Vie privée et `hibpService`
- Supprimer `ServiceLogo.tsx` (envoie chaque domaine stocké à Google). Le remplacer par un monogramme local.
- Polices auto-hébergées ; supprimer l'`@import` CDN.
- Supprimer l'UI factice (étape e-mail, « mot de passe oublié », compte créé, `'0'` codé en dur).
- CSP stricte : `default-src 'self'; connect-src 'self' https://api.pwnedpasswords.com; object-src 'none'; base-uri 'none'`.
- `hibpService` : header `Add-Padding: true`, purge des lignes de padding, correspondance exacte du suffixe, cache par préfixe, `AbortSignal` + retry sur 429, point d'entrée unique.

### Phase 7 — Refactor / DRY
- `src/utils/password.ts` : `entropy()`, `grade()` (palette unique), `generate()` avec rejection sampling.
- `src/hooks/useIsMobile.ts` — casse le cycle d'import `App` ↔ `MainLayout`.
- Découper `App.tsx` et `MainLayout.tsx`. Un seul état `vault`. `ErrorBoundary` à la racine.

### Phase 8-12 — Tests, outillage, build, PWA, docs
- Vitest : crypto, k-anonymat (le mot de passe complet n'apparaît jamais dans l'URL), URL, clipboard.
- ESLint 9 flat config, Prettier 3, `noUncheckedIndexedAccess`, GitHub Actions.
- Tailwind v4 (`@theme`, plugin Vite) — **attention au renommage de l'échelle des shadows**.
- PWA : manifest, service worker (**shell seul, jamais le coffre**), `navigator.storage.persist()`.
- README avec modèle de menace explicite.

## Risques

| Risque | Traitement |
|---|---|
| Rupture de format du coffre (v1 → v2) | Détecter `v`, refuser proprement, proposer un reset |
| Renommage des shadows Tailwind v4 | Audit explicite ; sinon régression visuelle silencieuse |
| Le chiffrement par champ casse la recherche | Résolu par `searchIndex` ; ne pas régresser vers un état global de mots de passe |
| CSP qui casse HIBP | Valider `connect-src` contre une requête réelle |
| Service worker qui cache le coffre | Interdit : precache du shell seulement |
| L'auto-lock casse la démo | Compte à rebours visible ; ne pas verrouiller pendant une activité réelle |

## Validation

- `typecheck`, `lint`, `test`, `build` : tous verts.
- DevTools : **IndexedDB ne contient aucun mot de passe en clair**.
- DevTools : **zéro requête** avant activation du réglage HIBP ; ensuite seul `api.pwnedpasswords.com`.
- Manuel : coffre verrouillé muet ; changement de mdp aller-retour ; export → effacement → import ; déverrouillage hors-ligne ; presse-papiers vidé après TTL ; auto-lock après inactivité.

## Hors périmètre (décisions documentées)

- **React 19** — différé. 18.3 est stable et l'app n'utilise aucune fonctionnalité qui en dépend.
- **Tauri / Rust** — écarté. Diluerait le signal TypeScript.
- Multi-coffre, synchronisation, extension, autofill, biométrie.