# Elata Docs

Source for the public Elata documentation at [docs.elata.bio](https://docs.elata.bio),
built with [Mintlify](https://mintlify.com).

This site is **public**. Only put content here that is meant for external
builders, device makers, and users. Internal plans, runbooks, and maintainer
workflows live in the source repositories instead.

## Structure

| Path | Tab | What it covers |
| --- | --- | --- |
| `learn/`, `quickstart.mdx`, `elata-points.mdx`, `resources/` | Learn | What Elata is, how it works, privacy, points, FAQ, brand assets |
| `apps/` | Elata Apps | Building, publishing, and operating apps on the Elata App Store, plus the platform APIs |
| `sdk/`, `integrate.mdx` and the other root device-integration pages | Biometric SDKs | The `@elata-biosciences/*` packages, guides, tutorials, and device integration |
| `open-source/`, `zorp-protocol/`, `home/elata-eeg/` | Archive | Earlier open-source projects |
| `cn/` | (Chinese) | Chinese translation of the site |

Navigation for every tab lives in [`docs.json`](docs.json). A page that isn't
listed there isn't reachable from the site navigation.

## Preview locally

```bash
npm i -g mint
mint dev
```

Then open http://localhost:3000.

## Checks

The SDK repo ([elata-bio-sdk](https://github.com/Elata-Biosciences/elata-bio-sdk))
includes this repo as the `elata-docs` submodule and validates it:

```bash
# from elata-bio-sdk
pnpm docs:check
```

The check requires `title` and `description` frontmatter on navigated pages,
working internal links, and no duplicate navigation entries.

## Where facts come from

| Topic | Source of truth |
| --- | --- |
| SDK packages, templates, APIs | [elata-bio-sdk](https://github.com/Elata-Biosciences/elata-bio-sdk): package READMEs and `llms.txt` |
| App Store behavior (upload, review, bridge, payments) | [elata-appstore](https://github.com/Elata-Biosciences/elata-appstore) source |

When behavior changes in either repo, update the matching page here in the same
release.

## Writing guidelines

- Every page needs `title` and `description` frontmatter.
- Use root-relative links (`/apps/build/overview`), and add new pages to `docs.json`.
- Keep code samples runnable against the current published packages.
- Don't document unreleased features or internal processes.

## License

See [LICENSE](LICENSE).
