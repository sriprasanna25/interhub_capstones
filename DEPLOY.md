# Deploy to Render (free)

1. Create a GitHub repo and push this folder:
   ```bash
   git init && git add . && git commit -m "InternHub capstone"
   git branch -M main
   git remote add origin https://github.com/<you>/internhub.git && git push -u origin main
   ```
2. On https://render.com choose **New > Blueprint**, connect the repo, and approve. `render.yaml` configures the Docker build, health check (`/healthz`) and `TRUST_PROXY=true`.
3. When the deploy turns green, open the URL and check:
   - `https://<app>.onrender.com/healthz` returns `{"status":"ok",...}`
   - `https://<app>.onrender.com/readyz` returns `{"status":"ready"}`
   - Submit a test application from your phone.
4. Paste the live URL into the README table at the top.

**Free tier notes.** The service sleeps after inactivity (first request takes about 30 seconds) and the SQLite file resets on redeploy. Open the URL right before recording your video.

**Other hosts.** The Dockerfile works unchanged on Fly.io, Railway, or any Docker host. Always set `TRUST_PROXY=true` behind a proxy and mount a volume at `/data` for durable data.

**Run the container locally**
```bash
docker build -t internhub . && docker run -p 3000:3000 internhub
```
