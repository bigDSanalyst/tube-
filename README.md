# V2E Bitemporal Execution Studio

**"Don't just watch the tutorial. Step inside it."**

V2E is a zero-trust, multi-tenant interactive video platform. It turns static video tutorials into live, executable sandboxes. Viewers click inside a video, and instantly get a private, cryptographically verified Linux environment synchronized to the exact millisecond of the video.

## Repository Structure

- `backend/` — FastAPI orchestrator (v8 runtime + verified module cache)
- `src/` — React/TypeScript frontend (AI Studio prototype)

## Backend Setup

```bash
cd backend
mkdir -p secrets videos checkpoints manifests
# Place your Ed25519 public keys in secrets/
docker compose up --build
```

Open `http://localhost:8000`.

## License

AGPL-3.0. See `LICENSE` and `COPYRIGHT`. Contributions require the CLA in `CONTRIBUTING.md`.
