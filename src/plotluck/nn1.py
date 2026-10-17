"""NN1: inputs -> Dense 64 ReLU -> Dense 32 ReLU -> Dense 1 sigmoid (issue #62)."""

import numpy as np
import torch
from torch import nn

ACTIVATIONS = ("relu", "relu", "sigmoid")


def train(x: np.ndarray, y: np.ndarray, *, epochs: int, seed: int = 0, batch: int = 512):
    """Train on all rows; return (layers as JSON-ready lists, mean loss per epoch).

    shortcut: no CV or early stopping; issue #74 adds district-grouped CV and
    trains the shipped model for the median best epoch.
    """
    torch.manual_seed(seed)
    net = nn.Sequential(
        nn.Linear(x.shape[1], 64), nn.ReLU(), nn.Dropout(0.1),
        nn.Linear(64, 32), nn.ReLU(), nn.Dropout(0.1),
        nn.Linear(32, 1), nn.Sigmoid(),
    )
    optimiser = torch.optim.Adam(net.parameters(), lr=1e-3, weight_decay=1e-4)
    inputs = torch.tensor(x, dtype=torch.float32)
    targets = torch.tensor(y, dtype=torch.float32)
    order = torch.Generator().manual_seed(seed)
    losses = []
    net.train()
    for _ in range(epochs):
        total = 0.0
        for idx in torch.randperm(len(inputs), generator=order).split(batch):
            optimiser.zero_grad()
            loss = nn.functional.mse_loss(net(inputs[idx]).squeeze(1), targets[idx])
            loss.backward()
            optimiser.step()
            total += loss.item() * len(idx)
        losses.append(total / len(inputs))
    layers = [
        {"weights": m.weight.detach().double().tolist(), "biases": m.bias.detach().double().tolist()}
        for m in net
        if isinstance(m, nn.Linear)
    ]
    return layers, losses


def forward(layers: list[dict], x: np.ndarray) -> np.ndarray:
    """Score each row of ``x`` with exported layers, as the browser does."""
    for layer, activation in zip(layers, ACTIVATIONS):
        x = x @ np.asarray(layer["weights"]).T + np.asarray(layer["biases"])
        x = np.maximum(x, 0.0) if activation == "relu" else 1.0 / (1.0 + np.exp(-x))
    return x[:, 0]
