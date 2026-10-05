# Elata Docs

Source for the public Elata documentation at [docs.elata.bio](https://docs.elata.bio),
built with [Mintlify](https://mintlify.com).

This site is **public**: the guide to the whole Elata ecosystem for users,
builders, researchers, partners, investors, and community members. Only put
content here that is meant for the public. Internal plans, runbooks, and
maintainer workflows don't belong here, and pages must never link to or quote
private repositories.

## Structure

| Path | Tab | What it covers |
| --- | --- | --- |
| `overview/`, `resources/` | Overview | What Elata is, how it fits together, what's live, privacy, points, monetization, ELTA, science, and community |
| `users/` | Using Elata | Getting started, devices, the Score, your data, points, purchases, safety, help |
| `apps/` | Build Apps | Building, publishing, and operating apps on Elata, plus the platform APIs |
| `sdk/`, `integrate.mdx` and the other root device-integration pages | Elata SDK | The `@elata-biosciences/*` packages, guides, tutorials, and device integration |
| `archive/`, `open-source/`, `zorp-protocol/`, `home/elata-eeg/` | Archive | Earlier open-source projects and retired features |
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
| Elata platform behavior (upload, review, bridge, payments) | The public behavior of [app.elata.bio](https://app.elata.bio), confirmed with the Elata team |
| ELTA token | The public [ELTA](https://github.com/Elata-Biosciences/ELTA) repository |
| Science pages | Peer-reviewed literature, cited on each page |
| Capability status | [`overview/status.mdx`](overview/status.mdx), the single source of truth |

When behavior changes, update the matching page here in the same release.

## Writing guidelines

- Every page needs `title` and `description` frontmatter.
- Use root-relative links (`/apps/build/overview`), and add new pages to `docs.json`.
- Keep code samples runnable against the current published packages.
- Don't document unreleased features or internal processes.
- Label anything that isn't fully live: use `tag: "Experimental"`, `"Planned"`, or `"Archived"` in frontmatter, and keep [`overview/status.mdx`](overview/status.mdx) in sync.
- Call the platform **Elata**, not "the App Store", and the packages **the Elata SDK**.
- Moved or removed a page? Add a redirect in `docs.json` so old links keep working.

## License

See [LICENSE](LICENSE).
