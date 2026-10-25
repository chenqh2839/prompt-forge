# Asset Provenance

This file records the current source and license status of non-code assets that
are tracked in the repository.

> Status: the owner stated on 2026-10-25 that the app identity assets and
> built-in templates were created with Codex assistance, but could not confirm
> whether any material is substantially similar to a third-party work. This is
> not proof of originality or non-infringement, and independent review is still
> required before public release.

## App identity assets

| Asset | Source in repository | Current status | Required action |
|---|---|---|---|
| `source/src-tauri/icons/app-icon.svg` | SVG source stored with the project | Owner reports Codex-assisted generation; third-party similarity is unknown | Run similarity review or replace it |
| `source/src/components/BrandMark.tsx` | Inline SVG authored in the component | Owner reports Codex-assisted generation; third-party similarity is unknown | Run similarity review or replace it |
| Generated desktop and mobile icon variants | `source/src-tauri/icons/` | Appear to be generated from the project icon; generation record is incomplete | Verify the generation source and preserve the build procedure |

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
| `source/src/lib/templates.ts` | Owner reports Codex-assisted generation; third-party similarity is unknown | Compare distinctive passages and replace any unverified material |
| `source/src/lib/variableWorkflows.ts` | Owner reports Codex-assisted generation; third-party similarity is unknown | Compare distinctive passages and replace any unverified material |
| System instructions and examples in `source/src-tauri/src/lib.rs` | Owner reports Codex-assisted generation; third-party similarity is unknown | Compare distinctive passages and replace any unverified material |

Before public release, compare distinctive passages with external prompt
collections and reference sources. Record the review date, reviewer, and
evidence location. Replace any passage that cannot be authorized.

## Similarity review log

On 2026-10-25, exact-text searches of public GitHub code were performed for six
distinctive template phrases and the two inline SVG path signatures in
`app-icon.svg` and `BrandMark.tsx`. No exact matches were returned.

This is only a limited text/code search. It does not cover the general web,
books, paid prompt collections, deleted repositories, private repositories, or
visual similarity against icons found elsewhere. It is not proof that the assets
are original or non-infringing.

## Release rule

If the owner cannot confirm ownership or redistribution rights for an asset,
replace it with a newly authored or clearly licensed alternative before changing
the repository to public.
