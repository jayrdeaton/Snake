#!/bin/zsh
# Reseeds one simulator's Snake install for the App Store screenshots and relaunches it.
#   store/seed/reseed.sh <simulator udid> [settings json] [profile selection json]
# e.g. store/seed/reseed.sh $IPHONE '{"cpuDifficulty":"hard","arenaVariant":"pillars"}' '{"1":null,"2":null}'
# Settings not given keep their defaults; the selection defaults to Maya (seat 1) and Leo (seat 2).
# Run store/seed/generate.mjs first. See store/README.md.
DIR=${0:A:h}
udid=$1
BUNDLE=com.infinitetoken.Snake
xcrun simctl terminate $udid $BUNDLE 2> /dev/null
TMP=$(mktemp -d)
python3 - "$DIR/seed.json" "${2:-{\}}" "${3:-{\"1\":\"seed-maya\",\"2\":\"seed-leo\"\}}" > $TMP/values.json <<'PY'
import json, sys
seed = json.load(open(sys.argv[1]))
# Every key is the keyPrefix in src/redux/store.ts plus redux-persist's key: keep them in step.
print(json.dumps({'snake:root': {
    'achievements': {'stats': seed['stats'], 'unlocked': seed['unlocked']},
    'sound': {'enabled': False},
    'guide': {'versionSeen': 1},
    'profiles': seed['profiles'],
    'profileSelection': json.loads(sys.argv[3]),
    'settings': json.loads(sys.argv[2]),
}}))
PY
python3 ~/.claude/skills/app-store-prep/scripts/asyncstorage.py $udid $BUNDLE $TMP/values.json
rm -rf $TMP
xcrun simctl launch $udid $BUNDLE
