# Security Policy

## Supported versions

Security fixes are provided for the latest published release on a best-effort
basis. The current source snapshot is Prompt Forge v0.10.1, targeting Windows
10/11 x64.

Only Windows x64 has completed install, launch, and uninstall smoke testing.
macOS and Linux have source and CI build coverage but no real-machine runtime
validation.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Advisories** and create a private security advisory.
3. Describe the affected version, platform, impact, and reproduction steps.
4. Do not include real API keys or unrelated personal data.

If private vulnerability reporting is not enabled, contact the repository owner
through the GitHub profile without posting technical details publicly and ask
for a private reporting channel.

Please do not disclose exploitable details in a public issue before a fix is
available.

## If a secret was exposed

Revoke or rotate the affected credential at the provider first. Removing a file
or creating a new commit does not remove the value from Git history, forks,
caches, logs, or search indexes.

For Prompt Forge:

1. Remove the API key from the application's model settings.
2. Revoke the key in the provider console.
3. Issue a new key if needed.
4. Report the storage location and exposure date without sending the key.

## Security scope

Relevant reports include:

- Exposure of API keys or local user data.
- Tauri capability, CSP, command validation, or filesystem boundary issues.
- SQLite migration or export data leaks.
- Attachment parser boundary issues.
- Supply-chain or release artifact integrity problems.
- Vulnerabilities in dependencies when they are reachable in Prompt Forge.

Provider outages, generated prompt quality, and content produced by a
third-party model are normally outside this security policy, unless they reveal
a vulnerability in Prompt Forge itself.

## Response

Reports are triaged on a best-effort basis. This project does not provide a paid
support SLA. Validated reports may result in a patched release, an advisory, and
a dependency update.
