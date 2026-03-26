# Contributing to agent2go

Thanks for your interest in contributing! This guide covers how to report issues, add models, and submit pull requests.

## Reporting Bugs

Open a [Bug Report](../../issues/new?template=bug-report.yml) issue. Include your GPU, config, and any relevant logs.

## Requesting Features

Open a [Feature Request](../../issues/new?template=feature-request.yml) issue. Describe the use case and proposed solution.

## Adding Models

The model registry is community-driven. See the full guide in [docs/contributing-models.md](docs/contributing-models.md) for how to add a model via issue or PR.

Quick version:

1. Run the model on an agent2go pod
2. Export with `a2go registry export --format issue`
3. Open a [New Model Issue](../../issues/new?template=new-model.yml) and paste the config

## Development Setup

### Site (web configurator)

```bash
cd site
npm install
npm run dev        # Start dev server
npm run validate   # Validate model configs
npm run validate:hf  # Also check HuggingFace repos exist
```

### Docker image

```bash
docker build -f Dockerfile.unified -t a2go .
```

See [AGENTS.md](AGENTS.md) for architecture context and codebase structure.

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add a changeset describing the change:
   ```bash
   npx changeset
   ```
4. Run validation if you touched model configs:
   ```bash
   cd site && npm run validate
   ```
5. Open a PR against `main`

### When to add a changeset

Include a changeset for model additions, engine changes, bug fixes, and new features. Skip it for docs-only or CI-only changes.

### What makes a good PR

- Keep changes focused — one logical change per PR
- Include test evidence for model additions (VRAM usage, health checks)
- Reference any related issues

## Code of Conduct

Be respectful and constructive. We're building this together.
