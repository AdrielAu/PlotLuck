# Server runbook (LinuxONE operator)

For the current **server operator**, one person at a time. Everything runs on the shared clone at `/home/linux1/shared/PlotLuck` on the VM (inside the Jupyter container: `/home/ibm-user/shared/PlotLuck`). Replace `<VM_IP>` with the VM address from the team chat. Never commit the IP, the Jupyter token or key fingerprints.

## Rules of the shared clone

- One clone, operator only. No coding agent works in it and there are no git hooks on the VM. Agents fix Linux bugs from a laptop clone on `fix/linux-<slug>`.
- Never edit a notebook in two tools at once; the last save silently wins.
- Tool split: SSH FS to edit files, JupyterLab to run notebooks, the SSH terminal for git.

### Never, in the shared clone

- `git clean -x` or `git clean -X`: wipes git-ignored `data/full/` and checkpoints.
- `git push --force`.
- `git reset --hard`, `git checkout -- .` or `git stash drop` without running `git status` first.

## 1. Reach JupyterLab (SSH tunnel)

Port 38888 stays closed on the VM. Open a tunnel from your laptop and leave it running:

```bash
ssh -L 38888:localhost:38888 linux1@<VM_IP>
```

Then browse to `http://localhost:38888`. The token is the team's shared one (ask in the chat); it is harmless to the outside because nothing is exposed.

## 2. Edit files with SSH FS

Install `Kelvin.vscode-sshfs` (the repo recommends it in `.vscode/extensions.json`). It uses SFTP, so it works on s390x where Remote-SSH does not. Add a config in your **user** settings (`settings.json`), not the repo:

```json
"sshfs.configs": [
  {
    "name": "linux1",
    "host": "<VM_IP>",
    "port": 22,
    "username": "linux1",
    "root": "/home/linux1/shared/PlotLuck"
  }
]
```

Use the extension's "Add as Workspace Folder" on `linux1`.

## 3. Git in the SSH terminal

```bash
ssh linux1@<VM_IP>
cd /home/linux1/shared/PlotLuck
git status
git pull
```

Set the author at the start of **every** session (the clone is shared, so do not leave the previous operator's identity):

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

## 4. One-time: write deploy key

Skip if `~/.ssh/plotluck_deploy` already exists on `linux1`. The key is write-enabled and scoped to this repo only.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/plotluck_deploy -N "" -C "plotluck-linux1"
cat ~/.ssh/plotluck_deploy.pub
```

A repo admin adds the printed public key at GitHub: repo Settings, Deploy keys, "Allow write access". Then:

```bash
cat >> ~/.ssh/config <<'CONF'
Host github.com
  IdentityFile ~/.ssh/plotluck_deploy
  IdentitiesOnly yes
CONF
cd /home/linux1/shared/PlotLuck
git remote set-url origin git@github.com:AdrielAu/PlotLuck.git
ssh -T git@github.com
```

The last command should greet the repo, not refuse. Never paste the private key or its fingerprint into the repo, issues or screenshots.

## 5. Editable install in the container

Once, and again whenever the container is recreated. In a JupyterLab terminal (user `ibm-user`):

```bash
cd ~/shared/PlotLuck
pip install -e .
```

Unverified: whether `/opt/venv` is writable by `ibm-user`. If the command fails with a permission error, use the fallback:

```bash
pip install --user -e .
```

Check it worked: `python -c "import plotluck; print(plotluck.__file__)"` should print a path under `shared/PlotLuck/src`. `pip install -r requirements.txt` should be a no-op; anything it installs is a new package or a pin mistake.

## 6. Where `data/full/` comes from

`data/full/` is git-ignored and exists only on the VM. Each dataset's source URL, licence and retrieval date are in `data/SOURCES.md`. Download them on the server into `/home/linux1/shared/PlotLuck/data/full/` (the VM has outbound HTTPS). Unverified: `data.london.gov.uk` returned 403 to a plain Python client, probably the default User-Agent; retry with `curl -A "Mozilla/5.0" -O <URL>`, or download on a laptop and `scp` it over. Code picks the folder through `plotluck.data_dir()`; do not hard-code either path.

## Branches and PRs

- The server may push any branch except `main` (a GitHub ruleset blocks `main`: PR required, no force-push, no deletion, no bypass).
- `fix/linux-<slug>`: server-only fixes. `run/<yyyy-mm-dd>-<step>`: committed `runs/` results and `web/models/` weights.
- Open PRs from GitHub's web UI; the server needs no `gh`.
- Linux bug: file a `linux-only` issue with the traceback, then `git fetch && git switch fix/linux-<slug>`, rerun in JupyterLab, repeat until it passes.

## Handover

Before leaving the clone to the next operator, in person:

1. On `main` (`git switch main`).
2. Clean tree: `git status` shows nothing to commit.
3. Nothing unpushed: `git status` shows up to date with `origin/main`; other local branches are pushed.
4. All kernels stopped (JupyterLab: Kernel, Shut Down All Kernels).

The next operator starts with `git status` and `git pull`, then sets their git author.
