# Local development environment

This repository is built locally on the host at `/cortex` and synchronized with
GitHub as `ollehillbom1/cortex`. Treat this file as host-specific guidance; it
contains no credentials or network details.

## Host profile

- OS: Ubuntu 26.04 LTS, x86_64, kernel `7.0.0-28-generic`
- Hardware: Intel Core Ultra 9 285HX (20 logical CPUs), 61 GiB RAM
- Storage: local ext4 filesystem; about 64 GiB was free on `/` when this file
  was created. Avoid large, unbounded build artefacts and caches.
- Environment: bare metal (not a VM/container).
- GPU: no NVIDIA tooling is installed; do not assume GPU or CUDA availability.

## Installed build tooling

- Git 2.53
- Node.js 26.4.0, npm 11.17.0, pnpm 11.0.8, Yarn 1.22.22
- Python 3.14.4
- Docker Engine 29.1.3 (daemon reachable by the current user)
- GNU Make 4.4, GCC 15.2, Go, Rust 1.95, and OpenJDK 21

## Working conventions

- Work only inside `/cortex`; do not write generated artefacts outside the
  repository unless a tool requires a temporary directory.
- Detect the project's chosen package manager from its lockfile. Do not add or
  replace lockfiles merely to select a package manager.
- Keep dependencies and build tooling compatible with the installed versions.
  Prefer repository-local tool configuration over global installs.
- Before making a change, inspect the current branch and `git status`; other
  agents may update the GitHub repository concurrently.
- Do not add secrets, tokens, private addresses, or machine-specific paths to
  version control. Use documented environment-variable names and a committed
  `.env.example` when configuration is needed.
- Run the smallest relevant format, type-check, test, and build commands before
  declaring a change complete. Record any commands that could not be run.

## Useful checks

```bash
git status --short --branch
free -h
df -h /cortex
docker info --format '{{.ServerVersion}}'
```
