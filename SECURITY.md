# Security Policy — CSMatrix-zC

We take security seriously. If you discover a vulnerability in CSMatrix-zC, please follow the policy below so we can triage and address it safely.

## Project Overview

CSMatrix-zC - FuZZy ComManDer (AnAs.zC) is an open-source Discord bot project derived from TitanBot and customized for the CSMatrix-zC ecosystem.

The project is designed for self-hosted deployments. Maintainers do not operate or control third-party self-hosted instances and do not have access to their private data, configurations, credentials, or infrastructure.

Self-hosters are responsible for securing, configuring, and operating their own deployments.

## Reporting a Vulnerability

### Preferred Method

Please report security vulnerabilities privately through a GitHub Security Advisory:

https://github.com/AnAszC/Street_ZM-CS_Matrix-zC_v2/security/advisories

Do **not** open a public GitHub issue containing exploit details, credentials, tokens, or other sensitive information.

### Alternative Reporting

If you cannot use GitHub Security Advisories, open a private support request through the project's official GitHub repository:

https://github.com/AnAszC/Street_ZM-CS_Matrix-zC_v2

Do not publicly disclose sensitive vulnerability details before the issue has been reviewed.

If a problem appears to be caused by local configuration, infrastructure, or deployment settings, the instance owner should be contacted first.

## Response Timelines

We aim to handle security reports according to the following targets:

* **Acknowledgement:** within 72 hours
* **Initial triage and severity assessment:** within 7 days
* **Critical vulnerabilities:** target fix or mitigation within 7–14 days
* **High-severity vulnerabilities:** target fix within 30 days
* **Medium/Low-severity vulnerabilities:** addressed in a future release where appropriate

Public disclosure will normally be coordinated with the reporter after a fix or mitigation is available.

## Safe Testing Rules

Security researchers and contributors should:

* Only test systems they own or have explicit authorization to test.
* Do not access, extract, destroy, or modify private user data.
* Do not attempt to obtain Discord user tokens, direct messages, credentials, or other private content.
* Avoid disruptive testing against production systems.
* Provide minimal and safe proof-of-concept material where possible.
* Remove or redact tokens, passwords, API keys, personal information, and other sensitive data before submitting a report.
* Contact the maintainers before performing intrusive testing that could affect availability or data integrity.

## What to Include in a Security Report

Please include as much of the following information as safely possible:

* Affected component or file.
* Vulnerable command, endpoint, service, or feature.
* Clear and minimal reproduction steps.
* Expected behavior and actual behavior.
* Project version, release tag, commit SHA, or Docker image version.
* Deployment environment, including relevant Docker configuration where applicable.
* Proof of concept, logs, requests, or screenshots with sensitive information removed.
* Security impact, such as:

  * Data exposure
  * Authentication bypass
  * Privilege escalation
  * Remote code execution
  * Unauthorized command execution
  * Denial of service
* Suggested mitigation or fix, if known.
* Contact information for follow-up.

## Self-Hosted Security Incidents

If you operate a self-hosted CSMatrix-zC instance and believe it has been compromised:

1. Immediately rotate exposed secrets, including Discord bot tokens, database credentials, API keys, and webhook secrets.
2. Restrict public network access to affected services.
3. Preserve relevant logs and configuration files for investigation.
4. Do not publish secrets or sensitive logs publicly.
5. Update the affected software after a verified fix is available.
6. Review Discord permissions, database access, Docker configuration, and exposed network ports.
7. Report upstream vulnerabilities through a private GitHub Security Advisory when the issue appears to originate from project code.

The project maintainers can address vulnerabilities in the upstream project, but cannot directly rotate credentials, restore databases, or remediate independently operated third-party servers.

## Scope

### In Scope

Security reports involving:

* CSMatrix-zC source code
* Authentication and authorization flows
* Discord bot command handling
* Interaction and permission handling
* Web endpoints provided by the project
* Webhooks implemented by the project
* Database access and migrations
* Game Server Monitor components
* Dockerfiles and deployment scripts
* Sensitive information exposure caused by project code
* Security-impacting configuration included with the project
* GeoIP integration and API credential handling
* Improper handling or exposure of IPinfo API tokens

### Out of Scope

The following are generally outside the project's scope:

* Vulnerabilities in Discord itself
* Third-party hosting providers
* Third-party database providers
* Vulnerabilities in external services unrelated to project code
* Systems that you do not own or have explicit permission to test
* Local misconfiguration of an independently operated self-hosted instance
* Social engineering attacks against maintainers or users

Third-party vulnerabilities should be reported to the relevant service provider.

## Security Hardening for Self-Hosters

Recommended security practices include:

* Keep Discord bot tokens, database passwords, API keys, IPinfo API tokens, and other secrets out of Git repositories.
* Use environment variables or a dedicated secret-management system.
* Do not expose PostgreSQL directly to the public Internet.
* Restrict database access to trusted internal networks.
* Use strong database authentication and passwords.
* Use TLS for publicly exposed web endpoints and webhooks.
* Keep the operating system, Docker images, Node.js dependencies, and project dependencies updated.
* Enable GitHub Dependabot and security alerts where available.
* Enable secret scanning and push protection where available.
* Grant the Discord bot only the permissions and intents it actually requires.
* Rotate credentials immediately when compromise is suspected.
* Maintain regular PostgreSQL backups.
* Test database restores periodically.
* Monitor application logs for suspicious activity, unexpected configuration changes, unauthorized access, and mass deletions.

## Secrets and Environment Variables

CSMatrix-zC uses environment variables for sensitive configuration.

The following types of values must never be committed to GitHub:

* Discord bot tokens
* Database passwords
* API keys
* IPinfo API tokens
* Webhook secrets
* Private credentials
* Production `.env` files

### Local Environment

For local development, sensitive values should be stored in:

```text
.env
```

The repository should contain only the example configuration:

```text
.env.example
```

with placeholder values.

For example:

```env
IPINFO_TOKEN=your_ipinfo_token_here
```

The value above is only a placeholder and must not be replaced with a real production token in `.env.example`.

The real token belongs in the local `.env` file or in the secret/environment-variable system provided by the production host.

### Railway and Other Hosting Providers

When deploying CSMatrix-zC to a hosting provider such as Railway:

* Configure `IPINFO_TOKEN` through the provider's Variables/Secrets system.
* Do not commit the production `.env` file to GitHub.
* Do not hard-code the IPinfo token in JavaScript source files.
* Do not place the token in documentation, screenshots, issue reports, or public configuration examples.
* Rotate the token immediately if it is accidentally exposed.

## GeoIP and IPinfo

The Game Server Monitor uses IPinfo Lite for country-level IP geolocation.

The integration may send a Game Server IP address to the IPinfo API in order to determine country information.

The project stores the resulting country information in PostgreSQL so the GeoIP service does not need to be called during every Game Server monitoring cycle.

The application should use the API token through an environment variable:

```text
IPINFO_TOKEN
```

The token must never be embedded directly in source code.

Only the minimum GeoIP information required by the Game Server Monitor should be stored, such as:

* Country
* ISO country code
* Country flag

The Game Server Monitor currently displays country information in the compact format:

```text
🇲🇦 MA
```

IPinfo is a third-party service. Its availability, API behavior, rate limits, account controls, and privacy policies are outside the direct control of CSMatrix-zC maintainers.

Users should review the applicable IPinfo terms and policies for their deployment and use case.

## Disclosure and Credits

Security researchers who responsibly report vulnerabilities may be credited in release notes or security advisories, unless they request anonymity.

For significant vulnerabilities, the maintainers may coordinate disclosure with relevant security organizations or assign a CVE where appropriate.

## Privacy and Telemetry

CSMatrix-zC does not intentionally send usage telemetry or project data to the maintainers by default.

Self-hosted instances operate independently and maintainers do not receive data from those deployments.

The Game Server Monitor may contact the configured third-party GeoIP provider when GeoIP information is required.

Only the Game Server IP needed for the GeoIP lookup should be sent to the configured provider.

Any future telemetry feature must be clearly documented and should be transparent to users, including information about what is collected and how it can be disabled.

## Source and Attribution

CSMatrix-zC is derived from the TitanBot project.

Original project:

https://github.com/codebymitch/TitanBot

CSMatrix-zC project:

https://github.com/AnAszC/Street_ZM-CS_Matrix-zC_v2

Copyright and licensing information is provided in the project's `LICENSE` file.

## Contact

Preferred security reporting channel:

https://github.com/AnAszC/Street_ZM-CS_Matrix-zC_v2/security/advisories

Project repository:

https://github.com/AnAszC/Street_ZM-CS_Matrix-zC_v2

Thank you for helping keep CSMatrix-zC secure.
