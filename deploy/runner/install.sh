#!/usr/bin/env bash
# Install/upgrade the OrgFlow-only ARC scale set on the on-prem cluster (operator, admin kubeconfig).
#   KUBECONFIG=~/.kube/config deploy/runner/install.sh
set -euo pipefail
cd "$(dirname "$0")"
helm upgrade --install orgflow-runners oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set \
  --version 0.14.2 -n arc-runners-onprem -f orgflow-runners.values.yaml \
  --set controllerServiceAccount.name=arc-gha-rs-controller --set controllerServiceAccount.namespace=arc-systems --wait
