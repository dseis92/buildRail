# Security Policy

BuildRail is governance tooling that reads and writes files in, and reports
on, software repositories. It can be given access to Git history, working
tree contents, and (in later phases) command execution for quality gates.
That makes careful handling of secrets and credentials a first-class
concern even during early, non-functional phases of the project.

## Rules for BuildRail itself and anything built on it

BuildRail, its CLI, its skills, and its adapters must never:

- expose secrets or credentials in output, logs, or reports
- log credential values, tokens, or API keys
- commit `.env` files or other files containing secrets
- include tokens, credentials, or secrets in handoff reports, verification
  reports, or evidence artifacts

If you find a place where this project's design or code risks any of the
above, treat it as a security issue, not a stylistic one.

## Reporting a vulnerability

Until a dedicated security contact is published, please open a private
GitHub security advisory on this repository if that feature is available
to you. If it is not available, open an issue that describes the class of
problem without including exploit details, and a maintainer will follow up
to establish a private channel.

Do not include working exploits, secrets, or sensitive data in public
issues.

## Supported versions

BuildRail is currently in its BR0 (Constitution) phase and has no released,
functional version. There is no supported-version table yet — this section
will be populated once BuildRail has shipped functional releases.
