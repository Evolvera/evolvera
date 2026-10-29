#!/bin/bash
# Installed as /usr/local/bin/git in the PI Studio image (ahead of /usr/bin/git).
# Git worktrees created on a Windows host (e.g. by Orca) have a `.git` file such as
#   gitdir: C:/Users/me/repo/.git/worktrees/x
# which Linux git resolves as a relative path and fails ("not a git repository").
# When GIT_HOST_PREFIX/GIT_HOST_MOUNT are set and such a pointer is found from the
# effective directory upward, export GIT_DIR (translated) and GIT_WORK_TREE, then run
# the real git. Everything else passes through unchanged.
real="${GIT_WRAPPER_REAL:-/usr/bin/git}"
from="${GIT_HOST_PREFIX%/}"
to="${GIT_HOST_MOUNT%/}"

if [ -n "$from" ] && [ -n "$to" ] && [ -z "${GIT_DIR:-}" ]; then
  dir="$PWD"
  args=("$@")
  i=0
  while [ "${args[$i]:-}" = "-C" ] && [ -n "${args[$((i + 1))]:-}" ]; do
    next="${args[$((i + 1))]}"
    case "$next" in
      /*) dir="$next" ;;
      *) dir="$dir/$next" ;;
    esac
    i=$((i + 2))
  done
  d="$dir"
  while :; do
    if [ -f "$d/.git" ]; then
      IFS= read -r line < "$d/.git"
      line="${line%$'\r'}"
      gitdir="${line#gitdir: }"
      gitdir="${gitdir//\\//}"
      prefix_len=${#from}
      head="${gitdir:0:$prefix_len}"
      if [ "${head,,}" = "${from,,}" ] \
        && { [ "${#gitdir}" -eq "$prefix_len" ] || [ "${gitdir:$prefix_len:1}" = "/" ]; }; then
        export GIT_DIR="$to${gitdir:$prefix_len}"
        export GIT_WORK_TREE="$d"
      fi
      break
    fi
    [ -d "$d/.git" ] && break
    if [ "$d" = "/" ] || [ -z "$d" ]; then break; fi
    d="${d%/*}"
    [ -n "$d" ] || d="/"
  done
fi

exec "$real" "$@"
