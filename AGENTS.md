# MultiChamber Agent Rules

## Build & Run Commands

- **Start container:** `docker compose up --build` (rebuild is mandatory)
- **Stop container:** `docker compose down`
- **All debugging must be done inside container:** Use `docker exec`

## Access Credentials

- **Port:** 8123
- **Username:** admin
- **Password:** qwe321

## Docker Operations

- Container name: `multichamber`
- Always rebuild on start: `--build` flag is required
- Execute commands in container: `docker exec multichamber <command>`
- No local execution - everything goes through container
