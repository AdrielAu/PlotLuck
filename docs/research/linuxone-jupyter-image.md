# LinuxONE jupyter-lab-ml image: contents and constraints

Resolves research ticket #7 (map #3). Researched 2026-10-17. Feeds capture task #8.

Legend: **[V]** verified in a primary source (cited). **[I]** inferred, check with the capture checklist at the end.

Primary sources:
- S1: [jupyter-lab-ml README](https://github.com/linuxone-community-cloud/jupyter-lab-ml/blob/main/README.md)
- S2: [packages.txt](https://github.com/linuxone-community-cloud/jupyter-lab-ml/blob/main/packages.txt) (a `pip freeze`-style list kept in the repo, not necessarily the live image)
- S3: notebooks `Fraud_LSTM_Keras_TF.ipynb`, `Digit_Class_TensorFlow.ipynb`, `Churn_Scikit_PyTorch.ipynb` in the same repo
- S4: [VS Code Remote-SSH requirements](https://code.visualstudio.com/docs/remote/linux)
- S5: [VS Code Jupyter kernel management](https://code.visualstudio.com/docs/datascience/jupyter-kernel-management)
- S6: [GitHub: about remote repositories](https://docs.github.com/en/get-started/git-basics/about-remote-repositories)

## Corrections to PROJECT.md

- **The container user is `ibm-user`, not `jovyan`.** The README mounts `/home/linux1/shared` at `/home/ibm-user/shared` [V, S1]. `PROJECT.md` and map #3 say `/home/jovyan/shared`; fix them unless the live capture shows otherwise.
- **Snap ML is not in the image** [V, S2: no `snapml` package]. Do not plan on it.
- **onnx-mlir / IBM Z Deep Learning Compiler is not in the image** [V, S2: absent; not mentioned in S1/S3]. `onnxruntime` is also absent from `packages.txt` [V, S2]; only `onnx`, `skl2onnx`, `tf2onnx` are there.

## Image

| Fact | Value | Status |
|---|---|---|
| Image | `registry.linuxone.cloud.marist.edu/l1cc/jupyterlab-image-s390x:latest` (only tag shown is `latest`, so it can change under us) | V, S1 |
| Run command | `docker run --network host --name notebook -v /home/linux1/shared:/home/ibm-user/shared -d <image>`; may need `--security-opt seccomp=unconfined` | V, S1 |
| Docker, not Podman | README installs Docker via get.docker.com | V, S1 |
| Port / token | Jupyter on 38888 (host networking); default token `Your_Token1`, changed via `--ServerApp.token=...`; also shows `--ip=0.0.0.0 --ServerApp.port=38888 --ServerApp.allow_origin='*'` | V, S1 (README is unclear whether these args go on `docker run`) |
| Firewall | `sudo iptables -I INPUT -p tcp --dport 38888 -j ACCEPT` | V, S1 |
| VM OS | Ubuntu 24.04 ("Ubuntu 24.04-Datathon" image), event code SSF2026; RHEL 9.8 variant in `README_RHEL.md` | V, S1 |
| Python | **3.12**, venv at `/opt/venv` (zDNN check cell globs `/opt/venv/lib*/python3.12/site-packages/...`). Notebook metadata says 3.10.12, which is stale. | I (from S3 path; confirm with `python -V`) |
| Upload limit | 200 MB via the Jupyter web UI; `scp` for bigger or many files | V, S1 |

## Preinstalled ML packages (from S2; confirm against live `pip freeze`)

| Package | Version |
|---|---|
| torch | 2.11.0+cpu |
| torch_nnpa | 1.5.0+gite861108 (IBM Z NNPA backend for PyTorch) |
| tensorflow / keras | 2.18.1 / 3.14.0 |
| ibm-zdnn-plugin | 2.3.0 (TensorFlow plugin using zDNN/NNPA) |
| xgboost | 3.4.1 |
| scikit-learn | 1.9.0 |
| onnx / skl2onnx / tf2onnx | 1.22.0 / 1.20.0 / 1.17.0 |
| numpy / scipy / pandas | 2.0.2 / 1.13.1 / 3.0.6 |
| jax | 0.4.7 (odd, old) |
| llama_cpp_python, transformers | 0.3.36 / 5.19.0 (not used by the product) |
| jupyterlab | 4.6.4 |
| pypmml, sklearn2pmml | 1.5.8 / 0.133.1 |

Status: versions [V, S2] as published in the repo; whether the pulled `latest` image matches is [I]. Note: some pins in S2 look odd (e.g. dates like `fsspec==2026.9.0`), so treat S2 as a snapshot and verify live. NNPA is a hardware feature of Telum II (z17) per S1; whether our VM's LPAR exposes it is [I] and the capture checklist tests it.

Implications for us:
- Pin `requirements.txt` to these versions (numpy 2.0.2, TF 2.18.1, Keras 3.14.0, torch 2.11.0).
- For the Pages site, ONNX export is feasible from TF (`tf2onnx`, opset 13 used in S3) or Keras; torch has built-in export (needs `onnx`, present).
- Cannot run exported ONNX in-container with onnxruntime unless it is pip-installed [I; see internet below].

## How "accelerated inference" is benchmarked in IBM's own notebooks

- Accelerated means TensorFlow ops dispatched to the NNPA via `ibm-zdnn-plugin`'s `_z_ops.so` [V, S3 Fraud and Digit notebooks]. The notebook cell checks the plugin version with `importlib.metadata.version('ibm-zdnn-plugin')`, checks that `.../tensorflow/core/kernels/_z_ops.so` exists, prints `tf.config.list_physical_devices()`, warms up the model (first call compiles the graph), then times repeated `model(sample, training=False)` calls with `time.perf_counter()` and reports the **median ms** [V, S3].
- No env vars or flags are set in those cells; acceleration is automatic when the plugin loads and hardware is present [V that no flags appear in S3; behaviour I].
- The PyTorch path (`torch_nnpa`) is not exercised in the churn notebook [V, S3]; its usage API is unknown [I]. Check `torch_nnpa` docs/`dir()` on the VM.
- No CPU-vs-NNPA comparison is in the notebooks. To claim "acceleration" we must run the same model with the plugin disabled/unavailable and compare [I, recommendation]. How to disable (e.g. uninstall plugin or an env var) is unknown; look at the plugin's README on the VM (`pip show -f ibm-zdnn-plugin`).
- Snap ML and onnx-mlir are not part of this flow [V, see corrections].

## Internet and pip

- README FAQ 9 tells users to install missing PyPI packages from a notebook with `!{sys.executable} -m pip install <pkg>` [V, S1]. This implies pip and outbound internet work in the container [I]. The container uses `--network host` [V], so it shares the VM's network.
- Not stated anywhere: whether outbound HTTPS to non-PyPI hosts (GitHub, data sites) is open [unknown; capture checklist tests it]. s390x wheels for some packages may be missing on PyPI and then need compiling [I].

## Shared folder, UID and ownership

- Host `/home/linux1/shared` <-> container `/home/ibm-user/shared` [V, S1]. The Jupyter file browser shows it as `shared`.
- The container user must be UID 1000 to write; FAQ 6 says "the user with uid 1000 has write access" [V, S1]. `linux1` is the host login user and is very likely UID 1000 [I; checklist prints `id`].
- If uploads fail: `sudo chown linux1:linux1 /home/linux1/shared && sudo chmod a+w /home/linux1/shared` [V, FAQ 16]. README also creates it with `mkdir shared && chmod a+w shared` [V].
- Implication: files created by Jupyter in `shared` are owned by UID 1000 on the host, which is `linux1` if that is UID 1000, so `git` run as `linux1` on the host sees them as its own. If the UIDs differ, git will warn about "dubious ownership"; fix with `git config --global --add safe.directory /home/linux1/shared/PlotLuck` [I].
- Git should be run on the host (as `linux1`), cloning into `/home/linux1/shared`; the container sees it as `/home/ibm-user/shared/PlotLuck` [I]. Whether the container image has `git` is unknown.

## VS Code Remote-SSH on s390x

- Microsoft's supported-hosts list covers x86-64, ARM and so on; **s390x is not listed** [V, S4]; no mention at all.
- Third-party reports say Remote-SSH fails on s390x with `UnsupportedArch`, because the VS Code server isn't built for s390x; tracked as microsoft/vscode-remote-release #6994 [I: only seen via a Red Hat ticket CRW-9704 and an IBM Community post; I did not open #6994 itself]. Treat as **not supported**.
- Plan around it: edit locally (Windows) and use git; use the browser JupyterLab on :38888 and the SSH terminal on the VM.

## VS Code Jupyter extension to the remote server

- Supported: "Select Another Kernel" > "Existing Jupyter Server" > enter `http://<ip>:<port>/?token=<token>` [V, S5]. The server must allow origin `*` and listen on `0.0.0.0` [V, S5], which matches the README's launch args [V, S1].
- So VS Code on a laptop can open a `.ipynb` and use the kernel on LinuxONE via `http://<VM-public-IP>:38888/?token=Your_Token1` [I, composed from S1+S5; not tested]. Caveats [I]: notebooks open on the laptop are local files, so use `shared`-relative paths and data paths that exist on the server; the token is shared by the whole team and sent over plain HTTP. Whether the container was started with `allow_origin='*'` is unknown (checklist prints the process args).

## Git credentials on the VM

- GitHub no longer accepts account passwords over HTTPS; HTTPS needs a personal access token, SSH needs a key registered on the account [V, S6].
- For a shared VM, recommended: a **fine-grained PAT scoped to the one repo, contents read/write**, short expiry, stored with `git config credential.helper 'cache --timeout=28800'` rather than saved on disk; or a **repo deploy key** (read-only unless write is enabled) [I; deploy keys are not covered by S6]. Do not put a personal SSH private key on a shared VM. The server operator mostly needs read (`git pull`); push is only needed for `fix/linux-*` branches.
- Outbound access to github.com from the VM is untested [I; checklist tests it].

## Command checklist for task #8 (copy-paste, in order)

Do the steps in order. Paste the output of each block into the issue/evidence folder. Lines starting with `#` are comments; you can paste them too.

### A. On your laptop: connect

```bash
ssh -i <your-key>.pem linux1@<VM-public-IP>
```

### B. On the VM host (you are now `linux1`)

```bash
echo "=== host: date/user ===" ; date -u ; whoami ; id
echo "=== host: os ===" ; cat /etc/os-release
echo "=== host: lscpu ===" ; lscpu
echo "=== host: arch / endianness ===" ; uname -a ; lscpu | grep -i "byte order"
echo "=== host: memory / disk ===" ; free -h ; df -h /home/linux1
echo "=== docker ps ===" ; docker ps -a
echo "=== docker images ===" ; docker images --digests
echo "=== container run config ===" ; docker inspect notebook --format 'Image={{.Config.Image}}{{"\n"}}User={{.Config.User}}{{"\n"}}Cmd={{.Config.Cmd}}{{"\n"}}Entrypoint={{.Config.Entrypoint}}{{"\n"}}Mounts={{json .Mounts}}{{"\n"}}NetworkMode={{.HostConfig.NetworkMode}}{{"\n"}}SecurityOpt={{.HostConfig.SecurityOpt}}'
echo "=== container process args (token, allow_origin) ===" ; docker top notebook -eo pid,user,args
echo "=== shared folder perms ===" ; ls -ldn /home/linux1/shared ; ls -la /home/linux1/shared
echo "=== host git ===" ; git --version
echo "=== firewall 38888 ===" ; sudo iptables -L INPUT -n | grep 38888
echo "=== is NNPA exposed on host? ===" ; grep -i -E "nnpa|dfltcc" /proc/cpuinfo | head -3 ; lscpu | grep -i flags
echo "=== outbound internet from host ===" ; curl -sS -o /dev/null -w "github %{http_code}\n" https://github.com ; curl -sS -o /dev/null -w "pypi %{http_code}\n" https://pypi.org/simple/numpy/
```

If `docker inspect notebook` says no such object, the container has another name: run `docker ps -a` and replace `notebook` with the NAME shown.

### C. Open a shell inside the container

```bash
docker exec -it notebook bash
```

(If bash is missing, use `sh`.) You are now inside the container. Run:

```bash
echo "=== container: user ===" ; whoami ; id ; echo $HOME ; pwd
echo "=== container: os/arch ===" ; cat /etc/os-release ; uname -m ; python3 -c "import sys;print(sys.byteorder)"
echo "=== container: python ===" ; which python python3 pip ; python -V ; pip -V
echo "=== container: pip freeze ===" ; pip freeze
echo "=== container: shared mount ===" ; ls -ldn $HOME/shared /home/*/shared ; touch $HOME/shared/.write_test && echo "write OK" && rm $HOME/shared/.write_test
echo "=== container: git ===" ; git --version
echo "=== container: pip + internet ===" ; pip download --no-deps -d /tmp/piptest tqdm 2>&1 | tail -3 ; pip index versions onnxruntime 2>&1 | head -3
echo "=== container: other internet ===" ; python - <<'EOF'
import urllib.request
for u in ["https://github.com","https://pypi.org","https://files.pythonhosted.org","https://data.london.gov.uk"]:
    try: print(u, urllib.request.urlopen(u, timeout=10).status)
    except Exception as e: print(u, "FAIL", e)
EOF
echo "=== container: acceleration ===" ; python - <<'EOF'
import importlib.metadata as m, glob
for p in ["ibm-zdnn-plugin","torch_nnpa","torch","tensorflow","keras","xgboost","scikit-learn","onnx","onnxruntime","snapml","numpy"]:
    try: print(p, m.version(p))
    except Exception as e: print(p, "NOT INSTALLED")
print(glob.glob('/opt/venv/lib*/python3*/site-packages/tensorflow/core/kernels/_z_ops.so'))
import tensorflow as tf
print(tf.config.list_physical_devices())
import torch, torch_nnpa
print([x for x in dir(torch_nnpa) if not x.startswith('_')])
EOF
echo "=== container: env ===" ; env | grep -i -E "zdnn|nnpa|jupyter|torch|tf_" 
echo "=== container: notebooks shipped ===" ; ls -la $HOME
exit
```

If `import torch_nnpa` errors, that is useful output; leave it in.

### D. Back on the host: clone the repo into the shared folder

```bash
cd /home/linux1/shared
git clone https://github.com/AdrielAu/PlotLuck.git
cd PlotLuck && git log --oneline -3 && git status
ls -ldn /home/linux1/shared/PlotLuck
```

If the repo is private you will be asked for a username and password: use your GitHub username and a personal access token (fine-grained, this repo only, Contents: read/write) as the password. Do not use your account password. Then confirm the container sees it:

```bash
docker exec notebook ls -la /home/ibm-user/shared/PlotLuck
```

(Replace `/home/ibm-user` with the `$HOME` printed in step C if it differs.)

### E. Optional: VS Code Jupyter test from your laptop

In VS Code: open any `.ipynb`, Select Kernel > Select Another Kernel > Existing Jupyter Server > paste `http://<VM-public-IP>:38888/?token=<token>`. Screenshot the result or the error.

### F. Save the output

Paste all output into a text file per block (e.g. `docs/evidence/` as per ticket #8's convention) or into the issue comment. Screenshots: terminal after `lscpu`, after `docker ps`.
