# Security reports

## Report a problem privately

Do not post vulnerability details, access tokens, or steps to exploit a problem
in a public issue or pull request.

Open the repository's **Security** tab. If **Report a vulnerability** is
available, use it to send a private report:

[Report a vulnerability](https://github.com/deifos/Othello/security/advisories/new)

If private reporting is not available, use a private contact method listed on
the [maintainer's profile](https://github.com/deifos). If no private contact is
listed, open an issue that asks for a private reporting method. Include no
vulnerability details in that issue.

## What to include

- The affected version or commit and the service or file involved.
- The steps needed to reproduce the problem in a local test environment.
- The expected and actual results.
- The possible impact and a suggested fix, if known.

Remove real user data and credentials from the report. Use test accounts and
your own local services to reproduce the problem. Do not test against other
players or the public service without the maintainer's permission.

## Scope

Reports can cover the web app, PartyKit rooms, and practice ranking services.
Where possible, check whether the problem exists on the latest `main` commit.
This project does not have a long-term support policy or a fixed response time.

Practice rankings check legal move records. They do not prove who chose the
moves and are not competitive ratings. See the [README](README.md) for the
current limits of the game.
