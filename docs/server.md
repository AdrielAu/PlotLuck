# Server runbook (LinuxONE operator)

For the current **server operator**, one person at a time. Everything runs on the shared clone on the VM, `REPO=/home/linux1/shared/PlotLuck` (inside the Jupyter container: `~/shared/PlotLuck`). Set `REPO` in your SSH shell with `REPO=/home/linux1/shared/PlotLuck`; the other sections reuse it. Replace `<VM_IP>` with the VM address from the team chat. Never commit the IP, the Jupyter token or key fingerprints.

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
cd "$REPO"
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
cd "$REPO"
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

`data/full/` is git-ignored and exists only on the VM. Each dataset's source URL, licence and retrieval date are in `data/SOURCES.md`. Pull them on the server (the VM has outbound HTTPS), in a JupyterLab terminal:

```bash
cd ~/shared/PlotLuck
export PLOTLUCK_DATA=full
mkdir -p data/full     # data_dir() picks full only once this exists
nohup python -u -m plotluck.sources pull osm > data/full/osm_pull.log 2>&1 &
python -m plotluck.sources pull tripadvisor onspd p004 voa   # a few minutes
python -m plotluck.sources extract tripadvisor onspd p004 voa
python -m plotluck.sources pull census_age census_ethnicity census_sex tourism
python -m plotluck.sources extract census_age census_ethnicity census_sex tourism
# when osm_pull.log ends with "pulled osm":
python -m plotluck.sources extract osm
python -m plotluck.sources sample    # re-cuts data/sample/ from the extracts
```

Bundle version 2 requires all four new context extracts. Census extraction also reads `raw/onspd.zip` and its `msoa21` column; rerun the ONSPD pull if the raw archive is missing. Tourism uses its own tiled Overpass pull and can take as long as the restaurant pull. The new committed context fixtures remain synthetic even after `sample`; only a full-data build uses the real Census and tourism extracts. Retrain NN1 and rerun the x86 parity check after adding these inputs. [ADR 0005](adr/0005-district-demographics-and-tourism-context.md) records the geography approximations.

When publishing the full-data bundle to `web/models/`, replace the footer's sample-data notice in `web/index.html` with a description of the completed run. Keep the source attribution and geographic limitations.

Run `pull tripadvisor` and `pull voa` only here: ADR 0003 allows no laptop copies of the Tripadvisor file, the VOA licence bars passing its rows on, and `sample` writes made-up rows for both, never real ones. Pulls write the raw files and `raw/<name>.provenance.json`; extracts write `<name>_england.csv` and print row counts. With no names a step runs every source. The OSM pull queries the public Overpass server in 34 tiles, and it is limited by that server's load, not ours: allow 30 to 40 minutes. When a tile fails (often `HTTP Error 504: Gateway Timeout`, meaning the server is busy) it retries with growing waits, alternating with the maps.mail.ru mirror. If a tile still fails after six tries, the pull stops; run the same `pull osm` command again later and it resumes from that tile, because finished tiles stay in `data/full/raw/osm_tiles/` until the merge. To start OSM afresh instead, delete that folder first. `tail -f data/full/osm_pull.log` shows each tile (`-u` stops Python holding the lines back). The other pulls are about 1.2 GB in total. A completed pull replaces the files and the provenance, so commit the new sample and update `data/SOURCES.md` in a PR if anything changed. On s390x, pull and extract of tripadvisor, onspd and p004 ran on 2026-10-17 with the same row counts as the laptop run, voa gave 442,227 rows and osm 71,064 (after one resumed run), and `sample` re-cut the same row counts. If a host is blocked, download that file on a laptop, `scp` it to `data/full/raw/` and run only `extract`. Code picks the folder through `plotluck.data_dir()`; do not hard-code either path.

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
