#!/usr/bin/env bash
# Commit and push the data a workflow run produced, WITHOUT ever losing a reading that was paid for.
#
#   bash scripts/commit_data.sh commit "Update Temu ranks" docs/data/ranks        # add + commit + push
#   bash scripts/commit_data.sh push                                              # a commit already exists on HEAD: just push it
#
# What it does when the push does not simply work: it fetches the newest main and tries a normal rebase. If the same files changed on both
# sides (the history files are single-line JSON, so Git cannot merge them), it does NOT give up: it takes this run's data out of its commit,
# resets to the newest main, merges the rank history by content (scripts/merge_ranks.py, every reading of both sides is kept), copies any
# other file this run changed (this run's version wins), commits again and pushes. A rejected push (someone pushed meanwhile) is retried.
set -u
BRANCH="${DATA_BRANCH:-main}"
export RANK_STORAGE="${RANK_STORAGE:-monthly}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PYTHON:-python}"
RANKS_LEGACY="docs/data/ranks.json"
git config user.name "rank-tracker-bot"
git config user.email "actions@users.noreply.github.com"

mode="${1:-push}"
if [ "$mode" = "commit" ]; then
  msg="${2:?commit message missing}"; shift 2
  for p in "$@"; do [ -e "$p" ] && git add -- "$p"; done
  if git diff --staged --quiet; then echo "Nothing new to save."; exit 0; fi
  git commit -q -m "$msg $(date -u +'%Y-%m-%d %H:%M')" || exit 1
fi
git fetch -q origin "$BRANCH" 2>/dev/null || true
if git rev-parse -q --verify "origin/$BRANCH" >/dev/null && [ -z "$(git rev-list "origin/$BRANCH..HEAD")" ]; then
  echo "Nothing to push: the server already has everything."; exit 0
fi

for attempt in 1 2 3 4 5; do
  if ! git fetch -q origin "$BRANCH"; then echo "Could not reach GitHub (attempt $attempt), trying again in 10 seconds."; sleep 10; continue; fi
  if git rebase -q "origin/$BRANCH" >/dev/null 2>&1; then
    if [ -z "$(git rev-list "origin/$BRANCH..HEAD")" ]; then echo "Every reading of this run is already saved on the server."; exit 0; fi
    if git push -q origin "HEAD:$BRANCH"; then echo "Saved (attempt $attempt)."; exit 0; fi
    echo "The push was refused (attempt $attempt), trying again in 10 seconds."; sleep 10; continue
  fi
  # the same files changed on both sides: merge the DATA instead of the lines
  git rebase --abort >/dev/null 2>&1 || true
  base="$(git merge-base HEAD "origin/$BRANCH")"
  subject="$(git log -1 --format=%s)"
  changed="$(git diff --name-only "$base" HEAD)"
  ours="$(mktemp -d)"
  git archive HEAD docs/data 2>/dev/null | tar -x -C "$ours"
  echo "Another run saved to the same history files meanwhile: merging the readings of both (nothing is dropped)."
  git reset -q --hard "origin/$BRANCH"
  if [ -d "$ours/docs/data/ranks" ] || [ -f "$ours/$RANKS_LEGACY" ]; then
    "$PY" "$HERE/merge_ranks.py" --ours "$ours/$RANKS_LEGACY" --theirs "$RANKS_LEGACY" --out "$RANKS_LEGACY" || { echo "The merge of the readings failed."; sleep 10; continue; }
  fi
  while IFS= read -r f; do                                              # every other file this run changed: this run's version wins
    [ -z "$f" ] && continue
    case "$f" in docs/data/ranks/*|"$RANKS_LEGACY") continue ;; esac
    if [ -e "$ours/$f" ]; then mkdir -p "$(dirname "$f")"; cp -f "$ours/$f" "$f"; else git rm -q --ignore-unmatch -- "$f"; fi
  done <<< "$changed"
  git add -A -- docs/data
  if git diff --staged --quiet; then echo "Every reading of this run is already saved on the server."; exit 0; fi
  git commit -q -m "$subject (merged with newer data)" || exit 1
  if git push -q origin "HEAD:$BRANCH"; then echo "Saved after merging (attempt $attempt)."; exit 0; fi
  echo "The push was refused (attempt $attempt), trying again in 10 seconds."; sleep 10
done
echo "::error title=Readings not saved::The readings could not be pushed after 5 attempts. They were paid for but are not saved, so the next run reads them again."
exit 1
