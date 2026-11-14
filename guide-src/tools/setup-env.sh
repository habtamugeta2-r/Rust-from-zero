#!/bin/sh
# Recreates the (non-persistent) checking environment used by tools/check.py.
set -e
sudo mkdir -p /opt/rs /opt/pw && sudo chown -R "$(id -u):$(id -g)" /opt/rs /opt/pw
mkdir -p /opt/rs/tmp /opt/rs/ext
cat > /opt/rs/env.sh <<'ENV'
export RUSTUP_HOME=/opt/rs/rustup
export CARGO_HOME=/opt/rs/cargo
export PATH=/opt/rs/cargo/bin:$PATH
export CARGO_TARGET_DIR=/opt/rs/target
export TMPDIR=/opt/rs/tmp
ENV
. /opt/rs/env.sh
if [ ! -x /opt/rs/cargo/bin/rustc ]; then
  curl --proto '=https' --tlsv1.2 -sSf https://static.rust-lang.org/rustup/rustup-init.sh -o /opt/rs/rustup-init.sh
  sh /opt/rs/rustup-init.sh -y --profile minimal --no-modify-path -c clippy -c rustfmt
fi
if [ ! -f /opt/rs/ext/main/Cargo.toml ]; then
  (cd /opt/rs/ext && cargo new main --name extmain -q)
  cp "$(dirname "$0")/ext-main-Cargo.toml" /opt/rs/ext/main/Cargo.toml
fi
rustc --version
