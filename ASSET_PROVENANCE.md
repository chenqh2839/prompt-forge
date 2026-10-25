# Asset Provenance

This file records the current source and license status of non-code assets that
are tracked in the repository.

> Status: owner confirmation is still required before the repository is made
> public. This file is a review record, not evidence that ownership has already
> been independently proven.

## App identity assets

| Asset | Source in repository | Current status | Required action |
|---|---|---|---|
| `source/src-tauri/icons/app-icon.svg` | SVG source stored with the project | Project ownership and original creation record not yet documented | Owner must confirm authorship or replace it |
| `source/src/components/BrandMark.tsx` | Inline SVG authored in the component | Project ownership and original creation record not yet documented | Owner must confirm authorship or replace it |
| Generated desktop and mobile icon variants | `source/src-tauri/icons/` | Appear to be generated icon variants; generation record not documented | Confirm the source/generation process and record it here |

The generated icon set does not contain an OpenAI, DeepSeek, Anthropic, Claude,
or Ollama logo based on repository inspection. That inspection does not prove
the originality of the Prompt Forge icon itself.

## Icons from dependencies

`lucide-react` is used for interface icons and is distributed under the ISC
License. Its dependency and license information is included in
`THIRD-PARTY-NOTICES.md`.

## Fonts

No WOFF, WOFF2, TTF, or OTF font files are committed to the repository.

The user interface requests operating-system fonts, including Segoe UI,
Microsoft YaHei, PingFang SC, and Consolas. These fonts are not redistributed by
Prompt Forge.

## Images and screenshots

No independent photographs, stock images, external illustrations, or committed
application screenshots were found during the source audit.

Before adding screenshots in the future, remove usernames, filesystem paths,
account details, API keys, private prompts, and unrelated third-party content.
Strip image metadata and record the screenshot author and license.

## Built-in text and templates

| Source | Current status | Required action |
|---|---|---|
| `source/src/lib/templates.ts` | No third-party source citation is present; originality not independently verified | Owner must confirm or replace affected text |
| `source/src/lib/variableWorkflows.ts` | No third-party source citation is present; originality not independently verified | Owner must confirm or replace affected text |
| System instructions and examples in `source/src-tauri/src/lib.rs` | No third-party source citation is present; originality not independently verified | Owner must review and confirm authorship |

Before public release, compare distinctive passages with external prompt
collections and reference sources. Record the review date, reviewer, and
evidence location. Replace any passage that cannot be authorized.

## Release rule

If the owner cannot confirm ownership or redistribution rights for an asset,
replace it with a newly authored or clearly licensed alternative before changing
the repository to public.
