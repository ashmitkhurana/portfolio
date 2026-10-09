#!/bin/bash
cd /Users/ashmitkhurana/Development/Personal/portfolio
PY=scripts/mockup/.venv/bin/python
run=$1; base=$2; shift 2; EXTRA="$@"
O=docs/ribbon/turns/real/$run; B=docs/ribbon/turns/real/$base/pose.json
ROTO=/Users/ashmitkhurana/Development/Personal/portfolio/docs/ribbon/turns/curve/best/roto.npz
CP=860:1066-388:483:16
mkdir -p $O
COMMON="--roto $ROTO --K 160 --init perp --trace_w 0.15 --outline 0 --inside 0 --hmin 25.5 --hmax 25.5 --w_hmin 50 --mu 300 --lam 15 --lam_h 50 --delta 60 --nu_fold 0.4 --rmin 45 --w_rmin 5 --redge 24 --w_redge 5 --kappa 2 --end_pin 50 --omega 0.01 --max_nfev 150 --faces docs/ribbon/turns/real/faces.json --w_face 15 --face_margin 0.3 --clear 5 --gap 14 --clear_range 860:1066-388:483 --bend 30 --twist 30 --dbend 500 --dtwist 500 --flip_guard 20 --fold_legs 5 --fold2 516:40:20,1188:40:20 --fold_convex 516:10,1188:10 $EXTRA"
$PY scripts/curve/fit3d.py $COMMON --pose $B --zprior $B --eps 1.0 --out $O/c > $O/fit_c.log 2>&1
$PY scripts/curve/layer.py $O/c/pose.json $O/pose.json --clear_pairs $CP --report $O/layer_c.txt > $O/layer_c.log 2>&1
echo DONE > $O/chain.done
# pipeline
for i in $(seq 1 20); do c=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4100/); [ "$c" = 200 ] && break; sleep 15; done
[ "$c" = 200 ] || { echo "server not 200" > $O/pipe.err; exit 3; }
node scripts/render-pose.mjs --pose $O/pose.json --out $O/render --settings '{"geometry":{"thicknessRatio":0.147,"edgeBevel":2.4}}' > $O/render.log 2>&1
node scripts/curve/dump-pose.mjs --pose $O/pose.json --out $O/dump > $O/dump.log 2>&1
$PY scripts/curve/diagnose.py $O/dump/dump.json $O/pose.json $O/dump/ribbon.png $O/diag $ROTO > $O/diag.log 2>&1
$PY scripts/curve/clearance.py $O/dump/dump.json --rings $O/diag/rings.csv --out $O/clusters.csv > $O/clearance.txt 2>&1
$PY scripts/curve/silhouette.py $O/render/ribbon.png $O/sil > $O/sil.log 2>&1
$PY scripts/curve/wrapcheck.py $O/dump/dump.json --rings $O/diag/rings.csv > $O/wrapcheck.txt 2>&1
$PY scripts/curve/faceaudit.py $O/dump/dump.json $O/diag/rings.csv $O/faceaudit $O/render/ribbon.png > $O/faceaudit.log 2>&1
$PY scripts/curve/edgecheck.py $O/faceaudit/faces.csv > $O/edgecheck.txt 2>&1
$PY scripts/curve/convexcheck.py $O/dump/dump.json $O/diag/rings.csv --log $O/fit_c.log > $O/convexcheck.txt 2>&1
$PY scripts/curve/ripple.py $O/pose.json $O/dump/dump.json > $O/ripple.txt 2>&1
echo DONE > $O/pipe.done
