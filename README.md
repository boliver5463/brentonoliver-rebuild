# brentonoliver.com — rebuild

A rebuild of [brentonoliver.com](https://brentonoliver.com), built as a Jekyll static site
and deployed to **[rebuild.brentonoliver.com](https://rebuild.brentonoliver.com)**.

The site is a single-page marketing site for a freelance full-stack development
business: a video hero, services, feature highlights, a showcase of past builds,
pricing offers, and a contact form backed by an AWS Lambda function. A handful of
secondary pages (`/about/`, `/services/`, `/team/`, `/contact/`) are inherited from
the base theme and still carry placeholder content.

## Stack

| Layer          | Choice                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| Site generator | Jekyll 4.3 (Ruby)                                                         |
| Styling        | SCSS, compiled by Jekyll; Bootstrap 5.3 (reboot/grid/forms/utilities only) |
| JavaScript     | Vanilla — no build step. [Splide](https://splidejs.com/) via CDN for the offers carousel |
| Fonts          | Playfair Display via Google Fonts (a self-hosted `woff2` is bundled but commented out) |
| Contact form   | AWS Lambda Function URL + Amazon SES (`lambda/contact-form/`)              |
| Hosting        | Netlify (`netlify.toml`), custom domain via `CNAME`                       |
| Base theme     | [Jekyll Serif](https://github.com/zerostaticthemes/jekyll-serif-theme) by Zerostatic (MIT) |

## Quick start

Requires Ruby and Bundler. If you've never run Jekyll locally, follow the
[Jekyll installation docs](https://jekyllrb.com/docs/installation/) first.

```bash
bundle install                    # install gems
bundle exec jekyll serve          # dev server at http://localhost:4000
bundle exec jekyll build          # build into _site/
```

To build the way the host does (enables Google Analytics and other
production-only includes):

```bash
JEKYLL_ENV=production bundle exec jekyll build
```

## Project structure

```
_config.yml            Site settings: title, logo, collections, contact form endpoint
_data/                 Content that isn't a page
  builds.yml             Showcase of past client builds (cards on the home page)
  features.json          Feature/benefit tiles
  menus.yml              Header and footer navigation
  contact.yml            Email + phone shown in the footer
  seo.yml                Analytics ID and Twitter meta
  social.json            Social links in the footer
_includes/             Home-page sections and shared partials
_layouts/              default, home, page, contact, service(s), team(s)
_services/             "Services" collection (one Markdown file per service)
_team/                 "Team" collection (one Markdown file per person)
_sass/                 bootstrap/, components/, pages/, libraries/
assets/
  css/style.scss         Theme variables + the import manifest for all SCSS
  js/scripts.js          Mobile menu toggle + scroll-reveal observer
  videos/                Desktop and mobile hero background videos
images/                Logos, illustrations, feature icons, build screenshots
lambda/contact-form/   Contact form backend (excluded from the Jekyll build)
index.md, about.md, services.md, team.md, contact.md
```

### How the home page is composed

`_layouts/home.html` is an ordered list of includes:

```
interactive-navigation → hero-video → services → features → builds → offers → contact
```

Two conventions tie it together, both driven by JavaScript at runtime:

- **The side navigation builds itself.** `_includes/interactive-navigation.html`
  walks every `<section>` on the page and creates a link from its `id`, labelled
  with its `data-nav` attribute. To add a section to the nav, give it an `id` and a
  `data-nav` — there is no separate list to update.
- **Sections fade in on scroll.** `assets/js/scripts.js` adds a `.visible` class to
  each `<section>` as it enters the viewport; the animation itself lives in
  `_sass/components/_animations.scss`.

## Editing content

**Home page sections** are hand-written HTML in `_includes/`. The services tiles,
pricing cards, and hero copy are edited directly in `services.html`, `offers.html`,
and `hero-video.html`.

**Build showcase** — add an entry to `_data/builds.yml`:

```yaml
- company: "Muscle Nation"
  project: "Supplements & Apparel Storefront"
  year: "2023"
  url: "musclenation.org"
  theme: "commerce"          # drives the mock-browser preview styling
  image: "/images/builds/musclenation.png"
  logo: "/images/builds/musclenation-logo.png"
  accent: "#3f83f8"
  bg: "#0d0d0d"
  description: >
    A high-volume Shopify storefront rebuilt for speed and conversion.
  tags: ["Shopify Hydrogen", "React", "GraphQL"]
  metrics:
    - value: "+38%"
      label: "Mobile conversion"
```

**Services collection** — add `_services/<slug>.md`. Each entry gets its own page at
`/services/<slug>/`; `weight` controls ordering, and `home.limit_services` in
`_config.yml` caps how many appear on the home page.

```yaml
---
title: "AWS"
date: 2019-05-18T12:33:46+10:00
weight: 9
---
```

**Team collection** — add `_team/<slug>.md` with `title`, `image`, `jobtitle`,
`linkedinurl`, and `weight`.

**Navigation** — `_data/menus.yml` holds the `main` and `footer` menus. Entries use
anchor links (`#services`) because the site is primarily single-page.

## Styling

`assets/css/style.scss` is the entry point and does three things: defines the colour
and font variables, imports the slice of Bootstrap 5.3 the site actually uses, then
imports the project's own partials. Most Bootstrap components are deliberately left
commented out to keep the CSS small — uncomment an `@import` if you need one.

To add a component: create `_sass/components/_thing.scss` and add
`@import "components/thing";` to the manifest in `style.scss`. Output is compressed
(`sass.style: compressed` in `_config.yml`).

The accent colour is defined once at the top of `style.scss` (`$primary`) and flows
through buttons, links, and the build cards.

## Contact form

The form in `_includes/contact.html` POSTs JSON to an AWS Lambda Function URL, which
validates the payload and emails it via Amazon SES. There is no server and no
third-party form service.

```
contact form (browser) ──POST JSON──▶ Lambda Function URL ──▶ Amazon SES ──▶ inbox
```

The endpoint is configured in `_config.yml`:

```yaml
contact_form:
  endpoint: "https://<id>.lambda-url.<region>.on.aws/"
```

The Function URL is public by design, so it's safe to commit. Cloudflare Turnstile
support is built into the handler but **off by default** — setting the
`TURNSTILE_SECRET` environment variable on the Lambda turns it on, with no code
change, once the widget is re-added to the form.

Full deployment steps for the function (SES verification, IAM policy, environment
variables, Function URL and CORS) are in
**[`lambda/contact-form/README.md`](lambda/contact-form/README.md)**.

## Deployment

`netlify.toml` builds with `jekyll build`, publishes `_site/`, and pins
`RUBY_VERSION = 3.2.2` with `JEKYLL_ENV = production`. `CNAME` points
`rebuild.brentonoliver.com` at the deployed site.

Google Analytics is production-only (`_includes/google-analytics.html`). Set the
measurement ID as a `NETLIFY_GOOGLE_ANALYTICS_ID` environment variable on the host —
read at build time via the `jekyll-environment-variables` plugin — or fall back to
`google_analytics_id` in `_data/seo.yml`.

> Note: this site depends on `jekyll-environment-variables`, which is not on GitHub
> Pages' supported-plugins list. Deploying to GitHub Pages would require building via
> GitHub Actions rather than the built-in Pages builder, plus setting `baseurl` in
> `_config.yml` if served from a project path.

## Known placeholders

Carried over from the base theme and not yet replaced:

- `_services/*.md` and `_team/*.md` bodies are lorem ipsum; the team members and
  their photos are stock.
- `_data/builds.yml` is dummy showcase data.
- `_data/social.json` still links to Zerostatic's GitHub/Twitter.
- `_data/contact.yml` has a test email and placeholder phone number.
- `about.md`, `services.md`, `contact.md` and `team.md` carry theme copy, and
  `index.md`'s `description` front matter is still the theme's.
- `builtatlightspeed.json` describes the original theme, not this site.

## Credits & license

Built on **[Jekyll Serif](https://www.zerostatic.io/theme/jekyll-serif/)** by Robert
Austin / Zerostatic Themes, MIT licensed — see [`LICENSE`](LICENSE). The upstream
theme remains configured as the `upstream` git remote.

Asset credits from the base theme: illustrations by
[Icons8](https://icons8.com/illustrations/style--pixeltrue), stock photography by
[Unsplash](https://unsplash.com/), feature icons by
[Noun Project](https://thenounproject.com/) and [SVG Repo](https://www.svgrepo.com/).
