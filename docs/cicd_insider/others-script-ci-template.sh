#!/usr/bin/env bash
set -euxo pipefail

# This is just an example workflow for continuous integration.
# You should customize it to meet your own requirements.

# Setup environment.
# Sufficient permissions are required to run the command below.
# The following command is expected to run on Ubuntu 16.04 or newer versions, and please adapt it if necessary.
apt install -y nodejs npm

# Checkout the code.
# Update the placeholder of {RepositoryEndpoint} to your repository's endpoint.
git clone {RepositoryEndpoint}
# Update the placeholder of {FolderName} to your repository's folder name after git clone.
cd {FolderName}

# Build the project.
# The way to build the current project depends on how you scaffold it.
# Different folder structures require different commands set.
# 'npm ci' is used here to install dependencies and it depends on package-lock.json.
# If you prefer to use 'npm ci', please make sure to commit package-lock.json first, or just change it to 'npm install'.
cd tabs && npm ci && npm run build && cd -

# Run unit test.
# Currently, no opinionated solution for unit test provided during scaffolding, so,
# set up any unit test framework you prefer (for example, mocha or jest) and update the commands accordingly in below.
cd tabs && npm run test && cd -
