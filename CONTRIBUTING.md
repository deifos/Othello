# Contributing to Flip Buddies

Bug reports, documentation fixes, and code changes are welcome. For a large
feature, open an issue first to discuss the scope.

## Set up the project

1. Install Node.js 24 and npm.
2. Fork the repository and clone your fork.
3. Create a branch for your change.
4. Run these commands from the repository root:

```sh
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The development command
starts the web app, the local ranking API on port 3001, and PartyKit on port
1999. Local development does not need a hosted service or a deployment account.

The defaults work without an environment file. For custom service addresses,
copy `.env.example` to `.env.local` and set the values there. Keep local data,
environment files, and credentials out of commits.

See the [README](README.md), [multiplayer guide](docs/multiplayer.md), and
[ranking server guide](server/README.md) for more details.

## Check your change

```sh
npm test
npm run build
```

The test command runs the automated tests. The build command checks TypeScript
and creates the production web app. GitHub Actions runs both checks for pull
requests and pushes to `main`.

For a behavior change, add or update a test that checks the expected result.
For a screen change, check the desktop and phone layouts, keyboard controls,
and reduced motion setting. Include a screenshot when it helps explain the
change. For multiplayer changes, test with two separate browser profiles;
tabs in one profile share the same player seat.

## Keep changes clear

- Keep each pull request focused on one problem or feature.
- Follow the TypeScript and React patterns in nearby files.
- Keep game rules in the shared rule engine so clients and servers agree.
- Update the relevant documentation when setup or behavior changes.
- Use npm and commit `package-lock.json` when you change dependencies.
- Include the source and permission to redistribute any new artwork or audio.

## Report a bug

Include the steps to reproduce the problem, expected and actual results,
browser and operating system, and any relevant error message. Remove private
data, tokens, and room seat keys from screenshots and logs.

For security problems, follow [SECURITY.md](SECURITY.md) instead of posting the
details in a public issue.

## Open a pull request

Describe the problem, the resulting behavior, and how you checked the change.
Link the related issue, if there is one. State which checks passed and list any
known limits. Keep review comments respectful and specific.
