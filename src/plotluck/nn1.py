"""NN1: inputs -> Dense 64 ReLU -> Dense 32 ReLU -> Dense 1 sigmoid (issue #62)."""

import numpy as np
import torch
from torch import nn

ACTIVATIONS = ("relu", "relu", "sigmoid")


def group_folds(groups: list[str], folds: int) -> list[np.ndarray]:
    """Row indices of each of ``folds`` folds; a group never spans two folds.

    Largest group first, each into the fold with the fewest rows so far (ties
    to the lowest fold), as scikit-learn's ``GroupKFold`` balances them.
    """
    members = {}
    for i, g in enumerate(groups):
        members.setdefault(g, []).append(i)
    if len(members) < folds:
        raise ValueError(f"{len(members)} groups cannot fill {folds} folds")
    out = [[] for _ in range(folds)]
    for g in sorted(members, key=lambda g: (-len(members[g]), g)):
        min(out, key=len).extend(members[g])
    return [np.array(sorted(f), dtype=int) for f in out]


def group_splits(groups: list[str], folds: int) -> list[dict[str, np.ndarray]]:
    """Group k-fold splits, each ``{"fit", "early_stop", "test"}`` row indices.

    ``test`` is one fold. The rest is split by group again into ``folds``
    folds: the first is the early-stopping slice, the others are fit on.
    """
    groups = np.asarray(groups)
    splits = []
    for test in group_folds(list(groups), folds):
        train = np.setdiff1d(np.arange(len(groups)), test)
        inner = group_folds(list(groups[train]), min(folds, len(set(groups[train]))))
        early_stop = train[inner[0]]
        splits.append({"fit": np.setdiff1d(train, early_stop), "early_stop": early_stop, "test": test})
    return splits


def train(x: np.ndarray, y: np.ndarray, *, epochs: int, seed: int = 0, batch: int = 512):
    """Train on all rows for ``epochs``; return (layers as JSON-ready lists, mean loss per epoch)."""
    run = _Run(x, y, seed, batch)
    losses = [run.epoch() for _ in range(epochs)]
    return run.layers(), losses


def train_early_stopping(
    x: np.ndarray,
    y: np.ndarray,
    x_stop: np.ndarray,
    y_stop: np.ndarray,
    *,
    max_epochs: int,
    patience: int,
    seed: int = 0,
    batch: int = 512,
):
    """Train on (x, y) until the MSE on (x_stop, y_stop) has not fallen for ``patience`` epochs.

    Return (layers at the best epoch, the best epoch counted from 1, mean
    training loss per epoch, early-stop loss per epoch).
    """
    run = _Run(x, y, seed, batch)
    stop_x = torch.tensor(x_stop, dtype=torch.float32)
    stop_y = torch.tensor(y_stop, dtype=torch.float32)
    train_losses, stop_losses = [], []
    best, best_layers = 0, None
    while len(stop_losses) < max_epochs and len(stop_losses) - best < patience:
        train_losses.append(run.epoch())
        run.net.eval()
        with torch.no_grad():
            stop_losses.append(nn.functional.mse_loss(run.net(stop_x).squeeze(1), stop_y).item())
        if best_layers is None or stop_losses[-1] < stop_losses[best - 1]:
            best, best_layers = len(stop_losses), run.layers()
    return best_layers, best, train_losses, stop_losses


class _Run:
    """One seeded NN1 and its optimiser, trained an epoch at a time."""

    def __init__(self, x: np.ndarray, y: np.ndarray, seed: int, batch: int):
        torch.manual_seed(seed)
        self.net = nn.Sequential(
            nn.Linear(x.shape[1], 64), nn.ReLU(), nn.Dropout(0.1),
            nn.Linear(64, 32), nn.ReLU(), nn.Dropout(0.1),
            nn.Linear(32, 1), nn.Sigmoid(),
        )
        self.optimiser = torch.optim.Adam(self.net.parameters(), lr=1e-3, weight_decay=1e-4)
        self.inputs = torch.tensor(x, dtype=torch.float32)
        self.targets = torch.tensor(y, dtype=torch.float32)
        self.order = torch.Generator().manual_seed(seed)
        self.batch = batch

    def epoch(self) -> float:
        """One pass over the rows in a seeded order; return the mean training loss."""
        self.net.train()
        total = 0.0
        for idx in torch.randperm(len(self.inputs), generator=self.order).split(self.batch):
            self.optimiser.zero_grad()
            loss = nn.functional.mse_loss(self.net(self.inputs[idx]).squeeze(1), self.targets[idx])
            loss.backward()
            self.optimiser.step()
            total += loss.item() * len(idx)
        return total / len(self.inputs)

    def layers(self) -> list[dict]:
        """The dense layers as JSON-ready lists."""
        return [
            {"weights": m.weight.detach().double().tolist(), "biases": m.bias.detach().double().tolist()}
            for m in self.net
            if isinstance(m, nn.Linear)
        ]


def forward(layers: list[dict], x: np.ndarray) -> np.ndarray:
    """Score each row of ``x`` with exported layers, as the browser does."""
    for layer, activation in zip(layers, ACTIVATIONS):
        x = x @ np.asarray(layer["weights"]).T + np.asarray(layer["biases"])
        x = np.maximum(x, 0.0) if activation == "relu" else 1.0 / (1.0 + np.exp(-x))
    return x[:, 0]
